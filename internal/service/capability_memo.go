package service

import (
	"context"
	"encoding/json"

	"github.com/ltaoo/velo/store"
)

type memo_list_input struct {
	Archived  *bool  `json:"archived,omitempty"`
	ProjectID string `json:"projectId,omitempty"`
	Tag       string `json:"tag,omitempty"`
}

type memo_get_input struct {
	ID string `json:"id"`
}

type memo_comment_list_input struct {
	MemoID string `json:"memoId,omitempty"`
}

func register_memo_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("memo.list", "List memos, optionally filtered by project, tag, or archive state.", memo_list_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request memo_list_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			query_store, err := new_vault_memo_query_store(vault_ctx)
			if err != nil {
				return nil, err
			}
			page, err := query_store.List(call_ctx, MemoListQuery{
				Archived:  request.Archived,
				ProjectID: request.ProjectID,
				Tag:       request.Tag,
			})
			if err != nil {
				return nil, err
			}
			redact_memo_page(vault_ctx, &page)
			return map[string]interface{}{"memos": page.Memos}, nil
		},
	)
	capability_service.register(
		read_only_capability("memo.get", "Get one memo by ID, including its Markdown content and metadata.", memo_get_input{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request memo_get_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			query_store, err := new_vault_memo_query_store(vault_ctx)
			if err != nil {
				return nil, err
			}
			memo, err := query_store.Get(call_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			if isPrivateAndLocked(vault_ctx, memo.Private) {
				memo = redactPrivateMemo(memo)
			}
			return map[string]interface{}{"memo": memo}, nil
		},
	)
	capability_service.register(
		capability_definition("memo.create", "Create a memo from Markdown content.", MemoCreateRequest{}, "content"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			memo, err := createVaultMemo(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"memo": memo}, nil
		},
	)
	capability_service.register(
		capability_definition("memo.update", "Edit a memo's content or metadata.", MemoUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			memo, err := updateVaultMemo(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"memo": memo}, nil
		},
	)
	capability_service.register(
		destructive_capability("memo.delete", "Delete a memo and its comments; optionally clean referenced assets and linked tasks.", MemoDeleteRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoDeleteRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			cleanup_assets := true
			if request.CleanupAssets != nil {
				cleanup_assets = *request.CleanupAssets
			}
			delete_tasks := false
			if request.DeleteTasks != nil {
				delete_tasks = *request.DeleteTasks
			}
			result, err := deleteVaultMemoWithOptions(vault_ctx, request.ID, capability_memo_delete_options(call_ctx, vault_ctx, cleanup_assets, delete_tasks))
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{
				"assetErrors":   result.AssetErrors,
				"assetsDeleted": result.AssetsDeleted,
				"assetsSkipped": result.AssetsSkipped,
				"success":       true,
				"tasksDeleted":  result.TasksDeleted,
			}, nil
		},
	)
	register_memo_comment_capabilities(capability_service)
	register_memo_draft_capabilities(capability_service)
}

func register_memo_comment_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("memo_comment.list", "List comments, optionally for one memo.", memo_comment_list_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request memo_comment_list_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			comments, err := listVaultMemoComments(vault_ctx, request.MemoID)
			if err != nil {
				return nil, err
			}
			for comment_index, comment := range comments {
				if isPrivateAndLocked(vault_ctx, comment.Private) {
					comments[comment_index] = redactPrivateComment(comment)
				}
			}
			return map[string]interface{}{"comments": comments}, nil
		},
	)
	capability_service.register(
		capability_definition("memo_comment.create", "Create a comment on a memo.", MemoCommentCreateRequest{}, "content", "memoId"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoCommentCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			comment, err := createVaultMemoComment(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			fireCommentHooks(vault_ctx, "comment.created", comment)
			return map[string]interface{}{"comment": comment}, nil
		},
	)
	capability_service.register(
		capability_definition("memo_comment.update", "Edit a memo comment.", MemoCommentUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoCommentUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			comment, err := updateVaultMemoComment(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			fireCommentHooks(vault_ctx, "comment.updated", comment)
			return map[string]interface{}{"comment": comment}, nil
		},
	)
	capability_service.register(
		destructive_capability("memo_comment.delete", "Delete a memo comment and optionally clean referenced assets.", MemoCommentDeleteRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoCommentDeleteRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			var deleted_comment MemoCommentRecord
			if comment_path, find_err := findMemoCommentFilePath(vault_ctx, request.ID); find_err == nil {
				deleted_comment, _ = readMemoCommentFile(vault_ctx, comment_path)
			}
			cleanup_assets := true
			if request.CleanupAssets != nil {
				cleanup_assets = *request.CleanupAssets
			}
			result, err := deleteVaultMemoCommentWithOptions(vault_ctx, request.ID, capability_memo_delete_options(call_ctx, vault_ctx, cleanup_assets, false))
			if err != nil {
				return nil, err
			}
			if deleted_comment.ID != "" {
				fireCommentHooks(vault_ctx, "comment.deleted", deleted_comment)
			}
			return map[string]interface{}{
				"assetErrors":   result.AssetErrors,
				"assetsDeleted": result.AssetsDeleted,
				"assetsSkipped": result.AssetsSkipped,
				"success":       true,
			}, nil
		},
	)
}

func register_memo_draft_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("memo_draft.list", "List memo drafts.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			drafts, err := listVaultMemoDrafts(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"drafts": drafts}, nil
		},
	)
	capability_service.register(
		capability_definition("memo_draft.upsert", "Create or update a memo draft.", MemoDraftUpsertRequest{}, "content", "id", "kind"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoDraftUpsertRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			draft, err := upsertVaultMemoDraft(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"draft": draft}, nil
		},
	)
	capability_service.register(
		destructive_capability("memo_draft.delete", "Delete a memo draft.", MemoDraftDeleteRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request MemoDraftDeleteRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			if err := deleteVaultMemoDraft(vault_ctx, request.ID); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
}

func capability_memo_delete_options(call_ctx context.Context, vault_ctx *VaultContext, cleanup_assets bool, delete_tasks bool) MemoDeleteOptions {
	vault_store := store.NewWithDir(vault_ctx.VeloDir)
	return MemoDeleteOptions{
		CleanupAssets:   cleanup_assets,
		DeleteTasks:     delete_tasks,
		Parent:          call_ctx,
		StorageSettings: vault_store.Get(cloudStorageSettingsKey),
		StorePath:       vault_store.Path(),
	}
}
