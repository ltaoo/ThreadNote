import { normalizeMemoCommentPayload } from "./domain/memo-comments.js";
import { normalizeMemoPayload } from "./domain/memos.js";

export const COMMENT_DETAIL_STORAGE_PREFIX = "demo-desktop:comment-detail:v1:";

export function buildCommentDetailPayload(comments, memos, commentId, query) {
  const selected_id = String(commentId || "").trim();
  const comment_list = Array.isArray(comments) ? comments.filter(Boolean) : [];
  const memo_list = Array.isArray(memos) ? memos.filter(Boolean) : [];
  const comment = comment_list.find(function (item) {
    return item && String(item.id || "") === selected_id;
  });
  if (!comment) return null;

  const memo = memo_list.find(function (item) {
    return item && String(item.id || "") === String(comment.memoId || "");
  });
  if (!memo) return null;

  const reply_to = comment.replyTo
    ? comment_list.find(function (item) {
        return item && String(item.id || "") === String(comment.replyTo);
      }) || null
    : null;
  const replies = comment_list
    .filter(function (item) {
      return item && String(item.replyTo || "") === selected_id;
    })
    .sort(compareCommentTime);

  return {
    comment,
    memo,
    memos: memo_list,
    query: String(query || "").trim(),
    replies,
    replyTo: reply_to,
  };
}

export function commentDetailStorageKey(commentId) {
  return COMMENT_DETAIL_STORAGE_PREFIX + encodeURIComponent(String(commentId || "").trim());
}

export function writeCommentDetailPayload(storage, payload) {
  const comment_id = String(payload && payload.comment && payload.comment.id || "").trim();
  if (!storage || !comment_id) return;
  storage.setItem(commentDetailStorageKey(comment_id), JSON.stringify(payload));
}

export function readCommentDetailPayload(storage, commentId) {
  const comment_id = String(commentId || "").trim();
  if (!storage || !comment_id) return null;
  try {
    const raw = storage.getItem(commentDetailStorageKey(comment_id));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export class CommentDetailModel {
  constructor(services) {
    this.services = services || {};
    this.state = {
      comment: null,
      error: "",
      found: false,
      loading: false,
      memo: null,
      memos: [],
      query: "",
      replies: [],
      replyTo: null,
    };
  }

  async load(commentId) {
    const comment_id = String(commentId || "").trim();
    if (!comment_id) {
      this.setError("缺少评论 ID");
      return this.snapshot();
    }

    this.state.loading = true;
    this.state.error = "";
    try {
      let payload = null;
      if (typeof this.services.request === "function") {
        const response = await this.services.request(
          "/api/comment-replies/get?id=" + encodeURIComponent(comment_id),
          { method: "GET" },
        );
        if (!response || response.code !== 0) {
          throw new Error((response && response.msg) || "加载评论失败");
        }
        payload = response.data && response.data.found ? response.data : null;
      } else if (typeof this.services.readLocal === "function") {
        payload = this.services.readLocal(comment_id);
      }

      if (!payload) {
        this.setError("未找到评论");
        return this.snapshot();
      }
      this.applyPayload(payload);
      return this.snapshot();
    } catch (error) {
      this.setError(errorMessage(error));
      return this.snapshot();
    }
  }

  applyPayload(payload) {
    const comment = normalizeMemoCommentPayload(payload && payload.comment);
    const memo = normalizeMemoPayload(payload && payload.memo);
    if (!comment || !memo) {
      this.setError("评论数据不完整");
      return;
    }

    const reply_to = normalizeMemoCommentPayload(payload.replyTo);
    const replies = (Array.isArray(payload.replies) ? payload.replies : [])
      .map(normalizeMemoCommentPayload)
      .filter(Boolean)
      .filter(function (reply) {
        return reply.replyTo === comment.id;
      })
      .sort(compareCommentTime);
    const memos = (Array.isArray(payload.memos) ? payload.memos : [])
      .map(normalizeMemoPayload)
      .filter(Boolean);
    if (!memos.some(function (item) { return item.id === memo.id; })) memos.unshift(memo);

    this.state = {
      comment: commentView(comment, replies.length, reply_to),
      error: "",
      found: true,
      loading: false,
      memo,
      memos,
      query: String(payload.query || "").trim(),
      replies: replies.map(function (reply) {
        return commentView(reply, 0, comment);
      }),
      replyTo: reply_to ? commentView(reply_to, 0, null) : null,
    };
  }

  setError(message) {
    this.state.loading = false;
    this.state.found = false;
    this.state.error = String(message || "加载失败");
  }

  snapshot() {
    return {
      comment: this.state.comment,
      error: this.state.error,
      found: this.state.found,
      loading: this.state.loading,
      memo: this.state.memo,
      memos: this.state.memos.slice(),
      query: this.state.query,
      replies: this.state.replies.slice(),
      replyTo: this.state.replyTo,
    };
  }
}

function commentView(comment, replyCount, replyTo) {
  return {
    comment,
    replyCount: Number(replyCount || 0),
    replyToPreview: replyTo ? compactPreview(replyTo.content) : "",
  };
}

function compactPreview(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? text.slice(0, 80) + "..." : text;
}

function compareCommentTime(left, right) {
  const time_diff = recordTime(left) - recordTime(right);
  if (time_diff !== 0) return time_diff;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function recordTime(record) {
  return new Date(record && (record.createdAt || record.updatedAt) || 0).getTime() || 0;
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "加载失败");
}
