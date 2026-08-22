package service

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"example/simple/internal/adapter/mcp"

	"github.com/rs/zerolog"
)

const default_mcp_http_address = "127.0.0.1:18089"

// MCPServerStartRequest configures the embedded Streamable HTTP MCP server.
type MCPServerStartRequest struct {
	Address        string   `json:"address,omitempty"`
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
	Token          string   `json:"token,omitempty"`
}

// MCPServerStatus is safe to expose through Bridge; it never includes the
// configured bearer token.
type MCPServerStatus struct {
	Address     string `json:"address,omitempty"`
	AuthEnabled bool   `json:"authEnabled"`
	Running     bool   `json:"running"`
	StartedAt   string `json:"startedAt,omitempty"`
	Transport   string `json:"transport"`
	URL         string `json:"url,omitempty"`
}

var mcp_http_runtime = struct {
	sync.Mutex
	listener net.Listener
	server   *http.Server
	status   MCPServerStatus
}{}

func start_mcp_http_server(request MCPServerStartRequest, logger *zerolog.Logger) (MCPServerStatus, bool, error) {
	address := strings.TrimSpace(request.Address)
	if address == "" {
		address = default_mcp_http_address
	}
	token := strings.TrimSpace(request.Token)
	if err := validate_mcp_http_address(address, token); err != nil {
		return MCPServerStatus{}, false, err
	}

	mcp_http_runtime.Lock()
	if mcp_http_runtime.server != nil {
		status := mcp_http_runtime.status
		mcp_http_runtime.Unlock()
		return status, false, nil
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		mcp_http_runtime.Unlock()
		return MCPServerStatus{}, false, fmt.Errorf("start MCP listener: %w", err)
	}
	capability_service := NewActiveCapabilityService()
	handler, err := mcp.NewHTTPHandler(new_mcp_capability_adapter(capability_service), appVersion(), mcp.HTTPOptions{
		AllowedOrigins: request.AllowedOrigins,
		BearerToken:    token,
	})
	if err != nil {
		_ = listener.Close()
		mcp_http_runtime.Unlock()
		return MCPServerStatus{}, false, err
	}
	mux := http.NewServeMux()
	mux.Handle("/mcp", handler)
	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	actual_address := listener.Addr().String()
	status := MCPServerStatus{
		Address:     actual_address,
		AuthEnabled: token != "",
		Running:     true,
		StartedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		Transport:   "streamable-http",
		URL:         "http://" + actual_address + "/mcp",
	}
	mcp_http_runtime.listener = listener
	mcp_http_runtime.server = server
	mcp_http_runtime.status = status
	mcp_http_runtime.Unlock()

	go serve_mcp_http(server, listener, logger)
	return status, true, nil
}

func serve_mcp_http(server *http.Server, listener net.Listener, logger *zerolog.Logger) {
	err := server.Serve(listener)
	if err != nil && !errors.Is(err, http.ErrServerClosed) && logger != nil {
		logger.Error().Err(err).Msg("embedded MCP HTTP server stopped unexpectedly")
	}
	mcp_http_runtime.Lock()
	if mcp_http_runtime.server == server {
		mcp_http_runtime.listener = nil
		mcp_http_runtime.server = nil
		mcp_http_runtime.status = MCPServerStatus{Transport: "streamable-http"}
	}
	mcp_http_runtime.Unlock()
}

func stop_mcp_http_server(call_ctx context.Context) (MCPServerStatus, bool, error) {
	mcp_http_runtime.Lock()
	server := mcp_http_runtime.server
	if server == nil {
		status := MCPServerStatus{Transport: "streamable-http"}
		mcp_http_runtime.Unlock()
		return status, false, nil
	}
	mcp_http_runtime.Unlock()

	if call_ctx == nil {
		call_ctx = context.Background()
	}
	shutdown_ctx, cancel := context.WithTimeout(call_ctx, 2*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown_ctx); err != nil {
		return mcp_http_server_status(), false, err
	}
	mcp_http_runtime.Lock()
	if mcp_http_runtime.server == server {
		mcp_http_runtime.listener = nil
		mcp_http_runtime.server = nil
		mcp_http_runtime.status = MCPServerStatus{Transport: "streamable-http"}
	}
	mcp_http_runtime.Unlock()
	return MCPServerStatus{Transport: "streamable-http"}, true, nil
}

func shutdown_mcp_http_server(logger *zerolog.Logger) {
	_, _, err := stop_mcp_http_server(context.Background())
	if err != nil && logger != nil {
		logger.Warn().Err(err).Msg("failed to stop embedded MCP HTTP server")
	}
}

func mcp_http_server_status() MCPServerStatus {
	mcp_http_runtime.Lock()
	defer mcp_http_runtime.Unlock()
	if mcp_http_runtime.server == nil {
		return MCPServerStatus{Transport: "streamable-http"}
	}
	return mcp_http_runtime.status
}

func validate_mcp_http_address(address string, token string) error {
	host, port, err := net.SplitHostPort(strings.TrimSpace(address))
	if err != nil || strings.TrimSpace(port) == "" {
		return fmt.Errorf("MCP address must use host:port")
	}
	host = strings.TrimSpace(host)
	loopback := strings.EqualFold(host, "localhost")
	if ip_address := net.ParseIP(host); ip_address != nil && ip_address.IsLoopback() {
		loopback = true
	}
	if !loopback && strings.TrimSpace(token) == "" {
		return fmt.Errorf("a bearer token is required when MCP listens on a non-loopback address")
	}
	return nil
}

func new_mcp_capability_adapter(capability_service *CapabilityService) mcp.CapabilityAdapter {
	definitions := capability_service.Capabilities()
	tools := make([]mcp.Tool, 0, len(definitions))
	for _, definition := range definitions {
		tools = append(tools, mcp.Tool{
			Annotations: definition.Annotations,
			Description: definition.Description,
			InputSchema: definition.InputSchema,
			Name:        definition.Name,
		})
	}
	return mcp.CapabilityAdapter{Invoke: capability_service.Invoke, Tools: tools}
}
