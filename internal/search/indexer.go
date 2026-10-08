// Package search provides the Bleve-backed full-text index behind the memo,
// comment, and todo search API. It owns the index mapping, the query DSL
// translation, and server-side highlight rendering; building documents from
// vault records is the caller's responsibility.
package search

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search"

	"example/simple/internal/search/querybuilder"
	"example/simple/internal/search/searchschema"
)

const (
	// IndexDirName is the directory (relative to a vault's .velo directory)
	// holding the Bleve index and its metadata.
	IndexDirName = "search-index"
	metaFileName = "meta.json"
	indexDirName = "index"

	defaultLimit    = 20
	deleteBatchSize = 200
)

// ErrClosed is returned when the index is used after Close.
var ErrClosed = errors.New("search index is closed")

type indexMeta struct {
	// Version records the schema version the on-disk index was built with. A
	// mismatch means the index is stale and is rebuilt from scratch.
	Version   int    `json:"version"`
	Documents uint64 `json:"documents"`
	// LastFullBuild is set once a complete walk of the vault has been mirrored
	// into the index. The index is built on vault open and on an explicit
	// rebuild, never by a search, so this timestamp is what tells a later open
	// that the work is already done.
	LastFullBuild string `json:"lastFullBuild,omitempty"`
	LastUpdated   string `json:"updatedAt,omitempty"`
}

// Indexer is a single-vault search index. It is safe for concurrent use.
type Indexer struct {
	mu    sync.RWMutex
	index bleve.Index
	dir   string
}

// Open opens (or creates) the index in dir, rebuilding it when the on-disk
// schema version does not match or the index is unreadable. The index is purely
// derived data, so discarding it is always safe.
func Open(dir string) (*Indexer, error) {
	if !indexVersionMatches(dir) {
		if err := os.RemoveAll(dir); err != nil {
			return nil, err
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	indexPath := filepath.Join(dir, indexDirName)
	index, err := bleve.Open(indexPath)
	if err != nil {
		// Either the index does not exist yet or it cannot be read. Start over.
		if err := os.RemoveAll(dir); err != nil {
			return nil, err
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
		indexMapping, mappingErr := createIndexMapping()
		if mappingErr != nil {
			return nil, mappingErr
		}
		index, err = bleve.New(indexPath, indexMapping)
		if err != nil {
			return nil, err
		}
	}

	indexer := &Indexer{index: index, dir: dir}
	if err := indexer.writeMeta(); err != nil {
		_ = index.Close()
		return nil, err
	}
	return indexer, nil
}

func indexVersionMatches(dir string) bool {
	meta, err := readMeta(dir)
	if err != nil {
		return false
	}
	return meta.Version == searchschema.SchemaVersion
}

func readMeta(dir string) (indexMeta, error) {
	var meta indexMeta
	data, err := os.ReadFile(filepath.Join(dir, metaFileName))
	if err != nil {
		return meta, err
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return indexMeta{}, err
	}
	return meta, nil
}

// NeedsFullBuild reports whether dir holds an index that a complete build has
// already finished for the current schema version. A missing index, one written
// by an older schema, and one that was opened but never filled all report true.
func NeedsFullBuild(dir string) bool {
	meta, err := readMeta(dir)
	if err != nil {
		return true
	}
	return meta.Version != searchschema.SchemaVersion || meta.LastFullBuild == ""
}

func (i *Indexer) writeMeta() error {
	count, err := i.index.DocCount()
	if err != nil {
		return err
	}
	// Carry the full-build marker across opens: opening an index is not the
	// same as building it, and losing the marker would re-index on every start.
	last_full_build := ""
	if meta, err := readMeta(i.dir); err == nil {
		last_full_build = meta.LastFullBuild
	}
	return i.writeMetaWith(count, last_full_build)
}

func (i *Indexer) writeMetaWith(count uint64, last_full_build string) error {
	meta := indexMeta{
		Version:       searchschema.SchemaVersion,
		Documents:     count,
		LastFullBuild: last_full_build,
		LastUpdated:   time.Now().UTC().Format(time.RFC3339),
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(i.dir, metaFileName), data, 0o644)
}

// MarkFullBuild records that a complete walk of the vault has been mirrored into
// the index. Until this is called the index is considered unbuilt, so a failed
// or interrupted build is retried on the next vault open.
func (i *Indexer) MarkFullBuild() error {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	count, err := i.index.DocCount()
	if err != nil {
		return err
	}
	return i.writeMetaWith(count, time.Now().UTC().Format(time.RFC3339))
}

// Close releases the index. It is safe to call more than once.
func (i *Indexer) Close() error {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return nil
	}
	err := i.writeMeta()
	if closeErr := i.index.Close(); err == nil {
		err = closeErr
	}
	i.index = nil
	return err
}

// Upsert indexes documents by their deterministic ID, replacing any previous
// version.
func (i *Indexer) Upsert(docs ...Document) error {
	if len(docs) == 0 {
		return nil
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	return i.indexDocs(docs)
}

// Delete removes documents by ID. Unknown IDs are ignored.
func (i *Indexer) Delete(ids ...string) error {
	if len(ids) == 0 {
		return nil
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	batch := i.index.NewBatch()
	for _, id := range ids {
		if id == "" {
			continue
		}
		batch.Delete(id)
	}
	return i.index.Batch(batch)
}

// DeleteByPrefix removes every document whose ID starts with prefix. It is used
// to drop a memo's or comment's derived todo documents when the parent goes
// away.
func (i *Indexer) DeleteByPrefix(prefix string) error {
	if prefix == "" {
		return nil
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	return i.deleteByPrefixLocked(prefix)
}

// ReplaceSource atomically drops the derived todo documents of one source (all
// IDs under todoPrefix) and upserts the source's current documents. Replacing
// rather than accumulating is what keeps a todo that disappeared from a memo —
// or one whose line moved — out of the index.
func (i *Indexer) ReplaceSource(todoPrefix string, docs ...Document) error {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	if todoPrefix != "" {
		if err := i.deleteByPrefixLocked(todoPrefix); err != nil {
			return err
		}
	}
	if len(docs) == 0 {
		return nil
	}
	return i.indexDocs(docs)
}

// DeleteSource drops a source's own document together with every derived todo
// document.
func (i *Indexer) DeleteSource(todoPrefix string, docIDs ...string) error {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.index == nil {
		return ErrClosed
	}
	batch := i.index.NewBatch()
	for _, id := range docIDs {
		if id != "" {
			batch.Delete(id)
		}
	}
	if err := i.index.Batch(batch); err != nil {
		return err
	}
	if todoPrefix == "" {
		return nil
	}
	return i.deleteByPrefixLocked(todoPrefix)
}

func (i *Indexer) deleteByPrefixLocked(prefix string) error {
	q := bleve.NewPrefixQuery(prefix)
	q.SetField("_id")
	for {
		req := bleve.NewSearchRequest(q)
		req.Size = deleteBatchSize
		result, err := i.index.Search(req)
		if err != nil {
			return err
		}
		if len(result.Hits) == 0 {
			return nil
		}
		batch := i.index.NewBatch()
		for _, hit := range result.Hits {
			batch.Delete(hit.ID)
		}
		if err := i.index.Batch(batch); err != nil {
			return err
		}
		if len(result.Hits) < deleteBatchSize {
			return nil
		}
	}
}

func (i *Indexer) indexDocs(docs []Document) error {
	batch := i.index.NewBatch()
	for _, doc := range docs {
		if doc.ID == "" {
			continue
		}
		if err := batch.Index(doc.ID, doc.fields()); err != nil {
			return err
		}
	}
	return i.index.Batch(batch)
}

// Search runs a query, returning server-highlighted hits and facet counts.
func (i *Indexer) Search(request SearchRequest) (Results, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()
	if i.index == nil {
		return Results{}, ErrClosed
	}

	expression := querybuilder.ParseSearch(request.Query)
	sortValue := request.Sort
	if expression.HasSort {
		sortValue = expression.Sort
	}
	sortDefinition := searchschema.Sort(sortValue)

	limit := request.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	page := request.Page
	if page < 1 {
		page = 1
	}

	searchRequest := bleve.NewSearchRequestOptions(
		querybuilder.Build(expression.Text), limit, (page-1)*limit, false)
	searchRequest.Fields = storedFields
	searchRequest.Highlight = bleve.NewHighlight()
	searchRequest.Highlight.Fields = highlightedFields
	searchRequest.SortBy(sortDefinition.Fields)
	addFacets(searchRequest)

	result, err := i.index.Search(searchRequest)
	if err != nil {
		return Results{}, err
	}

	results := Results{
		Hits:   make([]Hit, 0, len(result.Hits)),
		Total:  int(result.Total),
		Facets: facetResults(result.Facets),
		Sort:   sortDefinition.Value,
	}
	for _, match := range result.Hits {
		results.Hits = append(results.Hits, hitFromMatch(match))
	}
	return results, nil
}

// Count reports the number of indexed documents.
func (i *Indexer) Count() (uint64, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()
	if i.index == nil {
		return 0, ErrClosed
	}
	return i.index.DocCount()
}

func addFacets(request *bleve.SearchRequest) {
	for _, definition := range searchschema.Facets() {
		field, ok := searchschema.Field(definition.QueryField)
		if !ok {
			continue
		}
		size := definition.DefaultSize
		if size <= 0 {
			size = 10
		}
		request.AddFacet(definition.Name, bleve.NewFacetRequest(field.IndexField, size))
	}
}

func facetResults(facets search.FacetResults) []Facet {
	if len(facets) == 0 {
		return nil
	}
	out := make([]Facet, 0, len(facets))
	for _, definition := range searchschema.Facets() {
		result, ok := facets[definition.Name]
		if !ok || result == nil {
			continue
		}
		buckets := make([]FacetBucket, 0, len(result.Terms.Terms()))
		for _, term := range result.Terms.Terms() {
			buckets = append(buckets, FacetBucket{Value: term.Term, Count: term.Count})
		}
		out = append(out, Facet{Name: definition.Name, Buckets: buckets})
	}
	return out
}
