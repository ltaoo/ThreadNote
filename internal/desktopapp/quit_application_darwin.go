//go:build darwin

package desktopapp

import "github.com/ltaoo/velo/tray"

func quit_application() {
	tray.Quit()
}
