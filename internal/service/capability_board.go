package service

import (
	"context"
	"encoding/json"
)

func register_board_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("board.list", "List task boards.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := loadBoards(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"boards": file.Boards}, nil
		},
	)
	capability_service.register(
		read_only_capability("board.preset_list", "List built-in board templates.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			return map[string]interface{}{"presets": boardPresets}, nil
		},
	)
	capability_service.register(
		capability_definition("board.create", "Create a task board.", BoardCreateRequest{}, "columns", "title"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request BoardCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			board, err := createVaultBoard(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"board": board}, nil
		},
	)
	capability_service.register(
		capability_definition("board.update", "Edit a task board.", BoardUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request BoardUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			board, err := updateVaultBoard(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"board": board}, nil
		},
	)
	capability_service.register(
		destructive_capability("board.delete", "Delete a task board.", BoardIDRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request BoardIDRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			if err := deleteVaultBoard(vault_ctx, request.ID); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
	refresh_definition := capability_definition("board.refresh", "Re-evaluate a board's rules against its project tasks.", BoardIDRequest{}, "id")
	refresh_definition.Annotations.IdempotentHint = true
	capability_service.register(
		refresh_definition,
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request BoardIDRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			updated_count, err := RefreshBoardRules(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"updated": updated_count}, nil
		},
	)
}
