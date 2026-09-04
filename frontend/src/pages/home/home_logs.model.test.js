import assert from "node:assert/strict";
import test from "node:test";

import { HomeLogsPageModel } from "./home_logs.model.js";

globalThis.ref = function (initial_value) {
  return {
    value: initial_value,
    as(next_value) {
      this.value = next_value;
    },
  };
};

globalThis.computed = function (source, transform) {
  return { get value() { return transform(source.value); } };
};

class TestButtonCore {
  constructor(options = {}) {
    this.state = {
      disabled: Boolean(options.disabled),
      loading: false,
      size: options.size || "md",
      variant: options.variant || "default",
    };
  }

  destroy() {}

  disable() {
    this.state.disabled = true;
  }

  enable() {
    this.state.disabled = false;
  }

  setLoading(loading) {
    this.state.loading = loading;
  }

  setVariant(variant) {
    this.state.variant = variant;
  }
}

class TestInputCore {
  constructor(options = {}) {
    this.state = { placeholder: options.placeholder || "" };
    this.value = options.defaultValue || "";
  }

  destroy() {}

  setValue(value) {
    this.value = value;
  }
}

globalThis.Timeless = {
  combine(sources, transform) {
    return {
      get value() {
        return transform(Object.fromEntries(
          Object.entries(sources).map(([key, source]) => [key, source.value]),
        ));
      },
    };
  },
  vm: {
    ButtonCore: TestButtonCore,
    InputCore: TestInputCore,
  },
};

test("logs model filters backend logs and normalizes entries", async function () {
  const requests = [];
  const model = HomeLogsPageModel({
    clearInterval() {},
    confirm: () => false,
    request: async function (url, options) {
      requests.push({ options, url });
      return {
        code: 0,
        data: {
          entries: [{
            component: "frontend",
            level: "error",
            memoId: "memo-1",
            message: "memo expand dom-resolved",
            timestamp: "2026-08-26T01:02:03Z",
          }],
          files: [{ path: "/tmp/app.log" }],
          page: 1,
          page_size: 200,
          total: 1,
        },
      };
    },
    setInterval: () => 1,
  });

  model.methods.setKeyword("memo-1");
  model.methods.setComponent("frontend");
  await model.methods.setLevel("error");

  assert.match(requests[0].url, /keyword=memo-1/);
  assert.match(requests[0].url, /component=frontend/);
  assert.match(requests[0].url, /levels=error/);
  assert.equal(model.state.total.value, 1);
  assert.equal(model.ui.entries.value[0].message, "memo expand dom-resolved");
  assert.match(model.ui.entries.value[0].detailsText, /memo-1/);
  assert.equal(model.ui.logPath.value, "/tmp/app.log");
  assert.equal(
    model.ui.keywordInput.state.placeholder,
    "搜索消息、memo ID、阶段或数据…",
  );
  assert.equal(model.ui.levelButtons.error.state.variant, "primary");
  assert.equal(model.ui.levelButtons.all.state.variant, "ghost");
  model.methods.destroy();
});
