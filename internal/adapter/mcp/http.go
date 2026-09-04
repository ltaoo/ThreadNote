package mcp

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

const max_http_body_size = 16 << 20

// HTTPOptions controls authentication and browser-origin access for the MCP
// Streamable HTTP endpoint.
type HTTPOptions struct {
	AllowedOrigins []string
	BearerToken    string
}

type http_handler struct {
	capability_adapter CapabilityAdapter
	options            HTTPOptions
	server_version     string
}

// NewHTTPHandler creates a stateless MCP Streamable HTTP handler. POST handles
// JSON-RPC requests and notifications; GET returns 405 because this server does
// not publish an SSE stream.
func NewHTTPHandler(capability_adapter CapabilityAdapter, server_version string, options HTTPOptions) (http.Handler, error) {
	if err := validate_capability_adapter(capability_adapter); err != nil {
		return nil, err
	}
	if strings.TrimSpace(server_version) == "" {
		server_version = "dev"
	}
	return &http_handler{
		capability_adapter: capability_adapter,
		options:            options,
		server_version:     server_version,
	}, nil
}

func (handler *http_handler) ServeHTTP(response_writer http.ResponseWriter, request *http.Request) {
	if !handler.origin_allowed(request.Header.Get("Origin")) {
		write_http_error(response_writer, http.StatusForbidden, json.RawMessage("null"), -32000, "origin is not allowed", nil)
		return
	}
	handler.write_cors_headers(response_writer, request)
	if request.Method == http.MethodOptions {
		response_writer.Header().Set("Allow", "POST, OPTIONS")
		response_writer.WriteHeader(http.StatusNoContent)
		return
	}
	if !handler.authorized(request) {
		response_writer.Header().Set("WWW-Authenticate", `Bearer realm="threadnote-mcp"`)
		write_http_error(response_writer, http.StatusUnauthorized, json.RawMessage("null"), -32001, "unauthorized", nil)
		return
	}
	if request.Method != http.MethodPost {
		response_writer.Header().Set("Allow", "POST, OPTIONS")
		write_http_error(response_writer, http.StatusMethodNotAllowed, json.RawMessage("null"), -32600, "method not allowed", nil)
		return
	}
	content_type := strings.ToLower(strings.TrimSpace(strings.Split(request.Header.Get("Content-Type"), ";")[0]))
	if content_type != "" && content_type != "application/json" {
		write_http_error(response_writer, http.StatusUnsupportedMediaType, json.RawMessage("null"), -32600, "content type must be application/json", nil)
		return
	}
	defer request.Body.Close()
	decoder := json.NewDecoder(http.MaxBytesReader(response_writer, request.Body, max_http_body_size))
	var mcp_request_value mcp_request
	if err := decoder.Decode(&mcp_request_value); err != nil {
		write_http_error(response_writer, http.StatusBadRequest, json.RawMessage("null"), -32700, "Parse error", err.Error())
		return
	}
	var trailing_value interface{}
	if err := decoder.Decode(&trailing_value); err != io.EOF {
		write_http_error(response_writer, http.StatusBadRequest, json.RawMessage("null"), -32700, "Parse error", "request body must contain one JSON-RPC message")
		return
	}
	is_notification := len(mcp_request_value.ID) == 0
	mcp_response_value := handle_mcp_request(request.Context(), handler.capability_adapter, mcp_request_value, handler.server_version)
	if is_notification {
		response_writer.WriteHeader(http.StatusAccepted)
		return
	}
	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	response_writer.Header().Set("MCP-Protocol-Version", response_protocol_version(mcp_request_value))
	response_writer.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(response_writer).Encode(mcp_response_value)
}

func (handler *http_handler) authorized(request *http.Request) bool {
	wanted_token := strings.TrimSpace(handler.options.BearerToken)
	if wanted_token == "" {
		return true
	}
	authorization := strings.TrimSpace(request.Header.Get("Authorization"))
	if len(authorization) <= 7 || !strings.EqualFold(authorization[:7], "Bearer ") {
		return false
	}
	provided_token := strings.TrimSpace(authorization[7:])
	if len(provided_token) != len(wanted_token) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided_token), []byte(wanted_token)) == 1
}

func (handler *http_handler) origin_allowed(origin string) bool {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return true
	}
	for _, allowed_origin := range handler.options.AllowedOrigins {
		if strings.EqualFold(strings.TrimSpace(allowed_origin), origin) {
			return true
		}
	}
	parsed_origin, err := url.Parse(origin)
	if err != nil {
		return false
	}
	hostname := strings.TrimSpace(parsed_origin.Hostname())
	if strings.EqualFold(hostname, "localhost") {
		return true
	}
	ip_address := net.ParseIP(hostname)
	return ip_address != nil && ip_address.IsLoopback()
}

func (handler *http_handler) write_cors_headers(response_writer http.ResponseWriter, request *http.Request) {
	origin := strings.TrimSpace(request.Header.Get("Origin"))
	if origin == "" {
		return
	}
	response_writer.Header().Set("Access-Control-Allow-Origin", origin)
	response_writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name")
	response_writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	response_writer.Header().Set("Vary", "Origin")
}

func response_protocol_version(request mcp_request) string {
	if request.Method == "initialize" {
		var params initialize_params
		if err := decode_mcp_params(request.Params, &params); err == nil && strings.TrimSpace(params.ProtocolVersion) != "" {
			return strings.TrimSpace(params.ProtocolVersion)
		}
	}
	var params struct {
		Meta map[string]interface{} `json:"_meta"`
	}
	if err := decode_mcp_params(request.Params, &params); err == nil {
		if version, ok := params.Meta["io.modelcontextprotocol/protocolVersion"].(string); ok && strings.TrimSpace(version) != "" {
			return strings.TrimSpace(version)
		}
	}
	return current_protocol_version
}

func write_http_error(response_writer http.ResponseWriter, status_code int, request_id json.RawMessage, code int, message string, data interface{}) {
	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	response_writer.WriteHeader(status_code)
	_ = json.NewEncoder(response_writer).Encode(mcp_error_response(request_id, code, message, data))
}
