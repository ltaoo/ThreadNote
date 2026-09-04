package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

const (
	application_log_default_page_size = 200
	application_log_max_line_bytes    = 1024 * 1024
	application_log_max_page_size     = 500
)

type application_log_query struct {
	component string
	keyword   string
	levels    map[string]struct{}
	page      int
	page_size int
}

type application_log_file struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type application_log_page struct {
	Entries  []map[string]interface{} `json:"entries"`
	Files    []application_log_file   `json:"files"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"page_size"`
	Total    int                      `json:"total"`
}

func register_log_routes(b *velo.Box, logger *zerolog.Logger) {
	b.Get("/api/logs", func(c *velo.BoxContext) interface{} {
		page, err := read_application_log_page(application_log_path(), application_log_query_from_context(c))
		if err != nil {
			logger.Error().Err(err).Msg("failed to read application logs")
			return c.Error(err.Error())
		}
		return c.Ok(page)
	})
	b.Post("/api/logs/clear", func(c *velo.BoxContext) interface{} {
		log_path := application_log_path()
		if err := os.Truncate(log_path, 0); err != nil && !os.IsNotExist(err) {
			logger.Error().Err(err).Msg("failed to clear application logs")
			return c.Error(err.Error())
		}
		logger.Info().Str("component", "application_logs").Msg("application logs cleared")
		page, err := read_application_log_page(log_path, application_log_query{page: 1, page_size: application_log_default_page_size})
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(page)
	})
}

func application_log_query_from_context(c *velo.BoxContext) application_log_query {
	page := application_log_positive_int(c.Query("page"), 1)
	page_size := application_log_positive_int(c.Query("page_size"), application_log_default_page_size)
	if page_size > application_log_max_page_size {
		page_size = application_log_max_page_size
	}
	levels := make(map[string]struct{})
	for _, level := range strings.Split(c.Query("levels"), ",") {
		level = strings.ToLower(strings.TrimSpace(level))
		if level != "" && level != "all" {
			levels[level] = struct{}{}
		}
	}
	return application_log_query{
		component: strings.ToLower(strings.TrimSpace(c.Query("component"))),
		keyword:   strings.ToLower(strings.TrimSpace(c.Query("keyword"))),
		levels:    levels,
		page:      page,
		page_size: page_size,
	}
}

func application_log_positive_int(value string, fallback int) int {
	number, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || number < 1 {
		return fallback
	}
	return number
}

func read_application_log_page(log_path string, query application_log_query) (application_log_page, error) {
	if query.page < 1 {
		query.page = 1
	}
	if query.page_size < 1 {
		query.page_size = application_log_default_page_size
	}

	log_file, err := os.Open(log_path)
	if err != nil {
		if os.IsNotExist(err) {
			return application_log_page{Entries: []map[string]interface{}{}, Files: []application_log_file{}, Page: 1, PageSize: query.page_size}, nil
		}
		return application_log_page{}, err
	}
	defer log_file.Close()

	// ponytail: a full scan is enough for one local log file; add an index only if profiling shows it growing too large.
	entries := make([]map[string]interface{}, 0)
	scanner := bufio.NewScanner(log_file)
	scanner.Buffer(make([]byte, 64*1024), application_log_max_line_bytes)
	for scanner.Scan() {
		raw_line := strings.TrimSpace(scanner.Text())
		if raw_line == "" {
			continue
		}
		entry := parse_application_log_line(raw_line)
		if application_log_matches(entry, raw_line, query) {
			entries = append(entries, entry)
		}
	}
	if err := scanner.Err(); err != nil {
		return application_log_page{}, fmt.Errorf("scan application log: %w", err)
	}

	for left, right := 0, len(entries)-1; left < right; left, right = left+1, right-1 {
		entries[left], entries[right] = entries[right], entries[left]
	}
	total := len(entries)
	page_count := (total + query.page_size - 1) / query.page_size
	if page_count < 1 {
		page_count = 1
	}
	if query.page > page_count {
		query.page = page_count
	}
	start := (query.page - 1) * query.page_size
	end := start + query.page_size
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	files := []application_log_file{}
	if file_info, stat_err := os.Stat(log_path); stat_err == nil {
		files = append(files, application_log_file{Name: file_info.Name(), Path: log_path, Size: file_info.Size()})
	}
	return application_log_page{
		Entries:  entries[start:end],
		Files:    files,
		Page:     query.page,
		PageSize: query.page_size,
		Total:    total,
	}, nil
}

func parse_application_log_line(raw_line string) map[string]interface{} {
	entry := make(map[string]interface{})
	if err := json.Unmarshal([]byte(raw_line), &entry); err != nil {
		return map[string]interface{}{
			"component": "backend",
			"level":     "info",
			"message":   raw_line,
			"raw":       raw_line,
		}
	}
	entry["raw"] = raw_line
	if strings.TrimSpace(fmt.Sprint(entry["component"])) == "" {
		entry["component"] = "backend"
	}
	if strings.TrimSpace(fmt.Sprint(entry["level"])) == "" {
		entry["level"] = "info"
	}
	if strings.TrimSpace(fmt.Sprint(entry["message"])) == "" {
		entry["message"] = raw_line
	}
	return entry
}

func application_log_matches(entry map[string]interface{}, raw_line string, query application_log_query) bool {
	level := strings.ToLower(strings.TrimSpace(fmt.Sprint(entry["level"])))
	if len(query.levels) > 0 {
		if _, ok := query.levels[level]; !ok {
			return false
		}
	}
	component := strings.ToLower(strings.TrimSpace(fmt.Sprint(entry["component"])))
	if query.component != "" && query.component != "all" && !strings.Contains(component, query.component) {
		return false
	}
	return query.keyword == "" || strings.Contains(strings.ToLower(raw_line), query.keyword)
}
