package service

import (
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// HistoryFile is a single .history.json file stored alongside the memo/comment .md file.
// It contains the base content and all version entries with CRDT-style contentOps.
type HistoryFile struct {
	Base     string                `json:"base"`
	Versions []HistoryVersionEntry `json:"versions"`
}

// HistoryVersionEntry describes a single version in the history.
type HistoryVersionEntry struct {
	Version       int         `json:"version"`
	Timestamp     string      `json:"timestamp"`
	ChangedFields []string    `json:"changedFields"`
	ContentOps    []ContentOp `json:"contentOps,omitempty"`
}

// memoHistoryPath returns the .history.json path for a memo .md file.
func memoHistoryPath(memoMdPath string) string {
	ext := filepath.Ext(memoMdPath)
	return memoMdPath[:len(memoMdPath)-len(ext)] + ".history.json"
}

// commentHistoryPath returns the .history.json path for a comment .md file.
func commentHistoryPath(commentMdPath string) string {
	ext := filepath.Ext(commentMdPath)
	return commentMdPath[:len(commentMdPath)-len(ext)] + ".history.json"
}

// saveHistoryBase creates a new .history.json with the initial base content.
func saveHistoryBase(ctx *VaultContext, historyPath string, markdown string) {
	_, content := parseMemoMarkdown(markdown)
	content = normalizeMemoContent(content)
	hf := HistoryFile{
		Base:     content,
		Versions: []HistoryVersionEntry{},
	}
	if err := writeHistoryFile(ctx, historyPath, hf); err != nil {
		log.Printf("history: failed to write %s: %v", historyPath, err)
	}
}

// saveHistoryDiff computes CRDT-style contentOps between old and new markdown,
// appends a version entry to the history file. Best-effort: failures are logged.
func saveHistoryDiff(ctx *VaultContext, historyPath string, oldMarkdown, newMarkdown string, changedFields []string) {
	// Extract plain content from YAML-wrapped markdown
	_, oldContent := parseMemoMarkdown(oldMarkdown)
	_, newContent := parseMemoMarkdown(newMarkdown)
	oldContent = normalizeMemoContent(oldContent)
	newContent = normalizeMemoContent(newContent)

	hf, err := loadHistoryFile(ctx, historyPath)
	if err != nil {
		log.Printf("history: failed to load %s: %v", historyPath, err)
		return
	}

	// If this is the first version (no .history.json yet), seed the base with the old content.
	if hf.Base == "" && len(hf.Versions) == 0 {
		hf.Base = oldContent
	}

	// Reconstruct the state before this edit, then compute ops to the new content.
	prevContent := applyContentOps(hf.Base, collectContentOps(hf.Versions))
	contentOps := computeContentOps(prevContent, newContent)

	if len(contentOps) == 0 && len(changedFields) == 0 {
		return
	}

	version := len(hf.Versions) + 1

	entry := HistoryVersionEntry{
		Version:       version,
		Timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
		ChangedFields: changedFields,
		ContentOps:    contentOps,
	}
	if entry.ChangedFields == nil {
		entry.ChangedFields = []string{}
	}
	if entry.ContentOps == nil {
		entry.ContentOps = []ContentOp{}
	}
	hf.Versions = append(hf.Versions, entry)

	if err := writeHistoryFile(ctx, historyPath, hf); err != nil {
		log.Printf("history: failed to write %s: %v", historyPath, err)
	}
}

// collectContentOps extracts ContentOps slices from versions in order.
func collectContentOps(versions []HistoryVersionEntry) [][]ContentOp {
	opsList := make([][]ContentOp, 0, len(versions))
	for _, v := range versions {
		opsList = append(opsList, v.ContentOps)
	}
	return opsList
}

// loadHistoryFile reads a .history.json file.
func loadHistoryFile(ctx *VaultContext, path string) (HistoryFile, error) {
	hf := HistoryFile{Versions: []HistoryVersionEntry{}}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return hf, err
	}
	raw, err := workspace_fs.read_file(path)
	if err != nil {
		if is_vault_file_not_exist(err) {
			return hf, nil
		}
		return hf, err
	}
	if err := json.Unmarshal(raw, &hf); err != nil {
		return hf, err
	}
	if hf.Versions == nil {
		hf.Versions = []HistoryVersionEntry{}
	}
	return hf, nil
}

func writeHistoryFile(ctx *VaultContext, path string, hf HistoryFile) error {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(hf, "", "  ")
	if err != nil {
		return err
	}
	return workspace_fs.write_file_atomic(path, raw, 0644)
}

// rebuildHistoryVersion reconstructs the plain content at the given version
// by replaying contentOps from the base snapshot.
// Version 0 returns the base content. Version N replays ops for versions 1..N.
func rebuildHistoryVersion(ctx *VaultContext, historyPath string, version int) (string, error) {
	if version < 0 {
		return "", fmt.Errorf("version must be >= 0")
	}

	hf, err := loadHistoryFile(ctx, historyPath)
	if err != nil {
		return "", fmt.Errorf("history file not found: %w", err)
	}

	if version == 0 {
		return hf.Base, nil
	}

	if version > len(hf.Versions) {
		return "", fmt.Errorf("version %d not found (max %d)", version, len(hf.Versions))
	}

	opsList := make([][]ContentOp, 0, version)
	for i := 1; i <= version; i++ {
		opsList = append(opsList, hf.Versions[i-1].ContentOps)
	}

	return applyContentOps(hf.Base, opsList), nil
}

// deleteHistoryFile removes the .history.json file for a record.
func deleteHistoryFile(ctx *VaultContext, historyPath string) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		log.Printf("history: failed to open vault filesystem: %v", err)
		return
	}
	if err := workspace_fs.remove_file(historyPath); err != nil && !is_vault_file_not_exist(err) {
		log.Printf("history: failed to delete %s: %v", historyPath, err)
	}
}

// changedFieldsForMemoUpdate returns the list of field names that were set in the request.
func changedFieldsForMemoUpdate(req MemoUpdateRequest) []string {
	fields := make([]string, 0)
	if req.Content != nil {
		fields = append(fields, "content")
	}
	if req.Visibility != nil {
		fields = append(fields, "visibility")
	}
	if req.Private != nil {
		fields = append(fields, "private")
	}
	if req.Pinned != nil {
		fields = append(fields, "pinned")
	}
	if req.Archived != nil {
		fields = append(fields, "archived")
	}
	if req.ProjectID != nil {
		fields = append(fields, "projectId")
	}
	if req.Kind != nil {
		fields = append(fields, "kind")
	}
	if req.TaskID != nil {
		fields = append(fields, "taskId")
	}
	if req.Reactions != nil {
		fields = append(fields, "reactions")
	}
	return fields
}

// changedFieldsForCommentUpdate returns the list of field names that were set in the request.
func changedFieldsForCommentUpdate(req MemoCommentUpdateRequest) []string {
	fields := make([]string, 0)
	if req.Content != nil {
		fields = append(fields, "content")
	}
	if req.Visibility != nil {
		fields = append(fields, "visibility")
	}
	if req.Private != nil {
		fields = append(fields, "private")
	}
	return fields
}

func historyVersionFromQuery(value string) (int, error) {
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	v, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("invalid version: %s", value)
	}
	if v < 0 {
		return 0, fmt.Errorf("version must be >= 0")
	}
	return v, nil
}
