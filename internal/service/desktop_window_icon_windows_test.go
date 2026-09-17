//go:build windows

package service

import (
	"bytes"
	"image"
	"image/png"
	"os"
	"syscall"
	"testing"
	"unsafe"
)

var (
	windows_gdi32           = syscall.NewLazyDLL("gdi32.dll")
	windows_get_object      = windows_gdi32.NewProc("GetObjectW")
	windows_delete_object   = windows_gdi32.NewProc("DeleteObject")
	windows_get_icon_info_w = windows_user32.NewProc("GetIconInfo")
)

type windows_bitmap struct {
	Type       int32
	Width      int32
	Height     int32
	WidthBytes int32
	Planes     uint16
	BitsPixel  uint16
	Bits       uintptr
}

type windows_icon_info struct {
	Icon     int32
	XHotspot uint32
	YHotspot uint32
	Mask     uintptr
	Color    uintptr
}

func TestCreateWindowsIconHandlesFromApplicationPNG(t *testing.T) {
	icon_data, err := os.ReadFile("../../assets/threadnote-logo.png")
	if err != nil {
		t.Fatal(err)
	}

	icons := create_windows_icon_handles(icon_data)
	defer destroy_windows_icon_handles(icons)

	if icons.large == 0 {
		t.Error("large Windows icon handle was not created")
	}
	if icons.small == 0 {
		t.Error("small Windows icon handle was not created")
	}

	assert_windows_icon_size(t, "large", icons.large, system_metric(windows_sm_cxicon), system_metric(windows_sm_cyicon))
	assert_windows_icon_size(t, "small", icons.small, system_metric(windows_sm_cxsmicon), system_metric(windows_sm_cysmicon))
}

func TestSizedWindowsIconPNGFillsCanvas(t *testing.T) {
	icon_data, err := os.ReadFile("../../assets/threadnote-logo.png")
	if err != nil {
		t.Fatal(err)
	}

	sized := sized_windows_icon_png(icon_data, 32, 32)
	decoded, _, err := image.Decode(bytes.NewReader(sized))
	if err != nil {
		t.Fatal(err)
	}
	content := opaque_bounds(decoded)
	if content.Empty() {
		t.Fatal("sized icon has no visible content")
	}
	coverage := float64(content.Dx()*content.Dy()) / float64(32*32)
	if coverage < 0.95 {
		t.Errorf("sized icon visible coverage = %.2f, want >= 0.95 (transparent padding was not trimmed)", coverage)
	}
	if _, err := png.Decode(bytes.NewReader(sized)); err != nil {
		t.Errorf("sized icon is not a valid PNG: %v", err)
	}
}

func assert_windows_icon_size(t *testing.T, label string, icon uintptr, want_width int, want_height int) {
	t.Helper()
	var info windows_icon_info
	if result, _, _ := windows_get_icon_info_w.Call(icon, uintptr(unsafe.Pointer(&info))); result == 0 {
		t.Fatalf("%s icon GetIconInfo failed", label)
	}
	if info.Mask != 0 {
		defer windows_delete_object.Call(info.Mask)
	}
	if info.Color != 0 {
		defer windows_delete_object.Call(info.Color)
	}
	if info.Color == 0 {
		t.Fatalf("%s icon has no color bitmap", label)
	}
	var bitmap windows_bitmap
	if result, _, _ := windows_get_object.Call(info.Color, unsafe.Sizeof(bitmap), uintptr(unsafe.Pointer(&bitmap))); result == 0 {
		t.Fatalf("%s icon GetObject failed", label)
	}
	if int(bitmap.Width) != want_width || int(bitmap.Height) != want_height {
		t.Errorf("%s icon size = %dx%d, want %dx%d", label, bitmap.Width, bitmap.Height, want_width, want_height)
	}
}
