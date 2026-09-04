package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

func TestVeloAppDoesNotCreateExecutableLocalStore(t *testing.T) {
	app := velo.NewApp(&velo.VeloAppOpt{
		Mode:               velo.ModeBridge,
		EnableLocalStorage: false,
	})
	if app.Store != nil {
		t.Fatal("Velo created a store beside the executable while local storage was disabled")
	}
}

func TestInitialStoreFallsBackWhenActiveVaultWasDeleted(t *testing.T) {
	home_dir := t.TempDir()
	t.Setenv("HOME", home_dir)
	missing_path := filepath.Join(home_dir, "deleted-vault")
	if err := saveVaultRegistry(VaultRegistry{
		ActiveVaultID: "deleted",
		SchemaVersion: vaultSchemaVersion,
		Vaults: []VaultEntry{{
			ID:       "deleted",
			Name:     "Deleted",
			Path:     missing_path,
			Provider: vault_provider_local,
		}},
	}); err != nil {
		t.Fatalf("save vault registry: %v", err)
	}

	logger := zerolog.Nop()
	app_store, pathname, err := load_initial_store(&logger)
	if err != nil {
		t.Fatalf("load initial store: %v", err)
	}
	if app_store == nil {
		t.Fatal("expected fallback application store")
	}
	if pathname != "/vault-picker" {
		t.Fatalf("expected vault picker, got %q", pathname)
	}
	expected_path := filepath.Join(home_dir, globalVeloDirName, "storage.json")
	if app_store.Path() != expected_path {
		t.Fatalf("expected store path %q, got %q", expected_path, app_store.Path())
	}
	if _, err := os.Stat(expected_path); err != nil {
		t.Fatalf("stat fallback store: %v", err)
	}
	if warning := active_vault_warning(VaultRegistry{
		ActiveVaultID: "deleted",
		Vaults: []VaultEntry{{
			ID:       "deleted",
			Path:     missing_path,
			Provider: vault_provider_local,
		}},
	}); !strings.Contains(warning, "已被删除") {
		t.Fatalf("expected deleted vault warning, got %q", warning)
	}
}
