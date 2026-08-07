package jsonrpc

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"

	"example/simple/internal/clientsdk/transport"
)

type pendingResponse struct {
	resolve func(result interface{})
	reject  func(err error)
}

// NotificationHandler is called for incoming JSON-RPC notifications.
type NotificationHandler func(method string, params interface{})

// RequestHandler is called for incoming JSON-RPC requests.
// It returns the result or an error.
type RequestHandler func(method string, params interface{}) (interface{}, error)

// Connection handles a JSON-RPC 2.0 connection over NDJSON.
type Connection struct {
	stream             *transport.NDJSONStream
	nextRequestID      int64
	pendingResponses   map[int64]*pendingResponse
	pendingResponsesMu sync.Mutex

	notifHandler NotificationHandler
	reqHandler   RequestHandler

	ctx    context.Context
	cancel context.CancelFunc
}

// NewConnection creates a new JSON-RPC connection.
func NewConnection(
	stream *transport.NDJSONStream,
	reqHandler RequestHandler,
	notifHandler NotificationHandler,
) *Connection {
	ctx, cancel := context.WithCancel(context.Background())
	c := &Connection{
		stream:           stream,
		nextRequestID:    1,
		pendingResponses: make(map[int64]*pendingResponse),
		notifHandler:     notifHandler,
		reqHandler:       reqHandler,
		ctx:              ctx,
		cancel:           cancel,
	}
	go c.receiveLoop()
	return c
}

// receiveLoop reads messages from the stream and dispatches them.
func (c *Connection) receiveLoop() {
	for {
		select {
		case <-c.ctx.Done():
			return
		case raw, ok := <-c.stream.Messages():
			if !ok {
				c.Close(fmt.Errorf("stream closed"))
				return
			}
			c.dispatch(raw)
		}
	}
}

func (c *Connection) dispatch(raw json.RawMessage) {
	var msg AnyMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	if msg.IsResponse() {
		c.handleResponse(&msg)
	} else if msg.IsNotification() {
		c.handleNotification(&msg)
	} else if msg.IsRequest() {
		c.handleRequest(&msg)
	}
}

func (c *Connection) handleResponse(msg *AnyMessage) {
	id, ok := toInt64(msg.ID)
	if !ok {
		return
	}
	c.pendingResponsesMu.Lock()
	pending, found := c.pendingResponses[id]
	if found {
		delete(c.pendingResponses, id)
	}
	c.pendingResponsesMu.Unlock()

	if !found {
		return
	}

	if msg.Error != nil {
		pending.reject(&RequestError{
			Code:    msg.Error.Code,
			Message: msg.Error.Message,
			Data:    msg.Error.Data,
		})
		return
	}
	pending.resolve(msg.Result)
}

func (c *Connection) handleNotification(msg *AnyMessage) {
	if c.notifHandler != nil {
		c.notifHandler(msg.Method, msg.Params)
	}
}

func (c *Connection) handleRequest(msg *AnyMessage) {
	if c.reqHandler == nil {
		return
	}

	result, err := c.reqHandler(msg.Method, msg.Params)
	if err != nil {
		var errResp interface{}
		if re, ok := err.(*RequestError); ok {
			errResp = &AnyResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error: &ErrorData{
					Code:    re.Code,
					Message: re.Message,
					Data:    re.Data,
				},
			}
		} else {
			errResp = &AnyResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error: &ErrorData{
					Code:    CodeInternalError,
					Message: err.Error(),
				},
			}
		}
		c.stream.Write(errResp)
		return
	}

	resp := &AnyResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}
	c.stream.Write(resp)
}

// SendRequest sends a JSON-RPC request and waits for the response.
func (c *Connection) SendRequest(ctx context.Context, method string, params interface{}) (interface{}, error) {
	id := atomic.AddInt64(&c.nextRequestID, 1)

	resultCh := make(chan interface{}, 1)
	errCh := make(chan error, 1)

	pending := &pendingResponse{
		resolve: func(result interface{}) {
			resultCh <- result
		},
		reject: func(err error) {
			errCh <- err
		},
	}

	c.pendingResponsesMu.Lock()
	c.pendingResponses[id] = pending
	c.pendingResponsesMu.Unlock()

	req := &AnyRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	if err := c.stream.Write(req); err != nil {
		c.pendingResponsesMu.Lock()
		delete(c.pendingResponses, id)
		c.pendingResponsesMu.Unlock()
		return nil, err
	}

	select {
	case <-ctx.Done():
		c.pendingResponsesMu.Lock()
		delete(c.pendingResponses, id)
		c.pendingResponsesMu.Unlock()
		return nil, ctx.Err()
	case err := <-errCh:
		return nil, err
	case result := <-resultCh:
		return result, nil
	}
}

// SendNotification sends a JSON-RPC notification.
func (c *Connection) SendNotification(method string, params interface{}) error {
	notif := &AnyNotification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
	return c.stream.Write(notif)
}

// Close closes the connection and rejects all pending requests.
func (c *Connection) Close(err error) {
	c.cancel()

	c.pendingResponsesMu.Lock()
	defer c.pendingResponsesMu.Unlock()

	if err == nil {
		err = fmt.Errorf("connection closed")
	}
	for _, p := range c.pendingResponses {
		p.reject(err)
	}
	c.pendingResponses = make(map[int64]*pendingResponse)
}

func toInt64(v interface{}) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	}
	return 0, false
}
