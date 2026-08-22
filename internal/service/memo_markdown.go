package service

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"time"
)

func readMemoFile(ctx *VaultContext, path string) (MemoRecord, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return MemoRecord{}, err
	}
	relative_path, err := workspace_fs.relative_path(path)
	if err != nil {
		return MemoRecord{}, err
	}
	raw, err := workspace_fs.read_file(relative_path)
	if err != nil {
		return MemoRecord{}, err
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
	memo := MemoRecord{
		Archived:   parseMemoBool(meta["archived"]),
		Content:    normalizeStoredMemoContent(content, meta),
		CreatedAt:  createdAt,
		ID:         id,
		Kind:       strings.TrimSpace(meta["kind"]),
		Locations:  parseMemoList(meta, "locations"),
		Path:       relative_path,
		Pinned:     parseMemoBool(meta["pinned"]),
		Private:    parseMemoBool(meta["private"]),
		ProjectID:  sanitizeProjectID(meta["projectId"]),
		Reactions:  parseMemoList(meta, "reactions"),
		References: parseMemoList(meta, "references"),
		Tags:       parseMemoList(meta, "tags"),
		TaskID:     sanitizeTaskID(meta["taskId"]),
		UpdatedAt:  firstNonEmpty(meta["updatedAt"], meta["updated_at"]),
		Visibility: normalizeMemoVisibility(meta["visibility"]),
	}
	if len(memo.Tags) == 0 {
		memo.Tags = extractMemoTags(memo.Content)
	}
	if len(memo.References) == 0 {
		memo.References = extractMemoReferences(memo.Content)
	}
	if len(memo.Locations) == 0 {
		memo.Locations = extractMemoLocations(memo.Content)
	}
	return memo, nil
}

func writeMemoRecord(vault_ctx *VaultContext, memo MemoRecord) error {
	if memo.ID == "" {
		return fmt.Errorf("memo id is required")
	}
	if memo.Path == "" {
		memo.Path = memoRelativePath(memo)
	}
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		return err
	}
	relative_path, err := workspace_fs.relative_path(memo.Path)
	if err != nil {
		return err
	}
	if relative_path != vaultMemoDirName && !strings.HasPrefix(relative_path, vaultMemoDirName+"/") {
		return fmt.Errorf("memo path must be inside memo directory")
	}
	if err := workspace_fs.write_file_atomic(relative_path, []byte(renderMemoMarkdownFile(memo)), 0644); err != nil {
		return err
	}
	memo.Path = relative_path
	upsert_cached_memo_query_index(vault_ctx, memo)
	return nil
}

func renderMemoMarkdownFile(memo MemoRecord) string {
	tags := uniqueStrings(memo.Tags)
	refs := uniqueStrings(memo.References)
	reactions := uniqueStrings(memo.Reactions)
	locs := uniqueStrings(memo.Locations)
	lines := []string{
		"---",
		"schemaVersion: " + fmt.Sprintf("%d", vaultSchemaVersion),
		"id: " + yamlQuote(memo.ID),
	}
	if memo.ProjectID != "" {
		lines = append(lines, "projectId: "+yamlQuote(sanitizeProjectID(memo.ProjectID)))
	}
	if strings.TrimSpace(memo.Kind) != "" {
		lines = append(lines, "kind: "+yamlQuote(strings.TrimSpace(memo.Kind)))
	}
	if strings.TrimSpace(memo.TaskID) != "" {
		lines = append(lines, "taskId: "+yamlQuote(sanitizeTaskID(memo.TaskID)))
	}
	lines = append(lines,
		"createdAt: "+yamlQuote(memo.CreatedAt),
		"updatedAt: "+yamlQuote(memo.UpdatedAt),
		"visibility: "+yamlQuote(normalizeMemoVisibility(memo.Visibility)),
		"private: "+fmt.Sprintf("%t", memo.Private),
		"pinned: "+fmt.Sprintf("%t", memo.Pinned),
		"archived: "+fmt.Sprintf("%t", memo.Archived),
		"contentWhitespace: \"preserve\"",
	)
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
	if len(reactions) == 0 {
		lines = append(lines, "reactions: []")
	} else {
		lines = append(lines, "reactions:")
		for _, reaction := range reactions {
			lines = append(lines, "  - "+yamlQuote(reaction))
		}
	}
	if len(locs) == 0 {
		lines = append(lines, "locations: []")
	} else {
		lines = append(lines, "locations:")
		for _, loc := range locs {
			lines = append(lines, "  - "+yamlQuote(loc))
		}
	}
	lines = append(lines, "---")
	return strings.Join(lines, "\n") + "\n" + normalizeMemoContent(memo.Content)
}

func normalizeMemoContent(content string) string {
	text := strings.ReplaceAll(content, "\r\n", "\n")
	return strings.ReplaceAll(text, "\r", "\n")
}

func normalizeStoredMemoContent(content string, meta map[string]string) string {
	content = normalizeMemoContent(content)
	if meta["contentWhitespace"] == "preserve" {
		return content
	}
	return strings.TrimSpace(content)
}

func parseMemoMarkdown(raw string) (map[string]string, string) {
	meta := map[string]string{}
	text := strings.ReplaceAll(raw, "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return meta, text
	}
	end := strings.Index(text[4:], "\n---")
	if end < 0 {
		return meta, text
	}
	frontmatter := text[4 : 4+end]
	contentStart := 4 + end + len("\n---")
	if strings.HasPrefix(text[contentStart:], "\n") {
		contentStart++
	}
	currentListKey := ""
	for _, rawLine := range strings.Split(frontmatter, "\n") {
		line := strings.TrimRight(rawLine, " \t")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if currentListKey != "" && strings.HasPrefix(trimmed, "- ") {
			value := yamlUnquote(strings.TrimSpace(strings.TrimPrefix(trimmed, "- ")))
			if meta[currentListKey] == "" {
				meta[currentListKey] = value
			} else {
				meta[currentListKey] += "\n" + value
			}
			continue
		}
		currentListKey = ""
		index := strings.Index(trimmed, ":")
		if index < 0 {
			continue
		}
		key := strings.TrimSpace(trimmed[:index])
		value := strings.TrimSpace(trimmed[index+1:])
		if value == "" {
			currentListKey = key
			meta[key] = ""
			continue
		}
		if value == "[]" {
			meta[key] = ""
			continue
		}
		meta[key] = yamlUnquote(value)
	}
	return meta, text[contentStart:]
}

func parseMemoBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "y":
		return true
	default:
		return false
	}
}

func parseMemoList(meta map[string]string, key string) []string {
	value := strings.TrimSpace(meta[key])
	if value == "" {
		return []string{}
	}
	return uniqueStrings(strings.Split(value, "\n"))
}

func memoRelativePath(memo MemoRecord) string {
	created := parseMemoTime(memo.CreatedAt)
	if created.IsZero() {
		created = time.Now()
	}
	return filepath.ToSlash(filepath.Join(
		vaultMemoDirName,
		fmt.Sprintf("%04d", created.Year()),
		fmt.Sprintf("%02d", int(created.Month())),
		sanitizeMemoID(memo.ID)+".md",
	))
}

func findMemoFilePath(ctx *VaultContext, id string) (string, error) {
	targetID := strings.TrimSpace(id)
	var found string
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return "", err
	}
	err = workspace_fs.walk_dir(vaultMemoDirName, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		memo, err := readMemoFile(ctx, path)
		if err != nil {
			return err
		}
		if memo.ID == targetID {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("memo not found: %s", targetID)
	}
	return found, nil
}

func relativeVaultPath(ctx *VaultContext, path string) string {
	if workspace_fs, err := require_vault_fs(ctx); err == nil {
		if relative_path, relative_err := workspace_fs.relative_path(path); relative_err == nil {
			return relative_path
		}
	}
	rel, err := filepath.Rel(ctx.RootDir, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(rel)
}
func sanitizeMemoID(value string) string {
	id := strings.TrimSpace(value)
	if id == "" {
		return newMemoID()
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
		return newMemoID()
	}
	return next
}

func parseMemoTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t
	}
	return time.Time{}
}

func memoSortTime(memo MemoRecord) time.Time {
	for _, value := range []string{memo.CreatedAt, memo.UpdatedAt} {
		if t := parseMemoTime(value); !t.IsZero() {
			return t
		}
	}
	return time.Time{}
}

func yamlQuote(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func yamlUnquote(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var out string
	if err := json.Unmarshal([]byte(value), &out); err == nil {
		return out
	}
	return strings.Trim(value, `"'`)
}
