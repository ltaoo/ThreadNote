package service

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/ltaoo/velo/store"
)

const memo_storage_settings_key = "demo-desktop:settings:memo-storage:v1"
const memo_storage_sync_state_key = "demo-desktop:settings:memo-storage-sync:v1"
const memo_storage_provider_local = "local"
const memo_storage_provider_d1 = "d1"
const default_d1_api_base_url = "https://api.cloudflare.com/client/v4"

type MemoStorageSettings struct {
	D1       D1MemoStorageConfig `json:"d1"`
	Provider string              `json:"provider"`
}

type D1MemoStorageConfig struct {
	APIBaseURL string `json:"apiBaseUrl,omitempty"`
	APIToken   string `json:"apiToken,omitempty"`
	AccountID  string `json:"accountId"`
	DatabaseID string `json:"databaseId"`
}

type memo_storage_settings_view struct {
	D1       d1_memo_storage_config_view `json:"d1"`
	Provider string                      `json:"provider"`
}

type d1_memo_storage_config_view struct {
	APIBaseURL         string `json:"apiBaseUrl"`
	APITokenConfigured bool   `json:"apiTokenConfigured"`
	AccountID          string `json:"accountId"`
	DatabaseID         string `json:"databaseId"`
}

type MemoStorageSyncState struct {
	Dirty            bool     `json:"dirty"`
	LastError        string   `json:"lastError,omitempty"`
	LastSyncedAt     string   `json:"lastSyncedAt,omitempty"`
	PendingDeleteIDs []string `json:"pendingDeleteIds,omitempty"`
	RemoteMemoCount  int      `json:"remoteMemoCount"`
}

type memo_storage_sync_state_view struct {
	Dirty           bool   `json:"dirty"`
	LastError       string `json:"lastError,omitempty"`
	LastSyncedAt    string `json:"lastSyncedAt,omitempty"`
	RemoteMemoCount int    `json:"remoteMemoCount"`
}

func default_memo_storage_settings() MemoStorageSettings {
	return MemoStorageSettings{
		D1: D1MemoStorageConfig{
			APIBaseURL: default_d1_api_base_url,
		},
		Provider: memo_storage_provider_local,
	}
}

func normalize_memo_storage_settings(settings MemoStorageSettings) MemoStorageSettings {
	settings.Provider = strings.ToLower(strings.TrimSpace(settings.Provider))
	if settings.Provider == "" {
		settings.Provider = memo_storage_provider_local
	}
	settings.D1.APIBaseURL = strings.TrimRight(strings.TrimSpace(settings.D1.APIBaseURL), "/")
	if settings.D1.APIBaseURL == "" {
		settings.D1.APIBaseURL = default_d1_api_base_url
	}
	settings.D1.APIToken = strings.TrimSpace(settings.D1.APIToken)
	settings.D1.AccountID = strings.TrimSpace(settings.D1.AccountID)
	settings.D1.DatabaseID = strings.TrimSpace(settings.D1.DatabaseID)
	return settings
}

func validate_memo_storage_settings(settings MemoStorageSettings) error {
	settings = normalize_memo_storage_settings(settings)
	switch settings.Provider {
	case memo_storage_provider_local:
		return nil
	case memo_storage_provider_d1:
		return validate_d1_memo_storage_config(settings.D1)
	default:
		return fmt.Errorf("unsupported memo storage provider: %s", settings.Provider)
	}
}

func validate_d1_memo_storage_config(config D1MemoStorageConfig) error {
	config = normalize_memo_storage_settings(MemoStorageSettings{D1: config}).D1
	if config.AccountID == "" {
		return fmt.Errorf("Cloudflare account ID is required")
	}
	if config.DatabaseID == "" {
		return fmt.Errorf("Cloudflare D1 database ID is required")
	}
	if config.APIToken == "" {
		return fmt.Errorf("Cloudflare D1 API token is required")
	}
	parsed_url, err := url.Parse(config.APIBaseURL)
	if err != nil || parsed_url.Host == "" || (parsed_url.Scheme != "http" && parsed_url.Scheme != "https") {
		return fmt.Errorf("Cloudflare D1 API base URL must be an http or https URL")
	}
	return nil
}

func load_memo_storage_settings(raw json.RawMessage) (MemoStorageSettings, error) {
	if raw == nil {
		return default_memo_storage_settings(), nil
	}
	var settings MemoStorageSettings
	if err := json.Unmarshal(raw, &settings); err != nil {
		return MemoStorageSettings{}, fmt.Errorf("read memo storage settings: %w", err)
	}
	settings = normalize_memo_storage_settings(settings)
	if err := validate_memo_storage_settings(settings); err != nil {
		return MemoStorageSettings{}, err
	}
	return settings, nil
}

func memo_storage_settings_for_view(settings MemoStorageSettings) memo_storage_settings_view {
	settings = normalize_memo_storage_settings(settings)
	return memo_storage_settings_view{
		D1: d1_memo_storage_config_view{
			APIBaseURL:         settings.D1.APIBaseURL,
			APITokenConfigured: settings.D1.APIToken != "",
			AccountID:          settings.D1.AccountID,
			DatabaseID:         settings.D1.DatabaseID,
		},
		Provider: settings.Provider,
	}
}

func merge_memo_storage_secret(incoming MemoStorageSettings, existing MemoStorageSettings) MemoStorageSettings {
	incoming = normalize_memo_storage_settings(incoming)
	existing = normalize_memo_storage_settings(existing)
	if incoming.D1.APIToken == "" {
		incoming.D1.APIToken = existing.D1.APIToken
	}
	return incoming
}

func vault_settings_store(vault_ctx *VaultContext) *store.Store {
	if vault_ctx == nil {
		return nil
	}
	vault_ctx.settings_store_mutex.Lock()
	defer vault_ctx.settings_store_mutex.Unlock()
	if vault_ctx.settings_store == nil {
		vault_ctx.settings_store = store.NewWithDir(vault_ctx.VeloDir)
		_ = os.Chmod(vault_ctx.settings_store.Path(), 0600)
	}
	return vault_ctx.settings_store
}

func configured_memo_storage_settings(vault_ctx *VaultContext) (MemoStorageSettings, error) {
	settings_store := vault_settings_store(vault_ctx)
	if settings_store == nil {
		return MemoStorageSettings{}, fmt.Errorf("vault settings store is unavailable")
	}
	return load_memo_storage_settings(settings_store.Get(memo_storage_settings_key))
}

func load_memo_storage_sync_state(vault_ctx *VaultContext) MemoStorageSyncState {
	settings_store := vault_settings_store(vault_ctx)
	if settings_store == nil {
		return MemoStorageSyncState{}
	}
	vault_ctx.memo_storage_state_mutex.Lock()
	defer vault_ctx.memo_storage_state_mutex.Unlock()
	var state MemoStorageSyncState
	if raw := settings_store.Get(memo_storage_sync_state_key); raw != nil {
		_ = json.Unmarshal(raw, &state)
	}
	state.PendingDeleteIDs = uniqueStrings(state.PendingDeleteIDs)
	return state
}

func memo_storage_sync_state_for_view(state MemoStorageSyncState) memo_storage_sync_state_view {
	return memo_storage_sync_state_view{
		Dirty:           state.Dirty,
		LastError:       state.LastError,
		LastSyncedAt:    state.LastSyncedAt,
		RemoteMemoCount: state.RemoteMemoCount,
	}
}

func save_memo_storage_sync_state(vault_ctx *VaultContext, state MemoStorageSyncState) error {
	settings_store := vault_settings_store(vault_ctx)
	if settings_store == nil {
		return fmt.Errorf("vault settings store is unavailable")
	}
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	vault_ctx.memo_storage_state_mutex.Lock()
	defer vault_ctx.memo_storage_state_mutex.Unlock()
	return settings_store.Set(memo_storage_sync_state_key, json.RawMessage(raw))
}

func update_memo_storage_sync_state(vault_ctx *VaultContext, update func(*MemoStorageSyncState)) error {
	settings_store := vault_settings_store(vault_ctx)
	if settings_store == nil {
		return fmt.Errorf("vault settings store is unavailable")
	}
	vault_ctx.memo_storage_state_mutex.Lock()
	defer vault_ctx.memo_storage_state_mutex.Unlock()
	var state MemoStorageSyncState
	if raw := settings_store.Get(memo_storage_sync_state_key); raw != nil {
		_ = json.Unmarshal(raw, &state)
	}
	state.PendingDeleteIDs = uniqueStrings(state.PendingDeleteIDs)
	if update != nil {
		update(&state)
	}
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return settings_store.Set(memo_storage_sync_state_key, json.RawMessage(raw))
}

func mark_memo_storage_sync_failed(vault_ctx *VaultContext, sync_err error) {
	if vault_ctx == nil || sync_err == nil {
		return
	}
	_ = update_memo_storage_sync_state(vault_ctx, func(state *MemoStorageSyncState) {
		state.Dirty = true
		state.LastError = sync_err.Error()
	})
	if vault_ctx.logger != nil {
		vault_ctx.logger.Warn().Err(sync_err).
			Str("component", "memo_storage").
			Str("provider", memo_storage_provider_d1).
			Msg("D1 memo mirror failed; local Markdown remains available")
	}
}

func record_memo_storage_read_error(vault_ctx *VaultContext, read_err error) {
	if vault_ctx == nil || read_err == nil {
		return
	}
	_ = update_memo_storage_sync_state(vault_ctx, func(state *MemoStorageSyncState) {
		state.LastError = read_err.Error()
	})
	if vault_ctx.logger != nil {
		vault_ctx.logger.Warn().Err(read_err).
			Str("component", "memo_storage").
			Str("provider", memo_storage_provider_d1).
			Msg("D1 memo query failed; using local Markdown cache")
	}
}

func mark_memo_storage_sync_succeeded(vault_ctx *VaultContext, remote_memo_count *int, clear_dirty bool) {
	if vault_ctx == nil {
		return
	}
	_ = update_memo_storage_sync_state(vault_ctx, func(state *MemoStorageSyncState) {
		if clear_dirty {
			state.Dirty = false
			state.PendingDeleteIDs = nil
		}
		state.LastError = ""
		state.LastSyncedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if remote_memo_count != nil {
			state.RemoteMemoCount = *remote_memo_count
		}
	})
}

func mark_memo_storage_delete_failed(vault_ctx *VaultContext, memo_id string, sync_err error) {
	if vault_ctx == nil || sync_err == nil {
		return
	}
	_ = update_memo_storage_sync_state(vault_ctx, func(state *MemoStorageSyncState) {
		state.Dirty = true
		state.LastError = sync_err.Error()
		state.PendingDeleteIDs = uniqueStrings(append(state.PendingDeleteIDs, strings.TrimSpace(memo_id)))
	})
	if vault_ctx.logger != nil {
		vault_ctx.logger.Warn().Err(sync_err).
			Str("component", "memo_storage").
			Str("memoId", memo_id).
			Str("provider", memo_storage_provider_d1).
			Msg("D1 memo deletion queued for the next merge sync")
	}
}

func remove_pending_memo_storage_delete(vault_ctx *VaultContext, memo_id string) {
	if vault_ctx == nil {
		return
	}
	_ = update_memo_storage_sync_state(vault_ctx, func(state *MemoStorageSyncState) {
		next_ids := make([]string, 0, len(state.PendingDeleteIDs))
		for _, pending_id := range state.PendingDeleteIDs {
			if pending_id != strings.TrimSpace(memo_id) {
				next_ids = append(next_ids, pending_id)
			}
		}
		state.PendingDeleteIDs = next_ids
	})
}
