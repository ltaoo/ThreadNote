import assert from "node:assert/strict";
import test from "node:test";

import {
  SettingsMemoStorageModel,
  normalizeConfig,
  syncDescription,
} from "./settings-memo-storage-model.js";

test("memo storage config normalizes D1 without retaining a returned token", function () {
  const config = normalizeConfig({
    d1: {
      accountId: " account ",
      apiToken: "must-not-be-retained",
      apiTokenConfigured: true,
      databaseId: " database ",
    },
    provider: "D1",
  });
  assert.equal(config.provider, "d1");
  assert.equal(config.d1.accountId, "account");
  assert.equal(config.d1.databaseId, "database");
  assert.equal(config.d1.apiToken, "");
  assert.equal(config.d1.apiTokenConfigured, true);
});

test("memo storage model tests, saves, and synchronizes D1", async function () {
  const calls = [];
  const model = SettingsMemoStorageModel({
    services: {
      async loadMemoStorageSettings() {
        return {
          config: {
            d1: {
              accountId: "account",
              apiBaseUrl: "https://api.cloudflare.com/client/v4",
              apiTokenConfigured: false,
              databaseId: "database",
            },
            provider: "d1",
          },
          state: { dirty: true },
        };
      },
      async saveMemoStorageSettings(config) {
        calls.push(["save", config]);
        return {
          config: {
            d1: {
              accountId: config.d1.accountId,
              apiBaseUrl: config.d1.apiBaseUrl,
              apiTokenConfigured: true,
              databaseId: config.d1.databaseId,
            },
            provider: config.provider,
          },
          state: { dirty: true, lastError: "请执行同步" },
        };
      },
      async syncD1MemoStorage() {
        calls.push(["sync"]);
        return {
          memoCount: 7,
          state: {
            dirty: false,
            lastSyncedAt: "2026-08-24T08:00:00Z",
            remoteMemoCount: 7,
          },
        };
      },
      async testD1MemoStorage(config) {
        calls.push(["test", config]);
        return { success: true };
      },
    },
  });

  assert.equal(await model.init(), true);
  model.updateField("apiToken", "token-value");
  assert.equal(await model.testConnection(), true);
  assert.equal(calls[0][0], "test");
  assert.equal(calls[0][1].d1.apiToken, "token-value");
  assert.equal(await model.syncAll(), false);
  assert.match(model.getState().message, /先保存/);
  assert.equal(await model.save(), true);
  assert.equal(calls[1][0], "save");
  assert.equal(calls[1][1].d1.apiToken, "token-value");
  assert.equal(model.getState().config.d1.apiToken, "");
  assert.equal(await model.syncAll(), true);
  assert.equal(calls[2][0], "sync");
  assert.equal(model.getState().syncState.dirty, false);
  assert.match(model.getState().description, /7 条 Memo/);
});

test("memo storage description explains the Local and pending D1 states", function () {
  assert.match(syncDescription(normalizeConfig(null), { dirty: false }), /Local Markdown/);
  assert.equal(
    syncDescription(normalizeConfig({ provider: "d1" }), { dirty: true, lastError: "pending" }),
    "pending",
  );
});
