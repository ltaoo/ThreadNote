import { buildMemoReferenceIndex } from "./domain/memos.js";
import {
  CommentDetailModel,
  readCommentDetailPayload,
} from "./comment-detail-model.js";
import {
  detachedMemoCardTemplate,
  detachedMemoCommentTemplate,
  detachedMemoRenderContext,
} from "./pages/home/memo-templates.js";
import { memoQuickSearchHighlightParts } from "./pages/home/memo-quick-search-model.js";
import { escapeHTML } from "./pages/home/memo-utils.js";

class CommentDetailView {
  constructor(root, model) {
    this.root = root;
    this.model = model;
  }

  async mount(commentId) {
    this.render(this.model.snapshot());
    const state = await this.model.load(commentId);
    this.render(state);
  }

  render(state) {
    if (state.loading) {
      this.root.innerHTML = this.shell('<div class="memo-window-empty">正在加载评论...</div>');
      return;
    }
    if (!state.found) {
      this.root.innerHTML = this.shell(
        '<div class="memo-window-empty">' + escapeHTML(state.error || "未找到评论") + "</div>",
      );
      return;
    }

    const render_state = {
      memoRefIndex: buildMemoReferenceIndex(state.memos),
      memos: state.memos,
    };
    const render_context = detachedMemoRenderContext(render_state, "", { readonly: true });
    const sections = [
      this.commentSection("评论内容", state.comment, render_context, {
        className: "comment-detail-primary",
        highlighted: true,
      }),
      this.memoSection(state.memo, render_context),
    ];
    if (state.replyTo) {
      sections.push(this.commentSection("回复的评论", state.replyTo, render_context));
    }
    if (state.replies.length) {
      sections.push(this.commentsSection("收到的回复", state.replies, render_context));
    }

    document.title = "ThreadNote";
    this.root.innerHTML = this.shell(
      '<div class="comment-detail-content" data-comment-detail-content>' + sections.join("") + "</div>",
    );
    this.highlightQuery(state.query);
  }

  shell(content) {
    return `
      <div class="memo-window-shell comment-detail-page velo-drag" data-velo-drag>
        <header class="memo-window-titlebar velo-drag" data-velo-drag>
          <div class="memo-window-native-controls" aria-hidden="true"></div>
          <div class="memo-window-drag-region" aria-hidden="true"></div>
          <div class="comment-detail-window-title">评论详情</div>
        </header>
        <main class="memo-window-body velo-no-drag comment-detail-body">${content}</main>
      </div>
    `;
  }

  commentSection(title, item, renderContext, options) {
    const config = options || {};
    return `
      <section class="comment-detail-section ${escapeHTML(config.className || "")}" aria-label="${escapeHTML(title)}">
        <div class="comment-detail-section-title">${escapeHTML(title)}</div>
        <div class="comment-detail-section-body memo-comment-list">
          ${this.commentTemplate(item, renderContext, Boolean(config.highlighted))}
        </div>
      </section>
    `;
  }

  commentsSection(title, items, renderContext) {
    return `
      <section class="comment-detail-section" aria-label="${escapeHTML(title)}">
        <div class="comment-detail-section-title">
          <span>${escapeHTML(title)}</span>
          <strong>${items.length}</strong>
        </div>
        <div class="comment-detail-section-body memo-comment-list">
          ${items.map((item) => this.commentTemplate(item, renderContext, false)).join("")}
        </div>
      </section>
    `;
  }

  commentTemplate(item, renderContext, highlighted) {
    if (!item || !item.comment) return "";
    return detachedMemoCommentTemplate(
      item.comment,
      renderContext,
      "",
      new Set([item.comment.id]),
      {
        highlighted,
        replyCount: item.replyCount,
        replyToPreview: item.replyToPreview,
        showReplyTo: false,
      },
    );
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

  highlightQuery(query) {
    const text = String(query || "").trim();
    if (!text) return;
    const content = this.root.querySelector("[data-comment-detail-content]");
    if (!content) return;

    const text_nodes = [];
    content.querySelectorAll(".memo-content, .memo-comment-reply-to-content").forEach(function (container) {
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

    const primary = content.querySelector(".comment-detail-primary mark.memo-find-match");
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
  const comment_id = String(new URLSearchParams(window.location.search).get("id") || "").trim();
  const services = typeof globalThis.invoke === "function"
    ? { request: globalThis.invoke }
    : { readLocal(id) { return readCommentDetailPayload(globalThis.localStorage, id); } };
  const model = new CommentDetailModel(services);
  const view = new CommentDetailView(root, model);
  view.mount(comment_id);
  if (typeof globalThis.onGoMessage === "function") {
    globalThis.onGoMessage(function (payload) {
      if (!payload || payload.type !== "comment_detail_updated" || payload.commentId !== comment_id) return;
      view.mount(comment_id);
    });
  }
});
