package service

import (
	"context"
	"encoding/json"
	"strings"
)

type task_list_input struct {
	Context   string `json:"context,omitempty"`
	ListID    string `json:"listId,omitempty"`
	ProjectID string `json:"projectId,omitempty"`
	Status    string `json:"status,omitempty"`
	Tag       string `json:"tag,omitempty"`
}

func register_task_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("task.list", "List tasks, optionally filtered by status, project, list, tag, or context.", task_list_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request task_list_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			tasks, err := listVaultTasks(vault_ctx)
			if err != nil {
				return nil, err
			}
			tasks = filter_capability_tasks(tasks, request)
			for task_index := range tasks {
				if isPrivateAndLocked(vault_ctx, tasks[task_index].Private) {
					tasks[task_index] = redactPrivateTask(tasks[task_index])
				}
			}
			return map[string]interface{}{"tasks": tasks}, nil
		},
	)
	capability_service.register(
		read_only_capability("task.get", "Get one task by ID.", TaskIDRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskIDRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			task, err := getVaultTask(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			if isPrivateAndLocked(vault_ctx, task.Private) {
				task = redactPrivateTask(task)
			}
			return map[string]interface{}{"task": task}, nil
		},
	)
	capability_service.register(
		capability_definition("task.create", "Create a task. Use tags such as stage:backlog for items awaiting clarification or decomposition.", TaskCreateRequest{}, "title"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			task, err := createVaultTask(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"task": task}, nil
		},
	)
	capability_service.register(
		capability_definition("task.update", "Edit a task and its workflow metadata.", TaskUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			task, err := updateVaultTask(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"task": task}, nil
		},
	)
	capability_service.register(
		capability_definition("task.complete", "Mark a task completed.", TaskIDRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskIDRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			task, err := completeVaultTask(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"task": task}, nil
		},
	)
	capability_service.register(
		destructive_capability("task.delete", "Delete a task.", TaskIDRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskIDRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			if err := deleteVaultTask(vault_ctx, request.ID); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
	capability_service.register(
		capability_definition("task_note.create", "Create a memo note attached to a task.", TaskNoteCreateRequest{}, "content", "taskId"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskNoteCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			task, memo, err := createVaultTaskNote(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"memo": memo, "task": task}, nil
		},
	)
	capability_service.register(
		capability_definition("task.extract_from_memo", "Extract one Markdown todo line into a child task.", TaskExtractRequest{}, "lineIndex", "memoId", "parentTaskId"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request TaskExtractRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			parent_task, child_task, memo, err := extractSubtaskFromMemoLine(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"childTask": child_task, "memo": memo, "parentTask": parent_task}, nil
		},
	)
	rebuild_definition := capability_definition("task_index.rebuild", "Rebuild the derived task index from authoritative task files.", nil)
	rebuild_definition.Annotations.IdempotentHint = true
	capability_service.register(
		rebuild_definition,
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			index, err := rebuildTaskIndex(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"index": index, "tasks": taskIndexEntries(index)}, nil
		},
	)
}

func filter_capability_tasks(tasks []TaskRecord, request task_list_input) []TaskRecord {
	status := strings.TrimSpace(request.Status)
	project_id := sanitizeProjectID(request.ProjectID)
	list_id := sanitizeProjectID(request.ListID)
	tag := strings.TrimSpace(request.Tag)
	context_name := strings.TrimSpace(request.Context)
	if status == "" && project_id == "" && list_id == "" && tag == "" && context_name == "" {
		return tasks
	}
	filtered := make([]TaskRecord, 0, len(tasks))
	for _, task := range tasks {
		if status != "" && task.Status != normalizeTaskStatus(status) {
			continue
		}
		if project_id != "" && task.ProjectID != project_id {
			continue
		}
		if list_id != "" && task.ListID != list_id {
			continue
		}
		if tag != "" && !stringListContainsFold(task.Tags, tag) {
			continue
		}
		if context_name != "" && !stringListContainsFold(task.Contexts, context_name) {
			continue
		}
		filtered = append(filtered, task)
	}
	return filtered
}
