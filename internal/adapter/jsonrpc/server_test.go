package jsonrpc

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"example/simple/internal/service"
)

func TestJSONRPCDiscoveryAndDirectCapabilityCall(t *testing.T) {
	capability_service := open_test_capability_service(t)
	input := strings.NewReader(
		`{"jsonrpc":"2.0","id":1,"method":"rpc.discover","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","id":2,"method":"task.create","params":{"title":"JSON-RPC task"}}` + "\n" +
			`{"jsonrpc":"2.0","id":3,"method":"task.list","params":{}}` + "\n",
	)
	var output bytes.Buffer
	if err := Serve(context.Background(), capability_service, input, &output); err != nil {
		t.Fatalf("serve: %v", err)
	}
	responses := decode_test_responses(t, output.String())
	if len(responses) != 3 {
		t.Fatalf("response count = %d", len(responses))
	}
	if responses[0]["error"] != nil || responses[1]["error"] != nil || responses[2]["error"] != nil {
		t.Fatalf("responses = %#v", responses)
	}
	result, ok := responses[2]["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("list result = %#v", responses[2]["result"])
	}
	tasks, ok := result["tasks"].([]interface{})
	if !ok || len(tasks) != 1 {
		t.Fatalf("tasks = %#v", result["tasks"])
	}
}

func open_test_capability_service(t *testing.T) *service.CapabilityService {
	t.Helper()
	vault_path := t.TempDir()
	if err := os.MkdirAll(filepath.Join(vault_path, ".velo"), 0755); err != nil {
		t.Fatalf("create vault config: %v", err)
	}
	capability_service, err := service.OpenCapabilityService(vault_path)
	if err != nil {
		t.Fatalf("open capability service: %v", err)
	}
	return capability_service
}

func decode_test_responses(t *testing.T, output string) []map[string]interface{} {
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
