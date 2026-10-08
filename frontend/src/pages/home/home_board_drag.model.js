/**
 * Board card pointer-drag session.
 *
 * Timeless `View` reports pointer movement as cumulative deltas
 * (`onPointerMove(event, info)`), so a card only has to decide when a press
 * turns into a drag. Resolving the drop column stays in the view, which can ask
 * the document what sits under the pointer.
 */

const drag_threshold_px = 4;

function pointer_distance(x, y, start_x, start_y) {
  return Math.hypot(x - start_x, y - start_y);
}

export function createBoardCardDragModel(options = {}) {
  const threshold = Number(options.threshold ?? drag_threshold_px);
  let task_id = "";
  let start_x = 0;
  let start_y = 0;
  let dragging = false;

  function reset() {
    task_id = "";
    start_x = 0;
    start_y = 0;
    dragging = false;
  }

  return {
    get taskId() {
      return task_id;
    },
    get dragging() {
      return dragging;
    },
    /**
     * Remember the card under the press.
     * @returns {boolean} false when no card can be dragged
     */
    pointerDown(payload) {
      const next_task_id = String(payload?.taskId || "");
      if (!next_task_id) return false;
      reset();
      task_id = next_task_id;
      start_x = Number(payload?.x ?? 0);
      start_y = Number(payload?.y ?? 0);
      return true;
    },
    /**
     * Track the pointer while pressed.
     * @returns {boolean} true once, when the press becomes a drag
     */
    pointerMove(payload) {
      if (!task_id || dragging) return false;
      const x = Number(payload?.x ?? 0);
      const y = Number(payload?.y ?? 0);
      if (pointer_distance(x, y, start_x, start_y) < threshold) return false;
      dragging = true;
      return true;
    },
    /**
     * End the session, whether the pointer was released or cancelled.
     * @returns {{taskId: string, dragging: boolean}|null} null when idle
     */
    pointerUp() {
      if (!task_id) return null;
      const finished = { dragging, taskId: task_id };
      reset();
      return finished;
    },
  };
}
