import { errorText } from "@/domain/native.js";
import {
  loadVaultStatus,
  normalizeVaultEntry,
  normalizeVaultPath,
  openCloudflareVault,
  openRegisteredVault,
  openVault,
  selectVaultDirectory,
} from "@/domain/vaults.js";

const REDIRECT_DELAY = 180;

function defaultRedirect() {
  const current_window = globalThis.window;
  const is_primary_picker =
    current_window &&
    new URLSearchParams(current_window.location.search).get("primary") === "1";

  if (is_primary_picker || typeof invoke !== "function") {
    current_window.location.replace("/home/index");
    return;
  }
  invoke("__velo/window/close", { args: {} }).catch(function () {
    current_window.close();
  });
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
 *     openCloudflareVault?: typeof openCloudflareVault,
 *     openRegisteredVault?: typeof openRegisteredVault,
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
    openCloudflareVault,
    openRegisteredVault,
    openVault,
    selectVaultDirectory,
    ...(props.services || {}),
  };
  const redirect = props.redirect || defaultRedirect;
  const redirect_delay = Number.isFinite(props.redirectDelay)
    ? props.redirectDelay
    : REDIRECT_DELAY;

  const active_ = runtime.ref(null);
  const account_id_ = runtime.ref("");
  const api_token_ = runtime.ref("");
  const data_file_exists_ = runtime.ref(false);
  const data_path_ = runtime.ref("");
  const database_id_ = runtime.ref("");
  const loading_ = runtime.ref(false);
  const message_ = runtime.ref("");
  const message_type_ = runtime.ref("");
  const mode_ = runtime.ref("local");
  const name_ = runtime.ref("");
  const path_ = runtime.ref("");
  const r2_access_key_id_ = runtime.ref("");
  const r2_bucket_ = runtime.ref("");
  const r2_secret_access_key_ = runtime.ref("");
  const vaults_ = runtime.refarr([]);
  let destroyed_ = false;
  let redirect_timer_ = null;

  const state = {
    active: active_,
    accountId: account_id_,
    apiToken: api_token_,
    dataFileExists: data_file_exists_,
    dataPath: data_path_,
    databaseId: database_id_,
    loading: loading_,
    message: message_,
    messageType: message_type_,
    mode: mode_,
    name: name_,
    path: path_,
    r2AccessKeyId: r2_access_key_id_,
    r2Bucket: r2_bucket_,
    r2SecretAccessKey: r2_secret_access_key_,
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

  function cloudflare_config() {
    return {
      accountId: String(account_id_.value || "").trim(),
      apiToken: String(api_token_.value || "").trim(),
      databaseId: String(database_id_.value || "").trim(),
      name: String(name_.value || "").trim(),
      r2AccessKeyId: String(r2_access_key_id_.value || "").trim(),
      r2Bucket: String(r2_bucket_.value || "").trim(),
      r2SecretAccessKey: String(r2_secret_access_key_.value || "").trim(),
    };
  }

  function missing_cloudflare_field(config) {
    const fields = [
      ["accountId", "Account ID"],
      ["databaseId", "D1 Database ID"],
      ["apiToken", "API Token"],
      ["r2Bucket", "R2 Bucket"],
      ["r2AccessKeyId", "R2 Access Key ID"],
      ["r2SecretAccessKey", "R2 Secret Access Key"],
    ];
    const missing = fields.find(function ([key]) {
      return !config[key];
    });
    return missing ? missing[1] : "";
  }

  async function perform_cloudflare_open() {
    const config = cloudflare_config();
    const missing = missing_cloudflare_field(config);
    if (missing) {
      set_message("请填写 " + missing, "warning");
      return false;
    }
    try {
      const data = await services.openCloudflareVault(config);
      if (destroyed_) return false;
      set_message(data && data.created ? "已创建 Cloudflare vault" : "已加载 Cloudflare vault", "success");
      schedule_redirect();
      return true;
    } catch (err) {
      set_message("打开 Cloudflare vault 失败: " + errorText(err), "error");
      return false;
    }
  }

  const methods = {
    setMode(mode) {
      if (destroyed_) return;
      mode_.as(String(mode || "").trim().toLowerCase() === "cloudflare" ? "cloudflare" : "local");
      set_message("");
    },

    setPath(path) {
      if (destroyed_) return;
      path_.as(String(path || ""));
    },

    setCloudflareField(field, value) {
      if (destroyed_) return;
      const fields = {
        accountId: account_id_,
        apiToken: api_token_,
        databaseId: database_id_,
        name: name_,
        r2AccessKeyId: r2_access_key_id_,
        r2Bucket: r2_bucket_,
        r2SecretAccessKey: r2_secret_access_key_,
      };
      if (fields[field]) fields[field].as(String(value || ""));
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
        set_message(status.warning, status.warning ? "warning" : "");
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

    async openCloudflareVault() {
      if (destroyed_ || loading_.value) return false;
      set_loading(true);
      try {
        return await perform_cloudflare_open();
      } finally {
        set_loading(false);
      }
    },

    async openRegisteredVault(vault) {
      if (destroyed_ || loading_.value) return false;
      const entry = normalizeVaultEntry(vault);
      if (!entry || !entry.id) {
        set_message("请选择已登记的 vault", "warning");
        return false;
      }
      set_loading(true);
      try {
        const data = await services.openRegisteredVault(entry.id);
        if (destroyed_) return false;
        set_message(data && data.created ? "已创建 vault" : "已加载 vault", "success");
        schedule_redirect();
        return true;
      } catch (err) {
        set_message("打开 vault 失败: " + errorText(err), "error");
        return false;
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
