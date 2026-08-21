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

	_ "modernc.org/sqlite"
)

const memo_index_file_name = "memo-index.db"
const memo_index_schema_version = 2
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
			"DROP TABLE IF EXISTS memo_index_tags",
			"DROP TABLE IF EXISTS memo_index_records",
			"DROP TABLE IF EXISTS memo_index_files",
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
		"CREATE INDEX IF NOT EXISTS memo_index_records_sort ON memo_index_records(sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_archived_sort ON memo_index_records(archived, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_pinned_sort ON memo_index_records(pinned, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_project_sort ON memo_index_records(project_id, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_records_visibility_sort ON memo_index_records(visibility, sort_time_ns DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS memo_index_tags_fold ON memo_index_tags(tag_fold, memo_id)",
		"CREATE INDEX IF NOT EXISTS memo_index_files_memo_id ON memo_index_files(memo_id, path)",
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
	return stats, nil
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
	}
	if err := transaction.Commit(); err != nil {
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
