import { evaluateBoardRules, findTaskColumn } from "@/domain/board-rules.js";
import {
  createBoard,
  deleteBoard,
  loadBoardPresets,
  loadBoards,
  refreshBoard,
  updateBoard,
} from "@/domain/boards.js";
import { errorMessage } from "@/domain/memo-repository.js";
import { completeTask, createTask, getTask, updateTask } from "@/domain/tasks.js";
import { setCheckboxControlValue } from "@/checkbox-control.js";
import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";

import { HomeBoardPageModel } from "./home_board.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { formatRelativeDate } from "./memo-date.js";
import { closestElement } from "./memo-utils.js";
import {
  BoardRuleActionRowView,
  BoardRuleConditionRowView,
  BoardRuleEditorView,
  BoardRulesOverviewView,
} from "./home_rule.js";
import {
  appendTimelessHost,
  ConfirmDeleteView,
  iconActionButton,
  reactiveWhen,
} from "./home_view_shared.js";

export function HomeBoardListContentView(props) {
  return BoardListView(props);
}

export function HomeBoardContentView(props) {
  return BoardView(props);
}

export function createHomeBoardState() {
  return {
    activeBoardId: "",
    boardPresetsOpen: false,
    boardPresets: [],
    boardPresetsProjectId: "",
    boardRuleEditorOpen: false,
    boardRuleEditorBoardId: "",
    boardRuleEditorRuleId: "",
    boards: [],
    boardsLoading: false,
  };
}

export function createHomeBoardController(options) {
  const { elements, root, state } = options;
  const render_all = () => options.renderAll();
  const render_project = () => options.renderProjectDetail();
  const refresh_tasks = (value) => options.refreshTasks(value);
  const toast = (message) => options.showToast(message);

  function find_board(id) {
    return state.boards.find((board) => board.id === id) || null;
  }

  function refresh_boards() {
    state.boardsLoading = true;
    return loadBoards().then(
      function (boards) {
        state.boards = boards;
        state.boardsLoading = false;
        if (["boards", "rules"].includes(state.activeView)) render_all();
        return boards;
      },
      function (error) {
        state.boardsLoading = false;
        throw error;
      },
    );
  }

  function board_rule_editor_presentation(board) {
    let rule = null;
    if (state.boardRuleEditorRuleId) {
      rule =
        (board.rules || []).find(
          (item) => item.id === state.boardRuleEditorRuleId,
        ) || null;
    }
    return { columns: board.columns, isNew: !rule, rule };
  }

  function board_view(board, tasks_by_column, available_tasks) {
    let rule_editor = null;
    if (
      state.boardRuleEditorOpen &&
      state.boardRuleEditorBoardId === board.id
    ) {
      rule_editor = board_rule_editor_presentation(board);
    }
    return BoardView({
      availableTasks: available_tasks || [],
      board: { id: board.id, title: board.title },
      columns: board.columns.map(function (column) {
        return {
          id: column.id,
          label: column.label,
          tasks: (tasks_by_column[column.id] || []).map(function (task) {
            let due = "";
            if (task.dueAt) due = formatRelativeDate(task.dueAt);
            return {
              boardId: task.boardId || board.id,
              complete: task.status === "completed",
              due,
              id: task.id,
              priority: task.priority || "none",
              title: task.title,
            };
          }),
        };
      }),
      ruleEditor: rule_editor,
    });
  }

  function render_boards() {
    let active_board = null;
    if (state.activeBoardId) active_board = find_board(state.activeBoardId);
    if (!active_board) {
      state.activeBoardId = "";
      renderTimelessView(
        elements.memoList,
        BoardListView({
          boards: state.boards.map((board) => ({
            columnCount: board.columns.length,
            id: board.id,
            title: board.title,
          })),
          presets: state.boardPresets,
          showPresets: state.boardPresetsOpen,
        }),
      );
      return;
    }

    const tasks_by_column = Object.fromEntries(
      active_board.columns.map((column) => [column.id, []]),
    );
    state.tasks.forEach(function (task) {
      if (task.boardId !== active_board.id) return;
      const column = findTaskColumn(active_board, task);
      const column_id = column?.id || active_board.columns[0]?.id;
      if (tasks_by_column[column_id]) tasks_by_column[column_id].push(task);
    });
    renderTimelessView(
      elements.memoList,
      board_view(active_board, tasks_by_column, null),
    );
  }

  function select_board(board_id) {
    state.activeBoardId = board_id;
    loadBoards()
      .then(function (boards) {
        state.boards = boards;
        return refresh_tasks({ render: false });
      })
      .then(render_all);
  }

  function confirm_delete_board(board) {
    return new Promise(function (resolve) {
      const dialog = appendTimelessHost(root, {
        class: "tn-overlay tn-dialog-layer is-open memo-delete-dialog",
        attributes: { n: "board-delete-dialog-host" },
      });
      renderTimelessView(
        dialog,
        ConfirmDeleteView({
          actionAttribute: "data-board-delete-confirm",
          description: board.title + "。看板内的任务不会被删除。",
          meaning: "board-delete-dialog",
          title: "删除看板？",
        }),
      );

      function close(confirmed) {
        document.removeEventListener("keydown", handle_keydown);
        unmountTimelessView(dialog);
        dialog.remove();
        resolve(confirmed);
      }
      function handle_keydown(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close(false);
      }
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) return close(false);
        const action = closestElement(
          event.target,
          "[data-board-delete-confirm]",
        );
        if (action && dialog.contains(action)) {
          close(action.dataset.boardDeleteConfirm === "confirm");
        }
      });
      document.addEventListener("keydown", handle_keydown);
      window.requestAnimationFrame(() =>
        dialog
          .querySelector('[data-board-delete-confirm="cancel"]')
          ?.focus(),
      );
    });
  }

  function delete_existing_board(board_id) {
    const board = find_board(board_id);
    if (!board) return;
    confirm_delete_board(board)
      .then(function (confirmed) {
        if (!confirmed) return null;
        return deleteBoard(board_id).then(function () {
          state.activeBoardId = "";
          state.tasks.forEach(function (task) {
            if (task.boardId === board_id) {
              updateTask(task.id, { boardId: "" }).catch(() => {});
            }
          });
          toast("看板已删除");
          return refresh_boards();
        });
      })
      .catch((error) => toast("删除失败: " + errorMessage(error)));
  }

  function load_presets(on_loaded) {
    if (state.boardPresets.length) return on_loaded();
    loadBoardPresets()
      .then(function (presets) {
        state.boardPresets = presets;
        on_loaded();
      })
      .catch(() => toast("加载模板失败"));
  }

  function show_board_presets() {
    if (state.boardPresetsOpen) {
      state.boardPresetsOpen = false;
      render_all();
      return;
    }
    load_presets(function () {
      state.boardPresetsOpen = true;
      render_all();
    });
  }

  function create_board_from_preset(preset_index, project_id = "") {
    const preset = state.boardPresets[preset_index];
    if (!preset || (project_id === null && !project_id)) return;
    const payload = {
      columns: preset.columns,
      rules: preset.rules,
      title: preset.title,
    };
    if (project_id) payload.projectId = project_id;
    createBoard(payload)
      .then(function () {
        state.boardPresetsOpen = false;
        state.boardPresets = [];
        state.boardPresetsProjectId = "";
        toast("看板已创建");
        if (!project_id) return refresh_boards();
        return Promise.all([
          refresh_boards(),
          refresh_tasks({ render: false }),
        ]).then(function () {
          const board = state.boards.find(
            (item) => item.projectId === project_id,
          );
          if (board) state.projectActiveTab = board.id;
          render_project();
        });
      })
      .catch((error) => toast("创建失败: " + errorMessage(error)));
  }

  function rule_trigger_label(rule, board) {
    const trigger = rule.trigger || {};
    const column = board.columns.find((item) => item.id === trigger.columnId);
    const from_column = board.columns.find(
      (item) => item.id === trigger.fromColumnId,
    );
    let source_label = "";
    if (trigger.fromColumnId) {
      source_label =
        " (来自 " + (from_column?.label || trigger.fromColumnId) + ")";
    }
    return "进入 " + (column?.label || "任意列") + source_label;
  }

  function rule_condition_label(rule) {
    return (rule.conditions || [])
      .map(function (condition) {
        if (condition.operator === "isEmpty") return condition.field + " 为空";
        if (condition.operator === "isNotEmpty")
          return condition.field + " 不为空";
        return `${condition.field} ${condition.operator} ${condition.value}`;
      })
      .join(" AND ");
  }

  function rule_action_label(rule) {
    return (
      (rule.actions || [])
        .map(function (action) {
          const params = action.params || {};
          if (action.type === "addTags")
            return "添加标签 " + (params.tags || []).join(", ");
          if (action.type === "removeTags")
            return "移除标签 " + (params.tags || []).join(", ");
          if (action.type === "setStatus") return "设置状态为 " + params.status;
          if (action.type === "setPriority")
            return "设置优先级 " + params.priority;
          return action.type;
        })
        .join("; ") || "(无)"
    );
  }

  function render_rules_overview() {
    let editor_board = null;
    let rule_editor = null;
    if (state.boardRuleEditorOpen) {
      editor_board = find_board(state.boardRuleEditorBoardId);
    }
    if (editor_board) {
      rule_editor = board_rule_editor_presentation(editor_board);
    }
    renderTimelessView(
      elements.memoList,
      BoardRulesOverviewView({
        boards: state.boards.map(function (board) {
          return {
            id: board.id,
            rules: (board.rules || [])
              .slice()
              .sort((left, right) => (left.order || 0) - (right.order || 0))
              .map((rule) => ({
                actionLabel: rule_action_label(rule),
                conditionLabel: rule_condition_label(rule),
                enabled: rule.enabled !== false,
                id: rule.id,
                name: rule.name,
                triggerLabel: rule_trigger_label(rule, board),
              })),
            title: board.title || board.id,
          };
        }),
        ruleEditor: rule_editor,
      }),
    );
  }

  function set_rule_editor(board_id = "", rule_id = "") {
    state.boardRuleEditorOpen = Boolean(board_id);
    state.boardRuleEditorBoardId = board_id;
    state.boardRuleEditorRuleId = rule_id;
    render_all();
  }

  function read_conditions(form) {
    return Array.from(form.querySelectorAll(".board-rule-condition-row"))
      .map(function (row) {
        const field = String(
          row.querySelector("[data-cond-field]")?.value || "",
        ).trim();
        const operator = String(
          row.querySelector("[data-cond-operator]")?.value || "",
        ).trim();
        const value = String(
          row.querySelector("[data-cond-value]")?.value || "",
        ).trim();
        if (
          !field ||
          !operator ||
          (!value && !["isEmpty", "isNotEmpty"].includes(operator))
        ) {
          return null;
        }
        return { field, operator, value };
      })
      .filter(Boolean);
  }

  function read_actions(form) {
    return Array.from(form.querySelectorAll(".board-rule-action-row"))
      .map(function (row) {
        const type = String(
          row.querySelector("[data-action-type]")?.value || "",
        ).trim();
        if (!type) return null;
        const params = {};
        if (["addTags", "removeTags"].includes(type)) {
          params.tags = String(
            row.querySelector("[data-action-tags]")?.value || "",
          )
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        } else if (type === "setStatus") {
          params.status = String(
            row.querySelector("[data-action-status]")?.value || "",
          ).trim();
        } else if (type === "setPriority") {
          params.priority = String(
            row.querySelector("[data-action-priority]")?.value || "",
          ).trim();
        }
        return { params, type };
      })
      .filter(Boolean);
  }

  function persist_rules(board_id, rules, success_message, close_editor) {
    return updateBoard(board_id, { rules })
      .then(function (updated_board) {
        const index = state.boards.findIndex((board) => board.id === board_id);
        if (index >= 0) state.boards[index] = updated_board;
        if (close_editor) set_rule_editor();
        else render_all();
        if (success_message) toast(success_message);
      })
      .catch((error) => toast("操作失败: " + errorMessage(error)));
  }

  function save_rule(form) {
    const board_id = state.boardRuleEditorBoardId;
    const board = find_board(board_id);
    if (!board) return;
    const rule_id = state.boardRuleEditorRuleId;
    const name = String(options.controlGroupValue(form, "name") || "").trim();
    if (!name) return toast("规则名称不能为空");
    const rules = (board.rules || []).slice();
    const index = rules.findIndex((rule) => rule.id === rule_id);
    let order = rules.length;
    if (index >= 0) order = rules[index].order;
    const enabled_control = form.querySelector('[name="enabled"]');
    const rule = {
      actions: read_actions(form),
      conditions: read_conditions(form),
      enabled: Boolean(enabled_control?.checked),
      id:
        rule_id ||
        `rule_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      name,
      order,
      trigger: {
        columnId: String(
          options.controlGroupValue(form, "triggerColumnId") || "",
        ).trim(),
        fromColumnId: String(
          options.controlGroupValue(form, "triggerFromColumnId") || "",
        ).trim(),
        type: String(
          options.controlGroupValue(form, "triggerType") || "",
        ).trim(),
      },
    };
    if (index >= 0) rules[index] = rule;
    else rules.push(rule);
    persist_rules(board_id, rules, "规则已保存", true);
  }

  function delete_rule(board_id, rule_id) {
    if (!confirm("确定要删除此规则吗？")) return;
    const board = find_board(board_id);
    if (!board) return;
    persist_rules(
      board_id,
      (board.rules || []).filter((rule) => rule.id !== rule_id),
      "规则已删除",
    );
  }

  function move_rule(board_id, rule_id, offset) {
    const board = find_board(board_id);
    if (!board) return;
    const rules = (board.rules || [])
      .slice()
      .sort((left, right) => (left.order || 0) - (right.order || 0));
    const index = rules.findIndex((rule) => rule.id === rule_id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= rules.length) return;
    rules.splice(target, 0, rules.splice(index, 1)[0]);
    rules.forEach((rule, order) => {
      rule.order = order;
    });
    persist_rules(board_id, rules);
  }

  function toggle_rule_enabled(board_id, rule_id) {
    const board = find_board(board_id);
    if (!board) return;
    persist_rules(
      board_id,
      (board.rules || []).map(function (rule) {
        if (rule.id === rule_id) {
          return { ...rule, enabled: !rule.enabled };
        }
        return rule;
      }),
    );
  }

  function add_rule_row(container, kind) {
    let row_view = BoardRuleActionRowView();
    if (kind === "condition") row_view = BoardRuleConditionRowView();
    appendTimelessHost(
      container,
      {
        class: `board-rule-${kind}-row`,
        attributes: { n: `board-rule-${kind}-row` },
      },
      [row_view],
    );
  }

  function handle_board_create_submit(form) {
    if (!form) return;
    const title = String(options.controlGroupValue(form, "title") || "").trim();
    if (!title) return;
    createBoard({
      columns: [
        { id: "todo", label: "Todo", order: 0 },
        { id: "doing", label: "Doing", order: 1 },
        { id: "done", label: "Done", order: 2 },
      ],
      title,
    })
      .then(function () {
        options.clearControlGroup(form);
        toast("看板已创建");
        return refresh_boards();
      })
      .catch((error) => toast("创建失败: " + errorMessage(error)));
  }

  function handle_board_add_task_submit(form, board_id) {
    if (!form) return;
    const title = String(options.controlGroupValue(form, "title") || "").trim();
    const board = find_board(board_id);
    if (!title || !board?.columns.length) return;
    const task = {
      boardId: board_id,
      tags: [board.columns[0].label],
      title,
    };
    if (state.activeView === "project-detail" && state.activeProjectId) {
      task.projectId = state.activeProjectId;
    }
    createTask(task)
      .then(function () {
        options.clearControlGroup(form);
        toast("任务已添加");
        return refresh_tasks().then(render_all);
      })
      .catch((error) => toast("添加失败: " + errorMessage(error)));
  }

  function column_patch(task, board, column, from_column) {
    const labels = new Set(board.columns.map((item) => item.label));
    const column_tags = (task.tags || [])
      .filter((tag) => !labels.has(tag))
      .concat(column.label);
    const rule_patch = evaluateBoardRules(
      "task.enterColumn",
      task,
      column,
      board,
      from_column,
    );
    const patch = { tags: column_tags };
    if (!rule_patch) return patch;
    if (rule_patch.tags) {
      const original = task.tags || [];
      const removed = new Set(
        original.filter((tag) => !rule_patch.tags.includes(tag)),
      );
      patch.tags = column_tags.filter((tag) => !removed.has(tag));
      rule_patch.tags
        .filter((tag) => !original.includes(tag))
        .forEach((tag) => {
          if (!patch.tags.includes(tag)) patch.tags.push(tag);
        });
    }
    if (rule_patch.status !== undefined) patch.status = rule_patch.status;
    if (rule_patch.priority !== undefined) patch.priority = rule_patch.priority;
    return patch;
  }

  function refresh_tasks_and_render() {
    return refresh_tasks().then(render_all);
  }

  function remove_from_board(task_id) {
    getTask(task_id)
      .then(function (task) {
        const board = find_board(task.boardId);
        let board_labels = [];
        if (board) {
          board_labels = board.columns.map((column) => column.label);
        }
        const labels = new Set(board_labels);
        return updateTask(task_id, {
          boardId: "",
          tags: (task.tags || []).filter((tag) => !labels.has(tag)),
        });
      })
      .then(function () {
        toast("已移出看板");
        return refresh_tasks_and_render();
      })
      .catch((error) => toast("操作失败: " + errorMessage(error)));
  }

  function move_task(task_id, board, column) {
    getTask(task_id)
      .then((task) =>
        updateTask(
          task_id,
          column_patch(task, board, column, findTaskColumn(board, task)),
        ),
      )
      .then(refresh_tasks_and_render)
      .catch((error) => toast("操作失败: " + errorMessage(error)));
  }

  function handle_board_drag_start(event) {
    const card = event.target.closest(".memo-board-card");
    if (!card?.dataset.taskId) return;
    event.dataTransfer.setData("text/plain", card.dataset.taskId);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  }

  function handle_board_drag_over(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.target.closest("[data-column-drop]")?.classList.add("is-drop-target");
  }

  function handle_board_drag_leave(event) {
    const column = event.target.closest("[data-column-drop]");
    if (column && !column.contains(event.relatedTarget)) {
      column.classList.remove("is-drop-target");
    }
  }

  function handle_board_drop(event) {
    event.preventDefault();
    const column_node = event.target.closest("[data-column-drop]");
    if (!column_node) return;
    column_node.classList.remove("is-drop-target");
    const task_id = event.dataTransfer.getData("text/plain");
    const board = find_board(
      column_node.closest("[data-board-id]")?.dataset.boardId,
    );
    const column = board?.columns.find(
      (item) => item.id === column_node.dataset.columnDrop,
    );
    if (task_id && board && column) move_task(task_id, board, column);
  }

  function handle_board_drag_end(event) {
    event.target.closest(".memo-board-card")?.classList.remove("is-dragging");
    root
      .querySelectorAll("[data-column-drop].is-drop-target")
      .forEach((column) => column.classList.remove("is-drop-target"));
  }

  function handle_board_task_select(event) {
    const select = event.target.closest("[data-board-task-select]");
    if (!select || !root.contains(select) || !select.value) return;
    const board = find_board(select.dataset.boardId);
    if (!board?.columns.length) return;
    const task_id = select.value;
    getTask(task_id)
      .then((task) =>
        updateTask(task_id, {
          boardId: board.id,
          ...column_patch(task, board, board.columns[0], null),
        }),
      )
      .then(function () {
        select.value = "";
        toast("已添加到看板");
        return refresh_tasks_and_render();
      })
      .catch((error) => toast("操作失败: " + errorMessage(error)));
  }

  function toggle_board_card_completion(checkbox) {
    const card = closestElement(checkbox, ".memo-board-card");
    if (!card) return;
    const checked = checkbox.checked;
    const task_id = card.dataset.taskId;
    const board_id = card.dataset.boardId;
    if (!task_id || !board_id) return;
    const board = find_board(board_id);
    if (!board) return;

    checkbox.disabled = true;
    let request;
    if (checked) {
      request = completeTask(task_id).then(function (task) {
        const status_patch =
          evaluateBoardRules(
            "task.statusChanged",
            task,
            null,
            board,
            null,
            "completed",
          ) || {};
        return updateTask(task_id, status_patch);
      });
    } else {
      request = updateTask(task_id, { status: "open" });
    }

    request
      .then(function () {
        return refresh_tasks().then(render_all);
      })
      .catch(function (error) {
        setCheckboxControlValue(checkbox, !checked);
        checkbox.disabled = false;
        toast("操作失败: " + errorMessage(error));
      });
  }

  function refresh_board_and_notify(board_id) {
    return refreshBoard(board_id)
      .then(function (count) {
        let message = "已刷新看板";
        if (count > 0) message += "，添加了 " + count + " 个任务";
        toast(message);
        return refresh_tasks().then(function () {
          render_all();
          return count;
        });
      })
      .catch(function (error) {
        toast("刷新看板失败: " + errorMessage(error));
      });
  }

  return {
    addRuleActionRow: (container) => add_rule_row(container, "action"),
    addRuleConditionRow: (container) => add_rule_row(container, "condition"),
    backToBoardList() {
      state.activeBoardId = "";
      render_all();
    },
    boardView: board_view,
    closeBoardPresets() {
      state.boardPresetsOpen = false;
      render_all();
    },
    closeProjectBoardPresets() {
      state.boardPresetsOpen = false;
      state.boardPresetsProjectId = "";
      render_project();
    },
    closeRuleEditor: () => set_rule_editor(),
    createBoardFromPreset: create_board_from_preset,
    createProjectBoardFromPreset: create_board_from_preset,
    deleteExistingBoard: delete_existing_board,
    deleteRule: delete_rule,
    editRule: (board_id, rule_id) => set_rule_editor(board_id, rule_id),
    findBoard: find_board,
    handleBoardAddTaskSubmit: handle_board_add_task_submit,
    handleBoardCreateSubmit: handle_board_create_submit,
    handleBoardDragEnd: handle_board_drag_end,
    handleBoardDragLeave: handle_board_drag_leave,
    handleBoardDragOver: handle_board_drag_over,
    handleBoardDragStart: handle_board_drag_start,
    handleBoardDrop: handle_board_drop,
    handleBoardTaskSelect: handle_board_task_select,
    moveRuleDown: (board_id, rule_id) => move_rule(board_id, rule_id, 1),
    moveRuleUp: (board_id, rule_id) => move_rule(board_id, rule_id, -1),
    openAddRuleDialog: (board_id) => set_rule_editor(board_id),
    refreshBoardAndNotify: refresh_board_and_notify,
    refreshBoardsFromVault: refresh_boards,
    removeFromBoard: remove_from_board,
    renderBoards: render_boards,
    renderRulesOverview: render_rules_overview,
    saveRule: save_rule,
    selectBoard: select_board,
    showBoardPresets: show_board_presets,
    showProjectBoardPresets(project_id) {
      if (!project_id) return;
      state.boardPresetsProjectId = project_id;
      load_presets(function () {
        state.boardPresetsOpen = true;
        render_project();
      });
    },
    toggleRuleEnabled: toggle_rule_enabled,
    toggleBoardCardCompletion: toggle_board_card_completion,
  };
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeBoardPageView(props) {
  const vm$ = HomeBoardPageModel(props);
  return View(
    {
      class: "page home-board-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-board-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-board-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-board-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function BoardPresetsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  let close_action = "closeBoardPresets";
  let create_action = "createBoardFromPreset";
  if (props.projectId) {
    close_action = "closeProjectBoardPresets";
    create_action = "createProjectBoardFromPreset";
  }
  return View(
    {
      class: "tn-overlay tn-dialog-layer is-open memo-board-presets-overlay",
      attributes: {
        "data-board-presets-overlay": "true",
        n: "board-presets-overlay",
      },
    },
    [
      View(
        {
          class: "tn-dialog tn-dialog--lg memo-board-presets-dialog",
          attributes: { n: "board-presets-dialog" },
        },
        [
          View(
            {
              class: "memo-board-presets-header",
              attributes: { n: "board-presets-header" },
            },
            [
              View({ as: "h3", attributes: { n: "board-presets-title" } }, [
                "选择模板",
              ]),
              Button(
                {
                  class: "memo-board-presets-close",
                  attributes: {
                    "data-action": close_action,
                    n: "board-presets-close",
                    type: "button",
                  },
                },
                [
                  Timeless.Icon({
                    name: "x",
                    attributes: { n: "board-presets-close-icon" },
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-board-presets-list",
              attributes: { n: "board-presets-list" },
            },
            [
              For({
                each: props.presets || [],
                render(preset, index$) {
                  const index = index$?.value ?? 0;
                  return View(
                    {
                      class: "memo-board-preset-item",
                      attributes: {
                        "data-preset-index": index,
                        n: "board-preset-item",
                      },
                    },
                    [
                      View(
                        {
                          class: "memo-board-preset-info",
                          attributes: { n: "board-preset-info" },
                        },
                        [
                          View(
                            {
                              as: "strong",
                              attributes: { n: "board-preset-title" },
                            },
                            [preset.title],
                          ),
                          View(
                            {
                              class: "memo-board-preset-columns",
                              attributes: { n: "board-preset-columns" },
                            },
                            [
                              For({
                                each: preset.columns || [],
                                render(column) {
                                  return View(
                                    {
                                      as: "span",
                                      class: "memo-board-preset-column-tag",
                                      attributes: { n: "board-preset-column" },
                                    },
                                    [column.label],
                                  );
                                },
                              }),
                            ],
                          ),
                        ],
                      ),
                      Button(
                        {
                          class: "memo-board-preset-use-btn",
                          attributes: {
                            "data-action": create_action,
                            "data-preset-index": index,
                            "data-project-id": props.projectId,
                            n: "board-preset-use",
                            type: "button",
                          },
                        },
                        ["使用"],
                      ),
                    ],
                  );
                },
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

export function BoardListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  return runtime.Fragment({}, [
    View({ class: "memo-board-list", attributes: { n: "board-list" } }, [
      View(
        {
          class: "memo-board-list-header",
          attributes: { n: "board-list-header" },
        },
        [
          View({ as: "h2", attributes: { n: "board-list-title" } }, [
            "看板列表",
          ]),
          Button(
            {
              class: "memo-board-preset-btn",
              attributes: {
                "data-action": "showBoardPresets",
                n: "board-list-show-presets",
                type: "button",
              },
            },
            ["从模板创建"],
          ),
        ],
      ),
      View(
        {
          class: "memo-board-create-form",
          attributes: {
            "data-board-create-form": "true",
            n: "board-create-form",
          },
        },
        [
          Input({
            class: "memo-board-create-input",
            type: "text",
            placeholder: "输入看板名称快速创建（默认三列）",
            attributes: {
              autocomplete: "off",
              n: "board-create-title",
              name: "title",
              type: "text",
            },
          }),
          Button(
            {
              class: "memo-board-create-submit",
              attributes: {
                "data-action": "createBoardSubmit",
                n: "board-create-submit",
                type: "button",
              },
            },
            ["创建"],
          ),
        ],
      ),
      Show({
        when: reactiveWhen(props.boards?.length),
        ok() {
          return View(
            {
              class: "memo-board-list-items",
              attributes: { n: "board-list-items" },
            },
            [
              For({
                each: props.boards,
                render(board) {
                  return View(
                    {
                      class: "memo-board-list-item",
                      attributes: {
                        "data-board-id": board.id,
                        n: "board-list-item",
                      },
                    },
                    [
                      View(
                        {
                          class: "memo-board-list-item-info",
                          attributes: { n: "board-list-item-info" },
                        },
                        [
                          View(
                            {
                              as: "strong",
                              attributes: { n: "board-list-item-title" },
                            },
                            [board.title],
                          ),
                          View(
                            {
                              as: "span",
                              attributes: { n: "board-list-item-count" },
                            },
                            [board.columnCount + " 列"],
                          ),
                        ],
                      ),
                      View(
                        {
                          class: "memo-board-list-item-actions",
                          attributes: { n: "board-list-item-actions" },
                        },
                        [
                          Button(
                            {
                              class: "memo-board-select-btn",
                              attributes: {
                                "data-action": "selectBoard",
                                "data-board-id": board.id,
                                n: "board-list-enter",
                                type: "button",
                              },
                            },
                            ["进入"],
                          ),
                          Button(
                            {
                              class: "memo-board-delete-btn",
                              attributes: {
                                "aria-label": "删除看板",
                                "data-action": "deleteBoard",
                                "data-board-id": board.id,
                                n: "board-list-delete",
                                title: "删除看板",
                                type: "button",
                              },
                            },
                            [
                              Timeless.Icon({
                                name: "trash2",
                                attributes: { n: "board-list-delete-icon" },
                              }),
                            ],
                          ),
                        ],
                      ),
                    ],
                  );
                },
              }),
            ],
          );
        },
        else() {
          return View(
            {
              class: "memo-board-list-empty",
              attributes: { n: "board-list-empty" },
            },
            ["暂无看板，创建一个吧"],
          );
        },
      }),
    ]),
    Show({
      when: reactiveWhen(props.showPresets),
      ok() {
        return BoardPresetsView({ presets: props.presets, runtime });
      },
    }),
  ]);
}

function BoardCardView(props) {
  const { Checkbox, View } = props.runtime;
  const task = props.task;
  const class_name_ = computed(
    ref({
      complete: Boolean(task.complete),
      priority: task.priority,
    }),
    function (value) {
      let class_name = "memo-board-card";
      if (value.priority !== "none") {
        class_name += " is-priority-" + value.priority;
      }
      if (value.complete) class_name += " is-completed";
      return class_name;
    },
  );
  return View(
    {
      class: class_name_,
      attributes: {
        "data-board-id": task.boardId,
        "data-task-id": task.id,
        draggable: "true",
        n: "board-task-card",
      },
    },
    [
      Checkbox({
        checked: task.complete,
        class: "memo-board-card-check memo-todo-checkbox",
        attributes: {
          "aria-label": "切换任务完成状态",
          "data-board-card-complete": "true",
          n: "board-card-completion-checkbox",
        },
      }),
      View(
        {
          class: "memo-board-card-body-inner",
          attributes: { n: "board-task-card-body" },
        },
        [
          View(
            {
              class: "memo-board-card-title",
              attributes: { n: "board-task-card-title" },
            },
            [task.title],
          ),
          Show({
            when: reactiveWhen(task.due),
            ok() {
              return View(
                {
                  class: "memo-board-card-meta",
                  attributes: { n: "board-task-card-meta" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-board-card-due",
                      attributes: { n: "board-task-card-due" },
                    },
                    [task.due],
                  ),
                ],
              );
            },
          }),
        ],
      ),
    ],
  );
}

export function BoardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Input, Select, View } = runtime;
  return runtime.Fragment({}, [
    View(
      {
        class: "memo-board",
        attributes: { "data-board-id": props.board.id, n: "board-detail" },
      },
      [
        View(
          { class: "memo-board-header", attributes: { n: "board-header" } },
          [
            View(
              {
                class: "memo-board-header-actions",
                attributes: { n: "board-header-actions" },
              },
              [
                Show({
                  when: reactiveWhen(props.availableTasks?.length),
                  ok() {
                    return Select({
                      class: "memo-board-task-select",
                      attributes: {
                        "data-board-id": props.board.id,
                        "data-board-task-select": "true",
                        n: "board-task-select",
                      },
                      options: props.availableTasks.map(function (task) {
                        return { label: task.title, value: task.id };
                      }),
                      placeholder: "选择待办…",
                      value: "",
                    });
                  },
                }),
                View(
                  {
                    class: "memo-board-add-task-form",
                    attributes: {
                      "data-board-add-task-form": "true",
                      n: "board-add-task-form",
                    },
                  },
                  [
                    Input({
                      type: "text",
                      placeholder: "快速添加任务...",
                      attributes: {
                        autocomplete: "off",
                        n: "board-add-task-title",
                        name: "title",
                        type: "text",
                      },
                    }),
                    iconActionButton(runtime, {
                      action: "addBoardTaskSubmit",
                      boardId: props.board.id,
                      class: "memo-board-add-task-submit",
                      icon: "plus",
                      label: "添加任务",
                      meaning: "board-add-task-submit",
                    }),
                  ],
                ),
                iconActionButton(runtime, {
                  action: "refreshBoard",
                  boardId: props.board.id,
                  class: "memo-board-refresh-btn",
                  icon: "refresh-cw",
                  label: "刷新看板",
                  meaning: "board-refresh",
                }),
                iconActionButton(runtime, {
                  action: "openAddRuleDialog",
                  boardId: props.board.id,
                  class: "memo-board-rules-btn",
                  icon: "plus",
                  label: "添加规则",
                  meaning: "board-add-rule",
                  text: "添加规则",
                }),
                iconActionButton(runtime, {
                  action: "deleteBoard",
                  boardId: props.board.id,
                  class: "memo-board-delete-board-btn",
                  icon: "trash2",
                  label: "删除看板",
                  meaning: "board-delete",
                }),
              ],
            ),
          ],
        ),
        View(
          { class: "memo-board-columns", attributes: { n: "board-columns" } },
          [
            For({
              each: props.columns || [],
              render(column) {
                return View(
                  {
                    class: "memo-board-column",
                    attributes: {
                      "data-column-id": column.id,
                      n: "board-column",
                    },
                  },
                  [
                    View(
                      {
                        class: "memo-board-column-header",
                        attributes: { n: "board-column-header" },
                      },
                      [
                        View(
                          { as: "h3", attributes: { n: "board-column-title" } },
                          [column.label],
                        ),
                        View(
                          {
                            as: "span",
                            class: "memo-board-column-count",
                            attributes: { n: "board-column-count" },
                          },
                          [column.tasks.length],
                        ),
                      ],
                    ),
                    View(
                      {
                        class: "memo-board-column-body",
                        attributes: {
                          "data-column-drop": column.id,
                          n: "board-column-body",
                        },
                      },
                      [
                        Show({
                          when: reactiveWhen(column.tasks.length),
                          ok() {
                            return For({
                              each: column.tasks,
                              render(task) {
                                return BoardCardView({ runtime, task });
                              },
                            });
                          },
                          else() {
                            return View(
                              {
                                class: "memo-board-empty",
                                attributes: { n: "board-column-empty" },
                              },
                              ["此列暂无任务"],
                            );
                          },
                        }),
                      ],
                    ),
                  ],
                );
              },
            }),
          ],
        ),
      ],
    ),
    Show({
      when: reactiveWhen(props.ruleEditor),
      ok() {
        return BoardRuleEditorView({ ...props.ruleEditor, runtime });
      },
    }),
  ]);
}


// __HOME_BOARD_VIEWS__
