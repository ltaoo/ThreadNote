import { errorText } from "./domain/native.js";
import {
  loadVaultStatus,
  normalizeVaultEntry,
  normalizeVaultPath,
  openVault,
  selectVaultDirectory,
} from "./domain/vaults.js";

function currentVaultEntry(status) {
  const active = status && status.active;
  if (!active || typeof active !== "object") return null;
  return normalizeVaultEntry(active.entry || active) || normalizeVaultEntry({
    id: active.id,
    lastOpenedAt: active.lastOpenedAt,
    name: active.name,
    path: active.rootDir,
  });
}

function vaultEntries(status) {
  const vaults = status && Array.isArray(status.vaults) ? status.vaults : [];
  return vaults.map(normalizeVaultEntry).filter(Boolean);
}

function sameVault(left, right) {
  if (!left || !right) return false;
  if (left.id && right.id) return left.id === right.id;
  return left.path === right.path;
}

export function SettingsVaultModel(options = {}) {
  const services = {
    loadVaultStatus,
    openVault,
    selectVaultDirectory,
    ...(options.services || {}),
  };
  const on_vault_changed = typeof options.onVaultChanged === "function"
    ? options.onVaultChanged
    : function () {};
  const listeners_ = new Set();
  let destroyed_ = false;
  let state_ = Object.freeze({
    choosing: false,
    currentVault: null,
    loading: false,
    message: "",
    messageType: "",
    switchingPath: "",
    vaults: [],
  });

  function publish(patch) {
    if (destroyed_) return;
    state_ = Object.freeze({ ...state_, ...(patch || {}) });
    listeners_.forEach(function (listener) {
      listener(state_);
    });
  }

  function apply_status(status, patch) {
    const current_vault = currentVaultEntry(status);
    const vaults = vaultEntries(status);
    if (current_vault && !vaults.some(function (vault) {
      return sameVault(vault, current_vault);
    })) {
      vaults.unshift(current_vault);
    }
    publish({
      currentVault: current_vault,
      vaults,
      ...(patch || {}),
    });
    return current_vault;
  }

  async function refresh_after_switch(result) {
    try {
      return apply_status(await services.loadVaultStatus());
    } catch (_) {
      return apply_status({
        active: result && result.active,
        vaults: result && result.registry && result.registry.vaults,
      });
    }
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
      if (destroyed_ || state_.loading || state_.switchingPath || state_.choosing) {
        return false;
      }
      publish({ loading: true, message: "", messageType: "" });
      try {
        const status = await services.loadVaultStatus();
        if (destroyed_) return false;
        apply_status(status, { loading: false });
        return true;
      } catch (err) {
        publish({
          loading: false,
          message: "读取 Vault 状态失败：" + errorText(err),
          messageType: "warning",
        });
        return false;
      }
    },

    async switchVault(path) {
      const value = normalizeVaultPath(path);
      if (destroyed_ || state_.loading || state_.switchingPath || state_.choosing) {
        return false;
      }
      if (!value) {
        publish({ message: "请选择 Vault 目录", messageType: "warning" });
        return false;
      }
      if (state_.currentVault && state_.currentVault.path === value) {
        publish({
          message: "当前已在使用 " + state_.currentVault.name,
          messageType: "ready",
        });
        return true;
      }

      publish({
        message: "正在切换 Vault…",
        messageType: "",
        switchingPath: value,
      });
      try {
        const result = await services.openVault(value);
        if (destroyed_) return false;
        const current_vault = await refresh_after_switch(result);
        if (destroyed_) return false;
        publish({
          message: "已切换到 " + ((current_vault && current_vault.name) || "Vault"),
          messageType: "ready",
          switchingPath: "",
        });
        on_vault_changed(current_vault, result);
        return true;
      } catch (err) {
        publish({
          message: "切换 Vault 失败：" + errorText(err),
          messageType: "warning",
          switchingPath: "",
        });
        return false;
      }
    },

    async chooseVault() {
      if (destroyed_ || state_.loading || state_.switchingPath || state_.choosing) {
        return false;
      }
      publish({ choosing: true, message: "正在选择 Vault 目录…", messageType: "" });
      try {
        const path = await services.selectVaultDirectory();
        if (destroyed_) return false;
        publish({ choosing: false });
        if (!normalizeVaultPath(path)) {
          publish({ message: "已取消选择", messageType: "" });
          return false;
        }
        return await model.switchVault(path);
      } catch (err) {
        const message = errorText(err);
        publish({
          choosing: false,
          message: message === "cancelled" ? "已取消选择" : "选择目录失败：" + message,
          messageType: message === "cancelled" ? "" : "warning",
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
