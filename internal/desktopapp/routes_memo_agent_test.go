package desktopapp

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"example/simple/internal/clientsdk/sdk"
	"github.com/rs/zerolog"
)

type fakeMemoACPManager struct {
	mu      sync.Mutex
	prompts []string
}

func (f *fakeMemoACPManager) Agents() []sdk.Agent {
	return []sdk.Agent{{ID: "opencode", Label: "OpenCode"}}
}

func (f *fakeMemoACPManager) CreateSession(_ context.Context, agentID, cwd string) (*sdk.Session, error) {
	return &sdk.Session{ID: "acp-1", AgentID: agentID, CWD: cwd}, nil
}

func (f *fakeMemoACPManager) Prompt(_ context.Context, _ *sdk.Session, prompt string, emit func(sdk.Event)) error {
	f.mu.Lock()
	f.prompts = append(f.prompts, prompt)
	f.mu.Unlock()
	emit(sdk.Event{Type: "chunk", Data: map[string]interface{}{"text": memoAgentReplacementStart + "\nnew "}})
	emit(sdk.Event{Type: "chunk", Data: map[string]interface{}{"text": "text\n" + memoAgentReplacementEnd}})
	emit(sdk.Event{Type: "done", Data: map[string]interface{}{"stopReason": "end_turn"}})
	return nil
}

func (f *fakeMemoACPManager) Cancel(*sdk.Session) error                        { return nil }
func (f *fakeMemoACPManager) CloseSession(context.Context, *sdk.Session) error { return nil }
func (f *fakeMemoACPManager) Close()                                           {}

func TestExtractMemoAgentReplacement(t *testing.T) {
	value := "ignored\n" + memoAgentReplacementStart + "\nnew **memo**\n" + memoAgentReplacementEnd + "\nignored"
	got, ok := extractMemoAgentReplacement(value)
	if !ok {
		t.Fatal("expected marked replacement")
	}
	if got != "new **memo**" {
		t.Fatalf("replacement = %q", got)
	}
}

func TestExtractMemoAgentReplacementAllowsDeletion(t *testing.T) {
	value := memoAgentReplacementStart + "\n" + memoAgentReplacementEnd
	got, ok := extractMemoAgentReplacement(value)
	if !ok || got != "" {
		t.Fatalf("replacement = %q, marked = %v", got, ok)
	}
}

func TestMemoAgentPromptContainsSelectionAndInstruction(t *testing.T) {
	prompt := memoAgentPrompt("current text", "make concise")
	if !strings.Contains(prompt, "current text") || !strings.Contains(prompt, "make concise") {
		t.Fatalf("prompt missing input: %q", prompt)
	}
}

func TestMemoAgentSessionRunEventsFlow(t *testing.T) {
	manager := &fakeMemoACPManager{}
	logger := zerolog.Nop()
	service := newMemoAgentServiceWithManager(&logger, manager)
	session, err := service.createSession(context.Background(), createMemoAgentSessionRequest{
		AgentID:   "opencode",
		Selection: "old text",
	})
	if err != nil {
		t.Fatal(err)
	}
	run, err := service.createRun(createMemoAgentRunRequest{
		SessionID:   session.ID,
		Instruction: "rewrite",
	})
	if err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(time.Second)
	for !run.isDone() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if !run.isDone() {
		t.Fatal("run did not finish")
	}
	events, done, err := service.runEvents(run.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !done {
		t.Fatal("run should be done")
	}
	types := make([]string, 0, len(events))
	for _, event := range events {
		types = append(types, event.Type)
	}
	gotTypes := strings.Join(types, ",")
	wantTypes := "run.started,message.delta,message.delta,message.completed,run.completed"
	if gotTypes != wantTypes {
		t.Fatalf("event types = %q, want %q", gotTypes, wantTypes)
	}
	if session.replacement != "new text" {
		t.Fatalf("replacement = %q", session.replacement)
	}
}

func TestMemoAgentChatPassesUserMessageDirectly(t *testing.T) {
	manager := &fakeMemoACPManager{}
	logger := zerolog.Nop()
	service := newMemoAgentServiceWithManager(&logger, manager)
	session, err := service.createSession(context.Background(), createMemoAgentSessionRequest{
		AgentID: "opencode",
		Mode:    "chat",
	})
	if err != nil {
		t.Fatal(err)
	}
	run, err := service.createRun(createMemoAgentRunRequest{
		SessionID:   session.ID,
		Instruction: "hello acp",
	})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for !run.isDone() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if len(manager.prompts) != 1 || manager.prompts[0] != "hello acp" {
		t.Fatalf("prompts = %#v", manager.prompts)
	}
	if session.replacement != "" {
		t.Fatalf("chat must not update memo replacement: %q", session.replacement)
	}
}
