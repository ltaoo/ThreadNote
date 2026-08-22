package service

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

func TestDecodeFrontendLogEntriesSupportsBatchAndBeaconBody(t *testing.T) {
	payload := []byte(`{"entries":[{"level":"info","message":"ready"},{"level":"warn","message":"slow"}]}`)
	entries, err := decode_frontend_log_entries(payload)
	if err != nil {
		t.Fatalf("decode beacon payload: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[1]["message"] != "slow" {
		t.Fatalf("unexpected second entry: %#v", entries[1])
	}
}

func TestReportFrontendLogsWritesStructuredEntries(t *testing.T) {
	var output bytes.Buffer
	logger := zerolog.New(&output).With().Timestamp().Logger()
	payload := map[string]interface{}{
		"entries": []interface{}{
			map[string]interface{}{
				"component": "spoofed",
				"level":     "warning",
				"message":   "project selector failed",
				"pathname":  "/home/index",
				"timestamp": "2026-08-21T08:00:00.000Z",
			},
		},
	}

	accepted_count, err := report_frontend_logs(&logger, payload)
	if err != nil {
		t.Fatalf("report frontend logs: %v", err)
	}
	if accepted_count != 1 {
		t.Fatalf("expected 1 accepted entry, got %d", accepted_count)
	}

	var logged_entry map[string]interface{}
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &logged_entry); err != nil {
		t.Fatalf("decode logged entry: %v", err)
	}
	if logged_entry["component"] != frontend_log_component {
		t.Fatalf("unexpected component: %#v", logged_entry["component"])
	}
	if logged_entry["level"] != "warn" {
		t.Fatalf("unexpected level: %#v", logged_entry["level"])
	}
	if logged_entry["message"] != "project selector failed" {
		t.Fatalf("unexpected message: %#v", logged_entry["message"])
	}
	if logged_entry["frontend_timestamp"] != "2026-08-21T08:00:00.000Z" {
		t.Fatalf("unexpected frontend timestamp: %#v", logged_entry["frontend_timestamp"])
	}
}

func TestDecodeFrontendLogEntriesRejectsOversizedBatch(t *testing.T) {
	entry_fragments := make([]string, frontend_log_max_batch+1)
	for entry_index := range entry_fragments {
		entry_fragments[entry_index] = `{"message":"entry"}`
	}
	payload := []byte(`{"entries":[` + strings.Join(entry_fragments, ",") + `]}`)

	if _, err := decode_frontend_log_entries(payload); err == nil {
		t.Fatal("expected oversized batch to be rejected")
	}
}
