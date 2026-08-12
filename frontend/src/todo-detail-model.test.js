import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTodoDetailPayload,
  readTodoDetailPayload,
  TodoDetailModel,
  writeTodoDetailPayload,
} from "./todo-detail-model.js";

const memo = {
  content: "# 发布计划\n\n- [ ] [发布 Alpha] 完成上线检查",
  createdAt: "2026-08-12T08:00:00Z",
  id: "memo-1",
};

const comment = {
  content: "补充检查项\n- [x] [确认时间] 已与团队同步",
  createdAt: "2026-08-12T09:00:00Z",
  id: "comment-1",
  memoId: "memo-1",
};

const todo = {
  checked: true,
  id: "comment-1:1",
  lineIndex: 1,
  memoId: "memo-1",
  projectId: "project-1",
  sourceCommentId: "comment-1",
  sourceId: "comment-1",
  sourceMemoId: "memo-1",
  sourceText: "补充检查项",
  sourceType: "comment",
  text: "[确认时间] 已与团队同步",
};

test("todo detail payload keeps the todo and its memo/comment context", function () {
  const payload = buildTodoDetailPayload(todo, [comment], [memo], "确认 时间");
  assert.ok(payload);
  assert.equal(payload.todo.id, "comment-1:1");
  assert.equal(payload.todo.title, "确认时间");
  assert.equal(payload.todo.description, "已与团队同步");
  assert.equal(payload.memo.id, "memo-1");
  assert.equal(payload.comment.id, "comment-1");
  assert.equal(payload.query, "确认 时间");
});

test("memo todo detail works without a comment context", function () {
  const payload = buildTodoDetailPayload({
    checked: false,
    id: "memo-1:2",
    lineIndex: 2,
    memoId: "memo-1",
    sourceMemoId: "memo-1",
    sourceType: "memo",
    text: "[发布 Alpha] 完成上线检查",
  }, [comment], [memo], "发布");
  assert.ok(payload);
  assert.equal(payload.todo.title, "发布 Alpha");
  assert.equal(payload.comment, null);
  assert.equal(payload.memo.id, "memo-1");
});

test("todo detail model exposes its primary content and source context", async function () {
  const payload = buildTodoDetailPayload(todo, [comment], [memo], "确认");
  const model = new TodoDetailModel({
    async request() {
      return { code: 0, data: { found: true, ...payload } };
    },
  });

  const state = await model.load(todo.id);
  assert.equal(state.found, true);
  assert.equal(state.todo.title, "确认时间");
  assert.equal(state.todo.checked, true);
  assert.equal(state.memo.id, "memo-1");
  assert.equal(state.comment.id, "comment-1");
  assert.equal(state.query, "确认");
});

test("todo detail payload has a browser-only storage fallback", function () {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
  const payload = buildTodoDetailPayload(todo, [comment], [memo], "确认");
  writeTodoDetailPayload(storage, payload);
  assert.deepEqual(readTodoDetailPayload(storage, todo.id), payload);
});
