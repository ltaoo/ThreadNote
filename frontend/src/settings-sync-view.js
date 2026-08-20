import { SettingsSyncModel } from "./settings-sync-model.js";

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
  mountSettingsSyncView();
}
