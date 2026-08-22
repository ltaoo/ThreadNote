import assert from "node:assert/strict";
import test from "node:test";

import { createRouteErrorPresentation } from "./route-status.model.js";

test("route error presentation preserves Error details", () => {
  const error = new TypeError("TagSelect render failed");
  const presentation = createRouteErrorPresentation(error, "memo");

  assert.equal(presentation.context, "memo");
  assert.equal(presentation.name, "TypeError");
  assert.equal(presentation.message, "TagSelect render failed");
  assert.match(presentation.stack, /TagSelect render failed/);
});

test("route error presentation normalizes arbitrary thrown values", () => {
  const presentation = createRouteErrorPresentation("broken", "");

  assert.equal(presentation.context, "未知页面");
  assert.equal(presentation.message, "broken");
  assert.equal(presentation.name, "Error");
  assert.match(presentation.stack, /broken/);
});
