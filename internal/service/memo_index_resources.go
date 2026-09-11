package service

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// memo_reference_record is a persisted image/file/link reference extracted
// from a memo body or a memo comment. Comment rows inherit the parent memo's
// project/visibility/archived so project filters and stats stay consistent.
type memo_reference_record struct {
	ID              string
	MemoID          string
	SourceType      string // memo | comment
	SourceID        string // memo id or comment id
	SourceCommentID string
	ProjectID       string
	RefType         string // image | file | link
	Syntax          string // image | markdown | raw
	URL             string
	Label           string
	LineIndex       int
	Seq             int
	SourceText      string
	MemoTitle       string
	Visibility      string
	TagsJSON        string
	Archived        bool
	SortTimeNS      int64
	CreatedAt       string
}

// memo_code_block_record is a persisted fenced code block. Fields mirror the
// CodeSnippet extractor output so views can render straight from the index.
type memo_code_block_record struct {
	ID              string
	MemoID          string
	SourceType      string
	SourceID        string
	SourceCommentID string
	ProjectID       string
	Language        string
	Title           string
	AliasesJSON     string
	Code            string
	Marked          bool
	StartLineIndex  int
	EndLineIndex    int
	SourceText      string
	MemoTitle       string
	Visibility      string
	TagsJSON        string
	Archived        bool
	SortTimeNS      int64
	CreatedAt       string
}

func build_memo_reference_rows(memo MemoRecord) []memo_reference_record {
	lines := memo_content_lines(memo.Content)
	items := extract_memo_references(memo.Content)
	rows := make([]memo_reference_record, 0, len(items))
	for _, item := range items {
		label := compactSnippetText(item.Label, 120)
		if label == "" && (item.Type == "file" || item.Type == "image") {
			label = file_display_name("", item.URL)
		} else if label == "" {
			label = linkDisplayName(item.URL)
		}
		rows = append(rows, memo_reference_record{
			ID:         memo.ID + ":" + strconv.Itoa(item.LineIndex) + ":" + strconv.Itoa(item.Seq) + ":" + item.Type,
			MemoID:     memo.ID,
			SourceType: "memo",
			SourceID:   memo.ID,
			ProjectID:  memo.ProjectID,
			RefType:    item.Type,
			Syntax:     item.Syntax,
			URL:        item.URL,
			Label:      label,
			LineIndex:  item.LineIndex,
			Seq:        item.Seq,
			SourceText: sourceTextFromMemoLines(lines, item.LineIndex, "仅包含资源的 memo"),
			MemoTitle:  memoTitleText(memo),
			Visibility: memo.Visibility,
			TagsJSON:   marshal_string_list(memo.Tags),
			Archived:   memo.Archived,
			SortTimeNS: memoSortTime(memo).UnixNano(),
			CreatedAt:  memo.CreatedAt,
		})
	}
	return rows
}

func build_memo_code_block_rows(memo MemoRecord) []memo_code_block_record {
	snippets := collectMemoCodeSnippets(memo)
	rows := make([]memo_code_block_record, 0, len(snippets))
	for _, snippet := range snippets {
		rows = append(rows, memo_code_block_record{
			ID:             snippet.ID,
			MemoID:         snippet.MemoID,
			SourceType:     "memo",
			SourceID:       snippet.MemoID,
			ProjectID:      snippet.ProjectID,
			Language:       snippet.Language,
			Title:          snippet.Title,
			AliasesJSON:    marshal_string_list(snippet.Aliases),
			Code:           snippet.Code,
			Marked:         snippet.Marked,
			StartLineIndex: snippet.StartLine - 1,
			EndLineIndex:   snippet.EndLine - 1,
			SourceText:     snippet.SourceText,
			MemoTitle:      snippet.MemoTitle,
			Visibility:     snippet.Visibility,
			TagsJSON:       marshal_string_list(memo.Tags),
			Archived:       memo.Archived,
			SortTimeNS:     memoSortTime(memo).UnixNano(),
			CreatedAt:      snippet.CreatedAt,
		})
	}
	return rows
}

// build_comment_extraction_rows extracts resource rows from a comment body;
// metadata is inherited from the parent memo, matching the frontend's
// memoCommentDocument behavior.
func build_comment_extraction_rows(comment MemoCommentRecord, parent MemoRecord) ([]memo_reference_record, []memo_code_block_record) {
	source := memoRecordForCommentSource(comment, parent)
	reference_rows := build_memo_reference_rows(source)
	for index := range reference_rows {
		row := &reference_rows[index]
		row.ID = comment.ID + ":" + strconv.Itoa(row.LineIndex) + ":" + strconv.Itoa(row.Seq) + ":" + row.RefType
		row.MemoID = parent.ID
		row.SourceType = "comment"
		row.SourceID = comment.ID
		row.SourceCommentID = comment.ID
		row.ProjectID = parent.ProjectID
		row.MemoTitle = memoTitleText(parent) + " / 评论"
		row.Visibility = parent.Visibility
		row.TagsJSON = marshal_string_list(parent.Tags)
		row.Archived = parent.Archived
		row.SortTimeNS = memoSortTime(source).UnixNano()
	}

	code_snippets := collectMemoCodeSnippets(source)
	block_rows := make([]memo_code_block_record, 0, len(code_snippets))
	for _, snippet := range code_snippets {
		block_rows = append(block_rows, memo_code_block_record{
			ID:              comment.ID + ":" + strconv.Itoa(snippet.StartLine-1) + ":" + strconv.Itoa(snippet.EndLine-1) + ":code",
			MemoID:          parent.ID,
			SourceType:      "comment",
			SourceID:        comment.ID,
			SourceCommentID: comment.ID,
			ProjectID:       parent.ProjectID,
			Language:        snippet.Language,
			Title:           snippet.Title,
			AliasesJSON:     marshal_string_list(snippet.Aliases),
			Code:            snippet.Code,
			Marked:          snippet.Marked,
			StartLineIndex:  snippet.StartLine - 1,
			EndLineIndex:    snippet.EndLine - 1,
			SourceText:      snippet.SourceText,
			MemoTitle:       memoTitleText(parent) + " / 评论",
			Visibility:      parent.Visibility,
			TagsJSON:        marshal_string_list(parent.Tags),
			Archived:        parent.Archived,
			SortTimeNS:      memoSortTime(source).UnixNano(),
			CreatedAt:       snippet.CreatedAt,
		})
	}
	return reference_rows, block_rows
}

func marshal_string_list(values []string) string {
	raw, err := json.Marshal(non_nil_strings(values))
	if err != nil {
		return "[]"
	}
	return string(raw)
}

func upsert_memo_index_references(call_ctx context.Context, tx *sql.Tx, rows []memo_reference_record) error {
	for _, row := range rows {
		if _, err := tx.ExecContext(call_ctx, `
			INSERT INTO memo_index_references (
				id, memo_id, source_type, source_id, source_comment_id, project_id,
				ref_type, syntax, url, label, line_index, seq, source_text,
				memo_title, visibility, tags_json, archived, sort_time_ns, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				memo_id = excluded.memo_id,
				source_type = excluded.source_type,
				source_id = excluded.source_id,
				source_comment_id = excluded.source_comment_id,
				project_id = excluded.project_id,
				ref_type = excluded.ref_type,
				syntax = excluded.syntax,
				url = excluded.url,
				label = excluded.label,
				line_index = excluded.line_index,
				seq = excluded.seq,
				source_text = excluded.source_text,
				memo_title = excluded.memo_title,
				visibility = excluded.visibility,
				tags_json = excluded.tags_json,
				archived = excluded.archived,
				sort_time_ns = excluded.sort_time_ns,
				created_at = excluded.created_at
		`,
			row.ID,
			row.MemoID,
			row.SourceType,
			row.SourceID,
			row.SourceCommentID,
			row.ProjectID,
			row.RefType,
			row.Syntax,
			row.URL,
			row.Label,
			row.LineIndex,
			row.Seq,
			row.SourceText,
			row.MemoTitle,
			row.Visibility,
			row.TagsJSON,
			bool_to_sqlite(row.Archived),
			row.SortTimeNS,
			row.CreatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func upsert_memo_index_code_blocks(call_ctx context.Context, tx *sql.Tx, rows []memo_code_block_record) error {
	for _, row := range rows {
		if _, err := tx.ExecContext(call_ctx, `
			INSERT INTO memo_index_code_blocks (
				id, memo_id, source_type, source_id, source_comment_id, project_id,
				language, title, aliases_json, code, marked, line_index,
			end_line_index, source_text, memo_title, visibility, tags_json,
				archived, sort_time_ns, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				memo_id = excluded.memo_id,
				source_type = excluded.source_type,
				source_id = excluded.source_id,
				source_comment_id = excluded.source_comment_id,
				project_id = excluded.project_id,
				language = excluded.language,
				title = excluded.title,
				aliases_json = excluded.aliases_json,
				code = excluded.code,
				marked = excluded.marked,
				line_index = excluded.line_index,
				end_line_index = excluded.end_line_index,
				source_text = excluded.source_text,
				memo_title = excluded.memo_title,
				visibility = excluded.visibility,
				tags_json = excluded.tags_json,
				archived = excluded.archived,
				sort_time_ns = excluded.sort_time_ns,
				created_at = excluded.created_at
		`,
			row.ID,
			row.MemoID,
			row.SourceType,
			row.SourceID,
			row.SourceCommentID,
			row.ProjectID,
			row.Language,
			row.Title,
			row.AliasesJSON,
			row.Code,
			bool_to_sqlite(row.Marked),
			row.StartLineIndex,
			row.EndLineIndex,
			row.SourceText,
			row.MemoTitle,
			row.Visibility,
			row.TagsJSON,
			bool_to_sqlite(row.Archived),
			row.SortTimeNS,
			row.CreatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

// replace_memo_index_extractions rebuilds the reference and code-block rows
// for a memo body inside the caller's transaction.
func replace_memo_index_extractions(call_ctx context.Context, tx *sql.Tx, memo MemoRecord) error {
	if err := delete_memo_index_extractions(call_ctx, tx, memo.ID); err != nil {
		return err
	}
	if err := upsert_memo_index_references(call_ctx, tx, build_memo_reference_rows(memo)); err != nil {
		return err
	}
	return upsert_memo_index_code_blocks(call_ctx, tx, build_memo_code_block_rows(memo))
}

// replace_comment_index_extractions rebuilds the rows for one comment. The
// comment file fingerprint is persisted by the caller.
func replace_comment_index_extractions(call_ctx context.Context, tx *sql.Tx, comment MemoCommentRecord, parent MemoRecord) error {
	if err := delete_comment_index_extractions(call_ctx, tx, comment.ID); err != nil {
		return err
	}
	reference_rows, block_rows := build_comment_extraction_rows(comment, parent)
	if err := upsert_memo_index_references(call_ctx, tx, reference_rows); err != nil {
		return err
	}
	return upsert_memo_index_code_blocks(call_ctx, tx, block_rows)
}

// delete_memo_index_extractions removes every extraction row belonging to a
// memo, including rows extracted from its comments.
func delete_memo_index_extractions(call_ctx context.Context, tx *sql.Tx, memo_id string) error {
	for _, statement := range []string{
		"DELETE FROM memo_index_references WHERE memo_id = ?",
		"DELETE FROM memo_index_code_blocks WHERE memo_id = ?",
	} {
		if _, err := tx.ExecContext(call_ctx, statement, memo_id); err != nil {
			return err
		}
	}
	return nil
}

func delete_comment_index_extractions(call_ctx context.Context, tx *sql.Tx, comment_id string) error {
	for _, statement := range []string{
		"DELETE FROM memo_index_references WHERE source_id = ? AND source_type = 'comment'",
		"DELETE FROM memo_index_code_blocks WHERE source_id = ? AND source_type = 'comment'",
	} {
		if _, err := tx.ExecContext(call_ctx, statement, comment_id); err != nil {
			return err
		}
	}
	return nil
}

// sync_memo_meta_for_comment_rows keeps comment-extracted rows in sync when a
// parent memo's project, visibility, archived state, or tags change without
// its comments being touched.
func sync_memo_meta_for_comment_rows(call_ctx context.Context, tx *sql.Tx, memo MemoRecord) error {
	for _, statement := range []string{
		`UPDATE memo_index_references SET
			project_id = ?, visibility = ?, tags_json = ?, archived = ?
		 WHERE memo_id = ? AND source_type = 'comment'`,
		`UPDATE memo_index_code_blocks SET
			project_id = ?, visibility = ?, tags_json = ?, archived = ?
		 WHERE memo_id = ? AND source_type = 'comment'`,
	} {
		if _, err := tx.ExecContext(
			call_ctx,
			statement,
			memo.ProjectID,
			memo.Visibility,
			marshal_string_list(memo.Tags),
			bool_to_sqlite(memo.Archived),
			memo.ID,
		); err != nil {
			return err
		}
	}
	return nil
}

// --- queries ---

type MemoResourceQuery struct {
	Type       string // image | file | link (references only)
	ProjectID  string
	Unassigned bool
	Query      string
	MarkedOnly bool   // code blocks only
	Language   string // code blocks only
	Cursor     string
	Limit      int
}

type MemoReferenceView struct {
	ID              string   `json:"id"`
	MemoID          string   `json:"memoId"`
	SourceMemoID    string   `json:"sourceMemoId"`
	SourceCommentID string   `json:"sourceCommentId,omitempty"`
	SourceType      string   `json:"sourceType"`
	ProjectID       string   `json:"projectId,omitempty"`
	Type            string   `json:"type"`
	Syntax          string   `json:"syntax"`
	URL             string   `json:"url"`
	Label           string   `json:"label"`
	LineIndex       int      `json:"lineIndex"`
	SourceText      string   `json:"sourceText"`
	MemoTitle       string   `json:"memoTitle"`
	Tags            []string `json:"tags"`
	Archived        bool     `json:"archived"`
	CreatedAt       string   `json:"createdAt"`
}

type MemoCodeBlockView struct {
	ID              string   `json:"id"`
	MemoID          string   `json:"memoId"`
	SourceMemoID    string   `json:"sourceMemoId"`
	SourceCommentID string   `json:"sourceCommentId,omitempty"`
	SourceType      string   `json:"sourceType"`
	ProjectID       string   `json:"projectId,omitempty"`
	Language        string   `json:"language"`
	Title           string   `json:"title"`
	Aliases         []string `json:"aliases"`
	Code            string   `json:"code"`
	Marked          bool     `json:"marked"`
	StartLineIndex  int      `json:"lineIndex"`
	EndLineIndex    int      `json:"endLineIndex"`
	SourceText      string   `json:"sourceText"`
	MemoTitle       string   `json:"memoTitle"`
	Tags            []string `json:"tags"`
	Archived        bool     `json:"archived"`
	CreatedAt       string   `json:"createdAt"`
}

type MemoResourcePage struct {
	HasMore    bool                `json:"hasMore"`
	NextCursor string              `json:"nextCursor"`
	Total      int                 `json:"total"`
	References []MemoReferenceView `json:"references,omitempty"`
	CodeBlocks []MemoCodeBlockView `json:"codeBlocks,omitempty"`
}

type memo_resource_cursor struct {
	SortTimeNS int64  `json:"sortTimeNS"`
	SourceID   string `json:"sourceId"`
	LineIndex  int    `json:"lineIndex"`
	Seq        int    `json:"seq"`
}

func encode_memo_resource_cursor(cursor memo_resource_cursor) (string, error) {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func decode_memo_resource_cursor(value string) (memo_resource_cursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return memo_resource_cursor{}, fmt.Errorf("invalid resource cursor")
	}
	var cursor memo_resource_cursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return memo_resource_cursor{}, fmt.Errorf("invalid resource cursor")
	}
	return cursor, nil
}

// resource_query_sql builds the shared WHERE clause for extraction-table
// queries: archived memos are always excluded; project scope, marked/language
// and a case-insensitive text filter are optional.
func resource_query_sql(table string, query MemoResourceQuery) (string, []interface{}) {
	where_parts := []string{"archived = 0"}
	query_args := []interface{}{}
	if ref_type := strings.ToLower(strings.TrimSpace(query.Type)); ref_type != "" && table == "memo_index_references" {
		where_parts = append(where_parts, "ref_type = ?")
		query_args = append(query_args, ref_type)
	}
	if query.Unassigned {
		where_parts = append(where_parts, "project_id = ''")
	} else if project_id := sanitizeProjectID(query.ProjectID); project_id != "" {
		where_parts = append(where_parts, "project_id = ?")
		query_args = append(query_args, project_id)
	}
	if table == "memo_index_code_blocks" {
		if query.MarkedOnly {
			where_parts = append(where_parts, "marked = 1")
		}
		if language := strings.TrimSpace(query.Language); language != "" {
			where_parts = append(where_parts, "LOWER(language) = ?")
			query_args = append(query_args, strings.ToLower(language))
		}
	}
	if needle := strings.ToLower(strings.TrimSpace(query.Query)); needle != "" {
		like := "%" + needle + "%"
		if table == "memo_index_references" {
			where_parts = append(where_parts, "(LOWER(url) LIKE ? OR LOWER(label) LIKE ? OR LOWER(source_text) LIKE ? OR LOWER(memo_title) LIKE ?)")
			query_args = append(query_args, like, like, like, like)
		} else {
			where_parts = append(where_parts, "(LOWER(code) LIKE ? OR LOWER(title) LIKE ? OR LOWER(language) LIKE ? OR LOWER(source_text) LIKE ? OR LOWER(memo_title) LIKE ?)")
			query_args = append(query_args, like, like, like, like, like)
		}
	}
	return strings.Join(where_parts, " AND "), query_args
}

func resource_cursor_sql(where_sql string, cursor memo_resource_cursor) string {
	// ORDER BY is sort_time_ns DESC, source_id DESC, line_index ASC, seq ASC,
	// so the continuation flips the inequality for the descending columns.
	return where_sql +
		" AND (sort_time_ns < ?" +
		" OR (sort_time_ns = ? AND source_id < ?)" +
		" OR (sort_time_ns = ? AND source_id = ? AND line_index > ?)" +
		" OR (sort_time_ns = ? AND source_id = ? AND line_index = ? AND seq > ?))"
}

// list_memo_resources_locked pages through an extraction table ordered by
// memo sort time desc, then line/seq ascending inside a memo — the same
// order as sortMemoReference in the frontend.
func list_memo_resources_locked(call_ctx context.Context, database *sql.DB, query MemoResourceQuery, table string) (MemoResourcePage, error) {
	if query.Limit <= 0 {
		query.Limit = 40
	}
	if query.Limit > 200 {
		query.Limit = 200
	}
	count_where, count_args := resource_query_sql(table, query)
	list_where := count_where
	list_args := append([]interface{}{}, count_args...)
	if cursor_value := strings.TrimSpace(query.Cursor); cursor_value != "" {
		cursor, err := decode_memo_resource_cursor(cursor_value)
		if err != nil {
			return MemoResourcePage{}, err
		}
		list_where = resource_cursor_sql(count_where, cursor)
		list_args = append(list_args,
			cursor.SortTimeNS,
			cursor.SortTimeNS, cursor.SourceID,
			cursor.SortTimeNS, cursor.SourceID, cursor.LineIndex,
			cursor.SortTimeNS, cursor.SourceID, cursor.LineIndex, cursor.Seq,
		)
	}

	var total int
	if err := database.QueryRowContext(
		call_ctx,
		"SELECT COUNT(*) FROM "+table+" WHERE "+count_where,
		count_args...,
	).Scan(&total); err != nil {
		return MemoResourcePage{}, fmt.Errorf("count memo %s: %w", table, err)
	}

	select_columns := "id, memo_id, source_type, source_id, source_comment_id, project_id, ref_type, syntax, url, label, line_index, seq, source_text, memo_title, visibility, tags_json, archived, sort_time_ns, created_at"
	seq_column := "seq"
	if table == "memo_index_code_blocks" {
		select_columns = "id, memo_id, source_type, source_id, source_comment_id, project_id, language, title, aliases_json, code, marked, line_index, end_line_index, source_text, memo_title, visibility, tags_json, archived, sort_time_ns, created_at"
		seq_column = "end_line_index"
	}
	statement := "SELECT " + select_columns + " FROM " + table + " WHERE " + list_where +
		" ORDER BY sort_time_ns DESC, source_id DESC, line_index ASC, " + seq_column + " ASC" +
		" LIMIT ?"
	list_args = append(list_args, query.Limit+1)
	rows, err := database.QueryContext(call_ctx, statement, list_args...)
	if err != nil {
		return MemoResourcePage{}, fmt.Errorf("list memo %s: %w", table, err)
	}
	defer rows.Close()

	page := MemoResourcePage{Total: total}
	item_count := 0
	var last_cursor memo_resource_cursor
	if table == "memo_index_references" {
		page.References = []MemoReferenceView{}
		for rows.Next() {
			view, cursor, scan_err := scan_memo_reference_row(rows)
			if scan_err != nil {
				return MemoResourcePage{}, scan_err
			}
			page.References = append(page.References, view)
			last_cursor = cursor
			item_count += 1
		}
	} else {
		page.CodeBlocks = []MemoCodeBlockView{}
		for rows.Next() {
			view, cursor, scan_err := scan_memo_code_block_row(rows)
			if scan_err != nil {
				return MemoResourcePage{}, scan_err
			}
			page.CodeBlocks = append(page.CodeBlocks, view)
			last_cursor = cursor
			item_count += 1
		}
	}
	if err := rows.Err(); err != nil {
		return MemoResourcePage{}, fmt.Errorf("list memo %s: %w", table, err)
	}
	if item_count > query.Limit {
		page.HasMore = true
		if table == "memo_index_references" {
			page.References = page.References[:query.Limit]
		} else {
			page.CodeBlocks = page.CodeBlocks[:query.Limit]
		}
		next_cursor, err := encode_memo_resource_cursor(last_cursor)
		if err != nil {
			return MemoResourcePage{}, err
		}
		page.NextCursor = next_cursor
	}
	return page, nil
}

func scan_memo_reference_row(scanner memo_row_scanner) (MemoReferenceView, memo_resource_cursor, error) {
	var row memo_reference_record
	var archived int
	err := scanner.Scan(
		&row.ID,
		&row.MemoID,
		&row.SourceType,
		&row.SourceID,
		&row.SourceCommentID,
		&row.ProjectID,
		&row.RefType,
		&row.Syntax,
		&row.URL,
		&row.Label,
		&row.LineIndex,
		&row.Seq,
		&row.SourceText,
		&row.MemoTitle,
		&row.Visibility,
		&row.TagsJSON,
		&archived,
		&row.SortTimeNS,
		&row.CreatedAt,
	)
	if err != nil {
		return MemoReferenceView{}, memo_resource_cursor{}, err
	}
	row.Archived = archived != 0
	view := MemoReferenceView{
		ID:              row.ID,
		MemoID:          row.MemoID,
		SourceMemoID:    row.MemoID,
		SourceCommentID: row.SourceCommentID,
		SourceType:      row.SourceType,
		ProjectID:       row.ProjectID,
		Type:            row.RefType,
		Syntax:          row.Syntax,
		URL:             row.URL,
		Label:           row.Label,
		LineIndex:       row.LineIndex,
		SourceText:      row.SourceText,
		MemoTitle:       row.MemoTitle,
		Tags:            decode_string_list_or_empty(row.TagsJSON),
		Archived:        row.Archived,
		CreatedAt:       row.CreatedAt,
	}
	cursor := memo_resource_cursor{
		SortTimeNS: row.SortTimeNS,
		SourceID:   row.SourceID,
		LineIndex:  row.LineIndex,
		Seq:        row.Seq,
	}
	return view, cursor, nil
}

func scan_memo_code_block_row(scanner memo_row_scanner) (MemoCodeBlockView, memo_resource_cursor, error) {
	var row memo_code_block_record
	var marked int
	var archived int
	err := scanner.Scan(
		&row.ID,
		&row.MemoID,
		&row.SourceType,
		&row.SourceID,
		&row.SourceCommentID,
		&row.ProjectID,
		&row.Language,
		&row.Title,
		&row.AliasesJSON,
		&row.Code,
		&marked,
		&row.StartLineIndex,
		&row.EndLineIndex,
		&row.SourceText,
		&row.MemoTitle,
		&row.Visibility,
		&row.TagsJSON,
		&archived,
		&row.SortTimeNS,
		&row.CreatedAt,
	)
	if err != nil {
		return MemoCodeBlockView{}, memo_resource_cursor{}, err
	}
	row.Marked = marked != 0
	row.Archived = archived != 0
	view := MemoCodeBlockView{
		ID:              row.ID,
		MemoID:          row.MemoID,
		SourceMemoID:    row.MemoID,
		SourceCommentID: row.SourceCommentID,
		SourceType:      row.SourceType,
		ProjectID:       row.ProjectID,
		Language:        row.Language,
		Title:           row.Title,
		Aliases:         decode_string_list_or_empty(row.AliasesJSON),
		Code:            row.Code,
		Marked:          row.Marked,
		StartLineIndex:  row.StartLineIndex,
		EndLineIndex:    row.EndLineIndex,
		SourceText:      row.SourceText,
		MemoTitle:       row.MemoTitle,
		Tags:            decode_string_list_or_empty(row.TagsJSON),
		Archived:        row.Archived,
		CreatedAt:       row.CreatedAt,
	}
	cursor := memo_resource_cursor{
		SortTimeNS: row.SortTimeNS,
		SourceID:   row.SourceID,
		LineIndex:  row.StartLineIndex,
		Seq:        row.EndLineIndex,
	}
	return view, cursor, nil
}

func decode_string_list_or_empty(raw_value string) []string {
	values := []string{}
	if err := json.Unmarshal([]byte(raw_value), &values); err != nil {
		return []string{}
	}
	if values == nil {
		return []string{}
	}
	return values
}

// memo_resource_query_store resolves the store backing the resource list
// endpoints. Both the plain sqlite store and the D1 mirror serve these from
// the local index.
type memo_resource_list_store interface {
	ListReferences(context.Context, MemoResourceQuery) (MemoResourcePage, error)
	ListCodeBlocks(context.Context, MemoResourceQuery) (MemoResourcePage, error)
}

func memo_resource_query_store(vault_ctx *VaultContext) (memo_resource_list_store, error) {
	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		return nil, err
	}
	if resource_store, ok := query_store.(memo_resource_list_store); ok {
		return resource_store, nil
	}
	return nil, fmt.Errorf("memo storage does not support resource queries")
}

type velo_query_context interface {
	Query(string) string
}

func parse_memo_resource_query(c velo_query_context) MemoResourceQuery {
	limit := 0
	if parsed, err := strconv.Atoi(strings.TrimSpace(c.Query("limit"))); err == nil {
		limit = parsed
	}
	return MemoResourceQuery{
		ProjectID:  strings.TrimSpace(c.Query("projectId")),
		Unassigned: strings.EqualFold(strings.TrimSpace(c.Query("projectScope")), "unassigned"),
		Query:      c.Query("q"),
		Cursor:     c.Query("cursor"),
		Limit:      limit,
	}
}
