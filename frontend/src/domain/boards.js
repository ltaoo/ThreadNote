import { callNativeAPI } from "./native.js";

export function normalizeBoardColumn(col) {
  if (!col || typeof col !== "object") return null;
  const id = String(col.id || "").trim();
  const label = String(col.label || "").trim();
  if (!id || !label) return null;
  return {
    id,
    label,
    order: Number.isFinite(Number(col.order)) ? Number(col.order) : 0,
  };
}

export function normalizeBoard(board) {
  if (!board || typeof board !== "object") return null;
  const id = String(board.id || "").trim();
  const title = String(board.title || "").trim();
  if (!id || !title) return null;
  return {
    columns: Array.isArray(board.columns)
      ? board.columns.map(normalizeBoardColumn).filter(Boolean).sort(function (a, b) { return a.order - b.order; })
      : [],
    createdAt: board.createdAt || new Date().toISOString(),
    id,
    projectId: String(board.projectId || ""),
    rules: Array.isArray(board.rules) ? board.rules : [],
    title,
    updatedAt: board.updatedAt || "",
  };
}

export function normalizeBoardPreset(preset) {
  if (!preset || typeof preset !== "object") return null;
  const title = String(preset.title || "").trim();
  if (!title) return null;
  return {
    columns: Array.isArray(preset.columns)
      ? preset.columns.map(normalizeBoardColumn).filter(Boolean).sort(function (a, b) { return a.order - b.order; })
      : [],
    rules: Array.isArray(preset.rules) ? preset.rules : [],
    title,
  };
}

export function loadBoards() {
  return callNativeAPI("/api/boards", { method: "GET" }).then(function (data) {
    return Array.isArray(data.boards) ? data.boards.map(normalizeBoard).filter(Boolean) : [];
  });
}

export function loadBoardPresets() {
  return callNativeAPI("/api/boards/presets", { method: "GET" }).then(function (data) {
    return Array.isArray(data.presets) ? data.presets.map(normalizeBoardPreset).filter(Boolean) : [];
  });
}

export function createBoard(input) {
  return callNativeAPI("/api/boards/create", {
    method: "POST",
    args: input && typeof input === "object" ? input : {},
  }).then(function (data) {
    const board = normalizeBoard(data.board);
    if (!board) throw new Error("create board failed");
    return board;
  });
}

export function updateBoard(id, patch) {
  const boardId = String(id || "").trim();
  if (!boardId) return Promise.reject(new Error("board id is required"));
  return callNativeAPI("/api/boards/update", {
    method: "POST",
    args: Object.assign({}, patch || {}, { id: boardId }),
  }).then(function (data) {
    const board = normalizeBoard(data.board);
    if (!board) throw new Error("update board failed");
    return board;
  });
}

export function deleteBoard(id) {
  const boardId = String(id || "").trim();
  if (!boardId) return Promise.reject(new Error("board id is required"));
  return callNativeAPI("/api/boards/delete", {
    method: "POST",
    args: { id: boardId },
  });
}

export function refreshBoard(id) {
  const boardId = String(id || "").trim();
  if (!boardId) return Promise.reject(new Error("board id is required"));
  return callNativeAPI("/api/boards/refresh", {
    method: "POST",
    args: { id: boardId },
  }).then(function (data) {
    return (data && data.updated) || 0;
  });
}
