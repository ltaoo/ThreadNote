import assert from "node:assert/strict";
import test from "node:test";

import { CommentRepliesModel } from "./comment-replies.model.js";

function create_ref(initial_value) {
  let value_ = initial_value;
  const subscribers_ = new Set();
  return {
    get value() {
      return value_;
    },
    as(next_value) {
      value_ = next_value;
      subscribers_.forEach(function (subscriber) {
        subscriber.onChange?.(next_value);
      });
    },
    subscribe(subscriber) {
      subscribers_.add(subscriber);
      return function () { subscribers_.delete(subscriber); };
    },
  };
}

function create_runtime() {
  return {
    defineModel(model) {
      return { ...model, destroy() {} };
    },
    ref: create_ref,
    refarr: create_ref,
  };
}

function found_snapshot() {
  const memo = {
    content: "# Memo\n\n- [ ] task",
    createdAt: "2026-08-20T08:00:00.000Z",
    id: "memo-1",
    reactions: ["👍"],
  };
  const comment = {
    content: "hello **Timeless**",
    createdAt: "2026-08-20T09:00:00.000Z",
    id: "comment-1",
    memoId: memo.id,
    reactions: [],
  };
  return {
    comment: { comment, replyCount: 1, replyToPreview: "" },
    error: "",
    found: true,
    loading: false,
    memo,
    memos: [memo],
    query: "Timeless",
    replies: [{
      comment: {
        ...comment,
        content: "reply",
        id: "comment-2",
        replyTo: comment.id,
      },
      replyCount: 0,
      replyToPreview: "hello",
    }],
    replyTo: null,
  };
}

test("comment replies model exposes prepared reactive card state", async function () {
  const runtime = create_runtime();
  let resolve_load_;
  const detail_model = {
    load() {
      return new Promise(function (resolve) { resolve_load_ = resolve; });
    },
  };
  const model = CommentRepliesModel({ detailModel: detail_model, runtime });
  const loading = model.methods.load("comment-1");

  assert.equal(model.state.loading.value, true);
  assert.equal(model.state.found.value, false);
  resolve_load_(found_snapshot());
  assert.equal(await loading, true);

  assert.equal(model.state.found.value, true);
  assert.equal(model.state.query.value, "Timeless");
  assert.equal(model.state.comment.value.id, "comment-1");
  assert.match(model.state.comment.value.html, /Timeless/);
  assert.equal(model.state.memo.value.stats.some(function (item) {
    return item.label === "1 代办";
  }), true);
  assert.equal(model.state.replies.value.length, 1);
});

test("comment replies model keeps load failures in reactive state", async function () {
  const runtime = create_runtime();
  const detail_model = {
    async load() {
      return {
        comment: null,
        error: "未找到评论",
        found: false,
        loading: false,
        memo: null,
        memos: [],
        query: "",
        replies: [],
        replyTo: null,
      };
    },
  };
  const model = CommentRepliesModel({ detailModel: detail_model, runtime });
  assert.equal(await model.methods.load("missing"), false);
  assert.equal(model.state.loading.value, false);
  assert.equal(model.state.found.value, false);
  assert.equal(model.state.error.value, "未找到评论");
});

