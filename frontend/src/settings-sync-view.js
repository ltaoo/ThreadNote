import { SettingsSyncModel } from "./settings-sync-model.js";
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

export function mountSettingsSyncView(options = {}) {
  const document_ref = options.document || globalThis.document;
  if (!document_ref) return null;
  const root = document_ref.querySelector('[data-n="settings-vault-sync-card"]');
  if (!root) return null;

  const provider_value = root.querySelector('[data-n="settings-vault-provider-value"]');
  const provider_description = root.querySelector('[data-n="settings-vault-provider-description"]');
  const open_button = root.querySelector('[data-n="settings-vault-open-directory"]');
  const message = root.querySelector('[data-n="settings-vault-provider-message"]');
  const model = options.model || SettingsSyncModel(options.modelOptions || {});

  function render(state) {
    provider_value.textContent = state.providerLabel;
    provider_description.textContent = state.description;
    open_button.hidden = !state.canOpenDirectory;
    open_button.disabled = state.loading || state.openingDirectory;
    open_button.textContent = state.openingDirectory ? "正在打开…" : "打开目录";
    message.textContent = state.message || "";
    message.style.color = state.messageType === "warning"
      ? "var(--danger)"
      : state.messageType === "ready"
        ? "var(--accent-strong)"
        : "";
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
  mountSettingsSyncView();
}
