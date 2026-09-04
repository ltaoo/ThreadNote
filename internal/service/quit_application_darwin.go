//go:build darwin

package service

import "github.com/ltaoo/velo/tray"

func quit_application() {
	tray.Quit()
}
