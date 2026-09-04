package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type history_input struct {
	ID      string `json:"id"`
	Version int    `json:"version,omitempty"`
}

type history_kind struct {
	find_path    func(*VaultContext, string) (string, error)
	history_path func(string) string
	result_name  string
	restore      func(*VaultContext, string, string) (interface{}, error)
}

func register_history_capabilities(capability_service *CapabilityService) {
	register_history_kind(capability_service, "memo_history", "memo", history_kind{
		find_path:    findMemoFilePath,
		history_path: memoHistoryPath,
		result_name:  "memo",
		restore: func(vault_ctx *VaultContext, id string, content string) (interface{}, error) {
			memo, err := updateVaultMemo(vault_ctx, MemoUpdateRequest{ID: id, Content: &content})
			if err != nil {
				return nil, err
			}
			return memo, nil
		},
	})
	register_history_kind(capability_service, "memo_comment_history", "memo comment", history_kind{
		find_path:    findMemoCommentFilePath,
		history_path: commentHistoryPath,
		result_name:  "comment",
		restore: func(vault_ctx *VaultContext, id string, content string) (interface{}, error) {
			comment, err := updateVaultMemoComment(vault_ctx, MemoCommentUpdateRequest{ID: id, Content: &content})
			if err != nil {
				return nil, err
			}
			return comment, nil
		},
	})
}

func register_history_kind(capability_service *CapabilityService, capability_prefix string, label string, kind history_kind) {
	capability_service.register(
		read_only_capability(capability_prefix+".list", "List saved versions for a "+label+".", history_input{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			request, _, history_file, err := load_capability_history(capability_service, input, kind)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"id": request.ID, "versions": history_file.Versions}, nil
		},
	)
	capability_service.register(
		read_only_capability(capability_prefix+".get", "Rebuild one saved version of a "+label+". Version 0 is the original content.", history_input{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			request, vault_ctx, _, err := load_capability_history(capability_service, input, kind)
			if err != nil {
				return nil, err
			}
			record_path, err := kind.find_path(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			history_path := kind.history_path(record_path)
			content, err := rebuildHistoryVersion(vault_ctx, history_path, request.Version)
			if err != nil {
				return nil, err
			}
			history_file, _ := loadHistoryFile(vault_ctx, history_path)
			return map[string]interface{}{"content": content, "version": request.Version, "versions": history_file.Versions}, nil
		},
	)
	capability_service.register(
		read_only_capability(capability_prefix+".diff", "Get changed fields and content operations for one "+label+" version.", history_input{}, "id", "version"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			request, _, history_file, err := load_capability_history(capability_service, input, kind)
			if err != nil {
				return nil, err
			}
			if request.Version < 1 {
				return nil, fmt.Errorf("version must be >= 1")
			}
			if request.Version > len(history_file.Versions) {
				return nil, fmt.Errorf("version not found")
			}
			entry := history_file.Versions[request.Version-1]
			return map[string]interface{}{
				"changedFields": entry.ChangedFields,
				"contentOps":    entry.ContentOps,
				"version":       request.Version,
			}, nil
		},
	)
	capability_service.register(
		capability_definition(capability_prefix+".restore", "Restore a "+label+" to a saved version while preserving a new history entry.", history_input{}, "id", "version"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			request, vault_ctx, _, err := load_capability_history(capability_service, input, kind)
			if err != nil {
				return nil, err
			}
			record_path, err := kind.find_path(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			content, err := rebuildHistoryVersion(vault_ctx, kind.history_path(record_path), request.Version)
			if err != nil {
				return nil, err
			}
			restored, err := kind.restore(vault_ctx, request.ID, content)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{kind.result_name: restored}, nil
		},
	)
}

func load_capability_history(capability_service *CapabilityService, input json.RawMessage, kind history_kind) (history_input, *VaultContext, HistoryFile, error) {
	var request history_input
	if err := decode_capability_input(input, &request); err != nil {
		return request, nil, HistoryFile{}, err
	}
	request.ID = strings.TrimSpace(request.ID)
	if request.ID == "" {
		return request, nil, HistoryFile{}, fmt.Errorf("id is required")
	}
	vault_ctx, err := capability_service.require_vault()
	if err != nil {
		return request, nil, HistoryFile{}, err
	}
	record_path, err := kind.find_path(vault_ctx, request.ID)
	if err != nil {
		return request, nil, HistoryFile{}, err
	}
	history_file, err := loadHistoryFile(vault_ctx, kind.history_path(record_path))
	if err != nil {
		return request, nil, HistoryFile{}, err
	}
	return request, vault_ctx, history_file, nil
}
