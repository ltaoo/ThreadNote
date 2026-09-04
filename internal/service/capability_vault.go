package service

import (
	"context"
	"encoding/json"
	"os"
)

func register_vault_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("vault.status", "Get the configured vault and known vault registry.", nil),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			registry, err := loadVaultRegistry()
			if err != nil {
				return nil, err
			}
			data_path, err := globalVaultDataPath()
			if err != nil {
				return nil, err
			}
			_, stat_err := os.Stat(data_path)
			vault_ctx, vault_err := capability_service.require_vault()
			if vault_err != nil {
				vault_ctx = nil
			}
			return map[string]interface{}{
				"active":         vault_ctx,
				"activeVaultId":  registry.ActiveVaultID,
				"dataFileExists": stat_err == nil,
				"dataPath":       data_path,
				"vaults":         registry.Vaults,
			}, nil
		},
	)
}
