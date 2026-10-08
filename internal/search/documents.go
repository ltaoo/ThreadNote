package search

import (
	"fmt"
	"strconv"
)

// Document IDs are deterministic so that reindexing an unchanged record is an
// idempotent upsert, and so that a parent's derived todos can be found by
// prefix.
const (
	docIDKindMemo    = "memo"
	docIDKindComment = "comment"
	docIDKindTodo    = "todo"
)

// MemoDocID is the Bleve document ID for a memo.
func MemoDocID(memoID string) string {
	return docIDKindMemo + ":" + memoID
}

// CommentDocID is the Bleve document ID for a comment.
func CommentDocID(commentID string) string {
	return docIDKindComment + ":" + commentID
}

// TodoID is the client-facing todo identifier: the document ID without its
// "todo:" namespace prefix, so it can be shown to and round-tripped by the UI.
func TodoID(sourceType, sourceID string, lineIndex int) string {
	return fmt.Sprintf("%s:%s:%d", sourceType, sourceID, lineIndex)
}

// TodoDocID is the Bleve document ID for a todo extracted from a memo or a
// comment. lineIndex disambiguates multiple todos in the same source.
func TodoDocID(sourceType, sourceID string, lineIndex int) string {
	return docIDKindTodo + ":" + TodoID(sourceType, sourceID, lineIndex)
}

// MemoTodoPrefix matches every todo derived from the given memo.
func MemoTodoPrefix(memoID string) string {
	return docIDKindTodo + ":" + docIDKindMemo + ":" + memoID + ":"
}

// CommentTodoPrefix matches every todo derived from the given comment.
func CommentTodoPrefix(commentID string) string {
	return docIDKindTodo + ":" + docIDKindComment + ":" + commentID + ":"
}

func boolKeyword(v bool) string {
	return strconv.FormatBool(v)
}

// fields renders the document as the Bleve document body. Empty optional values
// are omitted so they do not create empty terms, and booleans become keyword
// strings so that `archived:true` works like any other exact filter.
func (d Document) fields() map[string]any {
	fields := map[string]any{
		"kind":      string(d.Kind),
		"lineIndex": float64(d.LineIndex),
	}
	set := func(key, value string) {
		if value != "" {
			fields[key] = value
		}
	}
	set("memoId", d.MemoID)
	set("commentId", d.CommentID)
	set("todoId", d.TodoID)
	set("projectId", d.ProjectID)
	set("visibility", d.Visibility)
	set("sourceType", d.SourceType)
	set("sourceCommentId", d.SourceCommentID)
	set("title", d.Title)
	set("content", d.Content)
	set("sourceText", d.SourceText)

	if len(d.Tags) > 0 {
		fields["tags"] = d.Tags
	}
	fields["archived"] = boolKeyword(d.Archived)
	fields["pinned"] = boolKeyword(d.Pinned)
	fields["checked"] = boolKeyword(d.Checked)
	fields["private"] = boolKeyword(d.Private)

	if !d.CreatedAt.IsZero() {
		fields["createdAt"] = float64(d.CreatedAt.Unix())
	}
	if !d.UpdatedAt.IsZero() {
		fields["updatedAt"] = float64(d.UpdatedAt.Unix())
	}
	return fields
}
