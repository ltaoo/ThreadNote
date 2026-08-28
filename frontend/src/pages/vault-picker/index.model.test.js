import assert from "node:assert/strict";
import test from "node:test";

import { VaultPickerPageModel } from "./index.model.js";

function create_ref(initial_value) {
  let value_ = initial_value;
  const listeners_ = new Set();
  return {
    get value() {
      return value_;
    },
    as(next_value) {
      value_ = typeof next_value === "function" ? next_value(value_) : next_value;
      listeners_.forEach(function (listener) {
        listener(value_);
      });
    },
    subscribe(listener) {
      const callback = listener.onChange || listener;
      listeners_.add(callback);
      return function () {
        listeners_.delete(callback);
      };
    },
  };
}

function create_runtime() {
  return {
    defineModel(config) {
      return {
        ...config,
        destroy() {},
      };
    },
    ref: create_ref,
    refarr: create_ref,
  };
}

test("vault picker model loads status into reactive state", async function () {
  const model = VaultPickerPageModel({
    runtime: create_runtime(),
    services: {
      async loadVaultStatus() {
        return {
          active: { path: "/vaults/work" },
          dataFileExists: true,
          dataPath: "/data/threadnote.json",
          vaults: [{ name: "Work", path: "/vaults/work" }],
        };
      },
    },
  });

  assert.equal(await model.methods.init(), true);
  assert.equal(model.state.loading.value, false);
  assert.equal(model.state.dataFileExists.value, true);
  assert.equal(model.state.dataPath.value, "/data/threadnote.json");
  assert.deepEqual(model.state.vaults.value, [
    { name: "Work", path: "/vaults/work" },
  ]);
  model.destroy();
});

test("vault picker model chooses, opens, and redirects to a vault", async function () {
  const opened_paths = [];
  let redirects = 0;
  const model = VaultPickerPageModel({
    redirect() {
      redirects += 1;
    },
    redirectDelay: 0,
    runtime: create_runtime(),
    services: {
      async openVault(path) {
        opened_paths.push(path);
        return { created: true };
      },
      async selectVaultDirectory() {
        return " /vaults/new ";
      },
    },
  });

  assert.equal(await model.methods.chooseVault(), true);
  await new Promise(function (resolve) {
    globalThis.setTimeout(resolve, 0);
  });

  assert.deepEqual(opened_paths, ["/vaults/new"]);
  assert.equal(model.state.path.value, "/vaults/new");
  assert.equal(model.state.message.value, "已创建 vault");
  assert.equal(model.state.messageType.value, "success");
  assert.equal(redirects, 1);
  model.destroy();
});

test("vault picker model keeps validation and service errors in state", async function () {
  const model = VaultPickerPageModel({
    runtime: create_runtime(),
    services: {
      async openVault() {
        throw new Error("disk unavailable");
      },
    },
  });

  assert.equal(await model.methods.openVault("  "), false);
  assert.equal(model.state.message.value, "请输入或选择 vault 目录");
  assert.equal(model.state.messageType.value, "warning");

  assert.equal(await model.methods.openVault("/vaults/broken"), false);
  assert.equal(model.state.message.value, "打开 vault 失败: disk unavailable");
  assert.equal(model.state.messageType.value, "error");
  assert.equal(model.state.loading.value, false);
  model.destroy();
});

test("vault picker model cancels its redirect when destroyed", async function () {
  let redirects = 0;
  const model = VaultPickerPageModel({
    redirect() {
      redirects += 1;
    },
    redirectDelay: 5,
    runtime: create_runtime(),
    services: {
      async openVault() {
        return { created: false };
      },
    },
  });

  assert.equal(await model.methods.openVault("/vaults/work"), true);
  model.destroy();
  await new Promise(function (resolve) {
    globalThis.setTimeout(resolve, 15);
  });

  assert.equal(redirects, 0);
});

test("vault picker model validates and opens a Cloudflare vault", async function () {
  const opened_configs = [];
  const model = VaultPickerPageModel({
    redirect() {},
    redirectDelay: 0,
    runtime: create_runtime(),
    services: {
      async openCloudflareVault(config) {
        opened_configs.push(config);
        return { created: true };
      },
    },
  });

  model.methods.setMode("cloudflare");
  assert.equal(await model.methods.openCloudflareVault(), false);
  assert.equal(model.state.message.value, "请填写 Account ID");

  const config = {
    accountId: "account",
    apiToken: "token",
    databaseId: "database",
    name: "Remote",
    r2AccessKeyId: "access",
    r2Bucket: "assets",
    r2SecretAccessKey: "secret",
  };
  Object.entries(config).forEach(function ([field, value]) {
    model.methods.setCloudflareField(field, value);
  });

  assert.equal(await model.methods.openCloudflareVault(), true);
  assert.deepEqual(opened_configs, [config]);
  assert.equal(model.state.message.value, "已创建 Cloudflare vault");
  model.destroy();
});

test("vault picker model reopens a registered Cloudflare vault by id", async function () {
  const opened_ids = [];
  const model = VaultPickerPageModel({
    redirect() {},
    redirectDelay: 0,
    runtime: create_runtime(),
    services: {
      async openRegisteredVault(id) {
        opened_ids.push(id);
        return { existing: true };
      },
    },
  });

  assert.equal(await model.methods.openRegisteredVault({
    id: "cloud",
    name: "Remote",
    path: "cloudflare://account/database",
    provider: "cloudflare",
  }), true);
  assert.deepEqual(opened_ids, ["cloud"]);
  model.destroy();
});
