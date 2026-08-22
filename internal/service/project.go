package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type ProjectFile struct {
	ActiveProjectID string          `json:"activeProjectId"`
	Projects        []ProjectRecord `json:"projects"`
	SchemaVersion   int             `json:"schemaVersion"`
}

type ProjectRecord struct {
	Archived  bool   `json:"archived"`
	Color     string `json:"color"`
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	UpdatedAt string `json:"updatedAt"`
}
type ProjectCreateRequest struct {
	Color string `json:"color"`
	Name  string `json:"name"`
}

type ProjectUpdateRequest struct {
	Archived  *bool   `json:"archived"`
	Color     *string `json:"color"`
	ID        string  `json:"id"`
	Name      *string `json:"name"`
	SortOrder *int    `json:"sortOrder"`
}

type ProjectActivateRequest struct {
	ProjectID string `json:"projectId"`
}

func loadVaultProjects(ctx *VaultContext) (ProjectFile, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return ProjectFile{}, err
	}
	raw, source_path, err := read_vault_projects_file(workspace_fs)
	if err != nil {
		return ProjectFile{}, fmt.Errorf("read projects: %w", err)
	}
	if source_path == "" {
		return ProjectFile{SchemaVersion: vaultSchemaVersion, Projects: []ProjectRecord{}}, nil
	}

	file := ProjectFile{SchemaVersion: vaultSchemaVersion, Projects: []ProjectRecord{}}
	if len(bytes.TrimSpace(raw)) == 0 {
		file = normalizeProjectFile(file)
	} else {
		if err := json.Unmarshal(raw, &file); err != nil {
			return ProjectFile{}, fmt.Errorf("read projects: %w", err)
		}
		file = normalizeProjectFile(file)
	}
	if source_path == legacy_vault_projects_path() {
		if err := saveVaultProjects(ctx, file); err != nil {
			return ProjectFile{}, fmt.Errorf("migrate projects to vault root: %w", err)
		}
	}
	return file, nil
}

func read_vault_projects_file(workspace_fs vault_fs) ([]byte, string, error) {
	for _, path := range []string{vault_projects_path(), legacy_vault_projects_path()} {
		raw, err := workspace_fs.read_file(path)
		if err == nil {
			return raw, path, nil
		}
		if !is_vault_file_not_exist(err) {
			return nil, "", err
		}
	}
	return nil, "", nil
}

func vault_projects_path() string {
	return vaultProjectsFileName
}

func legacy_vault_projects_path() string {
	return filepath.ToSlash(filepath.Join(vaultConfigDirName, vaultProjectsFileName))
}

func normalizeProjectFile(file ProjectFile) ProjectFile {
	if file.SchemaVersion == 0 {
		file.SchemaVersion = vaultSchemaVersion
	}
	projects := make([]ProjectRecord, 0, len(file.Projects))
	seen := map[string]bool{}
	for _, project := range file.Projects {
		project.ID = sanitizeProjectID(project.ID)
		project.Name = strings.TrimSpace(project.Name)
		if project.ID == "" || project.Name == "" || seen[project.ID] {
			continue
		}
		project.Color = normalizeProjectColor(project.Color)
		seen[project.ID] = true
		projects = append(projects, project)
	}
	sort.SliceStable(projects, func(i, j int) bool {
		if projects[i].SortOrder == projects[j].SortOrder {
			return projects[i].CreatedAt < projects[j].CreatedAt
		}
		return projects[i].SortOrder < projects[j].SortOrder
	})
	file.Projects = projects
	file.ActiveProjectID = sanitizeProjectID(file.ActiveProjectID)
	if file.ActiveProjectID != "" && !projectFileHasID(file, file.ActiveProjectID) {
		file.ActiveProjectID = ""
	}
	return file
}

func saveVaultProjects(ctx *VaultContext, file ProjectFile) error {
	file = normalizeProjectFile(file)
	file.SchemaVersion = vaultSchemaVersion
	if err := write_vault_json_file_atomic(ctx, vault_projects_path(), file); err != nil {
		return err
	}
	workspace_fs, err := require_vault_fs(ctx)
	if err == nil {
		_ = workspace_fs.remove_file(legacy_vault_projects_path())
	}
	return nil
}

func listVaultProjects(ctx *VaultContext) (ProjectFile, error) {
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return ProjectFile{}, err
	}
	return file, nil
}

func ensure_vault_projects_from_memos(vault_ctx *VaultContext) error {
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		return err
	}
	if _, err := loadVaultProjects(vault_ctx); err != nil {
		return err
	}
	projects_path := vault_projects_path()
	if _, err := workspace_fs.stat_file(projects_path); err == nil {
		return nil
	} else if !is_vault_file_not_exist(err) {
		return fmt.Errorf("stat projects: %w", err)
	}

	project_created_at, err := collect_memo_project_references(vault_ctx)
	if err != nil {
		return fmt.Errorf("scan memo projects: %w", err)
	}
	if len(project_created_at) == 0 {
		return nil
	}

	project_file := recover_project_file_from_registry(vault_ctx, project_created_at)
	project_file = add_missing_recovered_projects(project_file, project_created_at)
	if len(project_file.Projects) == 0 {
		return nil
	}
	if project_file.ActiveProjectID == "" {
		project_file.ActiveProjectID = project_file.Projects[0].ID
	}
	return saveVaultProjects(vault_ctx, project_file)
}

func collect_memo_project_references(vault_ctx *VaultContext) (map[string]string, error) {
	workspace_fs, err := require_vault_fs(vault_ctx)
	if err != nil {
		return nil, err
	}
	project_created_at := map[string]string{}
	err = workspace_fs.walk_dir(vaultMemoDirName, func(path string, entry fs.DirEntry, walk_err error) error {
		if walk_err != nil {
			return walk_err
		}
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			return nil
		}
		raw, err := workspace_fs.read_file(path)
		if err != nil {
			return err
		}
		meta, _ := parseMemoMarkdown(string(raw))
		project_id := sanitizeProjectID(meta["projectId"])
		if project_id == "" {
			return nil
		}
		created_at := strings.TrimSpace(firstNonEmpty(meta["createdAt"], meta["created_at"]))
		current_created_at := project_created_at[project_id]
		if current_created_at == "" || (created_at != "" && created_at < current_created_at) {
			project_created_at[project_id] = created_at
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return project_created_at, nil
}

func recover_project_file_from_registry(vault_ctx *VaultContext, project_created_at map[string]string) ProjectFile {
	recovered_file := ProjectFile{SchemaVersion: vaultSchemaVersion, Projects: []ProjectRecord{}}
	registry, err := loadVaultRegistry()
	if err != nil {
		return recovered_file
	}

	best_file := ProjectFile{}
	best_match_count := 0
	for _, vault_entry := range registry.Vaults {
		if samePath(vault_entry.Path, vault_ctx.RootDir) {
			continue
		}
		source_fs, err := new_local_vault_fs(vault_entry.Path)
		if err != nil {
			continue
		}
		raw, _, err := read_vault_projects_file(source_fs)
		if err != nil || len(bytes.TrimSpace(raw)) == 0 {
			continue
		}
		var source_file ProjectFile
		if err := json.Unmarshal(raw, &source_file); err != nil {
			continue
		}
		source_file = normalizeProjectFile(source_file)
		match_count := 0
		for _, project := range source_file.Projects {
			if _, exists := project_created_at[project.ID]; exists {
				match_count++
			}
		}
		if match_count > best_match_count {
			best_file = source_file
			best_match_count = match_count
		}
	}
	if best_match_count == 0 {
		return recovered_file
	}

	if best_match_count == len(project_created_at) && len(project_created_at) > 1 {
		return best_file
	}
	for _, project := range best_file.Projects {
		if _, exists := project_created_at[project.ID]; exists {
			recovered_file.Projects = append(recovered_file.Projects, project)
		}
	}
	if projectFileHasID(recovered_file, best_file.ActiveProjectID) {
		recovered_file.ActiveProjectID = best_file.ActiveProjectID
	}
	return recovered_file
}

func add_missing_recovered_projects(project_file ProjectFile, project_created_at map[string]string) ProjectFile {
	project_file = normalizeProjectFile(project_file)
	existing_ids := map[string]bool{}
	max_sort_order := -1
	for _, project := range project_file.Projects {
		existing_ids[project.ID] = true
		if project.SortOrder > max_sort_order {
			max_sort_order = project.SortOrder
		}
	}
	missing_ids := make([]string, 0)
	for project_id := range project_created_at {
		if !existing_ids[project_id] {
			missing_ids = append(missing_ids, project_id)
		}
	}
	sort.Strings(missing_ids)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, project_id := range missing_ids {
		created_at := strings.TrimSpace(project_created_at[project_id])
		if parseMemoTime(created_at).IsZero() {
			created_at = now
		}
		max_sort_order++
		project_file.Projects = append(project_file.Projects, ProjectRecord{
			Archived:  false,
			Color:     normalizeProjectColor(""),
			CreatedAt: created_at,
			ID:        project_id,
			Name:      project_id,
			SortOrder: max_sort_order,
			UpdatedAt: created_at,
		})
	}
	return normalizeProjectFile(project_file)
}

func createVaultProject(ctx *VaultContext, req ProjectCreateRequest) (ProjectRecord, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return ProjectRecord{}, fmt.Errorf("project name is required")
	}
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return ProjectRecord{}, err
	}
	sortOrder := len(file.Projects)
	for _, project := range file.Projects {
		if project.SortOrder >= sortOrder {
			sortOrder = project.SortOrder + 1
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	project := ProjectRecord{
		Archived:  false,
		Color:     normalizeProjectColor(req.Color),
		CreatedAt: now,
		ID:        newProjectID(),
		Name:      name,
		SortOrder: sortOrder,
		UpdatedAt: now,
	}
	file.Projects = append(file.Projects, project)
	if file.ActiveProjectID == "" {
		file.ActiveProjectID = project.ID
	}
	if err := saveVaultProjects(ctx, file); err != nil {
		return ProjectRecord{}, err
	}
	return project, nil
}

func updateVaultProject(ctx *VaultContext, req ProjectUpdateRequest) (ProjectRecord, error) {
	id := sanitizeProjectID(req.ID)
	if id == "" {
		return ProjectRecord{}, fmt.Errorf("project id is required")
	}
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return ProjectRecord{}, err
	}
	for i, project := range file.Projects {
		if project.ID != id {
			continue
		}
		if req.Name != nil {
			name := strings.TrimSpace(*req.Name)
			if name == "" {
				return ProjectRecord{}, fmt.Errorf("project name is required")
			}
			project.Name = name
		}
		if req.Color != nil {
			project.Color = normalizeProjectColor(*req.Color)
		}
		if req.Archived != nil {
			project.Archived = *req.Archived
		}
		if req.SortOrder != nil {
			project.SortOrder = *req.SortOrder
		}
		project.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		file.Projects[i] = project
		if err := saveVaultProjects(ctx, file); err != nil {
			return ProjectRecord{}, err
		}
		return project, nil
	}
	return ProjectRecord{}, fmt.Errorf("project not found: %s", id)
}

func activateVaultProject(ctx *VaultContext, projectID string) (ProjectFile, error) {
	projectID = sanitizeProjectID(projectID)
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return ProjectFile{}, err
	}
	if projectID != "" && !projectFileHasID(file, projectID) {
		return ProjectFile{}, fmt.Errorf("project not found: %s", projectID)
	}
	file.ActiveProjectID = projectID
	if err := saveVaultProjects(ctx, file); err != nil {
		return ProjectFile{}, err
	}
	return file, nil
}

func validateMemoProjectID(ctx *VaultContext, projectID string) (string, error) {
	projectID = sanitizeProjectID(projectID)
	if projectID == "" {
		return "", nil
	}
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return "", err
	}
	if !projectFileHasID(file, projectID) {
		return "", fmt.Errorf("project not found: %s", projectID)
	}
	return projectID, nil
}

func projectFileHasID(file ProjectFile, id string) bool {
	for _, project := range file.Projects {
		if project.ID == id {
			return true
		}
	}
	return false
}
func newProjectID() string {
	return "project_" + randomVaultSuffix()
}

func sanitizeProjectID(value string) string {
	id := strings.TrimSpace(value)
	if id == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func normalizeProjectColor(value string) string {
	color := strings.TrimSpace(value)
	if color == "" {
		return "#2563eb"
	}
	if matched, _ := regexp.MatchString(`^#[0-9a-fA-F]{6}$`, color); matched {
		return strings.ToLower(color)
	}
	return "#2563eb"
}

func resolveOrCreateProjectByName(ctx *VaultContext, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	file, err := loadVaultProjects(ctx)
	if err != nil {
		return "", err
	}
	for _, project := range file.Projects {
		if !project.Archived && project.Name == name {
			return project.ID, nil
		}
	}
	created, err := createVaultProject(ctx, ProjectCreateRequest{Name: name})
	if err != nil {
		return "", err
	}
	return created.ID, nil
}
