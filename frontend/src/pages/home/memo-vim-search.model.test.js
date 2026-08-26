import assert from "node:assert/strict";
import test from "node:test";

import { MemoVimSearchModel } from "./memo-vim-search.model.js";

function testRuntime() {
  return {
    ref(initial_value) {
      return {
        value: initial_value,
        as(value) { this.value = value; },
        destroy() {},
      };
    },
  };
}

test("Vim search opens with the last query and submits or cancels from the keyboard", async function () {
  const calls = [];
  const model = MemoVimSearchModel(testRuntime());
  model.setFocusView(function () { calls.push("focus"); });
  const event = {
    key: "Enter",
    preventDefault() { calls.push("prevent"); },
    stopPropagation() { calls.push("stop"); },
  };

  assert.equal(model.open({
    query: "old",
    submit(query) { calls.push(["submit", query]); return true; },
  }), true);
  await Promise.resolve();
  assert.equal(model.visible.value, true);
  assert.equal(calls.at(-1), "focus");
  model.setQuery("needle");
  assert.equal(model.handleKeyDown(event), true);
  assert.equal(model.visible.value, false);
  assert.deepEqual(calls, ["focus", "prevent", "stop", ["submit", "needle"]]);

  model.open({ query: "needle", cancel() { calls.push("cancel"); }, submit() {} });
  event.key = "Escape";
  assert.equal(model.handleKeyDown(event), true);
  assert.equal(model.visible.value, false);
  assert.equal(calls.at(-1), "cancel");
});
