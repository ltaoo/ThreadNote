package search

import (
	stdhtml "html"
	"strings"
	"time"

	"github.com/blevesearch/bleve/v2/search"
)

// Client-facing field names. They match the searchschema definitions through
// their IndexField.
var storedFields = []string{
	"kind",
	"memoId",
	"commentId",
	"todoId",
	"projectId",
	"tags",
	"visibility",
	"sourceType",
	"sourceCommentId",
	"lineIndex",
	"archived",
	"pinned",
	"checked",
	"private",
	"createdAt",
	"updatedAt",
	"title",
	"content",
	"sourceText",
}

// highlightedFields are the analyzed text fields the server renders <mark>
// markup for.
var highlightedFields = []string{"title", "content", "sourceText"}

const snippetLength = 240

// hitFromMatch converts a Bleve document match into a client-facing Hit,
// preferring server-rendered highlight fragments and falling back to escaped
// plain text when a field had no match.
func hitFromMatch(match *search.DocumentMatch) Hit {
	kind := Kind(fieldString(match, "kind"))
	hit := Hit{
		Kind:            kind,
		ID:              match.ID,
		MemoID:          fieldString(match, "memoId"),
		CommentID:       fieldString(match, "commentId"),
		TodoID:          fieldString(match, "todoId"),
		Project:         fieldString(match, "projectId"),
		Tags:            fieldStrings(match, "tags"),
		SourceType:      fieldString(match, "sourceType"),
		SourceCommentID: fieldString(match, "sourceCommentId"),
		LineIndex:       int(fieldNumber(match, "lineIndex")),
		Archived:        fieldBool(match, "archived"),
		Pinned:          fieldBool(match, "pinned"),
		Checked:         fieldBool(match, "checked"),
		Private:         fieldBool(match, "private"),
		CreatedAt:       formatTimestamp(fieldNumber(match, "createdAt")),
		UpdatedAt:       formatTimestamp(fieldNumber(match, "updatedAt")),
		Score:           match.Score,
	}

	title := fieldString(match, "title")
	content := fieldString(match, "content")
	sourceText := fieldString(match, "sourceText")
	hit.Title = title
	hit.Text = content
	hit.SourceText = sourceText

	hit.TitleHTML = fragmentOrEscaped(match, "title", title)
	hit.SnippetHTML = snippetHTML(match, content, sourceText)
	return hit
}

// snippetHTML prefers a highlighted body fragment, then a highlighted
// surrounding-context fragment, then an escaped plain-text fallback.
func snippetHTML(match *search.DocumentMatch, content, sourceText string) string {
	for _, field := range []string{"content", "sourceText"} {
		if fragment := firstFragment(match, field); fragment != "" {
			return fragment
		}
	}
	text := content
	if strings.TrimSpace(text) == "" {
		text = sourceText
	}
	return escapedSnippet(text)
}

func fragmentOrEscaped(match *search.DocumentMatch, field, value string) string {
	if fragment := firstFragment(match, field); fragment != "" {
		return fragment
	}
	return escapedSnippet(value)
}

func firstFragment(match *search.DocumentMatch, field string) string {
	fragments, ok := match.Fragments[field]
	if !ok || len(fragments) == 0 {
		return ""
	}
	return fragments[0]
}

// escapedSnippet HTML-escapes and truncates plain text so the client can render
// snippetHTML directly.
func escapedSnippet(value string) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > snippetLength {
		value = string(runes[:snippetLength]) + "…"
	}
	return stdhtml.EscapeString(value)
}

func fieldString(match *search.DocumentMatch, field string) string {
	value, ok := match.Fields[field].(string)
	if !ok {
		return ""
	}
	return value
}

func fieldStrings(match *search.DocumentMatch, field string) []string {
	switch value := match.Fields[field].(type) {
	case []any:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return value
	case string:
		if value == "" {
			return nil
		}
		return []string{value}
	}
	return nil
}

func fieldNumber(match *search.DocumentMatch, field string) float64 {
	switch value := match.Fields[field].(type) {
	case float64:
		return value
	case int64:
		return float64(value)
	case int:
		return float64(value)
	}
	return 0
}

func fieldBool(match *search.DocumentMatch, field string) bool {
	return fieldString(match, field) == "true"
}

func formatTimestamp(seconds float64) string {
	if seconds == 0 {
		return ""
	}
	return time.Unix(int64(seconds), 0).UTC().Format(time.RFC3339)
}
