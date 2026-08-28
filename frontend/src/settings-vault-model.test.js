import assert from "node:assert/strict";
import test from "node:test";

import { SettingsVaultModel } from "./settings-vault-model.js";

test("settings vault model loads the active and registered vaults", async function () {
  const model = SettingsVaultModel({
    services: {
      async loadVaultStatus() {
        return {
          active: {
            entry: { id: "work", name: "Work", path: "/vaults/work" },
            rootDir: "/vaults/work",
          },
          vaults: [
            { id: "work", name: "Work", path: "/vaults/work" },
            { id: "notes", name: "Notes", path: "/vaults/notes" },
          ],
        };
      },
    },
  });

  assert.equal(await model.init(), true);
  assert.deepEqual(model.getState().currentVault, {
    id: "work",
    lastOpenedAt: "",
    name: "Work",
    path: "/vaults/work",
    provider: "local",
  });
  assert.equal(model.getState().vaults.length, 2);
  model.destroy();
});

test("settings vault model switches vault through the global open API", async function () {
  const opened_paths = [];
  const changed_vaults = [];
  let active_path = "/vaults/work";
  const model = SettingsVaultModel({
    onVaultChanged(vault) {
      changed_vaults.push(vault);
    },
    services: {
      async loadVaultStatus() {
        const name = active_path.endsWith("notes") ? "Notes" : "Work";
        return {
          active: { entry: { id: name.toLowerCase(), name, path: active_path } },
          vaults: [
            { id: "work", name: "Work", path: "/vaults/work" },
            { id: "notes", name: "Notes", path: "/vaults/notes" },
          ],
        };
      },
      async openRegisteredVault(id) {
        opened_paths.push(id);
        active_path = id === "notes" ? "/vaults/notes" : "/vaults/work";
        return { existing: true };
      },
    },
  });

  await model.init();
  assert.equal(await model.switchVault({ id: "notes", name: "Notes", path: "/vaults/notes" }), true);
  assert.deepEqual(opened_paths, ["notes"]);
  assert.equal(model.getState().currentVault.id, "notes");
  assert.equal(model.getState().message, "已切换到 Notes");
  assert.equal(model.getState().messageType, "ready");
  assert.equal(changed_vaults.length, 1);
  model.destroy();
});

test("settings vault model opens the picker and reports switch errors", async function () {
  let picker_open_count = 0;
  const model = SettingsVaultModel({
    services: {
      async loadVaultStatus() {
        return { active: null, vaults: [] };
      },
      async openRegisteredVault() {
        throw new Error("not writable");
      },
      async openVaultPicker() {
        picker_open_count += 1;
      },
    },
  });

  assert.equal(await model.chooseVault(), true);
  assert.equal(picker_open_count, 1);
  assert.equal(model.getState().choosing, false);
  assert.equal(model.getState().message, "已打开 Vault 初始化窗口");

  assert.equal(await model.switchVault({ id: "new", name: "New", path: "/vaults/new" }), false);
  assert.equal(model.getState().switchingId, "");
  assert.match(model.getState().message, /not writable/);
  assert.equal(model.getState().messageType, "warning");
  model.destroy();
});
