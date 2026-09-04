package service

import (
	"context"
	"encoding/json"
)

type search_input struct {
	Limit int    `json:"limit,omitempty"`
	Query string `json:"query,omitempty"`
}

func register_search_capabilities(capability_service *CapabilityService) {
	capability_service.register(
		read_only_capability("snippet.search", "Search code snippets extracted from memos and comments. Use a snippet search directive in query.", search_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request search_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			items, err := searchVaultSnippets(vault_ctx, request.Query, normalize_capability_search_limit(request.Limit))
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"items": items}, nil
		},
	)
	capability_service.register(
		read_only_capability("link.search", "Search links extracted from memos and comments.", search_input{}),
		func(call_ctx context.Context, input json.RawMessage) (interface{}, error) {
			var request search_input
			if err := decode_capability_input(input, &request); err != nil {
				return nil, err
			}
			vault_ctx, err := capability_service.require_vault()
			if err != nil {
				return nil, err
			}
			items, err := searchVaultLinks(vault_ctx, request.Query, normalize_capability_search_limit(request.Limit))
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"items": items}, nil
		},
	)
}

func normalize_capability_search_limit(limit int) int {
	if limit <= 0 {
		return 12
	}
	if limit > 50 {
		return 50
	}
	return limit
}
