package service

import (
	"encoding/json"
	"errors"
	"io/fs"
	"strings"
	"testing"
)

func TestMigrateLegacyItemsToTasks(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		t.Fatalf("vault fs: %v", err)
	}

	item_path := "items/open/2026/08/item_legacy.json"
	item_payload := map[string]interface{}{
		"createdAt":     "2026-08-20T10:00:00Z",
		"decision":      "Clarify scope before scheduling",
		"id":            "item_legacy",
		"labels":        []string{"api"},
		"linkedMemoIds": []string{"memo_source"},
		"linkedTaskIds": []string{"task_related"},
		"milestoneId":   "milestone_v2",
		"projectId":     "project_alpha",
		"status":        "open",
		"title":         "Define the external API",
		"type":          "feature",
		"updatedAt":     "2026-08-20T11:00:00Z",
	}
	item_raw, err := json.Marshal(item_payload)
	if err != nil {
		t.Fatalf("marshal legacy item: %v", err)
	}
	if err := workspace_fs.write_file(item_path, item_raw, 0644); err != nil {
		t.Fatalf("write legacy item: %v", err)
	}
	milestone_payload := map[string]interface{}{
		"schemaVersion": 1,
		"milestones": []map[string]interface{}{
			{
				"createdAt": "2026-08-20T09:00:00Z",
				"id":        "milestone_v2",
				"itemIds":   []string{"item_legacy"},
				"status":    "active",
				"taskIds":   []string{"task_existing"},
				"title":     "Version 2",
				"updatedAt": "2026-08-20T09:00:00Z",
			},
		},
	}
	milestone_raw, err := json.Marshal(milestone_payload)
	if err != nil {
		t.Fatalf("marshal legacy milestone: %v", err)
	}
	if err := workspace_fs.write_file(gtdMilestonesPath(vault_ctx), milestone_raw, 0644); err != nil {
		t.Fatalf("write legacy milestone: %v", err)
	}

	if err := migrate_legacy_items_to_tasks(vault_ctx); err != nil {
		t.Fatalf("migrate legacy items: %v", err)
	}
	task, err := getVaultTask(vault_ctx, "item_legacy")
	if err != nil {
		t.Fatalf("get migrated task: %v", err)
	}
	if task.Status != taskStatusOpen || task.Notes != "Clarify scope before scheduling" {
		t.Fatalf("migrated task = %+v", task)
	}
	for _, want_tag := range []string{"api", task_tag_stage_backlog, "type:feature"} {
		if !stringListContains(task.Tags, want_tag) {
			t.Fatalf("migrated tags = %v, missing %q", task.Tags, want_tag)
		}
	}
	if len(task.Links) != 2 {
		t.Fatalf("migrated links = %+v", task.Links)
	}

	milestones, err := loadGTDMilestones(vault_ctx)
	if err != nil {
		t.Fatalf("load migrated milestones: %v", err)
	}
	if len(milestones.Milestones) != 1 || !stringListContains(milestones.Milestones[0].TaskIDs, task.ID) {
		t.Fatalf("migrated milestone = %+v", milestones.Milestones)
	}
	saved_milestone_raw, err := workspace_fs.read_file(gtdMilestonesPath(vault_ctx))
	if err != nil {
		t.Fatalf("read migrated milestone file: %v", err)
	}
	if strings.Contains(string(saved_milestone_raw), `"itemIds"`) {
		t.Fatalf("legacy itemIds remain in milestone: %s", saved_milestone_raw)
	}
	if _, err := workspace_fs.stat_file(item_path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("legacy item still exists: %v", err)
	}
	backup_path := legacy_item_backup_root_dir + "/open/2026/08/item_legacy.json"
	if _, err := workspace_fs.stat_file(backup_path); err != nil {
		t.Fatalf("legacy item backup: %v", err)
	}
	if err := migrate_legacy_items_to_tasks(vault_ctx); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	tasks, err := listVaultTasks(vault_ctx)
	if err != nil {
		t.Fatalf("list migrated tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("tasks after repeated migration = %+v", tasks)
	}
}

func TestLegacyClosedItemBecomesCompletedTask(t *testing.T) {
	task := legacy_item_task(legacy_item_record{
		ClosedAt:  "2026-08-20T12:00:00Z",
		CreatedAt: "2026-08-20T10:00:00Z",
		ID:        "item_closed",
		Status:    "closed",
		Title:     "Closed requirement",
	})
	if task.Status != taskStatusCompleted || task.CompletedAt == "" {
		t.Fatalf("completed task = %+v", task)
	}
	if !stringListContains(task.Tags, "stage:done") {
		t.Fatalf("completed task tags = %v", task.Tags)
	}
}

func TestLegacyItemMigrationDoesNotOverwriteConflictingTask(t *testing.T) {
	vault_ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		t.Fatalf("vault fs: %v", err)
	}
	existing_task := legacy_item_task(legacy_item_record{
		ID:    "item_collision",
		Title: "Existing task",
	})
	if err := writeTaskRecord(vault_ctx, existing_task); err != nil {
		t.Fatalf("write existing task: %v", err)
	}
	item_path := "items/open/2026/08/item_collision.json"
	item_raw := []byte(`{"id":"item_collision","title":"Legacy requirement"}`)
	if err := workspace_fs.write_file(item_path, item_raw, 0644); err != nil {
		t.Fatalf("write legacy item: %v", err)
	}

	err = migrate_legacy_items_to_tasks(vault_ctx)
	if err == nil || !strings.Contains(err.Error(), "conflicts") {
		t.Fatalf("migration error = %v", err)
	}
	if _, err := workspace_fs.stat_file(item_path); err != nil {
		t.Fatalf("conflicting legacy item should remain: %v", err)
	}
	backup_path := legacy_item_backup_root_dir + "/open/2026/08/item_collision.json"
	if _, err := workspace_fs.stat_file(backup_path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("unexpected conflict backup: %v", err)
	}
}
