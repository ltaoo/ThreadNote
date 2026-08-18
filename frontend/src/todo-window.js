import { buildMemoReferenceIndex } from "./domain/memos.js";
import {
  readTodoDetailPayload,
  TodoDetailModel,
} from "./todo-detail-model.js";
import {
  detachedMemoCardTemplate,
  detachedMemoCommentTemplate,
  detachedMemoRenderContext,
} from "./pages/home/memo-templates.js";
import { memoQuickSearchHighlightParts } from "./pages/home/memo-quick-search-model.js";
import { escapeHTML } from "./pages/home/memo-utils.js";

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
      this.root.innerHTML = this.shell('<div class="memo-window-empty">正在加载代办...</div>');
      return;
    }
    if (!state.found) {
      this.root.innerHTML = this.shell(
        '<div class="memo-window-empty">' + escapeHTML(state.error || "未找到代办") + "</div>",
      );
      return;
    }

    const render_state = {
      memoRefIndex: buildMemoReferenceIndex(state.memos),
      memos: state.memos,
    };
    const render_context = detachedMemoRenderContext(render_state, "", { readonly: true });
    const sections = [
      this.todoSection(state.todo),
      this.memoSection(state.memo, render_context),
    ];
    if (state.comment) sections.push(this.commentSection(state.comment, render_context));

    document.title = "ThreadNote";
    this.root.innerHTML = this.shell(
      '<div class="todo-detail-content" data-todo-detail-content>' + sections.join("") + "</div>",
    );
    this.highlightQuery(state.query);
  }

  shell(content) {
    return `
      <div class="memo-window-shell todo-detail-page velo-drag" data-velo-drag>
        <header class="memo-window-titlebar velo-drag" data-velo-drag>
          <div class="memo-window-native-controls" aria-hidden="true"></div>
          <div class="memo-window-drag-region" aria-hidden="true"></div>
          <div class="comment-detail-window-title">代办详情</div>
        </header>
        <main class="memo-window-body velo-no-drag comment-detail-body">${content}</main>
      </div>
    `;
  }

  todoSection(todo) {
    const status_label = todo.checked ? "已完成" : "未完成";
    const source_label = todo.sourceCommentId ? "评论中的代办" : "Memo 中的代办";
    return `
      <section class="comment-detail-section comment-detail-primary todo-detail-primary" aria-label="代办内容">
        <div class="comment-detail-section-title">
          <span>代办内容</span>
          <span class="todo-detail-status ${todo.checked ? "is-complete" : "is-open"}">${status_label}</span>
        </div>
        <div class="comment-detail-section-body">
          <article class="todo-detail-card ${todo.checked ? "is-complete" : ""}">
            <div class="todo-detail-check-row">
              <input type="checkbox" ${todo.checked ? "checked" : ""} disabled aria-label="${escapeHTML(status_label)}" />
              <div class="todo-detail-task-title">${escapeHTML(todo.title)}</div>
            </div>
            ${todo.description ? `<div class="todo-detail-task-description">${escapeHTML(todo.description)}</div>` : ""}
            <div class="todo-detail-source">
              <span>${escapeHTML(source_label)}</span>
              ${todo.sourceText ? `<span class="todo-detail-source-text">${escapeHTML(todo.sourceText)}</span>` : ""}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  memoSection(memo, renderContext) {
    return `
      <section class="comment-detail-section comment-detail-memo" aria-label="所在 Memo">
        <div class="comment-detail-section-title">所在 Memo</div>
        <div class="comment-detail-section-body">
          ${detachedMemoCardTemplate(memo, renderContext, { comments: [] })}
        </div>
      </section>
    `;
  }

  commentSection(comment, renderContext) {
    return `
      <section class="comment-detail-section" aria-label="所在评论">
        <div class="comment-detail-section-title">所在评论</div>
        <div class="comment-detail-section-body memo-comment-list">
          ${detachedMemoCommentTemplate(comment, renderContext, "", new Set([comment.id]), {
            replyCount: 0,
            showReplyTo: false,
          })}
        </div>
      </section>
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
