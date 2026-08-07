// Package sdk exposes the ACP session manager as an embeddable Go library.
// It intentionally keeps the JSON-RPC, process and protocol implementation in
// the module's internal packages while giving host applications a stable API.
package sdk

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"example/simple/internal/clientsdk/acp"
	"example/simple/internal/clientsdk/agent"
	"example/simple/internal/clientsdk/config"
)

type Agent struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type Session struct {
	ID      string
	AgentID string
	CWD     string
}

type Event struct {
	Type string
	Data map[string]interface{}
}

type Manager struct {
	mu      sync.RWMutex
	entries map[string]*poolEntry
}

type poolEntry struct {
	process       *exec.Cmd
	connection    *acp.ClientSideConnection
	client        *agent.MultiplexingClient
	activePrompts map[string]bool
	mu            sync.Mutex
}

func NewManager() *Manager {
	return &Manager{entries: make(map[string]*poolEntry)}
}

func (m *Manager) Agents() []Agent {
	ids := config.ListAgentIds()
	result := make([]Agent, 0, len(ids))
	for _, id := range ids {
		if cfg := config.GetAgent(id); cfg != nil {
			result = append(result, Agent{ID: cfg.ID, Label: cfg.Label})
		}
	}
	return result
}

func (m *Manager) CreateSession(ctx context.Context, agentID, cwd string) (*Session, error) {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	entry, err := m.getOrCreate(ctx, agentID, cwd)
	if err != nil {
		return nil, err
	}
	response, err := agent.NewSession(ctx, entry.connection, cwd)
	if err != nil {
		return nil, err
	}
	return &Session{ID: response.SessionID, AgentID: agentID, CWD: cwd}, nil
}

func (m *Manager) SetConfig(
	ctx context.Context,
	session *Session,
	configID string,
	value interface{},
) error {
	entry := m.get(session.AgentID, session.CWD)
	if entry == nil {
		return fmt.Errorf("ACP process is not running")
	}
	request := &acp.SetSessionConfigOptionRequest{
		SessionID: session.ID,
		ConfigID:  configID,
		Value:     value,
	}
	if _, ok := value.(bool); ok {
		request.Type = "boolean"
	}
	_, err := entry.connection.SetSessionConfigOption(ctx, request)
	return err
}

func (m *Manager) Prompt(
	ctx context.Context,
	session *Session,
	message string,
	emit func(Event),
) error {
	entry := m.get(session.AgentID, session.CWD)
	if entry == nil {
		return fmt.Errorf("ACP process is not running")
	}
	entry.mu.Lock()
	if entry.activePrompts[session.ID] {
		entry.mu.Unlock()
		return fmt.Errorf("session is already processing a prompt")
	}
	entry.activePrompts[session.ID] = true
	entry.mu.Unlock()
	defer func() {
		entry.mu.Lock()
		delete(entry.activePrompts, session.ID)
		entry.mu.Unlock()
	}()

	removeListener := entry.client.AddListener(session.ID, func(notification *acp.SessionNotification) {
		if event, ok := eventFromNotification(notification); ok && emit != nil {
			emit(event)
		}
	})
	defer removeListener()

	cancelled := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = entry.connection.Cancel(session.ID)
		case <-cancelled:
		}
	}()
	response, err := agent.Prompt(ctx, entry.connection, session.ID, message)
	close(cancelled)
	if err != nil {
		return err
	}
	if emit != nil && (response.StopReason != "" || response.Usage != nil) {
		emit(Event{
			Type: "done",
			Data: map[string]interface{}{"stopReason": response.StopReason, "usage": response.Usage},
		})
	}
	return nil
}

func (m *Manager) Cancel(session *Session) error {
	entry := m.get(session.AgentID, session.CWD)
	if entry == nil {
		return fmt.Errorf("ACP process is not running")
	}
	return entry.connection.Cancel(session.ID)
}

func (m *Manager) CloseSession(ctx context.Context, session *Session) error {
	entry := m.get(session.AgentID, session.CWD)
	if entry == nil {
		return fmt.Errorf("ACP process is not running")
	}
	return agent.CloseSession(ctx, entry.connection, session.ID)
}

func (m *Manager) Close() {
	m.mu.Lock()
	entries := make([]*poolEntry, 0, len(m.entries))
	for key, entry := range m.entries {
		entries = append(entries, entry)
		delete(m.entries, key)
	}
	m.mu.Unlock()
	for _, entry := range entries {
		agent.KillAgent(entry.process)
	}
}

func (m *Manager) getOrCreate(ctx context.Context, agentID, cwd string) (*poolEntry, error) {
	key := poolKey(agentID, cwd)
	if entry := m.get(agentID, cwd); entry != nil {
		return entry, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if entry := m.entries[key]; entry != nil {
		return entry, nil
	}
	cfg := config.GetAgent(agentID)
	if cfg == nil {
		return nil, fmt.Errorf("unknown agent: %s", agentID)
	}
	spawnContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	client := agent.NewMultiplexingClient()
	connection, err := agent.SpawnAndInit(spawnContext, cfg, cwd, client)
	if err != nil {
		return nil, fmt.Errorf("spawn %s: %w", agentID, err)
	}
	entry := &poolEntry{
		process:       connection.Process,
		connection:    connection.Connection,
		client:        client,
		activePrompts: make(map[string]bool),
	}
	m.entries[key] = entry
	go func() {
		_ = connection.Process.Wait()
		m.mu.Lock()
		if m.entries[key] == entry {
			delete(m.entries, key)
		}
		m.mu.Unlock()
		log.Printf("ACP agent process exited: %s (cwd=%s)", agentID, cwd)
	}()
	return entry, nil
}

func (m *Manager) get(agentID, cwd string) *poolEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.entries[poolKey(agentID, cwd)]
}

func poolKey(agentID, cwd string) string {
	return agentID + "::" + cwd
}

func eventFromNotification(notification *acp.SessionNotification) (Event, bool) {
	update := notification.Update
	switch update.SessionUpdate {
	case "user_message_chunk":
		if text, ok := extractTextFromContent(update.Content); ok {
			return Event{Type: "user_chunk", Data: map[string]interface{}{
				"text": text, "messageId": update.MessageID,
			}}, true
		}
	case "agent_message_chunk":
		if text, ok := extractTextFromContent(update.Content); ok {
			return Event{Type: "chunk", Data: map[string]interface{}{
				"text": text, "messageId": update.MessageID,
			}}, true
		}
	case "agent_message":
		if text, ok := extractTextFromContent(update.Content); ok {
			return Event{Type: "chunk", Data: map[string]interface{}{
				"text": text, "messageId": update.MessageID,
			}}, true
		}
	case "agent_thought_chunk":
		if text, ok := extractTextFromContent(update.Content); ok {
			return Event{Type: "thought", Data: map[string]interface{}{"text": text}}, true
		}
	case "agent_thought":
		if text, ok := extractTextFromContent(update.Content); ok {
			return Event{Type: "thought", Data: map[string]interface{}{"text": text}}, true
		}
	case "tool_call":
		return Event{Type: "tool_call", Data: map[string]interface{}{
			"toolCallId": update.ToolCallID, "title": update.Title, "status": update.Status,
		}}, true
	case "tool_call_update":
		return Event{Type: "tool_call_update", Data: map[string]interface{}{
			"toolCallId": update.ToolCallID, "status": update.Status,
		}}, true
	case "plan":
		return Event{Type: "plan", Data: map[string]interface{}{"entries": update.Entries}}, true
	case "plan_update":
		return Event{Type: "plan", Data: map[string]interface{}{"entries": update.Entries}}, true
	case "state_update":
		if update.State == "idle" {
			data := map[string]interface{}{"state": "idle"}
			if update.StopReason != nil {
				data["stopReason"] = *update.StopReason
			}
			return Event{Type: "run.completed", Data: data}, true
		}
		if update.State != "" {
			data := map[string]interface{}{"status": update.State}
			if update.StopReason != nil {
				data["stopReason"] = *update.StopReason
			}
			return Event{Type: "status", Data: data}, true
		}
	case "session_info_update":
		return Event{Type: "session_info_update", Data: map[string]interface{}{"title": update.Title}}, true
	case "config_option_update":
		return Event{Type: "config_option_update", Data: map[string]interface{}{
			"configOptions": update.ConfigOptions,
		}}, true
	}
	return Event{}, false
}

func extractTextFromContent(content any) (string, bool) {
	if content == nil {
		return "", false
	}
	switch value := content.(type) {
	case string:
		if value == "" {
			return "", false
		}
		return value, true
	case map[string]interface{}:
		if textType, ok := value["type"].(string); ok && textType != "text" {
			return "", false
		}
		text, ok := value["text"].(string)
		return text, ok
	case []interface{}:
		var builder strings.Builder
		ok := false
		for _, item := range value {
			if text, found := extractTextFromContent(item); found && text != "" {
				builder.WriteString(text)
				ok = true
			}
		}
		return builder.String(), ok
	default:
		return "", false
	}
}
