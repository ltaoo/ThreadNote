import assert from "node:assert/strict";
import test from "node:test";

function create_ref(initial_value) {
  return {
    value: initial_value,
    as(next_value) {
      this.value = next_value;
    },
    subscribe() {
      return function () {};
    },
  };
}

function create_component(type) {
  return function (props = {}, children = []) {
    return {
      children,
      props,
      t: type,
      destroy() {},
    };
  };
}

test("vault picker unwraps the Timeless mount target before rendering", async function () {
  const previous_timeless = globalThis.Timeless;
  const previous_view = globalThis.View;
  const View = create_component("view");
  let rendered_root = null;
  const runtime = {
    Button: create_component("button"),
    DOM: {
      render(_view, root) {
        rendered_root = root;
      },
    },
    For: create_component("for"),
    Icon: create_component("icon"),
    Input: create_component("input"),
    Show: create_component("show"),
    View,
    computed(source, derive) {
      return create_ref(derive(source.value));
    },
    defineModel(config) {
      return { ...config, destroy() {} };
    },
    ref: create_ref,
    refarr: create_ref,
    registerIcons() {},
  };

  globalThis.Timeless = runtime;
  globalThis.View = View;

  try {
    const { VaultPickerPageView } = await import("./index.js");
    const page = VaultPickerPageView({ runtime });
    const native_root = { appendChild() {} };
    const timeless_root = {
      get$elm() {
        return native_root;
      },
    };

    page.props.onMounted({ target: timeless_root });

    assert.equal(rendered_root, native_root);
  } finally {
    if (previous_timeless === undefined) delete globalThis.Timeless;
    else globalThis.Timeless = previous_timeless;
    if (previous_view === undefined) delete globalThis.View;
    else globalThis.View = previous_view;
  }
});
