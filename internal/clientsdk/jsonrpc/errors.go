package jsonrpc

import (
	"encoding/json"
	"fmt"
)

// Standard JSON-RPC error codes.
const (
	CodeParseError       = -32700
	CodeInvalidRequest   = -32600
	CodeMethodNotFound   = -32601
	CodeInvalidParams    = -32602
	CodeInternalError    = -32603
	CodeRequestCancelled = -32800
)

// RequestError represents a JSON-RPC error.
type RequestError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *RequestError) Error() string {
	return fmt.Sprintf("jsonrpc error %d: %s", e.Code, e.Message)
}

// ParseError creates a parse error (-32700).
func ParseError(data interface{}) *RequestError {
	return &RequestError{Code: CodeParseError, Message: "Parse error", Data: data}
}

// InvalidRequest creates an invalid request error (-32600).
func InvalidRequest(data interface{}) *RequestError {
	return &RequestError{Code: CodeInvalidRequest, Message: "Invalid request", Data: data}
}

// MethodNotFound creates a method not found error (-32601).
func MethodNotFound(method string) *RequestError {
	return &RequestError{Code: CodeMethodNotFound, Message: fmt.Sprintf("Method not found: %s", method), Data: map[string]interface{}{"method": method}}
}

// InvalidParams creates an invalid params error (-32602).
func InvalidParams(data interface{}) *RequestError {
	return &RequestError{Code: CodeInvalidParams, Message: "Invalid params", Data: data}
}

// InternalError creates an internal error (-32603).
func InternalError(data interface{}) *RequestError {
	return &RequestError{Code: CodeInternalError, Message: "Internal error", Data: data}
}

// RequestCancelled creates a request cancelled error (-32800).
func RequestCancelled(data interface{}) *RequestError {
	return &RequestError{Code: CodeRequestCancelled, Message: "Request cancelled", Data: data}
}

// ErrMsg extracts a human-readable error message from any error value.
// It mirrors the TypeScript errMsg() function.
func ErrMsg(err error) string {
	if err == nil {
		return ""
	}

	// Check if it's a RequestError with data.details
	if re, ok := err.(*RequestError); ok && re.Data != nil {
		if dataMap, ok := re.Data.(map[string]interface{}); ok {
			if details, ok := dataMap["details"]; ok {
				if ds, ok := details.(string); ok {
					return fmt.Sprintf("%s: %s", re.Message, ds)
				}
			}
		}
		return re.Message
	}

	// Check if it's a generic error with a JSON-RPC error shape
	// Try to unmarshal the error message as JSON-RPC error
	msg := err.Error()
	var wrapper struct {
		Message string `json:"message"`
		Data    struct {
			Details string `json:"details"`
		} `json:"data"`
	}
	if json.Unmarshal([]byte(msg), &wrapper) == nil && wrapper.Message != "" {
		if wrapper.Data.Details != "" {
			return fmt.Sprintf("%s: %s", wrapper.Message, wrapper.Data.Details)
		}
		return wrapper.Message
	}

	return msg
}
