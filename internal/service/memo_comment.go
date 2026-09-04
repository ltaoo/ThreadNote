package service

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type MemoCommentRecord struct {
	Content    string   `json:"content"`
	CreatedAt  string   `json:"createdAt"`
	ID         string   `json:"id"`
	MemoID     string   `json:"memoId"`
	Path       string   `json:"path"`
	Private    bool     `json:"private"`
	References []string `json:"references"`
	ReplyTo    string   `json:"replyTo"`
	Tags       []string `json:"tags"`
	UpdatedAt  string   `json:"updatedAt"`
	Visibility string   `json:"visibility"`
}

type MemoCommentCreateRequest struct {
	Content    string `json:"content"`
	MemoID     string `json:"memoId"`
	Private    bool   `json:"private"`
	ReplyTo    string `json:"replyTo"`
	Visibility string `json:"visibility"`
}

type MemoCommentUpdateRequest struct {
	Content    *string `json:"content"`
	ID         string  `json:"id"`
	Private    *bool   `json:"private"`
	Visibility *string `json:"visibility"`
}

type MemoCommentDeleteRequest struct {
	CleanupAssets *bool  `json:"cleanupAssets"`
	ID            string `json:"id"`
}

func listVaultMemoComments(ctx *VaultContext, memoID string) ([]MemoCommentRecord, error) {
	targetMemoID := strings.TrimSpace(memoID)
	if targetMemoID != "" {
		if _, err := findMemoFilePath(ctx, targetMemoID); err != nil {
			return nil, err
		}
	}

	comments := []MemoCommentRecord{}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return nil, err
	}
	if err := workspace_fs.walk_dir(vaultMemoCommentDirName, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		comment, err := readMemoCommentFile(ctx, path)
		if err != nil {
			if targetMemoID == "" {
				return nil
			}
			return err
		}
		if strings.TrimSpace(comment.MemoID) == "" {
			return nil
		}
		if targetMemoID != "" && comment.MemoID != targetMemoID {
			return nil
		}
		comments = append(comments, comment)
		return nil
	}); err != nil {
		if is_vault_file_not_exist(err) {
			return []MemoCommentRecord{}, nil
		}
		return nil, err
	}
	sortMemoComments(comments)
	return comments, nil
}

func createVaultMemoComment(ctx *VaultContext, req MemoCommentCreateRequest) (MemoCommentRecord, error) {
	memoID := strings.TrimSpace(req.MemoID)
	if memoID == "" {
		return MemoCommentRecord{}, fmt.Errorf("memo id is required")
	}
	memoPath, err := findMemoFilePath(ctx, memoID)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	memo, err := readMemoFile(ctx, memoPath)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	content := normalizeMemoContent(req.Content)
	if strings.TrimSpace(content) == "" {
		return MemoCommentRecord{}, fmt.Errorf("comment content is required")
	}

	replyTo := strings.TrimSpace(req.ReplyTo)
	if replyTo != "" {
		parentPath, ferr := findMemoCommentFilePath(ctx, replyTo)
		if ferr != nil {
			return MemoCommentRecord{}, fmt.Errorf("parent comment not found: %s", replyTo)
		}
		parent, rerr := readMemoCommentFile(ctx, parentPath)
		if rerr != nil {
			return MemoCommentRecord{}, fmt.Errorf("cannot read parent comment: %s", replyTo)
		}
		if parent.MemoID != memoID {
			return MemoCommentRecord{}, fmt.Errorf("parent comment belongs to a different memo")
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	comment := MemoCommentRecord{
		Content:    content,
		CreatedAt:  now,
		ID:         newMemoCommentID(),
		MemoID:     memoID,
		Private:    req.Private,
		ReplyTo:    replyTo,
		UpdatedAt:  "",
		Visibility: normalizeMemoVisibility(req.Visibility),
	}
	comment.Path = memoCommentRelativePath(comment)
	originalTags := extractMemoTags(comment.Content)
	if err := syncMemoCommentTaskLines(ctx, &comment, memo); err != nil {
		return MemoCommentRecord{}, err
	}
	comment.Tags = uniqueStrings(append(extractMemoTags(comment.Content), originalTags...))
	comment.References = extractMemoReferences(comment.Content)
	if err := writeMemoCommentRecord(ctx, comment); err != nil {
		return MemoCommentRecord{}, err
	}
	saveHistoryBase(ctx, commentHistoryPath(comment.Path), renderMemoCommentMarkdownFile(comment))
	return comment, nil
}

func updateVaultMemoComment(ctx *VaultContext, req MemoCommentUpdateRequest) (MemoCommentRecord, error) {
	id := strings.TrimSpace(req.ID)
	if id == "" {
		return MemoCommentRecord{}, fmt.Errorf("comment id is required")
	}
	path, err := findMemoCommentFilePath(ctx, id)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	comment, err := readMemoCommentFile(ctx, path)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	oldMarkdown := renderMemoCommentMarkdownFile(comment)
	if req.Content != nil {
		content := normalizeMemoContent(*req.Content)
		if strings.TrimSpace(content) == "" {
			return MemoCommentRecord{}, fmt.Errorf("comment content is required")
		}
		comment.Content = content
	}
	if req.Visibility != nil {
		comment.Visibility = normalizeMemoVisibility(*req.Visibility)
	}
	if req.Private != nil {
		comment.Private = *req.Private
	}
	memoPath, err := findMemoFilePath(ctx, comment.MemoID)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	memo, err := readMemoFile(ctx, memoPath)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	comment.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	comment.Path = relativeVaultPath(ctx, path)
	originalTags := extractMemoTags(comment.Content)
	if err := syncMemoCommentTaskLines(ctx, &comment, memo); err != nil {
		return MemoCommentRecord{}, err
	}
	comment.Tags = uniqueStrings(append(extractMemoTags(comment.Content), originalTags...))
	comment.References = extractMemoReferences(comment.Content)
	if err := writeMemoCommentRecord(ctx, comment); err != nil {
		return MemoCommentRecord{}, err
	}
	changedFields := changedFieldsForCommentUpdate(req)
	saveHistoryDiff(ctx, commentHistoryPath(path), oldMarkdown, renderMemoCommentMarkdownFile(comment), changedFields)
	return comment, nil
}

func deleteVaultMemoCommentWithOptions(ctx *VaultContext, id string, options MemoDeleteOptions) (MemoDeleteResult, error) {
	result := MemoDeleteResult{}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return result, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return result, fmt.Errorf("comment id is required")
	}
	path, err := findMemoCommentFilePath(ctx, id)
	if err != nil {
		return result, err
	}
	comment, err := readMemoCommentFile(ctx, path)
	if err != nil {
		return result, err
	}

	assetsToDelete := []memoAssetReference{}
	if options.CleanupAssets {
		assets := extractMemoAssetReferences(comment.Content)
		if len(assets) > 0 {
			shared, err := memoAssetReferencesOutside(ctx, nil, map[string]bool{comment.ID: true})
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

	if err := workspace_fs.remove_file(path); err != nil {
		return result, err
	}
	deleteHistoryFile(ctx, commentHistoryPath(path))
	if len(assetsToDelete) > 0 {
		cleanup := deleteMemoAssetReferences(options.Parent, options.StorageSettings, options.StorePath, assetsToDelete)
		result.AssetsDeleted += cleanup.AssetsDeleted
		result.AssetsSkipped += cleanup.AssetsSkipped
		result.AssetErrors = append(result.AssetErrors, cleanup.AssetErrors...)
	}
	return result, nil
}

func readMemoCommentFile(ctx *VaultContext, path string) (MemoCommentRecord, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	relative_path, err := workspace_fs.relative_path(path)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	raw, err := workspace_fs.read_file(relative_path)
	if err != nil {
		return MemoCommentRecord{}, err
	}
	info, _ := workspace_fs.stat_file(relative_path)
	meta, content := parseMemoMarkdown(string(raw))
	createdAt := firstNonEmpty(meta["createdAt"], meta["created_at"])
	if createdAt == "" && info != nil {
		createdAt = info.ModTime().UTC().Format(time.RFC3339Nano)
	}
	id := strings.TrimSpace(meta["id"])
	if id == "" {
		id = strings.TrimSuffix(filepath.Base(relative_path), filepath.Ext(relative_path))
	}
	comment := MemoCommentRecord{
		Content:    normalizeStoredMemoContent(content, meta),
		CreatedAt:  createdAt,
		ID:         id,
		MemoID:     strings.TrimSpace(meta["memoId"]),
		Path:       relative_path,
		Private:    parseMemoBool(meta["private"]),
		References: parseMemoList(meta, "references"),
		ReplyTo:    strings.TrimSpace(firstNonEmpty(meta["replyTo"], meta["reply_to"])),
		Tags:       parseMemoList(meta, "tags"),
		UpdatedAt:  firstNonEmpty(meta["updatedAt"], meta["updated_at"]),
		Visibility: normalizeMemoVisibility(firstNonEmpty(meta["visibility"])),
	}
	if comment.MemoID == "" {
		comment.MemoID = memoIDFromCommentPath(ctx, relative_path)
	}
	if len(comment.Tags) == 0 {
		comment.Tags = extractMemoTags(comment.Content)
	}
	if len(comment.References) == 0 {
		comment.References = extractMemoReferences(comment.Content)
	}
	return comment, nil
}

func writeMemoCommentRecord(ctx *VaultContext, comment MemoCommentRecord) error {
	if strings.TrimSpace(comment.ID) == "" {
		return fmt.Errorf("comment id is required")
	}
	if strings.TrimSpace(comment.MemoID) == "" {
		return fmt.Errorf("comment memo id is required")
	}
	if comment.Path == "" {
		comment.Path = memoCommentRelativePath(comment)
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	relative_path, err := workspace_fs.relative_path(comment.Path)
	if err != nil {
		return err
	}
	if relative_path != vaultMemoCommentDirName && !strings.HasPrefix(relative_path, vaultMemoCommentDirName+"/") {
		return fmt.Errorf("comment path must be inside memo comment directory")
	}
	return workspace_fs.write_file_atomic(relative_path, []byte(renderMemoCommentMarkdownFile(comment)), 0644)
}

func renderMemoCommentMarkdownFile(comment MemoCommentRecord) string {
	tags := uniqueStrings(comment.Tags)
	refs := uniqueStrings(comment.References)
	visibility := normalizeMemoVisibility(comment.Visibility)
	lines := []string{
		"---",
		"schemaVersion: " + fmt.Sprintf("%d", vaultSchemaVersion),
		"id: " + yamlQuote(comment.ID),
		"memoId: " + yamlQuote(strings.TrimSpace(comment.MemoID)),
		"createdAt: " + yamlQuote(comment.CreatedAt),
		"updatedAt: " + yamlQuote(comment.UpdatedAt),
		"visibility: " + yamlQuote(visibility),
		"private: " + fmt.Sprintf("%t", comment.Private),
		"replyTo: " + yamlQuote(comment.ReplyTo),
		"contentWhitespace: \"preserve\"",
	}
	if len(tags) == 0 {
		lines = append(lines, "tags: []")
	} else {
		lines = append(lines, "tags:")
		for _, tag := range tags {
			lines = append(lines, "  - "+yamlQuote(tag))
		}
	}
	if len(refs) == 0 {
		lines = append(lines, "references: []")
	} else {
		lines = append(lines, "references:")
		for _, ref := range refs {
			lines = append(lines, "  - "+yamlQuote(ref))
		}
	}
	lines = append(lines, "---")
	return strings.Join(lines, "\n") + "\n" + normalizeMemoContent(comment.Content)
}

func memoCommentRelativePath(comment MemoCommentRecord) string {
	created := parseMemoTime(comment.CreatedAt)
	if created.IsZero() {
		created = time.Now()
	}
	return filepath.ToSlash(filepath.Join(
		vaultMemoCommentDirName,
		sanitizeMemoID(comment.MemoID),
		fmt.Sprintf("%04d", created.Year()),
		fmt.Sprintf("%02d", int(created.Month())),
		sanitizeMemoCommentID(comment.ID)+".md",
	))
}

func findMemoCommentFilePath(ctx *VaultContext, id string) (string, error) {
	targetID := strings.TrimSpace(id)
	var found string
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return "", err
	}
	err = workspace_fs.walk_dir(vaultMemoCommentDirName, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		comment, err := readMemoCommentFile(ctx, path)
		if err != nil {
			return err
		}
		if comment.ID == targetID {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("comment not found: %s", targetID)
	}
	return found, nil
}

func memoIDFromCommentPath(ctx *VaultContext, path string) string {
	relative_path := relativeVaultPath(ctx, path)
	rel, err := filepath.Rel(vaultMemoCommentDirName, filepath.FromSlash(relative_path))
	if err != nil {
		return ""
	}
	parts := strings.Split(filepath.ToSlash(rel), "/")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}

func newMemoCommentID() string {
	return "comment_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}

func sanitizeMemoCommentID(value string) string {
	id := strings.TrimSpace(value)
	if id == "" {
		return newMemoCommentID()
	}
	var b strings.Builder
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	next := strings.Trim(b.String(), "-")
	if next == "" {
		return newMemoCommentID()
	}
	return next
}

func sortMemoComments(comments []MemoCommentRecord) {
	sort.SliceStable(comments, func(i, j int) bool {
		left := parseMemoTime(comments[i].CreatedAt)
		right := parseMemoTime(comments[j].CreatedAt)
		if left.Equal(right) {
			return comments[i].ID > comments[j].ID
		}
		if left.IsZero() {
			return true
		}
		if right.IsZero() {
			return false
		}
		return left.After(right)
	})
}
