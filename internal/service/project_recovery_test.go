package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenVaultRecoversProjectsFromRegisteredVault(t *testing.T) {
	test_home := t.TempDir()
	t.Setenv("HOME", test_home)
	t.Setenv("USERPROFILE", test_home)

	source_root := t.TempDir()
	source_ctx, _, err := openVaultDirectory(source_root, true)
	if err != nil {
		t.Fatalf("open source vault: %v", err)
	}
	first_project, err := createVaultProject(source_ctx, ProjectCreateRequest{Name: "First", Color: "#123456"})
	if err != nil {
		t.Fatalf("create first project: %v", err)
	}
	second_project, err := createVaultProject(source_ctx, ProjectCreateRequest{Name: "Second", Color: "#654321"})
	if err != nil {
		t.Fatalf("create second project: %v", err)
	}
	empty_project, err := createVaultProject(source_ctx, ProjectCreateRequest{Name: "Empty"})
	if err != nil {
		t.Fatalf("create empty project: %v", err)
	}
	first_memo, err := createVaultMemo(source_ctx, MemoCreateRequest{Content: "first", ProjectID: first_project.ID})
	if err != nil {
		t.Fatalf("create first memo: %v", err)
	}
	second_memo, err := createVaultMemo(source_ctx, MemoCreateRequest{Content: "second", ProjectID: second_project.ID})
	if err != nil {
		t.Fatalf("create second memo: %v", err)
	}
	if _, err := registerActiveVault(source_ctx); err != nil {
		t.Fatalf("register source vault: %v", err)
	}

	clone_root := t.TempDir()
	for _, memo := range []MemoRecord{first_memo, second_memo} {
		raw, err := os.ReadFile(filepath.Join(source_root, filepath.FromSlash(memo.Path)))
		if err != nil {
			t.Fatalf("read source memo: %v", err)
		}
		clone_path := filepath.Join(clone_root, filepath.FromSlash(memo.Path))
		if err := os.MkdirAll(filepath.Dir(clone_path), 0755); err != nil {
			t.Fatalf("create clone memo directory: %v", err)
		}
		if err := os.WriteFile(clone_path, raw, 0644); err != nil {
			t.Fatalf("write clone memo: %v", err)
		}
	}

	clone_ctx, existing_vault, err := openVaultDirectory(clone_root, false)
	if err != nil {
		t.Fatalf("open cloned vault: %v", err)
	}
	if !existing_vault {
		t.Fatal("memo-backed clone should be recognized as an existing vault")
	}
	projects, err := listVaultProjects(clone_ctx)
	if err != nil {
		t.Fatalf("list recovered projects: %v", err)
	}
	if len(projects.Projects) != 3 {
		t.Fatalf("recovered projects = %#v, want all source projects", projects.Projects)
	}
	want_names := map[string]string{
		first_project.ID:  first_project.Name,
		second_project.ID: second_project.Name,
		empty_project.ID:  empty_project.Name,
	}
	for _, project := range projects.Projects {
		if project.Name != want_names[project.ID] {
			t.Fatalf("recovered project = %#v, want name %q", project, want_names[project.ID])
		}
	}
}

func TestLoadVaultProjectsMigratesLegacyFileToVaultRoot(t *testing.T) {
	vault_root := t.TempDir()
	vault_ctx, _, err := openVaultDirectory(vault_root, true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	project, err := createVaultProject(vault_ctx, ProjectCreateRequest{Name: "Legacy project", Color: "#123456"})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	raw, err := vault_ctx.fs.read_file(vault_projects_path())
	if err != nil {
		t.Fatalf("read root projects: %v", err)
	}
	if err := vault_ctx.fs.remove_file(vault_projects_path()); err != nil {
		t.Fatalf("remove root projects: %v", err)
	}
	if err := vault_ctx.fs.write_file(legacy_vault_projects_path(), raw, 0644); err != nil {
		t.Fatalf("write legacy projects: %v", err)
	}

	projects, err := loadVaultProjects(vault_ctx)
	if err != nil {
		t.Fatalf("load legacy projects: %v", err)
	}
	if len(projects.Projects) != 1 || projects.Projects[0].ID != project.ID || projects.Projects[0].Name != project.Name {
		t.Fatalf("migrated projects = %#v", projects.Projects)
	}
	if _, err := vault_ctx.fs.stat_file(vault_projects_path()); err != nil {
		t.Fatalf("root projects file was not created: %v", err)
	}
	if _, err := vault_ctx.fs.stat_file(legacy_vault_projects_path()); !is_vault_file_not_exist(err) {
		t.Fatalf("legacy projects file still exists: %v", err)
	}
}

func TestOpenVaultCreatesPlaceholderForOrphanedMemoProject(t *testing.T) {
	test_home := t.TempDir()
	t.Setenv("HOME", test_home)
	t.Setenv("USERPROFILE", test_home)
	vault_root := t.TempDir()
	memo_path := filepath.Join(vault_root, "memo", "2026", "08", "memo_orphan.md")
	if err := os.MkdirAll(filepath.Dir(memo_path), 0755); err != nil {
		t.Fatalf("create memo directory: %v", err)
	}
	memo_raw := []byte("---\nid: \"memo_orphan\"\nprojectId: \"project_missing\"\ncreatedAt: \"2026-08-01T00:00:00Z\"\n---\ncontent\n")
	if err := os.WriteFile(memo_path, memo_raw, 0644); err != nil {
		t.Fatalf("write memo: %v", err)
	}

	vault_ctx, _, err := openVaultDirectory(vault_root, true)
	if err != nil {
		t.Fatalf("open vault: %v", err)
	}
	projects, err := listVaultProjects(vault_ctx)
	if err != nil {
		t.Fatalf("list recovered projects: %v", err)
	}
	if len(projects.Projects) != 1 || projects.Projects[0].ID != "project_missing" || projects.Projects[0].Name != "project_missing" {
		t.Fatalf("recovered projects = %#v, want placeholder", projects.Projects)
	}
}
