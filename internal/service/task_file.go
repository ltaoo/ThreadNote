package service

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"time"
)

func readTaskFile(ctx *VaultContext, path string) (TaskRecord, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return TaskRecord{}, err
	}
	relative_path, err := workspace_fs.relative_path(path)
	if err != nil {
		return TaskRecord{}, err
	}
	raw, err := workspace_fs.read_file(relative_path)
	if err != nil {
		return TaskRecord{}, err
	}
	info, _ := workspace_fs.stat_file(relative_path)
	var task TaskRecord
	if err := json.Unmarshal(raw, &task); err != nil {
		return TaskRecord{}, fmt.Errorf("read task: %w", err)
	}
	task = normalizeTaskRecord(task)
	if task.ID == "" {
		task.ID = sanitizeTaskID(strings.TrimSuffix(filepath.Base(relative_path), filepath.Ext(relative_path)))
	}
	if task.CreatedAt == "" && info != nil {
		task.CreatedAt = info.ModTime().UTC().Format(time.RFC3339Nano)
	}
	if task.UpdatedAt == "" {
		task.UpdatedAt = task.CreatedAt
	}
	task.Path = relative_path
	return task, nil
}

func writeTaskRecord(ctx *VaultContext, task TaskRecord) error {
	task = normalizeTaskRecord(task)
	if task.ID == "" {
		return fmt.Errorf("task id is required")
	}
	task.Path = taskRelativePath(task)
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	target, err := workspace_fs.relative_path(task.Path)
	if err != nil {
		return err
	}
	root := task_root_dir()
	if !strings.HasPrefix(target, root+"/") && target != root {
		return fmt.Errorf("task path must be inside task directory")
	}
	return write_vault_json_file_atomic(ctx, target, task)
}

func taskRelativePath(task TaskRecord) string {
	status := normalizeTaskStatus(task.Status)
	t := taskPathTime(task)
	id := sanitizeTaskID(task.ID)
	if id == "" {
		id = newTaskID()
	}
	switch status {
	case taskStatusCompleted, taskStatusCancelled, taskStatusArchived:
		return filepath.ToSlash(filepath.Join(
			vaultTaskDirName,
			status,
			fmt.Sprintf("%04d", t.Year()),
			id+".json",
		))
	default:
		return filepath.ToSlash(filepath.Join(
			vaultTaskDirName,
			taskStatusOpen,
			fmt.Sprintf("%04d", t.Year()),
			fmt.Sprintf("%02d", int(t.Month())),
			id+".json",
		))
	}
}

func taskPathTime(task TaskRecord) time.Time {
	for _, value := range []string{task.CompletedAt, task.CancelledAt, task.CreatedAt} {
		if t := parseMemoTime(value); !t.IsZero() {
			return t
		}
	}
	return time.Now()
}

func findTaskFilePath(ctx *VaultContext, id string) (string, error) {
	targetID := sanitizeTaskID(id)
	if targetID == "" {
		return "", fmt.Errorf("task id is required")
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return "", err
	}
	root := task_root_dir()
	if _, err := workspace_fs.stat_file(root); is_vault_file_not_exist(err) {
		return "", fmt.Errorf("task not found: %s", targetID)
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
		task, err := readTaskFile(ctx, path)
		if err != nil {
			return err
		}
		if task.ID == targetID {
			found = path
			return fs.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("task not found: %s", targetID)
	}
	return found, nil
}
