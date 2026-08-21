package service

import (
	"context"
	"encoding/json"
)

type privacy_pin_input struct {
	Pin string `json:"pin"`
}

func register_privacy_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("privacy.status", "Get private-content PIN and unlock state for the configured vault.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			has_pin, err := hasPrivacyPin(vault_ctx)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"hasPin": has_pin, "unlocked": vault_ctx.PrivateUnlocked}, nil
		},
	)
	capability_service.register(
		capability_definition("privacy.set_pin", "Set or replace the private-content PIN for the configured vault.", privacy_pin_input{}, "pin"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request privacy_pin_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			if err := setPrivacyPin(vault_ctx, request.Pin); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
	capability_service.register(
		capability_definition("privacy.unlock", "Unlock private content in this process using the vault PIN.", privacy_pin_input{}, "pin"),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request privacy_pin_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			unlocked, err := verifyPrivacyPin(vault_ctx, request.Pin)
			if err != nil {
				return nil, err
			}
			if !unlocked {
				return map[string]interface{}{"message": "PIN incorrect", "unlocked": false}, nil
			}
			if err := capability_service.set_private_unlocked(true); err != nil {
				return nil, err
			}
			return map[string]interface{}{"unlocked": true}, nil
		},
	)
	lock_definition := capability_definition("privacy.lock", "Lock private content in this process.", nil)
	lock_definition.Annotations.IdempotentHint = true
	capability_service.register(
		lock_definition,
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			if err := capability_service.set_private_unlocked(false); err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		},
	)
}
