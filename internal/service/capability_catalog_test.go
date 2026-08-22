package service

import (
	"context"
	"encoding/json"
	"sort"
	"testing"
)

func TestCapabilityCatalogIsDeterministicAndUnique(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	capability_service := new_capability_service(
		func() (*VaultContext, error) { return vault_ctx, nil },
		func(unlocked bool) error { vault_ctx.PrivateUnlocked = unlocked; return nil },
	)
	definitions := capability_service.Capabilities()
	if len(definitions) < 45 {
		t.Fatalf("capability count = %d, want at least 45", len(definitions))
	}
	names := make([]string, 0, len(definitions))
	seen := map[string]bool{}
	for _, definition := range definitions {
		if seen[definition.Name] {
			t.Fatalf("duplicate capability %q", definition.Name)
		}
		seen[definition.Name] = true
		names = append(names, definition.Name)
		if definition.InputSchema["type"] != "object" {
			t.Fatalf("capability %q schema is not an object", definition.Name)
		}
	}
	if !sort.StringsAreSorted(names) {
		t.Fatalf("capabilities are not sorted: %v", names)
	}
	for _, required_name := range []string{"memo.list", "memo.create", "memo.get", "memo.update", "task.list", "task.create"} {
		if !seen[required_name] {
			t.Fatalf("missing capability %q", required_name)
		}
	}
}

func TestCapabilityMemoAndTaskLifecycle(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	capability_service := new_capability_service(
		func() (*VaultContext, error) { return vault_ctx, nil },
		func(unlocked bool) error { vault_ctx.PrivateUnlocked = unlocked; return nil },
	)

	memo_result := invoke_test_capability(t, capability_service, "memo.create", map[string]interface{}{
		"content": "Capability memo #architecture",
	})
	memo_value := capability_result_value(t, memo_result, "memo")
	memo_id, _ := memo_value["id"].(string)
	if memo_id == "" {
		t.Fatal("created memo id is empty")
	}

	get_result := invoke_test_capability(t, capability_service, "memo.get", map[string]interface{}{"id": memo_id})
	get_memo := capability_result_value(t, get_result, "memo")
	if get_memo["content"] != "Capability memo #architecture" {
		t.Fatalf("memo content = %#v", get_memo["content"])
	}

	task_result := invoke_test_capability(t, capability_service, "task.create", map[string]interface{}{
		"tags":  []string{task_tag_stage_backlog},
		"title": "Clarify capability contract",
	})
	task_value := capability_result_value(t, task_result, "task")
	task_id, _ := task_value["id"].(string)
	if task_id == "" {
		t.Fatal("created task id is empty")
	}

	list_result := invoke_test_capability(t, capability_service, "task.list", map[string]interface{}{"tag": task_tag_stage_backlog})
	list_value, ok := list_result.(map[string]interface{})
	if !ok {
		t.Fatalf("task list result type = %T", list_result)
	}
	tasks, ok := list_value["tasks"].([]interface{})
	if !ok || len(tasks) != 1 {
		t.Fatalf("task list = %#v", list_value["tasks"])
	}

	complete_result := invoke_test_capability(t, capability_service, "task.complete", map[string]interface{}{"id": task_id})
	completed_task := capability_result_value(t, complete_result, "task")
	if completed_task["status"] != taskStatusCompleted {
		t.Fatalf("completed status = %#v", completed_task["status"])
	}
}

func invoke_test_capability(t *testing.T, capability_service *CapabilityService, name string, input interface{}) interface{} {
	t.Helper()
	raw_input, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("marshal input: %v", err)
	}
	result, err := capability_service.Invoke(context.Background(), name, raw_input)
	if err != nil {
		t.Fatalf("invoke %s: %v", name, err)
	}
	raw_result, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	var normalized interface{}
	if err := json.Unmarshal(raw_result, &normalized); err != nil {
		t.Fatalf("normalize result: %v", err)
	}
	return normalized
}

func capability_result_value(t *testing.T, result interface{}, key string) map[string]interface{} {
	t.Helper()
	result_map, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("result type = %T", result)
	}
	value, ok := result_map[key].(map[string]interface{})
	if !ok {
		t.Fatalf("result[%q] = %#v", key, result_map[key])
	}
	return value
}
