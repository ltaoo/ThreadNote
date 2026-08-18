//go:build !darwin && !windows

package desktopapp

import "os"

func quit_application() {
	os.Exit(0)
}
