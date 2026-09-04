package service

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// BoardRule represents a rule for the board rules engine.
type BoardRule struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Enabled    bool            `json:"enabled"`
	Trigger    RuleTrigger     `json:"trigger"`
	Conditions []RuleCondition `json:"conditions"` // AND logic, empty = always match
	Actions    []RuleAction    `json:"actions"`
	Order      int             `json:"order"`
}

// RuleTrigger defines when a rule fires.
type RuleTrigger struct {
	Type         string `json:"type"`     // "task.enterColumn" | "task.statusChanged"
	ColumnID     string `json:"columnId"` // empty = any column
	FromColumnID string `json:"fromColumnId,omitempty"`
	Status       string `json:"status,omitempty"` // for "task.statusChanged": empty = any status
}

// RuleCondition is a single condition that must be met.
type RuleCondition struct {
	Field    string `json:"field"`    // status | tags | priority
	Operator string `json:"operator"` // equals | notEquals | contains | notContains | isEmpty | isNotEmpty
	Value    string `json:"value"`
}

// RuleAction is an action to execute when conditions are met.
type RuleAction struct {
	Type   string           `json:"type"` // addTags | removeTags | setStatus | setPriority
	Params RuleActionParams `json:"params"`
}

// RuleActionParams holds the parameters for a rule action.
type RuleActionParams struct {
	Tags     []string `json:"tags,omitempty"`
	Status   string   `json:"status,omitempty"`
	Priority string   `json:"priority,omitempty"`
	ColumnID string   `json:"columnId,omitempty"` // for "moveToColumn"
}

var validRuleTriggerTypes = map[string]bool{
	"task.enterColumn":   true,
	"task.statusChanged": true,
	"task.created":       true,
}

var validRuleConditionFields = map[string]bool{
	"status":   true,
	"tags":     true,
	"priority": true,
}

var validRuleConditionOperators = map[string]bool{
	"equals":      true,
	"notEquals":   true,
	"contains":    true,
	"notContains": true,
	"isEmpty":     true,
	"isNotEmpty":  true,
}

var validRuleActionTypes = map[string]bool{
	"addTags":      true,
	"removeTags":   true,
	"setStatus":    true,
	"setPriority":  true,
	"moveToColumn": true,
}

func newRuleID() string {
	return "rule_" + time.Now().UTC().Format("20060102T150405") + "_" + randomVaultSuffix()
}

func validateRuleTriggerType(t string) bool {
	return validRuleTriggerTypes[t]
}

func normalizeBoardRules(rules []BoardRule) []BoardRule {
	seen := map[string]bool{}
	next := make([]BoardRule, 0, len(rules))
	for _, r := range rules {
		r.ID = strings.TrimSpace(r.ID)
		r.Name = strings.TrimSpace(r.Name)
		r.Trigger.Type = strings.TrimSpace(r.Trigger.Type)
		r.Trigger.ColumnID = strings.TrimSpace(r.Trigger.ColumnID)
		r.Trigger.FromColumnID = strings.TrimSpace(r.Trigger.FromColumnID)
		r.Trigger.Status = strings.TrimSpace(r.Trigger.Status)

		// Must have: id, name, valid trigger type, at least one action
		if r.ID == "" || r.Name == "" || !validateRuleTriggerType(r.Trigger.Type) || len(r.Actions) == 0 || seen[r.ID] {
			continue
		}

		// Filter and normalize conditions
		conds := make([]RuleCondition, 0, len(r.Conditions))
		for _, c := range r.Conditions {
			c.Field = strings.TrimSpace(c.Field)
			c.Operator = strings.TrimSpace(c.Operator)
			c.Value = strings.TrimSpace(c.Value)
			if !validRuleConditionFields[c.Field] || !validRuleConditionOperators[c.Operator] {
				continue
			}
			// isEmpty/isNotEmpty don't need a value
			if c.Operator != "isEmpty" && c.Operator != "isNotEmpty" && c.Value == "" {
				continue
			}
			conds = append(conds, c)
		}
		r.Conditions = conds

		// Filter and normalize actions
		acts := make([]RuleAction, 0, len(r.Actions))
		for _, a := range r.Actions {
			a.Type = strings.TrimSpace(a.Type)
			if !validRuleActionTypes[a.Type] {
				continue
			}
			// Clean params based on action type
			switch a.Type {
			case "addTags", "removeTags":
				tags := make([]string, 0, len(a.Params.Tags))
				for _, t := range a.Params.Tags {
					t = strings.TrimSpace(t)
					if t != "" {
						tags = append(tags, t)
					}
				}
				a.Params.Tags = tags
				a.Params.Status = ""
				a.Params.Priority = ""
			case "setStatus":
				a.Params.Tags = nil
				a.Params.Priority = ""
			case "setPriority":
				a.Params.Tags = nil
				a.Params.Status = ""
			case "moveToColumn":
				a.Params.Tags = nil
				a.Params.Status = ""
				a.Params.Priority = ""
			}
			acts = append(acts, a)
		}
		r.Actions = acts

		// Skip rules with no valid actions after filtering
		if len(r.Actions) == 0 {
			continue
		}

		seen[r.ID] = true
		next = append(next, r)
	}

	// Re-assign order
	for i := range next {
		next[i].Order = i
	}
	return next
}

// defaultBoardRules returns default rules that adapt to the given board columns.
// It identifies the terminal column (where work finishes), the active
// column (where work is in progress), and the backlog column (planning stage)
// then creates automation rules covering the full task lifecycle.
func defaultBoardRules(columns []BoardColumn) []BoardRule {
	terminalID := findTerminalColumnID(columns)
	activeID := findActiveColumnID(columns)
	backlogID := findBacklogColumnID(columns)

	var rules []BoardRule

	// 1. Auto-complete: when a task enters the terminal column, set status to completed.
	if terminalID != "" {
		rules = append(rules, BoardRule{
			ID:      newRuleID(),
			Name:    "任务进入终态列时自动完成",
			Enabled: true,
			Trigger: RuleTrigger{
				Type:     "task.enterColumn",
				ColumnID: terminalID,
			},
			Actions: []RuleAction{
				{Type: "setStatus", Params: RuleActionParams{Status: "completed"}},
			},
			Order: len(rules),
		})
	}

	// 2. Reopen completed: when a completed task re-enters the active column.
	if activeID != "" && activeID != terminalID {
		rules = append(rules, BoardRule{
			ID:      newRuleID(),
			Name:    "已完成任务回到活跃列时重新打开",
			Enabled: true,
			Trigger: RuleTrigger{
				Type:     "task.enterColumn",
				ColumnID: activeID,
			},
			Conditions: []RuleCondition{
				{Field: "status", Operator: "equals", Value: "completed"},
			},
			Actions: []RuleAction{
				{Type: "setStatus", Params: RuleActionParams{Status: "open"}},
			},
			Order: len(rules),
		})

		// 3. Reopen cancelled: when a cancelled task re-enters the active column.
		rules = append(rules, BoardRule{
			ID:      newRuleID(),
			Name:    "已取消任务回到活跃列时重新打开",
			Enabled: true,
			Trigger: RuleTrigger{
				Type:     "task.enterColumn",
				ColumnID: activeID,
			},
			Conditions: []RuleCondition{
				{Field: "status", Operator: "equals", Value: "cancelled"},
			},
			Actions: []RuleAction{
				{Type: "setStatus", Params: RuleActionParams{Status: "open"}},
			},
			Order: len(rules),
		})

		// 4. Add the backlog column label as a tag when a task enters the backlog.
		if backlogID != "" && backlogID != activeID {
			backlogLabel := findColumnLabel(columns, backlogID)
			if backlogLabel != "" {
				rules = append(rules, BoardRule{
					ID:      newRuleID(),
					Name:    "任务进入积压列时添加 " + backlogLabel + " 标签",
					Enabled: true,
					Trigger: RuleTrigger{
						Type:     "task.enterColumn",
						ColumnID: backlogID,
					},
					Actions: []RuleAction{
						{Type: "addTags", Params: RuleActionParams{Tags: []string{backlogLabel}}},
					},
					Order: len(rules),
				})

				// 5. Remove the backlog label when a task leaves backlog and enters the active column.
				rules = append(rules, BoardRule{
					ID:      newRuleID(),
					Name:    "任务进入活跃列时移除 " + backlogLabel + " 标签",
					Enabled: true,
					Trigger: RuleTrigger{
						Type:     "task.enterColumn",
						ColumnID: activeID,
					},
					Conditions: []RuleCondition{
						{Field: "tags", Operator: "contains", Value: backlogLabel},
					},
					Actions: []RuleAction{
						{Type: "removeTags", Params: RuleActionParams{Tags: []string{backlogLabel}}},
					},
					Order: len(rules),
				})
			}
		}
	}

	// 6. Move to terminal column when task is completed (anywhere).
	if terminalID != "" {
		rules = append(rules, BoardRule{
			ID:      newRuleID(),
			Name:    "任务完成时移入终态列",
			Enabled: true,
			Trigger: RuleTrigger{
				Type:   "task.statusChanged",
				Status: "completed",
			},
			Actions: []RuleAction{
				{Type: "moveToColumn", Params: RuleActionParams{ColumnID: terminalID}},
			},
			Order: len(rules),
		})
	}

	// 7. When a new task is created, move it to the backlog column.
	if backlogID != "" {
		rules = append(rules, BoardRule{
			ID:      newRuleID(),
			Name:    "新建任务自动移入积压列",
			Enabled: true,
			Trigger: RuleTrigger{
				Type: "task.created",
			},
			Actions: []RuleAction{
				{Type: "moveToColumn", Params: RuleActionParams{ColumnID: backlogID}},
			},
			Order: len(rules),
		})
	}

	return rules
}

// findBacklogColumnID returns the column ID for the planning/backlog stage.
// It looks for columns whose ID contains keywords like "backlog", "pool",
// "requirement", "reported", "pending", "todo".
// Falls back to the first column.
func findBacklogColumnID(columns []BoardColumn) string {
	if len(columns) == 0 {
		return ""
	}
	backlogKeywords := []string{"backlog", "todo", "pool", "requirement", "reported", "pending"}
	for _, col := range columns {
		lower := strings.ToLower(col.ID)
		for _, kw := range backlogKeywords {
			if lower == kw || strings.HasSuffix(lower, "_"+kw) {
				return col.ID
			}
		}
	}
	return columns[0].ID
}

// findColumnLabel returns the label for the given column ID.
func findColumnLabel(columns []BoardColumn, id string) string {
	for _, col := range columns {
		if col.ID == id {
			return col.Label
		}
	}
	return ""
}

// findTerminalColumnID returns the column ID that represents the end of a
// workflow (e.g., "done", "completed", "closed", "online", "launched").
// Searches in reverse so the last matching column wins.
// Falls back to the last column if no obvious terminal column is found.
func findTerminalColumnID(columns []BoardColumn) string {
	if len(columns) == 0 {
		return ""
	}
	terminalKeywords := []string{"done", "completed", "closed", "online", "launch", "delivered", "fixed", "verified"}
	// Search in reverse so the last matching column wins
	for i := len(columns) - 1; i >= 0; i-- {
		lower := strings.ToLower(columns[i].ID)
		for _, kw := range terminalKeywords {
			if lower == kw || strings.HasSuffix(lower, "_"+kw) {
				return columns[i].ID
			}
		}
	}
	// Fallback: use the last column
	return columns[len(columns)-1].ID
}

// findActiveColumnID returns the column ID for the primary "work in progress"
// column (e.g., "doing", "in_progress", "dev", "developing", "fixing").
// Falls back to the second column if no obvious active column is found.
func findActiveColumnID(columns []BoardColumn) string {
	if len(columns) == 0 {
		return ""
	}
	activeKeywords := []string{"doing", "in_progress", "developing", "fixing"}
	for _, col := range columns {
		lower := strings.ToLower(col.ID)
		for _, kw := range activeKeywords {
			if lower == kw || strings.HasSuffix(lower, "_"+kw) {
				return col.ID
			}
		}
	}
	// Also match standalone "dev" at exact word
	for _, col := range columns {
		lower := strings.ToLower(col.ID)
		if lower == "dev" {
			return col.ID
		}
	}
	// Fallback: use the second column (first non-backlog column)
	if len(columns) >= 2 {
		return columns[1].ID
	}
	return ""
}

// evaluateAndApplyTaskCreatedRules evaluates task.created rules after a task is created.
// It finds the board the task belongs to (by existing BoardID or by matching ProjectID),
// evaluates matching rules, and applies actions directly to the task in memory.
func evaluateAndApplyTaskCreatedRules(ctx *VaultContext, task *TaskRecord) {
	boardsFile, err := loadBoards(ctx)
	if err != nil || len(boardsFile.Boards) == 0 {
		return
	}

	// If task already has a boardId, find that specific board.
	if task.BoardID != "" {
		for i := range boardsFile.Boards {
			if boardsFile.Boards[i].ID == task.BoardID {
				applyTaskCreatedRules(&boardsFile.Boards[i], task)
				return
			}
		}
		return
	}

	// Otherwise, find the first board whose projectId matches the task's projectId.
	if task.ProjectID == "" {
		return
	}
	for i := range boardsFile.Boards {
		if boardsFile.Boards[i].ProjectID == task.ProjectID {
			applyTaskCreatedRules(&boardsFile.Boards[i], task)
			return
		}
	}
}

// applyTaskCreatedRules collects matching task.created rules from a board,
// evaluates conditions, and applies actions to the task in order.
func applyTaskCreatedRules(board *BoardRecord, task *TaskRecord) {
	var matched []BoardRule
	for _, rule := range board.Rules {
		if !rule.Enabled || rule.Trigger.Type != "task.created" {
			continue
		}
		if !evaluateRuleConditions(rule.Conditions, *task) {
			continue
		}
		matched = append(matched, rule)
	}
	if len(matched) == 0 {
		return
	}
	sort.Slice(matched, func(i, j int) bool {
		return matched[i].Order < matched[j].Order
	})
	applyRuleActions(board, task, matched)
	task.BoardID = board.ID
}

// applyTaskStatusChangedRules collects matching task.statusChanged rules from a
// board, evaluates conditions, and applies actions to the task in order.
// newStatus is matched against rule.Trigger.Status (empty trigger status = any).
func applyTaskStatusChangedRules(board *BoardRecord, task *TaskRecord, newStatus string) {
	var matched []BoardRule
	for _, rule := range board.Rules {
		if !rule.Enabled || rule.Trigger.Type != "task.statusChanged" {
			continue
		}
		if rule.Trigger.Status != "" && rule.Trigger.Status != newStatus {
			continue
		}
		if !evaluateRuleConditions(rule.Conditions, *task) {
			continue
		}
		matched = append(matched, rule)
	}
	if len(matched) == 0 {
		return
	}
	sort.Slice(matched, func(i, j int) bool {
		return matched[i].Order < matched[j].Order
	})
	applyRuleActions(board, task, matched)
}

// applyRuleActions applies the actions from matched rules to the task in order.
func applyRuleActions(board *BoardRecord, task *TaskRecord, matched []BoardRule) {
	boardLabels := make(map[string]bool)
	for _, col := range board.Columns {
		boardLabels[col.Label] = true
	}
	for _, rule := range matched {
		for _, action := range rule.Actions {
			switch action.Type {
			case "addTags":
				for _, tag := range action.Params.Tags {
					if tag == "" {
						continue
					}
					found := false
					for _, t := range task.Tags {
						if t == tag {
							found = true
							break
						}
					}
					if !found {
						task.Tags = append(task.Tags, tag)
					}
				}
			case "removeTags":
				for _, tag := range action.Params.Tags {
					for i := len(task.Tags) - 1; i >= 0; i-- {
						if task.Tags[i] == tag {
							task.Tags = append(task.Tags[:i], task.Tags[i+1:]...)
						}
					}
				}
			case "setStatus":
				if action.Params.Status != "" {
					task.Status = action.Params.Status
				}
			case "setPriority":
				task.Priority = action.Params.Priority
			case "moveToColumn":
				targetCol := findBoardColumnByID(board, action.Params.ColumnID)
				if targetCol != nil {
					filtered := make([]string, 0, len(task.Tags))
					for _, t := range task.Tags {
						if !boardLabels[t] {
							filtered = append(filtered, t)
						}
					}
					found := false
					for _, t := range filtered {
						if t == targetCol.Label {
							found = true
							break
						}
					}
					if !found {
						filtered = append(filtered, targetCol.Label)
					}
					task.Tags = filtered
				}
			}
		}
	}
}

// findBoardColumnByID returns the board column with the given ID, or nil.
func findBoardColumnByID(board *BoardRecord, id string) *BoardColumn {
	for i := range board.Columns {
		if board.Columns[i].ID == id {
			return &board.Columns[i]
		}
	}
	return nil
}

// evaluateRuleConditions evaluates all conditions against a task (AND logic).
func evaluateRuleConditions(conditions []RuleCondition, task TaskRecord) bool {
	for _, cond := range conditions {
		if !evaluateCondition(cond, task) {
			return false
		}
	}
	return true
}

// evaluateCondition evaluates a single condition against a task.
func evaluateCondition(cond RuleCondition, task TaskRecord) bool {
	switch cond.Field {
	case "status":
		return evaluateStringCondition(strings.TrimSpace(task.Status), cond)
	case "priority":
		return evaluateStringCondition(strings.TrimSpace(task.Priority), cond)
	case "tags":
		return evaluateTagsCondition(task.Tags, cond)
	default:
		return false
	}
}

func evaluateStringCondition(value string, cond RuleCondition) bool {
	switch cond.Operator {
	case "equals":
		return value != "" && strings.EqualFold(value, cond.Value)
	case "notEquals":
		return value == "" || !strings.EqualFold(value, cond.Value)
	case "isEmpty":
		return value == ""
	case "isNotEmpty":
		return value != ""
	default:
		return false
	}
}

func evaluateTagsCondition(tags []string, cond RuleCondition) bool {
	switch cond.Operator {
	case "contains":
		for _, t := range tags {
			if strings.EqualFold(t, cond.Value) {
				return true
			}
		}
		return false
	case "notContains":
		for _, t := range tags {
			if strings.EqualFold(t, cond.Value) {
				return false
			}
		}
		return true
	case "isEmpty":
		return len(tags) == 0
	case "isNotEmpty":
		return len(tags) > 0
	default:
		return false
	}
}

// RefreshBoardRules clears the board assignment from all project tasks, then
// re-applies board rules in order: task.created rules first to place tasks on
// the board, then task.statusChanged rules for non-open tasks to adjust
// column placement based on current status.
//
// When no rules of a given type match (e.g. a board without rules configured),
// falls back to default behavior: backlog column for new tasks, terminal column
// for completed tasks.
//
// Returns the number of tasks updated.
func RefreshBoardRules(ctx *VaultContext, boardID string) (int, error) {
	boardsFile, err := loadBoards(ctx)
	if err != nil {
		return 0, err
	}
	var board *BoardRecord
	for i := range boardsFile.Boards {
		if boardsFile.Boards[i].ID == boardID {
			board = &boardsFile.Boards[i]
			break
		}
	}
	if board == nil {
		return 0, fmt.Errorf("board not found")
	}
	if board.ProjectID == "" {
		return 0, nil
	}

	terminalID := findTerminalColumnID(board.Columns)
	backlogID := findBacklogColumnID(board.Columns)

	// Map column ID → label.
	colLabel := make(map[string]string)
	for _, col := range board.Columns {
		colLabel[col.ID] = col.Label
	}

	// Build board label set for stripping.
	boardLabels := make(map[string]bool)
	for _, col := range board.Columns {
		boardLabels[col.Label] = true
	}

	hasCreatedRules := boardHasTriggerType(board, "task.created")
	hasStatusChangedRules := boardHasTriggerType(board, "task.statusChanged")

	tasks, err := listVaultTasks(ctx)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, task := range tasks {
		if task.ProjectID != board.ProjectID {
			continue
		}

		taskCopy := task

		// 1. Clear board assignment: remove boardId and board column labels.
		taskCopy.BoardID = ""
		filtered := make([]string, 0, len(taskCopy.Tags))
		for _, t := range taskCopy.Tags {
			if !boardLabels[t] {
				filtered = append(filtered, t)
			}
		}
		taskCopy.Tags = filtered

		// 2. Apply task.created rules, or fall back to backlog column.
		if hasCreatedRules {
			applyTaskCreatedRules(board, &taskCopy)
		}
		// Fallback: if still no board assignment, place in backlog.
		if taskCopy.BoardID == "" && backlogID != "" {
			taskCopy.BoardID = board.ID
			if label, ok := colLabel[backlogID]; ok {
				taskCopy.Tags = append(taskCopy.Tags, label)
			}
		}

		// 3. Apply task.statusChanged rules for non-open tasks,
		//    or fall back to terminal column for completed tasks.
		if taskCopy.Status != "open" && taskCopy.Status != "" {
			if hasStatusChangedRules {
				applyTaskStatusChangedRules(board, &taskCopy, taskCopy.Status)
			} else if taskCopy.Status == "completed" && terminalID != "" {
				// Fallback: move completed tasks to terminal column.
				filtered2 := make([]string, 0, len(taskCopy.Tags))
				for _, t := range taskCopy.Tags {
					if !boardLabels[t] {
						filtered2 = append(filtered2, t)
					}
				}
				if label, ok := colLabel[terminalID]; ok {
					filtered2 = append(filtered2, label)
				}
				taskCopy.Tags = filtered2
			}
		}

		// Check if anything changed.
		if taskCopy.BoardID == task.BoardID && tagsEqual(taskCopy.Tags, task.Tags) &&
			taskCopy.Status == task.Status && taskCopy.Priority == task.Priority {
			continue
		}

		taskCopy.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		taskCopy.Path = taskRelativePath(taskCopy)
		if err := writeTaskRecord(ctx, taskCopy); err != nil {
			continue
		}
		count++
	}

	if count > 0 {
		_, _ = rebuildTaskIndex(ctx)
	}
	return count, nil
}

// boardHasTriggerType checks whether the board has any enabled rule with the
// given trigger type.
func boardHasTriggerType(board *BoardRecord, triggerType string) bool {
	for _, rule := range board.Rules {
		if rule.Enabled && rule.Trigger.Type == triggerType {
			return true
		}
	}
	return false
}

// tagsEqual compares two string slices for equality.
func tagsEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
