package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadApplicationLogPageFiltersAndReturnsNewestFirst(t *testing.T) {
	log_path := filepath.Join(t.TempDir(), "app.log")
	content := "" +
		`{"level":"info","component":"backend","message":"started","time":"2026-08-26T01:00:00Z"}` + "\n" +
		`{"level":"error","component":"frontend","message":"expand failed","memoId":"memo-1","time":"2026-08-26T01:01:00Z"}` + "\n" +
		`{"level":"info","component":"frontend","message":"expand complete","memoId":"memo-1","time":"2026-08-26T01:02:00Z"}` + "\n"
	if err := os.WriteFile(log_path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	page, err := read_application_log_page(log_path, application_log_query{
		component: "frontend",
		keyword:   "memo-1",
		levels:    map[string]struct{}{"error": {}, "info": {}},
		page:      1,
		page_size: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || len(page.Entries) != 2 {
		t.Fatalf("unexpected page: %#v", page)
	}
	if page.Entries[0]["message"] != "expand complete" {
		t.Fatalf("expected newest entry first, got %#v", page.Entries[0])
	}
	if page.Files[0].Path != log_path {
		t.Fatalf("unexpected log path: %#v", page.Files)
	}
}
