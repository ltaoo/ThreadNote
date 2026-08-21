package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExternalAPICapabilityCatalogAndCall(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	setActiveVault(vault_ctx)
	defer setActiveVault(nil)

	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{}))
	defer server.Close()

	status, envelope := externalAPITestRequest(t, server.URL, http.MethodGet, "/api/capabilities", nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("catalog status=%d envelope=%+v", status, envelope)
	}
	var catalog_data struct {
		Capabilities []CapabilityDefinition `json:"capabilities"`
	}
	if err := json.Unmarshal(envelope.Data, &catalog_data); err != nil {
		t.Fatalf("decode catalog: %v", err)
	}
	if len(catalog_data.Capabilities) < 45 {
		t.Fatalf("capability count = %d", len(catalog_data.Capabilities))
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, "/api/capabilities/memo.create", map[string]interface{}{
		"content": "Generic API memo",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("call status=%d envelope=%+v", status, envelope)
	}
	var create_data struct {
		Memo MemoRecord `json:"memo"`
	}
	if err := json.Unmarshal(envelope.Data, &create_data); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if create_data.Memo.ID == "" {
		t.Fatal("created memo id is empty")
	}
}
