import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const select_js = readFileSync(new URL("./tnui/select.js", import.meta.url), "utf8");
const select_css = readFileSync(new URL("./tnui/select.css", import.meta.url), "utf8");

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

test("select option active state is driven by model mouse events", () => {
  assert.match(select_js, /onMouseEnter\(\)\s*{\s*select_store\.handleMouseEnterItem\(entry\)/);
  assert.match(select_js, /onMouseLeave\(\)\s*{\s*select_store\.handleMouseLeaveItem\(entry\)/);
  assert.match(select_css, /\.tn-select__item\.is-active\s*{/);
  assert.doesNotMatch(select_css, /\.tn-select__item:hover/);
});
