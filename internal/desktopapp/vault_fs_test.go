package desktopapp

import (
	"context"
	"io/fs"
	"strings"
	"testing"
)

type recording_vault_fs struct {
	vault_fs
	atomic_writes []string
	append_writes []string
	removals      []string
}

func (recording_fs *recording_vault_fs) append_file(path string, data []byte, mode fs.FileMode) error {
	relative_path, err := recording_fs.vault_fs.relative_path(path)
	if err != nil {
		return err
	}
	recording_fs.append_writes = append(recording_fs.append_writes, relative_path)
	return recording_fs.vault_fs.append_file(relative_path, data, mode)
}

func (recording_fs *recording_vault_fs) remove_file(path string) error {
	relative_path, err := recording_fs.vault_fs.relative_path(path)
	if err != nil {
		return err
	}
	recording_fs.removals = append(recording_fs.removals, relative_path)
	return recording_fs.vault_fs.remove_file(relative_path)
}

func (recording_fs *recording_vault_fs) write_file_atomic(path string, data []byte, mode fs.FileMode) error {
	relative_path, err := recording_fs.vault_fs.relative_path(path)
	if err != nil {
		return err
	}
	recording_fs.atomic_writes = append(recording_fs.atomic_writes, relative_path)
	return recording_fs.vault_fs.write_file_atomic(relative_path, data, mode)
}

func TestLocalVaultFSRejectsEscapingPaths(t *testing.T) {
	workspace_fs, err := new_local_vault_fs(t.TempDir())
	if err != nil {
		t.Fatalf("create local vault fs: %v", err)
	}
	for _, path := range []string{"../outside.md", "memo/../../outside.md"} {
		if _, err := workspace_fs.local_path(path); err == nil {
			t.Fatalf("local_path(%q) should reject a path outside the vault", path)
		}
	}
}

func TestLocalVaultFSWritesAndWalksRelativePaths(t *testing.T) {
	workspace_fs, err := new_local_vault_fs(t.TempDir())
	if err != nil {
		t.Fatalf("create local vault fs: %v", err)
	}
	if err := workspace_fs.write_file_atomic("memo/2026/08/example.md", []byte("hello"), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	raw, err := workspace_fs.read_file("memo/2026/08/example.md")
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(raw) != "hello" {
		t.Fatalf("file content = %q, want hello", raw)
	}

	paths := []string{}
	err = workspace_fs.walk_dir("memo", func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if !entry.IsDir() {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk files: %v", err)
	}
	if len(paths) != 1 || paths[0] != "memo/2026/08/example.md" {
		t.Fatalf("walk paths = %#v", paths)
	}
}

func TestMemoPersistenceUsesVaultFS(t *testing.T) {
	ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	recording_fs := &recording_vault_fs{vault_fs: ctx.fs}
	ctx.fs = recording_fs

	memo, err := createVaultMemo(ctx, MemoCreateRequest{Content: "stored through vault fs"})
	if err != nil {
		t.Fatalf("create memo: %v", err)
	}
	if len(recording_fs.atomic_writes) != 2 {
		t.Fatalf("atomic writes = %#v, want memo and history", recording_fs.atomic_writes)
	}
	if recording_fs.atomic_writes[0] != memo.Path {
		t.Fatalf("first write = %q, want %q", recording_fs.atomic_writes[0], memo.Path)
	}
	if !strings.HasSuffix(recording_fs.atomic_writes[1], ".history.json") {
		t.Fatalf("second write = %q, want history file", recording_fs.atomic_writes[1])
	}
}

func TestTaskPersistenceUsesVaultFS(t *testing.T) {
	ctx, _, err := openVaultDirectory(t.TempDir(), true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	recording_fs := &recording_vault_fs{vault_fs: ctx.fs}
	ctx.fs = recording_fs

	task, err := createVaultTask(ctx, TaskCreateRequest{Title: "stored through vault fs"})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	if !contains_vault_path(recording_fs.atomic_writes, task.Path) {
		t.Fatalf("atomic writes = %#v, want task path %q", recording_fs.atomic_writes, task.Path)
	}
	if !contains_vault_path(recording_fs.atomic_writes, task_index_path()) {
		t.Fatalf("atomic writes = %#v, want task index %q", recording_fs.atomic_writes, task_index_path())
	}
	if len(recording_fs.append_writes) != 1 || !strings.HasPrefix(recording_fs.append_writes[0], task_events_dir()+"/") {
		t.Fatalf("append writes = %#v, want task event under %q", recording_fs.append_writes, task_events_dir())
	}

	if err := deleteVaultTask(ctx, task.ID); err != nil {
		t.Fatalf("delete task: %v", err)
	}
	if !contains_vault_path(recording_fs.removals, task.Path) {
		t.Fatalf("removals = %#v, want task path %q", recording_fs.removals, task.Path)
	}
}

func TestLocalSyncDriverIsNoOp(t *testing.T) {
	driver := new_local_sync_driver()
	if driver.provider() != "local" {
		t.Fatalf("provider = %q, want local", driver.provider())
	}
	for _, operation := range []func(context.Context) (sync_result, error){driver.pull, driver.push} {
		result, err := operation(context.Background())
		if err != nil {
			t.Fatalf("local sync operation: %v", err)
		}
		if result.Changed || len(result.Conflicts) != 0 || result.Status.Provider != "local" {
			t.Fatalf("local sync result = %#v", result)
		}
	}
}

func contains_vault_path(paths []string, target string) bool {
	for _, path := range paths {
		if path == target {
			return true
		}
	}
	return false
}
