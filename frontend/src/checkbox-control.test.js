import assert from "node:assert/strict";
import test from "node:test";

import { forwardCheckboxStoreChange } from "./checkbox-control.js";

test("checkbox control forwards store changes as one bubbling change event", function () {
  let on_change = null;
  const events = [];
  const store = {
    onChange(callback) {
      on_change = callback;
      return function () {
        on_change = null;
      };
    },
  };
  const control = {
    dispatchEvent(event) {
      events.push(event);
    },
  };
  class TestEvent {
    constructor(type, options) {
      this.bubbles = Boolean(options?.bubbles);
      this.type = type;
    }
  }

  const unsubscribe = forwardCheckboxStoreChange(control, store, TestEvent);
  on_change(true);

  assert.equal(events.length, 1);
  assert.equal(events[0].bubbles, true);
  assert.equal(events[0].type, "change");
  unsubscribe();
  assert.equal(on_change, null);
});
