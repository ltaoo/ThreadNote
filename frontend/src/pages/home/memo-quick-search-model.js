import { parseTaskTitleAndDesc } from "@/domain/memos.js";

export const MEMO_QUICK_SEARCH_CONTEXT_PREFIX = "demo-desktop:memo-quick-search:v1:";
export const DEFAULT_MEMO_QUICK_SEARCH_LIMIT = 20;
export const MEMO_QUICK_SEARCH_DEBOUNCE_MS = 200;

export function memoQuickSearchTerms(value) {
  const query = String(value || "").trim().toLocaleLowerCase();
  if (!query) return [];
  return Array.from(new Set(query.split(/\s+/).filter(Boolean))).sort(function (left, right) {
    return right.length - left.length;
  });
}

// Highlights query terms inside plain text the caller already holds (a todo
// line, a comment body, a detached memo). Search results are highlighted by the
// server instead, via highlightPartsFromMarkup.
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

// highlightPartsFromMarkup turns the server-rendered highlight markup into the
// { matched, text } parts the palette renders as plain text nodes. The server
// HTML-escapes the original text, so every fragment is decoded here: nothing
// from the result is ever injected as markup.
export function highlightPartsFromMarkup(markup) {
  const html = String(markup || "");
  if (!html) return [];

  const parts = [];
  const pattern = /<mark>([\s\S]*?)<\/mark>/g;
  let cursor = 0;
  let match = pattern.exec(html);
  while (match) {
    if (match.index > cursor) {
      parts.push({ matched: false, text: decodeHighlightText(html.slice(cursor, match.index)) });
    }
    parts.push({ matched: true, text: decodeHighlightText(match[1]) });
    cursor = match.index + match[0].length;
    match = pattern.exec(html);
  }
  if (cursor < html.length) {
    parts.push({ matched: false, text: decodeHighlightText(html.slice(cursor)) });
  }
  return parts.filter(function (part) { return part.text; });
}

function decodeHighlightText(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, function (_match, code) {
      return String.fromCodePoint(Number(code));
    })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_match, code) {
      return String.fromCodePoint(parseInt(code, 16));
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // &amp; last, so an escaped "&lt;" in the source stays literal text.
    .replace(/&amp;/g, "&");
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

// hitToResult restores the result shape the palette renders, keeping the
// activation contract (kind / id / memoId / todo) the callers rely on.
export function hitToResult(hit, options) {
  const source = hit || {};
  const config = options || {};
  const project_name = projectNameFor(config.projects, source.projectId);
  const format_date = typeof config.formatDate === "function"
    ? config.formatDate
    : function (value) { return value ? String(value) : ""; };
  const query = String(config.query || "");
  const kind = String(source.kind || "");
  const time = new Date(source.updatedAt || source.createdAt || 0).getTime() || 0;

  if (kind === "todo") {
    const text = String(source.text || "");
    const parsed = parseTaskTitleAndDesc(text);
    const title = parsed.title || "未命名代办";
    const memo_id = String(source.memoId || "");
    const summary = [parsed.desc, source.sourceText, source.title]
      .filter(Boolean)
      .join(" · ");
    const todo = {
      checked: Boolean(source.checked),
      id: String(source.sourceCommentId || memo_id) + ":" + Number(source.lineIndex || 0),
      lineIndex: Number(source.lineIndex || 0),
      memoId: memo_id,
      projectId: String(source.projectId || ""),
      sourceCommentId: String(source.sourceCommentId || ""),
      sourceId: String(source.sourceCommentId || memo_id),
      sourceMemoId: memo_id,
      sourceText: String(source.sourceText || ""),
      sourceType: String(source.sourceType || (source.sourceCommentId ? "comment" : "memo")),
      text,
    };
    return {
      id: todo.id,
      key: "todo:" + todo.id,
      kind: "todo",
      kindLabel: source.checked ? "DONE" : "TODO",
      memoId: memo_id,
      meta: [
        source.checked ? "已完成" : "未完成",
        source.sourceCommentId ? "来自评论" : "来自 Memo",
        project_name,
        format_date(source.createdAt),
      ].filter(Boolean).join(" · "),
      score: Number(source.score) || 0,
      summary,
      summaryParts: memoQuickSearchHighlightParts(summary, query),
      time,
      title,
      titleParts: memoQuickSearchHighlightParts(title, query),
      todo,
    };
  }

  const id = String(kind === "comment" ? source.commentId : source.memoId);
  const title = String(source.title || "");
  const summary = highlightPartsFromMarkup(source.snippetHTML)
    .map(function (part) { return part.text; })
    .join("");
  const result = {
    id,
    key: kind + ":" + id,
    kind,
    kindLabel: kind === "comment" ? "COMMENT" : "MEMO",
    memoId: String(source.memoId || ""),
    meta: [
      source.archived ? "归档" : "",
      source.pinned ? "置顶" : "",
      project_name,
      format_date(source.createdAt),
    ].filter(Boolean).join(" · "),
    score: Number(source.score) || 0,
    summary,
    summaryParts: highlightPartsFromMarkup(source.snippetHTML),
    time,
    title,
    titleParts: highlightPartsFromMarkup(source.titleHTML),
  };
  return result;
}

function projectNameFor(projects, projectId) {
  const wanted = String(projectId || "");
  if (!wanted) return "";
  const found = (Array.isArray(projects) ? projects : []).find(function (project) {
    return project && String(project.id || "") === wanted;
  });
  return found ? String(found.name || "") : "";
}

export class MemoQuickSearchModel {
  constructor(services, options) {
    const config = options || {};
    this.services = services || {};
    this.limit = Number.isInteger(config.limit) && config.limit > 0
      ? config.limit
      : DEFAULT_MEMO_QUICK_SEARCH_LIMIT;
    this.onUpdate = typeof config.onUpdate === "function" ? config.onUpdate : null;
    this.sources = { projects: [] };
    this.state = {
      activeIndex: 0,
      open: false,
      query: "",
      results: [],
    };
    this._debounceTimer = null;
    this._requestSeq = 0;
  }

  setSources(sources) {
    const next = sources || {};
    this.sources = {
      projects: Array.isArray(next.projects) ? next.projects.filter(Boolean) : [],
    };
    // Project names only decorate already-fetched results, so a refresh is
    // needed only while the palette is showing them.
    if (this.state.open) this._requestSearch(false);
  }

  open() {
    this.state.open = true;
    this._requestSearch(true);
  }

  close() {
    this.state.open = false;
  }

  setQuery(value) {
    this.state.query = String(value || "");
    this.state.activeIndex = 0;
    this._requestSearch(false);
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

  // _requestSearch debounces the query and tags each request with a sequence
  // number, so a slow earlier response cannot overwrite a newer one.
  _requestSearch(immediate) {
    clearTimeout(this._debounceTimer);
    const query = this.state.query;
    const seq = ++this._requestSeq;
    this._debounceTimer = setTimeout(() => {
      if (!this.state.open || seq !== this._requestSeq) return;
      this._search(query, seq);
    }, immediate ? 0 : MEMO_QUICK_SEARCH_DEBOUNCE_MS);
  }

  _search(query, seq) {
    if (typeof globalThis.invoke !== "function") return;
    const url = "/api/search?q=" + encodeURIComponent(query) + "&limit=" + this.limit;
    globalThis.invoke(url, { method: "GET" })
      .then((resp) => {
        if (seq !== this._requestSeq || !this.state.open) return;
        const hits = resp && resp.code === 0 && resp.data && Array.isArray(resp.data.hits)
          ? resp.data.hits
          : [];
        const projects = this.sources.projects;
        const formatDate = this.formatDate.bind(this);
        this.state.results = hits.map(function (hit) {
          return hitToResult(hit, { formatDate, projects, query });
        });
        this.state.activeIndex = Math.max(
          0,
          Math.min(this.state.activeIndex, this.state.results.length - 1),
        );
        if (this.onUpdate) this.onUpdate();
      })
      .catch(function () {});
  }

  formatDate(value) {
    if (!value) return "";
    if (typeof this.services.formatDate === "function") return this.services.formatDate(value);
    return String(value);
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
