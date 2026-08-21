import {
  DEFAULT_VISIBILITY,
  extractTags,
  normalizeMemoPayload,
} from "./memos.js";
import { logMemoPagination } from "./memo-pagination-log.js";
import { normalizeProjectID, normalizeProjectPayload } from "./projects.js";

export const MEMOS_STORAGE_KEY = "demo-desktop:memos:items:v1";
export const PROJECTS_STORAGE_KEY = "demo-desktop:memos:projects:v1";

export function loadMemos() {
  if (typeof globalThis.invoke === "function") return [];
  const saved = loadJSON(MEMOS_STORAGE_KEY, null);
  if (Array.isArray(saved)) return saved;
  const memos = seedMemos();
  saveMemos(memos);
  return memos;
}

export function loadProjects() {
  if (typeof globalThis.invoke === "function") return [];
  const saved = loadJSON(PROJECTS_STORAGE_KEY, null);
  return Array.isArray(saved) ? saved.map(normalizeProjectPayload).filter(Boolean) : [];
}

export function saveProjects(projects) {
  if (typeof globalThis.invoke === "function") return;
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function loadProjectsFromVault() {
  if (typeof globalThis.invoke !== "function") {
    return Promise.resolve({ activeProjectId: "", projects: loadProjects() });
  }
  return globalThis.invoke("/api/projects", { method: "GET" }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取 project 失败");
    }
    const data = resp.data || {};
    return {
      activeProjectId: normalizeProjectID(data.activeProjectId),
      projects: Array.isArray(data.projects) ? data.projects : [],
    };
  });
}

export function createProjectInVault(name, color) {
  if (typeof globalThis.invoke !== "function") {
    const now = new Date().toISOString();
    return Promise.resolve({
      archived: false,
      color: color || "#2563eb",
      createdAt: now,
      id: "project_" + Date.now().toString(36),
      name,
      sortOrder: 0,
      updatedAt: now,
    });
  }
  return globalThis.invoke("/api/projects/create", {
    method: "POST",
    args: {
      color: color || "",
      name,
    },
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.project) {
      throw new Error((resp && resp.msg) || "创建 project 失败");
    }
    return resp.data.project;
  });
}

export function saveMemos(memos) {
  if (typeof globalThis.invoke === "function") return;
  localStorage.setItem(MEMOS_STORAGE_KEY, JSON.stringify(memos));
}

export function loadMemosFromVault() {
  if (typeof globalThis.invoke !== "function") {
    return Promise.resolve(loadMemos());
  }
  return with_memo_repository_logging(
    globalThis.invoke("/api/memos", { method: "GET" }).then(function (resp) {
      if (!resp || resp.code !== 0) {
        throw new Error((resp && resp.msg) || "读取 memo 失败");
      }
      const data = resp.data || {};
      return Array.isArray(data.memos) ? data.memos : [];
    }),
    "list",
  );
}

export function loadMemoPageFromVault(options = {}) {
  if (typeof globalThis.invoke !== "function") {
    const filtered_memos = filterLocalMemoPage(loadMemos(), options);
    const offset = Math.max(0, Number(options.cursor) || 0);
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 40));
    const memos = filtered_memos.slice(offset, offset + limit);
    const next_offset = offset + memos.length;
    const has_more = next_offset < filtered_memos.length;
    return Promise.resolve({
      hasMore: has_more,
      memos,
      nextCursor: has_more ? String(next_offset) : "",
      total: filtered_memos.length,
    });
  }
  const query = memoPageQuery(options);
  const request_url = "/api/memos?" + query.toString();
  const started_at = Date.now();
  logMemoPagination("info", "repository-request-start", {
    cursorLength: String(options.cursor || "").length,
    cursorPresent: Boolean(options.cursor),
    limit: Math.min(200, Math.max(1, Number(options.limit) || 40)),
    url: request_url,
  });
  return with_memo_repository_logging(
    Promise.resolve()
      .then(function () {
        return globalThis.invoke(request_url, { method: "GET" });
      })
      .then(function (resp) {
        logMemoPagination("info", "repository-response-received", {
          code: Number(resp?.code),
          durationMs: Date.now() - started_at,
          hasData: Boolean(resp?.data),
          message: String(resp?.msg || ""),
          url: request_url,
        });
        if (!resp || resp.code !== 0) {
          throw new Error((resp && resp.msg) || "读取 memo 列表失败");
        }
        const data = resp.data || {};
        const page = {
          hasMore: Boolean(data.hasMore),
          memos: Array.isArray(data.memos) ? data.memos : [],
          nextCursor: String(data.nextCursor || ""),
          total: Math.max(0, Number(data.total) || 0),
        };
        logMemoPagination("info", "repository-response-normalized", {
          durationMs: Date.now() - started_at,
          hasMore: page.hasMore,
          memoCount: page.memos.length,
          nextCursorLength: page.nextCursor.length,
          total: page.total,
          url: request_url,
        });
        return page;
      }),
    "page",
  );
}

export function loadMemoStatsFromVault() {
  if (typeof globalThis.invoke !== "function") {
    return Promise.resolve(memoStats(loadMemos()));
  }
  return with_memo_repository_logging(
    globalThis.invoke("/api/memos/stats", { method: "GET" }).then(
      function (resp) {
        if (!resp || resp.code !== 0 || !resp.data || !resp.data.stats) {
          throw new Error((resp && resp.msg) || "读取 memo 统计失败");
        }
        return resp.data.stats;
      },
    ),
    "stats",
  );
}

export function loadMemoFromVault(id) {
  const memo_id = String(id || "").trim();
  if (!memo_id) return Promise.reject(new Error("memo id is required"));
  if (typeof globalThis.invoke !== "function") {
    const memo = loadMemos().find(function (item) {
      return item && item.id === memo_id;
    });
    return memo
      ? Promise.resolve(memo)
      : Promise.reject(new Error("找不到 memo"));
  }
  return with_memo_repository_logging(
    globalThis.invoke(
      "/api/memos/get?id=" + encodeURIComponent(memo_id),
      { method: "GET" },
    ).then(function (resp) {
      if (!resp || resp.code !== 0 || !resp.data || !resp.data.memo) {
        throw new Error((resp && resp.msg) || "读取 memo 失败");
      }
      return resp.data.memo;
    }),
    "get",
  );
}

function with_memo_repository_logging(request, operation) {
  return request.catch(function (err) {
    const logger = globalThis.FrontendLogger || globalThis.Logger;
    try {
      logger
        ?.Error(err)
        .Str("component", "memo_repository")
        .Str("operation", operation)
        .Msg("memo repository request failed");
    } catch (_log_err) {
      // Logging must never replace the original repository error.
    }
    throw err;
  });
}

function memoPageQuery(options) {
  const query = new URLSearchParams();
  query.set(
    "limit",
    String(Math.min(200, Math.max(1, Number(options.limit) || 40))),
  );
  ["archived", "pinned"].forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      query.set(name, String(Boolean(options[name])));
    }
  });
  ["cursor", "projectId", "tag", "visibility"].forEach(function (name) {
    const value = String(options[name] || "").trim();
    if (value) query.set(name, value);
  });
  return query;
}

function filterLocalMemoPage(memos, options) {
  return memos.filter(function (memo) {
    if (
      Object.prototype.hasOwnProperty.call(options, "archived") &&
      Boolean(memo.archived) !== Boolean(options.archived)
    ) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(options, "pinned") &&
      Boolean(memo.pinned) !== Boolean(options.pinned)
    ) {
      return false;
    }
    if (options.projectId && memo.projectId !== options.projectId) return false;
    if (
      options.visibility &&
      String(memo.visibility || "").toUpperCase() !==
        String(options.visibility).toUpperCase()
    ) {
      return false;
    }
    if (options.tag && !extractTags(memo.content).includes(options.tag)) {
      return false;
    }
    return true;
  });
}

function memoStats(memos) {
  const stats = {
    active: 0,
    archived: 0,
    pinned: 0,
    private: 0,
    protected: 0,
    public: 0,
    secret: 0,
    total: memos.length,
  };
  memos.forEach(function (memo) {
    if (memo.archived) {
      stats.archived += 1;
      return;
    }
    stats.active += 1;
    if (memo.pinned) stats.pinned += 1;
    if (memo.private) stats.secret += 1;
    const visibility = String(memo.visibility || "PRIVATE").toUpperCase();
    if (visibility === "PUBLIC") stats.public += 1;
    else if (visibility === "PROTECTED") stats.protected += 1;
    else stats.private += 1;
  });
  return stats;
}

export function createMemoInVault(content, visibility, projectId, isPrivate, meta) {
  meta = meta || {};
  if (typeof globalThis.invoke !== "function") {
    const now = new Date().toISOString();
    return Promise.resolve(Object.assign({
      archived: false,
      content,
      createdAt: now,
      id: createId(),
      pinned: false,
      private: Boolean(isPrivate),
      projectId: normalizeProjectID(projectId),
      updatedAt: "",
      visibility,
    }, meta));
  }
  return globalThis.invoke("/api/memos/create", {
    method: "POST",
    args: Object.assign({
      content,
      private: Boolean(isPrivate),
      projectId: normalizeProjectID(projectId),
      visibility,
    }, meta),
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.memo) {
      throw new Error((resp && resp.msg) || "发布失败");
    }
    return resp.data.memo;
  });
}

export function updateMemoInVault(id, patch) {
  if (typeof globalThis.invoke !== "function") {
    const memos = loadMemos();
    const index = memos.findIndex((memo) => memo && memo.id === id);
    const next = Object.assign({}, index >= 0 ? memos[index] : { id }, patch);
    if (index >= 0) {
      memos[index] = next;
      saveMemos(memos);
    }
    return Promise.resolve(next);
  }
  const args = { id };
  if (Object.prototype.hasOwnProperty.call(patch, "content")) args.content = patch.content;
  if (Object.prototype.hasOwnProperty.call(patch, "createdAt")) args.createdAt = patch.createdAt;
  if (Object.prototype.hasOwnProperty.call(patch, "projectId")) args.projectId = normalizeProjectID(patch.projectId);
  if (Object.prototype.hasOwnProperty.call(patch, "visibility")) args.visibility = patch.visibility;
  if (Object.prototype.hasOwnProperty.call(patch, "private")) args.private = Boolean(patch.private);
  if (Object.prototype.hasOwnProperty.call(patch, "pinned")) args.pinned = patch.pinned;
  if (Object.prototype.hasOwnProperty.call(patch, "archived")) args.archived = patch.archived;
  if (Object.prototype.hasOwnProperty.call(patch, "kind")) args.kind = patch.kind;
  if (Object.prototype.hasOwnProperty.call(patch, "taskId")) args.taskId = patch.taskId;
  if (Object.prototype.hasOwnProperty.call(patch, "updatedAt")) args.updatedAt = patch.updatedAt;
  if (Object.prototype.hasOwnProperty.call(patch, "alias")) args.alias = patch.alias;
  if (Object.prototype.hasOwnProperty.call(patch, "reactions")) args.reactions = patch.reactions;
  return globalThis.invoke("/api/memos/update", {
    method: "POST",
    args,
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.memo) {
      throw new Error((resp && resp.msg) || "保存失败");
    }
    return resp.data.memo;
  });
}

export function deleteMemoInVault(id, options) {
  if (typeof globalThis.invoke !== "function") {
    return Promise.resolve({ success: true });
  }
  const args = { id };
  if (options && Object.prototype.hasOwnProperty.call(options, "cleanupAssets")) {
    args.cleanupAssets = Boolean(options.cleanupAssets);
  }
  if (options && Object.prototype.hasOwnProperty.call(options, "deleteTasks")) {
    args.deleteTasks = Boolean(options.deleteTasks);
  }
  return globalThis.invoke("/api/memos/delete", {
    method: "POST",
    args,
  }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "删除失败");
    }
    return resp.data || { success: true };
  });
}

export function loadMemoHistoryFromVault(id) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ id: id, versions: [] });
  return globalThis.invoke("/api/memos/history?id=" + encodeURIComponent(id), { method: "GET" }).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取历史失败");
    }
    return resp.data || { id: id, versions: [] };
  });
}

export function loadMemoHistoryVersionFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ content: "", version: 0, versions: [] });
  return globalThis.invoke(
    "/api/memos/history/version?id=" + encodeURIComponent(id) + "&version=" + encodeURIComponent(String(version)),
    { method: "GET" }
  ).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取历史版本失败");
    }
    return resp.data || { content: "", version: 0, versions: [] };
  });
}

export function restoreMemoHistoryVersionFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve(null);
  return globalThis.invoke("/api/memos/history/restore", {
    method: "POST",
    args: { id: id, version: version },
  }).then(function (resp) {
    if (!resp || resp.code !== 0 || !resp.data || !resp.data.memo) {
      throw new Error((resp && resp.msg) || "回退失败");
    }
    return resp.data.memo;
  });
}

export function loadMemoHistoryDiffFromVault(id, version) {
  if (typeof globalThis.invoke !== "function") return Promise.resolve({ diff: "", version: version || 0 });
  return globalThis.invoke(
    "/api/memos/history/diff?id=" + encodeURIComponent(id) + "&version=" + encodeURIComponent(String(version)),
    { method: "GET" }
  ).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "读取差异失败");
    }
    return resp.data || { diff: "", version: version || 0 };
  });
}

export function loadMemoFromLocal(memoId) {
  const saved = loadJSON(MEMOS_STORAGE_KEY, []);
  const memos = Array.isArray(saved) ? saved : [];
  return {
    memo: memos.find((item) => item && item.id === memoId) || null,
    memos,
  };
}

export function errorMessage(err) {
  return err && err.message ? err.message : String(err || "unknown error");
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function seedMemos() {
  const now = Date.now();
  return [
    normalizeMemoPayload({
      archived: false,
      content: "把 #velo 的桌面示例做成 memo 工作台。\n- [x] 左侧过滤\n- [ ] ProseMirror mini editor\n\n本地优先，适合快速捕捉。",
      createdAt: new Date(now - 1000 * 60 * 35).toISOString(),
      id: createId(),
      pinned: true,
      updatedAt: "",
      visibility: DEFAULT_VISIBILITY,
    }),
    normalizeMemoPayload({
      archived: false,
      content: "#idea Memos 风格的首页应该先看到编辑器，再看到时间线。\n\n支持 #inbox、置顶、归档和全文搜索。",
      createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
      id: createId(),
      pinned: false,
      updatedAt: "",
      visibility: "PROTECTED",
    }),
    normalizeMemoPayload({
      archived: false,
      content: "发布前检查：\n1. mini editor 可输入\n2. 标签可筛选\n3. 任务可以勾选\n\n[usememos](https://github.com/usememos/memos)",
      createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      id: createId(),
      pinned: false,
      updatedAt: "",
      visibility: "PUBLIC",
    }),
  ].filter(Boolean);
}

export function createId() {
  return `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
