import assert from "node:assert/strict";
import test from "node:test";

function view(props = {}, children = []) {
  return {
    children: Array.isArray(children) ? children : [children],
    state: props,
    t: "view",
  };
}

const runtime = {
  Icon(props = {}) {
    return view({ ...props, as: "svg" });
  },
  registerIcons() {},
  ui: {
    ErrorBoundaryPrimitive: {
      withErrorBoundary(render_view, view_name, fallback) {
        try {
          return render_view();
        } catch (error) {
          return fallback(error, view_name);
        }
      },
    },
  },
};

Object.assign(globalThis, { Timeless: runtime, View: view });

const { renderWithErrorBoundary } = await import("./route-status.js");

function find_semantic_node(node, semantic_name) {
  if (!node || typeof node !== "object") return null;
  if (node.state?.attributes?.n === semantic_name) return node;
  for (const child of node.children || []) {
    const match = find_semantic_node(child, semantic_name);
    if (match) return match;
  }
  return null;
}

function text_content(node) {
  if (typeof node === "string") return node;
  return (node?.children || []).map(text_content).join("");
}

test("renderWithErrorBoundary returns the successful view", () => {
  const expected_view = view(
    { attributes: { n: "successful-route" } },
    ["ready"],
  );

  assert.equal(
    renderWithErrorBoundary(() => expected_view, "memo"),
    expected_view,
  );
});

test("renderWithErrorBoundary renders semantic error details", () => {
  const error_view = renderWithErrorBoundary(() => {
    throw new TypeError("TagSelect render failed");
  }, "memo");

  assert.equal(
    text_content(find_semantic_node(error_view, "route-error-title")),
    "页面渲染失败 · TypeError",
  );
  assert.equal(
    text_content(find_semantic_node(error_view, "route-error-context")),
    "memo",
  );
  assert.equal(
    text_content(find_semantic_node(error_view, "route-error-detail")),
    "TagSelect render failed",
  );
  assert.ok(find_semantic_node(error_view, "route-error-stack"));
});
