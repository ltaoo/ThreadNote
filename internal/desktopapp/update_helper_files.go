package desktopapp

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type staged_update_file struct {
	backup_path      string
	destination_path string
	had_original     bool
	promoted         bool
	staged_path      string
}

func replace_update_files(archive_path string, executable_path string) error {
	extraction_dir, err := os.MkdirTemp("", "threadnote-update-")
	if err != nil {
		return fmt.Errorf("create update extraction directory: %w", err)
	}
	defer os.RemoveAll(extraction_dir)
	if err := extract_update_zip(archive_path, extraction_dir); err != nil {
		return err
	}

	source_executable, err := find_update_executable(extraction_dir, filepath.Base(executable_path))
	if err != nil {
		return err
	}
	source_dir := filepath.Dir(source_executable)
	target_dir := filepath.Dir(executable_path)
	entries, err := os.ReadDir(source_dir)
	if err != nil {
		return fmt.Errorf("read extracted update directory: %w", err)
	}
	staged_files := make([]*staged_update_file, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		source_path := filepath.Join(source_dir, entry.Name())
		destination_path := filepath.Join(target_dir, entry.Name())
		staged_path := destination_path + ".threadnote-update"
		backup_path := destination_path + ".threadnote-backup"
		_ = os.Remove(staged_path)
		_ = os.Remove(backup_path)
		if err := copy_update_file(source_path, staged_path); err != nil {
			_ = os.Remove(staged_path)
			cleanup_staged_update_files(staged_files)
			return fmt.Errorf("stage update file %s: %w", entry.Name(), err)
		}
		staged_files = append(staged_files, &staged_update_file{
			backup_path:      backup_path,
			destination_path: destination_path,
			staged_path:      staged_path,
		})
	}
	if len(staged_files) == 0 {
		return fmt.Errorf("update archive contains no application files")
	}

	for _, staged_file := range staged_files {
		if _, err := os.Stat(staged_file.destination_path); err == nil {
			if err := os.Rename(staged_file.destination_path, staged_file.backup_path); err != nil {
				rollback_staged_update_files(staged_files)
				return fmt.Errorf("backup installed file %s: %w", filepath.Base(staged_file.destination_path), err)
			}
			staged_file.had_original = true
		} else if !os.IsNotExist(err) {
			rollback_staged_update_files(staged_files)
			return fmt.Errorf("inspect installed file %s: %w", filepath.Base(staged_file.destination_path), err)
		}
	}
	for _, staged_file := range staged_files {
		if err := os.Rename(staged_file.staged_path, staged_file.destination_path); err != nil {
			rollback_staged_update_files(staged_files)
			return fmt.Errorf("install update file %s: %w", filepath.Base(staged_file.destination_path), err)
		}
		staged_file.promoted = true
	}
	for _, staged_file := range staged_files {
		_ = os.Remove(staged_file.backup_path)
	}
	return nil
}

func extract_update_zip(archive_path string, destination_dir string) error {
	archive, err := zip.OpenReader(archive_path)
	if err != nil {
		return fmt.Errorf("open update ZIP: %w", err)
	}
	defer archive.Close()
	destination_prefix := filepath.Clean(destination_dir) + string(filepath.Separator)
	for _, archive_file := range archive.File {
		clean_name := filepath.Clean(filepath.FromSlash(archive_file.Name))
		if clean_name == "." || filepath.IsAbs(clean_name) || clean_name == ".." || strings.HasPrefix(clean_name, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe update archive path: %s", archive_file.Name)
		}
		destination_path := filepath.Join(destination_dir, clean_name)
		if !strings.HasPrefix(destination_path, destination_prefix) {
			return fmt.Errorf("unsafe update archive destination: %s", archive_file.Name)
		}
		if archive_file.FileInfo().IsDir() {
			if err := os.MkdirAll(destination_path, 0755); err != nil {
				return fmt.Errorf("create update directory: %w", err)
			}
			continue
		}
		if archive_file.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("update archive contains a symbolic link: %s", archive_file.Name)
		}
		if err := os.MkdirAll(filepath.Dir(destination_path), 0755); err != nil {
			return fmt.Errorf("create update parent directory: %w", err)
		}
		if err := extract_update_file(archive_file, destination_path); err != nil {
			return err
		}
	}
	return nil
}

func extract_update_file(archive_file *zip.File, destination_path string) error {
	source_file, err := archive_file.Open()
	if err != nil {
		return fmt.Errorf("open archived file %s: %w", archive_file.Name, err)
	}
	defer source_file.Close()
	destination_file, err := os.OpenFile(destination_path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, archive_file.Mode().Perm())
	if err != nil {
		return fmt.Errorf("create extracted file %s: %w", archive_file.Name, err)
	}
	if _, err := io.Copy(destination_file, source_file); err != nil {
		_ = destination_file.Close()
		return fmt.Errorf("extract file %s: %w", archive_file.Name, err)
	}
	if err := destination_file.Close(); err != nil {
		return fmt.Errorf("close extracted file %s: %w", archive_file.Name, err)
	}
	return nil
}

func find_update_executable(root_dir string, executable_name string) (string, error) {
	found_path := ""
	err := filepath.WalkDir(root_dir, func(path string, entry os.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if !entry.IsDir() && strings.EqualFold(entry.Name(), executable_name) {
			found_path = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("search update executable: %w", err)
	}
	if found_path == "" {
		return "", fmt.Errorf("update archive does not contain %s", executable_name)
	}
	return found_path, nil
}

func copy_update_file(source_path string, destination_path string) error {
	source_file, err := os.Open(source_path)
	if err != nil {
		return err
	}
	defer source_file.Close()
	source_info, err := source_file.Stat()
	if err != nil {
		return err
	}
	destination_file, err := os.OpenFile(destination_path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, source_info.Mode().Perm())
	if err != nil {
		return err
	}
	if _, err := io.Copy(destination_file, source_file); err != nil {
		_ = destination_file.Close()
		return err
	}
	return destination_file.Close()
}

func cleanup_staged_update_files(staged_files []*staged_update_file) {
	for _, staged_file := range staged_files {
		_ = os.Remove(staged_file.staged_path)
	}
}

func rollback_staged_update_files(staged_files []*staged_update_file) {
	for _, staged_file := range staged_files {
		if staged_file.promoted {
			_ = os.Remove(staged_file.destination_path)
		}
		if staged_file.had_original {
			_ = os.Rename(staged_file.backup_path, staged_file.destination_path)
		}
		_ = os.Remove(staged_file.staged_path)
	}
}
