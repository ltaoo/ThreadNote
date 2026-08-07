/**
 * Board rules engine.
 *
 * Evaluates rules against a task when it enters a board column.
 * Rules are evaluated based on the ORIGINAL task state; patches are merged in
 * rule order (later rules override conflicting fields from earlier ones).
 */

/**
 * Find the terminal column (Done/Completed/etc.) for a board.
 * Uses the same keyword matching as the Go backend's findTerminalColumnID.
 * Falls back to the last column.
 * @param {Object} board - board record with columns array
 * @returns {Object|null} the terminal column or null
 */
export function findTerminalColumn(board) {
  var columns = board.columns;
  if (!columns || !columns.length) return null;
  var keywords = ["done", "completed", "closed", "online", "launch", "delivered", "fixed", "verified"];
  // Search in reverse so the last matching column wins (same as backend)
  for (var i = columns.length - 1; i >= 0; i--) {
    var lower = columns[i].id.toLowerCase();
    for (var k = 0; k < keywords.length; k++) {
      if (lower === keywords[k] || lower.endsWith("_" + keywords[k])) {
        return columns[i];
      }
    }
  }
  // Fallback: use the last column
  return columns[columns.length - 1];
}

/**
 * Find which column a task belongs to by matching tags to board column labels.
 * @param {Object} board - board record with columns array
 * @param {Object} task - task record with tags array
 * @returns {Object|null} the matching column or null
 */
export function findTaskColumn(board, task) {
  var tags = task.tags || [];
  for (var i = 0; i < board.columns.length; i++) {
    if (tags.indexOf(board.columns[i].label) !== -1) return board.columns[i];
  }
  return null;
}

/**
 * Compute the column label patch when moving a task to a new column.
 * Removes all existing board column labels from the task's tags, adds the new column label.
 * @param {Object} board - board record
 * @param {Object} task - original task
 * @param {Object} targetColumn - the column being moved into
 * @returns {Object} patch with tags array
 */
export function computeColumnLabelPatch(board, task, targetColumn) {
  var boardLabels = {};
  board.columns.forEach(function (c) { boardLabels[c.label] = true; });
  var newTags = (task.tags || []).filter(function (t) { return !boardLabels[t]; });
  newTags.push(targetColumn.label);
  return { tags: newTags };
}

/**
 * Evaluate all enabled board rules for a trigger event.
 * Conditions are evaluated against the ORIGINAL task. Actions are merged in rule order.
 *
 * @param {string} triggerType - e.g. "task.enterColumn" | "task.statusChanged"
 * @param {Object} task - the original task record
 * @param {Object} targetColumn - the column being entered (null for task.statusChanged)
 * @param {Object} board - the board containing rules
 * @param {Object|null} fromColumn - the column the task left (null for new board assignments)
 * @param {string} [newStatus] - new status value for "task.statusChanged" trigger
 * @returns {Object|null} a patch to merge with updateTask, or null if no rules fire
 */
export function evaluateBoardRules(triggerType, task, targetColumn, board, fromColumn, newStatus) {
  var rules = board.rules;
  if (!rules || !rules.length) return null;

  // Find matching rules
  var matched = [];
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (!rule.enabled) continue;
    if (rule.trigger.type !== triggerType) continue;
    if (triggerType === "task.statusChanged") {
      // Match on trigger.status (empty = any status change)
      if (rule.trigger.status && rule.trigger.status !== newStatus) continue;
    } else if (triggerType === "task.created") {
      // No trigger-specific filters; project match is handled by the call site
    } else {
      // Check columnId filter (empty = any column)
      if (rule.trigger.columnId && rule.trigger.columnId !== targetColumn.id) continue;
      // Check fromColumnId filter if present
      if (rule.trigger.fromColumnId && fromColumn && rule.trigger.fromColumnId !== fromColumn.id) continue;
      if (rule.trigger.fromColumnId && !fromColumn) continue;
    }
    // Evaluate conditions (all must pass, AND logic)
    if (!evaluateConditions(rule.conditions, task)) continue;
    matched.push(rule);
  }

  if (!matched.length) return null;

  // Sort by order
  matched.sort(function (a, b) { return a.order - b.order; });

  // Merge actions: start with original task state, apply actions sequentially
  var result = {
    tags: (task.tags || []).slice(),
    status: task.status || "open",
    priority: task.priority || "",
  };

  var boardLabelSet = {};
  board.columns.forEach(function (c) { boardLabelSet[c.label] = true; });

  for (var j = 0; j < matched.length; j++) {
    var actions = matched[j].actions;
    for (var k = 0; k < actions.length; k++) {
      var action = actions[k];
      if (action.type === "moveToColumn") {
        var targetCol = findColumnById(board, action.params.columnId);
        if (targetCol) {
          result.tags = result.tags.filter(function (t) { return !boardLabelSet[t]; });
          if (result.tags.indexOf(targetCol.label) === -1) {
            result.tags.push(targetCol.label);
          }
        }
      } else {
        applyAction(action, result);
      }
    }
  }

  // Compute the diff from original task to produce patch
  var patch = {};
  var originalTags = (task.tags || []).slice().sort().join(",");
  var resultTags = result.tags.slice().sort().join(",");
  if (originalTags !== resultTags) patch.tags = result.tags;

  if (result.status !== (task.status || "open")) patch.status = result.status;
  if (result.priority !== (task.priority || "")) patch.priority = result.priority;

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

/**
 * Evaluate all conditions against the task. All must pass (AND logic).
 */
function evaluateConditions(conditions, task) {
  if (!conditions || !conditions.length) return true;
  for (var i = 0; i < conditions.length; i++) {
    if (!evaluateCondition(conditions[i], task)) return false;
  }
  return true;
}

/**
 * Evaluate a single condition.
 */
function evaluateCondition(cond, task) {
  var fieldValue = getFieldValue(task, cond.field);
  switch (cond.operator) {
    case "equals":
      return fieldValue !== null && fieldValue.toLowerCase() === cond.value.toLowerCase();
    case "notEquals":
      return fieldValue === null || fieldValue.toLowerCase() !== cond.value.toLowerCase();
    case "contains":
      return Array.isArray(fieldValue) && fieldValue.some(function (v) {
        return v.toLowerCase() === cond.value.toLowerCase();
      });
    case "notContains":
      if (!Array.isArray(fieldValue)) return true;
      return !fieldValue.some(function (v) {
        return v.toLowerCase() === cond.value.toLowerCase();
      });
    case "isEmpty":
      if (Array.isArray(fieldValue)) return fieldValue.length === 0;
      return !fieldValue;
    case "isNotEmpty":
      if (Array.isArray(fieldValue)) return fieldValue.length > 0;
      return !!fieldValue;
    default:
      return false;
  }
}

/**
 * Get the field value from a task by field name.
 */
function getFieldValue(task, field) {
  switch (field) {
    case "status":
      return task.status || "open";
    case "tags":
      return task.tags || [];
    case "priority":
      return task.priority || "";
    default:
      return null;
  }
}

/**
 * Apply a single action to the result state (mutates result).
 */
function applyAction(action, result) {
  switch (action.type) {
    case "addTags":
      if (action.params && action.params.tags) {
        for (var i = 0; i < action.params.tags.length; i++) {
          var tag = action.params.tags[i];
          if (tag && result.tags.indexOf(tag) === -1) {
            result.tags.push(tag);
          }
        }
      }
      break;
    case "removeTags":
      if (action.params && action.params.tags) {
        for (var j = 0; j < action.params.tags.length; j++) {
          var rmTag = action.params.tags[j];
          var idx = result.tags.indexOf(rmTag);
          if (idx !== -1) result.tags.splice(idx, 1);
        }
      }
      break;
    case "setStatus":
      if (action.params && action.params.status) {
        result.status = action.params.status;
      }
      break;
    case "setPriority":
      if (action.params && action.params.priority !== undefined) {
        result.priority = action.params.priority;
      }
      break;
  }
}

/**
 * Find a board column by its ID.
 * @param {Object} board - board record with columns array
 * @param {string} columnId - column ID to find
 * @returns {Object|null} the matching column or null
 */
function findColumnById(board, columnId) {
  if (!board || !board.columns || !columnId) return null;
  for (var i = 0; i < board.columns.length; i++) {
    if (board.columns[i].id === columnId) return board.columns[i];
  }
  return null;
}
