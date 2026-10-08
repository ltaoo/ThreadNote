// This file turns vault records into Bleve documents. It mirrors the rules the
// frontend used to apply in memory, so search results keep the same shape:
// every memo and comment becomes a document, and every task line becomes its own
// todo document identified by its source and line index.
package service

import (
	"regexp"
	"strings"

	"example/simple/internal/search"
)

// search_todo_source carries the parent record's attributes that every todo
// document inherits, so `tags:`, `projectId:`, and `archived:` filters behave
// the same for a task as for the memo or comment it lives in.
type search_todo_source struct {
	archived    bool
	content     string
	created_at  string
	memo_id     string
	pinned      bool
	private     bool
	project_id  string
	source_id   string
	source_type string
	tags        []string
	title       string
	updated_at  string
	visibility  string
}

// search_memo_documents returns every document derived from one memo. A
// task-only memo yields only its todo documents, which is what keeps the same
// content from showing up twice.
func search_memo_documents(memo MemoRecord) []search.Document {
	title := search_memo_title(memo.Content)
	todos := search_todo_documents(search_todo_source{
		archived:    memo.Archived,
		content:     memo.Content,
		created_at:  memo.CreatedAt,
		memo_id:     memo.ID,
		pinned:      memo.Pinned,
		private:     memo.Private,
		project_id:  memo.ProjectID,
		source_id:   memo.ID,
		source_type: "memo",
		tags:        memo.Tags,
		title:       title,
		updated_at:  memo.UpdatedAt,
		visibility:  memo.Visibility,
	})
	if search_memo_is_task_only(memo.Content) {
		return todos
	}
	documents := []search.Document{{
		Archived:   memo.Archived,
		Content:    memo.Content,
		CreatedAt:  parseMemoTime(memo.CreatedAt),
		ID:         search.MemoDocID(memo.ID),
		Kind:       search.KindMemo,
		MemoID:     memo.ID,
		Pinned:     memo.Pinned,
		Private:    memo.Private,
		ProjectID:  memo.ProjectID,
		Tags:       memo.Tags,
		Title:      title,
		UpdatedAt:  parseMemoTime(memo.UpdatedAt),
		Visibility: memo.Visibility,
	}}
	return append(documents, todos...)
}

// search_comment_documents returns the comment document plus the todos written
// inside the comment. The parent memo supplies the title and the inherited
// filters.
func search_comment_documents(comment MemoCommentRecord, parent MemoRecord) []search.Document {
	title := search_memo_title(parent.Content)
	todos := search_todo_documents(search_todo_source{
		archived:    parent.Archived,
		content:     comment.Content,
		created_at:  comment.CreatedAt,
		memo_id:     comment.MemoID,
		pinned:      parent.Pinned,
		private:     comment.Private || parent.Private,
		project_id:  parent.ProjectID,
		source_id:   comment.ID,
		source_type: "comment",
		tags:        parent.Tags,
		title:       title,
		updated_at:  comment.UpdatedAt,
		visibility:  comment.Visibility,
	})
	documents := []search.Document{{
		Archived:   parent.Archived,
		CommentID:  comment.ID,
		Content:    comment.Content,
		CreatedAt:  parseMemoTime(comment.CreatedAt),
		ID:         search.CommentDocID(comment.ID),
		Kind:       search.KindComment,
		MemoID:     comment.MemoID,
		Pinned:     parent.Pinned,
		Private:    comment.Private || parent.Private,
		ProjectID:  parent.ProjectID,
		Tags:       parent.Tags,
		Title:      title,
		UpdatedAt:  parseMemoTime(comment.UpdatedAt),
		Visibility: comment.Visibility,
	}}
	return append(documents, todos...)
}

// search_todo_documents builds one document per task line in content.
func search_todo_documents(source search_todo_source) []search.Document {
	created_at := parseMemoTime(source.created_at)
	updated_at := parseMemoTime(source.updated_at)
	documents := []search.Document{}
	for _, task := range search_task_lines(source.content) {
		documents = append(documents, search.Document{
			Archived:        source.archived,
			Checked:         task.Checked,
			Content:         task.Text,
			CreatedAt:       created_at,
			ID:              search.TodoDocID(source.source_type, source.source_id, task.LineIndex),
			Kind:            search.KindTodo,
			LineIndex:       task.LineIndex,
			MemoID:          source.memo_id,
			Pinned:          source.pinned,
			Private:         source.private,
			ProjectID:       source.project_id,
			SourceCommentID: source.source_comment_id(),
			SourceText:      task.SourceText,
			SourceType:      source.source_type,
			Tags:            source.tags,
			Title:           source.title,
			TodoID:          search.TodoID(source.source_type, source.source_id, task.LineIndex),
			UpdatedAt:       updated_at,
			Visibility:      source.visibility,
		})
	}
	return documents
}

func (source search_todo_source) source_comment_id() string {
	if source.source_type == "comment" {
		return source.source_id
	}
	return ""
}

const (
	search_task_only_source_text = "仅包含任务的 memo"
	search_source_text_max_len   = 84
	search_title_max_len         = 48
)

// search_memo_lines splits content the same way the frontend does.
func search_memo_lines(content string) []string {
	return strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
}

// search_task_line is one task line found in memo or comment content.
type search_task_line struct {
	Checked    bool
	LineIndex  int
	SourceText string
	Text       string
}

// search_task_lines extracts task lines, ignoring fenced code blocks. Source
// text is the nearest preceding non-task line, which is what the todo detail
// view shows as context.
func search_task_lines(content string) []search_task_line {
	lines := search_memo_lines(content)
	tasks := []search_task_line{}
	active_fence := ""
	for line_index, line := range lines {
		if fence := search_memo_fence_line(line); fence != "" {
			if active_fence == "" {
				active_fence = fence
			} else if search_memo_fence_closes(line, active_fence) {
				active_fence = ""
			}
			continue
		}
		if active_fence != "" {
			continue
		}
		parsed, ok := parseTaskLineText(line)
		if !ok {
			continue
		}
		tasks = append(tasks, search_task_line{
			Checked:    parsed.Checked,
			LineIndex:  line_index,
			SourceText: search_memo_source_text(lines, line_index),
			Text:       parsed.Text,
		})
	}
	return tasks
}

// search_memo_is_task_only reports whether content has at least one non-empty
// line and every non-empty line is a task line. Such a memo is rendered only as
// its todos, so it must not also produce a memo document.
func search_memo_is_task_only(content string) bool {
	lines := search_memo_lines(content)
	non_empty := 0
	tasks := 0
	active_fence := ""
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		non_empty++
		if fence := search_memo_fence_line(line); fence != "" {
			if active_fence == "" {
				active_fence = fence
			} else if search_memo_fence_closes(line, active_fence) {
				active_fence = ""
			}
			continue
		}
		if active_fence != "" {
			continue
		}
		if _, ok := parseTaskLineText(line); ok {
			tasks++
		}
	}
	return non_empty > 0 && tasks == non_empty
}

// search_memo_title mirrors the frontend's title rule: the first non-empty
// line, stripped of the most common Markdown prefixes and truncated.
func search_memo_title(content string) string {
	for _, line := range search_memo_lines(content) {
		title := search_clean_line(line)
		if title == "" {
			continue
		}
		return search_truncate(title, search_title_max_len)
	}
	return ""
}

// search_memo_source_text returns the nearest preceding plain line, falling back
// to the first plain line and finally to a placeholder.
func search_memo_source_text(lines []string, line_index int) string {
	before := ""
	for index := line_index - 1; index >= 0; index-- {
		if candidate := search_plain_line(lines[index]); candidate != "" {
			before = candidate
			break
		}
	}
	if before == "" {
		for _, line := range lines {
			if candidate := search_plain_line(line); candidate != "" {
				before = candidate
				break
			}
		}
	}
	if before == "" {
		before = search_task_only_source_text
	}
	return search_truncate(before, search_source_text_max_len)
}

func search_plain_line(line string) string {
	if strings.TrimSpace(line) == "" {
		return ""
	}
	if _, ok := parseTaskLineText(line); ok {
		return ""
	}
	return search_clean_line(line)
}

var (
	search_embed_pattern        = regexp.MustCompile(`!\[\[([^\]]+)\]\]`)
	search_markdown_image_pattern = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	search_markdown_link_pattern  = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	search_markdown_decoration    = strings.NewReplacer(
		"`", " ", "*", " ", "_", " ", ">", " ", "#", " ", "-", " ")
)

// search_clean_line mirrors the frontend's stripMemoTitleMarkdown: unwrap
// embeds and links, drop inline decoration, and collapse whitespace, so a
// server-derived title reads exactly like the one the feed shows.
func search_clean_line(line string) string {
	cleaned := search_embed_pattern.ReplaceAllString(strings.TrimSpace(line), "$1")
	cleaned = search_unwrap_links(cleaned)
	cleaned = search_markdown_image_pattern.ReplaceAllString(cleaned, "$1")
	cleaned = search_markdown_link_pattern.ReplaceAllString(cleaned, "$1")
	cleaned = search_markdown_decoration.Replace(cleaned)
	return strings.Join(strings.Fields(cleaned), " ")
}

// search_unwrap_links turns [[target|label]] and [[target]] into their label.
func search_unwrap_links(value string) string {
	for {
		start := strings.Index(value, "[[")
		if start < 0 {
			return value
		}
		end := strings.Index(value[start:], "]]")
		if end < 0 {
			return value
		}
		inner := value[start+2 : start+end]
		if pipe := strings.LastIndex(inner, "|"); pipe >= 0 {
			inner = inner[pipe+1:]
		}
		value = value[:start] + inner + value[start+end+2:]
	}
}

func search_truncate(value string, max_len int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) <= max_len {
		return value
	}
	return strings.TrimSpace(string(runes[:max_len-1])) + "..."
}

// search_memo_fence_line reports the fence marker of a fenced code block line
// (``` or ~~~), or "" when the line is not a fence.
func search_memo_fence_line(line string) string {
	trimmed := strings.TrimSpace(line)
	if len(trimmed) < 3 {
		return ""
	}
	marker := trimmed[0]
	if marker != '`' && marker != '~' {
		return ""
	}
	run := 0
	for run < len(trimmed) && trimmed[run] == marker {
		run++
	}
	if run < 3 {
		return ""
	}
	return trimmed[:run]
}

func search_memo_fence_closes(line, opening_fence string) bool {
	if opening_fence == "" {
		return false
	}
	marker := opening_fence[:1]
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, marker) {
		return false
	}
	// A closing fence carries no info string and is at least as long as the
	// opening one.
	if strings.TrimLeft(trimmed, marker) != "" {
		return false
	}
	return len(trimmed) >= len(opening_fence)
}
