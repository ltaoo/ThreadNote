import {
  completeTask,
  createTask,
  loadTasks,
  normalizeTaskSummary,
  updateTask,
} from "./domain/tasks.js";
import { errorMessage } from "./domain/memo-repository.js";
import { TimelessPrimitive } from "./timeless-icons.js";
import {
  registerWindowSession,
  setPersistedWindowFixed,
} from "./window-state.js";

export const GTD_FILTER_STORAGE_KEY = "demo-desktop:gtd:task-filter:v1";
export const GTD_FILTERS = Object.freeze([
  ["today", "今天"],
  ["overdue", "过期"],
  ["inbox", "Inbox"],
  ["next", "下一步"],
  ["scheduled", "计划"],
  ["all", "全部"],
  ["completed", "已完成"],
]);
const KNOWN_FILTERS = new Set(GTD_FILTERS.map(function (item) { return item[0]; }));

function normalize_filter(value) {
  const filter = String(value || "").trim().toLowerCase();
  return KNOWN_FILTERS.has(filter) ? filter : "today";
}

function normalize_priority(value) {
  const priority = String(value || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(priority) ? priority : "none";
}

function priority_label(priority) {
  return { high: "高", low: "低", medium: "中", none: "无" }[
    normalize_priority(priority)
  ];
}

function date_key(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function task_date_value(value) {
  const raw = String(value || "").trim();
  const date_only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return date_only
    ? new Date(
        Number(date_only[1]),
        Number(date_only[2]) - 1,
        Number(date_only[3]),
      )
    : new Date(raw);
}

function task_time_value(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = task_date_value(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function is_task_today(task) {
  const today = date_key(new Date());
  return [task.startAt, task.dueAt].some(function (value) {
    return value && date_key(task_date_value(value)) === today;
  });
}

function is_task_overdue(task) {
  if (!task || !task.dueAt || task.status === "completed") return false;
  const due = task_date_value(task.dueAt);
  return !Number.isNaN(due.getTime()) && date_key(due) < date_key(new Date());
}

function task_matches_filter(task, filter) {
  switch (normalize_filter(filter)) {
    case "all":
      return true;
    case "completed":
      return task.status === "completed";
    case "inbox":
      return task.status !== "completed" && (task.listId === "inbox" || !task.listId);
    case "next":
      return task.status !== "completed" && !task.parentId;
    case "overdue":
      return is_task_overdue(task);
    case "scheduled":
      return task.status !== "completed" && Boolean(task.startAt || task.dueAt);
    case "today":
    default:
      return task.status !== "completed" && (is_task_today(task) || is_task_overdue(task));
  }
}

function task_priority_weight(priority) {
  return { high: 3, low: 1, medium: 2, none: 0 }[normalize_priority(priority)];
}

function sort_tasks(left, right, filter) {
  if (normalize_filter(filter) === "completed") {
    return (
      task_time_value(right.completedAt || right.updatedAt || right.createdAt) -
      task_time_value(left.completedAt || left.updatedAt || left.createdAt)
    );
  }
  if (left.status !== right.status) {
    if (left.status === "completed") return 1;
    if (right.status === "completed") return -1;
  }
  const created = task_time_value(right.createdAt) - task_time_value(left.createdAt);
  if (created !== 0) return created;
  const priority =
    task_priority_weight(right.priority) - task_priority_weight(left.priority);
  return priority || task_time_value(right.updatedAt) - task_time_value(left.updatedAt);
}

function visible_tasks(tasks, filter) {
  return tasks
    .filter(function (task) {
      return task && task.status !== "archived" && task.status !== "cancelled";
    })
    .filter(function (task) {
      return task_matches_filter(task, filter);
    })
    .sort(function (left, right) {
      return sort_tasks(left, right, filter);
    });
}

function filter_label(filter) {
  const match = GTD_FILTERS.find(function (item) {
    return item[0] === normalize_filter(filter);
  });
  return match ? match[1] : "今天";
}

function empty_label(filter) {
  return {
    all: "还没有代办",
    completed: "还没有已完成代办",
    inbox: "Inbox 为空",
    next: "没有下一步代办",
    overdue: "没有过期代办",
    scheduled: "没有计划代办",
    today: "今天没有代办",
  }[normalize_filter(filter)];
}

function grouped_tasks(tasks, filter) {
  const normalized = normalize_filter(filter);
  if (normalized === "completed") return [{ label: "已完成", tasks }];
  if (normalized === "today") {
    return [
      { label: "已过期", tasks: tasks.filter(is_task_overdue) },
      { label: "今天", tasks: tasks.filter(function (task) { return !is_task_overdue(task); }) },
    ].filter(function (group) { return group.tasks.length; });
  }
  if (normalized === "overdue") return [{ label: "已过期", tasks }];
  if (normalized === "scheduled") {
    return [
      { label: "已过期", tasks: tasks.filter(is_task_overdue) },
      {
        label: "今天",
        tasks: tasks.filter(function (task) {
          return !is_task_overdue(task) && is_task_today(task);
        }),
      },
      {
        label: "未来",
        tasks: tasks.filter(function (task) {
          return !is_task_overdue(task) && !is_task_today(task);
        }),
      },
    ].filter(function (group) { return group.tasks.length; });
  }
  if (normalized === "all") {
    return [
      {
        label: "未完成",
        tasks: tasks.filter(function (task) { return task.status !== "completed"; }),
      },
      {
        label: "已完成",
        tasks: tasks.filter(function (task) { return task.status === "completed"; }),
      },
    ].filter(function (group) { return group.tasks.length; });
  }
  return [{ label: filter_label(filter), tasks }];
}

function filter_counts(tasks) {
  const active = tasks.filter(function (task) {
    return task && task.status !== "archived" && task.status !== "cancelled";
  });
  return Object.fromEntries(
    GTD_FILTERS.map(function (item) {
      return [
        item[0],
        active.filter(function (task) {
          return task_matches_filter(task, item[0]);
        }).length,
      ];
    }),
  );
}

function task_date_label(value) {
  const date = task_date_value(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  if (date_key(date) === date_key(new Date())) return "今天";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date_key(date) === date_key(tomorrow)) return "明天";
  return date.toLocaleDateString([], { day: "numeric", month: "numeric" });
}

function task_date_time_label(value) {
  const date = task_date_value(value);
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : date.toLocaleString([], {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "numeric",
      });
}

function task_date_time_local_value(value) {
  const date = task_date_value(value);
  if (Number.isNaN(date.getTime())) return "";
  return (
    date_key(date) +
    "T" +
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

export function reminderLabel(reminder) {
  if (reminder.type === "absolute" && reminder.at) {
    const date = new Date(reminder.at);
    return Number.isNaN(date.getTime())
      ? reminder.at
      : date.toLocaleString([], {
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          month: "numeric",
        });
  }
  if (reminder.type === "relative" && reminder.offsetMinutes) {
    const minutes = reminder.offsetMinutes;
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return "到期前 " + minutes / 1440 + " 天";
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      return "到期前 " + minutes / 60 + " 小时";
    }
    return "到期前 " + minutes + " 分钟";
  }
  return "提醒";
}

function task_presentation(task) {
  const complete = task.status === "completed";
  return {
    ...task,
    complete,
    completedLabel:
      complete && task.completedAt ? task_date_time_label(task.completedAt) : "",
    completedLocalValue: task_date_time_local_value(task.completedAt),
    dueLabel: task.dueAt ? task_date_label(task.dueAt) : "",
    dueState:
      complete ? "" : is_task_overdue(task) ? "is-overdue" : is_task_today(task) ? "is-today" : "",
    hasReminders: Boolean(task.reminders && task.reminders.length),
    priorityLabel: priority_label(task.priority),
    priorityValue: normalize_priority(task.priority),
    startLabel: task.startAt ? task_date_label(task.startAt) : "",
    tags: (task.tags || []).slice(0, 2),
  };
}

export function GTDSlimModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref || !runtime?.refarr) {
    throw new Error("GTDSlimModel requires the Timeless runtime");
  }
  const storage = props.storage || globalThis.localStorage;
  const services = {
    completeTask,
    createTask,
    invoke: typeof globalThis.invoke === "function" ? globalThis.invoke : null,
    loadTasks,
    normalizeTaskSummary,
    registerWindowSession,
    setPersistedWindowFixed,
    updateTask,
    ...(props.services || {}),
  };
  const params = props.params || new URLSearchParams(globalThis.location?.search || "");
  const absolute_reminder_ = runtime.ref("");
  const completed_draft_ = runtime.ref("");
  const count_ = runtime.ref("0");
  const due_at_ = runtime.ref("");
  const editing_completed_id_ = runtime.ref("");
  const error_ = runtime.ref("");
  const filter_ = runtime.ref(normalize_filter(storage?.getItem(GTD_FILTER_STORAGE_KEY)));
  const fixed_ = runtime.ref(params.get("fixed") === "1");
  const groups_ = runtime.refarr([]);
  const list_status_ = runtime.ref("loading");
  const loading_ = runtime.ref(false);
  const priority_ = runtime.ref("none");
  const reminder_task_id_ = runtime.ref("");
  const saving_ = runtime.ref(false);
  const tabs_ = runtime.refarr([]);
  const tasks_ = runtime.refarr([]);
  const title_ = runtime.ref("");
  const toast_ = runtime.ref("");
  let destroyed_ = false;
  let focus_listener_ = null;
  let toast_timer_ = 0;

  function rebuild() {
    if (destroyed_) return;
    const tasks = tasks_.value;
    const filter = filter_.value;
    const visible = visible_tasks(tasks, filter);
    const counts = filter_counts(tasks);
    tabs_.as(
      GTD_FILTERS.map(function ([value, label]) {
        return {
          active: value === filter,
          count: counts[value] || 0,
          label,
          value,
        };
      }),
    );
    const open = visible.filter(function (task) { return task.status !== "completed"; }).length;
    count_.as(loading_.value ? "读取中" : visible.length ? open + " / " + visible.length : "0");
    if (error_.value) {
      list_status_.as("error");
      groups_.as([]);
      return;
    }
    if (loading_.value && tasks.length === 0) {
      list_status_.as("loading");
      groups_.as([]);
      return;
    }
    if (!visible.length) {
      list_status_.as("empty");
      groups_.as([]);
      return;
    }
    list_status_.as("ready");
    groups_.as(
      grouped_tasks(visible, filter).map(function (group) {
        return {
          label: group.label,
          tasks: group.tasks.map(task_presentation),
        };
      }),
    );
  }

  function replace_task(task_id, value) {
    const summary = services.normalizeTaskSummary(value);
    if (!summary) return;
    tasks_.as(
      tasks_.value.map(function (task) {
        return task.id === task_id ? summary : task;
      }),
    );
    rebuild();
  }

  function show_toast(message) {
    if (destroyed_) return;
    toast_.as(String(message || ""));
    if (toast_timer_) globalThis.clearTimeout(toast_timer_);
    toast_timer_ = globalThis.setTimeout(function () {
      toast_timer_ = 0;
      if (!destroyed_) toast_.as("");
    }, 1800);
  }

  async function update_reminders(task_id, reminders, success_message) {
    try {
      const updated = await services.updateTask(task_id, { reminders });
      if (destroyed_) return false;
      replace_task(task_id, updated);
      reminder_task_id_.as("");
      absolute_reminder_.as("");
      show_toast(success_message);
      return true;
    } catch (err) {
      show_toast("设置提醒失败: " + errorMessage(err));
      return false;
    }
  }

  async function apply_fixed_state() {
    if (!services.invoke) return false;
    try {
      await services.invoke("__velo/window/set_always_on_top", {
        args: { onTop: fixed_.value },
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  const methods = {
    addAbsoluteReminder(task_id) {
      const task = tasks_.value.find(function (item) { return item.id === task_id; });
      const value = String(absolute_reminder_.value || "");
      if (!task || !value) return Promise.resolve(false);
      return update_reminders(
        task_id,
        (task.reminders || []).concat({ at: new Date(value).toISOString(), type: "absolute" }),
        "已添加提醒",
      );
    },

    addRelativeReminder(task_id, minutes) {
      const task = tasks_.value.find(function (item) { return item.id === task_id; });
      if (!task) return Promise.resolve(false);
      return update_reminders(
        task_id,
        (task.reminders || []).concat({
          base: "dueAt",
          offsetMinutes: minutes,
          type: "relative",
        }),
        "已添加提醒",
      );
    },

    cancelCompletedEdit() {
      editing_completed_id_.as("");
      completed_draft_.as("");
    },

    async createTodo() {
      if (destroyed_ || saving_.value) return false;
      const title = String(title_.value || "").trim();
      if (!title) return false;
      saving_.as(true);
      try {
        const task = await services.createTask({
          dueAt: String(due_at_.value || "").trim() ||
            (filter_.value === "today" ? date_key(new Date()) : ""),
          listId: filter_.value === "inbox" ? "inbox" : "",
          priority: priority_.value,
          title,
        });
        if (destroyed_) return false;
        const summary = services.normalizeTaskSummary(task);
        if (summary) {
          tasks_.as(
            [summary].concat(
              tasks_.value.filter(function (item) { return item.id !== summary.id; }),
            ),
          );
        }
        error_.as("");
        title_.as("");
        due_at_.as("");
        priority_.as("none");
        rebuild();
        return true;
      } catch (err) {
        error_.as("添加代办失败: " + errorMessage(err));
        rebuild();
        return false;
      } finally {
        if (!destroyed_) saving_.as(false);
      }
    },

    async deleteReminder(task_id, index) {
      const task = tasks_.value.find(function (item) { return item.id === task_id; });
      if (!task) return false;
      return update_reminders(
        task_id,
        (task.reminders || []).filter(function (_reminder, reminder_index) {
          return reminder_index !== index;
        }),
        "已删除提醒",
      );
    },

    init() {
      services.registerWindowSession({
        entryPage: "gtd-slim.html",
        fixed: fixed_.value,
        title: "Todos",
      });
      focus_listener_ = function () {
        methods.refresh({ silent: true });
      };
      globalThis.addEventListener?.("focus", focus_listener_);
      apply_fixed_state();
      rebuild();
      methods.refresh();
    },

    async openFull() {
      if (!services.invoke) {
        globalThis.open?.("/desktop", "_blank", "noopener");
        return true;
      }
      try {
        const response = await services.invoke(
          "/api/open_window?pathname=%2Fdesktop",
          { method: "GET" },
        );
        if (!response || response.code !== 0) {
          show_toast((response && response.msg) || "打开完整版失败");
          return false;
        }
        show_toast("已打开完整版");
        return true;
      } catch (err) {
        show_toast("打开完整版失败: " + errorMessage(err));
        return false;
      }
    },

    async refresh(options = {}) {
      if (destroyed_ || loading_.value) return false;
      loading_.as(true);
      if (!options.silent) rebuild();
      try {
        const payload = await services.loadTasks();
        if (destroyed_) return false;
        error_.as("");
        tasks_.as(
          ((payload && payload.tasks) || [])
            .map(services.normalizeTaskSummary)
            .filter(Boolean),
        );
        return true;
      } catch (err) {
        if (!destroyed_) error_.as("读取代办失败: " + errorMessage(err));
        return false;
      } finally {
        if (!destroyed_) {
          loading_.as(false);
          rebuild();
        }
      }
    },

    async saveCompletedEdit(task_id) {
      const value = String(completed_draft_.value || "");
      if (!value) return false;
      try {
        const updated = await services.updateTask(task_id, {
          completedAt: new Date(value).toISOString(),
        });
        if (destroyed_) return false;
        replace_task(task_id, updated);
        methods.cancelCompletedEdit();
        show_toast("完成时间已更新");
        return true;
      } catch (err) {
        show_toast("更新失败: " + errorMessage(err));
        return false;
      }
    },

    setAbsoluteReminder(value) {
      absolute_reminder_.as(String(value || ""));
    },

    setCompletedDraft(value) {
      completed_draft_.as(String(value || ""));
    },

    setDueAt(value) {
      due_at_.as(String(value || ""));
    },

    setFilter(value) {
      const filter = normalize_filter(value);
      if (filter === filter_.value) return;
      filter_.as(filter);
      storage?.setItem(GTD_FILTER_STORAGE_KEY, filter);
      rebuild();
    },

    setPriority(value) {
      priority_.as(normalize_priority(value));
    },

    setTitle(value) {
      title_.as(String(value || ""));
    },

    startCompletedEdit(task_id, value) {
      editing_completed_id_.as(task_id);
      completed_draft_.as(task_date_time_local_value(value));
    },

    async toggleCompletion(task_id, checked) {
      try {
        const task = checked
          ? await services.completeTask(task_id)
          : await services.updateTask(task_id, { completedAt: "", status: "open" });
        if (destroyed_) return false;
        replace_task(task_id, task);
        return true;
      } catch (err) {
        show_toast((checked ? "完成失败: " : "恢复失败: ") + errorMessage(err));
        rebuild();
        return false;
      }
    },

    toggleFixed() {
      fixed_.as(!fixed_.value);
      apply_fixed_state();
      services.setPersistedWindowFixed(fixed_.value).catch(function () {});
    },

    toggleReminder(task_id) {
      reminder_task_id_.as(
        reminder_task_id_.value === task_id ? "" : task_id,
      );
      absolute_reminder_.as("");
    },
  };

  const model = runtime.defineModel({
    state: {
      absoluteReminder: absolute_reminder_,
      completedDraft: completed_draft_,
      count: count_,
      dueAt: due_at_,
      editingCompletedId: editing_completed_id_,
      error: error_,
      filter: filter_,
      fixed: fixed_,
      groups: groups_,
      listStatus: list_status_,
      loading: loading_,
      priority: priority_,
      reminderTaskId: reminder_task_id_,
      saving: saving_,
      tabs: tabs_,
      title: title_,
      toast: toast_,
    },
    methods,
  });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    if (toast_timer_) globalThis.clearTimeout(toast_timer_);
    if (focus_listener_) globalThis.removeEventListener?.("focus", focus_listener_);
    destroy_model();
  };
  return model;
}
