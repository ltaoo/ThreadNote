package desktopapp

import (
	"runtime"

	"example/simple/internal/desktopapp/windowing"

	"github.com/ltaoo/velo"
	"github.com/ltaoo/velo/tray"
	"github.com/rs/zerolog"
)

func setup_tray(b *velo.Box, logger *zerolog.Logger) {
	settings_item := &tray.MenuItem{
		Label: "设置",
		Click: func(_ *tray.MenuItem) {
			open_settings_from_tray(b, logger)
		},
	}
	exit_item := &tray.MenuItem{
		Label: "退出",
		Click: func(_ *tray.MenuItem) {
			logger.Info().Msg("exiting from system tray")
			quit_application()
		},
	}

	desktop_tray := tray.NewTray()
	desktop_tray.Icon = appAssets.TrayIcon
	desktop_tray.IsTemplate = runtime.GOOS == "darwin"
	desktop_tray.Tooltip = "ThreadNote"
	desktop_tray.Menu = &tray.Menu{Items: []*tray.MenuItem{settings_item, exit_item}}
	tray.Setup(desktop_tray)
}

func open_settings_from_tray(b *velo.Box, logger *zerolog.Logger) {
	settings_spec := windowing.BuildOpenWindowSpec(windowing.OpenWindowRequest{Pathname: "/settings"})
	fixed := persistedWindowFixed(b.Store, settings_spec.Name)
	pathname := pathnameWithFixed(settings_spec.Pathname, fixed)
	if err := rememberWindowSpec(b.Store, windowing.WindowSpec{
		EntryPage: settings_spec.EntryPage,
		Height:    settings_spec.Height,
		Name:      settings_spec.Name,
		Pathname:  pathname,
		Title:     settings_spec.Title,
		Width:     settings_spec.Width,
	}); err != nil {
		logger.Warn().Err(err).Msg("failed to remember settings window opened from tray")
	}
	if fixed {
		if err := updatePersistedOpenWindowFixed(b.Store, settings_spec.Name, true); err != nil {
			logger.Warn().Err(err).Msg("failed to restore fixed settings window state")
		}
	}

	b.OpenWindow(&velo.VeloWebviewOpt{
		Name:       settings_spec.Name,
		Title:      settings_spec.Title,
		Pathname:   pathname,
		Width:      settings_spec.Width,
		Height:     settings_spec.Height,
		EntryPage:  settings_spec.EntryPage,
		FrontendFS: appAssets.FrontendFS,
		OnClose:    forgetPersistedOpenWindowOnClose(b.Store, logger),
	})
}
