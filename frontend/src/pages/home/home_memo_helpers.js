import { DEFAULT_VISIBILITY } from "@/domain/memos.js";

import { formatRelativeDate } from "./memo-date.js";
import { closestElement } from "./memo-utils.js";

const memo_toc_highlight_timers = new WeakMap();

export function formatDateTime(date) {
  return (
    String(date.getFullYear()).padStart(4, "0") +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0") +
    " " +
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

export function createHistoryDiffSegments(old_text, new_text) {
  const old_value = String(old_text || "");
  const new_value = String(new_text || "");
  if (old_value === new_value) {
    if (old_value) return [{ text: old_value, type: "equal" }];
    return [];
  }
  let prefix_length = 0;
  const maximum_prefix = Math.min(old_value.length, new_value.length);
  while (
    prefix_length < maximum_prefix &&
    old_value[prefix_length] === new_value[prefix_length]
  ) {
    prefix_length += 1;
  }
  let suffix_length = 0;
  const maximum_suffix = Math.min(
    old_value.length - prefix_length,
    new_value.length - prefix_length,
  );
  while (
    suffix_length < maximum_suffix &&
    old_value[old_value.length - suffix_length - 1] ===
      new_value[new_value.length - suffix_length - 1]
  ) {
    suffix_length += 1;
  }
  const segments = [];
  const prefix = old_value.slice(0, prefix_length);
  const deleted = old_value.slice(
    prefix_length,
    old_value.length - suffix_length,
  );
  const inserted = new_value.slice(
    prefix_length,
    new_value.length - suffix_length,
  );
  let suffix = "";
  if (suffix_length) suffix = old_value.slice(old_value.length - suffix_length);
  if (prefix) segments.push({ text: prefix, type: "equal" });
  if (deleted) segments.push({ text: deleted, type: "delete" });
  if (inserted) segments.push({ text: inserted, type: "insert" });
  if (suffix) segments.push({ text: suffix, type: "equal" });
  return segments;
}

export function historyDialogPresentation(history_state) {
  const field_labels = {
    archived: "归档",
    content: "内容",
    kind: "类型",
    pinned: "置顶",
    private: "私密",
    projectId: "项目",
    reactions: "反应",
    taskId: "任务",
    visibility: "可见性",
  };
  let title = "Memo 版本历史";
  if (history_state.historyRecordType === "comment") title = "评论版本历史";
  return {
    error: history_state.historyError || "",
    loading: history_state.historyLoading === true,
    recordId: history_state.historyRecordId || "",
    title,
    versions: (history_state.historyVersions || [])
      .slice()
      .reverse()
      .map(function (version) {
        let time = "";
        if (version.timestamp) time = formatRelativeDate(version.timestamp);
        return {
          changed: (version.changedFields || [])
            .map(function (field) {
              return field_labels[field] || field;
            })
            .join("、"),
          diff: history_state.historyInlineDiffs[version.version] || [],
          diffLoading: Boolean(
            history_state.historyDiffLoading[version.version],
          ),
          expanded: Boolean(
            history_state.historyExpandedDiffs[version.version],
          ),
          restoring: history_state.restoringVersion === version.version,
          time,
          version: version.version,
        };
      }),
  };
}


export function memoDocumentsWithComments(memos, comments, allMemos) {
  let memoList = [];
  if (Array.isArray(memos)) memoList = memos.filter(Boolean);
  let parentList = memoList;
  if (Array.isArray(allMemos)) parentList = allMemos.filter(Boolean);
  const parentById = new Map(parentList.map((memo) => [memo.id, memo]));
  const scopedMemoIds = new Set(memoList.map((memo) => memo.id));
  const documents = memoList.slice();
  let comment_list = [];
  if (Array.isArray(comments)) comment_list = comments;
  comment_list.forEach(function (comment) {
    if (
      !comment ||
      !comment.id ||
      !comment.memoId ||
      !scopedMemoIds.has(comment.memoId)
    )
      return;
    const parent = parentById.get(comment.memoId);
    if (!parent) return;
    documents.push(memoCommentDocument(comment, parent));
  });
  return documents;
}

function memoCommentDocument(comment, parent) {
  let references = [];
  if (Array.isArray(comment && comment.references)) {
    references = comment.references;
  }
  let tags = [];
  if (Array.isArray(comment && comment.tags)) tags = comment.tags;
  return {
    archived: Boolean(parent && parent.archived),
    content: String((comment && comment.content) || ""),
    createdAt:
      (comment && comment.createdAt) ||
      (parent && parent.createdAt) ||
      new Date().toISOString(),
    id: String((comment && comment.id) || ""),
    memoId: String((comment && comment.memoId) || ""),
    path: String((comment && comment.path) || ""),
    pinned: false,
    projectId: String((parent && parent.projectId) || ""),
    references,
    sourceCommentId: String((comment && comment.id) || ""),
    sourceId: String((comment && comment.id) || ""),
    sourceMemoId: String((comment && comment.memoId) || ""),
    sourceType: "comment",
    tags,
    updatedAt: (comment && comment.updatedAt) || "",
    visibility: (parent && parent.visibility) || DEFAULT_VISIBILITY,
  };
}


export function scrollMemoTocLine(control) {
  const card = closestElement(control, "article.memo-card");
  const lineNumber = String(
    (control && control.dataset && control.dataset.memoTocLine) || "",
  );
  if (!card || !lineNumber) return;

  const target = Array.from(
    card.querySelectorAll(".memo-source-line[data-heading-line]"),
  ).find(function (line) {
    return line && line.dataset && line.dataset.headingLine === lineNumber;
  });
  if (!target) return;

  card.querySelectorAll("[data-memo-toc-line]").forEach(function (item) {
    item.classList.toggle("is-active", item.dataset.memoTocLine === lineNumber);
  });

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let behavior = "smooth";
  if (prefersReducedMotion) behavior = "auto";
  target.scrollIntoView({
    behavior,
    block: "start",
    inline: "nearest",
  });
  target.classList.add("is-toc-target");

  const previousTimer = memo_toc_highlight_timers.get(target);
  if (previousTimer) window.clearTimeout(previousTimer);
  const nextTimer = window.setTimeout(function () {
    target.classList.remove("is-toc-target");
    memo_toc_highlight_timers.delete(target);
  }, 1400);
  memo_toc_highlight_timers.set(target, nextTimer);
}


export function handleMemoRenderedCopy(event) {
  if (event.defaultPrevented || !event.clipboardData) return;

  const text = selectedMemoRenderedText(event.currentTarget);
  if (text === null) return;

  event.preventDefault();
  event.clipboardData.setData("text/plain", text);
}

function selectedMemoRenderedText(root) {
  const doc = (root && root.ownerDocument) || document;
  let selection = null;
  if (doc.getSelection) selection = doc.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null;

  const parts = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const text = selectedMemoRangeText(root, selection.getRangeAt(index));
    if (text !== null) parts.push(text);
  }

  if (parts.length) return parts.join("\n");
  return null;
}

function selectedMemoRangeText(root, range) {
  if (!root || !range) return null;
  const selectedLines = Array.from(root.querySelectorAll(".memo-source-line"))
    .filter(function (line) {
      const body = memoLineBody(line);
      return body && rangeIntersectsNode(range, body);
    })
    .filter(function (line, _index, lines) {
      return !hasSelectedSourceLineAncestor(line, lines);
    });

  if (!selectedLines.length) return null;

  return selectedLines
    .map(function (line) {
      return selectedMemoLineText(range, memoLineBody(line));
    })
    .join("\n");
}

function memoLineBody(line) {
  if (!line || !line.children) return null;
  return (
    Array.from(line.children).find(function (child) {
      return (
        child && child.classList && child.classList.contains("memo-line-body")
      );
    }) || null
  );
}

function hasSelectedSourceLineAncestor(line, selectedLines) {
  let node = null;
  if (line) node = line.parentElement;
  while (node) {
    if (
      node.classList &&
      node.classList.contains("memo-source-line") &&
      selectedLines.includes(node)
    )
      return true;
    node = node.parentElement;
  }
  return false;
}

function rangeIntersectsNode(range, node) {
  if (!range || !node || typeof range.intersectsNode !== "function")
    return false;
  try {
    return range.intersectsNode(node);
  } catch (_) {
    return false;
  }
}

function selectedMemoLineText(range, body) {
  if (!body) return "";
  const doc = body.ownerDocument || document;
  const bodyRange = doc.createRange();
  bodyRange.selectNodeContents(body);

  const lineRange = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, bodyRange) < 0) {
    lineRange.setStart(bodyRange.startContainer, bodyRange.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, bodyRange) > 0) {
    lineRange.setEnd(bodyRange.endContainer, bodyRange.endOffset);
  }

  const fragment = lineRange.cloneContents();
  bodyRange.detach();
  lineRange.detach();

  return cleanMemoClipboardLineText(memoFragmentClipboardText(fragment));
}

function memoFragmentClipboardText(fragment) {
  if (!fragment || typeof fragment.querySelectorAll !== "function") return "";
  fragment
    .querySelectorAll(
      ".memo-line-number, .memo-fenced-code-toolbar, button, input, style, script",
    )
    .forEach(function (node) {
      node.remove();
    });
  fragment.querySelectorAll("br").forEach(function (node) {
    node.replaceWith((fragment.ownerDocument || document).createTextNode("\n"));
  });
  return fragment.textContent || "";
}

function cleanMemoClipboardLineText(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}


export function editorFileOpenSettingsKey(settings) {
  let raw = {};
  if (settings && typeof settings === "object") raw = settings;
  return JSON.stringify({
    fileEditor: raw.fileEditor || null,
    fileEditorRules: raw.fileEditorRules || [],
  });
}


// __HOME_MEMO_HELPERS__
