import assert from "node:assert/strict";
import test from "node:test";

import { HomePageModel } from "./index.model.js";

globalThis.ref = function (initial_value) {
  return {
    value: initial_value,
    as(next_value) {
      this.value = next_value;
    },
  };
};

function filter_click(filter) {
  return {
    target: {
      closest(selector) {
        return selector === "[data-filter]" ? { dataset: { filter } } : null;
      },
    },
  };
}

function view_click(view) {
  return {
    target: {
      closest(selector) {
        return selector === "[data-view]" ? { dataset: { view } } : null;
      },
    },
  };
}

test("home memo default filter reuses the default cached route", function () {
  const pushes = [];
  const model = HomePageModel({
    app: {},
    history: {
      push(...args) {
        pushes.push(args);
      },
    },
    view: {},
  });

  model.methods.handleClick(filter_click("all"));
  model.methods.handleClick(filter_click("pinned"));

  assert.deepEqual(pushes, [
    ["root.home_layout.index.memo", {}],
    ["root.home_layout.index.memo", { filter: "pinned" }],
  ]);
  model.destroy();
});

test("home period views navigate to their dedicated cached routes", function () {
  const pushes = [];
  const model = HomePageModel({
    app: {},
    history: {
      push(...args) {
        pushes.push(args);
      },
    },
    view: {},
  });

  model.methods.handleClick(view_click("week"));
  model.methods.handleClick(view_click("month"));

  assert.deepEqual(pushes, [
    ["root.home_layout.index.week", {}],
    ["root.home_layout.index.month", {}],
  ]);
  assert.equal(model.state.activeView.value, "month");
  model.destroy();
});
