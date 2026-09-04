import assert from "node:assert/strict";
import test from "node:test";

import { HomeCredentialsPageModel } from "./home_credentials.model.js";

function test_ref(value) {
  return {
    value,
    as(next_value) {
      this.value = next_value;
    },
  };
}

const runtime = {
  combine(sources, transform) {
    return {
      get value() {
        return transform(Object.fromEntries(
          Object.entries(sources).map(function ([key, source]) {
            return [key, source.value];
          }),
        ));
      },
    };
  },
  computed(source, transform) {
    return { get value() { return transform(source.value); } };
  },
  ref: test_ref,
};

test("credentials model unlocks, redacts, reveals and clears copied secrets", async function () {
  const requests = [];
  const clipboard = { value: "" };
  const timers = [];
  const item = {
    fields: [{
      hasValue: true,
      id: "password-field",
      label: "密码",
      secret: true,
      value: "",
    }],
    id: "login-1",
    notes: "",
    tags: ["work"],
    title: "Example",
    type: "login",
    updatedAt: "2026-09-04T00:00:00Z",
    url: "https://example.com",
  };
  const model = HomeCredentialsPageModel({
    runtime,
    request: async function (url, options) {
      requests.push({ options, url });
      if (url.endsWith("/status")) {
        return { code: 0, data: { initialized: true, unlocked: false } };
      }
      if (url.endsWith("/unlock")) {
        return { code: 0, data: { unlocked: true } };
      }
      if (url === "/api/credentials") {
        return { code: 0, data: { items: [item] } };
      }
      if (url.endsWith("/get")) {
        return { code: 0, data: { item } };
      }
      if (url.endsWith("/reveal")) {
        return { code: 0, data: { value: "secret-value" } };
      }
      return { code: 0, data: {} };
    },
    readClipboard: async () => clipboard.value,
    writeClipboard: async function (value) {
      clipboard.value = value;
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  });

  await model.methods.init();
  assert.equal(model.state.phase.value, "locked");
  model.methods.setUnlockPassword("correct horse battery staple");
  await model.methods.unlock();
  assert.equal(model.state.phase.value, "unlocked");
  assert.equal(model.ui.visibleItems.value.length, 1);

  await model.methods.selectItem("login-1");
  const field = model.state.selectedFields.value[0];
  assert.equal(model.ui.fieldDisplayValue(field).value, "••••••••••••");
  await model.methods.toggleReveal(field);
  assert.equal(model.ui.fieldDisplayValue(field).value, "secret-value");
  await model.methods.copyField(field);
  assert.equal(clipboard.value, "secret-value");
  const clipboard_timer = timers[timers.length - 1];
  assert.ok(clipboard_timer);
  await clipboard_timer.callback();
  assert.equal(clipboard.value, "");
  assert.ok(requests.some(function (entry) {
    return entry.url === "/api/credentials/reveal" && entry.options.method === "POST";
  }));
  model.methods.destroy();
});
