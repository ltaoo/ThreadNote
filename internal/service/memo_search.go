package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"example/simple/internal/search"
)

// SearchIndexDir returns the Bleve index directory for a vault. It sits next to
// the SQLite memo index in .velo and is machine-local, derived data.
func SearchIndexDir(vault_ctx *VaultContext) string {
	return filepath.Join(vault_ctx.VeloDir, search.IndexDirName)
}

// search_index_slot owns the open Bleve handle for one index directory plus the
// locks that guard it.
//
// The handle is keyed by directory rather than stored on a VaultContext because
// request handlers work on snapshot copies of the active context (see
// activeVaultSnapshot): a handle cached on a copy would be invisible to the next
// request, and each request would open — and leak — another index on the same
// directory. Resolving by directory also keeps a rebuild triggered through a
// snapshot from stranding the live context with a closed handle.
type search_index_slot struct {
	// mutex guards indexer. It is only ever held for short open/close work so
	// queries are not blocked behind a build.
	mutex sync.Mutex
	// build_mutex serializes full builds of this directory, so the background
	// build at vault open cannot interleave with the settings rebuild button.
	build_mutex sync.Mutex
	dir         string
	indexer     *search.Indexer
}

var search_index_slots = struct {
	sync.Mutex
	by_dir map[string]*search_index_slot
}{by_dir: map[string]*search_index_slot{}}

func search_index_slot_for(vault_ctx *VaultContext) *search_index_slot {
	dir := SearchIndexDir(vault_ctx)
	search_index_slots.Lock()
	defer search_index_slots.Unlock()
	slot := search_index_slots.by_dir[dir]
	if slot == nil {
		slot = &search_index_slot{dir: dir}
		search_index_slots.by_dir[dir] = slot
	}
	return slot
}

func (slot *search_index_slot) open_locked() (*search.Indexer, error) {
	if slot.indexer != nil {
		return slot.indexer, nil
	}
	indexer, err := search.Open(slot.dir)
	if err != nil {
		return nil, err
	}
	slot.indexer = indexer
	return indexer, nil
}

func (slot *search_index_slot) close_locked() {
	if slot.indexer == nil {
		return
	}
	_ = slot.indexer.Close()
	slot.indexer = nil
}

func (slot *search_index_slot) reset_locked() error {
	slot.close_locked()
	if err := os.RemoveAll(slot.dir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove search index: %w", err)
	}
	return nil
}

// open_vault_search_index opens the vault's Bleve index, reusing the handle the
// slot already holds when possible.
func open_vault_search_index(vault_ctx *VaultContext) (*search.Indexer, error) {
	if vault_ctx == nil {
		return nil, fmt.Errorf("vault context is required")
	}
	slot := search_index_slot_for(vault_ctx)
	slot.mutex.Lock()
	defer slot.mutex.Unlock()
	indexer, err := slot.open_locked()
	if err != nil {
		return nil, err
	}
	return indexer, nil
}

// cached_search_index returns the open index without creating one. Callers that
// only want to mirror writes use this so that a vault whose index has not been
// opened (or was discarded after an error) does not pay for building one.
func cached_search_index(vault_ctx *VaultContext) *search.Indexer {
	if vault_ctx == nil {
		return nil
	}
	slot := search_index_slot_for(vault_ctx)
	slot.mutex.Lock()
	defer slot.mutex.Unlock()
	return slot.indexer
}

// close_vault_search_index releases the index handle. It is safe to call when
// no index is open.
func close_vault_search_index(vault_ctx *VaultContext) {
	if vault_ctx == nil {
		return
	}
	slot := search_index_slot_for(vault_ctx)
	slot.mutex.Lock()
	defer slot.mutex.Unlock()
	slot.close_locked()
}

// reset_vault_search_index deletes the index directory so the next open rebuilds
// it from the vault. The index only holds derived data, so this is always safe.
func reset_vault_search_index(vault_ctx *VaultContext) error {
	if vault_ctx == nil {
		return fmt.Errorf("vault context is required")
	}
	slot := search_index_slot_for(vault_ctx)
	slot.mutex.Lock()
	defer slot.mutex.Unlock()
	return slot.reset_locked()
}

// search_build_batch_size bounds how many documents are handed to Bleve at
// once during a full build.
const search_build_batch_size = 500

// search_index_needs_build reports whether the vault's index has never been
// fully built for the current schema version.
func search_index_needs_build(vault_ctx *VaultContext) bool {
	if vault_ctx == nil {
		return false
	}
	return search.NeedsFullBuild(SearchIndexDir(vault_ctx))
}

// build_vault_search_index mirrors the whole vault into the search index. This
// is the only path that builds it: a search never does, so an unbuilt index
// simply returns no results until the vault is opened or the user rebuilds it.
//
// force drops whatever is already on disk first, which is what the settings
// "rebuild index" action asks for; without it an index that a previous build
// already completed is left alone.
func build_vault_search_index(call_ctx context.Context, vault_ctx *VaultContext, force bool) error {
	if vault_ctx == nil {
		return fmt.Errorf("vault context is required")
	}
	slot := search_index_slot_for(vault_ctx)
	slot.build_mutex.Lock()
	defer slot.build_mutex.Unlock()

	slot.mutex.Lock()
	if !force && !search.NeedsFullBuild(slot.dir) {
		slot.mutex.Unlock()
		return nil
	}
	if force {
		if err := slot.reset_locked(); err != nil {
			slot.mutex.Unlock()
			return err
		}
	}
	indexer, err := slot.open_locked()
	slot.mutex.Unlock()
	if err != nil {
		return err
	}

	memos, err := listVaultMemos(vault_ctx)
	if err != nil {
		return fmt.Errorf("scan memos for search index: %w", err)
	}
	documents := make([]search.Document, 0, len(memos))
	parents := make(map[string]MemoRecord, len(memos))
	for _, memo := range memos {
		parents[memo.ID] = memo
		documents = append(documents, search_memo_documents(memo)...)
	}

	comments, err := listVaultMemoComments(vault_ctx, "")
	if err != nil {
		return fmt.Errorf("scan comments for search index: %w", err)
	}
	for _, comment := range comments {
		parent, found := parents[comment.MemoID]
		if !found {
			// A comment whose parent is gone has no searchable identity.
			continue
		}
		documents = append(documents, search_comment_documents(comment, parent)...)
	}

	for start := 0; start < len(documents); start += search_build_batch_size {
		end := start + search_build_batch_size
		if end > len(documents) {
			end = len(documents)
		}
		if err := indexer.Upsert(documents[start:end]...); err != nil {
			return err
		}
	}
	return indexer.MarkFullBuild()
}

// start_vault_search_index_build builds the index in the background when a vault
// is opened. Building must never block or fail the open itself: the index is
// derived data and a failed build is simply retried on the next open.
func start_vault_search_index_build(vault_ctx *VaultContext) {
	if vault_ctx == nil || !search_index_needs_build(vault_ctx) {
		return
	}
	go func() {
		if err := build_vault_search_index(context.Background(), vault_ctx, false); err != nil {
			log_search_index_error(vault_ctx, err)
		}
	}()
}

// search_vault runs a query against the vault's index. It opens the index if it
// is not open yet, but it never builds one: an unbuilt index returns no results
// rather than blocking the query behind a full vault walk.
func search_vault(vault_ctx *VaultContext, request search.SearchRequest) (search.Results, error) {
	indexer, err := open_vault_search_index(vault_ctx)
	if err != nil {
		return search.Results{}, err
	}
	return indexer.Search(request)
}

// search_index_status reports how many documents the index holds, for
// diagnostics and the capabilities endpoint.
func search_index_status(vault_ctx *VaultContext) (uint64, error) {
	indexer, err := open_vault_search_index(vault_ctx)
	if err != nil {
		return 0, err
	}
	return indexer.Count()
}

// replace_search_source mirrors one memo or comment into the index, replacing
// its previously derived todos so that removed or moved task lines cannot
// linger as stale results.
func replace_search_source(vault_ctx *VaultContext, todo_prefix string, documents []search.Document) {
	indexer := cached_search_index(vault_ctx)
	if indexer == nil {
		return
	}
	if err := indexer.ReplaceSource(todo_prefix, documents...); err != nil {
		log_search_index_error(vault_ctx, err)
	}
}

// delete_search_source drops one memo or comment and its derived todos.
func delete_search_source(vault_ctx *VaultContext, todo_prefix string, document_ids ...string) {
	indexer := cached_search_index(vault_ctx)
	if indexer == nil {
		return
	}
	if err := indexer.DeleteSource(todo_prefix, document_ids...); err != nil {
		log_search_index_error(vault_ctx, err)
	}
}

func log_search_index_error(vault_ctx *VaultContext, err error) {
	if vault_ctx == nil || vault_ctx.logger == nil {
		return
	}
	vault_ctx.logger.Error().Err(err).Str("component", "memo_search").Msg("search index update failed")
}
