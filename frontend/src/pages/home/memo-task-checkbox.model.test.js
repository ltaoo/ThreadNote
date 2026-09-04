import assert from "node:assert/strict";
import test from "node:test";

import {
  bindTaskCompletionCheckbox,
  memoTaskCheckboxChange,
  taskCompletionChecked,
} from "./memo-task-checkbox.model.js";
import { persistMemoTaskLine } from "./memo-task-source.model.js";

function checkbox_fixture(options = {}) {
  const task_control = {
    dataset: { taskLine: String(options.lineIndex ?? 0) },
    hasAttribute(name) {
      return name === "checked" && Boolean(options.hostChecked);
    },
    matches(selector) {
      return selector === "[data-task-line]";
    },
    querySelector(selector) {
      return selector === 'input[type="checkbox"]' ? checkbox_input : null;
    },
  };
  const checkbox_input = {
    checked: Boolean(options.checked),
    closest(selector) {
      return selector === "[data-task-line]" ? task_control : null;
    },
    matches(selector) {
      return selector === 'input[type="checkbox"]';
    },
  };
  return { checkbox_input, task_control };
}

test("memo task checkbox change resolves metadata from the custom control host", function () {
  const { checkbox_input, task_control } = checkbox_fixture({
    checked: true,
    lineIndex: 3,
  });

  assert.deepEqual(memoTaskCheckboxChange(checkbox_input), {
    checked: true,
    control: task_control,
    lineIndex: 3,
  });
});

test("memo task checkbox change supports events dispatched by the control host", function () {
  const { task_control } = checkbox_fixture({ checked: false, lineIndex: 1 });

  assert.deepEqual(memoTaskCheckboxChange(task_control), {
    checked: false,
    control: task_control,
    lineIndex: 1,
  });
});

test("memo task checkbox change ignores unrelated and invalid targets", function () {
  assert.equal(memoTaskCheckboxChange(null), null);
  assert.equal(
    memoTaskCheckboxChange({
      closest() {
        return null;
      },
      matches() {
        return false;
      },
    }),
    null,
  );

  const { checkbox_input, task_control } = checkbox_fixture();
  task_control.dataset.taskLine = "not-a-number";
  assert.equal(memoTaskCheckboxChange(checkbox_input), null);
});

test("memo task source persistence loads an unpaged source memo", async function () {
  const updates = [];
  const local_updates = [];
  const result = await persistMemoTaskLine({
    checked: true,
    line: 2,
    memoId: "memo-source",
    onLocalUpdate(memo) {
      local_updates.push(memo);
    },
    services: {
      async loadMemoFromVault(memo_id) {
        assert.equal(memo_id, "memo-source");
        return {
          content: "项目计划\n- [ ] 完成持久化 [[task:task-1]]",
          id: memo_id,
        };
      },
      async updateMemoInVault(memo_id, patch) {
        updates.push({ memo_id, patch });
      },
    },
  });

  assert.equal(result.changed, true);
  assert.match(result.memo.content, /- \[x\] 完成持久化/);
  assert.equal(local_updates.length, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].memo_id, "memo-source");
  assert.match(updates[0].patch.content, /- \[x\] 完成持久化/);
});

test("memo task source persistence reuses a loaded source memo", async function () {
  let load_count = 0;
  let update_count = 0;
  const result = await persistMemoTaskLine({
    checked: false,
    line: 1,
    memo: {
      content: "- [x] 重新打开 [[task:task-2]]",
      id: "memo-loaded",
    },
    memoId: "memo-loaded",
    services: {
      async loadMemoFromVault() {
        load_count += 1;
      },
      async updateMemoInVault() {
        update_count += 1;
      },
    },
  });

  assert.equal(result.changed, true);
  assert.match(result.memo.content, /- \[ \] 重新打开/);
  assert.equal(load_count, 0);
  assert.equal(update_count, 1);
});

test("task completion binding reacts to checked changes only", function () {
  let listener = null;
  const changes = [];
  const control = {
    state: { checked: false, disabled: false },
    onChange(callback) {
      listener = callback;
      return function () {
        listener = null;
      };
    },
  };
  const unsubscribe = bindTaskCompletionCheckbox(
    control,
    false,
    function (checked, changed_control) {
      changes.push({ changed_control, checked });
    },
  );

  control.state.disabled = true;
  listener();
  control.state.checked = true;
  listener();
  listener();

  assert.equal(taskCompletionChecked(control), true);
  assert.deepEqual(changes, [{ changed_control: control, checked: true }]);
  unsubscribe();
  assert.equal(listener, null);
});
