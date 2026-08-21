package service

import (
	"github.com/ltaoo/velo"
)

func register_capability_routes(b *velo.Box) {
	capability_service := NewActiveCapabilityService()
	b.Get("/api/capabilities", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"capabilities": capability_service.Capabilities()})
	})
	b.Post("/api/capabilities/call", func(c *velo.BoxContext) interface{} {
		var request CapabilityCall
		if err := c.BindJSON(&request); err != nil {
			return c.Error(err.Error())
		}
		result, err := capability_service.Invoke(c.Context(), request.Name, request.Input)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(result)
	})
}
