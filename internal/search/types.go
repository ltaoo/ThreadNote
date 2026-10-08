package search

import "time"

// Kind identifies the type of an indexed document.
type Kind string

const (
	KindMemo    Kind = "memo"
	KindComment Kind = "comment"
	KindTodo    Kind = "todo"
)

// Document is a fully-built search document. The service layer builds these
// from vault records; this package only indexes and queries them.
type Document struct {
	Kind Kind
	ID   string

	MemoID    string
	CommentID string
	TodoID    string

	ProjectID       string
	Tags            []string
	Visibility      string
	SourceType      string
	SourceCommentID string
	LineIndex       int

	Archived bool
	Pinned   bool
	Checked  bool
	Private  bool

	CreatedAt time.Time
	UpdatedAt time.Time

	Title string
	// Content is the searchable body: memo body, comment body, or raw todo text.
	Content string
	// SourceText is the surrounding context a todo was extracted from.
	SourceText string
}

// Hit is a single search result. TitleHTML and SnippetHTML contain the
// server-rendered highlight markup: the original text is HTML-escaped and
// every matched term is wrapped in <mark>.
type Hit struct {
	Kind      Kind   `json:"kind"`
	ID        string `json:"id"`
	MemoID    string `json:"memoId"`
	CommentID string `json:"commentId,omitempty"`
	TodoID    string `json:"todoId,omitempty"`

	Title       string `json:"title"`
	TitleHTML   string `json:"titleHTML"`
	SnippetHTML string `json:"snippetHTML"`

	// Text and SourceText carry the raw todo payload needed by the client to
	// rebuild the todo detail view without a second round-trip.
	Text       string `json:"text,omitempty"`
	SourceText string `json:"sourceText,omitempty"`

	Score   float64  `json:"score"`
	Project string   `json:"projectId"`
	Tags    []string `json:"tags,omitempty"`

	Archived bool `json:"archived"`
	Pinned   bool `json:"pinned"`
	Checked  bool `json:"checked"`
	Private  bool `json:"private"`

	SourceType      string `json:"sourceType,omitempty"`
	SourceCommentID string `json:"sourceCommentId,omitempty"`
	LineIndex       int    `json:"lineIndex"`

	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// FacetBucket is one value/count pair of a computed facet.
type FacetBucket struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// Facet is a computed facet and its buckets.
type Facet struct {
	Name    string        `json:"name"`
	Buckets []FacetBucket `json:"buckets"`
}

// Results is the outcome of a search request.
type Results struct {
	Hits   []Hit   `json:"hits"`
	Total  int     `json:"total"`
	Facets []Facet `json:"facets"`
	Sort   string  `json:"sort"`
}

// SearchRequest describes one query. Page is 1-based; a zero Page means the
// first page.
type SearchRequest struct {
	Query string
	Limit int
	Page  int
	Sort  string
}
