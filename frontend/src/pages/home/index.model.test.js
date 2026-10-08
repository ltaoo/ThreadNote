import assert from "node:assert/strict";
import test from "node:test";

import { HomePageModel } from "./index.model.js";
import { HomeWorkspaceModel } from "./home_workspace.model.js";

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

function action_click(action) {
  return {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action } } : null;
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

test("sidebar create-project falls back to the memo section when the active section cannot handle it", function () {
  const app = {};
  const pushes = [];
  const model = HomePageModel({
    app,
    history: {
      push(...args) {
        pushes.push(args);
      },
    },
    view: {},
  });
  const workspace$ = HomeWorkspaceModel(app);

  // Week view has no registered controller for createProject.
  model.methods.handleClick(view_click("week"));
  pushes.length = 0;
  model.methods.handleClick(action_click("createProject"));

  assert.deepEqual(pushes, [["root.home_layout.index.memo", {}]]);
  assert.equal(model.state.activeView.value, "memos");

  // The memo route mounts lazily; the queued action must run on register.
  const calls = [];
  workspace$.methods.register("memos", {
    activateView() {},
    createProject() {
      calls.push("createProject");
    },
  });
  assert.deepEqual(calls, ["createProject"]);
  model.destroy();
});

test("sidebar create-project stays on sections that can handle it", function () {
  const app = {};
  const pushes = [];
  const model = HomePageModel({
    app,
    history: {
      push(...args) {
        pushes.push(args);
      },
    },
    view: {},
  });
  const workspace$ = HomeWorkspaceModel(app);
  const calls = [];
  workspace$.methods.register("todos", {
    activateView() {},
    createProject() {
      calls.push("createProject");
    },
  });

  model.methods.handleClick(view_click("todos"));
  pushes.length = 0;
  model.methods.handleClick(action_click("createProject"));

  assert.deepEqual(pushes, []);
  assert.equal(model.state.activeView.value, "todos");
  assert.deepEqual(calls, ["createProject"]);
  model.destroy();
});
