package service

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"example/simple/internal/desktopapp/windowing"

	"github.com/ltaoo/velo"
	veloerr "github.com/ltaoo/velo/error"
	"github.com/ltaoo/velo/shortcut"
	"github.com/ltaoo/velo/store"
	updater "github.com/ltaoo/velo/updater/api"
	urestart "github.com/ltaoo/velo/updater/restart"
	utypes "github.com/ltaoo/velo/updater/types"
	uversion "github.com/ltaoo/velo/updater/version"

	"github.com/rs/zerolog"
)

type Assets struct {
	AppConfigData []byte
	AppIcon       []byte
	FrontendFS    fs.FS
	Mode          string
	ProjectDir    string
	TrayIcon      []byte
	Version       string
}

var appAssets Assets
var mainWindowPathname = "/home/index"

func appVersion() string {
	if appAssets.Version == "" {
		return "1.0.0"
	}
	return appAssets.Version
}

func appMode() string {
	if appAssets.Mode == "" {
		return "dev"
	}
	return appAssets.Mode
}

func setupLogger() *zerolog.Logger {
	homeDir, _ := os.UserHomeDir()
	logDir := filepath.Join(homeDir, ".myapp")
	os.MkdirAll(logDir, 0755)
	logFile, err := os.OpenFile(filepath.Join(logDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)

	var writer io.Writer
	if err != nil {
		writer = zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}
	} else if appMode() == "release" {
		writer = logFile
	} else {
		writer = io.MultiWriter(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}, logFile)
	}
	logger := zerolog.New(writer).With().Timestamp().Logger()
	return &logger
}

func fatal(logger *zerolog.Logger, msg string) {
	logger.Error().Msg(msg)
	veloerr.ShowErrorDialog(msg)
	os.Exit(1)
}

func projectDir() string {
	if appAssets.ProjectDir != "" {
		return appAssets.ProjectDir
	}
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "."
	}
	return filepath.Dir(filename)
}

func init_updater(logger *zerolog.Logger, restart_coordinator utypes.RestartCoordinator, request_shutdown func()) (*application_updater, error) {
	app_cfg := velo.LoadAppConfig(appAssets.AppConfigData)
	update_config := app_cfg.Update.ToUpdaterConfig()
	version_info := uversion.ParseVersionInfo(appVersion(), update_config)
	if !version_info.UpdateMode.IsEnabled() {
		return nil, fmt.Errorf("auto-update is disabled (mode: %s)", version_info.UpdateMode)
	}
	effective_version := appVersion()
	if version_info.IsDevelopment() && update_config.DevVersion != "" {
		effective_version = update_config.DevVersion
	}
	home_dir, _ := os.UserHomeDir()
	state_path := filepath.Join(home_dir, ".myapp", "update_state.json")
	self_sources := make([]utypes.UpdateSource, 0)
	fallback_sources := make([]utypes.UpdateSource, 0, len(update_config.Sources))
	for _, source := range update_config.Sources {
		if source.Enabled && strings.TrimSpace(source.SelfURL) != "" {
			self_sources = append(self_sources, source)
			continue
		}
		fallback_sources = append(fallback_sources, source)
	}
	fallback_config := *update_config
	if len(fallback_sources) > 0 {
		fallback_config.Sources = fallback_sources
	}
	opts := utypes.UpdaterOptions{
		Config:             &fallback_config,
		CurrentVersion:     effective_version,
		Downloader:         new_update_downloader(logger),
		Logger:             logger,
		StatePath:          state_path,
		RestartCoordinator: restart_coordinator,
		RequestShutdown:    request_shutdown,
	}
	velo_updater, err := updater.NewUpdaterWithOptions(&opts, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to create updater: %w", err)
	}
	return &application_updater{
		current_version: effective_version,
		self_sources:    self_sources,
		velo_updater:    velo_updater,
	}, nil
}

func setMainWindowPathname(pathname string) {
	if pathname != "" {
		mainWindowPathname = pathname
	}
}

func currentMainWindowPathname() string {
	if mainWindowPathname == "" {
		return "/home/index"
	}
	return mainWindowPathname
}

func mainWindowOptions(pathname string, b *velo.Box, logger *zerolog.Logger) *velo.VeloWebviewOpt {
	if pathname == "" {
		pathname = currentMainWindowPathname()
	}
	return &velo.VeloWebviewOpt{
		Name:                 "desktop",
		Title:                windowing.AppTitle,
		FrontendFS:           appAssets.FrontendFS,
		Pathname:             pathname,
		Width:                1024,
		Height:               768,
		PreserveStateOnFocus: true,
		OnReopen: func() {
			showMainWindow(b, logger)
		},
	}
}

func showMainWindow(b *velo.Box, logger *zerolog.Logger) {
	b.OpenWindow(mainWindowOptions(currentMainWindowPathname(), b, logger))
	b.SendMessage(velo.H{"type": "main_window_focus"})
}

func Run(assets Assets) {
	appAssets = assets

	logger := setupLogger()
	restart_manager := urestart.NewManager()
	logger.Info().Msgf("Version: %s, Velo: %s, Mode: %s, OS: %s/%s", appVersion(), velo.GetVersion(), appMode(), runtime.GOOS, runtime.GOARCH)

	app_updater, err := init_updater(logger, restart_manager, quit_application)
	if err != nil {
		logger.Warn().Msgf("Updater init: %v", err)
	}

	// Closing every window keeps ThreadNote available from the system tray. The
	// tray's Exit item remains the explicit way to terminate the application.
	quit_on_last_window_closed := false
	opt := velo.VeloAppOpt{
		Mode:                   velo.ModeBridge,
		IconData:               appAssets.AppIcon,
		EnableLocalStorage:     false,
		QuitOnLastWindowClosed: &quit_on_last_window_closed,
	}
	b := velo.NewApp(&opt)
	initialPathname := "/vault-picker"
	if startupVault, err := loadStartupVault(); err != nil {
		logger.Warn().Msgf("Active vault unavailable: %v", err)
	} else if startupVault != nil {
		setActiveVault(startupVault)
		if _, err := registerActiveVault(startupVault); err != nil {
			logger.Warn().Msgf("Failed to update active vault registry: %v", err)
		}
		b.Store = store.NewWithDir(startupVault.VeloDir)
		initialPathname = "/home/index"
		logger.Info().Msgf("Active vault: %s", startupVault.RootDir)
	} else if dir, err := globalVeloDir(); err == nil {
		if err := os.MkdirAll(dir, 0755); err != nil {
			logger.Warn().Msgf("Failed to create global velo dir: %v", err)
		} else {
			b.Store = store.NewWithDir(dir)
		}
	}
	setMainWindowPathname(initialPathname)
	logger.Info().Msgf("Store path: %s", b.Store.Path())

	inputSourceLock := NewInputSourceLockService(logger)
	applyStoredInputSourceLockSettings(b.Store, inputSourceLock, logger)
	memoAgent := newMemoAgentService(logger)

	registerRoutes(b, logger, app_updater, inputSourceLock, memoAgent)
	initClipboardReader(logger)
	externalAPIServer := startExternalAPIServer(logger)

	reminderScheduler := NewReminderScheduler(logger)
	reminderScheduler.Start()

	fmt.Println("starting server...")

	sm := shortcut.NewManager()
	_ = sm

	b.NewWebview(mainWindowOptions(initialPathname, b, logger))
	setup_tray(b, logger)
	if initialPathname == "/home/index" {
		go func() {
			time.Sleep(1100 * time.Millisecond)
			restorePersistedOpenWindows(b, logger)
		}()
	}

	// 注册全局快捷键: Cmd+Shift+M/H 显示/隐藏主窗口，Ctrl/Cmd+Shift+Space 打开 snippet 启动器。
	// Carbon hotkeys need the AppKit application/run loop to be ready. Register
	// shortly after b.Run starts instead of racing NSApplication initialization.
	go func() {
		time.Sleep(800 * time.Millisecond)
		registerShortcut := func(keys string, handler func()) {
			if err := sm.Register(keys, func() {
				logger.Info().Str("shortcut", keys).Msg("global shortcut triggered")
				handler()
			}); err != nil {
				logger.Warn().Err(err).Str("shortcut", keys).Msg("failed to register global shortcut")
			} else {
				logger.Info().Str("shortcut", keys).Msg("registered global shortcut")
			}
		}
		registerShortcut("MetaLeft+ShiftLeft+KeyM", func() {
			showMainWindow(b, logger)
		})
		registerShortcut("MetaLeft+ShiftLeft+KeyH", func() {
			b.Webview.Hide()
		})
		for _, keys := range snippetLauncherShortcuts {
			registerShortcut(keys, func() {
				openSnippetLauncher(b)
			})
		}
	}()
	b.Run()

	reminderScheduler.Stop()
	shutdown_mcp_http_server(logger)
	shutdownExternalAPIServer(externalAPIServer, logger)
	memoAgent.Close()
	inputSourceLock.Stop()

	if _, err := restart_manager.ReplaceIfRequested(); err != nil {
		logger.Error().Err(err).Msg("failed to restart after applying update")
	}
}
