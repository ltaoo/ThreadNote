# Service package

`internal/service` owns the ThreadNote application runtime and its business
services. Keep each domain or independently testable service in its own Go
file; route files are transport adapters and should not accumulate domain
rules.

## File ownership

- Vault and workspace: `vault_project.go`, `vault_fs.go`, `vault_sync.go`,
  `vault_sync_git.go`
- Project: `project.go`
- Memo: `memo.go`, with focused supporting services in `memo_*.go`
- Task: `task.go`, with persistence, index, note, and memo-sync services in
  `task_*.go` and `memo_task_*.go`
- Milestones and boards: `gtd_milestone.go`, `board.go`, `board_rule.go`
- Storage: `cloud_storage_settings.go`, `oss_storage.go`, `oss_local.go`,
  `oss_helpers.go`
- Hooks and integrations: `hook.go`, `routes_memo_agent.go`, `snippets.go`
- Desktop runtime: `app.go`, `desktop_*.go`, `window_registry.go`
- Transport adapters: `api_routes.go`, `routes_*.go`,
  `external_api_server.go`
- Updates and platform lifecycle: `application_updater.go`, `self_update_source.go`,
  `updater_download.go`, `update_*.go`, `quit_application_*.go`

`internal/desktopapp` must stay limited to the stable public entry point and
desktop-specific child packages such as `windowing`, `platform`, and
`external`.
