package service

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestReplaceUpdateFilesReplacesExecutableAndRuntimeFiles(t *testing.T) {
	target_dir := t.TempDir()
	target_executable := filepath.Join(target_dir, "ThreadNote.exe")
	target_loader := filepath.Join(target_dir, "WebView2Loader.dll")
	if err := os.WriteFile(target_executable, []byte("old executable"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target_loader, []byte("old loader"), 0644); err != nil {
		t.Fatal(err)
	}

	archive_path := filepath.Join(t.TempDir(), "ThreadNote_windows_amd64.zip")
	write_test_update_zip(t, archive_path, map[string]string{
		"ThreadNote.exe":     "new executable",
		"WebView2Loader.dll": "new loader",
	})
	if err := replace_update_files(archive_path, target_executable); err != nil {
		t.Fatalf("replace update files: %v", err)
	}

	executable_data, err := os.ReadFile(target_executable)
	if err != nil {
		t.Fatal(err)
	}
	loader_data, err := os.ReadFile(target_loader)
	if err != nil {
		t.Fatal(err)
	}
	if string(executable_data) != "new executable" || string(loader_data) != "new loader" {
		t.Fatalf("unexpected installed files: executable=%q loader=%q", executable_data, loader_data)
	}
	if _, err := os.Stat(target_executable + ".threadnote-backup"); !os.IsNotExist(err) {
		t.Fatalf("executable backup was not cleaned up: %v", err)
	}
}

func TestExtractUpdateZipRejectsTraversal(t *testing.T) {
	archive_path := filepath.Join(t.TempDir(), "unsafe.zip")
	write_test_update_zip(t, archive_path, map[string]string{"../ThreadNote.exe": "unsafe"})
	if err := extract_update_zip(archive_path, t.TempDir()); err == nil {
		t.Fatal("expected archive traversal to be rejected")
	}
}

func write_test_update_zip(t *testing.T, archive_path string, files map[string]string) {
	t.Helper()
	archive_file, err := os.Create(archive_path)
	if err != nil {
		t.Fatal(err)
	}
	archive_writer := zip.NewWriter(archive_file)
	for name, contents := range files {
		file_writer, err := archive_writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file_writer.Write([]byte(contents)); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive_writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := archive_file.Close(); err != nil {
		t.Fatal(err)
	}
}
