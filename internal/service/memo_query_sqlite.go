package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

const memo_index_file_name = "memo-index.db"
const memo_index_schema_version = 4
const memo_index_sync_interval = 350 * time.Millisecond

const memo_index_select_columns = `
	id, path, archived, content, created_at, kind, locations_json, pinned,
	private_flag, project_id, reactions_json, references_json, tags_json,
	task_id, updated_at, visibility`

type sqlite_memo_query_store struct {
	closed              bool
	database            *sql.DB
	last_sync_at        time.Time
	reported_duplicates map[string]string
	mutex               sync.Mutex
	vault_ctx           *VaultContext
}

type memo_index_fingerprint struct {
	id             string
	modified_at_ns int64
	path           string
	size           int64
}

type memo_index_snapshot struct {
	fingerprint memo_index_fingerprint
	memo        MemoRecord
}

type memo_row_scanner interface {
	Scan(...interface{}) error
}

func new_sqlite_memo_query_store(vault_ctx *VaultContext) (*sqlite_memo_query_store, error) {
	if vault_ctx == nil {
		return nil, fmt.Errorf("vault context is required")
	}
	if err := os.MkdirAll(vault_ctx.VeloDir, 0755); err != nil {
		return nil, err
	}
	database_path := filepath.Join(vault_ctx.VeloDir, memo_index_file_name)
	query_store, err := open_sqlite_memo_query_store(vault_ctx, database_path)
	if err == nil {
		return query_store, nil
	}
	if !is_rebuildable_memo_index_error(err) {
		return nil, err
	}
	remove_memo_index_database(database_path)
	return open_sqlite_memo_query_store(vault_ctx, database_path)
}

func open_sqlite_memo_query_store(vault_ctx *VaultContext, database_path string) (*sqlite_memo_query_store, error) {
	database, err := sql.Open("sqlite", database_path)
	if err != nil {
		return nil, err
	}
	database.SetMaxIdleConns(1)
	database.SetMaxOpenConns(1)
	query_store := &sqlite_memo_query_store{
		database:            database,
		reported_duplicates: map[string]string{},
		vault_ctx:           vault_ctx,
	}
	if err := query_store.initialize_database(context.Background()); err != nil {
		_ = database.Close()
		return nil, err
	}
	return query_store, nil
}

func (store *sqlite_memo_query_store) initialize_database(call_ctx context.Context) error {
	for _, statement := range []string{
		"PRAGMA busy_timeout = 5000",
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA foreign_keys = ON",
	} {
		if _, err := store.database.ExecContext(call_ctx, statement); err != nil {
			return fmt.Errorf("initialize memo index: %w", err)
		}
	}
	var schema_version int
	if err := store.database.QueryRowContext(call_ctx, "PRAGMA user_version").Scan(&schema_version); err != nil {
		return fmt.Errorf("read memo index schema: %w", err)
	}
	if schema_version != 0 && schema_version != memo_index_schema_version {
		for _, statement := range []string{
			"DROP TABLE IF EXISTS memo_index_fts",
			"DROP TABLE IF EXISTS memo_index_tags",
			"DROP TABLE IF EXISTS memo_index_records",
			"DROP TABLE IF EXISTS memo_index_files",
			"DROP TABLE IF EXISTS memo_index_references",
			"DROP TABLE IF EXISTS memo_index_code_blocks",
			"DROP TABLE IF EXISTS memo_index_comment_files",
		} {
			if _, err := store.database.ExecContext(call_ctx, statement); err != nil {
				return fmt.Errorf("reset memo index schema: %w", err)
			}
		}
	}
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS memo_index_records (
			id TEXT PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			file_mtime_ns INTEGER NOT NULL,
			file_size INTEGER NOT NULL,
			archived INTEGER NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			kind TEXT NOT NULL,
			locations_json TEXT NOT NULL,
			pinned INTEGER NOT NULL,
			private_flag INTEGER NOT NULL,
			project_id TEXT NOT NULL,
			reactions_json TEXT NOT NULL,
			references_json TEXT NOT NULL,
			tags_json TEXT NOT NULL,
			task_id TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			visibility TEXT NOT NULL,
			sort_time_ns INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS memo_index_tags (
			memo_id TEXT NOT NULL,
			tag TEXT NOT NULL,
			tag_fold TEXT NOT NULL,
			PRIMARY KEY (memo_id, tag_fold),
			FOREIGN KEY (memo_id) REFERENCES memo_index_records(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS memo_index_files (
			path TEXT PRIMARY KEY,
			memo_id TEXT NOT NULL,
			file_mtime_ns INTEGER NOT NULL,
			file_size INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS memo_index_references (
			id TEXT PRIMARY KEY,
			memo_id TEXT NOT NULL,
			source_type TEXT NOT NULL,
			source_id TEXT NOT NULL,
			source_comment_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			ref_type TEXT NOT NULL,
			syntax TEXT NOT NULL,
			url TEXT NOT NULL,
			label TEXT NOT NULL,
			line_index INTEGER NOT NULL,
			seq INTEGER NOT NULL,
			source_text TEXT NOT NULL,
			memo_title TEXT NOT NULL,
			visibility TEXT NOT NULL,
			tags_json TEXT NOT NULL,
			archived INTEGER NOT NULL,
			sort_time_ns INTEGER NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS memo_index_code_blocks (
			id TEXT PRIMARY KEY,
			memo_id TEXT NOT NULL,
			source_type TEXT NOT NULL,
			source_id TEXT NOT NULL,
			source_comment_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			language TEXT NOT NULL,
			title TEXT NOT NULL,
			aliases_json TEXT NOT NULL,
			code TEXT NOT NULL,
			marked INTEGER NOT NULL,
			line_index INTEGER NOT NULL,
			end_line_index INTEGER NOT NULL,
			source_text TEXT NOT NULL,
			memo_title TEXT NOT NULL,
			visibility TEXT NOT NULL,
			tags_json TEXT NOT NULL,
			archived INTEGER NOT NULL,
			sort_time_ns INTEGER NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS memo_index_comment_files (
			path TEXT PRIMARY KEY,
			comment_id TEXT NOT NULL,
			memo_id TEXT NOT NULL,
			file_mtime_ns INTEGER NOT NULL,
			file_size INTEGER NOT NULL
		)`,
		"CREATE INDEX IF NOT EXISTS memo_index_records_sort ON memo_index_records(sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_archived_sort ON memo_index_records(archived, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_pinned_sort ON memo_index_records(pinned, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_project_sort ON memo_index_records(project_id, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_visibility_sort ON memo_index_records(visibility, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_tags_fold ON memo_index_tags(tag_fold, memo_id)",
		"CREATE INDEX IF NOT EXISTS memo_index_files_memo_id ON memo_index_files(memo_id, path)",
		"CREATE INDEX IF NOT EXISTS memo_index_references_type_sort ON memo_index_references(ref_type, archived, sort_time_ns DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_references_project ON memo_index_references(project_id, ref_type, archived)",
		"CREATE INDEX IF NOT EXISTS memo_index_references_source ON memo_index_references(source_type, source_id)",
		"CREATE INDEX IF NOT EXISTS memo_index_code_blocks_sort ON memo_index_code_blocks(archived, sort_time_ns DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_code_blocks_project ON memo_index_code_blocks(project_id, archived)",
		"CREATE INDEX IF NOT EXISTS memo_index_code_blocks_source ON memo_index_code_blocks(source_type, source_id)",
		`CREATE VIRTUAL TABLE IF NOT EXISTS memo_index_fts
		 USING fts5(id UNINDEXED, content, tokenize='trigram')`,
		fmt.Sprintf("PRAGMA user_version = %d", memo_index_schema_version),
	} {
		if _, err := store.database.ExecContext(call_ctx, statement); err != nil {
			return fmt.Errorf("create memo index schema: %w", err)
		}
	}
	return nil
}

func (store *sqlite_memo_query_store) Get(call_ctx context.Context, memo_id string) (MemoRecord, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return MemoRecord{}, err
	}
	memo_id = strings.TrimSpace(memo_id)
	if memo_id == "" {
		return MemoRecord{}, fmt.Errorf("memo id is required")
	}
	row := store.database.QueryRowContext(
		call_ctx,
		"SELECT "+memo_index_select_columns+" FROM memo_index_records WHERE id = ?",
		memo_id,
	)
	memo, err := scan_memo_index_record(row)
	if errors.Is(err, sql.ErrNoRows) {
		return MemoRecord{}, fmt.Errorf("memo not found: %s", memo_id)
	}
	if err != nil {
		return MemoRecord{}, err
	}
	return memo, nil
}

func (store *sqlite_memo_query_store) List(call_ctx context.Context, query MemoListQuery) (MemoPage, error) {
	if query.Limit < 0 {
		return MemoPage{}, fmt.Errorf("memo limit must be non-negative")
	}
	started_at := time.Now()
	if store.vault_ctx != nil && store.vault_ctx.logger != nil {
		store.vault_ctx.logger.Debug().
			Str("component", "memo_pagination").
			Str("paginationStage", "sqlite.start").
			Int("limit", query.Limit).
			Bool("cursorPresent", strings.TrimSpace(query.Cursor) != "").
			Int("cursorLength", len(query.Cursor)).
			Msg("sqlite memo page query started")
	}
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return MemoPage{}, err
	}
	where_sql, filter_args := memo_index_filter(query)
	var total int
	if err := store.database.QueryRowContext(
		call_ctx,
		"SELECT COUNT(*) FROM memo_index_records AS memo WHERE "+where_sql,
		filter_args...,
	).Scan(&total); err != nil {
		return MemoPage{}, fmt.Errorf("count memo index: %w", err)
	}

	list_where_sql := where_sql
	list_args := append([]interface{}{}, filter_args...)
	if strings.TrimSpace(query.Cursor) != "" {
		cursor, err := decode_memo_cursor(query.Cursor)
		if err != nil {
			return MemoPage{}, err
		}
		cursor_time := parseMemoTime(cursor.SortTime)
		list_where_sql += " AND (memo.sort_time_ns < ? OR (memo.sort_time_ns = ? AND memo.id < ?))"
		list_args = append(list_args, cursor_time.UnixNano(), cursor_time.UnixNano(), cursor.ID)
	}
	statement := "SELECT " + memo_index_select_columns +
		" FROM memo_index_records AS memo WHERE " + list_where_sql +
		" ORDER BY memo.sort_time_ns DESC, memo.id DESC"
	if query.Limit > 0 {
		statement += " LIMIT ?"
		list_args = append(list_args, query.Limit+1)
	}
	rows, err := store.database.QueryContext(call_ctx, statement, list_args...)
	if err != nil {
		return MemoPage{}, fmt.Errorf("list memo index: %w", err)
	}
	defer rows.Close()
	memos := []MemoRecord{}
	for rows.Next() {
		memo, scan_err := scan_memo_index_record(rows)
		if scan_err != nil {
			return MemoPage{}, scan_err
		}
		memos = append(memos, memo)
	}
	if err := rows.Err(); err != nil {
		return MemoPage{}, fmt.Errorf("list memo index: %w", err)
	}
	page := MemoPage{Memos: memos, Total: total}
	if query.Limit > 0 && len(page.Memos) > query.Limit {
		page.HasMore = true
		page.Memos = page.Memos[:query.Limit]
	}
	if page.HasMore && len(page.Memos) > 0 {
		page.NextCursor, err = encode_memo_cursor(page.Memos[len(page.Memos)-1])
		if err != nil {
			return MemoPage{}, err
		}
	}
	if store.vault_ctx != nil && store.vault_ctx.logger != nil {
		store.vault_ctx.logger.Info().
			Str("component", "memo_pagination").
			Str("paginationStage", "sqlite.complete").
			Int("memoCount", len(page.Memos)).
			Int("total", page.Total).
			Bool("hasMore", page.HasMore).
			Int("nextCursorLength", len(page.NextCursor)).
			Int64("durationMs", time.Since(started_at).Milliseconds()).
			Msg("sqlite memo page query completed")
	}
	return page, nil
}

func (store *sqlite_memo_query_store) Stats(call_ctx context.Context) (MemoStats, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return MemoStats{}, err
	}
	var stats MemoStats
	err := store.database.QueryRowContext(call_ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN archived = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 0 AND pinned = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PRIVATE' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PROTECTED' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PUBLIC' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN archived = 0 AND private_flag = 1 THEN 1 ELSE 0 END), 0)
		FROM memo_index_records
	`).Scan(
		&stats.Total,
		&stats.Active,
		&stats.Archived,
		&stats.Pinned,
		&stats.Private,
		&stats.Protected,
		&stats.Public,
		&stats.Secret,
	)
	if err != nil {
		return MemoStats{}, fmt.Errorf("read memo stats: %w", err)
	}
	stats.ProjectCounts = map[string]int{}
	rows, err := store.database.QueryContext(call_ctx, `
		SELECT project_id, COUNT(*)
		FROM memo_index_records
		WHERE archived = 0
		GROUP BY project_id
	`)
	if err != nil {
		return MemoStats{}, fmt.Errorf("read memo project stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var project_id string
		var memo_count int
		if err := rows.Scan(&project_id, &memo_count); err != nil {
			return MemoStats{}, fmt.Errorf("scan memo project stats: %w", err)
		}
		if project_id == "" {
			stats.Unassigned = memo_count
			continue
		}
		stats.ProjectCounts[project_id] = memo_count
	}
	if err := rows.Err(); err != nil {
		return MemoStats{}, fmt.Errorf("read memo project stats: %w", err)
	}
	if err := store.fill_content_stats_locked(call_ctx, &stats); err != nil {
		return MemoStats{}, err
	}
	return stats, nil
}

// fill_content_stats scans active memo content in the local index and fills
// the aggregated resource counts onto stats. Used by the mirrored D1 store
// because the remote database does not extract content resources.
func (store *sqlite_memo_query_store) fill_content_stats(call_ctx context.Context, stats *MemoStats) error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return err
	}
	return store.fill_content_stats_locked(call_ctx, stats)
}

// sync_comment_extractions_locked walks the comment directory and keeps the
// comment-extracted reference/code-block rows in the index up to date,
// detecting changes by file fingerprint like the memo sync does.
func (store *sqlite_memo_query_store) sync_comment_extractions_locked(call_ctx context.Context) error {
	existing_files, err := store.load_index_comment_fingerprints(call_ctx)
	if err != nil {
		return err
	}
	workspace_fs, err := require_vault_fs(store.vault_ctx)
	if err != nil {
		return err
	}
	type comment_change struct {
		comment  MemoCommentRecord
		path     string
		mtime_ns int64
		size     int64
	}
	changes := []comment_change{}
	removed_paths := []string{}
	seen_paths := map[string]bool{}
	err = workspace_fs.walk_dir(vaultMemoCommentDirName, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		select {
		case <-call_ctx.Done():
			return call_ctx.Err()
		default:
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		file_info, info_err := entry.Info()
		if info_err != nil {
			return info_err
		}
		seen_paths[path] = true
		if existing, found := existing_files[path]; found &&
			existing.mtime_ns == file_info.ModTime().UnixNano() && existing.size == file_info.Size() {
			return nil
		}
		comment, read_err := readMemoCommentFile(store.vault_ctx, path)
		if read_err != nil {
			return read_err
		}
		if strings.TrimSpace(comment.MemoID) == "" {
			return nil
		}
		file_info, info_err = workspace_fs.stat_file(path)
		if info_err != nil {
			return info_err
		}
		changes = append(changes, comment_change{
			comment:  comment,
			path:     path,
			mtime_ns: file_info.ModTime().UnixNano(),
			size:     file_info.Size(),
		})
		return nil
	})
	if err != nil {
		if is_vault_file_not_exist(err) {
			err = nil
		} else {
			return fmt.Errorf("scan memo comment index: %w", err)
		}
	}
	for path := range existing_files {
		if !seen_paths[path] {
			removed_paths = append(removed_paths, path)
		}
	}
	if len(changes) == 0 && len(removed_paths) == 0 {
		return nil
	}

	transaction, err := store.database.BeginTx(call_ctx, nil)
	if err != nil {
		return err
	}
	for _, change := range changes {
		// The pool allows a single connection, so parent lookups must go
		// through the open transaction instead of the database handle.
		parent, parent_err := read_indexed_memo(call_ctx, transaction, change.comment.MemoID)
		if parent_err != nil {
			_ = transaction.Rollback()
			return parent_err
		}
		// Parent memo gone from the index: drop any stale comment rows.
		if err := delete_comment_index_extractions(call_ctx, transaction, change.comment.ID); err != nil {
			_ = transaction.Rollback()
			return err
		}
		if parent.ID == "" {
			if _, err := transaction.ExecContext(
				call_ctx,
				"DELETE FROM memo_index_comment_files WHERE path = ?",
				change.path,
			); err != nil {
				_ = transaction.Rollback()
				return err
			}
			continue
		}
		if err := replace_comment_index_extractions(call_ctx, transaction, change.comment, parent); err != nil {
			_ = transaction.Rollback()
			return fmt.Errorf("index comment extractions: %w", err)
		}
		if _, err := transaction.ExecContext(call_ctx, `
			INSERT INTO memo_index_comment_files (path, comment_id, memo_id, file_mtime_ns, file_size)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(path) DO UPDATE SET
				comment_id = excluded.comment_id,
				memo_id = excluded.memo_id,
				file_mtime_ns = excluded.file_mtime_ns,
				file_size = excluded.file_size
		`,
			change.path,
			change.comment.ID,
			change.comment.MemoID,
			change.mtime_ns,
			change.size,
		); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	for _, path := range removed_paths {
		if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_comment_files WHERE path = ?", path); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	return transaction.Commit()
}

type memo_comment_file_fingerprint struct {
	comment_id string
	memo_id    string
	mtime_ns   int64
	size       int64
}

func (store *sqlite_memo_query_store) load_index_comment_fingerprints(call_ctx context.Context) (map[string]memo_comment_file_fingerprint, error) {
	rows, err := store.database.QueryContext(
		call_ctx,
		"SELECT path, comment_id, memo_id, file_mtime_ns, file_size FROM memo_index_comment_files",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fingerprints := map[string]memo_comment_file_fingerprint{}
	for rows.Next() {
		var path string
		var fingerprint memo_comment_file_fingerprint
		if err := rows.Scan(&path, &fingerprint.comment_id, &fingerprint.memo_id, &fingerprint.mtime_ns, &fingerprint.size); err != nil {
			return nil, err
		}
		fingerprints[path] = fingerprint
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return fingerprints, nil
}

// read_indexed_memo loads a memo record from the index; a missing memo
// returns a zero record without error.
func read_indexed_memo(call_ctx context.Context, querier interface {
	QueryRowContext(context.Context, string, ...interface{}) *sql.Row
}, memo_id string) (MemoRecord, error) {
	row := querier.QueryRowContext(
		call_ctx,
		"SELECT "+memo_index_select_columns+" FROM memo_index_records WHERE id = ?",
		strings.TrimSpace(memo_id),
	)
	memo, err := scan_memo_index_record(row)
	if errors.Is(err, sql.ErrNoRows) {
		return MemoRecord{}, nil
	}
	if err != nil {
		return MemoRecord{}, err
	}
	return memo, nil
}

func (store *sqlite_memo_query_store) ListReferences(call_ctx context.Context, query MemoResourceQuery) (MemoResourcePage, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return MemoResourcePage{}, err
	}
	return list_memo_resources_locked(call_ctx, store.database, query, "memo_index_references")
}

func (store *sqlite_memo_query_store) ListCodeBlocks(call_ctx context.Context, query MemoResourceQuery) (MemoResourcePage, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := store.sync_index_if_needed_locked(call_ctx, false); err != nil {
		return MemoResourcePage{}, err
	}
	return list_memo_resources_locked(call_ctx, store.database, query, "memo_index_code_blocks")
}

// fill_content_stats_locked aggregates resource counts from the extraction
// tables so sidebar counters and the paged lists share one source of truth.
// Checkbox todos still come from a content scan of memo bodies.
func (store *sqlite_memo_query_store) fill_content_stats_locked(call_ctx context.Context, stats *MemoStats) error {
	stats.ContentCounts = memo_content_counts{}
	stats.ProjectContentCounts = map[string]memo_content_counts{}
	reference_rows, err := store.database.QueryContext(call_ctx, `
		SELECT ref_type, project_id, COUNT(*)
		FROM memo_index_references
		WHERE archived = 0
		GROUP BY ref_type, project_id
	`)
	if err != nil {
		return fmt.Errorf("read memo reference stats: %w", err)
	}
	defer reference_rows.Close()
	for reference_rows.Next() {
		var ref_type string
		var project_id string
		var count int
		if err := reference_rows.Scan(&ref_type, &project_id, &count); err != nil {
			return fmt.Errorf("scan memo reference stats: %w", err)
		}
		apply_reference_count(&stats.ContentCounts, ref_type, count)
		project_counts := stats.ProjectContentCounts[project_id]
		apply_reference_count(&project_counts, ref_type, count)
		stats.ProjectContentCounts[project_id] = project_counts
	}
	if err := reference_rows.Err(); err != nil {
		return fmt.Errorf("read memo reference stats: %w", err)
	}

	block_rows, err := store.database.QueryContext(call_ctx, `
		SELECT marked, project_id, COUNT(*)
		FROM memo_index_code_blocks
		WHERE archived = 0
		GROUP BY marked, project_id
	`)
	if err != nil {
		return fmt.Errorf("read memo code block stats: %w", err)
	}
	defer block_rows.Close()
	for block_rows.Next() {
		var marked int
		var project_id string
		var count int
		if err := block_rows.Scan(&marked, &project_id, &count); err != nil {
			return fmt.Errorf("scan memo code block stats: %w", err)
		}
		stats.ContentCounts.CodeBlocks += count
		project_counts := stats.ProjectContentCounts[project_id]
		project_counts.CodeBlocks += count
		if marked != 0 {
			stats.ContentCounts.CodeSnippets += count
			project_counts.CodeSnippets += count
		}
		stats.ProjectContentCounts[project_id] = project_counts
	}
	if err := block_rows.Err(); err != nil {
		return fmt.Errorf("read memo code block stats: %w", err)
	}

	content_rows, err := store.database.QueryContext(call_ctx, `
		SELECT project_id, content
		FROM memo_index_records
		WHERE archived = 0
	`)
	if err != nil {
		return fmt.Errorf("read memo content stats: %w", err)
	}
	defer content_rows.Close()
	for content_rows.Next() {
		var project_id string
		var content string
		if err := content_rows.Scan(&project_id, &content); err != nil {
			return fmt.Errorf("scan memo content stats: %w", err)
		}
		counts := analyze_memo_content(content)
		stats.ContentCounts.OpenTodos += counts.OpenTodos
		stats.ContentCounts.DoneTodos += counts.DoneTodos
		project_counts := stats.ProjectContentCounts[project_id]
		project_counts.OpenTodos += counts.OpenTodos
		project_counts.DoneTodos += counts.DoneTodos
		stats.ProjectContentCounts[project_id] = project_counts
	}
	if err := content_rows.Err(); err != nil {
		return fmt.Errorf("read memo content stats: %w", err)
	}
	return nil
}

func apply_reference_count(counts *memo_content_counts, ref_type string, count int) {
	switch ref_type {
	case "image":
		counts.Images += count
	case "file":
		counts.Files += count
	case "link":
		counts.Links += count
	}
}

func (store *sqlite_memo_query_store) upsert_memo(call_ctx context.Context, memo MemoRecord) error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if store.closed {
		return fmt.Errorf("memo index is closed")
	}
	workspace_fs, err := require_vault_fs(store.vault_ctx)
	if err != nil {
		return err
	}
	file_info, err := workspace_fs.stat_file(memo.Path)
	if err != nil {
		return err
	}
	fingerprint := memo_index_fingerprint{
		id:             memo.ID,
		modified_at_ns: file_info.ModTime().UnixNano(),
		path:           memo.Path,
		size:           file_info.Size(),
	}
	transaction, err := store.database.BeginTx(call_ctx, nil)
	if err != nil {
		return err
	}
	if err := upsert_memo_index_record(call_ctx, transaction, memo_index_snapshot{fingerprint: fingerprint, memo: memo}); err != nil {
		_ = transaction.Rollback()
		return err
	}
	if err := upsert_memo_index_file(call_ctx, transaction, fingerprint); err != nil {
		_ = transaction.Rollback()
		return err
	}
	if err := transaction.Commit(); err != nil {
		return err
	}
	store.last_sync_at = time.Now()
	return nil
}

func (store *sqlite_memo_query_store) delete_memo(call_ctx context.Context, memo_id string) error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if store.closed {
		return fmt.Errorf("memo index is closed")
	}
	if strings.TrimSpace(memo_id) == "" {
		return fmt.Errorf("memo id is required")
	}
	store.last_sync_at = time.Time{}
	return store.sync_index_if_needed_locked(call_ctx, true)
}

func (store *sqlite_memo_query_store) mark_dirty() {
	store.mutex.Lock()
	store.last_sync_at = time.Time{}
	store.mutex.Unlock()
}

func (store *sqlite_memo_query_store) close() error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	return store.database.Close()
}

func (store *sqlite_memo_query_store) sync_index_if_needed_locked(call_ctx context.Context, force bool) error {
	if store.closed {
		return fmt.Errorf("memo index is closed")
	}
	if !force && !store.last_sync_at.IsZero() && time.Since(store.last_sync_at) < memo_index_sync_interval {
		return nil
	}
	if err := store.sync_index_locked(call_ctx); err != nil {
		return err
	}
	store.last_sync_at = time.Now()
	return nil
}

func (store *sqlite_memo_query_store) sync_index_locked(call_ctx context.Context) error {
	existing_files, err := store.load_index_fingerprints(call_ctx)
	if err != nil {
		return err
	}
	existing_record_paths, err := store.load_index_record_paths(call_ctx)
	if err != nil {
		return err
	}
	workspace_fs, err := require_vault_fs(store.vault_ctx)
	if err != nil {
		return err
	}
	seen_paths := map[string]bool{}
	files_by_id := map[string][]memo_index_fingerprint{}
	changed_files := map[string]memo_index_snapshot{}
	err = workspace_fs.walk_dir(vaultMemoDirName, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		select {
		case <-call_ctx.Done():
			return call_ctx.Err()
		default:
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		file_info, info_err := entry.Info()
		if info_err != nil {
			return info_err
		}
		seen_paths[path] = true
		existing_file, found := existing_files[path]
		if found && existing_file.modified_at_ns == file_info.ModTime().UnixNano() && existing_file.size == file_info.Size() {
			files_by_id[existing_file.id] = append(files_by_id[existing_file.id], existing_file)
			return nil
		}
		memo, read_err := readMemoFile(store.vault_ctx, path)
		if read_err != nil {
			return read_err
		}
		file_info, info_err = workspace_fs.stat_file(path)
		if info_err != nil {
			return info_err
		}
		fingerprint := memo_index_fingerprint{
			id:             memo.ID,
			modified_at_ns: file_info.ModTime().UnixNano(),
			path:           path,
			size:           file_info.Size(),
		}
		files_by_id[memo.ID] = append(files_by_id[memo.ID], fingerprint)
		changed_files[path] = memo_index_snapshot{fingerprint: fingerprint, memo: memo}
		return nil
	})
	if err != nil {
		return fmt.Errorf("scan memo index: %w", err)
	}
	removed_paths := []string{}
	for path := range existing_files {
		if !seen_paths[path] {
			removed_paths = append(removed_paths, path)
		}
	}
	selected_paths := map[string]string{}
	duplicate_paths := map[string][]string{}
	for memo_id, fingerprints := range files_by_id {
		selected_path := ""
		paths := make([]string, 0, len(fingerprints))
		for _, fingerprint := range fingerprints {
			paths = append(paths, fingerprint.path)
			selected_path = preferred_memo_index_path(memo_id, selected_path, fingerprint.path)
		}
		selected_paths[memo_id] = selected_path
		if len(paths) > 1 {
			sort.Strings(paths)
			duplicate_paths[memo_id] = paths
		}
	}
	record_updates := map[string]memo_index_snapshot{}
	for memo_id, selected_path := range selected_paths {
		if snapshot, changed := changed_files[selected_path]; changed {
			record_updates[memo_id] = snapshot
			continue
		}
		if existing_record_paths[memo_id] == selected_path {
			continue
		}
		memo, read_err := readMemoFile(store.vault_ctx, selected_path)
		if read_err != nil {
			return fmt.Errorf("read promoted memo index file %s: %w", selected_path, read_err)
		}
		file_info, info_err := workspace_fs.stat_file(selected_path)
		if info_err != nil {
			return info_err
		}
		fingerprint := memo_index_fingerprint{
			id:             memo.ID,
			modified_at_ns: file_info.ModTime().UnixNano(),
			path:           selected_path,
			size:           file_info.Size(),
		}
		snapshot := memo_index_snapshot{fingerprint: fingerprint, memo: memo}
		changed_files[selected_path] = snapshot
		record_updates[memo_id] = snapshot
	}
	removed_record_ids := []string{}
	for memo_id := range existing_record_paths {
		if selected_paths[memo_id] == "" {
			removed_record_ids = append(removed_record_ids, memo_id)
		}
	}
	if len(changed_files) == 0 && len(removed_paths) == 0 && len(record_updates) == 0 && len(removed_record_ids) == 0 {
		if err := store.sync_comment_extractions_locked(call_ctx); err != nil {
			return err
		}
		store.report_duplicate_memo_files(duplicate_paths, selected_paths)
		return nil
	}
	transaction, err := store.database.BeginTx(call_ctx, nil)
	if err != nil {
		return err
	}
	for _, snapshot := range changed_files {
		if err := upsert_memo_index_file(call_ctx, transaction, snapshot.fingerprint); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	for _, path := range removed_paths {
		if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_files WHERE path = ?", path); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	for _, snapshot := range record_updates {
		if err := upsert_memo_index_record(call_ctx, transaction, snapshot); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	for _, memo_id := range removed_record_ids {
		if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_records WHERE id = ?", memo_id); err != nil {
			_ = transaction.Rollback()
			return err
		}
		if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_fts WHERE id = ?", memo_id); err != nil {
			_ = transaction.Rollback()
			return err
		}
		if err := delete_memo_index_extractions(call_ctx, transaction, memo_id); err != nil {
			_ = transaction.Rollback()
			return err
		}
	}
	if err := transaction.Commit(); err != nil {
		return err
	}
	if err := store.sync_comment_extractions_locked(call_ctx); err != nil {
		return err
	}
	store.report_duplicate_memo_files(duplicate_paths, selected_paths)
	return nil
}

func (store *sqlite_memo_query_store) load_index_fingerprints(call_ctx context.Context) (map[string]memo_index_fingerprint, error) {
	rows, err := store.database.QueryContext(
		call_ctx,
		"SELECT memo_id, path, file_mtime_ns, file_size FROM memo_index_files",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fingerprints := map[string]memo_index_fingerprint{}
	for rows.Next() {
		var fingerprint memo_index_fingerprint
		if err := rows.Scan(&fingerprint.id, &fingerprint.path, &fingerprint.modified_at_ns, &fingerprint.size); err != nil {
			return nil, err
		}
		fingerprints[fingerprint.path] = fingerprint
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return fingerprints, nil
}

func (store *sqlite_memo_query_store) load_index_record_paths(call_ctx context.Context) (map[string]string, error) {
	rows, err := store.database.QueryContext(call_ctx, "SELECT id, path FROM memo_index_records")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	record_paths := map[string]string{}
	for rows.Next() {
		var memo_id string
		var path string
		if err := rows.Scan(&memo_id, &path); err != nil {
			return nil, err
		}
		record_paths[memo_id] = path
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return record_paths, nil
}

func preferred_memo_index_path(memo_id string, left_path string, right_path string) string {
	if left_path == "" {
		return right_path
	}
	if right_path == "" {
		return left_path
	}
	canonical_name := sanitizeMemoID(memo_id) + ".md"
	left_is_canonical := filepath.Base(left_path) == canonical_name
	right_is_canonical := filepath.Base(right_path) == canonical_name
	if left_is_canonical != right_is_canonical {
		if left_is_canonical {
			return left_path
		}
		return right_path
	}
	if left_path <= right_path {
		return left_path
	}
	return right_path
}

func (store *sqlite_memo_query_store) report_duplicate_memo_files(duplicate_paths map[string][]string, selected_paths map[string]string) {
	next_reported := map[string]string{}
	for memo_id, paths := range duplicate_paths {
		signature := strings.Join(paths, "\n")
		next_reported[memo_id] = signature
		if store.reported_duplicates[memo_id] == signature || store.vault_ctx == nil || store.vault_ctx.logger == nil {
			continue
		}
		store.vault_ctx.logger.Warn().
			Str("component", "memo_query").
			Str("memoId", memo_id).
			Str("selectedPath", selected_paths[memo_id]).
			Strs("duplicatePaths", paths).
			Msg("duplicate memo id; indexed preferred file")
	}
	store.reported_duplicates = next_reported
}

func memo_index_filter(query MemoListQuery) (string, []interface{}) {
	where_parts := []string{"1 = 1"}
	query_args := []interface{}{}
	if query.Archived != nil {
		where_parts = append(where_parts, "memo.archived = ?")
		query_args = append(query_args, bool_to_sqlite(*query.Archived))
	}
	if query.Pinned != nil {
		where_parts = append(where_parts, "memo.pinned = ?")
		query_args = append(query_args, bool_to_sqlite(*query.Pinned))
	}
	if project_id := sanitizeProjectID(query.ProjectID); project_id != "" {
		where_parts = append(where_parts, "memo.project_id = ?")
		query_args = append(query_args, project_id)
	}
	if visibility := strings.ToUpper(strings.TrimSpace(query.Visibility)); visibility != "" {
		where_parts = append(where_parts, "memo.visibility = ?")
		query_args = append(query_args, visibility)
	}
	if tag := strings.TrimSpace(query.Tag); tag != "" {
		where_parts = append(where_parts, `EXISTS (
			SELECT 1 FROM memo_index_tags AS memo_tag
			WHERE memo_tag.memo_id = memo.id AND memo_tag.tag_fold = ?
		)`)
		query_args = append(query_args, strings.ToLower(tag))
	}
	return strings.Join(where_parts, " AND "), query_args
}

func upsert_memo_index_file(call_ctx context.Context, transaction *sql.Tx, fingerprint memo_index_fingerprint) error {
	_, err := transaction.ExecContext(call_ctx, `
		INSERT INTO memo_index_files (path, memo_id, file_mtime_ns, file_size)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			memo_id = excluded.memo_id,
			file_mtime_ns = excluded.file_mtime_ns,
			file_size = excluded.file_size
	`, fingerprint.path, fingerprint.id, fingerprint.modified_at_ns, fingerprint.size)
	return err
}

func upsert_memo_index_record(call_ctx context.Context, transaction *sql.Tx, snapshot memo_index_snapshot) error {
	memo := snapshot.memo
	locations_json, err := json.Marshal(non_nil_strings(memo.Locations))
	if err != nil {
		return err
	}
	reactions_json, err := json.Marshal(non_nil_strings(memo.Reactions))
	if err != nil {
		return err
	}
	references_json, err := json.Marshal(non_nil_strings(memo.References))
	if err != nil {
		return err
	}
	tags_json, err := json.Marshal(non_nil_strings(memo.Tags))
	if err != nil {
		return err
	}
	if _, err := transaction.ExecContext(
		call_ctx,
		"DELETE FROM memo_index_records WHERE path = ? AND id <> ?",
		memo.Path,
		memo.ID,
	); err != nil {
		return err
	}
	_, err = transaction.ExecContext(call_ctx, `
		INSERT INTO memo_index_records (
			id, path, file_mtime_ns, file_size, archived, content, created_at,
			kind, locations_json, pinned, private_flag, project_id,
			reactions_json, references_json, tags_json, task_id, updated_at,
			visibility, sort_time_ns
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			path = excluded.path,
			file_mtime_ns = excluded.file_mtime_ns,
			file_size = excluded.file_size,
			archived = excluded.archived,
			content = excluded.content,
			created_at = excluded.created_at,
			kind = excluded.kind,
			locations_json = excluded.locations_json,
			pinned = excluded.pinned,
			private_flag = excluded.private_flag,
			project_id = excluded.project_id,
			reactions_json = excluded.reactions_json,
			references_json = excluded.references_json,
			tags_json = excluded.tags_json,
			task_id = excluded.task_id,
			updated_at = excluded.updated_at,
			visibility = excluded.visibility,
			sort_time_ns = excluded.sort_time_ns
	`,
		memo.ID,
		memo.Path,
		snapshot.fingerprint.modified_at_ns,
		snapshot.fingerprint.size,
		bool_to_sqlite(memo.Archived),
		memo.Content,
		memo.CreatedAt,
		memo.Kind,
		string(locations_json),
		bool_to_sqlite(memo.Pinned),
		bool_to_sqlite(memo.Private),
		memo.ProjectID,
		string(reactions_json),
		string(references_json),
		string(tags_json),
		memo.TaskID,
		memo.UpdatedAt,
		normalizeMemoVisibility(memo.Visibility),
		memoSortTime(memo).UnixNano(),
	)
	if err != nil {
		return err
	}
	if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_tags WHERE memo_id = ?", memo.ID); err != nil {
		return err
	}
	seen_tags := map[string]bool{}
	for _, tag := range uniqueStrings(memo.Tags) {
		tag_fold := strings.ToLower(tag)
		if seen_tags[tag_fold] {
			continue
		}
		seen_tags[tag_fold] = true
		if _, err := transaction.ExecContext(
			call_ctx,
			"INSERT INTO memo_index_tags (memo_id, tag, tag_fold) VALUES (?, ?, ?)",
			memo.ID,
			tag,
			tag_fold,
		); err != nil {
			return err
		}
	}
	if _, err := transaction.ExecContext(call_ctx, "DELETE FROM memo_index_fts WHERE id = ?", memo.ID); err != nil {
		return err
	}
	if _, err := transaction.ExecContext(call_ctx, "INSERT INTO memo_index_fts(id, content) VALUES (?, ?)", memo.ID, memo.Content); err != nil {
		return err
	}
	if err := replace_memo_index_extractions(call_ctx, transaction, memo); err != nil {
		return fmt.Errorf("index memo extractions: %w", err)
	}
	if err := sync_memo_meta_for_comment_rows(call_ctx, transaction, memo); err != nil {
		return err
	}
	return nil
}

func scan_memo_index_record(scanner memo_row_scanner) (MemoRecord, error) {
	var memo MemoRecord
	var archived int
	var locations_json string
	var pinned int
	var private_flag int
	var reactions_json string
	var references_json string
	var tags_json string
	err := scanner.Scan(
		&memo.ID,
		&memo.Path,
		&archived,
		&memo.Content,
		&memo.CreatedAt,
		&memo.Kind,
		&locations_json,
		&pinned,
		&private_flag,
		&memo.ProjectID,
		&reactions_json,
		&references_json,
		&tags_json,
		&memo.TaskID,
		&memo.UpdatedAt,
		&memo.Visibility,
	)
	if err != nil {
		return MemoRecord{}, err
	}
	memo.Archived = archived != 0
	memo.Pinned = pinned != 0
	memo.Private = private_flag != 0
	if err := decode_memo_string_list(locations_json, &memo.Locations); err != nil {
		return MemoRecord{}, err
	}
	if err := decode_memo_string_list(reactions_json, &memo.Reactions); err != nil {
		return MemoRecord{}, err
	}
	if err := decode_memo_string_list(references_json, &memo.References); err != nil {
		return MemoRecord{}, err
	}
	if err := decode_memo_string_list(tags_json, &memo.Tags); err != nil {
		return MemoRecord{}, err
	}
	return memo, nil
}

func decode_memo_string_list(raw_value string, target *[]string) error {
	if err := json.Unmarshal([]byte(raw_value), target); err != nil {
		return fmt.Errorf("decode memo index list: %w", err)
	}
	if *target == nil {
		*target = []string{}
	}
	return nil
}

func non_nil_strings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func bool_to_sqlite(value bool) int {
	if value {
		return 1
	}
	return 0
}

func is_rebuildable_memo_index_error(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "database disk image is malformed") ||
		strings.Contains(message, "file is not a database") ||
		strings.Contains(message, "malformed database")
}

func remove_memo_index_database(database_path string) {
	for _, path := range []string{database_path, database_path + "-shm", database_path + "-wal"} {
		_ = os.Remove(path)
	}
}

// --- FTS5 full-text search ---

type MemoSearchResult struct {
	MemoID    string   `json:"memoId"`
	Title     string   `json:"title"`
	Snippet   string   `json:"snippet"`
	Rank      float64  `json:"rank"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
	ProjectID string   `json:"projectId"`
	Tags      []string `json:"tags"`
	Archived  bool     `json:"archived"`
	Pinned    bool     `json:"pinned"`
}

func (store *sqlite_memo_query_store) search_fts(call_ctx context.Context, query string, limit int) ([]MemoSearchResult, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if store.closed {
		store.log_search("search_fts", query, 0, fmt.Errorf("store is closed"))
		return nil, fmt.Errorf("memo index is closed")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []MemoSearchResult{}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}

	// Log FTS table row count for diagnostics
	var fts_count int
	if err := store.database.QueryRowContext(call_ctx, "SELECT COUNT(*) FROM memo_index_fts").Scan(&fts_count); err != nil {
		store.log_search("search_fts", query, 0, fmt.Errorf("fts count failed: %w", err))
	}
	var records_count int
	_ = store.database.QueryRowContext(call_ctx, "SELECT COUNT(*) FROM memo_index_records").Scan(&records_count)
	store.log_search_detail("search_fts", query, fts_count, records_count)

	rune_count := utf8.RuneCountInString(query)
	if rune_count < 3 {
		store.log_search("search_fts", query, 0, fmt.Errorf("query too short (%d runes), using LIKE fallback", rune_count))
		return store.search_like(call_ctx, query, limit)
	}
	return store.search_fts5(call_ctx, query, limit)
}

func (store *sqlite_memo_query_store) search_like(call_ctx context.Context, query string, limit int) ([]MemoSearchResult, error) {
	pattern := "%" + query + "%"
	rows, err := store.database.QueryContext(call_ctx, `
		SELECT m.id, m.content, m.created_at, m.updated_at, m.project_id,
		       m.tags_json, m.archived, m.pinned
		FROM memo_index_records AS m
		WHERE m.content LIKE ?
		ORDER BY m.sort_time_ns DESC
		LIMIT ?
	`, pattern, limit)
	if err != nil {
		return nil, fmt.Errorf("search memo index (like): %w", err)
	}
	defer rows.Close()
	return scan_memo_search_rows_like(rows, query)
}

func (store *sqlite_memo_query_store) search_fts5(call_ctx context.Context, query string, limit int) ([]MemoSearchResult, error) {
	// Escape double quotes in query for FTS5 string matching
	escaped := strings.ReplaceAll(query, `"`, `""`)
	fts_query := `"` + escaped + `"`
	store.log_search("search_fts5", fts_query, 0, nil)
	rows, err := store.database.QueryContext(call_ctx, `
		SELECT f.id, snippet(memo_index_fts, 1, '<mark>', '</mark>', '...', 40),
		       rank, m.content, m.created_at, m.updated_at, m.project_id,
		       m.tags_json, m.archived, m.pinned
		FROM memo_index_fts AS f
		JOIN memo_index_records AS m ON m.id = f.id
		WHERE memo_index_fts MATCH ?
		ORDER BY rank
		LIMIT ?
	`, fts_query, limit)
	if err != nil {
		store.log_search("search_fts5", fts_query, 0, err)
		return nil, fmt.Errorf("search memo index (fts): %w", err)
	}
	defer rows.Close()
	results, err := scan_memo_search_rows_fts(rows)
	store.log_search("search_fts5.result", query, len(results), err)
	return results, err
}

func scan_memo_search_rows_fts(rows *sql.Rows) ([]MemoSearchResult, error) {
	results := []MemoSearchResult{}
	for rows.Next() {
		var r MemoSearchResult
		var snippet string
		var rank float64
		var content string
		var tags_json string
		var archived, pinned int
		if err := rows.Scan(&r.MemoID, &snippet, &rank, &content, &r.CreatedAt, &r.UpdatedAt, &r.ProjectID, &tags_json, &archived, &pinned); err != nil {
			return nil, fmt.Errorf("scan memo search result: %w", err)
		}
		r.Title = memo_search_title(content)
		r.Snippet = snippet
		r.Rank = rank
		r.Archived = archived != 0
		r.Pinned = pinned != 0
		if err := json.Unmarshal([]byte(tags_json), &r.Tags); err != nil {
			r.Tags = []string{}
		}
		if r.Tags == nil {
			r.Tags = []string{}
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("scan memo search results: %w", err)
	}
	return results, nil
}

func scan_memo_search_rows_like(rows *sql.Rows, query string) ([]MemoSearchResult, error) {
	results := []MemoSearchResult{}
	for rows.Next() {
		var r MemoSearchResult
		var content string
		var tags_json string
		var archived, pinned int
		if err := rows.Scan(&r.MemoID, &content, &r.CreatedAt, &r.UpdatedAt, &r.ProjectID, &tags_json, &archived, &pinned); err != nil {
			return nil, fmt.Errorf("scan memo search result: %w", err)
		}
		r.Title = memo_search_title(content)
		r.Snippet = memo_search_like_snippet(content, query, 80)
		r.Archived = archived != 0
		r.Pinned = pinned != 0
		if err := json.Unmarshal([]byte(tags_json), &r.Tags); err != nil {
			r.Tags = []string{}
		}
		if r.Tags == nil {
			r.Tags = []string{}
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("scan memo search results: %w", err)
	}
	return results, nil
}

func memo_search_title(content string) string {
	for _, line := range strings.SplitN(content, "\n", 10) {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			if len(trimmed) > 120 {
				trimmed = trimmed[:120] + "..."
			}
			return trimmed
		}
	}
	return ""
}

func memo_search_like_snippet(content string, query string, max_len int) string {
	flat := strings.Join(strings.Fields(content), " ")
	if len(flat) <= max_len {
		return flat
	}
	lower := strings.ToLower(flat)
	idx := strings.Index(lower, strings.ToLower(query))
	if idx < 0 {
		return flat[:max_len] + "..."
	}
	start := idx - max_len/3
	if start < 0 {
		start = 0
	}
	end := start + max_len
	if end > len(flat) {
		end = len(flat)
	}
	snippet := flat[start:end]
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(flat) {
		snippet = snippet + "..."
	}
	return snippet
}

func (store *sqlite_memo_query_store) log_search(stage string, query string, count int, err error) {
	if store.vault_ctx == nil || store.vault_ctx.logger == nil {
		return
	}
	event := store.vault_ctx.logger.Info()
	if err != nil {
		event = store.vault_ctx.logger.Error().Err(err)
	}
	event.Str("component", "memo_search").
		Str("stage", stage).
		Str("query", query).
		Int("count", count).
		Msg("fts search")
}

func (store *sqlite_memo_query_store) log_search_detail(stage string, query string, fts_rows int, record_rows int) {
	if store.vault_ctx == nil || store.vault_ctx.logger == nil {
		return
	}
	store.vault_ctx.logger.Info().
		Str("component", "memo_search").
		Str("stage", stage).
		Str("query", query).
		Int("ftsRows", fts_rows).
		Int("recordRows", record_rows).
		Bool("lastSyncZero", store.last_sync_at.IsZero()).
		Msg("fts search diagnostics")
}

func resolve_sqlite_memo_store(vault_ctx *VaultContext) *sqlite_memo_query_store {
	store := cached_memo_query_store(vault_ctx)
	if store == nil {
		return nil
	}
	if s, ok := store.(*sqlite_memo_query_store); ok {
		return s
	}
	if m, ok := store.(*mirrored_d1_memo_query_store); ok {
		return m.local_store
	}
	return nil
}
