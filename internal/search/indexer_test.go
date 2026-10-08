package search

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"example/simple/internal/search/searchschema"
)

func writeRawMeta(dir string, meta indexMeta) error {
	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, metaFileName), data, 0o644)
}

func newTestIndexer(t *testing.T) *Indexer {
	t.Helper()
	indexer, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() {
		if err := indexer.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return indexer
}

func sampleMemo() Document {
	return Document{
		Kind:       KindMemo,
		ID:         MemoDocID("memo-1"),
		MemoID:     "memo-1",
		ProjectID:  "inbox",
		Tags:       []string{"work", "urgent"},
		Visibility: "project",
		Title:      "快捷搜索",
		Content:    "快捷搜索中，一条memo出现了多次。Quick search happens here.",
		CreatedAt:  time.Unix(1700000000, 0),
		UpdatedAt:  time.Unix(1700000100, 0),
	}
}

func runSearch(t *testing.T, indexer *Indexer, request SearchRequest) Results {
	t.Helper()
	results, err := indexer.Search(request)
	if err != nil {
		t.Fatalf("Search(%q): %v", request.Query, err)
	}
	return results
}

// CJK text must be searchable by substring, which requires the cjk_bigram
// token filter rather than the stock unicode analyzer.
func TestSearchMatchesCJKSubstrings(t *testing.T) {
	indexer := newTestIndexer(t)
	if err := indexer.Upsert(sampleMemo()); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	for _, query := range []string{"快捷", "搜索", "快捷搜索", "一条memo", "happens"} {
		results := runSearch(t, indexer, SearchRequest{Query: query})
		if results.Total != 1 {
			t.Errorf("query %q: total = %d, want 1", query, results.Total)
		}
	}
}

func TestSearchLatinWords(t *testing.T) {
	indexer := newTestIndexer(t)
	doc := sampleMemo()
	doc.Content = "Quick search happens here."
	if err := indexer.Upsert(doc); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	for _, query := range []string{"quick", "QUICK", "search", "quick search"} {
		results := runSearch(t, indexer, SearchRequest{Query: query})
		if results.Total != 1 {
			t.Errorf("query %q: total = %d, want 1", query, results.Total)
		}
	}
}

func TestSearchFieldFilterAndNegation(t *testing.T) {
	indexer := newTestIndexer(t)
	memo := sampleMemo()
	comment := Document{
		Kind:      KindComment,
		ID:        CommentDocID("comment-1"),
		CommentID: "comment-1",
		MemoID:    "memo-1",
		ProjectID: "inbox",
		Content:   "快捷搜索 comment body",
	}
	if err := indexer.Upsert(memo, comment); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	if got := runSearch(t, indexer, SearchRequest{Query: "kind:comment 快捷"}).Total; got != 1 {
		t.Errorf("kind:comment 快捷: total = %d, want 1", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "快捷 -kind:comment"}).Total; got != 1 {
		t.Errorf("快捷 -kind:comment: total = %d, want 1", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "projectId:missing"}).Total; got != 0 {
		t.Errorf("projectId:missing: total = %d, want 0", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "tags:urgent"}).Total; got != 1 {
		t.Errorf("tags:urgent: total = %d, want 1", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "archived:false"}).Total; got != 2 {
		t.Errorf("archived:false: total = %d, want 2", got)
	}
}

func TestSearchPhraseAndAlternation(t *testing.T) {
	indexer := newTestIndexer(t)
	if err := indexer.Upsert(sampleMemo()); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	if got := runSearch(t, indexer, SearchRequest{Query: `"快捷搜索"`}).Total; got != 1 {
		t.Errorf(`"快捷搜索": total = %d, want 1`, got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "(快捷|missing)"}).Total; got != 1 {
		t.Errorf("(快捷|missing): total = %d, want 1", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "(missing|absent)"}).Total; got != 0 {
		t.Errorf("(missing|absent): total = %d, want 0", got)
	}
}

func TestSearchHighlightIsEscapedMarkup(t *testing.T) {
	indexer := newTestIndexer(t)
	doc := sampleMemo()
	doc.Content = "search <script>alert(1)</script> body"
	doc.Title = "search title"
	if err := indexer.Upsert(doc); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	results := runSearch(t, indexer, SearchRequest{Query: "search"})
	if len(results.Hits) != 1 {
		t.Fatalf("hits = %d, want 1", len(results.Hits))
	}
	hit := results.Hits[0]
	if !strings.Contains(hit.TitleHTML, "<mark>search</mark>") {
		t.Errorf("TitleHTML = %q, want a <mark> around the match", hit.TitleHTML)
	}
	if strings.Contains(hit.SnippetHTML, "<script>") {
		t.Errorf("SnippetHTML = %q, must not contain raw HTML", hit.SnippetHTML)
	}
	if !strings.Contains(hit.SnippetHTML, "&lt;script&gt;") {
		t.Errorf("SnippetHTML = %q, want escaped markup", hit.SnippetHTML)
	}
}

func TestSearchSort(t *testing.T) {
	indexer := newTestIndexer(t)
	older := sampleMemo()
	newer := sampleMemo()
	newer.ID = MemoDocID("memo-2")
	newer.MemoID = "memo-2"
	newer.Content = newer.Content + " search"
	newer.UpdatedAt = time.Unix(1800000000, 0)
	if err := indexer.Upsert(older, newer); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	results := runSearch(t, indexer, SearchRequest{Query: "*", Sort: "date"})
	if len(results.Hits) != 2 {
		t.Fatalf("hits = %d, want 2", len(results.Hits))
	}
	if results.Hits[0].ID != MemoDocID("memo-2") {
		t.Errorf("sort:date first hit = %q, want the newest memo", results.Hits[0].ID)
	}

	byCreated := runSearch(t, indexer, SearchRequest{Query: "sort:created 快捷"})
	if byCreated.Sort != "created" {
		t.Errorf("sort directive = %q, want created", byCreated.Sort)
	}
	if len(byCreated.Hits) != 2 {
		t.Errorf("sort:created 快捷 hits = %d, want 2", len(byCreated.Hits))
	}
}

func TestDeleteAndDeleteByPrefix(t *testing.T) {
	indexer := newTestIndexer(t)
	memo := sampleMemo()
	todos := []Document{
		{Kind: KindTodo, ID: TodoDocID("memo", "memo-1", 1), MemoID: "memo-1", TodoID: "todo-1", Content: "快捷 todo one"},
		{Kind: KindTodo, ID: TodoDocID("memo", "memo-1", 2), MemoID: "memo-1", TodoID: "todo-2", Content: "快捷 todo two"},
		{Kind: KindTodo, ID: TodoDocID("memo", "memo-9", 1), MemoID: "memo-9", TodoID: "todo-9", Content: "快捷 todo nine"},
	}
	if err := indexer.Upsert(append([]Document{memo}, todos...)...); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if count, _ := indexer.Count(); count != 4 {
		t.Fatalf("count = %d, want 4", count)
	}

	if err := indexer.Delete(MemoDocID("memo-1")); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if count, _ := indexer.Count(); count != 3 {
		t.Fatalf("count after Delete = %d, want 3", count)
	}

	if err := indexer.DeleteByPrefix(MemoTodoPrefix("memo-1")); err != nil {
		t.Fatalf("DeleteByPrefix: %v", err)
	}
	if count, _ := indexer.Count(); count != 1 {
		t.Fatalf("count after DeleteByPrefix = %d, want 1", count)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "快捷"}).Total; got != 1 {
		t.Errorf("remaining hits = %d, want 1", got)
	}
}

func TestUpsertReplacesDocument(t *testing.T) {
	indexer := newTestIndexer(t)
	doc := sampleMemo()
	if err := indexer.Upsert(doc); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	doc.Content = "完全不同的内容"
	doc.Title = "另一个标题"
	if err := indexer.Upsert(doc); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if count, _ := indexer.Count(); count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "快捷"}).Total; got != 0 {
		t.Errorf("stale content still matches: total = %d, want 0", got)
	}
	if got := runSearch(t, indexer, SearchRequest{Query: "完全不同"}).Total; got != 1 {
		t.Errorf("replaced content total = %d, want 1", got)
	}
}

func TestSearchFacets(t *testing.T) {
	indexer := newTestIndexer(t)
	memo := sampleMemo()
	comment := Document{
		Kind:      KindComment,
		ID:        CommentDocID("comment-1"),
		CommentID: "comment-1",
		MemoID:    "memo-1",
		ProjectID: "inbox",
		Content:   "快捷 comment",
	}
	if err := indexer.Upsert(memo, comment); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	results := runSearch(t, indexer, SearchRequest{Query: "快捷"})
	counts := map[string]int{}
	for _, facet := range results.Facets {
		for _, bucket := range facet.Buckets {
			counts[facet.Name+":"+bucket.Value] = bucket.Count
		}
	}
	if counts["kinds:memo"] != 1 || counts["kinds:comment"] != 1 {
		t.Errorf("kind facet buckets = %v, want one memo and one comment", counts)
	}
	if counts["projects:inbox"] != 2 {
		t.Errorf("project facet = %v, want 2 for inbox", counts)
	}
}

func TestOpenRebuildsOnSchemaVersionMismatch(t *testing.T) {
	dir := t.TempDir()
	indexer, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := indexer.Upsert(sampleMemo()); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if err := indexer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if err := writeRawMeta(dir, indexMeta{Version: -1}); err != nil {
		t.Fatalf("writeRawMeta: %v", err)
	}
	reopened, err := Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() { _ = reopened.Close() }()
	if count, _ := reopened.Count(); count != 0 {
		t.Errorf("count after rebuild = %d, want 0", count)
	}
}

func TestNeedsFullBuildTracksCompletedBuilds(t *testing.T) {
	dir := t.TempDir()
	if !NeedsFullBuild(dir) {
		t.Fatal("a directory with no index must need a build")
	}

	indexer, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if !NeedsFullBuild(dir) {
		t.Fatal("opening an index is not building it, so a build is still needed")
	}
	// Documents alone are not proof of a complete build: a partial or
	// interrupted pass must still be retried.
	if err := indexer.Upsert(sampleMemo()); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if !NeedsFullBuild(dir) {
		t.Fatal("an index that was written but never finished still needs a build")
	}

	if err := indexer.MarkFullBuild(); err != nil {
		t.Fatalf("MarkFullBuild: %v", err)
	}
	if NeedsFullBuild(dir) {
		t.Fatal("a completed build must not request another build")
	}
	if err := indexer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	// Reopening an existing index must not lose the completed-build marker,
	// otherwise every app start would re-index the whole vault.
	if NeedsFullBuild(dir) {
		t.Fatal("reopening a built index must not request another build")
	}
	reopened, err := Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() { _ = reopened.Close() }()
	if err := reopened.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if NeedsFullBuild(dir) {
		t.Fatal("closing a built index must not request another build")
	}
}

func TestNeedsFullBuildAfterSchemaChange(t *testing.T) {
	dir := t.TempDir()
	indexer, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := indexer.MarkFullBuild(); err != nil {
		t.Fatalf("MarkFullBuild: %v", err)
	}
	if err := indexer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if err := writeRawMeta(dir, indexMeta{Version: searchschema.SchemaVersion + 1}); err != nil {
		t.Fatalf("writeRawMeta: %v", err)
	}
	if !NeedsFullBuild(dir) {
		t.Fatal("an index from another schema version must be rebuilt")
	}
}

func TestOpenKeepsDocumentsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	indexer, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := indexer.Upsert(sampleMemo()); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if err := indexer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	reopened, err := Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() { _ = reopened.Close() }()
	if count, _ := reopened.Count(); count != 1 {
		t.Errorf("count after reopen = %d, want 1", count)
	}
}

func TestClosedIndexerRejectsWork(t *testing.T) {
	indexer, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := indexer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := indexer.Upsert(sampleMemo()); err != ErrClosed {
		t.Errorf("Upsert after Close = %v, want ErrClosed", err)
	}
	if _, err := indexer.Search(SearchRequest{Query: "x"}); err != ErrClosed {
		t.Errorf("Search after Close = %v, want ErrClosed", err)
	}
}
