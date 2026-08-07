package agent

import (
	"os"
	"path/filepath"
	"testing"

	"example/simple/internal/clientsdk/config"
)

func TestResolveCommandFromEnvironment(t *testing.T) {
	dir := t.TempDir()
	command := filepath.Join(dir, "test-acp")
	if err := os.WriteFile(command, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("VELO_TEST_ACP_PATH", command)

	got, err := ResolveCommand(&config.AgentConfig{
		Command:            "missing-test-acp",
		CommandEnvironment: "VELO_TEST_ACP_PATH",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != command {
		t.Fatalf("command = %q, want %q", got, command)
	}
}

func TestResolveCommandDoesNotFallbackToNode(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	_, err := ResolveCommand(&config.AgentConfig{Command: "definitely-missing-acp"})
	if err == nil {
		t.Fatal("expected missing native agent error")
	}
}
