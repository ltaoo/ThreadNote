package service

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"time"
)

const legacy_item_root_dir = "items"
const legacy_item_backup_root_dir = ".velo/migrations/items-to-tasks-v1"

type legacy_item_record struct {
	ClosedAt      string   `json:"closedAt,omitempty"`
	CreatedAt     string   `json:"createdAt"`
	Decision      string   `json:"decision"`
	ID            string   `json:"id"`
	Labels        []string `json:"labels"`
	LinkedMemoIDs []string `json:"linkedMemoIds"`
	LinkedTaskIDs []string `json:"linkedTaskIds"`
	MilestoneID   string   `json:"milestoneId,omitempty"`
	ProjectID     string   `json:"projectId,omitempty"`
	Status        string   `json:"status"`
	Title         string   `json:"title"`
	Type          string   `json:"type"`
	UpdatedAt     string   `json:"updatedAt"`
}

type legacy_item_file struct {
	path string
	raw  []byte
	item legacy_item_record
}

type legacy_milestone_item_refs struct {
	ID      string   `json:"id"`
	ItemIDs []string `json:"itemIds"`
}

func migrate_legacy_items_to_tasks(vault_ctx *VaultContext) error {
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		return err
	}
	legacy_files, err := load_legacy_item_files(workspace_fs)
	if err != nil {
		return err
	}
	existing_task_ids := map[string]bool{}
	if len(legacy_files) > 0 {
		tasks, err := listVaultTasks(vault_ctx)
		if err != nil {
			return err
		}
		for _, task := range tasks {
			existing_task_ids[task.ID] = true
		}
	}

	for _, legacy_file := range legacy_files {
		backup_path := filepath.ToSlash(filepath.Join(
			legacy_item_backup_root_dir,
			strings.TrimPrefix(legacy_file.path, legacy_item_root_dir+"/"),
		))
		_, backup_err := workspace_fs.stat_file(backup_path)
		previously_backed_up := backup_err == nil
		if backup_err != nil && !is_vault_file_not_exist(backup_err) {
			return fmt.Errorf("inspect legacy item backup %s: %w", legacy_file.item.ID, backup_err)
		}
		task_exists := existing_task_ids[legacy_file.item.ID]
		if task_exists && !previously_backed_up {
			return fmt.Errorf("task id conflicts with legacy item: %s", legacy_file.item.ID)
		}
		if err := workspace_fs.write_file_atomic(backup_path, legacy_file.raw, 0644); err != nil {
			return fmt.Errorf("back up legacy item %s: %w", legacy_file.item.ID, err)
		}
		if !task_exists {
			task := legacy_item_task(legacy_file.item)
			if err := writeTaskRecord(vault_ctx, task); err != nil {
				return fmt.Errorf("migrate legacy item %s: %w", legacy_file.item.ID, err)
			}
			existing_task_ids[task.ID] = true
		}
	}

	milestone_item_ids := map[string][]string{}
	for _, legacy_file := range legacy_files {
		milestone_id := sanitizeGTDMilestoneID(legacy_file.item.MilestoneID)
		if milestone_id == "" {
			continue
		}
		milestone_item_ids[milestone_id] = append(milestone_item_ids[milestone_id], legacy_file.item.ID)
	}
	if err := migrate_legacy_milestone_item_refs(vault_ctx, milestone_item_ids); err != nil {
		return err
	}
	for _, legacy_file := range legacy_files {
		if err := workspace_fs.remove_file(legacy_file.path); err != nil && !is_vault_file_not_exist(err) {
			return fmt.Errorf("remove migrated legacy item %s: %w", legacy_file.item.ID, err)
		}
	}
	if len(legacy_files) > 0 {
		if _, err := rebuildTaskIndex(vault_ctx); err != nil {
			return fmt.Errorf("rebuild task index after item migration: %w", err)
		}
	}
	return nil
}

func load_legacy_item_files(workspace_fs vault_fs) ([]legacy_item_file, error) {
	if _, err := workspace_fs.stat_file(legacy_item_root_dir); is_vault_file_not_exist(err) {
		return []legacy_item_file{}, nil
	} else if err != nil {
		return nil, err
	}

	legacy_files := []legacy_item_file{}
	err := workspace_fs.walk_dir(legacy_item_root_dir, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".json" {
			return nil
		}
		raw, err := workspace_fs.read_file(path)
		if err != nil {
			return err
		}
		var item legacy_item_record
		if err := json.Unmarshal(raw, &item); err != nil {
			return fmt.Errorf("read legacy item %s: %w", path, err)
		}
		item.ID = sanitizeTaskID(firstNonEmpty(item.ID, strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))))
		item.Title = strings.TrimSpace(item.Title)
		if item.ID == "" || item.Title == "" {
			return fmt.Errorf("legacy item %s is missing id or title", path)
		}
		legacy_files = append(legacy_files, legacy_item_file{item: item, path: path, raw: raw})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return legacy_files, nil
}

func legacy_item_task(item legacy_item_record) TaskRecord {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	created_at := firstNonEmpty(normalizeTaskTime(item.CreatedAt), now)
	updated_at := firstNonEmpty(normalizeTaskTime(item.UpdatedAt), created_at)
	status := taskStatusOpen
	completed_at := ""
	legacy_status := strings.ToLower(strings.TrimSpace(item.Status))
	if legacy_status == "closed" || legacy_status == "resolved" {
		status = taskStatusCompleted
		completed_at = firstNonEmpty(normalizeTaskTime(item.ClosedAt), updated_at)
	}
	tags := append([]string{}, item.Labels...)
	tags = append(tags, legacy_item_stage_tag(legacy_status))
	if item_type := strings.ToLower(strings.TrimSpace(item.Type)); item_type != "" {
		tags = append(tags, "type:"+item_type)
	}
	links := make([]TaskLink, 0, len(item.LinkedMemoIDs)+len(item.LinkedTaskIDs))
	for _, memo_id := range uniqueStrings(item.LinkedMemoIDs) {
		links = append(links, TaskLink{ID: memo_id, Type: "memo"})
	}
	for _, task_id := range normalizeTaskIDs(item.LinkedTaskIDs) {
		links = append(links, TaskLink{ID: task_id, Type: "task"})
	}
	task := TaskRecord{
		CompletedAt:   completed_at,
		Contexts:      []string{},
		CreatedAt:     created_at,
		ID:            item.ID,
		Links:         links,
		ListID:        "inbox",
		Notes:         strings.TrimSpace(item.Decision),
		NoteRefs:      []TaskNoteRef{},
		Priority:      taskPriorityNone,
		ProjectID:     sanitizeProjectID(item.ProjectID),
		Reminders:     []TaskReminder{},
		Repeat:        TaskRepeat{Frequency: "none"},
		SchemaVersion: vaultSchemaVersion,
		Status:        status,
		SubtaskIDs:    []string{},
		Tags:          normalizeTaskLabels(tags),
		Timezone:      "UTC",
		Title:         item.Title,
		UpdatedAt:     updated_at,
		Visibility:    "PRIVATE",
	}
	task.Path = taskRelativePath(task)
	return task
}

func legacy_item_stage_tag(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "triaged":
		return "stage:ready"
	case "waiting":
		return "stage:waiting"
	case "closed", "resolved":
		return "stage:done"
	default:
		return task_tag_stage_backlog
	}
}

func migrate_legacy_milestone_item_refs(vault_ctx *VaultContext, milestone_item_ids map[string][]string) error {
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		return err
	}
	raw, err := workspace_fs.read_file(gtdMilestonesPath(vault_ctx))
	if is_vault_file_not_exist(err) || len(strings.TrimSpace(string(raw))) == 0 {
		return nil
	}
	if err != nil {
		return err
	}
	var payload struct {
		Milestones []json.RawMessage `json:"milestones"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("read milestones for item migration: %w", err)
	}
	legacy_refs := map[string][]string{}
	for _, milestone_raw := range payload.Milestones {
		var refs legacy_milestone_item_refs
		if err := json.Unmarshal(milestone_raw, &refs); err != nil {
			return fmt.Errorf("read legacy milestone item references: %w", err)
		}
		if refs.ID != "" && len(refs.ItemIDs) > 0 {
			milestone_id := sanitizeGTDMilestoneID(refs.ID)
			legacy_refs[milestone_id] = normalizeTaskIDs(append(legacy_refs[milestone_id], refs.ItemIDs...))
		}
	}
	for milestone_id, item_ids := range milestone_item_ids {
		legacy_refs[milestone_id] = normalizeTaskIDs(append(legacy_refs[milestone_id], item_ids...))
	}
	if len(legacy_refs) == 0 {
		return nil
	}
	file, err := loadGTDMilestones(vault_ctx)
	if err != nil {
		return err
	}
	changed := false
	for index, milestone := range file.Milestones {
		item_ids := legacy_refs[milestone.ID]
		if len(item_ids) == 0 {
			continue
		}
		milestone.TaskIDs = normalizeTaskIDs(append(milestone.TaskIDs, item_ids...))
		file.Milestones[index] = milestone
		changed = true
	}
	if !changed {
		return nil
	}
	return saveGTDMilestones(vault_ctx, file)
}
