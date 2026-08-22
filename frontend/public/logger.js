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
          sanitized[key] = sanitize_value(value[key], depth + 1, seen);
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
