package service

import (
	"context"
	"encoding/json"
)

func register_project_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("project.list", "List projects and the active project.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := listVaultProjects(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"activeProjectId": file.ActiveProjectID, "projects": file.Projects}, nil
		},
	)
	capability_service.register(
		capability_definition("project.create", "Create a project.", ProjectCreateRequest{}, "name"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request ProjectCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			project, err := createVaultProject(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"project": project}, nil
		},
	)
	capability_service.register(
		capability_definition("project.update", "Update a project.", ProjectUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request ProjectUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			project, err := updateVaultProject(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"project": project}, nil
		},
	)
	capability_service.register(
		capability_definition("project.activate", "Set the active project.", ProjectActivateRequest{}, "projectId"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request ProjectActivateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := activateVaultProject(vault_ctx, request.ProjectID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"activeProjectId": file.ActiveProjectID, "projects": file.Projects}, nil
		},
	)
}
