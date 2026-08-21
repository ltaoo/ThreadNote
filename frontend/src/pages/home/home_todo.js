import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";
import { TimelessPrimitive } from "@/timeless-icons.js";
import {
  DEFAULT_VISIBILITY,
  normalizeMemoPayload,
  parseTaskLine,
  parseTaskTitleAndDesc,
  updateTaskLine,
} from "@/domain/memos.js";
import {
  completeTask,
  createTask,
  createTaskNote,
  deleteTask,
  getTask,
  normalizeTaskSummary,
  updateTask,
} from "@/domain/tasks.js";
import { evaluateBoardRules } from "@/domain/board-rules.js";
import {
  errorMessage,
  saveMemos,
  updateMemoInVault,
} from "@/domain/memo-repository.js";
import { setCheckboxControlValue } from "@/components.js";

import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { formatDateTime } from "./home_memo_helpers.js";
import { HomeTodoPageModel } from "./home_todo.model.js";
import { closestElement, copyText } from "./memo-utils.js";
import {
  appendTimelessHost,
  EmptyStateView,
  iconActionButton,
  memoIcon,
  PrivateOverlayView,
  reactiveWhen,
  renderTimelessHost,
} from "./home_view_shared.js";

const TASK_FILTER_STORAGE_KEY = "demo-desktop:gtd:task-filter:v1";
const TASK_FILTERS = new Set([
  "all",
  "completed",
  "inbox",
  "next",
  "overdue",
  "scheduled",
  "today",
]);

export function HomeTodoContentView(props) {
  return TaskCollectionsView({ ...props, mode: "tasks" });
}

export function createHomeTodoState(task_filter) {
  return {
    retainedCompletedTaskFilters: new Map(),
    taskDetails: new Map(),
    taskFilter: task_filter,
    tasks: [],
    tasksLoading: false,
  };
}

export function createHomeTodoController(options) {
  const { elements, state } = options;
  const {
    clearControlGroup,
    controlGroupValue,
    findBoard,
    focusMemo,
    refreshTasksFromVault,
    renderAll,
    renderProjectDetail,
    root,
    showToast,
  } = options;
  const els = elements;
  const projectLabel = options.projectLabel;

  function findMemo(memo_id) {
    return state.memos.find((memo) => memo.id === memo_id) || null;
  }

  function findComment(comment_id) {
    return state.comments.find((comment) => comment.id === comment_id) || null;
  }

  function findTask(task_id) {
    return state.tasks.find((task) => task.id === task_id) || null;
  }

  function task_date_value(value) {
    const raw = String(value || "").trim();
    const date_only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (date_only) {
      return new Date(
        Number(date_only[1]),
        Number(date_only[2]) - 1,
        Number(date_only[3]),
      );
    }
    return new Date(raw);
  }

  function date_key(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function task_time_value(value) {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const date = task_date_value(value);
    if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;
    return date.getTime();
  }

  function is_task_today(task) {
    const today = date_key(new Date());
    return [task.startAt, task.dueAt].some(
      (value) => value && date_key(task_date_value(value)) === today,
    );
  }

  function is_task_overdue(task) {
    if (!task.dueAt || task.status === "completed") return false;
    const due = task_date_value(task.dueAt);
    return !Number.isNaN(due.getTime()) && date_key(due) < date_key(new Date());
  }

  function is_retained_completed_task(task, filter) {
    return Boolean(
      task?.status === "completed" &&
        state.retainedCompletedTaskFilters.get(task.id) ===
          options.normalizeTaskFilter(filter),
    );
  }

  function task_matches_filter(task, filter) {
    if (is_retained_completed_task(task, filter)) return true;
    switch (filter) {
    case "all":
      return true;
    case "completed":
      return task.status === "completed";
    case "inbox":
      return (
        task.status !== "completed" &&
          (task.listId === "inbox" || !task.listId)
      );
    case "overdue":
      return is_task_overdue(task);
    case "scheduled":
      return task.status !== "completed" && Boolean(task.startAt || task.dueAt);
    case "next":
      return task.status !== "completed" && !task.parentId;
    case "today":
    default:
      return (
        task.status !== "completed" &&
          (is_task_today(task) || is_task_overdue(task))
      );
    }
  }

  function scoped_tasks() {
    if (state.activeProjectFilter === "unassigned") {
      return state.tasks.filter((task) => !task.projectId);
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.tasks.filter(
        (task) => task.projectId === state.activeProjectFilter,
      );
    }
    return state.tasks;
  }

  function sort_tasks(left, right) {
    if (state.taskFilter === "completed") {
      return (
        task_time_value(right.completedAt || right.updatedAt || right.createdAt) -
        task_time_value(left.completedAt || left.updatedAt || left.createdAt)
      );
    }
    if (left.status !== right.status) {
      if (left.status === "completed") return 1;
      if (right.status === "completed") return -1;
    }
    const created =
      task_time_value(right.createdAt) - task_time_value(left.createdAt);
    if (created) return created;
    const weights = { high: 3, low: 1, medium: 2, none: 0 };
    const priority =
      (weights[right.priority] || 0) - (weights[left.priority] || 0);
    return priority || task_time_value(right.updatedAt) - task_time_value(left.updatedAt);
  }

  function visible_tasks() {
    const query = state.query.toLowerCase();
    return scoped_tasks()
      .filter((task) => task_matches_filter(task, state.taskFilter))
      .filter(function (task) {
        if (!query) return true;
        return [
          task.title,
          task.listId,
          task.priority,
          task.status,
          task.projectId,
          task.source?.memoId,
          task.source?.text,
          (task.tags || []).join(" "),
          (task.contexts || []).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sort_tasks);
  }

  function grouped_tasks(tasks) {
    if (state.taskFilter === "completed") return [{ label: "已完成", tasks }];
    if (state.taskFilter === "overdue") return [{ label: "已过期", tasks }];
    if (state.taskFilter === "scheduled") {
      return [
        { label: "已过期", tasks: tasks.filter(is_task_overdue) },
        {
          label: "今天",
          tasks: tasks.filter(
            (task) => !is_task_overdue(task) && is_task_today(task),
          ),
        },
        {
          label: "未来",
          tasks: tasks.filter(
            (task) => !is_task_overdue(task) && !is_task_today(task),
          ),
        },
      ].filter((group) => group.tasks.length);
    }
    return [
      {
        label: "未完成",
        tasks: tasks.filter((task) => task.status !== "completed"),
      },
      {
        label: "已完成",
        tasks: tasks.filter((task) => task.status === "completed"),
      },
    ].filter((group) => group.tasks.length);
  }

  function task_filter_counts(tasks) {
    return {
      all: tasks.length,
      completed: tasks.filter((task) => task.status === "completed").length,
      inbox: tasks.filter((task) => task_matches_filter(task, "inbox")).length,
      next: tasks.filter((task) => task_matches_filter(task, "next")).length,
      overdue: tasks.filter((task) => task_matches_filter(task, "overdue"))
        .length,
      scheduled: tasks.filter((task) => task_matches_filter(task, "scheduled"))
        .length,
      today: tasks.filter((task) => task_matches_filter(task, "today")).length,
    };
  }

  function task_presentation(task) {
    const complete = task.status === "completed";
    const priority_labels = { high: "高", low: "低", medium: "中", none: "" };
    const meta = [];
    if (task.projectId) meta.push({ label: options.projectLabel(task.projectId) });
    meta.push({ label: task.listId || "inbox" });
    if (task.parentId) meta.push({ label: "子任务" });
    if (task.dueAt)
      meta.push({
        datetime: task.dueAt,
        label: "截止 " + options.formatDateTime(task_date_value(task.dueAt)),
        time: true,
      });
    if (task.startAt)
      meta.push({
        datetime: task.startAt,
        label: "开始 " + options.formatDateTime(task_date_value(task.startAt)),
        time: true,
      });
    if (complete && task.completedAt)
      meta.push({
        action: "editCompletedAt",
        class: "memo-task-completed-time",
        completedAt: task.completedAt,
        label: "完成 " + options.formatDateTime(task_date_value(task.completedAt)),
        title: "点击编辑完成时间",
      });
    if (task.noteCount) meta.push({ label: task.noteCount + " notes" });
    if (task.subtaskCount) meta.push({ label: task.subtaskCount + " subtasks" });
    if (task.source?.memoId)
      meta.push({
        action: "openSourceMemo",
        commentId: task.source.commentId || "",
        label: "来源 Memo",
        memoId: task.source.memoId,
        title: "有关联 memo",
      });
    (task.contexts || []).slice(0, 3).forEach((item) => meta.push({ label: "@" + item }));
    (task.tags || []).slice(0, 3).forEach((tag) => meta.push({ label: "#" + tag }));
    return {
      actions: [
        { action: "editTask", icon: "clock", label: "编辑任务" },
        { action: "addTaskNote", icon: "edit", label: "添加 note" },
        { action: "copyTaskRef", icon: "link", label: "复制引用" },
        { action: "deleteTask", danger: true, icon: "trash2", label: "删除" },
      ],
      badge: priority_labels[task.priority || "none"],
      complete,
      id: task.id,
      meta,
      priority: task.priority || "none",
      private: Boolean(task.private && !state.privateUnlocked),
      title: task.title,
    };
  }

  function render_todos() {
    options.beforeRender();
    const counts = task_filter_counts(scoped_tasks());
    const filters = [
      ["inbox", "Inbox"],
      ["today", "Today"],
      ["overdue", "已过期"],
      ["scheduled", "Scheduled"],
      ["next", "Next"],
      ["completed", "Completed"],
      ["all", "All"],
    ].map(([value, label]) => ({
      active: state.taskFilter === value,
      count: counts[value] || "",
      label,
      value,
    }));
    renderTimelessView(
      elements.memoList,
      HomeTodoContentView({
        filters,
        groups: grouped_tasks(visible_tasks()).map((group) => ({
          items: group.tasks.map(task_presentation),
          label: group.label,
        })),
      }),
    );
  }

  function retainCompletedTaskInFilter(task_id, filter) {
    const id = String(task_id || "").trim();
    const normalized = options.normalizeTaskFilter(filter);
    if (id && !["all", "completed"].includes(normalized)) {
      state.retainedCompletedTaskFilters.set(id, normalized);
    }
  }

  const dateKey = date_key;
  const taskDateValue = task_date_value;

  function select_task_filter(filter) {
    state.retainedCompletedTaskFilters.clear();
    state.taskFilter = normalizeTaskFilter(filter);
    rememberTaskFilter(state.taskFilter);
    renderAll();
  }

  function createTaskFromForm(form) {
    if (!form) return;
    const title = String(controlGroupValue(form, "title") || "").trim();
    if (!title) {
      showToast("任务标题不能为空");
      return;
    }
    let dueAt = String(controlGroupValue(form, "dueAt") || "").trim();
    if (!dueAt && state.taskFilter === "today") {
      dueAt = dateKey(new Date());
    }
    const priority = String(
      controlGroupValue(form, "priority", "none") || "none",
    ).trim();
    const projectId =
      state.activeProjectFilter &&
      state.activeProjectFilter !== "all" &&
      state.activeProjectFilter !== "unassigned"
        ? state.activeProjectFilter
        : "";
    const visibility = String(
      controlGroupValue(form, "visibility", DEFAULT_VISIBILITY) ||
        DEFAULT_VISIBILITY,
    ).trim();
    const payload = {
      dueAt,
      listId: state.taskFilter === "inbox" ? "inbox" : "",
      priority,
      projectId,
      title,
      visibility: visibility || DEFAULT_VISIBILITY,
    };
    createTask(payload).then(
      function (task) {
        const summary = normalizeTaskSummary(task);
        if (summary) state.tasks = [summary].concat(state.tasks);
        clearControlGroup(form);
        renderAll();
        refreshTasksFromVault();
        showToast("已创建任务");
      },
      function (err) {
        showToast("创建任务失败: " + errorMessage(err));
      },
    );
  }

  function toggleExistingTaskCompletion(taskId, checkbox) {
    const id = String(taskId || "").trim();
    if (!id || !checkbox) return;
    const checked = checkbox.checked;
    const completedInFilter = state.taskFilter;
    const taskCard = checkbox
      ? closestElement(checkbox, "[data-task-id]")
      : null;
    const isProjectTask = Boolean(
      taskCard && taskCard.classList.contains("memo-project-todo-item"),
    );
    const existingTask = state.tasks.find((item) => item && item.id === id);
    const sourceMemoId =
      existingTask && existingTask.source ? existingTask.source.memoId : "";
    const sourceLine =
      existingTask && existingTask.source ? existingTask.source.line : 0;
    checkbox.disabled = true;
    const request = checked
      ? completeTask(id)
      : updateTask(id, { completedAt: "", status: "open" });
    request.then(
      function (task) {
        const summary = normalizeTaskSummary(task);
        if (checked) {
          retainCompletedTaskInFilter(id, completedInFilter);
        } else {
          state.retainedCompletedTaskFilters.delete(id);
        }
        state.tasks = state.tasks.map((item) =>
          item.id === id && summary ? summary : item,
        );
        if (isProjectTask) renderProjectDetail();
        else replaceTaskCard(taskCard, summary);
        if (sourceMemoId && sourceLine > 0) {
          syncMemoTaskLine(sourceMemoId, sourceLine, checked);
        }
        if (checked && task.boardId) {
          var board = findBoard(task.boardId);
          if (board) {
            var statusPatch = evaluateBoardRules(
              "task.statusChanged",
              task,
              null,
              board,
              null,
              "completed",
            );
            if (statusPatch) {
              updateTask(id, statusPatch).then(function () {
                refreshTasksFromVault().then(function () {
                  renderAll();
                });
              });
            }
          }
        }
        showToast(checked ? "已完成任务" : "已取消完成");
      },
      function (err) {
        setCheckboxControlValue(checkbox, !checked);
        checkbox.disabled = false;
        showToast(
          (checked ? "完成任务失败: " : "取消完成失败: ") + errorMessage(err),
        );
      },
    );
  }

  function syncMemoTaskLine(memoId, line, checked) {
    var memo = findMemo(memoId);
    if (!memo) return;
    var lines = memo.content.split("\n");
    var index = line - 1;
    if (!lines[index]) return;
    var updatedLine = updateTaskLine(lines[index], checked);
    if (updatedLine === lines[index]) return;
    lines[index] = updatedLine;
    var content = lines.join("\n");
    var patch = { content: content, updatedAt: new Date().toISOString() };
    // update local state first
    state.memos = state.memos.map(function (item) {
      if (item.id !== memoId) return item;
      return Object.assign({}, item, patch);
    });
    // persist to vault (fire-and-forget, don't re-render)
    updateMemoInVault(memoId, patch).catch(function (err) {
      showToast("同步 memo 失败: " + errorMessage(err));
    });
  }

  function syncSourceMemoTaskLine(memoId, lineIndex, checked) {
    var memo = findMemo(memoId);
    if (!memo) return;
    var lines = memo.content.split("\n");
    if (!lines[lineIndex]) return;
    var updatedLine = updateTaskLine(lines[lineIndex], checked);
    if (updatedLine === lines[lineIndex]) return;
    lines[lineIndex] = updatedLine;
    var content = lines.join("\n");
    var patch = { content: content, updatedAt: new Date().toISOString() };
    // update local state without full re-render
    state.memos = state.memos.map(function (item) {
      if (item.id !== memoId) return item;
      return Object.assign({}, item, patch);
    });
    // persist to vault (fire-and-forget)
    updateMemoInVault(memoId, patch).catch(function (err) {
      showToast("同步 memo 失败: " + errorMessage(err));
    });
  }

  function completeLinkedTaskFromSource(task, checked) {
    var id = task.id;
    var taskFilter = state.taskFilter;
    var request = checked
      ? completeTask(id)
      : updateTask(id, { completedAt: "", status: "open" });
    request.then(
      function (result) {
        var summary = normalizeTaskSummary(result);
        if (checked) {
          retainCompletedTaskInFilter(id, taskFilter);
        } else {
          state.retainedCompletedTaskFilters.delete(id);
        }
        state.tasks = state.tasks.map(function (item) {
          return item.id === id && summary ? summary : item;
        });
        // Find the task card in the todo list (not relative to the dialog checkbox)
        var taskCard = els.memoList.querySelector(
          '[data-task-id="' + id + '"]',
        );
        replaceTaskCard(taskCard, summary);
        showToast(checked ? "已完成任务" : "已取消完成");
      },
      function (err) {
        showToast(
          (checked ? "完成任务失败: " : "取消完成失败: ") + errorMessage(err),
        );
      },
    );
  }

  function deleteExistingTask(taskId) {
    const id = String(taskId || "").trim();
    if (!id) return;
    if (!window.confirm("删除这个代办？")) return;
    deleteTask(id).then(
      function () {
        state.tasks = state.tasks.filter((entry) => entry.id !== id);
        state.retainedCompletedTaskFilters.delete(id);
        renderAll();
        showToast("已删除代办");
      },
      function (err) {
        showToast("删除代办失败: " + errorMessage(err));
        refreshTasksFromVault();
      },
    );
  }

  function replaceTaskCard(card, task) {
    if (!card || !task) return;
    renderAll();
  }

  function addTaskNote(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    const content = window.prompt(
      "添加 task note，支持 Markdown 和 todo 行",
      "",
    );
    if (content === null) return;
    if (!content.trim()) {
      showToast("note 内容不能为空");
      return;
    }
    createTaskNote(task.id, { content, visibility: DEFAULT_VISIBILITY }).then(
      function (result) {
        const summary = normalizeTaskSummary(result.task);
        if (summary)
          state.tasks = state.tasks.map((item) =>
            item.id === task.id ? summary : item,
          );
        if (result.memo) {
          const memo = normalizeMemoPayload(result.memo);
          if (memo)
            state.memos = [memo].concat(
              state.memos.filter((item) => item.id !== memo.id),
            );
        }
        saveMemos(state.memos);
        renderAll();
        refreshTasksFromVault();
        showToast("已添加 note");
      },
      function (err) {
        showToast("添加 note 失败: " + errorMessage(err));
      },
    );
  }

  function copyTaskRef(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    copyText(`[[task:${task.id}|${task.title}]]`).then(
      () => showToast("已复制 task 引用"),
      () => showToast("复制失败"),
    );
  }

  // --- Task Edit Dialog ---

  function openTaskEditDialog(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    getTask(taskId).then(
      function (fullTask) {
        renderTaskEditDialog(fullTask);
      },
      function () {
        renderTaskEditDialog(task);
      },
    );
  }

  function renderTaskEditDialog(task) {
    closeTaskEditDialog();
    const overlay = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-task-edit-dialog": task.id,
        n: "task-edit-dialog-host",
      },
    });
    renderTimelessView(
      overlay,
      TaskEditDialogView({
        dueValue: task.dueAt ? task.dueAt.slice(0, 10) : "",
        priority: task.priority || "none",
        reminders: (task.reminders || []).map(function (reminder) {
          return {
            fired: Boolean(reminder.fired),
            label: formatReminderLabel(reminder),
          };
        }),
        title: task.title,
      }),
    );

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeTaskEditDialog();
    });

    overlay.addEventListener("click", function (event) {
      const quickBtn = closestElement(
        event.target,
        "[data-task-reminder-quick]",
      );
      if (quickBtn) {
        const minutes = parseInt(quickBtn.dataset.taskReminderQuick, 10);
        if (!isNaN(minutes))
          addTaskReminder(task.id, {
            type: "relative",
            base: "dueAt",
            offsetMinutes: minutes,
          });
        return;
      }
      const absBtn = closestElement(
        event.target,
        "[data-task-reminder-abs-confirm]",
      );
      if (absBtn) {
        const input = overlay.querySelector("[data-task-reminder-abs-input]");
        if (input && input.value) {
          addTaskReminder(task.id, {
            type: "absolute",
            at: new Date(input.value).toISOString(),
          });
        }
        return;
      }
      const delBtn = closestElement(event.target, "[data-task-reminder-del]");
      if (delBtn) {
        const idx = parseInt(delBtn.dataset.taskReminderDel, 10);
        if (!isNaN(idx)) removeTaskReminder(task.id, idx);
        return;
      }
      const saveBtn = closestElement(event.target, "[data-task-edit-save]");
      if (saveBtn) {
        saveTaskEditDialog(task.id, overlay);
        return;
      }
      const cancelBtn = closestElement(event.target, "[data-task-edit-cancel]");
      if (cancelBtn) {
        closeTaskEditDialog();
        return;
      }
    });
  }

  function addTaskReminder(taskId, reminder) {
    getTask(taskId).then(function (fullTask) {
      const reminders = (fullTask.reminders || []).concat(reminder);
      updateTask(taskId, { reminders }).then(
        function (updated) {
          const summary = normalizeTaskSummary(updated);
          if (summary)
            state.tasks = state.tasks.map((item) =>
              item.id === taskId ? summary : item,
            );
          renderAll();
          showToast("已添加提醒");
          getTask(taskId).then(function (t) {
            renderTaskEditDialog(t);
          });
        },
        function (err) {
          showToast("设置提醒失败: " + errorMessage(err));
        },
      );
    });
  }

  function removeTaskReminder(taskId, index) {
    getTask(taskId).then(function (fullTask) {
      const reminders = (fullTask.reminders || []).filter(function (_, i) {
        return i !== index;
      });
      updateTask(taskId, { reminders }).then(
        function (updated) {
          const summary = normalizeTaskSummary(updated);
          if (summary)
            state.tasks = state.tasks.map((item) =>
              item.id === taskId ? summary : item,
            );
          renderAll();
          showToast("已删除提醒");
          getTask(taskId).then(function (t) {
            renderTaskEditDialog(t);
          });
        },
        function (err) {
          showToast("删除提醒失败: " + errorMessage(err));
        },
      );
    });
  }

  function saveTaskEditDialog(taskId, overlay) {
    const titleInput = overlay.querySelector("[data-task-edit-title]");
    const dueInput = overlay.querySelector("[data-task-edit-due]");
    const prioritySelect = overlay.querySelector("[data-task-edit-priority]");
    const patch = {};
    if (titleInput) patch.title = titleInput.value.trim();
    if (dueInput) patch.dueAt = dueInput.value || "";
    if (prioritySelect) patch.priority = prioritySelect.value || "none";
    if (!patch.title) {
      showToast("标题不能为空");
      return;
    }
    updateTask(taskId, patch).then(
      function (updated) {
        const summary = normalizeTaskSummary(updated);
        if (summary)
          state.tasks = state.tasks.map((item) =>
            item.id === taskId ? summary : item,
          );
        renderAll();
        closeTaskEditDialog();
        showToast("已保存");
      },
      function (err) {
        showToast("保存失败: " + errorMessage(err));
      },
    );
  }

  function closeTaskEditDialog() {
    const existing = root.querySelector("[data-task-edit-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
  }

  function editCompletedAtInline(button, taskId) {
    var currentValue = button.dataset.completedAt || "";
    var date = taskDateValue(currentValue);
    var localValue = "";
    if (!Number.isNaN(date.getTime())) {
      var y = date.getFullYear();
      var m = String(date.getMonth() + 1).padStart(2, "0");
      var d = String(date.getDate()).padStart(2, "0");
      var h = String(date.getHours()).padStart(2, "0");
      var min = String(date.getMinutes()).padStart(2, "0");
      localValue = y + "-" + m + "-" + d + "T" + h + ":" + min;
    }

    var wrapper = renderTimelessHost({
      as: "span",
      class: "memo-task-completed-time-edit",
      attributes: { n: "task-completed-time-editor-host" },
    });
    renderTimelessView(wrapper, CompletedTimeEditorView({ value: localValue }));

    button.replaceWith(wrapper);
    var input = wrapper.querySelector(".memo-task-completed-time-input");
    input.focus();

    function save() {
      var newValue = input.value;
      if (!newValue) return;
      updateTask(taskId, {
        completedAt: new Date(newValue).toISOString(),
      }).then(
        function (updated) {
          var summary = normalizeTaskSummary(updated);
          if (summary)
            state.tasks = state.tasks.map(function (t) {
              return t.id === taskId ? summary : t;
            });
          unmountTimelessView(wrapper);
          renderAll();
          showToast("完成时间已更新");
        },
        function (err) {
          showToast("更新失败: " + errorMessage(err));
          unmountTimelessView(wrapper);
          wrapper.replaceWith(button);
        },
      );
    }

    function cancel() {
      unmountTimelessView(wrapper);
      wrapper.replaceWith(button);
    }

    wrapper
      .querySelector(".memo-task-completed-time-confirm")
      .addEventListener("click", save);
    wrapper
      .querySelector(".memo-task-completed-time-cancel")
      .addEventListener("click", cancel);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });

    input.addEventListener("blur", function () {
      setTimeout(function () {
        if (root.contains(wrapper)) cancel();
      }, 150);
    });
  }

  function formatReminderLabel(reminder) {
    if (reminder.type === "absolute" && reminder.at) {
      try {
        return formatDateTime(new Date(reminder.at));
      } catch (_) {
        return reminder.at;
      }
    }
    if (reminder.type === "relative" && reminder.offsetMinutes) {
      const m = reminder.offsetMinutes;
      if (m >= 1440 && m % 1440 === 0) return "到期前 " + m / 1440 + " 天";
      if (m >= 60 && m % 60 === 0) return "到期前 " + m / 60 + " 小时";
      return "到期前 " + m + " 分钟";
    }
    return "提醒";
  }

  // --- Inline Task Detail Dialog ---

  function openInlineTaskDetail(target) {
    const lineIndex = Number(target.dataset.taskDetail);
    const sourceType = target.dataset.taskDetailSourceType || "memo";
    const sourceMemoId = target.dataset.taskDetailMemoId || "";
    const sourceCommentId = target.dataset.taskDetailCommentId || "";

    let content = "";
    let memo = null;
    let comment = null;

    if (sourceType === "comment" && sourceCommentId) {
      comment = findComment(sourceCommentId);
      content = comment ? String(comment.content || "") : "";
      memo = comment ? findMemo(comment.memoId) : null;
    } else if (sourceMemoId) {
      memo = findMemo(sourceMemoId);
      content = memo ? String(memo.content || "") : "";
    }

    const lines = content.split("\n");
    const line = lines[lineIndex] || "";
    const task = parseTaskLine(line);
    if (!task) return;

    // Try to find linked Task entity
    // source.line is 1-based from backend; lineIndex is 0-based from rendering
    const linkedTask = findLinkedTask(
      sourceMemoId,
      sourceCommentId,
      lineIndex + 1,
    );
    if (linkedTask) {
      // Fetch full task for reminders/notes
      getTask(linkedTask.id).then(
        function (fullTask) {
          renderInlineTaskDetailDialog(buildTaskDetailInfo(fullTask, memo));
        },
        function () {
          renderInlineTaskDetailDialog(buildTaskDetailInfo(linkedTask, memo));
        },
      );
      return;
    }

    // Check if task text contains a [[task:xxx|label]] reference
    var taskRefId = extractTaskRefId(task.text);
    if (taskRefId) {
      getTask(taskRefId).then(
        function (fullTask) {
          renderInlineTaskDetailDialog(buildTaskDetailInfo(fullTask, memo));
        },
        function () {
          var parsed = parseTaskTitleAndDesc(stripTaskRefSyntax(task.text));
          renderInlineTaskDetailDialog({
            title: parsed.title,
            desc: parsed.desc,
            checked: task.checked,
            completedAt: "",
            createdAt: memo ? memo.createdAt : "",
            reminders: [],
            projectId: memo ? memo.projectId : "",
            memoId: sourceMemoId,
          });
        },
      );
      return;
    }

    var parsed = parseTaskTitleAndDesc(task.text);
    renderInlineTaskDetailDialog({
      title: parsed.title,
      desc: parsed.desc,
      checked: task.checked,
      completedAt: "",
      createdAt: memo ? memo.createdAt : "",
      reminders: [],
      projectId: memo ? memo.projectId : "",
      memoId: sourceMemoId,
    });
  }

  function findLinkedTask(memoId, commentId, lineIndex) {
    return (
      state.tasks.find(function (task) {
        if (!task || !task.source) return false;
        if (commentId) {
          return (
            task.source.commentId === commentId &&
            task.source.line === lineIndex
          );
        }
        return task.source.memoId === memoId && task.source.line === lineIndex;
      }) || null
    );
  }

  function buildTaskDetailInfo(task, memo) {
    return {
      title: task.title || "",
      desc: task.notes || "",
      checked: task.status === "completed",
      completedAt: task.completedAt || "",
      createdAt: task.createdAt || (memo ? memo.createdAt : ""),
      reminders: task.reminders || [],
      projectId: task.projectId || (memo ? memo.projectId : ""),
      memoId: task.source ? task.source.memoId : "",
    };
  }

  function renderInlineTaskDetailDialog(info) {
    closeInlineTaskDetailDialog();
    const overlay = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-inline-task-detail-dialog": "",
        n: "inline-task-detail-dialog-host",
      },
    });
    const rows = [];
    if (info.createdAt)
      rows.push({ label: "创建", value: formatInlineTaskDate(info.createdAt) });
    if (info.completedAt)
      rows.push({
        label: "完成",
        value: formatInlineTaskDate(info.completedAt),
      });
    if (info.reminders?.length) {
      rows.push({
        label: "提醒",
        value: info.reminders.map(formatInlineTaskReminder).join("、"),
      });
    }
    const project =
      info.projectName || (info.projectId ? projectLabel(info.projectId) : "");
    if (project) rows.push({ label: "项目", value: project });
    renderTimelessView(
      overlay,
      InlineTaskDetailView({
        description: info.desc || "",
        memoId: info.memoId || "",
        rows,
        statusClass: info.checked ? "is-complete" : "is-open",
        statusLabel: info.checked ? "已完成" : "未完成",
        title: info.title,
      }),
    );

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeInlineTaskDetailDialog();
    });
    overlay.addEventListener("click", function (event) {
      const closeBtn = closestElement(
        event.target,
        "[data-inline-task-detail-close]",
      );
      if (closeBtn) closeInlineTaskDetailDialog();
      const focusBtn = closestElement(
        event.target,
        "[data-inline-task-detail-focus-memo]",
      );
      if (focusBtn) {
        closeInlineTaskDetailDialog();
        focusMemo(info.memoId);
      }
    });
  }

  function closeInlineTaskDetailDialog() {
    const existing = root.querySelector("[data-inline-task-detail-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
  }

  function formatInlineTaskDate(isoString) {
    try {
      return formatDateTime(new Date(isoString));
    } catch (_) {
      return isoString;
    }
  }

  return {
    addTaskNote,
    clearRetainedCompletedTasks() {
      state.retainedCompletedTaskFilters.clear();
    },
    closeTaskEditDialog,
    closeInlineTaskDetailDialog,
    completeLinkedTaskFromSource,
    copyTaskRef,
    createTaskFromForm,
    dateKey: date_key,
    deleteExistingTask,
    editCompletedAtInline,
    findLinkedTask,
    getTaskStats(tasks) {
      const done = tasks.filter((task) => task.status === "completed").length;
      return { done, open: tasks.length - done, total: tasks.length };
    },
    isTaskOverdue: is_task_overdue,
    openInlineTaskDetail,
    openTaskEditDialog,
    renderTodos: render_todos,
    retainCompletedTaskInFilter,
    scopedTasks: scoped_tasks,
    selectTaskFilter: select_task_filter,
    syncSourceMemoTaskLine,
    taskDateValue: task_date_value,
    taskPresentation: task_presentation,
    taskTimeValue: task_time_value,
    toggleExistingTaskCompletion,
  };
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeTodoPageView(props) {
  const vm$ = HomeTodoPageModel(props);
  return View(
    {
      class: "page home-todo-page w-full h-full",
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
        meaning: "home-todo-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-todo-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-todo-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function TaskCollectionsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, For, Input, Select, View } = runtime;
  function create_form() {
    if (props.mode === "milestones") {
      return View(
        {
          class: "memo-task-create",
          attributes: {
            "data-gtd-milestone-create-form": "true",
            n: "gtd-milestone-create-form",
          },
        },
        [
          Input({
            type: "text",
            placeholder: "新增阶段目标，例如 v0.2 GTD Inbox",
            attributes: {
              autocomplete: "off",
              n: "gtd-milestone-create-title",
              name: "title",
              type: "text",
            },
          }),
          Select({
            attributes: {
              "aria-label": "状态",
              n: "gtd-milestone-create-status",
              name: "status",
            },
            options: [
              { label: "计划中", value: "planned" },
              { label: "进行中", value: "active" },
            ],
            placeholder: "状态",
            value: "planned",
          }),
          Input({
            type: "date",
            attributes: {
              "aria-label": "目标日期",
              n: "gtd-milestone-create-target",
              name: "targetAt",
              type: "date",
            },
          }),
          iconActionButton(runtime, {
            action: "createGTDMilestoneSubmit",
            class: "tn-button tn-button--primary memo-primary-button",
            icon: "plus",
            label: "添加",
            meaning: "gtd-milestone-create-submit",
            text: "添加",
          }),
        ],
      );
    }
    if (props.mode === "items") {
      return View(
        {
          class: "memo-task-create",
          attributes: {
            "data-gtd-item-create-form": "true",
            n: "gtd-item-create-form",
          },
        },
        [
          Input({
            type: "text",
            placeholder: "捕捉开放事项、bug、想法或问题",
            attributes: {
              autocomplete: "off",
              n: "gtd-item-create-title",
              name: "title",
              type: "text",
            },
          }),
          Select({
            attributes: {
              "aria-label": "事项类型",
              n: "gtd-item-create-type",
              name: "type",
            },
            options: [
              { label: "想法", value: "idea" },
              { label: "功能", value: "feature" },
              { label: "Bug", value: "bug" },
              { label: "问题", value: "question" },
              { label: "杂项", value: "chore" },
            ],
            placeholder: "事项类型",
            value: "idea",
          }),
          Select({
            attributes: {
              "aria-label": "里程碑",
              n: "gtd-item-create-milestone",
              name: "milestoneId",
            },
            options: [{ label: "无里程碑", value: "" }].concat(
              (props.milestones || []).map(function (item) {
                return { label: item.title, value: item.id };
              }),
            ),
            placeholder: "无里程碑",
            value: "",
          }),
          iconActionButton(runtime, {
            action: "createGTDItemSubmit",
            class: "tn-button tn-button--primary memo-primary-button",
            icon: "plus",
            label: "添加",
            meaning: "gtd-item-create-submit",
            text: "添加",
          }),
        ],
      );
    }
    return View(
      {
        class: "memo-task-create",
        attributes: { "data-task-create-form": "true", n: "task-create-form" },
      },
      [
        Input({
          type: "text",
          placeholder: "添加任务到 Inbox",
          attributes: {
            autocomplete: "off",
            n: "task-create-title",
            name: "title",
            type: "text",
          },
        }),
        Select({
          attributes: {
            "aria-label": "优先级",
            n: "task-create-priority",
            name: "priority",
          },
          options: [
            { label: "无优先级", value: "none" },
            { label: "低", value: "low" },
            { label: "中", value: "medium" },
            { label: "高", value: "high" },
          ],
          placeholder: "优先级",
          value: "none",
        }),
        Input({
          type: "date",
          attributes: {
            "aria-label": "截止日期",
            n: "task-create-due",
            name: "dueAt",
            type: "date",
          },
        }),
        Select({
          attributes: {
            "aria-label": "可见范围",
            n: "task-create-visibility",
            name: "visibility",
          },
          options: [
            { label: "仅自己", value: "PRIVATE" },
            { label: "私密", value: "SECRET" },
            { label: "工作区", value: "PROTECTED" },
            { label: "公开", value: "PUBLIC" },
          ],
          placeholder: "可见范围",
          value: "PRIVATE",
        }),
        iconActionButton(runtime, {
          action: "createTaskSubmit",
          class: "tn-button tn-button--primary memo-primary-button",
          icon: "plus",
          label: "添加",
          meaning: "task-create-submit",
          text: "添加",
        }),
      ],
    );
  }
  function card_view(item) {
    const is_task = props.mode === "tasks";
    const is_item = props.mode === "items";
    let id_attribute = "data-gtd-milestone-id";
    if (is_task) {
      id_attribute = "data-task-id";
    } else if (is_item) {
      id_attribute = "data-gtd-item-id";
    }
    const card_class_ = computed(
      ref({
        complete: Boolean(item.complete),
        private: Boolean(item.private),
      }),
      function (value) {
        let class_name =
          "memo-task-card is-priority-" + (item.priority || "none");
        if (value.complete) class_name += " is-complete";
        if (value.private) class_name += " is-private";
        return class_name;
      },
    );
    return View(
      {
        as: "article",
        class: card_class_,
        attributes: {
          [id_attribute]: item.id,
          n: props.mode + "-card",
        },
      },
      [
        Show({
          when: reactiveWhen(item.private),
          ok() {
            return PrivateOverlayView({
              label: "仅自己可见",
              meaning: props.mode + "-card",
              runtime,
            });
          },
        }),
        Show({
          when: reactiveWhen(props.mode === "milestones"),
          ok() {
            return View(
              {
                as: "span",
                class: "memo-task-check",
                attributes: {
                  "aria-hidden": "true",
                  n: "gtd-milestone-status-marker",
                },
              },
              [],
            );
          },
          else() {
            let completion_label = "切换事项完成状态";
            let completion_attribute = "data-gtd-item-complete";
            let completion_meaning = "gtd-item-completion-checkbox";
            if (is_task) {
              completion_label = "切换任务完成状态";
              completion_attribute = "data-task-complete";
              completion_meaning = "task-completion-checkbox";
            }
            return Checkbox({
              checked: item.complete,
              class: "memo-task-check memo-todo-checkbox",
              attributes: {
                "aria-label": completion_label,
                [completion_attribute]: "true",
                n: completion_meaning,
              },
            });
          },
        }),
        View(
          {
            class: "memo-task-body",
            attributes: { n: props.mode + "-card-body" },
          },
          [
            View(
              {
                class: "memo-task-title-row",
                attributes: { n: props.mode + "-card-title-row" },
              },
              [
                View(
                  {
                    as: "strong",
                    attributes: { n: props.mode + "-card-title" },
                  },
                  [item.title],
                ),
                Show({
                  when: reactiveWhen(item.badge),
                  ok() {
                    return View(
                      {
                        as: "span",
                        class: "memo-task-priority",
                        attributes: { n: props.mode + "-card-badge" },
                      },
                      [item.badge],
                    );
                  },
                }),
              ],
            ),
            View(
              {
                class: "memo-task-meta",
                attributes: { n: props.mode + "-card-meta" },
              },
              [
                For({
                  each: item.meta || [],
                  render(meta) {
                    if (meta.action) {
                      return Button(
                        {
                          class: meta.class,
                          attributes: {
                            "data-action": meta.action,
                            "data-comment-id": meta.commentId,
                            "data-completed-at": meta.completedAt,
                            "data-memo-id": meta.memoId,
                            "data-source-comment-id": meta.commentId,
                            "data-source-memo-id": meta.memoId,
                            n: props.mode + "-card-meta-action",
                            title: meta.title,
                            type: "button",
                          },
                        },
                        [meta.label],
                      );
                    }
                    let tag_name = "span";
                    if (meta.time) tag_name = "time";
                    return View(
                      {
                        as: tag_name,
                        attributes: {
                          datetime: meta.datetime,
                          n: props.mode + "-card-meta-item",
                        },
                      },
                      [meta.label],
                    );
                  },
                }),
              ],
            ),
            Show({
              when: reactiveWhen(item.note),
              ok() {
                return View(
                  {
                    as: "p",
                    class: "memo-task-note",
                    attributes: { n: props.mode + "-card-note" },
                  },
                  [item.note],
                );
              },
            }),
          ],
        ),
        View(
          {
            class: "memo-task-actions",
            attributes: { n: props.mode + "-card-actions" },
          },
          [
            For({
              each: item.actions || [],
              render(action) {
                return iconActionButton(runtime, {
                  action: action.action,
                  danger: action.danger,
                  icon: action.icon,
                  label: action.label,
                  meaning: props.mode + "-" + action.action,
                });
              },
            }),
          ],
        ),
      ],
    );
  }
  return runtime.Fragment({}, [
    Show({
      when: reactiveWhen(!props.hideWorkspace),
      ok() {
        return View(
          {
            as: "section",
            class: "memo-task-workspace",
            attributes: { n: props.mode + "-workspace" },
          },
          [
            create_form(),
            Show({
              when: reactiveWhen(props.filters?.length),
              ok() {
                return View(
                  {
                    class: "memo-task-tabs",
                    attributes: {
                      "aria-label": "Task filters",
                      n: "task-filter-tabs",
                      role: "tablist",
                    },
                  },
                  [
                    For({
                      each: props.filters,
                      render(filter) {
                        const class_name_ = computed(
                          reactiveWhen(filter.active),
                          function (active) {
                            if (active) return "memo-task-tab is-active";
                            return "memo-task-tab";
                          },
                        );
                        return Button(
                          {
                            class: class_name_,
                            attributes: {
                              "data-task-filter": filter.value,
                              n: "task-filter-tab",
                              type: "button",
                            },
                          },
                          [
                            View(
                              {
                                as: "span",
                                attributes: { n: "task-filter-label" },
                              },
                              [filter.label],
                            ),
                            View(
                              {
                                as: "strong",
                                attributes: { n: "task-filter-count" },
                              },
                              [filter.count || ""],
                            ),
                          ],
                        );
                      },
                    }),
                  ],
                );
              },
            }),
          ],
        );
      },
    }),
    Show({
      when: reactiveWhen(props.groups?.length),
      ok() {
        return For({
          each: props.groups,
          render(group) {
            return View(
              {
                as: "section",
                class: "memo-todo-group memo-task-group",
                attributes: {
                  "aria-label": group.label,
                  n: props.mode + "-group",
                },
              },
              [
                View(
                  {
                    class: "memo-todo-group-head",
                    attributes: { n: props.mode + "-group-header" },
                  },
                  [
                    View(
                      {
                        as: "span",
                        attributes: { n: props.mode + "-group-title" },
                      },
                      [group.label],
                    ),
                    View(
                      {
                        as: "strong",
                        attributes: { n: props.mode + "-group-count" },
                      },
                      [group.items.length],
                    ),
                  ],
                ),
                For({ each: group.items, render: card_view }),
              ],
            );
          },
        });
      },
      else() {
        return EmptyStateView({
          message: "没有匹配的任务",
          meaning: props.mode + "-empty",
          runtime,
        });
      },
    }),
  ]);
}


export function normalizeTaskFilter(value) {
  const filter = String(value || "")
    .trim()
    .toLowerCase();
  if (TASK_FILTERS.has(filter)) return filter;
  return "today";
}

export function extractTaskRefId(text) {
  var match = String(text || "").match(/\[\[task:([^\]|]+)/);
  if (match) return match[1].trim();
  return "";
}

export function stripTaskRefSyntax(text) {
  return String(text || "")
    .replace(/\[\[task:[^\]|]+\|?([^\]]*)\]\]/g, function (_m, label) {
      return label.trim() || "";
    })
    .trim();
}


export function formatInlineTaskReminder(reminder) {
  if (reminder.type === "absolute" && reminder.at) {
    try {
      return formatDateTime(new Date(reminder.at));
    } catch (_) {
      return reminder.at;
    }
  }
  if (reminder.type === "relative" && reminder.offsetMinutes) {
    const m = reminder.offsetMinutes;
    if (m >= 1440 && m % 1440 === 0) return "到期前 " + m / 1440 + " 天";
    if (m >= 60 && m % 60 === 0) return "到期前 " + m / 60 + " 小时";
    return "到期前 " + m + " 分钟";
  }
  return "提醒";
}


export function loadTaskFilter() {
  return normalizeTaskFilter(localStorage.getItem(TASK_FILTER_STORAGE_KEY));
}

export function rememberTaskFilter(filter) {
  localStorage.setItem(TASK_FILTER_STORAGE_KEY, normalizeTaskFilter(filter));
}


export function InlineTaskDetailView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    {
      class: "inline-task-detail-dialog",
      attributes: { n: "inline-task-detail-dialog" },
    },
    [
      View(
        {
          class: "inline-task-detail-header",
          attributes: { n: "inline-task-detail-header" },
        },
        [
          View(
            {
              as: "span",
              class: "inline-task-detail-status " + props.statusClass,
              attributes: { n: "inline-task-detail-status" },
            },
            [props.statusLabel],
          ),
          Button(
            {
              class:
                "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: {
                "data-inline-task-detail-close": "true",
                n: "inline-task-detail-close-button",
                title: "关闭",
                type: "button",
              },
            },
            [memoIcon("x", "inline-task-detail-close-icon")],
          ),
        ],
      ),
      View(
        {
          class: "inline-task-detail-body",
          attributes: { n: "inline-task-detail-body" },
        },
        [
          View(
            {
              class: "inline-task-detail-title",
              attributes: { n: "inline-task-detail-title" },
            },
            [props.title],
          ),
          Show({
            when: reactiveWhen(props.description),
            ok() {
              return View(
                {
                  class: "inline-task-detail-desc",
                  attributes: { n: "inline-task-detail-description" },
                },
                [props.description],
              );
            },
          }),
          View(
            {
              class: "inline-task-detail-meta",
              attributes: { n: "inline-task-detail-meta" },
            },
            [
              For({
                each: props.rows || [],
                render(row) {
                  return View(
                    {
                      class: "inline-task-detail-row",
                      attributes: { n: "inline-task-detail-meta-row" },
                    },
                    [
                      View(
                        {
                          as: "span",
                          class: "inline-task-detail-label",
                          attributes: { n: "inline-task-detail-meta-label" },
                        },
                        [row.label],
                      ),
                      View(
                        {
                          as: "span",
                          attributes: { n: "inline-task-detail-meta-value" },
                        },
                        [row.value],
                      ),
                    ],
                  );
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "inline-task-detail-footer",
          attributes: { n: "inline-task-detail-footer" },
        },
        [
          Show({
            when: reactiveWhen(props.memoId),
            ok() {
              return Button(
                {
                  class: "tn-button tn-button--secondary memo-secondary-button",
                  attributes: {
                    "data-inline-task-detail-focus-memo": "true",
                    n: "inline-task-detail-focus-memo",
                    type: "button",
                  },
                },
                ["定位 Memo"],
              );
            },
          }),
          Button(
            {
              class: "tn-button tn-button--primary memo-primary-button",
              attributes: {
                "data-inline-task-detail-close": "true",
                n: "inline-task-detail-confirm-close",
                type: "button",
              },
            },
            ["关闭"],
          ),
        ],
      ),
    ],
  );
}

export function CompletedTimeEditorView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input } = runtime;
  return runtime.Fragment({}, [
    Input({
      class: "memo-task-completed-time-input",
      type: "datetime-local",
      value: props.value,
      attributes: {
        n: "memo-task-completed-time-input",
        type: "datetime-local",
      },
    }),
    Button(
      {
        class: "memo-task-completed-time-confirm",
        attributes: {
          n: "memo-task-completed-time-confirm",
          title: "确认",
          type: "button",
        },
      },
      [memoIcon("check", "memo-task-completed-time-confirm-icon")],
    ),
    Button(
      {
        class: "memo-task-completed-time-cancel",
        attributes: {
          n: "memo-task-completed-time-cancel",
          title: "取消",
          type: "button",
        },
      },
      [memoIcon("x", "memo-task-completed-time-cancel-icon")],
    ),
  ]);
}

export function TaskEditDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, Select, View } = runtime;
  const priorities = [
    { label: "无", value: "none" },
    { label: "低", value: "low" },
    { label: "中", value: "medium" },
    { label: "高", value: "high" },
  ];
  const quick = [
    { label: "10 分钟前", value: 10 },
    { label: "30 分钟前", value: 30 },
    { label: "1 小时前", value: 60 },
    { label: "1 天前", value: 1440 },
  ];
  function close_button(label, primary) {
    let class_name =
      "tn-button tn-button--secondary memo-secondary-button";
    let action_attribute = "data-task-edit-cancel";
    let meaning = "task-edit-cancel-button";
    if (primary) {
      class_name = "tn-button tn-button--primary memo-primary-button";
      action_attribute = "data-task-edit-save";
      meaning = "task-edit-save-button";
    }
    return Button(
      {
        class: class_name,
        attributes: {
          [action_attribute]: "true",
          n: meaning,
          type: "button",
        },
      },
      [label],
    );
  }
  return View(
    {
      class: "memo-dialog task-edit-dialog",
      attributes: { n: "task-edit-dialog-panel" },
    },
    [
      View(
        {
          class: "task-edit-dialog-header",
          attributes: { n: "task-edit-dialog-header" },
        },
        [
          View({ as: "h3", attributes: { n: "task-edit-dialog-title" } }, [
            "编辑任务",
          ]),
          Button(
            {
              class:
                "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: {
                "data-task-edit-cancel": "true",
                n: "task-edit-dialog-close",
                title: "关闭",
                type: "button",
              },
            },
            [memoIcon("x", "task-edit-dialog-close-icon")],
          ),
        ],
      ),
      View(
        {
          class: "task-edit-dialog-body",
          attributes: { n: "task-edit-dialog-body" },
        },
        [
          View(
            {
              class: "task-edit-field",
              attributes: { n: "task-edit-title-field" },
            },
            [
              View(
                { as: "label", attributes: { n: "task-edit-title-label" } },
                ["标题"],
              ),
              Input({
                type: "text",
                value: props.title,
                attributes: {
                  "data-task-edit-title": "true",
                  n: "task-edit-title-input",
                  type: "text",
                },
              }),
            ],
          ),
          View(
            {
              class: "task-edit-field-row",
              attributes: { n: "task-edit-field-row" },
            },
            [
              View(
                {
                  class: "task-edit-field",
                  attributes: { n: "task-edit-due-field" },
                },
                [
                  View(
                    { as: "label", attributes: { n: "task-edit-due-label" } },
                    ["截止日期"],
                  ),
                  Input({
                    type: "date",
                    value: props.dueValue,
                    attributes: {
                      "data-task-edit-due": "true",
                      n: "task-edit-due-input",
                      type: "date",
                    },
                  }),
                ],
              ),
              View(
                {
                  class: "task-edit-field",
                  attributes: { n: "task-edit-priority-field" },
                },
                [
                  View(
                    {
                      as: "label",
                      attributes: { n: "task-edit-priority-label" },
                    },
                    ["优先级"],
                  ),
                  Select({
                    attributes: {
                      "data-task-edit-priority": "true",
                      n: "task-edit-priority-select",
                    },
                    options: priorities,
                    placeholder: "优先级",
                    value: props.priority,
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "task-edit-reminders",
              attributes: { n: "task-edit-reminders" },
            },
            [
              View(
                { as: "label", attributes: { n: "task-edit-reminders-label" } },
                ["提醒"],
              ),
              View(
                {
                  class: "task-edit-reminder-quick",
                  attributes: { n: "task-edit-reminder-quick-list" },
                },
                [
                  For({
                    each: quick,
                    render(option) {
                      return Button(
                        {
                          class: "task-edit-reminder-chip",
                          attributes: {
                            "data-task-reminder-quick": option.value,
                            n: "task-edit-reminder-quick-button",
                            type: "button",
                          },
                        },
                        [option.label],
                      );
                    },
                  }),
                ],
              ),
              View(
                {
                  class: "task-edit-reminder-custom",
                  attributes: { n: "task-edit-reminder-custom" },
                },
                [
                  Input({
                    type: "datetime-local",
                    attributes: {
                      "data-task-reminder-abs-input": "true",
                      n: "task-edit-reminder-absolute-input",
                      type: "datetime-local",
                    },
                  }),
                  Button(
                    {
                      class: "tn-button tn-button--primary memo-primary-button",
                      attributes: {
                        "data-task-reminder-abs-confirm": "true",
                        n: "task-edit-reminder-absolute-add",
                        type: "button",
                      },
                    },
                    ["添加"],
                  ),
                ],
              ),
              Show({
                when: reactiveWhen(props.reminders?.length),
                ok() {
                  return View(
                    {
                      class: "task-edit-reminder-list",
                      attributes: { n: "task-edit-reminder-list" },
                    },
                    [
                      For({
                        each: props.reminders,
                        render(reminder, index$) {
                          const index = index$?.value ?? 0;
                          return View(
                            {
                              class: "task-edit-reminder-item",
                              attributes: { n: "task-edit-reminder-item" },
                            },
                            [
                              View(
                                {
                                  as: "span",
                                  attributes: {
                                    n: "task-edit-reminder-item-label",
                                  },
                                },
                                [reminder.label],
                              ),
                              Show({
                                when: reactiveWhen(reminder.fired),
                                ok() {
                                  return View(
                                    {
                                      as: "span",
                                      class: "task-edit-reminder-fired",
                                      attributes: {
                                        n: "task-edit-reminder-fired",
                                      },
                                    },
                                    ["已触发"],
                                  );
                                },
                              }),
                              Button(
                                {
                                  class: "task-edit-reminder-delete",
                                  attributes: {
                                    "data-task-reminder-del": index,
                                    n: "task-edit-reminder-delete",
                                    title: "删除",
                                    type: "button",
                                  },
                                },
                                [
                                  memoIcon(
                                    "x",
                                    "task-edit-reminder-delete-icon",
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
                      as: "p",
                      class: "task-edit-reminder-empty",
                      attributes: { n: "task-edit-reminder-empty" },
                    },
                    ["暂无提醒"],
                  );
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "task-edit-dialog-footer",
          attributes: { n: "task-edit-dialog-footer" },
        },
        [close_button("取消", false), close_button("保存", true)],
      ),
    ],
  );
}
