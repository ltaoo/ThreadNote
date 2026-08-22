import {
  buildMemoReferenceIndex,
  memoTitle,
  normalizeMemoPayload,
} from "./domain/memos.js";
import {
  loadMemoCommentsFromVault,
  normalizeMemoCommentPayload,
} from "./domain/memo-comments.js";
import {
  errorMessage,
  loadMemosFromVault,
} from "./domain/memo-repository.js";
import { loadTasks } from "./domain/tasks.js";
import { formatRelativeDate, formatShortDate } from "./pages/home/memo-date.js";
import { renderMemoMarkdown } from "./pages/home/memo-markdown.js?v=20260820-todo-checkbox-unify";
import { escapeHTML } from "./pages/home/memo-utils.js";
import { TimelessPrimitive } from "./timeless-icons.js";
import { registerWindowSession } from "./window-state.js";

const PAGE_SIZE = 10;

function format_date_key(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function today_key() {
  return format_date_key(new Date());
}

function date_from_key(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function memo_date_key(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format_date_key(date);
}

function safe_markdown(item, memo_ref_index) {
  try {
    return renderMemoMarkdown(item.content, {
      index: memo_ref_index || undefined,
      readonly: true,
      showLineNumbers: false,
      sourceCommentId: item.type === "comment" ? item.id : "",
      sourceId: item.id,
      sourceMemoId:
        item.type === "comment" ? item.parentMemoId : item.id,
      sourceType: item.type === "comment" ? "comment" : "memo",
    });
  } catch (_) {
    return "<p>" + escapeHTML(item.content) + "</p>";
  }
}

export function TimelineWindowModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref || !runtime?.refarr) {
    throw new Error("TimelineWindowModel requires the Timeless runtime");
  }
  const services = {
    loadMemoCommentsFromVault,
    loadMemosFromVault,
    loadTasks,
    openWindow:
      typeof globalThis.invoke === "function" ? globalThis.invoke : null,
    registerWindowSession,
    ...(props.services || {}),
  };
  const date_label_ = runtime.ref("今天");
  const error_ = runtime.ref("");
  const expanded_item_ids_ = runtime.refarr([]);
  const has_more_ = runtime.ref(false);
  const items_ = runtime.refarr([]);
  const loading_ = runtime.ref(false);
  const query_ = runtime.ref("");
  const selected_date_ = runtime.ref(today_key());
  const status_ = runtime.ref("loading");
  const toast_ = runtime.ref("");
  let comments_ = [];
  let memos_ = [];
  let page_ = 1;
  let tasks_ = [];
  let destroyed_ = false;
  let toast_timer_ = 0;
  let focus_listener_ = null;

  function update_date_label() {
    const selected_date = selected_date_.value;
    const date = date_from_key(selected_date);
    date_label_.as(
      selected_date === today_key()
        ? "今天"
        : date.toLocaleDateString("zh-CN", {
            day: "numeric",
            month: "long",
            weekday: "short",
          }),
    );
  }

  function build_all_items() {
    const date_key = selected_date_.value;
    const memo_by_id = new Map(
      memos_.map(function (memo) {
        return [memo.id, memo];
      }),
    );
    const items = [];
    memos_.forEach(function (memo) {
      if (memo.archived || memo_date_key(memo.createdAt) !== date_key) return;
      items.push({
        content: memo.content,
        createdAt: memo.createdAt,
        id: memo.id,
        parentMemoId: memo.id,
        parentTitle: "",
        type: "memo",
      });
    });
    comments_.forEach(function (comment) {
      if (
        !comment ||
        !comment.memoId ||
        memo_date_key(comment.createdAt) !== date_key
      ) {
        return;
      }
      const parent = memo_by_id.get(comment.memoId);
      if (!parent) return;
      items.push({
        content: comment.content,
        createdAt: comment.createdAt,
        id: comment.id,
        parentMemoId: comment.memoId,
        parentTitle: memoTitle(parent),
        type: "comment",
      });
    });
    tasks_.forEach(function (task) {
      if (
        task.status !== "completed" ||
        !task.completedAt ||
        memo_date_key(task.completedAt) !== date_key
      ) {
        return;
      }
      items.push({
        content: task.title,
        createdAt: task.completedAt,
        id: task.id,
        parentMemoId: task.id,
        parentTitle: "",
        type: "task",
      });
    });
    items.sort(function (left, right) {
      return (
        (new Date(right.createdAt).getTime() || 0) -
        (new Date(left.createdAt).getTime() || 0)
      );
    });
    const query = query_.value;
    return query
      ? items.filter(function (item) {
          return (
            String(item.content || "").toLowerCase().includes(query) ||
            String(item.parentTitle || "").toLowerCase().includes(query)
          );
        })
      : items;
  }

  function rebuild_items() {
    if (destroyed_) return;
    if (error_.value) {
      status_.as("error");
      items_.as([]);
      has_more_.as(false);
      return;
    }
    if (loading_.value && memos_.length === 0) {
      status_.as("loading");
      items_.as([]);
      has_more_.as(false);
      return;
    }
    const all_items = build_all_items();
    if (!all_items.length) {
      status_.as("empty");
      items_.as([]);
      has_more_.as(false);
      return;
    }
    const expanded_ids = new Set(expanded_item_ids_.value);
    const memo_ref_index = buildMemoReferenceIndex(memos_);
    const visible_items = all_items.slice(0, page_ * PAGE_SIZE).map(function (item) {
      const parent_label =
        item.parentTitle && item.parentTitle.length > 20
          ? item.parentTitle.slice(0, 20) + "..."
          : item.parentTitle;
      return {
        ...item,
        expanded: expanded_ids.has(item.id),
        html: item.type === "task" ? "" : safe_markdown(item, memo_ref_index),
        lineCount: String(item.content || "").split("\n").length,
        parentLabel: parent_label,
        relativeTime: formatRelativeDate(item.createdAt),
        shortTime: formatShortDate(item.createdAt),
      };
    });
    status_.as("ready");
    items_.as(visible_items);
    has_more_.as(visible_items.length < all_items.length);
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

  const methods = {
    init() {
      if (destroyed_) return;
      services.registerWindowSession({
        entryPage: "timeline-window.html",
        title: "时间线",
      });
      update_date_label();
      focus_listener_ = function () {
        methods.refresh();
      };
      globalThis.addEventListener?.("focus", focus_listener_);
      methods.refresh();
    },

    loadMore() {
      if (!has_more_.value) return;
      page_ += 1;
      rebuild_items();
    },

    navigateDate(direction) {
      const date = date_from_key(selected_date_.value);
      if (direction === "prev") date.setDate(date.getDate() - 1);
      else if (direction === "next") date.setDate(date.getDate() + 1);
      else if (direction === "today") {
        const today = new Date();
        date.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
      }
      selected_date_.as(format_date_key(date));
      page_ = 1;
      update_date_label();
      rebuild_items();
    },

    async openMemo(memo_id) {
      const memo = memos_.find(function (item) {
        return item && item.id === memo_id;
      });
      if (!memo) {
        show_toast("找不到引用的 memo");
        return false;
      }
      if (!services.openWindow) {
        globalThis.open?.(
          "memo-window.html?id=" + encodeURIComponent(memo_id),
          "_blank",
          "noopener",
        );
        return true;
      }
      try {
        await services.openWindow("/api/memo-window/open", {
          args: { memo, memos: memos_ },
          method: "POST",
        });
        return true;
      } catch (err) {
        show_toast(
          "打开 memo 失败: " +
            (err && err.message ? err.message : String(err || "未知错误")),
        );
        return false;
      }
    },

    async refresh() {
      if (destroyed_ || loading_.value) return false;
      loading_.as(true);
      rebuild_items();
      try {
        const results = await Promise.all([
          services.loadMemosFromVault(),
          services.loadMemoCommentsFromVault(),
          services.loadTasks(),
        ]);
        if (destroyed_) return false;
        error_.as("");
        memos_ = results[0].map(normalizeMemoPayload).filter(Boolean);
        comments_ = results[1]
          .map(normalizeMemoCommentPayload)
          .filter(Boolean);
        tasks_ = (results[2] && results[2].tasks) || [];
        return true;
      } catch (err) {
        if (!destroyed_) error_.as("加载失败: " + errorMessage(err));
        return false;
      } finally {
        if (!destroyed_) {
          loading_.as(false);
          rebuild_items();
        }
      }
    },

    setQuery(query) {
      if (destroyed_) return;
      query_.as(String(query || "").trim().toLowerCase());
      page_ = 1;
      rebuild_items();
    },

    toggleExpand(item_id) {
      if (destroyed_) return;
      const ids = expanded_item_ids_.value.slice();
      const index = ids.indexOf(item_id);
      if (index >= 0) ids.splice(index, 1);
      else ids.push(item_id);
      expanded_item_ids_.as(ids);
      rebuild_items();
    },
  };

  const model = runtime.defineModel({
    state: {
      dateLabel: date_label_,
      error: error_,
      hasMore: has_more_,
      items: items_,
      loading: loading_,
      query: query_,
      selectedDate: selected_date_,
      status: status_,
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
