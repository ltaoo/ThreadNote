import {
  collectTags,
  collectTodos,
  compactText,
  extractTags,
  memoBacklinkCount,
  memoReferenceAlias,
  memoTitle,
  normalizeMemoPayload,
  parseTaskLine,
  parseTaskTitleAndDesc,
  updateTaskLine,
} from "@/domain/memos.js";
import { normalizeProjectID } from "@/domain/projects.js";
import { getTask } from "@/domain/tasks.js";
import {
  collectCodeBlocks,
  collectLinks,
  collectResources,
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
  errorMessage,
  loadMemoFromLocal,
  loadMemoHistoryFromVault,
  loadMemoHistoryVersionFromVault,
  loadMemosFromVault,
  restoreMemoHistoryVersionFromVault,
  updateMemoInVault,
} from "@/domain/memo-repository.js";
import {
  buildCommentDetailPayload,
  writeCommentDetailPayload,
} from "@/comment-detail-model.js";
import { openImagePreviewFromElement } from "@/components/image-preview.js";
import { TimelessPrimitive } from "@/timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";
import { registerWindowSession } from "@/window-state.js";

import {
  copyCodeBlockFromAction,
  toggleCodeCollapse,
} from "./home_codeblock.js";
import { bindMemoImageContextMenu } from "./home_image.js";
import { copyInlineLinkFromAction } from "./home_link.js";
import {
  extractTaskRefId,
  formatInlineTaskReminder,
  InlineTaskDetailView,
  stripTaskRefSyntax,
} from "./home_todo.js";
import {
  createHistoryDiffSegments,
  editorFileOpenSettingsKey,
  formatDateTime,
  handleMemoRenderedCopy,
  historyDialogPresentation,
  memoDocumentsWithComments,
  scrollMemoTocLine,
} from "./home_memo_helpers.js";
import {
  applyContentOpsToString,
  detachedMemoRenderContext,
  stripMemoFrontmatter,
} from "./memo-view-model.js";
import {
  createMiniEditor,
  filesToMarkdown,
  loadEditorSettings,
  loadEditorSettingsFromVault,
  normalizeEditorSettings,
  uploadErrorMessage,
} from "./memo-editor.js";
import {
  collectMemoHeadings,
  renderMemoMarkdown,
} from "./memo-markdown.js";
import { formatRelativeDate } from "./memo-date.js";
import {
  memoQuickSearchContextKey,
  memoQuickSearchHighlightParts,
  readMemoQuickSearchOpenContext,
  writeMemoQuickSearchOpenContext,
} from "./memo-quick-search-model.js";
import {
  closestAnchor,
  closestElement,
  copyText,
  escapeHTML,
  externalBrowserURLFromAnchor,
} from "./memo-utils.js";
import {
  DetachedMemoCardView,
  DetachedMemoShellView,
  EditorPreviewView,
  HistoryDialogView,
} from "./home_memo.components.js";
import {
  appendTimelessHost,
  ConfirmDeleteView,
  EmptyStateView,
  renderTimelessHost,
} from "./home_view_shared.js";

const DETACHED_WINDOW_STATE_POLL_INTERVAL = 250;
const DETACHED_WINDOW_STATE_SNAPSHOT_DEBOUNCE = 800;
const MEMO_REACTIONS = Object.freeze([
  ["👍", "赞"],
  ["👎", "不赞"],
  ["😄", "开心"],
  ["🎉", "庆祝"],
  ["❤️", "喜欢"],
  ["🚀", "起飞"],
  ["👀", "关注"],
]);

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

  function toggleDetachedMemoReaction(memo_id, emoji) {
    if (!memo_id || !emoji) return;
    const memo =
      state.memo?.id === memo_id
        ? state.memo
        : state.memos.find(function (item) {
          return item.id === memo_id;
        });
    if (!memo) return;
    const reactions = Array.isArray(memo.reactions) ? memo.reactions : [];
    const reaction_index = reactions.indexOf(emoji);
    const next_reactions =
      reaction_index >= 0
        ? reactions
          .slice(0, reaction_index)
          .concat(reactions.slice(reaction_index + 1))
        : reactions.concat([emoji]);
    memo.reactions = next_reactions;
    const listed_memo = state.memos.find(function (item) {
      return item.id === memo_id;
    });
    if (listed_memo) listed_memo.reactions = next_reactions;
    updateMemoInVault(memo_id, { reactions: next_reactions }).catch(
      function () {},
    );
    renderDetachedMemo();
  }

  function toggleDetachedCommentReaction(comment_id, emoji) {
    if (!comment_id || !emoji) return;
    const comment = state.comments.find(function (item) {
      return item && item.id === comment_id;
    });
    if (!comment) return;
    const reactions = Array.isArray(comment.reactions) ? comment.reactions : [];
    const reaction_index = reactions.indexOf(emoji);
    const next_reactions =
      reaction_index >= 0
        ? reactions
          .slice(0, reaction_index)
          .concat(reactions.slice(reaction_index + 1))
        : reactions.concat([emoji]);
    comment.reactions = next_reactions;
    updateMemoCommentInVault(comment_id, { reactions: next_reactions }).catch(
      function () {},
    );
    renderDetachedMemo();
  }

  function reactionMenuStore(reactions, on_click) {
    const active_reactions = new Set(
      Array.isArray(reactions) ? reactions : [],
    );
    const items = MEMO_REACTIONS.map(function ([emoji, label]) {
      return new TimelessPrimitive.vm.MenuItemCore({
        label: emoji + " " + label,
        onClick() {
          on_click(emoji);
        },
        shortcut: active_reactions.has(emoji) ? "已选择" : "",
      });
    });
    return new TimelessPrimitive.vm.DropdownMenuCore({ items });
  }

  function handleClick(event) {
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
    case "toggleMemoReaction":
      {
        const memo_id = action.dataset.memoId || state.memo?.id;
        toggleDetachedMemoReaction(memo_id, action.dataset.emoji);
      }
      break;
    case "toggleCommentReaction":
      toggleDetachedCommentReaction(
        action.dataset.commentId,
        action.dataset.emoji,
      );
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
    const overlay = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-inline-task-detail-dialog": "",
        n: "detached-task-detail-dialog-host",
      },
    });
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

      const dialog = appendTimelessHost(root, {
        class: "tn-overlay tn-dialog-layer is-open memo-delete-dialog",
        attributes: {
          "data-detached-comment-delete-dialog": "true",
          n: "detached-comment-delete-dialog-host",
        },
      });
      renderTimelessView(
        dialog,
        ConfirmDeleteView({
          actionAttribute: "data-detached-comment-delete-action",
          description: compactText(comment.content || "", 72),
          meaning: "detached-comment-delete-dialog",
          title: "删除评论？",
        }),
      );

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
          var highlightedMark = renderTimelessHost(
            { as: "mark", class: "memo-find-match" },
            [part.text],
          );
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
        var mark = renderTimelessHost(
          { as: "mark", class: "memo-find-match" },
          [text.slice(found, found + query.length)],
        );
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
      reactionMenu: reactionMenuStore(memo.reactions, function (emoji) {
        toggleDetachedMemoReaction(memo.id, emoji);
      }),
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
        reactionMenu: reactionMenuStore(comment.reactions, function (emoji) {
          toggleDetachedCommentReaction(comment.id, emoji);
        }),
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
      function () {
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
      host = appendTimelessHost(root, {
        attributes: {
          "data-history-dialog-host": "true",
          n: "detached-memo-history-dialog-host",
        },
      });
    }
    renderTimelessView(
      host,
      HistoryDialogView({
        ...historyDialogPresentation(state),
        store: new TimelessPrimitive.vm.DialogCore({
          footer: false,
          onCancel: closeDetachedHistoryDialog,
          open: true,
          title: "",
        }),
      }),
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
