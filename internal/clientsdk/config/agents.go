package config

import "example/simple/internal/clientsdk/acp"

// AgentConfig defines how to launch an ACP agent process.
type AgentConfig struct {
	ID                   string
	Label                string
	Command              string
	CommandEnvironment   string
	HomeRelativeCommands []string
	Args                 []string
	ConfigOptions        []acp.SessionConfigOption
}

// BuiltinAgents follows the ACP Registry binary distribution model: execute a
// native agent binary directly with the manifest-provided ACP arguments.
func BuiltinAgents() map[string]*AgentConfig {
	return map[string]*AgentConfig{
		"opencode": {
			ID:                   "opencode",
			Label:                "OpenCode",
			Command:              "opencode",
			CommandEnvironment:   "VELO_OPENCODE_ACP_PATH",
			HomeRelativeCommands: []string{".opencode/bin/opencode"},
			Args:                 []string{"acp"},
		},
	}
}

// GetAgent returns the agent config for the given ID, or nil if not found.
func GetAgent(id string) *AgentConfig {
	return BuiltinAgents()[id]
}

// ListAgentIds returns all built-in agent IDs.
func ListAgentIds() []string {
	return []string{"opencode"}
}
