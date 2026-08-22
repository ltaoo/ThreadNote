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
      async openVault(path) {
        opened_paths.push(path);
        active_path = path;
        return { existing: true };
      },
    },
  });

  await model.init();
  assert.equal(await model.switchVault(" /vaults/notes "), true);
  assert.deepEqual(opened_paths, ["/vaults/notes"]);
  assert.equal(model.getState().currentVault.id, "notes");
  assert.equal(model.getState().message, "已切换到 Notes");
  assert.equal(model.getState().messageType, "ready");
  assert.equal(changed_vaults.length, 1);
  model.destroy();
});

test("settings vault model chooses a directory and reports switch errors", async function () {
  const opened_paths = [];
  const model = SettingsVaultModel({
    services: {
      async loadVaultStatus() {
        return { active: null, vaults: [] };
      },
      async openVault(path) {
        opened_paths.push(path);
        throw new Error("not writable");
      },
      async selectVaultDirectory() {
        return " /vaults/new ";
      },
    },
  });

  assert.equal(await model.chooseVault(), false);
  assert.deepEqual(opened_paths, ["/vaults/new"]);
  assert.equal(model.getState().choosing, false);
  assert.equal(model.getState().switchingPath, "");
  assert.match(model.getState().message, /not writable/);
  assert.equal(model.getState().messageType, "warning");
  model.destroy();
});
