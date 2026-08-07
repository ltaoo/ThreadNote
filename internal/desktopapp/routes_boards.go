package desktopapp

import "github.com/ltaoo/velo"

func registerBoardRoutes(b *velo.Box) {
	b.Get("/api/boards", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		file, err := loadBoards(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"boards": file.Boards})
	})

	b.Get("/api/boards/presets", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"presets": boardPresets})
	})

	b.Post("/api/boards/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req BoardCreateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		board, err := createVaultBoard(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"board": board})
	})

	b.Post("/api/boards/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req BoardUpdateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		board, err := updateVaultBoard(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"board": board})
	})

	b.Post("/api/boards/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req BoardIDRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := deleteVaultBoard(ctx, req.ID); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/boards/refresh", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req BoardIDRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		count, err := RefreshBoardRules(ctx, req.ID)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"updated": count})
	})
}
