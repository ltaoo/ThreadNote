package service

import "github.com/ltaoo/velo"

func registerGTDRoutes(b *velo.Box) {
	b.Get("/api/gtd/milestones", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		file, err := listVaultGTDMilestones(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"milestones": file.Milestones})
	})

	b.Post("/api/gtd/milestones/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req GTDMilestoneCreateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		milestone, err := createVaultGTDMilestone(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"milestone": milestone})
	})

	b.Post("/api/gtd/milestones/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req GTDMilestoneUpdateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		milestone, err := updateVaultGTDMilestone(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"milestone": milestone})
	})

	b.Post("/api/gtd/milestones/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req gtd_milestone_id_request
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := deleteVaultGTDMilestone(ctx, req.ID); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})
}
