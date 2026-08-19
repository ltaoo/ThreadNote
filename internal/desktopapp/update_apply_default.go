//go:build !windows

package desktopapp

import (
	"context"
)

func apply_downloaded_update_and_restart(ctx context.Context, app_updater *application_updater, _ string) error {
	return app_updater.ApplyUpdateThenRestartApplication(ctx)
}
