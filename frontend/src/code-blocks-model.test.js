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
