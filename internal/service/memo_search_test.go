package service

import (
	"context"
	"os"
	"strings"
	"testing"

	"example/simple/internal/search"
)

func test_memo(content string) MemoRecord {
	return MemoRecord{
		ID:         "m1",
		Content:    content,
		CreatedAt:  "2026-01-02T03:04:05Z",
		UpdatedAt:  "2026-02-03T04:05:06Z",
		Tags:       []string{"work"},
		ProjectID:  "p1",
		Visibility: "private",
	}
}

func documents_of_kind(documents []search.Document, kind search.Kind) []search.Document {
	matched := []search.Document{}
	for _, document := range documents {
		if document.Kind == kind {
			matched = append(matched, document)
		}
	}
	return matched
}

func TestSearchMemoDocumentsMixedContent(t *testing.T) {
	memo := test_memo("项目计划\n\n- [ ] 写文档\n- [x] 写测试")
	documents := search_memo_documents(memo)

	if len(documents) != 3 {
		t.Fatalf("expected 3 documents, got %d: %#v", len(documents), documents)
	}
	memos := documents_of_kind(documents, search.KindMemo)
	if len(memos) != 1 {
		t.Fatalf("expected 1 memo document, got %d", len(memos))
	}
	if memos[0].ID != "memo:m1" {
		t.Fatalf("unexpected memo id %q", memos[0].ID)
	}
	if memos[0].Title != "项目计划" {
		t.Fatalf("unexpected memo title %q", memos[0].Title)
	}
	if memos[0].Content != memo.Content {
		t.Fatalf("memo content was not preserved")
	}
	if memos[0].ProjectID != "p1" || memos[0].Visibility != "private" {
		t.Fatalf("memo did not inherit its filters: %#v", memos[0])
	}

	todos := documents_of_kind(documents, search.KindTodo)
	if len(todos) != 2 {
		t.Fatalf("expected 2 todo documents, got %d", len(todos))
	}
	if todos[0].ID != "todo:memo:m1:2" || todos[0].TodoID != "memo:m1:2" {
		t.Fatalf("unexpected first todo id %q / %q", todos[0].ID, todos[0].TodoID)
	}
	if todos[0].Content != "写文档" || todos[0].Checked {
		t.Fatalf("unexpected first todo %#v", todos[0])
	}
	if todos[1].Content != "写测试" || !todos[1].Checked {
		t.Fatalf("unexpected second todo %#v", todos[1])
	}
	// Task lines are not plain lines, so the nearest preceding plain line is
	// the memo's first line for both todos.
	if todos[0].SourceText != "项目计划" || todos[1].SourceText != "项目计划" {
		t.Fatalf("unexpected source text %q / %q", todos[0].SourceText, todos[1].SourceText)
	}
	if todos[0].Title != "项目计划" {
		t.Fatalf("todo did not inherit the parent title: %q", todos[0].Title)
	}
}

func TestSearchMemoDocumentsTaskOnlyOmitsMemoDocument(t *testing.T) {
	documents := search_memo_documents(test_memo("- [ ] 只有任务\n- [x] 另一件"))

	if len(documents) != 2 {
		t.Fatalf("expected 2 documents, got %d: %#v", len(documents), documents)
	}
	if memos := documents_of_kind(documents, search.KindMemo); len(memos) != 0 {
		t.Fatalf("task-only memo must not produce a memo document: %#v", memos)
	}
	todos := documents_of_kind(documents, search.KindTodo)
	if len(todos) != 2 {
		t.Fatalf("expected 2 todo documents, got %d", len(todos))
	}
	if todos[0].SourceText != search_task_only_source_text {
		t.Fatalf("expected placeholder source text, got %q", todos[0].SourceText)
	}
}

func TestSearchMemoDocumentsIgnoresTasksInCodeFences(t *testing.T) {
	memo := test_memo("说明\n\n```\n- [ ] 示例\n```\n\n- [ ] 真实")
	documents := search_memo_documents(memo)

	todos := documents_of_kind(documents, search.KindTodo)
	if len(todos) != 1 {
		t.Fatalf("expected 1 todo document, got %d: %#v", len(todos), todos)
	}
	if todos[0].Content != "真实" {
		t.Fatalf("unexpected todo content %q", todos[0].Content)
	}
	if todos[0].LineIndex != 6 {
		t.Fatalf("unexpected line index %d", todos[0].LineIndex)
	}
	if len(documents_of_kind(documents, search.KindMemo)) != 1 {
		t.Fatal("expected the memo document alongside the todo")
	}
}

func TestSearchMemoDocumentsFencedCodeIsNotTaskOnly(t *testing.T) {
	documents := search_memo_documents(test_memo("```\n- [ ] 示例\n```"))

	if len(documents) != 1 {
		t.Fatalf("expected only the memo document, got %d: %#v", len(documents), documents)
	}
	if documents[0].Kind != search.KindMemo {
		t.Fatalf("unexpected document kind %q", documents[0].Kind)
	}
}

func TestSearchMemoDocumentsEmptyContent(t *testing.T) {
	documents := search_memo_documents(test_memo("   "))
	if len(documents) != 1 || documents[0].Kind != search.KindMemo {
		t.Fatalf("expected a single memo document, got %#v", documents)
	}
	if documents[0].Title != "" {
		t.Fatalf("expected an empty title, got %q", documents[0].Title)
	}
}

func TestSearchMemoTitleStripsMarkdown(t *testing.T) {
	// These mirror the frontend's stripMemoTitleMarkdown so a search result
	// title reads the same as the feed's.
	cases := map[string]string{
		"# 我的标题\n正文":       "我的标题",
		"## 二级 *强调*":       "二级 强调",
		"> 引用行":            "引用行",
		"1. 有序项":           "1. 有序项",
		"[[目标|显示名]] 后面":    "显示名 后面",
		"[[直接目标]] 后面":      "直接目标 后面",
		"\n\n- [ ] 任务\n正文": "[ ] 任务",
		"`code` 与 _下划线_":  "code 与 下划线",
	}
	for content, want := range cases {
		if got := search_memo_title(content); got != want {
			t.Errorf("search_memo_title(%q) = %q, want %q", content, got, want)
		}
	}
}

func TestSearchMemoTitleTruncates(t *testing.T) {
	title := search_memo_title(strings.Repeat("标", 60))
	runes := []rune(title)
	if len(runes) != search_title_max_len+2 {
		t.Fatalf("expected %d runes, got %d (%q)", search_title_max_len+2, len(runes), title)
	}
	if !strings.HasSuffix(title, "...") {
		t.Fatalf("expected an ellipsis suffix, got %q", title)
	}
}

func TestSearchMemoSourceTextTruncates(t *testing.T) {
	memo := test_memo(strings.Repeat("长", 120) + "\n\n- [ ] 任务")
	todos := documents_of_kind(search_memo_documents(memo), search.KindTodo)
	if len(todos) != 1 {
		t.Fatalf("expected 1 todo document, got %d", len(todos))
	}
	runes := []rune(todos[0].SourceText)
	if len(runes) != search_source_text_max_len+2 {
		t.Fatalf("expected %d runes, got %d", search_source_text_max_len+2, len(runes))
	}
}

func TestSearchCommentDocumentsInheritParent(t *testing.T) {
	parent := test_memo("父 memo 标题")
	parent.Archived = true
	parent.Pinned = true
	parent.Tags = []string{"parent-tag"}
	comment := MemoCommentRecord{
		ID:        "c1",
		MemoID:    "m1",
		Content:   "评论说明\n- [ ] 评论任务",
		CreatedAt: "2026-03-04T05:06:07Z",
		UpdatedAt: "2026-03-05T06:07:08Z",
		Private:   true,
	}
	documents := search_comment_documents(comment, parent)

	if len(documents) != 2 {
		t.Fatalf("expected 2 documents, got %d: %#v", len(documents), documents)
	}
	comments := documents_of_kind(documents, search.KindComment)
	if len(comments) != 1 {
		t.Fatalf("expected 1 comment document, got %d", len(comments))
	}
	source := comments[0]
	if source.ID != "comment:c1" || source.CommentID != "c1" || source.MemoID != "m1" {
		t.Fatalf("unexpected comment identity %#v", source)
	}
	if source.Title != "父 memo 标题" {
		t.Fatalf("comment did not inherit the parent title: %q", source.Title)
	}
	if source.Content != comment.Content {
		t.Fatal("comment content was not preserved")
	}
	if !source.Archived || !source.Pinned {
		t.Fatal("comment did not inherit parent archived/pinned")
	}
	if !source.Private {
		t.Fatal("comment private flag was not propagated")
	}
	if len(source.Tags) != 1 || source.Tags[0] != "parent-tag" {
		t.Fatalf("comment did not inherit parent tags: %#v", source.Tags)
	}
	if source.ProjectID != "p1" {
		t.Fatalf("comment did not inherit the parent project: %q", source.ProjectID)
	}

	todos := documents_of_kind(documents, search.KindTodo)
	if len(todos) != 1 {
		t.Fatalf("expected 1 todo document, got %d", len(todos))
	}
	todo := todos[0]
	if todo.ID != "todo:comment:c1:1" || todo.TodoID != "comment:c1:1" {
		t.Fatalf("unexpected todo identity %q / %q", todo.ID, todo.TodoID)
	}
	if todo.SourceType != "comment" || todo.SourceCommentID != "c1" {
		t.Fatalf("todo did not record its comment source: %#v", todo)
	}
	if todo.MemoID != "m1" || !todo.Private {
		t.Fatalf("todo did not inherit the parent memo: %#v", todo)
	}
}

// newSearchTestVault opens an empty vault whose search index has never been
// built, which is the state every vault starts in.
func newSearchTestVault(t *testing.T) *VaultContext {
	t.Helper()
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	t.Cleanup(func() { close_cached_memo_query_store(vault_ctx) })
	return vault_ctx
}

func searchTestHits(t *testing.T, vault_ctx *VaultContext, query string) []search.Hit {
	t.Helper()
	results, err := search_vault(vault_ctx, search.SearchRequest{Query: query, Limit: 20})
	if err != nil {
		t.Fatalf("search %q: %v", query, err)
	}
	return results.Hits
}

// The index is built when a vault is opened or rebuilt in settings, never by a
// query. A query against an unbuilt index returns nothing rather than turning
// into a full vault walk.
func TestSearchIndexIsBuiltOnOpenAndRebuildOnly(t *testing.T) {
	vault_ctx := newSearchTestVault(t)
	create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "快捷搜索中，一条memo出现了多次")

	if !search_index_needs_build(vault_ctx) {
		t.Fatal("a vault whose index was never built must report that a build is needed")
	}

	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 0 {
		t.Fatalf("a query built the index: got %d hits", len(hits))
	}
	if !search_index_needs_build(vault_ctx) {
		t.Fatal("a query must not record a completed build")
	}

	if err := build_vault_search_index(context.Background(), vault_ctx, false); err != nil {
		t.Fatalf("build search index: %v", err)
	}
	if search_index_needs_build(vault_ctx) {
		t.Fatal("a completed build must be recorded")
	}
	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 1 {
		t.Fatalf("expected the memo to be searchable after the build, got %d hits", len(hits))
	}

	// A build is skipped while the index is already built, so opening a vault
	// does not re-walk it on every start.
	if err := build_vault_search_index(context.Background(), vault_ctx, false); err != nil {
		t.Fatalf("second build: %v", err)
	}
	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 1 {
		t.Fatalf("expected the memo to survive a no-op build, got %d hits", len(hits))
	}
}

// Deleting the index on disk must not make a query rebuild it; only an explicit
// rebuild brings it back.
func TestSearchIndexRebuildRestoresADeletedIndex(t *testing.T) {
	vault_ctx := newSearchTestVault(t)
	create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "快捷搜索中，一条memo出现了多次")

	if err := build_vault_search_index(context.Background(), vault_ctx, false); err != nil {
		t.Fatalf("build search index: %v", err)
	}
	close_vault_search_index(vault_ctx)
	if err := os.RemoveAll(SearchIndexDir(vault_ctx)); err != nil {
		t.Fatalf("remove search index: %v", err)
	}
	if !search_index_needs_build(vault_ctx) {
		t.Fatal("a deleted index must report that a build is needed")
	}

	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 0 {
		t.Fatalf("a query rebuilt a deleted index: got %d hits", len(hits))
	}

	if err := build_vault_search_index(context.Background(), vault_ctx, true); err != nil {
		t.Fatalf("force rebuild: %v", err)
	}
	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 1 {
		t.Fatalf("expected the forced rebuild to restore the memo, got %d hits", len(hits))
	}
}

// The settings "rebuild index" action rebuilds the memo index and the search
// index together, so the search index is usable right after it returns.
func TestRebuildVaultMemoQueryIndexRebuildsTheSearchIndex(t *testing.T) {
	vault_ctx := newSearchTestVault(t)
	create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "快捷搜索中，一条memo出现了多次")

	if _, err := rebuild_vault_memo_query_index(context.Background(), vault_ctx); err != nil {
		t.Fatalf("rebuild memo query index: %v", err)
	}
	if search_index_needs_build(vault_ctx) {
		t.Fatal("the settings rebuild must leave a built search index")
	}
	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 1 {
		t.Fatalf("expected the rebuilt index to find the memo, got %d hits", len(hits))
	}
}

// The settings "rebuild index" handler works on a snapshot of the active vault
// (requireActiveVault returns a copy). Closing the cached handle through that
// copy used to strand the live context with a closed index, which made every
// later query fail with "search index is closed" until the app restarted.
func TestRebuildThroughASnapshotKeepsTheIndexSearchable(t *testing.T) {
	vault_ctx := newSearchTestVault(t)
	create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "快捷搜索中，一条memo出现了多次")

	setActiveVault(vault_ctx)
	t.Cleanup(func() { setActiveVault(nil) })
	// Force the rebuild so it cannot race the background build started by
	// opening the vault: both serialize, and the forced one walks afterwards.
	if err := build_vault_search_index(context.Background(), vault_ctx, true); err != nil {
		t.Fatalf("build search index: %v", err)
	}

	snapshot, err := requireActiveVault()
	if err != nil {
		t.Fatalf("requireActiveVault: %v", err)
	}
	if snapshot == vault_ctx {
		t.Fatal("expected requireActiveVault to return a snapshot copy")
	}
	if _, err := rebuild_vault_memo_query_index(context.Background(), snapshot); err != nil {
		t.Fatalf("rebuild through a snapshot: %v", err)
	}
	// Queries resolve the index by directory, so a rebuild made through the
	// copy must leave the vault's index open and searchable.
	if hits := searchTestHits(t, vault_ctx, "快捷"); len(hits) != 1 {
		t.Fatalf("expected the rebuilt index to stay searchable, got %d hits", len(hits))
	}
}

// A full build indexes memos, comments, and the todos derived from both.
func TestBuildSearchIndexCoversMemosCommentsAndTodos(t *testing.T) {
	vault_ctx := newSearchTestVault(t)
	memo := create_test_memo(t, vault_ctx, "2026-08-04T10:00:00Z", "PUBLIC", false, "项目计划\n\n- [ ] 写文档")
	if _, err := createVaultMemoComment(vault_ctx, MemoCommentCreateRequest{
		Content: "评论说明\n- [ ] 评论任务",
		MemoID:  memo.ID,
	}); err != nil {
		t.Fatalf("create comment: %v", err)
	}

	if err := build_vault_search_index(context.Background(), vault_ctx, false); err != nil {
		t.Fatalf("build search index: %v", err)
	}

	memo_hits := searchTestHits(t, vault_ctx, "kind:memo 项目计划")
	if len(memo_hits) != 1 || memo_hits[0].Kind != search.KindMemo {
		t.Fatalf("expected the memo document, got %#v", memo_hits)
	}
	comment_hits := searchTestHits(t, vault_ctx, "kind:comment 评论说明")
	if len(comment_hits) != 1 || comment_hits[0].Kind != search.KindComment {
		t.Fatalf("expected the comment document, got %#v", comment_hits)
	}
	todo_hits := searchTestHits(t, vault_ctx, "kind:todo 评论任务")
	if len(todo_hits) != 1 || todo_hits[0].Kind != search.KindTodo {
		t.Fatalf("expected the comment todo document, got %#v", todo_hits)
	}
	if todo_hits[0].SourceCommentID == "" || todo_hits[0].SourceType != "comment" {
		t.Fatalf("todo did not keep its comment source: %#v", todo_hits[0])
	}
}

func TestSearchTodoDocumentIDsAreDeterministic(t *testing.T) {
	memo := test_memo("- [ ] 任务")
	first := search_memo_documents(memo)
	second := search_memo_documents(memo)
	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("expected 1 document each, got %d and %d", len(first), len(second))
	}
	if first[0].ID != second[0].ID {
		t.Fatalf("document ids are not deterministic: %q vs %q", first[0].ID, second[0].ID)
	}
	if !strings.HasPrefix(first[0].ID, search.MemoTodoPrefix("m1")) {
		t.Fatalf("todo id %q does not match the memo prefix %q", first[0].ID, search.MemoTodoPrefix("m1"))
	}
}
