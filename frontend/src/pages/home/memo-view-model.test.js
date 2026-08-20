import assert from "node:assert/strict";
import test from "node:test";

import {
  activeViewMeta,
  applyContentOpsToString,
  detachedMemoRenderContext,
  parseHost,
  stripMemoFrontmatter,
} from "./memo-view-model.js";

test("active view metadata exposes home actions only for the memo feed", function () {
  assert.equal(activeViewMeta("memos").showHomeActions, true);
  ["boards", "chat", "codeblocks", "files", "images", "items", "links", "milestones", "project-detail", "rules", "todos"].forEach(function (view) {
    assert.equal(Boolean(activeViewMeta(view).showHomeActions), false, view);
  });
});

test("parseHost normalizes common host names and rejects invalid URLs", function () {
  assert.deepEqual(parseHost("https://www.example.com/docs"), {
    host: "example.com",
    hostname: "www.example.com",
  });
  assert.deepEqual(parseHost("not a URL"), { host: "", hostname: "" });
});

test("content operations replay unicode-safe history edits", function () {
  assert.equal(applyContentOpsToString("甲🙂乙", [
    { count: 2, type: "retain" },
    { count: 1, type: "delete" },
    { text: "丙", type: "insert" },
  ]), "甲🙂丙");
});

test("memo frontmatter is removed without changing plain markdown", function () {
  assert.equal(stripMemoFrontmatter("---\nvisibility: PRIVATE\n---\n\n正文"), "正文");
  assert.equal(stripMemoFrontmatter("# 标题\n正文"), "# 标题\n正文");
});

test("detached render context reuses the model-owned reference index", function () {
  const state = { editorSettings: { lineNumbers: true }, memos: [] };
  const first = detachedMemoRenderContext(state, "memo-1", { readonly: true });
  const second = detachedMemoRenderContext(state, "memo-2");
  assert.equal(first.index, second.index);
  assert.deepEqual(first.stack, ["memo-1"]);
  assert.equal(first.readonly, true);
});
