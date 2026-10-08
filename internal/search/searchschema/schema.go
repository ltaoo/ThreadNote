// Package searchschema is the single source of truth for the searchable
// fields, facets, and sort modes shared by the query builder, the index
// mapping, and the HTTP API capabilities endpoint.
//
// It is deliberately a separate package from the indexer so that the query
// builder can consume the definitions without importing the indexer, which
// would be an import cycle.
package searchschema

import (
	"slices"
)

// SchemaVersion is bumped whenever the field definitions or the index mapping
// change in a way that requires a full reindex.
const SchemaVersion = 1

type FieldKind string

const (
	FieldKindText    FieldKind = "text"
	FieldKindKeyword FieldKind = "keyword"
	FieldKindInteger FieldKind = "integer"
	FieldKindTime    FieldKind = "time"
)

type FacetKind string

const (
	FacetKindTerms FacetKind = "terms"
)

// FieldDefinition describes one searchable field.
type FieldDefinition struct {
	Name        string    `json:"name"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	Kind        FieldKind `json:"kind"`
	Facet       string    `json:"facet,omitempty"`

	// IndexField is the Bleve document field backing this definition.
	IndexField string `json:"-"`
	// Aliases are additional names accepted in queries.
	Aliases []string `json:"-"`
	// Weight boosts matches on this field relative to other fields.
	Weight float64 `json:"-"`
	// Visible controls whether the field is advertised by /api/search/capabilities.
	Visible bool `json:"-"`
	// Phrase marks analyzed text fields that support quoted phrase queries.
	Phrase bool `json:"-"`
	// DefaultSearch includes the field in free-text queries.
	DefaultSearch bool `json:"-"`
	// DefaultWildcard includes the field in wildcard-expanded free-text queries.
	DefaultWildcard bool `json:"-"`
}

type FacetDefinition struct {
	Name        string    `json:"name"`
	Label       string    `json:"label"`
	QueryField  string    `json:"queryField"`
	Kind        FacetKind `json:"kind"`
	DefaultSize int       `json:"defaultSize"`
}

type SortDefinition struct {
	Value   string `json:"value"`
	Label   string `json:"label"`
	Visible bool   `json:"visible"`
	Default bool   `json:"default,omitempty"`

	Fields  []string `json:"-"`
	ByScore bool     `json:"-"`
}

type SortCapabilities struct {
	Field       string           `json:"field"`
	Label       string           `json:"label"`
	Description string           `json:"description"`
	Options     []SortDefinition `json:"options"`
}

// Capabilities is the payload served by /api/search/capabilities.
type Capabilities struct {
	Version int               `json:"version"`
	Fields  []FieldDefinition `json:"fields"`
	Facets  []FacetDefinition `json:"facets"`
	Sort    SortCapabilities  `json:"sort"`
}

var fields = []FieldDefinition{
	{Name: "kind", Label: "类型", Description: "只搜索某一类结果：memo、comment 或 todo", Kind: FieldKindKeyword, IndexField: "kind", Visible: true},
	{Name: "title", Label: "标题", Description: "只搜索标题", Kind: FieldKindText, IndexField: "title", Weight: 12, Visible: true, Phrase: true, DefaultSearch: true},
	{Name: "content", Label: "内容", Description: "只搜索正文", Kind: FieldKindText, IndexField: "content", Weight: 6, Visible: true, Phrase: true, DefaultSearch: true},
	{Name: "sourceText", Label: "来源", Description: "只搜索待办所在段落的上下文", Kind: FieldKindText, IndexField: "sourceText", Weight: 2, Visible: true, Phrase: true, DefaultSearch: true},
	{Name: "memoId", Label: "Memo", Description: "按 memo id 过滤", Kind: FieldKindKeyword, IndexField: "memoId", Visible: true},
	{Name: "commentId", Label: "评论", Description: "按评论 id 过滤", Kind: FieldKindKeyword, IndexField: "commentId", Visible: true},
	{Name: "todoId", Label: "待办", Description: "按待办 id 过滤", Kind: FieldKindKeyword, IndexField: "todoId", Visible: true},
	{Name: "projectId", Label: "项目", Description: "按项目 id 过滤", Kind: FieldKindKeyword, IndexField: "projectId", Visible: true, DefaultWildcard: true},
	{Name: "tags", Label: "标签", Description: "按标签过滤", Kind: FieldKindKeyword, IndexField: "tags", Visible: true},
	{Name: "visibility", Label: "可见性", Description: "按可见性过滤", Kind: FieldKindKeyword, IndexField: "visibility", Visible: true},
	{Name: "archived", Label: "归档", Description: "只搜索已归档或未归档的内容", Kind: FieldKindKeyword, IndexField: "archived", Visible: true},
	{Name: "pinned", Label: "置顶", Description: "只搜索已置顶或未置顶的内容", Kind: FieldKindKeyword, IndexField: "pinned", Visible: true},
	{Name: "checked", Label: "已完成", Description: "只搜索已完成或未完成的待办", Kind: FieldKindKeyword, IndexField: "checked", Visible: true},
	{Name: "private", Label: "私密", Description: "只搜索私密或非私密的内容", Kind: FieldKindKeyword, IndexField: "private", Visible: true},
	{Name: "sourceType", Label: "来源类型", Description: "按来源过滤：memo 或 comment", Kind: FieldKindKeyword, IndexField: "sourceType", Visible: true},
	{Name: "sourceCommentId", Label: "来源评论", Description: "按待办来源评论 id 过滤", Kind: FieldKindKeyword, IndexField: "sourceCommentId", Visible: true},
	{Name: "lineIndex", Label: "行号", Description: "按待办所在行号过滤", Kind: FieldKindInteger, IndexField: "lineIndex", Visible: true},
	{Name: "createdAt", Label: "创建时间", Description: "按创建时间过滤，例如 createdAt:>=2026-01-01 或 createdAt:>7d", Kind: FieldKindTime, IndexField: "createdAt", Visible: true},
	{Name: "updatedAt", Label: "更新时间", Description: "按更新时间过滤，例如 updatedAt:<7d", Kind: FieldKindTime, IndexField: "updatedAt", Visible: true},
}

var facets = []FacetDefinition{
	{Name: "kinds", Label: "类型", QueryField: "kind", Kind: FacetKindTerms, DefaultSize: 5},
	{Name: "projects", Label: "项目", QueryField: "projectId", Kind: FacetKindTerms, DefaultSize: 10},
}

var sortCapabilities = SortCapabilities{
	Field:       "sort",
	Label:       "排序",
	Description: "改变结果顺序",
	Options: []SortDefinition{
		{Value: "relevance", Label: "相关度", Visible: true, Default: true, Fields: []string{"-_score", "-updatedAt", "_id"}, ByScore: true},
		{Value: "-relevance", Label: "相关度（反向）", Fields: []string{"_score", "updatedAt", "_id"}, ByScore: true},
		{Value: "date", Label: "最新更新", Visible: true, Fields: []string{"-updatedAt", "_id"}},
		{Value: "-date", Label: "最久未更新", Visible: true, Fields: []string{"updatedAt", "_id"}},
		{Value: "created", Label: "最新创建", Visible: true, Fields: []string{"-createdAt", "_id"}},
		{Value: "-created", Label: "最早创建", Visible: true, Fields: []string{"createdAt", "_id"}},
	},
}

// Fields returns a copy of all field definitions.
func Fields() []FieldDefinition {
	return slices.Clone(fields)
}

// Field resolves a query field name (or alias) to its definition.
func Field(name string) (FieldDefinition, bool) {
	for _, field := range fields {
		if field.Name == name || slices.Contains(field.Aliases, name) {
			return field, true
		}
	}
	return FieldDefinition{}, false
}

// Facets returns a copy of all facet definitions.
func Facets() []FacetDefinition {
	return slices.Clone(facets)
}

// Facet resolves a facet name to its definition.
func Facet(name string) (FacetDefinition, bool) {
	for _, facet := range facets {
		if facet.Name == name {
			return facet, true
		}
	}
	return FacetDefinition{}, false
}

// LookupSort resolves a sort value, with the empty string selecting the default.
func LookupSort(value string) (SortDefinition, bool) {
	for _, definition := range sortCapabilities.Options {
		if definition.Value == value || value == "" && definition.Default {
			definition.Fields = slices.Clone(definition.Fields)
			return definition, true
		}
	}
	return SortDefinition{}, false
}

// Sort resolves a sort value, falling back to the default sort.
func Sort(value string) SortDefinition {
	if definition, ok := LookupSort(value); ok {
		return definition
	}
	definition, _ := LookupSort("")
	return definition
}

// CapabilitiesDefinition returns the public capabilities payload.
func CapabilitiesDefinition() Capabilities {
	public_facets := Facets()
	facets_by_field := make(map[string]FacetDefinition, len(public_facets))
	for index, facet := range public_facets {
		facets_by_field[facet.QueryField] = public_facets[index]
	}
	public_fields := make([]FieldDefinition, 0, len(fields))
	for _, field := range fields {
		if !field.Visible {
			continue
		}
		if facet, ok := facets_by_field[field.Name]; ok {
			field.Facet = facet.Name
		}
		public_fields = append(public_fields, field)
	}
	public_sort := sortCapabilities
	public_sort.Options = slices.Clone(sortCapabilities.Options)
	return Capabilities{
		Version: SchemaVersion,
		Fields:  public_fields,
		Facets:  public_facets,
		Sort:    public_sort,
	}
}
