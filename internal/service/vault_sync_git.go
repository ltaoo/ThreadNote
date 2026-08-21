package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	default_git_remote_name    = "origin"
	default_git_branch         = "main"
	default_git_commit_message = "Velo sync"
	git_status_timeout         = 15 * time.Second
	git_sync_timeout           = 2 * time.Minute
)

const managed_gitignore_start = "# >>> Velo machine-local files >>>"
const managed_gitignore_end = "# <<< Velo machine-local files <<<"

var managed_gitignore_patterns = []string{
	".velo/storage.json",
	".velo/sync-state.json",
	".velo-write-test-*",
	"storage/",
	".DS_Store",
}

type git_command_result struct {
	exit_code int
	output    string
	run_err   error
}

type git_command_runner interface {
	run(ctx context.Context, directory string, args ...string) git_command_result
}

type git_cli_runner struct{}

func (git_cli_runner) run(ctx context.Context, directory string, args ...string) git_command_result {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = directory
	cmd.Env = append(safe_git_environment(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C")
	output, err := cmd.CombinedOutput()
	result := git_command_result{exit_code: 0, output: strings.TrimSpace(string(output)), run_err: err}
	if err == nil {
		return result
	}
	result.exit_code = -1
	var exit_err *exec.ExitError
	if errors.As(err, &exit_err) {
		result.exit_code = exit_err.ExitCode()
	}
	return result
}

type github_git_sync_driver struct {
	config       GitHubGitSyncConfig
	mutex        sync.Mutex
	root_dir     string
	runner       git_command_runner
	workspace_fs vault_fs
}

func new_github_git_sync_driver(root_dir string, workspace_fs vault_fs, config GitHubGitSyncConfig, runner git_command_runner) (*github_git_sync_driver, error) {
	clean_root, err := filepath.Abs(strings.TrimSpace(root_dir))
	if err != nil {
		return nil, err
	}
	if clean_root == "" || workspace_fs == nil {
		return nil, fmt.Errorf("git sync requires a local vault")
	}
	if runner == nil {
		runner = git_cli_runner{}
	}
	config, err = normalize_github_git_sync_config(config)
	if err != nil {
		return nil, err
	}
	return &github_git_sync_driver{
		config:       config,
		root_dir:     filepath.Clean(clean_root),
		runner:       runner,
		workspace_fs: workspace_fs,
	}, nil
}

func (driver *github_git_sync_driver) provider() string {
	return vault_sync_provider_github
}

func (driver *github_git_sync_driver) configure(ctx context.Context) (GitHubGitSyncConfig, error) {
	driver.mutex.Lock()
	defer driver.mutex.Unlock()

	operation_ctx, cancel := context.WithTimeout(ctx, git_sync_timeout)
	defer cancel()

	initialized, err := driver.is_repository(operation_ctx)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	config := driver.config
	if !initialized {
		if _, err := driver.run_required(operation_ctx, "initialize git repository", "init"); err != nil {
			return GitHubGitSyncConfig{}, err
		}
		if config.Branch == "" {
			config.Branch = default_git_branch
		}
	}

	current_branch, err := driver.current_branch(operation_ctx)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if config.Branch == "" {
		config.Branch = firstNonEmpty(current_branch, default_git_branch)
	}
	if _, err := driver.run_required(operation_ctx, "validate git branch", "check-ref-format", "--branch", config.Branch); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	head_revision, err := driver.head_revision(operation_ctx)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if head_revision == "" {
		if current_branch != config.Branch {
			if _, err := driver.run_required(operation_ctx, "select git branch", "symbolic-ref", "HEAD", "refs/heads/"+config.Branch); err != nil {
				return GitHubGitSyncConfig{}, err
			}
		}
	} else if current_branch == "" {
		return GitHubGitSyncConfig{}, fmt.Errorf("git repository is in detached HEAD state")
	} else if current_branch != config.Branch {
		return GitHubGitSyncConfig{}, fmt.Errorf("current git branch is %q; switch to %q before configuring sync", current_branch, config.Branch)
	}

	remote_url, remote_exists, err := driver.remote_url(operation_ctx, config.RemoteName)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if config.RemoteURL == "" {
		config.RemoteURL = remote_url
	}
	if config.RemoteURL == "" {
		return GitHubGitSyncConfig{}, fmt.Errorf("git remote URL is required")
	}
	if err := validate_git_remote_url(config.RemoteURL); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if !remote_exists {
		if _, err := driver.run_required(operation_ctx, "add git remote", "remote", "add", config.RemoteName, config.RemoteURL); err != nil {
			return GitHubGitSyncConfig{}, err
		}
	} else if remote_url != config.RemoteURL {
		if _, err := driver.run_required(operation_ctx, "update git remote", "remote", "set-url", config.RemoteName, config.RemoteURL); err != nil {
			return GitHubGitSyncConfig{}, err
		}
	}
	if err := driver.ensure_gitignore(); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	driver.config = config
	return config, nil
}

func (driver *github_git_sync_driver) status(ctx context.Context) (sync_status, error) {
	driver.mutex.Lock()
	defer driver.mutex.Unlock()
	operation_ctx, cancel := context.WithTimeout(ctx, git_status_timeout)
	defer cancel()
	return driver.status_unlocked(operation_ctx)
}

func (driver *github_git_sync_driver) pull(ctx context.Context) (sync_result, error) {
	driver.mutex.Lock()
	defer driver.mutex.Unlock()
	operation_ctx, cancel := context.WithTimeout(ctx, git_sync_timeout)
	defer cancel()

	status, err := driver.status_unlocked(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	if !status.Initialized {
		return sync_result{Status: status}, fmt.Errorf("git repository is not initialized")
	}
	if status.Conflicted {
		return sync_result{Status: status}, fmt.Errorf("git repository has unresolved conflicts")
	}
	if status.Dirty {
		return sync_result{Status: status}, fmt.Errorf("git working tree has local changes; push or commit them before pull")
	}
	config, err := driver.operation_config(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	old_revision, err := driver.head_revision(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	if _, err := driver.run_required(operation_ctx, "fetch git remote", "fetch", "--prune", config.RemoteName, config.Branch); err != nil {
		return sync_result{Status: status}, err
	}
	if old_revision == "" {
		if _, err := driver.run_required(operation_ctx, "checkout fetched branch", "checkout", "-B", config.Branch, "FETCH_HEAD"); err != nil {
			return sync_result{Status: status}, err
		}
	} else {
		if _, err := driver.run_required(operation_ctx, "fast-forward git branch", "merge", "--ff-only", "FETCH_HEAD"); err != nil {
			return sync_result{Status: status}, err
		}
	}
	if _, err := driver.run_required(operation_ctx, "set git upstream", "branch", "--set-upstream-to="+config.RemoteName+"/"+config.Branch, config.Branch); err != nil {
		return sync_result{Status: status}, err
	}
	new_revision, err := driver.head_revision(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	status, err = driver.status_unlocked(operation_ctx)
	return sync_result{Changed: old_revision != new_revision, Conflicts: []string{}, Status: status}, err
}

func (driver *github_git_sync_driver) push(ctx context.Context) (sync_result, error) {
	driver.mutex.Lock()
	defer driver.mutex.Unlock()
	operation_ctx, cancel := context.WithTimeout(ctx, git_sync_timeout)
	defer cancel()

	initialized, err := driver.is_repository(operation_ctx)
	if err != nil {
		return sync_result{}, err
	}
	if !initialized {
		return sync_result{Status: sync_status{Provider: driver.provider()}}, fmt.Errorf("git repository is not initialized")
	}
	if err := driver.ensure_gitignore(); err != nil {
		return sync_result{}, err
	}
	status, err := driver.status_unlocked(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	if status.Conflicted {
		return sync_result{Status: status}, fmt.Errorf("git repository has unresolved conflicts")
	}
	tracked_machine_local, err := driver.tracked_machine_local_paths(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	if len(tracked_machine_local) > 0 {
		return sync_result{Status: status}, fmt.Errorf("refusing to sync machine-local files already tracked by git: %s", strings.Join(tracked_machine_local, ", "))
	}
	if _, err := driver.run_required(operation_ctx, "stage vault changes", "add", "--all", "--", "."); err != nil {
		return sync_result{Status: status}, err
	}
	staged_result := driver.runner.run(operation_ctx, driver.root_dir, "diff", "--cached", "--quiet", "--exit-code")
	staged_changes := staged_result.exit_code == 1
	if staged_result.run_err != nil && !staged_changes {
		return sync_result{Status: status}, git_command_error("inspect staged vault changes", staged_result)
	}
	if staged_changes {
		if _, err := driver.run_required(operation_ctx, "commit vault changes", "commit", "-m", driver.config.CommitMessage); err != nil {
			return sync_result{Status: status}, err
		}
	}
	head_revision, err := driver.head_revision(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	if head_revision == "" {
		return sync_result{Status: status}, fmt.Errorf("vault has no changes to commit or push")
	}
	config, err := driver.operation_config(operation_ctx)
	if err != nil {
		return sync_result{Status: status}, err
	}
	changed := staged_changes || status.Ahead > 0
	if _, err := driver.run_required(operation_ctx, "push vault changes", "push", "--set-upstream", config.RemoteName, "HEAD:refs/heads/"+config.Branch); err != nil {
		return sync_result{Changed: changed, Status: status}, err
	}
	status, err = driver.status_unlocked(operation_ctx)
	return sync_result{Changed: changed, Conflicts: []string{}, Status: status}, err
}

func (driver *github_git_sync_driver) status_unlocked(ctx context.Context) (sync_status, error) {
	status := sync_status{Provider: driver.provider(), Remote: driver.config.RemoteName}
	initialized, err := driver.is_repository(ctx)
	if err != nil {
		return status, err
	}
	status.Initialized = initialized
	if !initialized {
		return status, nil
	}
	status.Branch, err = driver.current_branch(ctx)
	if err != nil {
		return status, err
	}
	porcelain, err := driver.run_required(ctx, "read git status", "status", "--porcelain=v1", "--untracked-files=normal")
	if err != nil {
		return status, err
	}
	status.Dirty, status.Conflicted = parse_git_porcelain_status(porcelain)

	upstream_result := driver.runner.run(ctx, driver.root_dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
	if upstream_result.run_err == nil {
		status.Upstream = strings.TrimSpace(upstream_result.output)
	} else if upstream_result.exit_code < 0 {
		return status, git_command_error("read git upstream", upstream_result)
	}
	head_revision, err := driver.head_revision(ctx)
	if err != nil {
		return status, err
	}
	if head_revision == "" {
		return status, nil
	}
	if status.Upstream != "" {
		counts, err := driver.run_required(ctx, "compare git upstream", "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
		if err != nil {
			return status, err
		}
		fields := strings.Fields(counts)
		if len(fields) == 2 {
			status.Ahead, _ = strconv.Atoi(fields[0])
			status.Behind, _ = strconv.Atoi(fields[1])
		}
	} else {
		count, err := driver.run_required(ctx, "count local git commits", "rev-list", "--count", "HEAD")
		if err != nil {
			return status, err
		}
		status.Ahead, _ = strconv.Atoi(strings.TrimSpace(count))
	}
	status.Diverged = status.Ahead > 0 && status.Behind > 0
	return status, nil
}

func (driver *github_git_sync_driver) operation_config(ctx context.Context) (GitHubGitSyncConfig, error) {
	config := driver.config
	if config.Branch == "" {
		branch, err := driver.current_branch(ctx)
		if err != nil {
			return GitHubGitSyncConfig{}, err
		}
		config.Branch = branch
	}
	if config.Branch == "" {
		return GitHubGitSyncConfig{}, fmt.Errorf("git branch is required")
	}
	remote_url, exists, err := driver.remote_url(ctx, config.RemoteName)
	if err != nil {
		return GitHubGitSyncConfig{}, err
	}
	if !exists {
		return GitHubGitSyncConfig{}, fmt.Errorf("git remote %q is not configured", config.RemoteName)
	}
	if err := validate_git_remote_url(remote_url); err != nil {
		return GitHubGitSyncConfig{}, err
	}
	config.RemoteURL = remote_url
	return config, nil
}

func (driver *github_git_sync_driver) is_repository(ctx context.Context) (bool, error) {
	result := driver.runner.run(ctx, driver.root_dir, "rev-parse", "--is-inside-work-tree")
	if result.run_err == nil {
		return strings.TrimSpace(result.output) == "true", nil
	}
	if result.exit_code >= 0 {
		return false, nil
	}
	return false, git_command_error("detect git repository", result)
}

func (driver *github_git_sync_driver) current_branch(ctx context.Context) (string, error) {
	result := driver.runner.run(ctx, driver.root_dir, "symbolic-ref", "--quiet", "--short", "HEAD")
	if result.run_err == nil {
		return strings.TrimSpace(result.output), nil
	}
	if result.exit_code >= 0 {
		return "", nil
	}
	return "", git_command_error("read current git branch", result)
}

func (driver *github_git_sync_driver) head_revision(ctx context.Context) (string, error) {
	result := driver.runner.run(ctx, driver.root_dir, "rev-parse", "--verify", "HEAD")
	if result.run_err == nil {
		return strings.TrimSpace(result.output), nil
	}
	if result.exit_code >= 0 {
		return "", nil
	}
	return "", git_command_error("read git HEAD", result)
}

func (driver *github_git_sync_driver) remote_url(ctx context.Context, remote_name string) (string, bool, error) {
	result := driver.runner.run(ctx, driver.root_dir, "remote", "get-url", remote_name)
	if result.run_err == nil {
		return strings.TrimSpace(result.output), true, nil
	}
	if result.exit_code >= 0 {
		return "", false, nil
	}
	return "", false, git_command_error("read git remote", result)
}

func (driver *github_git_sync_driver) tracked_machine_local_paths(ctx context.Context) ([]string, error) {
	output, err := driver.run_required(ctx, "inspect tracked machine-local files", "ls-files", "--", ".velo/storage.json", ".velo/sync-state.json", "storage")
	if err != nil {
		return nil, err
	}
	paths := []string{}
	for _, path := range strings.Split(output, "\n") {
		path = strings.TrimSpace(path)
		if path != "" {
			paths = append(paths, path)
		}
	}
	return paths, nil
}

func (driver *github_git_sync_driver) ensure_gitignore() error {
	raw, err := driver.workspace_fs.read_file(".gitignore")
	if err != nil && !is_vault_file_not_exist(err) {
		return err
	}
	next := merge_managed_gitignore(string(raw))
	if next == string(raw) {
		return nil
	}
	return driver.workspace_fs.write_file_atomic(".gitignore", []byte(next), 0644)
}

func (driver *github_git_sync_driver) run_required(ctx context.Context, operation string, args ...string) (string, error) {
	result := driver.runner.run(ctx, driver.root_dir, args...)
	if result.run_err != nil {
		return "", git_command_error(operation, result)
	}
	return result.output, nil
}

func normalize_github_git_sync_config(config GitHubGitSyncConfig) (GitHubGitSyncConfig, error) {
	config.RemoteName = strings.TrimSpace(config.RemoteName)
	if config.RemoteName == "" {
		config.RemoteName = default_git_remote_name
	}
	if !is_safe_git_name(config.RemoteName) {
		return GitHubGitSyncConfig{}, fmt.Errorf("invalid git remote name: %s", config.RemoteName)
	}
	config.Branch = strings.TrimSpace(config.Branch)
	if config.Branch != "" && !is_safe_git_branch(config.Branch) {
		return GitHubGitSyncConfig{}, fmt.Errorf("invalid git branch: %s", config.Branch)
	}
	config.RemoteURL = strings.TrimSpace(config.RemoteURL)
	if config.RemoteURL != "" {
		if err := validate_git_remote_url(config.RemoteURL); err != nil {
			return GitHubGitSyncConfig{}, err
		}
	}
	config.CommitMessage = strings.TrimSpace(config.CommitMessage)
	if config.CommitMessage == "" {
		config.CommitMessage = default_git_commit_message
	}
	return config, nil
}

func validate_git_remote_url(remote_url string) error {
	remote_url = strings.TrimSpace(remote_url)
	if remote_url == "" {
		return fmt.Errorf("git remote URL is required")
	}
	if strings.HasPrefix(remote_url, "-") || strings.ContainsAny(remote_url, "\r\n\x00") {
		return fmt.Errorf("invalid git remote URL")
	}
	if strings.Contains(remote_url, "://") {
		parsed_url, err := url.Parse(remote_url)
		if err != nil || parsed_url.Scheme == "" {
			return fmt.Errorf("invalid git remote URL")
		}
		switch strings.ToLower(parsed_url.Scheme) {
		case "https", "ssh", "git", "file":
		default:
			return fmt.Errorf("unsupported git remote URL scheme: %s", parsed_url.Scheme)
		}
		if parsed_url.User != nil {
			_, has_password := parsed_url.User.Password()
			if parsed_url.Scheme == "ssh" && parsed_url.User.Username() == "git" && !has_password {
				return nil
			}
			return fmt.Errorf("git remote URL must not contain credentials; use SSH keys or a Git credential helper")
		}
		return nil
	}
	at_index := strings.Index(remote_url, "@")
	if at_index >= 0 && remote_url[:at_index] != "git" {
		return fmt.Errorf("git remote URL must not contain embedded credentials")
	}
	if strings.HasPrefix(remote_url, "ext::") {
		return fmt.Errorf("unsupported git remote URL")
	}
	return nil
}

func is_safe_git_name(value string) bool {
	if value == "" || strings.HasPrefix(value, "-") {
		return false
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' || char == '.' {
			continue
		}
		return false
	}
	return true
}

func is_safe_git_branch(value string) bool {
	if value == "" || strings.HasPrefix(value, "-") || strings.HasPrefix(value, ".") || strings.HasPrefix(value, "/") || strings.HasSuffix(value, ".") || strings.HasSuffix(value, "/") || strings.HasSuffix(value, ".lock") {
		return false
	}
	if strings.Contains(value, "..") || strings.Contains(value, "//") || strings.Contains(value, "@{") || strings.ContainsAny(value, " ~^:?*[\\\r\n\x00") {
		return false
	}
	return true
}

func safe_git_environment() []string {
	blocked_names := map[string]bool{
		"GIT_ALTERNATE_OBJECT_DIRECTORIES": true,
		"GIT_COMMON_DIR":                   true,
		"GIT_CONFIG_COUNT":                 true,
		"GIT_CONFIG_PARAMETERS":            true,
		"GIT_DIR":                          true,
		"GIT_INDEX_FILE":                   true,
		"GIT_OBJECT_DIRECTORY":             true,
		"GIT_WORK_TREE":                    true,
	}
	environment := []string{}
	for _, item := range os.Environ() {
		name, _, _ := strings.Cut(item, "=")
		if blocked_names[name] || strings.HasPrefix(name, "GIT_CONFIG_KEY_") || strings.HasPrefix(name, "GIT_CONFIG_VALUE_") {
			continue
		}
		environment = append(environment, item)
	}
	return environment
}

func merge_managed_gitignore(current string) string {
	managed_lines := append([]string{managed_gitignore_start}, managed_gitignore_patterns...)
	managed_lines = append(managed_lines, managed_gitignore_end)
	managed_block := strings.Join(managed_lines, "\n")
	start_index := strings.Index(current, managed_gitignore_start)
	end_index := strings.Index(current, managed_gitignore_end)
	if start_index >= 0 && end_index >= start_index {
		end_index += len(managed_gitignore_end)
		next := current[:start_index] + managed_block + current[end_index:]
		return strings.TrimRight(next, "\n") + "\n"
	}
	trimmed := strings.TrimRight(current, "\n")
	if trimmed == "" {
		return managed_block + "\n"
	}
	return trimmed + "\n\n" + managed_block + "\n"
}

func parse_git_porcelain_status(output string) (bool, bool) {
	dirty := false
	conflicted := false
	for _, line := range strings.Split(output, "\n") {
		if len(line) < 2 {
			continue
		}
		dirty = true
		status_code := line[:2]
		if status_code == "DD" || status_code == "AU" || status_code == "UD" || status_code == "UA" || status_code == "DU" || status_code == "AA" || status_code == "UU" || status_code[0] == 'U' || status_code[1] == 'U' {
			conflicted = true
		}
	}
	return dirty, conflicted
}

func git_command_error(operation string, result git_command_result) error {
	if result.run_err == nil {
		return nil
	}
	message := strings.TrimSpace(result.output)
	if len(message) > 4096 {
		message = message[:4096]
	}
	if message == "" {
		return fmt.Errorf("%s: %w", operation, result.run_err)
	}
	return fmt.Errorf("%s: %s: %w", operation, message, result.run_err)
}
