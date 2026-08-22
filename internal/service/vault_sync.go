package service

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

const vault_sync_config_file_name = "sync.json"

const (
	vault_sync_provider_local  = "local"
	vault_sync_provider_github = "github"
)

type sync_status struct {
	Ahead       int    `json:"ahead"`
	Behind      int    `json:"behind"`
	Branch      string `json:"branch,omitempty"`
	Conflicted  bool   `json:"conflicted"`
	Dirty       bool   `json:"dirty"`
	Diverged    bool   `json:"diverged"`
	Initialized bool   `json:"initialized"`
	Provider    string `json:"provider"`
	Remote      string `json:"remote,omitempty"`
	Upstream    string `json:"upstream,omitempty"`
}

type sync_result struct {
	Changed   bool        `json:"changed"`
	Conflicts []string    `json:"conflicts"`
	Status    sync_status `json:"status"`
}

// sync_driver deliberately sits beside vault_fs. GitHub, S3 and R2 synchronize
// a local workspace; they do not replace the filesystem used by domain code.
type sync_driver interface {
	provider() string
	status(ctx context.Context) (sync_status, error)
	pull(ctx context.Context) (sync_result, error)
	push(ctx context.Context) (sync_result, error)
}

type VaultSyncConfig struct {
	GitHub        GitHubGitSyncConfig `json:"github,omitempty"`
	Provider      string              `json:"provider"`
	SchemaVersion int                 `json:"schemaVersion"`
}

type GitHubGitSyncConfig struct {
	Branch        string `json:"branch"`
	CommitMessage string `json:"commitMessage,omitempty"`
	RemoteName    string `json:"remoteName"`
	RemoteURL     string `json:"remoteUrl"`
}

type local_sync_driver struct{}

func new_local_sync_driver() sync_driver {
	return local_sync_driver{}
}

func (local_sync_driver) provider() string {
	return vault_sync_provider_local
}

func vault_sync_config_path() string {
	return filepath.ToSlash(filepath.Join(vaultConfigDirName, vault_sync_config_file_name))
}

func load_vault_sync_config(ctx *VaultContext) (VaultSyncConfig, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return VaultSyncConfig{}, err
	}
	raw, err := workspace_fs.read_file(vault_sync_config_path())
	if is_vault_file_not_exist(err) {
		return normalize_vault_sync_config(VaultSyncConfig{}), nil
	}
	if err != nil {
		return VaultSyncConfig{}, err
	}
	var config VaultSyncConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return VaultSyncConfig{}, fmt.Errorf("read vault sync config: %w", err)
	}
	return normalize_vault_sync_config(config), nil
}

func save_vault_sync_config(ctx *VaultContext, config VaultSyncConfig) error {
	config = normalize_vault_sync_config(config)
	return write_vault_json_file_atomic(ctx, vault_sync_config_path(), config)
}

func normalize_vault_sync_config(config VaultSyncConfig) VaultSyncConfig {
	config.SchemaVersion = vaultSchemaVersion
	config.Provider = strings.ToLower(strings.TrimSpace(config.Provider))
	if config.Provider == "" {
		config.Provider = vault_sync_provider_local
	}
	if config.Provider != vault_sync_provider_github {
		config.Provider = vault_sync_provider_local
		config.GitHub = GitHubGitSyncConfig{}
	}
	return config
}

func load_vault_sync_driver(ctx *VaultContext) (sync_driver, error) {
	config, err := load_vault_sync_config(ctx)
	if err != nil {
		return nil, err
	}
	if config.Provider != vault_sync_provider_github {
		return new_local_sync_driver(), nil
	}
	root_path, err := vault_local_path(ctx, ".")
	if err != nil {
		return nil, err
	}
	return new_github_git_sync_driver(root_path, ctx.fs, config.GitHub, git_cli_runner{})
}

func sync_driver_for_context(ctx *VaultContext) sync_driver {
	if ctx != nil && ctx.sync_driver != nil {
		return ctx.sync_driver
	}
	return new_local_sync_driver()
}

func sync_provider_uses_local_directory(provider string) bool {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case vault_sync_provider_local, vault_sync_provider_github, "git", "s3", "r2":
		return true
	default:
		return false
	}
}

func configure_vault_github_sync(ctx context.Context, vault_ctx *VaultContext, config GitHubGitSyncConfig) (GitHubGitSyncConfig, error) {
	if vault_ctx == nil {
		return GitHubGitSyncConfig{}, fmt.Errorf("vault context is required")
	}
	root_path, err := vault_local_path(vault_ctx, ".")
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	driver, err := new_github_git_sync_driver(root_path, vault_ctx.fs, config, git_cli_runner{})
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	resolved_config, err := driver.configure(ctx)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	sync_config := VaultSyncConfig{
		GitHub:        resolved_config,
		Provider:      vault_sync_provider_github,
		SchemaVersion: vaultSchemaVersion,
	}
	if err := save_vault_sync_config(vault_ctx, sync_config); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if err := set_active_vault_sync_driver(vault_ctx, driver); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	vault_ctx.sync_driver = driver
	return resolved_config, nil
}

func configure_vault_local_sync(vault_ctx *VaultContext) error {
	if vault_ctx == nil {
		return fmt.Errorf("vault context is required")
	}
	if err := save_vault_sync_config(vault_ctx, VaultSyncConfig{Provider: vault_sync_provider_local}); err != nil {
		return err
	}
	driver := new_local_sync_driver()
	if err := set_active_vault_sync_driver(vault_ctx, driver); err != nil {
		return err
	}
	vault_ctx.sync_driver = driver
	return nil
}

func (driver local_sync_driver) status(ctx context.Context) (sync_status, error) {
	if err := ctx.Err(); err != nil {
		return sync_status{}, err
	}
	return sync_status{Provider: driver.provider()}, nil
}

func (driver local_sync_driver) pull(ctx context.Context) (sync_result, error) {
	status, err := driver.status(ctx)
	return sync_result{Status: status}, err
}

func (driver local_sync_driver) push(ctx context.Context) (sync_result, error) {
	status, err := driver.status(ctx)
	return sync_result{Status: status}, err
}
