package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	udownloader "github.com/ltaoo/velo/updater/downloader"
	utypes "github.com/ltaoo/velo/updater/types"
	"github.com/rs/zerolog"
)

type update_download_engine interface {
	Download(
		ctx context.Context,
		download_url string,
		headers map[string]string,
		dest_path string,
		expected_checksum string,
		skip_checksum bool,
		callback utypes.DownloadCallback,
	) error
}

type threadnote_update_downloader struct {
	manager      update_download_engine
	download_dir string
}

func new_update_downloader(logger *zerolog.Logger) utypes.UpdateDownloader {
	cache_dir, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(cache_dir) == "" {
		cache_dir = os.TempDir()
	}
	return &threadnote_update_downloader{
		manager:      udownloader.NewUpdateDownloadManager(logger),
		download_dir: filepath.Join(cache_dir, "ThreadNote", "updates"),
	}
}

func (d *threadnote_update_downloader) DownloadUpdate(
	ctx context.Context,
	release_info *utypes.ReleaseInfo,
	on_progress utypes.DownloadCallback,
) (string, error) {
	normalized_release := normalize_github_release_download(release_info)
	if normalized_release == nil {
		return "", fmt.Errorf("release info is required")
	}
	asset_name := filepath.Base(normalized_release.AssetName)
	if asset_name == "." || asset_name == string(filepath.Separator) || asset_name == "" {
		return "", fmt.Errorf("release asset name is required")
	}
	if normalized_release.NeedCheckChecksum && strings.TrimSpace(normalized_release.Checksum) == "" {
		return "", fmt.Errorf("checksum is required for release asset %s", asset_name)
	}
	download_path := filepath.Join(d.download_dir, asset_name)
	if err := os.Remove(download_path); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("remove previous update package: %w", err)
	}
	if is_loopback_http_update_url(normalized_release.AssetURL) {
		if err := download_loopback_update(ctx, normalized_release, download_path, on_progress); err != nil {
			return "", err
		}
		return download_path, nil
	}
	if err := d.manager.Download(
		ctx,
		normalized_release.AssetURL,
		normalized_release.Headers,
		download_path,
		normalized_release.Checksum,
		!normalized_release.NeedCheckChecksum,
		on_progress,
	); err != nil {
		return "", err
	}
	return download_path, nil
}

func is_loopback_http_update_url(raw_url string) bool {
	parsed_url, err := url.Parse(raw_url)
	return err == nil && parsed_url.Scheme == "http" && is_loopback_host(parsed_url.Hostname())
}

func download_loopback_update(
	ctx context.Context,
	release_info *utypes.ReleaseInfo,
	download_path string,
	on_progress utypes.DownloadCallback,
) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, release_info.AssetURL, nil)
	if err != nil {
		return err
	}
	for key, value := range release_info.Headers {
		request.Header.Set(key, value)
	}
	client := &http.Client{
		Timeout: 5 * time.Minute,
		CheckRedirect: func(request *http.Request, _ []*http.Request) error {
			if request.URL.Scheme == "https" || (request.URL.Scheme == "http" && is_loopback_host(request.URL.Hostname())) {
				return nil
			}
			return fmt.Errorf("update redirect must use HTTPS or loopback HTTP")
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("download loopback update: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("loopback update server returned %s", response.Status)
	}
	if err := os.MkdirAll(filepath.Dir(download_path), 0755); err != nil {
		return fmt.Errorf("create update download directory: %w", err)
	}
	temporary_path := download_path + ".tmp"
	_ = os.Remove(temporary_path)
	defer os.Remove(temporary_path)
	destination_file, err := os.OpenFile(temporary_path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("create update download: %w", err)
	}
	hash := sha256.New()
	buffer := make([]byte, 128*1024)
	downloaded_bytes := int64(0)
	started_at := time.Now()
	for {
		read_count, read_err := response.Body.Read(buffer)
		if read_count > 0 {
			chunk := buffer[:read_count]
			if _, err := destination_file.Write(chunk); err != nil {
				_ = destination_file.Close()
				return fmt.Errorf("write update download: %w", err)
			}
			if _, err := hash.Write(chunk); err != nil {
				_ = destination_file.Close()
				return fmt.Errorf("hash update download: %w", err)
			}
			downloaded_bytes += int64(read_count)
			if on_progress != nil {
				total_bytes := release_info.AssetSize
				if total_bytes <= 0 {
					total_bytes = response.ContentLength
				}
				percentage := float64(0)
				if total_bytes > 0 {
					percentage = float64(downloaded_bytes) * 100 / float64(total_bytes)
				}
				elapsed_seconds := time.Since(started_at).Seconds()
				speed := int64(0)
				if elapsed_seconds > 0 {
					speed = int64(float64(downloaded_bytes) / elapsed_seconds)
				}
				on_progress(utypes.DownloadProgress{
					BytesDownloaded: downloaded_bytes,
					TotalBytes:      total_bytes,
					Percentage:      percentage,
					Speed:           speed,
				})
			}
		}
		if read_err == io.EOF {
			break
		}
		if read_err != nil {
			_ = destination_file.Close()
			return fmt.Errorf("read update download: %w", read_err)
		}
	}
	if err := destination_file.Close(); err != nil {
		return fmt.Errorf("close update download: %w", err)
	}
	if release_info.AssetSize > 0 && downloaded_bytes != release_info.AssetSize {
		return fmt.Errorf("update download size is %d, expected %d", downloaded_bytes, release_info.AssetSize)
	}
	if release_info.NeedCheckChecksum {
		actual_checksum := hex.EncodeToString(hash.Sum(nil))
		if !strings.EqualFold(actual_checksum, strings.TrimSpace(release_info.Checksum)) {
			return fmt.Errorf("update checksum mismatch: got %s", actual_checksum)
		}
	}
	if err := os.Rename(temporary_path, download_path); err != nil {
		return fmt.Errorf("finish update download: %w", err)
	}
	return nil
}

func normalize_github_release_download(release_info *utypes.ReleaseInfo) *utypes.ReleaseInfo {
	if release_info == nil {
		return nil
	}

	parsed_url, err := url.Parse(release_info.AssetURL)
	if err != nil || parsed_url.Hostname() != "api.github.com" || has_github_token(release_info.Headers) {
		return release_info
	}
	path_parts := strings.Split(strings.Trim(parsed_url.Path, "/"), "/")
	if len(path_parts) != 6 || path_parts[0] != "repos" || path_parts[3] != "releases" || path_parts[4] != "assets" {
		return release_info
	}
	if release_info.Version == "" || release_info.AssetName == "" {
		return release_info
	}

	normalized_release := *release_info
	normalized_release.AssetURL = (&url.URL{
		Scheme: "https",
		Host:   "github.com",
		Path:   "/" + path_parts[1] + "/" + path_parts[2] + "/releases/download/" + release_info.Version + "/" + release_info.AssetName,
	}).String()
	normalized_release.Headers = public_update_headers(release_info.Headers)
	return &normalized_release
}

func has_github_token(headers map[string]string) bool {
	for key, value := range headers {
		if !strings.EqualFold(key, "Authorization") {
			continue
		}
		token_value := strings.TrimSpace(value)
		token_value = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(token_value), "token"))
		token_value = strings.TrimSpace(strings.TrimPrefix(token_value, "bearer"))
		return token_value != ""
	}
	return false
}

func public_update_headers(headers map[string]string) map[string]string {
	public_headers := make(map[string]string, len(headers))
	for key, value := range headers {
		if strings.EqualFold(key, "Authorization") || strings.EqualFold(key, "Accept") {
			continue
		}
		public_headers[key] = value
	}
	return public_headers
}
