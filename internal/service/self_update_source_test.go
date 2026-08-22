package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	utypes "github.com/ltaoo/velo/updater/types"
)

func TestCheckSelfGithubReleaseUsesConfiguredServer(t *testing.T) {
	asset_name := "ThreadNote_9.9.9_" + runtime.GOOS + "_" + runtime.GOARCH + update_test_archive_suffix()
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/repos/ltaoo/ThreadNote/releases" {
			http.NotFound(writer, request)
			return
		}
		_ = json.NewEncoder(writer).Encode([]self_github_release{{
			TagName:     "v9.9.9",
			Name:        "ThreadNote 9.9.9",
			Body:        "fake release",
			PublishedAt: "2026-08-18T00:00:00Z",
			Assets: []self_github_release_asset{{
				Name:               asset_name,
				BrowserDownloadURL: server.URL + "/assets/" + asset_name,
				Size:               4,
			}},
		}})
	}))
	defer server.Close()

	release_info, err := check_self_github_release(context.Background(), utypes.UpdateSource{
		Type:       "github",
		GitHubRepo: "ltaoo/ThreadNote",
		SelfURL:    server.URL,
		Enabled:    true,
	}, "0.1.0")
	if err != nil {
		t.Fatalf("check self-hosted release: %v", err)
	}
	if release_info.Version != "v9.9.9" || !release_info.IsNewer {
		t.Fatalf("unexpected release: %#v", release_info)
	}
	if release_info.AssetName != asset_name || release_info.AssetURL != server.URL+"/assets/"+asset_name {
		t.Fatalf("unexpected release asset: %#v", release_info)
	}
}

func TestDownloadLoopbackUpdateVerifiesChecksum(t *testing.T) {
	contents := []byte("fake update package")
	expected_hash := sha256.Sum256(contents)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write(contents)
	}))
	defer server.Close()

	download_dir := t.TempDir()
	downloader := &threadnote_update_downloader{download_dir: download_dir}
	last_progress := utypes.DownloadProgress{}
	download_path, err := downloader.DownloadUpdate(context.Background(), &utypes.ReleaseInfo{
		AssetURL:          server.URL + "/ThreadNote.zip",
		AssetName:         "ThreadNote.zip",
		AssetSize:         int64(len(contents)),
		Checksum:          hex.EncodeToString(expected_hash[:]),
		NeedCheckChecksum: true,
	}, func(progress utypes.DownloadProgress) {
		last_progress = progress
	})
	if err != nil {
		t.Fatalf("download loopback update: %v", err)
	}
	if download_path != filepath.Join(download_dir, "ThreadNote.zip") {
		t.Fatalf("download path = %q", download_path)
	}
	downloaded_contents, err := os.ReadFile(download_path)
	if err != nil {
		t.Fatal(err)
	}
	if string(downloaded_contents) != string(contents) {
		t.Fatalf("downloaded contents = %q", downloaded_contents)
	}
	if last_progress.Percentage != 100 || last_progress.BytesDownloaded != int64(len(contents)) {
		t.Fatalf("unexpected final progress: %#v", last_progress)
	}
}

func update_test_archive_suffix() string {
	if runtime.GOOS == "darwin" {
		return ".dmg"
	}
	return ".zip"
}
