//go:build darwin

package service

/*
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>
void threadnote_set_tray_visible(int visible, const void *icon, int length);
*/
import "C"

import (
	"sync"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

var tray_callback_lock sync.RWMutex
var tray_settings_callback func()
var tray_exit_callback func()

func new_tray_visibility_handler(b *velo.Box, logger *zerolog.Logger) func(bool) {
	tray_callback_lock.Lock()
	tray_settings_callback = func() { open_settings_from_tray(b, logger) }
	tray_exit_callback = func() {
		logger.Info().Msg("exiting from system tray")
		quit_application()
	}
	tray_callback_lock.Unlock()
	return func(visible bool) {
		var visible_flag C.int
		if visible {
			visible_flag = 1
		}
		icon_data := C.CBytes(appAssets.TrayIcon)
		defer C.free(icon_data)
		C.threadnote_set_tray_visible(visible_flag, icon_data, C.int(len(appAssets.TrayIcon)))
	}
}

//export threadnote_tray_click
func threadnote_tray_click(action C.int) {
	tray_callback_lock.RLock()
	callback := tray_settings_callback
	if action == 2 {
		callback = tray_exit_callback
	}
	tray_callback_lock.RUnlock()
	if callback != nil {
		go callback()
	}
}
