function resource_query_string(options = {}) {
  const params = [];
  if (options.type) params.push("type=" + encodeURIComponent(options.type));
  if (options.projectId) {
    params.push("projectId=" + encodeURIComponent(options.projectId));
  } else if (options.projectScope) {
    params.push("projectScope=" + encodeURIComponent(options.projectScope));
  }
  if (options.q) params.push("q=" + encodeURIComponent(options.q));
  if (options.marked) params.push("marked=1");
  if (options.language) {
    params.push("language=" + encodeURIComponent(options.language));
  }
  if (options.cursor) {
    params.push("cursor=" + encodeURIComponent(options.cursor));
  }
  if (options.limit) params.push("limit=" + encodeURIComponent(options.limit));
  return params.length ? "?" + params.join("&") : "";
}

function normalize_resource_page(payload) {
  const page = payload?.page || {};
  return {
    codeBlocks: Array.isArray(page.codeBlocks) ? page.codeBlocks : [],
    hasMore: Boolean(page.hasMore),
    items: Array.isArray(page.references) ? page.references : [],
    nextCursor: String(page.nextCursor || ""),
    total: Math.max(0, Number(page.total) || 0),
  };
}

function invoke_resource_page(path, options) {
  if (typeof globalThis.invoke !== "function") {
    return Promise.reject(new Error("native bridge unavailable"));
  }
  return globalThis
    .invoke(path + resource_query_string(options), { method: "GET" })
    .then(function (resp) {
      if (!resp || resp.code !== 0 || !resp.data) {
        throw new Error((resp && resp.msg) || "读取资源索引失败");
      }
      return normalize_resource_page(resp.data);
    });
}

export function loadMemoReferencePage(options = {}) {
  return invoke_resource_page("/api/memos/references", options);
}

export function loadCodeBlockPage(options = {}) {
  return invoke_resource_page("/api/memos/code-blocks", options);
}
