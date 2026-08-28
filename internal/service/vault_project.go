package service

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ltaoo/velo/store"
	"github.com/rs/zerolog"
)

const globalVeloDirName = ".velo"
const globalVaultDataFileName = "data.json"
const vaultConfigDirName = ".velo"
const vaultMemoDirName = "memo"
const vaultMemoCommentDirName = "memo-comments"
const vaultProjectsFileName = "projects.json"
const vaultSchemaVersion = 1

var vaultRuntime = struct {
	sync.RWMutex
	active *VaultContext
}{
	active: nil,
}

type VaultRegistry struct {
	SchemaVersion int          `json:"schemaVersion"`
	ActiveVaultID string       `json:"activeVaultId"`
	Vaults        []VaultEntry `json:"vaults"`
}

type VaultEntry struct {
	Cloudflare   *CloudflareVaultConfig `json:"-"`
	ID           string                 `json:"id"`
	LastOpenedAt string                 `json:"lastOpenedAt"`
	Name         string                 `json:"name"`
	Path         string                 `json:"path"`
	Provider     string                 `json:"provider"`
}

type vault_registry_file struct {
	SchemaVersion int                `json:"schemaVersion"`
	ActiveVaultID string             `json:"activeVaultId"`
	Vaults        []vault_entry_file `json:"vaults"`
}

type vault_entry_file struct {
	Cloudflare   *CloudflareVaultConfig `json:"cloudflare,omitempty"`
	ID           string                 `json:"id"`
	LastOpenedAt string                 `json:"lastOpenedAt"`
	Name         string                 `json:"name"`
	Path         string                 `json:"path"`
	Provider     string                 `json:"provider,omitempty"`
}

type VaultFile struct {
	CreatedAt     string `json:"createdAt"`
	ID            string `json:"id"`
	Name          string `json:"name"`
	SchemaVersion int    `json:"schemaVersion"`
	UpdatedAt     string `json:"updatedAt"`
}
type VaultContext struct {
	Entry                        VaultEntry `json:"entry"`
	RootDir                      string     `json:"rootDir"`
	VeloDir                      string     `json:"veloDir"`
	MemoDir                      string     `json:"memoDir"`
	MemoCommentDir               string     `json:"memoCommentDir"`
	PrivateUnlocked              bool       `json:"-"`
	fs                           vault_fs
	logger                       *zerolog.Logger
	memo_query_mutex             sync.Mutex
	memo_query_store             MemoQueryStore
	memo_storage_mutex           sync.Mutex
	memo_storage_operation_mutex sync.Mutex
	memo_storage_remote          *d1_memo_store
	memo_storage_signature       string
	memo_storage_state_mutex     sync.Mutex
	settings_store               *store.Store
	settings_store_mutex         sync.Mutex
	sync_driver                  sync_driver
}

type VaultOpenRequest struct {
	Path string `json:"path"`
}

func globalVeloDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, globalVeloDirName), nil
}

func globalVaultDataPath() (string, error) {
	dir, err := globalVeloDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, globalVaultDataFileName), nil
}

func loadVaultRegistry() (VaultRegistry, error) {
	path, err := globalVaultDataPath()
	if err != nil {
		return VaultRegistry{}, err
	}
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return VaultRegistry{SchemaVersion: vaultSchemaVersion, Vaults: []VaultEntry{}}, nil
	}
	if err != nil {
		return VaultRegistry{}, err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return VaultRegistry{SchemaVersion: vaultSchemaVersion, Vaults: []VaultEntry{}}, nil
	}

	var file vault_registry_file
	if err := json.Unmarshal(raw, &file); err != nil {
		return VaultRegistry{}, fmt.Errorf("read vault registry: %w", err)
	}
	registry := vault_registry_from_file(file)
	registry = normalizeVaultRegistry(registry)
	return registry, nil
}

func vault_registry_from_file(file vault_registry_file) VaultRegistry {
	registry := VaultRegistry{
		ActiveVaultID: file.ActiveVaultID,
		SchemaVersion: file.SchemaVersion,
		Vaults:        make([]VaultEntry, 0, len(file.Vaults)),
	}
	for _, entry := range file.Vaults {
		registry.Vaults = append(registry.Vaults, VaultEntry{
			Cloudflare:   clone_cloudflare_vault_config(entry.Cloudflare),
			ID:           entry.ID,
			LastOpenedAt: entry.LastOpenedAt,
			Name:         entry.Name,
			Path:         entry.Path,
			Provider:     entry.Provider,
		})
	}
	return registry
}

func vault_registry_file_from_registry(registry VaultRegistry) vault_registry_file {
	file := vault_registry_file{
		ActiveVaultID: registry.ActiveVaultID,
		SchemaVersion: registry.SchemaVersion,
		Vaults:        make([]vault_entry_file, 0, len(registry.Vaults)),
	}
	for _, entry := range registry.Vaults {
		file.Vaults = append(file.Vaults, vault_entry_file{
			Cloudflare:   clone_cloudflare_vault_config(entry.Cloudflare),
			ID:           entry.ID,
			LastOpenedAt: entry.LastOpenedAt,
			Name:         entry.Name,
			Path:         entry.Path,
			Provider:     entry.Provider,
		})
	}
	return file
}

func normalizeVaultRegistry(registry VaultRegistry) VaultRegistry {
	if registry.SchemaVersion == 0 {
		registry.SchemaVersion = vaultSchemaVersion
	}
	next := make([]VaultEntry, 0, len(registry.Vaults))
	seen := make(map[string]bool)
	for _, entry := range registry.Vaults {
		entry.ID = strings.TrimSpace(entry.ID)
		entry.Path = strings.TrimSpace(entry.Path)
		entry.Provider = normalize_vault_provider(entry.Provider)
		if entry.ID == "" || entry.Path == "" {
			continue
		}
		if entry.Provider == vault_provider_cloudflare {
			config := normalize_cloudflare_vault_config(value_or_empty_cloudflare_config(entry.Cloudflare))
			entry.Cloudflare = &config
			entry.Path = cloudflare_vault_locator(config)
		} else {
			clean_path, err := cleanVaultPath(entry.Path)
			if err == nil {
				entry.Path = clean_path
			}
			entry.Cloudflare = nil
		}
		if entry.Name == "" {
			entry.Name = vault_display_name_for_entry(entry)
		}
		key := entry.ID
		if seen[key] {
			continue
		}
		seen[key] = true
		next = append(next, entry)
	}
	registry.Vaults = next
	if registry.ActiveVaultID != "" && !vaultRegistryHasID(registry, registry.ActiveVaultID) {
		registry.ActiveVaultID = ""
	}
	return registry
}

func saveVaultRegistry(registry VaultRegistry) error {
	path, err := globalVaultDataPath()
	if err != nil {
		return err
	}
	registry = normalizeVaultRegistry(registry)
	if registry.SchemaVersion == 0 {
		registry.SchemaVersion = vaultSchemaVersion
	}
	return writeJSONFileAtomic(path, vault_registry_file_from_registry(registry))
}

func writeJSONFileAtomic(path string, value interface{}) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func activeVaultFromRegistry(registry VaultRegistry) (VaultEntry, bool) {
	activeID := strings.TrimSpace(registry.ActiveVaultID)
	if activeID == "" {
		return VaultEntry{}, false
	}
	for _, entry := range registry.Vaults {
		if entry.ID == activeID {
			return entry, true
		}
	}
	return VaultEntry{}, false
}

func loadStartupVault() (*VaultContext, error) {
	registry, err := loadVaultRegistry()
	if err != nil {
		return nil, err
	}
	entry, ok := activeVaultFromRegistry(registry)
	if !ok {
		return nil, nil
	}
	ctx, _, err := open_registered_vault_entry(entry)
	if err != nil {
		return nil, err
	}
	return ctx, nil
}

func openVaultDirectory(value string, createIfMissing bool) (*VaultContext, bool, error) {
	root_dir, err := cleanVaultPath(value)
	if err != nil {
		return nil, false, err
	}
	info, err := os.Stat(root_dir)
	if err != nil {
		return nil, false, fmt.Errorf("vault directory is not accessible: %w", err)
	}
	if !info.IsDir() {
		return nil, false, fmt.Errorf("vault path is not a directory")
	}
	workspace_fs, err := new_local_vault_fs(root_dir)
	if err != nil {
		return nil, false, err
	}
	return open_vault_workspace(root_dir, workspace_fs, createIfMissing, VaultEntry{
		Path:     root_dir,
		Provider: vault_provider_local,
	})
}

func open_vault_workspace(root_dir string, workspace_fs vault_fs, create_if_missing bool, entry_template VaultEntry) (*VaultContext, bool, error) {
	if err := ensure_vault_fs_writable(workspace_fs); err != nil {
		return nil, false, err
	}

	velo_dir := filepath.Join(root_dir, vaultConfigDirName)
	velo_info, err := workspace_fs.stat_file(vaultConfigDirName)
	existing_vault := false
	if err == nil {
		if !velo_info.IsDir() {
			return nil, false, fmt.Errorf(".velo exists but is not a directory")
		}
		existing_vault = true
	} else if is_vault_file_not_exist(err) {
		has_source_data, source_err := vault_has_source_data(workspace_fs)
		if source_err != nil {
			return nil, false, source_err
		}
		if !create_if_missing && !has_source_data {
			return nil, false, fmt.Errorf("vault config directory does not exist")
		}
		if err := workspace_fs.make_dir_all(vaultConfigDirName, 0755); err != nil {
			return nil, false, fmt.Errorf("create .velo directory: %w", err)
		}
		existing_vault = has_source_data
	} else {
		return nil, false, fmt.Errorf("stat .velo directory: %w", err)
	}
	if err := os.MkdirAll(velo_dir, 0700); err != nil {
		return nil, false, fmt.Errorf("create local vault cache: %w", err)
	}

	memo_dir := filepath.Join(root_dir, vaultMemoDirName)
	if err := workspace_fs.make_dir_all(vaultMemoDirName, 0755); err != nil {
		return nil, false, fmt.Errorf("create memo directory: %w", err)
	}
	memo_comment_dir := filepath.Join(root_dir, vaultMemoCommentDirName)
	if err := workspace_fs.make_dir_all(vaultMemoCommentDirName, 0755); err != nil {
		return nil, false, fmt.Errorf("create memo comment directory: %w", err)
	}

	vault_file, err := load_or_create_vault_file(entry_template.Path, workspace_fs)
	if err != nil {
		return nil, false, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	entry := entry_template
	entry.ID = vault_file.ID
	entry.LastOpenedAt = now
	entry.Name = firstNonEmpty(entry_template.Name, vault_file.Name, vault_display_name_for_entry(entry_template))
	entry.Provider = normalize_vault_provider(entry_template.Provider)
	if entry.Path == "" {
		entry.Path = root_dir
	}
	entry = VaultEntry{
		Cloudflare:   clone_cloudflare_vault_config(entry.Cloudflare),
		ID:           entry.ID,
		LastOpenedAt: now,
		Name:         entry.Name,
		Path:         entry.Path,
		Provider:     entry.Provider,
	}
	vault_ctx := &VaultContext{
		Entry:          entry,
		RootDir:        root_dir,
		VeloDir:        velo_dir,
		MemoDir:        memo_dir,
		MemoCommentDir: memo_comment_dir,
		fs:             workspace_fs,
	}
	if err := ensure_vault_projects_from_memos(vault_ctx); err != nil {
		return nil, false, fmt.Errorf("recover vault projects: %w", err)
	}
	vault_ctx.sync_driver, err = load_vault_sync_driver(vault_ctx)
	if err != nil {
		return nil, false, err
	}
	if err := migrate_legacy_items_to_tasks(vault_ctx); err != nil {
		return nil, false, fmt.Errorf("migrate legacy items to tasks: %w", err)
	}
	return vault_ctx, existing_vault, nil
}

func vault_has_source_data(workspace_fs vault_fs) (bool, error) {
	for _, path := range []string{
		vault_projects_path(),
		vaultMemoDirName,
		vaultMemoCommentDirName,
		"tasks",
		"items",
	} {
		if _, err := workspace_fs.stat_file(path); err == nil {
			return true, nil
		} else if !is_vault_file_not_exist(err) {
			return false, fmt.Errorf("stat vault source path %q: %w", path, err)
		}
	}
	return false, nil
}

func cleanVaultPath(value string) (string, error) {
	path := strings.TrimSpace(value)
	if path == "" {
		return "", fmt.Errorf("vault path is required")
	}
	if strings.HasPrefix(path, "~"+string(filepath.Separator)) || path == "~" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if path == "~" {
			path = homeDir
		} else {
			path = filepath.Join(homeDir, strings.TrimPrefix(path, "~"+string(filepath.Separator)))
		}
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	return filepath.Clean(abs), nil
}

func ensure_vault_fs_writable(workspace_fs vault_fs) error {
	probe := ".velo-write-test-" + randomVaultSuffix()
	if err := workspace_fs.write_file(probe, []byte("ok"), 0600); err != nil {
		return fmt.Errorf("vault directory is not writable: %w", err)
	}
	_ = workspace_fs.remove_file(probe)
	return nil
}

func load_or_create_vault_file(rootDir string, workspace_fs vault_fs) (VaultFile, error) {
	path := filepath.ToSlash(filepath.Join(vaultConfigDirName, "vault.json"))
	raw, err := workspace_fs.read_file(path)
	if err == nil && len(bytes.TrimSpace(raw)) > 0 {
		var file VaultFile
		if err := json.Unmarshal(raw, &file); err != nil {
			return VaultFile{}, fmt.Errorf("read vault config: %w", err)
		}
		changed := false
		if strings.TrimSpace(file.ID) == "" {
			file.ID = newVaultID()
			changed = true
		}
		if strings.TrimSpace(file.Name) == "" {
			file.Name = vaultDisplayName(rootDir)
			changed = true
		}
		if file.SchemaVersion == 0 {
			file.SchemaVersion = vaultSchemaVersion
			changed = true
		}
		if file.CreatedAt == "" {
			file.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
			changed = true
		}
		if changed {
			file.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
			if err := write_vault_fs_json_file_atomic(workspace_fs, path, file); err != nil {
				return VaultFile{}, err
			}
		}
		return file, nil
	}
	if err != nil && !is_vault_file_not_exist(err) {
		return VaultFile{}, fmt.Errorf("read vault config: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	file := VaultFile{
		CreatedAt:     now,
		ID:            newVaultID(),
		Name:          vaultDisplayName(rootDir),
		SchemaVersion: vaultSchemaVersion,
		UpdatedAt:     now,
	}
	if err := write_vault_fs_json_file_atomic(workspace_fs, path, file); err != nil {
		return VaultFile{}, fmt.Errorf("write vault config: %w", err)
	}
	return file, nil
}

func registerActiveVault(ctx *VaultContext) (VaultRegistry, error) {
	registry, err := loadVaultRegistry()
	if err != nil {
		return VaultRegistry{}, err
	}
	registry.SchemaVersion = vaultSchemaVersion
	registry.ActiveVaultID = ctx.Entry.ID
	updated := false
	for i, entry := range registry.Vaults {
		if entry.ID == ctx.Entry.ID || same_vault_location(entry, ctx.Entry) {
			registry.Vaults[i] = ctx.Entry
			updated = true
			break
		}
	}
	if !updated {
		registry.Vaults = append(registry.Vaults, ctx.Entry)
	}
	sort.SliceStable(registry.Vaults, func(i, j int) bool {
		return registry.Vaults[i].LastOpenedAt > registry.Vaults[j].LastOpenedAt
	})
	if err := saveVaultRegistry(registry); err != nil {
		return VaultRegistry{}, err
	}
	return registry, nil
}

func setActiveVault(vault_ctx *VaultContext) {
	vaultRuntime.Lock()
	previous_vault_ctx := vaultRuntime.active
	vaultRuntime.active = vault_ctx
	vaultRuntime.Unlock()
	if previous_vault_ctx != nil && previous_vault_ctx != vault_ctx {
		close_cached_memo_query_store(previous_vault_ctx)
	}
}

func set_active_vault_sync_driver(vault_ctx *VaultContext, driver sync_driver) error {
	if vault_ctx == nil || driver == nil {
		return fmt.Errorf("vault sync driver is required")
	}
	vaultRuntime.Lock()
	defer vaultRuntime.Unlock()
	if vaultRuntime.active == nil {
		return fmt.Errorf("vault is not selected")
	}
	if vaultRuntime.active.Entry.ID != vault_ctx.Entry.ID || !samePath(vaultRuntime.active.RootDir, vault_ctx.RootDir) {
		return fmt.Errorf("active vault changed while configuring sync")
	}
	vaultRuntime.active.sync_driver = driver
	return nil
}

func activeVaultSnapshot() *VaultContext {
	vaultRuntime.RLock()
	defer vaultRuntime.RUnlock()
	if vaultRuntime.active == nil {
		return nil
	}
	cp := *vaultRuntime.active
	return &cp
}

func vaultRegistryHasID(registry VaultRegistry, id string) bool {
	for _, entry := range registry.Vaults {
		if entry.ID == id {
			return true
		}
	}
	return false
}

func samePath(a string, b string) bool {
	cleanA, errA := cleanVaultPath(a)
	cleanB, errB := cleanVaultPath(b)
	if errA == nil {
		a = cleanA
	}
	if errB == nil {
		b = cleanB
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func normalize_vault_provider(provider string) string {
	if strings.EqualFold(strings.TrimSpace(provider), vault_provider_cloudflare) {
		return vault_provider_cloudflare
	}
	return vault_provider_local
}

func same_vault_location(left VaultEntry, right VaultEntry) bool {
	if normalize_vault_provider(left.Provider) != normalize_vault_provider(right.Provider) {
		return false
	}
	if normalize_vault_provider(left.Provider) == vault_provider_cloudflare {
		return strings.EqualFold(strings.TrimSpace(left.Path), strings.TrimSpace(right.Path))
	}
	return samePath(left.Path, right.Path)
}

func vault_display_name_for_entry(entry VaultEntry) string {
	if normalize_vault_provider(entry.Provider) == vault_provider_cloudflare {
		return "Cloudflare Vault"
	}
	return vaultDisplayName(entry.Path)
}

func vaultDisplayName(path string) string {
	name := strings.TrimSpace(filepath.Base(path))
	if name == "" || name == "." || name == string(filepath.Separator) {
		return "Vault"
	}
	return name
}

func newVaultID() string {
	return "vault_" + randomVaultSuffix()
}

func randomVaultSuffix() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err == nil {
		return hex.EncodeToString(buf[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func requireActiveVault() (*VaultContext, error) {
	ctx := activeVaultSnapshot()
	if ctx == nil || strings.TrimSpace(ctx.RootDir) == "" {
		return nil, fmt.Errorf("vault is not selected")
	}
	return ctx, nil
}
