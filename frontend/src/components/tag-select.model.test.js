import assert from "node:assert/strict";
import test from "node:test";

import { TagSelectModel } from "./tag-select.model.js";

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
  }

  place() {
    this.place_count += 1;
  }

  setReference(reference) {
    this.reference = reference;
  }

  removeReference() {
    this.reference = null;
  }

  reset() {}

  destroy() {}
}

const runtime = {
  vm: {
    PopperCore: PopperStub,
    PresenceCore: PresenceStub,
  },
};

function create_model(options = {}) {
  return new TagSelectModel({
    options: [
      { count: 3, label: "#work", value: "work" },
      { count: 2, label: "#home", value: "home" },
      { count: 1, label: "#later", value: "later" },
    ],
    runtime,
    ...options,
  });
}

function create_trigger_element() {
  return {
    getBoundingClientRect() {
      return {
        bottom: 136,
        height: 36,
        left: 240,
        right: 340,
        top: 100,
        width: 100,
        x: 240,
        y: 100,
      };
    },
  };
}

test("TagSelectModel toggles multiple tags without closing", () => {
  const model = create_model();
  const changes = [];
  model.onValueChange((values) => changes.push(values));

  model.open();
  assert.equal(model.toggleValue("work"), true);
  assert.equal(model.toggleValue("home"), true);

  assert.equal(model.state.open, true);
  assert.deepEqual(model.values, ["work", "home"]);
  assert.deepEqual(changes, [["work"], ["work", "home"]]);

  model.toggleValue("work");
  assert.deepEqual(model.values, ["home"]);
  model.destroy();
});

test("TagSelectModel filters and toggles the active option from keyboard", () => {
  const model = create_model();
  let prevented = 0;

  model.open();
  model.setQuery("home");
  model.handleSearchKeyDown({
    isComposing: false,
    key: "Enter",
    preventDefault() {
      prevented += 1;
    },
  });

  assert.deepEqual(
    model.filteredOptions().map((option) => option.value),
    ["home"],
  );
  assert.deepEqual(model.values, ["home"]);
  assert.equal(model.state.open, true);
  assert.equal(prevented, 1);
  model.destroy();
});

test("TagSelectModel suppresses the click following pointerdown", () => {
  const model = create_model();
  const element = create_trigger_element();
  let prevented = 0;
  let stopped = 0;
  const pointer_event = {
    currentTarget: element,
    target: element,
    preventDefault() {
      prevented += 1;
    },
    stopPropagation() {
      stopped += 1;
    },
  };

  model.handleTriggerPointerDown(pointer_event);
  model.handleTriggerClick({ currentTarget: element, target: element });

  assert.equal(model.state.open, true);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(model.popper.reference.$el, element);
  model.destroy();
});

test("TagSelectModel uses click as a fallback and registers its reference", () => {
  const model = create_model();
  const element = create_trigger_element();

  model.handleTriggerClick({ currentTarget: element, target: element });

  assert.equal(model.state.open, true);
  assert.deepEqual(model.popper.reference.getRect(), element.getBoundingClientRect());
  model.destroy();
});

test("TagSelectModel updates values silently and refreshes counts", () => {
  const model = create_model();
  const changes = [];
  model.onValueChange((values) => changes.push(values));

  model.setValues(["home", "home"], { silent: true });
  model.setOptions([
    { count: 7, label: "#home", value: "home" },
    { count: 4, label: "#work", value: "work" },
  ]);

  assert.deepEqual(model.values, ["home"]);
  assert.deepEqual(changes, []);
  assert.equal(model.state.options[0].count, 7);
  assert.equal(model.triggerLabel(), "标签");
  model.destroy();
});

test("TagSelectModel passes the Timeless DOM platform to Popper", () => {
  const platform = {
    getViewportSize() {
      return { height: 768, width: 1024 };
    },
  };
  const model = create_model({ runtime: { ...runtime, DOM: { platform } } });

  assert.equal(model.popper.platform, platform);
  assert.equal(model.popper.options.strategy, "fixed");
  assert.equal(model.popper.options.align, "start");
  model.destroy();
});
