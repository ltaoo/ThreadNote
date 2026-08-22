import assert from "node:assert/strict";
import test from "node:test";

test("component entry exposes only base components in the tn namespace", async () => {
  const previous_runtime = globalThis.Timeless;
  globalThis.Timeless = {
    ui: {},
    vm: {},
    classNames(values) {
      return values;
    },
  };

  try {
    const component_entry = await import("./tnui.js");
    assert.deepEqual(Object.keys(component_entry), ["tn"]);
    assert.equal(typeof component_entry.tn.Button, "function");
    assert.equal(typeof component_entry.tn.DropdownMenu, "function");
    assert.equal("DropdownMenuModel" in component_entry.tn, false);
    assert.equal("MemoCard" in component_entry.tn, false);
    assert.equal("SmallCalendar" in component_entry.tn, false);
    assert.equal(Object.isFrozen(component_entry.tn), true);
  } finally {
    if (previous_runtime === undefined) delete globalThis.Timeless;
    else globalThis.Timeless = previous_runtime;
  }
});
