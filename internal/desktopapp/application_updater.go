package desktopapp

import (
	"context"
	"fmt"

	updater "github.com/ltaoo/velo/updater/api"
	utypes "github.com/ltaoo/velo/updater/types"
)

type application_updater struct {
	current_version string
	self_sources    []utypes.UpdateSource
	velo_updater    *updater.AppUpdater
}

func (u *application_updater) CheckForUpdatesForce(ctx context.Context) (*utypes.ReleaseInfo, error) {
	self_errors := make([]error, 0, len(u.self_sources))
	for _, source := range u.self_sources {
		release_info, err := check_self_github_release(ctx, source, u.current_version)
		if err == nil {
			return release_info, nil
		}
		self_errors = append(self_errors, err)
	}
	if u.velo_updater != nil {
		release_info, err := u.velo_updater.CheckForUpdatesForce(ctx)
		if err == nil {
			return release_info, nil
		}
		self_errors = append(self_errors, err)
	}
	if len(self_errors) == 0 {
		return nil, fmt.Errorf("no update sources configured")
	}
	return nil, fmt.Errorf("all update sources failed: %v", self_errors)
}

func (u *application_updater) DownloadUpdate(
	ctx context.Context,
	release_info *utypes.ReleaseInfo,
	on_progress utypes.DownloadCallback,
) (string, error) {
	return u.velo_updater.DownloadUpdate(ctx, release_info, on_progress)
}

func (u *application_updater) ApplyUpdateThenRestartApplication(ctx context.Context) error {
	return u.velo_updater.ApplyUpdateThenRestartApplication(ctx)
}

func (u *application_updater) RestartApplication(arguments []string) error {
	return u.velo_updater.RestartApplication(arguments)
}

func (u *application_updater) SkipVersion(version string) error {
	return u.velo_updater.SkipVersion(version)
}
