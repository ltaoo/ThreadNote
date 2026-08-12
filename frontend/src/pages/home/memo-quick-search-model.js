import { collectTodos, memoTitle, parseTaskTitleAndDesc } from "../../domain/memos.js";

export const MEMO_QUICK_SEARCH_CONTEXT_PREFIX = "demo-desktop:memo-quick-search:v1:";
export const DEFAULT_MEMO_QUICK_SEARCH_LIMIT = 20;

export function memoQuickSearchTerms(value) {
  const query = String(value || "").trim().toLocaleLowerCase();
  if (!query) return [];
  return Array.from(new Set(query.split(/\s+/).filter(Boolean))).sort(function (left, right) {
    return right.length - left.length;
  });
}

export function matchesMemoQuickSearch(value, query) {
  const haystack = String(value || "").toLocaleLowerCase();
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  const terms = memoQuickSearchTerms(needle);
  return terms.length > 0 && terms.every(function (term) {
    return haystack.includes(term);
  });
}

export function memoQuickSearchHighlightParts(value, query) {
  const text = String(value || "");
  const terms = memoQuickSearchTerms(query);
  if (!text || !terms.length) return text ? [{ matched: false, text }] : [];

  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "giu");
  const parts = [];
  let cursor = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > cursor) {
      parts.push({ matched: false, text: text.slice(cursor, match.index) });
    }
    parts.push({ matched: true, text: match[0] });
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) parts.push({ matched: false, text: text.slice(cursor) });
  return parts.length ? parts : [{ matched: false, text }];
}

export function memoQuickSearchContextKey(memoId) {
  return MEMO_QUICK_SEARCH_CONTEXT_PREFIX + encodeURIComponent(String(memoId || "").trim());
}

export function writeMemoQuickSearchOpenContext(storage, memoId, context) {
  const memo_id = String(memoId || "").trim();
  if (!storage || !memo_id) return;
  const query = String((context && context.query) || "").trim();
  const key = memoQuickSearchContextKey(memo_id);
  if (!query) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify({
    memoId: memo_id,
    nonce: Date.now() + ":" + Math.random().toString(36).slice(2),
    query,
  }));
}

export function readMemoQuickSearchOpenContext(storage, memoId, rawValue) {
  const memo_id = String(memoId || "").trim();
  if (!storage || !memo_id) return { memoId: memo_id, query: "" };
  try {
    const raw = rawValue === undefined ? storage.getItem(memoQuickSearchContextKey(memo_id)) : rawValue;
    const value = raw ? JSON.parse(raw) : {};
    if (String(value.memoId || "").trim() !== memo_id) {
      return { memoId: memo_id, query: "" };
    }
    return {
      memoId: memo_id,
      query: String(value.query || "").trim(),
    };
  } catch (_) {
    return { memoId: memo_id, query: "" };
  }
}

export class MemoQuickSearchModel {
  constructor(services, options) {
    const config = options || {};
    this.services = services || {};
    this.limit = Number.isInteger(config.limit) && config.limit > 0
      ? config.limit
      : DEFAULT_MEMO_QUICK_SEARCH_LIMIT;
    this.sources = { comments: [], memos: [], projects: [] };
    this.state = {
      activeIndex: 0,
      open: false,
      query: "",
      results: [],
    };
  }

  setSources(sources) {
    const next = sources || {};
    this.sources = {
      comments: Array.isArray(next.comments) ? next.comments.filter(Boolean) : [],
      memos: Array.isArray(next.memos) ? next.memos.filter(Boolean) : [],
      projects: Array.isArray(next.projects) ? next.projects.filter(Boolean) : [],
    };
    this.rebuildResults();
  }

  open() {
    this.state.open = true;
    this.rebuildResults();
  }

  close() {
    this.state.open = false;
  }

  setQuery(value) {
    this.state.query = String(value || "").trim();
    this.state.activeIndex = 0;
    this.rebuildResults();
  }

  moveActive(delta) {
    const length = this.state.results.length;
    if (!length) {
      this.state.activeIndex = 0;
      return;
    }
    this.state.activeIndex = (this.state.activeIndex + delta + length) % length;
  }

  activateByKey(key) {
    const target_key = String(key || "");
    const result = this.state.results.find(function (item) {
      return item.key === target_key || item.id === target_key;
    });
    return this.activateResult(result);
  }

  activateActive() {
    return this.activateResult(this.state.results[this.state.activeIndex]);
  }

  activateResult(result) {
    if (!result) return false;
    if (typeof this.services.openResult === "function") {
      this.services.openResult({
        commentId: result.kind === "comment" ? result.id : "",
        memoId: result.memoId,
        query: this.state.query,
        result,
        todoId: result.kind === "todo" ? result.id : "",
      });
    }
    return true;
  }

  snapshot() {
    return {
      activeIndex: this.state.activeIndex,
      open: this.state.open,
      query: this.state.query,
      results: this.state.results.slice(),
    };
  }

  rebuildResults() {
    if (!this.state.open) return;
    const query = this.state.query;
    const memo_by_id = new Map();
    const project_by_id = new Map();
    const reply_counts = new Map();
    this.sources.memos.forEach(function (memo) {
      if (memo && memo.id) memo_by_id.set(String(memo.id), memo);
    });
    this.sources.projects.forEach(function (project) {
      if (project && project.id) project_by_id.set(String(project.id), project);
    });
    this.sources.comments.forEach(function (comment) {
      if (!comment || !comment.replyTo) return;
      const parent_id = String(comment.replyTo);
      reply_counts.set(parent_id, (reply_counts.get(parent_id) || 0) + 1);
    });

    const memo_results = this.sources.memos.map((memo) => {
      const title = memoTitle(memo);
      const project = project_by_id.get(String(memo.projectId || ""));
      const project_name = project ? String(project.name || "") : "";
      const searchable = [title, memo.content].join(" ");
      if (query && !matchesMemoQuickSearch(searchable, query)) return null;
      const summary = quickSearchSummary(memo.content, query, 140);
      return this.resultWithHighlights({
        id: String(memo.id),
        key: "memo:" + memo.id,
        kind: "memo",
        kindLabel: "MEMO",
        memoId: String(memo.id),
        meta: [memo.archived ? "归档" : "", memo.pinned ? "置顶" : "", project_name, this.formatDate(memo.createdAt)].filter(Boolean).join(" · "),
        score: quickSearchScore(title, memo.content, query),
        summary,
        time: recordTime(memo),
        title,
      }, query);
    }).filter(Boolean);

    const comment_results = this.sources.comments.map((comment) => {
      const memo = memo_by_id.get(String(comment.memoId || ""));
      if (!memo) return null;
      const parent_title = memoTitle(memo);
      const searchable = [comment.content, parent_title].join(" ");
      if (query && !matchesMemoQuickSearch(searchable, query)) return null;
      const reply_count = reply_counts.get(String(comment.id)) || 0;
      const relation_label = comment.replyTo ? "回复" : "评论";
      const summary = quickSearchSummary(comment.content, query, 140);
      return this.resultWithHighlights({
        id: String(comment.id),
        key: "comment:" + comment.id,
        kind: "comment",
        kindLabel: comment.replyTo ? "REPLY" : "COMMENT",
        memoId: String(comment.memoId),
        meta: [relation_label, reply_count ? reply_count + " 条回复" : "", this.formatDate(comment.updatedAt || comment.createdAt)].filter(Boolean).join(" · "),
        score: quickSearchScore(parent_title, comment.content, query),
        summary,
        time: recordTime(comment),
        title: parent_title,
      }, query);
    }).filter(Boolean);

    const todo_results = collectTodos(quickSearchTodoDocuments(this.sources.memos, this.sources.comments, memo_by_id))
      .map((todo) => {
        const memo = memo_by_id.get(String(todo.memoId || ""));
        if (!memo) return null;
        const parent_title = memoTitle(memo);
        const project = project_by_id.get(String(todo.projectId || ""));
        const project_name = project ? String(project.name || "") : "";
        const parsed = parseTaskTitleAndDesc(todo.text);
        const searchable = [todo.text, todo.sourceText, parent_title].join(" ");
        if (query && !matchesMemoQuickSearch(searchable, query)) return null;
        const summary = quickSearchSummary([parsed.desc, todo.sourceText, parent_title].filter(Boolean).join(" · "), query, 140);
        return this.resultWithHighlights({
          id: String(todo.id),
          key: "todo:" + todo.id,
          kind: "todo",
          kindLabel: todo.checked ? "DONE" : "TODO",
          memoId: String(todo.memoId),
          meta: [todo.checked ? "已完成" : "未完成", todo.sourceCommentId ? "来自评论" : "来自 Memo", project_name, this.formatDate(todo.memo.createdAt)].filter(Boolean).join(" · "),
          score: quickSearchScore(parsed.title, searchable, query),
          summary,
          time: recordTime(todo.memo),
          title: parsed.title || "未命名代办",
          todo,
        }, query);
      })
      .filter(Boolean);

    this.state.results = memo_results.concat(comment_results, todo_results)
      .sort(function (left, right) {
        if (query && left.score !== right.score) return left.score - right.score;
        if (left.time !== right.time) return right.time - left.time;
        return left.key.localeCompare(right.key);
      })
      .slice(0, this.limit);
    this.state.activeIndex = Math.max(0, Math.min(this.state.activeIndex, this.state.results.length - 1));
  }

  resultWithHighlights(result, query) {
    return {
      ...result,
      summaryParts: memoQuickSearchHighlightParts(result.summary, query),
      titleParts: memoQuickSearchHighlightParts(result.title, query),
    };
  }

  formatDate(value) {
    if (!value) return "";
    if (typeof this.services.formatDate === "function") return this.services.formatDate(value);
    return String(value);
  }
}

function quickSearchTodoDocuments(memos, comments, memoById) {
  const documents = (Array.isArray(memos) ? memos : []).filter(Boolean).slice();
  (Array.isArray(comments) ? comments : []).forEach(function (comment) {
    if (!comment || !comment.id || !comment.memoId) return;
    const parent = memoById.get(String(comment.memoId));
    if (!parent) return;
    documents.push({
      content: String(comment.content || ""),
      createdAt: comment.createdAt || parent.createdAt,
      id: String(comment.id),
      projectId: String(parent.projectId || ""),
      sourceCommentId: String(comment.id),
      sourceId: String(comment.id),
      sourceMemoId: String(comment.memoId),
      sourceType: "comment",
    });
  });
  return documents;
}

function quickSearchScore(title, content, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return 0;
  const normalized_title = String(title || "").toLocaleLowerCase();
  const normalized_content = String(content || "").toLocaleLowerCase();
  if (normalized_title === needle) return 0;
  if (normalized_title.includes(needle)) return 1;
  if (normalized_content.includes(needle)) return 2;
  return 3;
}

function quickSearchSummary(value, query, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const max_length = Number.isInteger(limit) && limit > 8 ? limit : 140;
  if (text.length <= max_length) return text;

  const lower_text = text.toLocaleLowerCase();
  const match_index = memoQuickSearchTerms(query).reduce(function (earliest, term) {
    const index = lower_text.indexOf(term);
    if (index < 0) return earliest;
    return earliest < 0 ? index : Math.min(earliest, index);
  }, -1);
  if (match_index < 0 || match_index < max_length * 0.7) {
    return text.slice(0, max_length - 1) + "...";
  }

  const start = Math.max(0, Math.min(match_index - Math.floor(max_length * 0.3), text.length - max_length));
  const end = Math.min(text.length, start + max_length - 2);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

function recordTime(record) {
  return new Date((record && (record.updatedAt || record.createdAt)) || 0).getTime() || 0;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
