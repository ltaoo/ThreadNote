export function logMemoPagination(level, event, details = {}, error) {
  const logger = globalThis.FrontendLogger || globalThis.Logger;
  if (!logger) return;
  const normalized_level = ["debug", "info", "warn", "error"].includes(level)
    ? level
    : "info";
  const fields = {
    details,
    paginationEvent: String(event || "unknown"),
    scope: "memo_pagination",
  };
  if (error) {
    fields.error = String(error?.message || error);
    fields.stack = String(error?.stack || "");
  }
  try {
    if (typeof logger[normalized_level] === "function") {
      logger[normalized_level](`memo pagination: ${event}`, fields);
      return;
    }
    const builder_name =
      normalized_level.charAt(0).toUpperCase() + normalized_level.slice(1);
    const builder = logger[builder_name]?.(error);
    builder
      ?.Str("scope", "memo_pagination")
      .Str("paginationEvent", String(event || "unknown"))
      .Object("details", details)
      .Msg(`memo pagination: ${event}`);
  } catch (_log_error) {
    // Diagnostics must not alter pagination behavior.
  }
}
