package service

import (
	"testing"

	"github.com/ltaoo/velo/store"
)

func TestRepairStoredWindowStateReplacesWindowsMinimizedGeometry(t *testing.T) {
	windowStore := store.NewWithDir(t.TempDir())
	if err := windowStore.SaveWindow("vault-picker", &store.WindowState{
		X:      -32000,
		Y:      -32000,
		Width:  160,
		Height: 39,
	}); err != nil {
		t.Fatal(err)
	}

	repaired, err := repairStoredWindowState(windowStore, "vault-picker", 760, 640)
	if err != nil {
		t.Fatal(err)
	}
	if !repaired {
		t.Fatal("minimized Windows geometry was not repaired")
	}

	state := windowStore.GetWindow("vault-picker")
	if state.X != 0 || state.Y != 0 || state.Width != 760 || state.Height != 640 {
		t.Fatalf("repaired state = %#v, want visible 760x640 defaults", state)
	}
}

func TestRepairStoredWindowStatePreservesUsableMultiMonitorGeometry(t *testing.T) {
	windowStore := store.NewWithDir(t.TempDir())
	want := &store.WindowState{X: -1440, Y: 80, Width: 900, Height: 700}
	if err := windowStore.SaveWindow("desktop", want); err != nil {
		t.Fatal(err)
	}

	repaired, err := repairStoredWindowState(windowStore, "desktop", 1024, 768)
	if err != nil {
		t.Fatal(err)
	}
	if repaired {
		t.Fatal("usable multi-monitor geometry should not be changed")
	}

	if got := windowStore.GetWindow("desktop"); got.X != want.X || got.Y != want.Y || got.Width != want.Width || got.Height != want.Height {
		t.Fatalf("stored state = %#v, want %#v", got, want)
	}
}

func TestSaveUsableWindowStateIgnoresMinimizedSnapshot(t *testing.T) {
	windowStore := store.NewWithDir(t.TempDir())
	want := &store.WindowState{X: 120, Y: 80, Width: 1024, Height: 768}
	if err := windowStore.SaveWindow("desktop", want); err != nil {
		t.Fatal(err)
	}

	saved, err := saveUsableWindowState(windowStore, "desktop", &store.WindowState{
		X:      -32000,
		Y:      -32000,
		Width:  160,
		Height: 39,
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved {
		t.Fatal("minimized snapshot should be ignored")
	}

	if got := windowStore.GetWindow("desktop"); got.X != want.X || got.Y != want.Y || got.Width != want.Width || got.Height != want.Height {
		t.Fatalf("stored state = %#v, want prior valid state %#v", got, want)
	}
}
