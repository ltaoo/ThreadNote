package desktopapp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"example/simple/internal/desktopapp/clawreq"
	"github.com/ltaoo/velo"
)

const linksDomainFilterKey = "demo-desktop:links:domain-filter:v1"
const linksDomainChipsKey = "demo-desktop:links:domain-chips:v1"

func registerLinkRoutes(b *velo.Box) {
	b.Post("/api/links/fetch-title", handleFetchLinkTitle)

	b.Get("/api/links/domain-filter", func(c *velo.BoxContext) interface{} {
		raw := b.Store.Get(linksDomainFilterKey)
		filter := ""
		if raw != nil {
			var v struct{ Filter string }
			if err := json.Unmarshal(raw, &v); err == nil {
				filter = v.Filter
			}
		}
		return c.Ok(velo.H{"filter": filter})
	})

	b.Post("/api/links/domain-filter/save", func(c *velo.BoxContext) interface{} {
		var req struct{ Filter string }
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		raw, err := json.Marshal(req)
		if err != nil {
			return c.Error(err.Error())
		}
		if err := b.Store.Set(linksDomainFilterKey, json.RawMessage(raw)); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Get("/api/links/domain-chips", func(c *velo.BoxContext) interface{} {
		raw := b.Store.Get(linksDomainChipsKey)
		var chips []string
		if raw != nil {
			var v struct{ Chips []string }
			if err := json.Unmarshal(raw, &v); err == nil {
				chips = v.Chips
			}
		}
		if chips == nil {
			chips = []string{}
		}
		return c.Ok(velo.H{"chips": chips})
	})

	b.Post("/api/links/domain-chips/save", func(c *velo.BoxContext) interface{} {
		var req struct{ Chips []string }
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		raw, err := json.Marshal(req)
		if err != nil {
			return c.Error(err.Error())
		}
		if err := b.Store.Set(linksDomainChipsKey, json.RawMessage(raw)); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})
}

var titleRegex = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

// metaTitlePatterns lists regex patterns for extracting titles from meta tags,
// checked in priority order after <title>.
var metaTitlePatterns = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"og:title", regexp.MustCompile(`(?is)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']`)},
	{"twitter:title", regexp.MustCompile(`(?is)<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']`)},
}

type titleResult struct {
	title      string
	sourceTag  string
}

func extractTitle(html string) string {
	result := extractTitleWithSource(html)
	return result.title
}

func extractTitleWithSource(html string) titleResult {
	// 1. <title> tag
	match := titleRegex.FindStringSubmatch(html)
	if len(match) > 1 {
		t := strings.TrimSpace(match[1])
		if t != "" {
			return titleResult{title: t, sourceTag: "<title>"}
		}
	}
	// 2. meta tags in priority order
	for _, mp := range metaTitlePatterns {
		match := mp.pattern.FindStringSubmatch(html)
		if len(match) > 1 {
			t := strings.TrimSpace(match[1])
			if t != "" {
				return titleResult{title: t, sourceTag: "<meta " + mp.name + ">"}
			}
		}
	}
	return titleResult{}
}

func handleFetchLinkTitle(c *velo.BoxContext) interface{} {
	var req struct{ URL string }
	if err := c.BindJSON(&req); err != nil {
		return c.Error("invalid request: " + err.Error())
	}
	url := strings.TrimSpace(req.URL)
	if url == "" {
		return c.Error("url is required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), 15*time.Second)
	defer cancel()

	client, err := clawreq.New(clawreq.Config{
		Profile:         clawreq.ProfileChrome,
		Timeout:         15 * time.Second,
		FollowRedirects: true,
	})
	if err != nil {
		return c.Ok(velo.H{
			"ok": false, "url": url, "error": "create client: " + err.Error(),
		})
	}

	resp, err := client.Get(ctx, url)
	if err != nil {
		return c.Ok(velo.H{
			"ok": false, "url": url, "error": "fetch: " + err.Error(),
		})
	}

	html, err := resp.Text()
	if err != nil {
		return c.Ok(velo.H{
			"ok":          false,
			"url":         url,
			"status_code": resp.StatusCode,
			"content_type": resp.ContentType(),
			"body_size":   len(resp.Body),
			"error":       "decode: " + err.Error(),
		})
	}

	tr := extractTitleWithSource(html)
	title := tr.title
	preview := html
	if len(preview) > 500 {
		preview = preview[:500]
	}

	// Write raw + decoded HTML to /tmp for inspection
	tmpFile := filepath.Join("/tmp", fmt.Sprintf("velo-fetch-title-%d.html", time.Now().UnixNano()))
	rawFile := filepath.Join("/tmp", fmt.Sprintf("velo-fetch-title-%d-raw.bin", time.Now().UnixNano()))
	var tmpPath, rawPath string
	if err := os.WriteFile(tmpFile, []byte(html), 0644); err == nil {
		tmpPath = tmpFile
	}
	if err := os.WriteFile(rawFile, resp.Body, 0644); err == nil {
		rawPath = rawFile
	}

	return c.Ok(velo.H{
		"ok":           true,
		"url":          url,
		"status_code":  resp.StatusCode,
		"content_type": resp.ContentType(),
		"body_size":    len(resp.Body),
		"title":        title,
		"title_found":  title != "",
		"title_source": tr.sourceTag,
		"html_preview": preview,
		"html_path":    tmpPath,
		"raw_path":     rawPath,
	})
}
