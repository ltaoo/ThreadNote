import { buildMemoReferenceIndex } from "./domain/memos.js";
import {
  readTodoDetailPayload,
  TodoDetailModel,
} from "./todo-detail-model.js?v=20260820-todo-detail-dialog-brand";
import {
  detachedMemoCardTemplate,
  detachedMemoCommentTemplate,
  detachedMemoRenderContext,
} from "./pages/home/memo-templates.js?v=20260820-todo-detail-dialog-brand-v2";
import { registerCheckboxElement } from "./components.js?v=20260820-component-foundations-v2";
import { memoQuickSearchHighlightParts } from "./pages/home/memo-quick-search-model.js";
import { escapeHTML } from "./pages/home/memo-utils.js";

registerCheckboxElement();

class TodoDetailView {
  constructor(root, model) {
    this.root = root;
    this.model = model;
  }

  async mount(todoId) {
    this.render(this.model.snapshot());
    const state = await this.model.load(todoId);
    this.render(state);
  }

  render(state) {
    if (state.loading) {
      this.root.innerHTML = this.shell(`
        <div class="todo-detail-state" data-n="todo-detail-loading-state" role="status">
          <span class="todo-detail-state-mark" data-n="todo-detail-loading-mark" aria-hidden="true"></span>
          <span data-n="todo-detail-loading-label">正在加载代办...</span>
        </div>
      `);
      return;
    }
    if (!state.found) {
      this.root.innerHTML = this.shell(
        `<div class="todo-detail-state is-error" data-n="todo-detail-error-state" role="alert">
          <span class="todo-detail-state-mark" data-n="todo-detail-error-mark" aria-hidden="true"></span>
          <span data-n="todo-detail-error-label">${escapeHTML(state.error || "未找到代办")}</span>
        </div>`,
      );
      return;
    }

    const render_state = {
      memoRefIndex: buildMemoReferenceIndex(state.memos),
      memos: state.memos,
    };
    const render_context = detachedMemoRenderContext(render_state, "", { readonly: true });
    const context_sections = [this.memoSection(state.memo, render_context)];
    if (state.comment) {
      context_sections.push(this.commentSection(state.comment, render_context));
    }

    document.title = "ThreadNote";
    this.root.innerHTML = this.shell(
      `<div class="todo-detail-content" data-n="todo-detail-content" data-todo-detail-content>
        ${this.todoSection(state.todo)}
        <section class="todo-detail-context" data-n="todo-detail-context" aria-labelledby="todo-detail-context-title">
          <header class="todo-detail-context-heading" data-n="todo-detail-context-heading">
            <div class="todo-detail-context-heading-copy" data-n="todo-detail-context-heading-copy">
              <span class="todo-detail-context-eyebrow" data-n="todo-detail-context-eyebrow">CONTEXT</span>
              <h2 class="todo-detail-context-title" data-n="todo-detail-context-title" id="todo-detail-context-title">关联内容</h2>
            </div>
            <span class="todo-detail-context-count" data-n="todo-detail-context-count">${context_sections.length} 项</span>
          </header>
          <div class="todo-detail-context-list" data-n="todo-detail-context-list">
            ${context_sections.join("")}
          </div>
        </section>
      </div>`,
    );
    this.highlightQuery(state.query);
  }

  shell(content) {
    return `
      <div class="memo-window-shell todo-detail-page velo-drag" data-n="todo-detail-dialog" data-velo-drag>
        <header class="memo-window-titlebar todo-detail-titlebar velo-drag" data-n="todo-detail-titlebar" data-velo-drag>
          <div class="memo-window-native-controls" data-n="todo-detail-native-controls" aria-hidden="true"></div>
          <div class="memo-window-drag-region todo-detail-window-heading" data-n="todo-detail-window-heading">
            <span class="todo-detail-window-mark" data-n="todo-detail-window-mark" aria-hidden="true"></span>
            <span class="todo-detail-window-title" data-n="todo-detail-window-title" id="todo-detail-window-title">代办详情</span>
          </div>
          <div class="todo-detail-titlebar-balance" data-n="todo-detail-titlebar-balance" aria-hidden="true"></div>
        </header>
        <main class="memo-window-body velo-no-drag comment-detail-body todo-detail-body" data-n="todo-detail-body" aria-labelledby="todo-detail-window-title">${content}</main>
      </div>
    `;
  }

  todoSection(todo) {
    const status_label = todo.checked ? "已完成" : "未完成";
    const source_label = todo.sourceCommentId ? "来自评论" : "来自 Memo";
    return `
      <section class="todo-detail-primary" data-n="todo-detail-primary" aria-labelledby="todo-detail-task-title">
        <header class="todo-detail-primary-header" data-n="todo-detail-primary-header">
          <div class="todo-detail-section-label" data-n="todo-detail-section-label">
            <span class="todo-detail-section-mark" data-n="todo-detail-section-mark" aria-hidden="true"></span>
            <span data-n="todo-detail-section-label-text">当前任务</span>
          </div>
          <span class="todo-detail-status ${todo.checked ? "is-complete" : "is-open"}" data-n="todo-detail-status">
            <span class="todo-detail-status-dot" data-n="todo-detail-status-dot" aria-hidden="true"></span>
            <span data-n="todo-detail-status-label">${status_label}</span>
          </span>
        </header>
        <article class="todo-detail-card ${todo.checked ? "is-complete" : ""}" data-n="todo-detail-task-card">
          <div class="todo-detail-check-row" data-n="todo-detail-check-row">
            <tn-checkbox class="memo-todo-checkbox todo-detail-checkbox" control-class="tn-checkbox--todo" size="sm" aria-label="状态：${escapeHTML(status_label)}" data-n="todo-detail-completion-checkbox" ${todo.checked ? "checked" : ""} disabled></tn-checkbox>
            <div class="todo-detail-task-copy" data-n="todo-detail-task-copy">
              <h1 class="todo-detail-task-title" data-n="todo-detail-task-title" id="todo-detail-task-title">${escapeHTML(todo.title)}</h1>
              ${todo.description ? `<p class="todo-detail-task-description" data-n="todo-detail-task-description">${escapeHTML(todo.description)}</p>` : ""}
            </div>
          </div>
          <footer class="todo-detail-source" data-n="todo-detail-source">
            <span class="todo-detail-source-label" data-n="todo-detail-source-label">${escapeHTML(source_label)}</span>
            ${todo.sourceText ? `<span class="todo-detail-source-text" data-n="todo-detail-source-text">${escapeHTML(todo.sourceText)}</span>` : ""}
          </footer>
        </article>
      </section>
    `;
  }

  memoSection(memo, renderContext) {
    return `
      <article class="todo-detail-context-card todo-detail-context-card-memo" data-n="todo-detail-memo-context" aria-labelledby="todo-detail-memo-title">
        <header class="todo-detail-context-card-header" data-n="todo-detail-memo-header">
          <span class="todo-detail-context-index" data-n="todo-detail-memo-index" aria-hidden="true">01</span>
          <div class="todo-detail-context-card-heading" data-n="todo-detail-memo-heading">
            <span class="todo-detail-context-card-kicker" data-n="todo-detail-memo-kicker">来源记录</span>
            <h3 class="todo-detail-context-card-title" data-n="todo-detail-memo-title" id="todo-detail-memo-title">所在 Memo</h3>
          </div>
        </header>
        <div class="todo-detail-context-card-body" data-n="todo-detail-memo-body">
          ${detachedMemoCardTemplate(memo, renderContext, { comments: [] })}
        </div>
      </article>
    `;
  }

  commentSection(comment, renderContext) {
    return `
      <article class="todo-detail-context-card todo-detail-context-card-comment" data-n="todo-detail-comment-context" aria-labelledby="todo-detail-comment-title">
        <header class="todo-detail-context-card-header" data-n="todo-detail-comment-header">
          <span class="todo-detail-context-index" data-n="todo-detail-comment-index" aria-hidden="true">02</span>
          <div class="todo-detail-context-card-heading" data-n="todo-detail-comment-heading">
            <span class="todo-detail-context-card-kicker" data-n="todo-detail-comment-kicker">讨论上下文</span>
            <h3 class="todo-detail-context-card-title" data-n="todo-detail-comment-title" id="todo-detail-comment-title">所在评论</h3>
          </div>
        </header>
        <div class="todo-detail-context-card-body memo-comment-list" data-n="todo-detail-comment-body">
          ${detachedMemoCommentTemplate(comment, renderContext, "", new Set([comment.id]), {
            replyCount: 0,
            showReplyTo: false,
          })}
        </div>
      </article>
    `;
  }

  highlightQuery(query) {
    const text = String(query || "").trim();
    if (!text) return;
    const content = this.root.querySelector("[data-todo-detail-content]");
    if (!content) return;

    const text_nodes = [];
    content.querySelectorAll(".todo-detail-task-title, .todo-detail-task-description, .todo-detail-source-text, .memo-content").forEach(function (container) {
      collectTextNodes(container, text_nodes);
    });
    const marks = [];
    text_nodes.forEach(function (text_node) {
      const parts = memoQuickSearchHighlightParts(text_node.textContent, text);
      if (!parts.some(function (part) { return part.matched; })) return;
      const parent = text_node.parentNode;
      if (!parent) return;
      parts.forEach(function (part) {
        if (!part.matched) {
          parent.insertBefore(document.createTextNode(part.text), text_node);
          return;
        }
        const mark = document.createElement("mark");
        mark.className = "memo-find-match";
        mark.dataset.n = "todo-detail-search-match";
        mark.textContent = part.text;
        marks.push(mark);
        parent.insertBefore(mark, text_node);
      });
      parent.removeChild(text_node);
    });

    const primary = content.querySelector(".todo-detail-primary mark.memo-find-match");
    (primary || marks[0])?.classList.add("is-active");
  }
}

function collectTextNodes(node, output) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches("mark, script, style, button")) return;
  Array.from(node.childNodes).forEach(function (child) {
    collectTextNodes(child, output);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) return;
  const todo_id = String(new URLSearchParams(window.location.search).get("id") || "").trim();
  const services = typeof globalThis.invoke === "function"
    ? { request: globalThis.invoke }
    : { readLocal(id) { return readTodoDetailPayload(globalThis.localStorage, id); } };
  const model = new TodoDetailModel(services);
  const view = new TodoDetailView(root, model);
  view.mount(todo_id);
  if (typeof globalThis.onGoMessage === "function") {
    globalThis.onGoMessage(function (payload) {
      if (!payload || payload.type !== "todo_detail_updated" || payload.todoId !== todo_id) return;
      view.mount(todo_id);
    });
  }
});
