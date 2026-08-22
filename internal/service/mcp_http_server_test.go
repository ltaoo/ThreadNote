package service

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestEmbeddedMCPHTTPServerLifecycle(t *testing.T) {
	shutdown_mcp_http_server(nil)
	defer shutdown_mcp_http_server(nil)

	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	setActiveVault(vault_ctx)
	defer setActiveVault(nil)

	status, started, err := start_mcp_http_server(MCPServerStartRequest{Address: "127.0.0.1:0"}, nil)
	if err != nil {
		t.Fatalf("start MCP server: %v", err)
	}
	if !started || !status.Running || status.URL == "" {
		t.Fatalf("start status = %+v, started=%v", status, started)
	}

	response, err := http.Post(status.URL, "application/json", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`))
	if err != nil {
		t.Fatalf("list MCP tools: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("tools status = %d", response.StatusCode)
	}
	var payload struct {
		Result struct {
			Tools []json.RawMessage `json:"tools"`
		} `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tools: %v", err)
	}
	if len(payload.Result.Tools) != len(NewActiveCapabilityService().Capabilities()) {
		t.Fatalf("tool count = %d", len(payload.Result.Tools))
	}

	repeated_status, repeated_started, err := start_mcp_http_server(MCPServerStartRequest{Address: "127.0.0.1:0"}, nil)
	if err != nil {
		t.Fatalf("repeat start: %v", err)
	}
	if repeated_started || repeated_status.URL != status.URL {
		t.Fatalf("repeat status = %+v, started=%v", repeated_status, repeated_started)
	}

	stopped_status, stopped, err := stop_mcp_http_server(nil)
	if err != nil {
		t.Fatalf("stop MCP server: %v", err)
	}
	if !stopped || stopped_status.Running || mcp_http_server_status().Running {
		t.Fatalf("stop status = %+v, stopped=%v", stopped_status, stopped)
	}
}

func TestEmbeddedMCPRequiresTokenOutsideLoopback(t *testing.T) {
	_, _, err := start_mcp_http_server(MCPServerStartRequest{Address: "0.0.0.0:0"}, nil)
	if err == nil || !strings.Contains(err.Error(), "bearer token") {
		t.Fatalf("start error = %v", err)
	}
}
