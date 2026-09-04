package mcp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMCPHTTPHandlerRequestsNotificationsAndSecurity(t *testing.T) {
	handler, err := NewHTTPHandler(test_mcp_adapter(), "test-version", HTTPOptions{BearerToken: "secret"})
	if err != nil {
		t.Fatalf("create handler: %v", err)
	}
	server := httptest.NewServer(handler)
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer secret")
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("request tools: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("tools status = %d", response.StatusCode)
	}

	notification, err := http.NewRequest(http.MethodPost, server.URL, strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}`))
	if err != nil {
		t.Fatalf("create notification: %v", err)
	}
	notification.Header.Set("Authorization", "Bearer secret")
	notification.Header.Set("Content-Type", "application/json")
	notification_response, err := http.DefaultClient.Do(notification)
	if err != nil {
		t.Fatalf("send notification: %v", err)
	}
	notification_response.Body.Close()
	if notification_response.StatusCode != http.StatusAccepted {
		t.Fatalf("notification status = %d", notification_response.StatusCode)
	}

	unauthorized, err := http.Post(server.URL, "application/json", strings.NewReader(`{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}`))
	if err != nil {
		t.Fatalf("unauthorized request: %v", err)
	}
	unauthorized.Body.Close()
	if unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.StatusCode)
	}

	bad_origin, err := http.NewRequest(http.MethodPost, server.URL, strings.NewReader(`{"jsonrpc":"2.0","id":3,"method":"ping","params":{}}`))
	if err != nil {
		t.Fatalf("create origin request: %v", err)
	}
	bad_origin.Header.Set("Authorization", "Bearer secret")
	bad_origin.Header.Set("Content-Type", "application/json")
	bad_origin.Header.Set("Origin", "https://example.invalid")
	bad_origin_response, err := http.DefaultClient.Do(bad_origin)
	if err != nil {
		t.Fatalf("origin request: %v", err)
	}
	bad_origin_response.Body.Close()
	if bad_origin_response.StatusCode != http.StatusForbidden {
		t.Fatalf("bad origin status = %d", bad_origin_response.StatusCode)
	}
}
