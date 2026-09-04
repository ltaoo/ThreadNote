//go:build !windows

package service

// RunUpdateHelperIfRequested is a no-op on platforms whose application bundle
// can be replaced by Velo after the native event loop has stopped.
func RunUpdateHelperIfRequested(_ []string) bool {
	return false
}
