import assert from "node:assert/strict";
import test from "node:test";

import {
  CommentDetailModel,
  buildCommentDetailPayload,
  loadCommentDetailPayload,
  readCommentDetailPayload,
  writeCommentDetailPayload,
} from "./comment-detail-model.js";

const memo = { content: "Memo context", createdAt: "2026-08-12T08:00:00Z", id: "memo-1" };
const comments = [
  { content: "Original comment", createdAt: "2026-08-12T08:10:00Z", id: "comment-1", memoId: "memo-1", replyTo: "" },
  { content: "Selected reply", createdAt: "2026-08-12T08:20:00Z", id: "comment-2", memoId: "memo-1", replyTo: "comment-1" },
  { content: "Reply to selected", createdAt: "2026-08-12T08:30:00Z", id: "comment-3", memoId: "memo-1", replyTo: "comment-2" },
  { content: "Sibling reply", createdAt: "2026-08-12T08:40:00Z", id: "comment-4", memoId: "memo-1", replyTo: "comment-1" },
];

test("comment detail payload centers the selected comment and keeps direct relations", function () {
  const payload = buildCommentDetailPayload(comments, [memo], "comment-2", "selected");

  assert.equal(payload.comment.id, "comment-2");
  assert.equal(payload.memo.id, "memo-1");
  assert.equal(payload.replyTo.id, "comment-1");
  assert.deepEqual(payload.replies.map(function (item) { return item.id; }), ["comment-3"]);
  assert.equal(payload.query, "selected");
});

test("comment detail model exposes main comment, memo, replied-to comment, and replies", async function () {
  const payload = buildCommentDetailPayload(comments, [memo], "comment-2", "selected");
  const model = new CommentDetailModel({
    async request() { return { code: 0, data: { found: true, ...payload } }; },
  });

  const state = await model.load("comment-2");
  assert.equal(state.comment.comment.id, "comment-2");
  assert.equal(state.memo.id, "memo-1");
  assert.equal(state.replyTo.comment.id, "comment-1");
  assert.deepEqual(state.replies.map(function (item) { return item.comment.id; }), ["comment-3"]);
  assert.equal(state.comment.replyToPreview, "Original comment");
});

test("comment detail payload has a local fallback for browser-only mode", function () {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
  };
  const payload = buildCommentDetailPayload(comments, [memo], "comment-2", "selected");

  writeCommentDetailPayload(storage, payload);
  assert.deepEqual(readCommentDetailPayload(storage, "comment-2"), payload);
});

test("comment search opens an unloaded memo with the selected comment and its relations", async function (t) {
  const original_invoke = globalThis.invoke;
  t.after(function () {
    if (original_invoke === undefined) delete globalThis.invoke;
    else globalThis.invoke = original_invoke;
  });
  const calls = [];
  globalThis.invoke = async function (url, options) {
    calls.push(url);
    assert.equal(options.method, "GET");
    if (url === "/api/memos/get?id=memo-1") {
      return { code: 0, data: { memo } };
    }
    if (url === "/api/memo-comments?memoId=memo-1") {
      return { code: 0, data: { comments } };
    }
    throw new Error("unexpected URL: " + url);
  };

  const payload = await loadCommentDetailPayload([], [], "comment-2", "selected", "memo-1");
  assert.equal(payload.comment.id, "comment-2");
  assert.equal(payload.memo.id, "memo-1");
  assert.equal(payload.replyTo.id, "comment-1");
  assert.deepEqual(payload.replies.map(function (item) { return item.id; }), ["comment-3"]);
  assert.equal(payload.query, "selected");
  assert.equal(calls.length, 2);

  const model = new CommentDetailModel({
    async request() { return { code: 0, data: { found: true, ...payload } }; },
  });
  const state = await model.load("comment-2");
  assert.equal(state.found, true);
  assert.equal(state.comment.comment.id, "comment-2");
  assert.equal(state.query, "selected");

  assert.equal(await loadCommentDetailPayload([], [], "deleted", "", "memo-1"), null);
  globalThis.invoke = async function () { return { code: 1, msg: "读取失败" }; };
  await assert.rejects(loadCommentDetailPayload([], [], "comment-2", "", "memo-1"), /读取失败/);
});

test("comment detail keeps cached navigation and loads a missing parent by the comment memo ID", async function (t) {
  const original_invoke = globalThis.invoke;
  t.after(function () {
    if (original_invoke === undefined) delete globalThis.invoke;
    else globalThis.invoke = original_invoke;
  });
  globalThis.invoke = function () { throw new Error("cached detail must not fetch"); };
  assert.deepEqual(
    await loadCommentDetailPayload(comments, [memo], "comment-2", "selected"),
    buildCommentDetailPayload(comments, [memo], "comment-2", "selected"),
  );
  globalThis.invoke = async function (url) {
    if (url === "/api/memos/get?id=memo-1") return { code: 0, data: { memo } };
    if (url === "/api/memo-comments?memoId=memo-1") return { code: 0, data: { comments } };
    throw new Error("unexpected URL: " + url);
  };
  const payload = await loadCommentDetailPayload(comments, [], "comment-2", "");
  assert.equal(payload.memo.id, "memo-1");
  assert.equal(payload.comment.id, "comment-2");
});
