package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"example/simple/internal/search"
	"example/simple/internal/search/searchschema"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

const (
	search_default_limit = 20
	search_max_limit     = 100
)

func registerSearchRoutes(b *velo.Box, logger *zerolog.Logger) {
	b.Get("/api/search", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			logger.Error().Err(err).Str("component", "search").Msg("search: no active vault")
			return c.Error(err.Error())
		}
		request := search.SearchRequest{
			Query: strings.TrimSpace(c.Query("q")),
			Limit: search_query_int(c.Query("limit"), search_default_limit, 1, search_max_limit),
			Page:  search_query_int(c.Query("page"), 1, 1, 0),
			Sort:  strings.TrimSpace(c.Query("sort")),
		}
		// An empty query lists everything rather than matching nothing, so the
		// quick search can show an unfiltered feed.
		if request.Query == "" {
			request.Query = "*"
		}
		// The index is built when a vault opens or when the user rebuilds it in
		// settings; a query never triggers a build. An index that has not been
		// built yet simply returns nothing.
		results, err := search_vault(vault_ctx, request)
		if err != nil {
			logger.Error().Err(err).Str("component", "search").Str("query", request.Query).Msg("search: query failed")
			return c.Error(err.Error())
		}
		logger.Info().
			Str("component", "search").
			Str("query", request.Query).
			Int("resultCount", len(results.Hits)).
			Int("total", results.Total).
			Msg("search: completed")
		return c.Ok(velo.H{
			"hits":   results.Hits,
			"total":  results.Total,
			"facets": results.Facets,
			"sort":   results.Sort,
			"page":   request.Page,
			"limit":  request.Limit,
		})
	})

	// /api/search/capabilities also reports whether the index has been built, so
	// the palette can tell "nothing matched" apart from "not indexed yet".
	b.Get("/api/search/capabilities", func(c *velo.BoxContext) interface{} {
		payload := velo.H{"capabilities": searchschema.CapabilitiesDefinition()}
		if vault_ctx, err := requireActiveVault(); err == nil {
			payload["built"] = !search_index_needs_build(vault_ctx)
			if count, count_err := search_index_status(vault_ctx); count_err == nil {
				payload["documents"] = count
			}
		}
		return c.Ok(payload)
	})
}

// search_query_int parses an integer query parameter, clamping it to
// [min_value, max_value]. A max_value of 0 leaves the upper bound unbounded.
func search_query_int(raw string, fallback, min_value, max_value int) int {
	value := fallback
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		if parsed, parse_err := strconv.Atoi(trimmed); parse_err == nil {
			value = parsed
		}
	}
	if value < min_value {
		value = min_value
	}
	if max_value > 0 && value > max_value {
		value = max_value
	}
	return value
}

// search_memos_index runs the Bleve-backed memo search behind the legacy
// /api/memos/search shim. An index that has not been built yet is reported as an
// error rather than as an empty result set, so the caller falls back to the
// SQLite full-text index instead of showing a misleading "no matches".
func search_memos_index(call_ctx context.Context, vault_ctx *VaultContext, query string, limit int) ([]MemoSearchResult, error) {
	if search_index_needs_build(vault_ctx) {
		return nil, fmt.Errorf("search index has not been built yet")
	}
	results, err := search_vault(vault_ctx, search.SearchRequest{Query: query, Limit: limit, Page: 1})
	if err != nil {
		return nil, err
	}
	return search_legacy_results(results.Hits), nil
}

// search_memos_sqlite is the fallback path for /api/memos/search when the
// search index cannot be queried.
func search_memos_sqlite(call_ctx context.Context, vault_ctx *VaultContext, query string, limit int) ([]MemoSearchResult, error) {
	sqlite_store := resolve_sqlite_memo_store(vault_ctx)
	if sqlite_store == nil {
		return nil, fmt.Errorf("full-text search is not available for this vault")
	}
	return sqlite_store.search_fts(call_ctx, query, limit)
}

// search_legacy_results maps Bleve hits onto the memo-only shape served by
// /api/memos/search, which the feed's filtered view still consumes.
func search_legacy_results(hits []search.Hit) []MemoSearchResult {
	results := []MemoSearchResult{}
	for _, hit := range hits {
		if hit.Kind != search.KindMemo {
			continue
		}
		results = append(results, MemoSearchResult{
			MemoID:    hit.MemoID,
			Title:     hit.Title,
			Snippet:   hit.SnippetHTML,
			Rank:      hit.Score,
			CreatedAt: hit.CreatedAt,
			UpdatedAt: hit.UpdatedAt,
			ProjectID: hit.Project,
			Tags:      hit.Tags,
			Archived:  hit.Archived,
			Pinned:    hit.Pinned,
		})
	}
	return results
}
