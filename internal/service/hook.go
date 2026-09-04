package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

const vaultHooksFileName = "hooks.json"

// HookConfig is a webhook that fires on task, memo, asset, and comment events.
type HookConfig struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	URL     string   `json:"url"`
	Enabled bool     `json:"enabled"`
	Events  []string `json:"events"` // e.g. ["task.created", "memo.updated", "comment.created", "asset.uploaded"]
}

// HookFile is the on-disk representation of hooks.json.
type HookFile struct {
	SchemaVersion int          `json:"schemaVersion"`
	Hooks         []HookConfig `json:"hooks"`
}

func hooksPath(ctx *VaultContext) string {
	return filepath.Join(vaultConfigDirName, vaultHooksFileName)
}

func loadHooks(ctx *VaultContext) (HookFile, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return HookFile{}, err
	}
	raw, err := workspace_fs.read_file(hooksPath(ctx))
	if is_vault_file_not_exist(err) {
		return HookFile{SchemaVersion: vaultSchemaVersion, Hooks: []HookConfig{}}, nil
	}
	if err != nil {
		return HookFile{}, fmt.Errorf("read hooks: %w", err)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return HookFile{SchemaVersion: vaultSchemaVersion, Hooks: []HookConfig{}}, nil
	}
	var file HookFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return HookFile{}, fmt.Errorf("read hooks: %w", err)
	}
	return normalizeHookFile(file), nil
}

func saveHooks(ctx *VaultContext, file HookFile) error {
	file = normalizeHookFile(file)
	file.SchemaVersion = vaultSchemaVersion
	return write_vault_json_file_atomic(ctx, hooksPath(ctx), file)
}

func normalizeHookFile(file HookFile) HookFile {
	cleaned := make([]HookConfig, 0, len(file.Hooks))
	seen := map[string]bool{}
	for _, h := range file.Hooks {
		h.ID = strings.TrimSpace(h.ID)
		h.Name = strings.TrimSpace(h.Name)
		h.URL = strings.TrimSpace(h.URL)
		if h.ID == "" || h.Name == "" || h.URL == "" || seen[h.ID] {
			continue
		}
		seen[h.ID] = true
		cleaned = append(cleaned, h)
	}
	file.Hooks = cleaned
	if file.SchemaVersion < 1 {
		file.SchemaVersion = vaultSchemaVersion
	}
	return file
}

func newHookID() string {
	return "hook_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}

// fireTaskHooks sends task data to all enabled hooks whose events include the
// given event type. Runs asynchronously — errors are logged but not surfaced.
func fireTaskHooks(ctx *VaultContext, eventType string, task TaskRecord) {
	hooksFile, err := loadHooks(ctx)
	if err != nil || len(hooksFile.Hooks) == 0 {
		return
	}

	payload, err := json.Marshal(veloHookPayload{Event: eventType, Task: &task})
	if err != nil {
		return
	}

	postHooks(hooksFile, eventType, payload)
}

// fireMemoHooks sends memo data to all enabled hooks whose events include the
// given event type. Runs asynchronously — errors are logged but not surfaced.
func fireMemoHooks(ctx *VaultContext, eventType string, memo MemoRecord) {
	hooksFile, err := loadHooks(ctx)
	if err != nil || len(hooksFile.Hooks) == 0 {
		return
	}

	payload, err := json.Marshal(veloHookPayload{Event: eventType, Memo: &memo})
	if err != nil {
		return
	}

	postHooks(hooksFile, eventType, payload)
}

// fireAssetHooks sends asset upload data to all enabled hooks whose events
// include the given event type. Runs asynchronously.
func fireAssetHooks(ctx *VaultContext, eventType string, assetData map[string]any) {
	hooksFile, err := loadHooks(ctx)
	if err != nil || len(hooksFile.Hooks) == 0 {
		return
	}

	payload, err := json.Marshal(veloHookPayload{Event: eventType, Asset: assetData})
	if err != nil {
		return
	}

	postHooks(hooksFile, eventType, payload)
}

// fireCommentHooks sends comment data to all enabled hooks whose events include
// the given event type. Runs asynchronously.
func fireCommentHooks(ctx *VaultContext, eventType string, comment MemoCommentRecord) {
	hooksFile, err := loadHooks(ctx)
	if err != nil || len(hooksFile.Hooks) == 0 {
		return
	}

	payload, err := json.Marshal(veloHookPayload{Event: eventType, Comment: &comment})
	if err != nil {
		return
	}

	postHooks(hooksFile, eventType, payload)
}

func postHooks(hooksFile HookFile, eventType string, payload []byte) {
	for _, hook := range hooksFile.Hooks {
		if !hook.Enabled {
			continue
		}
		if !hookEventMatches(hook.Events, eventType) {
			continue
		}
		url := hook.URL
		go func() {
			resp, err := http.Post(url, "application/json", bytes.NewReader(payload))
			if err != nil {
				return
			}
			resp.Body.Close()
		}()
	}
}

// veloHookPayload builds the JSON payload sent to webhook URLs.
type veloHookPayload struct {
	Event   string             `json:"event"`
	Memo    *MemoRecord        `json:"memo,omitempty"`
	Task    *TaskRecord        `json:"task,omitempty"`
	Comment *MemoCommentRecord `json:"comment,omitempty"`
	Asset   map[string]any     `json:"asset,omitempty"`
}

func hookEventMatches(events []string, eventType string) bool {
	for _, e := range events {
		if e == eventType {
			return true
		}
	}
	return false
}
