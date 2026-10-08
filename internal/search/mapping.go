package search

import (
	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/analysis/analyzer/custom"
	"github.com/blevesearch/bleve/v2/analysis/lang/cjk"
	"github.com/blevesearch/bleve/v2/analysis/token/lowercase"
	"github.com/blevesearch/bleve/v2/analysis/tokenizer/single"
	"github.com/blevesearch/bleve/v2/analysis/tokenizer/unicode"
	"github.com/blevesearch/bleve/v2/mapping"

	"example/simple/internal/search/searchschema"
)

const (
	// analyzerText tokenizes Latin text on word boundaries and CJK text into
	// bigrams, so that both "quick search" and "快捷搜索" are searchable.
	analyzerText = "velo_text"
	// analyzerKeywordLower indexes a keyword value as one lowercased token, so
	// that an exact term query matches regardless of case.
	analyzerKeywordLower = "velo_keyword"
	tokenFilterCJK       = "velo_cjk_bigram"
)

// createIndexMapping builds the Bleve index mapping from the shared search
// schema. The schema is the single source of truth: each definition's kind
// selects the field mapping, so adding a searchable field only requires an edit
// in searchschema.
func createIndexMapping() (*mapping.IndexMappingImpl, error) {
	im := bleve.NewIndexMapping()

	// cjk_bigram with output_unigram keeps single ideographs searchable. The
	// custom analyzer config only accepts token filter names, so the filter has
	// to be registered separately to pass its own options.
	if err := im.AddCustomTokenFilter(tokenFilterCJK, map[string]any{
		"type":           cjk.BigramName,
		"output_unigram": true,
	}); err != nil {
		return nil, err
	}
	if err := im.AddCustomAnalyzer(analyzerText, map[string]any{
		"type":          custom.Name,
		"char_filters":  []string{},
		"tokenizer":     unicode.Name,
		"token_filters": []string{cjk.WidthName, lowercase.Name, tokenFilterCJK},
	}); err != nil {
		return nil, err
	}
	if err := im.AddCustomAnalyzer(analyzerKeywordLower, map[string]any{
		"type":          custom.Name,
		"char_filters":  []string{},
		"tokenizer":     single.Name,
		"token_filters": []string{lowercase.Name},
	}); err != nil {
		return nil, err
	}

	text := bleve.NewTextFieldMapping()
	text.Store = true
	text.Index = true
	text.IncludeTermVectors = true
	text.IncludeInAll = false
	text.DocValues = false
	text.Analyzer = analyzerText

	keyword := bleve.NewTextFieldMapping()
	keyword.Store = true
	keyword.Index = true
	keyword.IncludeTermVectors = false
	keyword.IncludeInAll = false
	keyword.DocValues = true
	keyword.Analyzer = analyzerKeywordLower

	number := bleve.NewNumericFieldMapping()
	number.Store = true
	number.Index = true
	number.IncludeInAll = false
	number.DocValues = true

	docMapping := bleve.NewDocumentMapping()
	for _, definition := range searchschema.Fields() {
		switch definition.Kind {
		case searchschema.FieldKindText:
			docMapping.AddFieldMappingsAt(definition.IndexField, text)
		case searchschema.FieldKindKeyword:
			docMapping.AddFieldMappingsAt(definition.IndexField, keyword)
		case searchschema.FieldKindInteger, searchschema.FieldKindTime:
			docMapping.AddFieldMappingsAt(definition.IndexField, number)
		}
	}
	im.DefaultMapping = docMapping
	im.DefaultAnalyzer = analyzerText

	return im, nil
}
