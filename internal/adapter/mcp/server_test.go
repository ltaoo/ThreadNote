package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestMCPCurrentDiscoveryAndLegacyTools(t *testing.T) {
	capability_adapter := test_mcp_adapter()
	input := strings.NewReader(
		`{"jsonrpc":"2.0","id":"discover","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}` + "\n" +
			`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}` + "\n" +
			`{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"memo.create","arguments":{"content":"MCP memo"}}}` + "\n",
	)
	var output bytes.Buffer
	if err := Serve(context.Background(), capability_adapter, input, &output, "test-version"); err != nil {
		t.Fatalf("serve: %v", err)
	}
	responses := decode_mcp_test_responses(t, output.String())
	if len(responses) != 4 {
		t.Fatalf("response count = %d; output=%s", len(responses), output.String())
	}
	discover_result := responses[0]["result"].(map[string]interface{})
	if discover_result["resultType"] != "complete" {
		t.Fatalf("discover result = %#v", discover_result)
	}
	list_result := responses[2]["result"].(map[string]interface{})
	tools, ok := list_result["tools"].([]interface{})
	if !ok || len(tools) != 1 {
		t.Fatalf("tools = %#v", list_result["tools"])
	}
	call_result := responses[3]["result"].(map[string]interface{})
	if call_result["isError"] != false || call_result["structuredContent"] == nil {
		t.Fatalf("call result = %#v", call_result)
	}
}

func test_mcp_adapter() CapabilityAdapter {
	return CapabilityAdapter{
		Invoke: func(call_ctx context.Context, name string, input json.RawMessage) (interface{}, error) {
			return map[string]interface{}{"memo": map[string]interface{}{"content": "MCP memo", "id": "memo_test"}}, nil
		},
		Tools: []Tool{{
			Description: "Create a memo.",
			InputSchema: map[string]interface{}{"type": "object"},
			Name:        "memo.create",
		}},
	}
}

func decode_mcp_test_responses(t *testing.T, output string) []map[string]interface{} {
	t.Helper()
	lines := strings.Split(strings.TrimSpace(output), "\n")
	responses := make([]map[string]interface{}, 0, len(lines))
	for _, line := range lines {
		var response map[string]interface{}
		if err := json.Unmarshal([]byte(line), &response); err != nil {
			t.Fatalf("decode response %q: %v", line, err)
		}
		responses = append(responses, response)
	}
	return responses
}
