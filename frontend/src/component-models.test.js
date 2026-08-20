import assert from "node:assert/strict";
import test from "node:test";

import {
  ButtonModel,
  CheckboxModel,
  ComponentModel,
  DialogModel,
  InputModel,
  PopoverModel,
  ProgressModel,
  ProjectSelectModel,
  SelectModel,
} from "./component-models.js";
import { modelState, subscribeModel } from "./component-view.js";

test("ComponentModel only notifies subscribers when state changes", () => {
  const model = new ComponentModel({ count: 0 });
  const states = [];
  const unsubscribe = model.subscribe((state) => states.push(state));

  model.setState({ count: 0 });
  model.setState({ count: 1 });
  unsubscribe();
  model.setState({ count: 2 });

  assert.equal(states.length, 1);
  assert.deepEqual(states[0], { count: 1 });
  assert.equal(Object.isFrozen(states[0]), true);
});

test("ButtonModel suppresses presses while disabled or loading", () => {
  let presses = 0;
  const model = new ButtonModel({ onPress: () => (presses += 1) });

  model.press();
  model.setDisabled(true);
  model.press();
  model.setDisabled(false);
  model.setLoading(true);
  model.press();

  assert.equal(presses, 1);
});

test("InputModel owns value and keyboard behavior", () => {
  const changes = [];
  const entered = [];
  const keys = [];
  const model = new InputModel({
    defaultValue: "draft",
    onChange: (value) => changes.push(value),
    onEnter: (value) => entered.push(value),
    onKeyDown: (event) => keys.push(event.key),
  });

  model.setValue("note");
  model.keyDown({ key: "Enter" });
  model.enter();
  model.clear();

  assert.deepEqual(changes, ["note", ""]);
  assert.deepEqual(entered, ["note"]);
  assert.deepEqual(keys, ["Enter"]);
  assert.equal(model.state.value, "");
});

test("CheckboxModel clears indeterminate state when changed", () => {
  const values = [];
  const model = new CheckboxModel({
    indeterminate: true,
    onChange: (value) => values.push(value),
  });

  model.toggle();

  assert.equal(model.state.checked, true);
  assert.equal(model.state.indeterminate, false);
  assert.deepEqual(values, [true]);
});

test("SelectModel accepts enabled nested options and rejects disabled ones", () => {
  const values = [];
  const model = new SelectModel({
    options: [
      {
        label: "Fruit",
        options: [
          { label: "Apple", value: "apple" },
          { disabled: true, label: "Pear", value: "pear" },
        ],
      },
    ],
    onChange: (value) => values.push(value),
  });

  model.select("apple");
  model.select("pear");
  model.clear();

  assert.equal(model.state.value, null);
  assert.deepEqual(values, ["apple", null]);
});

test("SelectModel owns open state and keyboard selection", () => {
  const values = [];
  const model = new SelectModel({
    options: [
      { label: "Inbox", value: "inbox" },
      { label: "Today", value: "today" },
    ],
    onChange: (value) => values.push(value),
  });

  model.handleKeyDown("ArrowDown");
  assert.equal(model.state.open, true);
  assert.equal(model.state.activeIndex, 0);
  model.handleKeyDown("Enter");

  assert.equal(model.state.open, false);
  assert.equal(model.state.value, "inbox");
  assert.deepEqual(values, ["inbox"]);
});

test("ProjectSelectModel creates semantic project options", () => {
  const model = new ProjectSelectModel({
    includeAll: true,
    projects: [
      { color: "#ffae24", count: 4, id: "work", name: "Work" },
    ],
    value: "work",
  });

  assert.equal(model.state.options[0].kind, "all");
  assert.equal(model.state.options[1].kind, "unassigned");
  assert.deepEqual(model.selectedOption(), {
    color: "#ffae24",
    count: 4,
    label: "Work",
    value: "work",
  });
});

test("DialogModel closes after successful asynchronous confirmation", async () => {
  const changes = [];
  const model = new DialogModel({
    open: true,
    onConfirm: async () => "saved",
    onOpenChange: (open, reason) => changes.push([open, reason]),
  });

  const result = await model.confirm();

  assert.equal(result, "saved");
  assert.equal(model.state.open, false);
  assert.equal(model.state.busy, false);
  assert.deepEqual(changes, [[false, "confirm"]]);
});

test("DialogModel keeps errors in model state", async () => {
  const error = new Error("save failed");
  const model = new DialogModel({
    open: true,
    onConfirm: async () => {
      throw error;
    },
  });

  const result = await model.confirm();

  assert.equal(result, false);
  assert.equal(model.state.open, true);
  assert.equal(model.state.busy, false);
  assert.equal(model.state.error, error);
});

test("PopoverModel reports explicit open-state reasons", () => {
  const changes = [];
  const model = new PopoverModel({
    onOpenChange: (open, reason) => changes.push([open, reason]),
  });

  model.show();
  model.toggle();

  assert.deepEqual(changes, [
    [true, "show"],
    [false, "toggle"],
  ]);
});

test("ProgressModel clamps values to its configured range", () => {
  const model = new ProgressModel({ max: 80, value: 100 });

  assert.equal(model.state.value, 80);
  model.setValue(-10);
  assert.equal(model.state.value, 0);
  model.setIndeterminate(true);
  assert.equal(model.state.indeterminate, true);
});

test("model adapter supports the bundled Timeless state-change contract", async () => {
  await import("../public/timeless.core.umd.min.js");
  const legacyModel = new globalThis.Timeless.ui.InputCore({
    defaultValue: "legacy",
  });
  const values = [];
  const unsubscribe = subscribeModel(legacyModel, (state) => {
    values.push(state.value);
  });

  legacyModel.setValue("compatible");
  unsubscribe();
  legacyModel.setValue("ignored");

  assert.equal(modelState(legacyModel).value, "ignored");
  assert.deepEqual(values, ["compatible"]);
  legacyModel.destroy();
});
