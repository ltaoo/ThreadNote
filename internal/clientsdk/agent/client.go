package agent

import (
	"fmt"
	"os"
	"sync"
	"sync/atomic"

	"example/simple/internal/clientsdk/acp"
)

// SessionListener is called when a session update notification arrives.
type SessionListener func(notif *acp.SessionNotification)

type listenerEntry struct {
	id       int64
	callback SessionListener
}

var nextListenerID int64

// MultiplexingClient implements acp.ACPClient and routes session updates
// to registered listeners keyed by session ID.
type MultiplexingClient struct {
	mu        sync.RWMutex
	listeners map[string][]*listenerEntry
}

// NewMultiplexingClient creates a new MultiplexingClient.
func NewMultiplexingClient() *MultiplexingClient {
	return &MultiplexingClient{
		listeners: make(map[string][]*listenerEntry),
	}
}

// AddListener registers a listener for a specific session.
// Returns a function that removes the listener when called.
func (m *MultiplexingClient) AddListener(sessionID string, fn SessionListener) func() {
	id := atomic.AddInt64(&nextListenerID, 1)
	entry := &listenerEntry{id: id, callback: fn}

	m.mu.Lock()
	m.listeners[sessionID] = append(m.listeners[sessionID], entry)
	m.mu.Unlock()

	return func() {
		m.removeListener(sessionID, id)
	}
}

func (m *MultiplexingClient) removeListener(sessionID string, id int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entries := m.listeners[sessionID]
	for i, e := range entries {
		if e.id == id {
			m.listeners[sessionID] = append(entries[:i], entries[i+1:]...)
			break
		}
	}
	if len(m.listeners[sessionID]) == 0 {
		delete(m.listeners, sessionID)
	}
}

// SessionUpdate routes the notification to all listeners for the session.
func (m *MultiplexingClient) SessionUpdate(notif *acp.SessionNotification) error {
	m.mu.RLock()
	entries := m.listeners[notif.SessionID]
	m.mu.RUnlock()

	for _, e := range entries {
		func() {
			defer func() { recover() }()
			e.callback(notif)
		}()
	}
	return nil
}

// RequestPermission rejects tool execution because the memo agent is only
// allowed to transform the text carried in its prompt.
func (m *MultiplexingClient) RequestPermission(req *acp.RequestPermissionRequest) (*acp.RequestPermissionResponse, error) {
	var optionID string
	for _, opt := range req.Options {
		if opt.Kind == "reject_once" {
			optionID = opt.OptionID
			break
		}
	}
	if optionID == "" {
		for _, opt := range req.Options {
			if opt.Kind == "reject_always" {
				optionID = opt.OptionID
				break
			}
		}
	}
	if optionID == "" {
		return &acp.RequestPermissionResponse{
			Outcome: acp.PermissionOutcome{Outcome: "cancelled"},
		}, nil
	}
	return &acp.RequestPermissionResponse{
		Outcome: acp.PermissionOutcome{
			Outcome:  "selected",
			OptionID: optionID,
		},
	}, nil
}

// ReadTextFile reads a text file from the filesystem.
func (m *MultiplexingClient) ReadTextFile(req *acp.ReadTextFileRequest) (*acp.ReadTextFileResponse, error) {
	content, err := os.ReadFile(req.Path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", req.Path, err)
	}
	return &acp.ReadTextFileResponse{Content: string(content)}, nil
}

// WriteTextFile is intentionally disabled for inline memo transformations.
func (m *MultiplexingClient) WriteTextFile(req *acp.WriteTextFileRequest) (*acp.WriteTextFileResponse, error) {
	return nil, fmt.Errorf("write access is disabled for memo agent sessions")
}
