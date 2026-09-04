package service

import "github.com/ltaoo/velo"

func register_vault_sync_routes(b *velo.Box) {
	b.Get("/api/vault/sync", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		config, err := load_vault_sync_config(vault_ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		driver := sync_driver_for_context(vault_ctx)
		status, err := driver.status(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"config":             config,
			"status":             status,
			"usesLocalDirectory": sync_provider_uses_local_directory(driver.provider()),
		})
	})

	b.Post("/api/vault/sync/open-directory", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		driver := sync_driver_for_context(vault_ctx)
		if !sync_provider_uses_local_directory(driver.provider()) {
			return c.Error("current sync provider does not use a local directory")
		}
		if err := openFileWithSystemDefault(vault_ctx.RootDir); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"provider": driver.provider(), "success": true})
	})

	b.Post("/api/vault/sync/github/configure", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var config GitHubGitSyncConfig
		if err := c.BindJSON(&config); err != nil {
			return c.Error(err.Error())
		}
		config, err = configure_vault_github_sync(c.Context(), vault_ctx, config)
		if err != nil {
			return c.Error(err.Error())
		}
		status, err := sync_driver_for_context(vault_ctx).status(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"config": config, "status": status, "success": true})
	})

	b.Post("/api/vault/sync/local", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		if err := configure_vault_local_sync(vault_ctx); err != nil {
			return c.Error(err.Error())
		}
		status, err := sync_driver_for_context(vault_ctx).status(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"status": status, "success": true})
	})

	b.Post("/api/vault/sync/pull", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		result, err := sync_driver_for_context(vault_ctx).pull(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		if result.Changed {
			mark_cached_memo_query_index_dirty(vault_ctx)
		}
		return c.Ok(velo.H{"result": result, "success": true})
	})

	b.Post("/api/vault/sync/push", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		result, err := sync_driver_for_context(vault_ctx).push(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"result": result, "success": true})
	})
}
