import assert from "node:assert/strict";
import test from "node:test";

import {
  CommentDetailModel,
  buildCommentDetailPayload,
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
