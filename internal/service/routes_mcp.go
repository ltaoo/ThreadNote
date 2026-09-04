package service

import (
	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

func register_mcp_routes(b *velo.Box, logger *zerolog.Logger) {
	b.Get("/api/mcp/status", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"server": mcp_http_server_status()})
	})
	b.Post("/api/mcp/start", func(c *velo.BoxContext) interface{} {
		var request MCPServerStartRequest
		if err := c.BindJSON(&request); err != nil {
			return c.Error(err.Error())
		}
		status, started, err := start_mcp_http_server(request, logger)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"server": status, "started": started})
	})
	b.Post("/api/mcp/stop", func(c *velo.BoxContext) interface{} {
		status, stopped, err := stop_mcp_http_server(c.Context())
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"server": status, "stopped": stopped})
	})
}
