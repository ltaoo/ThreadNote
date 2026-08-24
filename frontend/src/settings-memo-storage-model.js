import { errorText } from "./domain/native.js";
import {
  loadMemoStorageSettings,
  saveMemoStorageSettings,
  syncD1MemoStorage,
  testD1MemoStorage,
} from "./domain/memo-storage.js";

const DEFAULT_API_BASE_URL = "https://api.cloudflare.com/client/v4";

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const d1 = source.d1 && typeof source.d1 === "object" ? source.d1 : {};
  const provider = String(source.provider || "local").trim().toLowerCase();
  return {
    d1: {
      accountId: String(d1.accountId || "").trim(),
      apiBaseUrl: String(d1.apiBaseUrl || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL,
      apiToken: "",
      apiTokenConfigured: Boolean(d1.apiTokenConfigured),
      databaseId: String(d1.databaseId || "").trim(),
    },
    provider: provider === "d1" ? "d1" : "local",
  };
}

function normalizeSyncState(sync_state) {
  const source = sync_state && typeof sync_state === "object" ? sync_state : {};
  return {
    dirty: Boolean(source.dirty),
    lastError: String(source.lastError || ""),
    lastSyncedAt: String(source.lastSyncedAt || ""),
    remoteMemoCount: Math.max(0, Number(source.remoteMemoCount) || 0),
  };
}

function requestConfig(config) {
  return {
    d1: {
      accountId: config.d1.accountId,
      apiBaseUrl: config.d1.apiBaseUrl,
      apiToken: config.d1.apiToken,
      databaseId: config.d1.databaseId,
    },
    provider: config.provider,
  };
}

function syncDescription(config, sync_state) {
  if (config.provider !== "d1") {
    return "Memo 正文与元数据保存在 Local Markdown；图片和附件使用上方选中的对象存储。";
  }
  if (sync_state.dirty) {
    return sync_state.lastError || "D1 有待同步变更，请执行合并同步。";
  }
  if (!sync_state.lastSyncedAt) {
    return "D1 尚未完成首次同步。保存配置后执行合并同步。";
  }
  return `D1 已同步 ${sync_state.remoteMemoCount} 条 Memo；Local Markdown 作为离线缓存。`;
}

export function SettingsMemoStorageModel(options = {}) {
  const services = {
    loadMemoStorageSettings,
    saveMemoStorageSettings,
    syncD1MemoStorage,
    testD1MemoStorage,
    ...(options.services || {}),
  };
  const listeners_ = new Set();
  let destroyed_ = false;
  let state_ = Object.freeze({
    config: normalizeConfig(null),
    description: "正在读取 Memo 数据存储设置。",
    formDirty: false,
    loading: false,
    message: "",
    messageType: "",
    saving: false,
    syncState: normalizeSyncState(null),
    syncing: false,
    testing: false,
  });

  function publish(patch) {
    if (destroyed_) return;
    const next_patch = patch || {};
    const next_config = next_patch.config || state_.config;
    const next_sync_state = next_patch.syncState || state_.syncState;
    state_ = Object.freeze({
      ...state_,
      ...next_patch,
      description: syncDescription(next_config, next_sync_state),
    });
    listeners_.forEach(function (listener) {
      listener(state_);
    });
  }

  const model = {
    getState() {
      return state_;
    },

    subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners_.add(listener);
      listener(state_);
      return function () {
        listeners_.delete(listener);
      };
    },

    async init() {
      if (destroyed_ || state_.loading) return false;
      publish({ loading: true, message: "", messageType: "" });
      try {
        const payload = await services.loadMemoStorageSettings();
        const config = normalizeConfig(payload && payload.config);
        const sync_state = normalizeSyncState(payload && payload.state);
        publish({ config, formDirty: false, loading: false, syncState: sync_state });
        return true;
      } catch (err) {
        publish({
          loading: false,
          message: "读取 Memo 存储设置失败：" + errorText(err),
          messageType: "warning",
        });
        return false;
      }
    },

    updateField(field, value) {
      if (destroyed_) return;
      const config = normalizeConfig(state_.config);
      config.d1.apiToken = state_.config.d1.apiToken;
      if (field === "provider") {
        config.provider = String(value || "").trim().toLowerCase() === "d1" ? "d1" : "local";
      } else if (field === "accountId") {
        config.d1.accountId = String(value || "");
      } else if (field === "databaseId") {
        config.d1.databaseId = String(value || "");
      } else if (field === "apiToken") {
        config.d1.apiToken = String(value || "");
      } else if (field === "apiBaseUrl") {
        config.d1.apiBaseUrl = String(value || "");
      } else {
        return;
      }
      publish({ config, formDirty: true, message: "", messageType: "" });
    },

    async testConnection() {
      if (destroyed_ || state_.testing || state_.config.provider !== "d1") return false;
      publish({ message: "正在连接 Cloudflare D1…", messageType: "", testing: true });
      try {
        await services.testD1MemoStorage(requestConfig(state_.config));
        publish({ message: "D1 连接成功，数据表已就绪。", messageType: "ready", testing: false });
        return true;
      } catch (err) {
        publish({
          message: "D1 连接失败：" + errorText(err),
          messageType: "warning",
          testing: false,
        });
        return false;
      }
    },

    async save() {
      if (destroyed_ || state_.saving) return false;
      publish({ message: "正在保存 Memo 存储设置…", messageType: "", saving: true });
      try {
        const payload = await services.saveMemoStorageSettings(requestConfig(state_.config));
        const config = normalizeConfig(payload && payload.config);
        const sync_state = normalizeSyncState(payload && payload.state);
        publish({
          config,
          formDirty: false,
          message: config.provider === "d1" ? "D1 配置已保存，请执行合并同步。" : "已切换为 Local Memo 存储。",
          messageType: "ready",
          saving: false,
          syncState: sync_state,
        });
        return true;
      } catch (err) {
        publish({
          message: "保存 Memo 存储设置失败：" + errorText(err),
          messageType: "warning",
          saving: false,
        });
        return false;
      }
    },

    async syncAll() {
      if (destroyed_ || state_.syncing || state_.config.provider !== "d1") return false;
      if (state_.formDirty) {
        publish({ message: "请先保存 D1 配置，再执行合并同步。", messageType: "warning" });
        return false;
      }
      publish({ message: "正在将 Local Markdown 合并同步到 D1…", messageType: "", syncing: true });
      try {
        const payload = await services.syncD1MemoStorage();
        const sync_state = normalizeSyncState(payload && payload.state);
        publish({
          message: `D1 合并同步完成：上传 ${Math.max(0, Number(payload && payload.memoCount) || 0)} 条本地 Memo。`,
          messageType: "ready",
          syncState: sync_state,
          syncing: false,
        });
        return true;
      } catch (err) {
        publish({
          message: "D1 全量同步失败：" + errorText(err),
          messageType: "warning",
          syncing: false,
        });
        return false;
      }
    },

    destroy() {
      destroyed_ = true;
      listeners_.clear();
    },
  };

  return model;
}

export { normalizeConfig, normalizeSyncState, syncDescription };
