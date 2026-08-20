package desktopapp

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const vaultGTDItemDirName = "items"

const (
	gtdItemStatusOpen     = "open"
	gtdItemStatusTriaged  = "triaged"
	gtdItemStatusWaiting  = "waiting"
	gtdItemStatusResolved = "resolved"
	gtdItemStatusClosed   = "closed"
)

const (
	gtdItemTypeIdea     = "idea"
	gtdItemTypeBug      = "bug"
	gtdItemTypeQuestion = "question"
	gtdItemTypeFeature  = "feature"
	gtdItemTypeChore    = "chore"
)

type GTDItemRecord struct {
	ClosedAt      string   `json:"closedAt,omitempty"`
	CreatedAt     string   `json:"createdAt"`
	Decision      string   `json:"decision"`
	ID            string   `json:"id"`
	Labels        []string `json:"labels"`
	LinkedMemoIDs []string `json:"linkedMemoIds"`
	LinkedTaskIDs []string `json:"linkedTaskIds"`
	MilestoneID   string   `json:"milestoneId,omitempty"`
	ProjectID     string   `json:"projectId,omitempty"`
	SchemaVersion int      `json:"schemaVersion"`
	Status        string   `json:"status"`
	Title         string   `json:"title"`
	Type          string   `json:"type"`
	UpdatedAt     string   `json:"updatedAt"`
}

type GTDItemCreateRequest struct {
	Decision      string   `json:"decision"`
	Labels        []string `json:"labels"`
	LinkedMemoIDs []string `json:"linkedMemoIds"`
	LinkedTaskIDs []string `json:"linkedTaskIds"`
	MilestoneID   string   `json:"milestoneId"`
	ProjectID     string   `json:"projectId"`
	Status        string   `json:"status"`
	Title         string   `json:"title"`
	Type          string   `json:"type"`
}

type GTDItemUpdateRequest struct {
	Decision      *string   `json:"decision"`
	ID            string    `json:"id"`
	Labels        *[]string `json:"labels"`
	LinkedMemoIDs *[]string `json:"linkedMemoIds"`
	LinkedTaskIDs *[]string `json:"linkedTaskIds"`
	MilestoneID   *string   `json:"milestoneId"`
	ProjectID     *string   `json:"projectId"`
	Status        *string   `json:"status"`
	Title         *string   `json:"title"`
	Type          *string   `json:"type"`
}

type GTDIDRequest struct {
	ID string `json:"id"`
}

func gtd_item_root_dir() string {
	return vaultGTDItemDirName
}

func listVaultGTDItems(ctx *VaultContext) ([]GTDItemRecord, error) {
	items := []GTDItemRecord{}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return nil, err
	}
	root := gtd_item_root_dir()
	if _, err := workspace_fs.stat_file(root); is_vault_file_not_exist(err) {
		return items, nil
	} else if err != nil {
		return nil, err
	}
	if err := workspace_fs.walk_dir(root, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".json" {
			return nil
		}
		item, err := readGTDItemFile(ctx, path)
		if err != nil {
			return err
		}
		items = append(items, item)
		return nil
	}); err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool {
		left := parseMemoTime(firstNonEmpty(items[i].UpdatedAt, items[i].CreatedAt))
		right := parseMemoTime(firstNonEmpty(items[j].UpdatedAt, items[j].CreatedAt))
		if left.Equal(right) {
			return items[i].ID > items[j].ID
		}
		return left.After(right)
	})
	return items, nil
}

func createVaultGTDItem(ctx *VaultContext, req GTDItemCreateRequest) (GTDItemRecord, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return GTDItemRecord{}, fmt.Errorf("item title is required")
	}
	projectID, err := validateMemoProjectID(ctx, req.ProjectID)
	if err != nil {
		return GTDItemRecord{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	item := GTDItemRecord{
		CreatedAt:     now,
		Decision:      strings.TrimSpace(req.Decision),
		ID:            newGTDItemID(),
		Labels:        normalizeTaskLabels(req.Labels),
		LinkedMemoIDs: normalizeGTDRefIDs(req.LinkedMemoIDs),
		LinkedTaskIDs: normalizeTaskIDs(req.LinkedTaskIDs),
		MilestoneID:   sanitizeGTDMilestoneID(req.MilestoneID),
		ProjectID:     projectID,
		SchemaVersion: vaultSchemaVersion,
		Status:        normalizeGTDItemStatus(req.Status),
		Title:         title,
		Type:          normalizeGTDItemType(req.Type),
		UpdatedAt:     now,
	}
	if isClosedGTDItemStatus(item.Status) {
		item.ClosedAt = now
	}
	if err := writeGTDItemRecord(ctx, item); err != nil {
		return GTDItemRecord{}, err
	}
	return item, nil
}

func updateVaultGTDItem(ctx *VaultContext, req GTDItemUpdateRequest) (GTDItemRecord, error) {
	id := sanitizeGTDItemID(req.ID)
	if id == "" {
		return GTDItemRecord{}, fmt.Errorf("item id is required")
	}
	path, err := findGTDItemFilePath(ctx, id)
	if err != nil {
		return GTDItemRecord{}, err
	}
	item, err := readGTDItemFile(ctx, path)
	if err != nil {
		return GTDItemRecord{}, err
	}
	oldPath := path
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			return GTDItemRecord{}, fmt.Errorf("item title is required")
		}
		item.Title = title
	}
	if req.Type != nil {
		item.Type = normalizeGTDItemType(*req.Type)
	}
	if req.Status != nil {
		next := normalizeGTDItemStatus(*req.Status)
		if item.Status != next {
			item.Status = next
			if isClosedGTDItemStatus(next) && item.ClosedAt == "" {
				item.ClosedAt = time.Now().UTC().Format(time.RFC3339Nano)
			}
			if !isClosedGTDItemStatus(next) {
				item.ClosedAt = ""
			}
		}
	}
	if req.ProjectID != nil {
		projectID, err := validateMemoProjectID(ctx, *req.ProjectID)
		if err != nil {
			return GTDItemRecord{}, err
		}
		item.ProjectID = projectID
	}
	if req.MilestoneID != nil {
		item.MilestoneID = sanitizeGTDMilestoneID(*req.MilestoneID)
	}
	if req.Labels != nil {
		item.Labels = normalizeTaskLabels(*req.Labels)
	}
	if req.LinkedMemoIDs != nil {
		item.LinkedMemoIDs = normalizeGTDRefIDs(*req.LinkedMemoIDs)
	}
	if req.LinkedTaskIDs != nil {
		item.LinkedTaskIDs = normalizeTaskIDs(*req.LinkedTaskIDs)
	}
	if req.Decision != nil {
		item.Decision = strings.TrimSpace(*req.Decision)
	}
	item.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if err := writeGTDItemRecord(ctx, item); err != nil {
		return GTDItemRecord{}, err
	}
	nextPath := gtdItemRelativePath(item)
	if oldPath != nextPath {
		workspace_fs, fs_err := require_vault_fs(ctx)
		if fs_err != nil {
			return GTDItemRecord{}, fs_err
		}
		_ = workspace_fs.remove_file(oldPath)
	}
	return item, nil
}

func deleteVaultGTDItem(ctx *VaultContext, id string) error {
	path, err := findGTDItemFilePath(ctx, id)
	if err != nil {
		return err
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	return workspace_fs.remove_file(path)
}

func readGTDItemFile(ctx *VaultContext, path string) (GTDItemRecord, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return GTDItemRecord{}, err
	}
	relative_path, err := workspace_fs.relative_path(path)
	if err != nil {
		return GTDItemRecord{}, err
	}
	raw, err := workspace_fs.read_file(relative_path)
	if err != nil {
		return GTDItemRecord{}, err
	}
	info, _ := workspace_fs.stat_file(relative_path)
	var item GTDItemRecord
	if err := json.Unmarshal(raw, &item); err != nil {
		return GTDItemRecord{}, fmt.Errorf("read item: %w", err)
	}
	item = normalizeGTDItemRecord(item)
	if item.ID == "" {
		item.ID = sanitizeGTDItemID(strings.TrimSuffix(filepath.Base(relative_path), filepath.Ext(relative_path)))
	}
	if item.CreatedAt == "" && info != nil {
		item.CreatedAt = info.ModTime().UTC().Format(time.RFC3339Nano)
	}
	if item.UpdatedAt == "" {
		item.UpdatedAt = item.CreatedAt
	}
	return item, nil
}

func writeGTDItemRecord(ctx *VaultContext, item GTDItemRecord) error {
	item = normalizeGTDItemRecord(item)
	if item.ID == "" {
		return fmt.Errorf("item id is required")
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	path, err := workspace_fs.relative_path(gtdItemRelativePath(item))
	if err != nil {
		return err
	}
	root := gtd_item_root_dir()
	if !strings.HasPrefix(path, root+"/") && path != root {
		return fmt.Errorf("item path must be inside item directory")
	}
	return write_vault_json_file_atomic(ctx, path, item)
}

func findGTDItemFilePath(ctx *VaultContext, id string) (string, error) {
	targetID := sanitizeGTDItemID(id)
	if targetID == "" {
		return "", fmt.Errorf("item id is required")
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return "", err
	}
	root := gtd_item_root_dir()
	if _, err := workspace_fs.stat_file(root); is_vault_file_not_exist(err) {
		return "", fmt.Errorf("item not found: %s", targetID)
	} else if err != nil {
		return "", err
	}
	var found string
	err = workspace_fs.walk_dir(root, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".json" {
			return nil
		}
		item, err := readGTDItemFile(ctx, path)
		if err != nil {
			return err
		}
		if item.ID == targetID {
			found = path
			return fs.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("item not found: %s", targetID)
	}
	return found, nil
}

func gtdItemRelativePath(item GTDItemRecord) string {
	status := normalizeGTDItemStatus(item.Status)
	t := parseMemoTime(firstNonEmpty(item.ClosedAt, item.CreatedAt))
	if t.IsZero() {
		t = time.Now()
	}
	id := sanitizeGTDItemID(item.ID)
	if isClosedGTDItemStatus(status) {
		return filepath.ToSlash(filepath.Join(vaultGTDItemDirName, status, fmt.Sprintf("%04d", t.Year()), id+".json"))
	}
	return filepath.ToSlash(filepath.Join(vaultGTDItemDirName, "open", fmt.Sprintf("%04d", t.Year()), fmt.Sprintf("%02d", int(t.Month())), id+".json"))
}

func normalizeGTDItemRecord(item GTDItemRecord) GTDItemRecord {
	item.ID = sanitizeGTDItemID(item.ID)
	item.Title = strings.TrimSpace(item.Title)
	item.Type = normalizeGTDItemType(item.Type)
	item.Status = normalizeGTDItemStatus(item.Status)
	item.ProjectID = sanitizeProjectID(item.ProjectID)
	item.MilestoneID = sanitizeGTDMilestoneID(item.MilestoneID)
	item.Labels = normalizeTaskLabels(item.Labels)
	item.LinkedMemoIDs = normalizeGTDRefIDs(item.LinkedMemoIDs)
	item.LinkedTaskIDs = normalizeTaskIDs(item.LinkedTaskIDs)
	item.Decision = strings.TrimSpace(item.Decision)
	if item.SchemaVersion == 0 {
		item.SchemaVersion = vaultSchemaVersion
	}
	return item
}

func normalizeGTDItemStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case gtdItemStatusTriaged:
		return gtdItemStatusTriaged
	case gtdItemStatusWaiting:
		return gtdItemStatusWaiting
	case gtdItemStatusResolved:
		return gtdItemStatusResolved
	case gtdItemStatusClosed:
		return gtdItemStatusClosed
	default:
		return gtdItemStatusOpen
	}
}

func normalizeGTDItemType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case gtdItemTypeBug:
		return gtdItemTypeBug
	case gtdItemTypeQuestion:
		return gtdItemTypeQuestion
	case gtdItemTypeFeature:
		return gtdItemTypeFeature
	case gtdItemTypeChore:
		return gtdItemTypeChore
	default:
		return gtdItemTypeIdea
	}
}

func isClosedGTDItemStatus(status string) bool {
	status = normalizeGTDItemStatus(status)
	return status == gtdItemStatusResolved || status == gtdItemStatusClosed
}

func newGTDItemID() string {
	return "item_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}

func sanitizeGTDItemID(value string) string {
	return sanitizeProjectID(value)
}

func normalizeGTDRefIDs(values []string) []string {
	return uniqueStrings(values)
}
