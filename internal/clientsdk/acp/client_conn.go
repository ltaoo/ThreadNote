package acp

import (
	"context"
	"encoding/json"
	"fmt"

	"example/simple/internal/clientsdk/jsonrpc"
)

// ACPClient is the interface that the client side must implement to handle
// incoming requests from the agent (session updates, permission requests, fs ops).
type ACPClient interface {
	SessionUpdate(notif *SessionNotification) error
	RequestPermission(req *RequestPermissionRequest) (*RequestPermissionResponse, error)
	ReadTextFile(req *ReadTextFileRequest) (*ReadTextFileResponse, error)
	WriteTextFile(req *WriteTextFileRequest) (*WriteTextFileResponse, error)
}

// ClientSideConnection wraps a JSON-RPC connection and provides typed ACP methods.
type ClientSideConnection struct {
	conn      *jsonrpc.Connection
	acpClient ACPClient
}

// NewClientSideConnection creates a new client-side ACP connection.
func NewClientSideConnection(conn *jsonrpc.Connection, acpClient ACPClient) *ClientSideConnection {
	csc := &ClientSideConnection{
		conn:      conn,
		acpClient: acpClient,
	}
	return csc
}

// Initialize performs the ACP initialization handshake.
func (c *ClientSideConnection) Initialize(ctx context.Context, req *InitializeRequest) (*InitializeResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodInitialize, req)
	if err != nil {
		return nil, err
	}
	return mapTo[InitializeResponse](raw)
}

// NewSession creates a new session.
func (c *ClientSideConnection) NewSession(ctx context.Context, req *NewSessionRequest) (*NewSessionResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionNew, req)
	if err != nil {
		return nil, err
	}
	return mapTo[NewSessionResponse](raw)
}

// LoadSession loads an existing session.
func (c *ClientSideConnection) LoadSession(ctx context.Context, req *LoadSessionRequest) (*LoadSessionResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionLoad, req)
	if err != nil {
		return nil, err
	}
	return mapTo[LoadSessionResponse](raw)
}

// ListSessions lists available sessions.
func (c *ClientSideConnection) ListSessions(ctx context.Context, req *ListSessionsRequest) (*ListSessionsResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionList, req)
	if err != nil {
		return nil, err
	}
	return mapTo[ListSessionsResponse](raw)
}

// Prompt sends a prompt to the agent and returns the response.
func (c *ClientSideConnection) Prompt(ctx context.Context, req *PromptRequest) (*PromptResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionPrompt, req)
	if err != nil {
		return nil, err
	}
	return mapTo[PromptResponse](raw)
}

// Cancel sends a cancellation notification for a session.
func (c *ClientSideConnection) Cancel(sessionID string) error {
	return c.conn.SendNotification(MethodSessionCancel, &CancelNotification{
		SessionID: sessionID,
	})
}

// SetSessionConfigOption sets a configuration option for a session.
func (c *ClientSideConnection) SetSessionConfigOption(ctx context.Context, req *SetSessionConfigOptionRequest) (*SetSessionConfigOptionResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionSetConfig, req)
	if err != nil {
		return nil, err
	}
	return mapTo[SetSessionConfigOptionResponse](raw)
}

// CloseSession closes a session.
func (c *ClientSideConnection) CloseSession(ctx context.Context, req *CloseSessionRequest) (*CloseSessionResponse, error) {
	raw, err := c.conn.SendRequest(ctx, MethodSessionClose, req)
	if err != nil {
		return nil, err
	}
	return mapTo[CloseSessionResponse](raw)
}

// RequestPermission is called by the JSON-RPC layer when the agent sends a permission request.
func (c *ClientSideConnection) requestPermission(params interface{}) (interface{}, error) {
	req, err := mapTo[RequestPermissionRequest](params)
	if err != nil {
		return nil, fmt.Errorf("invalid permission request: %w", err)
	}
	return c.acpClient.RequestPermission(req)
}

// sessionUpdate is called by the JSON-RPC layer when the agent sends a session update.
func (c *ClientSideConnection) sessionUpdate(params interface{}) (interface{}, error) {
	notif, err := mapTo[SessionNotification](params)
	if err != nil {
		return nil, fmt.Errorf("invalid session notification: %w", err)
	}
	return nil, c.acpClient.SessionUpdate(notif)
}

// readTextFile handles fs/read_text_file requests from the agent.
func (c *ClientSideConnection) readTextFile(params interface{}) (interface{}, error) {
	req, err := mapTo[ReadTextFileRequest](params)
	if err != nil {
		return nil, fmt.Errorf("invalid read request: %w", err)
	}
	return c.acpClient.ReadTextFile(req)
}

// writeTextFile handles fs/write_text_file requests from the agent.
func (c *ClientSideConnection) writeTextFile(params interface{}) (interface{}, error) {
	req, err := mapTo[WriteTextFileRequest](params)
	if err != nil {
		return nil, fmt.Errorf("invalid write request: %w", err)
	}
	return c.acpClient.WriteTextFile(req)
}

// CreateJSONRPCHandlers returns a request handler and notification handler
// that route incoming JSON-RPC messages to the ACPClient.
func (c *ClientSideConnection) CreateJSONRPCHandlers() (jsonrpc.RequestHandler, jsonrpc.NotificationHandler) {
	reqHandler := func(method string, params interface{}) (interface{}, error) {
		switch method {
		case ClientMethodRequestPermission:
			return c.requestPermission(params)
		case ClientMethodReadTextFile:
			return c.readTextFile(params)
		case ClientMethodWriteTextFile:
			return c.writeTextFile(params)
		default:
			return nil, jsonrpc.MethodNotFound(method)
		}
	}

	notifHandler := func(method string, params interface{}) {
		switch method {
		case ClientMethodSessionUpdate:
			c.sessionUpdate(params)
		case ClientMethodCancelRequest:
			// Protocol-level cancellation - not needed for our use case
		}
	}

	return reqHandler, notifHandler
}

// mapTo converts an interface{} to a typed struct via JSON marshal/unmarshal.
func mapTo[T any](raw interface{}) (*T, error) {
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
