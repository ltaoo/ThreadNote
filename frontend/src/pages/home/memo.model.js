import { extractTags, normalizeMemoPayload } from "@/domain/memos.js";
import { loadMemosFromVault } from "@/domain/memo-repository.js";

import { memoDateKey } from "./memo-date.js";

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
 * activeFilter/filter, activeProjectFilter/projectFilter, activeTag/tag, and
 * selectedDate/date.
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
  const active_tag = String(
    condition_value(conditions, "activeTag", "tag") || "",
  );
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

    if (active_tag && !extractTags(memo.content).includes(active_tag)) {
      return false;
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
