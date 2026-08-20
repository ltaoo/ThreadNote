const PROJECT_COLLECTIONS = new Set(["memos", "tasks"]);

function normalizePageSize(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProjectId(value) {
  return String(value || "").trim();
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function memoMatchesQuery(memo, query) {
  if (!query) return true;
  return String(memo && memo.content || "").toLowerCase().includes(query)
    || String(memo && memo.title || "").toLowerCase().includes(query);
}

function pageSnapshot(items, total, limit) {
  const visibleItems = items.slice(0, limit);
  return Object.freeze({
    hasMore: visibleItems.length < total,
    items: visibleItems,
    total,
  });
}

export class ProjectDetailPaginationModel {
  constructor(options = {}) {
    this._pageSizes = Object.freeze({
      memos: normalizePageSize(options.memoPageSize, 10),
      tasks: normalizePageSize(options.taskPageSize, 10),
    });
    this._projectId = "";
    this._query = "";
    this._limits = { ...this._pageSizes };
    this._totals = { memos: 0, tasks: 0 };
  }

  select(options = {}) {
    const projectId = normalizeProjectId(options.projectId);
    const query = normalizeQuery(options.query);
    this._syncContext(projectId, query);

    const memos = (Array.isArray(options.memos) ? options.memos : []).filter(function (memo) {
      return memo
        && !memo.archived
        && normalizeProjectId(memo.projectId) === projectId
        && memoMatchesQuery(memo, query);
    });
    const tasks = (Array.isArray(options.tasks) ? options.tasks : [])
      .filter(function (task) {
        return task && normalizeProjectId(task.projectId) === projectId;
      })
      .sort(function (left, right) {
        return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
      });

    this._totals = { memos: memos.length, tasks: tasks.length };
    return Object.freeze({
      allTasks: Object.freeze(tasks),
      memos: pageSnapshot(memos, memos.length, this._limits.memos),
      tasks: pageSnapshot(tasks, tasks.length, this._limits.tasks),
    });
  }

  loadNext(collection) {
    const name = String(collection || "");
    if (!PROJECT_COLLECTIONS.has(name)) return false;
    const currentLimit = this._limits[name];
    const total = this._totals[name];
    if (currentLimit >= total) return false;
    this._limits[name] = Math.min(total, currentLimit + this._pageSizes[name]);
    return true;
  }

  _syncContext(projectId, query) {
    if (projectId !== this._projectId) {
      this._projectId = projectId;
      this._query = query;
      this._limits = { ...this._pageSizes };
      return;
    }
    if (query !== this._query) {
      this._query = query;
      this._limits.memos = this._pageSizes.memos;
    }
  }
}
