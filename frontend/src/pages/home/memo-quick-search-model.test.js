import assert from "node:assert/strict";
import test from "node:test";

import {
  MEMO_QUICK_SEARCH_DEBOUNCE_MS,
  MemoQuickSearchModel,
  highlightPartsFromMarkup,
  hitToResult,
  readMemoQuickSearchOpenContext,
  writeMemoQuickSearchOpenContext,
} from "./memo-quick-search-model.js";

const project = { id: "project-1", name: "Desktop" };

const memo_hit = {
  archived: false,
  commentId: "",
  createdAt: "2026-08-10T10:00:00Z",
  id: "memo:memo-1",
  kind: "memo",
  memoId: "memo-1",
  pinned: false,
  projectId: "project-1",
  score: 2.5,
  snippetHTML: "prefix <mark>launch</mark> package",
  sourceCommentId: "",
  sourceType: "",
  text: "",
  title: "Roadmap and launch notes",
  titleHTML: "Roadmap and <mark>launch</mark> notes",
  todoId: "",
  updatedAt: "2026-08-11T10:00:00Z",
};

const comment_hit = {
  archived: false,
  commentId: "comment-2",
  createdAt: "2026-08-10T12:00:00Z",
  id: "comment:comment-2",
  kind: "comment",
  memoId: "memo-1",
  projectId: "project-1",
  score: 1.5,
  snippetHTML: "<mark>launch</mark> reply with details",
  title: "Roadmap and launch notes",
  titleHTML: "Roadmap and <mark>launch</mark> notes",
  updatedAt: "2026-08-10T12:00:00Z",
};

const todo_hit = {
  archived: false,
  checked: false,
  createdAt: "2026-08-10T10:00:00Z",
  id: "todo:memo:memo-1:1",
  kind: "todo",
  lineIndex: 1,
  memoId: "memo-1",
  projectId: "project-1",
  score: 3,
  sourceCommentId: "",
  sourceText: "Roadmap and launch notes",
  sourceType: "memo",
  text: "Verify launch package",
  title: "Roadmap and launch notes",
  todoId: "memo:memo-1:1",
  updatedAt: "2026-08-11T10:00:00Z",
};

const comment_todo_hit = {
  ...todo_hit,
  id: "todo:comment:comment-5:0",
  lineIndex: 0,
  sourceCommentId: "comment-5",
  sourceType: "comment",
  text: "Confirm launch time",
  todoId: "comment:comment-5:0",
};

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function withInvoke(handler, run) {
  const original = globalThis.invoke;
  globalThis.invoke = handler;
  try {
    return await run();
  } finally {
    if (original === undefined) delete globalThis.invoke;
    else globalThis.invoke = original;
  }
}

function servingHits(hits) {
  return function (url) {
    assert.match(url, /^\/api\/search\?q=/);
    return Promise.resolve({ code: 0, data: { hits } });
  };
}

async function settled(model) {
  await wait(MEMO_QUICK_SEARCH_DEBOUNCE_MS + 60);
  return model.snapshot();
}

test("highlight parts decode server markup into plain text", function () {
  assert.deepEqual(highlightPartsFromMarkup("Roadmap and <mark>launch</mark> notes"), [
    { matched: false, text: "Roadmap and " },
    { matched: true, text: "launch" },
    { matched: false, text: " notes" },
  ]);
  assert.deepEqual(highlightPartsFromMarkup("a &lt;b&gt; <mark>&amp;c</mark>"), [
    { matched: false, text: "a <b> " },
    { matched: true, text: "&c" },
  ]);
  assert.deepEqual(highlightPartsFromMarkup("<mark>it&#39;s</mark> &#34;quoted&#34;"), [
    { matched: true, text: "it's" },
    { matched: false, text: ' "quoted"' },
  ]);
  assert.deepEqual(highlightPartsFromMarkup("plain text"), [
    { matched: false, text: "plain text" },
  ]);
  assert.deepEqual(highlightPartsFromMarkup(""), []);
});

test("palette renders server hits for memos, comments, and todos", async function () {
  let opened = null;
  const model = new MemoQuickSearchModel({
    formatDate: function (value) { return String(value); },
    openResult(context) { opened = context; },
  });
  model.setSources({ projects: [project] });

  await withInvoke(servingHits([memo_hit, comment_hit, todo_hit]), async function () {
    model.open();
    model.setQuery("launch");
    await settled(model);
  });

  const snapshot = model.snapshot();
  assert.deepEqual(
    new Set(snapshot.results.map(function (item) { return item.kind; })),
    new Set(["memo", "comment", "todo"]),
  );

  const memo = snapshot.results.find(function (item) { return item.kind === "memo"; });
  assert.equal(memo.id, "memo-1");
  assert.equal(memo.key, "memo:memo-1");
  assert.equal(memo.kindLabel, "MEMO");
  assert.ok(memo.meta.includes("Desktop"));
  assert.ok(memo.titleParts.some(function (part) { return part.matched && part.text === "launch"; }));
  assert.ok(memo.summaryParts.some(function (part) { return part.matched && part.text === "launch"; }));

  const comment = snapshot.results.find(function (item) { return item.kind === "comment"; });
  assert.equal(comment.id, "comment-2");
  assert.equal(comment.key, "comment:comment-2");
  assert.equal(comment.kindLabel, "COMMENT");
  assert.equal(comment.memoId, "memo-1");

  assert.equal(model.activateByKey("comment:comment-2"), true);
  assert.equal(opened.memoId, "memo-1");
  assert.equal(opened.commentId, "comment-2");
  assert.equal(opened.query, "launch");

  const todo = snapshot.results.find(function (item) { return item.kind === "todo"; });
  assert.equal(todo.id, "memo-1:1");
  assert.equal(todo.key, "todo:memo-1:1");
  assert.equal(todo.kindLabel, "TODO");
  assert.equal(todo.title, "Verify launch package");
  assert.ok(todo.meta.includes("来自 Memo"));
  assert.ok(todo.titleParts.some(function (part) { return part.matched; }));

  assert.equal(model.activateByKey("todo:memo-1:1"), true);
  assert.equal(opened.memoId, "memo-1");
  assert.equal(opened.todoId, "memo-1:1");
  assert.equal(opened.result.todo.text, "Verify launch package");
  assert.equal(opened.result.todo.checked, false);
  assert.equal(opened.result.todo.lineIndex, 1);
  assert.equal(opened.result.todo.sourceType, "memo");
});

test("todos extracted from comments keep their comment source", async function () {
  const model = new MemoQuickSearchModel();
  await withInvoke(servingHits([comment_todo_hit]), async function () {
    model.open();
    model.setQuery("confirm launch");
    await settled(model);
  });

  const todo = model.snapshot().results[0];
  assert.equal(todo.id, "comment-5:0");
  assert.equal(todo.memoId, "memo-1");
  assert.equal(todo.todo.sourceCommentId, "comment-5");
  assert.equal(todo.todo.sourceType, "comment");
  assert.ok(todo.meta.includes("来自评论"));
});

test("a slow earlier response cannot overwrite a newer one", async function () {
  const slow_hit = memo_hit;
  const fast_hit = todo_hit;
  const seen = [];

  await withInvoke(function (url) {
    seen.push(url);
    if (url.includes("slow")) {
      return wait(120).then(function () {
        return { code: 0, data: { hits: [slow_hit] } };
      });
    }
    return Promise.resolve({ code: 0, data: { hits: [fast_hit] } });
  }, async function () {
    const model = new MemoQuickSearchModel();
    model.open();
    model.setQuery("slow");
    await wait(MEMO_QUICK_SEARCH_DEBOUNCE_MS + 20);
    model.setQuery("fast");
    await wait(MEMO_QUICK_SEARCH_DEBOUNCE_MS + 200);

    assert.deepEqual(
      model.snapshot().results.map(function (item) { return item.kind; }),
      ["todo"],
    );
    assert.equal(seen.length, 2);
  });
});

test("matching happens server-side, so the palette has no in-memory results", async function () {
  const model = new MemoQuickSearchModel();
  model.setSources({ projects: [] });
  model.open();
  model.setQuery("launch");
  await settled(model);

  assert.deepEqual(model.snapshot().results, []);
});

test("a failed request keeps the previous results", async function () {
  const model = new MemoQuickSearchModel();
  await withInvoke(servingHits([memo_hit]), async function () {
    model.open();
    model.setQuery("launch");
    await settled(model);
  });

  await withInvoke(function () {
    return Promise.reject(new Error("offline"));
  }, async function () {
    model.setQuery("offline query");
    await settled(model);
  });

  assert.deepEqual(
    model.snapshot().results.map(function (item) { return item.id; }),
    ["memo-1"],
  );
});

test("closing and reopening quick search preserves its query, results, and selection", async function () {
  const model = new MemoQuickSearchModel();
  await withInvoke(servingHits([memo_hit, comment_hit]), async function () {
    model.open();
    model.setQuery("launch");
    await settled(model);
  });
  model.moveActive(1);

  const before_close = model.snapshot();
  model.close();
  const closed = model.snapshot();
  assert.equal(closed.open, false);
  assert.equal(closed.query, before_close.query);
  assert.equal(closed.activeIndex, before_close.activeIndex);
  assert.deepEqual(closed.results, before_close.results);

  model.open();
  const reopened = model.snapshot();
  assert.equal(reopened.open, true);
  assert.equal(reopened.query, before_close.query);
  assert.equal(reopened.activeIndex, before_close.activeIndex);
  assert.deepEqual(reopened.results, before_close.results);
});

test("query keeps typed spaces verbatim", function () {
  const model = new MemoQuickSearchModel();
  model.open();

  model.setQuery("launch ");
  assert.equal(model.snapshot().query, "launch ");

  model.setQuery("  launch");
  assert.equal(model.snapshot().query, "  launch");

  model.setQuery("roadmap  launch");
  assert.equal(model.snapshot().query, "roadmap  launch");
});

test("hitToResult labels projects and omits unknown ones", function () {
  const with_project = hitToResult(memo_hit, { projects: [project], query: "launch" });
  assert.ok(with_project.meta.includes("Desktop"));

  const unknown_project = hitToResult(
    { ...memo_hit, projectId: "project-9" },
    { projects: [project], query: "launch" },
  );
  assert.ok(!unknown_project.meta.includes("project-9"));
  assert.ok(!unknown_project.meta.includes("Desktop"));
});

test("detached-window search context can be shared and cleared", function () {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };

  writeMemoQuickSearchOpenContext(storage, "memo-1", { query: "launch" });
  assert.deepEqual(readMemoQuickSearchOpenContext(storage, "memo-1"), {
    memoId: "memo-1",
    query: "launch",
  });

  writeMemoQuickSearchOpenContext(storage, "memo-1", null);
  assert.deepEqual(readMemoQuickSearchOpenContext(storage, "memo-1"), {
    memoId: "memo-1",
    query: "",
  });
});
