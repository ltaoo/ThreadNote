// Package jsonrpc exposes the ThreadNote capability catalog over newline-
// delimited JSON-RPC 2.0 on standard streams.
package jsonrpc

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"example/simple/internal/service"
)

const max_message_size = 16 << 20

type rpc_request struct {
	ID      json.RawMessage `json:"id"`
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpc_error struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message"`
}

type rpc_response struct {
	Error   *rpc_error      `json:"error,omitempty"`
	ID      json.RawMessage `json:"id"`
	JSONRPC string          `json:"jsonrpc"`
	Result  interface{}     `json:"result,omitempty"`
}

// Serve processes JSON-RPC requests until input reaches EOF or call_ctx is
// cancelled. In addition to discovery methods, every capability name can be
// called directly as a JSON-RPC method.
func Serve(call_ctx context.Context, capability_service *service.CapabilityService, input io.Reader, output io.Writer) error {
	if capability_service == nil {
		return fmt.Errorf("capability service is required")
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
		var request rpc_request
		if err := json.Unmarshal(line, &request); err != nil {
			if encode_err := encoder.Encode(error_response(json.RawMessage("null"), -32700, "parse error", err.Error())); encode_err != nil {
				return encode_err
			}
			continue
		}
		is_notification := len(request.ID) == 0
		response := handle_request(call_ctx, capability_service, request)
		if is_notification {
			continue
		}
		if err := encoder.Encode(response); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func handle_request(call_ctx context.Context, capability_service *service.CapabilityService, request rpc_request) rpc_response {
	request_id := request.ID
	if len(request_id) == 0 {
		request_id = json.RawMessage("null")
	}
	if request.JSONRPC != "2.0" || strings.TrimSpace(request.Method) == "" {
		return error_response(request_id, -32600, "invalid request", nil)
	}
	switch request.Method {
	case "rpc.ping":
		return success_response(request_id, map[string]interface{}{"ok": true})
	case "rpc.discover", "capabilities/list":
		return success_response(request_id, map[string]interface{}{"capabilities": capability_service.Capabilities()})
	case "capabilities/call":
		var call service.CapabilityCall
		if err := decode_params(request.Params, &call); err != nil {
			return error_response(request_id, -32602, "invalid params", err.Error())
		}
		result, err := capability_service.Invoke(call_ctx, call.Name, call.Input)
		if err != nil {
			return error_response(request_id, -32000, err.Error(), nil)
		}
		return success_response(request_id, result)
	default:
		if !capability_exists(capability_service, request.Method) {
			return error_response(request_id, -32601, "method not found", request.Method)
		}
		result, err := capability_service.Invoke(call_ctx, request.Method, request.Params)
		if err != nil {
			return error_response(request_id, -32000, err.Error(), nil)
		}
		return success_response(request_id, result)
	}
}

func capability_exists(capability_service *service.CapabilityService, name string) bool {
	for _, definition := range capability_service.Capabilities() {
		if definition.Name == name {
			return true
		}
	}
	return false
}

func decode_params(raw_params json.RawMessage, target interface{}) error {
	if len(strings.TrimSpace(string(raw_params))) == 0 || string(raw_params) == "null" {
		raw_params = json.RawMessage(`{}`)
	}
	return json.Unmarshal(raw_params, target)
}

func success_response(request_id json.RawMessage, result interface{}) rpc_response {
	return rpc_response{ID: request_id, JSONRPC: "2.0", Result: result}
}

func error_response(request_id json.RawMessage, code int, message string, data interface{}) rpc_response {
	return rpc_response{
		Error:   &rpc_error{Code: code, Data: data, Message: message},
		ID:      request_id,
		JSONRPC: "2.0",
	}
}
