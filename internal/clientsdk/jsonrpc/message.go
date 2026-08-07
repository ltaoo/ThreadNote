package jsonrpc

// AnyMessage is any JSON-RPC message that can pass through a stream.
type AnyMessage struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id,omitempty"`
	Method  string      `json:"method,omitempty"`
	Params  interface{} `json:"params,omitempty"`
	Result  interface{} `json:"result,omitempty"`
	Error   *ErrorData  `json:"error,omitempty"`
}

// ErrorData is the error payload in a JSON-RPC error response.
type ErrorData struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// IsRequest returns true if the message is a JSON-RPC request.
func (m *AnyMessage) IsRequest() bool {
	return m.JSONRPC == "2.0" && m.Method != "" && m.ID != nil
}

// IsResponse returns true if the message is a JSON-RPC response.
func (m *AnyMessage) IsResponse() bool {
	return m.JSONRPC == "2.0" && m.Method == "" && m.ID != nil
}

// IsNotification returns true if the message is a JSON-RPC notification.
func (m *AnyMessage) IsNotification() bool {
	return m.JSONRPC == "2.0" && m.Method != "" && m.ID == nil
}

// AnyRequest is a JSON-RPC request message.
type AnyRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// AnyResponse is a JSON-RPC response message.
type AnyResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *ErrorData  `json:"error,omitempty"`
}

// AnyNotification is a JSON-RPC notification message.
type AnyNotification struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}
