package service

import (
	"context"
	"testing"
)

func new_resource_query_store(t *testing.T, vault_ctx *VaultContext) memo_resource_list_store {
	t.Helper()
	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create query store: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	resource_store, ok := query_store.(memo_resource_list_store)
	if !ok {
		t.Fatalf("query store %T does not support resource queries", query_store)
	}
	return resource_store
}

func TestMemoIndexResourcesListAndStats(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	project, err := createVaultProject(vault_ctx, ProjectCreateRequest{Name: "Resource project"})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	newer := create_test_memo(t, vault_ctx, "2026-08-05T10:00:00Z", "PUBLIC", false, "# newer\n![pic](@assets/local/a.png) [doc](local://d/report.pdf) https://example.com/page\n```js snippet: helper\nlet x = 1;\n```\nplain ```block```\n- [ ] todo")
	if _, err := updateVaultMemo(vault_ctx, MemoUpdateRequest{ID: newer.ID, ProjectID: &project.ID}); err != nil {
		t.Fatalf("assign project: %v", err)
	}
	older := create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PRIVATE", false, "older see https://older.example.com and https://older.example.com/img.jpg")

	comment, err := createVaultMemoComment(vault_ctx, MemoCommentCreateRequest{
		Content:    "comment with ![cpic](https://cdn.example.com/c.png) and `skip https://masked.example.com`",
		MemoID:     older.ID,
		Visibility: "PRIVATE",
	})
	if err != nil {
		t.Fatalf("create comment: %v", err)
	}

	resource_store := new_resource_query_store(t, vault_ctx)
	store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatalf("create stats store: %v", err)
	}

	images_page, err := resource_store.ListReferences(context.Background(), MemoResourceQuery{Type: "image"})
	if err != nil {
		t.Fatalf("list images: %v", err)
	}
	if images_page.Total != 3 {
		t.Fatalf("image total = %d, want 3, page = %#v", images_page.Total, images_page)
	}
	// The comment was created "now", so its image sorts before the older memos.
	if images_page.References[0].SourceType != "comment" || images_page.References[0].SourceCommentID != comment.ID {
		t.Fatalf("first image = %#v, want comment image first", images_page.References[0])
	}

	links_page, err := resource_store.ListReferences(context.Background(), MemoResourceQuery{Type: "link"})
	if err != nil {
		t.Fatalf("list links: %v", err)
	}
	if links_page.Total != 2 {
		t.Fatalf("link total = %d, want 1, page = %#v", links_page.Total, links_page)
	}

	files_page, err := resource_store.ListReferences(context.Background(), MemoResourceQuery{Type: "file"})
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if files_page.Total != 1 {
		t.Fatalf("file total = %d, want 1", files_page.Total)
	}

	project_images, err := resource_store.ListReferences(context.Background(), MemoResourceQuery{Type: "image", ProjectID: project.ID})
	if err != nil {
		t.Fatalf("list project images: %v", err)
	}
	if project_images.Total != 1 {
		t.Fatalf("project image total = %d, want 1", project_images.Total)
	}

	blocks_page, err := resource_store.ListCodeBlocks(context.Background(), MemoResourceQuery{})
	if err != nil {
		t.Fatalf("list code blocks: %v", err)
	}
	if blocks_page.Total != 1 || len(blocks_page.CodeBlocks) != 1 {
		t.Fatalf("code block total = %d, want 1", blocks_page.Total)
	}
	if !blocks_page.CodeBlocks[0].Marked || blocks_page.CodeBlocks[0].Language != "js" {
		t.Fatalf("code block = %#v, want marked js block", blocks_page.CodeBlocks[0])
	}

	marked_page, err := resource_store.ListCodeBlocks(context.Background(), MemoResourceQuery{MarkedOnly: true})
	if err != nil {
		t.Fatalf("list marked blocks: %v", err)
	}
	if marked_page.Total != 1 {
		t.Fatalf("marked total = %d, want 1", marked_page.Total)
	}

	stats, err := store.Stats(context.Background())
	if err != nil {
		t.Fatalf("read stats: %v", err)
	}
	if stats.ContentCounts.Images != images_page.Total ||
		stats.ContentCounts.Files != files_page.Total ||
		stats.ContentCounts.Links != links_page.Total ||
		stats.ContentCounts.CodeBlocks != blocks_page.Total ||
		stats.ContentCounts.CodeSnippets != marked_page.Total {
		t.Fatalf("stats counts %#v do not match list totals", stats.ContentCounts)
	}
	if stats.ContentCounts.OpenTodos != 1 {
		t.Fatalf("open todos = %d, want 1", stats.ContentCounts.OpenTodos)
	}

	// Editing the comment updates the extraction rows on the next sync.
	if _, err := updateVaultMemoComment(vault_ctx, MemoCommentUpdateRequest{
		ID:      comment.ID,
		Content: string_ptr("no resources anymore"),
	}); err != nil {
		t.Fatalf("update comment: %v", err)
	}
	mark_cached_memo_query_index_dirty(vault_ctx)
	images_after, err := resource_store.ListReferences(context.Background(), MemoResourceQuery{Type: "image"})
	if err != nil {
		t.Fatalf("list images after comment edit: %v", err)
	}
	if images_after.Total != 2 {
		t.Fatalf("image total after edit = %d, want 2", images_after.Total)
	}
}

func string_ptr(value string) *string {
	return &value
}
