import { normalizeMemoCommentPayload } from "./domain/memo-comments.js";
import { normalizeMemoPayload, parseTaskTitleAndDesc } from "./domain/memos.js";

export const TODO_DETAIL_STORAGE_PREFIX = "demo-desktop:todo-detail:v1:";

export function buildTodoDetailPayload(todo, comments, memos, query) {
  const normalized_todo = normalizeTodoPayload(todo);
  if (!normalized_todo) return null;

  const memo_list = Array.isArray(memos) ? memos.filter(Boolean) : [];
  const comment_list = Array.isArray(comments) ? comments.filter(Boolean) : [];
  const memo = memo_list.find(function (item) {
    return item && String(item.id || "") === normalized_todo.memoId;
  });
  if (!memo) return null;

  const comment = normalized_todo.sourceCommentId
    ? comment_list.find(function (item) {
        return item && String(item.id || "") === normalized_todo.sourceCommentId;
      }) || null
    : null;

  return {
    comment,
    memo,
    memos: memo_list,
    query: String(query || "").trim(),
    todo: normalized_todo,
  };
}

export function normalizeTodoPayload(todo) {
  if (!todo || typeof todo !== "object") return null;
  const id = String(todo.id || "").trim();
  const memo_id = String(todo.memoId || todo.sourceMemoId || "").trim();
  if (!id || !memo_id) return null;
  const parsed = parseTaskTitleAndDesc(todo.text);
  return {
    checked: Boolean(todo.checked),
    description: parsed.desc,
    id,
    lineIndex: Number.isInteger(todo.lineIndex) ? todo.lineIndex : Number(todo.lineIndex) || 0,
    memoId: memo_id,
    projectId: String(todo.projectId || "").trim(),
    sourceCommentId: String(todo.sourceCommentId || "").trim(),
    sourceId: String(todo.sourceId || id).trim(),
    sourceMemoId: String(todo.sourceMemoId || memo_id).trim(),
    sourceText: String(todo.sourceText || "").trim(),
    sourceType: String(todo.sourceType || (todo.sourceCommentId ? "comment" : "memo")).trim().toLowerCase() || "memo",
    text: String(todo.text || "").trim(),
    title: parsed.title || "未命名代办",
  };
}

export function todoDetailStorageKey(todoId) {
  return TODO_DETAIL_STORAGE_PREFIX + encodeURIComponent(String(todoId || "").trim());
}

export function writeTodoDetailPayload(storage, payload) {
  const todo_id = String(payload && payload.todo && payload.todo.id || "").trim();
  if (!storage || !todo_id) return;
  storage.setItem(todoDetailStorageKey(todo_id), JSON.stringify(payload));
}

export function readTodoDetailPayload(storage, todoId) {
  const todo_id = String(todoId || "").trim();
  if (!storage || !todo_id) return null;
  try {
    const raw = storage.getItem(todoDetailStorageKey(todo_id));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export class TodoDetailModel {
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
      todo: null,
    };
  }

  async load(todoId) {
    const todo_id = String(todoId || "").trim();
    if (!todo_id) {
      this.setError("缺少代办 ID");
      return this.snapshot();
    }

    this.state.loading = true;
    this.state.error = "";
    try {
      let payload = null;
      if (typeof this.services.request === "function") {
        const response = await this.services.request(
          "/api/todo-window/get?id=" + encodeURIComponent(todo_id),
          { method: "GET" },
        );
        if (!response || response.code !== 0) {
          throw new Error((response && response.msg) || "加载代办失败");
        }
        payload = response.data && response.data.found ? response.data : null;
      } else if (typeof this.services.readLocal === "function") {
        payload = this.services.readLocal(todo_id);
      }

      if (!payload) {
        this.setError("未找到代办");
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
    const todo = normalizeTodoPayload(payload && payload.todo);
    const memo = normalizeMemoPayload(payload && payload.memo);
    if (!todo || !memo || todo.memoId !== memo.id) {
      this.setError("代办数据不完整");
      return;
    }

    const comment = normalizeMemoCommentPayload(payload.comment);
    const memos = (Array.isArray(payload.memos) ? payload.memos : [])
      .map(normalizeMemoPayload)
      .filter(Boolean);
    if (!memos.some(function (item) { return item.id === memo.id; })) memos.unshift(memo);

    this.state = {
      comment: comment && comment.memoId === memo.id ? comment : null,
      error: "",
      found: true,
      loading: false,
      memo,
      memos,
      query: String(payload.query || "").trim(),
      todo,
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
      todo: this.state.todo,
    };
  }
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "加载失败");
}
