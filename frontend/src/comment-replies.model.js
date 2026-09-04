import {
  buildMemoReferenceIndex,
  collectTodos,
  extractTags,
  memoBacklinkCount,
} from "./domain/memos.js";
import {
  collectCodeBlocks,
  collectLinks,
  collectResources,
} from "./domain/memo-resources.js";
import { CommentDetailModel } from "./comment-detail-model.js";
import { TimelessPrimitive } from "./timeless-icons.js";
import { formatRelativeDate } from "./pages/home/memo-date.js";
import { renderMemoMarkdown } from "./pages/home/memo-markdown.js?v=20260820-code-snippet-workbench";
import { detachedMemoRenderContext } from "./pages/home/memo-view-model.js";
import { escapeHTML } from "./pages/home/memo-utils.js";

function safe_markdown(content, render_context) {
  try {
    return renderMemoMarkdown(String(content || ""), render_context);
  } catch (_) {
    return "<p>" + escapeHTML(String(content || "")) + "</p>";
  }
}

function comment_render_context(render_context, comment) {
  const comment_id = String((comment && comment.id) || "").trim();
  const memo_id = String((comment && comment.memoId) || "").trim();
  return {
    ...render_context,
    readonly: true,
    showLineNumbers: false,
    sourceCommentId: comment_id,
    sourceId: comment_id || render_context.sourceId || "",
    sourceMemoId: memo_id || render_context.sourceMemoId || "",
    sourceType: "comment",
    stack: comment_id ? [comment_id] : render_context.stack || [],
  };
}

function comment_view(item, render_context) {
  if (!item || !item.comment) return null;
  const comment = item.comment;
  const time = comment.updatedAt || comment.createdAt;
  return {
    html: safe_markdown(
      comment.content,
      comment_render_context(render_context, comment),
    ),
    id: comment.id,
    reactions: Array.isArray(comment.reactions)
      ? comment.reactions.slice()
      : [],
    relativeTime: formatRelativeDate(time),
    replyCount: Number(item.replyCount || 0),
    time,
  };
}

function memo_stats(memo) {
  const resources = collectResources([memo]);
  const stats = [{ label: Array.from(String(memo.content || "")).length + " 字符" }];
  const files = resources.filter(function (resource) {
    return resource.type === "file";
  }).length;
  const images = resources.filter(function (resource) {
    return resource.type === "image";
  }).length;
  const todos = collectTodos([memo]).length;
  const code_blocks = collectCodeBlocks([memo]).length;
  const links = collectLinks([memo]).length;
  if (files) stats.push({ label: files + " 文件" });
  if (images) stats.push({ label: images + " 图片" });
  if (todos) stats.push({ label: todos + " 代办" });
  if (code_blocks) stats.push({ label: code_blocks + " 代码块" });
  if (links) stats.push({ label: links + " 链接" });
  return stats;
}

function memo_view(memo, render_context) {
  return {
    backlinks: memoBacklinkCount(render_context, memo.id),
    createdAt: memo.createdAt,
    html: safe_markdown(memo.content, render_context),
    id: memo.id,
    pinned: Boolean(memo.pinned),
    reactions: Array.isArray(memo.reactions) ? memo.reactions.slice() : [],
    relativeTime: formatRelativeDate(memo.createdAt),
    stats: memo_stats(memo),
    tags: extractTags(memo.content),
  };
}

export {
  comment_view as buildReadonlyCommentView,
  memo_view as buildReadonlyMemoView,
};

function presentation(snapshot) {
  if (!snapshot || !snapshot.found || !snapshot.memo) {
    return {
      comment: null,
      memo: null,
      replies: [],
      replyTo: null,
    };
  }
  const render_state = {
    memoRefIndex: buildMemoReferenceIndex(snapshot.memos),
    memos: snapshot.memos,
  };
  const render_context = detachedMemoRenderContext(render_state, "", {
    readonly: true,
  });
  return {
    comment: comment_view(snapshot.comment, render_context),
    memo: memo_view(snapshot.memo, render_context),
    replies: snapshot.replies
      .map(function (item) {
        return comment_view(item, render_context);
      })
      .filter(Boolean),
    replyTo: comment_view(snapshot.replyTo, render_context),
  };
}

export function CommentRepliesModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref || !runtime?.refarr) {
    throw new Error("CommentRepliesModel requires the Timeless runtime");
  }

  const detail_model =
    props.detailModel || new CommentDetailModel(props.services || {});
  const comment_ = runtime.ref(null);
  const error_ = runtime.ref("");
  const found_ = runtime.ref(false);
  const loading_ = runtime.ref(false);
  const memo_ = runtime.ref(null);
  const query_ = runtime.ref("");
  const replies_ = runtime.refarr([]);
  const reply_to_ = runtime.ref(null);
  let destroyed_ = false;
  let request_id_ = 0;

  const state = {
    comment: comment_,
    error: error_,
    found: found_,
    loading: loading_,
    memo: memo_,
    query: query_,
    replies: replies_,
    replyTo: reply_to_,
  };

  function reset_for_load() {
    loading_.as(true);
    found_.as(false);
    error_.as("");
    comment_.as(null);
    memo_.as(null);
    replies_.as([]);
    reply_to_.as(null);
  }

  function apply_snapshot(snapshot) {
    const view_state = presentation(snapshot);
    query_.as(String((snapshot && snapshot.query) || "").trim());
    error_.as(String((snapshot && snapshot.error) || ""));
    comment_.as(view_state.comment);
    memo_.as(view_state.memo);
    replies_.as(view_state.replies);
    reply_to_.as(view_state.replyTo);
    loading_.as(Boolean(snapshot && snapshot.loading));
    found_.as(Boolean(snapshot && snapshot.found));
  }

  const methods = {
    async load(comment_id) {
      if (destroyed_) return false;
      request_id_ += 1;
      const current_request_id = request_id_;
      reset_for_load();
      const snapshot = await detail_model.load(comment_id);
      if (destroyed_ || current_request_id !== request_id_) return false;
      apply_snapshot(snapshot);
      return Boolean(snapshot && snapshot.found);
    },
  };

  const model = runtime.defineModel({ state, methods });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    request_id_ += 1;
    if (typeof detail_model.destroy === "function") detail_model.destroy();
    destroy_model();
  };
  return model;
}
