import assert from "node:assert/strict";
import test from "node:test";

import { MemoVirtualListModel } from "./memo-virtual-list.model.js";

test("memo virtual list measures variable rows and anchors rows above the viewport", function () {
  const model = new MemoVirtualListModel({
    estimatedHeight: 100,
    gap: 10,
    overscan: 0,
    paddingBottom: 0,
    paddingTop: 0,
  });
  model.setItems([{ id: "a" }, { id: "b" }, { id: "c" }]);
  model.setViewport(200, 100);

  assert.deepEqual(model.renderIndexes(), [1, 2]);
  assert.equal(model.measure("a", 150), 50);
  assert.equal(model.offsetAt(1), 160);
  assert.equal(model.total_height, 370);

  model.setPinnedKeys(["a"]);
  assert.deepEqual(model.renderIndexes(), [0, 1, 2]);
  assert.equal(model.measure("a", 0), 0);
  model.invalidateMeasurements(["a"]);
  assert.equal(model.heightAt(0), 150);

  const large_model = new MemoVirtualListModel({ estimatedHeight: 100 });
  large_model.setItems(
    Array.from({ length: 1000 }, (_, index) => ({ id: String(index) })),
  );
  large_model.setViewport(50_000, 800);
  assert.ok(large_model.renderIndexes().length < 30);
});
