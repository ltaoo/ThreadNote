package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"runtime"
	"strings"
	"time"

	utypes "github.com/ltaoo/velo/updater/types"
	update_util "github.com/ltaoo/velo/updater/util"
)

type self_github_release struct {
	TagName     string                      `json:"tag_name"`
	Name        string                      `json:"name"`
	Body        string                      `json:"body"`
	PublishedAt string                      `json:"published_at"`
	Draft       bool                        `json:"draft"`
	Prerelease  bool                        `json:"prerelease"`
	Assets      []self_github_release_asset `json:"assets"`
}

type self_github_release_asset struct {
	Name               string `json:"name"`
	URL                string `json:"url"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

func check_self_github_release(ctx context.Context, source utypes.UpdateSource, current_version string) (*utypes.ReleaseInfo, error) {
	releases_url, err := self_github_releases_url(source)
	if err != nil {
		return nil, err
	}
	timeout := 30 * time.Second
	client := &http.Client{Timeout: timeout}
	releases, err := fetch_self_github_releases(ctx, client, releases_url, source.GitHubToken)
	if err != nil {
		return nil, err
	}
	release, err := latest_self_github_release(releases)
	if err != nil {
		return nil, err
	}
	asset, checksum_asset, err := select_self_update_assets(release.Assets)
	if err != nil {
		return nil, err
	}
	asset_url, err := resolve_self_asset_url(releases_url, preferred_self_asset_url(asset))
	if err != nil {
		return nil, err
	}
	checksum := ""
	if source.NeedCheckChecksum {
		if checksum_asset == nil {
			return nil, fmt.Errorf("self-hosted release is missing checksums.txt")
		}
		checksum_url, err := resolve_self_asset_url(releases_url, preferred_self_asset_url(checksum_asset))
		if err != nil {
			return nil, err
		}
		checksum, err = fetch_self_asset_checksum(ctx, client, checksum_url, source.GitHubToken, asset.Name)
		if err != nil {
			return nil, err
		}
	}
	is_newer, err := update_util.CompareVersions(current_version, release.TagName)
	if err != nil {
		return nil, err
	}
	published_at, _ := time.Parse(time.RFC3339, release.PublishedAt)
	return &utypes.ReleaseInfo{
		Version:           release.TagName,
		PublishedAt:       published_at,
		ReleaseNotes:      release.Body,
		AssetURL:          asset_url,
		AssetSize:         asset.Size,
		Checksum:          checksum,
		AssetName:         asset.Name,
		IsNewer:           is_newer,
		NeedCheckChecksum: source.NeedCheckChecksum,
	}, nil
}

func self_github_releases_url(source utypes.UpdateSource) (*url.URL, error) {
	repository_parts := strings.Split(strings.Trim(strings.TrimSpace(source.GitHubRepo), "/"), "/")
	if len(repository_parts) != 2 || repository_parts[0] == "" || repository_parts[1] == "" {
		return nil, fmt.Errorf("invalid GitHub update repository %q", source.GitHubRepo)
	}
	base_url, err := url.Parse(strings.TrimSpace(source.SelfURL))
	if err != nil || base_url.Scheme == "" || base_url.Host == "" {
		return nil, fmt.Errorf("invalid self-hosted update URL %q", source.SelfURL)
	}
	if base_url.Scheme != "https" && !(base_url.Scheme == "http" && is_loopback_host(base_url.Hostname())) {
		return nil, fmt.Errorf("self-hosted update URL must use HTTPS or loopback HTTP")
	}
	if strings.HasSuffix(strings.TrimRight(base_url.Path, "/"), "/releases") {
		return base_url, nil
	}
	joined_url, err := url.JoinPath(base_url.String(), "repos", repository_parts[0], repository_parts[1], "releases")
	if err != nil {
		return nil, fmt.Errorf("build self-hosted release URL: %w", err)
	}
	return url.Parse(joined_url)
}

func fetch_self_github_releases(ctx context.Context, client *http.Client, releases_url *url.URL, token string) ([]self_github_release, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, releases_url.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	if strings.TrimSpace(token) != "" {
		request.Header.Set("Authorization", "token "+strings.TrimSpace(token))
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request self-hosted releases: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("self-hosted release server returned %s", response.Status)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	var releases []self_github_release
	if err := json.Unmarshal(body, &releases); err == nil {
		return releases, nil
	}
	var release self_github_release
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, fmt.Errorf("decode self-hosted release response: %w", err)
	}
	return []self_github_release{release}, nil
}

func latest_self_github_release(releases []self_github_release) (*self_github_release, error) {
	var latest_release *self_github_release
	for index := range releases {
		release := &releases[index]
		if release.Draft || release.Prerelease || strings.TrimSpace(release.TagName) == "" {
			continue
		}
		if latest_release == nil {
			latest_release = release
			continue
		}
		is_newer, err := update_util.CompareVersions(latest_release.TagName, release.TagName)
		if err == nil && is_newer {
			latest_release = release
		}
	}
	if latest_release == nil {
		return nil, fmt.Errorf("self-hosted release server returned no stable releases")
	}
	return latest_release, nil
}

func select_self_update_assets(assets []self_github_release_asset) (*self_github_release_asset, *self_github_release_asset, error) {
	platform_keys := []string{runtime.GOOS + "_" + runtime.GOARCH}
	if runtime.GOOS == "darwin" && runtime.GOARCH == "amd64" {
		platform_keys = append(platform_keys, "darwin_x86_64")
	}
	var selected_asset *self_github_release_asset
	var checksum_asset *self_github_release_asset
	for index := range assets {
		asset := &assets[index]
		lower_name := strings.ToLower(asset.Name)
		if strings.Contains(lower_name, "checksum") || strings.HasSuffix(lower_name, ".sha256") {
			checksum_asset = asset
		}
		for _, platform_key := range platform_keys {
			if strings.Contains(asset.Name, platform_key) && is_update_archive_name(asset.Name) {
				selected_asset = asset
				break
			}
		}
	}
	if selected_asset == nil {
		return nil, checksum_asset, fmt.Errorf("self-hosted release has no asset for %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	return selected_asset, checksum_asset, nil
}

func is_update_archive_name(name string) bool {
	lower_name := strings.ToLower(name)
	return strings.HasSuffix(lower_name, ".dmg") || strings.HasSuffix(lower_name, ".zip") || strings.HasSuffix(lower_name, ".tar.gz") || strings.HasSuffix(lower_name, ".tar.xz")
}

func preferred_self_asset_url(asset *self_github_release_asset) string {
	if strings.TrimSpace(asset.BrowserDownloadURL) != "" {
		return asset.BrowserDownloadURL
	}
	return asset.URL
}

func resolve_self_asset_url(releases_url *url.URL, raw_url string) (string, error) {
	asset_url, err := url.Parse(strings.TrimSpace(raw_url))
	if err != nil || strings.TrimSpace(raw_url) == "" {
		return "", fmt.Errorf("invalid self-hosted release asset URL %q", raw_url)
	}
	return releases_url.ResolveReference(asset_url).String(), nil
}

func fetch_self_asset_checksum(ctx context.Context, client *http.Client, checksum_url string, token string, asset_name string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, checksum_url, nil)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(token) != "" {
		request.Header.Set("Authorization", "token "+strings.TrimSpace(token))
	}
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("download self-hosted checksums: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("self-hosted checksum server returned %s", response.Status)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.TrimPrefix(fields[len(fields)-1], "*") == asset_name {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("checksums file has no entry for %s", asset_name)
}

func is_loopback_host(host string) bool {
	if strings.EqualFold(strings.TrimSpace(host), "localhost") {
		return true
	}
	ip_address := net.ParseIP(strings.TrimSpace(host))
	return ip_address != nil && ip_address.IsLoopback()
}
