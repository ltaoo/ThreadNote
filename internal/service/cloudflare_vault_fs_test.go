package service

import (
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

type fake_cloudflare_vault_file struct {
	content_base64 string
	is_dir         int
	mode           int
	size           int
	updated_at     string
}

type fake_cloudflare_vault_client struct {
	files map[string]fake_cloudflare_vault_file
}

func (client *fake_cloudflare_vault_client) batch(_ context.Context, statements []d1_query_statement) ([]d1_query_result, error) {
	results := make([]d1_query_result, len(statements))
	for index := range results {
		results[index].Success = true
	}
	return results, nil
}

func (client *fake_cloudflare_vault_client) query(_ context.Context, statement d1_query_statement) (d1_query_result, error) {
	if client.files == nil {
		client.files = map[string]fake_cloudflare_vault_file{}
	}
	sql := strings.TrimSpace(statement.SQL)
	switch {
	case strings.HasPrefix(sql, "INSERT INTO threadnote_vault_files"):
		is_dir, _ := strconv.Atoi(statement.Params[3])
		mode, _ := strconv.Atoi(statement.Params[4])
		size, _ := strconv.Atoi(statement.Params[5])
		client.files[statement.Params[1]] = fake_cloudflare_vault_file{
			content_base64: statement.Params[2],
			is_dir:         is_dir,
			mode:           mode,
			size:           size,
			updated_at:     statement.Params[6],
		}
		return d1_query_result{Success: true}, nil
	case strings.HasPrefix(sql, "DELETE FROM threadnote_vault_files"):
		delete(client.files, statement.Params[1])
		return d1_query_result{Success: true}, nil
	case strings.Contains(sql, "SELECT content_base64, is_dir"):
		file, found := client.files[statement.Params[1]]
		if !found {
			return d1_query_result{Success: true}, nil
		}
		return d1_query_result{Success: true, Results: []map[string]json.RawMessage{{
			"content_base64": json_string(file.content_base64),
			"is_dir":         json_number(file.is_dir),
		}}}, nil
	case strings.Contains(sql, "WHERE vault_id = ?1 AND path = ?2"):
		file, found := client.files[statement.Params[1]]
		if !found {
			return d1_query_result{Success: true}, nil
		}
		return d1_query_result{Success: true, Results: []map[string]json.RawMessage{
			fake_cloudflare_vault_row(statement.Params[1], file),
		}}, nil
	case strings.Contains(sql, "ORDER BY path"):
		paths := make([]string, 0, len(client.files))
		for path := range client.files {
			paths = append(paths, path)
		}
		sort.Strings(paths)
		rows := make([]map[string]json.RawMessage, 0, len(paths))
		for _, path := range paths {
			rows = append(rows, fake_cloudflare_vault_row(path, client.files[path]))
		}
		return d1_query_result{Success: true, Results: rows}, nil
	default:
		return d1_query_result{Success: true}, nil
	}
}

func fake_cloudflare_vault_row(path string, file fake_cloudflare_vault_file) map[string]json.RawMessage {
	return map[string]json.RawMessage{
		"is_dir":     json_number(file.is_dir),
		"mode":       json_number(file.mode),
		"path":       json_string(path),
		"size":       json_number(file.size),
		"updated_at": json_string(file.updated_at),
	}
}

func json_string(value string) json.RawMessage {
	raw, _ := json.Marshal(value)
	return raw
}

func json_number(value int) json.RawMessage {
	return json.RawMessage(strconv.Itoa(value))
}

func TestCloudflareVaultFSWritesReadsWalksAndRemoves(t *testing.T) {
	client := &fake_cloudflare_vault_client{}
	cloud_fs := new_cloudflare_vault_fs(t.TempDir(), "test", client)
	path := "memo/2026/08/example.md"
	if err := cloud_fs.write_file_atomic(path, []byte("hello"), 0644); err != nil {
		t.Fatalf("write cloud file: %v", err)
	}
	if err := cloud_fs.append_file(path, []byte(" world"), 0644); err != nil {
		t.Fatalf("append cloud file: %v", err)
	}
	raw, err := cloud_fs.read_file(path)
	if err != nil {
		t.Fatalf("read cloud file: %v", err)
	}
	if string(raw) != "hello world" {
		t.Fatalf("content = %q, want hello world", raw)
	}

	paths := []string{}
	if err := cloud_fs.walk_dir("memo", func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		paths = append(paths, path)
		return nil
	}); err != nil {
		t.Fatalf("walk cloud files: %v", err)
	}
	if !contains_vault_path(paths, path) {
		t.Fatalf("walk paths = %#v, want %q", paths, path)
	}

	if err := cloud_fs.remove_file(path); err != nil {
		t.Fatalf("remove cloud file: %v", err)
	}
	if _, err := cloud_fs.read_file(path); !is_vault_file_not_exist(err) {
		t.Fatalf("read removed cloud file error = %v, want not exist", err)
	}
}

func TestCloudflareVaultRegistryPersistsButDoesNotExposeSecrets(t *testing.T) {
	home_dir := t.TempDir()
	t.Setenv("HOME", home_dir)
	config := CloudflareVaultConfig{
		APIToken:          "d1-secret",
		AccountID:         "account",
		DatabaseID:        "database",
		R2AccessKeyID:     "access",
		R2Bucket:          "assets",
		R2SecretAccessKey: "r2-secret",
	}
	registry := VaultRegistry{
		ActiveVaultID: "vault-1",
		SchemaVersion: vaultSchemaVersion,
		Vaults: []VaultEntry{{
			Cloudflare: &config,
			ID:         "vault-1",
			Name:       "Remote",
			Path:       cloudflare_vault_locator(config),
			Provider:   vault_provider_cloudflare,
		}},
	}

	if err := saveVaultRegistry(registry); err != nil {
		t.Fatalf("save registry: %v", err)
	}
	data_path := filepath.Join(home_dir, globalVeloDirName, globalVaultDataFileName)
	disk_raw, err := os.ReadFile(data_path)
	if err != nil {
		t.Fatalf("read registry file: %v", err)
	}
	if !strings.Contains(string(disk_raw), "d1-secret") || !strings.Contains(string(disk_raw), "r2-secret") {
		t.Fatalf("registry file did not persist Cloudflare credentials: %s", disk_raw)
	}
	view_raw, err := json.Marshal(registry)
	if err != nil {
		t.Fatalf("marshal registry view: %v", err)
	}
	if strings.Contains(string(view_raw), "secret") || strings.Contains(string(view_raw), "apiToken") {
		t.Fatalf("registry API view exposed Cloudflare credentials: %s", view_raw)
	}

	loaded, err := loadVaultRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if loaded.Vaults[0].Cloudflare.APIToken != "d1-secret" || loaded.Vaults[0].Cloudflare.R2SecretAccessKey != "r2-secret" {
		t.Fatalf("loaded Cloudflare credentials = %#v", loaded.Vaults[0].Cloudflare)
	}
}
