package service

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

type read_counting_vault_fs struct {
	vault_fs
	memo_read_count int
}

func (counting_fs *read_counting_vault_fs) read_file(path string) ([]byte, error) {
	relative_path := filepath.ToSlash(path)
	if strings.HasPrefix(relative_path, vaultMemoDirName+"/") && strings.EqualFold(filepath.Ext(path), ".md") {
		counting_fs.memo_read_count++
	}
	return counting_fs.vault_fs.read_file(path)
}

func TestVaultMemoQueryStoreSupportsPagingFilteringAndStats(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}

	public_memo := create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "latest #work")
	private_memo := create_test_memo(t, vault_ctx, "2026-08-03T10:00:00Z", "PRIVATE", true, "private")
	protected_memo := create_test_memo(t, vault_ctx, "2026-08-02T10:00:00Z", "PROTECTED", false, "workspace #work")
	archived_memo := create_test_memo(t, vault_ctx, "2026-08-01T10:00:00Z", "PRIVATE", false, "archived")

	pinned := true
	if _, err := updateVaultMemo(vault_ctx, MemoUpdateRequest{ID: private_memo.ID, Pinned: &pinned}); err != nil {
		t.Fatalf("pin memo: %v", err)
	}
	archived := true
	if _, err := updateVaultMemo(vault_ctx, MemoUpdateRequest{Archived: &archived, ID: archived_memo.ID}); err != nil {
		t.Fatalf("archive memo: %v", err)
	}

	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	active := false
	first_page, err := query_store.List(context.Background(), MemoListQuery{
		Archived: &active,
		Limit:    2,
	})
	if err != nil {
		t.Fatalf("list first page: %v", err)
	}
	if first_page.Total != 3 || !first_page.HasMore || first_page.NextCursor == "" {
		t.Fatalf("first page metadata = %#v", first_page)
	}
	if len(first_page.Memos) != 2 || first_page.Memos[0].ID != public_memo.ID || first_page.Memos[1].ID != private_memo.ID {
		t.Fatalf("first page memos = %#v", first_page.Memos)
	}

	second_page, err := query_store.List(context.Background(), MemoListQuery{
		Archived: &active,
		Cursor:   first_page.NextCursor,
		Limit:    2,
	})
	if err != nil {
		t.Fatalf("list second page: %v", err)
	}
	if second_page.HasMore || second_page.NextCursor != "" || len(second_page.Memos) != 1 || second_page.Memos[0].ID != protected_memo.ID {
		t.Fatalf("second page = %#v", second_page)
	}

	tag_page, err := query_store.List(context.Background(), MemoListQuery{Tag: "work"})
	if err != nil {
		t.Fatalf("filter by tag: %v", err)
	}
	if tag_page.Total != 2 {
		t.Fatalf("tag total = %d, want 2", tag_page.Total)
	}

	stats, err := query_store.Stats(context.Background())
	if err != nil {
		t.Fatalf("load stats: %v", err)
	}
	if stats.Total != 4 || stats.Active != 3 || stats.Archived != 1 || stats.Pinned != 1 {
		t.Fatalf("stats totals = %#v", stats)
	}
	if stats.Public != 1 || stats.Private != 1 || stats.Protected != 1 || stats.Secret != 1 {
		t.Fatalf("stats visibility = %#v", stats)
	}

	loaded_memo, err := query_store.Get(context.Background(), public_memo.ID)
	if err != nil {
		t.Fatalf("get memo: %v", err)
	}
	if loaded_memo.ID != public_memo.ID || loaded_memo.Content != public_memo.Content {
		t.Fatalf("loaded memo = %#v", loaded_memo)
	}
}

func TestVaultMemoQueryStoreRejectsInvalidCursor(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	if _, err := query_store.List(context.Background(), MemoListQuery{Cursor: "invalid", Limit: 10}); err == nil {
		t.Fatalf("invalid cursor should fail")
	}
}

func TestVaultMemoQueryStoreMaintainsIndexForApplicationMutations(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	if _, err := query_store.List(context.Background(), MemoListQuery{}); err != nil {
		t.Fatalf("initialize query store: %v", err)
	}

	memo := create_test_memo(t, vault_ctx, "2026-08-05T10:00:00Z", "PUBLIC", false, "created #first")
	loaded_memo, err := query_store.Get(context.Background(), memo.ID)
	if err != nil {
		t.Fatalf("get created memo: %v", err)
	}
	if loaded_memo.Content != memo.Content {
		t.Fatalf("created memo content = %q, want %q", loaded_memo.Content, memo.Content)
	}

	updated_content := "updated #second"
	updated_memo, err := updateVaultMemo(vault_ctx, MemoUpdateRequest{Content: &updated_content, ID: memo.ID})
	if err != nil {
		t.Fatalf("update memo: %v", err)
	}
	loaded_memo, err = query_store.Get(context.Background(), memo.ID)
	if err != nil {
		t.Fatalf("get updated memo: %v", err)
	}
	if loaded_memo.Content != updated_memo.Content || len(loaded_memo.Tags) != 1 || loaded_memo.Tags[0] != "second" {
		t.Fatalf("updated memo = %#v", loaded_memo)
	}

	if err := deleteVaultMemo(vault_ctx, memo.ID); err != nil {
		t.Fatalf("delete memo: %v", err)
	}
	if _, err := query_store.Get(context.Background(), memo.ID); err == nil {
		t.Fatal("deleted memo should not remain in index")
	}
}

func TestVaultMemoQueryStoreOnlyReadsChangedMarkdownFiles(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	first_memo := create_test_memo(t, vault_ctx, "2026-08-05T10:00:00Z", "PUBLIC", false, "first")
	create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "second")

	counting_fs := &read_counting_vault_fs{vault_fs: vault_ctx.fs}
	vault_ctx.fs = counting_fs
	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	if _, ok := query_store.(*sqlite_memo_query_store); !ok {
		t.Fatalf("query store = %T, want SQLite", query_store)
	}
	if _, err := query_store.List(context.Background(), MemoListQuery{}); err != nil {
		t.Fatalf("build index: %v", err)
	}
	if counting_fs.memo_read_count != 2 {
		t.Fatalf("initial memo reads = %d, want 2", counting_fs.memo_read_count)
	}
	if _, err := os.Stat(filepath.Join(vault_ctx.VeloDir, memo_index_file_name)); err != nil {
		t.Fatalf("memo index file: %v", err)
	}

	mark_cached_memo_query_index_dirty(vault_ctx)
	if _, err := query_store.List(context.Background(), MemoListQuery{}); err != nil {
		t.Fatalf("rescan unchanged index: %v", err)
	}
	if counting_fs.memo_read_count != 2 {
		t.Fatalf("unchanged rescan read %d memo files, want 2 total", counting_fs.memo_read_count)
	}

	first_memo.Content = "externally changed content"
	if err := counting_fs.vault_fs.write_file_atomic(first_memo.Path, []byte(renderMemoMarkdownFile(first_memo)), 0644); err != nil {
		t.Fatalf("write external memo change: %v", err)
	}
	mark_cached_memo_query_index_dirty(vault_ctx)
	loaded_memo, err := query_store.Get(context.Background(), first_memo.ID)
	if err != nil {
		t.Fatalf("load externally changed memo: %v", err)
	}
	if loaded_memo.Content != first_memo.Content || counting_fs.memo_read_count != 3 {
		t.Fatalf("changed memo = %#v, reads = %d", loaded_memo, counting_fs.memo_read_count)
	}

	if err := counting_fs.vault_fs.remove_file(first_memo.Path); err != nil {
		t.Fatalf("remove external memo: %v", err)
	}
	mark_cached_memo_query_index_dirty(vault_ctx)
	if _, err := query_store.Get(context.Background(), first_memo.ID); err == nil {
		t.Fatal("externally removed memo should be deleted from index")
	}
}

func TestVaultMemoQueryStoreRebuildsCorruptDatabase(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	create_test_memo(t, vault_ctx, "2026-08-05T10:00:00Z", "PUBLIC", false, "survives rebuild")
	index_path := filepath.Join(vault_ctx.VeloDir, memo_index_file_name)
	if err := os.WriteFile(index_path, []byte("not a sqlite database"), 0600); err != nil {
		t.Fatalf("write corrupt index: %v", err)
	}

	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("rebuild query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	page, err := query_store.List(context.Background(), MemoListQuery{})
	if err != nil {
		t.Fatalf("list rebuilt index: %v", err)
	}
	if page.Total != 1 || len(page.Memos) != 1 || page.Memos[0].Content != "survives rebuild" {
		t.Fatalf("rebuilt page = %#v", page)
	}
}

func TestVaultMemoQueryStoreSelectsCanonicalFileForDuplicateID(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	var log_output bytes.Buffer
	logger := zerolog.New(&log_output)
	vault_ctx.logger = &logger
	canonical_memo := create_test_memo(t, vault_ctx, "2026-08-05T10:00:00Z", "PUBLIC", false, "canonical content")
	conflict_memo := canonical_memo
	conflict_memo.Content = "conflict content"
	conflict_memo.Path = strings.TrimSuffix(canonical_memo.Path, ".md") + "_Device_Conflict.md"
	if err := vault_ctx.fs.write_file_atomic(conflict_memo.Path, []byte(renderMemoMarkdownFile(conflict_memo)), 0644); err != nil {
		t.Fatalf("write conflict memo: %v", err)
	}

	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	page, err := query_store.List(context.Background(), MemoListQuery{})
	if err != nil {
		t.Fatalf("list duplicate memo id: %v", err)
	}
	if page.Total != 1 || len(page.Memos) != 1 || page.Memos[0].Path != canonical_memo.Path {
		t.Fatalf("duplicate page = %#v", page)
	}
	if !strings.Contains(log_output.String(), "duplicate memo id; indexed preferred file") ||
		!strings.Contains(log_output.String(), conflict_memo.Path) {
		t.Fatalf("duplicate warning log = %q", log_output.String())
	}

	sqlite_store := query_store.(*sqlite_memo_query_store)
	var indexed_file_count int
	if err := sqlite_store.database.QueryRow("SELECT COUNT(*) FROM memo_index_files").Scan(&indexed_file_count); err != nil {
		t.Fatalf("count indexed files: %v", err)
	}
	if indexed_file_count != 2 {
		t.Fatalf("indexed file count = %d, want 2", indexed_file_count)
	}

	if err := vault_ctx.fs.remove_file(canonical_memo.Path); err != nil {
		t.Fatalf("remove canonical memo: %v", err)
	}
	mark_cached_memo_query_index_dirty(vault_ctx)
	promoted_memo, err := query_store.Get(context.Background(), canonical_memo.ID)
	if err != nil {
		t.Fatalf("promote conflict memo: %v", err)
	}
	if promoted_memo.Path != conflict_memo.Path || promoted_memo.Content != conflict_memo.Content {
		t.Fatalf("promoted memo = %#v", promoted_memo)
	}
}

func TestMemoListQueryFromContextNormalizesPublicContract(t *testing.T) {
	box_ctx := &velo.BoxContext{}
	box_ctx.SetQuery(map[string]string{
		"archived":   "false",
		"cursor":     "opaque",
		"limit":      "500",
		"pinned":     "true",
		"projectId":  " project-one ",
		"tag":        " work ",
		"visibility": "protected",
	})
	query, err := memo_list_query_from_context(box_ctx)
	if err != nil {
		t.Fatalf("parse query: %v", err)
	}
	if query.Archived == nil || *query.Archived || query.Pinned == nil || !*query.Pinned {
		t.Fatalf("boolean query = %#v", query)
	}
	if query.Limit != memo_page_limit_max || query.Cursor != "opaque" {
		t.Fatalf("page query = %#v", query)
	}
	if query.ProjectID != "project-one" || query.Tag != "work" || query.Visibility != "PROTECTED" {
		t.Fatalf("filter query = %#v", query)
	}
}

func create_test_memo(t *testing.T, vault_ctx *VaultContext, created_at string, visibility string, private bool, content string) MemoRecord {
	t.Helper()
	memo, err := createVaultMemo(vault_ctx, MemoCreateRequest{
		Content:    content,
		CreatedAt:  created_at,
		Private:    private,
		Visibility: visibility,
	})
	if err != nil {
		t.Fatalf("create memo: %v", err)
	}
	return memo
}
