// Package desktopapp is the stable entry point for the ThreadNote desktop
// process. Business and infrastructure services live in internal/service.
package desktopapp

import "example/simple/internal/service"

// Assets contains the embedded resources required to start the desktop app.
type Assets = service.Assets

// Run starts the desktop application and all of its services.
func Run(assets Assets) {
	service.Run(assets)
}

// RunUpdateHelperIfRequested handles the platform update-helper invocation.
func RunUpdateHelperIfRequested(arguments []string) bool {
	return service.RunUpdateHelperIfRequested(arguments)
}
