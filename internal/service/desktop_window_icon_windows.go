//go:build windows

package service

import (
	"bytes"
	"image"
	"image/png"
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/rs/zerolog"
	"golang.org/x/image/draw"
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
	large_width := system_metric(windows_sm_cxicon)
	large_height := system_metric(windows_sm_cyicon)
	small_width := system_metric(windows_sm_cxsmicon)
	small_height := system_metric(windows_sm_cysmicon)
	return windows_icon_handles{
		large: create_windows_icon(sized_windows_icon_png(icon_data, large_width, large_height), large_width, large_height),
		small: create_windows_icon(sized_windows_icon_png(icon_data, small_width, small_height), small_width, small_height),
	}
}

// sized_windows_icon_png rescales the application icon to the exact system
// icon size. CreateIconFromResourceEx accepts PNG icon resources, but renders
// them at the PNG's natural size; without rescaling the 1024x1024 logo every
// taskbar/title bar icon would be a blurry system-side downscale. The source
// logo also carries ~100px of transparent padding on every side (the visible
// mark only fills ~65% of the canvas), so the transparent border is trimmed
// before scaling. Otherwise the taskbar icon would show a tiny mark floating
// inside an oversized invisible square.
func sized_windows_icon_png(icon_data []byte, width int, height int) []byte {
	if width <= 0 || height <= 0 {
		return icon_data
	}
	decoded, _, err := image.Decode(bytes.NewReader(icon_data))
	if err != nil {
		return icon_data
	}
	source_bounds := opaque_bounds(decoded)
	if source_bounds.Empty() {
		source_bounds = decoded.Bounds()
	}
	if source_bounds.Dx() == width && source_bounds.Dy() == height {
		return icon_data
	}
	resized := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.CatmullRom.Scale(resized, resized.Bounds(), decoded, source_bounds, draw.Src, nil)
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, resized); err != nil {
		return icon_data
	}
	return buffer.Bytes()
}

// opaque_bounds returns the bounding box of the non-transparent pixels.
func opaque_bounds(decoded image.Image) image.Rectangle {
	full_bounds := decoded.Bounds()
	content := image.Rectangle{}
	found := false
	for y := full_bounds.Min.Y; y < full_bounds.Max.Y; y++ {
		for x := full_bounds.Min.X; x < full_bounds.Max.X; x++ {
			_, _, _, alpha := decoded.At(x, y).RGBA()
			if alpha == 0 {
				continue
			}
			if !found {
				content = image.Rect(x, y, x+1, y+1)
				found = true
				continue
			}
			if x < content.Min.X {
				content.Min.X = x
			}
			if y < content.Min.Y {
				content.Min.Y = y
			}
			if x+1 > content.Max.X {
				content.Max.X = x + 1
			}
			if y+1 > content.Max.Y {
				content.Max.Y = y + 1
			}
		}
	}
	if !found {
		return image.Rectangle{}
	}
	return content
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
