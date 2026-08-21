import {
  DEFAULT_VISIBILITY,
  VISIBILITY,
  buildMemoReferenceIndex,
  collectTags,
  collectTodos,
  compactText,
  extractProjectDirective,
  extractTags,
  isMemoFenceClosingLine,
  memoBacklinkCount,
  memoReferenceAlias,
  memoTitle,
  normalizeMemoPayload,
  parseMemoFenceLine,
  parseTaskLine,
  stripProjectDirective,
  updateTaskLine,
} from "@/domain/memos.js";
import { normalizeProjectID } from "@/domain/projects.js";
import { parseAssetReference } from "@/domain/storage.js";
import {
  loadTasks,
  normalizeTaskSummary,
} from "@/domain/tasks.js";
import {
  loadGTDItems,
  loadGTDMilestones,
  normalizeGTDItem,
  normalizeGTDMilestone,
} from "@/domain/gtd.js";
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
  createMemoInVault,
  deleteMemoInVault,
  errorMessage,
  loadMemoHistoryFromVault,
  loadMemoHistoryVersionFromVault,
  loadMemos,
  loadMemosFromVault,
  restoreMemoHistoryVersionFromVault,
  saveMemos,
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
  SmallCalendarModel,
} from "@/components.js";
import {
  buildCommentDetailPayload,
  writeCommentDetailPayload,
} from "@/comment-detail-model.js";
import {
  buildTodoDetailPayload,
  writeTodoDetailPayload,
} from "@/todo-detail-model.js";
import { openImagePreviewFromElement } from "@/components/image-preview.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";

import {
  createHomeBoardController,
  createHomeBoardState,
} from "./home_board.js";
import {
  applyYamlFrontmatterMeta,
  createHomeClipboardController,
  createHomeClipboardState,
  extractYamlFrontmatter,
} from "./home_clipboard.js";
import {
  createHomeCodeblockController,
  toggleCodeCollapse,
} from "./home_codeblock.js";
import { createHomeFileController } from "./home_file.js";
import {
  bindMemoImageContextMenu,
  createHomeImageController,
} from "./home_image.js";
import {
  createHomeItemController,
  createHomeItemState,
} from "./home_item.js";
import {
  copyInlineLinkFromAction,
  createHomeLinkController,
  createHomeLinkState,
} from "./home_link.js";
import {
  createHomeMilestoneController,
  createHomeMilestoneState,
} from "./home_milestone.js";
import {
  createHomeProjectController,
  createHomeProjectState,
} from "./home_project.js";
import {
  createHomeTodoController,
  createHomeTodoState,
  loadTaskFilter,
  normalizeTaskFilter,
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
import { MemoListModel } from "./memo.model.js";
import {
  activeViewMeta,
  applyContentOpsToString,
  stripMemoFrontmatter,
} from "./memo-view-model.js";
import {
  EDITOR_SETTINGS_STORAGE_KEY,
  createMiniEditor,
  filesToMarkdown,
  loadEditorSettings,
  loadEditorSettingsFromVault,
  normalizeEditorSettings,
  refreshCloudStorageSettings,
  uploadErrorMessage,
} from "./memo-editor.js";
import {
  collectMemoHeadings,
  renderMemoMarkdown,
} from "./memo-markdown.js";
import { mountMemoEditDialog } from "./memo-dialog-edit.js";
import {
  formatRelativeDate,
  memoDateCounts,
} from "./memo-date.js";
import { calendarDayInfo } from "./memo-calendar-info.js";
import {
  MemoQuickSearchModel,
  writeMemoQuickSearchOpenContext,
} from "./memo-quick-search-model.js";
import {
  closestAnchor,
  closestElement,
  copyText,
  escapeCSSIdent,
  escapeHTML,
  externalBrowserURLFromAnchor,
} from "./memo-utils.js";
import {
  EditorPreviewView,
  HistoryDialogView,
  InlinePromptView,
  MemoDialogView,
  MemoFeedView,
  MemoSearchResultsView,
  PinnedMemoListView,
  PinDialogView,
  SourceMemoDialogView,
  SourceEditDialogView,
  TagListView,
} from "./home_memo.js";
import {
  appendTimelessHost,
  ConfirmDeleteView,
} from "./home_view_shared.js";
import { mountACPChat } from "./chat.js";

/** @typedef {import("./home.models").HomeMemoRecord} HomeMemoRecord */
/** @typedef {import("./home.models").MemoListModelInstance} MemoListModelInstance */

const SHORTCUTS_STORAGE_KEY = "demo-desktop:settings:shortcuts:v1";
const CLIPBOARD_FOREGROUND_MAX_AGE_MS = 60 * 1000;
const FEED_PAGE_SIZE = 10;
const HOME_VIEW_ROUTE_KEYS = Object.freeze({
  boards: "board",
  chat: "chat",
  clipboard: "clipboard",
  codeblocks: "codeblock",
  files: "file",
  images: "image",
  items: "item",
  links: "link",
  memos: "memo",
  milestones: "milestone",
  rules: "rule",
  todos: "todo",
});
function homeRouteName(active_view) {
  const route_key = HOME_VIEW_ROUTE_KEYS[active_view] || "memo";
  return `root.home_layout.index.${route_key}`;
}

export function createMemosPageState(initial_view = "memos") {
  const initial_state = {
    activeFilter: "all",
    activeTag: "",
    activeView: initial_view,
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
    ...createHomeLinkState(),
    draftsLoaded: false,
    editorSettings: loadEditorSettings(),
    editPreviewVisible: false,
    ...createHomeItemState(),
    ...createHomeMilestoneState(),
    ...createHomeProjectState(),
    composerPreviewVisible: false,
    ...createHomeBoardState(),
    memoRefIndex: null,
    memoDrafts: [],
    memoDialog: null,
    memos: loadMemos(),
    query: "",
    sortDesc: true,
    saving: false,
    ...createHomeTodoState(loadTaskFilter()),
    ...createHomeClipboardState(),
    clipboardForeground: true,
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

  const state_refs = {};
  Object.entries(initial_state).forEach(function ([key, value]) {
    state_refs[key] = ref(value);
  });

  const state = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return undefined;
        return state_refs[key]?.value;
      },
      set(_target, key, value) {
        if (typeof key !== "string") return false;
        if (!state_refs[key]) state_refs[key] = ref(value);
        else state_refs[key].as(value);
        return true;
      },
      has(_target, key) {
        return typeof key === "string" && key in state_refs;
      },
      ownKeys() {
        return Object.keys(state_refs);
      },
      getOwnPropertyDescriptor(_target, key) {
        if (typeof key !== "string" || !(key in state_refs)) return undefined;
        return { configurable: true, enumerable: true };
      },
    },
  );

  return {
    destroy() {
      Object.values(state_refs).forEach(function (state_ref) {
        state_ref.destroy?.();
      });
    },
    refs: state_refs,
    state,
  };
}

export function createMemosPageUIState() {
  return {
    allNavCount: ref("0"),
    boardNavCount: ref(""),
    clipboardCardClass: ref("memo-clipboard-card"),
    clipboardCardHidden: ref(true),
    clipboardNavCount: ref(""),
    codeBlocksShowAllChecked: ref(false),
    codeBlocksShowAllHidden: ref(true),
    codeNavCount: ref(""),
    composerClass: ref("memo-composer"),
    composerDraftStatusHidden: ref(true),
    composerStatus: ref(""),
    createButtonDisabled: ref(true),
    feedToolsHidden: ref(false),
    fileNavCount: ref(""),
    imageNavCount: ref(""),
    itemNavCount: ref(""),
    linkNavCount: ref(""),
    mainEyebrow: ref("THREAD / INBOX"),
    mainSubtitle: ref("捕捉、整理、回看"),
    mainTitle: ref("Inbox"),
    memoInspectorHidden: ref(false),
    memoListClass: ref("memo-list"),
    memoMainClass: ref("memo-main"),
    memoSearchPaletteHidden: ref(true),
    memoSearchQuery: ref(""),
    memoShellClass: ref("memo-shell"),
    milestoneNavCount: ref(""),
    rulesNavCount: ref(""),
    searchPlaceholder: ref("搜索 memos"),
    tagSummary: ref(""),
    toastClass: ref("memo-toast"),
    toastText: ref(""),
    todoNavCount: ref(""),
    topbarDefaultActionsHidden: ref(false),
    topbarProjectActionsHidden: ref(true),
  };
}

export function destroyMemosPageUIState(ui) {
  Object.values(ui).forEach(function (ui_ref) {
    ui_ref.destroy?.();
  });
}

export function mountMemosHome(root, options = {}) {
  const state = options.state;
  const ui = options.ui;
  const els = options.elements;
  if (!root || !state || !ui || !els) {
    throw new Error("mountMemosHome requires a page root and reactive state");
  }
  const smallCalendarModel = new SmallCalendarModel({
    getDayInfo: calendarDayInfo,
    onChange: handleSmallCalendarChange,
    weekStart: state.editorSettings.calendarWeekStart,
  });
  const memoCardExpansionModel = new MemoCardExpansionModel();
  const memoCardMenuModel = new MemoCardMenuModel();
  /** @type {MemoListModelInstance} */
  const memoListModel = MemoListModel();

  let composerEditor = null;
  let composerAutoSaveTimer = null;
  let composerDraftStatusTimer = null;
  let commentEditEditor = null;
  let commentEditEditorCommentId = "";
  let commentEditor = null;
  let commentEditorMemoId = "";
  let editEditor = null;
  let editEditorMemoId = "";
  let memoDialogEditor = null;
  let memoDialogController = null;
  let acpChatController = null;
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

  const unsubscribeMemoCardMenu =
    memoCardMenuModel.subscribe(syncMemoCardMenus);

  if (els.composerHost) composerEditor = createComposerEditor("");
  const imageContextMenu = bindMemoImageContextMenu(root, {
    notify: showToast,
    onPreview: openImagePreview,
  });

  let project_controller = null;
  const todo_controller = createHomeTodoController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    clearControlGroup,
    controlGroupValue,
    elements: els,
    findBoard(board_id) {
      return board_controller.findBoard(board_id);
    },
    focusMemo,
    formatDateTime,
    normalizeTaskFilter,
    projectLabel(project_id) {
      return project_controller.projectLabel(project_id);
    },
    refreshTasksFromVault,
    renderAll,
    renderProjectDetail() {
      project_controller.renderProjectDetail();
    },
    root,
    showToast,
    state,
  });
  const link_controller = createHomeLinkController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    elements: els,
    root,
    scopedMemoDocuments,
    showToast,
    state,
  });
  const board_controller = createHomeBoardController({
    clearControlGroup,
    controlGroupValue,
    elements: els,
    refreshTasks: refreshTasksFromVault,
    renderAll,
    renderProjectDetail() {
      project_controller.renderProjectDetail();
    },
    root,
    showToast,
    state,
  });
  project_controller = createHomeProjectController({
    boardView: board_controller.boardView,
    clearRetainedCompletedTasks: todo_controller.clearRetainedCompletedTasks,
    clearSelectedDate() {
      smallCalendarModel.setSelectedDate("", { silent: true });
    },
    elements: els,
    renderAll,
    safeMemoView,
    showPrompt: showInlinePrompt,
    showToast,
    state,
    syncMemoExpandControls,
    taskPresentation: todo_controller.taskPresentation,
    ui,
  });
  const codeblock_controller = createHomeCodeblockController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    elements: els,
    projectLabel(project_id) {
      return project_controller.projectLabel(project_id);
    },
    scopedMemoDocuments,
    showToast,
    state,
  });
  const file_controller = createHomeFileController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    elements: els,
    onCopy: copyFileBrowserURL,
    onOpenSource: openFileBrowserSource,
    onView: openFileBrowserItem,
    root,
    scopedMemoDocuments,
    state,
  });
  const image_controller = createHomeImageController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    elements: els,
    scopedMemoDocuments,
    state,
  });
  const codeBlocksModel = codeblock_controller.model;
  const {
    addRuleActionRow,
    addRuleConditionRow,
    backToBoardList,
    closeBoardPresets,
    closeProjectBoardPresets,
    closeRuleEditor,
    createBoardFromPreset,
    createProjectBoardFromPreset,
    deleteExistingBoard,
    deleteRule,
    editRule,
    handleBoardAddTaskSubmit,
    handleBoardCreateSubmit,
    handleBoardDragEnd,
    handleBoardDragLeave,
    handleBoardDragOver,
    handleBoardDragStart,
    handleBoardDrop,
    handleBoardTaskSelect,
    moveRuleDown,
    moveRuleUp,
    openAddRuleDialog,
    refreshBoardAndNotify,
    refreshBoardsFromVault,
    removeFromBoard,
    renderBoards,
    renderRulesOverview,
    saveRule,
    selectBoard,
    showBoardPresets,
    showProjectBoardPresets,
    toggleRuleEnabled,
    toggleBoardCardCompletion,
  } = board_controller;
  const {
    archiveProjectFromDetail,
    closeProjectDetail,
    createProjectFromPrompt,
    disconnectProjectScrollObserver,
    editProjectFromDetail,
    memoProjectPresentation,
    openProjectDetail,
    projectLabel,
    projectOptionsPresentation,
    refreshProjectsFromVault,
    rememberComposerProject,
    renderComposerProjectSelect,
    renderProjectDetail,
    renderProjects,
    resolveOrCreateProjectByName,
    selectProjectFilter,
    selectProjectTab,
  } = project_controller;
  const {
    addTaskNote,
    clearRetainedCompletedTasks,
    closeInlineTaskDetailDialog,
    closeTaskEditDialog,
    completeLinkedTaskFromSource,
    copyTaskRef,
    createTaskFromForm,
    deleteExistingTask,
    editCompletedAtInline,
    findLinkedTask,
    getTaskStats,
    openInlineTaskDetail,
    openTaskEditDialog,
    renderTodos,
    scopedTasks,
    selectTaskFilter,
    syncSourceMemoTaskLine,
    taskDateValue,
    taskTimeValue,
    toggleExistingTaskCompletion,
  } = todo_controller;
  const {
    addDomainChip,
    copyLink,
    fetchLinkTitle,
    loadNextPage: loadNextLinksPage,
    refreshDomainChips,
    refreshLinksDomainFilter,
    removeLinksDomainChip,
    renderLinks,
  } = link_controller;
  const {
    appendCodeBlocksPage,
    copyCodeBlock,
    renderCodeBlocks,
  } = codeblock_controller;
  const { renderFiles } = file_controller;
  const { renderImages } = image_controller;
  const clipboard_controller = createHomeClipboardController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    clearSelectedDate() {
      smallCalendarModel.setSelectedDate("", { silent: true });
    },
    elements: els,
    isForeground: isClipboardForeground,
    parseDisplayTime,
    refreshTasks: refreshTasksFromVault,
    rememberComposerProject,
    renderAll,
    renderMainContent,
    renderViewButtons,
    resolveProject: resolveOrCreateProjectByName,
    showToast,
    state,
    ui,
  });
  const {
    acceptClipboardItem,
    hideClipboardCard,
    renderClipboardView,
    requestClipboardLatest,
  } = clipboard_controller;
  const item_controller = createHomeItemController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    clearControlGroup,
    controlGroupValue,
    elements: els,
    projectLabel,
    refreshGTD: refreshGTDFromVault,
    renderAll,
    showToast,
    state,
    taskTimeValue,
  });
  const milestone_controller = createHomeMilestoneController({
    beforeRender() {
      if (!editEditor) return;
      syncEditDraftFromEditor();
      editEditor.destroy();
      editEditor = null;
      editEditorMemoId = "";
    },
    clearControlGroup,
    controlGroupValue,
    elements: els,
    refreshGTD: refreshGTDFromVault,
    renderAll,
    showToast,
    state,
    taskDateValue,
    taskTimeValue,
  });
  const {
    closeExistingGTDItem,
    createGTDItemFromForm,
    deleteExistingGTDItem,
    renderGTDItems,
    scopedGTDItems,
    scopedGTDMilestones,
    toggleExistingGTDItemCompletion,
    updateExistingGTDItem,
  } = item_controller;
  const {
    createGTDMilestoneFromForm,
    renderGTDMilestones,
    updateExistingGTDMilestone,
  } = milestone_controller;

  renderAll();
  if (composerEditor) renderComposerStatus(composerEditor.getText());
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
  const memo_scroll_container = els.memoList.parentElement;
  memo_scroll_container?.addEventListener("scroll", handleMemoListScroll);
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
    activateView(active_view) {
      activateWorkspaceView(active_view);
    },
    activateFilter(filter) {
      state.activeView = "memos";
      state.activeProjectId = "";
      state.activeFilter = filter || "all";
      state.activeTag = "";
      smallCalendarModel.setSelectedDate("", { silent: true });
      renderAll();
    },
    createProject() {
      createProjectFromPrompt();
    },
    showSettings() {
      openSettings();
    },
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
      memo_scroll_container?.removeEventListener(
        "scroll",
        handleMemoListScroll,
      );
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("storage", handleStorage);
      imageContextMenu.destroy();
      file_controller.destroy();
      if (state.toastTimer) window.clearTimeout(state.toastTimer);
      clipboard_controller.destroy();
      if (state.highlightTimer) window.clearTimeout(state.highlightTimer);
      if (composerAutoSaveTimer) window.clearTimeout(composerAutoSaveTimer);
      composerAutoSaveTimer = null;
      if (composerDraftStatusTimer)
        window.clearTimeout(composerDraftStatusTimer);
      composerDraftStatusTimer = null;
      if (composerEditor) composerEditor.destroy();
      if (commentEditor) commentEditor.destroy();
      if (commentEditEditor) commentEditEditor.destroy();
      if (editEditor) editEditor.destroy();
      if (memoDialogEditor) memoDialogEditor.destroy();
      if (memoDialogController) memoDialogController.destroy();
      if (acpChatController) acpChatController.destroy();
      disconnectProjectScrollObserver();
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
      if (els.composerHost) {
        unmountTimelessView(els.composerHost);
        composerEditor = createComposerEditor(composerText);
        renderComposerStatus(composerEditor.getText());
      } else {
        composerEditor = null;
      }

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
      function () {
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
      host = appendTimelessHost(root, {
        attributes: {
          "data-history-dialog-host": "true",
          n: "memo-history-dialog-host",
        },
      });
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

  function activateWorkspaceView(active_view) {
    if (!HOME_VIEW_ROUTE_KEYS[active_view]) return;
    if (state.activeView === active_view) return;
    clearRetainedCompletedTasks();
    state.activeView = active_view;
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
    renderAll();
  }

  function navigateHomeView(active_view) {
    if (!options.history) return;
    const route_name = homeRouteName(active_view);
    if (options.routeView?.curView?.name === route_name) return;
    options.history.push(route_name, {});
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
      navigateHomeView("memos");
      return;
    }

    const projectDetail = closestElement(event.target, "[data-project-detail]");
    if (projectDetail && root.contains(projectDetail)) {
      openProjectDetail(projectDetail.dataset.projectDetail);
      navigateHomeView("memos");
      return;
    }

    const projectTab = closestElement(event.target, "[data-project-tab]");
    if (projectTab && root.contains(projectTab)) {
      selectProjectTab(projectTab.dataset.projectTab);
      return;
    }

    const view = closestElement(event.target, "[data-view]");
    if (view && root.contains(view)) {
      const active_view = view.dataset.view;
      activateWorkspaceView(active_view);
      navigateHomeView(active_view);
      return;
    }

    const taskFilter = closestElement(event.target, "[data-task-filter]");
    if (taskFilter && root.contains(taskFilter)) {
      selectTaskFilter(taskFilter.dataset.taskFilter);
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
      clearTimeout(state._searchTimer);
      renderAll();
      break;
    case "filterLinksDomain":
      {
        const domain = action.dataset.domain || "";
        if (state.linksDomainFilter === domain) state.linksDomainFilter = "";
        else state.linksDomainFilter = domain;
        renderLinks();
      }
      break;
    case "removeLinksDomainChip":
      removeLinksDomainChip(action.dataset.domain || "");
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
      closeProjectDetail();
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
        refreshBoardAndNotify(refreshBid);
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
    ui.memoSearchPaletteHidden.as(!snapshot.open);
    if (!snapshot.open) return;
    ui.memoSearchQuery.as(snapshot.query);

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

  function openSourceMemo(memoId) {
    const memo = findMemo(memoId);
    if (!memo) {
      showToast("找不到引用的 memo");
      return;
    }
    renderSourceMemoDialog(memo);
  }

  function renderSourceMemoDialog(memo) {
    closeSourceMemoDialog();
    const overlay = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-source-memo-dialog": "",
        n: "source-memo-dialog-host",
      },
    });
    const context = memoRenderContext(memo.id, { showLineNumbers: false });
    let html = "";
    try {
      html = renderMemoMarkdown(memo.content, context);
    } catch (_) {
      html = `<p>${escapeHTML(memo.content || "")}</p>`;
    }
    renderTimelessView(overlay, SourceMemoDialogView({ html }));

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

  function handleInput(event) {
    if (event.target.matches("[data-memo-search-input]")) {
      memoQuickSearchModel.setQuery(event.target.value);
      ui.memoSearchQuery.as(event.target.value);
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
      ui.codeBlocksShowAllChecked.as(event.target.checked);
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
      toggleBoardCardCompletion(event.target);
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
    var yamlMeta = applyYamlFrontmatterMeta(yamlResult.meta, parseDisplayTime);
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
          ui.composerDraftStatusHidden.as(false);
          if (composerDraftStatusTimer)
            window.clearTimeout(composerDraftStatusTimer);
          composerDraftStatusTimer = window.setTimeout(function () {
            ui.composerDraftStatusHidden.as(true);
            composerDraftStatusTimer = null;
          }, 2000);
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
        ui.composerDraftStatusHidden.as(false);
        if (composerDraftStatusTimer)
          window.clearTimeout(composerDraftStatusTimer);
        composerDraftStatusTimer = window.setTimeout(function () {
          ui.composerDraftStatusHidden.as(true);
          composerDraftStatusTimer = null;
        }, 2000);
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

    const dialog = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-memo-dialog": "true",
        "data-memo-id": memo ? memo.id : "",
        n: "memo-dialog-host",
      },
    });
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
    var overlay = appendTimelessHost(root, {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-source-edit-dialog": "",
        n: "source-edit-dialog-host",
      },
    });
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
    var yamlMeta = applyYamlFrontmatterMeta(yamlResult.meta, parseDisplayTime);
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
      const dialog = appendTimelessHost(root, {
        class: "tn-overlay tn-dialog-layer is-open memo-delete-dialog",
        attributes: { n: "memo-delete-dialog-host" },
      });
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
    ui.mainEyebrow.as(viewMeta.eyebrow || "THREAD / INBOX");
    ui.mainTitle.as(viewMeta.title);
    ui.mainSubtitle.as(viewMeta.subtitle);
    ui.composerClass.as(
      "memo-composer" + (viewMeta.hideComposer ? " hidden" : ""),
    );
    ui.searchPlaceholder.as(viewMeta.searchPlaceholder);
    // The timeline, slim-window, GTD-window, and sort shortcuts belong to the
    // Inbox context only. Page metadata owns this visibility policy so new
    // collection views stay clean by default.
    ui.topbarDefaultActionsHidden.as(!viewMeta.showHomeActions);
    ui.topbarProjectActionsHidden.as(!isProjectDetail);
    // Toggle feed-tools search bar (hidden in project detail, search is in memo tab)
    ui.feedToolsHidden.as(isProjectDetail || state.activeView === "chat");
    // Flex layout for project-detail so the content fills remaining height
    ui.memoMainClass.as(
      "memo-main" + (isProjectDetail ? " is-project-detail" : ""),
    );
    const memo_list_classes = ["memo-list"];
    if (["todos", "items", "milestones"].includes(state.activeView))
      memo_list_classes.push("is-todo-list");
    if (["links", "files", "codeblocks"].includes(state.activeView))
      memo_list_classes.push("is-resource-list");
    if (state.activeView === "files") memo_list_classes.push("is-file-grid");
    if (state.activeView === "images") memo_list_classes.push("is-image-grid");
    if (state.activeView === "clipboard")
      memo_list_classes.push("is-clipboard-list");
    if (isProjectDetail) memo_list_classes.push("is-project-detail");
    if (state.activeView === "boards") memo_list_classes.push("is-board-list");
    if (state.activeView === "rules")
      memo_list_classes.push("is-rules-overview");
    if (state.activeView === "chat") memo_list_classes.push("is-acp-chat");
    ui.memoListClass.as(memo_list_classes.join(" "));
    ui.codeBlocksShowAllHidden.as(state.activeView !== "codeblocks");
    ui.codeBlocksShowAllChecked.as(codeBlocksModel.state.showAll);
    // Show inspector only on Inbox (memos) page
    const isInbox = state.activeView === "memos";
    ui.memoShellClass.as("memo-shell" + (isInbox ? "" : " no-inspector"));
    ui.memoInspectorHidden.as(!isInbox);
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

  function renderViewButtons() {
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
    ui.todoNavCount.as(todoStats.open ? String(todoStats.open) : "");
    ui.itemNavCount.as(openItemCount ? String(openItemCount) : "");
    ui.milestoneNavCount.as(
      activeMilestoneCount ? String(activeMilestoneCount) : "",
    );
    ui.linkNavCount.as(linkCount ? String(linkCount) : "");
    ui.codeNavCount.as(
      codeBlockCount
        ? codeSnippetCount
          ? `${codeSnippetCount}/${codeBlockCount}`
          : String(codeBlockCount)
        : "",
    );
    ui.fileNavCount.as(resourceCount ? String(resourceCount) : "");
    const imageCount = collectResources(documents).filter(
      (resource) => resource.type === "image",
    ).length;
    ui.imageNavCount.as(imageCount ? String(imageCount) : "");
    ui.clipboardNavCount.as(
      state.clipboardItem && state.clipboardItem.id ? "1" : "",
    );
    ui.boardNavCount.as(
      state.boards.length ? String(state.boards.length) : "",
    );
    var totalRules = state.boards.reduce(function (sum, b) {
      return sum + (b.rules || []).length;
    }, 0);
    ui.rulesNavCount.as(totalRules ? String(totalRules) : "");
  }

  function renderFilterButtons() {
    const activeMemoCount = scopedMemos().filter(
      (memo) => !memo.archived,
    ).length;
    ui.allNavCount.as(String(activeMemoCount));
  }

  function renderCalendar() {
    smallCalendarModel.setData({
      dateCounts: memoDateCounts(scopedMemos()),
      weekStart: calendarWeekStart(),
    });
  }

  function renderTags() {
    if (!els.tagList) return;
    const tags = collectTags(scopedMemos().filter((memo) => !memo.archived));
    ui.tagSummary.as(tags.length ? `${tags.length} 个标签` : "暂无标签");
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
    if (!els.pinnedList) return;
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
        loadNextLinksPage();
      } else if (state.activeView === "codeblocks") {
        appendCodeBlocksPage();
      } else if (
        state.activeView === "project-detail" &&
        typeof window.IntersectionObserver !== "function" &&
        (state.projectActiveTab === "memos" ||
          state.projectActiveTab === "tasks") &&
        project_controller.loadNext(state.projectActiveTab)
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

  function renderPinDialog() {
    var existing = root.querySelector("[data-pin-view-host]");
    if (existing) {
      unmountTimelessView(existing);
      existing.remove();
    }
    if (!state.pinDialogOpen) return;
    const host = appendTimelessHost(root, {
      attributes: {
        "data-pin-view-host": "true",
        n: "pin-dialog-host",
      },
    });
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
    ui.composerStatus.as(`${chars} 字符 / ${tagCount} 标签`);
    ui.createButtonDisabled.as(chars === 0 || state.saving);
  }

  function showInlinePrompt(title, defaultValue) {
    return new Promise(function (resolve) {
      const overlay = appendTimelessHost(root, {
        class: "memo-inline-prompt-overlay",
        attributes: { n: "inline-prompt-overlay" },
      });
      const dialog = appendTimelessHost(overlay, {
        class: "memo-inline-prompt-dialog",
        attributes: { n: "inline-prompt-dialog-host" },
      });
      renderTimelessView(
        dialog,
        InlinePromptView({
          title,
          value: defaultValue || "",
        }),
      );

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
    memoListModel.loadList().then(
      function (memos) {
        state.memos = memos;
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

  /** @returns {HomeMemoRecord[]} */
  function visibleMemos() {
    const selectedDate = smallCalendarModel.state.selectedDate;
    return memoListModel.filterList(state.memos, {
      activeFilter: state.activeFilter,
      activeProjectFilter: state.activeProjectFilter,
      activeTag: state.activeTag,
      comments: state.comments,
      query: state.query,
      selectedDate,
      sortDesc: state.sortDesc,
    });
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

  function findMemo(memoId) {
    return state.memos.find((memo) => memo.id === memoId);
  }

  function handleSmallCalendarChange(change) {
    if (change.action === "selectDate" || change.action === "today") {
      state.activeView = "memos";
      state.activeFilter = "all";
      state.activeTag = "";
      state.query = "";
      state.editingId = "";
      state.editPreviewVisible = false;
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
    ui.toastText.as(message);
    ui.toastClass.as("memo-toast is-visible");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      ui.toastClass.as("memo-toast");
    }, 1800);
  }
}
