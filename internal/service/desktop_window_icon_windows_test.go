//go:build windows

package service

import (
	"os"
	"testing"
)

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
}
