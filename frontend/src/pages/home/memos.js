import {
  DEFAULT_VISIBILITY,
  VISIBILITY,
  buildMemoReferenceIndex,
  collectTags,
  collectTodos,
  compactText,
  extractProjectDirective,
  extractTags,
  getTodoStats,
  isMemoFenceClosingLine,
  memoBacklinkCount,
  memoReferenceAlias,
  memoTitle,
  normalizeMemoPayload,
  parseMemoFenceLine,
  parseTaskLine,
  parseTaskTitleAndDesc,
  stripProjectDirective,
  updateTaskLine,
} from "@/domain/memos.js";
import {
  normalizeProjectFilter,
  normalizeProjectID,
  normalizeProjectPayload,
  projectThemeColor,
} from "@/domain/projects.js";
import { callNativeAPI } from "@/domain/native.js";
import { parseAssetReference } from "@/domain/storage.js";
import {
  completeTask,
  createTask,
  createTaskNote,
  deleteTask,
  getTask,
  loadTasks,
  normalizeTaskSummary,
  updateTask,
} from "@/domain/tasks.js";
import {
  loadBoards,
  loadBoardPresets,
  createBoard,
  updateBoard,
  deleteBoard,
  refreshBoard,
  normalizeBoard,
} from "@/domain/boards.js";
import { evaluateBoardRules, findTaskColumn } from "@/domain/board-rules.js";
import {
  closeGTDItem,
  createGTDItem,
  createGTDMilestone,
  deleteGTDItem,
  loadGTDItems,
  loadGTDMilestones,
  normalizeGTDItem,
  normalizeGTDMilestone,
  updateGTDItem,
  updateGTDMilestone,
} from "@/domain/gtd.js";
import {
  collectCodeBlocks,
  collectLinks,
  collectResources,
  getResourceStats,
  sortMemoReference,
} from "@/domain/memo-resources.js";
import {
  createMemoCommentInVault,
  deleteMemoCommentInVault,
  loadCommentHistoryFromVault,
  loadCommentHistoryVersionFromVault,
  loadMemoCommentsFromVault,
  normalizeMemoCommentPayload,
  restoreCommentHistoryVersionFromVault,
  updateMemoCommentInVault,
} from "@/domain/memo-comments.js";
import {
  createMemoInVault,
  createProjectInVault,
  deleteMemoInVault,
  errorMessage,
  loadMemoFromLocal,
  loadMemoHistoryFromVault,
  loadMemoHistoryVersionFromVault,
  loadMemos,
  loadMemosFromVault,
  loadProjects,
  loadProjectsFromVault,
  restoreMemoHistoryVersionFromVault,
  saveMemos,
  saveProjects,
  updateMemoInVault,
} from "@/domain/memo-repository.js";
import {
  COMPOSER_DRAFT_ID,
  deleteMemoDraftInVault,
  loadMemoDraftsFromVault,
  memoEditDraftId,
  normalizeMemoDraftPayload,
  upsertMemoDraftInVault,
} from "@/domain/memo-drafts.js";
import {
  MemoCardExpansionModel,
  MemoCardMenuModel,
  setCheckboxControlValue,
  SmallCalendar,
  SmallCalendarModel,
} from "@/components.js";
import { CodeBlocksModel } from "@/code-blocks-model.js";
import {
  buildCommentDetailPayload,
  writeCommentDetailPayload,
} from "@/comment-detail-model.js";
import {
  buildTodoDetailPayload,
  writeTodoDetailPayload,
} from "@/todo-detail-model.js";
import { ProjectDetailPaginationModel } from "@/project-detail-pagination-model.js";
import { openImagePreviewFromElement } from "@/components/image-preview.js";
import { TimelessPrimitive } from "@/timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";
import { registerWindowSession } from "@/window-state.js";

import { FileBrowserModel } from "./memo-file-browser-model.js";
import { bindFileBrowserView } from "./memo-file-browser-view.js";
import {
  activeViewMeta,
  detachedMemoRenderContext,
  applyContentOpsToString,
  parseHost,
  stripMemoFrontmatter,
} from "./memo-view-model.js";
import {
  EDITOR_SETTINGS_STORAGE_KEY,
  createMiniEditor,
  fileInfoToUploadURL,
  filesToMarkdown,
  insertPlainTextIntoEditor,
  loadEditorSettings,
  loadEditorSettingsFromVault,
  normalizeEditorSettings,
  refreshCloudStorageSettings,
  uploadErrorMessage,
} from "./memo-editor.js";
import {
  collectMemoHeadings,
  compactFileURL,
  renderMemoMarkdown,
  safeImageUrl,
  safeUrl,
} from "./memo-markdown.js";
import { mountMemoEditDialog } from "./memo-dialog-edit.js";
import {
  formatRelativeDate,
  memoDateCounts,
  memoDateKey,
} from "./memo-date.js";
import { calendarDayInfo } from "./memo-calendar-info.js";
import {
  MemoQuickSearchModel,
  memoQuickSearchContextKey,
  memoQuickSearchHighlightParts,
  readMemoQuickSearchOpenContext,
  writeMemoQuickSearchOpenContext,
} from "./memo-quick-search-model.js";
import {
  closestAnchor,
  closestElement,
  copyText,
  escapeAttr,
  escapeCSSIdent,
  escapeHTML,
  externalBrowserURLFromAnchor,
} from "./memo-utils.js";
import {
  BoardListView,
  BoardRuleActionRowView,
  BoardRuleConditionRowView,
  BoardRulesOverviewView,
  BoardView,
  ClipboardCardView,
  ClipboardCurrentView,
  CodeBlocksView,
  CompletedTimeEditorView,
  ConfirmDeleteView,
  DetachedMemoCardView,
  DetachedMemoShellView,
  EditorPreviewView,
  EmptyStateView,
  FileGridView,
  FetchTitleLogView,
  HistoryDialogView,
  ImageContextMenuView,
  ImageGridView,
  InlineTaskDetailView,
  InlinePromptView,
  LinksView,
  MemoDialogView,
  MemoFeedView,
  MemoSearchResultsView,
  MemoWorkspaceShellView,
  PinnedMemoListView,
  PinDialogView,
  ProjectListView,
  ProjectActionsView,
  ProjectDetailView,
  ProjectOptionsView,
  SourceMemoDialogView,
  SourceEditDialogView,
  TagListView,
  TaskCollectionsView,
  TaskEditDialogView,
  memoIcon,
} from "./memos-view.js";
import { SVG } from "./memo-icons.js";
import { mountACPChat } from "./chat.js";

const LAST_PROJECT_STORAGE_KEY = "demo-desktop:memos:last-project:v1";
const SHORTCUTS_STORAGE_KEY = "demo-desktop:settings:shortcuts:v1";
const TASK_FILTER_STORAGE_KEY = "demo-desktop:gtd:task-filter:v1";
const CLIPBOARD_AUTO_HIDE_MS = 5000;
const CLIPBOARD_EXIT_MS = 180;
const CLIPBOARD_FOREGROUND_MAX_AGE_MS = 60 * 1000;
const CLIPBOARD_MIN_VISIBLE_MS = 1500;
const DETACHED_WINDOW_STATE_POLL_INTERVAL = 250;
const DETACHED_WINDOW_STATE_SNAPSHOT_DEBOUNCE = 800;
const TASK_FILTERS = new Set([
  "all",
  "completed",
  "inbox",
  "next",
  "overdue",
  "scheduled",
  "today",
]);
const FEED_PAGE_SIZE = 10;
const LINKS_PAGE_SIZE = 20;
const LINK_TITLES_STORAGE_KEY = "demo-desktop:links:fetched-titles:v1";
const memoTocHighlightTimers = new WeakMap();

function normalizeTaskFilter(value) {
  const filter = String(value || "")
    .trim()
    .toLowerCase();
  return TASK_FILTERS.has(filter) ? filter : "today";
}

function extractTaskRefId(text) {
  var match = String(text || "").match(/\[\[task:([^\]|]+)/);
  return match ? match[1].trim() : "";
}

function stripTaskRefSyntax(text) {
  return String(text || "")
    .replace(/\[\[task:[^\]|]+\|?([^\]]*)\]\]/g, function (_m, label) {
      return label.trim() || "";
    })
    .trim();
}

function formatDateTime(date) {
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

function createHistoryDiffSegments(old_text, new_text) {
  const old_value = String(old_text || "");
  const new_value = String(new_text || "");
  if (old_value === new_value) {
    return old_value ? [{ text: old_value, type: "equal" }] : [];
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
  const suffix = suffix_length
    ? old_value.slice(old_value.length - suffix_length)
    : "";
  if (prefix) segments.push({ text: prefix, type: "equal" });
  if (deleted) segments.push({ text: deleted, type: "delete" });
  if (inserted) segments.push({ text: inserted, type: "insert" });
  if (suffix) segments.push({ text: suffix, type: "equal" });
  return segments;
}

function historyDialogPresentation(history_state) {
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
  return {
    error: history_state.historyError || "",
    loading: history_state.historyLoading === true,
    recordId: history_state.historyRecordId || "",
    title:
      history_state.historyRecordType === "comment"
        ? "评论版本历史"
        : "Memo 版本历史",
    versions: (history_state.historyVersions || [])
      .slice()
      .reverse()
      .map(function (version) {
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
          time: version.timestamp ? formatRelativeDate(version.timestamp) : "",
          version: version.version,
        };
      }),
  };
}

function formatInlineTaskReminder(reminder) {
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

function loadLinkTitles() {
  try {
    return (
      JSON.parse(localStorage.getItem(LINK_TITLES_STORAGE_KEY) || "null") || {}
    );
  } catch (_) {
    return {};
  }
}

function saveLinkTitles(titles) {
  try {
    localStorage.setItem(LINK_TITLES_STORAGE_KEY, JSON.stringify(titles));
  } catch (_) {
    /* ignore */
  }
}

function saveLinksDomainFilter(filter) {
  callNativeAPI("/api/links/domain-filter/save", {
    method: "POST",
    args: { filter: filter },
  }).catch(function () {
    /* ignore save errors */
  });
}

function saveDomainChips(chips) {
  callNativeAPI("/api/links/domain-chips/save", {
    method: "POST",
    args: { chips: chips },
  }).catch(function () {
    /* ignore save errors */
  });
}

function loadTaskFilter() {
  return normalizeTaskFilter(localStorage.getItem(TASK_FILTER_STORAGE_KEY));
}

function rememberTaskFilter(filter) {
  localStorage.setItem(TASK_FILTER_STORAGE_KEY, normalizeTaskFilter(filter));
}

function copyCodeBlockFromAction(action, memos, notify) {
  const blockNode =
    closestElement(action, "[data-code-block-id]") ||
    closestElement(action, ".memo-fenced-code-block");
  const blockId =
    blockNode && blockNode.dataset ? blockNode.dataset.codeBlockId : "";
  const block = blockId
    ? collectCodeBlocks(Array.isArray(memos) ? memos : []).find(
        (item) => item.id === blockId,
      )
    : null;
  const code = block ? block.code : codeBlockTextFromNode(blockNode);
  if (code === null) return;
  copyText(code).then(
    () => notify("已复制代码片段"),
    () => notify("复制失败"),
  );
}

function copyInlineLinkFromAction(action, notify) {
  const linkNode = closestElement(action, "[data-inline-link-url]");
  const url =
    linkNode && linkNode.dataset ? linkNode.dataset.inlineLinkUrl : "";
  if (!url) return;
  copyText(url).then(
    () => notify("已复制链接"),
    () => notify("复制失败"),
  );
}

function toggleCodeCollapse(action) {
  const block = closestElement(action, ".memo-fenced-code-block");
  if (!block) return;
  const collapsed = block.classList.toggle("memo-fenced-code-collapsed");
  const btn = block.querySelector(".memo-code-collapse-button");
  if (btn) {
    btn.title = collapsed ? "展开代码" : "收起代码";
    btn.setAttribute("aria-label", collapsed ? "展开代码" : "收起代码");
  }
}

function bindMemoImageContextMenu(root, options = {}) {
  let menu = null;
  let imageTarget = null;

  function handleContextMenu(event) {
    const target = memoImageContextTarget(event.target);
    if (!target || !root.contains(target)) return;

    const payload = memoImageClipboardPayload(target);
    if (!payload || (!payload.source && !payload.url && !payload.contentBase64))
      return;

    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY, target);
  }

  function openMenu(x, y, target) {
    closeMenu();
    imageTarget = target;
    menu = document.createElement("div");
    menu.className =
      "tn-popup tn-popup--menu tn-menu tn-context-menu memo-image-context-menu";
    menu.dataset.n = "memo-image-context-menu-host";
    menu.setAttribute("role", "menu");
    renderTimelessView(menu, ImageContextMenuView());
    menu.addEventListener("click", handleMenuClick);
    document.body.appendChild(menu);
    positionMenu(menu, x, y);
    window.setTimeout(function () {
      document.addEventListener("click", handleDocumentClick, true);
      document.addEventListener("keydown", handleMenuKeydown, true);
      window.addEventListener("blur", closeMenu);
      window.addEventListener("resize", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
    }, 0);
  }

  function handleDocumentClick(event) {
    if (menu && menu.contains(event.target)) return;
    closeMenu();
  }

  function handleMenuClick(event) {
    const action = closestElement(event.target, "[data-image-context-action]");
    if (!action || !menu || !menu.contains(action)) return;

    event.preventDefault();
    event.stopPropagation();
    const target = imageTarget;
    closeMenu();
    if (!target) return;

    switch (action.dataset.imageContextAction) {
      case "copy":
        copyMemoImageToClipboard(target, options.notify);
        break;
      case "preview":
        if (typeof options.onPreview === "function") options.onPreview(target);
        break;
      default:
        break;
    }
  }

  function handleMenuKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  function closeMenu() {
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
    window.removeEventListener("blur", closeMenu);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", closeMenu, true);
    if (menu) {
      menu.removeEventListener("click", handleMenuClick);
      unmountTimelessView(menu);
      menu.remove();
    }
    menu = null;
    imageTarget = null;
  }

  root.addEventListener("contextmenu", handleContextMenu);

  return {
    destroy() {
      root.removeEventListener("contextmenu", handleContextMenu);
      closeMenu();
    },
  };
}

function positionMenu(menu, x, y) {
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(
    margin,
    Math.min(x, window.innerWidth - rect.width - margin),
  );
  const top = Math.max(
    margin,
    Math.min(y, window.innerHeight - rect.height - margin),
  );
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function memoImageContextTarget(target) {
  const node = closestElement(target, "[data-image-preview-src]");
  return node || null;
}

function memoImageClipboardPayload(element) {
  const host = closestElement(element, "[data-image-preview-src]") || element;
  const dataset = (host && host.dataset) || {};
  const image =
    element && element.tagName === "IMG"
      ? element
      : host && host.querySelector && host.querySelector("img");
  const url = String(
    dataset.imagePreviewSrc ||
      (image && (image.getAttribute("src") || image.src)) ||
      "",
  ).trim();
  const source = String(dataset.imagePreviewSource || "").trim();
  const title = String(
    dataset.imagePreviewTitle || (image && image.getAttribute("alt")) || "",
  ).trim();
  return {
    source,
    title,
    url,
  };
}

function copyMemoImageToClipboard(element, notify) {
  const payload = memoImageClipboardPayload(element);
  const report = typeof notify === "function" ? notify : function () {};
  if (!payload || (!payload.source && !payload.url)) return;

  callNativeAPI("/api/clipboard/image/write", {
    args: payload,
    method: "POST",
  }).then(
    function () {
      report("已复制图片");
    },
    function (err) {
      report("复制图片失败: " + errorMessage(err));
    },
  );
}

function memoDocumentsWithComments(memos, comments, allMemos) {
  const memoList = Array.isArray(memos) ? memos.filter(Boolean) : [];
  const parentList = Array.isArray(allMemos)
    ? allMemos.filter(Boolean)
    : memoList;
  const parentById = new Map(parentList.map((memo) => [memo.id, memo]));
  const scopedMemoIds = new Set(memoList.map((memo) => memo.id));
  const documents = memoList.slice();
  (Array.isArray(comments) ? comments : []).forEach(function (comment) {
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
    references: Array.isArray(comment && comment.references)
      ? comment.references
      : [],
    sourceCommentId: String((comment && comment.id) || ""),
    sourceId: String((comment && comment.id) || ""),
    sourceMemoId: String((comment && comment.memoId) || ""),
    sourceType: "comment",
    tags: Array.isArray(comment && comment.tags) ? comment.tags : [],
    updatedAt: (comment && comment.updatedAt) || "",
    visibility: (parent && parent.visibility) || DEFAULT_VISIBILITY,
  };
}

function scrollMemoTocLine(control) {
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
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
    inline: "nearest",
  });
  target.classList.add("is-toc-target");

  const previousTimer = memoTocHighlightTimers.get(target);
  if (previousTimer) window.clearTimeout(previousTimer);
  const nextTimer = window.setTimeout(function () {
    target.classList.remove("is-toc-target");
    memoTocHighlightTimers.delete(target);
  }, 1400);
  memoTocHighlightTimers.set(target, nextTimer);
}

function codeBlockTextFromNode(blockNode) {
  if (!blockNode || typeof blockNode.querySelector !== "function") return null;
  const codeNode = blockNode.querySelector("[data-code-block-code]");
  if (codeNode) return codeNode.textContent || "";
  const codeNodes = blockNode.querySelectorAll("pre code");
  if (codeNodes.length === 0) return null;
  return Array.from(codeNodes)
    .map(function (node) {
      return node.textContent || "";
    })
    .join("\n");
}

function handleMemoRenderedCopy(event) {
  if (event.defaultPrevented || !event.clipboardData) return;

  const text = selectedMemoRenderedText(event.currentTarget);
  if (text === null) return;

  event.preventDefault();
  event.clipboardData.setData("text/plain", text);
}

function selectedMemoRenderedText(root) {
  const doc = (root && root.ownerDocument) || document;
  const selection = doc.getSelection ? doc.getSelection() : null;
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null;

  const parts = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const text = selectedMemoRangeText(root, selection.getRangeAt(index));
    if (text !== null) parts.push(text);
  }

  return parts.length ? parts.join("\n") : null;
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
  let node = line ? line.parentElement : null;
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

function editorFileOpenSettingsKey(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  return JSON.stringify({
    fileEditor: raw.fileEditor || null,
    fileEditorRules: raw.fileEditorRules || [],
  });
}

export function mountMemosHome(root) {
  const state = {
    activeFilter: "all",
    activeTag: "",
    activeView: "memos",
    commentDraft: "",
    commentEditDraft: "",
    commentEditingId: "",
    commentEditPreviewVisible: false,
    commentPreviewVisible: false,
    commentingMemoId: "",
    comments: [],
    commentsLoaded: false,
    commentSaving: false,
    editingId: "",
    editDraft: "",
    editProjectId: "",
    editVisibility: DEFAULT_VISIBILITY,
    highlightMemoId: "",
    highlightTimer: null,
    tocVisibleMemoIds: new Set(),
    expandedCommentListMemoIds: new Set(),
    feedPage: 1,
    domainChips: [],
    linkTitles: loadLinkTitles(),
    linksDomainFilter: "",
    linksPage: 1,
    draftsLoaded: false,
    editorSettings: loadEditorSettings(),
    editPreviewVisible: false,
    gtdItems: [],
    gtdLoading: false,
    gtdMilestones: [],
    activeProjectFilter: "all",
    activeProjectId: "",
    projectActiveTab: "memos",
    composerProjectId: "",
    composerPreviewVisible: false,
    lastComposerProjectId: localStorage.getItem(LAST_PROJECT_STORAGE_KEY) || "",
    activeBoardId: "",
    boardPresetsOpen: false,
    boardPresets: [],
    boardPresetsProjectId: "",
    boardRuleEditorOpen: false,
    boardRuleEditorBoardId: "",
    boardRuleEditorRuleId: "",
    boards: [],
    boardsLoading: false,
    memoRefIndex: null,
    memoDrafts: [],
    memoDialog: null,
    memos: loadMemos(),
    projects: loadProjects(),
    query: "",
    sortDesc: true,
    saving: false,
    taskDetails: new Map(),
    taskFilter: loadTaskFilter(),
    retainedCompletedTaskFilters: new Map(),
    tasks: [],
    tasksLoading: false,
    clipboardItem: null,
    clipboardDisplayedId: "",
    clipboardForeground: true,
    clipboardLastAppearedId: "",
    clipboardLeaving: false,
    clipboardShownAt: 0,
    clipboardVisible: false,
    clipboardWorking: false,
    clipboardLeaveTimer: null,
    clipboardTimer: null,
    toastTimer: null,
    visibility: DEFAULT_VISIBILITY,
    commentVisibility: DEFAULT_VISIBILITY,
    replyToCommentId: "",
    privateHasPin: false,
    privateUnlocked: false,
    pinDialogOpen: false,
    pinDialogMode: "unlock",
    pinDialogError: "",
    historyOpen: false,
    historyRecordId: "",
    historyRecordType: "memo",
    historyVersions: [],
    historyLoading: false,
    historyError: "",
    historyPreviewContent: "",
    historyPreviewVersion: 0,
    restoringVersion: 0,
    historyInlineDiffs: {},
    historyExpandedDiffs: {},
    historyDiffLoading: {},
  };
  const smallCalendarModel = new SmallCalendarModel({
    getDayInfo: calendarDayInfo,
    onChange: handleSmallCalendarChange,
    weekStart: state.editorSettings.calendarWeekStart,
  });
  const memoCardExpansionModel = new MemoCardExpansionModel();
  const memoCardMenuModel = new MemoCardMenuModel();
  const codeBlocksModel = new CodeBlocksModel();
  const fileBrowserModel = new FileBrowserModel();
  const projectDetailPaginationModel = new ProjectDetailPaginationModel();

  let composerEditor = null;
  let composerAutoSaveTimer = null;
  let commentEditEditor = null;
  let commentEditEditorCommentId = "";
  let commentEditor = null;
  let commentEditorMemoId = "";
  let editEditor = null;
  let editEditorMemoId = "";
  let memoDialogEditor = null;
  let memoDialogController = null;
  let acpChatController = null;
  let projectScrollObserver = null;
  const memoQuickSearchModel = new MemoQuickSearchModel({
    formatDate: formatRelativeDate,
    openResult(context) {
      closeMemoSearchPalette();
      if (context.todoId) {
        openTodoDetail(context.result && context.result.todo, context.query);
        return;
      }
      if (context.commentId) {
        openCommentDetail(context.commentId, context.query);
        return;
      }
      detachMemo(context.memoId, { query: context.query });
    },
  });

  renderTimelessView(root, MemoWorkspaceShellView());

  const els = {
    allNavCount: root.querySelector("[data-all-nav-count]"),
    attachInput: root.querySelector("[data-attach-input]"),
    calendar: root.querySelector("[data-calendar]"),
    composer: root.querySelector("[data-composer]"),
    composerHost: root.querySelector("[data-composer-host]"),
    composerDraftStatus: root.querySelector("[data-composer-draft-status]"),
    composerStatus: root.querySelector("[data-composer-status]"),
    composerVimStatus: root.querySelector("[data-composer-vim-status]"),
    codeNavCount: root.querySelector("[data-code-nav-count]"),
    codeBlocksShowAll: root.querySelector("[data-code-blocks-show-all]"),
    clipboardCard: root.querySelector("[data-clipboard-card]"),
    clipboardNavCount: root.querySelector("[data-clipboard-nav-count]"),
    boardNavCount: root.querySelector("[data-board-nav-count]"),
    rulesNavCount: root.querySelector("[data-rules-nav-count]"),
    createButton: root.querySelector('[data-action="createMemo"]'),
    fileNavCount: root.querySelector("[data-file-nav-count]"),
    imageNavCount: root.querySelector("[data-image-nav-count]"),
    itemNavCount: root.querySelector("[data-item-nav-count]"),
    linkNavCount: root.querySelector("[data-link-nav-count]"),
    mainSubtitle: root.querySelector("[data-main-subtitle]"),
    mainTitle: root.querySelector("[data-main-title]"),
    memoMain: root.querySelector(".memo-main"),
    memoShell: root.querySelector(".memo-shell"),
    memoInspector: root.querySelector(".memo-inspector"),
    milestoneNavCount: root.querySelector("[data-milestone-nav-count]"),
    memoList: root.querySelector("[data-memo-list]"),
    memoSearchInput: root.querySelector("[data-memo-search-input]"),
    memoSearchPalette: root.querySelector("[data-memo-search-palette]"),
    memoSearchResults: root.querySelector("[data-memo-search-results]"),
    pinnedList: root.querySelector("[data-pinned-list]"),
    projectFilterSelect: root.querySelector("[data-project-filter-select]"),
    projectList: root.querySelector("[data-project-list]"),
    projectSelect: root.querySelector("[data-project-select]"),
    searchInput: root.querySelector("[data-search-input]"),
    topbarDefaultActions: root.querySelector("[data-topbar-default-actions]"),
    topbarProjectActions: root.querySelector("[data-topbar-project-actions]"),
    tagList: root.querySelector("[data-tag-list]"),
    tagSummary: root.querySelector("[data-tag-summary]"),
    todoNavCount: root.querySelector("[data-todo-nav-count]"),
    toast: root.querySelector("[data-toast]"),
    visibilitySelect: root.querySelector("[data-visibility-select]"),
  };
  const smallCalendarView = SmallCalendar({
    ariaLabel: "Memo 日期筛选",
    model: smallCalendarModel,
  });
  els.calendar.replaceChildren(smallCalendarView.render());
  smallCalendarView.onMounted?.();
  const unsubscribeMemoCardMenu =
    memoCardMenuModel.subscribe(syncMemoCardMenus);

  composerEditor = createComposerEditor("");
  const imageContextMenu = bindMemoImageContextMenu(root, {
    notify: showToast,
    onPreview: openImagePreview,
  });
  const fileBrowserView = bindFileBrowserView(root, fileBrowserModel, {
    onCopy: copyFileBrowserURL,
    onOpenSource: openFileBrowserSource,
    onView: openFileBrowserItem,
  });

  renderAll();
  renderComposerStatus(composerEditor.getText());
  bindGoMessages();
  refreshProjectsFromVault();
  refreshMemosFromVault();
  refreshMemoCommentsFromVault();
  refreshMemoDraftsFromVault();
  refreshTasksFromVault();
  refreshBoardsFromVault();
  refreshGTDFromVault();
  refreshEditorSettings({ silent: true });
  refreshStorageForRender();
  refreshLinksDomainFilter();
  refreshDomainChips();
  checkPrivacyStatus();

  window.addEventListener("click", handleExternalLinkClick, true);
  window.addEventListener("pointerdown", handleMemoMorePointerDown, true);
  root.addEventListener("click", handleClick);
  root.addEventListener("copy", handleMemoRenderedCopy);
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleChange);
  root.addEventListener("submit", handleSubmit);
  els.memoList.parentElement.addEventListener("scroll", handleMemoListScroll);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("storage", handleStorage);
  root.addEventListener("dragstart", handleBoardDragStart);
  root.addEventListener("dragover", handleBoardDragOver);
  root.addEventListener("dragleave", handleBoardDragLeave);
  root.addEventListener("drop", handleBoardDrop);
  root.addEventListener("dragend", handleBoardDragEnd);
  root.addEventListener("change", handleBoardTaskSelect);

  return {
    destroy() {
      window.removeEventListener("click", handleExternalLinkClick, true);
      window.removeEventListener(
        "pointerdown",
        handleMemoMorePointerDown,
        true,
      );
      root.removeEventListener("click", handleClick);
      root.removeEventListener("copy", handleMemoRenderedCopy);
      root.removeEventListener("input", handleInput);
      root.removeEventListener("change", handleChange);
      root.removeEventListener("submit", handleSubmit);
      els.memoList.parentElement.removeEventListener(
        "scroll",
        handleMemoListScroll,
      );
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("storage", handleStorage);
      imageContextMenu.destroy();
      fileBrowserView.destroy();
      if (state.toastTimer) window.clearTimeout(state.toastTimer);
      if (state.clipboardTimer) window.clearTimeout(state.clipboardTimer);
      if (state.clipboardLeaveTimer)
        window.clearTimeout(state.clipboardLeaveTimer);
      if (state.highlightTimer) window.clearTimeout(state.highlightTimer);
      if (composerAutoSaveTimer) window.clearTimeout(composerAutoSaveTimer);
      composerAutoSaveTimer = null;
      if (composerEditor) composerEditor.destroy();
      if (commentEditor) commentEditor.destroy();
      if (commentEditEditor) commentEditEditor.destroy();
      if (editEditor) editEditor.destroy();
      if (memoDialogEditor) memoDialogEditor.destroy();
      if (memoDialogController) memoDialogController.destroy();
      if (acpChatController) acpChatController.destroy();
      disconnectProjectScrollObserver();
      smallCalendarView.beforeUnmounted?.();
      smallCalendarView.onUnmounted?.();
      smallCalendarModel.destroy();
      unsubscribeMemoCardMenu();
      memoCardMenuModel.destroy();
      commentEditEditorCommentId = "";
      commentEditorMemoId = "";
      editEditorMemoId = "";
      memoDialogEditor = null;
      memoDialogController = null;
      acpChatController = null;
      state.memoDialog = null;
      unmountTimelessView(root);
    },
  };

  function createComposerEditor(value) {
    return createMiniEditor(els.composerHost, {
      memoItems() {
        return state.memos;
      },
      tagItems: editorTagItems,
      onChange(nextValue) {
        renderComposerStatus(nextValue);
        renderComposerPreview();
        scheduleComposerAutoSave();
      },
      onCommit() {
        return createMemo({ source: "vim-wq" });
      },
      onDiscard() {
        return clearComposerDraft({ clearEditor: true, message: "草稿已丢弃" });
      },
      onQuit() {
        return exitComposer();
      },
      onSave() {
        return writeComposerDraft();
      },
      onSubmit() {
        createMemo();
      },
      onWriteDraft() {
        return writeComposerDraft();
      },
      placeholder: "记录想法、任务或链接...",
      value: value || "",
      vim: editorVimEnabled(),
      vimStatusHost: els.composerVimStatus,
    });
  }

  function editorTagItems() {
    return collectTags(scopedMemos().filter((memo) => !memo.archived));
  }

  function editorVimEnabled() {
    return state.editorSettings && state.editorSettings.vimMode === true;
  }

  function calendarWeekStart() {
    return state.editorSettings &&
      state.editorSettings.calendarWeekStart === "sunday"
      ? "sunday"
      : "monday";
  }

  function handleStorage(event) {
    if (event.key !== EDITOR_SETTINGS_STORAGE_KEY) return;
    refreshEditorSettings();
  }

  function refreshEditorSettings(options = {}) {
    return loadEditorSettingsFromVault().then(
      function (next) {
        applyEditorSettings(next, options);
      },
      function (err) {
        if (!options.silent)
          showToast("读取编辑器设置失败: " + errorMessage(err));
      },
    );
  }

  function handleWindowFocus() {
    state.clipboardForeground = true;
    refreshEditorSettings();
    requestClipboardLatest({ maxAgeMs: CLIPBOARD_FOREGROUND_MAX_AGE_MS });
  }

  function handleWindowBlur() {
    state.clipboardForeground = false;
    hideClipboardCard();
  }

  function isClipboardForeground() {
    if (state.clipboardForeground) return true;
    return typeof document.hasFocus === "function" && document.hasFocus();
  }

  function applyEditorSettings(nextSettings, options = {}) {
    const next = normalizeEditorSettings(nextSettings || loadEditorSettings());
    const vimChanged = next.vimMode !== editorVimEnabled();
    const calendarChanged = next.calendarWeekStart !== calendarWeekStart();
    const fileEditorChanged =
      editorFileOpenSettingsKey(next) !==
      editorFileOpenSettingsKey(state.editorSettings);
    if (!vimChanged && !calendarChanged && !fileEditorChanged) return;

    const composerText = composerEditor ? composerEditor.getText() : "";
    state.editorSettings = next;

    if (vimChanged) {
      if (editEditor) syncEditDraftFromEditor();
      if (commentEditor) syncCommentDraftFromEditor();
      if (commentEditEditor) syncCommentEditDraftFromEditor();
      if (memoDialogEditor) syncMemoDialogDraftFromEditor();
      if (composerAutoSaveTimer) window.clearTimeout(composerAutoSaveTimer);
      composerAutoSaveTimer = null;
      if (composerEditor) composerEditor.destroy();
      unmountTimelessView(els.composerHost);
      composerEditor = createComposerEditor(composerText);
      renderComposerStatus(composerEditor.getText());

      if (state.memoDialog) renderMemoDialog();
      if (
        state.activeView === "memos" &&
        (state.editingId || state.commentingMemoId || state.commentEditingId)
      )
        renderFeed();
      if (calendarChanged) renderCalendar();
      if (fileEditorChanged) renderAll();
      if (!options.silent)
        showToast(next.vimMode ? "已启用 Vim 模式" : "已关闭 Vim 模式");
      return;
    }

    if (calendarChanged) {
      renderCalendar();
      if (!options.silent)
        showToast(
          next.calendarWeekStart === "sunday"
            ? "日历已设为周日开始"
            : "日历已设为周一开始",
        );
    }

    if (fileEditorChanged) {
      renderAll();
      if (!options.silent)
        showToast(
          "本地文件打开应用已更新为 " + editorFileEditorLabel(next.fileEditor),
        );
    }
  }

  function editorFileEditorLabel(fileEditor) {
    const raw = fileEditor && typeof fileEditor === "object" ? fileEditor : {};
    return raw.name || raw.id || "编辑器";
  }

  function handleExternalLinkClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = closestAnchor(event.target);
    if (!link || !root.contains(link)) return;

    const url = externalBrowserURLFromAnchor(link);
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    confirmOpenExternalLink(url);
  }

  function checkPrivacyStatus() {
    if (typeof globalThis.invoke !== "function") return;
    globalThis.invoke("/api/privacy/status", { method: "GET" }).then(
      function (resp) {
        if (resp && resp.code === 0 && resp.data) {
          state.privateHasPin = Boolean(resp.data.hasPin);
          state.privateUnlocked = Boolean(resp.data.unlocked);
          if (state.privateHasPin !== undefined) renderAll();
        }
      },
      function () {},
    );
  }

  function openPinDialog() {
    if (state.privateUnlocked) return;
    if (state.privateHasPin) {
      state.pinDialogMode = "unlock";
    } else {
      state.pinDialogMode = "set";
    }
    state.pinDialogError = "";
    state.pinDialogOpen = true;
    renderAll();
    setTimeout(function () {
      var input = root.querySelector("[data-pin-input]");
      if (input) input.focus();
    }, 50);
  }

  function closePinDialog() {
    state.pinDialogOpen = false;
    state.pinDialogError = "";
    renderAll();
  }

  function submitPinDialog() {
    var input = root.querySelector("[data-pin-input]");
    if (!input) return;
    var pin = String(input.value || "").trim();
    if (!pin) {
      state.pinDialogError = "请输入 PIN";
      renderAll();
      return;
    }
    if (state.pinDialogMode === "set") {
      if (pin.length < 4) {
        state.pinDialogError = "PIN 至少需要 4 位";
        renderAll();
        return;
      }
      globalThis
        .invoke("/api/privacy/set-pin", { method: "POST", args: { pin: pin } })
        .then(
          function (resp) {
            if (resp && resp.code === 0) {
              state.privateHasPin = true;
              state.privateUnlocked = true;
              state.pinDialogOpen = false;
              state.pinDialogError = "";
              renderAll();
            } else {
              state.pinDialogError = (resp && resp.msg) || "设置 PIN 失败";
              renderAll();
            }
          },
          function (err) {
            state.pinDialogError = errorMessage(err);
            renderAll();
          },
        );
    } else {
      globalThis
        .invoke("/api/privacy/unlock", { method: "POST", args: { pin: pin } })
        .then(
          function (resp) {
            if (resp && resp.code === 0 && resp.data && resp.data.unlocked) {
              state.privateUnlocked = true;
              state.pinDialogOpen = false;
              state.pinDialogError = "";
              renderAll();
            } else {
              state.pinDialogError =
                (resp && resp.data && resp.data.msg) || "PIN 不正确";
              renderAll();
            }
          },
          function (err) {
            state.pinDialogError = errorMessage(err);
            renderAll();
          },
        );
    }
  }

  function openMemoHistory(memoId) {
    state.historyRecordId = memoId;
    state.historyRecordType = "memo";
    state.historyVersions = [];
    state.historyLoading = true;
    state.historyError = "";
    state.historyPreviewContent = "";
    state.historyPreviewVersion = 0;
    state.restoringVersion = 0;
    state.historyInlineDiffs = {};
    state.historyExpandedDiffs = {};
    state.historyDiffLoading = {};
    state.historyOpen = true;
    renderHistoryDialog();
    loadMemoHistoryFromVault(memoId).then(
      function (data) {
        state.historyVersions = Array.isArray(data.versions)
          ? data.versions
          : [];
        state.historyLoading = false;
        loadAllHistoryDiffs(memoId, "memo");
        renderHistoryDialog();
      },
      function (err) {
        state.historyError = errorMessage(err);
        state.historyLoading = false;
        renderHistoryDialog();
      },
    );
  }

  function openCommentHistory(commentId) {
    state.historyRecordId = commentId;
    state.historyRecordType = "comment";
    state.historyVersions = [];
    state.historyLoading = true;
    state.historyError = "";
    state.historyPreviewContent = "";
    state.historyPreviewVersion = 0;
    state.restoringVersion = 0;
    state.historyInlineDiffs = {};
    state.historyExpandedDiffs = {};
    state.historyDiffLoading = {};
    state.historyOpen = true;
    renderHistoryDialog();
    loadCommentHistoryFromVault(commentId).then(
      function (data) {
        state.historyVersions = Array.isArray(data.versions)
          ? data.versions
          : [];
        state.historyLoading = false;
        loadAllHistoryDiffs(commentId, "comment");
        renderHistoryDialog();
      },
      function (err) {
        state.historyError = errorMessage(err);
        state.historyLoading = false;
        renderHistoryDialog();
      },
    );
  }

  function loadAllHistoryDiffs(recordId, recordType) {
    var versions = state.historyVersions;
    if (!versions.length) return;

    // Mark all versions as loading + expanded
    for (var i = 0; i < versions.length; i++) {
      state.historyExpandedDiffs[versions[i].version] = true;
      state.historyDiffLoading[versions[i].version] = true;
    }
    renderHistoryDialog();

    // Load base content (version 0) once, then replay contentOps locally
    var loadFn =
      recordType === "comment"
        ? loadCommentHistoryVersionFromVault
        : loadMemoHistoryVersionFromVault;
    loadFn(recordId, 0).then(
      function (data) {
        var baseContent = stripMemoFrontmatter(data.content || "");

        // Replay ops to build each version's content
        var versionContents = {};
        versionContents[0] = baseContent;
        var current = baseContent;
        for (var i = 0; i < versions.length; i++) {
          var v = versions[i];
          if (v.contentOps && v.contentOps.length) {
            current = applyContentOpsToString(current, v.contentOps);
          }
          versionContents[v.version] = current;
        }

        // Compute inline diffs for each version
        for (var j = 0; j < versions.length; j++) {
          var ver = versions[j].version;
          state.historyDiffLoading[ver] = false;
          state.historyInlineDiffs[ver] = createHistoryDiffSegments(
            versionContents[ver - 1] || "",
            versionContents[ver] || "",
          );
        }
        renderHistoryDialog();
      },
      function () {
        for (var j = 0; j < versions.length; j++) {
          state.historyDiffLoading[versions[j].version] = false;
        }
        state.historyError = "加载历史内容失败";
        renderHistoryDialog();
      },
    );
  }

  function closeHistoryDialog() {
    state.historyOpen = false;
    renderHistoryDialog();
  }

  function previewHistoryVersion(version) {
    var recordId = state.historyRecordId;
    var recordType = state.historyRecordType;
    var loadFn =
      recordType === "comment"
        ? loadCommentHistoryVersionFromVault
        : loadMemoHistoryVersionFromVault;
    state.historyPreviewVersion = version;
    state.historyPreviewContent = "加载中...";
    renderHistoryDialog();
    loadFn(recordId, version).then(
      function (data) {
        state.historyPreviewContent = data.content || "";
        renderHistoryDialog();
      },
      function (err) {
        state.historyPreviewContent = "加载失败: " + errorMessage(err);
        renderHistoryDialog();
      },
    );
  }

  function restoreHistoryVersion(version) {
    var recordId = state.historyRecordId;
    var recordType = state.historyRecordType;
    var restoreFn =
      recordType === "comment"
        ? restoreCommentHistoryVersionFromVault
        : restoreMemoHistoryVersionFromVault;
    state.restoringVersion = version;
    renderHistoryDialog();
    restoreFn(recordId, version).then(
      function (result) {
        state.restoringVersion = 0;
        state.historyOpen = false;
        renderHistoryDialog();
        if (recordType === "comment") {
          // Find the parent memo ID from the comments cache
          var parentMemo = state.memos.find(function (m) {
            var commentIds = (m.comments || []).map(function (c) {
              return c.id;
            });
            return commentIds.indexOf(recordId) >= 0;
          });
          if (parentMemo) {
            reloadMemoCommentsForMemo(parentMemo.id).then(function () {
              renderAll();
            });
          } else {
            refreshMemosFromVault();
          }
        } else {
          refreshMemosFromVault();
        }
      },
      function (err) {
        state.restoringVersion = 0;
        state.historyError = "回退失败: " + errorMessage(err);
        renderHistoryDialog();
      },
    );
  }

  function renderHistoryDialog() {
    var host = root.querySelector("[data-history-dialog-host]");
    if (!state.historyOpen) {
      if (host) {
        unmountTimelessView(host);
        host.remove();
      }
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-history-dialog-host", "true");
      host.setAttribute("data-n", "memo-history-dialog-host");
      root.appendChild(host);
      host.addEventListener("click", function (event) {
        var backdrop = closestElement(event.target, "[data-history-backdrop]");
        var close_button = closestElement(event.target, "[data-action]");
        if (
          (close_button &&
            close_button.dataset.action === "closeHistoryDialog") ||
          (backdrop && event.target === backdrop)
        ) {
          closeHistoryDialog();
        }
      });
    }
    renderTimelessView(
      host,
      HistoryDialogView(historyDialogPresentation(state)),
    );
  }

  function toggleHistoryDiff(version) {
    state.historyExpandedDiffs[version] = !state.historyExpandedDiffs[version];
    renderHistoryDialog();
  }

  function refreshStorageForRender() {
    refreshCloudStorageSettings().then(
      function () {
        renderAll();
      },
      function () {},
    );
  }

  function handleClick(event) {
    // Close reaction pickers on clicks outside reaction elements
    if (
      !event.target.closest(".memo-reactions-add-wrap, .memo-reactions-picker")
    ) {
      closeAllReactionPickers();
    }

    const searchResult = closestElement(
      event.target,
      "[data-memo-search-result]",
    );
    if (searchResult && root.contains(searchResult)) {
      openMemoSearchResult(searchResult.dataset.memoSearchResult || "");
      return;
    }

    if (event.target === els.memoSearchPalette) {
      closeMemoSearchPalette();
      return;
    }

    // PIN dialog handlers
    const pinBackdrop = closestElement(event.target, "[data-pin-backdrop]");
    if (pinBackdrop && event.target === pinBackdrop) {
      closePinDialog();
      return;
    }

    const cancelPin = closestElement(
      event.target,
      '[data-action="cancelPinDialog"]',
    );
    if (cancelPin && root.contains(cancelPin)) {
      closePinDialog();
      return;
    }

    const submitPin = closestElement(event.target, '[data-action="submitPin"]');
    if (submitPin && root.contains(submitPin)) {
      submitPinDialog();
      return;
    }

    const unlockOverlay = closestElement(
      event.target,
      '[data-action="unlockPrivate"]',
    );
    if (unlockOverlay && root.contains(unlockOverlay)) {
      openPinDialog();
      return;
    }

    const memoDialogAction = closestElement(
      event.target,
      "[data-memo-dialog-action]",
    );
    if (memoDialogAction && root.contains(memoDialogAction)) {
      event.preventDefault();
      runMemoDialogAction(memoDialogAction.dataset.memoDialogAction || "");
      return;
    }

    const memoDialog = closestElement(event.target, "[data-memo-dialog]");
    if (memoDialog && event.target === memoDialog) {
      if (!state.memoDialog || !state.memoDialog.saving) closeMemoDialog();
      return;
    }
    if (memoDialog && root.contains(memoDialog)) return;

    const command = closestElement(event.target, "[data-command]");
    if (command && root.contains(command)) {
      runComposerCommand(command.dataset.command);
      return;
    }

    const filter = closestElement(event.target, "[data-filter]");
    if (filter && root.contains(filter)) {
      state.activeView = "memos";
      state.activeProjectId = "";
      state.activeFilter = filter.dataset.filter;
      state.activeTag = "";
      smallCalendarModel.setSelectedDate("", { silent: true });
      renderAll();
      return;
    }

    const projectDetail = closestElement(event.target, "[data-project-detail]");
    if (projectDetail && root.contains(projectDetail)) {
      clearRetainedCompletedTasks();
      state.activeView = "project-detail";
      state.activeProjectId = projectDetail.dataset.projectDetail;
      state.activeFilter = "all";
      state.activeTag = "";
      state.editingId = "";
      state.editPreviewVisible = false;
      state.projectActiveTab = "memos";
      state.commentPreviewVisible = false;
      state.commentingMemoId = "";
      state.commentDraft = "";
      state.query = "";
      smallCalendarModel.setSelectedDate("", { silent: true });
      state.linksDomainFilter = "";
      els.searchInput.value = "";
      if (els.memoList.parentElement) els.memoList.parentElement.scrollTop = 0;
      renderAll();
      return;
    }

    const projectTab = closestElement(event.target, "[data-project-tab]");
    if (projectTab && root.contains(projectTab)) {
      state.projectActiveTab = projectTab.dataset.projectTab;
      if (els.memoList.parentElement) els.memoList.parentElement.scrollTop = 0;
      renderProjectDetail();
      return;
    }

    const view = closestElement(event.target, "[data-view]");
    if (view && root.contains(view)) {
      clearRetainedCompletedTasks();
      state.activeView = view.dataset.view;
      state.activeProjectId = "";
      state.activeFilter = "all";
      state.activeTag = "";
      state.editingId = "";
      state.editPreviewVisible = false;
      state.commentPreviewVisible = false;
      state.commentingMemoId = "";
      state.commentDraft = "";
      state.query = "";
      smallCalendarModel.setSelectedDate("", { silent: true });
      state.linksDomainFilter = "";
      els.searchInput.value = "";
      renderAll();
      return;
    }

    const taskFilter = closestElement(event.target, "[data-task-filter]");
    if (taskFilter && root.contains(taskFilter)) {
      clearRetainedCompletedTasks();
      state.taskFilter = normalizeTaskFilter(taskFilter.dataset.taskFilter);
      rememberTaskFilter(state.taskFilter);
      renderAll();
      return;
    }

    const tag = closestElement(event.target, "[data-tag]");
    if (tag && root.contains(tag)) {
      state.activeTag =
        state.activeTag === tag.dataset.tag ? "" : tag.dataset.tag;
      state.activeFilter = "all";
      smallCalendarModel.setSelectedDate("", { silent: true });
      renderAll();
      return;
    }

    const editorOpen = closestElement(event.target, "[data-editor-open]");
    if (editorOpen && root.contains(editorOpen)) {
      event.preventDefault();
      event.stopPropagation();
      openFileInSelectedEditor(editorOpen);
      return;
    }

    const imagePreview = closestElement(
      event.target,
      "[data-image-preview-src]",
    );
    if (imagePreview && root.contains(imagePreview)) {
      event.preventDefault();
      event.stopPropagation();
      openImagePreview(imagePreview);
      return;
    }

    const taskDetailTarget = closestElement(event.target, "[data-task-detail]");
    if (taskDetailTarget && root.contains(taskDetailTarget)) {
      event.preventDefault();
      event.stopPropagation();
      openInlineTaskDetail(taskDetailTarget);
      return;
    }

    const memoRefTarget = closestElement(
      event.target,
      "[data-memo-ref-target]",
    );
    if (memoRefTarget && root.contains(memoRefTarget)) {
      event.preventDefault();
      detachMemo(memoRefTarget.dataset.memoRefTarget);
      return;
    }

    const tocLine = closestElement(event.target, "[data-memo-toc-line]");
    if (tocLine && root.contains(tocLine)) {
      event.preventDefault();
      event.stopPropagation();
      scrollMemoTocLine(tocLine);
      return;
    }

    const action = closestElement(event.target, "[data-action]");
    if (!action || !root.contains(action)) return;

    const memoNode = closestElement(action, "[data-memo-id]");
    const memoId = memoNode ? memoNode.dataset.memoId : "";
    const commentNode = closestElement(action, "[data-comment-id]");
    const commentId = commentNode ? commentNode.dataset.commentId : "";
    const taskNode = closestElement(action, "[data-task-id]");
    const taskId = taskNode ? taskNode.dataset.taskId : "";
    const gtdItemNode = closestElement(action, "[data-gtd-item-id]");
    const gtdItemId = gtdItemNode ? gtdItemNode.dataset.gtdItemId : "";
    const gtdMilestoneNode = closestElement(action, "[data-gtd-milestone-id]");
    const gtdMilestoneId = gtdMilestoneNode
      ? gtdMilestoneNode.dataset.gtdMilestoneId
      : "";
    const projectId = action.dataset.projectId || "";
    if (closestElement(action, "[data-memo-more-menu]")) {
      memoCardMenuModel.close();
    }

    switch (action.dataset.action) {
      case "addTaskNote":
        addTaskNote(taskId);
        break;
      case "archiveMemo":
        updateMemo(memoId, { archived: true });
        break;
      case "cancelEdit":
        cancelEdit();
        break;
      case "cancelComment":
        cancelComment();
        break;
      case "cancelCommentEdit":
        cancelCommentEdit();
        break;
      case "clearFilters":
        state.activeFilter = "all";
        state.activeTag = "";
        state.activeProjectFilter = "all";
        state.composerProjectId = state.lastComposerProjectId || "";
        state.commentingMemoId = "";
        state.commentDraft = "";
        state.commentEditingId = "";
        state.commentEditDraft = "";
        state.replyToCommentId = "";
        state.commentEditPreviewVisible = false;
        state.commentPreviewVisible = false;
        state.editingId = "";
        state.editPreviewVisible = false;
        state.query = "";
        smallCalendarModel.setSelectedDate("", { silent: true });
        state.linksDomainFilter = "";
        codeBlocksModel.setShowAll(false);
        els.searchInput.value = "";
        clearTimeout(state._searchTimer);
        renderAll();
        break;
      case "filterLinksDomain":
        {
          const domain = action.dataset.domain || "";
          state.linksDomainFilter =
            state.linksDomainFilter === domain ? "" : domain;
          renderLinks();
        }
        break;
      case "removeLinksDomainChip":
        {
          const chipDomain = action.dataset.domain || "";
          if (chipDomain) {
            state.domainChips = state.domainChips.filter(function (d) {
              return d !== chipDomain;
            });
            saveDomainChips(state.domainChips);
            if (state.linksDomainFilter === chipDomain)
              state.linksDomainFilter = "";
            renderLinks();
          }
        }
        break;
      case "copyMemo":
        copyMemo(memoId);
        break;
      case "copyMemoRef":
        copyMemoRef(memoId);
        break;
      case "commentMemo":
        startComment(memoId);
        break;
      case "deleteComment":
        deleteComment(commentId);
        break;
      case "copyComment":
        copyComment(commentId);
        break;
      case "toggleCommentPreview":
        toggleCommentPreview(memoId);
        break;
      case "toggleCommentEditPreview":
        toggleCommentEditPreview(commentId);
        break;
      case "toggleMemoComments":
        toggleMemoComments(memoId);
        break;
      case "toggleComposerPreview":
        toggleComposerPreview();
        break;
      case "toggleEditPreview":
        toggleEditPreview(memoId);
        break;
      case "copyCodeBlock":
        copyCodeBlock(action);
        break;
      case "toggleCodeCollapse":
        toggleCodeCollapse(action);
        break;
      case "copyInlineLink":
        event.preventDefault();
        event.stopPropagation();
        copyInlineLinkFromAction(action, showToast);
        break;
      case "copyLink":
        event.preventDefault();
        event.stopPropagation();
        copyLink(action);
        break;
      case "fetchLinkTitle":
        event.preventDefault();
        event.stopPropagation();
        fetchLinkTitle(action);
        break;
      case "copyTaskRef":
        copyTaskRef(taskId);
        break;
      case "deleteTask":
        deleteExistingTask(taskId);
        break;
      case "editCompletedAt":
        editCompletedAtInline(action, taskId);
        break;
      case "editTask":
        openTaskEditDialog(taskId);
        break;
      case "triageGTDItem":
        updateExistingGTDItem(
          gtdItemId,
          { status: "triaged" },
          "已标记为已澄清",
        );
        break;
      case "waitGTDItem":
        updateExistingGTDItem(gtdItemId, { status: "waiting" }, "已标记为等待");
        break;
      case "closeGTDItem":
        closeExistingGTDItem(gtdItemId);
        break;
      case "deleteGTDItem":
        deleteExistingGTDItem(gtdItemId);
        break;
      case "activateGTDMilestone":
        updateExistingGTDMilestone(
          gtdMilestoneId,
          { status: "active" },
          "里程碑已开始",
        );
        break;
      case "completeGTDMilestone":
        updateExistingGTDMilestone(
          gtdMilestoneId,
          { status: "completed" },
          "里程碑已完成",
        );
        break;
      case "createMemo":
        createMemo();
        break;
      case "createTaskSubmit":
        createTaskFromForm(action.closest("[data-task-create-form]"));
        break;
      case "createGTDItemSubmit":
        createGTDItemFromForm(action.closest("[data-gtd-item-create-form]"));
        break;
      case "createGTDMilestoneSubmit":
        createGTDMilestoneFromForm(
          action.closest("[data-gtd-milestone-create-form]"),
        );
        break;
      case "createBoardSubmit":
        handleBoardCreateSubmit(action.closest("[data-board-create-form]"));
        break;
      case "addBoardTaskSubmit":
        handleBoardAddTaskSubmit(
          action.closest("[data-board-add-task-form]"),
          action.dataset.boardId || "",
        );
        break;
      case "clipboardAccept":
        acceptClipboardItem();
        break;
      case "clipboardDismiss":
        hideClipboardCard({ forceAppeared: true });
        break;
      case "clipboardRefresh":
        requestClipboardLatest();
        break;
      case "archiveProject":
        archiveProjectFromDetail(projectId);
        break;
      case "backToMemos":
        state.activeView = "memos";
        state.activeProjectId = "";
        renderAll();
        break;
      case "createProject":
        createProjectFromPrompt();
        break;
      case "editProject":
        editProjectFromDetail(projectId);
        break;
      case "deleteMemo":
        deleteMemo(memoId);
        break;
      case "detachMemo":
        detachMemo(memoId);
        break;
      case "editMemo":
        startEdit(memoId);
        break;
      case "detachMemoEdit":
        openEditMemoWindow(memoId);
        break;
      case "editComment":
        startCommentEdit(commentId);
        break;
      case "replyToComment":
        replyToComment(commentId);
        break;
      case "openCommentReplies":
        openCommentReplies(commentId);
        break;
      case "editMemoSource":
        {
          var sourceMemo = findMemo(memoId);
          if (sourceMemo) openSourceEditDialog(sourceMemo);
        }
        break;
      case "expandMemo":
        expandMemo(memoId, action);
        break;
      case "toggleMemoMore":
        memoCardMenuModel.toggle(memoId);
        break;
      case "toggleMemoToc":
        toggleMemoToc(memoId);
        break;
      case "openSettings":
        openSettings();
        break;
      case "openSlimMemos":
        openSlimMemos();
        break;
      case "openSlimGTD":
        openSlimGTD();
        break;
      case "openTimeline":
        openTimeline();
        break;
      case "openSourceMemo":
        openSourceMemo(
          action.dataset.sourceMemoId || memoId,
          action.dataset.sourceCommentId || "",
        );
        break;
      case "restoreMemo":
        updateMemo(memoId, { archived: false });
        break;
      case "selectBoard":
        {
          var boardId = action.dataset.boardId || "";
          if (boardId) selectBoard(boardId);
        }
        break;
      case "backToBoardList":
        backToBoardList();
        break;
      case "refreshBoard":
        {
          var refreshBid = action.dataset.boardId || "";
          refreshBoard(refreshBid)
            .then(function (count) {
              showToast(
                "已刷新看板" +
                  (count > 0 ? "，添加了 " + count + " 个任务" : ""),
              );
              refreshTasksFromVault().then(function () {
                renderAll();
              });
            })
            .catch(function (err) {
              showToast("刷新看板失败: " + errorMessage(err));
            });
        }
        break;
      case "deleteBoard":
        {
          var boardId = action.dataset.boardId || "";
          if (boardId) deleteExistingBoard(boardId);
        }
        break;
      case "showBoardPresets":
        showBoardPresets();
        break;
      case "closeBoardPresets":
        closeBoardPresets();
        break;
      case "createBoardFromPreset":
        createBoardFromPreset(parseInt(action.dataset.presetIndex, 10));
        break;
      case "createProjectBoard":
        {
          var boardProjectId = action.dataset.projectId || "";
          if (boardProjectId) showProjectBoardPresets(boardProjectId);
        }
        break;
      case "createProjectBoardFromPreset":
        createProjectBoardFromPreset(
          parseInt(action.dataset.presetIndex, 10),
          action.dataset.projectId || "",
        );
        break;
      case "closeProjectBoardPresets":
        closeProjectBoardPresets();
        break;
      case "openAddRuleDialog":
        openAddRuleDialog(action.dataset.boardId || "");
        break;
      case "closeRuleEditor":
        closeRuleEditor();
        break;
      case "editRule":
        editRule(action.dataset.boardId || "", action.dataset.ruleId || "");
        break;
      case "saveRule":
        {
          var ruleForm = closestElement(action, ".board-rule-editor-dialog");
          if (ruleForm) saveRule(ruleForm);
        }
        break;
      case "deleteRule":
        deleteRule(action.dataset.boardId || "", action.dataset.ruleId || "");
        break;
      case "moveRuleUp":
        moveRuleUp(action.dataset.boardId || "", action.dataset.ruleId || "");
        break;
      case "moveRuleDown":
        moveRuleDown(action.dataset.boardId || "", action.dataset.ruleId || "");
        break;
      case "addRuleCondition":
        {
          var condContainer = closestElement(action, "[data-rule-conditions]");
          if (condContainer) addRuleConditionRow(condContainer);
        }
        break;
      case "removeRuleCondition":
        {
          var condRow = closestElement(action, ".board-rule-condition-row");
          if (condRow) {
            unmountTimelessView(condRow);
            condRow.remove();
          }
        }
        break;
      case "addRuleAction":
        {
          var actContainer = closestElement(action, "[data-rule-actions]");
          if (actContainer) addRuleActionRow(actContainer);
        }
        break;
      case "removeRuleAction":
        {
          var actRow = closestElement(action, ".board-rule-action-row");
          if (actRow) {
            unmountTimelessView(actRow);
            actRow.remove();
          }
        }
        break;
      case "removeFromBoard":
        if (taskId) removeFromBoard(taskId);
        break;
      case "openMemoHistory":
        openMemoHistory(memoId);
        break;
      case "openCommentHistory":
        {
          const cn = closestElement(action, "[data-comment-id]");
          if (cn) openCommentHistory(cn.getAttribute("data-comment-id"));
        }
        break;
      case "closeHistoryDialog":
        closeHistoryDialog();
        break;
      case "previewHistoryVersion":
        previewHistoryVersion(parseInt(action.dataset.version, 10));
        break;
      case "restoreHistoryVersion":
        if (confirm("确定要回退到此版本？回退操作将创建一条新的版本记录。")) {
          restoreHistoryVersion(parseInt(action.dataset.version, 10));
        }
        break;
      case "toggleHistoryDiff":
        toggleHistoryDiff(parseInt(action.dataset.version, 10));
        break;
      case "saveEdit":
        saveEdit(memoId);
        break;
      case "saveComment":
        saveComment(memoId);
        break;
      case "saveCommentEdit":
        saveCommentEdit();
        break;
      case "sortMemos":
        state.sortDesc = !state.sortDesc;
        renderAll();
        break;
      case "togglePin":
        togglePin(memoId);
        break;
      case "toggleMemoReactions":
        toggleMemoReactions(event, memoId, action);
        break;
      case "pickMemoReaction":
        {
          var emoji = action.dataset.emoji;
          if (emoji) toggleMemoReaction(memoId, emoji);
        }
        break;
      case "toggleMemoReaction":
        {
          var emoji = action.dataset.emoji;
          if (emoji) toggleMemoReaction(memoId, emoji);
        }
        break;
      case "toggleCommentReactions":
        toggleCommentReactions(event, commentId, action);
        break;
      case "pickCommentReaction":
        {
          var emoji = action.dataset.emoji;
          if (emoji) toggleCommentReaction(commentId, emoji);
        }
        break;
      case "toggleCommentReaction":
        {
          var emoji = action.dataset.emoji;
          if (emoji) toggleCommentReaction(commentId, emoji);
        }
        break;
      default:
        break;
    }
  }

  function handleSubmit(event) {
    const taskForm = event.target.closest("[data-task-create-form]");
    if (taskForm && root.contains(taskForm)) {
      event.preventDefault();
      createTaskFromForm(taskForm);
      return;
    }

    const itemForm = event.target.closest("[data-gtd-item-create-form]");
    if (itemForm && root.contains(itemForm)) {
      event.preventDefault();
      createGTDItemFromForm(itemForm);
      return;
    }

    const milestoneForm = event.target.closest(
      "[data-gtd-milestone-create-form]",
    );
    if (milestoneForm && root.contains(milestoneForm)) {
      event.preventDefault();
      createGTDMilestoneFromForm(milestoneForm);
      return;
    }

    const boardCreateForm = event.target.closest("[data-board-create-form]");
    if (boardCreateForm && root.contains(boardCreateForm)) {
      event.preventDefault();
      handleBoardCreateSubmit(boardCreateForm);
      return;
    }

    const boardAddTaskForm = event.target.closest("[data-board-add-task-form]");
    if (boardAddTaskForm && root.contains(boardAddTaskForm)) {
      event.preventDefault();
      var boardNode = boardAddTaskForm.closest("[data-board-id]");
      var boardId = boardNode ? boardNode.dataset.boardId : "";
      handleBoardAddTaskSubmit(boardAddTaskForm, boardId);
      return;
    }
  }

  function bindGoMessages() {
    if (!window.onGoMessage) return;
    window.onGoMessage(function (payload) {
      if (!payload) return;
      if (payload.type === "main_window_focus") {
        state.clipboardForeground = true;
        requestClipboardLatest({ maxAgeMs: CLIPBOARD_FOREGROUND_MAX_AGE_MS });
      }
      if (payload.type === "edit_memo_request" && payload.memoId) {
        startEdit(payload.memoId);
      }
      if (payload.type === "memo_saved" && payload.memoId) {
        reloadMemoFromVault(payload.memoId)
          .then(function () {
            replaceMemoCardOnly(payload.memoId);
            refreshTasksFromVault({ render: false });
          })
          .catch(function () {});
      }
    });
  }

  function requestClipboardLatest(options = {}) {
    if (typeof invoke !== "function") return;
    const maxAgeMs = Number(options.maxAgeMs || 0);
    const url =
      maxAgeMs > 0
        ? "/api/clipboard/latest?maxAgeSeconds=" +
          encodeURIComponent(String(Math.ceil(maxAgeMs / 1000)))
        : "/api/clipboard/latest";
    invoke(url, { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0 || !resp.data) return;
        if (!resp.data.found) {
          state.clipboardItem = null;
          if (state.activeView === "clipboard") renderMainContent();
          renderViewButtons();
          return;
        }
        const item = normalizeClipboardItem(resp.data.item);
        if (!item || !item.id) return;
        state.clipboardItem = item;
        if (state.activeView === "clipboard") renderMainContent();
        renderViewButtons();
        if (maxAgeMs > 0 && resp.data.fresh === false) {
          hideClipboardCard({ forceAppeared: true });
          return;
        }
        if (isClipboardForeground()) showClipboardCard();
      },
      function () {},
    );
  }

  function normalizeClipboardItem(item) {
    if (!item || typeof item !== "object") return null;
    return {
      capturedAt: String(item.capturedAt || ""),
      changedAt: String(item.changedAt || ""),
      content: String(item.content || ""),
      contentBase64: String(item.contentBase64 || ""),
      dataURL: String(item.dataURL || ""),
      id: String(item.id || ""),
      mimeType: String(item.mimeType || ""),
      name: String(item.name || ""),
      rawType: String(item.rawType || ""),
      size: Number(item.size || 0),
      type: String(item.type || "text"),
    };
  }

  function showClipboardCard() {
    if (!state.clipboardItem || !els.clipboardCard) return;
    const itemId = String(state.clipboardItem.id || "");
    const sameActiveItem =
      (state.clipboardVisible || state.clipboardLeaving) &&
      itemId &&
      state.clipboardDisplayedId === itemId;
    if (itemId && state.clipboardLastAppearedId === itemId) return;
    if (sameActiveItem) {
      if (state.clipboardLeaving) {
        if (state.clipboardLeaveTimer) {
          window.clearTimeout(state.clipboardLeaveTimer);
          state.clipboardLeaveTimer = null;
        }
        state.clipboardLeaving = false;
        state.clipboardVisible = true;
        state.clipboardShownAt = Date.now();
        renderClipboardCard();
        scheduleClipboardAutoHide();
      }
      return;
    }

    state.clipboardDisplayedId = itemId;
    state.clipboardLastAppearedId = "";
    state.clipboardShownAt = Date.now();
    if (state.clipboardLeaveTimer) {
      window.clearTimeout(state.clipboardLeaveTimer);
      state.clipboardLeaveTimer = null;
    }
    state.clipboardLeaving = false;
    state.clipboardVisible = true;
    renderClipboardCard();
    scheduleClipboardAutoHide();
  }

  function scheduleClipboardAutoHide() {
    if (state.clipboardTimer) window.clearTimeout(state.clipboardTimer);
    state.clipboardTimer = window.setTimeout(function () {
      if (!state.clipboardWorking) hideClipboardCard();
    }, CLIPBOARD_AUTO_HIDE_MS);
  }

  function hideClipboardCard(options = {}) {
    if (state.clipboardTimer) {
      window.clearTimeout(state.clipboardTimer);
      state.clipboardTimer = null;
    }
    if (!state.clipboardVisible && !state.clipboardLeaving) {
      renderClipboardCard();
      return;
    }
    markClipboardAppearedIfReady(options);
    state.clipboardLeaving = true;
    renderClipboardCard();
    if (state.clipboardLeaveTimer)
      window.clearTimeout(state.clipboardLeaveTimer);
    state.clipboardLeaveTimer = window.setTimeout(function () {
      state.clipboardVisible = false;
      state.clipboardLeaving = false;
      state.clipboardLeaveTimer = null;
      renderClipboardCard();
    }, CLIPBOARD_EXIT_MS);
  }

  function markClipboardAppearedIfReady(options = {}) {
    const itemId = String(state.clipboardDisplayedId || "");
    if (!itemId) return;
    const visibleFor = Date.now() - Number(state.clipboardShownAt || 0);
    if (options.forceAppeared || visibleFor >= CLIPBOARD_MIN_VISIBLE_MS) {
      state.clipboardLastAppearedId = itemId;
    }
  }

  function renderClipboardCard() {
    if (!els.clipboardCard) return;
    if (
      (!state.clipboardVisible && !state.clipboardLeaving) ||
      !state.clipboardItem
    ) {
      els.clipboardCard.hidden = true;
      renderTimelessView(els.clipboardCard, null);
      return;
    }

    const item = state.clipboardItem;
    const meta = clipboardTypeLabel(item.type);
    const action = clipboardActionLabel(item.type);
    els.clipboardCard.hidden = false;
    els.clipboardCard.classList.toggle("is-leaving", state.clipboardLeaving);
    renderTimelessView(
      els.clipboardCard,
      ClipboardCardView({
        actionLabel: action,
        item,
        preview: compactText(item.content, 180),
        typeLabel: meta,
        working: state.clipboardWorking,
      }),
    );
  }

  function clipboardTypeLabel(type) {
    if (type === "link") return "链接";
    if (type === "image") return "图片";
    return "文本";
  }

  function clipboardActionLabel(type) {
    if (type === "link") return "保存链接";
    if (type === "image") return "上传文件";
    return "创建 memo";
  }

  function acceptClipboardItem() {
    const item = state.clipboardItem;
    if (!item || state.clipboardWorking) return;
    state.clipboardWorking = true;
    renderClipboardCard();
    if (state.activeView === "clipboard") renderClipboardView();

    let task;
    if (item.type === "image") {
      task = uploadClipboardImage(item);
    } else if (item.type === "link") {
      task = createMemoFromContent(item.content, "链接已保存");
    } else {
      task = createMemoFromContent(item.content, "已创建 memo");
    }

    task
      .then(
        function () {
          hideClipboardCard({ forceAppeared: true });
        },
        function (err) {
          showToast(errorMessage(err));
        },
      )
      .finally(function () {
        state.clipboardWorking = false;
        renderClipboardCard();
        if (state.activeView === "clipboard") renderClipboardView();
      });
  }

  function uploadClipboardImage(item) {
    if (!item.contentBase64 && !item.dataURL) {
      return Promise.reject(new Error("剪贴板图片为空"));
    }
    return fileInfoToUploadURL({
      name: item.name || "clipboard.png",
      type: item.mimeType || "image/png",
      url: item.dataURL || item.contentBase64,
    }).then(function (uploaded) {
      const name = uploaded.name || item.name || "clipboard.png";
      const url = uploaded.ref || uploaded.url || item.dataURL;
      const content = `![${name}](${url})`;
      return createMemoFromContent(content, "图片已上传并保存");
    });
  }

  function extractYamlFrontmatter(content) {
    var trimmed = String(content || "");
    // Match either ---\n...\n--- (standard YAML front matter) or ```yaml\n...\n``` (fenced block)
    var match =
      trimmed.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/) ||
      trimmed.match(/^```ya?ml\s*\r?\n([\s\S]*?)\r?\n```\s*\r?\n?/);
    if (!match) return { meta: {}, stripped: trimmed };
    var block = match[1];
    var meta = {};
    var lines = block.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;
      var colon = line.indexOf(":");
      if (colon < 0) continue;
      var key = line.slice(0, colon).trim();
      var value = line.slice(colon + 1).trim();
      // Remove surrounding quotes
      if (
        (value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'")
      ) {
        value = value.slice(1, -1);
      }
      meta[key] = value;
    }
    return { meta: meta, stripped: trimmed.slice(match[0].length) };
  }

  function applyYamlFrontmatterMeta(rawMeta) {
    var result = {};
    if (rawMeta.createdAt) {
      var ts = parseDisplayTime(rawMeta.createdAt);
      if (ts !== null) result.createdAt = new Date(ts).toISOString();
    }
    if (rawMeta.updatedAt) {
      var ts2 = parseDisplayTime(rawMeta.updatedAt);
      if (ts2 !== null) result.updatedAt = new Date(ts2).toISOString();
    }
    if (rawMeta.visibility) {
      var v = String(rawMeta.visibility).trim().toUpperCase();
      if (Object.prototype.hasOwnProperty.call(VISIBILITY, v)) {
        result.visibility = v;
      }
    }
    if (rawMeta.private !== undefined) {
      result.private = String(rawMeta.private).trim().toLowerCase() === "true";
    }
    if (rawMeta.pinned !== undefined) {
      result.pinned = String(rawMeta.pinned).trim().toLowerCase() === "true";
    }
    if (rawMeta.archived !== undefined) {
      result.archived =
        String(rawMeta.archived).trim().toLowerCase() === "true";
    }
    if (rawMeta.projectId !== undefined) {
      result.projectId = normalizeProjectID(rawMeta.projectId);
    }
    if (rawMeta.kind !== undefined) {
      result.kind = String(rawMeta.kind).trim();
    }
    if (rawMeta.taskId !== undefined) {
      result.taskId = String(rawMeta.taskId).trim();
    }
    if (rawMeta.alias !== undefined) {
      result.alias = String(rawMeta.alias).trim();
    }
    return result;
  }

  function createMemoFromContent(content, successMessage) {
    const text = String(content || "").trim();
    if (!text) return Promise.reject(new Error("剪贴板内容为空"));

    var yamlResult = extractYamlFrontmatter(text);
    var yamlMeta = applyYamlFrontmatterMeta(yamlResult.meta);
    var contentWithoutYaml = yamlResult.stripped;

    const projectRef = extractProjectDirective(contentWithoutYaml);
    const resolveProject = projectRef
      ? resolveOrCreateProjectByName(projectRef)
      : Promise.resolve(null);

    return resolveProject
      .then(function (resolvedProjectId) {
        var finalContent = projectRef
          ? stripProjectDirective(contentWithoutYaml)
          : contentWithoutYaml;
        var finalProjectId =
          yamlMeta.projectId || resolvedProjectId || state.composerProjectId;
        var visibility = yamlMeta.visibility || state.visibility;
        var isSecret = visibility === "SECRET";
        var storedVisibility = isSecret ? "PRIVATE" : visibility;
        var meta = {
          createdAt: yamlMeta.createdAt,
          updatedAt: yamlMeta.updatedAt,
          pinned: yamlMeta.pinned,
          kind: yamlMeta.kind,
          taskId: yamlMeta.taskId,
          archived: yamlMeta.archived,
          alias: yamlMeta.alias,
        };
        if (yamlMeta.private !== undefined) {
          meta.private = yamlMeta.private;
        }
        return createMemoInVault(
          finalContent,
          storedVisibility,
          finalProjectId,
          isSecret,
          meta,
        );
      })
      .then(function (memo) {
        const normalized = normalizeMemoPayload(memo);
        if (!normalized) throw new Error("创建 memo 失败");
        state.memos = [normalized].concat(state.memos);
        saveMemos(state.memos);
        rememberComposerProject(state.composerProjectId);
        state.activeView = "memos";
        state.activeFilter = "all";
        state.activeTag = "";
        smallCalendarModel.setSelectedDate("", { silent: true });
        state.visibility = DEFAULT_VISIBILITY;
        renderAll();
        refreshTasksFromVault();
        showToast(successMessage || "已保存");
        return normalized;
      });
  }

  function openFileInSelectedEditor(button) {
    const file = button.dataset.editorFile || "";
    const label =
      button.dataset.editorLabel || button.dataset.editorAppName || "编辑器";
    if (!file) {
      showToast("没有可打开的本地文件");
      return;
    }
    if (typeof invoke !== "function") {
      showToast("当前环境不支持打开 " + label);
      return;
    }

    const line = button.dataset.editorLine || "1";
    const col = button.dataset.editorCol || "1";
    const appId = button.dataset.editorAppId || "";
    const appName = button.dataset.editorAppName || "";
    const appPath = button.dataset.editorAppPath || "";
    let url =
      "/api/editor/open?file=" +
      encodeURIComponent(file) +
      "&line=" +
      encodeURIComponent(line) +
      "&col=" +
      encodeURIComponent(col);
    if (appId) url += "&app=" + encodeURIComponent(appId);
    if (appName) url += "&appName=" + encodeURIComponent(appName);
    if (appPath) url += "&appPath=" + encodeURIComponent(appPath);
    button.disabled = true;
    invoke(url, { method: "GET" })
      .then(
        function (resp) {
          if (!resp || resp.code !== 0) {
            showToast((resp && resp.msg) || "打开 " + label + " 失败");
            return;
          }
          showToast("已在 " + label + " 中打开");
        },
        function (err) {
          showToast("打开 " + label + " 失败: " + err);
        },
      )
      .finally(function () {
        button.disabled = false;
      });
  }

  function confirmOpenExternalLink(url) {
    openExternalLinkInDefaultBrowser(url);
  }

  function openExternalLinkInDefaultBrowser(url) {
    if (typeof invoke !== "function") {
      window.open(url, "_blank", "noopener");
      return;
    }

    invoke("/api/external/open?url=" + encodeURIComponent(url), {
      method: "GET",
    }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开链接失败");
        }
      },
      function (err) {
        showToast("打开链接失败: " + err);
      },
    );
  }

  function openImagePreview(element) {
    openImagePreviewFromElement(element).catch(function (err) {
      showToast("打开图片预览失败: " + errorMessage(err));
    });
  }

  function openFileBrowserItem(item, element) {
    if (item.kind === "image" && element && element.dataset.previewSrc) {
      openImagePreview(element);
      return;
    }

    const href = String((element && element.dataset.fileHref) || "").trim();
    if (!href || href === "#") {
      showToast("当前文件无法查看");
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      openExternalLinkInDefaultBrowser(href);
      return;
    }
    window.open(href, "_blank", "noopener");
  }

  function openFileBrowserSource(item) {
    openSourceMemo(item.memoId, item.sourceCommentId);
  }

  function copyFileBrowserURL(item) {
    copyText(item.url).then(
      function () {
        showToast("已复制文件地址");
      },
      function () {
        showToast("复制文件地址失败");
      },
    );
  }

  function openSettings() {
    if (typeof invoke !== "function") {
      window.open("settings.html");
      return;
    }
    invoke("/api/open_window?pathname=%2Fsettings", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开设置失败");
        }
      },
      function (err) {
        showToast("打开设置失败: " + err);
      },
    );
  }

  function openSlimMemos() {
    if (typeof invoke !== "function") {
      window.open("memo-slim.html", "_blank", "noopener");
      return;
    }

    invoke("/api/open_window?pathname=%2Fmemo-slim", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开精简版失败");
          return;
        }
        invoke("__velo/window/close", { args: {} }).catch(function () {
          window.close();
        });
      },
      function (err) {
        showToast("打开精简版失败: " + err);
      },
    );
  }

  function openSlimGTD() {
    if (typeof invoke !== "function") {
      window.open("gtd-slim.html", "_blank", "noopener");
      return;
    }

    invoke("/api/open_window?pathname=%2Fgtd-slim", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开精简代办失败");
          return;
        }
        showToast("已打开精简代办");
      },
      function (err) {
        showToast("打开精简代办失败: " + err);
      },
    );
  }

  function openTimeline() {
    if (typeof invoke !== "function") {
      window.open("timeline-window.html", "_blank", "noopener");
      return;
    }

    invoke("/api/open_window?pathname=%2Ftimeline", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开时间线失败");
          return;
        }
        showToast("已打开时间线");
      },
      function (err) {
        showToast("打开时间线失败: " + err);
      },
    );
  }

  function detachMemo(memoId, searchContext) {
    const memo = findMemo(memoId);
    if (!memo) return;

    writeMemoQuickSearchOpenContext(
      globalThis.localStorage,
      memo.id,
      searchContext,
    );

    if (typeof invoke !== "function") {
      window.open(
        "memo-window.html?id=" + encodeURIComponent(memo.id),
        "_blank",
        "noopener",
      );
      return;
    }

    invoke("/api/memo-window/open", {
      method: "POST",
      args: {
        memo: memo,
        memos: state.memos,
      },
    }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "分离 memo 失败");
          return;
        }
        showToast("已分离为独立窗口");
      },
      function (err) {
        showToast("分离 memo 失败: " + err);
      },
    );
  }

  function openMemoSearchPalette() {
    syncMemoQuickSearchSources();
    memoQuickSearchModel.open();
    renderMemoSearchPalette();
    window.requestAnimationFrame(function () {
      if (!els.memoSearchInput) return;
      els.memoSearchInput.focus();
      els.memoSearchInput.select();
    });
  }

  function closeMemoSearchPalette() {
    memoQuickSearchModel.close();
    renderMemoSearchPalette();
  }

  function openMemoSearchResult(resultKey) {
    if (!memoQuickSearchModel.activateByKey(resultKey))
      showToast("找不到搜索结果");
  }

  function renderMemoSearchPalette() {
    if (!els.memoSearchPalette) return;
    const snapshot = memoQuickSearchModel.snapshot();
    els.memoSearchPalette.hidden = !snapshot.open;
    if (!snapshot.open) return;

    if (
      els.memoSearchInput &&
      els.memoSearchInput.value.trim() !== snapshot.query
    ) {
      els.memoSearchInput.value = snapshot.query;
    }

    const results = snapshot.results;
    if (!els.memoSearchResults) return;
    renderTimelessView(
      els.memoSearchResults,
      MemoSearchResultsView({
        activeIndex: snapshot.activeIndex,
        results,
      }),
    );

    const active = els.memoSearchResults.querySelector(
      ".memo-command-result.is-active",
    );
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function syncMemoQuickSearchSources() {
    memoQuickSearchModel.setSources({
      comments: state.comments,
      memos: state.memos,
      projects: state.projects,
    });
  }

  function memoQuickSearchPartsHTML(parts) {
    return (Array.isArray(parts) ? parts : [])
      .map(function (part) {
        const text = escapeHTML(part && part.text);
        return part && part.matched
          ? '<mark class="memo-command-match">' + text + "</mark>"
          : text;
      })
      .join("");
  }

  function openMemoSearchShortcut() {
    try {
      const settings =
        JSON.parse(localStorage.getItem(SHORTCUTS_STORAGE_KEY) || "null") || {};
      if (settings.enabled === false) return "";
      return normalizeShortcut(settings.openMemoSearch) || "Ctrl+O";
    } catch (_) {
      return "Ctrl+O";
    }
  }

  function matchesShortcut(event, shortcut) {
    if (!shortcut) return false;
    const parts = shortcut.split("+");
    const key = parts.pop();
    const wanted = {
      alt: parts.includes("Alt"),
      ctrl: parts.includes("Ctrl"),
      meta: parts.includes("Meta"),
      shift: parts.includes("Shift"),
    };
    if (Boolean(event.altKey) !== wanted.alt) return false;
    if (Boolean(event.ctrlKey) !== wanted.ctrl) return false;
    if (Boolean(event.metaKey) !== wanted.meta) return false;
    if (Boolean(event.shiftKey) !== wanted.shift) return false;
    return shortcutKeyName(event.key) === key;
  }

  function normalizeShortcut(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parts = raw
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return "";
    const modifiers = [];
    let key = "";
    parts.forEach(function (part) {
      const lower = part.toLowerCase();
      if (lower === "ctrl" || lower === "control") {
        if (!modifiers.includes("Ctrl")) modifiers.push("Ctrl");
      } else if (lower === "alt" || lower === "option") {
        if (!modifiers.includes("Alt")) modifiers.push("Alt");
      } else if (lower === "shift") {
        if (!modifiers.includes("Shift")) modifiers.push("Shift");
      } else if (lower === "meta" || lower === "cmd" || lower === "command") {
        if (!modifiers.includes("Meta")) modifiers.push("Meta");
      } else {
        key = shortcutKeyName(part);
      }
    });
    if (!key) return "";
    if (!modifiers.length && key.length === 1) return "";
    return modifiers.concat(key).join("+");
  }

  function shortcutKeyName(key) {
    const original = String(key || "");
    if (original === " ") return "Space";
    const value = original.trim();
    if (!value) return "";
    const lower = value.toLowerCase();
    if (
      lower === "control" ||
      lower === "shift" ||
      lower === "alt" ||
      lower === "meta"
    )
      return "";
    if (lower === "escape" || lower === "esc") return "Esc";
    if (lower === "arrowup") return "Up";
    if (lower === "arrowdown") return "Down";
    if (lower === "arrowleft") return "Left";
    if (lower === "arrowright") return "Right";
    if (value.length === 1) return value.toUpperCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function focusMemo(memoId, options = {}) {
    const memo = findMemo(memoId);
    if (!memo) {
      showToast("找不到引用的 memo");
      return;
    }
    const commentId = String(options.commentId || "").trim();
    if (commentId) state.expandedCommentListMemoIds.add(memo.id);

    state.activeView = "memos";
    state.activeFilter = memo.archived ? "archive" : "all";
    state.activeTag = "";
    state.activeProjectFilter = "all";
    state.editingId = "";
    state.editPreviewVisible = false;
    state.query = "";
    smallCalendarModel.setSelectedDate("", { silent: true });
    els.searchInput.value = "";
    renderAll();

    window.requestAnimationFrame(function () {
      const target = commentId
        ? els.memoList.querySelector(
            `[data-comment-id="${escapeCSSIdent(commentId)}"]`,
          )
        : els.memoList.querySelector(
            `[data-memo-id="${escapeCSSIdent(memoId)}"]`,
          );
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("is-highlighted");
      if (state.highlightTimer) window.clearTimeout(state.highlightTimer);
      state.highlightTimer = window.setTimeout(function () {
        target.classList.remove("is-highlighted");
        state.highlightTimer = null;
      }, 1500);
    });
  }

  function openSourceMemo(memoId, commentId = "") {
    const memo = findMemo(memoId);
    if (!memo) {
      showToast("找不到引用的 memo");
      return;
    }
    renderSourceMemoDialog(memo);
  }

  function renderSourceMemoDialog(memo) {
    closeSourceMemoDialog();
    const overlay = document.createElement("div");
    overlay.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    overlay.setAttribute("data-source-memo-dialog", "");
    overlay.setAttribute("data-n", "source-memo-dialog-host");
    const context = memoRenderContext(memo.id, { showLineNumbers: false });
    let html = "";
    try {
      html = renderMemoMarkdown(memo.content, context);
    } catch (_) {
      html = `<p>${escapeHTML(memo.content || "")}</p>`;
    }
    renderTimelessView(overlay, SourceMemoDialogView({ html }));
    root.appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeSourceMemoDialog();
      const closeBtn = closestElement(
        event.target,
        "[data-source-memo-dialog-close]",
      );
      if (closeBtn) closeSourceMemoDialog();
    });

    overlay.addEventListener("change", function (event) {
      if (!event.target.matches("[data-task-line]")) return;
      const memoId = event.target.dataset.taskSourceMemoId;
      const lineIndex = Number(event.target.dataset.taskLine);
      if (!memoId || Number.isNaN(lineIndex)) return;
      const checked = event.target.checked;
      // Update memo content directly without triggering full re-render
      syncSourceMemoTaskLine(memoId, lineIndex, checked);
      var linkedTask = findLinkedTask(memoId, "", lineIndex + 1);
      if (linkedTask) {
        completeLinkedTaskFromSource(linkedTask, checked);
      }
    });
  }

  function closeSourceMemoDialog() {
    const existing = root.querySelector("[data-source-memo-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
  }

  function selectProjectFilter(value) {
    const next = normalizeProjectFilter(value);
    clearRetainedCompletedTasks();
    state.activeView = "memos";
    state.activeProjectId = "";
    state.activeProjectFilter = next;
    state.activeTag = "";
    smallCalendarModel.setSelectedDate("", { silent: true });
    if (next === "unassigned") {
      state.composerProjectId = "";
    } else if (next !== "all") {
      state.composerProjectId = next;
      rememberComposerProject(next);
    } else {
      state.composerProjectId = state.lastComposerProjectId || "";
    }
    renderAll();
  }

  function rememberComposerProject(projectId) {
    state.lastComposerProjectId = projectId || "";
    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, state.lastComposerProjectId);
  }

  function resolveOrCreateProjectByName(name) {
    const existing = state.projects.find((p) => !p.archived && p.name === name);
    if (existing) return Promise.resolve(existing.id);
    return createProjectInVault(name).then(function (project) {
      const normalized = normalizeProjectPayload(project);
      if (!normalized) return "";
      state.projects = state.projects.concat(normalized);
      saveProjects(state.projects);
      renderProjects();
      return normalized.id;
    });
  }

  function handleInput(event) {
    if (event.target.matches("[data-memo-search-input]")) {
      memoQuickSearchModel.setQuery(event.target.value);
      renderMemoSearchPalette();
      return;
    }

    if (
      event.target.matches("[data-search-input], [data-project-memo-search]")
    ) {
      state.query = event.target.value.trim();
      clearTimeout(state._searchTimer);
      state._searchTimer = setTimeout(() => renderAll(), 200);
      return;
    }

    if (event.target.matches('[data-action="filterLinksDomainInput"]')) {
      state.linksDomainFilter = event.target.value.trim();
      clearTimeout(state._linksDomainTimer);
      state._linksDomainTimer = setTimeout(() => renderLinks(), 300);
      return;
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && memoCardMenuModel.state.openMemoId) {
      const memoId = memoCardMenuModel.state.openMemoId;
      memoCardMenuModel.close();
      const trigger = Array.from(root.querySelectorAll("[data-memo-more]"))
        .find((element) => element.dataset.memoId === memoId)
        ?.querySelector('[data-action="toggleMemoMore"]');
      trigger?.focus();
      event.preventDefault();
      return;
    }
    if (
      event.key === "Escape" &&
      root.querySelector("[data-reactions-picker]:not([hidden])")
    ) {
      closeAllReactionPickers();
      return;
    }
    if (
      root.querySelector("[data-inline-task-detail-dialog]") &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      closeInlineTaskDetailDialog();
      return;
    }
    if (
      root.querySelector("[data-source-memo-dialog]") &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      closeSourceMemoDialog();
      return;
    }
    if (
      root.querySelector("[data-task-edit-dialog]") &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      closeTaskEditDialog();
      return;
    }
    if (state.memoDialog && event.key === "Escape") {
      const editorHost = closestElement(
        event.target,
        "[data-memo-dialog-editor-host]",
      );
      if (!editorHost && !state.memoDialog.saving) {
        event.preventDefault();
        closeMemoDialog();
        return;
      }
    }

    if (memoQuickSearchModel.snapshot().open) {
      handleMemoSearchKeydown(event);
      return;
    }

    if (
      event.key === "Enter" &&
      event.target.matches('[data-action="addLinksDomainChip"]')
    ) {
      event.preventDefault();
      addDomainChip(event.target.value.trim());
      event.target.value = "";
      return;
    }

    if (event.key === "Enter") {
      const task_create = closestElement(
        event.target,
        "[data-task-create-form]",
      );
      const item_create = closestElement(
        event.target,
        "[data-gtd-item-create-form]",
      );
      const milestone_create = closestElement(
        event.target,
        "[data-gtd-milestone-create-form]",
      );
      const board_create = closestElement(
        event.target,
        "[data-board-create-form]",
      );
      const board_task_create = closestElement(
        event.target,
        "[data-board-add-task-form]",
      );
      if (
        task_create ||
        item_create ||
        milestone_create ||
        board_create ||
        board_task_create
      ) {
        event.preventDefault();
        if (task_create) createTaskFromForm(task_create);
        else if (item_create) createGTDItemFromForm(item_create);
        else if (milestone_create) createGTDMilestoneFromForm(milestone_create);
        else if (board_create) handleBoardCreateSubmit(board_create);
        else {
          const board_node = board_task_create.closest("[data-board-id]");
          handleBoardAddTaskSubmit(
            board_task_create,
            board_node?.dataset.boardId || "",
          );
        }
        return;
      }
    }

    if (event.key === "Enter" || event.key === " ") {
      const imagePreview = closestElement(
        event.target,
        "[data-image-preview-src]",
      );
      if (imagePreview && root.contains(imagePreview)) {
        event.preventDefault();
        openImagePreview(imagePreview);
        return;
      }
    }

    if (!matchesShortcut(event, openMemoSearchShortcut())) return;
    event.preventDefault();
    event.stopPropagation();
    openMemoSearchPalette();
  }

  function handleMemoSearchKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMemoSearchPalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      memoQuickSearchModel.moveActive(1);
      renderMemoSearchPalette();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      memoQuickSearchModel.moveActive(-1);
      renderMemoSearchPalette();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      memoQuickSearchModel.activateActive();
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-code-blocks-show-all]")) {
      codeBlocksModel.setShowAll(event.target.checked);
      if (els.memoList.parentElement) els.memoList.parentElement.scrollTop = 0;
      renderCodeBlocks();
      return;
    }

    if (event.target.matches("[data-visibility-select]")) {
      state.visibility = event.target.value;
      return;
    }

    if (event.target.matches("[data-comment-visibility-select]")) {
      state.commentVisibility = event.target.value;
      return;
    }

    if (event.target.matches("[data-project-select]")) {
      state.composerProjectId = normalizeProjectID(event.target.value);
      rememberComposerProject(state.composerProjectId);
      renderComposerProjectSelect();
      return;
    }

    if (event.target.matches("[data-project-filter-select]")) {
      selectProjectFilter(event.target.value || "all");
      return;
    }

    if (event.target.matches("[data-edit-visibility]")) {
      state.editVisibility = event.target.value;
      return;
    }

    if (event.target.matches("[data-edit-project]")) {
      state.editProjectId = normalizeProjectID(event.target.value);
      return;
    }

    if (
      event.target.matches("[data-memo-dialog-project]") &&
      state.memoDialog
    ) {
      state.memoDialog.projectId = normalizeProjectID(event.target.value);
      return;
    }

    if (
      event.target.matches("[data-memo-dialog-visibility]") &&
      state.memoDialog
    ) {
      state.memoDialog.visibility = event.target.value || DEFAULT_VISIBILITY;
      return;
    }

    const memoDialog = closestElement(event.target, "[data-memo-dialog]");
    if (memoDialog && root.contains(memoDialog)) return;

    if (event.target.matches("[data-task-line]")) {
      const commentNode = closestElement(event.target, "[data-comment-id]");
      if (commentNode) {
        toggleCommentTask(
          commentNode.dataset.commentId,
          Number(event.target.dataset.taskLine),
          event.target.checked,
        );
        return;
      }
      const memoNode = closestElement(event.target, "[data-memo-id]");
      if (!memoNode) return;
      toggleTask(
        memoNode.dataset.memoId,
        Number(event.target.dataset.taskLine),
        event.target.checked,
      );
      return;
    }

    if (event.target.matches("[data-task-complete]")) {
      const taskNode = closestElement(event.target, "[data-task-id]");
      if (!taskNode) return;
      toggleExistingTaskCompletion(taskNode.dataset.taskId, event.target);
      return;
    }

    if (event.target.matches("[data-board-card-complete]")) {
      const card = closestElement(event.target, ".memo-board-card");
      if (!card) return;
      const checkbox = event.target;
      const checked = checkbox.checked;
      const taskId = card.dataset.taskId;
      const boardId = card.dataset.boardId;
      if (!taskId || !boardId) return;
      var board = findBoard(boardId);
      if (!board) return;
      checkbox.disabled = true;
      if (checked) {
        // Complete task → evaluate task.statusChanged rules → moveToColumn handles the rest
        completeTask(taskId)
          .then(function (task) {
            var statusPatch = evaluateBoardRules(
              "task.statusChanged",
              task,
              null,
              board,
              null,
              "completed",
            );
            var patch = statusPatch || {};
            return updateTask(taskId, patch);
          })
          .then(function () {
            refreshTasksFromVault().then(function () {
              renderAll();
            });
          })
          .catch(function (err) {
            setCheckboxControlValue(checkbox, !checked);
            checkbox.disabled = false;
            showToast("操作失败: " + errorMessage(err));
          });
      } else {
        updateTask(taskId, { status: "open" })
          .then(function () {
            refreshTasksFromVault().then(function () {
              renderAll();
            });
          })
          .catch(function (err) {
            setCheckboxControlValue(checkbox, !checked);
            checkbox.disabled = false;
            showToast("操作失败: " + errorMessage(err));
          });
      }
      return;
    }

    if (event.target.matches("[data-gtd-item-complete]")) {
      const itemNode = closestElement(event.target, "[data-gtd-item-id]");
      if (!itemNode) return;
      toggleExistingGTDItemCompletion(itemNode.dataset.gtdItemId, event.target);
      return;
    }

    if (event.target.matches("[data-rule-toggle]")) {
      toggleRuleEnabled(
        event.target.dataset.boardId || "",
        event.target.dataset.ruleId || "",
      );
      return;
    }

    if (event.target.matches("[data-attach-input]")) {
      insertFiles(event.target.files);
      event.target.value = "";
    }
  }

  function runComposerCommand(command) {
    if (!composerEditor) return;

    const commands = {
      attach() {
        requestFilesForComposer("");
      },
      bold() {
        composerEditor.wrap("**", "**", "加粗文本");
      },
      checklist() {
        composerEditor.insertBlock("- [ ] ");
      },
      code() {
        composerEditor.wrap("`", "`", "code");
      },
      date() {
        composerEditor.insertText(formatDateTime(new Date()));
      },
      image() {
        requestFilesForComposer("image/*");
      },
      italic() {
        composerEditor.wrap("*", "*", "斜体文本");
      },
      link() {
        composerEditor.wrap("[", "](https://)", "链接文本");
      },
      list() {
        composerEditor.insertBlock("- ");
      },
      tag() {
        composerEditor.insertText("#");
      },
    };

    if (commands[command]) commands[command]();
    composerEditor.focus();
  }

  function toggleComposerPreview() {
    state.composerPreviewVisible = !state.composerPreviewVisible;
    renderComposerPreview();
    if (!state.composerPreviewVisible && composerEditor) composerEditor.focus();
  }

  function toggleEditPreview(memoId) {
    if (!memoId || state.editingId !== memoId) return;
    syncEditDraftFromEditor();
    state.editPreviewVisible = !state.editPreviewVisible;
    renderEditPreview(memoId);
    if (!state.editPreviewVisible && editEditor) editEditor.focus();
  }

  function toggleCommentPreview(memoId) {
    if (!memoId || state.commentingMemoId !== memoId) return;
    syncCommentDraftFromEditor();
    state.commentPreviewVisible = !state.commentPreviewVisible;
    renderCommentPreview(memoId);
    if (!state.commentPreviewVisible && commentEditor) commentEditor.focus();
  }

  function toggleCommentEditPreview(commentId) {
    if (!commentId || state.commentEditingId !== commentId) return;
    syncCommentEditDraftFromEditor();
    state.commentEditPreviewVisible = !state.commentEditPreviewVisible;
    renderCommentEditPreview(commentId);
    if (!state.commentEditPreviewVisible && commentEditEditor)
      commentEditEditor.focus();
  }

  function renderEditablePreviews() {
    renderComposerPreview();
    if (state.editingId) renderEditPreview(state.editingId);
    if (state.commentingMemoId) renderCommentPreview(state.commentingMemoId);
    if (state.commentEditingId)
      renderCommentEditPreview(state.commentEditingId);
  }

  function renderComposerPreview() {
    const content = composerEditor ? composerEditor.getText() : "";
    renderEditorPreviewPanel(
      root.querySelector("[data-composer-preview]"),
      root.querySelector('[data-action="toggleComposerPreview"]'),
      state.composerPreviewVisible,
      content,
      memoRenderContext("", { readonly: true }),
    );
  }

  function renderEditPreview(memoId) {
    const content = editEditor ? editEditor.getText() : state.editDraft;
    renderEditorPreviewPanel(
      els.memoList.querySelector("[data-edit-preview]"),
      els.memoList.querySelector('[data-action="toggleEditPreview"]'),
      state.editPreviewVisible,
      content,
      memoRenderContext(memoId, { readonly: true }),
    );
  }

  function renderCommentPreview(memoId) {
    const content = commentEditor
      ? commentEditor.getText()
      : state.commentDraft;
    renderEditorPreviewPanel(
      els.memoList.querySelector("[data-comment-preview]"),
      els.memoList.querySelector('[data-action="toggleCommentPreview"]'),
      state.commentPreviewVisible,
      content,
      memoRenderContext(memoId, { readonly: true, showLineNumbers: false }),
    );
  }

  function renderCommentEditPreview(commentId) {
    const comment = findComment(commentId);
    const content = commentEditEditor
      ? commentEditEditor.getText()
      : state.commentEditDraft;
    renderEditorPreviewPanel(
      els.memoList.querySelector("[data-comment-edit-preview]"),
      els.memoList.querySelector('[data-action="toggleCommentEditPreview"]'),
      state.commentEditPreviewVisible,
      content,
      memoRenderContext(comment && comment.memoId, {
        readonly: true,
        showLineNumbers: false,
      }),
    );
  }

  function renderEditorPreviewPanel(panel, button, visible, content, context) {
    updateEditorPreviewButton(button, visible);
    if (!panel) return;
    const switcher = closestElement(panel, ".memo-editor-switch");
    const host =
      switcher && switcher.querySelector("[data-editor-switch-host]");
    if (host) host.hidden = visible;
    panel.hidden = !visible;
    panel.classList.toggle("is-visible", visible);
    if (!visible) {
      renderTimelessView(panel, null);
      return;
    }
    renderTimelessView(
      panel,
      EditorPreviewView({
        html: editorPreviewHTML(content, context),
        meaning: "memo-editor-preview",
      }),
    );
  }

  function updateEditorPreviewButton(button, visible) {
    if (!button) return;
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.title = visible ? "编辑" : "预览";
    button.setAttribute("aria-label", visible ? "编辑" : "预览");
    const label = button.querySelector("span");
    if (label) label.textContent = visible ? "编辑" : "预览";
  }

  function editorPreviewHTML(content, context) {
    const text = String(content || "");
    if (!text.trim()) return "";
    try {
      return renderMemoMarkdown(text, context || {});
    } catch (err) {
      return `<p>${escapeHTML(text)}</p>`;
    }
  }

  function createMemo(options = {}) {
    if (state.saving)
      return Promise.resolve({ ok: false, message: "正在保存" });
    const content = composerEditor.getText();
    if (!content.trim()) {
      showToast("先写点内容");
      composerEditor.focus();
      return Promise.resolve({ ok: false, message: "先写点内容" });
    }

    state.saving = true;
    renderComposerStatus(content);

    var yamlResult = extractYamlFrontmatter(content);
    var yamlMeta = applyYamlFrontmatterMeta(yamlResult.meta);
    var contentWithoutYaml = yamlResult.stripped;

    const projectRef = extractProjectDirective(contentWithoutYaml);
    const resolveProject = projectRef
      ? resolveOrCreateProjectByName(projectRef)
      : Promise.resolve(null);

    return resolveProject
      .then(function (resolvedProjectId) {
        var finalContent = projectRef
          ? stripProjectDirective(contentWithoutYaml)
          : contentWithoutYaml;
        var finalProjectId =
          yamlMeta.projectId || resolvedProjectId || state.composerProjectId;
        var visibility = yamlMeta.visibility || state.visibility;
        var isSecret = visibility === "SECRET";
        var storedVisibility = isSecret ? "PRIVATE" : visibility;
        var meta = {
          createdAt: yamlMeta.createdAt,
          updatedAt: yamlMeta.updatedAt,
          pinned: yamlMeta.pinned,
          kind: yamlMeta.kind,
          taskId: yamlMeta.taskId,
          archived: yamlMeta.archived,
          alias: yamlMeta.alias,
        };
        if (yamlMeta.private !== undefined) {
          meta.private = yamlMeta.private;
        }
        return createMemoInVault(
          finalContent,
          storedVisibility,
          finalProjectId,
          isSecret,
          meta,
        );
      })
      .then(
        function (memo) {
          const normalized = normalizeMemoPayload(memo);
          state.memos = [normalized].filter(Boolean).concat(state.memos);
          saveMemos(state.memos);
          if (state.activeProjectFilter === "all") {
            state.composerProjectId = "";
            rememberComposerProject("");
          }
          state.visibility = DEFAULT_VISIBILITY;
          composerEditor.setText("");
          removeDraftFromState(COMPOSER_DRAFT_ID);
          state.composerPreviewVisible = false;
          state.activeView = "memos";
          state.activeFilter = "all";
          state.activeTag = "";
          smallCalendarModel.setSelectedDate("", { silent: true });
          renderAll();
          renderComposerStatus("");
          refreshTasksFromVault();
          showToast(
            "已发布到 " + projectLabel(normalized && normalized.projectId),
          );
          deleteMemoDraftInVault(COMPOSER_DRAFT_ID).catch(function (err) {
            showToast("清理草稿失败: " + errorMessage(err));
          });
          if (options.source !== "vim-wq") {
            window.requestAnimationFrame(() => {
              if (composerEditor && els.composerHost.isConnected)
                composerEditor.focus();
            });
          }
          return { ok: true, message: "已发布" };
        },
        function (err) {
          showToast("发布失败: " + errorMessage(err));
          return { ok: false, message: "发布失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        state.saving = false;
        renderComposerStatus(composerEditor.getText());
      });
  }

  function scheduleComposerAutoSave() {
    if (composerAutoSaveTimer) window.clearTimeout(composerAutoSaveTimer);
    composerAutoSaveTimer = window.setTimeout(function () {
      composerAutoSaveTimer = null;
      if (!composerEditor) return;
      var content = composerEditor.getText();
      if (!content.trim()) return;
      upsertMemoDraftInVault({
        content: content,
        id: COMPOSER_DRAFT_ID,
        kind: "composer",
        projectId: state.composerProjectId,
        visibility: state.visibility,
      }).then(
        function (draft) {
          upsertDraftInState(draft);
          if (els.composerDraftStatus) {
            els.composerDraftStatus.hidden = false;
            window.clearTimeout(els.composerDraftStatus._hideTimer);
            els.composerDraftStatus._hideTimer = window.setTimeout(function () {
              if (els.composerDraftStatus)
                els.composerDraftStatus.hidden = true;
            }, 2000);
          }
        },
        function () {
          // silent fail for auto-save
        },
      );
    }, 5000);
  }

  function writeComposerDraft() {
    if (!composerEditor)
      return Promise.resolve({ ok: false, message: "没有可保存的草稿" });
    const content = composerEditor.getText();
    if (!content.trim()) {
      return clearComposerDraft({
        clearEditor: false,
        message: "空草稿已清理",
      });
    }

    return upsertMemoDraftInVault({
      content,
      id: COMPOSER_DRAFT_ID,
      kind: "composer",
      projectId: state.composerProjectId,
      visibility: state.visibility,
    }).then(
      function (draft) {
        upsertDraftInState(draft);
        showToast("草稿已保存");
        if (els.composerDraftStatus) {
          els.composerDraftStatus.hidden = false;
          window.clearTimeout(els.composerDraftStatus._hideTimer);
          els.composerDraftStatus._hideTimer = window.setTimeout(function () {
            if (els.composerDraftStatus) els.composerDraftStatus.hidden = true;
          }, 2000);
        }
        return { ok: true, message: "draft written" };
      },
      function (err) {
        showToast("保存草稿失败: " + errorMessage(err));
        return { ok: false, message: "保存草稿失败: " + errorMessage(err) };
      },
    );
  }

  function clearComposerDraft(options = {}) {
    removeDraftFromState(COMPOSER_DRAFT_ID);
    if (options.clearEditor && composerEditor) {
      composerEditor.setText("");
      renderComposerStatus("");
    }
    if (options.clearEditor) {
      state.composerPreviewVisible = false;
      renderComposerPreview();
    }
    return deleteMemoDraftInVault(COMPOSER_DRAFT_ID).then(
      function () {
        if (options.message) showToast(options.message);
        return { ok: true, message: options.message || "empty draft cleared" };
      },
      function (err) {
        showToast("删除草稿失败: " + errorMessage(err));
        return { ok: false, message: "删除草稿失败: " + errorMessage(err) };
      },
    );
  }

  function exitComposer() {
    if (composerEditor && typeof composerEditor.blur === "function")
      composerEditor.blur();
    return Promise.resolve({ ok: true, message: "quit" });
  }

  function controlGroupValue(group, name, fallback = "") {
    if (!group) return fallback;
    const control = group.querySelector('[name="' + name + '"]');
    return control ? control.value : fallback;
  }

  function clearControlGroup(group) {
    if (!group) return;
    group.querySelectorAll("input").forEach(function (input) {
      if (input.type !== "checkbox" && input.type !== "radio") input.value = "";
    });
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

  function createGTDItemFromForm(form) {
    if (!form) return;
    const title = String(controlGroupValue(form, "title") || "").trim();
    if (!title) {
      showToast("事项标题不能为空");
      return;
    }
    const projectId =
      state.activeProjectFilter &&
      state.activeProjectFilter !== "all" &&
      state.activeProjectFilter !== "unassigned"
        ? state.activeProjectFilter
        : "";
    createGTDItem({
      milestoneId: String(controlGroupValue(form, "milestoneId") || "").trim(),
      projectId,
      title,
      type: String(controlGroupValue(form, "type", "idea") || "idea").trim(),
    }).then(
      function (item) {
        state.gtdItems = [item].concat(state.gtdItems);
        clearControlGroup(form);
        renderAll();
        showToast("已添加开放事项");
      },
      function (err) {
        showToast("添加事项失败: " + errorMessage(err));
      },
    );
  }

  function createGTDMilestoneFromForm(form) {
    if (!form) return;
    const title = String(controlGroupValue(form, "title") || "").trim();
    if (!title) {
      showToast("里程碑标题不能为空");
      return;
    }
    const projectIds =
      state.activeProjectFilter &&
      state.activeProjectFilter !== "all" &&
      state.activeProjectFilter !== "unassigned"
        ? [state.activeProjectFilter]
        : [];
    createGTDMilestone({
      projectIds,
      status: String(
        controlGroupValue(form, "status", "planned") || "planned",
      ).trim(),
      targetAt: String(controlGroupValue(form, "targetAt") || "").trim(),
      title,
    }).then(
      function (milestone) {
        state.gtdMilestones = [milestone].concat(state.gtdMilestones);
        clearControlGroup(form);
        renderAll();
        showToast("已添加里程碑");
      },
      function (err) {
        showToast("添加里程碑失败: " + errorMessage(err));
      },
    );
  }

  function updateExistingGTDItem(itemId, patch, message) {
    const id = String(itemId || "").trim();
    if (!id) return;
    updateGTDItem(id, patch).then(
      function (item) {
        state.gtdItems = state.gtdItems.map((entry) =>
          entry.id === id ? item : entry,
        );
        renderAll();
        showToast(message || "已更新事项");
      },
      function (err) {
        showToast("更新事项失败: " + errorMessage(err));
        refreshGTDFromVault();
      },
    );
  }

  function closeExistingGTDItem(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return;
    closeGTDItem(id).then(
      function (item) {
        state.gtdItems = state.gtdItems.map((entry) =>
          entry.id === id ? item : entry,
        );
        renderAll();
        showToast("已关闭事项");
      },
      function (err) {
        showToast("关闭事项失败: " + errorMessage(err));
        refreshGTDFromVault();
      },
    );
  }

  function deleteExistingGTDItem(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return;
    if (!window.confirm("删除这个 GTD 事项？")) return;
    deleteGTDItem(id).then(
      function () {
        state.gtdItems = state.gtdItems.filter((entry) => entry.id !== id);
        renderAll();
        showToast("已删除事项");
      },
      function (err) {
        showToast("删除事项失败: " + errorMessage(err));
        refreshGTDFromVault();
      },
    );
  }

  function toggleExistingGTDItemCompletion(itemId, checkbox) {
    const id = String(itemId || "").trim();
    if (!id || !checkbox) return;
    const checked = checkbox.checked;
    const itemCard = closestElement(checkbox, "[data-gtd-item-id]");
    checkbox.disabled = true;
    const request = checked
      ? closeGTDItem(id)
      : updateGTDItem(id, { status: "open" });
    request.then(
      function (item) {
        state.gtdItems = state.gtdItems.map((entry) =>
          entry.id === id ? item : entry,
        );
        replaceGTDItemCard(itemCard, item);
        showToast(checked ? "已关闭事项" : "已重新打开事项");
      },
      function (err) {
        setCheckboxControlValue(checkbox, !checked);
        checkbox.disabled = false;
        showToast(
          (checked ? "关闭事项失败: " : "重新打开事项失败: ") +
            errorMessage(err),
        );
      },
    );
  }

  function updateExistingGTDMilestone(milestoneId, patch, message) {
    const id = String(milestoneId || "").trim();
    if (!id) return;
    updateGTDMilestone(id, patch).then(
      function (milestone) {
        state.gtdMilestones = state.gtdMilestones.map((entry) =>
          entry.id === id ? milestone : entry,
        );
        renderAll();
        showToast(message || "已更新里程碑");
      },
      function (err) {
        showToast("更新里程碑失败: " + errorMessage(err));
        refreshGTDFromVault();
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

  function replaceGTDItemCard(card, item) {
    if (!card || !item) return;
    renderAll();
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
    const overlay = document.createElement("div");
    overlay.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    overlay.setAttribute("data-task-edit-dialog", task.id);
    overlay.setAttribute("data-n", "task-edit-dialog-host");
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
    root.appendChild(overlay);

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

    var wrapper = document.createElement("span");
    wrapper.className = "memo-task-completed-time-edit";
    wrapper.dataset.n = "task-completed-time-editor-host";
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
    const overlay = document.createElement("div");
    overlay.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    overlay.setAttribute("data-inline-task-detail-dialog", "");
    overlay.setAttribute("data-n", "inline-task-detail-dialog-host");
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
    root.appendChild(overlay);

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

  function startComment(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    openMemoDialog("comment", memo.id);
  }

  function startCommentEdit(commentId) {
    const comment = findComment(commentId);
    if (!comment) return;
    openCommentEditDialog(comment);
  }

  function openCommentEditDialog(comment) {
    // Reuse the memoDialog infrastructure with kind "commentEdit".
    closeMemoDialog({ silent: true });
    state.commentEditingId = comment.id;
    state.commentEditDraft = comment.content || "";
    state.commentEditPreviewVisible = false;
    state.commentingMemoId = "";
    state.commentDraft = "";
    state.commentPreviewVisible = false;
    state.editingId = "";
    state.editDraft = "";
    state.editPreviewVisible = false;

    state.memoDialog = {
      commentId: comment.id,
      draft: comment.content || "",
      kind: "commentEdit",
      memoId: comment.memoId || "",
      previewVisible: false,
      projectId: "",
      saving: false,
      visibility: DEFAULT_VISIBILITY,
    };
    renderMemoDialog();
  }

  function cancelCommentEdit(options = {}) {
    state.commentEditingId = "";
    state.commentEditDraft = "";
    state.commentEditPreviewVisible = false;
    renderFeed();
    if (options.message) showToast(options.message);
    return Promise.resolve({
      ok: true,
      message: options.message || "comment edit cancelled",
    });
  }

  function cancelComment(options = {}) {
    state.commentingMemoId = "";
    state.commentDraft = "";
    state.commentPreviewVisible = false;
    renderFeed();
    if (options.message) showToast(options.message);
    return Promise.resolve({
      ok: true,
      message: options.message || "comment cancelled",
    });
  }

  function saveComment(memoId, options = {}) {
    const memo = findMemo(memoId);
    if (!memo) return Promise.resolve({ ok: false, message: "找不到 memo" });
    if (state.commentSaving)
      return Promise.resolve({ ok: false, message: "正在保存" });
    const content = commentEditor
      ? commentEditor.getText()
      : state.commentDraft;
    if (!content.trim()) {
      showToast("评论不能为空");
      if (commentEditor) commentEditor.focus();
      return Promise.resolve({ ok: false, message: "评论不能为空" });
    }

    state.commentSaving = true;
    const commentVis =
      state.commentVisibility === "SECRET"
        ? "PRIVATE"
        : state.commentVisibility;
    return createMemoCommentInVault(memoId, content, commentVis)
      .then(
        function (comment) {
          upsertCommentInState(comment);
          state.expandedCommentListMemoIds.add(memoId);
          state.commentingMemoId = "";
          state.commentDraft = "";
          state.commentPreviewVisible = false;
          renderFeed();
          refreshTasksFromVault();
          if (options.source !== "vim-wq") showToast("已添加评论");
          return { ok: true, message: "已添加评论" };
        },
        function (err) {
          showToast("评论失败: " + errorMessage(err));
          return { ok: false, message: "评论失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        state.commentSaving = false;
      });
  }

  function saveCommentEdit() {
    const comment = findComment(state.commentEditingId);
    if (!comment) return Promise.resolve({ ok: false, message: "找不到评论" });
    if (state.commentSaving)
      return Promise.resolve({ ok: false, message: "正在保存" });
    const content = commentEditEditor
      ? commentEditEditor.getText()
      : state.commentEditDraft;
    if (!content.trim()) {
      showToast("评论不能为空");
      if (commentEditEditor) commentEditEditor.focus();
      return Promise.resolve({ ok: false, message: "评论不能为空" });
    }

    state.commentSaving = true;
    return updateMemoCommentInVault(comment.id, { content })
      .then(
        function (updated) {
          upsertCommentInState(updated);
          state.commentEditingId = "";
          state.commentEditDraft = "";
          state.commentEditPreviewVisible = false;
          if (comment.memoId)
            state.expandedCommentListMemoIds.add(comment.memoId);
          renderFeed();
          refreshTasksFromVault();
          showToast("已保存评论");
          return { ok: true, message: "已保存评论" };
        },
        function (err) {
          showToast("保存评论失败: " + errorMessage(err));
          return { ok: false, message: "保存评论失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        state.commentSaving = false;
      });
  }

  function openMemoDialog(kind, memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    const dialogKind = kind === "edit" ? "edit" : "comment";

    if (dialogKind === "edit") {
      closeMemoDialog({ silent: true });
      var draft = findDraft(memoEditDraftId(memo.id));
      state.memoDialog = { kind: "edit", memoId: memo.id, saving: false };
      memoDialogController = mountMemoEditDialog(root, {
        memo: memo,
        initialDraft: draft ? draft.content : null,
        memos: state.memos,
        projects: state.projects,
        editorSettings: state.editorSettings,
        tagItems: editorTagItems,
        onSaveComplete: function (memoId) {
          reloadMemoFromVault(memoId)
            .then(function () {
              removeDraftFromState(memoEditDraftId(memoId));
              deleteMemoDraftInVault(memoEditDraftId(memoId)).catch(
                function () {},
              );
              replaceMemoCardOnly(memoId);
              refreshTasksFromVault({ render: false });
              if (typeof invoke === "function") {
                invoke("/api/memo-window/memo-saved", {
                  method: "POST",
                  args: { memoId: memoId },
                }).catch(function () {});
              }
            })
            .catch(function () {});
          closeMemoDialog({ silent: true });
        },
        onClose: function () {
          closeMemoDialog({ silent: true });
        },
        onDraftUpsert: function (draft) {
          upsertDraftInState(draft);
        },
        onDraftDelete: function (draftId) {
          removeDraftFromState(draftId);
        },
        showToast: showToast,
        resolveOrCreateProject: resolveOrCreateProjectByName,
      });
      if (draft) showToast("已恢复编辑草稿");
      return;
    }

    if (
      state.memoDialog &&
      state.memoDialog.kind === dialogKind &&
      state.memoDialog.memoId === memo.id &&
      memoDialogEditor
    ) {
      memoDialogEditor.focus();
      return;
    }

    var prevReplyToCommentId = state.replyToCommentId;
    closeMemoDialog({ silent: true });
    state.replyToCommentId = prevReplyToCommentId;

    state.commentingMemoId = "";
    state.commentDraft = "";
    state.commentPreviewVisible = false;
    state.commentEditingId = "";
    state.commentEditDraft = "";
    state.commentEditPreviewVisible = false;
    state.editingId = "";
    state.editDraft = "";
    state.editPreviewVisible = false;
    state.memoDialog = {
      draft: "",
      kind: dialogKind,
      memoId: memo.id,
      previewVisible: false,
      projectId: normalizeProjectID(memo.projectId),
      saving: false,
      visibility: (function () {
        const v = memo.visibility || DEFAULT_VISIBILITY;
        const p = Boolean(memo.private);
        return p && v === "PRIVATE" ? "SECRET" : v;
      })(),
    };
    renderMemoDialog();
  }

  function closeMemoDialog(options = {}) {
    if (memoDialogController) {
      memoDialogController.destroy();
      memoDialogController = null;
    }
    if (memoDialogEditor) {
      syncMemoDialogDraftFromEditor();
      memoDialogEditor.destroy();
      memoDialogEditor = null;
    }
    const dialog = root.querySelector("[data-memo-dialog]");
    if (dialog) {
      unmountTimelessView(dialog);
      dialog.remove();
    }
    state.memoDialog = null;
    state.replyToCommentId = "";
    if (options.message) showToast(options.message);
    return Promise.resolve({ ok: true, message: options.message || "closed" });
  }

  function runMemoDialogAction(action) {
    if (!state.memoDialog) return;
    switch (action) {
      case "cancel":
        cancelMemoDialog();
        break;
      case "close":
        closeMemoDialog();
        break;
      case "preview":
        toggleMemoDialogPreview();
        break;
      case "save":
        saveMemoDialog();
        break;
      default:
        break;
    }
  }

  function renderMemoDialog() {
    const dialogState = state.memoDialog;
    if (!dialogState) return;
    const memo = findMemo(dialogState.memoId);
    if (!memo && dialogState.kind !== "commentEdit") {
      closeMemoDialog();
      showToast("找不到 memo");
      return;
    }

    if (memoDialogEditor) {
      memoDialogEditor.destroy();
      memoDialogEditor = null;
    }
    const existing = root.querySelector("[data-memo-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }

    const dialog = document.createElement("div");
    dialog.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    dialog.dataset.memoDialog = "true";
    dialog.dataset.memoId = memo ? memo.id : "";
    dialog.dataset.n = "memo-dialog-host";
    const fakeMemo = memo || {
      id: "",
      content: "",
      projectId: "",
      visibility: DEFAULT_VISIBILITY,
    };
    var replyToPreview = "";
    if (dialogState.kind === "comment" && state.replyToCommentId) {
      var parent = findComment(state.replyToCommentId);
      if (parent)
        replyToPreview = compactText(
          (parent.content || "").replace(/\n/g, " "),
          120,
        );
    }
    const comment_editing = dialogState.kind === "commentEdit";
    renderTimelessView(
      dialog,
      MemoDialogView({
        description:
          comment_editing && fakeMemo.id
            ? compactText(memoTitle(fakeMemo), 88)
            : "",
        replyTo: replyToPreview,
        saveLabel: comment_editing ? "保存" : "评论",
        title: comment_editing ? "编辑评论" : "评论",
      }),
    );
    root.appendChild(dialog);
    mountMemoDialogEditor();
    renderMemoDialogPreview();
    renderMemoDialogSaving();
    window.requestAnimationFrame(function () {
      if (memoDialogEditor) memoDialogEditor.focus();
    });
  }

  function mountMemoDialogEditor() {
    const dialogState = state.memoDialog;
    const dialog = root.querySelector("[data-memo-dialog]");
    const memo = dialogState ? findMemo(dialogState.memoId) : null;
    const host = dialog
      ? dialog.querySelector("[data-memo-dialog-editor-host]")
      : null;
    if (!dialogState || !host) return;
    if (!memo && dialogState.kind !== "commentEdit") return;
    const statusHost = dialog.querySelector("[data-memo-dialog-vim-status]");
    memoDialogEditor = createMiniEditor(host, {
      memoItems() {
        return state.memos;
      },
      tagItems: editorTagItems,
      onChange(value) {
        if (!state.memoDialog) return;
        state.memoDialog.draft = value;
        renderMemoDialogPreview();
      },
      onCommit() {
        return saveMemoDialog({ source: "vim-wq" });
      },
      onDiscard() {
        return closeMemoDialog({
          message:
            dialogState.kind === "commentEdit" ? "编辑已取消" : "评论已取消",
        });
      },
      onQuit() {
        return closeMemoDialog();
      },
      onSave() {
        return Promise.resolve({ ok: true, message: "draft retained" });
      },
      onSubmit() {
        return saveMemoDialog();
      },
      onWriteDraft() {
        return Promise.resolve({ ok: true, message: "draft retained" });
      },
      placeholder:
        dialogState.kind === "commentEdit"
          ? "编辑评论..."
          : dialogState.kind === "edit"
            ? "编辑 memo..."
            : "添加评论...",
      sourceMemoId: memo ? memo.id : "",
      value: dialogState.draft,
      vim: editorVimEnabled(),
      vimStatusHost: statusHost,
    });
  }

  function syncMemoDialogDraftFromEditor() {
    if (!state.memoDialog || !memoDialogEditor) return;
    state.memoDialog.draft = memoDialogEditor.getText();
  }

  function toggleMemoDialogPreview() {
    if (!state.memoDialog) return;
    syncMemoDialogDraftFromEditor();
    state.memoDialog.previewVisible = !state.memoDialog.previewVisible;
    renderMemoDialogPreview();
    if (!state.memoDialog.previewVisible && memoDialogEditor)
      memoDialogEditor.focus();
  }

  function renderMemoDialogPreview() {
    const dialogState = state.memoDialog;
    const dialog = root.querySelector("[data-memo-dialog]");
    if (!dialogState || !dialog) return;
    renderEditorPreviewPanel(
      dialog.querySelector("[data-memo-dialog-preview]"),
      dialog.querySelector('[data-memo-dialog-action="preview"]'),
      dialogState.previewVisible,
      dialogState.draft,
      memoRenderContext(dialogState.memoId, {
        readonly: true,
        showLineNumbers: dialogState.kind === "edit",
      }),
    );
  }

  function setMemoDialogSaving(saving) {
    if (!state.memoDialog) return;
    state.memoDialog.saving = Boolean(saving);
    renderMemoDialogSaving();
  }

  function renderMemoDialogSaving() {
    const dialogState = state.memoDialog;
    const dialog = root.querySelector("[data-memo-dialog]");
    if (!dialogState || !dialog) return;
    dialog.classList.toggle("is-saving", dialogState.saving);
    dialog
      .querySelectorAll(
        "[data-memo-dialog-action], [data-memo-dialog-project], [data-memo-dialog-visibility]",
      )
      .forEach(function (control) {
        control.disabled = dialogState.saving;
      });
  }

  function cancelMemoDialog() {
    if (!state.memoDialog)
      return Promise.resolve({ ok: true, message: "closed" });
    if (state.memoDialog.kind === "commentEdit") {
      state.commentEditingId = "";
      state.commentEditDraft = "";
      state.commentEditPreviewVisible = false;
      return closeMemoDialog({ message: "编辑已取消" });
    }
    state.replyToCommentId = "";
    return closeMemoDialog({ message: "评论已取消" });
  }

  function saveMemoDialog(options = {}) {
    if (!state.memoDialog)
      return Promise.resolve({ ok: false, message: "没有打开的弹窗" });
    if (state.memoDialog.kind === "commentEdit")
      return saveMemoDialogCommentEdit(options);
    return saveMemoDialogComment(options);
  }

  function saveMemoDialogComment(options = {}) {
    const dialogState = state.memoDialog;
    if (!dialogState)
      return Promise.resolve({ ok: false, message: "没有打开的弹窗" });
    const memo = findMemo(dialogState.memoId);
    if (!memo) return Promise.resolve({ ok: false, message: "找不到 memo" });
    if (dialogState.saving)
      return Promise.resolve({ ok: false, message: "正在保存" });
    syncMemoDialogDraftFromEditor();
    const content = String(dialogState.draft || "");
    if (!content.trim()) {
      showToast("评论不能为空");
      if (memoDialogEditor) memoDialogEditor.focus();
      return Promise.resolve({ ok: false, message: "评论不能为空" });
    }

    const memoId = memo.id;
    setMemoDialogSaving(true);
    const commentVis =
      state.commentVisibility === "SECRET"
        ? "PRIVATE"
        : state.commentVisibility;
    const replyTo = state.replyToCommentId || "";
    console.log(
      "[saveMemoDialogComment] submitting - replyTo:",
      replyTo,
      "content:",
      compactText(content, 80),
    );
    return createMemoCommentInVault(
      memoId,
      content,
      commentVis,
      undefined,
      replyTo,
    )
      .then(function () {
        return reloadMemoCommentsForMemo(memoId);
      })
      .then(
        function () {
          state.replyToCommentId = "";
          state.expandedCommentListMemoIds.add(memoId);
          replaceMemoCardOnly(memoId);
          closeMemoDialog();
          refreshTasksFromVault({ render: false });
          if (options.source !== "vim-wq") showToast("已添加评论");
          return { ok: true, message: "已添加评论" };
        },
        function (err) {
          showToast("评论失败: " + errorMessage(err));
          return { ok: false, message: "评论失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        if (state.memoDialog && state.memoDialog.memoId === memoId)
          setMemoDialogSaving(false);
      });
  }

  function saveMemoDialogCommentEdit(options = {}) {
    const dialogState = state.memoDialog;
    if (!dialogState || dialogState.kind !== "commentEdit")
      return Promise.resolve({ ok: false, message: "没有打开的弹窗" });
    const commentId = dialogState.commentId;
    const comment = findComment(commentId);
    if (!comment) return Promise.resolve({ ok: false, message: "找不到评论" });
    if (dialogState.saving)
      return Promise.resolve({ ok: false, message: "正在保存" });
    syncMemoDialogDraftFromEditor();
    const content = String(dialogState.draft || "");
    if (!content.trim()) {
      showToast("评论不能为空");
      if (memoDialogEditor) memoDialogEditor.focus();
      return Promise.resolve({ ok: false, message: "评论不能为空" });
    }

    setMemoDialogSaving(true);
    return updateMemoCommentInVault(commentId, { content })
      .then(
        function (updated) {
          upsertCommentInState(updated);
          state.commentEditingId = "";
          state.commentEditDraft = "";
          state.commentEditPreviewVisible = false;
          if (comment.memoId)
            state.expandedCommentListMemoIds.add(comment.memoId);
          closeMemoDialog();
          renderFeed();
          refreshTasksFromVault({ render: false });
          if (options.source !== "vim-wq") showToast("已保存评论");
          return { ok: true, message: "已保存评论" };
        },
        function (err) {
          showToast("保存评论失败: " + errorMessage(err));
          return { ok: false, message: "保存评论失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        if (state.memoDialog && state.memoDialog.commentId === commentId)
          setMemoDialogSaving(false);
      });
  }

  function reloadMemoFromVault(memoId) {
    const id = String(memoId || "").trim();
    if (!id) return Promise.reject(new Error("memo id is required"));
    return loadMemosFromVault().then(function (memos) {
      const normalized = (Array.isArray(memos) ? memos : [])
        .map(normalizeMemoPayload)
        .filter(Boolean);
      const memo = normalized.find((item) => item.id === id);
      if (!memo) throw new Error("找不到更新后的 memo");
      upsertMemoInState(memo);
      saveMemos(state.memos);
      return memo;
    });
  }

  function reloadMemoCommentsForMemo(memoId) {
    const id = String(memoId || "").trim();
    if (!id) return Promise.reject(new Error("memo id is required"));
    return loadMemoCommentsFromVault(id).then(function (comments) {
      const normalized = (Array.isArray(comments) ? comments : [])
        .map(normalizeMemoCommentPayload)
        .filter(Boolean);
      state.comments = state.comments
        .filter((comment) => comment && comment.memoId !== id)
        .concat(normalized);
      state.commentsLoaded = true;
      return normalized;
    });
  }

  function upsertMemoInState(memo) {
    const normalized = normalizeMemoPayload(memo);
    if (!normalized) return null;
    const index = state.memos.findIndex(
      (item) => item && item.id === normalized.id,
    );
    if (index >= 0) {
      state.memos[index] = normalized;
    } else {
      state.memos.unshift(normalized);
    }
    state.memoRefIndex = null;
    return normalized;
  }

  function replaceMemoCardOnly(memoId) {
    const id = String(memoId || "").trim();
    if (!id) return;
    renderMemoChromeWithoutFeed();
    if (state.activeView !== "memos") return;

    const selector = `[data-memo-id="${escapeCSSIdent(id)}"]`;
    const card = els.memoList.querySelector(selector);
    const memos = visibleMemos();
    const memo = memos.find((item) => item.id === id);

    if (!memo) {
      renderFeedCollection();
      syncMemoExpandControls();
      return;
    }
    if (!card) return;
    renderFeedCollection();
    syncMemoExpandControls();
  }

  function renderMemoChromeWithoutFeed() {
    state.memoRefIndex = buildMemoReferenceIndex(state.memos);
    renderProjects();
    renderViewButtons();
    renderFilterButtons();
    renderCalendar();
    renderTags();
    renderPinned();
  }

  function deleteComment(commentId) {
    const comment = findComment(commentId);
    if (!comment || state.commentSaving) return;
    if (!window.confirm("删除这条评论？")) return;

    state.commentSaving = true;
    deleteMemoCommentInVault(comment.id, { cleanupAssets: true })
      .then(
        function () {
          state.comments = state.comments.filter(
            (item) => item.id !== comment.id,
          );
          if (state.commentEditingId === comment.id) {
            state.commentEditingId = "";
            state.commentEditDraft = "";
            state.commentEditPreviewVisible = false;
          }
          renderFeed();
          showToast("已删除评论");
        },
        function (err) {
          showToast("删除评论失败: " + errorMessage(err));
        },
      )
      .finally(function () {
        state.commentSaving = false;
      });
  }

  function replyToComment(commentId) {
    var parentComment = findComment(commentId);
    if (!parentComment) return;
    var memo = findMemo(parentComment.memoId);
    if (!memo) return;
    console.log("[replyToComment] opening dialog - parentComment:", {
      id: parentComment.id,
      content: compactText(parentComment.content || "", 100),
      memoId: parentComment.memoId,
    });
    state.replyToCommentId = commentId;
    openMemoDialog("comment", memo.id);
    if (state.memoDialog && memoDialogEditor) {
      memoDialogEditor.focus();
    }
  }

  function openCommentReplies(commentId) {
    openCommentDetail(commentId, "");
  }

  function openTodoDetail(todo, query) {
    const payload = buildTodoDetailPayload(
      todo,
      state.comments,
      state.memos,
      query,
    );
    if (!payload) {
      showToast("找不到代办详情");
      return;
    }
    writeMemoQuickSearchOpenContext(
      globalThis.localStorage,
      payload.memo.id,
      null,
    );
    writeTodoDetailPayload(globalThis.localStorage, payload);
    if (typeof invoke !== "function") {
      window.open(
        "todo-window.html?id=" + encodeURIComponent(payload.todo.id),
        "_blank",
        "noopener",
      );
      return;
    }
    invoke("/api/todo-window/open", {
      method: "POST",
      args: payload,
    }).catch(function (err) {
      showToast("打开代办详情失败: " + errorMessage(err));
    });
  }

  function openCommentDetail(commentId, query) {
    const payload = buildCommentDetailPayload(
      state.comments,
      state.memos,
      commentId,
      query,
    );
    if (!payload) {
      showToast("找不到评论详情");
      return;
    }
    writeMemoQuickSearchOpenContext(
      globalThis.localStorage,
      payload.memo.id,
      null,
    );
    writeCommentDetailPayload(globalThis.localStorage, payload);
    if (typeof invoke !== "function") {
      window.open(
        "comment-replies.html?id=" + encodeURIComponent(commentId),
        "_blank",
        "noopener",
      );
      return;
    }
    invoke("/api/comment-replies/open", {
      method: "POST",
      args: payload,
    }).catch(function (err) {
      showToast("打开评论详情失败: " + errorMessage(err));
    });
  }

  function exitComment(memoId) {
    const memo = findMemo(memoId);
    if (!memo) {
      state.commentingMemoId = "";
      state.commentDraft = "";
      state.commentEditingId = "";
      state.commentEditDraft = "";
      state.commentEditPreviewVisible = false;
      state.commentPreviewVisible = false;
      renderFeed();
      return Promise.resolve({ ok: true, message: "quit" });
    }
    syncCommentDraftFromEditor();
    state.commentingMemoId = "";
    state.commentPreviewVisible = false;
    renderFeed();
    return Promise.resolve({ ok: true, message: "quit" });
  }

  function startEdit(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    openMemoDialog("edit", memo.id);
  }

  function openEditMemoWindow(memoId) {
    var memo = findMemo(memoId);
    if (!memo) return;
    if (typeof invoke !== "function") return;
    invoke("/api/memo-window/edit", {
      method: "POST",
      args: {
        memo: memo,
        memos: state.memos,
        projects: state.projects,
      },
    }).catch(function () {});
  }

  function openSourceEditDialog(memo) {
    closeSourceEditDialog();
    var overlay = document.createElement("div");
    overlay.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    overlay.setAttribute("data-source-edit-dialog", "");
    overlay.setAttribute("data-n", "source-edit-dialog-host");
    const secret =
      Boolean(memo.private) &&
      (memo.visibility || DEFAULT_VISIBILITY) === "PRIVATE";
    renderTimelessView(
      overlay,
      SourceEditDialogView({
        createdAt: formatDisplayTime(memo.createdAt),
        memo,
        private: secret ? false : Boolean(memo.private),
        updatedAt: formatDisplayTime(memo.updatedAt),
        visibility: secret ? "SECRET" : memo.visibility || DEFAULT_VISIBILITY,
        visibilityOptions: Object.keys(VISIBILITY).map(function (value) {
          return { label: value, value };
        }),
      }),
    );
    root.appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeSourceEditDialog();
      var closeBtn = closestElement(
        event.target,
        "[data-source-edit-dialog-close]",
      );
      if (closeBtn) closeSourceEditDialog();
      var save_button = closestElement(event.target, "[data-source-edit-save]");
      if (save_button) saveSourceEditDialog(memo.id);
      var openFileBtn = closestElement(event.target, "[data-open-file]");
      if (openFileBtn) {
        var memoId = openFileBtn.getAttribute("data-open-file");
        openMemoFile(memoId, openFileBtn);
      }
    });
  }

  function closeSourceEditDialog() {
    var existing = root.querySelector("[data-source-edit-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
  }

  function openMemoFile(memoId, button) {
    if (!memoId) {
      showToast("memo ID 为空");
      return;
    }
    if (typeof invoke !== "function") {
      showToast("当前环境不支持打开文件");
      return;
    }
    var url = "/api/memos/open-file?memoId=" + encodeURIComponent(memoId);
    if (button) button.disabled = true;
    invoke(url, { method: "GET" })
      .then(
        function (resp) {
          if (!resp || resp.code !== 0) {
            showToast((resp && resp.msg) || "打开文件失败");
            return;
          }
          showToast("已在文件管理器中显示");
        },
        function (err) {
          showToast("打开文件失败: " + err);
        },
      )
      .finally(function () {
        if (button) button.disabled = false;
      });
  }

  function saveSourceEditDialog(memoId) {
    var memo = findMemo(memoId);
    if (!memo) return;

    var overlay = root.querySelector("[data-source-edit-dialog]");
    if (!overlay) return;

    var fields = overlay.querySelectorAll("[data-source-edit-field]");
    var data = {};
    fields.forEach(function (field) {
      if (field.type === "checkbox") {
        data[field.name] = field.checked;
      } else {
        data[field.name] = String(field.value || "").trim();
      }
    });

    // Validate createdAt
    if (!data.createdAt) {
      showToast("createdAt 不能为空");
      return;
    }
    var parsedCreatedAt = parseDisplayTime(data.createdAt);
    if (!parsedCreatedAt) {
      showToast("createdAt 格式错误，应为 YYYY-MM-DD HH:mm:ss");
      return;
    }

    // Validate updatedAt
    var parsedUpdatedAt = "";
    if (data.updatedAt) {
      parsedUpdatedAt = parseDisplayTime(data.updatedAt);
      if (!parsedUpdatedAt) {
        showToast("updatedAt 格式错误，应为 YYYY-MM-DD HH:mm:ss");
        return;
      }
    }

    // Validate visibility
    var visibility = String(data.visibility || DEFAULT_VISIBILITY)
      .trim()
      .toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(VISIBILITY, visibility)) {
      showToast("visibility 只能是 SECRET、PRIVATE、PROTECTED 或 PUBLIC");
      return;
    }

    // Validate projectId
    var projectId = normalizeProjectID(data.projectId);
    if (
      projectId &&
      !state.projects.some(function (p) {
        return p.id === projectId;
      })
    ) {
      showToast("Project 不存在");
      return;
    }

    // Validate taskId
    var taskId = String(data.taskId || "").trim();
    if (
      taskId &&
      !state.tasks.some(function (t) {
        return t.id === taskId;
      })
    ) {
      showToast("Task 不存在");
      return;
    }

    // Build patch
    var isSecret = visibility === "SECRET";
    var isPrivate = isSecret ? true : Boolean(data.private);
    var storedVisibility = isSecret ? "PRIVATE" : visibility;

    var patch = {
      alias: String(data.alias || "").trim(),
      archived: Boolean(data.archived),
      createdAt: parsedCreatedAt,
      kind: String(data.kind || "").trim(),
      pinned: Boolean(data.pinned),
      private: isPrivate,
      projectId: projectId,
      taskId: taskId,
      updatedAt: parsedUpdatedAt || void 0,
      visibility: storedVisibility,
    };
    if (patch.updatedAt === void 0) delete patch.updatedAt;

    closeSourceEditDialog();

    return updateMemo(memoId, patch).then(function (result) {
      if (!result || result.ok !== false) showToast("源数据已保存");
      return result;
    });
  }

  function expandMemo(memoId, trigger) {
    if (!memoCardExpansionModel.expand(memoId)) return;

    const memoSelector = escapeCSSIdent(memoId);
    const sourceCard = closestElement(
      trigger,
      "article.memo-card, article.memo-pinned-item",
    );
    const scrollHost = sourceCard?.closest(".memo-main, .memo-inspector");
    const sourceScrollTop = scrollHost?.scrollTop;
    const previousOverflowAnchor = scrollHost?.style.overflowAnchor || "";

    // Expanding changes a large amount of layout below the current reading
    // position. Disable browser scroll anchoring for this atomic update and
    // restore the exact scroll offset afterwards. Moving focus to the content
    // can scroll older WebViews even with preventScroll, so the trigger is
    // removed without an intermediate focus transfer.
    if (scrollHost) scrollHost.style.overflowAnchor = "none";

    const cards = root.querySelectorAll(
      `article.memo-card[data-memo-id="${memoSelector}"], article.memo-pinned-item[data-memo-id="${memoSelector}"]`,
    );
    cards.forEach(function (card) {
      const collapse = card.querySelector(".memo-list-collapse");
      if (!collapse) return;
      const content =
        collapse.querySelector(".memo-content") ||
        collapse.querySelector(".memo-pinned-content");
      if (!content) return;

      const expandButton = collapse.querySelector(".memo-expand-button");
      content.style.transition = "none";
      content.style.maxHeight = "";
      collapse.classList.remove("is-short", "is-collapsed");
      collapse.classList.add("is-expanded");
      expandButton?.remove();
      content.offsetHeight;
      content.style.transition = "";
    });

    const restoreScrollPosition = function () {
      if (!scrollHost?.isConnected || typeof sourceScrollTop !== "number")
        return;
      scrollHost.scrollTop = sourceScrollTop;
    };
    restoreScrollPosition();
    if (scrollHost?.isConnected)
      scrollHost.style.overflowAnchor = previousOverflowAnchor;
    window.requestAnimationFrame(restoreScrollPosition);
  }

  function toggleMemoToc(memoId) {
    if (!memoId) return;
    var card = root.querySelector(`[data-memo-id="${escapeCSSIdent(memoId)}"]`);
    if (!card) return;
    var reading = card.querySelector(".memo-card-reading");
    var tocToggle = card.querySelector(".memo-toc-toggle");
    var hasToc = reading ? reading.classList.contains("has-toc") : false;

    if (hasToc) {
      state.tocVisibleMemoIds.delete(memoId);
      if (reading) reading.classList.remove("has-toc");
      if (tocToggle) {
        tocToggle.title = "显示目录";
      }
    } else {
      state.tocVisibleMemoIds.add(memoId);
      if (reading) reading.classList.add("has-toc");
      if (tocToggle) {
        tocToggle.title = "隐藏目录";
      }
    }
  }

  function toggleMemoComments(memoId) {
    if (!memoId) return;
    if (state.expandedCommentListMemoIds.has(memoId)) {
      state.expandedCommentListMemoIds.delete(memoId);
    } else {
      state.expandedCommentListMemoIds.add(memoId);
    }
    renderFeed();
  }

  function cancelEdit() {
    const draftId = state.editingId ? memoEditDraftId(state.editingId) : "";
    state.editingId = "";
    state.editDraft = "";
    state.editPreviewVisible = false;
    renderFeed();
    if (draftId) {
      removeDraftFromState(draftId);
      deleteMemoDraftInVault(draftId).catch(function (err) {
        showToast("删除草稿失败: " + errorMessage(err));
      });
    }
  }

  function saveEdit(memoId, options = {}) {
    const memo = findMemo(memoId);
    if (!memo) return Promise.resolve({ ok: false, message: "找不到 memo" });
    var content = editEditor ? editEditor.getText() : state.editDraft;

    // Extract --- YAML front matter from content
    var yamlResult = extractYamlFrontmatter(content);
    var yamlMeta = applyYamlFrontmatterMeta(yamlResult.meta);
    content = yamlResult.stripped;

    if (!content.trim()) {
      showToast("内容不能为空");
      return Promise.resolve({ ok: false, message: "内容不能为空" });
    }
    state.editingId = "";
    state.editDraft = "";
    state.editPreviewVisible = false;
    var isSecret =
      yamlMeta.visibility === "SECRET" || state.editVisibility === "SECRET";
    var visibility = yamlMeta.visibility || state.editVisibility;
    var storedVisibility = isSecret ? "PRIVATE" : visibility;
    var patch = {
      content: content,
      private: isSecret,
      projectId: yamlMeta.projectId || state.editProjectId,
      updatedAt: yamlMeta.updatedAt || new Date().toISOString(),
      visibility: storedVisibility,
    };
    if (yamlMeta.createdAt !== undefined) patch.createdAt = yamlMeta.createdAt;
    if (yamlMeta.pinned !== undefined) patch.pinned = yamlMeta.pinned;
    if (yamlMeta.archived !== undefined) patch.archived = yamlMeta.archived;
    if (yamlMeta.kind !== undefined) patch.kind = yamlMeta.kind;
    if (yamlMeta.taskId !== undefined) patch.taskId = yamlMeta.taskId;
    if (yamlMeta.alias !== undefined) patch.alias = yamlMeta.alias;
    return updateMemo(memoId, patch).then(function (result) {
      if (result && result.ok === false) return result;
      removeDraftFromState(memoEditDraftId(memoId));
      return deleteMemoDraftInVault(memoEditDraftId(memoId)).then(
        function () {
          if (options.source === "vim-wq")
            return { ok: true, message: "committed" };
          return result || { ok: true, message: "已保存" };
        },
        function (err) {
          showToast("清理草稿失败: " + errorMessage(err));
          return { ok: false, message: "清理草稿失败: " + errorMessage(err) };
        },
      );
    });
  }

  function updateMemo(memoId, patch) {
    let nextMemo = null;
    state.memos = state.memos.map((memo) => {
      if (memo.id !== memoId) return memo;
      nextMemo = {
        ...memo,
        ...patch,
        updatedAt: patch.updatedAt || memo.updatedAt,
      };
      return nextMemo;
    });
    saveMemos(state.memos);
    renderAll();
    if (nextMemo) {
      return updateMemoInVault(memoId, patch).then(
        function (memo) {
          const normalized = normalizeMemoPayload(memo);
          if (!normalized) return { ok: false, message: "保存失败" };
          state.memos = state.memos.map((item) =>
            item.id === memoId ? normalized : item,
          );
          saveMemos(state.memos);
          renderAll();
          if (Object.prototype.hasOwnProperty.call(patch, "content")) {
            refreshTasksFromVault();
          }
          return { ok: true, message: "已保存" };
        },
        function (err) {
          showToast("保存失败: " + errorMessage(err));
          refreshMemosFromVault();
          return { ok: false, message: "保存失败: " + errorMessage(err) };
        },
      );
    }
    return Promise.resolve({ ok: false, message: "找不到 memo" });
  }

  function isValidMemoTime(value) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }

  function formatDisplayTime(value) {
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds())
    );
  }

  function parseDisplayTime(str) {
    var trimmed = String(str || "").trim();
    if (!trimmed) return null;
    var m = trimmed.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[\sT](\d{1,2}):(\d{1,2}):(\d{1,2})$/,
    );
    if (!m) return null;
    var date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
  }

  function writeEditDraft(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return Promise.resolve({ ok: false, message: "找不到 memo" });
    const content = editEditor ? editEditor.getText() : state.editDraft;
    if (!content.trim()) {
      return discardEditDraft(memoId, { exit: false, message: "空草稿已清理" });
    }
    return upsertMemoDraftInVault({
      baseUpdatedAt: memo.updatedAt || "",
      content,
      id: memoEditDraftId(memoId),
      kind: "memo-edit",
      memoId,
      projectId: state.editProjectId,
      visibility: state.editVisibility,
    }).then(
      function (draft) {
        upsertDraftInState(draft);
        state.editDraft = content;
        showToast("草稿已保存");
        return { ok: true, message: "draft written" };
      },
      function (err) {
        showToast("保存草稿失败: " + errorMessage(err));
        return { ok: false, message: "保存草稿失败: " + errorMessage(err) };
      },
    );
  }

  function exitEdit(memoId) {
    const memo = findMemo(memoId);
    if (!memo) {
      state.editingId = "";
      state.editDraft = "";
      state.editPreviewVisible = false;
      renderFeed();
      return Promise.resolve({ ok: true, message: "quit" });
    }

    const content = editEditor ? editEditor.getText() : state.editDraft;
    const changed =
      content !== memo.content ||
      normalizeProjectID(state.editProjectId) !==
        normalizeProjectID(memo.projectId) ||
      (state.editVisibility || DEFAULT_VISIBILITY) !==
        (memo.visibility || DEFAULT_VISIBILITY);

    const finish = function () {
      state.editingId = "";
      state.editDraft = "";
      state.editPreviewVisible = false;
      renderFeed();
      return { ok: true, message: "quit" };
    };

    if (!changed) return Promise.resolve(finish());
    return writeEditDraft(memoId).then(function (result) {
      if (result && result.ok === false) return result;
      return finish();
    });
  }

  function discardEditDraft(memoId, options = {}) {
    const draftId = memoEditDraftId(memoId);
    removeDraftFromState(draftId);
    if (options.exit) {
      state.editingId = "";
      state.editDraft = "";
      state.editPreviewVisible = false;
      renderFeed();
    }
    return deleteMemoDraftInVault(draftId).then(
      function () {
        if (options.message) showToast(options.message);
        return { ok: true, message: options.message || "draft discarded" };
      },
      function (err) {
        showToast("删除草稿失败: " + errorMessage(err));
        return { ok: false, message: "删除草稿失败: " + errorMessage(err) };
      },
    );
  }

  function togglePin(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    updateMemo(memoId, { pinned: !memo.pinned });
  }

  /* ── Emoji Reactions ── */

  var reactionDocHandler = null;

  function installReactionDocHandler() {
    uninstallReactionDocHandler();
    reactionDocHandler = function (event) {
      if (
        event.target.closest(".memo-reactions-add-wrap, .memo-reactions-picker")
      )
        return;
      closeAllReactionPickers();
    };
    window.setTimeout(function () {
      document.addEventListener("click", reactionDocHandler, true);
    }, 0);
  }

  function uninstallReactionDocHandler() {
    if (reactionDocHandler) {
      document.removeEventListener("click", reactionDocHandler, true);
      reactionDocHandler = null;
    }
  }

  function closeAllReactionPickers() {
    root.querySelectorAll("[data-reactions-picker]").forEach(function (el) {
      el.hidden = true;
    });
    uninstallReactionDocHandler();
  }

  function toggleMemoReactions(event, memoId, action) {
    event.stopPropagation();
    closeAllReactionPickers();
    if (!action) return;
    var wrap = action.closest(".memo-reactions-add-wrap");
    if (!wrap) return;
    var picker = wrap.querySelector("[data-reactions-picker]");
    if (!picker) return;
    picker.hidden = !picker.hidden;
    if (!picker.hidden) installReactionDocHandler();
  }

  function toggleCommentReactions(event, commentId, action) {
    event.stopPropagation();
    closeAllReactionPickers();
    if (!action) return;
    var wrap = action.closest(".memo-reactions-add-wrap");
    if (!wrap) return;
    var picker = wrap.querySelector("[data-reactions-picker]");
    if (!picker) return;
    picker.hidden = !picker.hidden;
    if (!picker.hidden) installReactionDocHandler();
  }

  function memoReactions(memoId) {
    var memo = findMemo(memoId);
    return memo && Array.isArray(memo.reactions) ? memo.reactions : [];
  }

  function commentReactions(commentId) {
    var comment = findComment(commentId);
    return comment && Array.isArray(comment.reactions) ? comment.reactions : [];
  }

  function toggleMemoReaction(memoId, emoji) {
    var reactions = memoReactions(memoId);
    var idx = reactions.indexOf(emoji);
    var next;
    if (idx >= 0) {
      next = reactions.slice(0, idx).concat(reactions.slice(idx + 1));
    } else {
      next = reactions.concat([emoji]);
    }
    updateMemo(memoId, { reactions: next });
    closeAllReactionPickers();
  }

  function toggleCommentReaction(commentId, emoji) {
    var reactions = commentReactions(commentId);
    var idx = reactions.indexOf(emoji);
    var next;
    if (idx >= 0) {
      next = reactions.slice(0, idx).concat(reactions.slice(idx + 1));
    } else {
      next = reactions.concat([emoji]);
    }
    updateMemoCommentInVault(commentId, { reactions: next }).then(
      function (updated) {
        upsertCommentInState(updated);
        renderAll();
      },
      function (err) {
        showToast("更新反应失败: " + errorMessage(err));
        renderAll();
      },
    );
    closeAllReactionPickers();
  }

  function toggleTask(memoId, lineIndex, checked) {
    const memo = findMemo(memoId);
    if (!memo) return;
    const lines = memo.content.split("\n");
    if (!lines[lineIndex]) return;
    lines[lineIndex] = updateTaskLine(lines[lineIndex], checked);
    updateMemo(memoId, {
      content: lines.join("\n"),
      updatedAt: new Date().toISOString(),
    });
  }

  function toggleCommentTask(commentId, lineIndex, checked) {
    const comment = findComment(commentId);
    if (!comment) return;
    const lines = String(comment.content || "").split("\n");
    if (!lines[lineIndex]) return;
    lines[lineIndex] = updateTaskLine(lines[lineIndex], checked);
    updateMemoCommentInVault(comment.id, { content: lines.join("\n") }).then(
      function (updated) {
        upsertCommentInState(updated);
        renderAll();
        refreshTasksFromVault();
      },
      function (err) {
        showToast("更新评论代办失败: " + errorMessage(err));
        renderAll();
      },
    );
  }

  function deleteMemo(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    confirmDeleteMemo(memo).then(function (options) {
      if (!options) return;
      deleteMemoWithOptions(memo, options);
    });
  }

  function deleteMemoWithOptions(memo, options) {
    const memoId = memo.id;
    const preserveTodos = options.todoCount > 0 && !options.deleteTodos;
    const preservePromise = preserveTodos
      ? createMemoFromTodoItems(memo, commentsForMemo(memo.id))
      : Promise.resolve(null);

    preservePromise.then(
      function (preservedMemo) {
        deleteMemoInVault(memoId, {
          cleanupAssets: options.deleteFiles,
          deleteTasks: options.deleteTodos,
        }).then(
          function (result) {
            state.memos = state.memos.filter((item) => item.id !== memoId);
            state.comments = state.comments.filter(
              (comment) => comment.memoId !== memoId,
            );
            if (state.commentingMemoId === memoId) {
              state.commentingMemoId = "";
              state.commentDraft = "";
              state.commentPreviewVisible = false;
            }
            if (preservedMemo) {
              state.memos = [preservedMemo].concat(state.memos);
            }
            saveMemos(state.memos);
            renderAll();
            refreshTasksFromVault();
            if (
              result &&
              Array.isArray(result.assetErrors) &&
              result.assetErrors.length
            ) {
              showToast("已删除 memo，部分文件删除失败");
            } else if (preservedMemo) {
              showToast("已删除 memo，todo 已保留");
            } else if (result && result.tasksDeleted) {
              showToast(`已删除 memo 和 ${result.tasksDeleted} 个任务`);
            } else {
              showToast("已删除 memo");
            }
          },
          function (err) {
            showToast("删除失败: " + errorMessage(err));
            if (preservedMemo) refreshMemosFromVault();
          },
        );
      },
      function (err) {
        showToast("保留 todo 失败: " + errorMessage(err));
      },
    );
  }

  function createMemoFromTodoItems(memo, comments = []) {
    const todoLines = [memo]
      .concat(Array.isArray(comments) ? comments : [])
      .flatMap(function (source) {
        const lines = String((source && source.content) || "")
          .replace(/\r\n/g, "\n")
          .split("\n");
        let activeFence = null;
        return lines.filter(function (line) {
          const fence = parseMemoFenceLine(line);
          if (activeFence) {
            if (fence && isMemoFenceClosingLine(line, activeFence))
              activeFence = null;
            return false;
          }
          if (fence) {
            activeFence = fence;
            return false;
          }
          return parseTaskLine(line);
        });
      });
    const content = todoLines.join("\n").trim();
    if (!content) return Promise.resolve(null);
    return createMemoInVault(
      content,
      memo.visibility || DEFAULT_VISIBILITY,
      memo.projectId || "",
      Boolean(memo.private),
    ).then(function (created) {
      const normalized = normalizeMemoPayload(created);
      if (!normalized) throw new Error("无法创建 todo memo");
      return normalized;
    });
  }

  function confirmDeleteMemo(memo) {
    const fileCount = collectManagedResources(
      [memo].concat(commentsForMemo(memo.id)),
    ).length;
    const todoCount = collectTodos(
      [memo].concat(commentsForMemo(memo.id)),
    ).length;

    return new Promise(function (resolve) {
      const dialog = document.createElement("div");
      dialog.className =
        "tn-overlay tn-dialog-layer is-open memo-delete-dialog";
      dialog.dataset.n = "memo-delete-dialog-host";
      const options = [];
      if (fileCount) {
        options.push({
          attribute: "data-delete-files",
          detail: fileCount + " 个已上传资源",
          title: "同时删除文件和图片",
        });
      }
      if (todoCount) {
        options.push({
          attribute: "data-delete-todos",
          detail: todoCount + " 个 todo",
          title: "同时删除 todo 项",
        });
      }
      renderTimelessView(
        dialog,
        ConfirmDeleteView({
          description: compactText(memoTitle(memo), 72),
          meaning: "memo-delete-dialog",
          options,
          title: "删除 memo？",
        }),
      );
      root.appendChild(dialog);

      function close(value) {
        document.removeEventListener("keydown", handleKeydown);
        unmountTimelessView(dialog);
        dialog.remove();
        resolve(value);
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          close(null);
        }
      }

      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          close(null);
          return;
        }
        const action = closestElement(
          event.target,
          "[data-delete-dialog-action]",
        );
        if (!action || !dialog.contains(action)) return;
        if (action.dataset.deleteDialogAction === "cancel") {
          close(null);
          return;
        }
        const filesInput = dialog.querySelector("[data-delete-files]");
        const todosInput = dialog.querySelector("[data-delete-todos]");
        close({
          deleteFiles: filesInput ? filesInput.checked : true,
          deleteTodos: todosInput ? todosInput.checked : true,
          fileCount,
          todoCount,
        });
      });

      document.addEventListener("keydown", handleKeydown);
      window.requestAnimationFrame(function () {
        const cancel = dialog.querySelector(
          '[data-delete-dialog-action="cancel"]',
        );
        if (cancel) cancel.focus();
      });
    });
  }

  function collectManagedResources(memos) {
    const seen = new Set();
    return collectResources(memos).filter(function (resource) {
      const asset = parseAssetReference(resource.url);
      if (!asset) return false;
      const key = asset.storageId + "/" + asset.key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function copyMemo(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    copyText(memo.content).then(
      function () {
        showToast("已复制");
      },
      function () {
        showToast("复制失败");
      },
    );
  }

  function copyMemoRef(memoId) {
    const memo = findMemo(memoId);
    if (!memo) return;
    copyText(`[[memo:${memo.id}|${memoReferenceAlias(memoTitle(memo))}]]`).then(
      () => showToast("已复制 memo 引用"),
      () => showToast("复制失败"),
    );
  }

  function copyComment(commentId) {
    const comment = findComment(commentId);
    if (!comment) return;
    copyText(comment.content).then(
      function () {
        showToast("已复制");
      },
      function () {
        showToast("复制失败");
      },
    );
  }

  function copyCodeBlock(action) {
    copyCodeBlockFromAction(action, scopedMemoDocuments(), showToast);
  }

  function copyLink(action) {
    const linkCard = closestElement(action, "[data-link-url]");
    const url = linkCard && linkCard.dataset ? linkCard.dataset.linkUrl : "";
    if (!url) return;
    copyText(url).then(
      () => showToast("已复制链接"),
      () => showToast("复制失败"),
    );
  }

  function fetchLinkTitle(action) {
    var linkCard = closestElement(action, "[data-link-url]");
    var url = linkCard && linkCard.dataset ? linkCard.dataset.linkUrl : "";
    if (!url) return;

    action.disabled = true;
    action.classList.add("is-loading");

    callNativeAPI("/api/links/fetch-title", {
      method: "POST",
      args: { url: url },
    })
      .then(function (data) {
        var title = data && data.title ? String(data.title).trim() : "";
        if (title) {
          state.linkTitles[url] = title;
          saveLinkTitles(state.linkTitles);
          renderLinks();
          showToast("已获取标题");
        } else {
          renderFetchTitleLog(url, data || {});
        }
      })
      .catch(function (err) {
        renderFetchTitleLog(url, {
          ok: false,
          url: url,
          error: (err && err.message) || "网络错误",
        });
      })
      .finally(function () {
        action.disabled = false;
        action.classList.remove("is-loading");
      });
  }

  function renderFetchTitleLog(url, data) {
    closeFetchTitleLog();
    var host = document.createElement("div");
    host.setAttribute("data-fetch-title-log-host", "true");
    host.setAttribute("data-n", "fetch-title-log-host");
    root.appendChild(host);
    renderTimelessView(
      host,
      FetchTitleLogView(fetchTitleLogPresentation(url, data)),
    );

    host.addEventListener("click", function (event) {
      var overlay = closestElement(event.target, "[data-fetch-title-log]");
      if (overlay && event.target === overlay) closeFetchTitleLog();
      var closeBtn = closestElement(
        event.target,
        "[data-fetch-title-log-close]",
      );
      if (closeBtn) closeFetchTitleLog();
      var copyBtn =
        closestElement(event.target, "[data-copy-html-path]") ||
        closestElement(event.target, "[data-copy-raw-path]");
      if (copyBtn) {
        var copyPath =
          copyBtn.dataset.copyHtmlPath || copyBtn.dataset.copyRawPath || "";
        copyText(copyPath).then(
          function () {
            showToast("已复制文件路径");
          },
          function () {
            showToast("复制失败");
          },
        );
      }
    });
  }

  function closeFetchTitleLog() {
    var host = root.querySelector("[data-fetch-title-log-host]");
    if (!host) return;
    unmountTimelessView(host);
    host.remove();
  }

  function fetchTitleLogPathRow(label, path, path_attribute) {
    return {
      label: label,
      path: path,
      pathAttribute: path_attribute,
      value: path,
    };
  }

  function fetchTitleLogPresentation(url, data) {
    var ok = data.ok === true;
    var statusCode = data.status_code || 0;
    var contentType = data.content_type || "";
    var bodySize = data.body_size || 0;
    var title = data.title || "";
    var titleFound = data.title_found === true;
    var titleSource = data.title_source || "";
    var error = data.error || "";
    var preview = data.html_preview || "";
    var htmlPath = data.html_path || "";
    var rawPath = data.raw_path || "";

    var rows = [
      { label: "URL", value: url },
      {
        label: "状态",
        value: ok ? "✓ 请求成功" : "✗ " + (error || "请求失败"),
        ok: ok,
      },
    ];

    if (statusCode) {
      rows.push({
        label: "HTTP 状态码",
        value: String(statusCode),
        ok: statusCode >= 200 && statusCode < 400,
      });
    }
    if (contentType) {
      rows.push({ label: "Content-Type", value: contentType });
    }
    if (bodySize) {
      rows.push({
        label: "响应大小",
        value:
          bodySize >= 1024
            ? (bodySize / 1024).toFixed(1) + " KB"
            : bodySize + " bytes",
      });
    }
    if (ok) {
      var extractMsg = titleFound
        ? "✓ 找到标题" + (titleSource ? " (" + titleSource + ")" : "")
        : "✗ 未找到任何标题标签 (<title>, og:title, twitter:title)";
      rows.push({ label: "标题提取", value: extractMsg, ok: titleFound });
      if (title) {
        rows.push({ label: "标题内容", value: title });
      }
      if (preview) {
        rows.push({ label: "HTML 预览", value: preview, mono: true });
      }
      if (htmlPath) {
        rows.push(
          fetchTitleLogPathRow("已解析 HTML", htmlPath, "data-copy-html-path"),
        );
      }
      if (rawPath) {
        rows.push(
          fetchTitleLogPathRow("原始响应数据", rawPath, "data-copy-raw-path"),
        );
      }
    }
    return { rows: rows };
  }

  function insertFiles(files) {
    if (!files || files.length === 0) return;
    if (composerEditor.insertFiles) {
      composerEditor.insertFiles(files);
    } else {
      filesToMarkdown(files)
        .then(function (markdown) {
          if (markdown) composerEditor.insertBlock(markdown);
        })
        .catch(function (err) {
          showToast(uploadErrorMessage(err));
        });
    }
    composerEditor.focus();
  }

  function requestFilesForComposer(accept) {
    if (composerEditor && composerEditor.requestFiles) {
      composerEditor.requestFiles(accept || "");
      return;
    }
    if (accept) els.attachInput.setAttribute("accept", accept);
    else els.attachInput.removeAttribute("accept");
    els.attachInput.click();
  }

  function renderAll() {
    root
      .querySelectorAll(
        '[data-n="board-rule-condition-row"], [data-n="board-rule-action-row"]',
      )
      .forEach(function (host) {
        unmountTimelessView(host);
      });
    state.memoRefIndex = buildMemoReferenceIndex(state.memos);
    renderMainChrome();
    renderProjects();
    renderComposerProjectSelect();
    renderViewButtons();
    renderFilterButtons();
    renderCalendar();
    renderTags();
    renderPinned();
    renderMainContent();
    renderPinDialog();
    if (memoQuickSearchModel.snapshot().open) {
      syncMemoQuickSearchSources();
      renderMemoSearchPalette();
    }
  }

  function syncMemoCardMenus(menuState) {
    const openMemoId = String(menuState?.openMemoId || "");
    root.querySelectorAll("[data-memo-more]").forEach(function (wrapper) {
      const open = Boolean(openMemoId && wrapper.dataset.memoId === openMemoId);
      const trigger = wrapper.querySelector('[data-action="toggleMemoMore"]');
      const menu = wrapper.querySelector("[data-memo-more-menu]");
      wrapper.classList.toggle("is-open", open);
      if (trigger) trigger.setAttribute("aria-expanded", String(open));
      if (menu) menu.hidden = !open;
    });
  }

  function handleMemoMorePointerDown(event) {
    const openMemoId = memoCardMenuModel.state.openMemoId;
    if (!openMemoId) return;
    const wrapper = closestElement(event.target, "[data-memo-more]");
    if (wrapper && wrapper.dataset.memoId === openMemoId) return;
    memoCardMenuModel.close();
  }

  function renderMainChrome() {
    const viewMeta = activeViewMeta(state.activeView);
    const isProjectDetail = state.activeView === "project-detail";
    const mainEyebrow = root.querySelector("[data-main-eyebrow]");
    if (mainEyebrow)
      mainEyebrow.textContent = viewMeta.eyebrow || "THREAD / INBOX";
    els.mainTitle.textContent = viewMeta.title;
    els.mainSubtitle.textContent = viewMeta.subtitle;
    els.composer.classList.toggle("hidden", viewMeta.hideComposer);
    els.searchInput.placeholder = viewMeta.searchPlaceholder;
    // The timeline, slim-window, GTD-window, and sort shortcuts belong to the
    // Inbox context only. Page metadata owns this visibility policy so new
    // collection views stay clean by default.
    if (els.topbarDefaultActions)
      els.topbarDefaultActions.hidden = !viewMeta.showHomeActions;
    if (els.topbarProjectActions)
      els.topbarProjectActions.hidden = !isProjectDetail;
    // Toggle feed-tools search bar (hidden in project detail, search is in memo tab)
    var feedTools = root.querySelector(".memo-feed-tools");
    if (feedTools)
      feedTools.hidden = isProjectDetail || state.activeView === "chat";
    // Flex layout for project-detail so the content fills remaining height
    if (els.memoMain) {
      els.memoMain.classList.toggle("is-project-detail", isProjectDetail);
      if (!isProjectDetail)
        els.memoMain.classList.remove("is-project-board-active");
    }
    els.memoList.classList.toggle(
      "is-todo-list",
      state.activeView === "todos" ||
        state.activeView === "items" ||
        state.activeView === "milestones",
    );
    els.memoList.classList.toggle(
      "is-resource-list",
      state.activeView === "links" ||
        state.activeView === "files" ||
        state.activeView === "codeblocks",
    );
    els.memoList.classList.toggle("is-file-grid", state.activeView === "files");
    els.memoList.classList.toggle(
      "is-image-grid",
      state.activeView === "images",
    );
    els.memoList.classList.toggle(
      "is-clipboard-list",
      state.activeView === "clipboard",
    );
    els.memoList.classList.toggle("is-project-detail", isProjectDetail);
    els.memoList.classList.toggle(
      "is-board-list",
      state.activeView === "boards",
    );
    els.memoList.classList.toggle(
      "is-rules-overview",
      state.activeView === "rules",
    );
    els.memoList.classList.toggle("is-acp-chat", state.activeView === "chat");
    if (els.codeBlocksShowAll) {
      els.codeBlocksShowAll.hidden = state.activeView !== "codeblocks";
      els.codeBlocksShowAll.checked = codeBlocksModel.state.showAll;
    }
    // Show inspector only on Inbox (memos) page
    var isInbox = state.activeView === "memos";
    if (els.memoShell) els.memoShell.classList.toggle("no-inspector", !isInbox);
    if (els.memoInspector) els.memoInspector.hidden = !isInbox;
  }

  function renderMainContent() {
    if (state.activeView !== "project-detail")
      disconnectProjectScrollObserver();
    if (state.activeView !== "chat" && acpChatController) {
      acpChatController.destroy();
      acpChatController = null;
    }
    if (state.activeView !== "memos" && commentEditor) {
      commentEditor.destroy();
      commentEditor = null;
      commentEditorMemoId = "";
    }
    if (state.activeView !== "memos" && commentEditEditor) {
      commentEditEditor.destroy();
      commentEditEditor = null;
      commentEditEditorCommentId = "";
    }
    switch (state.activeView) {
      case "todos":
        renderTodos();
        return;
      case "items":
        renderGTDItems();
        return;
      case "milestones":
        renderGTDMilestones();
        return;
      case "links":
        renderLinks();
        return;
      case "codeblocks":
        renderCodeBlocks();
        return;
      case "files":
        renderFiles();
        return;
      case "images":
        renderImages();
        return;
      case "clipboard":
        renderClipboardView();
        return;
      case "project-detail":
        renderProjectDetail();
        return;
      case "boards":
        renderBoards();
        return;
      case "rules":
        renderRulesOverview();
        return;
      case "chat":
        renderACPChat();
        return;
      default:
        renderFeed();
    }
  }

  function renderACPChat() {
    if (acpChatController) return;
    unmountTimelessView(els.memoList);
    acpChatController = mountACPChat(els.memoList);
  }

  function syncEditDraftFromEditor() {
    if (!editEditor || !state.editingId || editEditorMemoId !== state.editingId)
      return;
    state.editDraft = editEditor.getText();
  }

  function syncCommentDraftFromEditor() {
    if (
      !commentEditor ||
      !state.commentingMemoId ||
      commentEditorMemoId !== state.commentingMemoId
    )
      return;
    state.commentDraft = commentEditor.getText();
  }

  function syncCommentEditDraftFromEditor() {
    if (
      !commentEditEditor ||
      !state.commentEditingId ||
      commentEditEditorCommentId !== state.commentEditingId
    )
      return;
    state.commentEditDraft = commentEditEditor.getText();
  }

  function renderProjects() {
    // Populate sidebar project list (real projects only, for navigation)
    if (els.projectList) {
      const activeProjects = state.projects.filter(
        (project) => !project.archived,
      );
      renderTimelessView(
        els.projectList,
        ProjectListView({
          projects: activeProjects.map(function (project) {
            return {
              active:
                state.activeView === "project-detail" &&
                state.activeProjectId === project.id,
              color: projectThemeColor(project.color),
              count: projectMemoCount(project.id),
              id: project.id,
              name: project.name,
            };
          }),
        }),
      );
    }

    // Populate feed-tools project filter select (includes "all" and "unassigned")
    if (els.projectFilterSelect) {
      const activeProjects = state.projects.filter(
        (project) => !project.archived,
      );
      const unassignedCount = state.memos.filter(
        (memo) => !memo.projectId && !memo.archived,
      ).length;
      const totalCount = state.memos.filter((memo) => !memo.archived).length;
      const currentValue = els.projectFilterSelect.value;
      renderTimelessView(
        els.projectFilterSelect,
        ProjectOptionsView({
          baseOptions: [
            { count: totalCount, kind: "all", label: "全部", value: "all" },
            {
              count: unassignedCount,
              kind: "unassigned",
              label: "未归属",
              value: "unassigned",
            },
          ],
          projects: activeProjects.map(function (project) {
            return {
              color: projectThemeColor(project.color),
              count: projectMemoCount(project.id),
              label: project.name,
              value: project.id,
            };
          }),
          selected: currentValue,
        }),
      );
      const optionExists = Array.from(
        els.projectFilterSelect.options || [],
      ).some((option) => option.value === currentValue);
      els.projectFilterSelect.value = optionExists
        ? currentValue
        : state.activeProjectFilter || "all";
    }
  }

  function renderComposerProjectSelect() {
    if (!els.projectSelect) return;
    renderTimelessView(
      els.projectSelect,
      ProjectOptionsView({
        projects: state.projects
          .filter(function (project) {
            return !project.archived;
          })
          .map(function (project) {
            return {
              color: projectThemeColor(project.color),
              label: project.name,
              value: project.id,
            };
          }),
        selected: state.composerProjectId,
      }),
    );
    els.projectSelect.value = state.composerProjectId || "";
  }

  function renderViewButtons() {
    root.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.view === state.activeView,
      );
    });
    const documents = scopedMemoDocuments();
    const todoStats = getTaskStats(scopedTasks());
    const linkCount = collectLinks(documents).length;
    const codeBlocks = collectCodeBlocks(documents);
    const codeSnippetCount = codeBlocks.filter((block) => block.marked).length;
    const codeBlockCount = codeBlocks.length;
    const resourceCount = collectResources(documents).length;
    const openItemCount = scopedGTDItems().filter(
      (item) => item.status !== "closed" && item.status !== "resolved",
    ).length;
    const activeMilestoneCount = scopedGTDMilestones().filter(
      (milestone) =>
        milestone.status === "active" || milestone.status === "planned",
    ).length;
    els.todoNavCount.textContent = todoStats.open ? String(todoStats.open) : "";
    if (els.itemNavCount)
      els.itemNavCount.textContent = openItemCount ? String(openItemCount) : "";
    if (els.milestoneNavCount)
      els.milestoneNavCount.textContent = activeMilestoneCount
        ? String(activeMilestoneCount)
        : "";
    els.linkNavCount.textContent = linkCount ? String(linkCount) : "";
    if (els.codeNavCount)
      els.codeNavCount.textContent = codeBlockCount
        ? codeSnippetCount
          ? `${codeSnippetCount}/${codeBlockCount}`
          : String(codeBlockCount)
        : "";
    els.fileNavCount.textContent = resourceCount ? String(resourceCount) : "";
    const imageCount = collectResources(documents).filter(
      (resource) => resource.type === "image",
    ).length;
    if (els.imageNavCount)
      els.imageNavCount.textContent = imageCount ? String(imageCount) : "";
    if (els.clipboardNavCount)
      els.clipboardNavCount.textContent =
        state.clipboardItem && state.clipboardItem.id ? "1" : "";
    if (els.boardNavCount)
      els.boardNavCount.textContent = state.boards.length
        ? String(state.boards.length)
        : "";
    var totalRules = state.boards.reduce(function (sum, b) {
      return sum + (b.rules || []).length;
    }, 0);
    if (els.rulesNavCount)
      els.rulesNavCount.textContent = totalRules ? String(totalRules) : "";
  }

  function renderFilterButtons() {
    const activeMemoCount = scopedMemos().filter(
      (memo) => !memo.archived,
    ).length;
    els.allNavCount.textContent = String(activeMemoCount);
    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle(
        "is-active",
        state.activeView === "memos" &&
          button.dataset.filter === state.activeFilter &&
          !state.activeTag,
      );
    });
  }

  function renderCalendar() {
    smallCalendarModel.setData({
      dateCounts: memoDateCounts(scopedMemos()),
      weekStart: calendarWeekStart(),
    });
  }

  function renderTags() {
    const tags = collectTags(scopedMemos().filter((memo) => !memo.archived));
    els.tagSummary.textContent = tags.length
      ? `${tags.length} 个标签`
      : "暂无标签";
    renderTimelessView(
      els.tagList,
      TagListView({
        tags: tags.map(function ([tag, count]) {
          return { active: state.activeTag === tag, count, tag };
        }),
      }),
    );
  }

  function renderPinned() {
    const pinned = scopedMemos()
      .filter((memo) => memo.pinned && !memo.archived)
      .slice(0, 3);
    renderTimelessView(
      els.pinnedList,
      PinnedMemoListView({
        memos: pinned.map(function (memo) {
          return memoCardPresentation(memo, {
            readonly: true,
            showLineNumbers: false,
          });
        }),
      }),
    );
    syncMemoExpandControls();
  }

  function handleMemoListScroll() {
    const container = els.memoList.parentElement;
    if (!container) return;
    if (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 80
    ) {
      if (state.activeView === "memos") {
        const memos = visibleMemos();
        const maxPage = Math.ceil(memos.length / FEED_PAGE_SIZE);
        if (state.feedPage >= maxPage) return;
        state.feedPage++;
        appendFeedPage();
      } else if (state.activeView === "links") {
        const links = visibleLinks();
        const maxPage = Math.ceil(links.length / LINKS_PAGE_SIZE);
        if (state.linksPage >= maxPage) return;
        state.linksPage++;
        appendLinksPage();
      } else if (state.activeView === "codeblocks") {
        appendCodeBlocksPage();
      } else if (
        state.activeView === "project-detail" &&
        typeof window.IntersectionObserver !== "function" &&
        (state.projectActiveTab === "memos" ||
          state.projectActiveTab === "tasks") &&
        projectDetailPaginationModel.loadNext(state.projectActiveTab)
      ) {
        renderProjectDetail();
      }
    }
  }

  function appendFeedPage() {
    const memos = visibleMemos();
    const start = (state.feedPage - 1) * FEED_PAGE_SIZE;
    const end = state.feedPage * FEED_PAGE_SIZE;
    const page = memos.slice(start, end);
    if (page.length === 0) return;
    renderFeedCollection();
    syncMemoExpandControls();
  }

  function appendLinksPage() {
    const links = visibleLinks();
    const start = (state.linksPage - 1) * LINKS_PAGE_SIZE;
    const end = state.linksPage * LINKS_PAGE_SIZE;
    const page = links.slice(start, end);
    if (page.length === 0) return;

    renderLinksCollection();
  }

  function appendCodeBlocksPage() {
    const nextPage = codeBlocksModel.loadNext(visibleCodeBlocks());
    if (nextPage.items.length === 0) return;

    renderCodeBlocksCollection();
  }

  function disconnectProjectScrollObserver() {
    if (!projectScrollObserver) return;
    projectScrollObserver.disconnect();
    projectScrollObserver = null;
  }

  function observeProjectScrollLoader() {
    disconnectProjectScrollObserver();
    if (typeof window.IntersectionObserver !== "function") return;
    if (
      state.projectActiveTab !== "memos" &&
      state.projectActiveTab !== "tasks"
    )
      return;
    const collection = state.projectActiveTab;
    const loader = els.memoList.querySelector(
      `[data-project-scroll-loader="${collection}"]`,
    );
    const container = els.memoList.parentElement;
    if (!loader || !container) return;
    projectScrollObserver = new window.IntersectionObserver(
      function (entries) {
        const visible = entries.some(function (entry) {
          return entry.isIntersecting;
        });
        if (
          !visible ||
          state.activeView !== "project-detail" ||
          state.projectActiveTab !== collection
        )
          return;
        if (projectDetailPaginationModel.loadNext(collection))
          renderProjectDetail();
      },
      {
        root: container,
        rootMargin: "0px 0px 80px 0px",
      },
    );
    projectScrollObserver.observe(loader);
  }

  function renderProjectDetail() {
    if (els.memoMain) els.memoMain.classList.remove("is-project-board-active");
    const project = state.projects.find(
      (p) => p.id === state.activeProjectId && !p.archived,
    );
    if (!project) {
      disconnectProjectScrollObserver();
      renderTimelessView(
        els.memoList,
        EmptyStateView({
          meaning: "project-detail-empty",
          message: "项目不存在或已归档",
        }),
      );
      return;
    }
    // Populate topbar project actions
    if (els.topbarProjectActions) {
      renderTimelessView(
        els.topbarProjectActions,
        ProjectActionsView({ projectId: project.id }),
      );
    }
    const projectSelection = projectDetailPaginationModel.select({
      memos: state.memos,
      projectId: state.activeProjectId,
      query: state.query,
      tasks: state.tasks,
    });
    const projectMemos = projectSelection.memos.items;
    const projectTasks = projectSelection.tasks.items;
    const allProjectTasks = projectSelection.allTasks;
    const projectBoards = state.boards.filter(
      (board) => board.projectId === state.activeProjectId,
    );
    const isProjectBoardTab = projectBoards.some(
      (board) => board.id === state.projectActiveTab,
    );
    if (els.memoMain) {
      els.memoMain.classList.toggle(
        "is-project-board-active",
        isProjectBoardTab,
      );
      if (isProjectBoardTab) els.memoMain.scrollTop = 0;
    }
    els.mainTitle.textContent = project.name;
    els.mainSubtitle.textContent = `${projectSelection.memos.total} 条 memo · ${projectSelection.tasks.total} 个待办`;
    const board_presentations = projectBoards.map(function (board) {
      var tasksByColumn = {};
      board.columns.forEach(function (col) {
        tasksByColumn[col.id] = [];
      });
      var boardTaskIds = {};
      state.tasks.forEach(function (task) {
        if (task.boardId !== board.id) return;
        var col = findTaskColumn(board, task);
        var key = col ? col.id : board.columns[0].id;
        if (tasksByColumn.hasOwnProperty(key)) {
          tasksByColumn[key].push(task);
          boardTaskIds[task.id] = true;
        }
      });
      var projectTasksNotOnBoard = allProjectTasks.filter(function (task) {
        return !boardTaskIds[task.id];
      });
      return {
        columnCount: board.columns.length,
        id: board.id,
        title: board.title,
        view: boardView(
          board,
          tasksByColumn,
          projectTasksNotOnBoard.map(taskPresentation),
        ),
      };
    });
    renderTimelessView(
      els.memoList,
      ProjectDetailView({
        activeTab: state.projectActiveTab,
        boards: board_presentations,
        memoHasMore: projectSelection.memos.hasMore,
        memos: projectMemos.map(safeMemoView),
        memoTotal: projectSelection.memos.total,
        presets: state.boardPresets,
        projectId: project.id,
        projects: projectOptionsPresentation(),
        query: state.query,
        showPresets: Boolean(
          state.boardPresetsOpen && state.boardPresetsProjectId,
        ),
        taskHasMore: projectSelection.tasks.hasMore,
        tasks: projectTasks.map(taskPresentation),
        taskTotal: projectSelection.tasks.total,
      }),
    );
    syncMemoExpandControls();
    observeProjectScrollLoader();
  }

  function renderFeed() {
    state.feedPage = 1;
    if (commentEditor) {
      if (
        state.commentingMemoId &&
        state.commentingMemoId === commentEditorMemoId
      ) {
        syncCommentDraftFromEditor();
      }
      commentEditor.destroy();
      commentEditor = null;
      commentEditorMemoId = "";
    }
    if (commentEditEditor) {
      if (
        state.commentEditingId &&
        state.commentEditingId === commentEditEditorCommentId
      ) {
        syncCommentEditDraftFromEditor();
      }
      commentEditEditor.destroy();
      commentEditEditor = null;
      commentEditEditorCommentId = "";
    }
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    renderFeedCollection();

    if (state.editingId) {
      const memo = findMemo(state.editingId);
      const host = els.memoList.querySelector("[data-edit-host]");
      const statusHost = els.memoList.querySelector("[data-edit-vim-status]");
      if (memo && host) {
        editEditor = createMiniEditor(host, {
          memoItems() {
            return state.memos;
          },
          tagItems: editorTagItems,
          onChange(value) {
            state.editDraft = value;
            renderEditPreview(memo.id);
          },
          onCommit() {
            return saveEdit(memo.id, { source: "vim-wq" });
          },
          onDiscard() {
            return discardEditDraft(memo.id, {
              exit: true,
              message: "草稿已丢弃",
            });
          },
          onQuit() {
            return exitEdit(memo.id);
          },
          onSave() {
            return writeEditDraft(memo.id);
          },
          onSubmit() {
            saveEdit(memo.id);
          },
          onWriteDraft() {
            return writeEditDraft(memo.id);
          },
          placeholder: "编辑 memo...",
          sourceMemoId: memo.id,
          value: state.editDraft,
          vim: editorVimEnabled(),
          vimStatusHost: statusHost,
        });
        editEditorMemoId = memo.id;
        editEditor.focus();
      }
    }

    if (state.commentingMemoId) {
      const memo = findMemo(state.commentingMemoId);
      const host = els.memoList.querySelector("[data-comment-host]");
      const statusHost = els.memoList.querySelector(
        "[data-comment-vim-status]",
      );
      if (memo && host) {
        commentEditor = createMiniEditor(host, {
          memoItems() {
            return state.memos;
          },
          tagItems: editorTagItems,
          onChange(value) {
            state.commentDraft = value;
            renderCommentPreview(memo.id);
          },
          onCommit() {
            return saveComment(memo.id, { source: "vim-wq" });
          },
          onDiscard() {
            return cancelComment({ message: "评论已取消" });
          },
          onQuit() {
            return exitComment(memo.id);
          },
          onSubmit() {
            return saveComment(memo.id);
          },
          placeholder: "添加评论...",
          sourceMemoId: memo.id,
          value: state.commentDraft,
          vim: editorVimEnabled(),
          vimStatusHost: statusHost,
        });
        commentEditorMemoId = memo.id;
        commentEditor.focus();
      }
    }

    if (state.commentEditingId) {
      const comment = findComment(state.commentEditingId);
      const host = els.memoList.querySelector("[data-comment-edit-host]");
      const editHost = host ? closestElement(host, ".memo-comment-edit") : null;
      const statusHost = editHost
        ? editHost.querySelector("[data-comment-edit-vim-status]")
        : null;
      if (comment && host) {
        commentEditEditor = createMiniEditor(host, {
          memoItems() {
            return state.memos;
          },
          tagItems: editorTagItems,
          onChange(value) {
            state.commentEditDraft = value;
            renderCommentEditPreview(comment.id);
          },
          onCommit() {
            return saveCommentEdit();
          },
          onDiscard() {
            return cancelCommentEdit({ message: "评论编辑已取消" });
          },
          onQuit() {
            return cancelCommentEdit();
          },
          onSubmit() {
            return saveCommentEdit();
          },
          placeholder: "编辑评论...",
          sourceMemoId: comment.memoId,
          value: state.commentEditDraft,
          vim: editorVimEnabled(),
          vimStatusHost: statusHost,
        });
        commentEditEditorCommentId = comment.id;
        commentEditEditor.focus();
      }
    }

    syncMemoExpandControls();
    renderEditablePreviews();
    syncMemoTaskCheckboxes();
  }

  function syncMemoTaskCheckboxes() {
    var checkboxes = els.memoList.querySelectorAll(
      'input[type="checkbox"][data-task-line][data-task-source-memo-id]',
    );
    var pending = [];
    checkboxes.forEach(function (checkbox) {
      if (checkbox.checked) return;
      var memoId = checkbox.dataset.taskSourceMemoId || "";
      var lineIndex = Number(checkbox.dataset.taskLine);
      if (!memoId || Number.isNaN(lineIndex)) return;
      // source.line is 1-based; data-task-line is 0-based
      var linkedTask = findLinkedTask(memoId, "", lineIndex + 1);
      if (linkedTask && linkedTask.status === "completed") {
        pending.push({
          checkbox: checkbox,
          memoId: memoId,
          line: lineIndex + 1,
        });
      }
    });
    if (!pending.length) return;
    // batch update all memos that need syncing
    var memosByContent = {};
    pending.forEach(function (entry) {
      var memo = findMemo(entry.memoId);
      if (!memo) return;
      var key = entry.memoId;
      if (!memosByContent[key]) {
        memosByContent[key] = {
          memo: memo,
          lines: memo.content.split("\n"),
          changed: false,
        };
      }
      var record = memosByContent[key];
      var idx = entry.line - 1;
      if (!record.lines[idx]) return;
      var updated = updateTaskLine(record.lines[idx], true);
      if (updated === record.lines[idx]) return;
      record.lines[idx] = updated;
      record.changed = true;
      setCheckboxControlValue(entry.checkbox, true);
    });
    Object.keys(memosByContent).forEach(function (memoId) {
      var record = memosByContent[memoId];
      if (!record.changed) return;
      var content = record.lines.join("\n");
      var patch = { content: content, updatedAt: new Date().toISOString() };
      state.memos = state.memos.map(function (item) {
        if (item.id !== memoId) return item;
        return Object.assign({}, item, patch);
      });
      updateMemoInVault(memoId, patch).catch(function (err) {
        showToast("同步 memo 代办失败: " + errorMessage(err));
      });
    });
  }

  function safeMemoView(memo) {
    try {
      return memoCardPresentation(memo);
    } catch (err) {
      return {
        error: "memo 渲染失败: " + errorMessage(err),
        id: memo.id,
      };
    }
  }

  function renderFeedCollection() {
    const memos = visibleMemos();
    const visible_count = state.feedPage * FEED_PAGE_SIZE;
    const paginated = memos.slice(0, visible_count);
    renderTimelessView(
      els.memoList,
      MemoFeedView({
        hasMore: paginated.length < memos.length,
        memos: paginated.map(safeMemoView),
        projects: projectOptionsPresentation(),
      }),
    );
  }

  function projectOptionsPresentation() {
    return state.projects
      .filter(function (project) {
        return !project.archived;
      })
      .map(function (project) {
        return {
          color: projectThemeColor(project.color),
          label: project.name,
          value: project.id,
        };
      });
  }

  function memoProjectPresentation(project_id) {
    const id = normalizeProjectID(project_id);
    if (!id) return null;
    const project = state.projects.find(function (item) {
      return item && item.id === id;
    });
    return {
      color: projectThemeColor(project && project.color),
      name: project ? project.name : "未知 Project",
    };
  }

  function memoStatsPresentation(memo) {
    const content = String((memo && memo.content) || "");
    const resources = collectResources([memo]);
    const stats = [Array.from(content).length + " 字符"];
    const files = resources.filter(function (resource) {
      return resource.type === "file";
    }).length;
    const images = resources.filter(function (resource) {
      return resource.type === "image";
    }).length;
    const todos = collectTodos([memo]).length;
    const code_blocks = collectCodeBlocks([memo]).length;
    const links = collectLinks([memo]).length;
    if (files) stats.push(files + " 文件");
    if (images) stats.push(images + " 图片");
    if (todos) stats.push(todos + " 代办");
    if (code_blocks) stats.push(code_blocks + " 代码块");
    if (links) stats.push(links + " 链接");
    return stats;
  }

  function memoTocPresentation(content) {
    const headings = collectMemoHeadings(content).filter(function (heading) {
      return heading && heading.text;
    });
    if (headings.length < 2) return [];
    const min_level = Math.min.apply(
      null,
      headings.map(function (heading) {
        return Number(heading.level) || 1;
      }),
    );
    return headings.map(function (heading) {
      const level = Math.max(1, Math.min(6, Number(heading.level) || 1));
      return {
        depth: Math.max(0, Math.min(5, level - min_level)),
        level,
        lineNumber: heading.lineNumber,
        text: heading.text,
      };
    });
  }

  function commentRenderPresentation(comment, render_context, options = {}) {
    const time = comment.updatedAt || comment.createdAt;
    const comment_id = String(comment.id || "").trim();
    const memo_id = String(comment.memoId || "").trim();
    const context = {
      ...render_context,
      readonly: false,
      showLineNumbers: false,
      sourceCommentId: comment_id,
      sourceId: comment_id || render_context.sourceId || "",
      sourceMemoId:
        memo_id || render_context.sourceMemoId || render_context.sourceId || "",
      sourceType: "comment",
      stack: comment_id ? [comment_id] : render_context.stack || [],
    };
    let html = "";
    try {
      html = renderMemoMarkdown(comment.content || "", context);
    } catch (_) {
      html = `<p>${escapeHTML(comment.content || "")}</p>`;
    }
    return {
      editing: comment.id === state.commentEditingId,
      hasHistory: Boolean(comment.updatedAt),
      html,
      id: comment.id,
      private: Boolean(comment.private && !state.privateUnlocked),
      reactions: Array.isArray(comment.reactions)
        ? comment.reactions.slice()
        : [],
      relativeTime: formatRelativeDate(time),
      replyCount: options.replyCount || 0,
      replyLabel: options.replyLabel || "",
      replyTitle: options.replyTitle || "",
      replyTo: comment.replyTo || "",
      time,
    };
  }

  function commentsPresentation(memo_id, render_context) {
    const comments = commentsForMemo(memo_id);
    const reply_counts = {};
    const comment_by_id = {};
    comments.forEach(function (comment) {
      if (!comment || !comment.id) return;
      reply_counts[comment.id] = 0;
      comment_by_id[comment.id] = comment;
    });
    comments.forEach(function (comment) {
      if (
        comment?.replyTo &&
        Object.prototype.hasOwnProperty.call(reply_counts, comment.replyTo)
      ) {
        reply_counts[comment.replyTo] += 1;
      }
    });
    const editing_index = state.commentEditingId
      ? comments.findIndex(function (comment) {
          return comment?.id === state.commentEditingId;
        })
      : -1;
    const expanded =
      state.expandedCommentListMemoIds.has(memo_id) || editing_index >= 3;
    const has_overflow = comments.length > 3;
    const visible_comments =
      has_overflow && !expanded ? comments.slice(0, 3) : comments;
    const presented = visible_comments.map(function (comment) {
      const parent = comment.replyTo ? comment_by_id[comment.replyTo] : null;
      let preview = parent
        ? String(parent.content || "")
            .replace(/\n/g, " ")
            .trim()
        : "";
      if (preview.length > 80) preview = preview.slice(0, 80) + "...";
      return commentRenderPresentation(comment, render_context, {
        replyCount: reply_counts[comment.id] || 0,
        replyLabel:
          preview || (comment.replyTo ? "comment:" + comment.replyTo : ""),
        replyTitle: preview || comment.replyTo || "",
      });
    });
    const hidden_count = Math.max(0, comments.length - visible_comments.length);
    return {
      all: comments,
      expanded,
      hasOverflow: has_overflow,
      toggleLabel: expanded
        ? "收起到 3 条"
        : "展开剩余 " + hidden_count + " 条评论",
      visible: presented,
    };
  }

  function memoCardPresentation(memo, context_options = {}) {
    const render_context = memoRenderContext(memo.id, context_options);
    const visibility =
      VISIBILITY[memo.visibility] || VISIBILITY[DEFAULT_VISIBILITY];
    const secret =
      memo.private && (memo.visibility || DEFAULT_VISIBILITY) === "PRIVATE";
    const display_visibility = secret
      ? VISIBILITY.SECRET || visibility
      : visibility;
    const private_visible = Boolean(memo.private && !state.privateUnlocked);
    const expanded = memoCardExpansionModel.isExpanded(memo.id);
    const headings = memoTocPresentation(memo.content);
    const comments = commentsPresentation(memo.id, render_context);
    let html = "";
    try {
      html = renderMemoMarkdown(memo.content, render_context);
    } catch (_) {
      html = `<p>${escapeHTML(memo.content || "")}</p>`;
    }
    const line_count = String(memo.content || "").split("\n").length;
    return {
      alias: memo.alias || "",
      archived: Boolean(memo.archived),
      backlinks: memoBacklinkCount(render_context, memo.id),
      className:
        "memo-card" +
        (memo.pinned ? " is-pinned" : "") +
        (memo.archived ? " is-archived" : "") +
        (private_visible ? " is-private" : ""),
      commentCount: comments.all.length,
      commentVisibility: state.commentVisibility,
      commenting: state.commentingMemoId === memo.id,
      comments: comments.all,
      commentsExpanded: comments.expanded,
      commentsOverflow: comments.hasOverflow,
      commentsToggleLabel: comments.toggleLabel,
      createdAt: memo.createdAt,
      editing: memo.id === state.editingId,
      editVisibility:
        memo.private && memo.visibility === "PRIVATE"
          ? "SECRET"
          : memo.visibility,
      expanded,
      hasHistory: Boolean(memo.updatedAt),
      hasToc: headings.length > 0,
      headings,
      html,
      id: memo.id,
      lineCount: line_count,
      moreOpen: memoCardMenuModel.isOpen(memo.id),
      pinned: Boolean(memo.pinned),
      private: private_visible,
      project: memoProjectPresentation(memo.projectId),
      projectId: memo.projectId || "",
      reactions: Array.isArray(memo.reactions) ? memo.reactions.slice() : [],
      relativeTime: formatRelativeDate(memo.createdAt),
      short: !expanded && line_count <= 36,
      showVisibility: Boolean(
        memo.visibility && memo.visibility !== DEFAULT_VISIBILITY,
      ),
      stats: memoStatsPresentation(memo),
      tags: extractTags(memo.content),
      tocVisible:
        headings.length > 0 &&
        (expanded || state.tocVisibleMemoIds.has(memo.id)),
      visibility: display_visibility,
      visibleComments: comments.visible,
    };
  }

  function syncMemoExpandControls() {
    const collapsibleItems = root.querySelectorAll("[data-memo-collapse]");
    collapsibleItems.forEach(function (item) {
      const content = item.querySelector(".memo-content");
      if (!content) return;

      if (item.classList.contains("is-collapsed")) {
        const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
        const measurement = memoCardExpansionModel.measureContent(
          content.scrollHeight,
          lineHeight,
        );
        item.classList.toggle("is-short", !measurement.hasOverflow);
        item.dataset.memoOverflow = String(measurement.hasOverflow);
        content.style.maxHeight = measurement.hasOverflow
          ? measurement.collapsedHeight + "px"
          : "";
      } else {
        item.classList.remove("is-short");
        item.dataset.memoOverflow = "false";
        content.style.maxHeight = "";
      }

      content.querySelectorAll("img").forEach(function (image) {
        if (image.complete) return;
        if (image.dataset.memoExpandWatch) return;
        image.dataset.memoExpandWatch = "true";
        image.addEventListener("load", syncMemoExpandControls, { once: true });
      });
    });
  }

  function renderTodos() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const tasks = visibleTasks();
    const groups = groupedVisibleTasks(tasks);
    const counts = taskFilterCounts(scopedTasks());
    const filters = [
      ["inbox", "Inbox"],
      ["today", "Today"],
      ["overdue", "已过期"],
      ["scheduled", "Scheduled"],
      ["next", "Next"],
      ["completed", "Completed"],
      ["all", "All"],
    ].map(function ([value, label]) {
      return {
        active: state.taskFilter === value,
        count: counts[value] || "",
        label,
        value,
      };
    });
    renderTimelessView(
      els.memoList,
      TaskCollectionsView({
        filters,
        groups: groups.map(function (group) {
          return {
            label: group.label,
            items: group.tasks.map(taskPresentation),
          };
        }),
        mode: "tasks",
      }),
    );
  }

  function renderGTDItems() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const items = visibleGTDItems();
    const groups = groupedVisibleGTDItems(items);
    renderTimelessView(
      els.memoList,
      TaskCollectionsView({
        groups: groups.map(function (group) {
          return {
            label: group.label,
            items: group.items.map(gtdItemPresentation),
          };
        }),
        milestones: scopedGTDMilestones().filter(function (item) {
          return item.status !== "completed" && item.status !== "cancelled";
        }),
        mode: "items",
      }),
    );
  }

  function renderGTDMilestones() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const milestones = visibleGTDMilestones();
    const groups = groupedVisibleGTDMilestones(milestones);
    renderTimelessView(
      els.memoList,
      TaskCollectionsView({
        groups: groups.map(function (group) {
          return {
            label: group.label,
            items: group.milestones.map(gtdMilestonePresentation),
          };
        }),
        mode: "milestones",
      }),
    );
  }

  function taskPresentation(task) {
    const complete = task.status === "completed";
    const priority_labels = { high: "高", low: "低", medium: "中", none: "" };
    const meta = [];
    if (task.projectId) meta.push({ label: projectLabel(task.projectId) });
    meta.push({ label: task.listId || "inbox" });
    if (task.parentId) meta.push({ label: "子任务" });
    if (task.dueAt)
      meta.push({
        datetime: task.dueAt,
        label: "截止 " + formatDateTime(taskDateValue(task.dueAt)),
        time: true,
      });
    if (task.startAt)
      meta.push({
        datetime: task.startAt,
        label: "开始 " + formatDateTime(taskDateValue(task.startAt)),
        time: true,
      });
    if (complete && task.completedAt) {
      meta.push({
        action: "editCompletedAt",
        class: "memo-task-completed-time",
        completedAt: task.completedAt,
        label: "完成 " + formatDateTime(taskDateValue(task.completedAt)),
        title: "点击编辑完成时间",
      });
    }
    if (task.noteCount) meta.push({ label: task.noteCount + " notes" });
    if (task.subtaskCount)
      meta.push({ label: task.subtaskCount + " subtasks" });
    const source = task.source || {};
    if (source.memoId) {
      meta.push({
        action: "openSourceMemo",
        commentId: source.commentId || "",
        label: "来源 Memo",
        memoId: source.memoId,
        title: "有关联 memo",
      });
    }
    (task.contexts || []).slice(0, 3).forEach(function (item) {
      meta.push({ label: "@" + item });
    });
    (task.tags || []).slice(0, 3).forEach(function (tag) {
      meta.push({ label: "#" + tag });
    });
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

  function gtdItemPresentation(item) {
    const closed = item.status === "closed" || item.status === "resolved";
    const type_labels = {
      bug: "Bug",
      chore: "杂项",
      feature: "功能",
      idea: "想法",
      question: "问题",
    };
    const status_labels = {
      closed: "已关闭",
      open: "Open",
      resolved: "已解决",
      triaged: "已澄清",
      waiting: "等待",
    };
    const milestone = state.gtdMilestones.find(function (entry) {
      return entry.id === item.milestoneId;
    });
    const meta = [];
    if (item.projectId) meta.push({ label: projectLabel(item.projectId) });
    meta.push({ label: status_labels[item.status] || "Open" });
    if (milestone) meta.push({ label: milestone.title });
    if (item.linkedTaskIds.length)
      meta.push({ label: item.linkedTaskIds.length + " tasks" });
    if (item.linkedMemoIds.length)
      meta.push({ label: item.linkedMemoIds.length + " memos" });
    (item.labels || []).slice(0, 4).forEach(function (label) {
      meta.push({ label: "#" + label });
    });
    if (item.createdAt)
      meta.push({
        datetime: item.createdAt,
        label: "创建 " + formatRelativeDate(item.createdAt),
        time: true,
      });
    const actions = [];
    if (item.status === "open")
      actions.push({
        action: "triageGTDItem",
        icon: "check",
        label: "标记已澄清",
      });
    if (!closed)
      actions.push({ action: "waitGTDItem", icon: "clock", label: "标记等待" });
    if (!closed)
      actions.push({ action: "closeGTDItem", icon: "archive", label: "关闭" });
    actions.push({
      action: "deleteGTDItem",
      danger: true,
      icon: "trash2",
      label: "删除",
    });
    return {
      actions,
      badge: type_labels[item.type] || "想法",
      complete: closed,
      id: item.id,
      meta,
      note: item.decision || "",
      priority: "none",
      title: item.title,
    };
  }

  function gtdMilestonePresentation(milestone) {
    const items = state.gtdItems.filter(function (item) {
      return (
        item.milestoneId === milestone.id || milestone.itemIds.includes(item.id)
      );
    });
    const tasks = state.tasks.filter(function (task) {
      return milestone.taskIds.includes(task.id);
    });
    const status_labels = {
      active: "进行中",
      cancelled: "已取消",
      completed: "已完成",
      planned: "计划中",
    };
    const meta = [];
    if (milestone.targetAt)
      meta.push({
        datetime: milestone.targetAt,
        label: "目标 " + formatDateTime(taskDateValue(milestone.targetAt)),
        time: true,
      });
    meta.push({
      label:
        items.filter(function (item) {
          return item.status !== "closed" && item.status !== "resolved";
        }).length + " open items",
    });
    meta.push({
      label:
        tasks.filter(function (task) {
          return !["completed", "cancelled", "archived"].includes(task.status);
        }).length + " open tasks",
    });
    meta.push(
      { label: items.length + " items" },
      { label: tasks.length + " tasks" },
    );
    const actions = [];
    if (milestone.status === "planned")
      actions.push({
        action: "activateGTDMilestone",
        icon: "check",
        label: "开始",
      });
    if (milestone.status !== "completed")
      actions.push({
        action: "completeGTDMilestone",
        icon: "archive",
        label: "完成",
      });
    return {
      actions,
      badge: status_labels[milestone.status] || "计划中",
      complete: milestone.status === "completed",
      id: milestone.id,
      meta,
      priority: "none",
      title: milestone.title,
    };
  }

  function refreshBoardsFromVault() {
    state.boardsLoading = true;
    return loadBoards()
      .then(function (boards) {
        state.boards = boards;
        state.boardsLoading = false;
        if (state.activeView === "boards" || state.activeView === "rules")
          renderAll();
      })
      .catch(function () {
        state.boardsLoading = false;
      });
  }

  function renderBoards() {
    if (state.activeBoardId) {
      var board = findBoard(state.activeBoardId);
      if (board) {
        renderBoard(board);
        return;
      }
      state.activeBoardId = "";
    }
    renderBoardList();
  }

  function renderBoardList() {
    renderTimelessView(
      els.memoList,
      BoardListView({
        boards: state.boards.map(function (board) {
          return {
            columnCount: board.columns.length,
            id: board.id,
            title: board.title,
          };
        }),
        presets: state.boardPresets,
        showPresets: state.boardPresetsOpen,
      }),
    );
  }

  function renderBoard(board) {
    var tasksByColumn = {};
    board.columns.forEach(function (col) {
      tasksByColumn[col.id] = [];
    });
    state.tasks.forEach(function (task) {
      if (task.boardId !== board.id) return;
      var col = findTaskColumn(board, task);
      var key = col ? col.id : board.columns[0].id;
      if (tasksByColumn.hasOwnProperty(key)) {
        tasksByColumn[key].push(task);
      }
    });
    renderTimelessView(els.memoList, boardView(board, tasksByColumn, null));
  }

  function boardView(board, tasks_by_column, available_tasks) {
    return BoardView({
      availableTasks: available_tasks || [],
      board: { id: board.id, title: board.title },
      columns: board.columns.map(function (column) {
        return {
          id: column.id,
          label: column.label,
          tasks: (tasks_by_column[column.id] || []).map(function (task) {
            return {
              boardId: task.boardId || board.id,
              complete: task.status === "completed",
              due: task.dueAt ? formatRelativeDate(task.dueAt) : "",
              id: task.id,
              priority: task.priority || "none",
              title: task.title,
            };
          }),
        };
      }),
      ruleEditor:
        state.boardRuleEditorOpen && state.boardRuleEditorBoardId === board.id
          ? boardRuleEditorPresentation(board)
          : null,
    });
  }

  function boardRuleEditorPresentation(board) {
    const rule = state.boardRuleEditorRuleId
      ? (board.rules || []).find(function (item) {
          return item.id === state.boardRuleEditorRuleId;
        }) || null
      : null;
    return {
      columns: board.columns,
      isNew: !rule,
      rule,
    };
  }

  function boardRuleTriggerLabel(rule, board) {
    const trigger = rule.trigger || {};
    const column = board.columns.find(function (item) {
      return item.id === trigger.columnId;
    });
    const from_column = board.columns.find(function (item) {
      return item.id === trigger.fromColumnId;
    });
    return (
      "进入 " +
      (column ? column.label : "任意列") +
      (trigger.fromColumnId
        ? " (来自 " +
          (from_column ? from_column.label : trigger.fromColumnId) +
          ")"
        : "")
    );
  }

  function boardRuleConditionLabel(rule) {
    return (rule.conditions || [])
      .map(function (condition) {
        if (condition.operator === "isEmpty") return condition.field + " 为空";
        if (condition.operator === "isNotEmpty")
          return condition.field + " 不为空";
        return (
          condition.field + " " + condition.operator + " " + condition.value
        );
      })
      .join(" AND ");
  }

  function boardRuleActionLabel(rule) {
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

  function boardRulesPresentation(board) {
    const rules = (board.rules || [])
      .slice()
      .sort(function (left, right) {
        return (left.order || 0) - (right.order || 0);
      })
      .map(function (rule) {
        return {
          actionLabel: boardRuleActionLabel(rule),
          conditionLabel: boardRuleConditionLabel(rule),
          enabled: rule.enabled !== false,
          id: rule.id,
          name: rule.name,
          triggerLabel: boardRuleTriggerLabel(rule, board),
        };
      });
    return { id: board.id, rules, title: board.title || board.id };
  }

  function findBoard(id) {
    for (var i = 0; i < state.boards.length; i++) {
      if (state.boards[i].id === id) return state.boards[i];
    }
    return null;
  }

  function selectBoard(boardId) {
    state.activeBoardId = boardId;
    loadBoards()
      .then(function (boards) {
        state.boards = boards;
        return refreshTasksFromVault({ render: false });
      })
      .then(function () {
        renderAll();
      });
  }

  function backToBoardList() {
    state.activeBoardId = "";
    renderAll();
  }

  function deleteExistingBoard(boardId) {
    var board = findBoard(boardId);
    if (!board) return;
    confirmDeleteBoard(board)
      .then(function (confirmed) {
        if (!confirmed) return;
        return deleteBoard(boardId).then(function () {
          state.activeBoardId = "";
          // Clear boardId from tasks that belonged to this board
          state.tasks.forEach(function (task) {
            if (task.boardId === boardId) {
              updateTask(task.id, { boardId: "" }).catch(function () {});
            }
          });
          showToast("看板已删除");
          return refreshBoardsFromVault();
        });
      })
      .catch(function (err) {
        showToast("删除失败: " + errorMessage(err));
      });
  }

  function confirmDeleteBoard(board) {
    return new Promise(function (resolve) {
      var dialog = document.createElement("div");
      dialog.className =
        "tn-overlay tn-dialog-layer is-open memo-delete-dialog";
      dialog.dataset.n = "board-delete-dialog-host";
      renderTimelessView(
        dialog,
        ConfirmDeleteView({
          actionAttribute: "data-board-delete-confirm",
          description: board.title + "。看板内的任务不会被删除。",
          meaning: "board-delete-dialog",
          title: "删除看板？",
        }),
      );
      root.appendChild(dialog);

      function close(confirmed) {
        document.removeEventListener("keydown", handleKeydown);
        unmountTimelessView(dialog);
        dialog.remove();
        resolve(confirmed);
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          close(false);
        }
      }

      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          close(false);
          return;
        }
        var action = closestElement(
          event.target,
          "[data-board-delete-confirm]",
        );
        if (!action || !dialog.contains(action)) return;
        close(action.dataset.boardDeleteConfirm === "confirm");
      });

      document.addEventListener("keydown", handleKeydown);
      window.requestAnimationFrame(function () {
        var cancel = dialog.querySelector(
          '[data-board-delete-confirm="cancel"]',
        );
        if (cancel) cancel.focus();
      });
    });
  }

  function showBoardPresets() {
    if (state.boardPresetsOpen) {
      state.boardPresetsOpen = false;
      renderAll();
      return;
    }
    if (state.boardPresets.length === 0) {
      loadBoardPresets()
        .then(function (presets) {
          state.boardPresets = presets;
          state.boardPresetsOpen = true;
          renderAll();
        })
        .catch(function () {
          showToast("加载模板失败");
        });
    } else {
      state.boardPresetsOpen = true;
      renderAll();
    }
  }

  function createBoardFromPreset(presetIndex) {
    var preset = state.boardPresets[presetIndex];
    if (!preset) return;
    createBoard({
      title: preset.title,
      columns: preset.columns,
      rules: preset.rules,
    })
      .then(function () {
        state.boardPresetsOpen = false;
        state.boardPresets = [];
        showToast("看板已创建");
        refreshBoardsFromVault();
      })
      .catch(function (err) {
        showToast("创建失败: " + errorMessage(err));
      });
  }

  function closeBoardPresets() {
    state.boardPresetsOpen = false;
    renderAll();
  }

  function showProjectBoardPresets(projectId) {
    if (!projectId) return;
    state.boardPresetsProjectId = projectId;
    if (state.boardPresets.length === 0) {
      loadBoardPresets()
        .then(function (presets) {
          state.boardPresets = presets;
          state.boardPresetsOpen = true;
          renderProjectDetail();
        })
        .catch(function () {
          showToast("加载模板失败");
        });
    } else {
      state.boardPresetsOpen = true;
      renderProjectDetail();
    }
  }

  function createProjectBoardFromPreset(presetIndex, projectId) {
    var preset = state.boardPresets[presetIndex];
    if (!preset || !projectId) return;
    console.log("[BoardPopulate] 开始从预设创建看板", {
      presetTitle: preset.title,
      projectId: projectId,
      presetColumns: preset.columns.map(function (c) {
        return c.id + ":" + c.label;
      }),
    });
    createBoard({
      title: preset.title,
      columns: preset.columns,
      projectId: projectId,
      rules: preset.rules,
    })
      .then(function (newBoard) {
        state.boardPresetsOpen = false;
        state.boardPresets = [];
        state.boardPresetsProjectId = "";
        showToast("看板已创建");
        return Promise.all([
          refreshBoardsFromVault(),
          refreshTasksFromVault({ render: false }),
        ]);
      })
      .then(function () {
        var freshBoard = state.boards.find(function (b) {
          return b.projectId === projectId;
        });
        if (freshBoard) state.projectActiveTab = freshBoard.id;
        renderProjectDetail();
      })
      .catch(function (err) {
        console.error("[BoardPopulate] 创建失败:", err);
        showToast("创建失败: " + errorMessage(err));
      });
  }

  function closeProjectBoardPresets() {
    state.boardPresetsOpen = false;
    state.boardPresetsProjectId = "";
    renderProjectDetail();
  }

  // ── Board Rule CRUD ──

  function openAddRuleDialog(boardId) {
    state.boardRuleEditorOpen = true;
    state.boardRuleEditorBoardId = boardId;
    state.boardRuleEditorRuleId = "";
    renderAll();
  }

  function closeRuleEditor() {
    state.boardRuleEditorOpen = false;
    state.boardRuleEditorBoardId = "";
    state.boardRuleEditorRuleId = "";
    renderAll();
  }

  function editRule(boardId, ruleId) {
    state.boardRuleEditorOpen = true;
    state.boardRuleEditorBoardId = boardId;
    state.boardRuleEditorRuleId = ruleId;
    renderAll();
  }

  function saveRule(form) {
    var boardId = state.boardRuleEditorBoardId;
    var board = findBoard(boardId);
    if (!board) return;
    var ruleId = state.boardRuleEditorRuleId;
    var name = String(controlGroupValue(form, "name") || "").trim();
    if (!name) {
      showToast("规则名称不能为空");
      return;
    }
    var triggerType = String(
      controlGroupValue(form, "triggerType") || "",
    ).trim();
    var triggerColumnId = String(
      controlGroupValue(form, "triggerColumnId") || "",
    ).trim();
    var triggerFromColumnId = String(
      controlGroupValue(form, "triggerFromColumnId") || "",
    ).trim();
    var enabled_control = form.querySelector('[name="enabled"]');
    var enabled = Boolean(enabled_control && enabled_control.checked);

    // Gather conditions
    var condFields = form.querySelectorAll(".board-rule-condition-row");
    var conditions = [];
    condFields.forEach(function (row) {
      var field = String(
        (row.querySelector("[data-cond-field]") || {}).value || "",
      ).trim();
      var operator = String(
        (row.querySelector("[data-cond-operator]") || {}).value || "",
      ).trim();
      var value = String(
        (row.querySelector("[data-cond-value]") || {}).value || "",
      ).trim();
      if (field && operator) {
        if (operator === "isEmpty" || operator === "isNotEmpty" || value) {
          conditions.push({ field: field, operator: operator, value: value });
        }
      }
    });

    // Gather actions
    var actionRows = form.querySelectorAll(".board-rule-action-row");
    var actions = [];
    actionRows.forEach(function (row) {
      var type = String(
        (row.querySelector("[data-action-type]") || {}).value || "",
      ).trim();
      if (!type) return;
      var params = {};
      if (type === "addTags" || type === "removeTags") {
        var tagsInput = String(
          (row.querySelector("[data-action-tags]") || {}).value || "",
        ).trim();
        params.tags = tagsInput
          ? tagsInput
              .split(",")
              .map(function (t) {
                return t.trim();
              })
              .filter(Boolean)
          : [];
      } else if (type === "setStatus") {
        params.status = String(
          (row.querySelector("[data-action-status]") || {}).value || "",
        ).trim();
      } else if (type === "setPriority") {
        params.priority = String(
          (row.querySelector("[data-action-priority]") || {}).value || "",
        ).trim();
      }
      actions.push({ type: type, params: params });
    });

    var rules = (board.rules || []).slice();
    if (ruleId) {
      // Edit existing rule
      for (var i = 0; i < rules.length; i++) {
        if (rules[i].id === ruleId) {
          rules[i] = {
            id: ruleId,
            name: name,
            enabled: enabled,
            trigger: {
              type: triggerType,
              columnId: triggerColumnId,
              fromColumnId: triggerFromColumnId,
            },
            conditions: conditions,
            actions: actions,
            order: rules[i].order,
          };
          break;
        }
      }
    } else {
      // New rule
      var newRule = {
        id:
          "rule_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).slice(2, 8),
        name: name,
        enabled: enabled,
        trigger: {
          type: triggerType,
          columnId: triggerColumnId,
          fromColumnId: triggerFromColumnId,
        },
        conditions: conditions,
        actions: actions,
        order: rules.length,
      };
      rules.push(newRule);
    }

    updateBoard(boardId, { rules: rules })
      .then(function (updatedBoard) {
        // Update local board cache
        for (var j = 0; j < state.boards.length; j++) {
          if (state.boards[j].id === boardId) state.boards[j] = updatedBoard;
        }
        closeRuleEditor();
        showToast("规则已保存");
      })
      .catch(function (err) {
        showToast("保存失败: " + errorMessage(err));
      });
  }

  function deleteRule(boardId, ruleId) {
    if (!confirm("确定要删除此规则吗？")) return;
    var board = findBoard(boardId);
    if (!board) return;
    var rules = (board.rules || []).filter(function (r) {
      return r.id !== ruleId;
    });
    updateBoard(boardId, { rules: rules })
      .then(function (updatedBoard) {
        for (var i = 0; i < state.boards.length; i++) {
          if (state.boards[i].id === boardId) state.boards[i] = updatedBoard;
        }
        renderAll();
        showToast("规则已删除");
      })
      .catch(function (err) {
        showToast("删除失败: " + errorMessage(err));
      });
  }

  function moveRuleUp(boardId, ruleId) {
    var board = findBoard(boardId);
    if (!board) return;
    var rules = (board.rules || []).slice();
    var idx = -1;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].id === ruleId) {
        idx = i;
        break;
      }
    }
    if (idx <= 0) return;
    var tmp = rules[idx].order;
    rules[idx].order = rules[idx - 1].order;
    rules[idx - 1].order = tmp;
    rules.sort(function (a, b) {
      return a.order - b.order;
    });
    // Re-assign order
    for (var j = 0; j < rules.length; j++) rules[j].order = j;
    updateBoard(boardId, { rules: rules })
      .then(function (updatedBoard) {
        for (var k = 0; k < state.boards.length; k++) {
          if (state.boards[k].id === boardId) state.boards[k] = updatedBoard;
        }
        renderAll();
      })
      .catch(function (err) {
        showToast("移动失败: " + errorMessage(err));
      });
  }

  function moveRuleDown(boardId, ruleId) {
    var board = findBoard(boardId);
    if (!board) return;
    var rules = (board.rules || []).slice();
    var idx = -1;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].id === ruleId) {
        idx = i;
        break;
      }
    }
    if (idx < 0 || idx >= rules.length - 1) return;
    var tmp = rules[idx].order;
    rules[idx].order = rules[idx + 1].order;
    rules[idx + 1].order = tmp;
    rules.sort(function (a, b) {
      return a.order - b.order;
    });
    for (var j = 0; j < rules.length; j++) rules[j].order = j;
    updateBoard(boardId, { rules: rules })
      .then(function (updatedBoard) {
        for (var k = 0; k < state.boards.length; k++) {
          if (state.boards[k].id === boardId) state.boards[k] = updatedBoard;
        }
        renderAll();
      })
      .catch(function (err) {
        showToast("移动失败: " + errorMessage(err));
      });
  }

  function renderRulesOverview() {
    const editor_board = state.boardRuleEditorOpen
      ? findBoard(state.boardRuleEditorBoardId)
      : null;
    renderTimelessView(
      els.memoList,
      BoardRulesOverviewView({
        boards: state.boards.map(boardRulesPresentation),
        ruleEditor: editor_board
          ? boardRuleEditorPresentation(editor_board)
          : null,
      }),
    );
  }

  function toggleRuleEnabled(boardId, ruleId) {
    var board = findBoard(boardId);
    if (!board) return;
    var rules = (board.rules || []).slice();
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].id === ruleId) {
        rules[i] = {
          id: rules[i].id,
          name: rules[i].name,
          enabled: !rules[i].enabled,
          trigger: rules[i].trigger,
          conditions: rules[i].conditions,
          actions: rules[i].actions,
          order: rules[i].order,
        };
        break;
      }
    }
    updateBoard(boardId, { rules: rules })
      .then(function (updatedBoard) {
        for (var j = 0; j < state.boards.length; j++) {
          if (state.boards[j].id === boardId) state.boards[j] = updatedBoard;
        }
        renderAll();
      })
      .catch(function (err) {
        showToast("操作失败: " + errorMessage(err));
      });
  }

  function addRuleConditionRow(container) {
    var row = document.createElement("div");
    row.className = "board-rule-condition-row";
    row.dataset.n = "board-rule-condition-row";
    renderTimelessView(row, BoardRuleConditionRowView());
    container.appendChild(row);
  }

  function addRuleActionRow(container) {
    var row = document.createElement("div");
    row.className = "board-rule-action-row";
    row.dataset.n = "board-rule-action-row";
    renderTimelessView(row, BoardRuleActionRowView());
    container.appendChild(row);
  }

  function handleBoardCreateSubmit(form) {
    if (!form) return;
    var title = String(controlGroupValue(form, "title") || "").trim();
    if (!title) return;
    createBoard({
      title: title,
      columns: [
        { id: "todo", label: "Todo", order: 0 },
        { id: "doing", label: "Doing", order: 1 },
        { id: "done", label: "Done", order: 2 },
      ],
    })
      .then(function () {
        clearControlGroup(form);
        showToast("看板已创建");
        refreshBoardsFromVault();
      })
      .catch(function (err) {
        showToast("创建失败: " + errorMessage(err));
      });
  }

  function handleBoardAddTaskSubmit(form, boardId) {
    if (!form) return;
    var title = String(controlGroupValue(form, "title") || "").trim();
    if (!title) return;
    var board = findBoard(boardId);
    if (!board || board.columns.length === 0) return;
    var firstColumnLabel = board.columns[0].label;
    var taskInput = {
      title: title,
      boardId: boardId,
      tags: [firstColumnLabel],
    };
    // If in project detail context, also assign the task to the project
    if (state.activeView === "project-detail" && state.activeProjectId) {
      taskInput.projectId = state.activeProjectId;
    }
    createTask(taskInput)
      .then(function () {
        clearControlGroup(form);
        showToast("任务已添加");
        refreshTasksFromVault().then(function () {
          renderAll();
        });
      })
      .catch(function (err) {
        showToast("添加失败: " + errorMessage(err));
      });
  }

  function removeFromBoard(taskId) {
    getTask(taskId)
      .then(function (task) {
        var boardId = task.boardId;
        var board = boardId ? findBoard(boardId) : null;
        var newTags = task.tags || [];
        if (board) {
          var boardLabels = {};
          board.columns.forEach(function (c) {
            boardLabels[c.label] = true;
          });
          newTags = newTags.filter(function (t) {
            return !boardLabels[t];
          });
        }
        return updateTask(taskId, { boardId: "", tags: newTags });
      })
      .then(function () {
        showToast("已移出看板");
        refreshTasksFromVault().then(function () {
          renderAll();
        });
      })
      .catch(function (err) {
        showToast("操作失败: " + errorMessage(err));
      });
  }

  function moveBoardTaskToColumn(taskId, board, targetColumn) {
    getTask(taskId)
      .then(function (task) {
        var fromColumn = findTaskColumn(board, task);
        var boardLabels = {};
        board.columns.forEach(function (c) {
          boardLabels[c.label] = true;
        });
        var columnTags = (task.tags || []).filter(function (t) {
          return !boardLabels[t];
        });
        columnTags.push(targetColumn.label);
        var rulePatch = evaluateBoardRules(
          "task.enterColumn",
          task,
          targetColumn,
          board,
          fromColumn,
        );
        var finalPatch = { tags: columnTags };
        if (rulePatch) {
          var originalTags = task.tags || [];
          if (rulePatch.tags) {
            var netAdded = rulePatch.tags.filter(function (t) {
              return originalTags.indexOf(t) === -1;
            });
            var netRemoved = {};
            originalTags.forEach(function (t) {
              if (rulePatch.tags.indexOf(t) === -1) netRemoved[t] = true;
            });
            var mergedTags = columnTags.filter(function (t) {
              return !netRemoved[t];
            });
            netAdded.forEach(function (t) {
              if (mergedTags.indexOf(t) === -1) mergedTags.push(t);
            });
            finalPatch.tags = mergedTags;
          }
          if (rulePatch.status !== undefined)
            finalPatch.status = rulePatch.status;
          if (rulePatch.priority !== undefined)
            finalPatch.priority = rulePatch.priority;
        }
        return updateTask(taskId, finalPatch);
      })
      .then(function () {
        refreshTasksFromVault().then(function () {
          renderAll();
        });
      })
      .catch(function (err) {
        showToast("操作失败: " + errorMessage(err));
      });
  }

  function handleBoardDragStart(event) {
    var card = event.target.closest(".memo-board-card");
    if (!card) return;
    var taskId = card.dataset.taskId;
    if (!taskId) return;
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  }

  function handleBoardDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    var column = event.target.closest("[data-column-drop]");
    if (column) {
      column.classList.add("is-drop-target");
    }
  }

  function handleBoardDragLeave(event) {
    var column = event.target.closest("[data-column-drop]");
    if (column && !column.contains(event.relatedTarget)) {
      column.classList.remove("is-drop-target");
    }
  }

  function handleBoardDrop(event) {
    event.preventDefault();
    var column = event.target.closest("[data-column-drop]");
    if (!column) return;
    column.classList.remove("is-drop-target");
    var columnId = column.dataset.columnDrop;
    var taskId = event.dataTransfer.getData("text/plain");
    if (!taskId || !columnId) return;
    var boardNode = column.closest("[data-board-id]");
    var boardId = boardNode ? boardNode.dataset.boardId : "";
    var board = findBoard(boardId);
    if (!board) return;
    var targetColumn = board.columns.find(function (c) {
      return c.id === columnId;
    });
    if (!targetColumn) return;
    moveBoardTaskToColumn(taskId, board, targetColumn);
  }

  function handleBoardDragEnd(event) {
    var card = event.target.closest(".memo-board-card");
    if (card) {
      card.classList.remove("is-dragging");
    }
    root
      .querySelectorAll("[data-column-drop].is-drop-target")
      .forEach(function (col) {
        col.classList.remove("is-drop-target");
      });
  }

  function handleBoardTaskSelect(event) {
    var select = event.target.closest("[data-board-task-select]");
    if (!select || !root.contains(select)) return;
    var taskId = select.value;
    if (!taskId) return;
    var boardId = select.dataset.boardId;
    if (!boardId) return;
    var board = findBoard(boardId);
    if (!board || board.columns.length === 0) return;
    var firstColumnLabel = board.columns[0].label;
    var firstColumn = board.columns[0];
    getTask(taskId)
      .then(function (task) {
        // Compute column label patch (remove old board labels, add first column label)
        var boardLabels = {};
        board.columns.forEach(function (c) {
          boardLabels[c.label] = true;
        });
        var columnTags = (task.tags || []).filter(function (t) {
          return !boardLabels[t];
        });
        columnTags.push(firstColumn.label);
        // Evaluate rules against original task (no fromColumn for new board assignments)
        var rulePatch = evaluateBoardRules(
          "task.enterColumn",
          task,
          firstColumn,
          board,
          null,
        );
        var finalPatch = { boardId: boardId, tags: columnTags };
        if (rulePatch) {
          var originalTags = task.tags || [];
          if (rulePatch.tags) {
            var netAdded = rulePatch.tags.filter(function (t) {
              return originalTags.indexOf(t) === -1;
            });
            var netRemoved = {};
            originalTags.forEach(function (t) {
              if (rulePatch.tags.indexOf(t) === -1) netRemoved[t] = true;
            });
            var mergedTags = columnTags.filter(function (t) {
              return !netRemoved[t];
            });
            netAdded.forEach(function (t) {
              if (mergedTags.indexOf(t) === -1) mergedTags.push(t);
            });
            finalPatch.tags = mergedTags;
          }
          if (rulePatch.status !== undefined)
            finalPatch.status = rulePatch.status;
          if (rulePatch.priority !== undefined)
            finalPatch.priority = rulePatch.priority;
        }
        return updateTask(taskId, finalPatch);
      })
      .then(function () {
        select.value = "";
        showToast("已添加到看板");
        refreshTasksFromVault().then(function () {
          renderAll();
        });
      })
      .catch(function (err) {
        showToast("操作失败: " + errorMessage(err));
      });
  }

  function renderLinks() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    state.linksPage = 1;
    renderLinksCollection();
    saveLinksDomainFilter(state.linksDomainFilter);
  }

  function renderLinksCollection() {
    const links = visibleLinks();
    const paginated = links.slice(0, state.linksPage * LINKS_PAGE_SIZE);
    renderTimelessView(
      els.memoList,
      LinksView({
        activeDomain: state.linksDomainFilter,
        chips: state.domainChips,
        hasMore: paginated.length < links.length,
        inputValue: state.domainChips.includes(state.linksDomainFilter)
          ? ""
          : state.linksDomainFilter,
        links: paginated.map(function (link) {
          const fetched = state.linkTitles[link.url] || "";
          const host = parseHost(link.url).host;
          return {
            compactUrl: compactFileURL(link.url),
            favicon: host
              ? host.slice(0, 2).replace(/^./, function (char) {
                  return char.toUpperCase();
                })
              : "↗",
            fetched: Boolean(fetched),
            href: safeUrl(link.url),
            memoId: link.memoId,
            title: fetched || link.label || link.url,
            url: link.url,
          };
        }),
      }),
    );
  }

  function renderCodeBlocks() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    codeBlocksModel.resetPagination();
    renderCodeBlocksCollection();
  }

  function renderCodeBlocksCollection() {
    const all_blocks = visibleCodeBlocks();
    const page = codeBlocksModel.select(all_blocks);
    renderTimelessView(
      els.memoList,
      CodeBlocksView({
        blocks: page.items.map(function (block) {
          const line_range =
            block.endLineIndex > block.lineIndex
              ? block.lineIndex + 1 + "-" + (block.endLineIndex + 1)
              : String(block.lineIndex + 1);
          const aliases = Array.isArray(block.aliases) ? block.aliases : [];
          const meta =
            "第 " +
            line_range +
            " 行" +
            (block.language ? " / " + block.language : "") +
            (aliases.length ? " / " + aliases.join(" ") : "");
          return {
            code: block.code || "",
            id: block.id,
            label: block.label || "代码片段",
            marked: Boolean(block.marked),
            memoId: block.memoId,
            meta,
            sourceMeta:
              formatRelativeDate(block.memo.createdAt) +
              " / " +
              projectLabel(block.memo.projectId),
          };
        }),
        hasMore: page.hasMore,
        hidden: !codeBlocksModel.state.showAll && all_blocks.length > 0,
      }),
    );
  }

  function renderFiles() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const resources = visibleResources().filter(isLocalAsset);
    const items = fileBrowserModel.setResources(resources);
    renderTimelessView(
      els.memoList,
      FileGridView({
        items: items.map(function (item) {
          return {
            ...item,
            href: safeUrl(item.url),
            previewSrc: item.kind === "image" ? safeImageUrl(item.url) : "",
          };
        }),
      }),
    );
    fileBrowserView.sync();
  }

  function renderImages() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const resources = visibleResources();
    const images = resources.filter(
      (resource) => resource.type === "image" && isLocalAsset(resource),
    );
    renderTimelessView(
      els.memoList,
      ImageGridView({
        images: images
          .map(function (resource) {
            return {
              label: resource.label || compactFileURL(resource.url),
              memoId: resource.memoId,
              source: compactFileURL(resource.url),
              src: safeImageUrl(resource.url),
            };
          })
          .filter(function (item) {
            return item.src;
          }),
      }),
    );
  }

  function renderClipboardView() {
    if (editEditor) {
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    }

    const item = state.clipboardItem;
    const captured_at = item?.capturedAt
      ? formatDateTime(new Date(item.capturedAt))
      : "";
    const meta = [
      clipboardTypeLabel(item && item.type),
      captured_at,
      item?.rawType || "",
    ]
      .filter(Boolean)
      .join(" / ");
    renderTimelessView(
      els.memoList,
      ClipboardCurrentView({
        actionLabel: clipboardActionLabel(item && item.type),
        item,
        meta,
        working: state.clipboardWorking,
      }),
    );
  }

  function renderPinDialog() {
    var existing = root.querySelector("[data-pin-view-host]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
    if (!state.pinDialogOpen) return;
    const host = document.createElement("div");
    host.dataset.pinViewHost = "true";
    host.dataset.n = "pin-dialog-host";
    root.appendChild(host);
    renderTimelessView(
      host,
      PinDialogView({
        error: state.pinDialogError,
        mode: state.pinDialogMode,
      }),
    );
    setTimeout(function () {
      var input = root.querySelector("[data-pin-input]");
      if (input) input.focus();
    }, 10);
  }

  function renderComposerStatus(value) {
    const text = String(value || "");
    const tagCount = extractTags(text).length;
    const chars = text.trim().length;
    els.composerStatus.textContent = `${chars} 字符 / ${tagCount} 标签`;
    els.createButton.disabled = chars === 0 || state.saving;
  }

  function refreshProjectsFromVault() {
    loadProjectsFromVault().then(
      function (payload) {
        state.projects = payload.projects
          .map(normalizeProjectPayload)
          .filter(Boolean);
        saveProjects(state.projects);
        renderAll();
      },
      function (err) {
        showToast("读取 project 失败: " + errorMessage(err));
      },
    );
  }

  function refreshLinksDomainFilter() {
    callNativeAPI("/api/links/domain-filter", { method: "GET" }).then(
      function (data) {
        var filter = data && data.filter ? String(data.filter).trim() : "";
        if (filter !== state.linksDomainFilter) {
          state.linksDomainFilter = filter;
          if (state.activeView === "links") renderLinks();
        }
      },
      function () {
        /* ignore load errors */
      },
    );
  }

  function refreshDomainChips() {
    callNativeAPI("/api/links/domain-chips", { method: "GET" }).then(
      function (data) {
        var chips = data && Array.isArray(data.chips) ? data.chips : [];
        state.domainChips = chips;
        if (state.activeView === "links") renderLinks();
      },
      function () {
        /* ignore load errors */
      },
    );
  }

  function createProjectFromPrompt() {
    showInlinePrompt("Project 名称", "").then(function (name) {
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        showToast("Project 名称不能为空");
        return;
      }
      createProjectInVault(trimmed).then(
        function (project) {
          const normalized = normalizeProjectPayload(project);
          if (!normalized) return;
          state.projects = state.projects.concat(normalized);
          saveProjects(state.projects);
          renderProjects();
          showToast("已创建 Project");
        },
        function (err) {
          showToast("创建 Project 失败: " + errorMessage(err));
        },
      );
    });
  }

  function editProjectFromDetail(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    showInlinePrompt("编辑 Project 名称", project.name).then(function (name) {
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed === project.name) return;
      state.projects = state.projects.map((p) =>
        p.id === projectId
          ? { ...p, name: trimmed, updatedAt: new Date().toISOString() }
          : p,
      );
      saveProjects(state.projects);
      renderAll();
    });
  }

  function archiveProjectFromDetail(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    state.projects = state.projects.map((p) =>
      p.id === projectId
        ? { ...p, archived: true, updatedAt: new Date().toISOString() }
        : p,
    );
    saveProjects(state.projects);
    state.activeView = "memos";
    state.activeProjectId = "";
    showToast("已归档 Project: " + project.name);
    renderAll();
  }

  function showInlinePrompt(title, defaultValue) {
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.className = "memo-inline-prompt-overlay";
      overlay.dataset.n = "inline-prompt-overlay";
      const dialog = document.createElement("div");
      dialog.className = "memo-inline-prompt-dialog";
      dialog.dataset.n = "inline-prompt-dialog-host";
      renderTimelessView(
        dialog,
        InlinePromptView({
          title,
          value: defaultValue || "",
        }),
      );
      overlay.appendChild(dialog);
      root.appendChild(overlay);

      const input = dialog.querySelector(".memo-inline-prompt-input");
      const okBtn = dialog.querySelector(".memo-inline-prompt-ok");
      const cancelBtn = dialog.querySelector(".memo-inline-prompt-cancel");

      function close(value) {
        unmountTimelessView(dialog);
        overlay.remove();
        resolve(value);
      }

      okBtn.addEventListener("click", function () {
        close(input.value);
      });
      cancelBtn.addEventListener("click", function () {
        close(null);
      });
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close(null);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          close(input.value);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          close(null);
        }
      });

      requestAnimationFrame(function () {
        input.focus();
        input.select();
      });
    });
  }

  function refreshMemosFromVault() {
    loadMemosFromVault().then(
      function (memos) {
        state.memos = memos.map(normalizeMemoPayload).filter(Boolean);
        saveMemos(state.memos);
        renderAll();
      },
      function (err) {
        showToast("读取 vault memo 失败: " + errorMessage(err));
      },
    );
  }

  function refreshMemoCommentsFromVault() {
    loadMemoCommentsFromVault().then(
      function (comments) {
        state.comments = comments
          .map(normalizeMemoCommentPayload)
          .filter(Boolean);
        state.commentsLoaded = true;
        renderAll();
      },
      function (err) {
        if (typeof globalThis.invoke === "function") {
          showToast("读取评论失败: " + errorMessage(err));
        }
      },
    );
  }

  function refreshMemoDraftsFromVault() {
    loadMemoDraftsFromVault().then(
      function (drafts) {
        state.memoDrafts = drafts
          .map(normalizeMemoDraftPayload)
          .filter(Boolean);
        state.draftsLoaded = true;
        applyComposerDraft();
        renderComposerProjectSelect();
        renderComposerStatus(composerEditor ? composerEditor.getText() : "");
      },
      function (err) {
        if (typeof globalThis.invoke === "function") {
          showToast("读取草稿失败: " + errorMessage(err));
        }
      },
    );
  }

  function commentsForMemo(memoId) {
    const id = String(memoId || "").trim();
    return state.comments
      .filter((comment) => comment && comment.memoId === id)
      .sort(function (a, b) {
        const left = new Date(a.createdAt || 0).getTime() || 0;
        const right = new Date(b.createdAt || 0).getTime() || 0;
        if (left === right) return b.id.localeCompare(a.id);
        return right - left;
      });
  }

  function findComment(commentId) {
    const id = String(commentId || "").trim();
    return (
      state.comments.find((comment) => comment && comment.id === id) || null
    );
  }

  function upsertCommentInState(comment) {
    const normalized = normalizeMemoCommentPayload(comment);
    if (!normalized) return;
    const index = state.comments.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      state.comments[index] = normalized;
    } else {
      state.comments.push(normalized);
    }
  }

  function findDraft(draftId) {
    return (
      state.memoDrafts.find((draft) => draft && draft.id === draftId) || null
    );
  }

  function upsertDraftInState(draft) {
    const normalized = normalizeMemoDraftPayload(draft);
    if (!normalized) return;
    const index = state.memoDrafts.findIndex(
      (item) => item.id === normalized.id,
    );
    if (index >= 0) {
      state.memoDrafts[index] = normalized;
    } else {
      state.memoDrafts.push(normalized);
    }
  }

  function removeDraftFromState(draftId) {
    state.memoDrafts = state.memoDrafts.filter(
      (draft) => draft && draft.id !== draftId,
    );
  }

  function applyComposerDraft() {
    const draft = findDraft(COMPOSER_DRAFT_ID);
    if (!draft || !composerEditor) return;
    if (composerEditor.getText().trim()) return;
    state.composerProjectId = normalizeProjectID(draft.projectId);
    state.visibility = draft.visibility || DEFAULT_VISIBILITY;
    if (els.visibilitySelect) els.visibilitySelect.value = state.visibility;
    composerEditor.setText(draft.content || "");
    renderComposerStatus(draft.content || "");
  }

  function refreshTasksFromVault(options = {}) {
    const renderFeedContent = options.render !== false;
    state.tasksLoading = true;
    return loadTasks()
      .then(
        function (payload) {
          state.tasks = payload.tasks.map(normalizeTaskSummary).filter(Boolean);
          if (renderFeedContent) renderAll();
          else renderTaskChromeWithoutFeed();
        },
        function (err) {
          if (typeof globalThis.invoke === "function") {
            showToast("读取 task 失败: " + errorMessage(err));
          }
        },
      )
      .finally(function () {
        state.tasksLoading = false;
        if (renderFeedContent) renderAll();
        else renderTaskChromeWithoutFeed();
      });
  }

  function renderTaskChromeWithoutFeed() {
    renderViewButtons();
  }

  function refreshGTDFromVault() {
    state.gtdLoading = true;
    Promise.all([loadGTDItems(), loadGTDMilestones()])
      .then(
        function (results) {
          state.gtdItems = results[0].map(normalizeGTDItem).filter(Boolean);
          state.gtdMilestones = results[1]
            .map(normalizeGTDMilestone)
            .filter(Boolean);
          renderAll();
        },
        function (err) {
          if (typeof globalThis.invoke === "function") {
            showToast("读取 GTD 事项失败: " + errorMessage(err));
          }
        },
      )
      .finally(function () {
        state.gtdLoading = false;
        renderAll();
      });
  }

  function visibleMemos() {
    const query = state.query.toLowerCase();
    const selectedDate = smallCalendarModel.state.selectedDate;
    return scopedMemos()
      .filter((memo) => {
        if (state.activeFilter === "archive") return memo.archived;
        if (memo.archived) return false;
        if (state.activeFilter === "pinned" && !memo.pinned) return false;
        if (state.activeFilter === "public" && memo.visibility !== "PUBLIC")
          return false;
        if (state.activeFilter === "private" && memo.visibility !== "PRIVATE")
          return false;
        if (
          state.activeTag &&
          !extractTags(memo.content).includes(state.activeTag)
        )
          return false;
        if (selectedDate && memoDateKey(memo) !== selectedDate) return false;
        if (!query) return true;
        const commentText = commentsForMemo(memo.id)
          .map((comment) => comment.content)
          .join("\n");
        return `${memo.content} ${commentText} ${memo.visibility} ${memo.alias || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const result =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return state.sortDesc ? -result : result;
      });
  }

  function visibleTodos() {
    const query = state.query.toLowerCase();
    return collectTodos(scopedMemoDocuments())
      .filter((todo) => {
        if (
          state.activeTag &&
          !extractTags(todo.memo.content).includes(state.activeTag)
        )
          return false;
        if (!query) return true;
        return `${todo.text} ${todo.sourceText} ${todo.memo.content} ${todo.memo.visibility} ${todo.memo.alias || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        const created =
          new Date(a.memo.createdAt).getTime() -
          new Date(b.memo.createdAt).getTime();
        if (created !== 0) return state.sortDesc ? -created : created;
        return a.lineIndex - b.lineIndex;
      });
  }

  function visibleTasks() {
    const query = state.query.toLowerCase();
    return scopedTasks()
      .filter((task) => taskMatchesFilter(task, state.taskFilter))
      .filter((task) => {
        if (!query) return true;
        return [
          task.title,
          task.listId,
          task.priority,
          task.status,
          task.projectId,
          task.source && task.source.memoId,
          task.source && task.source.text,
          (task.tags || []).join(" "),
          (task.contexts || []).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sortTasksForView);
  }

  function groupedVisibleTasks(tasks) {
    if (state.taskFilter === "completed") {
      return [{ label: "已完成", tasks }];
    }
    if (state.taskFilter === "overdue") {
      return [{ label: "已过期", tasks }];
    }
    if (state.taskFilter === "scheduled") {
      return [
        { label: "已过期", tasks: tasks.filter(isTaskOverdue) },
        {
          label: "今天",
          tasks: tasks.filter(
            (task) => !isTaskOverdue(task) && isTaskToday(task),
          ),
        },
        {
          label: "未来",
          tasks: tasks.filter(
            (task) => !isTaskOverdue(task) && !isTaskToday(task),
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

  function scopedTasks() {
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

  function scopedGTDItems() {
    if (state.activeProjectFilter === "unassigned") {
      return state.gtdItems.filter((item) => !item.projectId);
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.gtdItems.filter(
        (item) => item.projectId === state.activeProjectFilter,
      );
    }
    return state.gtdItems;
  }

  function scopedGTDMilestones() {
    if (state.activeProjectFilter === "unassigned") {
      return state.gtdMilestones.filter(
        (milestone) => !milestone.projectIds.length,
      );
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.gtdMilestones.filter((milestone) =>
        milestone.projectIds.includes(state.activeProjectFilter),
      );
    }
    return state.gtdMilestones;
  }

  function visibleGTDItems() {
    const query = state.query.toLowerCase();
    return scopedGTDItems()
      .filter((item) => {
        if (!query) return true;
        const milestone = state.gtdMilestones.find(
          (entry) => entry.id === item.milestoneId,
        );
        return [
          item.title,
          item.type,
          item.status,
          item.decision,
          item.projectId,
          milestone && milestone.title,
          (item.labels || []).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sortGTDItemsForView);
  }

  function visibleGTDMilestones() {
    const query = state.query.toLowerCase();
    return scopedGTDMilestones()
      .filter((milestone) => {
        if (!query) return true;
        return [
          milestone.title,
          milestone.status,
          milestone.targetAt,
          milestone.reviewMemoId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sortGTDMilestonesForView);
  }

  function groupedVisibleGTDItems(items) {
    return [
      { label: "Open", items: items.filter((item) => item.status === "open") },
      {
        label: "已澄清",
        items: items.filter((item) => item.status === "triaged"),
      },
      {
        label: "等待",
        items: items.filter((item) => item.status === "waiting"),
      },
      {
        label: "已关闭",
        items: items.filter(
          (item) => item.status === "closed" || item.status === "resolved",
        ),
      },
    ].filter((group) => group.items.length);
  }

  function groupedVisibleGTDMilestones(milestones) {
    return [
      {
        label: "进行中",
        milestones: milestones.filter(
          (milestone) => milestone.status === "active",
        ),
      },
      {
        label: "计划中",
        milestones: milestones.filter(
          (milestone) => milestone.status === "planned",
        ),
      },
      {
        label: "已完成",
        milestones: milestones.filter(
          (milestone) => milestone.status === "completed",
        ),
      },
      {
        label: "已取消",
        milestones: milestones.filter(
          (milestone) => milestone.status === "cancelled",
        ),
      },
    ].filter((group) => group.milestones.length);
  }

  function sortGTDItemsForView(a, b) {
    const status =
      gtdItemStatusWeight(a.status) - gtdItemStatusWeight(b.status);
    if (status !== 0) return status;
    const created =
      taskTimeValue(b.createdAt || b.updatedAt) -
      taskTimeValue(a.createdAt || a.updatedAt);
    if (created !== 0) return created;
    return String(b.id || "").localeCompare(String(a.id || ""));
  }

  function sortGTDMilestonesForView(a, b) {
    const status =
      gtdMilestoneStatusWeight(a.status) - gtdMilestoneStatusWeight(b.status);
    if (status !== 0) return status;
    const target = taskTimeValue(a.targetAt) - taskTimeValue(b.targetAt);
    if (target !== 0) return target;
    return (
      taskTimeValue(b.updatedAt || b.createdAt) -
      taskTimeValue(a.updatedAt || a.createdAt)
    );
  }

  function gtdItemStatusWeight(status) {
    if (status === "open") return 0;
    if (status === "triaged") return 1;
    if (status === "waiting") return 2;
    return 3;
  }

  function gtdMilestoneStatusWeight(status) {
    if (status === "active") return 0;
    if (status === "planned") return 1;
    if (status === "completed") return 2;
    return 3;
  }

  function taskMatchesFilter(task, filter) {
    if (isRetainedCompletedTask(task, filter)) return true;
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
        return isTaskOverdue(task);
      case "scheduled":
        return (
          task.status !== "completed" && Boolean(task.startAt || task.dueAt)
        );
      case "next":
        return task.status !== "completed" && !task.parentId;
      case "today":
      default:
        return (
          task.status !== "completed" &&
          (isTaskToday(task) || isTaskOverdue(task))
        );
    }
  }

  function retainCompletedTaskInFilter(taskId, filter) {
    const id = String(taskId || "").trim();
    const taskFilter = normalizeTaskFilter(filter);
    if (!id || taskFilter === "all" || taskFilter === "completed") return;
    state.retainedCompletedTaskFilters.set(id, taskFilter);
  }

  function isRetainedCompletedTask(task, filter) {
    if (!task || task.status !== "completed") return false;
    return (
      state.retainedCompletedTaskFilters.get(task.id) ===
      normalizeTaskFilter(filter)
    );
  }

  function clearRetainedCompletedTasks() {
    if (state.retainedCompletedTaskFilters.size)
      state.retainedCompletedTaskFilters.clear();
  }

  function taskFilterCounts(tasks) {
    return {
      all: tasks.length,
      completed: tasks.filter((task) => task.status === "completed").length,
      inbox: tasks.filter((task) => taskMatchesFilter(task, "inbox")).length,
      next: tasks.filter((task) => taskMatchesFilter(task, "next")).length,
      overdue: tasks.filter((task) => taskMatchesFilter(task, "overdue"))
        .length,
      scheduled: tasks.filter((task) => taskMatchesFilter(task, "scheduled"))
        .length,
      today: tasks.filter((task) => taskMatchesFilter(task, "today")).length,
    };
  }

  function getTaskStats(tasks) {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === "completed").length;
    return {
      done,
      open: total - done,
      total,
    };
  }

  function sortTasksForView(a, b) {
    if (state.taskFilter === "completed") {
      return (
        taskTimeValue(b.completedAt || b.updatedAt || b.createdAt) -
        taskTimeValue(a.completedAt || a.updatedAt || a.createdAt)
      );
    }
    if (a.status !== b.status) {
      if (a.status === "completed") return 1;
      if (b.status === "completed") return -1;
    }
    const created = taskTimeValue(b.createdAt) - taskTimeValue(a.createdAt);
    if (created !== 0) return created;
    const priority =
      taskPriorityWeight(b.priority) - taskPriorityWeight(a.priority);
    if (priority !== 0) return priority;
    return taskTimeValue(b.updatedAt) - taskTimeValue(a.updatedAt);
  }

  function isTaskToday(task) {
    const today = dateKey(new Date());
    return [task.startAt, task.dueAt].some(
      (value) => value && dateKey(taskDateValue(value)) === today,
    );
  }

  function isTaskOverdue(task) {
    if (!task.dueAt || task.status === "completed") return false;
    const due = taskDateValue(task.dueAt);
    if (Number.isNaN(due.getTime())) return false;
    return dateKey(due) < dateKey(new Date());
  }

  function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function taskTimeValue(value) {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const date = taskDateValue(value);
    return Number.isNaN(date.getTime())
      ? Number.MAX_SAFE_INTEGER
      : date.getTime();
  }

  function taskDateValue(value) {
    const raw = String(value || "").trim();
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      );
    }
    return new Date(raw);
  }

  function taskPriorityWeight(priority) {
    switch (priority) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  }

  function addDomainChip(raw) {
    if (!raw) return;
    var host = raw.trim();
    // strip protocol and path, keep just the host
    try {
      var url = new URL(/^https?:\/\//i.test(host) ? host : "https://" + host);
      host = url.hostname;
    } catch (e) {
      /* use as-is */
    }
    if (!host) return;
    if (state.domainChips.indexOf(host) !== -1) return;
    state.domainChips.push(host);
    saveDomainChips(state.domainChips);
    state.linksDomainFilter = "";
    if (state.activeView === "links") renderLinksCollection();
    saveLinksDomainFilter(state.linksDomainFilter);
  }

  function visibleLinks() {
    const query = state.query.toLowerCase();
    const domainFilter = state.linksDomainFilter.toLowerCase();
    return collectLinks(scopedMemoDocuments())
      .filter((link) => {
        if (
          state.activeTag &&
          !extractTags(link.memo.content).includes(state.activeTag)
        )
          return false;
        if (domainFilter) {
          const { host } = parseHost(link.url);
          if (!host.includes(domainFilter)) return false;
        }
        if (!query) return true;
        return `${link.label} ${link.url} ${link.sourceText} ${link.memo.content} ${link.memo.visibility} ${link.memo.alias || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => sortMemoReference(a, b, state.sortDesc));
  }

  function visibleCodeBlocks() {
    const query = state.query.toLowerCase();
    return collectCodeBlocks(scopedMemoDocuments())
      .filter((block) => {
        if (
          state.activeTag &&
          !extractTags(block.memo.content).includes(state.activeTag)
        )
          return false;
        if (!query) return true;
        return matchesSearchQuery(codeBlockSearchText(block), query);
      })
      .sort(sortCodeBlocks);
  }

  function sortCodeBlocks(a, b) {
    if (a.marked !== b.marked) return a.marked ? -1 : 1;
    return sortMemoReference(a, b, state.sortDesc);
  }

  function codeBlockSearchText(block) {
    return [
      block.label,
      block.title,
      block.language,
      Array.isArray(block.aliases) ? block.aliases.join(" ") : "",
      block.code,
      block.sourceText,
      block.memo.content,
      block.memo.visibility,
      block.memo.alias || "",
      projectLabel(block.memo.projectId),
    ].join(" ");
  }

  function matchesSearchQuery(value, query) {
    const haystack = String(value || "").toLowerCase();
    const needle = String(query || "")
      .trim()
      .toLowerCase();
    if (!needle) return true;
    if (haystack.includes(needle)) return true;
    const terms = needle.split(/\s+/).filter(Boolean);
    return terms.length > 0 && terms.every((term) => haystack.includes(term));
  }

  function visibleResources() {
    const query = state.query.toLowerCase();
    return collectResources(scopedMemoDocuments())
      .filter((resource) => {
        if (
          state.activeTag &&
          !extractTags(resource.memo.content).includes(state.activeTag)
        )
          return false;
        if (!query) return true;
        return `${resource.label} ${resource.url} ${resource.sourceText} ${resource.memo.content} ${resource.memo.visibility} ${resource.memo.alias || ""} ${resource.type}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => sortMemoReference(a, b, state.sortDesc));
  }

  function isLocalAsset(resource) {
    var url = String((resource && resource.url) || "");
    if (/^@assets\//i.test(url)) return true;
    if (/^(data:|local:\/\/|blob:)/i.test(url)) return true;
    return false;
  }

  function scopedMemos() {
    if (state.activeProjectFilter === "unassigned") {
      return state.memos.filter((memo) => !memo.projectId);
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.memos.filter(
        (memo) => memo.projectId === state.activeProjectFilter,
      );
    }
    return state.memos;
  }

  function scopedMemoDocuments() {
    return memoDocumentsWithComments(
      scopedMemos(),
      state.comments,
      state.memos,
    );
  }

  function projectMemoCount(projectId) {
    return state.memos.filter(
      (memo) => memo.projectId === projectId && !memo.archived,
    ).length;
  }

  function projectLabel(projectId) {
    projectId = normalizeProjectID(projectId);
    if (!projectId) return "未归属";
    const project = state.projects.find((item) => item.id === projectId);
    return project ? project.name : "未知 Project";
  }

  function findMemo(memoId) {
    return state.memos.find((memo) => memo.id === memoId);
  }

  function findTask(taskId) {
    return state.tasks.find((task) => task.id === taskId);
  }

  function handleSmallCalendarChange(change) {
    if (change.action === "selectDate" || change.action === "today") {
      state.activeView = "memos";
      state.activeFilter = "all";
      state.activeTag = "";
      state.query = "";
      state.editingId = "";
      state.editPreviewVisible = false;
      els.searchInput.value = "";
    }
    renderAll();
  }

  function memoRenderContext(sourceId, options = {}) {
    const index = state.memoRefIndex || buildMemoReferenceIndex(state.memos);
    state.memoRefIndex = index;
    return {
      depth: options.depth || 0,
      index,
      maxDepth: options.maxDepth || 2,
      readonly: Boolean(options.readonly),
      editorSettings: state.editorSettings,
      showLineNumbers: options.showLineNumbers !== false,
      sourceId: sourceId || "",
      stack: options.stack || (sourceId ? [sourceId] : []),
    };
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 1800);
  }
}

export function mountDetachedMemoWindow(root, options = {}) {
  const params = new URLSearchParams(window.location.search);
  const detachedMemoId = params.get("id") || "";
  const initialSearchContext = readMemoQuickSearchOpenContext(
    globalThis.localStorage,
    detachedMemoId,
  );
  const state = {
    commentDraft: "",
    commentEditDraft: "",
    commentEditingId: "",
    commentExpandedIds: new Set(),
    replyToCommentId: "",
    commentEditPreviewVisible: false,
    commentPreviewVisible: false,
    commentSaving: false,
    comments: [],
    fixed: params.get("fixed") === "1" || Boolean(options.fixed),
    historyOpen: false,
    historyRecordId: "",
    historyRecordType: "memo",
    historyVersions: [],
    historyLoading: false,
    historyError: "",
    historyPreviewContent: "",
    historyPreviewVersion: 0,
    restoringVersion: 0,
    lastWindowState: null,
    memo: null,
    memoRefIndex: null,
    historyInlineDiffs: {},
    historyExpandedDiffs: {},
    historyDiffLoading: {},
    memos: [],
    projects: [],
    searchQuery: initialSearchContext.query,
    editorSettings: loadEditorSettings(),
    snapshotDebounceTimer: null,
    snapshotInFlight: false,
    snapshotPollTimer: null,
    toastTimer: null,
    windowSession: null,
    windowName: detachedMemoWindowName(detachedMemoId),
    findOpen: false,
    findQuery: "",
    findMatches: [],
    findActiveIndex: -1,
  };

  renderTimelessView(root, DetachedMemoShellView());

  const els = {
    commentEditorHost: root.querySelector("[data-window-comment-editor]"),
    commentFileInput: root.querySelector("[data-window-comment-file-input]"),
    commentForm: root.querySelector("[data-window-comment-form]"),
    commentPreview: root.querySelector("[data-window-comment-preview]"),
    commentPreviewToggle: root.querySelector(
      "[data-window-comment-preview-toggle]",
    ),
    commentSubmit: root.querySelector("[data-window-comment-submit]"),
    content: root.querySelector("[data-window-content]"),
    fixedButton: root.querySelector('[data-window-control="toggleFixed"]'),
    toast: root.querySelector("[data-toast]"),
    findBar: root.querySelector("[data-find-bar]"),
    findInput: root.querySelector("[data-find-input]"),
    findCount: root.querySelector("[data-find-count]"),
    project: root.querySelector("[data-window-project]"),
  };
  state.windowSession = registerWindowSession({
    entryPage: "memo-window.html",
    fixed: state.fixed,
    getState: detachedWindowSessionState,
    kind: "memo_window",
    restoreState: restoreDetachedWindowSessionState,
    title: "Memo",
  });
  let detachedCommentEditor = createDetachedCommentEditor(state.commentDraft);
  let detachedCommentEditEditor = null;
  const imageContextMenu = bindMemoImageContextMenu(root, {
    notify: showToast,
    onPreview: openDetachedImagePreview,
  });

  renderFixedButton();
  applyFixedState();
  renderDetachedState("正在加载 memo...");
  loadDetachedMemo();
  refreshDetachedEditorSettings();

  window.addEventListener("click", handleExternalLinkClick, true);
  window.addEventListener("beforeunload", handleDetachedBeforeUnload);
  window.addEventListener("resize", scheduleDetachedWindowStateSnapshot);
  window.addEventListener("storage", handleDetachedSearchContextStorage);
  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
  root.addEventListener("keydown", handleKeydown, true);
  root.addEventListener("submit", handleSubmit);
  root.addEventListener("copy", handleMemoRenderedCopy);
  startDetachedWindowStateSnapshots();
  syncDetachedCommentForm();
  bindGoMessages();

  return {
    destroy() {
      stopDetachedWindowStateSnapshots();
      window.removeEventListener("click", handleExternalLinkClick, true);
      window.removeEventListener("beforeunload", handleDetachedBeforeUnload);
      window.removeEventListener("resize", scheduleDetachedWindowStateSnapshot);
      window.removeEventListener("storage", handleDetachedSearchContextStorage);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", handleChange);
      root.removeEventListener("keydown", handleKeydown, true);
      root.removeEventListener("submit", handleSubmit);
      root.removeEventListener("copy", handleMemoRenderedCopy);
      imageContextMenu.destroy();
      if (detachedCommentEditor) detachedCommentEditor.destroy();
      if (detachedCommentEditEditor) detachedCommentEditEditor.destroy();
      if (state.toastTimer) window.clearTimeout(state.toastTimer);
      unmountTimelessView(root);
    },
  };

  function createDetachedCommentEditor(value) {
    if (!els.commentEditorHost) return null;
    return createMiniEditor(els.commentEditorHost, {
      memoItems() {
        return state.memos;
      },
      tagItems: detachedEditorTagItems,
      onChange(nextValue) {
        state.commentDraft = nextValue;
        renderDetachedCommentPreview();
        syncDetachedCommentForm();
      },
      onCommit() {
        return submitDetachedComment();
      },
      onDiscard() {
        state.commentDraft = "";
        state.commentPreviewVisible = false;
        renderDetachedCommentPreview();
        syncDetachedCommentForm();
        showToast("评论已清空");
      },
      onRequestFiles(accept) {
        if (detachedCommentEditor && detachedCommentEditor.requestFiles) {
          detachedCommentEditor.requestFiles(accept || "");
        }
      },
      onQuit() {
        if (detachedCommentEditor) detachedCommentEditor.blur();
      },
      onSave() {
        return submitDetachedComment();
      },
      onSubmit() {
        return submitDetachedComment();
      },
      onWriteDraft() {
        return submitDetachedComment();
      },
      placeholder: "有想法，直接问，⌘+Enter 发送",
      sourceMemoId: state.memo && state.memo.id,
      value: value || "",
      vim: detachedEditorVimEnabled(),
    });
  }

  function recreateDetachedCommentEditor() {
    const value = detachedCommentEditor
      ? detachedCommentEditor.getText()
      : state.commentDraft;
    if (detachedCommentEditor) detachedCommentEditor.destroy();
    if (els.commentEditorHost) unmountTimelessView(els.commentEditorHost);
    detachedCommentEditor = createDetachedCommentEditor(value);
    state.commentDraft = value || "";
    syncDetachedCommentForm();
  }

  function detachedEditorTagItems() {
    return collectTags(state.memos.filter((memo) => memo && !memo.archived));
  }

  function detachedEditorVimEnabled() {
    return state.editorSettings && state.editorSettings.vimMode === true;
  }

  function createDetachedCommentEditEditor(value) {
    const host =
      els.content &&
      els.content.querySelector("[data-window-comment-edit-host]");
    if (!host) return null;
    return createMiniEditor(host, {
      memoItems() {
        return state.memos;
      },
      tagItems: detachedEditorTagItems,
      onChange(nextValue) {
        state.commentEditDraft = nextValue;
        renderDetachedCommentEditPreview();
      },
      onCommit() {
        return saveDetachedCommentEdit();
      },
      onDiscard() {
        return cancelDetachedCommentEdit();
      },
      onRequestFiles(accept) {
        if (
          detachedCommentEditEditor &&
          detachedCommentEditEditor.requestFiles
        ) {
          detachedCommentEditEditor.requestFiles(accept || "");
        }
      },
      onQuit() {
        return cancelDetachedCommentEdit();
      },
      onSave() {
        return saveDetachedCommentEdit();
      },
      onSubmit() {
        return saveDetachedCommentEdit();
      },
      onWriteDraft() {
        return saveDetachedCommentEdit();
      },
      placeholder: "编辑评论...",
      sourceMemoId: state.memo && state.memo.id,
      value: value || "",
      vim: detachedEditorVimEnabled(),
    });
  }

  function toggleDetachedCommentPreview() {
    if (detachedCommentEditor)
      state.commentDraft = detachedCommentEditor.getText();
    state.commentPreviewVisible = !state.commentPreviewVisible;
    renderDetachedCommentPreview();
    if (!state.commentPreviewVisible && detachedCommentEditor)
      detachedCommentEditor.focus();
    scheduleDetachedWindowSessionSnapshot();
  }

  function toggleDetachedCommentEditPreview() {
    if (!state.commentEditingId) return;
    if (detachedCommentEditEditor)
      state.commentEditDraft = detachedCommentEditEditor.getText();
    state.commentEditPreviewVisible = !state.commentEditPreviewVisible;
    renderDetachedCommentEditPreview();
    if (!state.commentEditPreviewVisible && detachedCommentEditEditor)
      detachedCommentEditEditor.focus();
    scheduleDetachedWindowSessionSnapshot();
  }

  function renderDetachedCommentPreview() {
    renderDetachedEditorPreviewPanel(
      els.commentPreview,
      els.commentPreviewToggle,
      state.commentPreviewVisible,
      state.commentDraft,
      detachedCommentPreviewContext(),
    );
  }

  function renderDetachedCommentEditPreview() {
    renderDetachedEditorPreviewPanel(
      els.content &&
        els.content.querySelector("[data-window-comment-edit-preview]"),
      els.content &&
        els.content.querySelector('[data-window-comment-action="preview"]'),
      state.commentEditPreviewVisible,
      state.commentEditDraft,
      detachedCommentPreviewContext(),
    );
  }

  function detachedCommentPreviewContext() {
    return detachedMemoRenderContext(state, state.memo && state.memo.id, {
      readonly: true,
      showLineNumbers: false,
    });
  }

  function renderDetachedEditorPreviewPanel(
    panel,
    button,
    visible,
    content,
    context,
  ) {
    updateDetachedEditorPreviewButton(button, visible);
    if (!panel) return;
    const switcher = closestElement(panel, ".memo-editor-switch");
    const host =
      switcher && switcher.querySelector("[data-editor-switch-host]");
    if (host) host.hidden = visible;
    panel.hidden = !visible;
    panel.classList.toggle("is-visible", visible);
    if (!visible) {
      renderTimelessView(panel, null);
      return;
    }
    renderTimelessView(
      panel,
      EditorPreviewView({
        html: detachedEditorPreviewHTML(content, context),
        meaning: "detached-comment-preview",
      }),
    );
  }

  function updateDetachedEditorPreviewButton(button, visible) {
    if (!button) return;
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.title = visible ? "编辑" : "预览";
    button.setAttribute("aria-label", visible ? "编辑" : "预览");
    const label = button.querySelector("span");
    if (label) label.textContent = visible ? "编辑" : "预览";
  }

  function detachedEditorPreviewHTML(content, context) {
    const text = String(content || "");
    if (!text.trim()) return "";
    try {
      return renderMemoMarkdown(text, context || {});
    } catch (err) {
      return `<p>${escapeHTML(text)}</p>`;
    }
  }

  function destroyDetachedCommentEditEditor(options = {}) {
    if (detachedCommentEditEditor) {
      if (options.preserveDraft !== false) {
        state.commentEditDraft = detachedCommentEditEditor.getText();
      }
      detachedCommentEditEditor.destroy();
      detachedCommentEditEditor = null;
    }
  }

  function loadDetachedMemo() {
    const memoId = params.get("id") || "";
    if (!memoId) {
      renderDetachedState("缺少 memo id");
      return;
    }

    if (typeof invoke !== "function") {
      loadDetachedMemoFromLocal(memoId);
      return;
    }

    var memoPromise = invoke(
      "/api/memo-window/get?id=" + encodeURIComponent(memoId),
      { method: "GET" },
    ).then(
      function (resp) {
        var data = resp && resp.code === 0 ? resp.data || {} : {};
        if (data.found && data.memo) {
          if (typeof data.fixed === "boolean") state.fixed = data.fixed;
          if (data.windowName) state.windowName = data.windowName;
          setDetachedPayload(data.memo, data.memos);
          return true;
        }
        return false;
      },
      function () {
        return false;
      },
    );

    var projectsPromise = invoke("/api/projects", { method: "GET" }).then(
      function (resp) {
        if (resp && resp.code === 0 && resp.data) {
          var vaultProjects = resp.data.projects;
          if (Array.isArray(vaultProjects)) {
            state.projects = vaultProjects.map(function (p) {
              return typeof p === "string" ? JSON.parse(p) : p;
            });
          }
        }
      },
      function () {},
    );

    Promise.all([memoPromise, projectsPromise]).then(function (results) {
      if (results[0]) {
        renderDetachedMemo();
        loadDetachedComments(state.memo && state.memo.id);
        applyFixedState();
        scheduleDetachedWindowSessionSnapshot();
        return;
      }
      loadDetachedMemoFromLocal(memoId);
    });
  }

  function loadDetachedMemoFromLocal(memoId) {
    const payload = loadMemoFromLocal(memoId);
    const memo = payload.memo;
    if (!memo) {
      renderDetachedState("找不到 memo");
      return;
    }
    setDetachedPayload(memo, payload.memos);
    renderDetachedMemo();
    loadDetachedComments(state.memo && state.memo.id);
    scheduleDetachedWindowSessionSnapshot();
  }

  function refreshDetachedEditorSettings() {
    loadEditorSettingsFromVault().then(
      function (settings) {
        const next = normalizeEditorSettings(settings);
        const sameFileSettings =
          editorFileOpenSettingsKey(next) ===
          editorFileOpenSettingsKey(state.editorSettings);
        const sameVimMode = next.vimMode === state.editorSettings.vimMode;
        if (sameFileSettings && sameVimMode) return;
        state.editorSettings = next;
        recreateDetachedCommentEditor();
        renderDetachedMemo();
      },
      function () {},
    );
  }

  function detachedMemoWindowName(memoId) {
    const suffix = sanitizeDetachedMemoWindowID(memoId) || "memo";
    return "memo-window-" + suffix;
  }

  function sanitizeDetachedMemoWindowID(value) {
    let text = String(value || "")
      .trim()
      .toLowerCase();
    let output = "";
    let lastDash = false;
    for (const char of text) {
      const ok = /[a-z0-9_-]/.test(char);
      if (ok) {
        output += char;
        lastDash = false;
      } else if (!lastDash) {
        output += "-";
        lastDash = true;
      }
    }
    return output.replace(/^[-_]+|[-_]+$/g, "");
  }

  function handleDetachedBeforeUnload() {
    snapshotDetachedWindowStateSync();
  }

  function bindGoMessages() {
    if (!window.onGoMessage) return;
    window.onGoMessage(function (payload) {
      if (!payload) return;
      if (payload.type === "__velo_window_focus") {
        root.classList.add("is-window-focused");
      } else if (payload.type === "__velo_window_blur") {
        root.classList.remove("is-window-focused");
      } else if (
        payload.type === "memo_saved" &&
        payload.memoId === (state.memo && state.memo.id)
      ) {
        loadDetachedMemo();
      }
    });
  }

  function handleDetachedSearchContextStorage(event) {
    if (!state.memo || event.key !== memoQuickSearchContextKey(state.memo.id))
      return;
    const context = readMemoQuickSearchOpenContext(
      globalThis.localStorage,
      state.memo.id,
      event.newValue,
    );
    state.searchQuery = context.query;
    renderDetachedMemo();
  }

  function startDetachedWindowStateSnapshots() {
    if (typeof invoke !== "function" || state.snapshotPollTimer) return;
    snapshotDetachedWindowStateIfChanged();
    state.snapshotPollTimer = window.setInterval(function () {
      snapshotDetachedWindowStateIfChanged();
    }, DETACHED_WINDOW_STATE_POLL_INTERVAL);
  }

  function stopDetachedWindowStateSnapshots() {
    if (state.snapshotPollTimer) {
      window.clearInterval(state.snapshotPollTimer);
      state.snapshotPollTimer = null;
    }
    if (state.snapshotDebounceTimer) {
      window.clearTimeout(state.snapshotDebounceTimer);
      state.snapshotDebounceTimer = null;
    }
  }

  function scheduleDetachedWindowStateSnapshot() {
    if (typeof invoke !== "function") return;
    if (state.snapshotDebounceTimer) {
      window.clearTimeout(state.snapshotDebounceTimer);
    }
    state.snapshotDebounceTimer = window.setTimeout(function () {
      state.snapshotDebounceTimer = null;
      snapshotDetachedWindowState();
    }, DETACHED_WINDOW_STATE_SNAPSHOT_DEBOUNCE);
  }

  function snapshotDetachedWindowState() {
    return readDetachedWindowState().then(function (nextWindowState) {
      if (!nextWindowState) return null;
      state.lastWindowState = nextWindowState;
      return saveDetachedWindowState(nextWindowState);
    });
  }

  function snapshotDetachedWindowStateIfChanged() {
    if (typeof invoke !== "function" || state.snapshotInFlight) return;
    state.snapshotInFlight = true;
    readDetachedWindowState()
      .then(
        function (nextWindowState) {
          if (!nextWindowState) return null;
          if (
            isSameDetachedWindowStateHint(
              state.lastWindowState,
              nextWindowState,
            )
          )
            return null;
          state.lastWindowState = nextWindowState;
          return saveDetachedWindowState(nextWindowState);
        },
        function () {},
      )
      .finally(function () {
        state.snapshotInFlight = false;
      });
  }

  function snapshotDetachedWindowStateSync() {
    const payload = detachedWindowStatePayload(
      state.lastWindowState || readDetachedWindowStateHint(),
    );
    if (!payload) return;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/window/state/save", false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(payload));
    } catch (_) {}
  }

  function saveDetachedWindowState(windowState) {
    const payload = detachedWindowStatePayload(windowState);
    if (!payload || typeof invoke !== "function") return Promise.resolve(null);
    return invoke("/api/window/state/save", {
      method: "POST",
      args: payload,
    }).catch(function () {});
  }

  function detachedWindowStatePayload(windowState) {
    const name = String(state.windowName || "").trim();
    if (!name) return null;
    if (!windowState || windowState.width <= 0 || windowState.height <= 0)
      return null;
    return {
      fixed: state.fixed,
      name,
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
    };
  }

  function readDetachedWindowState() {
    if (typeof invoke !== "function") {
      return Promise.resolve(readDetachedWindowStateHint());
    }
    return callNativeWindow("__velo/window/state").then(
      function (resp) {
        if (
          !resp ||
          resp.success === false ||
          resp.width <= 0 ||
          resp.height <= 0
        ) {
          return readDetachedWindowStateHint();
        }
        return {
          x: Math.round(Number(resp.x || 0)),
          y: Math.round(Number(resp.y || 0)),
          width: Math.round(Number(resp.width || 0)),
          height: Math.round(Number(resp.height || 0)),
        };
      },
      function () {
        return readDetachedWindowStateHint();
      },
    );
  }

  function readDetachedWindowStateHint() {
    return {
      x: Math.round(Number(window.screenX ?? window.screenLeft ?? 0)),
      y: Math.round(Number(window.screenY ?? window.screenTop ?? 0)),
      width: Math.round(Number(window.outerWidth ?? window.innerWidth ?? 0)),
      height: Math.round(Number(window.outerHeight ?? window.innerHeight ?? 0)),
    };
  }

  function isSameDetachedWindowStateHint(a, b) {
    return Boolean(
      a &&
      b &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height,
    );
  }

  function setDetachedPayload(memo, memos) {
    state.memo = normalizeMemoPayload(memo);
    state.comments = [];
    state.commentDraft = "";
    state.commentEditingId = "";
    state.commentEditDraft = "";
    state.commentExpandedIds = new Set();
    state.memos = Array.isArray(memos)
      ? memos.map(normalizeMemoPayload).filter(Boolean)
      : [];
    if (state.memo && !state.memos.some((item) => item.id === state.memo.id)) {
      state.memos.unshift(state.memo);
    }
    state.memoRefIndex = null;
    if (detachedCommentEditor) recreateDetachedCommentEditor();
  }

  function handleExternalLinkClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = closestAnchor(event.target);
    if (!link || !root.contains(link)) return;

    const url = externalBrowserURLFromAnchor(link);
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    openExternalLinkInDefaultBrowser(url);
  }

  /* ── Detached Window: Emoji Reactions ── */

  function detachedCloseAllReactionPickers() {
    root.querySelectorAll("[data-reactions-picker]").forEach(function (el) {
      el.hidden = true;
    });
  }

  function handleClick(event) {
    // Close reaction pickers on clicks outside reaction elements
    if (
      !event.target.closest(".memo-reactions-add-wrap, .memo-reactions-picker")
    ) {
      detachedCloseAllReactionPickers();
    }
    // Find bar buttons
    if (event.target.closest("[data-find-close]")) {
      closeFindBar();
      return;
    }
    if (event.target.closest("[data-find-prev]")) {
      navigateFind(-1);
      return;
    }
    if (event.target.closest("[data-find-next]")) {
      navigateFind(1);
      return;
    }
    const control = closestElement(event.target, "[data-window-control]");
    if (control && root.contains(control)) {
      runWindowControl(control.dataset.windowControl);
      return;
    }

    const attach = closestElement(event.target, "[data-window-comment-attach]");
    if (attach && root.contains(attach)) {
      event.preventDefault();
      if (
        detachedCommentEditor &&
        detachedCommentEditor.requestFiles &&
        !state.commentSaving
      ) {
        detachedCommentEditor.requestFiles("");
      } else if (els.commentFileInput && !state.commentSaving) {
        els.commentFileInput.click();
      }
      return;
    }

    const previewToggle = closestElement(
      event.target,
      "[data-window-comment-preview-toggle]",
    );
    if (previewToggle && root.contains(previewToggle)) {
      event.preventDefault();
      toggleDetachedCommentPreview();
      return;
    }

    const comment_submit = closestElement(
      event.target,
      "[data-window-comment-submit]",
    );
    if (comment_submit && root.contains(comment_submit)) {
      event.preventDefault();
      submitDetachedComment();
      return;
    }

    const commentAction = closestElement(
      event.target,
      "[data-window-comment-action]",
    );
    if (commentAction && root.contains(commentAction)) {
      event.preventDefault();
      const commentNode = closestElement(commentAction, "[data-comment-id]");
      const commentId =
        commentNode && commentNode.dataset ? commentNode.dataset.commentId : "";
      runDetachedCommentAction(
        commentAction.dataset.windowCommentAction,
        commentId,
      );
      return;
    }

    const editorOpen = closestElement(event.target, "[data-editor-open]");
    if (editorOpen && root.contains(editorOpen)) {
      event.preventDefault();
      event.stopPropagation();
      openFileInSelectedEditor(editorOpen);
      return;
    }

    const imagePreview = closestElement(
      event.target,
      "[data-image-preview-src]",
    );
    if (imagePreview && root.contains(imagePreview)) {
      event.preventDefault();
      event.stopPropagation();
      openDetachedImagePreview(imagePreview);
      return;
    }

    const memoRefTarget = closestElement(
      event.target,
      "[data-memo-ref-target]",
    );
    if (memoRefTarget && root.contains(memoRefTarget)) {
      event.preventDefault();
      detachMemoFromWindow(memoRefTarget.dataset.memoRefTarget);
      return;
    }

    const tocLine = closestElement(event.target, "[data-memo-toc-line]");
    if (tocLine && root.contains(tocLine)) {
      event.preventDefault();
      event.stopPropagation();
      scrollMemoTocLine(tocLine);
      return;
    }

    const taskDetailTarget = closestElement(event.target, "[data-task-detail]");
    if (taskDetailTarget && root.contains(taskDetailTarget)) {
      event.preventDefault();
      event.stopPropagation();
      openDetachedInlineTaskDetail(taskDetailTarget);
      return;
    }

    const action = closestElement(event.target, "[data-action]");
    if (!action || !root.contains(action)) return;

    switch (action.dataset.action) {
      case "editMemo":
        openEditMemoWindow();
        break;
      case "copyMemo":
        copyDetachedMemo();
        break;
      case "copyMemoRef":
        copyDetachedMemoRef();
        break;
      case "openMemoHistory":
        openDetachedMemoHistory(state.memo && state.memo.id);
        break;
      case "openCommentHistory":
        {
          const cn = closestElement(action, "[data-comment-id]");
          if (cn)
            openDetachedCommentHistory(cn.getAttribute("data-comment-id"));
        }
        break;
      case "closeHistoryDialog":
        closeDetachedHistoryDialog();
        break;
      case "previewHistoryVersion":
        previewDetachedHistoryVersion(parseInt(action.dataset.version, 10));
        break;
      case "restoreHistoryVersion":
        if (confirm("确定要回退到此版本？回退操作将创建一条新的版本记录。")) {
          restoreDetachedHistoryVersion(parseInt(action.dataset.version, 10));
        }
        break;
      case "toggleHistoryDiff":
        toggleDetachedHistoryDiff(parseInt(action.dataset.version, 10));
        break;
      case "copyCodeBlock":
        copyCodeBlockFromAction(action, detachedMemoDocuments(), showToast);
        break;
      case "toggleCodeCollapse":
        toggleCodeCollapse(action);
        break;
      case "copyInlineLink":
        event.preventDefault();
        event.stopPropagation();
        copyInlineLinkFromAction(action, showToast);
        break;
      case "toggleMemoReactions":
        event.stopPropagation();
        detachedCloseAllReactionPickers();
        {
          var wrap = action.closest(".memo-reactions-add-wrap");
          if (wrap) {
            var picker = wrap.querySelector("[data-reactions-picker]");
            if (picker) picker.hidden = !picker.hidden;
          }
        }
        break;
      case "pickMemoReaction":
      case "toggleMemoReaction":
        {
          var memoId = action.dataset.memoId || (state.memo && state.memo.id);
          var emoji = action.dataset.emoji;
          if (memoId && emoji) {
            var memo = state.memos.find(function (m) {
              return m.id === memoId;
            });
            if (memo) {
              var rx = Array.isArray(memo.reactions) ? memo.reactions : [];
              var idx = rx.indexOf(emoji);
              var next =
                idx >= 0
                  ? rx.slice(0, idx).concat(rx.slice(idx + 1))
                  : rx.concat([emoji]);
              memo.reactions = next;
              updateMemoInVault(memoId, { reactions: next }).catch(
                function () {},
              );
              renderDetachedMemo();
            }
          }
          detachedCloseAllReactionPickers();
        }
        break;
      case "toggleCommentReactions":
        event.stopPropagation();
        detachedCloseAllReactionPickers();
        {
          var wrap2 = action.closest(".memo-reactions-add-wrap");
          if (wrap2) {
            var picker2 = wrap2.querySelector("[data-reactions-picker]");
            if (picker2) picker2.hidden = !picker2.hidden;
          }
        }
        break;
      case "pickCommentReaction":
      case "toggleCommentReaction":
        {
          var commentId = action.dataset.commentId;
          var emoji2 = action.dataset.emoji;
          if (commentId && emoji2) {
            var comment = state.comments.find(function (c) {
              return c && c.id === commentId;
            });
            if (comment) {
              var rx2 = Array.isArray(comment.reactions)
                ? comment.reactions
                : [];
              var idx2 = rx2.indexOf(emoji2);
              var next2 =
                idx2 >= 0
                  ? rx2.slice(0, idx2).concat(rx2.slice(idx2 + 1))
                  : rx2.concat([emoji2]);
              comment.reactions = next2;
              updateMemoCommentInVault(commentId, { reactions: next2 }).catch(
                function () {},
              );
              renderDetachedMemo();
            }
          }
          detachedCloseAllReactionPickers();
        }
        break;
      default:
        break;
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-task-line]")) {
      const commentNode = closestElement(event.target, "[data-comment-id]");
      if (commentNode) {
        toggleDetachedCommentTask(
          commentNode.dataset.commentId,
          Number(event.target.dataset.taskLine),
          event.target.checked,
        );
      }
      return;
    }
    if (event.target !== els.commentFileInput) return;
    const files = Array.from(els.commentFileInput.files || []);
    els.commentFileInput.value = "";
    if (!files.length) return;
    insertDetachedCommentFiles(files);
  }

  function handleInput(event) {
    if (event.target === els.findInput) {
      doFindDebounced(event.target.value);
    }
  }

  function handleKeydown(event) {
    // Find bar: Escape closes it
    if (state.findOpen && event.key === "Escape") {
      event.preventDefault();
      closeFindBar();
      return;
    }
    // Find bar: Enter navigates
    if (state.findOpen && event.key === "Enter") {
      event.preventDefault();
      navigateFind(event.shiftKey ? -1 : 1);
      return;
    }
    // Ctrl+F opens find bar (not inside comment editor)
    if (
      !state.findOpen &&
      (event.ctrlKey || event.metaKey) &&
      event.key === "f" &&
      !isDetachedCommentEditorTarget(event.target)
    ) {
      event.preventDefault();
      openFindBar();
      return;
    }
    if (
      event.key === "Escape" &&
      root.querySelector("[data-reactions-picker]:not([hidden])")
    ) {
      detachedCloseAllReactionPickers();
      return;
    }
    if (
      event.key === "Escape" &&
      root.querySelector("[data-inline-task-detail-dialog]")
    ) {
      event.preventDefault();
      closeDetachedInlineTaskDetailDialog();
      return;
    }
    if (!isDetachedCommentEditorTarget(event.target)) return;
    if (event.isComposing) return;
    if (event.key !== "Enter") return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (hasOpenMemoEditorMenu()) return;
    event.preventDefault();
    event.stopPropagation();
    submitDetachedComment();
  }

  function handleSubmit(event) {
    if (event.target !== els.commentForm) return;
    event.preventDefault();
    submitDetachedComment();
  }

  function runDetachedCommentAction(action, commentId) {
    switch (action) {
      case "edit":
        startDetachedCommentEdit(commentId);
        break;
      case "save":
        saveDetachedCommentEdit();
        break;
      case "cancel":
        cancelDetachedCommentEdit();
        break;
      case "preview":
        toggleDetachedCommentEditPreview();
        break;
      case "delete":
        deleteDetachedComment(commentId);
        break;
      case "toggleExpand":
        toggleDetachedCommentExpand(commentId);
        break;
      case "history":
        openDetachedCommentHistory(commentId);
        break;
      case "copy":
        copyDetachedComment(commentId);
        break;
      case "reply":
        detachedReplyToComment(commentId);
        break;
      case "openCommentReplies":
        detachedOpenCommentReplies(commentId);
        break;
      default:
        break;
    }
  }

  function toggleDetachedCommentExpand(commentId) {
    if (!commentId) return;
    if (state.commentExpandedIds.has(commentId)) {
      state.commentExpandedIds.delete(commentId);
    } else {
      state.commentExpandedIds.add(commentId);
    }
    renderDetachedMemo();
  }

  function toggleDetachedCommentTask(commentId, lineIndex, checked) {
    const comment = state.comments.find(
      (item) => item && item.id === commentId,
    );
    if (!comment || state.commentSaving) return;
    const lines = String(comment.content || "").split("\n");
    if (!lines[lineIndex]) return;
    lines[lineIndex] = updateTaskLine(lines[lineIndex], checked);
    state.commentSaving = true;
    syncDetachedCommentForm();
    updateMemoCommentInVault(comment.id, { content: lines.join("\n") })
      .then(
        function (updated) {
          const normalized = normalizeMemoCommentPayload(updated);
          if (normalized) {
            state.comments = state.comments.map((item) =>
              item.id === normalized.id ? normalized : item,
            );
          }
          renderDetachedMemo();
        },
        function (err) {
          showToast("更新评论代办失败: " + errorMessage(err));
          renderDetachedMemo();
        },
      )
      .finally(function () {
        state.commentSaving = false;
        syncDetachedCommentForm();
      });
  }

  function openDetachedInlineTaskDetail(target) {
    const lineIndex = Number(target.dataset.taskDetail);
    const sourceType = target.dataset.taskDetailSourceType || "memo";
    const sourceCommentId = target.dataset.taskDetailCommentId || "";
    const sourceMemoId = target.dataset.taskDetailMemoId || "";

    let content = "";
    let memo = sourceMemoId
      ? state.memos.find(function (item) {
          return item && item.id === sourceMemoId;
        }) || state.memo
      : state.memo;
    let comment = null;

    if (sourceType === "comment" && sourceCommentId) {
      comment = state.comments.find(
        (item) => item && item.id === sourceCommentId,
      );
      content = comment ? String(comment.content || "") : "";
    } else {
      content = memo ? String(memo.content || "") : "";
    }

    const lines = content.split("\n");
    const line = lines[lineIndex] || "";
    const task = parseTaskLine(line);
    if (!task) return;

    // Check if task text contains a [[task:xxx|label]] reference
    var taskRefId = extractTaskRefId(task.text);
    if (taskRefId) {
      getTask(taskRefId).then(
        function (fullTask) {
          var info = {
            title: fullTask.title || "",
            desc: fullTask.notes || "",
            checked: fullTask.status === "completed",
            completedAt: fullTask.completedAt || "",
            createdAt: fullTask.createdAt || (memo ? memo.createdAt : ""),
            reminders: fullTask.reminders || [],
            projectId: fullTask.projectId || (memo ? memo.projectId : ""),
            memoId: sourceMemoId,
          };
          showDetachedTaskDetailOverlay(info);
        },
        function () {
          var parsed = parseTaskTitleAndDesc(stripTaskRefSyntax(task.text));
          showDetachedTaskDetailOverlay({
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

    const parsed = parseTaskTitleAndDesc(task.text);
    const info = {
      title: parsed.title,
      desc: parsed.desc,
      checked: task.checked,
      completedAt: "",
      createdAt: memo ? memo.createdAt : "",
      reminders: [],
      projectId: memo ? memo.projectId : "",
      memoId: sourceMemoId,
    };

    showDetachedTaskDetailOverlay(info);
  }

  function showDetachedTaskDetailOverlay(info) {
    closeDetachedInlineTaskDetailDialog();
    const overlay = document.createElement("div");
    overlay.className = "tn-overlay tn-dialog-layer is-open memo-dialog";
    overlay.setAttribute("data-inline-task-detail-dialog", "");
    overlay.setAttribute("data-n", "detached-task-detail-dialog-host");
    const rows = [];
    if (info.createdAt)
      rows.push({
        label: "创建",
        value: formatDetachedInlineTaskDate(info.createdAt),
      });
    if (info.completedAt)
      rows.push({
        label: "完成",
        value: formatDetachedInlineTaskDate(info.completedAt),
      });
    if (info.reminders?.length) {
      rows.push({
        label: "提醒",
        value: info.reminders.map(formatInlineTaskReminder).join("、"),
      });
    }
    const project =
      info.projectName ||
      state.projects.find(function (item) {
        return item?.id === info.projectId;
      })?.name ||
      "";
    if (project) rows.push({ label: "项目", value: project });
    renderTimelessView(
      overlay,
      InlineTaskDetailView({
        description: info.desc || "",
        memoId: "",
        rows,
        statusClass: info.checked ? "is-complete" : "is-open",
        statusLabel: info.checked ? "已完成" : "未完成",
        title: info.title,
      }),
    );
    root.appendChild(overlay);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeDetachedInlineTaskDetailDialog();
    });
    overlay.addEventListener("click", function (event) {
      const closeBtn = closestElement(
        event.target,
        "[data-inline-task-detail-close]",
      );
      if (closeBtn) closeDetachedInlineTaskDetailDialog();
    });
  }

  function closeDetachedInlineTaskDetailDialog() {
    const existing = root.querySelector("[data-inline-task-detail-dialog]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
  }

  function formatDetachedInlineTaskDate(isoString) {
    try {
      return formatDateTime(new Date(isoString));
    } catch (_) {
      return isoString;
    }
  }

  function startDetachedCommentEdit(commentId) {
    const comment = state.comments.find(
      (item) => item && item.id === commentId,
    );
    if (!comment) return;
    destroyDetachedCommentEditEditor({ preserveDraft: false });
    state.commentEditingId = comment.id;
    state.commentEditDraft = comment.content || "";
    state.commentEditPreviewVisible = false;
    renderDetachedMemo();
    if (detachedCommentEditEditor) detachedCommentEditEditor.focus();
  }

  function cancelDetachedCommentEdit() {
    destroyDetachedCommentEditEditor({ preserveDraft: false });
    state.commentEditingId = "";
    state.commentEditDraft = "";
    state.commentEditPreviewVisible = false;
    renderDetachedMemo();
    return Promise.resolve({ ok: true, message: "cancelled" });
  }

  function saveDetachedCommentEdit() {
    const commentId = state.commentEditingId;
    if (!commentId || state.commentSaving)
      return Promise.resolve({ ok: false, message: "没有正在编辑的评论" });
    if (detachedCommentEditEditor)
      state.commentEditDraft = detachedCommentEditEditor.getText();
    const content = String(state.commentEditDraft || "");
    if (!content.trim()) {
      showToast("评论不能为空");
      if (detachedCommentEditEditor) detachedCommentEditEditor.focus();
      return Promise.resolve({ ok: false, message: "评论不能为空" });
    }

    state.commentSaving = true;
    syncDetachedCommentForm();
    return updateMemoCommentInVault(commentId, { content })
      .then(
        function (comment) {
          const normalized = normalizeMemoCommentPayload(comment);
          if (normalized) {
            state.comments = state.comments.map((item) =>
              item.id === normalized.id ? normalized : item,
            );
          }
          destroyDetachedCommentEditEditor({ preserveDraft: false });
          state.commentEditingId = "";
          state.commentEditDraft = "";
          state.commentEditPreviewVisible = false;
          renderDetachedMemo();
          showToast("已保存评论");
          return { ok: true, message: "已保存评论" };
        },
        function (err) {
          showToast("保存评论失败: " + errorMessage(err));
          return { ok: false, message: "保存评论失败: " + errorMessage(err) };
        },
      )
      .finally(function () {
        state.commentSaving = false;
        syncDetachedCommentForm();
      });
  }

  function deleteDetachedComment(commentId) {
    const comment = state.comments.find(
      (item) => item && item.id === commentId,
    );
    if (!comment || state.commentSaving) return;
    confirmDetachedCommentDelete(comment).then(function (confirmed) {
      if (!confirmed || state.commentSaving) return;
      state.commentSaving = true;
      syncDetachedCommentForm();
      deleteMemoCommentInVault(comment.id, { cleanupAssets: true })
        .then(
          function () {
            state.comments = state.comments.filter(
              (item) => item.id !== comment.id,
            );
            state.commentExpandedIds.delete(comment.id);
            if (state.commentEditingId === comment.id) {
              destroyDetachedCommentEditEditor({ preserveDraft: false });
              state.commentEditingId = "";
              state.commentEditDraft = "";
              state.commentEditPreviewVisible = false;
            }
            renderDetachedMemo();
            showToast("已删除评论");
          },
          function (err) {
            showToast("删除评论失败: " + errorMessage(err));
          },
        )
        .finally(function () {
          state.commentSaving = false;
          syncDetachedCommentForm();
        });
    });
  }

  function confirmDetachedCommentDelete(comment) {
    return new Promise(function (resolve) {
      const existing = root.querySelector(
        "[data-detached-comment-delete-dialog]",
      );
      if (existing) {
        unmountTimelessView(existing);
        existing.remove();
      }

      const dialog = document.createElement("div");
      dialog.className =
        "tn-overlay tn-dialog-layer is-open memo-delete-dialog";
      dialog.dataset.detachedCommentDeleteDialog = "true";
      dialog.dataset.n = "detached-comment-delete-dialog-host";
      renderTimelessView(
        dialog,
        ConfirmDeleteView({
          actionAttribute: "data-detached-comment-delete-action",
          description: compactText(comment.content || "", 72),
          meaning: "detached-comment-delete-dialog",
          title: "删除评论？",
        }),
      );
      root.appendChild(dialog);

      function close(value) {
        document.removeEventListener("keydown", handleDialogKeydown, true);
        unmountTimelessView(dialog);
        dialog.remove();
        resolve(Boolean(value));
      }

      function handleDialogKeydown(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close(false);
      }

      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          close(false);
          return;
        }
        const action = closestElement(
          event.target,
          "[data-detached-comment-delete-action]",
        );
        if (!action || !dialog.contains(action)) return;
        event.preventDefault();
        event.stopPropagation();
        close(action.dataset.detachedCommentDeleteAction === "confirm");
      });

      document.addEventListener("keydown", handleDialogKeydown, true);
      window.requestAnimationFrame(function () {
        const cancel = dialog.querySelector(
          '[data-detached-comment-delete-action="cancel"]',
        );
        if (cancel) cancel.focus();
      });
    });
  }

  function insertDetachedCommentFiles(files) {
    if (!detachedCommentEditor || state.commentSaving) return;
    filesToMarkdown(files).then(
      function (markdown) {
        if (!markdown) return;
        insertTextIntoDetachedComment(markdown);
      },
      function (err) {
        showToast(uploadErrorMessage(err));
      },
    );
  }

  function insertTextIntoDetachedComment(text) {
    if (!detachedCommentEditor) return;
    detachedCommentEditor.insertBlock(String(text || ""));
    detachedCommentEditor.focus();
    syncDetachedCommentForm();
  }

  function isDetachedCommentEditorTarget(target) {
    return Boolean(
      els.commentEditorHost &&
      target &&
      (target === els.commentEditorHost ||
        els.commentEditorHost.contains(target)),
    );
  }

  // ---- find bar ----

  function openFindBar() {
    clearFindHighlights();
    state.findOpen = true;
    els.findBar.hidden = false;
    els.findInput.value = "";
    els.findInput.focus();
    els.findInput.select();
    state.findQuery = "";
    state.findMatches = [];
    state.findActiveIndex = -1;
    updateFindCount();
  }

  function closeFindBar() {
    state.findOpen = false;
    state.findQuery = "";
    state.findMatches = [];
    state.findActiveIndex = -1;
    els.findBar.hidden = true;
    renderDetachedMemo();
  }

  function doFind(query, matchTerms) {
    clearFindHighlights();
    state.findQuery = query;

    if (!query) {
      state.findMatches = [];
      state.findActiveIndex = -1;
      updateFindCount();
      return;
    }

    var lowerQuery = query.toLowerCase();
    var textNodes = [];

    function collectTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node);
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !node.closest(
          "mark, script, style, textarea, [data-window-comment-editor]",
        )
      ) {
        for (var i = 0; i < node.childNodes.length; i++) {
          collectTextNodes(node.childNodes[i]);
        }
      }
    }
    collectTextNodes(els.content);

    var marks = [];
    textNodes.forEach(function (textNode) {
      var text = textNode.textContent;
      if (matchTerms) {
        var highlightedParts = memoQuickSearchHighlightParts(text, query);
        if (
          !highlightedParts.some(function (part) {
            return part.matched;
          })
        )
          return;
        var highlightedParent = textNode.parentNode;
        if (!highlightedParent) return;
        highlightedParts.forEach(function (part) {
          if (!part.matched) {
            highlightedParent.insertBefore(
              document.createTextNode(part.text),
              textNode,
            );
            return;
          }
          var highlightedMark = document.createElement("mark");
          highlightedMark.className = "memo-find-match";
          highlightedMark.textContent = part.text;
          marks.push(highlightedMark);
          highlightedParent.insertBefore(highlightedMark, textNode);
        });
        highlightedParent.removeChild(textNode);
        return;
      }
      var lower = text.toLowerCase();
      var fragments = [];
      var idx = 0;

      while (idx < text.length) {
        var found = lower.indexOf(lowerQuery, idx);
        if (found === -1) {
          fragments.push(document.createTextNode(text.slice(idx)));
          break;
        }
        if (found > idx) {
          fragments.push(document.createTextNode(text.slice(idx, found)));
        }
        var mark = document.createElement("mark");
        mark.className = "memo-find-match";
        mark.textContent = text.slice(found, found + query.length);
        marks.push(mark);
        fragments.push(mark);
        idx = found + query.length;
      }

      if (fragments.length > 0) {
        var parent = textNode.parentNode;
        if (parent) {
          for (var j = 0; j < fragments.length; j++) {
            parent.insertBefore(fragments[j], textNode);
          }
          parent.removeChild(textNode);
        }
      }
    });

    state.findMatches = marks;
    state.findActiveIndex = marks.length > 0 ? 0 : -1;
    updateFindCount();
    updateFindActiveClass();
    scrollToActiveMatch();
  }

  function applyDetachedSearchHighlights() {
    const query = String(state.searchQuery || "").trim();
    if (!query || state.findOpen) return;
    doFind(query, true);
  }

  function navigateFind(direction) {
    if (!state.findMatches.length) return;
    var len = state.findMatches.length;
    state.findActiveIndex = (state.findActiveIndex + direction + len) % len;
    updateFindCount();
    updateFindActiveClass();
    scrollToActiveMatch();
  }

  function clearFindHighlights() {
    for (var i = state.findMatches.length - 1; i >= 0; i--) {
      var mark = state.findMatches[i];
      var parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
      }
    }
    if (state.findMatches.length > 0) {
      els.content.normalize();
    }
    state.findMatches = [];
    state.findActiveIndex = -1;
  }

  function updateFindCount() {
    if (!els.findCount) return;
    var total = state.findMatches.length;
    var active = total > 0 ? state.findActiveIndex + 1 : 0;
    els.findCount.textContent = total > 0 ? active + "/" + total : "0/0";
  }

  function updateFindActiveClass() {
    for (var i = 0; i < state.findMatches.length; i++) {
      state.findMatches[i].classList.toggle(
        "is-active",
        i === state.findActiveIndex,
      );
    }
  }

  function scrollToActiveMatch() {
    var active = state.findMatches[state.findActiveIndex];
    if (active) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  var findDebounceTimer = null;
  function doFindDebounced(query) {
    clearTimeout(findDebounceTimer);
    findDebounceTimer = setTimeout(function () {
      doFind(query);
    }, 200);
  }

  function hasOpenMemoEditorMenu() {
    return Boolean(
      document.querySelector(
        [
          ".file-picker-menu:not(.hidden)",
          ".memo-ref-menu:not(.hidden)",
          ".slash-command-menu:not(.hidden)",
          ".tag-picker-menu:not(.hidden)",
          ".time-picker-menu:not(.hidden)",
        ].join(","),
      ),
    );
  }

  function loadDetachedComments(memoId) {
    const id = String(memoId || "").trim();
    if (!id) {
      state.comments = [];
      renderDetachedMemo();
      return;
    }
    loadMemoCommentsFromVault(id).then(
      function (comments) {
        state.comments = comments
          .map(normalizeMemoCommentPayload)
          .filter(Boolean);
        renderDetachedMemo();
      },
      function (err) {
        state.comments = [];
        renderDetachedMemo();
        showToast("读取评论失败: " + errorMessage(err));
      },
    );
  }

  function submitDetachedComment() {
    const memo = state.memo;
    if (detachedCommentEditor)
      state.commentDraft = detachedCommentEditor.getText();
    if (!memo || state.commentSaving) return Promise.resolve();
    const content = String(state.commentDraft || "").trim();
    if (!content) {
      syncDetachedCommentForm();
      return Promise.resolve();
    }

    state.commentSaving = true;
    syncDetachedCommentForm();
    var replyTo = state.replyToCommentId || "";
    return createMemoCommentInVault(
      memo.id,
      state.commentDraft,
      undefined,
      undefined,
      replyTo,
    )
      .then(
        function (comment) {
          const normalized = normalizeMemoCommentPayload(comment);
          if (normalized) {
            state.comments = state.comments
              .filter(function (item) {
                return item && item.id !== normalized.id;
              })
              .concat(normalized);
          }
          state.commentDraft = "";
          state.commentPreviewVisible = false;
          state.replyToCommentId = "";
          if (detachedCommentEditor) detachedCommentEditor.setText("");
          renderDetachedMemo();
          syncDetachedCommentForm();
          showToast("已评论");
        },
        function (err) {
          showToast("评论失败: " + errorMessage(err));
        },
      )
      .finally(function () {
        state.commentSaving = false;
        syncDetachedCommentForm();
      });
  }

  function detachedReplyToComment(commentId) {
    var comment = state.comments.find(function (c) {
      return c && c.id === commentId;
    });
    if (!comment) return;
    state.replyToCommentId = commentId;
    syncDetachedCommentForm();
    if (detachedCommentEditor) detachedCommentEditor.focus();
  }

  function detachedOpenCommentReplies(commentId) {
    const payload = buildCommentDetailPayload(
      state.comments,
      state.memos,
      commentId,
      "",
    );
    if (!payload) {
      showToast("找不到评论详情");
      return;
    }
    writeMemoQuickSearchOpenContext(
      globalThis.localStorage,
      payload.memo.id,
      null,
    );
    writeCommentDetailPayload(globalThis.localStorage, payload);
    if (typeof invoke !== "function") {
      window.open(
        "comment-replies.html?id=" + encodeURIComponent(commentId),
        "_blank",
        "noopener",
      );
      return;
    }
    invoke("/api/comment-replies/open", {
      method: "POST",
      args: payload,
    }).catch(function (err) {
      showToast("打开评论详情失败: " + errorMessage(err));
    });
  }

  function commentsForDetachedMemo(memoId) {
    const id = String(memoId || "").trim();
    return state.comments
      .filter((comment) => comment && comment.memoId === id)
      .sort(function (a, b) {
        const left = new Date(a.createdAt || 0).getTime() || 0;
        const right = new Date(b.createdAt || 0).getTime() || 0;
        if (left === right) return b.id.localeCompare(a.id);
        return right - left;
      });
  }

  function detachedMemoDocuments() {
    return memoDocumentsWithComments(state.memos, state.comments, state.memos);
  }

  function syncDetachedCommentForm() {
    if (!els.commentSubmit) return;
    if (
      detachedCommentEditor &&
      detachedCommentEditor.getText() !== state.commentDraft
    ) {
      detachedCommentEditor.setText(state.commentDraft);
    }
    els.commentSubmit.disabled =
      !state.memo ||
      state.commentSaving ||
      !String(state.commentDraft || "").trim();
    if (els.commentEditorHost) {
      els.commentEditorHost.classList.toggle(
        "is-disabled",
        !state.memo || state.commentSaving,
      );
    }
  }

  function syncDetachedCommentExpandControls() {
    if (!els.content) return;
    const collapsibleItems = els.content.querySelectorAll(
      "[data-window-comment-collapse]",
    );
    collapsibleItems.forEach(function (item) {
      const content = item.querySelector(".memo-comment-content");
      if (!content) return;

      item.classList.remove("is-short");
      if (
        item.classList.contains("is-collapsed") &&
        content.scrollHeight <= content.clientHeight + 1
      ) {
        item.classList.add("is-short");
      }

      content.querySelectorAll("img").forEach(function (image) {
        if (image.complete) return;
        if (image.dataset.memoWindowCommentExpandWatch) return;
        image.dataset.memoWindowCommentExpandWatch = "true";
        image.addEventListener("load", syncDetachedCommentExpandControls, {
          once: true,
        });
      });
    });
  }

  function runWindowControl(control) {
    switch (control) {
      case "close":
        snapshotDetachedWindowState().finally(function () {
          forgetDetachedWindowOpenState().finally(function () {
            callNativeWindow("__velo/window/close").catch(function () {
              window.close();
            });
          });
        });
        break;
      case "minimize":
        callNativeWindow("__velo/window/minimize").catch(function () {});
        break;
      case "toggleMaximize":
        callNativeWindow("__velo/window/toggle_maximize").catch(function () {});
        break;
      case "toggleFixed":
        state.fixed = !state.fixed;
        applyFixedState();
        snapshotDetachedWindowState().catch(function () {});
        if (state.windowSession && state.windowSession.setFixed) {
          state.windowSession.setFixed(state.fixed).catch(function () {});
        }
        break;
      default:
        break;
    }
  }

  function applyFixedState() {
    renderFixedButton();
    document.body.classList.toggle("is-fixed-window", state.fixed);
    callNativeWindow("__velo/window/set_always_on_top", {
      onTop: state.fixed,
    }).catch(function () {});
  }

  function forgetDetachedWindowOpenState() {
    if (state.windowSession && state.windowSession.forget) {
      return state.windowSession.forget();
    }
    if (typeof invoke !== "function" || !state.windowName)
      return Promise.resolve(null);
    return invoke(
      "/api/window/opened/forget?name=" + encodeURIComponent(state.windowName),
      { method: "GET" },
    ).catch(function () {});
  }

  function detachedWindowSessionState() {
    return {
      commentEditPreviewVisible: state.commentEditPreviewVisible,
      commentExpandedIds: Array.from(state.commentExpandedIds || []),
      commentPreviewVisible: state.commentPreviewVisible,
      memoId: state.memo && state.memo.id,
      scrollTop: els.content ? els.content.scrollTop : 0,
    };
  }

  function restoreDetachedWindowSessionState(sessionState) {
    const saved =
      sessionState && typeof sessionState === "object" ? sessionState : {};
    state.commentPreviewVisible = saved.commentPreviewVisible === true;
    state.commentEditPreviewVisible = saved.commentEditPreviewVisible === true;
    if (Array.isArray(saved.commentExpandedIds)) {
      state.commentExpandedIds = new Set(
        saved.commentExpandedIds.map(String).filter(Boolean),
      );
    }
    window.setTimeout(function () {
      if (els.content && Number.isFinite(Number(saved.scrollTop))) {
        els.content.scrollTop = Number(saved.scrollTop);
      }
    }, 0);
  }

  function scheduleDetachedWindowSessionSnapshot() {
    if (state.windowSession && state.windowSession.scheduleSnapshot) {
      state.windowSession.scheduleSnapshot();
    }
  }

  function renderFixedButton() {
    if (!els.fixedButton) return;
    els.fixedButton.classList.toggle("is-active", state.fixed);
    els.fixedButton.setAttribute(
      "aria-pressed",
      state.fixed ? "true" : "false",
    );
    els.fixedButton.setAttribute(
      "title",
      state.fixed ? "取消悬浮" : "悬浮在所有窗口上方",
    );
  }

  function openEditMemoWindow() {
    var memo = state.memo;
    if (!memo) return;
    if (typeof invoke !== "function") return;
    invoke("/api/memo-window/edit", {
      method: "POST",
      args: {
        memo: memo,
        memos: state.memos,
        projects: [],
      },
    }).catch(function () {});
  }

  function renderDetachedMemo() {
    const memo = state.memo;
    if (!memo) {
      renderDetachedState("找不到 memo");
      return;
    }

    destroyDetachedCommentEditEditor();
    const context = detachedMemoRenderContext(state, memo.id, {
      readonly: true,
    });
    document.title = "ThreadNote";
    renderDetachedProject(memo);
    renderTimelessView(
      els.content,
      DetachedMemoCardView({
        comments: detachedCommentsPresentation(
          commentsForDetachedMemo(memo.id),
          context,
        ),
        memo: detachedMemoPresentation(memo, context),
      }),
    );
    if (state.commentEditingId) {
      detachedCommentEditEditor = createDetachedCommentEditEditor(
        state.commentEditDraft,
      );
      renderDetachedCommentEditPreview();
      if (detachedCommentEditEditor) detachedCommentEditEditor.focus();
    }
    syncDetachedCommentExpandControls();
    syncDetachedCommentForm();
    renderDetachedCommentPreview();
    applyDetachedSearchHighlights();
  }

  function detachedMemoPresentation(memo, context) {
    let html = "";
    try {
      html = renderMemoMarkdown(memo.content, context);
    } catch (_) {
      html = `<p>${escapeHTML(memo.content || "")}</p>`;
    }
    const resources = collectResources([memo]);
    const stats = [Array.from(String(memo.content || "")).length + " 字符"];
    const counts = [
      [
        resources.filter(function (item) {
          return item.type === "file";
        }).length,
        "文件",
      ],
      [
        resources.filter(function (item) {
          return item.type === "image";
        }).length,
        "图片",
      ],
      [collectTodos([memo]).length, "代办"],
      [collectCodeBlocks([memo]).length, "代码块"],
      [collectLinks([memo]).length, "链接"],
    ];
    counts.forEach(function ([count, label]) {
      if (count) stats.push(count + " " + label);
    });
    const headings = collectMemoHeadings(memo.content).filter(
      function (heading) {
        return heading && heading.text;
      },
    );
    let toc = [];
    if (headings.length >= 2) {
      const min_level = Math.min.apply(
        null,
        headings.map(function (heading) {
          return Number(heading.level) || 1;
        }),
      );
      toc = headings.map(function (heading) {
        const level = Math.max(1, Math.min(6, Number(heading.level) || 1));
        return {
          depth: Math.max(0, Math.min(5, level - min_level)),
          level,
          lineNumber: heading.lineNumber,
          text: heading.text,
        };
      });
    }
    return {
      backlinks: memoBacklinkCount(context, memo.id),
      createdAt: memo.createdAt,
      hasHistory: Boolean(memo.updatedAt),
      headings: toc,
      html,
      id: memo.id,
      pinned: Boolean(memo.pinned),
      reactions: Array.isArray(memo.reactions) ? memo.reactions.slice() : [],
      relativeTime: formatRelativeDate(memo.createdAt),
      stats,
      tags: extractTags(memo.content),
    };
  }

  function detachedCommentsPresentation(comments, context) {
    const reply_counts = {};
    const by_id = {};
    comments.forEach(function (comment) {
      if (!comment?.id) return;
      reply_counts[comment.id] = 0;
      by_id[comment.id] = comment;
    });
    comments.forEach(function (comment) {
      if (
        comment?.replyTo &&
        Object.prototype.hasOwnProperty.call(reply_counts, comment.replyTo)
      ) {
        reply_counts[comment.replyTo] += 1;
      }
    });
    return comments.map(function (comment) {
      const comment_id = String(comment.id || "").trim();
      const memo_id = String(comment.memoId || "").trim();
      const render_context = {
        ...context,
        readonly: false,
        showLineNumbers: false,
        sourceCommentId: comment_id,
        sourceId: comment_id || context.sourceId || "",
        sourceMemoId: memo_id || context.sourceMemoId || context.sourceId || "",
        sourceType: "comment",
        stack: comment_id ? [comment_id] : context.stack || [],
      };
      let html = "";
      try {
        html = renderMemoMarkdown(comment.content || "", render_context);
      } catch (_) {
        html = `<p>${escapeHTML(comment.content || "")}</p>`;
      }
      const parent = comment.replyTo ? by_id[comment.replyTo] : null;
      let preview = parent
        ? String(parent.content || "")
            .replace(/\n/g, " ")
            .trim()
        : "";
      if (preview.length > 80) preview = preview.slice(0, 80) + "...";
      const time = comment.updatedAt || comment.createdAt;
      return {
        editing: comment.id === state.commentEditingId,
        expanded: state.commentExpandedIds.has(comment.id),
        hasHistory: Boolean(comment.updatedAt),
        highlighted: false,
        html,
        id: comment.id,
        reactions: Array.isArray(comment.reactions)
          ? comment.reactions.slice()
          : [],
        relativeTime: formatRelativeDate(time),
        replyCount: reply_counts[comment.id] || 0,
        replyLabel:
          preview || (comment.replyTo ? "comment:" + comment.replyTo : ""),
        replyTitle: preview || comment.replyTo || "",
        replyTo: comment.replyTo || "",
        time,
      };
    });
  }

  function renderDetachedState(message) {
    document.title = "ThreadNote";
    renderDetachedProject(null);
    renderTimelessView(
      els.content,
      EmptyStateView({
        class: "memo-window-empty",
        meaning: "detached-memo-empty",
        message,
      }),
    );
    state.commentDraft = "";
    state.commentEditingId = "";
    state.commentEditDraft = "";
    state.commentExpandedIds = new Set();
    syncDetachedCommentForm();
  }

  function renderDetachedProject(memo) {
    if (!els.project) return;
    if (!memo) {
      els.project.hidden = true;
      renderTimelessView(els.project, null);
      return;
    }

    var projectId = normalizeProjectID(memo.projectId);
    if (!projectId) {
      els.project.hidden = true;
      renderTimelessView(els.project, null);
      return;
    }

    var project = state.projects.find(function (p) {
      return p && p.id === projectId;
    });
    if (!project) {
      els.project.hidden = true;
      renderTimelessView(els.project, null);
      return;
    }

    renderTimelessView(
      els.project,
      TimelessPrimitive.Fragment({}, [project.name]),
    );
    els.project.hidden = false;
  }

  function detachMemoFromWindow(memoId) {
    const target = state.memos.find((memo) => memo && memo.id === memoId);
    if (!target) {
      showToast("找不到引用的 memo");
      return;
    }
    writeMemoQuickSearchOpenContext(globalThis.localStorage, memoId, null);
    if (typeof invoke !== "function") {
      window.open(
        "memo-window.html?id=" + encodeURIComponent(memoId),
        "_blank",
        "noopener",
      );
      return;
    }
    invoke("/api/memo-window/open", {
      method: "POST",
      args: {
        memo: target,
        memos: state.memos,
      },
    }).catch(function (err) {
      showToast("打开 memo 失败: " + errorMessage(err));
    });
  }

  function copyDetachedMemo() {
    if (!state.memo) return;
    copyText(state.memo.content).then(
      function () {
        showToast("已复制");
      },
      function () {
        showToast("复制失败");
      },
    );
  }

  function copyDetachedMemoRef() {
    if (!state.memo) return;
    copyText(
      `[[memo:${state.memo.id}|${memoReferenceAlias(memoTitle(state.memo))}]]`,
    ).then(
      function () {
        showToast("已复制 memo 引用");
      },
      function () {
        showToast("复制失败");
      },
    );
  }

  function copyDetachedComment(commentId) {
    const comment = state.comments.find(
      (item) => item && item.id === commentId,
    );
    if (!comment) return;
    copyText(comment.content).then(
      function () {
        showToast("已复制");
      },
      function () {
        showToast("复制失败");
      },
    );
  }

  function openDetachedMemoHistory(memoId) {
    state.historyRecordId = memoId;
    state.historyRecordType = "memo";
    state.historyVersions = [];
    state.historyLoading = true;
    state.historyError = "";
    state.historyPreviewContent = "";
    state.historyPreviewVersion = 0;
    state.restoringVersion = 0;
    state.historyInlineDiffs = {};
    state.historyExpandedDiffs = {};
    state.historyDiffLoading = {};
    state.historyOpen = true;
    renderDetachedHistoryDialog();
    loadMemoHistoryFromVault(memoId).then(
      function (data) {
        state.historyVersions = Array.isArray(data.versions)
          ? data.versions
          : [];
        state.historyLoading = false;
        loadAllDetachedHistoryDiffs(memoId, "memo");
        renderDetachedHistoryDialog();
      },
      function (err) {
        state.historyError = errorMessage(err);
        state.historyLoading = false;
        renderDetachedHistoryDialog();
      },
    );
  }

  function openDetachedCommentHistory(commentId) {
    state.historyRecordId = commentId;
    state.historyRecordType = "comment";
    state.historyVersions = [];
    state.historyLoading = true;
    state.historyError = "";
    state.historyPreviewContent = "";
    state.historyPreviewVersion = 0;
    state.restoringVersion = 0;
    state.historyInlineDiffs = {};
    state.historyExpandedDiffs = {};
    state.historyDiffLoading = {};
    state.historyOpen = true;
    renderDetachedHistoryDialog();
    loadCommentHistoryFromVault(commentId).then(
      function (data) {
        state.historyVersions = Array.isArray(data.versions)
          ? data.versions
          : [];
        state.historyLoading = false;
        loadAllDetachedHistoryDiffs(commentId, "comment");
        renderDetachedHistoryDialog();
      },
      function (err) {
        state.historyError = errorMessage(err);
        state.historyLoading = false;
        renderDetachedHistoryDialog();
      },
    );
  }

  function loadAllDetachedHistoryDiffs(recordId, recordType) {
    var versions = state.historyVersions;
    if (!versions.length) return;

    for (var i = 0; i < versions.length; i++) {
      state.historyExpandedDiffs[versions[i].version] = true;
      state.historyDiffLoading[versions[i].version] = true;
    }
    renderDetachedHistoryDialog();

    // Load base content (version 0) once, then replay contentOps locally
    var loadFn =
      recordType === "comment"
        ? loadCommentHistoryVersionFromVault
        : loadMemoHistoryVersionFromVault;
    loadFn(recordId, 0).then(
      function (data) {
        var baseContent = stripMemoFrontmatter(data.content || "");

        var versionContents = {};
        versionContents[0] = baseContent;
        var current = baseContent;
        for (var i = 0; i < versions.length; i++) {
          var v = versions[i];
          if (v.contentOps && v.contentOps.length) {
            current = applyContentOpsToString(current, v.contentOps);
          }
          versionContents[v.version] = current;
        }

        for (var j = 0; j < versions.length; j++) {
          var ver = versions[j].version;
          state.historyDiffLoading[ver] = false;
          state.historyInlineDiffs[ver] = createHistoryDiffSegments(
            versionContents[ver - 1] || "",
            versionContents[ver] || "",
          );
        }
        renderDetachedHistoryDialog();
      },
      function () {
        for (var j = 0; j < versions.length; j++) {
          state.historyDiffLoading[versions[j].version] = false;
        }
        state.historyError = "加载历史内容失败";
        renderDetachedHistoryDialog();
      },
    );
  }

  function closeDetachedHistoryDialog() {
    state.historyOpen = false;
    renderDetachedHistoryDialog();
  }

  function previewDetachedHistoryVersion(version) {
    var recordId = state.historyRecordId;
    var recordType = state.historyRecordType;
    var loadFn =
      recordType === "comment"
        ? loadCommentHistoryVersionFromVault
        : loadMemoHistoryVersionFromVault;
    state.historyPreviewVersion = version;
    state.historyPreviewContent = "加载中...";
    renderDetachedHistoryDialog();
    loadFn(recordId, version).then(
      function (data) {
        state.historyPreviewContent = data.content || "";
        renderDetachedHistoryDialog();
      },
      function (err) {
        state.historyPreviewContent = "加载失败: " + errorMessage(err);
        renderDetachedHistoryDialog();
      },
    );
  }

  function restoreDetachedHistoryVersion(version) {
    var recordId = state.historyRecordId;
    var recordType = state.historyRecordType;
    var restoreFn =
      recordType === "comment"
        ? restoreCommentHistoryVersionFromVault
        : restoreMemoHistoryVersionFromVault;
    state.restoringVersion = version;
    renderDetachedHistoryDialog();
    restoreFn(recordId, version).then(
      function (result) {
        state.restoringVersion = 0;
        state.historyOpen = false;
        renderDetachedHistoryDialog();
        if (recordType === "comment") {
          // Reload comments for this memo
          var memoId = state.memo && state.memo.id;
          if (memoId) {
            loadMemoCommentsFromVault(memoId).then(
              function (comments) {
                state.comments = comments;
                renderDetachedMemo();
              },
              function () {
                showToast("评论历史已回退，请刷新查看");
              },
            );
          }
        } else {
          // Reload memo from vault
          var targetMemoId = state.memo && state.memo.id;
          if (targetMemoId) {
            loadMemosFromVault({ id: targetMemoId }).then(
              function (memos) {
                var updated = Array.isArray(memos)
                  ? memos.find(function (m) {
                      return m.id === targetMemoId;
                    })
                  : null;
                if (updated) state.memo = updated;
                renderDetachedMemo();
              },
              function () {
                showToast("Memo 历史已回退，请刷新查看");
              },
            );
          }
        }
      },
      function (err) {
        state.restoringVersion = 0;
        state.historyError = "回退失败: " + errorMessage(err);
        renderDetachedHistoryDialog();
      },
    );
  }

  function renderDetachedHistoryDialog() {
    var host = root.querySelector("[data-history-dialog-host]");
    if (!state.historyOpen) {
      if (host) {
        unmountTimelessView(host);
        host.remove();
      }
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-history-dialog-host", "true");
      host.setAttribute("data-n", "detached-memo-history-dialog-host");
      root.appendChild(host);
      host.addEventListener("click", function (event) {
        var backdrop = closestElement(event.target, "[data-history-backdrop]");
        var close_button = closestElement(event.target, "[data-action]");
        if (
          (close_button &&
            close_button.dataset.action === "closeHistoryDialog") ||
          (backdrop && event.target === backdrop)
        ) {
          closeDetachedHistoryDialog();
        }
      });
    }
    renderTimelessView(
      host,
      HistoryDialogView(historyDialogPresentation(state)),
    );
  }

  function toggleDetachedHistoryDiff(version) {
    state.historyExpandedDiffs[version] = !state.historyExpandedDiffs[version];
    renderDetachedHistoryDialog();
  }

  function openFileInSelectedEditor(button) {
    const file = button.dataset.editorFile || "";
    const label =
      button.dataset.editorLabel || button.dataset.editorAppName || "编辑器";
    if (!file) {
      showToast("没有可打开的本地文件");
      return;
    }
    if (typeof invoke !== "function") {
      showToast("当前环境不支持打开 " + label);
      return;
    }

    const line = button.dataset.editorLine || "1";
    const col = button.dataset.editorCol || "1";
    const appId = button.dataset.editorAppId || "";
    const appName = button.dataset.editorAppName || "";
    const appPath = button.dataset.editorAppPath || "";
    let url =
      "/api/editor/open?file=" +
      encodeURIComponent(file) +
      "&line=" +
      encodeURIComponent(line) +
      "&col=" +
      encodeURIComponent(col);
    if (appId) url += "&app=" + encodeURIComponent(appId);
    if (appName) url += "&appName=" + encodeURIComponent(appName);
    if (appPath) url += "&appPath=" + encodeURIComponent(appPath);
    button.disabled = true;
    invoke(url, { method: "GET" })
      .then(
        function (resp) {
          if (!resp || resp.code !== 0) {
            showToast((resp && resp.msg) || "打开 " + label + " 失败");
            return;
          }
          showToast("已在 " + label + " 中打开");
        },
        function (err) {
          showToast("打开 " + label + " 失败: " + err);
        },
      )
      .finally(function () {
        button.disabled = false;
      });
  }

  function openExternalLinkInDefaultBrowser(url) {
    if (typeof invoke !== "function") {
      window.open(url, "_blank", "noopener");
      return;
    }

    invoke("/api/external/open?url=" + encodeURIComponent(url), {
      method: "GET",
    }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开链接失败");
        }
      },
      function (err) {
        showToast("打开链接失败: " + err);
      },
    );
  }

  function openDetachedImagePreview(element) {
    openImagePreviewFromElement(element).catch(function (err) {
      showToast("打开图片预览失败: " + errorMessage(err));
    });
  }

  function callNativeWindow(method, args) {
    if (typeof invoke !== "function") {
      return Promise.reject(new Error("go bridge not available"));
    }
    return invoke(method, { args: args || {} });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, 1800);
  }
}
