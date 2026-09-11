package service

import (
	"regexp"
	"strings"
)

// memo_content_counts holds resource counts extracted from memo markdown
// content. The extraction rules mirror frontend/src/domain/memo-resources.js
// so the indexed sidebar counts match what the memo views render.
type memo_content_counts struct {
	Images       int `json:"images"`
	Files        int `json:"files"`
	Links        int `json:"links"`
	CodeBlocks   int `json:"codeBlocks"`
	CodeSnippets int `json:"codeSnippets"`
	OpenTodos    int `json:"openTodos"`
	DoneTodos    int `json:"doneTodos"`
}

func (counts *memo_content_counts) add(other memo_content_counts) {
	counts.Images += other.Images
	counts.Files += other.Files
	counts.Links += other.Links
	counts.CodeBlocks += other.CodeBlocks
	counts.CodeSnippets += other.CodeSnippets
	counts.OpenTodos += other.OpenTodos
	counts.DoneTodos += other.DoneTodos
}

type memo_fence struct {
	marker string
	length int
	info   string
}

var (
	memo_fence_pattern          = regexp.MustCompile("^(`{3,}|~{3,})[ \t]*(.*)$")
	memo_markdown_link_pattern  = regexp.MustCompile(`(!?)\[([^\]]*)\]\(([^)]+)\)`)
	memo_raw_url_pattern        = regexp.MustCompile(`\bhttps?://[^\s<>"` + "`" + `]+`)
	memo_todo_pattern           = regexp.MustCompile(`^\s{0,3}[-*+]\s+\[([ xX])\]\s+`)
	memo_snippet_marker_pattern = regexp.MustCompile(`(?:^|\s)(#?snippet|snip|code[-\s]?snippet|代码片段|片段)(?:\s*[:：-]\s*|\s+|$)`)
)

func parse_memo_fence(line string) *memo_fence {
	trimmed := strings.TrimSpace(line)
	match := memo_fence_pattern.FindStringSubmatch(trimmed)
	if match == nil {
		return nil
	}
	return &memo_fence{
		marker: string(match[1][0]),
		length: len(match[1]),
		info:   strings.TrimSpace(match[2]),
	}
}

func is_memo_fence_closing(line string, opening *memo_fence) bool {
	closing := parse_memo_fence(line)
	return closing != nil &&
		closing.marker == opening.marker &&
		closing.length >= opening.length &&
		closing.info == ""
}

// mask_memo_inline_code replaces inline code spans (including their content
// and closing delimiter) with spaces so patterns inside `code` are not
// counted as references, mirroring maskMemoInlineCode in the frontend.
func mask_memo_inline_code(value string) string {
	output := []byte(value)
	index := 0
	for index < len(output) {
		if output[index] != '`' {
			index += 1
			continue
		}
		run_start := index
		for index < len(output) && output[index] == '`' {
			index += 1
		}
		// The closing delimiter is located with a byte offset relative to
		// the run end; all indexes here must stay in byte space.
		rest := string(output[index:])
		close_index := strings.Index(rest, string(output[run_start:index]))
		end := len(output)
		if close_index >= 0 {
			end = index + close_index + (index - run_start)
		}
		for i := run_start; i < end; i += 1 {
			output[i] = ' '
		}
		index = end
	}
	return string(output)
}

func is_memo_asset_reference(value string) bool {
	clean := strings.TrimSpace(strings.SplitN(value, "?", 2)[0])
	if len(clean) > 8 && strings.HasPrefix(strings.ToLower(clean), "@assets/") {
		return true
	}
	return false
}

var (
	memo_file_extension_pattern   = regexp.MustCompile(`(?i)\.(7z|aac|apk|avi|csv|dmg|docx?|flac|gz|heic|ics|json|key|log|m4a|mkv|mov|mp3|mp4|numbers|pages|pdf|pptx?|rar|rtf|tar|txt|wav|webm|xlsx?|xml|yaml|yml|zip)([?#].*)?$`)
	memo_image_extension_pattern  = regexp.MustCompile(`(?i)\.(avif|bmp|gif|jpe?g|png|svg|webp)([?#].*)?$`)
	memo_local_attachment_pattern = regexp.MustCompile(`(?i)^(local://|blob:|data:)`)
	memo_image_data_url_pattern   = regexp.MustCompile(`(?i)^data:image/`)
	memo_hyperlink_pattern        = regexp.MustCompile(`(?i)^(https?:|mailto:)`)
	memo_raw_url_trailing_pattern = regexp.MustCompile(`[),.;:!?，。；：！？]$`)
)

func is_memo_file_attachment(label string, url string) bool {
	if is_memo_asset_reference(url) {
		return true
	}
	if memo_local_attachment_pattern.MatchString(strings.TrimSpace(url)) {
		return true
	}
	return memo_file_extension_pattern.MatchString(strings.TrimSpace(label)) ||
		memo_file_extension_pattern.MatchString(strings.TrimSpace(url))
}

// file_display_name mirrors fileDisplayName in the frontend: show the asset
// key or the URL's last path segment.
func file_display_name(label string, url string) string {
	raw := strings.TrimSpace(label)
	if raw == "" {
		if is_memo_asset_reference(url) {
			parts := strings.SplitN(strings.SplitN(strings.TrimSpace(url), "?", 2)[0], "/", 4)
			if len(parts) == 4 {
				raw = parts[3]
			}
		}
	}
	if raw == "" {
		raw = strings.TrimSpace(url)
	}
	clean := strings.Split(raw, "?")[0]
	clean = strings.TrimRight(clean, "/")
	last := clean
	if index := strings.LastIndex(clean, "/"); index >= 0 {
		last = clean[index+1:]
	}
	if last == "" {
		last = raw
	}
	return last
}

func is_memo_image_attachment(label string, url string) bool {
	if memo_image_data_url_pattern.MatchString(strings.TrimSpace(url)) {
		return true
	}
	return memo_image_extension_pattern.MatchString(strings.TrimSpace(label)) ||
		memo_image_extension_pattern.MatchString(strings.TrimSpace(url))
}

func memo_reference_type(is_image_marker bool, label string, url string) string {
	if is_image_marker || is_memo_image_attachment(label, url) {
		return "image"
	}
	if is_memo_file_attachment(label, url) {
		return "file"
	}
	trimmed := strings.TrimSpace(url)
	if memo_hyperlink_pattern.MatchString(trimmed) || strings.HasPrefix(trimmed, "/") {
		return "link"
	}
	return ""
}

func memo_raw_url_type(url string) string {
	if is_memo_image_attachment("", url) {
		return "image"
	}
	if is_memo_file_attachment("", url) {
		return "file"
	}
	return "link"
}

func clean_memo_raw_url(value string) string {
	url := strings.TrimSpace(value)
	for memo_raw_url_trailing_pattern.MatchString(url) {
		url = url[:len(url)-1]
	}
	return url
}

func is_memo_snippet_marker(value string) bool {
	text := strings.TrimSpace(value)
	if text == "" {
		return false
	}
	text = strings.ReplaceAll(text, "{", " ")
	text = strings.ReplaceAll(text, "}", " ")
	return memo_snippet_marker_pattern.MatchString(text)
}

// snippet_marker_from_previous_lines mirrors
// codeBlockMarkerFromPreviousLines: the nearest preceding non-empty line may
// annotate the fence as a marked snippet.
func snippet_marker_from_previous_lines(lines []string, line_index int) bool {
	for index := line_index - 1; index >= 0; index -= 1 {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			continue
		}
		return is_memo_snippet_marker(line)
	}
	return false
}

func snippet_marker_from_first_line(lines []string) bool {
	if len(lines) == 0 {
		return false
	}
	return is_memo_snippet_marker(strings.TrimSpace(lines[0]))
}

// analyze_memo_content counts images, file attachments, hyperlinks, fenced
// code blocks (plus marked snippets), and checkbox todos in a memo body.
// Fenced code blocks are counted but their contents are skipped when
// collecting references, matching the frontend collector behavior.
func analyze_memo_content(content string) memo_content_counts {
	var counts memo_content_counts
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	active_fence := (*memo_fence)(nil)
	pending_block := false
	pending_marker := false
	block_lines := []string{}

	close_code_block := func() {
		counts.CodeBlocks += 1
		marker := pending_marker || snippet_marker_from_first_line(block_lines)
		if marker {
			counts.CodeSnippets += 1
		}
		pending_block = false
		pending_marker = false
		block_lines = nil
	}

	for index, line := range lines {
		fence := parse_memo_fence(line)
		if active_fence != nil {
			if fence != nil && is_memo_fence_closing(line, active_fence) {
				active_fence = nil
				close_code_block()
			} else {
				block_lines = append(block_lines, line)
			}
			continue
		}
		if fence != nil {
			active_fence = fence
			pending_block = true
			pending_marker = is_memo_snippet_marker(fence.info) ||
				snippet_marker_from_previous_lines(lines, index)
			continue
		}

		if match := memo_todo_pattern.FindStringSubmatch(line); match != nil {
			if match[1] == " " {
				counts.OpenTodos += 1
			} else {
				counts.DoneTodos += 1
			}
		}

		count_line_references(&counts, mask_memo_inline_code(line))
	}

	if pending_block {
		close_code_block()
	}
	return counts
}

type memo_markdown_range struct {
	start int
	end   int
}

// memo_reference_item is one image/file/link reference extracted from memo
// markdown content, before storage metadata (project, visibility, ...) is
// attached.
type memo_reference_item struct {
	Type      string // image | file | link
	Syntax    string // image | markdown | raw
	URL       string
	Label     string
	LineIndex int
	Seq       int
}

func memo_content_lines(content string) []string {
	return strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
}

// extract_memo_references returns every reference in the content outside
// fenced code blocks, mirroring collectMemoReferences in the frontend.
func extract_memo_references(content string) []memo_reference_item {
	items := []memo_reference_item{}
	lines := memo_content_lines(content)
	active_fence := (*memo_fence)(nil)
	for index, line := range lines {
		fence := parse_memo_fence(line)
		if active_fence != nil {
			if fence != nil && is_memo_fence_closing(line, active_fence) {
				active_fence = nil
			}
			continue
		}
		if fence != nil {
			active_fence = fence
			continue
		}
		items = append(items, extract_line_references(mask_memo_inline_code(line), index, len(items))...)
	}
	return items
}

func extract_line_references(line string, line_index int, seq_start int) []memo_reference_item {
	items := []memo_reference_item{}
	markdown_ranges := []memo_markdown_range{}
	for _, match := range memo_markdown_link_pattern.FindAllStringSubmatchIndex(line, -1) {
		if match[0] < 0 || match[1] < 0 {
			continue
		}
		markdown_ranges = append(markdown_ranges, memo_markdown_range{start: match[0], end: match[1]})
		if match[6] < 0 || match[7] < 0 {
			continue
		}
		url := strings.TrimSpace(line[match[6]:match[7]])
		if url == "" {
			continue
		}
		is_image_marker := match[2] >= 0 && line[match[2]:match[3]] == "!"
		label := ""
		if match[4] >= 0 && match[5] >= 0 {
			label = strings.TrimSpace(line[match[4]:match[5]])
		}
		reference_type := memo_reference_type(is_image_marker, label, url)
		if reference_type == "" {
			continue
		}
		items = append(items, memo_reference_item{
			Type:      reference_type,
			Syntax:    map[bool]string{true: "image", false: "markdown"}[is_image_marker],
			URL:       url,
			Label:     label,
			LineIndex: line_index,
			Seq:       seq_start + len(items),
		})
	}
	for _, match := range memo_raw_url_pattern.FindAllStringIndex(line, -1) {
		if range_includes(markdown_ranges, match[0]) {
			continue
		}
		url := clean_memo_raw_url(line[match[0]:match[1]])
		if url == "" {
			continue
		}
		items = append(items, memo_reference_item{
			Type:      memo_raw_url_type(url),
			Syntax:    "raw",
			URL:       url,
			LineIndex: line_index,
			Seq:       seq_start + len(items),
		})
	}
	return items
}

func range_includes(ranges []memo_markdown_range, index int) bool {
	for _, item := range ranges {
		if index >= item.start && index < item.end {
			return true
		}
	}
	return false
}

func count_line_references(counts *memo_content_counts, line string) {
	for _, item := range extract_line_references(line, 0, 0) {
		switch item.Type {
		case "image":
			counts.Images += 1
		case "file":
			counts.Files += 1
		case "link":
			counts.Links += 1
		}
	}
}
