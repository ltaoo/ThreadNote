package service

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"example/simple/internal/desktopapp/platform"

	"github.com/ltaoo/velo"
	"github.com/ltaoo/velo/store"
	"github.com/rs/zerolog"
)

func registerVaultProjectMemoRoutes(b *velo.Box, logger *zerolog.Logger) {
	b.Get("/api/ping", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"message": "pong"})
	})

	b.Get("/api/app", func(c *velo.BoxContext) interface{} {
		return c.Ok(velo.H{"version": appVersion(), "velo": velo.GetVersion(), "mode": appMode()})
	})

	b.Get("/api/vault/status", func(c *velo.BoxContext) interface{} {
		registry, err := loadVaultRegistry()
		if err != nil {
			return c.Error(err.Error())
		}
		dataPath, err := globalVaultDataPath()
		if err != nil {
			return c.Error(err.Error())
		}
		_, statErr := os.Stat(dataPath)
		return c.Ok(velo.H{
			"active":         activeVaultSnapshot(),
			"activeVaultId":  registry.ActiveVaultID,
			"dataFileExists": statErr == nil,
			"dataPath":       dataPath,
			"vaults":         registry.Vaults,
		})
	})

	b.Get("/api/vault/select-directory", func(c *velo.BoxContext) interface{} {
		path, err := platform.SelectVaultDirectory()
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"path": path})
	})

	b.Post("/api/vault/open", func(c *velo.BoxContext) interface{} {
		var req VaultOpenRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		ctx, existing, err := openVaultDirectory(req.Path, true)
		if err != nil {
			return c.Error(err.Error())
		}
		ctx.logger = logger
		registry, err := registerActiveVault(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		setActiveVault(ctx)
		setMainWindowPathname("/home/index")
		b.Store = store.NewWithDir(ctx.VeloDir)
		return c.Ok(velo.H{
			"active":   ctx,
			"created":  !existing,
			"existing": existing,
			"registry": registry,
		})
	})

	b.Get("/api/projects", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		file, err := listVaultProjects(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"activeProjectId": file.ActiveProjectID,
			"projects":        file.Projects,
		})
	})

	b.Post("/api/projects/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req ProjectCreateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		project, err := createVaultProject(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"project": project})
	})

	b.Post("/api/projects/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req ProjectUpdateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		project, err := updateVaultProject(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"project": project})
	})

	b.Post("/api/projects/activate", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req ProjectActivateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		file, err := activateVaultProject(ctx, req.ProjectID)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"activeProjectId": file.ActiveProjectID,
			"projects":        file.Projects,
		})
	})

	b.Get("/api/memos", func(c *velo.BoxContext) interface{} {
		started_at := time.Now()
		request_id := fmt.Sprintf("memo-page-%d", started_at.UnixNano())
		vault_ctx, err := requireActiveVault()
		if err != nil {
			logger.Error().Err(err).
				Str("component", "memo_pagination").
				Str("paginationStage", "route.vault").
				Str("requestId", request_id).
				Msg("memo page request failed before query")
			return c.Error(err.Error())
		}
		query, err := memo_list_query_from_context(c)
		if err != nil {
			logger.Error().Err(err).
				Str("component", "memo_pagination").
				Str("paginationStage", "route.parse").
				Str("requestId", request_id).
				Msg("memo page query parameters rejected")
			return c.Error(err.Error())
		}
		logger.Info().
			Str("component", "memo_pagination").
			Str("paginationStage", "route.start").
			Str("requestId", request_id).
			Int("limit", query.Limit).
			Bool("cursorPresent", strings.TrimSpace(query.Cursor) != "").
			Int("cursorLength", len(query.Cursor)).
			Msg("memo page request received")
		query_store, err := new_vault_memo_query_store(vault_ctx)
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "list.open", err)
			return c.Error(err.Error())
		}
		page, err := query_store.List(c.Context(), query)
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "list.query", err)
			return c.Error(err.Error())
		}
		redact_memo_page(vault_ctx, &page)
		logger.Info().
			Str("component", "memo_pagination").
			Str("paginationStage", "route.complete").
			Str("requestId", request_id).
			Int("memoCount", len(page.Memos)).
			Int("total", page.Total).
			Bool("hasMore", page.HasMore).
			Int("nextCursorLength", len(page.NextCursor)).
			Int64("durationMs", time.Since(started_at).Milliseconds()).
			Msg("memo page response returned")
		return c.Ok(velo.H{
			"hasMore":    page.HasMore,
			"memos":      page.Memos,
			"nextCursor": page.NextCursor,
			"total":      page.Total,
		})
	})

	b.Get("/api/memos/stats", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		query_store, err := new_vault_memo_query_store(vault_ctx)
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "stats.open", err)
			return c.Error(err.Error())
		}
		stats, err := query_store.Stats(c.Context())
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "stats.query", err)
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"stats": stats})
	})

	b.Get("/api/memos/get", func(c *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		memo_id := strings.TrimSpace(c.Query("id"))
		if memo_id == "" {
			return c.Error("id is required")
		}
		query_store, err := new_vault_memo_query_store(vault_ctx)
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "get.open", err)
			return c.Error(err.Error())
		}
		memo, err := query_store.Get(c.Context(), memo_id)
		if err != nil {
			log_memo_query_failure(logger, vault_ctx, "get.query", err)
			return c.Error(err.Error())
		}
		if isPrivateAndLocked(vault_ctx, memo.Private) {
			memo = redactPrivateMemo(memo)
		}
		return c.Ok(velo.H{"memo": memo})
	})

	b.Post("/api/memos/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoCreateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		memo, err := createVaultMemo(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"memo": memo})
	})

	b.Post("/api/memos/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoUpdateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		memo, err := updateVaultMemo(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"memo": memo})
	})

	b.Post("/api/memos/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoDeleteRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		cleanupAssets := true
		if req.CleanupAssets != nil {
			cleanupAssets = *req.CleanupAssets
		}
		deleteTasks := false
		if req.DeleteTasks != nil {
			deleteTasks = *req.DeleteTasks
		}
		result, err := deleteVaultMemoWithOptions(ctx, req.ID, MemoDeleteOptions{
			CleanupAssets:   cleanupAssets,
			DeleteTasks:     deleteTasks,
			Parent:          c.Context(),
			StorageSettings: b.Store.Get(cloudStorageSettingsKey),
			StorePath:       b.Store.Path(),
		})
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"assetErrors":   result.AssetErrors,
			"assetsDeleted": result.AssetsDeleted,
			"assetsSkipped": result.AssetsSkipped,
			"success":       true,
			"tasksDeleted":  result.TasksDeleted,
		})
	})

	b.Get("/api/memo-comments", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		comments, err := listVaultMemoComments(ctx, c.Query("memoId"))
		if err != nil {
			return c.Error(err.Error())
		}
		for i, comment := range comments {
			if isPrivateAndLocked(ctx, comment.Private) {
				comments[i] = redactPrivateComment(comment)
			}
		}
		return c.Ok(velo.H{"comments": comments})
	})

	b.Post("/api/memo-comments/create", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoCommentCreateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		comment, err := createVaultMemoComment(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		fireCommentHooks(ctx, "comment.created", comment)
		return c.Ok(velo.H{"comment": comment})
	})

	b.Post("/api/memo-comments/update", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoCommentUpdateRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		comment, err := updateVaultMemoComment(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		fireCommentHooks(ctx, "comment.updated", comment)
		return c.Ok(velo.H{"comment": comment})
	})

	b.Post("/api/memo-comments/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoCommentDeleteRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		// Read comment before deletion for hook payload.
		var deletedComment MemoCommentRecord
		if commentPath, verr := findMemoCommentFilePath(ctx, req.ID); verr == nil {
			if c, rerr := readMemoCommentFile(ctx, commentPath); rerr == nil {
				deletedComment = c
			}
		}
		cleanupAssets := true
		if req.CleanupAssets != nil {
			cleanupAssets = *req.CleanupAssets
		}
		result, err := deleteVaultMemoCommentWithOptions(ctx, req.ID, MemoDeleteOptions{
			CleanupAssets:   cleanupAssets,
			Parent:          c.Context(),
			StorageSettings: b.Store.Get(cloudStorageSettingsKey),
			StorePath:       b.Store.Path(),
		})
		if err != nil {
			return c.Error(err.Error())
		}
		if deletedComment.ID != "" {
			fireCommentHooks(ctx, "comment.deleted", deletedComment)
		}
		return c.Ok(velo.H{
			"assetErrors":   result.AssetErrors,
			"assetsDeleted": result.AssetsDeleted,
			"assetsSkipped": result.AssetsSkipped,
			"success":       true,
		})
	})

	// --- memo history ---

	b.Get("/api/memos/history/version", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		version, err := historyVersionFromQuery(c.Query("version"))
		if err != nil {
			return c.Error(err.Error())
		}
		mdPath, err := findMemoFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hp := memoHistoryPath(mdPath)
		content, err := rebuildHistoryVersion(ctx, hp, version)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, _ := loadHistoryFile(ctx, hp)
		return c.Ok(velo.H{"content": content, "version": version, "versions": hf.Versions})
	})

	b.Get("/api/memos/history", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		mdPath, err := findMemoFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, err := loadHistoryFile(ctx, memoHistoryPath(mdPath))
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"id": id, "versions": hf.Versions})
	})

	b.Post("/api/memos/history/restore", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			ID      string `json:"id"`
			Version int    `json:"version"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if strings.TrimSpace(req.ID) == "" {
			return c.Error("id is required")
		}
		mdPath, err := findMemoFilePath(ctx, req.ID)
		if err != nil {
			return c.Error(err.Error())
		}
		content, err := rebuildHistoryVersion(ctx, memoHistoryPath(mdPath), req.Version)
		if err != nil {
			return c.Error(err.Error())
		}
		// Restore by updating the memo content — this creates a new history version
		memo, err := updateVaultMemo(ctx, MemoUpdateRequest{
			ID:      req.ID,
			Content: &content,
		})
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"memo": memo})
	})

	b.Get("/api/memos/history/diff", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		version, err := historyVersionFromQuery(c.Query("version"))
		if err != nil {
			return c.Error(err.Error())
		}
		if version < 1 {
			return c.Error("version must be >= 1")
		}
		mdPath, err := findMemoFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, err := loadHistoryFile(ctx, memoHistoryPath(mdPath))
		if err != nil {
			return c.Error(err.Error())
		}
		if version > len(hf.Versions) {
			return c.Error("version not found")
		}
		entry := hf.Versions[version-1]
		return c.Ok(velo.H{
			"contentOps":    entry.ContentOps,
			"changedFields": entry.ChangedFields,
			"version":       version,
		})
	})

	// --- comment history ---

	b.Get("/api/memo-comments/history/version", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		version, err := historyVersionFromQuery(c.Query("version"))
		if err != nil {
			return c.Error(err.Error())
		}
		cmPath, err := findMemoCommentFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hp := commentHistoryPath(cmPath)
		content, err := rebuildHistoryVersion(ctx, hp, version)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, _ := loadHistoryFile(ctx, hp)
		return c.Ok(velo.H{"content": content, "version": version, "versions": hf.Versions})
	})

	b.Get("/api/memo-comments/history", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		cmPath, err := findMemoCommentFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, err := loadHistoryFile(ctx, commentHistoryPath(cmPath))
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"id": id, "versions": hf.Versions})
	})

	b.Post("/api/memo-comments/history/restore", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			ID      string `json:"id"`
			Version int    `json:"version"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if strings.TrimSpace(req.ID) == "" {
			return c.Error("id is required")
		}
		cmPath, err := findMemoCommentFilePath(ctx, req.ID)
		if err != nil {
			return c.Error(err.Error())
		}
		content, err := rebuildHistoryVersion(ctx, commentHistoryPath(cmPath), req.Version)
		if err != nil {
			return c.Error(err.Error())
		}
		// Restore by updating the comment content — this creates a new history version
		comment, err := updateVaultMemoComment(ctx, MemoCommentUpdateRequest{
			ID:      req.ID,
			Content: &content,
		})
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"comment": comment})
	})

	b.Get("/api/memo-comments/history/diff", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		id := c.Query("id")
		if strings.TrimSpace(id) == "" {
			return c.Error("id is required")
		}
		version, err := historyVersionFromQuery(c.Query("version"))
		if err != nil {
			return c.Error(err.Error())
		}
		if version < 1 {
			return c.Error("version must be >= 1")
		}
		cmPath, err := findMemoCommentFilePath(ctx, id)
		if err != nil {
			return c.Error(err.Error())
		}
		hf, err := loadHistoryFile(ctx, commentHistoryPath(cmPath))
		if err != nil {
			return c.Error(err.Error())
		}
		if version > len(hf.Versions) {
			return c.Error("version not found")
		}
		entry := hf.Versions[version-1]
		return c.Ok(velo.H{
			"contentOps":    entry.ContentOps,
			"changedFields": entry.ChangedFields,
			"version":       version,
		})
	})

	b.Get("/api/memo-drafts", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		drafts, err := listVaultMemoDrafts(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"drafts": drafts})
	})

	b.Post("/api/memo-drafts/upsert", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoDraftUpsertRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		draft, err := upsertVaultMemoDraft(ctx, req)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"draft": draft})
	})

	b.Post("/api/memo-drafts/delete", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req MemoDraftDeleteRequest
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := deleteVaultMemoDraft(ctx, req.ID); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/privacy/set-pin", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			Pin string `json:"pin"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		if err := setPrivacyPin(ctx, req.Pin); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true})
	})

	b.Post("/api/privacy/unlock", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		var req struct {
			Pin string `json:"pin"`
		}
		if err := c.BindJSON(&req); err != nil {
			return c.Error(err.Error())
		}
		ok, err := verifyPrivacyPin(ctx, req.Pin)
		if err != nil {
			return c.Error(err.Error())
		}
		if !ok {
			return c.Ok(velo.H{"unlocked": false, "msg": "PIN incorrect"})
		}
		// Update the active vault context in-memory
		vaultRuntime.Lock()
		if vaultRuntime.active != nil {
			vaultRuntime.active.PrivateUnlocked = true
		}
		vaultRuntime.Unlock()
		return c.Ok(velo.H{"unlocked": true})
	})

	b.Post("/api/privacy/lock", func(c *velo.BoxContext) interface{} {
		vaultRuntime.Lock()
		if vaultRuntime.active != nil {
			vaultRuntime.active.PrivateUnlocked = false
		}
		vaultRuntime.Unlock()
		return c.Ok(velo.H{"success": true})
	})

	b.Get("/api/privacy/status", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		hasPin, err := hasPrivacyPin(ctx)
		if err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{
			"hasPin":   hasPin,
			"unlocked": ctx.PrivateUnlocked,
		})
	})

	b.Get("/api/memos/open-file", func(c *velo.BoxContext) interface{} {
		ctx, err := requireActiveVault()
		if err != nil {
			return c.Error(err.Error())
		}
		memoID := strings.TrimSpace(c.Query("memoId"))
		if memoID == "" {
			return c.Error("memoId is required")
		}
		mdPath, err := findMemoFilePath(ctx, memoID)
		if err != nil {
			return c.Error(err.Error())
		}
		local_path, err := vault_local_path(ctx, mdPath)
		if err != nil {
			return c.Error(err.Error())
		}
		if err := showFileInExplorer(local_path); err != nil {
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"success": true, "file": local_path})
	})
}

func log_memo_query_failure(logger *zerolog.Logger, vault_ctx *VaultContext, operation string, err error) {
	if logger == nil || err == nil {
		return
	}
	vault_path := ""
	if vault_ctx != nil {
		vault_path = vault_ctx.RootDir
	}
	logger.Error().
		Err(err).
		Str("component", "memo_query").
		Str("operation", operation).
		Str("vault", vault_path).
		Msg("memo query failed")
}

const memo_page_limit_max = 200

func memo_list_query_from_context(box_ctx *velo.BoxContext) (MemoListQuery, error) {
	archived, err := optional_memo_bool_query("archived", box_ctx.Query("archived"))
	if err != nil {
		return MemoListQuery{}, err
	}
	pinned, err := optional_memo_bool_query("pinned", box_ctx.Query("pinned"))
	if err != nil {
		return MemoListQuery{}, err
	}
	limit := 0
	if raw_limit := strings.TrimSpace(box_ctx.Query("limit")); raw_limit != "" {
		limit, err = strconv.Atoi(raw_limit)
		if err != nil || limit < 0 {
			return MemoListQuery{}, fmt.Errorf("limit must be a non-negative integer")
		}
		if limit > memo_page_limit_max {
			limit = memo_page_limit_max
		}
	}
	visibility := strings.ToUpper(strings.TrimSpace(box_ctx.Query("visibility")))
	if visibility != "" && visibility != "PUBLIC" && visibility != "PRIVATE" && visibility != "PROTECTED" {
		return MemoListQuery{}, fmt.Errorf("visibility must be PRIVATE, PROTECTED, or PUBLIC")
	}
	return MemoListQuery{
		Archived:   archived,
		Cursor:     strings.TrimSpace(box_ctx.Query("cursor")),
		Limit:      limit,
		Pinned:     pinned,
		ProjectID:  strings.TrimSpace(box_ctx.Query("projectId")),
		Tag:        strings.TrimSpace(box_ctx.Query("tag")),
		Visibility: visibility,
	}, nil
}

func optional_memo_bool_query(name string, value string) (*bool, error) {
	raw_value := strings.TrimSpace(value)
	if raw_value == "" {
		return nil, nil
	}
	parsed_value, err := strconv.ParseBool(raw_value)
	if err != nil {
		return nil, fmt.Errorf("%s must be true or false", name)
	}
	return &parsed_value, nil
}

func redact_memo_page(vault_ctx *VaultContext, page *MemoPage) {
	if page == nil {
		return
	}
	for memo_index, memo := range page.Memos {
		if isPrivateAndLocked(vault_ctx, memo.Private) {
			page.Memos[memo_index] = redactPrivateMemo(memo)
		}
	}
}
