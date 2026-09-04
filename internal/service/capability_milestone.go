package service

import (
	"context"
	"encoding/json"
	"strings"
)

type milestone_list_input struct {
	ProjectID string `json:"projectId,omitempty"`
	Status    string `json:"status,omitempty"`
}

func register_milestone_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("milestone.list", "List milestones, optionally filtered by status or project.", milestone_list_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request milestone_list_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := listVaultGTDMilestones(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"milestones": filter_capability_milestones(file.Milestones, request)}, nil
		},
	)
	capability_service.register(
		read_only_capability("milestone.get", "Get one milestone by ID.", gtd_milestone_id_request{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request gtd_milestone_id_request
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			milestone, err := getVaultGTDMilestone(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"milestone": milestone}, nil
		},
	)
	capability_service.register(
		capability_definition("milestone.create", "Create a milestone.", GTDMilestoneCreateRequest{}, "title"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request GTDMilestoneCreateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			milestone, err := createVaultGTDMilestone(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"milestone": milestone}, nil
		},
	)
	capability_service.register(
		capability_definition("milestone.update", "Edit a milestone.", GTDMilestoneUpdateRequest{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request GTDMilestoneUpdateRequest
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			milestone, err := updateVaultGTDMilestone(vault_ctx, request)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"milestone": milestone}, nil
		},
	)
	capability_service.register(
		capability_definition("milestone.complete", "Mark a milestone completed.", gtd_milestone_id_request{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request gtd_milestone_id_request
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			milestone, err := completeVaultGTDMilestone(vault_ctx, request.ID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"milestone": milestone}, nil
		},
	)
	capability_service.register(
		destructive_capability("milestone.delete", "Delete a milestone.", gtd_milestone_id_request{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request gtd_milestone_id_request
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			if err := deleteVaultGTDMilestone(vault_ctx, request.ID); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
}

func filter_capability_milestones(milestones []GTDMilestoneRecord, request milestone_list_input) []GTDMilestoneRecord {
	status := strings.TrimSpace(request.Status)
	project_id := sanitizeProjectID(request.ProjectID)
	if status == "" && project_id == "" {
		return milestones
	}
	filtered := make([]GTDMilestoneRecord, 0, len(milestones))
	for _, milestone := range milestones {
		if status != "" && milestone.Status != normalizeGTDMilestoneStatus(status) {
			continue
		}
		if project_id != "" && !stringListContains(milestone.ProjectIDs, project_id) {
			continue
		}
		filtered = append(filtered, milestone)
	}
	return filtered
}
