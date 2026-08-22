import assert from "node:assert/strict";
import test from "node:test";

import { SettingsSyncModel, providerDescription, providerLabel } from "./settings-sync-model.js";

test("settings sync model exposes the current local provider", async function () {
  const model = SettingsSyncModel({
    services: {
      async loadVaultSync() {
        return { provider: "local", usesLocalDirectory: true };
      },
    },
  });

  assert.equal(await model.init(), true);
  assert.deepEqual(model.getState(), {
    canOpenDirectory: true,
    description: "Vault 数据直接保存在当前本地目录。",
    loading: false,
    message: "",
    messageType: "",
    openingDirectory: false,
    provider: "local",
    providerLabel: "Local",
  });
  model.destroy();
});

test("settings sync model opens the directory for github", async function () {
  let open_count = 0;
  const model = SettingsSyncModel({
    services: {
      async loadVaultSync() {
        return { provider: "github", usesLocalDirectory: true };
      },
      async openVaultSyncDirectory() {
        open_count += 1;
        return { success: true };
      },
    },
  });

  await model.init();
  assert.equal(model.getState().providerLabel, "GitHub");
  assert.equal(await model.openDirectory(), true);
  assert.equal(open_count, 1);
  assert.equal(model.getState().message, "已打开 Vault 目录");
  model.destroy();
});

test("settings sync model hides local actions for remote-only providers", async function () {
  let open_count = 0;
  const model = SettingsSyncModel({
    services: {
      async loadVaultSync() {
        return { provider: "remote-only", usesLocalDirectory: false };
      },
      async openVaultSyncDirectory() {
        open_count += 1;
      },
    },
  });

  await model.init();
  assert.equal(model.getState().canOpenDirectory, false);
  assert.equal(await model.openDirectory(), false);
  assert.equal(open_count, 0);
  assert.equal(providerLabel("r2"), "Cloudflare R2");
  assert.match(providerDescription("custom"), /custom provider/);
  model.destroy();
});

test("settings sync model keeps load and open errors in model state", async function () {
  const load_model = SettingsSyncModel({
    services: {
      async loadVaultSync() {
        throw new Error("offline");
      },
    },
  });
  assert.equal(await load_model.init(), false);
  assert.equal(load_model.getState().providerLabel, "读取失败");
  assert.match(load_model.getState().message, /offline/);
  load_model.destroy();

  const open_model = SettingsSyncModel({
    services: {
      async loadVaultSync() {
        return { provider: "local", usesLocalDirectory: true };
      },
      async openVaultSyncDirectory() {
        throw new Error("finder unavailable");
      },
    },
  });
  await open_model.init();
  assert.equal(await open_model.openDirectory(), false);
  assert.equal(open_model.getState().openingDirectory, false);
  assert.match(open_model.getState().message, /finder unavailable/);
  open_model.destroy();
});
