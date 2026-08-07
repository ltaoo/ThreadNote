import { buildMemoReferenceIndex, normalizeMemoPayload } from "./domain/memos.js";
import { normalizeMemoCommentPayload } from "./domain/memo-comments.js";
import { detachedMemoCommentTemplate, detachedMemoRenderContext } from "./pages/home/memo-templates.js";

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = String(params.get("id") || "").trim();
  if (!id) {
    root.innerHTML = '<div class="memo-window-empty">缺少评论 ID</div>';
    return;
  }

  if (typeof globalThis.invoke !== "function") {
    root.innerHTML = '<div class="memo-window-empty">无法连接后端</div>';
    return;
  }

  globalThis.invoke("/api/comment-replies/get?id=" + encodeURIComponent(id), { method: "GET" }).then(
    function (resp) {
      if (!resp || resp.code !== 0 || !resp.data || !resp.data.found) {
        root.innerHTML = '<div class="memo-window-empty">未找到评论</div>';
        return;
      }

      var data = resp.data;
      var comment = normalizeMemoCommentPayload(data.comment);
      var rawReplies = Array.isArray(data.replies) ? data.replies : [];
      var replies = rawReplies.map(normalizeMemoCommentPayload).filter(Boolean);
      var rawMemos = Array.isArray(data.memos) ? data.memos : [];
      var memos = rawMemos.map(normalizeMemoPayload).filter(Boolean);

      // Build render context
      var memoRefIndex = buildMemoReferenceIndex(memos);
      var state = { memos: memos, memoRefIndex: memoRefIndex };
      var renderContext = detachedMemoRenderContext(state, "", { readonly: true });

      // Build reply counts and comment lookup for badges and replyTo preview
      var allComments = [comment].concat(replies);
      var replyCounts = {};
      var commentById = {};
      allComments.forEach(function (c) {
        if (c && c.id) { replyCounts[c.id] = 0; commentById[c.id] = c; }
      });
      allComments.forEach(function (c) {
        if (c && c.replyTo && replyCounts.hasOwnProperty(c.replyTo)) {
          replyCounts[c.replyTo] = (replyCounts[c.replyTo] || 0) + 1;
        }
      });

      function replyToPreviewFor(c) {
        if (!c || !c.replyTo || !commentById[c.replyTo]) return "";
        var preview = (commentById[c.replyTo].content || "").replace(/\n/g, " ").trim();
        if (preview.length > 80) preview = preview.slice(0, 80) + "...";
        return preview;
      }

      var parentCommentHTML = "";
      if (comment && comment.id) {
        parentCommentHTML = `
          <section class="memo-window-comments" aria-label="原评论">
            <div class="memo-window-comments-title">
              <span class="memo-window-title-text">原评论</span>
            </div>
            <div class="memo-comment-list">
              ${detachedMemoCommentTemplate(comment, renderContext, "", new Set(), { replyCount: replyCounts[comment.id] || 0, replyToPreview: replyToPreviewFor(comment) })}
            </div>
          </section>
        `;
      }

      var repliesHTML = "";
      if (replies.length) {
        repliesHTML = `
          <section class="memo-window-comments" aria-label="回复">
            <div class="memo-window-comments-title">
              <span class="memo-window-title-text">回复</span>
              <strong>${replies.length}</strong>
            </div>
            <div class="memo-comment-list">
              ${replies.map(function (reply) {
                return detachedMemoCommentTemplate(reply, renderContext, "", new Set(), { replyCount: replyCounts[reply.id] || 0, replyToPreview: replyToPreviewFor(reply) });
              }).join("")}
            </div>
          </section>
        `;
      }

      root.innerHTML = `
        <div class="memo-window-shell velo-drag" data-velo-drag>
          <header class="memo-window-titlebar velo-drag" data-velo-drag>
            <div class="memo-window-native-controls" aria-hidden="true"></div>
            <div class="memo-window-drag-region" aria-hidden="true"></div>
          </header>
          <main class="memo-window-body velo-no-drag" style="padding:12px">
            ${parentCommentHTML}
            ${repliesHTML}
            ${!replies.length ? '<div class="memo-window-empty">暂无回复</div>' : ""}
          </main>
        </div>
      `;
    },
    function () {
      root.innerHTML = '<div class="memo-window-empty">加载失败</div>';
    },
  );
});
