package service

import (
	"context"
	"sync"
	"time"

	"example/simple/internal/desktopapp/windowing"

	"github.com/ltaoo/velo"
	utypes "github.com/ltaoo/velo/updater/types"
)

func register_update_and_window_routes(b *velo.Box, app_updater *application_updater) {
	var update_path_mu sync.Mutex
	downloaded_update_path := ""

	b.Get("/api/update/check", func(c *velo.BoxContext) interface{} {
		if app_updater == nil {
			return c.Error("Updater not initialized")
		}
		ctx, cancel := context.WithTimeout(c.Context(), 30*time.Second)
		defer cancel()
		release_info, err := app_updater.CheckForUpdatesForce(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		if release_info != nil && release_info.IsNewer {
			return c.Ok(velo.H{
				"assetName":      release_info.AssetName,
				"assetSize":      release_info.AssetSize,
				"currentVersion": appVersion(),
				"hasUpdate":      true,
				"publishedAt":    release_info.PublishedAt,
				"releaseNotes":   release_info.ReleaseNotes,
				"version":        release_info.Version,
			})
		}
		return c.Ok(velo.H{"hasUpdate": false, "currentVersion": appVersion()})
	})
	b.Post("/api/update/download", func(c *velo.BoxContext) interface{} {
		if app_updater == nil {
			return c.Ok(velo.H{"success": false, "error": "Updater not initialized"})
		}
		ctx := c.Context()
		release_info, err := app_updater.CheckForUpdatesForce(ctx)
		if err != nil {
			return c.Ok(velo.H{"success": false, "error": err.Error()})
		}
		if release_info == nil || !release_info.IsNewer {
			return c.Ok(velo.H{"success": false, "error": "No update available"})
		}
		update_path, err := app_updater.DownloadUpdate(ctx, release_info, func(progress utypes.DownloadProgress) {
			b.SendMessage(velo.H{
				"type":            "download_progress",
				"bytesDownloaded": progress.BytesDownloaded,
				"totalBytes":      progress.TotalBytes,
				"percentage":      progress.Percentage,
				"speed":           progress.Speed,
			})
		})
		if err != nil {
			return c.Ok(velo.H{"success": false, "error": err.Error()})
		}
		update_path_mu.Lock()
		downloaded_update_path = update_path
		update_path_mu.Unlock()
		return c.Ok(velo.H{"success": true, "assetName": release_info.AssetName, "updatePath": update_path, "version": release_info.Version})
	})
	b.Post("/api/update/restart", func(c *velo.BoxContext) interface{} {
		if app_updater == nil {
			return c.Ok(velo.H{"success": false, "error": "Updater not initialized"})
		}
		update_path_mu.Lock()
		update_path := downloaded_update_path
		update_path_mu.Unlock()
		if update_path == "" {
			return c.Ok(velo.H{"success": false, "error": "No downloaded update available"})
		}
		if err := apply_downloaded_update_and_restart(c.Context(), app_updater, update_path); err != nil {
			return c.Ok(velo.H{"success": false, "error": err.Error()})
		}
		return c.Ok(velo.H{"success": true})
	})
	b.Post("/api/update/skip", func(c *velo.BoxContext) interface{} {
		if app_updater == nil {
			return c.Ok(velo.H{"success": false, "error": "Updater not initialized"})
		}
		args, _ := c.Args().(map[string]interface{})
		v, _ := args["version"].(string)
		if v == "" {
			return c.Ok(velo.H{"success": false, "error": "version required"})
		}
		if err := app_updater.SkipVersion(v); err != nil {
			return c.Ok(velo.H{"success": false, "error": err.Error()})
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Get("/api/open_window", func(c *velo.BoxContext) interface{} {
		storageID := sanitizeStorageID(c.Query("storageId"))
		objectPath := cleanOSSObjectPath(c.Query("objectPath"))
		previewID := sanitizeStorageID(c.Query("previewId"))
		spec := windowing.BuildOpenWindowSpec(windowing.OpenWindowRequest{
			ObjectPath:       objectPath,
			ObjectPathSuffix: sanitizeStorageID(objectPath),
			Pathname:         c.Query("pathname"),
			PreviewID:        previewID,
			PreviewSrc:       c.Query("previewSrc"),
			PreviewTitle:     c.Query("previewTitle"),
			Provider:         c.Query("provider"),
			StorageID:        storageID,
		})
		fixed := persistedWindowFixed(b.Store, spec.Name)
		pathname := pathnameWithFixed(spec.Pathname, fixed)
		if err := rememberWindowSpec(b.Store, windowing.WindowSpec{
			EntryPage: spec.EntryPage,
			Height:    spec.Height,
			Name:      spec.Name,
			Pathname:  pathname,
			Title:     spec.Title,
			Width:     spec.Width,
		}); err != nil {
			return c.Error(err.Error())
		}
		if fixed {
			_ = updatePersistedOpenWindowFixed(b.Store, spec.Name, true)
		}
		b.OpenWindow(&velo.VeloWebviewOpt{
			Name:       spec.Name,
			Title:      spec.Title,
			Pathname:   pathname,
			Width:      spec.Width,
			Height:     spec.Height,
			EntryPage:  spec.EntryPage,
			FrontendFS: appAssets.FrontendFS,
			OnClose:    forgetPersistedOpenWindowOnClose(b.Store, nil),
		})
		return c.Ok(velo.H{"success": true})
	})
}
