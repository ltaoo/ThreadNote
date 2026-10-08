import assert from "node:assert/strict";
import test from "node:test";

import { createBoardCardDragModel } from "./home_board_drag.model.js";

test("a press without a task id starts no drag session", function () {
  const drag = createBoardCardDragModel();

  assert.equal(drag.pointerDown({ x: 10, y: 10 }), false);
  assert.equal(drag.taskId, "");
  assert.equal(drag.pointerMove({ x: 90, y: 90 }), false);
  assert.equal(drag.dragging, false);
  assert.equal(drag.pointerUp(), null);
});

test("a click keeps the session idle and reports no drag on release", function () {
  const drag = createBoardCardDragModel();

  assert.equal(drag.pointerDown({ taskId: "task-1", x: 10, y: 10 }), true);
  assert.equal(drag.pointerMove({ x: 12, y: 12 }), false);
  assert.equal(drag.dragging, false);

  const finished = drag.pointerUp();

  assert.deepEqual(finished, { dragging: false, taskId: "task-1" });
  assert.equal(drag.taskId, "");
});

test("crossing the threshold starts the drag exactly once", function () {
  const drag = createBoardCardDragModel({ threshold: 4 });

  drag.pointerDown({ taskId: "task-1", x: 100, y: 100 });

  assert.equal(drag.pointerMove({ x: 102, y: 102 }), false);
  assert.equal(drag.pointerMove({ x: 104, y: 100 }), true);
  assert.equal(drag.dragging, true);
  // Later moves during the same drag are not a fresh start.
  assert.equal(drag.pointerMove({ x: 200, y: 200 }), false);

  assert.deepEqual(drag.pointerUp(), { dragging: true, taskId: "task-1" });
});

test("a press resets the previous session", function () {
  const drag = createBoardCardDragModel();

  drag.pointerDown({ taskId: "task-1", x: 0, y: 0 });
  drag.pointerMove({ x: 40, y: 40 });
  assert.equal(drag.dragging, true);

  assert.equal(drag.pointerDown({ taskId: "task-2", x: 0, y: 0 }), true);
  assert.equal(drag.taskId, "task-2");
  assert.equal(drag.dragging, false);

  // The stale session was dropped, so releasing only reports the new press.
  assert.deepEqual(drag.pointerUp(), { dragging: false, taskId: "task-2" });
});

test("the session is reusable after it ends", function () {
  const drag = createBoardCardDragModel();

  drag.pointerDown({ taskId: "task-1", x: 0, y: 0 });
  drag.pointerMove({ x: 50, y: 0 });
  drag.pointerUp();

  assert.equal(drag.pointerUp(), null);
  drag.pointerDown({ taskId: "task-2", x: 5, y: 5 });
  drag.pointerMove({ x: 5, y: 50 });

  assert.deepEqual(drag.pointerUp(), { dragging: true, taskId: "task-2" });
});
