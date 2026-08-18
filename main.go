package main

import (
	"embed"
	"path/filepath"
	"runtime"

	"example/simple/internal/desktopapp"
)

//go:embed frontend
var frontendFS embed.FS

//go:embed velo.json
var appConfigData []byte

//go:embed assets/threadnote-logo.png
var appIcon []byte

//go:embed assets/threadnote-tray.png
var tray_icon []byte

var Version = "1.0.0"
var Mode = "dev"

func projectDir() string {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "."
	}
	return filepath.Dir(filename)
}

func main() {
	desktopapp.Run(desktopapp.Assets{
		AppConfigData: appConfigData,
		AppIcon:       appIcon,
		FrontendFS:    frontendFS,
		Mode:          Mode,
		ProjectDir:    projectDir(),
		TrayIcon:      tray_icon,
		Version:       Version,
	})
}
