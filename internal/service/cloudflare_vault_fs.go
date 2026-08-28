package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const vault_provider_local = "local"
const vault_provider_cloudflare = "cloudflare"
const cloudflare_vault_namespace = "default"
const cloudflare_vault_r2_storage_id = "cloudflare-r2"

type CloudflareVaultConfig struct {
	APIBaseURL        string `json:"apiBaseUrl,omitempty"`
	APIToken          string `json:"apiToken"`
	AccountID         string `json:"accountId"`
	DatabaseID        string `json:"databaseId"`
	R2AccessKeyID     string `json:"r2AccessKeyId"`
	R2Bucket          string `json:"r2Bucket"`
	R2Endpoint        string `json:"r2Endpoint,omitempty"`
	R2SecretAccessKey string `json:"r2SecretAccessKey"`
}

type CloudflareVaultOpenRequest struct {
	CloudflareVaultConfig
	Name string `json:"name"`
}

type cloudflare_vault_fs struct {
	cache_root   string
	client       d1_query_client
	namespace    string
	schema_mutex sync.Mutex
	schema_ready bool
}

type cloudflare_vault_file_info struct {
	is_dir   bool
	mode     fs.FileMode
	mod_time time.Time
	name     string
	size     int64
}

type cloudflare_vault_dir_entry struct {
	info cloudflare_vault_file_info
}

func normalize_cloudflare_vault_config(config CloudflareVaultConfig) CloudflareVaultConfig {
	config.APIBaseURL = strings.TrimRight(strings.TrimSpace(config.APIBaseURL), "/")
	if config.APIBaseURL == "" {
		config.APIBaseURL = default_d1_api_base_url
	}
	config.APIToken = strings.TrimSpace(config.APIToken)
	config.AccountID = strings.TrimSpace(config.AccountID)
	config.DatabaseID = strings.TrimSpace(config.DatabaseID)
	config.R2AccessKeyID = strings.TrimSpace(config.R2AccessKeyID)
	config.R2Bucket = strings.TrimSpace(config.R2Bucket)
	config.R2Endpoint = strings.TrimRight(strings.TrimSpace(config.R2Endpoint), "/")
	if config.R2Endpoint == "" && config.AccountID != "" {
		config.R2Endpoint = "https://" + config.AccountID + ".r2.cloudflarestorage.com"
	}
	config.R2SecretAccessKey = strings.TrimSpace(config.R2SecretAccessKey)
	return config
}

func validate_cloudflare_vault_config(config CloudflareVaultConfig) error {
	config = normalize_cloudflare_vault_config(config)
	if err := validate_d1_memo_storage_config(D1MemoStorageConfig{
		APIBaseURL: config.APIBaseURL,
		APIToken:   config.APIToken,
		AccountID:  config.AccountID,
		DatabaseID: config.DatabaseID,
	}); err != nil {
		return err
	}
	return validateOSSAccessConfig(cloudflare_vault_r2_config(config))
}

func clone_cloudflare_vault_config(config *CloudflareVaultConfig) *CloudflareVaultConfig {
	if config == nil {
		return nil
	}
	clone := *config
	return &clone
}

func value_or_empty_cloudflare_config(config *CloudflareVaultConfig) CloudflareVaultConfig {
	if config == nil {
		return CloudflareVaultConfig{}
	}
	return *config
}

func cloudflare_vault_locator(config CloudflareVaultConfig) string {
	config = normalize_cloudflare_vault_config(config)
	return "cloudflare://" + config.AccountID + "/" + config.DatabaseID
}

func cloudflare_vault_cache_root(config CloudflareVaultConfig) (string, error) {
	global_dir, err := globalVeloDir()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(cloudflare_vault_locator(config)))
	return filepath.Join(global_dir, "cloudflare-vaults", hex.EncodeToString(sum[:12])), nil
}

func cloudflare_vault_r2_config(config CloudflareVaultConfig) OSSConfig {
	config = normalize_cloudflare_vault_config(config)
	return OSSConfig{
		AccessKeyID:     config.R2AccessKeyID,
		Bucket:          config.R2Bucket,
		Enabled:         true,
		Endpoint:        config.R2Endpoint,
		ForcePathStyle:  true,
		ID:              cloudflare_vault_r2_storage_id,
		Name:            "Cloudflare R2",
		Provider:        "r2",
		Region:          "auto",
		SecretAccessKey: config.R2SecretAccessKey,
		UseSSL:          true,
	}
}

func open_registered_vault_entry(entry VaultEntry) (*VaultContext, bool, error) {
	if normalize_vault_provider(entry.Provider) != vault_provider_cloudflare {
		return openVaultDirectory(entry.Path, false)
	}
	return open_cloudflare_vault_entry(entry, false)
}

func open_cloudflare_vault(request CloudflareVaultOpenRequest) (*VaultContext, bool, error) {
	config := normalize_cloudflare_vault_config(request.CloudflareVaultConfig)
	entry := VaultEntry{
		Cloudflare: &config,
		Name:       strings.TrimSpace(request.Name),
		Path:       cloudflare_vault_locator(config),
		Provider:   vault_provider_cloudflare,
	}
	return open_cloudflare_vault_entry(entry, true)
}

func open_cloudflare_vault_entry(entry VaultEntry, create_if_missing bool) (*VaultContext, bool, error) {
	config := normalize_cloudflare_vault_config(value_or_empty_cloudflare_config(entry.Cloudflare))
	if err := validate_cloudflare_vault_config(config); err != nil {
		return nil, false, err
	}
	cache_root, err := cloudflare_vault_cache_root(config)
	if err != nil {
		return nil, false, err
	}
	if err := os.MkdirAll(cache_root, 0700); err != nil {
		return nil, false, fmt.Errorf("create Cloudflare vault cache: %w", err)
	}
	d1_client, err := new_d1_http_query_client(D1MemoStorageConfig{
		APIBaseURL: config.APIBaseURL,
		APIToken:   config.APIToken,
		AccountID:  config.AccountID,
		DatabaseID: config.DatabaseID,
	}, nil)
	if err != nil {
		return nil, false, err
	}
	if err := test_cloudflare_vault_r2(context.Background(), config); err != nil {
		return nil, false, err
	}
	workspace_fs := new_cloudflare_vault_fs(cache_root, cloudflare_vault_namespace, d1_client)
	entry.Cloudflare = &config
	entry.Path = cloudflare_vault_locator(config)
	entry.Provider = vault_provider_cloudflare
	vault_ctx, existing, err := open_vault_workspace(cache_root, workspace_fs, create_if_missing, entry)
	if err != nil {
		return nil, false, err
	}
	if err := configure_cloudflare_vault_storage(vault_ctx, config); err != nil {
		return nil, false, err
	}
	return vault_ctx, existing, nil
}

func test_cloudflare_vault_r2(parent_context context.Context, config CloudflareVaultConfig) error {
	client, _, err := newOSSClient(cloudflare_vault_r2_config(config))
	if err != nil {
		return err
	}
	call_context, cancel := context.WithTimeout(parent_context, d1_request_timeout)
	defer cancel()
	_, err = client.ListObjectsV2(call_context, &s3.ListObjectsV2Input{
		Bucket:  aws.String(strings.TrimSpace(config.R2Bucket)),
		MaxKeys: 1,
	})
	if err != nil {
		return fmt.Errorf("test Cloudflare R2: %w", err)
	}
	return nil
}

func configure_cloudflare_vault_storage(vault_ctx *VaultContext, config CloudflareVaultConfig) error {
	settings_store := vault_settings_store(vault_ctx)
	if settings_store == nil {
		return fmt.Errorf("vault settings store is unavailable")
	}
	memo_settings := normalize_memo_storage_settings(MemoStorageSettings{
		D1: D1MemoStorageConfig{
			APIBaseURL: config.APIBaseURL,
			APIToken:   config.APIToken,
			AccountID:  config.AccountID,
			DatabaseID: config.DatabaseID,
		},
		Provider: memo_storage_provider_d1,
	})
	memo_raw, err := json.Marshal(memo_settings)
	if err != nil {
		return err
	}
	if err := settings_store.Set(memo_storage_settings_key, json.RawMessage(memo_raw)); err != nil {
		return err
	}
	cloud_settings := normalizeCloudStorageSettings(CloudStorageSettings{
		ActiveStorageID:     cloudflare_vault_r2_storage_id,
		DefaultsInitialized: true,
		Storages:            []OSSConfig{cloudflare_vault_r2_config(config)},
	})
	cloud_raw, err := marshalCloudStorageSettingsForStore(cloud_settings)
	if err != nil {
		return err
	}
	if err := settings_store.Set(cloudStorageSettingsKey, json.RawMessage(cloud_raw)); err != nil {
		return err
	}
	remote_store, err := new_d1_memo_store(vault_ctx.Entry.ID, memo_settings.D1, nil)
	if err != nil {
		return err
	}
	memos, err := listVaultMemos(vault_ctx)
	if err != nil {
		return err
	}
	call_context, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	remote_count, err := remote_store.sync_all(call_context, memos, nil)
	if err != nil {
		return err
	}
	mark_memo_storage_sync_succeeded(vault_ctx, &remote_count, true)
	return nil
}

func new_cloudflare_vault_fs(cache_root string, namespace string, client d1_query_client) *cloudflare_vault_fs {
	return &cloudflare_vault_fs{
		cache_root: filepath.Clean(cache_root),
		client:     client,
		namespace:  strings.TrimSpace(namespace),
	}
}

func (cloud_fs *cloudflare_vault_fs) ensure_schema() error {
	cloud_fs.schema_mutex.Lock()
	defer cloud_fs.schema_mutex.Unlock()
	if cloud_fs.schema_ready {
		return nil
	}
	_, err := cloud_fs.client.batch(context.Background(), []d1_query_statement{
		{SQL: `CREATE TABLE IF NOT EXISTS threadnote_vault_files (
			vault_id TEXT NOT NULL,
			path TEXT NOT NULL,
			content_base64 TEXT NOT NULL,
			is_dir INTEGER NOT NULL,
			mode INTEGER NOT NULL,
			size INTEGER NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (vault_id, path)
		) STRICT`},
		{SQL: `CREATE INDEX IF NOT EXISTS threadnote_vault_files_path
			ON threadnote_vault_files (vault_id, path)`},
	})
	if err != nil {
		return fmt.Errorf("initialize Cloudflare vault: %w", err)
	}
	cloud_fs.schema_ready = true
	return nil
}

func (cloud_fs *cloudflare_vault_fs) append_file(path string, data []byte, mode fs.FileMode) error {
	existing, err := cloud_fs.read_file(path)
	if err != nil && !is_vault_file_not_exist(err) {
		return err
	}
	return cloud_fs.write_file(path, append(existing, data...), mode)
}

func (cloud_fs *cloudflare_vault_fs) make_dir_all(path string, mode fs.FileMode) error {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return err
	}
	local_path, err := cloud_fs.cache_path(relative_path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(local_path, mode); err != nil {
		return err
	}
	if relative_path == "." {
		return nil
	}
	current_path := ""
	for _, part := range strings.Split(relative_path, "/") {
		current_path = pathpkg.Join(current_path, part)
		if err := cloud_fs.upsert(current_path, nil, true, mode); err != nil {
			return err
		}
	}
	return nil
}

func (cloud_fs *cloudflare_vault_fs) read_file(path string) ([]byte, error) {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return nil, err
	}
	if err := cloud_fs.ensure_schema(); err != nil {
		return nil, err
	}
	result, err := cloud_fs.client.query(context.Background(), d1_query_statement{
		SQL:    "SELECT content_base64, is_dir FROM threadnote_vault_files WHERE vault_id = ?1 AND path = ?2 LIMIT 1",
		Params: []string{cloud_fs.namespace, relative_path},
	})
	if err != nil {
		return nil, err
	}
	if len(result.Results) == 0 {
		return nil, &fs.PathError{Op: "read", Path: relative_path, Err: fs.ErrNotExist}
	}
	is_dir, err := d1_row_int(result.Results[0], "is_dir")
	if err != nil {
		return nil, err
	}
	if is_dir != 0 {
		return nil, &fs.PathError{Op: "read", Path: relative_path, Err: fmt.Errorf("is a directory")}
	}
	encoded, err := d1_row_string(result.Results[0], "content_base64")
	if err != nil {
		return nil, err
	}
	content, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode Cloudflare vault file %s: %w", relative_path, err)
	}
	if err := cloud_fs.write_cache_file(relative_path, content, 0644); err != nil {
		return nil, err
	}
	return content, nil
}

func (cloud_fs *cloudflare_vault_fs) remove_file(path string) error {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return err
	}
	if _, err := cloud_fs.stat_file(relative_path); err != nil {
		return err
	}
	_, err = cloud_fs.client.query(context.Background(), d1_query_statement{
		SQL:    "DELETE FROM threadnote_vault_files WHERE vault_id = ?1 AND path = ?2",
		Params: []string{cloud_fs.namespace, relative_path},
	})
	if err != nil {
		return err
	}
	local_path, path_err := cloud_fs.cache_path(relative_path)
	if path_err == nil {
		if remove_err := os.Remove(local_path); remove_err != nil && !os.IsNotExist(remove_err) {
			return remove_err
		}
	}
	return nil
}

func (cloud_fs *cloudflare_vault_fs) stat_file(path string) (fs.FileInfo, error) {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return nil, err
	}
	if relative_path == "." {
		return cloudflare_vault_file_info{is_dir: true, mode: 0755 | fs.ModeDir, name: "."}, nil
	}
	if err := cloud_fs.ensure_schema(); err != nil {
		return nil, err
	}
	result, err := cloud_fs.client.query(context.Background(), d1_query_statement{
		SQL:    "SELECT path, is_dir, mode, size, updated_at FROM threadnote_vault_files WHERE vault_id = ?1 AND path = ?2 LIMIT 1",
		Params: []string{cloud_fs.namespace, relative_path},
	})
	if err != nil {
		return nil, err
	}
	if len(result.Results) == 0 {
		return nil, &fs.PathError{Op: "stat", Path: relative_path, Err: fs.ErrNotExist}
	}
	return decode_cloudflare_vault_file_info(result.Results[0])
}

func (cloud_fs *cloudflare_vault_fs) walk_dir(path string, walk_fn fs.WalkDirFunc) error {
	if walk_fn == nil {
		return fmt.Errorf("walk function is required")
	}
	root_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return err
	}
	entries, err := cloud_fs.list_entries()
	if err != nil {
		return err
	}
	entry_by_path := make(map[string]cloudflare_vault_dir_entry, len(entries)+1)
	for _, entry := range entries {
		entry_path := entry.info.name
		if raw_path, found := entry.info.Sys().(string); found {
			entry_path = raw_path
		}
		entry_by_path[entry_path] = entry
	}
	if root_path == "." {
		entry_by_path[root_path] = cloudflare_vault_dir_entry{info: cloudflare_vault_file_info{is_dir: true, mode: 0755 | fs.ModeDir, name: "."}}
	}
	root_entry, found := entry_by_path[root_path]
	if !found {
		return &fs.PathError{Op: "walk", Path: root_path, Err: fs.ErrNotExist}
	}
	paths := make([]string, 0, len(entry_by_path))
	for entry_path := range entry_by_path {
		if entry_path == root_path || root_path == "." || strings.HasPrefix(entry_path, root_path+"/") {
			paths = append(paths, entry_path)
		}
	}
	sort.Strings(paths)
	if len(paths) > 0 && paths[0] != root_path {
		paths = append([]string{root_path}, paths...)
	}
	skipped_dirs := []string{}
	for _, entry_path := range paths {
		if entry_path != root_path && path_is_under_any(entry_path, skipped_dirs) {
			continue
		}
		entry := entry_by_path[entry_path]
		walk_err := walk_fn(entry_path, entry, nil)
		if walk_err == fs.SkipAll {
			return nil
		}
		if walk_err == fs.SkipDir && entry.IsDir() {
			skipped_dirs = append(skipped_dirs, entry_path)
			continue
		}
		if walk_err != nil {
			return walk_err
		}
	}
	_ = root_entry
	return nil
}

func path_is_under_any(path string, parents []string) bool {
	for _, parent := range parents {
		if strings.HasPrefix(path, parent+"/") {
			return true
		}
	}
	return false
}

func (cloud_fs *cloudflare_vault_fs) write_file(path string, data []byte, mode fs.FileMode) error {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return err
	}
	if relative_path == "." {
		return fmt.Errorf("cannot write vault root")
	}
	parent_path := pathpkg.Dir(relative_path)
	if parent_path != "." {
		if err := cloud_fs.make_dir_all(parent_path, 0755); err != nil {
			return err
		}
	}
	if err := cloud_fs.upsert(relative_path, data, false, mode); err != nil {
		return err
	}
	return cloud_fs.write_cache_file(relative_path, data, mode)
}

func (cloud_fs *cloudflare_vault_fs) write_file_atomic(path string, data []byte, mode fs.FileMode) error {
	return cloud_fs.write_file(path, data, mode)
}

func (cloud_fs *cloudflare_vault_fs) local_path(path string) (string, error) {
	relative_path, err := cloud_fs.relative_path(path)
	if err != nil {
		return "", err
	}
	local_path, err := cloud_fs.cache_path(relative_path)
	if err != nil {
		return "", err
	}
	if relative_path == "." {
		return local_path, os.MkdirAll(local_path, 0700)
	}
	info, err := cloud_fs.stat_file(relative_path)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return local_path, os.MkdirAll(local_path, info.Mode().Perm())
	}
	_, err = cloud_fs.read_file(relative_path)
	return local_path, err
}

func (cloud_fs *cloudflare_vault_fs) relative_path(path string) (string, error) {
	value := strings.TrimSpace(path)
	if value == "" || value == "." {
		return ".", nil
	}
	if filepath.IsAbs(value) {
		relative_path, err := filepath.Rel(cloud_fs.cache_root, filepath.Clean(value))
		if err != nil {
			return "", err
		}
		return clean_vault_fs_path(relative_path)
	}
	return clean_vault_fs_path(filepath.FromSlash(strings.ReplaceAll(value, "\\", "/")))
}

func (cloud_fs *cloudflare_vault_fs) upsert(path string, data []byte, is_dir bool, mode fs.FileMode) error {
	if err := cloud_fs.ensure_schema(); err != nil {
		return err
	}
	if is_dir {
		mode |= fs.ModeDir
	}
	is_dir_value := "0"
	if is_dir {
		is_dir_value = "1"
	}
	_, err := cloud_fs.client.query(context.Background(), d1_query_statement{
		SQL: `INSERT INTO threadnote_vault_files
			(vault_id, path, content_base64, is_dir, mode, size, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
			ON CONFLICT(vault_id, path) DO UPDATE SET
			content_base64 = excluded.content_base64,
			is_dir = excluded.is_dir,
			mode = excluded.mode,
			size = excluded.size,
			updated_at = excluded.updated_at`,
		Params: []string{
			cloud_fs.namespace,
			path,
			base64.StdEncoding.EncodeToString(data),
			is_dir_value,
			strconv.FormatUint(uint64(mode), 10),
			strconv.Itoa(len(data)),
			time.Now().UTC().Format(time.RFC3339Nano),
		},
	})
	return err
}

func (cloud_fs *cloudflare_vault_fs) list_entries() ([]cloudflare_vault_dir_entry, error) {
	if err := cloud_fs.ensure_schema(); err != nil {
		return nil, err
	}
	result, err := cloud_fs.client.query(context.Background(), d1_query_statement{
		SQL:    "SELECT path, is_dir, mode, size, updated_at FROM threadnote_vault_files WHERE vault_id = ?1 ORDER BY path",
		Params: []string{cloud_fs.namespace},
	})
	if err != nil {
		return nil, err
	}
	entries := make([]cloudflare_vault_dir_entry, 0, len(result.Results))
	for _, row := range result.Results {
		info, err := decode_cloudflare_vault_file_info(row)
		if err != nil {
			return nil, err
		}
		entries = append(entries, cloudflare_vault_dir_entry{info: info})
	}
	return entries, nil
}

func decode_cloudflare_vault_file_info(row map[string]json.RawMessage) (cloudflare_vault_file_info, error) {
	path, err := d1_row_string(row, "path")
	if err != nil {
		return cloudflare_vault_file_info{}, err
	}
	is_dir, err := d1_row_int(row, "is_dir")
	if err != nil {
		return cloudflare_vault_file_info{}, err
	}
	mode_value, err := d1_row_int(row, "mode")
	if err != nil {
		return cloudflare_vault_file_info{}, err
	}
	size, err := d1_row_int(row, "size")
	if err != nil {
		return cloudflare_vault_file_info{}, err
	}
	updated_at, err := d1_row_string(row, "updated_at")
	if err != nil {
		return cloudflare_vault_file_info{}, err
	}
	mod_time, _ := time.Parse(time.RFC3339Nano, updated_at)
	mode := fs.FileMode(mode_value)
	if is_dir != 0 {
		mode |= fs.ModeDir
	}
	return cloudflare_vault_file_info{
		is_dir:   is_dir != 0,
		mode:     mode,
		mod_time: mod_time,
		name:     path,
		size:     int64(size),
	}, nil
}

func (cloud_fs *cloudflare_vault_fs) cache_path(path string) (string, error) {
	relative_path, err := clean_vault_fs_path(filepath.FromSlash(path))
	if err != nil {
		return "", err
	}
	if relative_path == "." {
		return cloud_fs.cache_root, nil
	}
	return filepath.Join(cloud_fs.cache_root, filepath.FromSlash(relative_path)), nil
}

func (cloud_fs *cloudflare_vault_fs) write_cache_file(path string, data []byte, mode fs.FileMode) error {
	local_path, err := cloud_fs.cache_path(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(local_path), 0700); err != nil {
		return err
	}
	return os.WriteFile(local_path, data, mode.Perm())
}

func (info cloudflare_vault_file_info) Name() string {
	if info.name == "." {
		return "."
	}
	return pathpkg.Base(info.name)
}

func (info cloudflare_vault_file_info) Size() int64        { return info.size }
func (info cloudflare_vault_file_info) Mode() fs.FileMode  { return info.mode }
func (info cloudflare_vault_file_info) ModTime() time.Time { return info.mod_time }
func (info cloudflare_vault_file_info) IsDir() bool        { return info.is_dir }
func (info cloudflare_vault_file_info) Sys() interface{}   { return info.name }

func (entry cloudflare_vault_dir_entry) Name() string               { return entry.info.Name() }
func (entry cloudflare_vault_dir_entry) IsDir() bool                { return entry.info.IsDir() }
func (entry cloudflare_vault_dir_entry) Type() fs.FileMode          { return entry.info.Mode().Type() }
func (entry cloudflare_vault_dir_entry) Info() (fs.FileInfo, error) { return entry.info, nil }
