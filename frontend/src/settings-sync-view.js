import { SettingsSyncModel } from "./settings-sync-model.js";
import { SettingsVaultModel } from "./settings-vault-model.js";
import { Timeless } from "./timeless-icons.js";

export function mountSettingsIcons(document_ref = globalThis.document) {
  if (!document_ref || !Timeless?.DOM?.buildAndRender) return;

  function replace_icon(meaning, icon) {
    const placeholder = document_ref.querySelector(`[data-n="${meaning}"]`);
    if (!placeholder || !icon) return;
    const element = Timeless.DOM.buildAndRender(icon).dom;
    if (!element) return;
    element.setAttribute("n", meaning);
    element.setAttribute("data-n", meaning);
    placeholder.replaceWith(element);
  }

  replace_icon(
    "settings-brand-icon",
    Timeless.Icon({
      name: "file-text",
      size: 24,
      attributes: { n: "settings-brand-icon" },
    }),
  );
  replace_icon(
    "settings-vault-icon",
    Timeless.Icon({
      name: "folder",
      attributes: { n: "settings-vault-icon" },
    }),
  );
  replace_icon(
    "settings-cloud-storage-icon",
    Timeless.Icon({
      name: "cloud-download",
      attributes: { n: "settings-cloud-storage-icon" },
    }),
  );
  replace_icon(
    "settings-shortcuts-icon",
    Timeless.Icon({
      name: "settings",
      attributes: { n: "settings-shortcuts-icon" },
    }),
  );
  replace_icon(
    "settings-input-source-icon",
    Timeless.Icon({
      name: "settings",
      attributes: { n: "settings-input-source-icon" },
    }),
  );
  replace_icon(
    "settings-calendar-icon",
    Timeless.Icon({
      name: "calendar",
      attributes: { n: "settings-calendar-icon" },
    }),
  );
  replace_icon(
    "settings-webhook-icon",
    Timeless.Icon({
      name: "file-symlink",
      attributes: { n: "settings-webhook-icon" },
    }),
  );
  replace_icon(
    "settings-about-icon",
    Timeless.Icon({
      name: "activity",
      attributes: { n: "settings-about-icon" },
    }),
  );
  replace_icon(
    "settings-config-status-icon",
    Timeless.Icon({
      name: "circle-alert",
      attributes: { n: "settings-config-status-icon" },
    }),
  );
}

export function mountSettingsVaultView(options = {}) {
  const document_ref = options.document || globalThis.document;
  if (!document_ref) return null;
  const root = document_ref.querySelector('[data-n="settings-vault-panel"]');
  if (!root) return null;

  const current_name = root.querySelector('[data-n="settings-vault-current-name"]');
  const current_path = root.querySelector('[data-n="settings-vault-current-path"]');
  const current_badge = root.querySelector('[data-n="settings-vault-current-badge"]');
  const choose_button = root.querySelector('[data-n="settings-vault-choose"]');
  const vault_list = root.querySelector('[data-n="settings-vault-list"]');
  const message = root.querySelector('[data-n="settings-vault-message"]');
  const model = options.model || SettingsVaultModel(options.modelOptions || {});

  function append_vault_item(vault, state) {
    const selected = Boolean(
      state.currentVault && (
        (vault.id && vault.id === state.currentVault.id)
        || vault.path === state.currentVault.path
      ),
    );
    const button = document_ref.createElement("button");
    button.className = "settings-storage-item" + (selected ? " is-selected" : "");
    button.type = "button";
    button.disabled = state.loading || state.choosing || Boolean(state.switchingPath) || selected;
    button.dataset.vaultPath = vault.path;
    button.setAttribute("data-n", "settings-vault-item");
    if (selected) button.setAttribute("aria-current", "true");

    const main = document_ref.createElement("span");
    main.className = "settings-storage-item-main";
    const name = document_ref.createElement("span");
    name.className = "settings-storage-item-name";
    name.textContent = vault.name;
    const path = document_ref.createElement("span");
    path.className = "settings-storage-item-meta";
    path.textContent = vault.path;
    main.append(name, path);

    const badge = document_ref.createElement("span");
    badge.className = "settings-storage-badge";
    badge.textContent = selected
      ? "当前"
      : state.switchingPath === vault.path
        ? "切换中"
        : "切换";
    button.append(main, badge);
    vault_list.append(button);
  }

  function render(state) {
    const current_vault = state.currentVault;
    current_name.textContent = current_vault ? current_vault.name : "未选择 Vault";
    current_path.textContent = current_vault ? current_vault.path : "请选择一个 Vault 目录";
    current_badge.textContent = current_vault ? "当前" : "未选择";
    choose_button.disabled = state.loading || state.choosing || Boolean(state.switchingPath);
    choose_button.textContent = state.choosing ? "正在选择…" : "切换 Vault";

    vault_list.replaceChildren();
    if (state.vaults.length === 0) {
      const empty = document_ref.createElement("div");
      empty.className = "settings-shortcut-description";
      empty.textContent = state.loading ? "正在读取已登记 Vault…" : "还没有已登记的 Vault。";
      vault_list.append(empty);
    } else {
      state.vaults.forEach(function (vault) {
        append_vault_item(vault, state);
      });
    }

    message.textContent = state.message || "";
    message.style.color = state.messageType === "warning"
      ? "var(--danger)"
      : state.messageType === "ready"
        ? "var(--accent-strong)"
        : "";
  }

  const unsubscribe = model.subscribe(render);
  choose_button.addEventListener("click", function () {
    model.chooseVault();
  });
  vault_list.addEventListener("click", function (event) {
    const button = event.target.closest("[data-vault-path]");
    if (!button || !vault_list.contains(button)) return;
    model.switchVault(button.dataset.vaultPath || "");
  });
  model.init();

  return {
    destroy() {
      unsubscribe();
      model.destroy();
    },
    model,
  };
}

export function mountSettingsSyncView(options = {}) {
  const document_ref = options.document || globalThis.document;
  if (!document_ref) return null;
  const root = document_ref.querySelector('[data-n="settings-vault-sync-card"]');
  if (!root) return null;

  const provider_value = root.querySelector('[data-n="settings-vault-provider-value"]');
  const provider_description = root.querySelector('[data-n="settings-vault-provider-description"]');
  const open_button = root.querySelector('[data-n="settings-vault-open-directory"]');
  const message = document_ref.querySelector('[data-n="settings-vault-provider-message"]');
  const model = options.model || SettingsSyncModel(options.modelOptions || {});

  function render(state) {
    provider_value.textContent = state.providerLabel;
    provider_description.textContent = state.description;
    open_button.hidden = !state.canOpenDirectory;
    open_button.disabled = state.loading || state.openingDirectory;
    open_button.textContent = state.openingDirectory ? "正在打开…" : "打开目录";
    if (message) {
      message.textContent = state.message || "";
      message.style.color = state.messageType === "warning"
        ? "var(--danger)"
        : state.messageType === "ready"
          ? "var(--accent-strong)"
          : "";
    }
  }

  const unsubscribe = model.subscribe(render);
  open_button.addEventListener("click", function () {
    model.openDirectory();
  });
  model.init();

  return {
    destroy() {
      unsubscribe();
      model.destroy();
    },
    model,
  };
}

if (typeof document !== "undefined") {
  mountSettingsIcons();
  const sync_view = mountSettingsSyncView();
  mountSettingsVaultView({
    modelOptions: {
      onVaultChanged() {
        if (globalThis.location && typeof globalThis.location.reload === "function") {
          globalThis.setTimeout(function () {
            globalThis.location.reload();
          }, 120);
          return;
        }
        if (sync_view) sync_view.model.init();
      },
    },
  });
}
