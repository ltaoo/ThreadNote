import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoCardExpansionModel,
  MemoCardMenuModel,
  MemoCardModel,
} from "./memo-card-model.js";

test("MemoCardModel normalizes memo data and derives presentation", () => {
  const model = new MemoCardModel({
    memo: {
      content: "# 发布计划\n完成联调并发布。 #release #desktop",
      id: 42,
      reactions: ["👍", "👍", "🎉"],
    },
  });

  assert.equal(model.memo.id, "42");
  assert.deepEqual(model.memo.tags, ["release", "desktop"]);
  assert.deepEqual(model.memo.reactions, ["👍", "🎉"]);
  assert.equal(model.presentation.title, "发布计划");
  assert.equal(model.presentation.body, "完成联调并发布。 #release #desktop");
  assert.deepEqual(model.presentation.pinAction, { icon: "pin", label: "置顶" });
});

test("MemoCardModel commits pin state after the action succeeds", async () => {
  const calls = [];
  const model = new MemoCardModel({
    memo: { id: "memo-1", pinned: false },
    onPinChange: async (pinned, memo) => {
      calls.push([pinned, memo.id]);
    },
  });

  await model.togglePinned();

  assert.equal(model.memo.pinned, true);
  assert.deepEqual(model.presentation.pinAction, { icon: "unpin", label: "取消置顶" });
  assert.equal(model.state.busyAction, null);
  assert.deepEqual(calls, [[true, "memo-1"]]);
});

test("MemoCardModel preserves state when an action is rejected", async () => {
  const model = new MemoCardModel({
    memo: { archived: false, id: "memo-2" },
    onArchiveChange: () => false,
  });

  const result = await model.toggleArchived();

  assert.equal(result, false);
  assert.equal(model.memo.archived, false);
});

test("MemoCardModel owns asynchronous action errors", async () => {
  const error = new Error("edit failed");
  const model = new MemoCardModel({
    memo: { id: "memo-3" },
    onEdit: async () => {
      throw error;
    },
  });

  const result = await model.edit();

  assert.equal(result, false);
  assert.equal(model.state.error, error);
  assert.equal(model.state.busyAction, null);
  model.dismissError();
  assert.equal(model.state.error, null);
});

test("MemoCardModel toggles reactions without duplicating values", async () => {
  const model = new MemoCardModel({
    memo: { id: "memo-4", reactions: ["👍"] },
  });

  await model.toggleReaction("👍");
  await model.toggleReaction("🎉");

  assert.deepEqual(model.memo.reactions, ["🎉"]);
});

test("MemoCardModel expands once and reports selection through model actions", () => {
  const actions = [];
  const selections = [];
  const model = new MemoCardModel({
    memo: { id: "memo-5" },
    onAction: (action) => actions.push(action),
    onSelect: (selected) => selections.push(selected),
  });

  assert.equal(model.expand(), true);
  assert.equal(model.expand(), false);
  assert.equal(model.toggleExpanded(), false);
  model.setSelected(true);

  assert.equal(model.state.expanded, true);
  assert.equal(model.state.selected, true);
  assert.deepEqual(actions, ["expand"]);
  assert.deepEqual(selections, [true]);
});

test("MemoCardExpansionModel owns one-way expansion for rendered cards", () => {
  const model = new MemoCardExpansionModel();

  assert.equal(model.isExpanded("memo-1"), false);
  assert.equal(model.expand("memo-1"), true);
  assert.equal(model.expand("memo-1"), false);
  assert.equal(model.isExpanded("memo-1"), true);
  assert.deepEqual(model.state.expandedMemoIds, ["memo-1"]);
});

test("MemoCardExpansionModel only exposes expand when rendered content is clipped", () => {
  const model = new MemoCardExpansionModel({ collapsedLineCount: 36 });

  assert.deepEqual(model.measureContent(347, 23.8), {
    collapsedHeight: 857,
    hasOverflow: false,
    renderedHeight: 347,
  });
  assert.equal(model.measureContent(858, 23.8).hasOverflow, false);
  assert.equal(model.measureContent(859, 23.8).hasOverflow, true);
});

test("MemoCardMenuModel keeps only one card menu open", () => {
  const model = new MemoCardMenuModel();

  model.open("memo-1");
  assert.equal(model.isOpen("memo-1"), true);

  model.toggle("memo-2");
  assert.equal(model.isOpen("memo-1"), false);
  assert.equal(model.isOpen("memo-2"), true);

  model.toggle("memo-2");
  assert.equal(model.state.openMemoId, "");
});
