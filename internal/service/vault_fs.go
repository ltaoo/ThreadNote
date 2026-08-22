package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// vault_fs is the storage boundary for a local Vault workspace. All paths
// crossing this interface are Vault-relative and use slash separators.
type vault_fs interface {
	append_file(path string, data []byte, mode fs.FileMode) error
	make_dir_all(path string, mode fs.FileMode) error
	read_file(path string) ([]byte, error)
	remove_file(path string) error
	stat_file(path string) (fs.FileInfo, error)
	walk_dir(path string, walk_fn fs.WalkDirFunc) error
	write_file(path string, data []byte, mode fs.FileMode) error
	write_file_atomic(path string, data []byte, mode fs.FileMode) error
	local_path(path string) (string, error)
	relative_path(path string) (string, error)
}

type local_vault_fs struct {
	root_dir string
}

func new_local_vault_fs(root_dir string) (*local_vault_fs, error) {
	clean_root, err := filepath.Abs(strings.TrimSpace(root_dir))
	if err != nil {
		return nil, err
	}
	if clean_root == "" {
		return nil, fmt.Errorf("vault root is required")
	}
	return &local_vault_fs{root_dir: filepath.Clean(clean_root)}, nil
}

func (local_fs *local_vault_fs) append_file(path string, data []byte, mode fs.FileMode) error {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target_path), 0755); err != nil {
		return err
	}
	file, err := os.OpenFile(target_path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, mode)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(data)
	return err
}

func (local_fs *local_vault_fs) make_dir_all(path string, mode fs.FileMode) error {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	return os.MkdirAll(target_path, mode)
}

func (local_fs *local_vault_fs) read_file(path string) ([]byte, error) {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(target_path)
}

func (local_fs *local_vault_fs) remove_file(path string) error {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	return os.Remove(target_path)
}

func (local_fs *local_vault_fs) stat_file(path string) (fs.FileInfo, error) {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return nil, err
	}
	return os.Stat(target_path)
}

func (local_fs *local_vault_fs) walk_dir(path string, walk_fn fs.WalkDirFunc) error {
	if walk_fn == nil {
		return fmt.Errorf("walk function is required")
	}
	target_root, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	return filepath.WalkDir(target_root, func(local_path string, entry fs.DirEntry, walk_err error) error {
		relative_path, relative_err := local_fs.relative_path(local_path)
		if relative_err != nil {
			return relative_err
		}
		return walk_fn(relative_path, entry, walk_err)
	})
}

func (local_fs *local_vault_fs) write_file(path string, data []byte, mode fs.FileMode) error {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target_path), 0755); err != nil {
		return err
	}
	return os.WriteFile(target_path, data, mode)
}

func (local_fs *local_vault_fs) write_file_atomic(path string, data []byte, mode fs.FileMode) error {
	target_path, err := local_fs.local_path(path)
	if err != nil {
		return err
	}
	target_dir := filepath.Dir(target_path)
	if err := os.MkdirAll(target_dir, 0755); err != nil {
		return err
	}
	temporary_file, err := os.CreateTemp(target_dir, ".velo-write-*")
	if err != nil {
		return err
	}
	temporary_path := temporary_file.Name()
	defer func() {
		_ = os.Remove(temporary_path)
	}()
	if err := temporary_file.Chmod(mode); err != nil {
		_ = temporary_file.Close()
		return err
	}
	if _, err := temporary_file.Write(data); err != nil {
		_ = temporary_file.Close()
		return err
	}
	if err := temporary_file.Sync(); err != nil {
		_ = temporary_file.Close()
		return err
	}
	if err := temporary_file.Close(); err != nil {
		return err
	}
	return os.Rename(temporary_path, target_path)
}

func (local_fs *local_vault_fs) local_path(path string) (string, error) {
	relative_path, err := local_fs.relative_path(path)
	if err != nil {
		return "", err
	}
	if relative_path == "." {
		return local_fs.root_dir, nil
	}
	return filepath.Join(local_fs.root_dir, filepath.FromSlash(relative_path)), nil
}

func (local_fs *local_vault_fs) relative_path(path string) (string, error) {
	value := strings.TrimSpace(path)
	if value == "" || value == "." {
		return ".", nil
	}
	if filepath.IsAbs(value) {
		relative_path, err := filepath.Rel(local_fs.root_dir, filepath.Clean(value))
		if err != nil {
			return "", err
		}
		return clean_vault_fs_path(relative_path)
	}
	return clean_vault_fs_path(filepath.FromSlash(strings.ReplaceAll(value, "\\", "/")))
}

func clean_vault_fs_path(path string) (string, error) {
	clean_path := filepath.Clean(path)
	if clean_path == "." {
		return ".", nil
	}
	if filepath.IsAbs(clean_path) || clean_path == ".." || strings.HasPrefix(clean_path, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes vault: %s", path)
	}
	return filepath.ToSlash(clean_path), nil
}

func require_vault_fs(ctx *VaultContext) (vault_fs, error) {
	if ctx == nil {
		return nil, fmt.Errorf("vault context is required")
	}
	if ctx.fs != nil {
		return ctx.fs, nil
	}
	local_fs, err := new_local_vault_fs(ctx.RootDir)
	if err != nil {
		return nil, err
	}
	ctx.fs = local_fs
	return ctx.fs, nil
}

func vault_local_path(ctx *VaultContext, path string) (string, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return "", err
	}
	return workspace_fs.local_path(path)
}

func is_vault_file_not_exist(err error) bool {
	return errors.Is(err, fs.ErrNotExist)
}

func write_vault_json_file_atomic(ctx *VaultContext, path string, value interface{}) error {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	return write_vault_fs_json_file_atomic(workspace_fs, path, value)
}

func write_vault_fs_json_file_atomic(workspace_fs vault_fs, path string, value interface{}) error {
	if workspace_fs == nil {
		return fmt.Errorf("vault fs is required")
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return workspace_fs.write_file_atomic(path, append(bytes.TrimRight(raw, "\n"), '\n'), 0644)
}
