import { SnippetLauncherModel } from "./snippet-launcher-model.js";
import {
  Timeless,
  TimelessPrimitive,
} from "./timeless-icons.js";
import { renderTimelessView } from "./timeless-view-mount.js";

const WINDOW_WIDTH = 720;
const COLLAPSED_HEIGHT = 60;
const MAX_WINDOW_HEIGHT = 430;
const MAX_RESULTS_HEIGHT = 344;
const STATUS_HEIGHT = 26;

class SnippetLauncherView {
  constructor(root) {
    this.els = {
      close: root.querySelector('[data-action="close"]'),
      input: root.querySelector("[data-snippet-input]"),
      inputGhost: root.querySelector("[data-snippet-input-ghost]"),
      launcher: root.querySelector("[data-snippet-launcher]"),
      results: root.querySelector("[data-snippet-results]"),
      status: root.querySelector("[data-snippet-status]"),
    };
    this.expanded = null;
    this.model = null;
    this.resizeRequestId = 0;
    this.unsubscribe = null;
    this.windowHeight = 0;
    this.els.close?.replaceChildren(Timeless.Icon({ name: "x", size: 18 }).render());
  }

  connect(model) {
    this.model = model;
    this.bindEvents();
    this.unsubscribe = model.subscribe((state) => this.render(state));
    this.resizeWindowTo(COLLAPSED_HEIGHT, false).catch(function () {});
    this.focusInput();
  }

  bindEvents() {
    if (this.els.close) {
      this.els.close.addEventListener("click", () => this.model.close());
    }
    if (this.els.input) {
      this.els.input.addEventListener("input", () => this.model.setQuery(this.els.input.value || ""));
      this.els.input.addEventListener("keydown", (event) => this.handleInputKeydown(event));
    }
    if (this.els.results) {
      this.els.results.addEventListener("mousemove", (event) => {
        const item = event.target.closest("[data-snippet-index]");
        if (!item) return;
        this.model.setActiveIndex(Number(item.dataset.snippetIndex));
      });
      this.els.results.addEventListener("click", (event) => {
        const item = event.target.closest("[data-snippet-index]");
        if (!item) return;
        const index = Number(item.dataset.snippetIndex);
        if (!Number.isInteger(index)) return;
        this.model.setActiveIndex(index);
        this.model.activateActiveItem(event.shiftKey);
      });
    }
    window.addEventListener("focus", () => {
      this.model.handleFocus();
      this.focusInput();
    });
    window.addEventListener("blur", () => this.model.hide());
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.model.close();
    });
  }

  handleInputKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.model.close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.model.moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.model.moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.model.activateActiveItem(event.shiftKey);
      return;
    }
    if (event.key === "Tab" && this.model.acceptCommandSuggestion()) {
      event.preventDefault();
    }
  }

  focusInput() {
    window.setTimeout(() => {
      if (!this.els.input) return;
      this.els.input.focus();
      this.els.input.select();
    }, 20);
  }

  render(state) {
    if (this.els.input && this.els.input.value !== state.query) {
      this.els.input.value = state.query;
    }
    this.renderCommandSuggestion(state.commandSuggestion);
    this.renderResults(state);
    this.renderStatus(state);
  }

  renderCommandSuggestion(suggestion) {
    if (!this.els.inputGhost) return;
    if (!suggestion) {
      this.els.inputGhost.hidden = true;
      renderTimelessView(this.els.inputGhost, null);
      return;
    }
    this.els.inputGhost.hidden = false;
    renderTimelessView(
      this.els.inputGhost,
      SnippetSuggestionView(suggestion),
    );
  }

  renderResults(state) {
    if (!this.els.results) return;
    if (!state.command) {
      this.els.results.hidden = true;
      if (this.els.status) this.els.status.hidden = true;
      renderTimelessView(this.els.results, null);
      this.resizeWindowTo(COLLAPSED_HEIGHT, false).catch(function () {});
      return;
    }

    const wasHidden = this.els.results.hidden;
    this.els.results.hidden = false;
    if (this.els.status) this.els.status.hidden = false;

    if (state.loading && !state.items.length) {
      renderTimelessView(this.els.results, SnippetEmptyView("搜索中"));
    } else if (!state.items.length) {
      renderTimelessView(
        this.els.results,
        SnippetEmptyView("没有匹配的 " + (state.command.emptyLabel || "结果")),
      );
    } else {
      renderTimelessView(
        this.els.results,
        SnippetResultsView(state.items, state.activeIndex),
      );
    }

    const desiredHeight = this.desiredExpandedWindowHeight();
    const shouldDeferReveal = wasHidden || !this.expanded;
    if (shouldDeferReveal) {
      this.els.results.style.visibility = "hidden";
      if (this.els.status) this.els.status.style.visibility = "hidden";
    }

    this.resizeWindowTo(desiredHeight, true).then(() => {
      this.revealResults();
      this.scrollActiveIntoView();
    }, () => {
      this.revealResults();
      this.scrollActiveIntoView();
    });
  }

  renderStatus(state) {
    if (!this.els.status) return;
    if (state.status) {
      this.els.status.textContent = state.status;
      return;
    }
    this.els.status.textContent = state.items.length ? state.items.length + " 个结果" : "";
  }

  revealResults() {
    if (this.els.results) this.els.results.style.visibility = "";
    if (this.els.status) this.els.status.style.visibility = "";
  }

  desiredExpandedWindowHeight() {
    if (!this.els.results) return COLLAPSED_HEIGHT;
    const resultsHeight = Math.min(this.resultsContentHeight(), MAX_RESULTS_HEIGHT);
    return COLLAPSED_HEIGHT + resultsHeight + STATUS_HEIGHT;
  }

  resultsContentHeight() {
    if (!this.els.results) return 0;
    const styles = window.getComputedStyle ? window.getComputedStyle(this.els.results) : null;
    const padding = styles
      ? (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
      : 0;
    const children = Array.from(this.els.results.children || []);
    if (!children.length) return Math.max(this.els.results.scrollHeight || 0, 88);
    const contentHeight = children.reduce(function (total, child) {
      const childStyles = window.getComputedStyle ? window.getComputedStyle(child) : null;
      const margin = childStyles
        ? (Number.parseFloat(childStyles.marginTop) || 0) + (Number.parseFloat(childStyles.marginBottom) || 0)
        : 0;
      return total + child.getBoundingClientRect().height + margin;
    }, padding);
    return Math.ceil(Math.max(contentHeight, this.els.results.scrollHeight || 0, 88));
  }

  resizeWindowTo(height, expanded) {
    const nextHeight = Math.max(COLLAPSED_HEIGHT, Math.min(MAX_WINDOW_HEIGHT, Math.round(height || COLLAPSED_HEIGHT)));
    if (this.expanded === expanded && this.windowHeight === nextHeight) return Promise.resolve();

    const requestId = ++this.resizeRequestId;
    if (!expanded) this.applyWindowSize(nextHeight, false, requestId);

    if (typeof invoke !== "function") {
      this.applyWindowSize(nextHeight, expanded, requestId);
      return Promise.resolve();
    }

    return invoke("__velo/window/set_size", {
      args: {
        width: WINDOW_WIDTH,
        height: nextHeight,
      },
    }).then(() => {
      this.applyWindowSize(nextHeight, expanded, requestId);
    }, (error) => {
      this.applyWindowSize(nextHeight, expanded, requestId);
      throw error;
    });
  }

  applyWindowSize(height, expanded, requestId) {
    if (requestId !== this.resizeRequestId) return;
    this.expanded = expanded;
    this.windowHeight = height;
    if (this.els.launcher) this.els.launcher.classList.toggle("is-expanded", expanded);
    if (!expanded) {
      if (this.els.results) this.els.results.hidden = true;
      if (this.els.status) this.els.status.hidden = true;
    }
  }

  scrollActiveIntoView() {
    if (!this.els.results) return;
    const active = this.els.results.querySelector(".snippet-result.is-active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }
}

function SnippetSuggestionView(suggestion) {
  const { Fragment, View } = TimelessPrimitive;
  return Fragment({}, [
    View(
      {
        as: "span",
        class: "snippet-input-ghost-prefix",
        attributes: { n: "snippet-command-suggestion-prefix" },
      },
      [suggestion.prefix],
    ),
    suggestion.suffix,
  ]);
}

function SnippetEmptyView(message) {
  return TimelessPrimitive.View(
    {
      class: "snippet-empty",
      attributes: { n: "snippet-search-empty", role: "status" },
    },
    [message],
  );
}

function SnippetResultsView(items, active_index) {
  const { Fragment } = TimelessPrimitive;
  return Fragment(
    {},
    items.map(function (item, index) {
      return item.url
        ? SnippetLinkResultView(item, index, active_index)
        : SnippetCodeResultView(item, index, active_index);
    }),
  );
}

function SnippetCodeResultView(item, index, active_index) {
  const line = item.endLine && item.endLine !== item.startLine
    ? "L" + item.startLine + "-L" + item.endLine
    : "L" + item.startLine;
  const meta = [
    item.command || "",
    item.language || "",
    item.memoTitle || item.memoId || "",
    line,
  ].filter(Boolean).join(" · ");
  return SnippetResultView({
    active: index === active_index,
    code: compactCode(item.code || ""),
    index,
    kind: item.marked ? "SNIP" : "CODE",
    kindClass: item.marked ? "is-snippet" : "is-code",
    meta,
    title: item.title || item.command || "代码片段",
  });
}

function SnippetLinkResultView(item, index, active_index) {
  const meta = [
    item.memoTitle || item.memoId || "",
    item.line ? "L" + item.line : "",
    item.syntax || "",
  ].filter(Boolean).join(" · ");
  return SnippetResultView({
    active: index === active_index,
    code: compactCode(item.url || ""),
    codeClass: "is-link",
    index,
    kind: "LINK",
    kindClass: "is-link",
    meta,
    title: item.label || item.url || "超链接",
  });
}

function SnippetResultView(props) {
  const { Button, View } = TimelessPrimitive;
  return Button(
    {
      class: "snippet-result" + (props.active ? " is-active" : ""),
      id: "snippet-result-" + props.index,
      attributes: {
        "aria-selected": props.active ? "true" : "false",
        "data-snippet-index": props.index,
        n: "snippet-search-result",
        role: "option",
        type: "button",
      },
    },
    [
      View(
        {
          as: "span",
          class: "snippet-result-main",
          attributes: { n: "snippet-result-main" },
        },
        [
          View(
            {
              as: "span",
              class: "snippet-result-title",
              attributes: { n: "snippet-result-title" },
            },
            [
              View(
                {
                  as: "span",
                  class: "snippet-kind " + props.kindClass,
                  attributes: { n: "snippet-result-kind" },
                },
                [props.kind],
              ),
              View(
                {
                  as: "span",
                  class: "snippet-name",
                  attributes: { n: "snippet-result-name" },
                },
                [props.title],
              ),
            ],
          ),
          View(
            {
              as: "span",
              class: "snippet-meta",
              attributes: { n: "snippet-result-meta" },
            },
            [props.meta],
          ),
        ],
      ),
      View(
        {
          as: "pre",
          class: "snippet-code" + (props.codeClass ? " " + props.codeClass : ""),
          attributes: { n: "snippet-result-code" },
        },
        [props.code],
      ),
    ],
  );
}

function nativeRequest(url, options) {
  if (typeof invoke !== "function") return Promise.reject(new Error("当前环境不可用"));
  return invoke(url, options);
}

function keepWindowOnTop() {
  if (typeof invoke !== "function") return;
  invoke("__velo/window/set_always_on_top", {
    args: { onTop: true },
  }).catch(function () {});
}

function hideWindow() {
  if (typeof invoke === "function") {
    invoke("__velo/window/hide", { args: {} }).catch(closeBrowserWindow);
    return;
  }
  closeBrowserWindow();
}

function openLinkInDefaultBrowser(url) {
  if (typeof invoke !== "function") {
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  }
  return invoke("/api/external/open?confirm=false&url=" + encodeURIComponent(url), { method: "GET" }).then(function (response) {
    if (!response || response.code !== 0) {
      throw new Error((response && response.msg) || "打开链接失败");
    }
    return response;
  });
}

function copyText(value) {
  const text = String(value || "");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return copyTextFallback(text);
    });
  }
  return copyTextFallback(text);
}

function copyTextFallback(value) {
  return new Promise(function (resolve, reject) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      if (!document.execCommand("copy")) throw new Error("copy command failed");
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

function closeBrowserWindow() {
  try {
    window.close();
  } catch (_) {}
}

function compactCode(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > 220 ? text.slice(0, 217) + "..." : text;
}

const model = new SnippetLauncherModel({
  copyText,
  hideWindow,
  keepWindowOnTop,
  openLink: openLinkInDefaultBrowser,
  request: nativeRequest,
});
const view = new SnippetLauncherView(document);
view.connect(model);
model.start();
