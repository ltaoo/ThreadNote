import { extractTags, normalizeMemoPayload } from "@/domain/memos.js";
import {
  loadMemoPageFromVault,
  loadMemosFromVault,
} from "@/domain/memo-repository.js";
import { logMemoPagination } from "@/domain/memo-pagination-log.js";

import { memoDateKey } from "./memo-date.js";

export function memoFeedCollectionSignature(memos) {
  return JSON.stringify(
    (Array.isArray(memos) ? memos : []).map(function (memo) {
      return String(memo?.id || "").trim();
    }),
  );
}

/** @typedef {import("./home.models").HomeMemoRecord} HomeMemoRecord */
/** @typedef {import("./home.models").MemoListConditions} MemoListConditions */
/** @typedef {import("./home.models").MemoListModelInstance} MemoListModelInstance */
/** @typedef {import("./home.models").MemoListModelOptions} MemoListModelOptions */

/**
 * @param {Record<string, unknown>} conditions
 * @param {string} primary_key
 * @param {string} [alias_key]
 * @returns {unknown}
 */
function condition_value(conditions, primary_key, alias_key) {
  if (Object.prototype.hasOwnProperty.call(conditions, primary_key)) {
    return conditions[primary_key];
  }
  return alias_key && Object.prototype.hasOwnProperty.call(conditions, alias_key)
    ? conditions[alias_key]
    : undefined;
}

/**
 * @param {MemoListConditions["comments"]} comments
 * @returns {Map<string, string[]>}
 */
function comments_by_memo(comments) {
  const index = new Map();
  (Array.isArray(comments) ? comments : []).forEach(function (comment) {
    const memo_id = String((comment && comment.memoId) || "").trim();
    if (!memo_id) return;
    const content = String((comment && comment.content) || "");
    index.set(memo_id, (index.get(memo_id) || []).concat(content));
  });
  return index;
}

/**
 * Applies the home memo-list conditions without mutating the source array.
 * Conditions support both the existing state names and their shorter aliases:
 * activeFilter/filter, activeProjectFilter/projectFilter, activeTags (with
 * activeTag/tag kept as a single-tag alias), and selectedDate/date.
 *
 * @param {ReadonlyArray<HomeMemoRecord>} memos
 * @param {MemoListConditions} [conditions]
 * @returns {HomeMemoRecord[]}
 */
export function filterMemoList(memos, conditions = {}) {
  const source = Array.isArray(memos) ? memos : [];
  const active_filter = String(
    condition_value(conditions, "activeFilter", "filter") || "",
  ).toLowerCase();
  const project_filter = String(
    condition_value(conditions, "activeProjectFilter", "projectFilter") || "",
  );
  const active_tags_value = condition_value(conditions, "activeTags");
  const active_tags = Array.isArray(active_tags_value)
    ? Array.from(
      new Set(
        active_tags_value
          .map(function (tag) {
            return String(tag || "").trim();
          })
          .filter(Boolean),
      ),
    )
    : [];
  if (!active_tags.length) {
    const active_tag = String(
      condition_value(conditions, "activeTag", "tag") || "",
    ).trim();
    if (active_tag) active_tags.push(active_tag);
  }
  const selected_date = String(
    condition_value(conditions, "selectedDate", "date") || "",
  );
  const query_value = condition_value(conditions, "query");
  const query = query_value == null ? "" : String(query_value).toLowerCase();
  const comment_index = comments_by_memo(conditions.comments);

  const filtered = source.filter(function (memo) {
    if (!memo) return false;

    if (project_filter === "unassigned") {
      if (memo.projectId) return false;
    } else if (project_filter && project_filter !== "all") {
      if (memo.projectId !== project_filter) return false;
    }

    if (active_filter === "archive") {
      if (!memo.archived) return false;
    } else if (active_filter) {
      if (memo.archived) return false;
      if (active_filter === "pinned" && !memo.pinned) return false;
      if (active_filter === "public" && memo.visibility !== "PUBLIC") {
        return false;
      }
      if (active_filter === "private" && memo.visibility !== "PRIVATE") {
        return false;
      }
    }

    if (active_tags.length) {
      const memo_tags = extractTags(memo.content);
      if (!active_tags.every((tag) => memo_tags.includes(tag))) return false;
    }
    if (selected_date && memoDateKey(memo) !== selected_date) return false;
    if (!query) return true;

    const comment_text = (comment_index.get(memo.id) || []).join("\n");
    return `${memo.content} ${comment_text} ${memo.visibility} ${memo.alias || ""}`
      .toLowerCase()
      .includes(query);
  });

  if (typeof conditions.sortDesc !== "boolean") return filtered;
  return filtered.sort(function (left, right) {
    const result =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return conditions.sortDesc ? -result : result;
  });
}

/**
 * Loads and filters memo lists.
 *
 * @example
 * const vm$ = MemoListModel({ conditions: { activeFilter: "pinned" } });
 * const list = await vm$.loadList();
 *
 * @param {MemoListModelOptions} [props]
 * @returns {MemoListModelInstance}
 */
export function MemoListModel(props = {}) {
  const services = {
    loadMemosFromVault,
    ...(props.services || {}),
  };
  /** @type {MemoListConditions} */
  const default_conditions = {
    ...(props.conditions || {}),
  };

  /**
   * @param {ReadonlyArray<HomeMemoRecord>} memos
   * @param {MemoListConditions} [conditions]
   * @returns {HomeMemoRecord[]}
   */
  function filterList(memos, conditions = {}) {
    return filterMemoList(memos, {
      ...default_conditions,
      ...conditions,
    });
  }

  /**
   * @param {MemoListConditions} [conditions]
   * @returns {Promise<HomeMemoRecord[]>}
   */
  async function loadList(conditions = {}) {
    const loaded = await services.loadMemosFromVault();
    const memos = /** @type {HomeMemoRecord[]} */ (
      (Array.isArray(loaded) ? loaded : [])
        .map(normalizeMemoPayload)
        .filter(Boolean)
    );
    return filterList(memos, conditions);
  }

  return { filterList, loadList };
}

/**
 * Owns cursor pagination for the memo feed. The view/controller only asks the
 * model to reset or append; request de-duplication, cursors, and collection
 * merging stay here.
 *
 * @param {{
 *   pageSize?: number,
 *   services?: { loadMemoPageFromVault?: typeof loadMemoPageFromVault },
 * }} [props]
 */
export function MemoFeedPaginationModel(props = {}) {
  const services = {
    loadMemoPageFromVault,
    ...(props.services || {}),
  };
  const page_size = Math.min(
    200,
    Math.max(1, Number(props.pageSize) || 10),
  );
  let has_more = false;
  let loading = false;
  let memos = [];
  let next_cursor = "";
  let query = {};
  let request_version = 0;
  let total = 0;

  function normalize_memos(items) {
    return (Array.isArray(items) ? items : [])
      .map(normalizeMemoPayload)
      .filter(Boolean);
  }

  function merge_memos(current, incoming) {
    const merged = [];
    const seen_ids = new Set();
    current.concat(incoming).forEach(function (memo) {
      const memo_id = String(memo?.id || "").trim();
      if (!memo_id || seen_ids.has(memo_id)) return;
      seen_ids.add(memo_id);
      merged.push(memo);
    });
    return merged;
  }

  function snapshot(changed = false) {
    return {
      changed,
      hasMore: has_more,
      loading,
      memos: memos.slice(),
      nextCursor: next_cursor,
      total,
    };
  }

  async function request_page(cursor, replace, version) {
    const started_at = Date.now();
    logMemoPagination("info", "model-request-start", {
      cursorLength: String(cursor || "").length,
      cursorPresent: Boolean(cursor),
      loadedMemoCount: memos.length,
      pageSize: page_size,
      replace,
      requestVersion: version,
    });
    const page = await services.loadMemoPageFromVault({
      ...query,
      cursor,
      limit: page_size,
    });
    logMemoPagination("info", "model-request-returned", {
      durationMs: Date.now() - started_at,
      hasMore: Boolean(page?.hasMore),
      memoCount: Array.isArray(page?.memos) ? page.memos.length : -1,
      nextCursorLength: String(page?.nextCursor || "").length,
      requestVersion: version,
      total: Number(page?.total) || 0,
    });
    if (version !== request_version) return snapshot(false);
    const page_memos = normalize_memos(page?.memos);
    memos = replace ? page_memos : merge_memos(memos, page_memos);
    has_more = Boolean(page?.hasMore);
    next_cursor = has_more ? String(page?.nextCursor || "") : "";
    total = Math.max(0, Number(page?.total) || 0);
    return snapshot(page_memos.length > 0);
  }

  async function reset(next_query = {}) {
    const version = ++request_version;
    query = { ...next_query };
    has_more = false;
    loading = true;
    memos = [];
    next_cursor = "";
    total = 0;
    let changed = false;
    try {
      const page = await request_page("", true, version);
      changed = page.changed;
    } finally {
      if (version === request_version) loading = false;
    }
    return snapshot(changed);
  }

  async function load_more() {
    if (loading || !has_more || !next_cursor) {
      logMemoPagination("warn", "model-load-more-blocked", {
        hasMore: has_more,
        loadedMemoCount: memos.length,
        loading,
        nextCursorPresent: Boolean(next_cursor),
      });
      return snapshot(false);
    }
    const version = request_version;
    loading = true;
    let changed = false;
    try {
      const page = await request_page(next_cursor, false, version);
      changed = page.changed;
    } finally {
      if (version === request_version) loading = false;
    }
    return snapshot(changed);
  }

  function replace_memos(next_memos) {
    memos = merge_memos([], normalize_memos(next_memos));
    return snapshot(false);
  }

  return {
    loadMore: load_more,
    replaceMemos: replace_memos,
    reset,
    snapshot,
  };
}
