package main

import (
	"embed"
	"os"
	"path/filepath"
	"runtime"

	"example/simple/internal/desktopapp"
	"example/simple/internal/entrypoint"
)

//go:embed frontend
var frontend_fs embed.FS

//go:embed velo.json
var app_config_data []byte

//go:embed assets/threadnote-logo.png
var app_icon []byte

//go:embed assets/threadnote-tray.png
var tray_icon []byte

var Version = "1.0.0"
var Mode = "dev"

func project_dir() string {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "."
	}
	return filepath.Dir(filename)
}

func main() {
	if desktopapp.RunUpdateHelperIfRequested(os.Args[1:]) {
		return
	}
	if handled, exit_code := entrypoint.Run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, Version); handled {
		if exit_code != 0 {
			os.Exit(exit_code)
		}
		return
	}
	desktopapp.Run(desktopapp.Assets{
		AppConfigData: app_config_data,
		AppIcon:       app_icon,
		FrontendFS:    frontend_fs,
		Mode:          Mode,
		ProjectDir:    project_dir(),
		TrayIcon:      tray_icon,
		Version:       Version,
	})
}
