(function install_frontend_logger(global) {
  "use strict";

  if (global.FrontendLogger) {
    global.Logger = global.FrontendLogger;
    return;
  }

  const REPORT_URL = "/report";
  const QUEUE_CAPACITY = 256;
  const REPORT_BATCH_SIZE = 32;
  const FLUSH_INTERVAL_MS = 1500;
  const MAX_VALUE_DEPTH = 6;
  const MAX_COLLECTION_SIZE = 80;
  const MAX_STRING_LENGTH = 16000;
  const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);
  const SECRET_FIELD_PATTERN = /(?:authorization|cookie|credential|password|private[_-]?key|secret|token)/i;
  const CONTENT_FIELD_NAMES = new Set([
    "body",
    "content",
    "draft",
    "html",
    "markdown",
    "notes",
    "text",
  ]);

  function truncate_string(value) {
    const text = String(value);
    if (text.length <= MAX_STRING_LENGTH) {
      return text;
    }
    return `${text.slice(0, MAX_STRING_LENGTH)}…`;
  }

  function error_fields(error) {
    if (error instanceof Error || (error && typeof error === "object")) {
      return {
        error: truncate_string(error.message || String(error)),
        errorName: truncate_string(error.name || "Error"),
        stack: error.stack ? truncate_string(error.stack) : undefined,
      };
    }
    return { error: truncate_string(error) };
  }

  function redacted_field_value(key, value) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      return "[Redacted]";
    }
    const normalized_key = String(key)
      .replace(/([a-z\d])([A-Z])/g, "$1_$2")
      .toLowerCase();
    const field_name = normalized_key.split(/[_-]/).pop();
    if (CONTENT_FIELD_NAMES.has(field_name)) {
      let length = 0;
      try {
        length = typeof value === "string"
          ? value.length
          : JSON.stringify(value).length;
      } catch (_) {}
      return `[Content length=${length}]`;
    }
    return null;
  }

  function sanitize_value(value, depth, seen) {
    if (value === null || value === undefined) {
      return value === undefined ? null : value;
    }
    if (typeof value === "string") {
      return truncate_string(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return Number.isFinite(value) || typeof value === "boolean"
        ? value
        : String(value);
    }
    if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
      return truncate_string(String(value));
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Error) {
      return error_fields(value);
    }
    if (depth >= MAX_VALUE_DEPTH) {
      return "[MaxDepth]";
    }
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    let sanitized;
    if (Array.isArray(value)) {
      sanitized = value
        .slice(0, MAX_COLLECTION_SIZE)
        .map((item) => sanitize_value(item, depth + 1, seen));
      if (value.length > MAX_COLLECTION_SIZE) {
        sanitized.push(`[${value.length - MAX_COLLECTION_SIZE} more items]`);
      }
    } else {
      sanitized = {};
      const keys = Object.keys(value).slice(0, MAX_COLLECTION_SIZE);
      for (const key of keys) {
        try {
          const redacted = redacted_field_value(key, value[key]);
          sanitized[key] = redacted === null
            ? sanitize_value(value[key], depth + 1, seen)
            : redacted;
        } catch (error) {
          sanitized[key] = `[Unserializable: ${error && error.message ? error.message : String(error)}]`;
        }
      }
      if (Object.keys(value).length > MAX_COLLECTION_SIZE) {
        sanitized.__truncatedKeys = Object.keys(value).length - MAX_COLLECTION_SIZE;
      }
    }
    seen.delete(value);
    return sanitized;
  }

  function sanitize_fields(fields) {
    if (!fields || typeof fields !== "object") {
      return {};
    }
    const sanitized = sanitize_value(fields, 0, new WeakSet());
    return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? sanitized
      : { value: sanitized };
  }

  function create_session_id() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return `frontend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function redact_url(value) {
    return truncate_string(value).replace(
      /([?&](?:authorization|cookie|credential|password|private[_-]?key|secret|token)=)[^&#]*/gi,
      "$1[Redacted]",
    );
  }

  function send_report(entries, unloading) {
    const payload = {
      component: "frontend",
      entries,
    };

    if (unloading && global.navigator && typeof global.navigator.sendBeacon === "function") {
      try {
        if (global.navigator.sendBeacon(REPORT_URL, JSON.stringify(payload))) {
          return Promise.resolve();
        }
      } catch (_) {
        // Fall through to the keepalive request.
      }
    }

    if (!unloading && typeof global.invoke === "function") {
      try {
        return Promise.resolve(global.invoke(REPORT_URL, {
          method: "POST",
          args: payload,
        })).then(() => undefined);
      } catch (error) {
        return Promise.reject(error);
      }
    }

    if (typeof global.fetch === "function") {
      try {
        return Promise.resolve(global.fetch(REPORT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: Boolean(unloading),
        })).then((response) => {
          if (!response.ok) {
            throw new Error(`frontend log report failed with status ${response.status}`);
          }
        });
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return Promise.reject(new Error("no frontend log transport is available"));
  }

  class LogTransport {
    constructor() {
      this.queue = [];
      this.flush_timer = null;
      this.flush_promise = null;
    }

    enqueue(entry) {
      if (this.queue.length >= QUEUE_CAPACITY) {
        this.queue.shift();
      }
      this.queue.push(entry);
      if (this.queue.length >= REPORT_BATCH_SIZE) {
        void this.flush_now();
        return;
      }
      this.schedule_flush();
    }

    schedule_flush() {
      if (this.flush_timer !== null) {
        return;
      }
      this.flush_timer = global.setTimeout(() => {
        this.flush_timer = null;
        void this.flush_now();
      }, FLUSH_INTERVAL_MS);
    }

    clear_flush_timer() {
      if (this.flush_timer === null) {
        return;
      }
      global.clearTimeout(this.flush_timer);
      this.flush_timer = null;
    }

    flush_now(options) {
      const unloading = Boolean(options && options.unloading);
      this.clear_flush_timer();

      if (this.flush_promise) {
        return this.flush_promise.then(() => this.flush_now(options));
      }
      if (this.queue.length === 0) {
        return Promise.resolve();
      }

      const entries = this.queue.splice(0, REPORT_BATCH_SIZE);
      this.flush_promise = send_report(entries, unloading)
        .catch((error) => {
          if (!unloading) {
            this.queue.unshift(...entries);
            if (this.queue.length > QUEUE_CAPACITY) {
              this.queue.length = QUEUE_CAPACITY;
            }
          }
          throw error;
        })
        .finally(() => {
          this.flush_promise = null;
        });

      return this.flush_promise
        .then(() => {
          if (this.queue.length > 0) {
            return this.flush_now(options);
          }
          return undefined;
        })
        .catch(() => {
          if (this.queue.length > 0 && !unloading) {
            this.schedule_flush();
          }
        });
    }
  }

  class LogBuilder {
    constructor(model, level, error) {
      this.model = model;
      this.level = level;
      this.fields = error === undefined ? {} : error_fields(error);
    }

    Str(key, value) {
      this.fields[key] = truncate_string(value);
      return this;
    }

    Err(error) {
      Object.assign(this.fields, error_fields(error));
      return this;
    }

    Object(key, value) {
      let parsed_value = value;
      if (typeof value === "string") {
        try {
          parsed_value = JSON.parse(value);
        } catch (_) {
          // Preserve non-JSON strings.
        }
      }
      this.fields[key] = sanitize_value(parsed_value, 0, new WeakSet());
      return this;
    }

    Obj(key, value) {
      return this.Object(key, value);
    }

    Dict(key, value) {
      return this.Object(key, value);
    }

    Interface(key, value) {
      this.fields[key] = sanitize_value(value, 0, new WeakSet());
      return this;
    }

    JSON(key, value) {
      return this.Object(key, value);
    }

    RawJSON(key, value) {
      return this.Object(key, value);
    }

    Int(key, value) {
      this.fields[key] = Number(value);
      return this;
    }

    Float(key, value) {
      this.fields[key] = Number(value);
      return this;
    }

    Bool(key, value) {
      this.fields[key] = Boolean(value);
      return this;
    }

    Msg(message) {
      this.model.write(this.level, message, this.fields);
    }
  }

  class LoggerModel {
    constructor() {
      this.sequence = 0;
      this.session_id = create_session_id();
      this.transport = new LogTransport();
    }

    write(level, message, fields) {
      const normalized_level = VALID_LEVELS.has(level) ? level : "info";
      const pathname = global.location && global.location.pathname
        ? global.location.pathname
        : "unknown";
      const window_name = global.document && global.document.title
        ? global.document.title
        : "unknown";
      const entry = {
        ...sanitize_fields(fields),
        level: normalized_level,
        message: truncate_string(message),
        timestamp: new Date().toISOString(),
        sequence: ++this.sequence,
        sessionId: this.session_id,
        pathname,
        windowName: window_name,
      };
      this.transport.enqueue(entry);
    }

    builder(level, error) {
      return new LogBuilder(this, level, error);
    }

    flush_now(options) {
      return this.transport.flush_now(options);
    }
  }

  const model = new LoggerModel();

  function direct_log(level, message, fields) {
    model.write(level, message, fields);
  }

  const logger = Object.freeze({
    Debug: () => model.builder("debug"),
    Info: () => model.builder("info"),
    Warn: () => model.builder("warn"),
    Error: (error) => model.builder("error", error),
    debug: (message, fields) => direct_log("debug", message, fields),
    info: (message, fields) => direct_log("info", message, fields),
    warn: (message, fields) => direct_log("warn", message, fields),
    error: (message, fields) => direct_log("error", message, fields),
    log: (entry) => {
      const safe_entry = entry && typeof entry === "object" ? entry : {};
      const { level, message, ...fields } = safe_entry;
      direct_log(VALID_LEVELS.has(level) ? level : "info", message || "frontend log", fields);
    },
    flushNow: (options) => model.flush_now(options),
  });

  global.FrontendLogger = logger;
  global.Logger = logger;

  function semantic_element(element) {
    let current = element && element.nodeType === 3
      ? element.parentElement || element.parentNode
      : element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current.nodeType === 1) {
        const semantic_name = current.getAttribute?.("data-n") ||
          current.getAttribute?.("n");
        if (semantic_name) return current;
      }
      current = current.parentElement || current.parentNode;
    }
    return element && element.nodeType === 1 ? element : null;
  }

  function event_fields(event) {
    const element = semantic_element(event.target);
    const owner = element?.closest?.(
      "[data-memo-id], [data-comment-id], [data-task-id], [data-project-id]",
    );
    const dataset = element?.dataset || {};
    const owner_dataset = owner?.dataset || {};
    const fields = {
      eventType: event.type,
      targetTag: String(element?.tagName || "").toLowerCase(),
      targetName: element?.getAttribute?.("data-n") ||
        element?.getAttribute?.("n") ||
        "",
      action: dataset.action || "",
      view: dataset.view || "",
      memoId: dataset.memoId || owner_dataset.memoId || "",
      commentId: dataset.commentId || owner_dataset.commentId || "",
      taskId: dataset.taskId || owner_dataset.taskId || "",
      projectId: dataset.projectId || owner_dataset.projectId || "",
    };
    if (event.type === "keydown") {
      fields.key = event.key || "";
      fields.altKey = Boolean(event.altKey);
      fields.ctrlKey = Boolean(event.ctrlKey);
      fields.metaKey = Boolean(event.metaKey);
      fields.shiftKey = Boolean(event.shiftKey);
    }
    if (event.type === "change") {
      fields.checked = typeof element?.checked === "boolean"
        ? element.checked
        : undefined;
      fields.valueLength = typeof element?.value === "string"
        ? element.value.length
        : 0;
    }
    return fields;
  }

  function install_event_diagnostics() {
    const document = global.document;
    if (!document || typeof document.addEventListener !== "function") return;
    ["click", "change", "submit"].forEach((event_name) => {
      document.addEventListener(event_name, (event) => {
        logger.info("frontend UI event", event_fields(event));
      }, true);
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" ||
        event.key === "Escape" ||
        event.key === "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        logger.info("frontend keyboard event", event_fields(event));
      }
    }, true);
  }

  function install_invoke_diagnostics() {
    const original_invoke = global.invoke;
    if (typeof original_invoke !== "function" || original_invoke.__threadnote_logged) {
      return;
    }
    let request_sequence = 0;
    const logged_invoke = function (url, options) {
      const request_url = String(url || "");
      if (request_url === REPORT_URL || request_url.startsWith("/api/logs")) {
        return original_invoke.call(this, url, options);
      }
      const request_id = `${model.session_id}:${++request_sequence}`;
      const started_at = Date.now();
      const request_options = options || {};
      logger.info("frontend backend request started", {
        requestId: request_id,
        method: String(request_options.method || "GET").toUpperCase(),
        url: redact_url(request_url),
        args: request_options.args,
      });
      let result;
      try {
        result = original_invoke.call(this, url, options);
      } catch (error) {
        logger.error("frontend backend request failed", {
          requestId: request_id,
          method: String(request_options.method || "GET").toUpperCase(),
          url: redact_url(request_url),
          durationMs: Date.now() - started_at,
          ...error_fields(error),
        });
        throw error;
      }
      return Promise.resolve(result).then(
        (response) => {
          logger.info("frontend backend request completed", {
            requestId: request_id,
            method: String(request_options.method || "GET").toUpperCase(),
            url: redact_url(request_url),
            durationMs: Date.now() - started_at,
            response,
          });
          return response;
        },
        (error) => {
          logger.error("frontend backend request failed", {
            requestId: request_id,
            method: String(request_options.method || "GET").toUpperCase(),
            url: redact_url(request_url),
            durationMs: Date.now() - started_at,
            ...error_fields(error),
          });
          throw error;
        },
      );
    };
    logged_invoke.__threadnote_logged = true;
    global.invoke = logged_invoke;
  }

  install_event_diagnostics();
  install_invoke_diagnostics();
  if (typeof global.invoke !== "function") {
    global.addEventListener("DOMContentLoaded", install_invoke_diagnostics, {
      once: true,
    });
  }

  global.addEventListener("error", (event) => {
    const builder = logger.Error(event.error)
      .Str("source", event.filename || "unknown")
      .Int("line", event.lineno || 0)
      .Int("column", event.colno || 0);
    builder.Msg(event.message || "uncaught frontend error");
  });

  global.addEventListener("unhandledrejection", (event) => {
    logger.Error(event.reason).Msg("unhandled promise rejection");
  });

  global.addEventListener("pagehide", () => {
    void logger.flushNow({ unloading: true });
  });

  global.addEventListener("beforeunload", () => {
    void logger.flushNow({ unloading: true });
  });

  logger.Info().Msg("frontend logger initialized");
})(window);
