package desktopapp

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type MemoRecord struct {
	Archived   bool     `json:"archived"`
	Content    string   `json:"content"`
	CreatedAt  string   `json:"createdAt"`
	ID         string   `json:"id"`
	Kind       string   `json:"kind,omitempty"`
	Locations  []string `json:"locations,omitempty"`
	Path       string   `json:"path"`
	Pinned     bool     `json:"pinned"`
	Private    bool     `json:"private"`
	ProjectID  string   `json:"projectId,omitempty"`
	Reactions  []string `json:"reactions"`
	References []string `json:"references"`
	Tags       []string `json:"tags"`
	TaskID     string   `json:"taskId,omitempty"`
	UpdatedAt  string   `json:"updatedAt"`
	Visibility string   `json:"visibility"`
}

type MemoCreateRequest struct {
	Content    string `json:"content"`
	CreatedAt  string `json:"createdAt,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Private    bool   `json:"private"`
	ProjectID  string `json:"projectId,omitempty"`
	TaskID     string `json:"taskId,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	Visibility string `json:"visibility"`
}

type MemoUpdateRequest struct {
	Archived   *bool     `json:"archived"`
	Content    *string   `json:"content"`
	CreatedAt  *string   `json:"createdAt"`
	ID         string    `json:"id"`
	Kind       *string   `json:"kind,omitempty"`
	Pinned     *bool     `json:"pinned"`
	Private    *bool     `json:"private"`
	ProjectID  *string   `json:"projectId,omitempty"`
	Reactions  *[]string `json:"reactions"`
	TaskID     *string   `json:"taskId,omitempty"`
	UpdatedAt  *string   `json:"updatedAt"`
	Visibility *string   `json:"visibility"`
}

type MemoDeleteRequest struct {
	CleanupAssets *bool  `json:"cleanupAssets"`
	DeleteTasks   *bool  `json:"deleteTasks"`
	ID            string `json:"id"`
}

type MemoDeleteResult struct {
	AssetErrors   []string `json:"assetErrors,omitempty"`
	AssetsDeleted int      `json:"assetsDeleted"`
	AssetsSkipped int      `json:"assetsSkipped"`
	TasksDeleted  int      `json:"tasksDeleted"`
}

type MemoDeleteOptions struct {
	CleanupAssets   bool
	DeleteTasks     bool
	Parent          context.Context
	StorageSettings json.RawMessage
	StorePath       string
}

func listVaultMemos(ctx *VaultContext) ([]MemoRecord, error) {
	memos := []MemoRecord{}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return nil, err
	}
	if err := workspace_fs.walk_dir(vaultMemoDirName, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		memo, err := readMemoFile(ctx, path)
		if err != nil {
			return err
		}
		memos = append(memos, memo)
		return nil
	}); err != nil {
		return nil, err
	}
	sort.SliceStable(memos, func(i, j int) bool {
		left := memoSortTime(memos[i])
		right := memoSortTime(memos[j])
		if left.Equal(right) {
			return memos[i].ID > memos[j].ID
		}
		return left.After(right)
	})
	return memos, nil
}

func createVaultMemo(ctx *VaultContext, req MemoCreateRequest) (MemoRecord, error) {
	content := normalizeMemoContent(req.Content)
	if strings.TrimSpace(content) == "" {
		return MemoRecord{}, fmt.Errorf("memo content is required")
	}
	projectID, err := validateMemoProjectID(ctx, req.ProjectID)
	if err != nil {
		return MemoRecord{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	createdAt := now
	if strings.TrimSpace(req.CreatedAt) != "" {
		createdAt = strings.TrimSpace(req.CreatedAt)
	}
	updatedAt := ""
	if strings.TrimSpace(req.UpdatedAt) != "" {
		updatedAt = strings.TrimSpace(req.UpdatedAt)
	}
	kind := strings.TrimSpace(req.Kind)
	taskID := strings.TrimSpace(req.TaskID)
	memo := MemoRecord{
		Archived:   false,
		Content:    content,
		CreatedAt:  createdAt,
		ID:         newMemoID(),
		Kind:       kind,
		Pinned:     false,
		Private:    req.Private,
		ProjectID:  projectID,
		TaskID:     taskID,
		UpdatedAt:  updatedAt,
		Visibility: normalizeMemoVisibility(req.Visibility),
	}
	memo.Path = memoRelativePath(memo)
	originalTags := extractMemoTags(memo.Content)
	if err := syncMemoTaskLines(ctx, &memo); err != nil {
		return MemoRecord{}, err
	}
	memo.Tags = uniqueStrings(append(extractMemoTags(memo.Content), originalTags...))
	memo.References = extractMemoReferences(memo.Content)
	memo.Locations = extractMemoLocations(memo.Content)
	if err := writeMemoRecord(ctx, memo); err != nil {
		return MemoRecord{}, err
	}
	saveHistoryBase(ctx, memoHistoryPath(memo.Path), renderMemoMarkdownFile(memo))
	fireMemoHooks(ctx, "memo.created", memo)
	return memo, nil
}

func updateVaultMemo(ctx *VaultContext, req MemoUpdateRequest) (MemoRecord, error) {
	id := strings.TrimSpace(req.ID)
	if id == "" {
		return MemoRecord{}, fmt.Errorf("memo id is required")
	}
	path, err := findMemoFilePath(ctx, id)
	if err != nil {
		return MemoRecord{}, err
	}
	memo, err := readMemoFile(ctx, path)
	if err != nil {
		return MemoRecord{}, err
	}
	oldMarkdown := renderMemoMarkdownFile(memo)
	if req.Content != nil {
		content := normalizeMemoContent(*req.Content)
		if strings.TrimSpace(content) == "" {
			return MemoRecord{}, fmt.Errorf("memo content is required")
		}
		memo.Content = content
	}
	if req.CreatedAt != nil {
		createdAt := strings.TrimSpace(*req.CreatedAt)
		if createdAt == "" {
			return MemoRecord{}, fmt.Errorf("memo createdAt is required")
		}
		if parseMemoTime(createdAt).IsZero() {
			return MemoRecord{}, fmt.Errorf("memo createdAt must be RFC3339")
		}
		memo.CreatedAt = createdAt
	}
	if req.Visibility != nil {
		memo.Visibility = normalizeMemoVisibility(*req.Visibility)
	}
	if req.Private != nil {
		memo.Private = *req.Private
	}
	if req.Pinned != nil {
		memo.Pinned = *req.Pinned
	}
	if req.Archived != nil {
		memo.Archived = *req.Archived
	}
	if req.ProjectID != nil {
		projectID, err := validateMemoProjectID(ctx, *req.ProjectID)
		if err != nil {
			return MemoRecord{}, err
		}
		memo.ProjectID = projectID
	}
	if req.Kind != nil {
		memo.Kind = strings.TrimSpace(*req.Kind)
	}
	if req.TaskID != nil {
		memo.TaskID = sanitizeTaskID(*req.TaskID)
	}
	if req.Reactions != nil {
		memo.Reactions = uniqueStrings(*req.Reactions)
	}
	if req.UpdatedAt != nil {
		updatedAt := strings.TrimSpace(*req.UpdatedAt)
		if updatedAt != "" && parseMemoTime(updatedAt).IsZero() {
			return MemoRecord{}, fmt.Errorf("memo updatedAt must be RFC3339")
		}
		memo.UpdatedAt = updatedAt
	} else if shouldTouchMemoUpdatedAt(req) {
		memo.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	memo.Path = relativeVaultPath(ctx, path)
	originalTags := extractMemoTags(memo.Content)
	if err := syncMemoTaskLines(ctx, &memo); err != nil {
		return MemoRecord{}, err
	}
	memo.Tags = uniqueStrings(append(extractMemoTags(memo.Content), originalTags...))
	memo.References = extractMemoReferences(memo.Content)
	memo.Locations = extractMemoLocations(memo.Content)
	if err := writeMemoRecord(ctx, memo); err != nil {
		return MemoRecord{}, err
	}
	changedFields := changedFieldsForMemoUpdate(req)
	saveHistoryDiff(ctx, memoHistoryPath(path), oldMarkdown, renderMemoMarkdownFile(memo), changedFields)
	fireMemoHooks(ctx, "memo.updated", memo)
	return memo, nil
}

func shouldTouchMemoUpdatedAt(req MemoUpdateRequest) bool {
	return req.Content != nil ||
		req.Visibility != nil ||
		req.Private != nil ||
		req.Pinned != nil ||
		req.Archived != nil ||
		req.ProjectID != nil
}

func deleteVaultMemo(ctx *VaultContext, id string) error {
	_, err := deleteVaultMemoWithOptions(ctx, id, MemoDeleteOptions{})
	return err
}

func deleteVaultMemoWithAssets(parent context.Context, ctx *VaultContext, id string, storageSettings json.RawMessage, storePath string) (MemoDeleteResult, error) {
	return deleteVaultMemoWithOptions(ctx, id, MemoDeleteOptions{
		CleanupAssets:   true,
		Parent:          parent,
		StorageSettings: storageSettings,
		StorePath:       storePath,
	})
}

func deleteVaultMemoWithOptions(ctx *VaultContext, id string, options MemoDeleteOptions) (MemoDeleteResult, error) {
	result := MemoDeleteResult{}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return result, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return result, fmt.Errorf("memo id is required")
	}
	path, err := findMemoFilePath(ctx, id)
	if err != nil {
		return result, err
	}
	memo, err := readMemoFile(ctx, path)
	if err != nil {
		return result, err
	}
	comments, err := listVaultMemoComments(ctx, memo.ID)
	if err != nil {
		return result, err
	}

	assetsToDelete := []memoAssetReference{}
	if options.CleanupAssets {
		assets := extractMemoAssetReferences(memo.Content)
		for _, comment := range comments {
			assets = append(assets, extractMemoAssetReferences(comment.Content)...)
		}
		if len(assets) > 0 {
			excludedComments := map[string]bool{}
			for _, comment := range comments {
				excludedComments[comment.ID] = true
			}
			shared, err := memoAssetReferencesOutside(ctx, map[string]bool{memo.ID: true}, excludedComments)
			if err != nil {
				return result, err
			}
			for _, asset := range assets {
				if shared[memoAssetReferenceID(asset)] {
					result.AssetsSkipped++
					continue
				}
				assetsToDelete = appendMemoAssetReference(assetsToDelete, asset)
			}
		}
	}

	if options.DeleteTasks {
		deleted, err := deleteVaultTasksForMemo(ctx, memo.ID)
		if err != nil {
			return result, err
		}
		result.TasksDeleted = deleted
	}

	fireMemoHooks(ctx, "memo.deleted", memo)

	if err := workspace_fs.remove_file(path); err != nil {
		return result, err
	}
	for _, comment := range comments {
		if err := workspace_fs.remove_file(comment.Path); err != nil && !is_vault_file_not_exist(err) {
			return result, err
		}
	}

	deleteHistoryFile(ctx, memoHistoryPath(path))
	for _, comment := range comments {
		deleteHistoryFile(ctx, commentHistoryPath(comment.Path))
	}

	if len(assetsToDelete) > 0 {
		cleanup := deleteMemoAssetReferences(options.Parent, options.StorageSettings, options.StorePath, assetsToDelete)
		result.AssetsDeleted += cleanup.AssetsDeleted
		result.AssetsSkipped += cleanup.AssetsSkipped
		result.AssetErrors = append(result.AssetErrors, cleanup.AssetErrors...)
	}
	return result, nil
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool)
	next := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		next = append(next, value)
	}
	return next
}

func normalizeMemoVisibility(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "PUBLIC":
		return "PUBLIC"
	case "PROTECTED":
		return "PROTECTED"
	default:
		return "PRIVATE"
	}
}

func newMemoID() string {
	return "memo_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}
