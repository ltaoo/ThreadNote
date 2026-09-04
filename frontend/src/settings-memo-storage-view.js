import { SettingsMemoStorageModel } from "./settings-memo-storage-model.js";

export function mountSettingsMemoStorageView(options = {}) {
  const document_ref = options.document || globalThis.document;
  if (!document_ref) return null;
  const root = document_ref.querySelector('[data-n="settings-memo-storage-card"]');
  if (!root) return null;

  const provider_input = root.querySelector('[data-n="settings-memo-storage-provider"]');
  const d1_fields = root.querySelector('[data-n="settings-memo-storage-d1-fields"]');
  const account_input = root.querySelector('[data-n="settings-memo-storage-account-id"]');
  const database_input = root.querySelector('[data-n="settings-memo-storage-database-id"]');
  const token_input = root.querySelector('[data-n="settings-memo-storage-api-token"]');
  const api_base_input = root.querySelector('[data-n="settings-memo-storage-api-base-url"]');
  const description = root.querySelector('[data-n="settings-memo-storage-description"]');
  const test_button = root.querySelector('[data-n="settings-memo-storage-test"]');
  const save_button = root.querySelector('[data-n="settings-memo-storage-save"]');
  const sync_button = root.querySelector('[data-n="settings-memo-storage-sync"]');
  const message = document_ref.querySelector('[data-n="settings-memo-storage-message"]');
  const model = options.model || SettingsMemoStorageModel(options.modelOptions || {});

  function render(state) {
    const busy = state.loading || state.saving || state.testing || state.syncing;
    provider_input.value = state.config.provider;
    d1_fields.hidden = state.config.provider !== "d1";
    account_input.value = state.config.d1.accountId;
    database_input.value = state.config.d1.databaseId;
    if (document_ref.activeElement !== token_input) token_input.value = state.config.d1.apiToken;
    token_input.placeholder = state.config.d1.apiTokenConfigured ? "已配置；留空则保持不变" : "Cloudflare API Token";
    api_base_input.value = state.config.d1.apiBaseUrl;
    description.textContent = state.description;
    provider_input.disabled = busy;
    account_input.disabled = busy;
    database_input.disabled = busy;
    token_input.disabled = busy;
    api_base_input.disabled = busy;
    test_button.hidden = state.config.provider !== "d1";
    sync_button.hidden = state.config.provider !== "d1";
    test_button.disabled = busy;
    save_button.disabled = busy;
    sync_button.disabled = busy || state.formDirty;
    test_button.textContent = state.testing ? "连接中…" : "测试连接";
    save_button.textContent = state.saving ? "保存中…" : "保存设置";
    sync_button.textContent = state.syncing ? "同步中…" : "合并同步到 D1";
    message.textContent = state.message || "";
    message.style.color = state.messageType === "warning"
      ? "var(--danger)"
      : state.messageType === "ready"
        ? "var(--accent-strong)"
        : "";
  }

  const field_inputs = [provider_input, account_input, database_input, token_input, api_base_input];
  field_inputs.forEach(function (input) {
    input.addEventListener("input", function () {
      model.updateField(input.dataset.memoStorageField || "", input.value);
    });
  });
  test_button.addEventListener("click", function () {
    model.testConnection();
  });
  save_button.addEventListener("click", function () {
    model.save();
  });
  sync_button.addEventListener("click", function () {
    model.syncAll();
  });

  const unsubscribe = model.subscribe(render);
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
  mountSettingsMemoStorageView();
}
