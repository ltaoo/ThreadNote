package config

import "testing"

func TestBuiltinAgentsUseNativeExecutables(t *testing.T) {
	for id, cfg := range BuiltinAgents() {
		if cfg.Command == "npx" || cfg.Command == "npm" || cfg.Command == "node" {
			t.Fatalf("agent %s uses Node.js launcher %q", id, cfg.Command)
		}
	}
	opencode := GetAgent("opencode")
	if opencode == nil {
		t.Fatal("opencode agent is missing")
	}
	if opencode.Command != "opencode" {
		t.Fatalf("opencode command = %q", opencode.Command)
	}
	if len(opencode.Args) != 1 || opencode.Args[0] != "acp" {
		t.Fatalf("opencode args = %v", opencode.Args)
	}
}
