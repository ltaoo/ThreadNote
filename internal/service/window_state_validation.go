package service

import "github.com/ltaoo/velo/store"

const (
	minimumPersistedWindowHeight = 240
	minimumPersistedWindowWidth  = 320
	windowsMinimizedCoordinate   = -30000
)

func usablePersistedWindowDimensions(width, height int) bool {
	return width >= minimumPersistedWindowWidth && height >= minimumPersistedWindowHeight
}

func usablePersistedWindowPosition(x, y int) bool {
	// Windows reports minimized windows near (-32000, -32000). Persisting that
	// sentinel makes the next application window appear to be missing.
	return x > windowsMinimizedCoordinate && y > windowsMinimizedCoordinate
}

func usablePersistedWindowState(state *store.WindowState) bool {
	return state != nil &&
		usablePersistedWindowDimensions(state.Width, state.Height) &&
		usablePersistedWindowPosition(state.X, state.Y)
}

func saveUsableWindowState(windowStore *store.Store, name string, state *store.WindowState) (bool, error) {
	if !usablePersistedWindowState(state) {
		return false, nil
	}
	return true, windowStore.SaveWindow(name, state)
}

func repairStoredWindowState(windowStore *store.Store, name string, defaultWidth, defaultHeight int) (bool, error) {
	if windowStore == nil || name == "" {
		return false, nil
	}

	saved := windowStore.GetWindow(name)
	if saved == nil || usablePersistedWindowState(saved) {
		return false, nil
	}

	repaired := &store.WindowState{
		X:      saved.X,
		Y:      saved.Y,
		Width:  saved.Width,
		Height: saved.Height,
	}
	if !usablePersistedWindowDimensions(repaired.Width, repaired.Height) {
		repaired.Width = defaultWidth
		repaired.Height = defaultHeight
	}
	if !usablePersistedWindowPosition(repaired.X, repaired.Y) {
		repaired.X = 0
		repaired.Y = 0
	}

	return true, windowStore.SaveWindow(name, repaired)
}
