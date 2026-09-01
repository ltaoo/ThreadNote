//go:build !windows

package service

import "github.com/rs/zerolog"

func setup_desktop_window_icon(_ []byte, _ *zerolog.Logger) func() {
	return func() {}
}
