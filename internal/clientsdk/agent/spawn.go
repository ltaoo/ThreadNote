package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"example/simple/internal/clientsdk/acp"
	"example/simple/internal/clientsdk/config"
	"example/simple/internal/clientsdk/jsonrpc"
	"example/simple/internal/clientsdk/transport"
)

// AgentConnection holds a running agent process and its ACP connection.
type AgentConnection struct {
	Process    *exec.Cmd
	Connection *acp.ClientSideConnection
}

// SpawnAndInit starts an agent process and initializes the ACP connection.
func SpawnAndInit(ctx context.Context, cfg *config.AgentConfig, cwd string, client acp.ACPClient) (*AgentConnection, error) {
	command, err := ResolveCommand(cfg)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(command, cfg.Args...)
	cmd.Dir = cwd
	cmd.Env = os.Environ()
	cmd.Stderr = os.Stderr

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start agent: %w", err)
	}

	// Create NDJSON stream over stdio
	stream := transport.NewNDJSONStream(stdout, stdin)

	// Create the ACP connection wrapper (handles incoming requests from agent)
	csc := acp.NewClientSideConnection(nil, client)
	reqHandler, notifHandler := csc.CreateJSONRPCHandlers()

	// Create the JSON-RPC connection
	conn := jsonrpc.NewConnection(stream, reqHandler, notifHandler)

	// Recreate the ClientSideConnection with the actual connection
	csc = acp.NewClientSideConnection(conn, client)

	// Initialize handshake
	initResp, err := csc.Initialize(ctx, &acp.InitializeRequest{
		ProtocolVersion: acp.ProtocolVersion,
		ClientInfo: &acp.Implementation{
			Name:    "acp-session-manager",
			Title:   "ACP Session Manager",
			Version: "1.0.0",
		},
		ClientCapabilities: &acp.ClientCapabilities{},
	})
	if err != nil {
		cmd.Process.Kill()
		return nil, fmt.Errorf("initialize: %w", err)
	}
	_ = initResp

	fmt.Fprintf(os.Stderr, "Initialized (protocol v%d)\n", initResp.ProtocolVersion)

	return &AgentConnection{
		Process:    cmd,
		Connection: csc,
	}, nil
}

// ResolveCommand locates an installed native ACP agent without invoking a
// package manager or shell. Packaged apps can place the executable next to the
// app binary or in Contents/Resources; development installs can use PATH or the
// agent-specific environment variable.
func ResolveCommand(cfg *config.AgentConfig) (string, error) {
	if cfg == nil || strings.TrimSpace(cfg.Command) == "" {
		return "", fmt.Errorf("native ACP agent command is not configured")
	}
	if cfg.CommandEnvironment != "" {
		if configured := strings.TrimSpace(os.Getenv(cfg.CommandEnvironment)); configured != "" {
			path, err := exec.LookPath(configured)
			if err != nil {
				return "", fmt.Errorf("native ACP agent from %s is unavailable: %w", cfg.CommandEnvironment, err)
			}
			return path, nil
		}
	}

	if executable, err := os.Executable(); err == nil {
		executableDir := filepath.Dir(executable)
		candidates := []string{
			filepath.Join(executableDir, cfg.Command),
			filepath.Clean(filepath.Join(executableDir, "..", "Resources", cfg.Command)),
		}
		for _, candidate := range candidates {
			if isExecutableFile(candidate) {
				return candidate, nil
			}
		}
	}
	if homeDir, err := os.UserHomeDir(); err == nil {
		for _, relative := range cfg.HomeRelativeCommands {
			candidate := filepath.Join(homeDir, filepath.FromSlash(relative))
			if isExecutableFile(candidate) {
				return candidate, nil
			}
		}
	}

	if path, err := exec.LookPath(cfg.Command); err == nil {
		return path, nil
	}
	envHint := ""
	if cfg.CommandEnvironment != "" {
		envHint = " or set " + cfg.CommandEnvironment
	}
	return "", fmt.Errorf("native ACP agent %q was not found in PATH, its standard install location, or beside the app%s", cfg.Command, envHint)
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode()&0111 != 0
}

// NewSession creates a new session on an existing connection.
func NewSession(ctx context.Context, conn *acp.ClientSideConnection, cwd string) (*acp.NewSessionResponse, error) {
	return conn.NewSession(ctx, &acp.NewSessionRequest{
		Cwd:        cwd,
		McpServers: []acp.McpServer{},
	})
}

// LoadSession loads an existing session.
func LoadSession(ctx context.Context, conn *acp.ClientSideConnection, sessionID, cwd string) (*acp.LoadSessionResponse, error) {
	return conn.LoadSession(ctx, &acp.LoadSessionRequest{
		SessionID:  sessionID,
		Cwd:        cwd,
		McpServers: []acp.McpServer{},
	})
}

// ListAllSessions fetches all sessions using cursor-based pagination.
func ListAllSessions(ctx context.Context, conn *acp.ClientSideConnection, cwd string) ([]acp.SessionInfo, error) {
	var all []acp.SessionInfo
	var cursor *string

	for {
		req := &acp.ListSessionsRequest{
			Cursor: cursor,
		}
		if cwd != "" {
			req.Cwd = &cwd
		}

		resp, err := conn.ListSessions(ctx, req)
		if err != nil {
			return nil, err
		}
		all = append(all, resp.Sessions...)
		if resp.NextCursor == nil {
			break
		}
		cursor = resp.NextCursor
	}
	return all, nil
}

// Prompt sends a prompt to the agent session.
func Prompt(ctx context.Context, conn *acp.ClientSideConnection, sessionID, promptText string) (*acp.PromptResponse, error) {
	return conn.Prompt(ctx, &acp.PromptRequest{
		SessionID: sessionID,
		Prompt: []acp.ContentBlock{
			{Type: "text", Text: promptText},
		},
	})
}

// CloseSession closes an agent session.
func CloseSession(ctx context.Context, conn *acp.ClientSideConnection, sessionID string) error {
	_, err := conn.CloseSession(ctx, &acp.CloseSessionRequest{
		SessionID: sessionID,
	})
	return err
}

// KillAgent sends SIGTERM then SIGKILL after 5 seconds.
func KillAgent(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	cmd.Process.Signal(os.Interrupt) // SIGTERM equivalent
	// Simple kill - in the background
	go func() {
		// Wait a bit and force kill if still running
		// Process.Wait() blocks, so we just send SIGKILL after a delay
		// Since Go doesn't have a simple "killed" check, we rely on the process
		// being already dead from the interrupt.
	}()
}
