import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function find_node(node, meaning) {
  if (node.state?.attributes?.n === meaning) return node;
  for (const child of node.children || []) {
    const found = child && find_node(child, meaning);
    if (found) return found;
  }
  return null;
}

function attach_elements(node) {
  // The real Timeless components expect a DOM adapter for reactive updates.
  node.$elm = {
    setAttribute() {},
    removeAttribute() {},
    setStyleSet() {},
    setText() {},
    setValue() {},
  };
  for (const child of node.children || []) {
    if (child) attach_elements(child);
  }
}

test("credential editing retains field nodes and updates values and secret controls", async function () {
  const context = { setInterval() {}, clearInterval() {} };
  runInNewContext(readFileSync(new URL(
    "../../../public/timeless/0.33.1/timeless.umd.min.js", import.meta.url,
  ), "utf8"), context);
  const previous_timeless = globalThis.Timeless;
  globalThis.Timeless = context.Timeless;

  try {
    const { default: HomeCredentialsPageView } = await import("./home_credentials.js");
    let saved_payload;
    const page = HomeCredentialsPageView({
      request: async function (url, options) {
        if (url.endsWith("/save")) saved_payload = options.args;
        return {
          code: 0,
          data: url.endsWith("/status")
            ? { initialized: true, unlocked: true }
            : { items: [] },
        };
      },
      setTimeout() {},
      clearTimeout() {},
    });
    attach_elements(page);
    page.onMounted({});
    await new Promise(setImmediate);
    find_node(page, "credential-new-button").events.onClick();
    attach_elements(page);
    const fields = find_node(page, "credential-editor-fields").children.find(
      function (node) { return node.t === "for"; },
    );
    const [username_row, password_row] = fields.children;
    const name_input = find_node(username_row, "credential-editor-field-name");
    const value_input = find_node(username_row, "credential-editor-field-value");
    const password_input = find_node(password_row, "credential-editor-field-value");

    for (const [input, value] of [
      [name_input, "账号"], [value_input, "user"], [password_input, "secret"],
    ]) {
      for (let length = 1; length <= value.length; length += 1) {
        input.events.onInput({ currentTarget: { value: value.slice(0, length) } });
        assert.equal(fields.children[0], username_row);
        assert.equal(fields.children[1], password_row);
        assert.equal(input.state.value, value.slice(0, length));
      }
    }
    assert.equal(value_input.state.attributes["aria-label"], "账号的值");
    const secret_checkbox = find_node(username_row, "credential-editor-field-secret");
    secret_checkbox.events.onChange({ currentTarget: { checked: true } });
    assert.equal(secret_checkbox.state.checked, true);
    assert.ok(value_input.state.styleSet.includes("is-secret"));
    find_node(username_row, "credential-editor-field-toggle").events.onClick();
    assert.equal(value_input.state.styleSet.includes("is-secret"), false);
    secret_checkbox.events.onChange({ currentTarget: { checked: false } });
    assert.equal(find_node(username_row, "credential-editor-field-toggle"), null);

    find_node(page, "credential-editor-field-add").events.onClick();
    attach_elements(page);
    assert.equal(fields.children.length, 3);
    assert.equal(fields.children[0], username_row);
    find_node(fields.children[2], "credential-editor-field-remove").events.onClick();
    assert.equal(fields.children.length, 2);
    assert.equal(fields.children[1], password_row);

    find_node(page, "credential-editor-title-input").events.onInput({
      currentTarget: { value: "Example" },
    });
    find_node(page, "credential-editor-save").events.onClick();
    await new Promise(setImmediate);
    assert.equal(saved_payload.fields[0].label, "账号");
    assert.equal(saved_payload.fields[0].value, "user");
    assert.equal(saved_payload.fields[0].secret, false);
    assert.equal(saved_payload.fields[1].value, "secret");
    assert.equal(find_node(page, "credential-editor"), null);
  } finally {
    if (previous_timeless === undefined) delete globalThis.Timeless;
    else globalThis.Timeless = previous_timeless;
  }
});
