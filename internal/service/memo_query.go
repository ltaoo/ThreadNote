package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// MemoListQuery is the storage-independent query contract used by API and
// capability adapters. A zero Limit keeps the legacy unbounded list behavior.
type MemoListQuery struct {
	Archived   *bool
	Cursor     string
	Limit      int
	Pinned     *bool
	ProjectID  string
	Tag        string
	Visibility string
}

type MemoPage struct {
	HasMore    bool         `json:"hasMore"`
	Memos      []MemoRecord `json:"memos"`
	NextCursor string       `json:"nextCursor"`
	Total      int          `json:"total"`
}

type MemoStats struct {
	Active    int `json:"active"`
	Archived  int `json:"archived"`
	Pinned    int `json:"pinned"`
	Private   int `json:"private"`
	Protected int `json:"protected"`
	Public    int `json:"public"`
	Secret    int `json:"secret"`
	Total     int `json:"total"`
}

// MemoQueryStore is the read-side port for memo storage. Implementations may
// query local Markdown, D2, SQLite, or a composite object-store/index backend.
type MemoQueryStore interface {
	Get(context.Context, string) (MemoRecord, error)
	List(context.Context, MemoListQuery) (MemoPage, error)
	Stats(context.Context) (MemoStats, error)
}

type memo_query_store_mutator interface {
	MemoQueryStore
	close() error
	delete_memo(context.Context, string) error
	mark_dirty()
	upsert_memo(context.Context, MemoRecord) error
}

type memo_page_cursor struct {
	ID       string `json:"id"`
	SortTime string `json:"sortTime"`
}

func new_vault_memo_query_store(vault_ctx *VaultContext) (MemoQueryStore, error) {
	if vault_ctx == nil {
		return nil, fmt.Errorf("vault context is required")
	}
	vault_ctx.memo_query_mutex.Lock()
	defer vault_ctx.memo_query_mutex.Unlock()
	if vault_ctx.memo_query_store != nil {
		return vault_ctx.memo_query_store, nil
	}
	query_store, err := new_sqlite_memo_query_store(vault_ctx)
	if err != nil {
		return nil, err
	}
	vault_ctx.memo_query_store = query_store
	return query_store, nil
}

func cached_memo_query_store(vault_ctx *VaultContext) memo_query_store_mutator {
	if vault_ctx == nil {
		return nil
	}
	vault_ctx.memo_query_mutex.Lock()
	defer vault_ctx.memo_query_mutex.Unlock()
	query_store, _ := vault_ctx.memo_query_store.(memo_query_store_mutator)
	return query_store
}

func upsert_cached_memo_query_index(vault_ctx *VaultContext, memo MemoRecord) {
	query_store := cached_memo_query_store(vault_ctx)
	if query_store == nil {
		return
	}
	if err := query_store.upsert_memo(context.Background(), memo); err != nil {
		discard_cached_memo_query_store(vault_ctx, query_store)
	}
}

func delete_cached_memo_query_index(vault_ctx *VaultContext, memo_id string) {
	query_store := cached_memo_query_store(vault_ctx)
	if query_store == nil {
		return
	}
	if err := query_store.delete_memo(context.Background(), memo_id); err != nil {
		discard_cached_memo_query_store(vault_ctx, query_store)
	}
}

func mark_cached_memo_query_index_dirty(vault_ctx *VaultContext) {
	if query_store := cached_memo_query_store(vault_ctx); query_store != nil {
		query_store.mark_dirty()
	}
}

func discard_cached_memo_query_store(vault_ctx *VaultContext, query_store memo_query_store_mutator) {
	if vault_ctx == nil || query_store == nil {
		return
	}
	vault_ctx.memo_query_mutex.Lock()
	if vault_ctx.memo_query_store == query_store {
		vault_ctx.memo_query_store = nil
	}
	vault_ctx.memo_query_mutex.Unlock()
	_ = query_store.close()
}

func close_cached_memo_query_store(vault_ctx *VaultContext) {
	if vault_ctx == nil {
		return
	}
	vault_ctx.memo_query_mutex.Lock()
	query_store, _ := vault_ctx.memo_query_store.(memo_query_store_mutator)
	vault_ctx.memo_query_store = nil
	vault_ctx.memo_query_mutex.Unlock()
	if query_store != nil {
		_ = query_store.close()
	}
}

func encode_memo_cursor(memo MemoRecord) (string, error) {
	cursor := memo_page_cursor{
		ID:       memo.ID,
		SortTime: memoSortTime(memo).UTC().Format(time.RFC3339Nano),
	}
	raw_cursor, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw_cursor), nil
}

func decode_memo_cursor(value string) (memo_page_cursor, error) {
	raw_cursor, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return memo_page_cursor{}, fmt.Errorf("invalid memo cursor")
	}
	var cursor memo_page_cursor
	if err := json.Unmarshal(raw_cursor, &cursor); err != nil {
		return memo_page_cursor{}, fmt.Errorf("invalid memo cursor")
	}
	if strings.TrimSpace(cursor.ID) == "" || parseMemoTime(cursor.SortTime).IsZero() {
		return memo_page_cursor{}, fmt.Errorf("invalid memo cursor")
	}
	return cursor, nil
}
