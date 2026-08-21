import assert from "node:assert/strict";
import test from "node:test";

import { ProjectSelectModel } from "./project-select.model.js";

class PresenceStub {
  constructor() {
    this.state = {
      enter: false,
      exit: false,
      mounted: false,
      visible: false,
    };
  }

  show() {
    this.state = {
      enter: true,
      exit: false,
      mounted: true,
      visible: true,
    };
  }

  hide() {
    this.state = { ...this.state, enter: false, exit: true };
  }

  handleAnimationEnd() {
    this.state = {
      enter: false,
      exit: false,
      mounted: false,
      visible: false,
    };
  }

  reset() {
    this.handleAnimationEnd();
  }

  destroy() {}
}

class PopperStub {
  constructor(options = {}) {
    this.options = options;
    this.platform = options.platform;
    this.place_count = 0;
    this.reference = null;
    this.state = {
      isPlaced: false,
      placement: "bottom-start",
      reference: false,
      strategy: "fixed",
      x: 0,
      y: 0,
    };
  }

  place() {
    this.place_count += 1;
  }

  setReference(reference) {
    this.reference = reference;
    this.state.reference = true;
  }

  removeReference() {
    this.reference = null;
    this.state.reference = false;
  }

  reset() {}

  destroy() {}
}

class ButtonStub {
  constructor() {
    this.state = { disabled: false, loading: false };
  }

  setLoading(loading) {
    this.state.loading = Boolean(loading);
  }

  disable() {
    this.state.disabled = true;
  }

  enable() {
    this.state.disabled = false;
  }
}

class InputStub {
  constructor(options = {}) {
    this.focus_count = 0;
    this.status = "normal";
    this.value = options.defaultValue || "";
    this._on_change = options.onChange || null;
    this._on_enter = options.onEnter || null;
  }

  setValue(value, options = {}) {
    this.value = value;
    if (!options.silence) this._on_change?.(value);
  }

  setStatus(status) {
    this.status = status;
  }

  focus() {
    this.focus_count += 1;
  }

  enter() {
    return this._on_enter?.(this.value);
  }

  destroy() {}
}

class DialogStub {
  constructor(options = {}) {
    this.cancelBtn = new ButtonStub();
    this.closeable = options.closeable ?? true;
    this.okBtn = new ButtonStub();
    this.open = false;
    this.presence = new PresenceStub();
    this._hidden_listeners = new Set();
    this._ok_listeners = new Set();
    this._show_listeners = new Set();
    if (options.onOk) this._ok_listeners.add(options.onOk);
  }

  onHidden(listener) {
    this._hidden_listeners.add(listener);
    return () => this._hidden_listeners.delete(listener);
  }

  onShow(listener) {
    this._show_listeners.add(listener);
    return () => this._show_listeners.delete(listener);
  }

  show() {
    this.open = true;
    this.presence.show();
    this._show_listeners.forEach((listener) => listener());
  }

  hide() {
    this.presence.hide();
  }

  finishHide() {
    this.open = false;
    this.presence.handleAnimationEnd();
    this._hidden_listeners.forEach((listener) => listener());
  }

  ok() {
    this._ok_listeners.forEach((listener) => listener());
  }

  destroy() {
    this._hidden_listeners.clear();
    this._ok_listeners.clear();
    this._show_listeners.clear();
  }
}

const runtime = {
  vm: {
    DialogCore: DialogStub,
    InputCore: InputStub,
    PopperCore: PopperStub,
    PresenceCore: PresenceStub,
  },
};

function create_model(options = {}) {
  return new ProjectSelectModel({
    defaultValue: "",
    options: [
      { count: 3, label: "未归属", value: "" },
      { color: "#ef4444", count: 8, label: "产品", value: "product" },
      { color: "#3b82f6", count: 2, label: "研发", value: "engineering" },
    ],
    runtime,
    ...options,
  });
}

function create_logger_collector() {
  const entries = [];
  function builder(level) {
    const fields = {};
    return {
      Str(key, value) {
        fields[key] = String(value);
        return this;
      },
      Object(key, value) {
        fields[key] = value;
        return this;
      },
      Msg(message) {
        entries.push({ ...fields, level, message });
      },
    };
  }
  return {
    entries,
    logger: {
      Debug: () => builder("debug"),
      Error: () => builder("error"),
      Info: () => builder("info"),
      Warn: () => builder("warn"),
    },
  };
}

test("ProjectSelectModel exposes project dots and memo counts", () => {
  const model = create_model({ defaultValue: "product" });

  assert.deepEqual(model.selectedOption(), {
    color: "#ef4444",
    count: 8,
    disabled: false,
    key: "product",
    label: "产品",
    searchText: "产品",
    value: "product",
  });
  assert.equal(model.resultSummary(), "2 个 Project");

  model.destroy();
});

test("ProjectSelectModel filters projects and reports search results", () => {
  const model = create_model();

  model.setQuery("研");

  assert.deepEqual(
    model.filteredOptions().map((option) => option.value),
    ["engineering"],
  );
  assert.equal(model.state.activeIndex, 0);
  assert.equal(model.resultSummary(), "1 个搜索结果");

  model.destroy();
});

test("ProjectSelectModel selects the active result and emits once", () => {
  const model = create_model();
  const changes = [];
  model.onValueChange((value) => changes.push(value));

  model.open();
  model.setQuery("产品");
  assert.equal(model.selectActive(), true);

  assert.equal(model.value, "product");
  assert.equal(model.state.open, false);
  assert.deepEqual(changes, ["product"]);

  model.setValue("product");
  assert.deepEqual(changes, ["product"]);

  model.destroy();
});

test("ProjectSelectModel keeps memo counts fresh when options change", () => {
  const model = create_model({ defaultValue: "engineering" });

  model.setOptions([
    { count: 5, label: "未归属", value: "" },
    { color: "#3b82f6", count: 7, label: "研发", value: "engineering" },
  ]);

  assert.equal(model.selectedOption().count, 7);
  assert.equal(model.state.options[0].count, 5);

  model.destroy();
});

test("ProjectSelectModel toggles once for a trigger pointerdown", () => {
  const model = create_model();
  let prevented = 0;
  let stopped = 0;
  const event = {
    preventDefault() {
      prevented += 1;
    },
    stopPropagation() {
      stopped += 1;
    },
  };

  assert.equal(model.handleTriggerPointerDown(event), true);
  assert.equal(model.state.open, true);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  assert.equal(model.handleTriggerPointerDown(event), true);
  assert.equal(model.state.open, false);
  assert.equal(prevented, 2);
  assert.equal(stopped, 2);

  model.destroy();
});

test("ProjectSelectModel uses click as a fallback when pointerdown is absent", () => {
  const element = {
    isConnected: true,
    nodeName: "BUTTON",
    style: {},
    getAttribute(name) {
      return name === "data-n" ? "project-select-trigger" : null;
    },
    getBoundingClientRect() {
      return {
        bottom: 136,
        height: 36,
        left: 240,
        right: 440,
        top: 100,
        width: 200,
        x: 240,
        y: 100,
      };
    },
  };
  const model = create_model();

  model.handleTriggerClick({
    currentTarget: element,
    target: element,
    type: "click",
  });

  assert.equal(model.state.open, true);
  assert.equal(model.popper.reference.$el, element);
  model.destroy();
});

test("ProjectSelectModel does not close again after a handled keyboard activation", () => {
  const model = create_model();
  let prevented = 0;
  const element = {
    isConnected: true,
    nodeName: "BUTTON",
    style: {},
    getAttribute() {
      return null;
    },
    getBoundingClientRect() {
      return {
        bottom: 136,
        height: 36,
        left: 240,
        right: 440,
        top: 100,
        width: 200,
        x: 240,
        y: 100,
      };
    },
  };
  const event = {
    currentTarget: element,
    key: "Enter",
    target: element,
    type: "keydown",
    preventDefault() {
      prevented += 1;
    },
  };

  model.handleTriggerKeyDown(event);
  model.handleTriggerClick({
    currentTarget: element,
    target: element,
    type: "click",
  });

  assert.equal(prevented, 1);
  assert.equal(model.state.open, true);
  model.destroy();
});

test("ProjectSelectModel bootstraps its reference from the first declarative trigger event", () => {
  const { entries, logger } = create_logger_collector();
  const element = {
    id: "project-trigger",
    isConnected: true,
    nodeName: "BUTTON",
    style: {},
    getAttribute(name) {
      return name === "data-n" ? "project-select-trigger" : null;
    },
    getBoundingClientRect() {
      return {
        bottom: 136,
        height: 36,
        left: 240,
        right: 440,
        top: 100,
        width: 200,
        x: 240,
        y: 100,
      };
    },
  };
  const model = create_model({ logger });
  assert.equal(model.popper.reference, null);

  let prevented = 0;
  let stopped = 0;
  const pointer_event = {
    button: 0,
    clientX: 300,
    clientY: 118,
    pointerId: 1,
    pointerType: "mouse",
    currentTarget: element,
    target: element,
    type: "pointerdown",
    preventDefault() {
      prevented += 1;
      this.defaultPrevented = true;
    },
    stopPropagation() {
      stopped += 1;
    },
  };
  model.handleTriggerPointerDown(pointer_event);
  model.handleTriggerClick({
    button: 0,
    clientX: 300,
    clientY: 118,
    currentTarget: element,
    target: element,
    type: "click",
  });

  assert.equal(model.state.open, true);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.deepEqual(model.popper.reference.getRect(), element.getBoundingClientRect());
  assert.ok(
    entries.some((entry) => entry.projectSelectEvent === "trigger-pointerdown"),
  );
  assert.ok(entries.some((entry) => entry.projectSelectEvent === "trigger-click"));
  assert.ok(
    entries.some(
      (entry) => entry.projectSelectEvent === "reference-rect-read",
    ),
  );

  model.setTriggerElement(null);
  assert.equal(model.popper.reference, null);
  model.destroy();
});

test("ProjectSelectModel passes the Timeless DOM platform to Popper", () => {
  const platform = {
    getViewportSize() {
      return { height: 768, width: 1024 };
    },
  };
  const model = create_model({
    runtime: { ...runtime, DOM: { platform } },
  });

  assert.equal(model.popper.platform, platform);
  assert.equal(model.popper.options.strategy, "fixed");
  assert.equal(model.popper.options.align, "start");

  model.destroy();
});

test("ProjectSelectModel creates a project and restores the filtered picker", async () => {
  const model = create_model();
  let created_name = "";
  model.setCreateProjectHandler(async function (name) {
    created_name = name;
    const created = {
      id: "launch",
      name: "Launch Plan",
    };
    model.setOptions([
      ...model.state.options,
      { color: "#f59e0b", count: 0, label: created.name, value: created.id },
    ]);
    return created;
  });

  model.open();
  model.setQuery("Launch Plan");
  assert.equal(model.openCreateDialog(), true);
  await Promise.resolve();

  assert.equal(model.state.open, false);
  assert.equal(model.create_dialog.open, true);
  assert.equal(model.create_name_input.value, "Launch Plan");

  const created = await model.createProject();
  assert.equal(created_name, "Launch Plan");
  assert.equal(created.id, "launch");
  assert.equal(model.state.open, false);
  assert.equal(model.create_dialog.presence.state.exit, true);

  model.create_dialog.finishHide();

  assert.equal(model.state.open, true);
  assert.equal(model.state.query, "Launch Plan");
  assert.equal(model.filteredOptions()[model.state.activeIndex].value, "launch");
  assert.equal(model.value, "");

  model.destroy();
});

test("ProjectSelectModel keeps the create dialog open for invalid names", async () => {
  const model = create_model();
  let create_count = 0;
  model.setCreateProjectHandler(async function () {
    create_count += 1;
  });
  model.create_dialog.show();

  assert.equal(await model.createProject(), false);
  assert.equal(create_count, 0);
  assert.equal(model.state.createError, "请输入 Project 名称");
  assert.equal(model.create_name_input.status, "error");
  assert.equal(model.create_dialog.open, true);

  model.destroy();
});

test("ProjectSelectModel exposes create failures without closing the dialog", async () => {
  const model = create_model();
  model.setCreateProjectHandler(async function () {
    throw new Error("名称已存在");
  });
  model.create_name_input.setValue("产品");
  model.create_dialog.show();

  assert.equal(await model.createProject(), false);
  assert.equal(model.state.createError, "名称已存在");
  assert.equal(model.state.creating, false);
  assert.equal(model.create_dialog.okBtn.state.loading, false);
  assert.equal(model.create_dialog.open, true);

  model.destroy();
});
