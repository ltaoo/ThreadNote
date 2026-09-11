package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

const d1_memo_sync_batch_size = 40

var err_d1_memo_not_found = errors.New("D1 memo not found")

const d1_memo_upsert_sql = `
	INSERT INTO threadnote_memos (
		vault_id, id, path, record_json, archived, pinned, private_flag,
		project_id, tags_json, visibility, sort_time, deleted_at,
		sync_generation, synced_at, revision
	) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, '', ?12, ?13, 1)
	ON CONFLICT(vault_id, id) DO UPDATE SET
		path = excluded.path,
		record_json = excluded.record_json,
		archived = excluded.archived,
		pinned = excluded.pinned,
		private_flag = excluded.private_flag,
		project_id = excluded.project_id,
		tags_json = excluded.tags_json,
		visibility = excluded.visibility,
		sort_time = excluded.sort_time,
		deleted_at = '',
		sync_generation = excluded.sync_generation,
		synced_at = excluded.synced_at,
		revision = threadnote_memos.revision + 1`

type d1_memo_store struct {
	client       d1_query_client
	schema_mutex sync.Mutex
	schema_ready bool
	vault_id     string
}

type mirrored_d1_memo_query_store struct {
	local_store  *sqlite_memo_query_store
	remote_store *d1_memo_store
	vault_ctx    *VaultContext
}

func new_d1_memo_store(vault_id string, config D1MemoStorageConfig, http_client d1_query_client) (*d1_memo_store, error) {
	vault_id = strings.TrimSpace(vault_id)
	if vault_id == "" {
		return nil, fmt.Errorf("vault ID is required for D1 memo storage")
	}
	query_client := http_client
	if query_client == nil {
		client, err := new_d1_http_query_client(config, nil)
		if err != nil {
			return nil, err
		}
		query_client = client
	}
	return &d1_memo_store{client: query_client, vault_id: vault_id}, nil
}

func (store *d1_memo_store) ensure_schema(call_ctx context.Context) error {
	store.schema_mutex.Lock()
	defer store.schema_mutex.Unlock()
	if store.schema_ready {
		return nil
	}
	statements := []d1_query_statement{
		{SQL: `CREATE TABLE IF NOT EXISTS threadnote_memos (
			vault_id TEXT NOT NULL,
			id TEXT NOT NULL,
			path TEXT NOT NULL,
			record_json TEXT NOT NULL,
			archived INTEGER NOT NULL,
			pinned INTEGER NOT NULL,
			private_flag INTEGER NOT NULL,
			project_id TEXT NOT NULL,
			tags_json TEXT NOT NULL,
			visibility TEXT NOT NULL,
			sort_time TEXT NOT NULL,
			deleted_at TEXT NOT NULL,
			sync_generation TEXT NOT NULL,
			synced_at TEXT NOT NULL,
			revision INTEGER NOT NULL,
			PRIMARY KEY (vault_id, id)
		) STRICT`},
		{SQL: `CREATE INDEX IF NOT EXISTS threadnote_memos_list
			ON threadnote_memos (vault_id, deleted_at, sort_time DESC, id DESC)`},
		{SQL: `CREATE INDEX IF NOT EXISTS threadnote_memos_project
			ON threadnote_memos (vault_id, deleted_at, project_id, sort_time DESC, id DESC)`},
	}
	if _, err := store.client.batch(call_ctx, statements); err != nil {
		return fmt.Errorf("initialize D1 memo schema: %w", err)
	}
	store.schema_ready = true
	return nil
}

func (store *d1_memo_store) test(call_ctx context.Context) error {
	if err := store.ensure_schema(call_ctx); err != nil {
		return err
	}
	_, err := store.client.query(call_ctx, d1_query_statement{
		SQL:    "SELECT COUNT(*) AS memo_count FROM threadnote_memos WHERE vault_id = ?1 AND deleted_at = ''",
		Params: []string{store.vault_id},
	})
	if err != nil {
		return fmt.Errorf("test D1 memo storage: %w", err)
	}
	return nil
}

func (store *d1_memo_store) Get(call_ctx context.Context, memo_id string) (MemoRecord, error) {
	memo_id = strings.TrimSpace(memo_id)
	if memo_id == "" {
		return MemoRecord{}, fmt.Errorf("memo id is required")
	}
	if err := store.ensure_schema(call_ctx); err != nil {
		return MemoRecord{}, err
	}
	result, err := store.client.query(call_ctx, d1_query_statement{
		SQL:    "SELECT record_json FROM threadnote_memos WHERE vault_id = ?1 AND id = ?2 AND deleted_at = '' LIMIT 1",
		Params: []string{store.vault_id, memo_id},
	})
	if err != nil {
		return MemoRecord{}, err
	}
	if len(result.Results) == 0 {
		return MemoRecord{}, fmt.Errorf("%w: %s", err_d1_memo_not_found, memo_id)
	}
	return decode_d1_memo_row(result.Results[0])
}

func (store *d1_memo_store) List(call_ctx context.Context, query MemoListQuery) (MemoPage, error) {
	if query.Limit < 0 {
		return MemoPage{}, fmt.Errorf("memo limit must be non-negative")
	}
	if err := store.ensure_schema(call_ctx); err != nil {
		return MemoPage{}, err
	}
	where_sql, params, err := store.list_filter(query)
	if err != nil {
		return MemoPage{}, err
	}
	count_result, err := store.client.query(call_ctx, d1_query_statement{
		SQL:    "SELECT COUNT(*) AS memo_count FROM threadnote_memos AS memo WHERE " + where_sql,
		Params: params,
	})
	if err != nil {
		return MemoPage{}, err
	}
	total := 0
	if len(count_result.Results) > 0 {
		total, err = d1_row_int(count_result.Results[0], "memo_count")
		if err != nil {
			return MemoPage{}, err
		}
	}

	list_where_sql := where_sql
	list_params := append([]string{}, params...)
	if strings.TrimSpace(query.Cursor) != "" {
		cursor, decode_err := decode_memo_cursor(query.Cursor)
		if decode_err != nil {
			return MemoPage{}, decode_err
		}
		cursor_sort_time := d1_sort_time_value(parseMemoTime(cursor.SortTime))
		list_where_sql += fmt.Sprintf(
			" AND (memo.sort_time < ?%d OR (memo.sort_time = ?%d AND memo.id < ?%d))",
			len(list_params)+1,
			len(list_params)+2,
			len(list_params)+3,
		)
		list_params = append(list_params, cursor_sort_time, cursor_sort_time, cursor.ID)
	}
	statement := "SELECT record_json FROM threadnote_memos AS memo WHERE " + list_where_sql +
		" ORDER BY memo.sort_time DESC, memo.id DESC"
	if query.Limit > 0 {
		statement += fmt.Sprintf(" LIMIT ?%d", len(list_params)+1)
		list_params = append(list_params, strconv.Itoa(query.Limit+1))
	}
	list_result, err := store.client.query(call_ctx, d1_query_statement{SQL: statement, Params: list_params})
	if err != nil {
		return MemoPage{}, err
	}
	memos := make([]MemoRecord, 0, len(list_result.Results))
	for _, row := range list_result.Results {
		memo, decode_err := decode_d1_memo_row(row)
		if decode_err != nil {
			return MemoPage{}, decode_err
		}
		memos = append(memos, memo)
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
	return page, nil
}

func (store *d1_memo_store) Stats(call_ctx context.Context) (MemoStats, error) {
	if err := store.ensure_schema(call_ctx); err != nil {
		return MemoStats{}, err
	}
	result, err := store.client.query(call_ctx, d1_query_statement{
		SQL: `SELECT
			COUNT(*) AS total,
			COALESCE(SUM(CASE WHEN archived = 0 THEN 1 ELSE 0 END), 0) AS active,
			COALESCE(SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END), 0) AS archived,
			COALESCE(SUM(CASE WHEN archived = 0 AND pinned = 1 THEN 1 ELSE 0 END), 0) AS pinned,
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PRIVATE' THEN 1 ELSE 0 END), 0) AS private_count,
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PROTECTED' THEN 1 ELSE 0 END), 0) AS protected,
			COALESCE(SUM(CASE WHEN archived = 0 AND visibility = 'PUBLIC' THEN 1 ELSE 0 END), 0) AS public_count,
			COALESCE(SUM(CASE WHEN archived = 0 AND private_flag = 1 THEN 1 ELSE 0 END), 0) AS secret
		FROM threadnote_memos
		WHERE vault_id = ?1 AND deleted_at = ''`,
		Params: []string{store.vault_id},
	})
	if err != nil {
		return MemoStats{}, err
	}
	stats := MemoStats{ProjectCounts: map[string]int{}}
	if len(result.Results) > 0 {
		row := result.Results[0]
		fields := []struct {
			key    string
			target *int
		}{
			{key: "total", target: &stats.Total},
			{key: "active", target: &stats.Active},
			{key: "archived", target: &stats.Archived},
			{key: "pinned", target: &stats.Pinned},
			{key: "private_count", target: &stats.Private},
			{key: "protected", target: &stats.Protected},
			{key: "public_count", target: &stats.Public},
			{key: "secret", target: &stats.Secret},
		}
		for _, field := range fields {
			value, value_err := d1_row_int(row, field.key)
			if value_err != nil {
				return MemoStats{}, value_err
			}
			*field.target = value
		}
	}
	projects_result, err := store.client.query(call_ctx, d1_query_statement{
		SQL: `SELECT project_id, COUNT(*) AS memo_count
			FROM threadnote_memos
			WHERE vault_id = ?1 AND deleted_at = '' AND archived = 0
			GROUP BY project_id`,
		Params: []string{store.vault_id},
	})
	if err != nil {
		return MemoStats{}, err
	}
	for _, row := range projects_result.Results {
		project_id, value_err := d1_row_string(row, "project_id")
		if value_err != nil {
			return MemoStats{}, value_err
		}
		memo_count, value_err := d1_row_int(row, "memo_count")
		if value_err != nil {
			return MemoStats{}, value_err
		}
		if project_id == "" {
			stats.Unassigned = memo_count
		} else {
			stats.ProjectCounts[project_id] = memo_count
		}
	}
	return stats, nil
}

func (store *d1_memo_store) list_filter(query MemoListQuery) (string, []string, error) {
	where_parts := []string{"memo.vault_id = ?1", "memo.deleted_at = ''"}
	params := []string{store.vault_id}
	append_filter := func(sql_template string, value string) {
		params = append(params, value)
		where_parts = append(where_parts, fmt.Sprintf(sql_template, len(params)))
	}
	if query.Archived != nil {
		append_filter("memo.archived = ?%d", bool_to_d1(*query.Archived))
	}
	if query.Pinned != nil {
		append_filter("memo.pinned = ?%d", bool_to_d1(*query.Pinned))
	}
	if project_id := sanitizeProjectID(query.ProjectID); project_id != "" {
		append_filter("memo.project_id = ?%d", project_id)
	}
	if visibility := strings.ToUpper(strings.TrimSpace(query.Visibility)); visibility != "" {
		append_filter("memo.visibility = ?%d", visibility)
	}
	if tag := strings.TrimSpace(query.Tag); tag != "" {
		params = append(params, strings.ToLower(tag))
		where_parts = append(where_parts, fmt.Sprintf(`EXISTS (
			SELECT 1 FROM json_each(memo.tags_json) AS memo_tag
			WHERE lower(CAST(memo_tag.value AS TEXT)) = ?%d
		)`, len(params)))
	}
	return strings.Join(where_parts, " AND "), params, nil
}

func (store *d1_memo_store) upsert_memo(call_ctx context.Context, memo MemoRecord, sync_generation string) error {
	if err := store.ensure_schema(call_ctx); err != nil {
		return err
	}
	statement, err := store.memo_upsert_statement(memo, sync_generation)
	if err != nil {
		return err
	}
	_, err = store.client.query(call_ctx, statement)
	return err
}

func (store *d1_memo_store) delete_memo(call_ctx context.Context, memo_id string) error {
	if err := store.ensure_schema(call_ctx); err != nil {
		return err
	}
	statement, err := store.memo_delete_statement(memo_id)
	if err != nil {
		return err
	}
	_, err = store.client.query(call_ctx, statement)
	return err
}

func (store *d1_memo_store) memo_delete_statement(memo_id string) (d1_query_statement, error) {
	memo_id = strings.TrimSpace(memo_id)
	if memo_id == "" {
		return d1_query_statement{}, fmt.Errorf("memo id is required")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return d1_query_statement{
		SQL: `INSERT INTO threadnote_memos (
			vault_id, id, path, record_json, archived, pinned, private_flag,
			project_id, tags_json, visibility, sort_time, deleted_at,
			sync_generation, synced_at, revision
		) VALUES (?1, ?2, '', '{}', 0, 0, 0, '', '[]', 'PRIVATE', ?3, ?3, '', ?3, 1)
		ON CONFLICT(vault_id, id) DO UPDATE SET
			deleted_at = excluded.deleted_at,
			synced_at = excluded.synced_at,
			revision = threadnote_memos.revision + 1`,
		Params: []string{store.vault_id, memo_id, now},
	}, nil
}

func (store *d1_memo_store) sync_all(call_ctx context.Context, memos []MemoRecord, pending_delete_ids []string) (int, error) {
	if err := store.ensure_schema(call_ctx); err != nil {
		return 0, err
	}
	sync_generation := "sync_" + time.Now().UTC().Format("20060102T150405.000000000") + "_" + randomVaultSuffix()
	statements := make([]d1_query_statement, 0, d1_memo_sync_batch_size)
	flush := func() error {
		if len(statements) == 0 {
			return nil
		}
		if _, err := store.client.batch(call_ctx, statements); err != nil {
			return err
		}
		statements = statements[:0]
		return nil
	}
	for _, memo := range memos {
		statement, err := store.memo_upsert_statement(memo, sync_generation)
		if err != nil {
			return 0, err
		}
		statements = append(statements, statement)
		if len(statements) >= d1_memo_sync_batch_size {
			if err := flush(); err != nil {
				return 0, fmt.Errorf("sync Memo batch to D1: %w", err)
			}
		}
	}
	active_ids := map[string]bool{}
	for _, memo := range memos {
		active_ids[memo.ID] = true
	}
	for _, memo_id := range uniqueStrings(pending_delete_ids) {
		if active_ids[memo_id] {
			continue
		}
		statement, err := store.memo_delete_statement(memo_id)
		if err != nil {
			return 0, err
		}
		statements = append(statements, statement)
		if len(statements) >= d1_memo_sync_batch_size {
			if err := flush(); err != nil {
				return 0, fmt.Errorf("sync Memo deletions to D1: %w", err)
			}
		}
	}
	if err := flush(); err != nil {
		return 0, fmt.Errorf("sync Memo batch to D1: %w", err)
	}
	count_result, err := store.client.query(call_ctx, d1_query_statement{
		SQL:    "SELECT COUNT(*) AS memo_count FROM threadnote_memos WHERE vault_id = ?1 AND deleted_at = ''",
		Params: []string{store.vault_id},
	})
	if err != nil {
		return 0, fmt.Errorf("count synchronized D1 Memo records: %w", err)
	}
	if len(count_result.Results) == 0 {
		return 0, nil
	}
	return d1_row_int(count_result.Results[0], "memo_count")
}

func (store *d1_memo_store) memo_upsert_statement(memo MemoRecord, sync_generation string) (d1_query_statement, error) {
	if strings.TrimSpace(memo.ID) == "" {
		return d1_query_statement{}, fmt.Errorf("memo id is required")
	}
	record_json, err := json.Marshal(memo)
	if err != nil {
		return d1_query_statement{}, err
	}
	tags_json, err := json.Marshal(non_nil_strings(memo.Tags))
	if err != nil {
		return d1_query_statement{}, err
	}
	sort_time := memoSortTime(memo).UTC()
	if sort_time.IsZero() {
		sort_time = time.Now().UTC()
	}
	return d1_query_statement{
		SQL: d1_memo_upsert_sql,
		Params: []string{
			store.vault_id,
			memo.ID,
			memo.Path,
			string(record_json),
			bool_to_d1(memo.Archived),
			bool_to_d1(memo.Pinned),
			bool_to_d1(memo.Private),
			memo.ProjectID,
			string(tags_json),
			normalizeMemoVisibility(memo.Visibility),
			d1_sort_time_value(sort_time),
			sync_generation,
			time.Now().UTC().Format(time.RFC3339Nano),
		},
	}, nil
}

func decode_d1_memo_row(row map[string]json.RawMessage) (MemoRecord, error) {
	record_json, err := d1_row_string(row, "record_json")
	if err != nil {
		return MemoRecord{}, err
	}
	var memo MemoRecord
	if err := json.Unmarshal([]byte(record_json), &memo); err != nil {
		return MemoRecord{}, fmt.Errorf("decode D1 Memo record: %w", err)
	}
	if strings.TrimSpace(memo.ID) == "" {
		return MemoRecord{}, fmt.Errorf("D1 Memo record is missing an ID")
	}
	return memo, nil
}

func bool_to_d1(value bool) string {
	if value {
		return "1"
	}
	return "0"
}

func d1_sort_time_value(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

func configured_d1_memo_store(vault_ctx *VaultContext) (*d1_memo_store, bool, error) {
	if vault_ctx == nil {
		return nil, false, fmt.Errorf("vault context is required")
	}
	settings, err := configured_memo_storage_settings(vault_ctx)
	if err != nil {
		return nil, false, err
	}
	if settings.Provider != memo_storage_provider_d1 {
		return nil, false, nil
	}
	signature_raw, _ := json.Marshal(settings.D1)
	signature := string(signature_raw)
	vault_ctx.memo_storage_mutex.Lock()
	defer vault_ctx.memo_storage_mutex.Unlock()
	if vault_ctx.memo_storage_remote != nil && vault_ctx.memo_storage_signature == signature {
		return vault_ctx.memo_storage_remote, true, nil
	}
	remote_store, err := new_d1_memo_store(vault_ctx.Entry.ID, settings.D1, nil)
	if err != nil {
		return nil, false, err
	}
	vault_ctx.memo_storage_remote = remote_store
	vault_ctx.memo_storage_signature = signature
	return remote_store, true, nil
}

func invalidate_configured_d1_memo_store(vault_ctx *VaultContext) {
	if vault_ctx == nil {
		return
	}
	vault_ctx.memo_storage_mutex.Lock()
	vault_ctx.memo_storage_remote = nil
	vault_ctx.memo_storage_signature = ""
	vault_ctx.memo_storage_mutex.Unlock()
}

func mirror_memo_record_to_d1(vault_ctx *VaultContext, memo MemoRecord) {
	if vault_ctx == nil {
		return
	}
	vault_ctx.memo_storage_operation_mutex.Lock()
	defer vault_ctx.memo_storage_operation_mutex.Unlock()
	remote_store, enabled, err := configured_d1_memo_store(vault_ctx)
	if err != nil {
		mark_memo_storage_sync_failed(vault_ctx, err)
		return
	}
	if !enabled {
		return
	}
	call_ctx, cancel := context.WithTimeout(context.Background(), d1_request_timeout)
	defer cancel()
	if err := remote_store.upsert_memo(call_ctx, memo, ""); err != nil {
		mark_memo_storage_sync_failed(vault_ctx, err)
		return
	}
	mark_memo_storage_sync_succeeded(vault_ctx, nil, false)
}

func mirror_memo_delete_to_d1(vault_ctx *VaultContext, memo_id string) {
	if vault_ctx == nil {
		return
	}
	vault_ctx.memo_storage_operation_mutex.Lock()
	defer vault_ctx.memo_storage_operation_mutex.Unlock()
	remote_store, enabled, err := configured_d1_memo_store(vault_ctx)
	if err != nil {
		mark_memo_storage_sync_failed(vault_ctx, err)
		return
	}
	if !enabled {
		return
	}
	call_ctx, cancel := context.WithTimeout(context.Background(), d1_request_timeout)
	defer cancel()
	if err := remote_store.delete_memo(call_ctx, memo_id); err != nil {
		mark_memo_storage_delete_failed(vault_ctx, memo_id, err)
		return
	}
	remove_pending_memo_storage_delete(vault_ctx, memo_id)
	mark_memo_storage_sync_succeeded(vault_ctx, nil, false)
}

func new_mirrored_d1_memo_query_store(vault_ctx *VaultContext, remote_store *d1_memo_store) (*mirrored_d1_memo_query_store, error) {
	local_store, err := new_sqlite_memo_query_store(vault_ctx)
	if err != nil {
		return nil, err
	}
	return wrap_mirrored_d1_memo_query_store(vault_ctx, remote_store, local_store), nil
}

func wrap_mirrored_d1_memo_query_store(vault_ctx *VaultContext, remote_store *d1_memo_store, local_store *sqlite_memo_query_store) *mirrored_d1_memo_query_store {
	return &mirrored_d1_memo_query_store{
		local_store:  local_store,
		remote_store: remote_store,
		vault_ctx:    vault_ctx,
	}
}

func (store *mirrored_d1_memo_query_store) Get(call_ctx context.Context, memo_id string) (MemoRecord, error) {
	if !load_memo_storage_sync_state(store.vault_ctx).Dirty {
		memo, err := store.remote_store.Get(call_ctx, memo_id)
		if err == nil {
			store.cache_remote_memos([]MemoRecord{memo})
			return memo, nil
		}
		if errors.Is(err, err_d1_memo_not_found) {
			return MemoRecord{}, err
		}
		record_memo_storage_read_error(store.vault_ctx, err)
	}
	return store.local_store.Get(call_ctx, memo_id)
}

func (store *mirrored_d1_memo_query_store) List(call_ctx context.Context, query MemoListQuery) (MemoPage, error) {
	if query.Limit < 0 {
		return MemoPage{}, fmt.Errorf("memo limit must be non-negative")
	}
	if strings.TrimSpace(query.Cursor) != "" {
		if _, err := decode_memo_cursor(query.Cursor); err != nil {
			return MemoPage{}, err
		}
	}
	if !load_memo_storage_sync_state(store.vault_ctx).Dirty {
		page, err := store.remote_store.List(call_ctx, query)
		if err == nil {
			store.cache_remote_memos(page.Memos)
			return page, nil
		}
		record_memo_storage_read_error(store.vault_ctx, err)
	}
	return store.local_store.List(call_ctx, query)
}

func (store *mirrored_d1_memo_query_store) Stats(call_ctx context.Context) (MemoStats, error) {
	var stats MemoStats
	var err error
	used_remote := false
	if !load_memo_storage_sync_state(store.vault_ctx).Dirty {
		stats, err = store.remote_store.Stats(call_ctx)
		if err == nil {
			used_remote = true
		} else {
			record_memo_storage_read_error(store.vault_ctx, err)
		}
	}
	if !used_remote {
		// The local sqlite index always mirrors every memo, and it is the only
		// store that can extract content resource counts, so prefer it.
		return store.local_store.Stats(call_ctx)
	}
	if err := store.local_store.fill_content_stats(call_ctx, &stats); err != nil {
		return MemoStats{}, err
	}
	return stats, nil
}

func (store *mirrored_d1_memo_query_store) upsert_memo(call_ctx context.Context, memo MemoRecord) error {
	return store.local_store.upsert_memo(call_ctx, memo)
}

func (store *mirrored_d1_memo_query_store) delete_memo(call_ctx context.Context, memo_id string) error {
	return store.local_store.delete_memo(call_ctx, memo_id)
}

func (store *mirrored_d1_memo_query_store) mark_dirty() {
	store.local_store.mark_dirty()
}

func (store *mirrored_d1_memo_query_store) close() error {
	return store.local_store.close()
}

func (store *mirrored_d1_memo_query_store) cache_remote_memos(memos []MemoRecord) {
	for _, memo := range memos {
		if err := cache_remote_memo_record(store.vault_ctx, store.local_store, memo); err != nil && store.vault_ctx.logger != nil {
			store.vault_ctx.logger.Warn().Err(err).
				Str("component", "memo_storage").
				Str("memoId", memo.ID).
				Msg("failed to refresh local Markdown cache from D1")
		}
	}
}

// The local index is authoritative for extracted resource listings, both in
// pure sqlite mode and when D1 mirroring is enabled.
func (store *mirrored_d1_memo_query_store) ListReferences(call_ctx context.Context, query MemoResourceQuery) (MemoResourcePage, error) {
	return store.local_store.ListReferences(call_ctx, query)
}

func (store *mirrored_d1_memo_query_store) ListCodeBlocks(call_ctx context.Context, query MemoResourceQuery) (MemoResourcePage, error) {
	return store.local_store.ListCodeBlocks(call_ctx, query)
}
