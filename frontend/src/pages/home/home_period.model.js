import { memoTitle } from "@/domain/memos.js";
import {
  loadAllMemosFromVault,
  loadProjectsFromVault,
} from "@/domain/memo-repository.js";
import {
  normalizeProjectPayload,
  projectThemeColor,
} from "@/domain/projects.js";
import { loadTasks } from "@/domain/tasks.js";

import { HomeWorkspaceModel } from "./home_workspace.model.js";

const PERIODS = new Set(["week", "month"]);
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function start_of_day(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function add_days(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function start_of_week(value) {
  const date = start_of_day(value);
  const monday_offset = (date.getDay() + 6) % 7;
  return add_days(date, -monday_offset);
}

function start_of_month(value) {
  const date = start_of_day(value);
  date.setDate(1);
  return date;
}

function parse_date(value) {
  const text = String(value || "").trim();
  const date_only = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (date_only) {
    const date = new Date(
      Number(date_only[1]),
      Number(date_only[2]) - 1,
      Number(date_only[3]),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function date_key(value) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function format_month_day(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function format_time(value) {
  const date = new Date(value);
  if (!date.getHours() && !date.getMinutes()) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function task_status_label(status) {
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "待处理";
}

function period_from_route(route_view) {
  const route_key = String(route_view?.name || "").split(".").pop();
  return PERIODS.has(route_key) ? route_key : "week";
}

function item_sort(left, right) {
  const date_order = left.date.getTime() - right.date.getTime();
  if (date_order) return date_order;
  if (left.kind !== right.kind) return left.kind === "task" ? -1 : 1;
  return left.title.localeCompare(right.title, "zh-CN");
}

function memo_item(memo) {
  const date = parse_date(memo?.createdAt);
  if (!date || memo?.archived) return null;
  return {
    date,
    dateKey: date_key(date),
    id: String(memo.id || ""),
    kind: "memo",
    kindLabel: "Memo",
    projectId: String(memo.projectId || ""),
    status: "",
    statusLabel: "",
    timeLabel: format_time(date),
    title: memoTitle(memo),
  };
}

function task_item(task) {
  if (!task || task.status === "archived") return null;
  const date = parse_date(task.startAt || task.dueAt || task.createdAt);
  if (!date) return null;
  const status = String(task.status || "open");
  return {
    date,
    dateKey: date_key(date),
    id: String(task.id || ""),
    kind: "task",
    kindLabel: "待办",
    projectId: String(task.projectId || ""),
    status,
    statusLabel: task_status_label(status),
    timeLabel: format_time(date),
    title: String(task.title || "未命名任务"),
  };
}

function collect_period_items(memos, tasks, range) {
  const start_time = range.start.getTime();
  const end_time = range.end.getTime();
  return (Array.isArray(memos) ? memos : [])
    .map(memo_item)
    .concat((Array.isArray(tasks) ? tasks : []).map(task_item))
    .filter(function (item) {
      if (!item) return false;
      const item_time = item.date.getTime();
      return item_time >= start_time && item_time < end_time;
    })
    .sort(item_sort);
}

/**
 * Returns an inclusive start and exclusive end for a local calendar period.
 *
 * @param {"week" | "month"} period
 * @param {Date | string | number} anchor
 */
export function periodRange(period, anchor) {
  const normalized_period = PERIODS.has(period) ? period : "week";
  if (normalized_period === "month") {
    const start = start_of_month(anchor);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { end, start };
  }
  const start = start_of_week(anchor);
  return { end: add_days(start, 7), start };
}

/** @param {"week" | "month"} period @param {Date} anchor @param {number} direction */
export function shiftPeriod(period, anchor, direction) {
  const date = new Date(anchor);
  if (period === "month") date.setMonth(date.getMonth() + direction, 1);
  else date.setDate(date.getDate() + direction * 7);
  return date;
}

/** @param {"week" | "month"} period @param {Date} anchor */
export function periodTitle(period, anchor) {
  const range = periodRange(period, anchor);
  if (period === "month") {
    return `${range.start.getFullYear()}年${range.start.getMonth() + 1}月`;
  }
  const end = add_days(range.end, -1);
  const start_label = `${range.start.getFullYear()}年${format_month_day(range.start)}`;
  const end_label = range.start.getFullYear() === end.getFullYear()
    ? format_month_day(end)
    : `${end.getFullYear()}年${format_month_day(end)}`;
  return `${start_label} – ${end_label}`;
}

/**
 * Builds the chronological day list and its per-day Project groups.
 *
 * @param {object} input
 */
export function buildPeriodView(input = {}) {
  const period = PERIODS.has(input.period) ? input.period : "week";
  const anchor = input.anchor instanceof Date ? input.anchor : new Date(input.anchor || Date.now());
  const range = periodRange(period, anchor);
  const items = collect_period_items(input.memos, input.tasks, range);
  const projects = (Array.isArray(input.projects) ? input.projects : [])
    .map(normalizeProjectPayload)
    .filter(Boolean);
  const project_by_id = new Map(projects.map(function (project) {
    return [project.id, project];
  }));
  function group_by_project(day_items) {
    const items_by_project = new Map();
    day_items.forEach(function (item) {
      const project_id = item.projectId || "unassigned";
      if (!items_by_project.has(project_id)) items_by_project.set(project_id, []);
      items_by_project.get(project_id).push(item);
    });
    return Array.from(items_by_project, function ([project_id, project_items]) {
      const project = project_by_id.get(project_id);
      return {
        color: project ? projectThemeColor(project.color) : "var(--tn-color-text-disabled)",
        id: project_id,
        items: project_items,
        label: project
          ? project.name
          : project_id === "unassigned"
            ? "未归属"
            : "未知 Project",
        sortOrder: project ? project.sortOrder : Number.MAX_SAFE_INTEGER,
      };
    }).sort(function (left, right) {
      if (left.id === "unassigned") return 1;
      if (right.id === "unassigned") return -1;
      return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "zh-CN");
    });
  }

  const items_by_day = new Map();
  items.forEach(function (item) {
    if (!items_by_day.has(item.dateKey)) items_by_day.set(item.dateKey, []);
    items_by_day.get(item.dateKey).push(item);
  });
  const today_key = date_key(new Date());
  const days = [];
  for (
    let cursor = new Date(range.start);
    cursor.getTime() < range.end.getTime();
    cursor = add_days(cursor, 1)
  ) {
    const key = date_key(cursor);
    const day_items = items_by_day.get(key) || [];
    days.push({
      dateKey: key,
      dateNumber: String(cursor.getDate()),
      isToday: key === today_key,
      itemCount: day_items.length,
      items: day_items,
      label: `${WEEKDAY_LABELS[cursor.getDay()]} · ${format_month_day(cursor)}`,
      projectGroups: group_by_project(day_items),
      weekday: WEEKDAY_LABELS[cursor.getDay()],
    });
  }

  return {
    days,
    items,
    memoCount: items.filter((item) => item.kind === "memo").length,
    range,
    taskCount: items.filter((item) => item.kind === "task").length,
  };
}

/** @param {import("./home.models").HomePageProps & {period?: "week" | "month"}} props */
export function HomePeriodPageModel(props = {}) {
  const period = PERIODS.has(props.period) ? props.period : period_from_route(props.view);
  const workspace$ = HomeWorkspaceModel(props.app);
  const anchor_ = ref(start_of_day(props.now || new Date()));
  const loading_ = ref(true);
  const error_ = ref("");
  const memos_ = ref([]);
  const projects_ = ref([]);
  const tasks_ = ref([]);
  const listeners_ = [];
  let destroyed_ = false;
  let request_active_ = false;

  const presentation_ = Timeless.combine(
    { anchor: anchor_, memos: memos_, projects: projects_, tasks: tasks_ },
    function (state) {
      return buildPeriodView({ ...state, period });
    },
  );

  function activate() {
    workspace$.methods.activate(period);
  }

  if (typeof props.view?.onShow === "function") {
    listeners_.push(props.view.onShow(activate));
  }

  const methods = {
    destroy() {
      destroyed_ = true;
      listeners_.forEach(function (unsubscribe) {
        unsubscribe?.();
      });
    },
    next() {
      anchor_.as(shiftPeriod(period, anchor_.value, 1));
    },
    previous() {
      anchor_.as(shiftPeriod(period, anchor_.value, -1));
    },
    async reload() {
      if (request_active_) return false;
      request_active_ = true;
      loading_.as(true);
      error_.as("");
      const load_memos = props.loadMemos || (() => loadAllMemosFromVault({ archived: false }));
      const load_projects = props.loadProjects || loadProjectsFromVault;
      const load_tasks = props.loadTasks || loadTasks;
      try {
        const [memos, task_payload, project_payload] = await Promise.all([
          load_memos(),
          load_tasks(),
          load_projects(),
        ]);
        if (destroyed_) return false;
        memos_.as(Array.isArray(memos) ? memos : []);
        tasks_.as(Array.isArray(task_payload?.tasks) ? task_payload.tasks : []);
        projects_.as(Array.isArray(project_payload?.projects) ? project_payload.projects : []);
        return true;
      } catch (error) {
        if (!destroyed_) error_.as(error?.message || String(error));
        return false;
      } finally {
        request_active_ = false;
        if (!destroyed_) loading_.as(false);
      }
    },
    ready() {
      destroyed_ = false;
      activate();
      return methods.reload();
    },
    today() {
      anchor_.as(start_of_day(props.now || new Date()));
    },
  };

  return {
    methods,
    state: {
      anchor: anchor_,
      period,
    },
    ui: {
      contentVisible: Timeless.combine(
        { error: error_, loading: loading_ },
        (state) => !state.loading && !state.error,
      ),
      days: computed(presentation_, (value) => value.days),
      error: error_,
      errorVisible: computed(error_, Boolean),
      loading: loading_,
      memoCount: computed(presentation_, (value) => String(value.memoCount)),
      periodLabel: period === "month" ? "月视图" : "周视图",
      taskCount: computed(presentation_, (value) => String(value.taskCount)),
      title: computed(anchor_, (value) => periodTitle(period, value)),
    },
  };
}
