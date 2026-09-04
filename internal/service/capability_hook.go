package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type hook_create_input struct {
	Enabled bool     `json:"enabled"`
	Events  []string `json:"events"`
	Name    string   `json:"name"`
	URL     string   `json:"url"`
}

type hook_update_input struct {
	Enabled *bool     `json:"enabled"`
	Events  *[]string `json:"events"`
	ID      string    `json:"id"`
	Name    *string   `json:"name"`
	URL     *string   `json:"url"`
}

type hook_id_input struct {
	ID string `json:"id"`
}

func register_hook_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("hook.list", "List configured event webhooks.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := loadHooks(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"hooks": file.Hooks}, nil
		},
	)
	capability_service.register(
		capability_definition("hook.create", "Create an event webhook configuration.", hook_create_input{}, "events", "name", "url"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request hook_create_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			hook := HookConfig{
				Enabled: request.Enabled,
				Events:  request.Events,
				ID:      newHookID(),
				Name:    strings.TrimSpace(request.Name),
				URL:     strings.TrimSpace(request.URL),
			}
			if hook.Name == "" || hook.URL == "" {
				return nil, fmt.Errorf("hook name and url are required")
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := loadHooks(vault_ctx)
			if err != nil {
				return nil, err
			}
			file.Hooks = append(file.Hooks, hook)
			if err := saveHooks(vault_ctx, file); err != nil {
				return nil, err
			}
			return map[string]interface{}{"hook": hook}, nil
		},
	)
	capability_service.register(
		capability_definition("hook.update", "Edit an event webhook configuration.", hook_update_input{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request hook_update_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := loadHooks(vault_ctx)
			if err != nil {
				return nil, err
			}
			updated_index := -1
			for hook_index := range file.Hooks {
				if file.Hooks[hook_index].ID != strings.TrimSpace(request.ID) {
					continue
				}
				if request.Name != nil {
					file.Hooks[hook_index].Name = strings.TrimSpace(*request.Name)
				}
				if request.URL != nil {
					file.Hooks[hook_index].URL = strings.TrimSpace(*request.URL)
				}
				if request.Enabled != nil {
					file.Hooks[hook_index].Enabled = *request.Enabled
				}
				if request.Events != nil {
					file.Hooks[hook_index].Events = *request.Events
				}
				if file.Hooks[hook_index].Name == "" || file.Hooks[hook_index].URL == "" {
					return nil, fmt.Errorf("hook name and url are required")
				}
				updated_index = hook_index
				break
			}
			if updated_index < 0 {
				return nil, fmt.Errorf("hook not found")
			}
			updated_hook := file.Hooks[updated_index]
			if err := saveHooks(vault_ctx, file); err != nil {
				return nil, err
			}
			return map[string]interface{}{"hook": updated_hook}, nil
		},
	)
	capability_service.register(
		destructive_capability("hook.delete", "Delete an event webhook configuration.", hook_id_input{}, "id"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request hook_id_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			file, err := loadHooks(vault_ctx)
			if err != nil {
				return nil, err
			}
			filtered := make([]HookConfig, 0, len(file.Hooks))
			found := false
			for _, hook := range file.Hooks {
				if hook.ID == strings.TrimSpace(request.ID) {
					found = true
					continue
				}
				filtered = append(filtered, hook)
			}
			if !found {
				return nil, fmt.Errorf("hook not found")
			}
			file.Hooks = filtered
			if err := saveHooks(vault_ctx, file); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
}
