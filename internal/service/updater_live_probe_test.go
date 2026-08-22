package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	updater "github.com/ltaoo/velo/updater/api"
	urestart "github.com/ltaoo/velo/updater/restart"
	utypes "github.com/ltaoo/velo/updater/types"
	"github.com/rs/zerolog"
)

func TestLiveThreadNoteUpdateDownload(t *testing.T) {
	if os.Getenv("THREADNOTE_LIVE_UPDATE_TEST") != "1" {
		t.Skip("set THREADNOTE_LIVE_UPDATE_TEST=1 to download the current GitHub release")
	}
	logger := zerolog.Nop()
	app_updater, err := updater.NewUpdaterWithOptions(&utypes.UpdaterOptions{
		Config: &utypes.UpdateConfig{
			Enabled:        true,
			CheckFrequency: "manual",
			Channel:        "stable",
			Timeout:        300,
			Sources: []utypes.UpdateSource{{
				Type:              "github",
				Priority:          1,
				GitHubRepo:        "ltaoo/ThreadNote",
				Enabled:           true,
				NeedCheckChecksum: true,
			}},
		},
		CurrentVersion: "0.1.0",
		Downloader:     new_update_downloader(&logger),
		Logger:         &logger,
		StatePath:      filepath.Join(t.TempDir(), "update_state.json"),
	}, &logger)
	if err != nil {
		t.Fatalf("create updater: %v", err)
	}

	release_info, err := app_updater.CheckForUpdatesForce(context.Background())
	if err != nil {
		t.Fatalf("check update: %v", err)
	}
	if release_info == nil || !release_info.IsNewer {
		t.Fatal("expected a release newer than 0.1.0")
	}
	if !strings.Contains(release_info.AssetName, "darwin_arm64") || !strings.HasSuffix(release_info.AssetName, ".dmg") {
		t.Fatalf("unexpected macOS asset: %s", release_info.AssetName)
	}
	if !release_info.NeedCheckChecksum || release_info.Checksum == "" {
		t.Fatal("release checksum was not discovered")
	}

	update_path, err := app_updater.DownloadUpdate(context.Background(), release_info, nil)
	if err != nil {
		t.Fatalf("download update: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Remove(update_path)
	})
	file_info, err := os.Stat(update_path)
	if err != nil {
		t.Fatalf("stat update: %v", err)
	}
	if file_info.Size() != release_info.AssetSize {
		t.Fatalf("download size = %d, want %d", file_info.Size(), release_info.AssetSize)
	}
	t.Logf("version=%s asset=%s bytes=%d checksum=verified", release_info.Version, release_info.AssetName, file_info.Size())
}

func TestConfiguredSelfHostedUpdateDownload(t *testing.T) {
	if os.Getenv("THREADNOTE_SELF_UPDATE_TEST") != "1" {
		t.Skip("set THREADNOTE_SELF_UPDATE_TEST=1 to use the configured self_url")
	}
	config_data, err := os.ReadFile(filepath.Join("..", "..", "velo.json"))
	if err != nil {
		t.Fatalf("read velo.json: %v", err)
	}
	previous_assets := appAssets
	t.Cleanup(func() {
		appAssets = previous_assets
	})
	t.Setenv("HOME", t.TempDir())
	appAssets = Assets{AppConfigData: config_data, Version: "0.1.0"}
	logger := zerolog.Nop()
	app_updater, err := init_updater(&logger, urestart.NewManager(), func() {})
	if err != nil {
		t.Fatalf("init configured updater: %v", err)
	}
	release_info, err := app_updater.CheckForUpdatesForce(context.Background())
	if err != nil {
		t.Fatalf("check configured self-hosted update: %v", err)
	}
	if !strings.HasPrefix(release_info.AssetURL, "http://127.0.0.1:8080/") {
		t.Fatalf("self-hosted asset URL = %q", release_info.AssetURL)
	}
	update_path, err := app_updater.DownloadUpdate(context.Background(), release_info, nil)
	if err != nil {
		t.Fatalf("download configured self-hosted update: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Remove(update_path)
	})
	file_info, err := os.Stat(update_path)
	if err != nil {
		t.Fatal(err)
	}
	if file_info.Size() != release_info.AssetSize {
		t.Fatalf("download size = %d, want %d", file_info.Size(), release_info.AssetSize)
	}
	t.Logf("self_url version=%s asset=%s bytes=%d", release_info.Version, release_info.AssetName, file_info.Size())
}
