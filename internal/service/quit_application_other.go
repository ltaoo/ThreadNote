//go:build !darwin && !windows

package service

import "os"

func quit_application() {
	os.Exit(0)
}
