package acp

// Agent (server-side) method name constants.
const (
	MethodInitialize       = "initialize"
	MethodSessionNew       = "session/new"
	MethodSessionLoad      = "session/load"
	MethodSessionList      = "session/list"
	MethodSessionPrompt    = "session/prompt"
	MethodSessionCancel    = "session/cancel"
	MethodSessionSetConfig = "session/set_config_option"
	MethodSessionClose     = "session/close"
)

// Client (agent-to-client) method name constants.
const (
	ClientMethodSessionUpdate     = "session/update"
	ClientMethodRequestPermission = "session/request_permission"
	ClientMethodReadTextFile      = "fs/read_text_file"
	ClientMethodWriteTextFile     = "fs/write_text_file"
	ClientMethodCancelRequest     = "$/cancel_request"
)

// ProtocolVersion is the ACP protocol version we support.
const ProtocolVersion = 1
