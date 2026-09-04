import { buildMemoReferenceIndex, collectTags, DEFAULT_VISIBILITY, normalizeMemoPayload } from "./domain/memos.js";
import {
  createMemoInVault,
  errorMessage,
  loadMemosFromVault,
  saveMemos,
} from "./domain/memo-repository.js";
import { openImagePreviewFromElement } from "./components/image-preview.js";
import { createMiniEditor, loadEditorSettings, loadEditorSettingsFromVault } from "./pages/home/memo-editor.js";
import { renderMemoMarkdown } from "./pages/home/memo-markdown.js?v=20260820-todo-checkbox-unify";
import {
  Timeless,
  TimelessPrimitive,
} from "./timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "./timeless-view-mount.js";
import { forgetPersistedWindow, registerWindowSession, setPersistedWindowFixed } from "./window-state.js";

const COMPOSER_STORAGE_KEY = "demo-desktop:memo-slim:composer:v1";
const HISTORY_PAGE_SIZE = 10;
const HISTORY_TOP_THRESHOLD = 44;
const HISTORY_IMAGE_WAIT_MS = 3000;
const HISTORY_INPUT_QUIET_MS = 140;
const TIMELINE_GAP_MS = 5 * 60 * 1000;
const EMOJIS = ["😀", "😄", "😂", "🥰", "😎", "🤔", "👍", "👏", "🎉", "✅", "💡", "❤️"];

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[MemoSlim] Root element not found");
    return;
  }
  mountMemoSlim(root);
});

function mountMemoSlim(root) {
  const params = new URLSearchParams(window.location.search);
  const state = {
    error: "",
    editorSettings: loadEditorSettings(),
    fixed: params.get("fixed") === "1",
    hasLoaded: false,
    historyLoadTask: 0,
    historyLoadArmed: false,
    historyInputLocked: false,
    historyInputUnlockTask: 0,
    historyCommitLocked: false,
    historyCommitUnlockTask: 0,
    historyDebugSequence: 0,
    historyDebugTransaction: null,
    historyLoadTrigger: null,
    historyRenderVersion: 0,
    loadingHistory: false,
    loading: false,
    memos: [],
    returningToBottom: false,
    saving: false,
    stickToBottom: true,
    toastTimer: null,
    visibleMemoCount: HISTORY_PAGE_SIZE,
  };
  registerWindowSession({
    entryPage: "memo-slim.html",
    fixed: state.fixed,
    title: "Memo",
  });

  renderTimelessView(root, MemoSlimShellView({
    onSubmit() {
      createMemo();
    },
  }));

  let composerEditor = null;
  const els = {
    composerStatus: root.querySelector("[data-slim-composer-status]"),
    backToBottom: root.querySelector("[data-slim-back-to-bottom]"),
    count: root.querySelector("[data-slim-count]"),
    editorHost: root.querySelector("[data-slim-editor-host]"),
    emojiPanel: root.querySelector("[data-slim-emoji-panel]"),
    fixedMenuItem: root.querySelector('[data-slim-action="toggleFixed"]'),
    form: root.querySelector("[data-slim-form]"),
    historyLoading: root.querySelector("[data-slim-history-loading]"),
    list: root.querySelector("[data-slim-list]"),
    menu: root.querySelector("[data-slim-menu]"),
    menuButton: root.querySelector("[data-slim-menu-button]"),
    submit: root.querySelector("[data-slim-submit]"),
    shell: root.querySelector(".memo-slim-shell"),
    toast: root.querySelector("[data-toast]"),
    vimStatus: root.querySelector("[data-slim-vim-status]"),
  };
  window.__memoSlimHistoryLogs = [];
  window.__memoSlimDumpHistoryLogs = function () {
    return JSON.stringify(window.__memoSlimHistoryLogs, null, 2);
  };
  console.info(
    "[MemoSlim][History] 调试日志已启用；执行 copy(window.__memoSlimDumpHistoryLogs()) 可复制完整日志",
  );

  mountComposerEditor(readComposerDraft());
  updateComposerState();

  root.addEventListener("click", function (event) {
    const action = closestElement(event.target, "[data-slim-action]");
    if (action && root.contains(action)) {
      event.preventDefault();
      runAction(action.dataset.slimAction, action);
      return;
    }

    const externalLink = closestElement(event.target, "[data-external-url]");
    if (externalLink && root.contains(externalLink)) {
      event.preventDefault();
      openExternalURL(externalLink.dataset.externalUrl);
      return;
    }

    const markdownAction = closestElement(event.target, "[data-action]");
    if (markdownAction && root.contains(markdownAction)) {
      event.preventDefault();
      runMarkdownAction(markdownAction);
      return;
    }

    const imagePreview = closestElement(event.target, "[data-image-preview-src]");
    if (imagePreview && root.contains(imagePreview)) {
      event.preventDefault();
      openImagePreviewFromElement(imagePreview).catch(function (err) {
        showToast("打开图片失败: " + errorMessage(err));
      });
      return;
    }

    const memoReference = closestElement(event.target, "[data-memo-ref-target]");
    if (memoReference && root.contains(memoReference)) {
      event.preventDefault();
      revealMemoReference(memoReference.dataset.memoRefTarget);
      return;
    }

    const markdownLink = closestElement(event.target, ".memo-slim-content a[href]");
    if (markdownLink && root.contains(markdownLink)) {
      const target = safeExternalURL(markdownLink.getAttribute("href"));
      if (target) {
        event.preventDefault();
        openExternalURL(target);
        return;
      }
    }

    if (!closestElement(event.target, "[data-slim-menu-wrap]")) closeMenu();
    if (!closestElement(event.target, "[data-slim-emoji-wrap]")) closeEmojiPanel();
  });
  els.editorHost.addEventListener("keydown", handleEditorKeydown, true);
  els.list.addEventListener("scroll", handleListScroll, { passive: true });
  els.list.addEventListener("wheel", function (event) {
    state.returningToBottom = false;
    if (state.historyCommitLocked) {
      recordHistoryWheel(event, true);
      event.preventDefault();
      return;
    }
    if (event.deltaY < 0) {
      const preventHistoryWheel = Boolean(
        state.historyInputLocked ||
        (state.loadingHistory && els.list.scrollTop <= HISTORY_TOP_THRESHOLD)
      );
      recordHistoryWheel(event, preventHistoryWheel);
      if (preventHistoryWheel) {
        event.preventDefault();
        state.historyLoadArmed = false;
        lockHistoryInputUntilQuiet();
        return;
      }
      if (!state.historyLoadTask && !state.loadingHistory) {
        state.historyLoadTrigger = {
          deltaY: debugNumber(event.deltaY),
          source: "wheel",
          scroll: historyScrollMetrics(),
        };
      }
      state.historyLoadArmed = true;
      state.stickToBottom = false;
      updateBackToBottom();
      scheduleHistoryLoad();
      return;
    }
    recordHistoryWheel(event, false);
    releaseHistoryInputLock();
    state.historyLoadArmed = false;
    window.requestAnimationFrame(function () {
      state.stickToBottom = isListNearBottom();
      updateBackToBottom();
    });
  }, { passive: false });
  els.list.addEventListener("pointerdown", function () {
    state.returningToBottom = false;
    state.historyLoadArmed = true;
    if (!state.historyLoadTask && !state.loadingHistory) {
      state.historyLoadTrigger = {
        source: "pointerdown",
        scroll: historyScrollMetrics(),
      };
    }
  }, { passive: true });
  ["pointerup", "touchend"].forEach(function (eventName) {
    els.list.addEventListener(eventName, function () {
      state.stickToBottom = isListNearBottom();
      updateBackToBottom();
    }, { passive: true });
  });
  window.addEventListener("focus", function () {
    refreshMemos();
  });
  window.addEventListener("resize", function () {
    if (!state.stickToBottom) return;
    window.requestAnimationFrame(function () {
      scrollListToBottom();
    });
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshMemos();
  });

  applyFixedState();
  loadEditorSettingsFromVault().then(function (settings) {
    const vimChanged = Boolean(settings && settings.vimMode) !== Boolean(state.editorSettings && state.editorSettings.vimMode);
    state.editorSettings = settings || state.editorSettings;
    if (vimChanged) mountComposerEditor(composerText());
    updateComposerState();
  }).catch(function () {});
  refreshMemos({ forceBottom: true });
  window.requestAnimationFrame(function () {
    if (composerEditor) composerEditor.focus();
  });

  function mountComposerEditor(value) {
    if (composerEditor) composerEditor.destroy();
    composerEditor = null;
    unmountTimelessView(els.editorHost);
    unmountTimelessView(els.vimStatus);
    composerEditor = createMiniEditor(els.editorHost, {
      memoItems() {
        return state.memos;
      },
      tagItems() {
        return collectTags(state.memos.filter(function (memo) {
          return memo && !memo.archived;
        }));
      },
      onChange(nextValue) {
        writeComposerDraft(nextValue);
        updateComposerState();
      },
      onCommit() {
        return createMemo();
      },
      onDiscard() {
        composerEditor.setText("");
        writeComposerDraft("");
        updateComposerState();
        showToast("草稿已丢弃");
      },
      onQuit() {
        composerEditor.blur();
      },
      onSave() {
        writeComposerDraft(composerText());
        showToast("草稿已保存");
      },
      onSubmit() {
        return createMemo();
      },
      onWriteDraft() {
        writeComposerDraft(composerText());
        showToast("草稿已保存");
      },
      placeholder: "输入 memo",
      value: value || "",
      vim: Boolean(state.editorSettings && state.editorSettings.vimMode),
      vimStatusHost: els.vimStatus,
    });
  }

  function handleEditorKeydown(event) {
    if (event.key === "Escape") {
      closeMenu();
      closeEmojiPanel();
    }
    if (state.editorSettings && state.editorSettings.vimMode) return;
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    createMemo();
  }

  function refreshMemos(options = {}) {
    if (state.loading) return;
    const scrollState = captureScrollState(Boolean(options.forceBottom));
    const previousMemoCount = visibleChronologicalMemos(state.memos).length;
    state.loading = true;
    if (!state.hasLoaded) renderList({ forceBottom: true });

    loadMemosFromVault().then(
      function (memos) {
        state.error = "";
        state.memos = memos.map(normalizeMemoPayload).filter(Boolean);
        const nextMemoCount = visibleChronologicalMemos(state.memos).length;
        if (!scrollState.forceBottom && nextMemoCount > previousMemoCount) {
          state.visibleMemoCount += nextMemoCount - previousMemoCount;
        }
      },
      function (err) {
        state.error = "读取 memo 失败: " + errorMessage(err);
        if (state.hasLoaded) showToast(state.error);
      },
    ).finally(function () {
      state.loading = false;
      state.hasLoaded = true;
      renderList(scrollState);
    });
  }

  function createMemo() {
    if (state.saving) return Promise.resolve(false);
    const content = composerText();
    if (!content.trim()) {
      if (composerEditor) composerEditor.focus();
      return Promise.resolve(false);
    }

    state.saving = true;
    state.error = "";
    updateComposerState();
    return createMemoInVault(content, DEFAULT_VISIBILITY).then(
      function (memo) {
        const normalized = normalizeMemoPayload(memo);
        if (normalized) {
          state.memos = state.memos.filter(function (item) {
            return item && item.id !== normalized.id;
          }).concat(normalized);
          saveMemos(state.memos);
        }
        if (composerEditor) composerEditor.setText("");
        writeComposerDraft("");
        renderList({ forceBottom: true });
        return true;
      },
      function (err) {
        state.error = "发送失败: " + errorMessage(err);
        showToast(state.error);
        return false;
      },
    ).finally(function () {
      state.saving = false;
      updateComposerState();
      window.requestAnimationFrame(function () {
        if (composerEditor) composerEditor.focus();
      });
    });
  }

  function renderList(options = {}) {
    state.historyRenderVersion += 1;
    const allMemos = visibleChronologicalMemos(state.memos);
    const start = Math.max(0, allMemos.length - state.visibleMemoCount);
    const memos = allMemos.slice(start);
    els.count.textContent = allMemos.length ? `${allMemos.length} 条` : "";

    if (state.error && allMemos.length === 0) {
      renderState(state.error, "error");
      return;
    }
    if (state.loading && allMemos.length === 0) {
      renderState("正在加载记录…", "loading");
      return;
    }
    if (allMemos.length === 0) {
      renderState("还没有 memo", "empty", "在下方输入内容，像发消息一样快速记录");
      return;
    }

    const memoIndex = buildMemoReferenceIndex(allMemos);
    let previousTime = null;
    const items = memos.map(function (memo) {
      const time = slimMemoTime(memo);
      const showTime = previousTime === null || shouldShowTimelineTime(previousTime, time);
      previousTime = time;
      return memoSlimItemPresentation(memo, showTime, memoIndex);
    });
    renderTimelessView(els.list, MemoSlimItemsView({ items }));
    restoreScrollState(options);
  }

  function renderState(message, kind, detail) {
    renderTimelessView(els.list, MemoSlimStateView({ detail, kind, message }));
    updateBackToBottom();
  }

  function handleListScroll() {
    recordHistoryScroll();
    state.stickToBottom = isListNearBottom();
    if (state.stickToBottom) state.returningToBottom = false;
    updateBackToBottom();
    if (
      state.historyLoadArmed &&
      isInsideHistoryLoadZone()
    ) {
      scheduleHistoryLoad();
    }
  }

  function scheduleHistoryLoad() {
    if (state.historyLoadTask || state.loadingHistory) return;
    const run = function () {
      state.historyLoadTask = 0;
      if (
        state.historyLoadArmed &&
        isInsideHistoryLoadZone()
      ) {
        loadOlderMemos();
      }
    };
    state.historyLoadTask = window.setTimeout(run, 0);
  }

  async function loadOlderMemos() {
    const allMemos = visibleChronologicalMemos(state.memos);
    const total = allMemos.length;
    if (state.loadingHistory || state.visibleMemoCount >= total) return;

    const previousStart = Math.max(0, total - state.visibleMemoCount);
    const nextVisibleCount = Math.min(total, state.visibleMemoCount + HISTORY_PAGE_SIZE);
    const nextStart = Math.max(0, total - nextVisibleCount);
    const olderMemos = allMemos.slice(nextStart, previousStart);
    if (!olderMemos.length) return;

    state.loadingHistory = true;
    state.historyLoadArmed = false;
    const renderVersion = state.historyRenderVersion;
    const debug = beginHistoryDebug(olderMemos, total, previousStart, nextStart);
    els.list.classList.add("is-loading-history");
    if (els.historyLoading) els.historyLoading.hidden = false;
    let stage = null;
    let status = "started";
    try {
      stage = createHistoryStage(olderMemos, allMemos);
      historyDebugLog(debug, "stage-created", {
        listHeightChanged: debug.startScroll.scrollHeight !== els.list.scrollHeight,
        stage: historyStageMetrics(stage),
        scroll: historyScrollMetrics(debug.anchorElement),
      });
      const measurement = await settleHistoryStage(stage);
      historyDebugLog(debug, "stage-measured", {
        imageWait: measurement.imageWait,
        measuredHeight: debugNumber(measurement.height),
        settleMs: measurement.settleMs,
        stage: historyStageMetrics(stage),
        scroll: historyScrollMetrics(debug.anchorElement),
      });
      if (!stage.isConnected) {
        status = "aborted-stage-disconnected";
        return;
      }
      if (renderVersion !== state.historyRenderVersion) {
        status = "aborted-list-rerendered";
        return;
      }
      commitOlderMemos(stage, measurement.height, olderMemos, allMemos, previousStart, debug);
      state.visibleMemoCount = nextVisibleCount;
      status = "committed";
    } catch (err) {
      status = "error";
      historyDebugLog(debug, "error", {
        message: errorMessage(err),
        stack: err && err.stack ? String(err.stack) : "",
      });
      showToast("加载历史失败: " + errorMessage(err));
    } finally {
      if (stage && stage.isConnected) stage.remove();
      state.loadingHistory = false;
      els.list.classList.remove("is-loading-history");
      if (els.historyLoading) els.historyLoading.hidden = true;
      historyDebugLog(debug, "load-finished", {
        input: historyDebugInputMetrics(debug),
        status,
        scroll: historyScrollMetrics(debug.anchorElement),
        totalMs: debugNumber(performance.now() - debug.startedAt),
      });
      if (status !== "committed" && state.historyDebugTransaction === debug) {
        state.historyDebugTransaction = null;
      }
      if (state.historyLoadArmed && isInsideHistoryLoadZone()) {
        scheduleHistoryLoad();
      }
    }
  }

  function isInsideHistoryLoadZone() {
    return els.list.scrollTop <= HISTORY_TOP_THRESHOLD;
  }

  function createHistoryStage(olderMemos, allMemos) {
    const memoIndex = buildMemoReferenceIndex(allMemos);
    const stage = document.createElement("div");
    const listStyle = window.getComputedStyle(els.list);
    const contentWidth = els.list.clientWidth
      - parseFloat(listStyle.paddingLeft || "0")
      - parseFloat(listStyle.paddingRight || "0");
    stage.className = "memo-slim-history-stage";
    stage.style.width = Math.max(0, contentWidth) + "px";
    let previousTime = null;
    const items = olderMemos.map(function (memo) {
      const time = slimMemoTime(memo);
      const showTime = previousTime === null || shouldShowTimelineTime(previousTime, time);
      previousTime = time;
      return memoSlimItemPresentation(memo, showTime, memoIndex);
    });
    renderTimelessView(stage, MemoSlimItemsView({
      items,
      meaning: "memo-slim-history-items",
    }));
    stage.querySelectorAll("img").forEach(function (image) {
      image.loading = "eager";
    });
    els.shell.appendChild(stage);
    return stage;
  }

  async function settleHistoryStage(stage) {
    const startedAt = performance.now();
    const imageWait = await waitForHistoryStageImages(stage);
    if (!stage.isConnected) {
      return {
        height: 0,
        imageWait,
        settleMs: debugNumber(performance.now() - startedAt),
      };
    }
    void stage.offsetHeight;
    return {
      height: stage.getBoundingClientRect().height,
      imageWait,
      settleMs: debugNumber(performance.now() - startedAt),
    };
  }

  function waitForHistoryStageImages(stage) {
    const pending = Array.from(stage.querySelectorAll("img")).filter(function (image) {
      return !historyImageHasStableBox(image);
    });
    if (!pending.length) {
      return Promise.resolve({ pendingCount: 0, timedOut: false, waitMs: 0 });
    }

    return new Promise(function (resolve) {
      const startedAt = performance.now();
      let settled = false;
      let poll = 0;
      const cleanups = [];
      const timeout = window.setTimeout(function () {
        finish(true);
      }, HISTORY_IMAGE_WAIT_MS);

      function check() {
        if (pending.every(historyImageHasStableBox)) finish(false);
      }

      function finish(timedOut) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        cleanups.forEach(function (cleanup) { cleanup(); });
        if (timedOut) reservePendingHistoryImages(stage);
        resolve({
          pendingCount: pending.length,
          timedOut,
          waitMs: debugNumber(performance.now() - startedAt),
        });
      }

      pending.forEach(function (image) {
        image.addEventListener("load", check);
        image.addEventListener("error", check);
        cleanups.push(function () {
          image.removeEventListener("load", check);
          image.removeEventListener("error", check);
        });
      });
      poll = window.setInterval(check, 16);
      check();
    });
  }

  function historyImageHasStableBox(image) {
    if (image.complete) return true;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) return true;
    if (image.closest(".memo-image-layout-item, .memo-image-token-preview")) return true;
    return Boolean(image.getAttribute("width") && image.getAttribute("height"));
  }

  function reservePendingHistoryImages(stage) {
    stage.querySelectorAll("img").forEach(function (image) {
      if (
        !historyImageHasStableBox(image)
      ) {
        image.classList.add("memo-slim-history-image-reserved");
      }
    });
  }

  function commitOlderMemos(stage, stagedHeight, olderMemos, allMemos, previousStart, debug) {
    const existingFirstMemo = directFirstMemoElement();
    const anchorElement = debug.anchorElement && debug.anchorElement.isConnected
      ? debug.anchorElement
      : historyViewportAnchorElement();
    const boundaryTime = existingFirstMemo && existingFirstMemo.previousElementSibling;
    const lastOlderMemo = olderMemos[olderMemos.length - 1];
    const firstExistingMemo = allMemos[previousStart];
    const keepBoundaryTime = lastOlderMemo && firstExistingMemo
      ? shouldShowTimelineTime(slimMemoTime(lastOlderMemo), slimMemoTime(firstExistingMemo))
      : true;
    lockHistoryCommit();
    historyDebugLog(debug, "commit-before", {
      boundaryTimeWillBeRemoved: Boolean(
        !keepBoundaryTime &&
        boundaryTime &&
        boundaryTime.classList.contains("memo-slim-timeline-time")
      ),
      measuredStageHeight: debugNumber(stagedHeight),
      scroll: historyScrollMetrics(anchorElement),
    });
    const fragment = document.createDocumentFragment();
    while (stage.firstChild) fragment.appendChild(stage.firstChild);
    stage.remove();

    const listTopBefore = els.list.getBoundingClientRect().top;
    const anchorOffsetBefore = anchorElement
      ? anchorElement.getBoundingClientRect().top - listTopBefore
      : null;
    const scrollTopBefore = els.list.scrollTop;
    const scrollHeightBefore = els.list.scrollHeight;
    const spacer = document.createElement("div");
    spacer.className = "memo-slim-history-spacer";
    spacer.style.height = Math.max(0, stagedHeight) + "px";
    els.list.classList.add("is-committing-history");

    if (
      !keepBoundaryTime &&
      boundaryTime &&
      boundaryTime.classList.contains("memo-slim-timeline-time")
    ) {
      boundaryTime.remove();
    }
    const scrollHeightAfterBoundary = els.list.scrollHeight;
    els.list.prepend(spacer);
    const spacerDelta = els.list.scrollHeight - scrollHeightBefore;
    const spacerScrollTopRequested = scrollTopBefore + spacerDelta;
    els.list.scrollTop = spacerScrollTopRequested;
    historyDebugLog(debug, "spacer-appended", {
      boundaryHeightDelta: debugNumber(scrollHeightAfterBoundary - scrollHeightBefore),
      measuredStageHeight: debugNumber(stagedHeight),
      scrollHeightBefore: debugNumber(scrollHeightBefore),
      scrollHeightWithSpacer: debugNumber(els.list.scrollHeight),
      scrollTopActual: debugNumber(els.list.scrollTop),
      scrollTopBefore: debugNumber(scrollTopBefore),
      scrollTopRequested: debugNumber(spacerScrollTopRequested),
      spacerDelta: debugNumber(spacerDelta),
    });
    spacer.replaceWith(fragment);
    const finalDelta = els.list.scrollHeight - scrollHeightBefore;
    const finalScrollTopRequested = scrollTopBefore + finalDelta;
    els.list.scrollTop = finalScrollTopRequested;
    const anchorOffsetBeforeCorrection = anchorElement
      ? anchorElement.getBoundingClientRect().top - els.list.getBoundingClientRect().top
      : null;
    let anchorCorrection = 0;
    if (anchorElement && Number.isFinite(anchorOffsetBefore)) {
      anchorCorrection = anchorOffsetBeforeCorrection - anchorOffsetBefore;
      els.list.scrollTop += anchorCorrection;
    }
    void els.list.offsetHeight;
    const finalScroll = historyScrollMetrics(anchorElement);
    historyDebugLog(debug, "content-appended", {
      actualHeightDelta: debugNumber(els.list.scrollHeight - scrollHeightBefore),
      anchorCorrection: debugNumber(anchorCorrection),
      anchorOffsetBefore: debugNumber(anchorOffsetBefore),
      anchorOffsetBeforeCorrection: debugNumber(anchorOffsetBeforeCorrection),
      anchorOffsetFinal: finalScroll.anchorOffset,
      anchorErrorFinal: debugNumber(finalScroll.anchorOffset - anchorOffsetBefore),
      finalDelta: debugNumber(finalDelta),
      measuredHeightDifference: debugNumber(finalDelta - stagedHeight),
      measuredStageHeight: debugNumber(stagedHeight),
      scrollHeightAfterAppend: debugNumber(els.list.scrollHeight),
      scrollHeightBefore: debugNumber(scrollHeightBefore),
      scrollTopActual: debugNumber(els.list.scrollTop),
      scrollTopBefore: debugNumber(scrollTopBefore),
      scrollTopRequested: debugNumber(finalScrollTopRequested),
      scroll: finalScroll,
    });
    stabilizeHistoryAnchor(debug, anchorElement, anchorOffsetBefore, finalScroll);
    window.setTimeout(function () {
      els.list.classList.remove("is-committing-history");
    }, 0);
    state.stickToBottom = isListNearBottom();
    updateBackToBottom();
  }

  function beginHistoryDebug(olderMemos, total, previousStart, nextStart) {
    if (state.historyDebugTransaction) {
      historyDebugLog(state.historyDebugTransaction, "observation-superseded", {
        input: historyDebugInputMetrics(state.historyDebugTransaction),
        scroll: historyScrollMetrics(state.historyDebugTransaction.anchorElement),
      });
    }
    const anchorElement = historyViewportAnchorElement();
    const startScroll = historyScrollMetrics(anchorElement);
    const debug = {
      anchorElement,
      id: state.historyDebugSequence + 1,
      input: {
        deltaY: 0,
        preventedWheelEvents: 0,
        scrollEvents: 0,
        scrollTopMax: startScroll.scrollTop,
        scrollTopMin: startScroll.scrollTop,
        wheelEvents: 0,
      },
      olderMemoIds: olderMemos.map(function (memo) { return memo.id; }),
      startedAt: performance.now(),
      startScroll,
      trigger: state.historyLoadTrigger,
    };
    state.historyDebugSequence = debug.id;
    state.historyDebugTransaction = debug;
    state.historyLoadTrigger = null;
    historyDebugLog(debug, "load-start", {
      olderMemoCount: olderMemos.length,
      olderMemoIds: debug.olderMemoIds,
      range: { nextStart, previousStart, total },
      scroll: startScroll,
      trigger: debug.trigger,
      viewport: {
        devicePixelRatio: debugNumber(window.devicePixelRatio),
        innerHeight: debugNumber(window.innerHeight),
        innerWidth: debugNumber(window.innerWidth),
      },
    });
    return debug;
  }

  function historyDebugLog(debug, phase, details) {
    if (!debug) return;
    const entry = Object.assign({
      elapsedMs: debugNumber(performance.now() - debug.startedAt),
      phase,
      transactionId: debug.id,
    }, details || {});
    const logs = window.__memoSlimHistoryLogs;
    if (Array.isArray(logs)) {
      logs.push(entry);
      if (logs.length > 300) logs.splice(0, logs.length - 300);
    }
    console.info(`[MemoSlim][History#${debug.id}] ${phase}`, entry);
  }

  function historyScrollMetrics(anchorElement) {
    const firstMemo = directFirstMemoElement();
    const listRect = els.list.getBoundingClientRect();
    const anchorOffset = anchorElement && anchorElement.isConnected
      ? anchorElement.getBoundingClientRect().top - listRect.top
      : null;
    const firstMemoOffset = firstMemo
      ? firstMemo.getBoundingClientRect().top - listRect.top
      : null;
    return {
      anchorMemoId: anchorElement && anchorElement.dataset ? anchorElement.dataset.memoId : null,
      anchorOffset: debugNumber(anchorOffset),
      childCount: els.list.children.length,
      clientHeight: debugNumber(els.list.clientHeight),
      distanceToBottom: debugNumber(els.list.scrollHeight - els.list.clientHeight - els.list.scrollTop),
      firstMemoId: firstMemo && firstMemo.dataset ? firstMemo.dataset.memoId : null,
      firstMemoOffset: debugNumber(firstMemoOffset),
      maxScrollTop: debugNumber(Math.max(0, els.list.scrollHeight - els.list.clientHeight)),
      memoCount: els.list.querySelectorAll(":scope > [data-memo-id]").length,
      scrollHeight: debugNumber(els.list.scrollHeight),
      scrollTop: debugNumber(els.list.scrollTop),
    };
  }

  function historyStageMetrics(stage) {
    if (!stage || !stage.isConnected) return { connected: false };
    const images = Array.from(stage.querySelectorAll("img"));
    return {
      connected: true,
      height: debugNumber(stage.getBoundingClientRect().height),
      imageCount: images.length,
      images: images.slice(0, 12).map(function (image, index) {
        const rect = image.getBoundingClientRect();
        return {
          complete: image.complete,
          height: debugNumber(rect.height),
          index,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          reserved: image.classList.contains("memo-slim-history-image-reserved"),
          stableBox: historyImageHasStableBox(image),
          width: debugNumber(rect.width),
        };
      }),
      memoCount: stage.querySelectorAll(":scope > [data-memo-id]").length,
      parentClass: stage.parentElement ? stage.parentElement.className : "",
      width: debugNumber(stage.getBoundingClientRect().width),
    };
  }

  function recordHistoryWheel(event, prevented) {
    const debug = state.historyDebugTransaction;
    if (!debug) return;
    debug.input.wheelEvents += 1;
    debug.input.deltaY += Number(event.deltaY) || 0;
    if (prevented) debug.input.preventedWheelEvents += 1;
    debug.input.scrollTopMin = Math.min(debug.input.scrollTopMin, els.list.scrollTop);
    debug.input.scrollTopMax = Math.max(debug.input.scrollTopMax, els.list.scrollTop);
  }

  function recordHistoryScroll() {
    const debug = state.historyDebugTransaction;
    if (!debug) return;
    debug.input.scrollEvents += 1;
    debug.input.scrollTopMin = Math.min(debug.input.scrollTopMin, els.list.scrollTop);
    debug.input.scrollTopMax = Math.max(debug.input.scrollTopMax, els.list.scrollTop);
  }

  function historyDebugInputMetrics(debug) {
    return {
      deltaY: debugNumber(debug.input.deltaY),
      preventedWheelEvents: debug.input.preventedWheelEvents,
      scrollEvents: debug.input.scrollEvents,
      scrollTopMax: debugNumber(debug.input.scrollTopMax),
      scrollTopMin: debugNumber(debug.input.scrollTopMin),
      wheelEvents: debug.input.wheelEvents,
    };
  }

  function stabilizeHistoryAnchor(debug, anchorElement, expectedOffset, committedScroll) {
    let finished = false;
    let frame = 0;

    const correct = function (phase) {
      if (!anchorElement || !anchorElement.isConnected || !Number.isFinite(expectedOffset)) return;
      const before = historyScrollMetrics(anchorElement);
      const correction = before.anchorOffset - expectedOffset;
      const scrollTopBefore = els.list.scrollTop;
      if (Math.abs(correction) > 0.25) {
        els.list.scrollTop += correction;
        void els.list.offsetHeight;
      }
      const after = historyScrollMetrics(anchorElement);
      historyDebugLog(debug, phase, {
        anchorCorrection: debugNumber(correction),
        anchorOffsetExpected: debugNumber(expectedOffset),
        anchorOffsetBefore: before.anchorOffset,
        anchorOffsetAfter: after.anchorOffset,
        input: historyDebugInputMetrics(debug),
        scroll: after,
        scrollHeightDelta: debugNumber(after.scrollHeight - committedScroll.scrollHeight),
        scrollTopBefore: debugNumber(scrollTopBefore),
        scrollTopDelta: debugNumber(after.scrollTop - committedScroll.scrollTop),
      });
    };

    const finish = function (reason) {
      if (finished) return;
      finished = true;
      if (state.historyCommitUnlockTask) {
        window.clearTimeout(state.historyCommitUnlockTask);
        state.historyCommitUnlockTask = 0;
      }
      correct(`anchor-stabilized-${reason}`);
      releaseHistoryCommit();
      const stableScroll = historyScrollMetrics(anchorElement);
      [100, 500, 1000].forEach(function (delay) {
        window.setTimeout(function () {
          if (state.historyDebugSequence !== debug.id) return;
          const scroll = historyScrollMetrics(anchorElement);
          historyDebugLog(debug, `post-commit-${delay}ms`, {
            anchorOffsetDelta: debugNumber(scroll.anchorOffset - stableScroll.anchorOffset),
            input: historyDebugInputMetrics(debug),
            scroll,
            scrollHeightDelta: debugNumber(scroll.scrollHeight - stableScroll.scrollHeight),
            scrollTopDelta: debugNumber(scroll.scrollTop - stableScroll.scrollTop),
          });
          if (delay === 1000 && state.historyDebugTransaction === debug) {
            state.historyDebugTransaction = null;
          }
        }, delay);
      });
    };

    const nextFrame = function () {
      if (finished || state.historyDebugSequence !== debug.id) {
        finish("superseded");
        return;
      }
      frame += 1;
      correct(`anchor-stabilize-frame-${frame}`);
      if (frame >= 3) {
        finish("complete");
        return;
      }
      window.requestAnimationFrame(nextFrame);
    };

    state.historyCommitUnlockTask = window.setTimeout(function () {
      finish("timeout");
    }, 120);
    window.requestAnimationFrame(nextFrame);
  }

  function debugNumber(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  }

  function lockHistoryInputUntilQuiet() {
    state.historyInputLocked = true;
    if (state.historyInputUnlockTask) {
      window.clearTimeout(state.historyInputUnlockTask);
    }
    state.historyInputUnlockTask = window.setTimeout(function () {
      state.historyInputLocked = false;
      state.historyInputUnlockTask = 0;
    }, HISTORY_INPUT_QUIET_MS);
  }

  function lockHistoryCommit() {
    state.historyCommitLocked = true;
    if (!state.historyCommitUnlockTask) return;
    window.clearTimeout(state.historyCommitUnlockTask);
    state.historyCommitUnlockTask = 0;
  }

  function releaseHistoryCommit() {
    state.historyCommitLocked = false;
    if (!state.historyCommitUnlockTask) return;
    window.clearTimeout(state.historyCommitUnlockTask);
    state.historyCommitUnlockTask = 0;
  }

  function releaseHistoryInputLock() {
    state.historyInputLocked = false;
    if (!state.historyInputUnlockTask) return;
    window.clearTimeout(state.historyInputUnlockTask);
    state.historyInputUnlockTask = 0;
  }

  function directFirstMemoElement() {
    return Array.from(els.list.children).find(function (element) {
      return element.matches && element.matches("[data-memo-id]");
    }) || null;
  }

  function historyViewportAnchorElement() {
    const listRect = els.list.getBoundingClientRect();
    const memos = Array.from(els.list.children).filter(function (element) {
      return element.matches && element.matches("[data-memo-id]");
    });
    return memos.find(function (element) {
      const rect = element.getBoundingClientRect();
      return rect.bottom > listRect.top && rect.top < listRect.bottom;
    }) || memos.find(function (element) {
      return element.getBoundingClientRect().top >= listRect.top;
    }) || memos[memos.length - 1] || null;
  }

  function capturePrependAnchor() {
    const item = els.list.querySelector("[data-memo-id]");
    if (!item) return null;
    const listRect = els.list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      id: item.dataset.memoId,
      offset: itemRect.top - listRect.top,
    };
  }

  function captureScrollState(forceBottom) {
    const shouldForceBottom = forceBottom || !state.hasLoaded || state.stickToBottom || isListNearBottom();
    return {
      forceBottom: shouldForceBottom,
      prependAnchor: shouldForceBottom ? null : capturePrependAnchor(),
      scrollTop: els.list.scrollTop,
    };
  }

  function restoreScrollState(options = {}) {
    if (options.prependAnchor) {
      restorePrependAnchor(options.prependAnchor);
      state.stickToBottom = isListNearBottom();
      updateBackToBottom();
      return;
    }
    if (options.forceBottom) scrollListToBottom();
    window.requestAnimationFrame(function () {
      if (options.forceBottom) {
        scrollListToBottom();
        state.stickToBottom = true;
        updateBackToBottom();
        return;
      }
      if (Number.isFinite(options.scrollTop)) {
        els.list.scrollTop = Math.max(0, options.scrollTop);
        state.stickToBottom = isListNearBottom();
        updateBackToBottom();
      }
    });
  }

  function restorePrependAnchor(anchor) {
    const escapedID = typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(anchor.id)
      : String(anchor.id).replace(/["\\]/g, "\\$&");
    const item = els.list.querySelector(`[data-memo-id="${escapedID}"]`);
    if (!item) return;
    const listRect = els.list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    els.list.scrollTop += itemRect.top - listRect.top - anchor.offset;
  }

  function scrollListToBottom(smooth) {
    const top = Math.max(0, els.list.scrollHeight - els.list.clientHeight);
    if (smooth && typeof els.list.scrollTo === "function") {
      els.list.scrollTo({ behavior: "smooth", top });
      return;
    }
    els.list.scrollTop = top;
  }

  function isListNearBottom() {
    return els.list.scrollHeight - els.list.clientHeight - els.list.scrollTop < 72;
  }

  function updateBackToBottom() {
    if (!els.backToBottom) return;
    const distanceToBottom = els.list.scrollHeight - els.list.clientHeight - els.list.scrollTop;
    const showThreshold = els.list.clientHeight * 2;
    els.backToBottom.hidden = state.returningToBottom || !state.hasLoaded || distanceToBottom <= showThreshold;
  }

  function runAction(action, trigger) {
    switch (action) {
      case "toggleMenu":
        toggleMenu();
        break;
      case "openFull":
        closeMenu();
        openFullMemos();
        break;
      case "toggleFixed":
        state.fixed = !state.fixed;
        applyFixedState();
        closeMenu();
        setPersistedWindowFixed(state.fixed).catch(function () {});
        break;
      case "toggleEmoji":
        toggleEmojiPanel();
        break;
      case "backToBottom":
        state.stickToBottom = true;
        state.returningToBottom = true;
        els.backToBottom.hidden = true;
        scrollListToBottom(true);
        break;
      case "insertEmoji":
        insertComposerText(trigger.dataset.emoji || "");
        closeEmojiPanel();
        break;
      case "editorCommand":
        runEditorCommand(trigger.dataset.editorCommand);
        break;
      default:
        break;
    }
  }

  function runMarkdownAction(action) {
    switch (action.dataset.action) {
      case "copyCodeBlock": {
        const block = closestElement(action, ".memo-fenced-code-block");
        const code = block && block.querySelector("[data-code-block-code]");
        copyText(code ? code.textContent : "").then(
          function () { showToast("已复制代码"); },
          function () { showToast("复制失败"); },
        );
        break;
      }
      case "copyInlineLink": {
        const block = closestElement(action, "[data-inline-link-url]");
        copyText(block && block.dataset ? block.dataset.inlineLinkUrl : "").then(
          function () { showToast("已复制链接"); },
          function () { showToast("复制失败"); },
        );
        break;
      }
      case "toggleCodeCollapse": {
        const block = closestElement(action, ".memo-fenced-code-block");
        if (!block) return;
        const collapsed = block.classList.toggle("memo-fenced-code-collapsed");
        const toggle = block.querySelector(".memo-code-collapse-button");
        if (toggle) {
          toggle.title = collapsed ? "展开代码" : "收起代码";
          toggle.setAttribute("aria-label", toggle.title);
        }
        break;
      }
      default:
        break;
    }
  }

  function revealMemoReference(memoId) {
    const id = String(memoId || "").trim();
    const target = Array.from(els.list.querySelectorAll("[data-memo-id]")).find(function (item) {
      return item.dataset.memoId === id;
    });
    if (!target) {
      showToast("引用的 memo 不在当前记录中");
      return;
    }
    state.stickToBottom = false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("is-reference-highlighted");
    window.requestAnimationFrame(function () {
      target.classList.add("is-reference-highlighted");
      window.setTimeout(function () {
        target.classList.remove("is-reference-highlighted");
      }, 1400);
    });
  }

  function toggleMenu() {
    const willOpen = els.menu.hidden;
    els.menu.hidden = !willOpen;
    els.menuButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) closeEmojiPanel();
  }

  function closeMenu() {
    els.menu.hidden = true;
    els.menuButton.setAttribute("aria-expanded", "false");
  }

  function toggleEmojiPanel() {
    const willOpen = els.emojiPanel.hidden;
    els.emojiPanel.hidden = !willOpen;
    if (willOpen) closeMenu();
  }

  function closeEmojiPanel() {
    els.emojiPanel.hidden = true;
  }

  function runEditorCommand(command) {
    closeEmojiPanel();
    if (!composerEditor) return;
    const commands = {
      attach() {
        composerEditor.requestFiles("");
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
        composerEditor.requestFiles("image/*");
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

  function insertComposerText(text) {
    const value = String(text || "");
    if (!value || !composerEditor) return;
    composerEditor.insertText(value);
    writeComposerDraft(composerText());
    updateComposerState();
    composerEditor.focus();
  }

  function updateComposerState() {
    const hasContent = Boolean(composerText().trim());
    const vimEnabled = Boolean(state.editorSettings && state.editorSettings.vimMode);
    els.submit.disabled = state.saving || !hasContent;
    els.form.classList.toggle("is-saving", state.saving);
    els.form.classList.toggle("is-vim-enabled", vimEnabled);
    els.form.setAttribute("aria-busy", state.saving ? "true" : "false");
    els.composerStatus.textContent = state.saving
      ? "发送中…"
      : vimEnabled
        ? ":wq 发送 · :w 保存 · Ctrl/⌘+Enter 发送"
        : "Enter 发送，Shift+Enter 换行";
  }

  function composerText() {
    return composerEditor ? composerEditor.getText() : "";
  }

  function openFullMemos() {
    if (typeof invoke !== "function") {
      window.open("/home/index", "_blank", "noopener");
      return;
    }

    invoke("/api/open_window?pathname=%2Fdesktop", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) {
          showToast((resp && resp.msg) || "打开完整版失败");
          return;
        }
        forgetPersistedWindow().finally(function () {
          callNativeWindow("__velo/window/close").catch(function () {
            window.close();
          });
        });
      },
      function (err) {
        showToast("打开完整版失败: " + err);
      },
    );
  }

  function openExternalURL(url) {
    const target = safeExternalURL(url);
    if (!target) return;
    if (typeof invoke !== "function") {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    invoke("/api/external/open?url=" + encodeURIComponent(target), { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0) showToast((resp && resp.msg) || "打开链接失败");
      },
      function (err) {
        showToast("打开链接失败: " + err);
      },
    );
  }

  function applyFixedState() {
    renderFixedMenuItem();
    document.body.classList.toggle("is-fixed-window", state.fixed);
    callNativeWindow("__velo/window/set_always_on_top", { onTop: state.fixed }).catch(function () {});
  }

  function renderFixedMenuItem() {
    if (!els.fixedMenuItem) return;
    els.fixedMenuItem.classList.toggle("is-active", state.fixed);
    els.fixedMenuItem.setAttribute("aria-pressed", state.fixed ? "true" : "false");
    const label = els.fixedMenuItem.querySelector("span");
    if (label) label.textContent = state.fixed ? "取消置顶" : "置顶窗口";
  }

  function callNativeWindow(method, args) {
    if (typeof invoke !== "function") {
      return Promise.reject(new Error("go bridge not available"));
    }
    return invoke(method, { args: args || {} });
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, 2200);
  }
}

function visibleChronologicalMemos(memos) {
  return (Array.isArray(memos) ? memos : [])
    .filter(function (memo) {
      return memo && !memo.archived;
    })
    .sort(sortSlimMemos);
}

function sortSlimMemos(a, b) {
  const left = slimMemoTime(a);
  const right = slimMemoTime(b);
  if (left !== right) return left - right;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function slimMemoTime(memo) {
  const value = memo && (memo.createdAt || memo.updatedAt);
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldShowTimelineTime(previousTime, currentTime) {
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return true;
  if (currentTime - previousTime >= TIMELINE_GAP_MS) return true;
  const previous = new Date(previousTime);
  const current = new Date(currentTime);
  return previous.toDateString() !== current.toDateString();
}

const EDITOR_TOOLS = Object.freeze([
  { command: "bold", icon: "file-text", label: "粗体" },
  { command: "italic", icon: "file-text", label: "斜体" },
  { command: "code", icon: "braces", label: "行内代码" },
  { command: "list", icon: "list-filter", label: "列表" },
  { command: "checklist", icon: "check", label: "任务" },
  { command: "tag", icon: "grid-3x3", label: "标签" },
  { command: "link", icon: "file-symlink", label: "链接" },
  { command: "image", icon: "image", label: "图片" },
  { command: "attach", icon: "file", label: "附件" },
  { command: "date", icon: "clock", label: "时间" },
]);

function actionButton(runtime, props) {
  return runtime.Button(
    {
      class: props.class,
      attributes: {
        "aria-label": props.ariaLabel,
        "aria-expanded": props.ariaExpanded,
        "aria-haspopup": props.ariaHasPopup,
        "aria-pressed": props.ariaPressed,
        "data-editor-command": props.editorCommand,
        "data-emoji": props.emoji,
        "data-slim-action": props.action,
        "data-slim-back-to-bottom": props.backToBottom,
        "data-slim-menu-button": props.menuButton,
        accesskey: props.accesskey,
        n: props.meaning,
        role: props.role,
        title: props.title,
        type: "button",
      },
      hidden: props.hidden,
      onClick: props.onClick,
    },
    props.children || [],
  );
}

function MemoSlimShellView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    {
      class: "memo-window-shell memo-slim-shell velo-drag",
      attributes: { "data-velo-drag": "true", n: "memo-slim-window" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-window-titlebar memo-slim-titlebar velo-drag",
          attributes: { "data-velo-drag": "true", n: "memo-slim-titlebar" },
        },
        [
          View(
            {
              class: "memo-window-native-controls",
              attributes: { "aria-hidden": "true", n: "memo-slim-native-controls" },
            },
            [],
          ),
          View(
            {
              class: "memo-slim-heading velo-drag",
              attributes: { "data-velo-drag": "true", n: "memo-slim-heading" },
            },
            [
              View({ as: "strong", attributes: { n: "memo-slim-title" } }, ["Memo"]),
              View(
                {
                  as: "span",
                  attributes: { "data-slim-count": "true", n: "memo-slim-count" },
                },
                [],
              ),
            ],
          ),
          View(
            {
              class: "memo-slim-menu-wrap velo-no-drag",
              attributes: { "data-slim-menu-wrap": "true", n: "memo-slim-menu-region" },
            },
            [
              actionButton(runtime, {
                action: "toggleMenu",
                ariaExpanded: "false",
                ariaHasPopup: "menu",
                ariaLabel: "更多操作",
                children: [
                  Timeless.Icon({
                    name: "ellipsis",
                    attributes: { n: "memo-slim-more-icon" },
                  }),
                  Timeless.Icon({
                    name: "chevron-down",
                    attributes: { n: "memo-slim-menu-chevron-icon" },
                  }),
                ],
                class: "memo-slim-menu-button",
                meaning: "memo-slim-menu-button",
                menuButton: "true",
              }),
              View(
                {
                  class: "memo-slim-menu",
                  attributes: {
                    "data-slim-menu": "true",
                    n: "memo-slim-menu",
                    role: "menu",
                  },
                  hidden: true,
                },
                [
                  actionButton(runtime, {
                    action: "openFull",
                    children: [
                      View(
                        { as: "span", attributes: { n: "memo-slim-open-full-label" } },
                        ["打开完整版"],
                      ),
                    ],
                    meaning: "memo-slim-open-full-button",
                    role: "menuitem",
                  }),
                  actionButton(runtime, {
                    action: "toggleFixed",
                    ariaPressed: "false",
                    children: [
                      View(
                        { as: "span", attributes: { n: "memo-slim-fixed-label" } },
                        ["置顶窗口"],
                      ),
                      Timeless.Icon({
                        name: "check",
                        attributes: { n: "memo-slim-fixed-check-icon" },
                      }),
                    ],
                    meaning: "memo-slim-fixed-button",
                    role: "menuitem",
                  }),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          as: "main",
          class: "memo-window-body memo-slim-body velo-no-drag",
          attributes: { n: "memo-slim-body" },
        },
        [
          View(
            {
              as: "section",
              class: "memo-slim-list",
              attributes: {
                "aria-label": "Memo 对话记录",
                "aria-live": "polite",
                "data-slim-list": "true",
                n: "memo-slim-list",
                role: "log",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-slim-history-loading",
              attributes: {
                "aria-live": "polite",
                "data-slim-history-loading": "true",
                n: "memo-slim-history-loading",
                role: "status",
              },
              hidden: true,
            },
            [
              View(
                { as: "span", attributes: { "aria-hidden": "true", n: "memo-slim-loading-indicator" } },
                [],
              ),
              View({ as: "small", attributes: { n: "memo-slim-loading-label" } }, ["正在加载"]),
            ],
          ),
          actionButton(runtime, {
            action: "backToBottom",
            backToBottom: "true",
            children: [
              Timeless.Icon({
                name: "chevron-down",
                attributes: { n: "memo-slim-back-bottom-icon" },
              }),
              View({ as: "span", attributes: { n: "memo-slim-back-bottom-label" } }, ["回到底部"]),
            ],
            class: "memo-slim-back-bottom",
            hidden: true,
            meaning: "memo-slim-back-bottom-button",
          }),
          View(
            {
              class: "memo-slim-form",
              attributes: { "data-slim-form": "true", n: "memo-slim-composer" },
            },
            [
              View(
                { class: "memo-slim-toolbar", attributes: { n: "memo-slim-toolbar" } },
                [
                  View(
                    {
                      class: "memo-slim-emoji-wrap",
                      attributes: { "data-slim-emoji-wrap": "true", n: "memo-slim-emoji-region" },
                    },
                    [
                      actionButton(runtime, {
                        action: "toggleEmoji",
                        ariaLabel: "选择表情",
                        children: [
                          Timeless.Icon({
                            name: "user",
                            attributes: { n: "memo-slim-emoji-icon" },
                          }),
                        ],
                        meaning: "memo-slim-emoji-button",
                        title: "表情",
                      }),
                      View(
                        {
                          class: "memo-slim-emoji-panel",
                          attributes: {
                            "aria-label": "常用表情",
                            "data-slim-emoji-panel": "true",
                            n: "memo-slim-emoji-panel",
                          },
                          hidden: true,
                        },
                        [
                          For({
                            each: EMOJIS,
                            render(emoji) {
                              return actionButton(runtime, {
                                action: "insertEmoji",
                                ariaLabel: "插入 " + emoji,
                                children: [emoji],
                                emoji,
                                meaning: "memo-slim-emoji-option",
                              });
                            },
                          }),
                        ],
                      ),
                    ],
                  ),
                  For({
                    each: EDITOR_TOOLS,
                    render(tool) {
                      return actionButton(runtime, {
                        action: "editorCommand",
                        ariaLabel: tool.label,
                        children: [
                          Timeless.Icon({
                            name: tool.icon,
                            attributes: {
                              n: "memo-slim-" + tool.command + "-icon",
                            },
                          }),
                        ],
                        editorCommand: tool.command,
                        meaning: "memo-slim-" + tool.command + "-button",
                        title: tool.label,
                      });
                    },
                  }),
                ],
              ),
              View(
                { class: "memo-slim-editor-wrap", attributes: { n: "memo-slim-editor-region" } },
                [
                  View(
                    {
                      class: "memo-editor-host memo-slim-editor-host",
                      attributes: {
                        "aria-label": "输入 memo",
                        "data-slim-editor-host": "true",
                        n: "memo-slim-editor-host",
                      },
                    },
                    [],
                  ),
                ],
              ),
              View(
                { class: "memo-slim-form-footer", attributes: { n: "memo-slim-composer-footer" } },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-slim-vim-status",
                      attributes: { "data-slim-vim-status": "true", n: "memo-slim-vim-status" },
                    },
                    [],
                  ),
                  View(
                    {
                      as: "span",
                      attributes: {
                        "data-slim-composer-status": "true",
                        n: "memo-slim-composer-status",
                      },
                    },
                    ["Enter 发送，Shift+Enter 换行"],
                  ),
                  Button(
                    {
                      class: "memo-slim-submit",
                      attributes: {
                        accesskey: "s",
                        "data-slim-submit": "true",
                        n: "memo-slim-submit-button",
                        type: "button",
                      },
                      onClick: props.onSubmit,
                    },
                    ["发送(S)"],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-toast",
          attributes: { "data-toast": "true", n: "memo-slim-toast", role: "status" },
        },
        [],
      ),
    ],
  );
}

function memoSlimItemPresentation(memo, showTime, memoIndex) {
  const timestamp = memo.createdAt || memo.updatedAt;
  return {
    exactTime: formatExactDate(timestamp),
    html: renderMemoMarkdown(memo.content, memoMarkdownContext(memo, memoIndex)),
    id: memo.id,
    pinned: Boolean(memo.pinned),
    showTime,
    timeLabel: formatTimelineDate(timestamp),
    timestamp,
  };
}

function MemoSlimItemsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Fragment } = runtime;
  return Fragment({}, [
    For({
      each: props.items || [],
      render(item) {
        return MemoSlimItemView({ item, runtime });
      },
    }),
  ]);
}

function MemoSlimItemView(props) {
  const { Fragment, RichText, View } = props.runtime;
  const item = props.item;
  return Fragment({}, [
    item.showTime
      ? View(
          {
            as: "time",
            class: "memo-slim-timeline-time",
            attributes: {
              datetime: item.timestamp,
              n: "memo-slim-timeline-time",
            },
          },
          [item.timeLabel],
        )
      : null,
    View(
      {
        as: "article",
        class: "memo-slim-item" + (item.pinned ? " is-pinned" : ""),
        attributes: {
          "data-memo-id": item.id,
          n: "memo-slim-item",
        },
      },
      [
        View(
          {
            class: "memo-slim-message",
            attributes: { n: "memo-slim-message", title: item.exactTime },
          },
          [
            item.pinned
              ? View(
                  { as: "span", class: "memo-slim-pin", attributes: { n: "memo-slim-pin" } },
                  ["置顶"],
                )
              : null,
            View(
              {
                class: "memo-slim-content memo-content",
                attributes: { n: "memo-slim-content" },
              },
              [
                RichText({
                  attributes: { n: "memo-slim-rich-text" },
                  content: item.html,
                }),
              ],
            ),
          ],
        ),
        View(
          {
            as: "span",
            class: "memo-slim-avatar",
            attributes: { "aria-hidden": "true", n: "memo-slim-avatar" },
          },
          [
            Timeless.Icon({
              name: "file-text",
              attributes: { n: "memo-slim-avatar-icon" },
            }),
          ],
        ),
      ],
    ),
  ]);
}

function MemoSlimStateView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { View } = runtime;
  return View(
    {
      class: "memo-slim-state is-" + (props.kind || "empty"),
      attributes: { n: "memo-slim-state" },
    },
    [
      View(
        {
          as: "span",
          class: "memo-slim-state-icon",
          attributes: { "aria-hidden": "true", n: "memo-slim-state-icon" },
        },
        [
          Timeless.Icon({
            name: "file-text",
            attributes: { n: "memo-slim-state-symbol" },
          }),
        ],
      ),
      View(
        { as: "strong", attributes: { n: "memo-slim-state-message" } },
        [String(props.message || "")],
      ),
      props.detail
        ? View(
            { as: "small", attributes: { n: "memo-slim-state-detail" } },
            [String(props.detail)],
          )
        : null,
    ],
  );
}

function memoMarkdownContext(memo, index) {
  return {
    depth: 0,
    editorSettings: {
      fileEditor: { id: "none", name: "不使用" },
      fileEditorRules: [],
    },
    index,
    maxDepth: 1,
    readonly: true,
    showLineNumbers: false,
    sourceId: memo.id,
    stack: [memo.id],
  };
}

function formatTimelineDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return String(value || "");

  const now = new Date();
  const today = startOfLocalDay(now);
  const target = startOfLocalDay(date);
  const dayDifference = Math.round((today - target) / (24 * 60 * 60 * 1000));
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dayDifference === 0) return time;
  if (dayDifference === 1) return `昨天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function formatExactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(date) {
  return String(date.getFullYear()).padStart(4, "0")
    + "-" + String(date.getMonth() + 1).padStart(2, "0")
    + "-" + String(date.getDate()).padStart(2, "0")
    + " " + String(date.getHours()).padStart(2, "0")
    + ":" + String(date.getMinutes()).padStart(2, "0");
}

function startOfLocalDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function safeExternalURL(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function copyText(value) {
  const text = String(value || "");
  if (!text) return Promise.reject(new Error("没有可复制内容"));
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function (resolve, reject) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (copied) resolve();
    else reject(new Error("copy command failed"));
  });
}

function readComposerDraft() {
  try {
    return localStorage.getItem(COMPOSER_STORAGE_KEY) || "";
  } catch (_) {
    return "";
  }
}

function writeComposerDraft(value) {
  try {
    if (value) localStorage.setItem(COMPOSER_STORAGE_KEY, value);
    else localStorage.removeItem(COMPOSER_STORAGE_KEY);
  } catch (_) {}
}

function closestElement(target, selector) {
  if (!target || typeof target.closest !== "function") return null;
  return target.closest(selector);
}
