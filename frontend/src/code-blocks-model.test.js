import assert from "node:assert/strict";
import test from "node:test";

import { CodeBlocksModel } from "./code-blocks-model.js";

test("code blocks default to marked snippets only", function () {
  const model = new CodeBlocksModel();
  const blocks = [
    { id: "marked", marked: true },
    { id: "plain", marked: false },
  ];

  assert.deepEqual(model.visibleBlocks(blocks).map(function (block) {
    return block.id;
  }), ["marked"]);
});

test("code blocks can expose all records", function () {
  const model = new CodeBlocksModel();
  const blocks = [
    { id: "marked", marked: true },
    { id: "plain", marked: false },
  ];

  model.setShowAll(true);

  assert.deepEqual(model.visibleBlocks(blocks).map(function (block) {
    return block.id;
  }), ["marked", "plain"]);
});

test("show-all code blocks remain paginated", function () {
  const model = new CodeBlocksModel({ pageSize: 2 });
  const blocks = [
    { id: "marked-1", marked: true },
    { id: "plain-1", marked: false },
    { id: "marked-2", marked: true },
    { id: "plain-2", marked: false },
    { id: "plain-3", marked: false },
  ];

  model.setShowAll(true);
  let page = model.select(blocks);

  assert.deepEqual(page.items.map(function (block) { return block.id; }), ["marked-1", "plain-1"]);
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 5);

  page = model.loadNext(blocks);
  assert.deepEqual(page.items.map(function (block) { return block.id; }), ["marked-2", "plain-2"]);
  assert.equal(page.hasMore, true);

  page = model.loadNext(blocks);
  assert.deepEqual(page.items.map(function (block) { return block.id; }), ["plain-3"]);
  assert.equal(page.hasMore, false);
});

test("changing the code block scope resets pagination", function () {
  const model = new CodeBlocksModel({ pageSize: 1, showAll: true });
  const blocks = [
    { id: "marked-1", marked: true },
    { id: "plain-1", marked: false },
    { id: "marked-2", marked: true },
  ];

  model.loadNext(blocks);
  assert.equal(model.select(blocks).items.length, 2);

  model.setShowAll(false);

  assert.deepEqual(model.select(blocks).items.map(function (block) { return block.id; }), ["marked-1"]);
});
