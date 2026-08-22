import assert from "node:assert/strict";
import test from "node:test";

import {
  TASK_BACKLOG_TAG,
  isTaskInBacklog,
  taskHasTag,
} from "./tasks.js";

test("task backlog is represented by a normal stage tag", function () {
  const task = { tags: ["type:feature", "Stage:Backlog"] };

  assert.equal(TASK_BACKLOG_TAG, "stage:backlog");
  assert.equal(isTaskInBacklog(task), true);
  assert.equal(taskHasTag(task, "type:feature"), true);
  assert.equal(isTaskInBacklog({ tags: ["stage:ready"] }), false);
});
