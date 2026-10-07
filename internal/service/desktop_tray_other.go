//go:build !darwin

package service

import (
	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

// Other platforms retain the existing startup tray implementation.
func new_tray_visibility_handler(b *velo.Box, logger *zerolog.Logger) func(bool) {
	initialized := false
	return func(visible bool) {
		if visible && !initialized {
			create_legacy_tray(b, logger)
			initialized = true
		}
	}
}
