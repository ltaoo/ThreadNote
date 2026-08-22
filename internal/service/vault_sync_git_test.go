package service

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitHubGitSyncPushAndPull(t *testing.T) {
	remote_parent := t.TempDir()
	remote_root := filepath.Join(remote_parent, "remote.git")
	run_git_test(t, remote_parent, "init", "--bare", remote_root)

	first_root := t.TempDir()
	first_ctx, _, err := openVaultDirectory(first_root, true)
	if err != nil {
		t.Fatalf("open first vault: %v", err)
	}
	setActiveVault(first_ctx)
	defer setActiveVault(nil)
	if err := first_ctx.fs.write_file(".gitignore", []byte(".velo\n.DS_Store\n"), 0644); err != nil {
		t.Fatalf("write legacy gitignore: %v", err)
	}

	resolved_config, err := configure_vault_github_sync(context.Background(), first_ctx, GitHubGitSyncConfig{RemoteURL: remote_root})
	if err != nil {
		t.Fatalf("configure first vault sync: %v", err)
	}
	if resolved_config.Branch != default_git_branch || resolved_config.RemoteName != default_git_remote_name {
		t.Fatalf("resolved config = %#v", resolved_config)
	}
	run_git_test(t, first_root, "config", "user.name", "Velo Test")
	run_git_test(t, first_root, "config", "user.email", "velo@example.invalid")

	first_project, err := createVaultProject(first_ctx, ProjectCreateRequest{Name: "Synced project"})
	if err != nil {
		t.Fatalf("create first project: %v", err)
	}
	first_memo, err := createVaultMemo(first_ctx, MemoCreateRequest{Content: "first synced memo", ProjectID: first_project.ID})
	if err != nil {
		t.Fatalf("create first memo: %v", err)
	}
	query_store, err := new_vault_memo_query_store(first_ctx)
	if err != nil {
		t.Fatalf("create memo query store: %v", err)
	}
	if _, err := query_store.Stats(context.Background()); err != nil {
		t.Fatalf("build memo index: %v", err)
	}
	if err := first_ctx.fs.write_file(".velo/storage.json", []byte(`{"secretAccessKey":"must-not-sync"}`), 0600); err != nil {
		t.Fatalf("write machine-local settings: %v", err)
	}
	first_driver, ok := first_ctx.sync_driver.(*github_git_sync_driver)
	if !ok {
		t.Fatalf("sync driver = %T, want github git driver", first_ctx.sync_driver)
	}
	push_result, err := first_driver.push(context.Background())
	if err != nil {
		t.Fatalf("push first vault: %v", err)
	}
	if !push_result.Changed || push_result.Status.Dirty || push_result.Status.Ahead != 0 || push_result.Status.Behind != 0 {
		t.Fatalf("push result = %#v", push_result)
	}

	remote_files := run_git_test(t, remote_parent, "--git-dir", remote_root, "ls-tree", "-r", "--name-only", "refs/heads/main")
	for _, expected_path := range []string{".gitignore", "projects.json", first_memo.Path} {
		if !contains_git_path(remote_files, expected_path) {
			t.Fatalf("remote files do not contain %q:\n%s", expected_path, remote_files)
		}
	}
	for _, excluded_path := range []string{".velo/memo-index.db", ".velo/storage.json", ".velo/sync.json", ".velo/vault.json"} {
		if contains_git_path(remote_files, excluded_path) {
			t.Fatalf("machine-local file %q was pushed:\n%s", excluded_path, remote_files)
		}
	}

	second_parent := t.TempDir()
	second_root := filepath.Join(second_parent, "clone")
	run_git_test(t, second_parent, "clone", "--branch", "main", remote_root, second_root)
	second_ctx, _, err := openVaultDirectory(second_root, false)
	if err != nil {
		t.Fatalf("open cloned vault: %v", err)
	}
	setActiveVault(second_ctx)
	if _, err := configure_vault_github_sync(context.Background(), second_ctx, GitHubGitSyncConfig{RemoteURL: remote_root}); err != nil {
		t.Fatalf("configure cloned vault sync: %v", err)
	}
	second_driver, ok := second_ctx.sync_driver.(*github_git_sync_driver)
	if !ok {
		t.Fatalf("reloaded sync driver = %T, want github git driver", second_ctx.sync_driver)
	}
	second_projects, err := listVaultProjects(second_ctx)
	if err != nil {
		t.Fatalf("list cloned projects: %v", err)
	}
	if len(second_projects.Projects) != 1 || second_projects.Projects[0].Name != first_project.Name {
		t.Fatalf("cloned projects = %#v, want synced project", second_projects.Projects)
	}

	second_memo, err := createVaultMemo(first_ctx, MemoCreateRequest{Content: "second synced memo"})
	if err != nil {
		t.Fatalf("create second memo: %v", err)
	}
	push_result, err = first_driver.push(context.Background())
	if err != nil {
		t.Fatalf("push second memo: %v", err)
	}
	if !push_result.Changed {
		t.Fatalf("second push result = %#v, want changed", push_result)
	}

	pull_result, err := second_driver.pull(context.Background())
	if err != nil {
		t.Fatalf("pull cloned vault: %v", err)
	}
	if !pull_result.Changed || pull_result.Status.Dirty || pull_result.Status.Ahead != 0 || pull_result.Status.Behind != 0 {
		t.Fatalf("pull result = %#v", pull_result)
	}
	if _, err := second_ctx.fs.stat_file(second_memo.Path); err != nil {
		t.Fatalf("pulled memo %q: %v", second_memo.Path, err)
	}

	push_result, err = first_driver.push(context.Background())
	if err != nil {
		t.Fatalf("push unchanged vault: %v", err)
	}
	if push_result.Changed {
		t.Fatalf("unchanged push result = %#v", push_result)
	}
}

func TestGitHubGitSyncValidationAndStatusParsing(t *testing.T) {
	for _, provider := range []string{"local", "github", "git", "s3", "r2"} {
		if !sync_provider_uses_local_directory(provider) {
			t.Fatalf("provider %q should use a local directory", provider)
		}
	}
	if sync_provider_uses_local_directory("remote-only") {
		t.Fatal("remote-only provider should not use a local directory")
	}

	t.Setenv("GIT_DIR", "/tmp/should-not-be-inherited")
	t.Setenv("GIT_CONFIG_KEY_0", "core.sshCommand")
	for _, item := range safe_git_environment() {
		if strings.HasPrefix(item, "GIT_DIR=") || strings.HasPrefix(item, "GIT_CONFIG_KEY_0=") {
			t.Fatalf("unsafe git environment was inherited: %s", item)
		}
	}

	for _, remote_url := range []string{
		"https://token@github.com/example/repo.git",
		"oauth2:token@github.com/example/repo.git",
		"ext::sh -c dangerous",
		"-upload-pack=command",
	} {
		if err := validate_git_remote_url(remote_url); err == nil {
			t.Fatalf("remote URL %q should be rejected", remote_url)
		}
	}
	for _, remote_url := range []string{
		"https://github.com/example/repo.git",
		"git@github.com:example/repo.git",
		"ssh://git@github.com/example/repo.git",
	} {
		if err := validate_git_remote_url(remote_url); err != nil {
			t.Fatalf("remote URL %q: %v", remote_url, err)
		}
	}

	dirty, conflicted := parse_git_porcelain_status(" M memo/a.md\n?? memo/b.md")
	if !dirty || conflicted {
		t.Fatalf("ordinary status = dirty:%t conflicted:%t", dirty, conflicted)
	}
	dirty, conflicted = parse_git_porcelain_status("UU memo/a.md")
	if !dirty || !conflicted {
		t.Fatalf("conflict status = dirty:%t conflicted:%t", dirty, conflicted)
	}

	merged := merge_managed_gitignore("custom.tmp\n")
	if !strings.Contains(merged, "custom.tmp") ||
		!strings.Contains(merged, ".velo/memo-index.db*") ||
		!strings.Contains(merged, ".velo/storage.json") {
		t.Fatalf("managed gitignore = %q", merged)
	}
	if updated := merge_managed_gitignore(merged); updated != merged {
		t.Fatalf("managed gitignore is not idempotent:\n%s", updated)
	}
	legacy_merged := merge_managed_gitignore(".velo\n")
	if strings.Contains(legacy_merged, "!.velo/") {
		t.Fatalf("legacy .velo ignore should remain effective:\n%s", legacy_merged)
	}
}

func run_git_test(t *testing.T, directory string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = directory
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %s: %v", strings.Join(args, " "), strings.TrimSpace(string(output)), err)
	}
	return strings.TrimSpace(string(output))
}

func contains_git_path(output string, target string) bool {
	for _, path := range strings.Split(output, "\n") {
		if strings.TrimSpace(path) == target {
			return true
		}
	}
	return false
}
