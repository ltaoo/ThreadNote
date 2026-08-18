//go:build windows

package desktopapp

import (
	"github.com/ltaoo/velo/tray"
	"github.com/ltaoo/velo/webview"
)

func quit_application() {
	tray.Quit()
	webview.Terminate()
}
