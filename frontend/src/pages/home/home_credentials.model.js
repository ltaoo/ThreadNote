import { copyText } from "./memo-utils.js";

const CREDENTIAL_AUTO_LOCK_MS = 10 * 60 * 1000;
const CREDENTIAL_CLIPBOARD_CLEAR_MS = 30 * 1000;
const CREDENTIAL_SECRET_HIDE_MS = 30 * 1000;

export const CREDENTIAL_TYPE_OPTIONS = Object.freeze([
  { label: "登录", value: "login" },
  { label: "API Token", value: "api_token" },
  { label: "SSH 密钥", value: "ssh_key" },
  { label: "自定义", value: "custom" },
]);

const CREDENTIAL_TYPE_LABELS = Object.freeze(
  Object.fromEntries(CREDENTIAL_TYPE_OPTIONS.map(function (option) {
    return [option.value, option.label];
  })),
);

const CREDENTIAL_FIELD_TEMPLATES = Object.freeze({
  api_token: [
    { label: "Token", secret: true },
  ],
  custom: [
    { label: "Secret", secret: true },
  ],
  login: [
    { label: "用户名", secret: false },
    { label: "密码", secret: true },
  ],
  ssh_key: [
    { label: "公钥", secret: false },
    { label: "私钥", secret: true },
    { label: "Passphrase", secret: true },
  ],
});

let fallback_field_id_ = 0;

function next_field_id() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallback_field_id_ += 1;
  return `credential-field-${Date.now()}-${fallback_field_id_}`;
}

function credential_fields_for_type(type) {
  return (CREDENTIAL_FIELD_TEMPLATES[type] || CREDENTIAL_FIELD_TEMPLATES.custom)
    .map(function (field) {
      return {
        hasValue: false,
        id: next_field_id(),
        label: field.label,
        secret: field.secret,
        value: "",
      };
    });
}

function empty_credential(type = "login") {
  const normalized_type = CREDENTIAL_TYPE_LABELS[type] ? type : "login";
  return {
    fields: credential_fields_for_type(normalized_type),
    id: "",
    notes: "",
    tags: [],
    title: "",
    type: normalized_type,
    url: "",
  };
}

function normalized_credential_item(item = {}) {
  return {
    createdAt: String(item.createdAt || ""),
    fields: (Array.isArray(item.fields) ? item.fields : []).map(function (field) {
      return {
        hasValue: Boolean(field.hasValue || field.value),
        id: String(field.id || next_field_id()),
        label: String(field.label || ""),
        secret: Boolean(field.secret),
        value: String(field.value || ""),
      };
    }),
    id: String(item.id || ""),
    notes: String(item.notes || ""),
    tags: (Array.isArray(item.tags) ? item.tags : []).map(String),
    title: String(item.title || ""),
    type: CREDENTIAL_TYPE_LABELS[item.type] ? item.type : "custom",
    updatedAt: String(item.updatedAt || ""),
    url: String(item.url || ""),
  };
}

function credential_save_payload(item) {
  return {
    fields: item.fields.map(function (field) {
      return {
        id: field.id,
        label: field.label,
        secret: Boolean(field.secret),
        value: field.value,
      };
    }),
    id: item.id,
    notes: item.notes,
    tags: item.tags,
    title: item.title,
    type: item.type,
    url: item.url,
  };
}

function default_request(url, options) {
  return globalThis.invoke(url, options);
}

function default_read_clipboard() {
  if (typeof globalThis.navigator?.clipboard?.readText !== "function") {
    return Promise.reject(new Error("clipboard read is unavailable"));
  }
  return globalThis.navigator.clipboard.readText();
}

function format_updated_at(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
}

/**
 * Owns credential state and effects. The view only renders these refs and
 * delegates user actions back to this model.
 *
 * @param {object} props
 */
export function HomeCredentialsPageModel(props = {}) {
  const runtime = props.runtime || globalThis.Timeless;
  if (!runtime) throw new Error("HomeCredentialsPageModel requires Timeless");

  const request = props.request || default_request;
  const confirm_action = props.confirm || ((message) => globalThis.confirm(message));
  const read_clipboard = props.readClipboard || default_read_clipboard;
  const write_clipboard = props.writeClipboard || copyText;
  const set_timeout = props.setTimeout || globalThis.setTimeout;
  const clear_timeout = props.clearTimeout || globalThis.clearTimeout;

  const phase_ = runtime.ref("loading");
  const loading_ = runtime.ref(false);
  const error_ = runtime.ref("");
  const message_ = runtime.ref("");
  const items_ = runtime.ref([]);
  const query_ = runtime.ref("");
  const type_filter_ = runtime.ref("all");
  const selected_id_ = runtime.ref("");
  const selected_item_ = runtime.ref(null);
  const draft_ = runtime.ref(null);
  const revealed_values_ = runtime.ref({});
  const draft_revealed_fields_ = runtime.ref([]);
  const setup_password_ = runtime.ref("");
  const setup_confirmation_ = runtime.ref("");
  const unlock_password_ = runtime.ref("");
  const reveal_timers_ = new Map();
  const listeners_ = [];
  let auto_lock_timer_ = null;
  let clipboard_timer_ = null;
  let copied_value_ = "";
  let destroyed_ = false;

  async function api(url, options = {}) {
    const response = await request(url, options);
    if (!response || response.code !== 0) {
      throw new Error(response?.msg || "凭证库请求失败");
    }
    return response.data || {};
  }

  function clear_timer(timer) {
    if (timer !== null && typeof clear_timeout === "function") {
      clear_timeout(timer);
    }
  }

  function clear_revealed_values() {
    reveal_timers_.forEach(clear_timer);
    reveal_timers_.clear();
    const values = revealed_values_.value || {};
    Object.keys(values).forEach(function (field_id) {
      values[field_id] = "";
    });
    revealed_values_.as({});
    draft_revealed_fields_.as([]);
  }

  function clear_sensitive_state() {
    setup_password_.as("");
    setup_confirmation_.as("");
    unlock_password_.as("");
    clear_revealed_values();
    if (draft_.value) {
      draft_.value.fields?.forEach(function (field) {
        field.value = "";
      });
    }
    draft_.as(null);
    selected_item_.as(null);
  }

  function handle_error(error, fallback) {
    const message = error?.message || fallback;
    error_.as(message);
    if (/credential vault is locked/i.test(message)) {
      phase_.as("locked");
      items_.as([]);
      selected_id_.as("");
      clear_sensitive_state();
      void clear_clipboard_if_unchanged();
    }
    return false;
  }

  function schedule_auto_lock() {
    clear_timer(auto_lock_timer_);
    if (phase_.value !== "unlocked" || typeof set_timeout !== "function") {
      auto_lock_timer_ = null;
      return;
    }
    auto_lock_timer_ = set_timeout(function () {
      auto_lock_timer_ = null;
      void methods.lock();
    }, CREDENTIAL_AUTO_LOCK_MS);
  }

  function touch_unlocked_session() {
    if (phase_.value === "unlocked") schedule_auto_lock();
  }

  async function load_items() {
    const data = await api("/api/credentials", { method: "GET" });
    const items = (Array.isArray(data.items) ? data.items : [])
      .map(normalized_credential_item);
    items_.as(items);
    if (selected_id_.value && !items.some(function (item) {
      return item.id === selected_id_.value;
    })) {
      selected_id_.as("");
      selected_item_.as(null);
    }
    touch_unlocked_session();
    return items;
  }

  async function load_selected_item(item_id, route = "/api/credentials/get") {
    const data = await api(route, {
      args: { id: item_id },
      method: "POST",
    });
    return normalized_credential_item(data.item);
  }

  function update_draft(update) {
    const current = draft_.value;
    if (!current) return false;
    draft_.as({ ...current, ...update });
    return true;
  }

  function update_draft_field(field_id, update) {
    const current = draft_.value;
    if (!current) return false;
    const fields = current.fields.map(function (field) {
      return field.id === field_id ? { ...field, ...update } : field;
    });
    return update_draft({ fields });
  }

  function validate_draft(item) {
    if (!String(item?.title || "").trim()) return "请输入标题";
    if (!Array.isArray(item.fields) || item.fields.length === 0) {
      return "至少保留一个凭证字段";
    }
    if (item.fields.some(function (field) {
      return !String(field.label || "").trim();
    })) {
      return "请输入字段名称";
    }
    return "";
  }

  function hide_revealed_field(field_id) {
    const values = { ...(revealed_values_.value || {}) };
    if (Object.prototype.hasOwnProperty.call(values, field_id)) {
      values[field_id] = "";
      delete values[field_id];
      revealed_values_.as(values);
    }
    const timer = reveal_timers_.get(field_id);
    clear_timer(timer ?? null);
    reveal_timers_.delete(field_id);
  }

  function show_revealed_field(field_id, value) {
    hide_revealed_field(field_id);
    revealed_values_.as({
      ...(revealed_values_.value || {}),
      [field_id]: value,
    });
    if (typeof set_timeout === "function") {
      reveal_timers_.set(field_id, set_timeout(function () {
        hide_revealed_field(field_id);
      }, CREDENTIAL_SECRET_HIDE_MS));
    }
  }

  async function fetch_field_value(field) {
    if (!field.secret) return field.value;
    const visible_values = revealed_values_.value || {};
    if (Object.prototype.hasOwnProperty.call(visible_values, field.id)) {
      return visible_values[field.id];
    }
    const data = await api("/api/credentials/reveal", {
      args: { fieldId: field.id, itemId: selected_id_.value },
      method: "POST",
    });
    touch_unlocked_session();
    return String(data.value || "");
  }

  async function clear_clipboard_if_unchanged() {
    clear_timer(clipboard_timer_);
    clipboard_timer_ = null;
    const value = copied_value_;
    copied_value_ = "";
    if (!value) return;
    try {
      if (await read_clipboard() === value) await write_clipboard("");
    } catch (_) {
      // Clipboard read permission can be unavailable; never overwrite blindly.
    }
  }

  function schedule_clipboard_clear(copied_value) {
    clear_timer(clipboard_timer_);
    copied_value_ = copied_value;
    if (typeof set_timeout !== "function") return;
    clipboard_timer_ = set_timeout(function () {
      return clear_clipboard_if_unchanged();
    }, CREDENTIAL_CLIPBOARD_CLEAR_MS);
  }

  function apply_local_lock() {
    clear_timer(auto_lock_timer_);
    auto_lock_timer_ = null;
    phase_.as("locked");
    items_.as([]);
    selected_id_.as("");
    clear_sensitive_state();
    void clear_clipboard_if_unchanged();
    message_.as("凭证库已锁定");
  }

  const methods = {
    async init() {
      if (destroyed_ || loading_.value) return false;
      loading_.as(true);
      error_.as("");
      try {
        const data = await api("/api/credentials/status", { method: "GET" });
        if (destroyed_) return false;
        phase_.as(data.initialized ? (data.unlocked ? "unlocked" : "locked") : "setup");
        if (phase_.value === "unlocked") {
          await load_items();
          schedule_auto_lock();
        }
        return true;
      } catch (error) {
        phase_.as("error");
        return handle_error(error, "读取凭证库状态失败");
      } finally {
        loading_.as(false);
      }
    },

    async setup() {
      if (loading_.value || destroyed_) return false;
      const password = setup_password_.value;
      const confirmation = setup_confirmation_.value;
      if (Array.from(password).length < 12) {
        error_.as("主密码至少需要 12 个字符");
        return false;
      }
      if (password !== confirmation) {
        error_.as("两次输入的主密码不一致");
        return false;
      }
      loading_.as(true);
      error_.as("");
      try {
        await api("/api/credentials/setup", {
          args: { password },
          method: "POST",
        });
        phase_.as("unlocked");
        await load_items();
        schedule_auto_lock();
        message_.as("凭证库已创建");
        return true;
      } catch (error) {
        return handle_error(error, "创建凭证库失败");
      } finally {
        setup_password_.as("");
        setup_confirmation_.as("");
        loading_.as(false);
      }
    },

    async unlock() {
      if (loading_.value || destroyed_) return false;
      const password = unlock_password_.value;
      if (!password) {
        error_.as("请输入主密码");
        return false;
      }
      loading_.as(true);
      error_.as("");
      try {
        await api("/api/credentials/unlock", {
          args: { password },
          method: "POST",
        });
        phase_.as("unlocked");
        await load_items();
        schedule_auto_lock();
        message_.as("凭证库已解锁");
        return true;
      } catch (error) {
        return handle_error(error, "解锁凭证库失败");
      } finally {
        unlock_password_.as("");
        loading_.as(false);
      }
    },

    async lock() {
      apply_local_lock();
      try {
        await api("/api/credentials/lock", { method: "POST" });
      } catch (_) {
        // Local state must still lock if the backend request fails.
      }
      return true;
    },

    setSetupPassword(value) {
      setup_password_.as(String(value || ""));
      error_.as("");
    },

    setSetupConfirmation(value) {
      setup_confirmation_.as(String(value || ""));
      error_.as("");
    },

    setUnlockPassword(value) {
      unlock_password_.as(String(value || ""));
      error_.as("");
    },

    setQuery(value) {
      query_.as(String(value || ""));
    },

    setTypeFilter(value) {
      const type = String(value || "all");
      type_filter_.as(type === "all" || CREDENTIAL_TYPE_LABELS[type] ? type : "all");
    },

    async selectItem(item_id) {
      if (!item_id || loading_.value || destroyed_) return false;
      loading_.as(true);
      error_.as("");
      clear_revealed_values();
      draft_.as(null);
      try {
        const item = await load_selected_item(item_id);
        if (destroyed_) return false;
        selected_id_.as(item.id);
        selected_item_.as(item);
        touch_unlocked_session();
        return true;
      } catch (error) {
        return handle_error(error, "读取凭证失败");
      } finally {
        loading_.as(false);
      }
    },

    newItem(type = "login") {
      clear_revealed_values();
      selected_id_.as("");
      selected_item_.as(null);
      draft_.as(empty_credential(type));
      error_.as("");
      message_.as("");
    },

    async editSelected() {
      if (!selected_id_.value || loading_.value || destroyed_) return false;
      loading_.as(true);
      error_.as("");
      clear_revealed_values();
      try {
        const item = await load_selected_item(selected_id_.value, "/api/credentials/edit");
        if (destroyed_) return false;
        draft_.as(item);
        touch_unlocked_session();
        return true;
      } catch (error) {
        return handle_error(error, "读取凭证失败");
      } finally {
        loading_.as(false);
      }
    },

    cancelEdit() {
      if (draft_.value) {
        draft_.value.fields.forEach(function (field) {
          field.value = "";
        });
      }
      draft_.as(null);
      draft_revealed_fields_.as([]);
      error_.as("");
    },

    setDraftValue(name, value) {
      if (!["notes", "title", "url"].includes(name)) return false;
      return update_draft({ [name]: String(value || "") });
    },

    setDraftType(value) {
      const type = String(value || "custom");
      return update_draft({ type: CREDENTIAL_TYPE_LABELS[type] ? type : "custom" });
    },

    setDraftTags(value) {
      const tags = String(value || "")
        .split(",")
        .map(function (tag) { return tag.trim(); })
        .filter(Boolean);
      return update_draft({ tags });
    },

    setDraftFieldValue(field_id, name, value) {
      if (!["label", "value"].includes(name)) return false;
      return update_draft_field(field_id, { [name]: String(value || "") });
    },

    setDraftFieldSecret(field_id, secret) {
      return update_draft_field(field_id, { secret: Boolean(secret) });
    },

    toggleDraftField(field_id) {
      const current = draft_revealed_fields_.value;
      draft_revealed_fields_.as(
        current.includes(field_id)
          ? current.filter(function (id) { return id !== field_id; })
          : [...current, field_id],
      );
    },

    addDraftField() {
      const current = draft_.value;
      if (!current || current.fields.length >= 24) return false;
      return update_draft({
        fields: [...current.fields, {
          hasValue: false,
          id: next_field_id(),
          label: "字段",
          secret: true,
          value: "",
        }],
      });
    },

    removeDraftField(field_id) {
      const current = draft_.value;
      if (!current || current.fields.length <= 1) return false;
      return update_draft({
        fields: current.fields.filter(function (field) {
          return field.id !== field_id;
        }),
      });
    },

    async saveDraft() {
      const draft = draft_.value;
      if (!draft || loading_.value || destroyed_) return false;
      const validation_error = validate_draft(draft);
      if (validation_error) {
        error_.as(validation_error);
        return false;
      }
      loading_.as(true);
      error_.as("");
      try {
        const data = await api("/api/credentials/save", {
          args: credential_save_payload(draft),
          method: "POST",
        });
        const saved_id = String(data.item?.id || "");
        draft.fields.forEach(function (field) {
          field.value = "";
        });
        draft_.as(null);
        draft_revealed_fields_.as([]);
        await load_items();
        if (saved_id) {
          const selected = await load_selected_item(saved_id);
          selected_id_.as(saved_id);
          selected_item_.as(selected);
        }
        touch_unlocked_session();
        message_.as("凭证已保存");
        return true;
      } catch (error) {
        return handle_error(error, "保存凭证失败");
      } finally {
        loading_.as(false);
      }
    },

    async deleteSelected() {
      const item = selected_item_.value;
      if (!item || loading_.value || destroyed_) return false;
      if (!confirm_action(`确定删除“${item.title}”吗？此操作无法撤销。`)) {
        return false;
      }
      loading_.as(true);
      error_.as("");
      try {
        await api("/api/credentials/delete", {
          args: { id: item.id },
          method: "POST",
        });
        selected_id_.as("");
        selected_item_.as(null);
        clear_revealed_values();
        await load_items();
        message_.as("凭证已删除");
        return true;
      } catch (error) {
        return handle_error(error, "删除凭证失败");
      } finally {
        loading_.as(false);
      }
    },

    async toggleReveal(field) {
      if (!field?.secret || loading_.value || destroyed_) return false;
      if (Object.prototype.hasOwnProperty.call(revealed_values_.value, field.id)) {
        hide_revealed_field(field.id);
        return true;
      }
      loading_.as(true);
      error_.as("");
      try {
        const value = await fetch_field_value(field);
        if (destroyed_) return false;
        show_revealed_field(field.id, value);
        return true;
      } catch (error) {
        return handle_error(error, "读取敏感字段失败");
      } finally {
        loading_.as(false);
      }
    },

    async copyField(field) {
      if (!field || loading_.value || destroyed_) return false;
      loading_.as(true);
      error_.as("");
      try {
        let value = await fetch_field_value(field);
        await write_clipboard(value);
        schedule_clipboard_clear(value);
        message_.as(`已复制${field.label}，30 秒后清空剪贴板`);
        value = "";
        return true;
      } catch (error) {
        return handle_error(error, "复制凭证字段失败");
      } finally {
        loading_.as(false);
      }
    },

    destroy() {
      if (phase_.value === "unlocked") {
        void request("/api/credentials/lock", { method: "POST" });
      }
      destroyed_ = true;
      clear_timer(auto_lock_timer_);
      auto_lock_timer_ = null;
      void clear_clipboard_if_unchanged();
      listeners_.forEach(function (unsubscribe) {
        unsubscribe?.();
      });
      clear_sensitive_state();
      items_.as([]);
    },
  };

  if (typeof props.view?.onStateChange === "function") {
    listeners_.push(props.view.onStateChange(function (state) {
      if (!state?.visible && phase_.value === "unlocked") void methods.lock();
    }));
  }

  const visible_items_ = runtime.combine(
    { items: items_, query: query_, type: type_filter_ },
    function (state) {
      const query = state.query.trim().toLowerCase();
      return state.items.filter(function (item) {
        if (state.type !== "all" && item.type !== state.type) return false;
        if (!query) return true;
        return `${item.title}\n${item.url}\n${item.tags.join("\n")}`
          .toLowerCase()
          .includes(query);
      });
    },
  );

  return {
    methods,
    state: {
      draft: draft_,
      draftFields: runtime.computed(draft_, function (draft) {
        return draft?.fields || [];
      }),
      draftRevealedFields: draft_revealed_fields_,
      error: error_,
      items: items_,
      loading: loading_,
      message: message_,
      phase: phase_,
      query: query_,
      revealedValues: revealed_values_,
      selectedId: selected_id_,
      selectedItem: selected_item_,
      selectedFields: runtime.computed(selected_item_, function (item) {
        return item?.fields || [];
      }),
      setupConfirmation: setup_confirmation_,
      setupPassword: setup_password_,
      typeFilter: type_filter_,
      unlockPassword: unlock_password_,
    },
    ui: {
      draftTags: runtime.computed(draft_, function (draft) {
        return draft?.tags?.join(", ") || "";
      }),
      fieldActionLabel(field) {
        return runtime.computed(revealed_values_, function (values) {
          return Object.prototype.hasOwnProperty.call(values, field.id) ? "隐藏" : "显示";
        });
      },
      fieldDisplayValue(field) {
        return runtime.computed(revealed_values_, function (values) {
          if (!field.secret) return field.value || "未设置";
          if (!field.hasValue) return "未设置";
          return Object.prototype.hasOwnProperty.call(values, field.id)
            ? values[field.id]
            : "••••••••••••";
        });
      },
      formatUpdatedAt: format_updated_at,
      itemButtonClass(item_id) {
        return runtime.computed(selected_id_, function (selected_id) {
          return "credential-list-item" + (selected_id === item_id ? " is-active" : "");
        });
      },
      typeLabel(type) {
        return CREDENTIAL_TYPE_LABELS[type] || "自定义";
      },
      typeOptions: CREDENTIAL_TYPE_OPTIONS,
      visibleItems: visible_items_,
    },
  };
}
