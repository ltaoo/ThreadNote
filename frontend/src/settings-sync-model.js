import { errorText } from "./domain/native.js";
import { loadVaultSync, openVaultSyncDirectory } from "./domain/vault-sync.js";

const PROVIDER_LABELS = {
  git: "Git",
  github: "GitHub",
  local: "Local",
  r2: "Cloudflare R2",
  s3: "S3",
};

const PROVIDER_DESCRIPTIONS = {
  git: "Vault 数据保存在本地 Git 仓库，并与远端仓库同步。",
  github: "Vault 数据保存在本地 Git 仓库，并与 GitHub 同步。",
  local: "Vault 数据直接保存在当前本地目录。",
  r2: "Vault 数据保存在本地目录，并与 Cloudflare R2 同步。",
  s3: "Vault 数据保存在本地目录，并与 S3 兼容存储同步。",
};

export function providerLabel(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (!value) return "读取中";
  return PROVIDER_LABELS[value] || value;
}

export function providerDescription(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (!value) return "正在读取当前 Vault 的存储方式。";
  return PROVIDER_DESCRIPTIONS[value] || "当前 Vault 使用 " + providerLabel(value) + " provider。";
}

export function SettingsSyncModel(options = {}) {
  const services = {
    loadVaultSync,
    openVaultSyncDirectory,
    ...(options.services || {}),
  };
  const listeners_ = new Set();
  let destroyed_ = false;
  let state_ = Object.freeze({
    canOpenDirectory: false,
    description: providerDescription(""),
    loading: false,
    message: "",
    messageType: "",
    openingDirectory: false,
    provider: "",
    providerLabel: providerLabel(""),
  });

  function publish(patch) {
    if (destroyed_) return;
    state_ = Object.freeze({ ...state_, ...(patch || {}) });
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
        const sync = await services.loadVaultSync();
        if (destroyed_) return false;
        const provider = String((sync && sync.provider) || "local").trim().toLowerCase() || "local";
        publish({
          canOpenDirectory: Boolean(sync && sync.usesLocalDirectory),
          description: providerDescription(provider),
          loading: false,
          provider,
          providerLabel: providerLabel(provider),
        });
        return true;
      } catch (err) {
        publish({
          canOpenDirectory: false,
          description: "无法读取当前 Vault 的存储方式。",
          loading: false,
          message: "读取 Vault provider 失败：" + errorText(err),
          messageType: "warning",
          provider: "",
          providerLabel: "读取失败",
        });
        return false;
      }
    },

    async openDirectory() {
      if (destroyed_ || state_.openingDirectory || !state_.canOpenDirectory) return false;
      publish({ openingDirectory: true, message: "正在打开 Vault 目录…", messageType: "" });
      try {
        await services.openVaultSyncDirectory();
        if (destroyed_) return false;
        publish({ openingDirectory: false, message: "已打开 Vault 目录", messageType: "ready" });
        return true;
      } catch (err) {
        publish({
          openingDirectory: false,
          message: "打开 Vault 目录失败：" + errorText(err),
          messageType: "warning",
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
