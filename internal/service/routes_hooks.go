package service

import "github.com/ltaoo/velo"

func registerHookRoutes(b *velo.Box) {
	b.Get("/api/hooks", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		file, err := loadHooks(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"hooks": file.Hooks})
	})

	b.Post("/api/hooks/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var hook HookConfig
		if err := c.BindJSON(&hook); err != nil {
			return c.Error(err.Error())
		}
		hook.ID = newHookID()
		file, err := loadHooks(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		file.Hooks = append(file.Hooks, hook)
		if err := saveHooks(ctx, file); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"hook": hook})
	})

	b.Post("/api/hooks/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			ID      string    `json:"id"`
			Name    *string   `json:"name"`
			URL     *string   `json:"url"`
			Enabled *bool     `json:"enabled"`
			Events  *[]string `json:"events"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		file, err := loadHooks(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		found := false
		for i := range file.Hooks {
			if file.Hooks[i].ID != req.ID {
				continue
			}
			if req.Name != nil {
				file.Hooks[i].Name = *req.Name
			}
			if req.URL != nil {
				file.Hooks[i].URL = *req.URL
			}
			if req.Enabled != nil {
				file.Hooks[i].Enabled = *req.Enabled
			}
			if req.Events != nil {
				file.Hooks[i].Events = *req.Events
			}
			found = true
			break
		}
		if !found {
			return c.Error("hook not found")
		}
		if err := saveHooks(ctx, file); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/hooks/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			ID string `json:"id"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		file, err := loadHooks(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		filtered := make([]HookConfig, 0, len(file.Hooks))
		for _, h := range file.Hooks {
			if h.ID != req.ID {
				filtered = append(filtered, h)
			}
		}
		file.Hooks = filtered
		if err := saveHooks(ctx, file); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})
}
