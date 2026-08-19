package desktopapp

import (
	"context"
	"testing"

	utypes "github.com/ltaoo/velo/updater/types"
)

type capturing_update_download_engine struct {
	download_url      string
	headers           map[string]string
	dest_path         string
	expected_checksum string
	skip_checksum     bool
}

func (d *capturing_update_download_engine) Download(
	_ context.Context,
	download_url string,
	headers map[string]string,
	dest_path string,
	expected_checksum string,
	skip_checksum bool,
	_ utypes.DownloadCallback,
) error {
	d.download_url = download_url
	d.headers = headers
	d.dest_path = dest_path
	d.expected_checksum = expected_checksum
	d.skip_checksum = skip_checksum
	return nil
}

func TestGithubPublicReleaseDownloaderUsesBrowserURL(t *testing.T) {
	manager := &capturing_update_download_engine{}
	downloader := &threadnote_update_downloader{manager: manager, download_dir: t.TempDir()}
	original_release := &utypes.ReleaseInfo{
		Version:           "v0.1.1",
		AssetName:         "ThreadNote_0.1.1_darwin_arm64.dmg",
		AssetURL:          "https://api.github.com/repos/ltaoo/ThreadNote/releases/assets/519255088",
		Checksum:          "abc123",
		NeedCheckChecksum: true,
		Headers: map[string]string{
			"Accept":        "application/octet-stream",
			"Authorization": "token ",
		},
	}

	if _, err := downloader.DownloadUpdate(context.Background(), original_release, nil); err != nil {
		t.Fatalf("download update: %v", err)
	}
	want_url := "https://github.com/ltaoo/ThreadNote/releases/download/v0.1.1/ThreadNote_0.1.1_darwin_arm64.dmg"
	if manager.download_url != want_url {
		t.Fatalf("download URL = %q, want %q", manager.download_url, want_url)
	}
	if manager.headers["Authorization"] != "" || manager.headers["Accept"] != "" {
		t.Fatalf("public download headers were not removed: %#v", manager.headers)
	}
	if original_release.AssetURL == manager.download_url {
		t.Fatal("original release was mutated")
	}
	if manager.expected_checksum != original_release.Checksum || manager.skip_checksum {
		t.Fatal("checksum verification was not preserved")
	}
}

func TestGithubPrivateReleaseDownloaderKeepsAPIURL(t *testing.T) {
	release_info := &utypes.ReleaseInfo{
		Version:   "v0.1.1",
		AssetName: "ThreadNote_0.1.1_darwin_arm64.dmg",
		AssetURL:  "https://api.github.com/repos/ltaoo/ThreadNote/releases/assets/519255088",
		Headers:   map[string]string{"Authorization": "Bearer secret"},
	}

	normalized_release := normalize_github_release_download(release_info)
	if normalized_release != release_info {
		t.Fatal("authenticated GitHub API release should not be rewritten")
	}
}
