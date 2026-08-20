import { errorText } from "@/domain/native.js";
import {
  loadVaultStatus,
  normalizeVaultPath,
  openVault,
  selectVaultDirectory,
} from "@/domain/vaults.js";

const REDIRECT_DELAY = 180;

function defaultRedirect() {
  window.location.replace("/desktop");
}

/**
 * Vault picker page model. It owns all page state and side effects; the view
 * only renders these reactive values and delegates user actions here.
 *
 * @param {ViewComponentProps & {
 *   redirect?: () => void,
 *   redirectDelay?: number,
 *   runtime?: typeof Timeless,
 *   services?: {
 *     loadVaultStatus?: typeof loadVaultStatus,
 *     openVault?: typeof openVault,
 *     selectVaultDirectory?: typeof selectVaultDirectory,
 *   },
 * }} props
 */
export function VaultPickerPageModel(props = {}) {
  const runtime = props.runtime || globalThis.Timeless;
  if (!runtime) {
    throw new Error("VaultPickerPageModel requires the Timeless runtime");
  }

  const services = {
    loadVaultStatus,
    openVault,
    selectVaultDirectory,
    ...(props.services || {}),
  };
  const redirect = props.redirect || defaultRedirect;
  const redirect_delay = Number.isFinite(props.redirectDelay)
    ? props.redirectDelay
    : REDIRECT_DELAY;

  const active_ = runtime.ref(null);
  const data_file_exists_ = runtime.ref(false);
  const data_path_ = runtime.ref("");
  const loading_ = runtime.ref(false);
  const message_ = runtime.ref("");
  const message_type_ = runtime.ref("");
  const path_ = runtime.ref("");
  const vaults_ = runtime.refarr([]);
  let destroyed_ = false;
  let redirect_timer_ = null;

  const state = {
    active: active_,
    dataFileExists: data_file_exists_,
    dataPath: data_path_,
    loading: loading_,
    message: message_,
    messageType: message_type_,
    path: path_,
    vaults: vaults_,
  };

  function set_message(message, type = "") {
    if (destroyed_) return;
    message_.as(message || "");
    message_type_.as(type || "");
  }

  function set_loading(loading) {
    if (destroyed_) return;
    loading_.as(Boolean(loading));
  }

  function schedule_redirect() {
    if (redirect_timer_ !== null) {
      globalThis.clearTimeout(redirect_timer_);
    }
    redirect_timer_ = globalThis.setTimeout(function () {
      redirect_timer_ = null;
      if (!destroyed_) redirect();
    }, redirect_delay);
  }

  async function perform_open(path) {
    const value = normalizeVaultPath(path);
    if (!value) {
      set_message("请输入或选择 vault 目录", "warning");
      return false;
    }

    path_.as(value);
    try {
      const data = await services.openVault(value);
      if (destroyed_) return false;
      set_message(data && data.created ? "已创建 vault" : "已加载 vault", "success");
      schedule_redirect();
      return true;
    } catch (err) {
      set_message("打开 vault 失败: " + errorText(err), "error");
      return false;
    }
  }

  const methods = {
    setPath(path) {
      if (destroyed_) return;
      path_.as(String(path || ""));
    },

    async init() {
      if (destroyed_ || loading_.value) return false;
      set_loading(true);
      try {
        const status = await services.loadVaultStatus();
        if (destroyed_) return false;
        active_.as(status.active);
        data_file_exists_.as(Boolean(status.dataFileExists));
        data_path_.as(status.dataPath || "");
        vaults_.as(Array.isArray(status.vaults) ? status.vaults : []);
        return true;
      } catch (err) {
        set_message("读取 vault 状态失败: " + errorText(err), "error");
        return false;
      } finally {
        set_loading(false);
      }
    },

    async chooseVault() {
      if (destroyed_ || loading_.value) return false;
      set_loading(true);
      try {
        const path = await services.selectVaultDirectory();
        if (destroyed_) return false;
        if (!path) {
          set_message("没有选择目录", "warning");
          return false;
        }
        path_.as(path);
        return await perform_open(path);
      } catch (err) {
        const message = errorText(err);
        set_message(
          message === "cancelled" ? "已取消选择" : "选择目录失败: " + message,
          "warning",
        );
        return false;
      } finally {
        set_loading(false);
      }
    },

    async openVault(path = path_.value) {
      if (destroyed_ || loading_.value) return false;
      set_loading(true);
      try {
        return await perform_open(path);
      } finally {
        set_loading(false);
      }
    },
  };

  const model = runtime.defineModel({ state, methods });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    if (redirect_timer_ !== null) {
      globalThis.clearTimeout(redirect_timer_);
      redirect_timer_ = null;
    }
    destroy_model();
  };
  return model;
}
