package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type fake_d1_query_client struct {
	batches       [][]d1_query_statement
	queries       []d1_query_statement
	query_results []d1_query_result
}

func (client *fake_d1_query_client) batch(_ context.Context, statements []d1_query_statement) ([]d1_query_result, error) {
	client.batches = append(client.batches, append([]d1_query_statement{}, statements...))
	results := make([]d1_query_result, len(statements))
	for index := range results {
		results[index].Success = true
	}
	return results, nil
}

func (client *fake_d1_query_client) query(_ context.Context, statement d1_query_statement) (d1_query_result, error) {
	client.queries = append(client.queries, statement)
	if len(client.query_results) == 0 {
		return d1_query_result{Success: true}, nil
	}
	result := client.query_results[0]
	client.query_results = client.query_results[1:]
	return result, nil
}

func TestMemoStorageSettingsRedactsD1Token(t *testing.T) {
	settings := normalize_memo_storage_settings(MemoStorageSettings{
		Provider: " D1 ",
		D1: D1MemoStorageConfig{
			AccountID:  " account ",
			DatabaseID: " database ",
			APIToken:   " secret ",
		},
	})
	if settings.Provider != memo_storage_provider_d1 {
		t.Fatalf("provider = %q", settings.Provider)
	}
	if settings.D1.APIBaseURL != default_d1_api_base_url {
		t.Fatalf("api base URL = %q", settings.D1.APIBaseURL)
	}
	view := memo_storage_settings_for_view(settings)
	if !view.D1.APITokenConfigured {
		t.Fatal("expected API token to be reported as configured")
	}
	raw_view, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw_view), "secret") {
		t.Fatalf("settings view leaked token: %s", raw_view)
	}
}

func TestD1HTTPQueryClientUsesCloudflareQueryEndpoint(t *testing.T) {
	request_seen := false
	test_server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		request_seen = true
		if request.URL.Path != "/client/v4/accounts/account-id/d1/database/database-id/query" {
			t.Errorf("path = %q", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer api-token" {
			t.Errorf("authorization = %q", request.Header.Get("Authorization"))
		}
		var statement d1_query_statement
		if err := json.NewDecoder(request.Body).Decode(&statement); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if statement.SQL != "SELECT ?1 AS value" || len(statement.Params) != 1 || statement.Params[0] != "hello" {
			t.Errorf("statement = %#v", statement)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"errors":[],"result":[{"success":true,"results":[{"value":"hello"}]}]}`))
	}))
	defer test_server.Close()

	client, err := new_d1_http_query_client(D1MemoStorageConfig{
		APIBaseURL: test_server.URL + "/client/v4",
		APIToken:   "api-token",
		AccountID:  "account-id",
		DatabaseID: "database-id",
	}, test_server.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.query(context.Background(), d1_query_statement{
		SQL:    "SELECT ?1 AS value",
		Params: []string{"hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !request_seen || len(result.Results) != 1 {
		t.Fatalf("request seen = %v, results = %#v", request_seen, result.Results)
	}
}

func TestD1MemoStoreListsRecordsAndBuildsCursor(t *testing.T) {
	memo := MemoRecord{
		Content:    "hello from D1",
		CreatedAt:  "2026-08-24T08:00:00Z",
		ID:         "memo-1",
		Path:       "memo/2026/08/memo-1.md",
		Tags:       []string{"cloud"},
		Visibility: "PRIVATE",
	}
	raw_memo, err := json.Marshal(memo)
	if err != nil {
		t.Fatal(err)
	}
	fake_client := &fake_d1_query_client{
		query_results: []d1_query_result{
			{Success: true, Results: []map[string]json.RawMessage{{"memo_count": json.RawMessage(`1`)}}},
			{Success: true, Results: []map[string]json.RawMessage{{"record_json": json.RawMessage(strconv.Quote(string(raw_memo)))}}},
		},
	}
	store, err := new_d1_memo_store("vault-1", D1MemoStorageConfig{}, fake_client)
	if err != nil {
		t.Fatal(err)
	}
	page, err := store.List(context.Background(), MemoListQuery{Limit: 1, Tag: "cloud"})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || len(page.Memos) != 1 || page.Memos[0].ID != memo.ID {
		t.Fatalf("page = %#v", page)
	}
	if len(fake_client.batches) != 1 || len(fake_client.batches[0]) != 3 {
		t.Fatalf("schema batches = %#v", fake_client.batches)
	}
	if len(fake_client.queries) != 2 || !strings.Contains(fake_client.queries[0].SQL, "json_each") {
		t.Fatalf("queries = %#v", fake_client.queries)
	}
}

func TestD1MemoStoreSynchronizesSnapshotWithoutDeletingUnknownRemoteRecords(t *testing.T) {
	fake_client := &fake_d1_query_client{
		query_results: []d1_query_result{
			{Success: true, Results: []map[string]json.RawMessage{{"memo_count": json.RawMessage(`3`)}}},
		},
	}
	store, err := new_d1_memo_store("vault-1", D1MemoStorageConfig{}, fake_client)
	if err != nil {
		t.Fatal(err)
	}
	memos := []MemoRecord{
		{Content: "one", CreatedAt: "2026-08-24T08:00:00Z", ID: "memo-1", Path: "memo/2026/08/memo-1.md", Visibility: "PRIVATE"},
		{Content: "two", CreatedAt: "2026-08-24T09:00:00Z", ID: "memo-2", Path: "memo/2026/08/memo-2.md", Visibility: "PUBLIC"},
	}
	remote_count, err := store.sync_all(context.Background(), memos, []string{"memo-deleted"})
	if err != nil {
		t.Fatal(err)
	}
	if remote_count != 3 {
		t.Fatalf("remote count = %d", remote_count)
	}
	if len(fake_client.batches) != 2 {
		t.Fatalf("batch count = %d, want schema and memo batch", len(fake_client.batches))
	}
	if len(fake_client.batches[1]) != len(memos)+1 {
		t.Fatalf("memo batch = %#v", fake_client.batches[1])
	}
	if len(fake_client.queries) != 1 || !strings.Contains(fake_client.queries[0].SQL, "COUNT(*)") {
		t.Fatalf("count queries = %#v", fake_client.queries)
	}
	first_generation := fake_client.batches[1][0].Params[11]
	if first_generation == "" || fake_client.batches[1][1].Params[11] != first_generation {
		t.Fatalf("sync generations do not match: %#v", fake_client.batches[1])
	}
	if fake_client.batches[1][2].Params[1] != "memo-deleted" {
		t.Fatalf("delete statement = %#v", fake_client.batches[1][2])
	}
}

func TestD1QueryStoreHydratesAndFallsBackToLocalMarkdown(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatal(err)
	}
	settings := normalize_memo_storage_settings(MemoStorageSettings{
		Provider: memo_storage_provider_d1,
		D1: D1MemoStorageConfig{
			APIToken:   "token",
			AccountID:  "account",
			DatabaseID: "database",
		},
	})
	raw_settings, err := json.Marshal(settings)
	if err != nil {
		t.Fatal(err)
	}
	if err := vault_settings_store(vault_ctx).Set(memo_storage_settings_key, raw_settings); err != nil {
		t.Fatal(err)
	}
	if err := save_memo_storage_sync_state(vault_ctx, MemoStorageSyncState{Dirty: false}); err != nil {
		t.Fatal(err)
	}
	remote_memo := MemoRecord{
		Content:    "remote Memo",
		CreatedAt:  "2026-08-24T08:00:00Z",
		ID:         "memo-remote",
		Path:       "memo/2026/08/memo-remote.md",
		Tags:       []string{},
		Visibility: "PRIVATE",
	}
	raw_memo, err := json.Marshal(remote_memo)
	if err != nil {
		t.Fatal(err)
	}
	fake_client := &fake_d1_query_client{
		query_results: []d1_query_result{
			{Success: true, Results: []map[string]json.RawMessage{{"memo_count": json.RawMessage(`1`)}}},
			{Success: true, Results: []map[string]json.RawMessage{{"record_json": json.RawMessage(strconv.Quote(string(raw_memo)))}}},
		},
	}
	remote_store, err := new_d1_memo_store(vault_ctx.Entry.ID, D1MemoStorageConfig{}, fake_client)
	if err != nil {
		t.Fatal(err)
	}
	remote_store.schema_ready = true
	signature_raw, _ := json.Marshal(settings.D1)
	vault_ctx.memo_storage_remote = remote_store
	vault_ctx.memo_storage_signature = string(signature_raw)

	query_store, err := new_vault_memo_query_store(vault_ctx)
	if err != nil {
		t.Fatal(err)
	}
	page, err := query_store.List(context.Background(), MemoListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Memos) != 1 || page.Memos[0].ID != remote_memo.ID {
		t.Fatalf("remote page = %#v", page)
	}
	local_path := filepath.Join(vault_ctx.RootDir, filepath.FromSlash(remote_memo.Path))
	if _, err := os.Stat(local_path); err != nil {
		t.Fatalf("remote Memo was not hydrated to Local Markdown: %v", err)
	}
	if err := save_memo_storage_sync_state(vault_ctx, MemoStorageSyncState{Dirty: true}); err != nil {
		t.Fatal(err)
	}
	local_page, err := query_store.List(context.Background(), MemoListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(local_page.Memos) != 1 || local_page.Memos[0].ID != remote_memo.ID {
		t.Fatalf("local fallback page = %#v", local_page)
	}
	close_cached_memo_query_store(vault_ctx)
}
