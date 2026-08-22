// Package mcp exposes the ThreadNote capability catalog as MCP tools over
// stdio. It supports the current discovery protocol and legacy initialization.
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const (
	current_protocol_version = "2026-07-28"
	legacy_protocol_version  = "2025-11-25"
	max_message_size         = 16 << 20
)

type mcp_request struct {
	ID      json.RawMessage `json:"id"`
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type mcp_error struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message"`
}

type mcp_response struct {
	Error   *mcp_error      `json:"error,omitempty"`
	ID      json.RawMessage `json:"id"`
	JSONRPC string          `json:"jsonrpc"`
	Result  interface{}     `json:"result,omitempty"`
}

type initialize_params struct {
	ProtocolVersion string `json:"protocolVersion"`
}

type call_tool_params struct {
	Arguments json.RawMessage `json:"arguments"`
	Name      string          `json:"name"`
}

// Tool describes one MCP tool independently of the application's service
// package, which keeps the protocol adapter reusable by embedded servers.
type Tool struct {
	Annotations interface{}            `json:"annotations,omitempty"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"inputSchema"`
	Name        string                 `json:"name"`
}

// CapabilityAdapter connects MCP transports to an application capability
// catalog without introducing a dependency on the service implementation.
type CapabilityAdapter struct {
	Invoke func(context.Context, string, json.RawMessage) (interface{}, error)
	Tools  []Tool
}

// Serve processes MCP stdio messages until input reaches EOF or call_ctx is
// cancelled. stdout contains protocol messages only.
func Serve(call_ctx context.Context, capability_adapter CapabilityAdapter, input io.Reader, output io.Writer, server_version string) error {
	if err := validate_capability_adapter(capability_adapter); err != nil {
		return err
	}
	if strings.TrimSpace(server_version) == "" {
		server_version = "dev"
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 64*1024), max_message_size)
	for scanner.Scan() {
		select {
		case <-call_ctx.Done():
			return call_ctx.Err()
		default:
		}
		line := scanner.Bytes()
		if len(strings.TrimSpace(string(line))) == 0 {
			continue
		}
		var request mcp_request
		if err := json.Unmarshal(line, &request); err != nil {
			if encode_err := encoder.Encode(mcp_error_response(json.RawMessage("null"), -32700, "Parse error", err.Error())); encode_err != nil {
				return encode_err
			}
			continue
		}
		is_notification := len(request.ID) == 0
		response := handle_mcp_request(call_ctx, capability_adapter, request, server_version)
		if is_notification {
			continue
		}
		if err := encoder.Encode(response); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func handle_mcp_request(call_ctx context.Context, capability_adapter CapabilityAdapter, request mcp_request, server_version string) mcp_response {
	request_id := request.ID
	if len(request_id) == 0 {
		request_id = json.RawMessage("null")
	}
	if request.JSONRPC != "2.0" || strings.TrimSpace(request.Method) == "" {
		return mcp_error_response(request_id, -32600, "Invalid Request", nil)
	}
	switch request.Method {
	case "server/discover":
		return mcp_success_response(request_id, map[string]interface{}{
			"_meta": map[string]interface{}{
				"io.modelcontextprotocol/serverInfo": map[string]interface{}{
					"name":    "threadnote",
					"version": server_version,
				},
			},
			"capabilities":      map[string]interface{}{"tools": map[string]interface{}{}},
			"instructions":      "Use ThreadNote tools to manage memos, tasks, projects, milestones, boards, comments, and drafts in the configured vault.",
			"resultType":        "complete",
			"supportedVersions": []string{current_protocol_version},
		})
	case "initialize":
		var params initialize_params
		if err := decode_mcp_params(request.Params, &params); err != nil {
			return mcp_error_response(request_id, -32602, "Invalid params", err.Error())
		}
		protocol_version := strings.TrimSpace(params.ProtocolVersion)
		if protocol_version == "" || protocol_version == current_protocol_version {
			protocol_version = legacy_protocol_version
		}
		return mcp_success_response(request_id, map[string]interface{}{
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{"listChanged": false},
			},
			"instructions":    "Use ThreadNote tools to manage the configured vault.",
			"protocolVersion": protocol_version,
			"serverInfo": map[string]interface{}{
				"name":    "threadnote",
				"version": server_version,
			},
		})
	case "ping":
		return mcp_success_response(request_id, map[string]interface{}{})
	case "tools/list":
		result := map[string]interface{}{"tools": capability_adapter.Tools}
		if is_modern_mcp_request(request.Params) {
			result["resultType"] = "complete"
		}
		return mcp_success_response(request_id, result)
	case "tools/call":
		var params call_tool_params
		if err := decode_mcp_params(request.Params, &params); err != nil {
			return mcp_error_response(request_id, -32602, "Invalid params", err.Error())
		}
		result, err := capability_adapter.Invoke(call_ctx, params.Name, params.Arguments)
		if err != nil {
			tool_result := map[string]interface{}{
				"content": []map[string]interface{}{{"text": err.Error(), "type": "text"}},
				"isError": true,
			}
			if is_modern_mcp_request(request.Params) {
				tool_result["resultType"] = "complete"
			}
			return mcp_success_response(request_id, tool_result)
		}
		text_result, marshal_err := json.Marshal(result)
		if marshal_err != nil {
			return mcp_error_response(request_id, -32603, "Internal error", marshal_err.Error())
		}
		tool_result := map[string]interface{}{
			"content":           []map[string]interface{}{{"text": string(text_result), "type": "text"}},
			"isError":           false,
			"structuredContent": result,
		}
		if is_modern_mcp_request(request.Params) {
			tool_result["resultType"] = "complete"
		}
		return mcp_success_response(request_id, tool_result)
	default:
		return mcp_error_response(request_id, -32601, "Method not found", request.Method)
	}
}

func validate_capability_adapter(capability_adapter CapabilityAdapter) error {
	if capability_adapter.Invoke == nil {
		return fmt.Errorf("capability invoke function is required")
	}
	for _, tool := range capability_adapter.Tools {
		if strings.TrimSpace(tool.Name) == "" {
			return fmt.Errorf("capability tool name is required")
		}
		if tool.InputSchema == nil {
			return fmt.Errorf("input schema is required for tool %s", tool.Name)
		}
	}
	return nil
}

func decode_mcp_params(raw_params json.RawMessage, target interface{}) error {
	if len(strings.TrimSpace(string(raw_params))) == 0 || string(raw_params) == "null" {
		raw_params = json.RawMessage(`{}`)
	}
	return json.Unmarshal(raw_params, target)
}

func is_modern_mcp_request(raw_params json.RawMessage) bool {
	var params struct {
		Meta map[string]interface{} `json:"_meta"`
	}
	if err := decode_mcp_params(raw_params, &params); err != nil {
		return false
	}
	_, ok := params.Meta["io.modelcontextprotocol/protocolVersion"]
	return ok
}

func mcp_success_response(request_id json.RawMessage, result interface{}) mcp_response {
	return mcp_response{ID: request_id, JSONRPC: "2.0", Result: result}
}

func mcp_error_response(request_id json.RawMessage, code int, message string, data interface{}) mcp_response {
	return mcp_response{
		Error:   &mcp_error{Code: code, Data: data, Message: message},
		ID:      request_id,
		JSONRPC: "2.0",
	}
}
