import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const logger_source = readFileSync(
  new URL("../public/logger.js", import.meta.url),
  "utf8",
);

function create_logger_harness() {
  const listeners = new Map();
  const reports = [];
  let next_timer_id = 0;
  const timers = new Map();
  const context = {
    Promise,
    Date,
    Error,
    Math,
    JSON,
    Set,
    WeakSet,
    Number,
    Object,
    Array,
    String,
    Boolean,
    console: { debug() {}, info() {}, warn() {}, error() {} },
    crypto: { randomUUID: () => "test-session" },
    document: { title: "ThreadNote Test" },
    location: { pathname: "/home/index" },
    navigator: { sendBeacon: () => false },
    fetch: async () => ({ ok: true, status: 200 }),
    invoke: async (url, options) => {
      reports.push({ url, options });
      return { code: 0 };
    },
    addEventListener: (name, listener) => {
      listeners.set(name, listener);
    },
    setTimeout: (callback) => {
      const timer_id = ++next_timer_id;
      timers.set(timer_id, callback);
      return timer_id;
    },
    clearTimeout: (timer_id) => {
      timers.delete(timer_id);
    },
  };
  context.window = context;
  vm.runInNewContext(logger_source, context, { filename: "logger.js" });
  return { context, listeners, reports };
}

test("Logger batches fluent structured logs through /report", async () => {
  const { context, reports } = create_logger_harness();

  context.Logger.Warn()
    .Str("projectId", "project-1")
    .Int("memoCount", 3)
    .Object("selection", `{"active":true}`)
    .Msg("project selected");
  await context.Logger.flushNow();

  assert.equal(reports.length, 1);
  assert.equal(context.FrontendLogger, context.Logger);
  assert.equal(reports[0].url, "/report");
  assert.equal(reports[0].options.method, "POST");
  const entries = reports[0].options.args.entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[1].level, "warn");
  assert.equal(entries[1].message, "project selected");
  assert.equal(entries[1].projectId, "project-1");
  assert.equal(entries[1].memoCount, 3);
  assert.equal(entries[1].selection.active, true);
  assert.equal(entries[1].sessionId, "test-session");
  assert.equal(entries[1].pathname, "/home/index");
});

test("Logger captures uncaught errors without changing browser handling", async () => {
  const { context, listeners, reports } = create_logger_harness();
  const error = new Error("menu positioning failed");

  listeners.get("error")({
    error,
    message: error.message,
    filename: "project-select.js",
    lineno: 81,
    colno: 12,
  });
  await context.Logger.flushNow();

  const entries = reports[0].options.args.entries;
  const captured = entries.find((entry) => entry.message === error.message);
  assert.ok(captured);
  assert.equal(captured.level, "error");
  assert.equal(captured.source, "project-select.js");
  assert.equal(captured.line, 81);
  assert.match(captured.stack, /menu positioning failed/);
});

test("Logger uses sendBeacon while a window is unloading", async () => {
  const { context, listeners } = create_logger_harness();
  const beacons = [];
  context.navigator.sendBeacon = (url, body) => {
    beacons.push({ url, body: JSON.parse(body) });
    return true;
  };

  context.Logger.info("window closing", { windowId: "memo-1" });
  listeners.get("pagehide")();
  await Promise.resolve();

  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, "/report");
  assert.equal(beacons[0].body.entries.at(-1).message, "window closing");
});
