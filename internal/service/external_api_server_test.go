package service

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

type externalAPITestEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func TestExternalAPITaskLifecycle(t *testing.T) {
	ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	setActiveVault(ctx)
	defer setActiveVault(nil)

	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{}))
	defer server.Close()

	status, envelope := externalAPITestRequest(t, server.URL, http.MethodPost, "/api/tasks", map[string]interface{}{
		"tags":  []string{"api", task_tag_stage_backlog},
		"title": "External backlog task",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("create status=%d envelope=%+v", status, envelope)
	}
	var create_data struct {
		Task TaskRecord `json:"task"`
	}
	if err := json.Unmarshal(envelope.Data, &create_data); err != nil {
		t.Fatalf("decode create data: %v", err)
	}
	if create_data.Task.ID == "" {
		t.Fatalf("created task id is empty")
	}

	task_path := "/api/tasks/" + url.PathEscape(create_data.Task.ID)
	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPatch, task_path, map[string]interface{}{
		"notes": "ship the external API",
		"title": "External API task",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("update status=%d envelope=%+v", status, envelope)
	}
	var update_data struct {
		Task TaskRecord `json:"task"`
	}
	if err := json.Unmarshal(envelope.Data, &update_data); err != nil {
		t.Fatalf("decode update data: %v", err)
	}
	if update_data.Task.Title != "External API task" || update_data.Task.Notes != "ship the external API" {
		t.Fatalf("updated task = %+v", update_data.Task)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, task_path+"/complete", nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("complete status=%d envelope=%+v", status, envelope)
	}
	var complete_data struct {
		Task TaskRecord `json:"task"`
	}
	if err := json.Unmarshal(envelope.Data, &complete_data); err != nil {
		t.Fatalf("decode complete data: %v", err)
	}
	if complete_data.Task.Status != taskStatusCompleted || complete_data.Task.CompletedAt == "" {
		t.Fatalf("completed task = %+v", complete_data.Task)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodGet, "/api/tasks?status=completed&tag="+url.QueryEscape(task_tag_stage_backlog), nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("list status=%d envelope=%+v", status, envelope)
	}
	var list_data struct {
		Tasks []TaskRecord `json:"tasks"`
	}
	if err := json.Unmarshal(envelope.Data, &list_data); err != nil {
		t.Fatalf("decode list data: %v", err)
	}
	if len(list_data.Tasks) != 1 || list_data.Tasks[0].ID != create_data.Task.ID {
		t.Fatalf("listed tasks = %+v", list_data.Tasks)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodDelete, task_path, nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("delete status=%d envelope=%+v", status, envelope)
	}
	status, envelope = externalAPITestRequest(t, server.URL, http.MethodGet, task_path, nil, "")
	if status != http.StatusNotFound || envelope.Code == 0 {
		t.Fatalf("get deleted status=%d envelope=%+v", status, envelope)
	}
}

func TestExternalAPISupportsActionStyleTaskRoutes(t *testing.T) {
	ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	setActiveVault(ctx)
	defer setActiveVault(nil)

	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{}))
	defer server.Close()

	status, envelope := externalAPITestRequest(t, server.URL, http.MethodPost, "/api/tasks/create", map[string]interface{}{
		"title": "Action route task",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("create status=%d envelope=%+v", status, envelope)
	}
	var create_data struct {
		Task TaskRecord `json:"task"`
	}
	if err := json.Unmarshal(envelope.Data, &create_data); err != nil {
		t.Fatalf("decode create data: %v", err)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, "/api/tasks/update", map[string]interface{}{
		"id":   create_data.Task.ID,
		"tags": []string{"stage:waiting"},
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("update status=%d envelope=%+v", status, envelope)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, "/api/tasks/complete", map[string]interface{}{
		"id": create_data.Task.ID,
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("close status=%d envelope=%+v", status, envelope)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, "/api/tasks/delete", map[string]interface{}{
		"id": create_data.Task.ID,
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("delete status=%d envelope=%+v", status, envelope)
	}
}

func TestExternalAPIRemovesLegacyItemRoutes(t *testing.T) {
	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{}))
	defer server.Close()

	response, err := http.Get(server.URL + "/api/gtd/items")
	if err != nil {
		t.Fatalf("request legacy item route: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("legacy item route status=%d, want %d", response.StatusCode, http.StatusNotFound)
	}
}

func TestExternalAPIGTDMilestoneLifecycle(t *testing.T) {
	ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	setActiveVault(ctx)
	defer setActiveVault(nil)

	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{}))
	defer server.Close()

	status, envelope := externalAPITestRequest(t, server.URL, http.MethodPost, "/api/gtd/milestones", map[string]interface{}{
		"status": "active",
		"title":  "External API milestone",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("create status=%d envelope=%+v", status, envelope)
	}
	var createData struct {
		Milestone GTDMilestoneRecord `json:"milestone"`
	}
	if err := json.Unmarshal(envelope.Data, &createData); err != nil {
		t.Fatalf("decode create data: %v", err)
	}
	if createData.Milestone.ID == "" {
		t.Fatalf("created milestone id is empty")
	}

	milestonePath := "/api/gtd/milestones/" + url.PathEscape(createData.Milestone.ID)
	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPatch, milestonePath, map[string]interface{}{
		"title": "External API milestone updated",
	}, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("update status=%d envelope=%+v", status, envelope)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodPost, milestonePath+"/complete", nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("complete status=%d envelope=%+v", status, envelope)
	}
	var completeData struct {
		Milestone GTDMilestoneRecord `json:"milestone"`
	}
	if err := json.Unmarshal(envelope.Data, &completeData); err != nil {
		t.Fatalf("decode complete data: %v", err)
	}
	if completeData.Milestone.Status != gtdMilestoneStatusCompleted || completeData.Milestone.CompletedAt == "" {
		t.Fatalf("completed milestone = %+v", completeData.Milestone)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodDelete, milestonePath, nil, "")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("delete status=%d envelope=%+v", status, envelope)
	}
}

func TestExternalAPIRequiresConfiguredToken(t *testing.T) {
	server := httptest.NewServer(newExternalAPIMux(externalAPIServerConfig{Token: "secret"}))
	defer server.Close()

	status, envelope := externalAPITestRequest(t, server.URL, http.MethodGet, "/api/health", nil, "")
	if status != http.StatusUnauthorized || envelope.Code != 100 {
		t.Fatalf("unauthorized status=%d envelope=%+v", status, envelope)
	}

	status, envelope = externalAPITestRequest(t, server.URL, http.MethodGet, "/api/health", nil, "secret")
	if status != http.StatusOK || envelope.Code != 0 {
		t.Fatalf("authorized status=%d envelope=%+v", status, envelope)
	}
}

func externalAPITestRequest(t *testing.T, baseURL string, method string, path string, body interface{}, token string) (int, externalAPITestEnvelope) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, baseURL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	var envelope externalAPITestEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode response %s: %v", string(raw), err)
	}
	return resp.StatusCode, envelope
}
