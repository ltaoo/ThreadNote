package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeCloudStorageSettingsDefaultsR2Region(t *testing.T) {
	settings := normalizeCloudStorageSettings(CloudStorageSettings{
		ActiveStorageID: "cloudflare-r2",
		Storages: []OSSConfig{
			{
				Bucket:   "threadnote-assets",
				Enabled:  true,
				ID:       "cloudflare-r2",
				Provider: " R2 ",
			},
		},
	})

	if len(settings.Storages) != 1 {
		t.Fatalf("storages length = %d, want 1", len(settings.Storages))
	}
	if settings.Storages[0].Provider != "r2" {
		t.Fatalf("provider = %q, want r2", settings.Storages[0].Provider)
	}
	if settings.Storages[0].Region != "auto" {
		t.Fatalf("region = %q, want auto", settings.Storages[0].Region)
	}
}

func TestPublicOSSObjectURLUsesAuthenticatedProxyWithoutPublicBaseURL(t *testing.T) {
	cfg := OSSConfig{
		Bucket:   "threadnote-assets",
		ID:       "cloudflare-r2",
		Provider: "r2",
	}
	got := publicOSSObjectURL(cfg, "https://account.r2.cloudflarestorage.com", "images/my photo.png")
	want := "/api/oss/assets?storageId=cloudflare-r2&path=images%2Fmy+photo.png"
	if got != want {
		t.Fatalf("publicOSSObjectURL() = %q, want %q", got, want)
	}
}

func TestPublicOSSObjectURLUsesConfiguredPublicBaseURL(t *testing.T) {
	cfg := OSSConfig{
		Bucket:        "threadnote-assets",
		ID:            "cloudflare-r2",
		Provider:      "r2",
		PublicBaseURL: "https://assets.example.com/",
	}
	got := publicOSSObjectURL(cfg, "https://account.r2.cloudflarestorage.com", "images/my photo.png")
	want := "https://assets.example.com/images/my%20photo.png"
	if got != want {
		t.Fatalf("publicOSSObjectURL() = %q, want %q", got, want)
	}
}

func TestStreamRemoteOSSAssetSignsAndForwardsRangeRequest(t *testing.T) {
	const body = "private-r2-image"
	request_seen := make(chan *http.Request, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		request_seen <- request.Clone(context.Background())
		writer.Header().Set("Content-Type", "image/png")
		writer.Header().Set("Content-Length", "7")
		writer.Header().Set("Content-Range", "bytes 0-6/16")
		writer.Header().Set("ETag", `"r2-etag"`)
		writer.WriteHeader(http.StatusPartialContent)
		_, _ = io.WriteString(writer, body[:7])
	}))
	defer server.Close()

	cfg := OSSConfig{
		AccessKeyID:     "r2-access-key",
		Bucket:          "threadnote-assets",
		Enabled:         true,
		Endpoint:        server.URL,
		ForcePathStyle:  true,
		ID:              "cloudflare-r2",
		Provider:        "r2",
		Region:          "auto",
		SecretAccessKey: "r2-secret-key",
	}
	incoming := httptest.NewRequest(http.MethodGet, "/api/oss/assets", nil)
	incoming.Header.Set("Range", "bytes=0-6")
	recorder := httptest.NewRecorder()

	response_started, err := stream_remote_oss_asset(context.Background(), recorder, incoming, cfg, "images/private.png")
	if err != nil {
		t.Fatalf("stream_remote_oss_asset: %v", err)
	}
	if !response_started {
		t.Fatal("stream_remote_oss_asset response_started = false, want true")
	}
	if recorder.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusPartialContent)
	}
	if recorder.Body.String() != body[:7] {
		t.Fatalf("body = %q, want %q", recorder.Body.String(), body[:7])
	}
	if got := recorder.Header().Get("Content-Range"); got != "bytes 0-6/16" {
		t.Fatalf("Content-Range = %q", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "private, max-age=3600" {
		t.Fatalf("Cache-Control = %q", got)
	}

	upstream_request := <-request_seen
	if upstream_request.URL.Path != "/threadnote-assets/images/private.png" {
		t.Fatalf("upstream path = %q", upstream_request.URL.Path)
	}
	if upstream_request.Header.Get("Range") != "bytes=0-6" {
		t.Fatalf("upstream Range = %q", upstream_request.Header.Get("Range"))
	}
	if !strings.HasPrefix(upstream_request.Header.Get("Authorization"), "AWS4-HMAC-SHA256 ") {
		t.Fatalf("upstream Authorization = %q", upstream_request.Header.Get("Authorization"))
	}
}
