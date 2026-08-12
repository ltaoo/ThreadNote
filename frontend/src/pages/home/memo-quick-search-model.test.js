import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoQuickSearchModel,
  memoQuickSearchHighlightParts,
  readMemoQuickSearchOpenContext,
  writeMemoQuickSearchOpenContext,
} from "./memo-quick-search-model.js";

const memo = {
  content: "Roadmap and launch notes\n- [ ] Verify launch package",
  createdAt: "2026-08-10T10:00:00Z",
  id: "memo-1",
  projectId: "project-1",
};

const comments = [
  { content: "Original launch question", createdAt: "2026-08-10T11:00:00Z", id: "comment-1", memoId: "memo-1", replyTo: "" },
  { content: "Launch reply with details", createdAt: "2026-08-10T12:00:00Z", id: "comment-2", memoId: "memo-1", replyTo: "comment-1" },
  { content: "Nested launch answer", createdAt: "2026-08-10T13:00:00Z", id: "comment-3", memoId: "memo-1", replyTo: "comment-2" },
  { content: "Unrelated sibling", createdAt: "2026-08-10T14:00:00Z", id: "comment-4", memoId: "memo-1", replyTo: "comment-1" },
];

test("quick search returns memo, comment, and todo results and activates their contexts", function () {
  let opened = null;
  const model = new MemoQuickSearchModel({
    openResult(context) { opened = context; },
  });
  model.setSources({ comments, memos: [memo], projects: [{ id: "project-1", name: "Desktop" }] });
  model.open();
  model.setQuery("launch");

  const snapshot = model.snapshot();
  assert.deepEqual(new Set(snapshot.results.map(function (item) { return item.kind; })), new Set(["memo", "comment", "todo"]));

  const reply = snapshot.results.find(function (item) { return item.id === "comment-2"; });
  assert.ok(reply);
  assert.equal(model.activateByKey(reply.key), true);
  assert.equal(opened.memoId, "memo-1");
  assert.equal(opened.commentId, "comment-2");
  assert.equal(opened.query, "launch");

  const todo = snapshot.results.find(function (item) { return item.kind === "todo"; });
  assert.ok(todo);
  assert.equal(model.activateByKey(todo.key), true);
  assert.equal(opened.memoId, "memo-1");
  assert.equal(opened.todoId, "memo-1:1");
  assert.equal(opened.result.todo.text, "Verify launch package");
});

test("quick search finds todos inside comments", function () {
  const model = new MemoQuickSearchModel();
  model.setSources({
    comments: comments.concat({
      content: "Reply checklist\n- [x] Confirm launch time",
      createdAt: "2026-08-10T15:00:00Z",
      id: "comment-5",
      memoId: "memo-1",
      replyTo: "comment-1",
    }),
    memos: [memo],
    projects: [],
  });
  model.open();
  model.setQuery("confirm launch time");

  const todo = model.snapshot().results.find(function (item) { return item.kind === "todo"; });
  assert.ok(todo);
  assert.equal(todo.todo.checked, true);
  assert.equal(todo.todo.sourceCommentId, "comment-5");
  assert.equal(todo.memoId, "memo-1");
});

test("highlight parts mark every case-insensitive query term", function () {
  assert.deepEqual(memoQuickSearchHighlightParts("Launch roadmap LAUNCH", "launch roadmap"), [
    { matched: true, text: "Launch" },
    { matched: false, text: " " },
    { matched: true, text: "roadmap" },
    { matched: false, text: " " },
    { matched: true, text: "LAUNCH" },
  ]);
});

test("a late content match remains visible and highlighted in the result summary", function () {
  const model = new MemoQuickSearchModel();
  model.setSources({
    comments: [],
    memos: [{ ...memo, content: "prefix ".repeat(40) + "needle at the end" }],
    projects: [],
  });
  model.open();
  model.setQuery("needle");

  const result = model.snapshot().results[0];
  assert.ok(result.summary.includes("needle"));
  assert.ok(result.summaryParts.some(function (part) { return part.matched && part.text === "needle"; }));
});

test("closing and reopening quick search preserves its query, results, and selection", function () {
  const model = new MemoQuickSearchModel();
  model.setSources({ comments, memos: [memo], projects: [] });
  model.open();
  model.setQuery("launch");
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
