import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCodeBlockPage,
  loadMemoReferencePage,
} from "./memo-resource-repository.js";
import { createMemoResourceFeed } from "./memo-resource-feed.js";

test("resource repository pages references and code blocks from the index", async function (t) {
  const original_invoke = globalThis.invoke;
  const calls = [];
  t.after(function () {
    if (original_invoke === undefined) delete globalThis.invoke;
    else globalThis.invoke = original_invoke;
  });
  globalThis.invoke = async function (url, options) {
    calls.push({ options, url });
    if (url.startsWith("/api/memos/references")) {
      return {
        code: 0,
        data: {
          page: {
            hasMore: true,
            nextCursor: "cursor-1",
            references: [{ id: "r1", type: "image", url: "a.png" }],
            total: 5,
          },
        },
      };
    }
    if (url.startsWith("/api/memos/code-blocks")) {
      return {
        code: 0,
        data: {
          page: {
            codeBlocks: [{ id: "c1", code: "let x = 1;", marked: true }],
            hasMore: false,
            nextCursor: "",
            total: 1,
          },
        },
      };
    }
    throw new Error("unexpected url " + url);
  };

  const page = await loadMemoReferencePage({
    projectId: "project-1",
    q: "截图",
    type: "image",
  });
  assert.equal(page.total, 5);
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, "cursor-1");
  assert.match(calls[0].url, /type=image/);
  assert.match(calls[0].url, /projectId=project-1/);
  assert.match(calls[0].url, /q=%E6%88%AA%E5%9B%BE/);

  const blocks = await loadCodeBlockPage({ marked: true });
  assert.equal(blocks.codeBlocks.length, 1);
  assert.equal(blocks.codeBlocks[0].marked, true);
  assert.equal(blocks.hasMore, false);
});

test("resource feed reloads on signature change and appends pages", async function () {
  const pages = [
    {
      codeBlocks: [],
      hasMore: true,
      items: [{ id: "r1" }],
      nextCursor: "c2",
      references: [{ id: "r1" }],
      total: 2,
    },
    {
      codeBlocks: [],
      hasMore: false,
      items: [{ id: "r2" }],
      nextCursor: "",
      references: [{ id: "r2" }],
      total: 2,
    },
  ];
  let call_index = 0;
  const fetch_page = async function (query) {
    const page = pages[Math.min(call_index, pages.length - 1)];
    call_index += 1;
    return { ...page, items: page.items, cursorQuery: query.cursor || "" };
  };
  const feed = createMemoResourceFeed(fetch_page);

  await new Promise(function (resolve) {
    feed.ensure("sig-1", { type: "image" }, resolve);
  });
  assert.equal(feed.ready, true);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.hasMore, true);

  await new Promise(function (resolve) {
    assert.equal(feed.loadMore(resolve), true);
  });
  assert.equal(feed.items.length, 2);
  assert.equal(feed.hasMore, false);

  await new Promise(function (resolve) {
    feed.ensure("sig-2", { type: "file" }, resolve);
  });
  assert.equal(feed.items.length, 1);
  assert.equal(feed.total, 2);

  feed.invalidate();
  assert.equal(feed.ready, false);
  assert.equal(feed.items.length, 0);
});
