export const MEMO_COMMENTS_STORAGE_KEY = "demo-desktop:memos:comments:v1";

export function normalizeMemoCommentPayload(comment) {
  if (!comment || typeof comment !== "object") return null;
  const id = String(comment.id || "").trim();
  const memoId = String(comment.memoId || "").trim();
  if (!id || !memoId) return null;
  return {
    content: String(comment.content || ""),
    createdAt: comment.createdAt || new Date().toISOString(),
    id,
    memoId,
    path: String(comment.path || ""),
    private: Boolean(comment.private),
    reactions: Array.isArray(comment.reactions) ? comment.reactions.filter(String) : [],
    references: Array.isArray(comment.references) ? comment.references.map(String).filter(Boolean) : [],
    replyTo: String(comment.replyTo || "").trim(),
    tags: Array.isArray(comment.tags) ? comment.tags.map(String).filter(Boolean) : [],
    updatedAt: comment.updatedAt || "",
    visibility: comment.visibility || "PRIVATE",
  };
}

export function loadMemoCommentsFromVault(memoId = "") {
  const targetMemoId = String(memoId || "").trim();
  if (typeof globalThis.invoke !== "function") {
    const comments = loadLocalMemoComments();
    return Promise.resolve(targetMemoId ? comments.filter((comment) => comment.memoId === targetMemoId) : comments);
  }
  const query = targetMemoId ? "?memoId=" + encodeURIComponent(targetMemoId) : "";
  return globalThis.invoke("/api/memo-comments" + query, { method: "GET" }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取评论失败");
    }
    const data = resp.data || {};
    return Array.isArray(data.comments)
      ? data.comments.map(normalizeMemoCommentPayload).filter(Boolean)
      : [];
  });
}

export function createMemoCommentInVault(memoId, content, visibility, isPrivate, replyTo) {
  const targetMemoId = String(memoId || "").trim();
  const text = String(content || "");
  const vis = visibility || "PRIVATE";
  const priv = Boolean(isPrivate);
  const reply = String(replyTo || "").trim();
  if (!targetMemoId) return Promise.reject(new Error("memo id is required"));
  if (!text.trim()) return Promise.reject(new Error("comment content is required"));

  if (typeof globalThis.invoke !== "function") {
    const now = new Date().toISOString();
    const comment = normalizeMemoCommentPayload({
      content: text,
      createdAt: now,
      id: createMemoCommentId(),
      memoId: targetMemoId,
      private: priv,
      replyTo: reply,
      updatedAt: "",
      visibility: vis,
    });
    const comments = [comment].filter(Boolean).concat(loadLocalMemoComments());
    saveLocalMemoComments(comments);
    return Promise.resolve(comment);
  }

  var args = {
    content: text,
    memoId: targetMemoId,
    private: priv,
    visibility: vis,
  };
  if (reply) args.replyTo = reply;
  return globalThis.invoke("/api/memo-comments/create", {
    method: "POST",
    args: args,
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.comment) {
      throw new Error((resp && resp.msg) || "评论失败");
    }
    return normalizeMemoCommentPayload(resp.data.comment);
  });
}

export function updateMemoCommentInVault(id, patch) {
  const commentId = String(id || "").trim();
  if (!commentId) return Promise.reject(new Error("comment id is required"));

  if (typeof globalThis.invoke !== "function") {
    let updated = null;
    const comments = loadLocalMemoComments().map(function (comment) {
      if (comment.id !== commentId) return comment;
      updated = normalizeMemoCommentPayload({
        ...comment,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      return updated;
    });
    saveLocalMemoComments(comments);
    return updated ? Promise.resolve(updated) : Promise.reject(new Error("comment not found"));
  }

  const args = { id: commentId };
  if (Object.prototype.hasOwnProperty.call(patch, "content")) args.content = patch.content;
  if (Object.prototype.hasOwnProperty.call(patch, "private")) args.private = Boolean(patch.private);
  if (Object.prototype.hasOwnProperty.call(patch, "reactions")) args.reactions = patch.reactions;
  if (Object.prototype.hasOwnProperty.call(patch, "replyTo")) args.replyTo = patch.replyTo;
  return globalThis.invoke("/api/memo-comments/update", {
    method: "POST",
    args,
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.comment) {
      throw new Error((resp && resp.msg) || "保存评论失败");
    }
    return normalizeMemoCommentPayload(resp.data.comment);
  });
}

export function deleteMemoCommentInVault(id, options) {
  const commentId = String(id || "").trim();
  if (!commentId) return Promise.resolve({ success: true });

  if (typeof globalThis.invoke !== "function") {
    saveLocalMemoComments(loadLocalMemoComments().filter((comment) => comment.id !== commentId));
    return Promise.resolve({ success: true });
  }

  const args = { id: commentId };
  if (options && Object.prototype.hasOwnProperty.call(options, "cleanupAssets")) {
    args.cleanupAssets = Boolean(options.cleanupAssets);
  }
  return globalThis.invoke("/api/memo-comments/delete", {
    method: "POST",
    args,
  }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "删除评论失败");
    }
    return resp.data || { success: true };
  });
}

export function loadCommentHistoryFromVault(id) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ id: id, versions: [] });
  return globalThis.invoke("/api/memo-comments/history?id=" + encodeURIComponent(id), { method: "GET" }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取评论历史失败");
    }
    return resp.data || { id: id, versions: [] };
  });
}

export function loadCommentHistoryVersionFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ content: "", version: 0, versions: [] });
  return globalThis.invoke(
    "/api/memo-comments/history/version?id=" + encodeURIComponent(id) + "&version=" + encodeURIComponent(String(version)),
    { method: "GET" }
  ).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取评论历史版本失败");
    }
    return resp.data || { content: "", version: 0, versions: [] };
  });
}

export function restoreCommentHistoryVersionFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve(null);
  return globalThis.invoke("/api/memo-comments/history/restore", {
    method: "POST",
    args: { id: id, version: version },
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.comment) {
      throw new Error((resp && resp.msg) || "回退评论失败");
    }
    return resp.data.comment;
  });
}

export function loadCommentHistoryDiffFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ diff: "", version: version || 0 });
  return globalThis.invoke(
    "/api/memo-comments/history/diff?id=" + encodeURIComponent(id) + "&version=" + encodeURIComponent(String(version)),
    { method: "GET" }
  ).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取差异失败");
    }
    return resp.data || { diff: "", version: version || 0 };
  });
}

function loadLocalMemoComments() {
  try {
    const raw = localStorage.getItem(MEMO_COMMENTS_STORAGE_KEY);
    const comments = raw ? JSON.parse(raw) : [];
    return Array.isArray(comments) ? comments.map(normalizeMemoCommentPayload).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function saveLocalMemoComments(comments) {
  localStorage.setItem(MEMO_COMMENTS_STORAGE_KEY, JSON.stringify(comments));
}

function createMemoCommentId() {
  return `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
