package desktopapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"example/simple/internal/clientsdk/sdk"
	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

const (
	memoAgentReplacementStart = "<<<VELO_REPLACEMENT>>>"
	memoAgentReplacementEnd   = "<<<VELO_REPLACEMENT_END>>>"
)

type memoACPManager interface {
	Agents() []sdk.Agent
	CreateSession(context.Context, string, string) (*sdk.Session, error)
	Prompt(context.Context, *sdk.Session, string, func(sdk.Event)) error
	Cancel(*sdk.Session) error
	CloseSession(context.Context, *sdk.Session) error
	Close()
}

type memoAgentService struct {
	manager memoACPManager
	logger  *zerolog.Logger

	mu       sync.RWMutex
	sessions map[string]*memoAgentSession
	runs     map[string]*memoAgentRun
}

type memoAgentSession struct {
	ID          string
	ACP         *sdk.Session
	mode        string
	original    string
	replacement string
}

type memoAgentRun struct {
	ID        string `json:"runId"`
	SessionID string `json:"sessionId"`

	mu     sync.Mutex
	events []memoAgentEvent
	done   bool
	cancel context.CancelFunc
}

type memoAgentEvent struct {
	ID   int64           `json:"id"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type createMemoAgentSessionRequest struct {
	AgentID   string `json:"agentId"`
	Selection string `json:"selection"`
	Mode      string `json:"mode"`
}

type createMemoAgentRunRequest struct {
	SessionID   string `json:"sessionId"`
	Instruction string `json:"instruction"`
}

func newMemoAgentService(logger *zerolog.Logger) *memoAgentService {
	return newMemoAgentServiceWithManager(logger, sdk.NewManager())
}

func newMemoAgentServiceWithManager(logger *zerolog.Logger, manager memoACPManager) *memoAgentService {
	return &memoAgentService{
		manager:  manager,
		logger:   logger,
		sessions: make(map[string]*memoAgentSession),
		runs:     make(map[string]*memoAgentRun),
	}
}

func (s *memoAgentService) Close() {
	if s != nil && s.manager != nil {
		s.manager.Close()
	}
}

func registerMemoAgentRoutes(b *velo.Box, service *memoAgentService) {
	b.Get("/api/memo-agent/providers", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"agents": service.manager.Agents()})
	})

	b.Post("/api/memo-agent/sessions/create", func(c *velo.BoxContext) interface{} {
		var req createMemoAgentSessionRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		session, err := service.createSession(c.Context(), req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"sessionId": session.ID, "agentId": session.ACP.AgentID})
	})

	b.Post("/api/memo-agent/runs/create", func(c *velo.BoxContext) interface{} {
		var req createMemoAgentRunRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		run, err := service.createRun(req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"runId": run.ID})
	})

	b.Get("/api/memo-agent/runs/events", func(c *velo.BoxContext) interface{} {
		afterID := int64(0)
		_, _ = fmt.Sscan(strings.TrimSpace(c.Query("afterId")), &afterID)
		events, done, err := service.runEvents(c.Query("runId"), afterID)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"events": events, "done": done})
	})

	b.Post("/api/memo-agent/runs/cancel", func(c *velo.BoxContext) interface{} {
		var req struct {
			RunID string `json:"runId"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := service.cancelRun(req.RunID); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/memo-agent/sessions/close", func(c *velo.BoxContext) interface{} {
		var req struct {
			SessionID string `json:"sessionId"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := service.closeSession(req.SessionID); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})
}

func (s *memoAgentService) createSession(parent context.Context, req createMemoAgentSessionRequest) (*memoAgentSession, error) {
	selection := req.Selection
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "memo-edit"
	}
	if mode != "memo-edit" && mode != "chat" {
		return nil, errors.New("不支持的对话模式")
	}
	if mode == "memo-edit" && selection == "" {
		return nil, errors.New("请先在编辑器中选择内容")
	}
	agentID := strings.TrimSpace(req.AgentID)
	if agentID == "" {
		agentID = "opencode"
	}
	cwd := projectDir()
	if vault := activeVaultSnapshot(); vault != nil && strings.TrimSpace(vault.RootDir) != "" {
		cwd = vault.RootDir
	}
	ctx, cancel := context.WithTimeout(parent, 35*time.Second)
	defer cancel()
	acpSession, err := s.manager.CreateSession(ctx, agentID, cwd)
	if err != nil {
		return nil, err
	}
	session := &memoAgentSession{
		ID:          newMemoAgentID("session"),
		ACP:         acpSession,
		mode:        mode,
		original:    selection,
		replacement: selection,
	}
	s.mu.Lock()
	s.sessions[session.ID] = session
	s.mu.Unlock()
	return session, nil
}

func (s *memoAgentService) createRun(req createMemoAgentRunRequest) (*memoAgentRun, error) {
	instruction := strings.TrimSpace(req.Instruction)
	if instruction == "" {
		return nil, errors.New("请输入修改要求")
	}
	session := s.getSession(req.SessionID)
	if session == nil {
		return nil, errors.New("对话已失效，请重新打开")
	}
	ctx, cancel := context.WithCancel(context.Background())
	run := &memoAgentRun{
		ID:        newMemoAgentID("run"),
		SessionID: session.ID,
		cancel:    cancel,
	}
	s.mu.Lock()
	s.runs[run.ID] = run
	s.mu.Unlock()
	run.publish("run.started", map[string]string{"runId": run.ID, "sessionId": session.ID})
	go s.streamRun(ctx, session, run, instruction)
	return run, nil
}

func (s *memoAgentService) streamRun(ctx context.Context, session *memoAgentSession, run *memoAgentRun, instruction string) {
	defer time.AfterFunc(10*time.Minute, func() {
		s.mu.Lock()
		if s.runs[run.ID] == run {
			delete(s.runs, run.ID)
		}
		s.mu.Unlock()
	})

	s.mu.RLock()
	current := session.replacement
	s.mu.RUnlock()
	prompt := instruction
	if session.mode != "chat" {
		prompt = memoAgentPrompt(current, instruction)
	}
	var message strings.Builder
	err := s.manager.Prompt(ctx, session.ACP, prompt, func(event sdk.Event) {
		if event.Type == "chunk" {
			if text, ok := event.Data["text"].(string); ok {
				message.WriteString(text)
			}
		}
		eventType := normalizeMemoAgentEvent(event.Type)
		switch eventType {
		case "run.completed":
			payload := map[string]interface{}{}
			for key, value := range event.Data {
				payload[key] = value
			}
			if _, hasMessage := payload["message"]; !hasMessage {
				if raw := strings.TrimSpace(message.String()); raw != "" {
					payload["message"] = raw
				}
			}
			if messageContent, ok := payload["message"].(string); ok {
				run.publish("message.completed", map[string]string{"content": messageContent})
			}
			if session.mode != "chat" {
				messageContent := ""
				if v, ok := payload["message"].(string); ok {
					messageContent = v
				}
				replacement, marked := extractMemoAgentReplacement(messageContent)
				if !marked && messageContent != "" {
					replacement = messageContent
				}
				if marked || replacement != "" {
					s.mu.Lock()
					session.replacement = replacement
					s.mu.Unlock()
				}
			}
			if _, hasStop := payload["stopReason"]; !hasStop {
				payload["stopReason"] = "end_turn"
			}
			run.finish(payload)
		case "":
		default:
			run.publish(eventType, event.Data)
		}
	})
	if err != nil && !errors.Is(err, context.Canceled) {
		s.logger.Warn().Err(err).Str("run", run.ID).Msg("memo agent run failed")
		run.fail(err)
		return
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		run.finish(map[string]any{"stopReason": "cancelled"})
		return
	}
	if run.isDone() {
		return
	}

	raw := strings.TrimSpace(message.String())
	if session.mode == "chat" {
		run.publish("message.completed", map[string]string{"content": raw})
		run.finish(map[string]any{
			"stopReason": "end_turn",
			"message":    raw,
		})
		return
	}
	replacement, marked := extractMemoAgentReplacement(raw)
	if !marked && raw != "" {
		replacement = raw
	}
	if marked || replacement != "" {
		s.mu.Lock()
		session.replacement = replacement
		s.mu.Unlock()
	}
	s.mu.RLock()
	current = session.replacement
	s.mu.RUnlock()
	run.publish("message.completed", map[string]string{"content": raw})
	run.finish(map[string]any{
		"stopReason":  "end_turn",
		"message":     raw,
		"replacement": current,
	})
}

func normalizeMemoAgentEvent(eventType string) string {
	switch eventType {
	case "chunk":
		return "message.delta"
	case "done":
		return "run.completed"
	case "run.completed":
		return "run.completed"
	case "thought":
		return "status"
	case "plan":
		return "plan.updated"
	case "tool_call":
		return "tool.started"
	case "tool_call_update":
		return "tool.completed"
	case "error":
		return "run.failed"
	default:
		return ""
	}
}

func (s *memoAgentService) runEvents(runID string, afterID int64) ([]memoAgentEvent, bool, error) {
	run := s.getRun(runID)
	if run == nil {
		return nil, false, errors.New("对话任务不存在")
	}
	return run.eventsAfter(afterID), run.isDone(), nil
}

func (s *memoAgentService) cancelRun(runID string) error {
	run := s.getRun(runID)
	if run == nil {
		return errors.New("对话任务不存在")
	}
	run.cancel()
	if session := s.getSession(run.SessionID); session != nil {
		_ = s.manager.Cancel(session.ACP)
	}
	return nil
}

func (s *memoAgentService) closeSession(sessionID string) error {
	s.mu.Lock()
	session := s.sessions[sessionID]
	delete(s.sessions, sessionID)
	for _, run := range s.runs {
		if run.SessionID == sessionID && !run.isDone() {
			run.cancel()
		}
	}
	s.mu.Unlock()
	if session == nil {
		return nil
	}
	_ = s.manager.Cancel(session.ACP)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.manager.CloseSession(ctx, session.ACP)
}

func (s *memoAgentService) getSession(id string) *memoAgentSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[id]
}

func (s *memoAgentService) getRun(id string) *memoAgentRun {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.runs[id]
}

func (r *memoAgentRun) publish(eventType string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.done {
		return
	}
	r.events = append(r.events, memoAgentEvent{
		ID:   int64(len(r.events) + 1),
		Type: eventType,
		Data: mustMemoAgentJSON(data),
	})
}

func (r *memoAgentRun) finish(data any) {
	r.publish("run.completed", data)
	r.markDone()
}

func (r *memoAgentRun) fail(err error) {
	r.publish("run.failed", map[string]string{"message": err.Error()})
	r.markDone()
}

func (r *memoAgentRun) markDone() {
	r.mu.Lock()
	r.done = true
	r.mu.Unlock()
}

func (r *memoAgentRun) isDone() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.done
}

func (r *memoAgentRun) eventsAfter(afterID int64) []memoAgentEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	events := make([]memoAgentEvent, 0, len(r.events))
	for _, event := range r.events {
		if event.ID > afterID {
			events = append(events, event)
		}
	}
	return events
}

func memoAgentPrompt(content, instruction string) string {
	return "你是 memo 编辑器的行内编辑 agent。请按照用户要求直接改写给定内容，不要修改文件，也不要解释。" +
		"必须只返回以下两个标记之间的最终替换文本，保留用户需要的 Markdown 格式：\n" +
		memoAgentReplacementStart + "\n<最终文本>\n" + memoAgentReplacementEnd +
		"\n\n当前文本：\n" + content + "\n\n用户要求：\n" + instruction
}

func extractMemoAgentReplacement(value string) (string, bool) {
	start := strings.LastIndex(value, memoAgentReplacementStart)
	if start < 0 {
		return "", false
	}
	start += len(memoAgentReplacementStart)
	end := strings.Index(value[start:], memoAgentReplacementEnd)
	if end < 0 {
		return "", false
	}
	return strings.Trim(value[start:start+end], "\r\n"), true
}

func newMemoAgentID(prefix string) string {
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return prefix + "_" + hex.EncodeToString(random)
}

func mustMemoAgentJSON(value any) json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(`{"message":"事件编码失败"}`)
	}
	return data
}
