package acp

import "encoding/json"

// --- Initialization ---

type InitializeRequest struct {
	ProtocolVersion    int                 `json:"protocolVersion"`
	ClientInfo         *Implementation     `json:"clientInfo,omitempty"`
	ClientCapabilities *ClientCapabilities `json:"clientCapabilities,omitempty"`
}

type InitializeResponse struct {
	ProtocolVersion   int                `json:"protocolVersion"`
	AgentInfo         *Implementation    `json:"agentInfo,omitempty"`
	AgentCapabilities *AgentCapabilities `json:"agentCapabilities,omitempty"`
	AuthMethods       []AuthMethod       `json:"authMethods,omitempty"`
}

type Implementation struct {
	Name    string `json:"name"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version"`
}

type ClientCapabilities struct {
	FS *FSCapabilities `json:"fs,omitempty"`
}

type FSCapabilities struct {
	ReadTextFile  interface{} `json:"readTextFile,omitempty"`
	WriteTextFile interface{} `json:"writeTextFile,omitempty"`
}

type AgentCapabilities struct {
	SessionCapabilities interface{} `json:"sessionCapabilities,omitempty"`
	PromptCapabilities  interface{} `json:"promptCapabilities,omitempty"`
}

type SessionCapabilities struct {
	List   interface{} `json:"list,omitempty"`
	Load   interface{} `json:"load,omitempty"`
	Close  interface{} `json:"close,omitempty"`
	Delete interface{} `json:"delete,omitempty"`
}

type PromptCapabilities struct {
	Image            interface{} `json:"image,omitempty"`
	Audio            interface{} `json:"audio,omitempty"`
	EmbeddedResource interface{} `json:"embeddedResource,omitempty"`
}

type AuthMethod struct {
	ID    string `json:"id"`
	Name  string `json:"name,omitempty"`
	Label string `json:"label,omitempty"`
}

// --- Session ---

type NewSessionRequest struct {
	Cwd        string      `json:"cwd"`
	McpServers []McpServer `json:"mcpServers"`
}

type NewSessionResponse struct {
	SessionID     string                `json:"sessionId"`
	ConfigOptions []SessionConfigOption `json:"configOptions,omitempty"`
	Modes         *SessionModeState     `json:"modes,omitempty"`
}

type LoadSessionRequest struct {
	SessionID  string      `json:"sessionId"`
	Cwd        string      `json:"cwd"`
	McpServers []McpServer `json:"mcpServers"`
}

type LoadSessionResponse struct {
	ConfigOptions []SessionConfigOption `json:"configOptions,omitempty"`
	Modes         *SessionModeState     `json:"modes,omitempty"`
}

type SessionModeState struct {
	AvailableModes []SessionMode `json:"availableModes"`
	CurrentModeID  string        `json:"currentModeId,omitempty"`
}

type SessionMode struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Label string `json:"label,omitempty"`
}

type ListSessionsRequest struct {
	Cwd    *string `json:"cwd,omitempty"`
	Cursor *string `json:"cursor,omitempty"`
}

type ListSessionsResponse struct {
	Sessions   []SessionInfo `json:"sessions"`
	NextCursor *string       `json:"nextCursor,omitempty"`
}

type SessionInfo struct {
	SessionID string  `json:"sessionId"`
	Cwd       string  `json:"cwd"`
	Title     *string `json:"title,omitempty"`
	UpdatedAt *string `json:"updatedAt,omitempty"`
}

type CloseSessionRequest struct {
	SessionID string `json:"sessionId"`
}

type CloseSessionResponse struct{}

// --- Prompt ---

type PromptRequest struct {
	SessionID string         `json:"sessionId"`
	Prompt    []ContentBlock `json:"prompt"`
}

type PromptResponse struct {
	StopReason string `json:"stopReason"`
	Usage      *Usage `json:"usage,omitempty"`
}

type Usage struct {
	InputTokens  int `json:"inputTokens,omitempty"`
	OutputTokens int `json:"outputTokens,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	// For text blocks
	Text string `json:"text,omitempty"`
	// For resource_link blocks
	URI      string `json:"uri,omitempty"`
	Name     string `json:"name,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

// --- Cancel ---

type CancelNotification struct {
	SessionID string `json:"sessionId"`
}

// --- Config ---

type SetSessionConfigOptionRequest struct {
	SessionID string      `json:"sessionId"`
	ConfigID  string      `json:"configId"`
	Value     interface{} `json:"value"`
	Type      string      `json:"type,omitempty"`
}

type SetSessionConfigOptionResponse struct {
	ConfigOptions []SessionConfigOption `json:"configOptions"`
}

type SessionConfigOption struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Type        string  `json:"type"` // "select" or "boolean"
	Description *string `json:"description,omitempty"`
	Category    *string `json:"category,omitempty"`

	// For select type
	CurrentValue *string                 `json:"currentValue,omitempty"`
	Options      []SessionConfigOptItem  `json:"options,omitempty"`
	Groups       []SessionConfigOptGroup `json:"groups,omitempty"`

	// For boolean type
	BoolValue *bool `json:"currentValue,omitempty"` // re-uses currentValue for bool
}

func (o *SessionConfigOption) UnmarshalJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	o.ID, _ = raw["id"].(string)
	o.Name, _ = raw["name"].(string)
	o.Type, _ = raw["type"].(string)
	if v, ok := raw["description"].(string); ok {
		o.Description = &v
	}
	if v, ok := raw["category"].(string); ok {
		o.Category = &v
	}
	// currentValue can be string (select) or bool (boolean)
	if cv, ok := raw["currentValue"]; ok {
		switch v := cv.(type) {
		case string:
			o.CurrentValue = &v
		case bool:
			o.BoolValue = &v
		case float64:
			// JSON numbers come as float64; treat 1/0 as bool
			b := v != 0
			o.BoolValue = &b
		}
	}
	if options, ok := raw["options"].([]interface{}); ok {
		o.Options = make([]SessionConfigOptItem, len(options))
		for i, item := range options {
			if m, ok := item.(map[string]interface{}); ok {
				o.Options[i].Value, _ = m["value"].(string)
				o.Options[i].Name, _ = m["name"].(string)
			}
		}
	}
	if groups, ok := raw["groups"].([]interface{}); ok {
		o.Groups = make([]SessionConfigOptGroup, len(groups))
		for i, g := range groups {
			if m, ok := g.(map[string]interface{}); ok {
				o.Groups[i].Name, _ = m["name"].(string)
				if gOpts, ok := m["options"].([]interface{}); ok {
					o.Groups[i].Options = make([]SessionConfigOptItem, len(gOpts))
					for j, item := range gOpts {
						if im, ok := item.(map[string]interface{}); ok {
							o.Groups[i].Options[j].Value, _ = im["value"].(string)
							o.Groups[i].Options[j].Name, _ = im["name"].(string)
						}
					}
				}
			}
		}
	}
	return nil
}

func (o SessionConfigOption) MarshalJSON() ([]byte, error) {
	m := map[string]interface{}{
		"id":   o.ID,
		"name": o.Name,
		"type": o.Type,
	}
	if o.Description != nil {
		m["description"] = *o.Description
	}
	if o.Category != nil {
		m["category"] = *o.Category
	}
	if o.BoolValue != nil {
		m["currentValue"] = *o.BoolValue
	} else if o.CurrentValue != nil {
		m["currentValue"] = *o.CurrentValue
	}
	if len(o.Options) > 0 {
		m["options"] = o.Options
	}
	if len(o.Groups) > 0 {
		m["groups"] = o.Groups
	}
	return json.Marshal(m)
}

type SessionConfigOptItem struct {
	Value string `json:"value"`
	Name  string `json:"name"`
}

type SessionConfigOptGroup struct {
	Name    string                 `json:"name"`
	Options []SessionConfigOptItem `json:"options"`
}

// --- Session Notification / Update ---

type SessionNotification struct {
	SessionID string        `json:"sessionId"`
	Update    SessionUpdate `json:"update"`
}

type SessionUpdate struct {
	SessionUpdate string `json:"sessionUpdate"`

	// For message_chunk types
	Content    any     `json:"content,omitempty"`
	MessageID  *string `json:"messageId,omitempty"`
	State      string  `json:"state,omitempty"`
	StopReason *string `json:"stopReason,omitempty"`

	// For tool_call
	ToolCallID string `json:"toolCallId,omitempty"`
	Title      string `json:"title,omitempty"`
	Status     string `json:"status,omitempty"`

	// For plan
	Entries []PlanEntry `json:"entries,omitempty"`

	// For config_option_update
	ConfigOptions []SessionConfigOption `json:"configOptions,omitempty"`

	// For session_info_update (title is reused)
}

type PlanEntry struct {
	Content  string `json:"content"`
	Priority string `json:"priority"`
	Status   string `json:"status"`
}

// --- Permission ---

type RequestPermissionRequest struct {
	SessionID string             `json:"sessionId"`
	ToolCall  ToolCallUpdate     `json:"toolCall"`
	Options   []PermissionOption `json:"options"`
}

type RequestPermissionResponse struct {
	Outcome PermissionOutcome `json:"outcome"`
}

type PermissionOutcome struct {
	Outcome  string `json:"outcome"`
	OptionID string `json:"optionId,omitempty"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Kind     string `json:"kind"`
	Label    string `json:"label,omitempty"`
}

type ToolCallUpdate struct {
	ToolCallID string `json:"toolCallId"`
	Status     string `json:"status,omitempty"`
	Title      string `json:"title,omitempty"`
}

// --- FS ---

type ReadTextFileRequest struct {
	SessionID string `json:"sessionId"`
	Path      string `json:"path"`
	Line      *int   `json:"line,omitempty"`
	Limit     *int   `json:"limit,omitempty"`
}

type ReadTextFileResponse struct {
	Content string `json:"content"`
}

type WriteTextFileRequest struct {
	SessionID string `json:"sessionId"`
	Path      string `json:"path"`
	Content   string `json:"content"`
}

type WriteTextFileResponse struct{}

// --- MCP ---

type McpServer struct {
	Type    string            `json:"type"` // "stdio"
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env,omitempty"`
}
