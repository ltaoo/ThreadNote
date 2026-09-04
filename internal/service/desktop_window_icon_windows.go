//go:build windows

package service

import (
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/rs/zerolog"
)

const (
	windows_icon_big       = 1
	windows_icon_small     = 0
	windows_sm_cxicon      = 11
	windows_sm_cyicon      = 12
	windows_sm_cxsmicon    = 49
	windows_sm_cysmicon    = 50
	windows_gclp_hicon     = -14
	windows_gclp_hiconsm   = -34
	windows_wm_seticon     = 0x0080
	windows_icon_version_3 = 0x00030000
)

var (
	windows_user32                       = syscall.NewLazyDLL("user32.dll")
	windows_create_icon_from_resource_ex = windows_user32.NewProc("CreateIconFromResourceEx")
	windows_destroy_icon                 = windows_user32.NewProc("DestroyIcon")
	windows_enum_windows                 = windows_user32.NewProc("EnumWindows")
	windows_get_class_name               = windows_user32.NewProc("GetClassNameW")
	windows_get_system_metrics           = windows_user32.NewProc("GetSystemMetrics")
	windows_get_window_thread_process_id = windows_user32.NewProc("GetWindowThreadProcessId")
	windows_post_message                 = windows_user32.NewProc("PostMessageW")
	windows_set_class_long_ptr           = windows_user32.NewProc("SetClassLongPtrW")
)

type windows_icon_handles struct {
	large uintptr
	small uintptr
}

func setup_desktop_window_icon(icon_data []byte, logger *zerolog.Logger) func() {
	icons := create_windows_icon_handles(icon_data)
	if icons.large == 0 && icons.small == 0 {
		logger.Warn().Msg("failed to create Windows window icon from application icon")
		return func() {}
	}

	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)

		ticker := time.NewTicker(25 * time.Millisecond)
		defer ticker.Stop()
		timeout := time.NewTimer(10 * time.Second)
		defer timeout.Stop()

		for {
			if window := find_velo_window(); window != 0 {
				apply_windows_window_icons(window, icons)
				logger.Debug().Msg("set Windows window and taskbar icon")
				return
			}
			select {
			case <-ticker.C:
			case <-timeout.C:
				logger.Warn().Msg("timed out waiting to set Windows window icon")
				return
			case <-stop:
				return
			}
		}
	}()

	return func() {
		close(stop)
		<-done
		destroy_windows_icon_handles(icons)
	}
}

func create_windows_icon_handles(icon_data []byte) windows_icon_handles {
	if len(icon_data) == 0 {
		return windows_icon_handles{}
	}
	return windows_icon_handles{
		large: create_windows_icon(icon_data, system_metric(windows_sm_cxicon), system_metric(windows_sm_cyicon)),
		small: create_windows_icon(icon_data, system_metric(windows_sm_cxsmicon), system_metric(windows_sm_cysmicon)),
	}
}

func create_windows_icon(icon_data []byte, width int, height int) uintptr {
	icon, _, _ := windows_create_icon_from_resource_ex.Call(
		uintptr(unsafe.Pointer(&icon_data[0])),
		uintptr(len(icon_data)),
		1,
		windows_icon_version_3,
		uintptr(width),
		uintptr(height),
		0,
	)
	return icon
}

func system_metric(index int) int {
	value, _, _ := windows_get_system_metrics.Call(uintptr(index))
	return int(value)
}

func find_velo_window() uintptr {
	var found uintptr
	pid := uint32(os.Getpid())
	callback := syscall.NewCallback(func(window uintptr, _ uintptr) uintptr {
		var window_pid uint32
		windows_get_window_thread_process_id.Call(window, uintptr(unsafe.Pointer(&window_pid)))
		if window_pid != pid || windows_window_class(window) != "WebView2WindowClass" {
			return 1
		}
		found = window
		return 0
	})
	windows_enum_windows.Call(callback, 0)
	return found
}

func windows_window_class(window uintptr) string {
	buffer := make([]uint16, 64)
	length, _, _ := windows_get_class_name.Call(
		window,
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)
	if length == 0 {
		return ""
	}
	return syscall.UTF16ToString(buffer[:length])
}

func apply_windows_window_icons(window uintptr, icons windows_icon_handles) {
	if icons.large != 0 {
		windows_set_class_long_ptr.Call(window, signed_windows_index(windows_gclp_hicon), icons.large)
		windows_post_message.Call(window, windows_wm_seticon, windows_icon_big, icons.large)
	}
	if icons.small != 0 {
		windows_set_class_long_ptr.Call(window, signed_windows_index(windows_gclp_hiconsm), icons.small)
		windows_post_message.Call(window, windows_wm_seticon, windows_icon_small, icons.small)
	}
}

func signed_windows_index(index int) uintptr {
	return uintptr(int32(index))
}

func destroy_windows_icon_handles(icons windows_icon_handles) {
	if icons.large != 0 {
		windows_destroy_icon.Call(icons.large)
	}
	if icons.small != 0 && icons.small != icons.large {
		windows_destroy_icon.Call(icons.small)
	}
}
