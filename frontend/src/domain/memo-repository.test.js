import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMemoFromVault,
  loadMemoPageFromVault,
  loadMemoStatsFromVault,
} from "./memo-repository.js";

test("memo repository exposes storage-independent page, stats, and detail APIs", async function (t) {
  const original_invoke = globalThis.invoke;
  const calls = [];
  t.after(function () {
    if (original_invoke === undefined) delete globalThis.invoke;
    else globalThis.invoke = original_invoke;
  });
  globalThis.invoke = async function (url, options) {
    calls.push({ options, url });
    if (url.startsWith("/api/memos?")) {
      return {
        code: 0,
        data: {
          hasMore: true,
          memos: [{ content: "one", id: "memo-1" }],
          nextCursor: "next-page",
          total: 3,
        },
      };
    }
    if (url === "/api/memos/stats") {
      return { code: 0, data: { stats: { active: 2, total: 3 } } };
    }
    if (url === "/api/memos/get?id=memo-1") {
      return { code: 0, data: { memo: { content: "one", id: "memo-1" } } };
    }
    throw new Error("unexpected URL: " + url);
  };

  const page = await loadMemoPageFromVault({
    archived: false,
    limit: 20,
    tag: "work",
  });
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, "next-page");
  assert.equal(page.total, 3);
  assert.deepEqual(page.memos.map(function (memo) { return memo.id; }), [
    "memo-1",
  ]);
  assert.match(calls[0].url, /^\/api\/memos\?/);
  assert.match(calls[0].url, /limit=20/);
  assert.match(calls[0].url, /archived=false/);
  assert.match(calls[0].url, /tag=work/);

  assert.deepEqual(await loadMemoStatsFromVault(), { active: 2, total: 3 });
  assert.equal((await loadMemoFromVault("memo-1")).id, "memo-1");
  assert.deepEqual(
    calls.map(function (call) { return call.options.method; }),
    ["GET", "GET", "GET"],
  );
});

test("memo repository records request failures in the frontend log", async function (t) {
  const original_invoke = globalThis.invoke;
  const original_logger = globalThis.FrontendLogger;
  const log_entries = [];
  t.after(function () {
    if (original_invoke === undefined) delete globalThis.invoke;
    else globalThis.invoke = original_invoke;
    if (original_logger === undefined) delete globalThis.FrontendLogger;
    else globalThis.FrontendLogger = original_logger;
  });
  globalThis.invoke = async function () {
    return { code: 1, msg: "duplicate memo id" };
  };
  globalThis.FrontendLogger = {
    Error(error) {
      const entry = { error, fields: {}, message: "" };
      log_entries.push(entry);
      return {
        Msg(message) {
          entry.message = message;
        },
        Str(name, value) {
          entry.fields[name] = value;
          return this;
        },
      };
    },
  };

  await assert.rejects(loadMemoPageFromVault(), /duplicate memo id/);
  assert.equal(log_entries.length, 1);
  assert.equal(log_entries[0].fields.component, "memo_repository");
  assert.equal(log_entries[0].fields.operation, "page");
  assert.equal(log_entries[0].message, "memo repository request failed");
});
