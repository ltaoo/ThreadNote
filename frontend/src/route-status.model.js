function normalize_error(error) {
  if (error instanceof Error) return error;
  if (error && typeof error === "object") {
    const message = error.message || error.reason || JSON.stringify(error);
    return new Error(String(message || "未知渲染错误"));
  }
  return new Error(String(error || "未知渲染错误"));
}

export function createRouteErrorPresentation(error, view_name) {
  const normalized_error = normalize_error(error);
  return Object.freeze({
    context: String(view_name || "未知页面"),
    message: String(
      normalized_error.message || "页面渲染过程中发生未知错误",
    ),
    name: String(normalized_error.name || "Error"),
    stack: String(normalized_error.stack || "").trim(),
  });
}
