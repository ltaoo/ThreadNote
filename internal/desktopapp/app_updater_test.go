package desktopapp

import (
	"testing"

	urestart "github.com/ltaoo/velo/updater/restart"
	"github.com/rs/zerolog"
)

func TestInitUpdaterConfiguresGracefulRestart(t *testing.T) {
	previous_assets := appAssets
	t.Cleanup(func() {
		appAssets = previous_assets
	})
	t.Setenv("HOME", t.TempDir())

	appAssets = Assets{
		AppConfigData: []byte(`{
			"app": {"name": "ThreadNote", "version": "1.0.0"},
			"update": {
				"enabled": true,
				"check_frequency": "manual",
				"sources": [{
					"type": "http",
					"priority": 1,
					"enabled": true,
					"manifest_url": "https://example.com/manifest.json"
				}]
			}
		}`),
		Version: "1.0.0",
	}

	restart_manager := urestart.NewManager()
	shutdown_called := false
	logger := zerolog.Nop()
	app_updater, err := init_updater(&logger, restart_manager, func() {
		shutdown_called = true
	})
	if err != nil {
		t.Fatalf("init updater: %v", err)
	}
	if err := app_updater.RestartApplication(nil); err != nil {
		t.Fatalf("request restart: %v", err)
	}
	if !shutdown_called {
		t.Fatal("restart did not request graceful shutdown")
	}
	if !restart_manager.Pending() {
		t.Fatal("restart request was not retained for post-cleanup replacement")
	}
}

func TestInitUpdaterLoadsSelfHostedSource(t *testing.T) {
	previous_assets := appAssets
	t.Cleanup(func() {
		appAssets = previous_assets
	})
	t.Setenv("HOME", t.TempDir())

	appAssets = Assets{
		AppConfigData: []byte(`{
			"app": {"name": "ThreadNote", "version": "1.0.0"},
			"update": {
				"enabled": true,
				"sources": [
					{"type": "github", "priority": 0, "enabled": true, "github_repo": "ltaoo/ThreadNote", "self_url": "http://127.0.0.1:8080"},
					{"type": "github", "priority": 100, "enabled": true, "github_repo": "ltaoo/ThreadNote"}
				]
			}
		}`),
		Version: "1.0.0",
	}
	logger := zerolog.Nop()
	app_updater, err := init_updater(&logger, urestart.NewManager(), func() {})
	if err != nil {
		t.Fatalf("init updater: %v", err)
	}
	if len(app_updater.self_sources) != 1 || app_updater.self_sources[0].SelfURL != "http://127.0.0.1:8080" {
		t.Fatalf("self-hosted sources = %#v", app_updater.self_sources)
	}
}
