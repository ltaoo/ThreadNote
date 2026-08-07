package desktopapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const vaultBoardsFileName = "boards.json"

// Reserved status values that cannot be used as board column IDs.
var reservedBoardColumnIDs = map[string]bool{
	taskStatusOpen:      true,
	taskStatusCompleted: true,
	taskStatusCancelled: true,
	taskStatusArchived:  true,
}

type BoardFile struct {
	Boards        []BoardRecord `json:"boards"`
	SchemaVersion int           `json:"schemaVersion"`
}

type BoardRecord struct {
	Columns       []BoardColumn `json:"columns"`
	CreatedAt     string        `json:"createdAt"`
	ID            string        `json:"id"`
	ProjectID     string        `json:"projectId,omitempty"`
	SchemaVersion int           `json:"schemaVersion"`
	Title         string        `json:"title"`
	UpdatedAt     string        `json:"updatedAt"`
	Rules         []BoardRule   `json:"rules,omitempty"`
}

type BoardColumn struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Order int    `json:"order"`
}

type BoardCreateRequest struct {
	Columns   []BoardColumn `json:"columns"`
	ProjectID string        `json:"projectId"`
	Title     string        `json:"title"`
	Rules     []BoardRule   `json:"rules,omitempty"`
}

type BoardUpdateRequest struct {
	Columns   *[]BoardColumn `json:"columns"`
	ID        string         `json:"id"`
	ProjectID *string        `json:"projectId"`
	Title     *string        `json:"title"`
	Rules     *[]BoardRule   `json:"rules,omitempty"`
}

type BoardIDRequest struct {
	ID string `json:"id"`
}

// Preset board templates.
var boardPresets = []BoardRecord{
	{
		Columns: []BoardColumn{
			{ID: "todo", Label: "Todo", Order: 0},
			{ID: "doing", Label: "Doing", Order: 1},
			{ID: "done", Label: "Done", Order: 2},
		},
		Title: "看板三列",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "todo", Label: "Todo", Order: 0},
			{ID: "doing", Label: "Doing", Order: 1},
			{ID: "done", Label: "Done", Order: 2},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "backlog", Label: "Backlog", Order: 0},
			{ID: "in_progress", Label: "In Progress", Order: 1},
			{ID: "in_review", Label: "In Review", Order: 2},
			{ID: "done", Label: "Done", Order: 3},
		},
		Title: "团队看板",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "backlog", Label: "Backlog", Order: 0},
			{ID: "in_progress", Label: "In Progress", Order: 1},
			{ID: "in_review", Label: "In Review", Order: 2},
			{ID: "done", Label: "Done", Order: 3},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "backlog", Label: "需求池", Order: 0},
			{ID: "sprint_backlog", Label: "Sprint Backlog", Order: 1},
			{ID: "in_progress", Label: "开发中", Order: 2},
			{ID: "code_review", Label: "代码评审", Order: 3},
			{ID: "testing", Label: "测试中", Order: 4},
			{ID: "done", Label: "已完成", Order: 5},
		},
		Title: "Scrum 敏捷开发",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "backlog", Label: "需求池", Order: 0},
			{ID: "sprint_backlog", Label: "Sprint Backlog", Order: 1},
			{ID: "in_progress", Label: "开发中", Order: 2},
			{ID: "code_review", Label: "代码评审", Order: 3},
			{ID: "testing", Label: "测试中", Order: 4},
			{ID: "done", Label: "已完成", Order: 5},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "requirement_pool", Label: "需求池", Order: 0},
			{ID: "reviewed", Label: "已Review", Order: 1},
			{ID: "developing", Label: "开发中", Order: 2},
			{ID: "testing", Label: "测试中", Order: 3},
			{ID: "regression", Label: "回归", Order: 4},
			{ID: "online", Label: "上线", Order: 5},
		},
		Title: "研发全流程",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "requirement_pool", Label: "需求池", Order: 0},
			{ID: "reviewed", Label: "已Review", Order: 1},
			{ID: "developing", Label: "开发中", Order: 2},
			{ID: "testing", Label: "测试中", Order: 3},
			{ID: "regression", Label: "回归", Order: 4},
			{ID: "online", Label: "上线", Order: 5},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "backlog", Label: "Backlog", Order: 0},
			{ID: "in_progress", Label: "In Progress", Order: 1},
			{ID: "review", Label: "Review", Order: 2},
			{ID: "ready_to_merge", Label: "Ready to Merge", Order: 3},
			{ID: "done", Label: "Done", Order: 4},
		},
		Title: "GitHub Flow",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "backlog", Label: "Backlog", Order: 0},
			{ID: "in_progress", Label: "In Progress", Order: 1},
			{ID: "review", Label: "Review", Order: 2},
			{ID: "ready_to_merge", Label: "Ready to Merge", Order: 3},
			{ID: "done", Label: "Done", Order: 4},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "reported", Label: "已报告", Order: 0},
			{ID: "confirmed", Label: "已确认", Order: 1},
			{ID: "fixing", Label: "修复中", Order: 2},
			{ID: "fixed", Label: "已修复", Order: 3},
			{ID: "verified", Label: "已验证", Order: 4},
			{ID: "closed", Label: "已关闭", Order: 5},
		},
		Title: "缺陷跟踪",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "reported", Label: "已报告", Order: 0},
			{ID: "confirmed", Label: "已确认", Order: 1},
			{ID: "fixing", Label: "修复中", Order: 2},
			{ID: "fixed", Label: "已修复", Order: 3},
			{ID: "verified", Label: "已验证", Order: 4},
			{ID: "closed", Label: "已关闭", Order: 5},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "backlog", Label: "待排期", Order: 0},
			{ID: "this_week_dev", Label: "本周开发", Order: 1},
			{ID: "this_week_test", Label: "本周测试", Order: 2},
			{ID: "acceptance", Label: "验收", Order: 3},
			{ID: "delivered", Label: "已交付", Order: 4},
		},
		Title: "双周迭代",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "backlog", Label: "待排期", Order: 0},
			{ID: "this_week_dev", Label: "本周开发", Order: 1},
			{ID: "this_week_test", Label: "本周测试", Order: 2},
			{ID: "acceptance", Label: "验收", Order: 3},
			{ID: "delivered", Label: "已交付", Order: 4},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "pending_review", Label: "待评审", Order: 0},
			{ID: "scheduled", Label: "排期", Order: 1},
			{ID: "dev", Label: "开发", Order: 2},
			{ID: "launch", Label: "上线", Order: 3},
		},
		Title: "评审看板",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "pending_review", Label: "待评审", Order: 0},
			{ID: "scheduled", Label: "排期", Order: 1},
			{ID: "dev", Label: "开发", Order: 2},
			{ID: "launch", Label: "上线", Order: 3},
		}),
	},
	{
		Columns: []BoardColumn{
			{ID: "backlog", Label: "待开始", Order: 0},
			{ID: "dev", Label: "开发中", Order: 1},
			{ID: "review", Label: "代码评审", Order: 2},
			{ID: "testing", Label: "测试中", Order: 3},
			{ID: "done", Label: "已完成", Order: 4},
		},
		Title: "简化开发流",
		Rules: defaultBoardRules([]BoardColumn{
			{ID: "backlog", Label: "待开始", Order: 0},
			{ID: "dev", Label: "开发中", Order: 1},
			{ID: "review", Label: "代码评审", Order: 2},
			{ID: "testing", Label: "测试中", Order: 3},
			{ID: "done", Label: "已完成", Order: 4},
		}),
	},
}

func boardsPath(ctx *VaultContext) string {
	return filepath.Join(ctx.VeloDir, vaultBoardsFileName)
}

func loadBoards(ctx *VaultContext) (BoardFile, error) {
	raw, err := os.ReadFile(boardsPath(ctx))
	if os.IsNotExist(err) {
		return BoardFile{SchemaVersion: vaultSchemaVersion, Boards: []BoardRecord{}}, nil
	}
	if err != nil {
		return BoardFile{}, fmt.Errorf("read boards: %w", err)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return BoardFile{SchemaVersion: vaultSchemaVersion, Boards: []BoardRecord{}}, nil
	}
	var file BoardFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return BoardFile{}, fmt.Errorf("read boards: %w", err)
	}
	return normalizeBoardFile(file), nil
}

func saveBoards(ctx *VaultContext, file BoardFile) error {
	file = normalizeBoardFile(file)
	file.SchemaVersion = vaultSchemaVersion
	return writeJSONFileAtomic(boardsPath(ctx), file)
}

func createVaultBoard(ctx *VaultContext, req BoardCreateRequest) (BoardRecord, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return BoardRecord{}, fmt.Errorf("board title is required")
	}
	columns := normalizeBoardColumns(req.Columns)
	if len(columns) == 0 {
		return BoardRecord{}, fmt.Errorf("board must have at least one column")
	}
	if err := validateBoardColumnIDs(columns); err != nil {
		return BoardRecord{}, err
	}
	file, err := loadBoards(ctx)
	if err != nil {
		return BoardRecord{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	board := BoardRecord{
		Columns:       columns,
		CreatedAt:     now,
		ID:            newBoardID(),
		ProjectID:     sanitizeProjectID(req.ProjectID),
		SchemaVersion: vaultSchemaVersion,
		Title:         title,
		UpdatedAt:     now,
		Rules:         req.Rules,
	}
	file.Boards = append(file.Boards, board)
	if err := saveBoards(ctx, file); err != nil {
		return BoardRecord{}, err
	}
	// Auto-populate the board with existing project tasks via rules.
	if board.ProjectID != "" {
		_, _ = RefreshBoardRules(ctx, board.ID)
	}
	return board, nil
}

func updateVaultBoard(ctx *VaultContext, req BoardUpdateRequest) (BoardRecord, error) {
	id := sanitizeBoardID(req.ID)
	if id == "" {
		return BoardRecord{}, fmt.Errorf("board id is required")
	}
	file, err := loadBoards(ctx)
	if err != nil {
		return BoardRecord{}, err
	}
	for i, board := range file.Boards {
		if board.ID != id {
			continue
		}
		if req.Title != nil {
			title := strings.TrimSpace(*req.Title)
			if title == "" {
				return BoardRecord{}, fmt.Errorf("board title is required")
			}
			board.Title = title
		}
		if req.ProjectID != nil {
			board.ProjectID = sanitizeProjectID(*req.ProjectID)
		}
		if req.Columns != nil {
			columns := normalizeBoardColumns(*req.Columns)
			if len(columns) == 0 {
				return BoardRecord{}, fmt.Errorf("board must have at least one column")
			}
			if err := validateBoardColumnIDs(columns); err != nil {
				return BoardRecord{}, err
			}
			board.Columns = columns
		}
		if req.Rules != nil {
			board.Rules = *req.Rules
		}
		board.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		file.Boards[i] = board
		if err := saveBoards(ctx, file); err != nil {
			return BoardRecord{}, err
		}
		return board, nil
	}
	return BoardRecord{}, fmt.Errorf("board not found: %s", id)
}

func deleteVaultBoard(ctx *VaultContext, id string) error {
	id = sanitizeBoardID(id)
	if id == "" {
		return fmt.Errorf("board id is required")
	}
	file, err := loadBoards(ctx)
	if err != nil {
		return err
	}
	next := make([]BoardRecord, 0, len(file.Boards))
	found := false
	for _, board := range file.Boards {
		if board.ID == id {
			found = true
			continue
		}
		next = append(next, board)
	}
	if !found {
		return fmt.Errorf("board not found: %s", id)
	}
	file.Boards = next
	return saveBoards(ctx, file)
}

func normalizeBoardFile(file BoardFile) BoardFile {
	if file.SchemaVersion == 0 {
		file.SchemaVersion = vaultSchemaVersion
	}
	seen := map[string]bool{}
	boards := make([]BoardRecord, 0, len(file.Boards))
	for _, board := range file.Boards {
		board = normalizeBoardRecord(board)
		if board.ID == "" || board.Title == "" || seen[board.ID] {
			continue
		}
		seen[board.ID] = true
		boards = append(boards, board)
	}
	sort.SliceStable(boards, func(i, j int) bool {
		left := parseMemoTime(firstNonEmpty(boards[i].UpdatedAt, boards[i].CreatedAt))
		right := parseMemoTime(firstNonEmpty(boards[j].UpdatedAt, boards[j].CreatedAt))
		if left.Equal(right) {
			return boards[i].ID > boards[j].ID
		}
		return left.After(right)
	})
	file.Boards = boards
	return file
}

func normalizeBoardRecord(board BoardRecord) BoardRecord {
	board.ID = sanitizeBoardID(board.ID)
	board.ProjectID = sanitizeProjectID(board.ProjectID)
	board.Title = strings.TrimSpace(board.Title)
	board.Columns = normalizeBoardColumns(board.Columns)
	board.Rules = normalizeBoardRules(board.Rules)
	if board.SchemaVersion == 0 {
		board.SchemaVersion = vaultSchemaVersion
	}
	return board
}

func normalizeBoardColumns(columns []BoardColumn) []BoardColumn {
	seen := map[string]bool{}
	next := make([]BoardColumn, 0, len(columns))
	for _, col := range columns {
		col.ID = sanitizeBoardColumnID(col.ID)
		col.Label = strings.TrimSpace(col.Label)
		if col.ID == "" || col.Label == "" || seen[col.ID] {
			continue
		}
		seen[col.ID] = true
		next = append(next, col)
	}
	for i := range next {
		next[i].Order = i
	}
	return next
}

func validateBoardColumnIDs(columns []BoardColumn) error {
	for _, col := range columns {
		if reservedBoardColumnIDs[col.ID] {
			return fmt.Errorf("column id %q is reserved", col.ID)
		}
	}
	return nil
}

func newBoardID() string {
	return "board_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}

func sanitizeBoardID(value string) string {
	return sanitizeProjectID(value)
}

func sanitizeBoardColumnID(value string) string {
	return sanitizeProjectID(value)
}
