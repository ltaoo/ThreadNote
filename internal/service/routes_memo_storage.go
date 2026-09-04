package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/ltaoo/velo"
)

func register_memo_storage_routes(b *velo.Box) {
	b.Get("/api/settings/memo-storage", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		settings, err := load_memo_storage_settings(b.Store.Get(memo_storage_settings_key))
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"config": memo_storage_settings_for_view(settings),
			"state":  memo_storage_sync_state_for_view(load_memo_storage_sync_state(vault_ctx)),
		})
	})

	b.Post("/api/settings/memo-storage/save", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var incoming MemoStorageSettings
		if err := c.BindJSON(&incoming); err != nil {
			return c.Error(err.Error())
		}
		vault_ctx.memo_storage_operation_mutex.Lock()
		defer vault_ctx.memo_storage_operation_mutex.Unlock()
		existing, err := load_memo_storage_settings(b.Store.Get(memo_storage_settings_key))
		if err != nil {
			return c.Error(err.Error())
		}
		settings := merge_memo_storage_secret(incoming, existing)
		if err := validate_memo_storage_settings(settings); err != nil {
			return c.Error(err.Error())
		}
		raw, err := json.Marshal(settings)
		if err != nil {
			return c.Error(err.Error())
		}
		changed := string(raw) != string(b.Store.Get(memo_storage_settings_key))
		if err := b.Store.Set(memo_storage_settings_key, json.RawMessage(raw)); err != nil {
			return c.Error(err.Error())
		}
		invalidate_configured_d1_memo_store(vault_ctx)
		close_cached_memo_query_store(vault_ctx)
		state := load_memo_storage_sync_state(vault_ctx)
		if settings.Provider == memo_storage_provider_d1 && changed {
			state.Dirty = true
			state.LastError = "D1 配置已更新，请执行一次合并同步"
			state.PendingDeleteIDs = nil
			state.RemoteMemoCount = 0
		} else if settings.Provider == memo_storage_provider_local {
			state.Dirty = false
			state.LastError = ""
		}
		if err := save_memo_storage_sync_state(vault_ctx, state); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"config":  memo_storage_settings_for_view(settings),
			"state":   memo_storage_sync_state_for_view(state),
			"success": true,
		})
	})

	b.Post("/api/settings/memo-storage/d1/test", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var incoming MemoStorageSettings
		if err := c.BindJSON(&incoming); err != nil {
			return c.Error(err.Error())
		}
		existing, err := load_memo_storage_settings(b.Store.Get(memo_storage_settings_key))
		if err != nil {
			return c.Error(err.Error())
		}
		settings := merge_memo_storage_secret(incoming, existing)
		settings.Provider = memo_storage_provider_d1
		settings = normalize_memo_storage_settings(settings)
		if err := validate_memo_storage_settings(settings); err != nil {
			return c.Error(err.Error())
		}
		remote_store, err := new_d1_memo_store(vault_ctx.Entry.ID, settings.D1, nil)
		if err != nil {
			return c.Error(err.Error())
		}
		call_ctx, cancel := context_with_d1_timeout(c.Context())
		defer cancel()
		if err := remote_store.test(call_ctx); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/settings/memo-storage/d1/sync", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		vault_ctx.memo_storage_operation_mutex.Lock()
		defer vault_ctx.memo_storage_operation_mutex.Unlock()
		remote_store, enabled, err := configured_d1_memo_store(vault_ctx)
		if err != nil {
			mark_memo_storage_sync_failed(vault_ctx, err)
			return c.Error(err.Error())
		}
		if !enabled {
			return c.Error("Memo storage provider is not D1")
		}
		memos, err := listVaultMemos(vault_ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		call_ctx, cancel := context_with_d1_timeout(c.Context())
		defer cancel()
		state := load_memo_storage_sync_state(vault_ctx)
		remote_memo_count, err := remote_store.sync_all(call_ctx, memos, state.PendingDeleteIDs)
		if err != nil {
			mark_memo_storage_sync_failed(vault_ctx, err)
			return c.Error(err.Error())
		}
		memo_count := len(memos)
		mark_memo_storage_sync_succeeded(vault_ctx, &remote_memo_count, true)
		close_cached_memo_query_store(vault_ctx)
		return c.Ok(velo.H{
			"memoCount": memo_count,
			"state":     memo_storage_sync_state_for_view(load_memo_storage_sync_state(vault_ctx)),
			"success":   true,
		})
	})
}

func context_with_d1_timeout(parent_context context.Context) (context.Context, context.CancelFunc) {
	call_ctx := parent_context
	if call_ctx == nil {
		call_ctx = context.Background()
	}
	return context.WithTimeout(call_ctx, 2*time.Minute)
}
