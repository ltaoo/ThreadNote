const LOG_LEVELS = new Set(["all", "debug", "info", "warn", "error"]);
const LOG_REFRESH_INTERVAL = 2000;

function normalized_log_entry(entry = {}) {
  const details = { ...entry };
  delete details.level;
  delete details.message;
  delete details.raw;
  delete details.time;
  delete details.timestamp;
  const timestamp = String(entry.time || entry.timestamp || "");
  let display_time = timestamp;
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) display_time = parsed.toLocaleString();
  }
  return {
    component: String(entry.component || "backend"),
    detailsText: Object.keys(details).length
      ? JSON.stringify(details, null, 2)
      : "",
    displayTime: display_time,
    level: String(entry.level || "info").toLowerCase(),
    message: String(entry.message || entry.raw || ""),
  };
}

function log_viewer_event(level, message, fields = {}) {
  const logger = globalThis.FrontendLogger || globalThis.Logger;
  const write = logger?.[level] || logger?.info;
  if (typeof write !== "function") return;
  write.call(logger, message, { component: "log_viewer", ...fields });
}

/** @param {object} props */
export function HomeLogsPageModel(props = {}) {
  const request = props.request || ((url, options) => globalThis.invoke(url, options));
  const confirm_action = props.confirm || ((message) => globalThis.confirm(message));
  const set_interval = props.setInterval || globalThis.setInterval;
  const clear_interval = props.clearInterval || globalThis.clearInterval;
  const { vm } = props.runtime || globalThis.Timeless;
  const entries_ = ref([]);
  const total_ = ref(0);
  const page_ = ref(1);
  const page_size_ = ref(200);
  const level_ = ref("all");
  const loading_ = ref(false);
  const error_ = ref("");
  const log_path_ = ref("");
  const last_loaded_ = ref("");
  const auto_refresh_ = ref(true);
  let refresh_timer_ = null;
  let destroyed_ = false;

  const keyword_input_ = new vm.InputCore({
    defaultValue: "",
    onEnter() {
      void load(1);
    },
    placeholder: "搜索消息、memo ID、阶段或数据…",
    type: "search",
  });
  const component_input_ = new vm.InputCore({
    defaultValue: "all",
    onEnter() {
      void load(1);
    },
    placeholder: "组件（all / frontend / backend）",
  });
  const level_buttons_ = Object.fromEntries(
    Array.from(LOG_LEVELS, function (level) {
      return [level, new vm.ButtonCore({
        onClick() {
          methods.setLevel(level);
        },
        size: "sm",
        variant: level === "all" ? "primary" : "ghost",
      })];
    }),
  );
  const auto_refresh_button_ = new vm.ButtonCore({
    onClick() {
      methods.setAutoRefresh(!auto_refresh_.value);
    },
    size: "sm",
    variant: "primary",
  });
  const refresh_button_ = new vm.ButtonCore({
    onClick() {
      void load(1);
    },
    size: "sm",
    variant: "secondary",
  });
  const clear_button_ = new vm.ButtonCore({
    onClick() {
      void methods.clearLogs();
    },
    size: "sm",
    variant: "danger",
  });
  const search_button_ = new vm.ButtonCore({
    onClick() {
      void load(1);
    },
    variant: "primary",
  });
  const previous_page_button_ = new vm.ButtonCore({
    disabled: true,
    onClick() {
      methods.previousPage();
    },
    size: "sm",
    variant: "outline",
  });
  const next_page_button_ = new vm.ButtonCore({
    disabled: true,
    onClick() {
      methods.nextPage();
    },
    size: "sm",
    variant: "outline",
  });
  const controls_ = [
    keyword_input_,
    component_input_,
    ...Object.values(level_buttons_),
    auto_refresh_button_,
    refresh_button_,
    clear_button_,
    search_button_,
    previous_page_button_,
    next_page_button_,
  ];

  function query_url(target_page) {
    const query = new URLSearchParams({
      page: String(target_page),
      page_size: String(page_size_.value),
    });
    const keyword = String(keyword_input_.value || "").trim();
    const component = String(component_input_.value || "all").trim() || "all";
    if (keyword) query.set("keyword", keyword);
    if (component !== "all") query.set("component", component);
    if (level_.value !== "all") query.set("levels", level_.value);
    return `/api/logs?${query.toString()}`;
  }

  async function load(target_page = page_.value) {
    if (loading_.value || destroyed_) return false;
    loading_.as(true);
    refresh_button_.setLoading(true);
    error_.as("");
    const requested_page = Math.max(1, Number(target_page) || 1);
    try {
      const response = await request(query_url(requested_page), { method: "GET" });
      if (!response || response.code !== 0) {
        throw new Error(response?.msg || "读取日志失败");
      }
      const data = response.data || {};
      entries_.as((Array.isArray(data.entries) ? data.entries : []).map(normalized_log_entry));
      total_.as(Math.max(0, Number(data.total) || 0));
      page_.as(Math.max(1, Number(data.page) || requested_page));
      page_size_.as(Math.max(1, Number(data.page_size) || page_size_.value));
      log_path_.as(String(data.files?.[0]?.path || ""));
      last_loaded_.as(new Date().toLocaleTimeString());
      if (page_.value <= 1) previous_page_button_.disable();
      else previous_page_button_.enable();
      if (page_.value * page_size_.value >= total_.value) next_page_button_.disable();
      else next_page_button_.enable();
      return true;
    } catch (error) {
      const message = error?.message || String(error);
      error_.as(message);
      log_viewer_event("error", "application logs load failed", { error: message });
      return false;
    } finally {
      loading_.as(false);
      refresh_button_.setLoading(false);
    }
  }

  function start_auto_refresh() {
    if (refresh_timer_ !== null || typeof set_interval !== "function") return;
    refresh_timer_ = set_interval(function () {
      if (auto_refresh_.value) void load(page_.value);
    }, LOG_REFRESH_INTERVAL);
  }

  const methods = {
    async clearLogs() {
      if (!confirm_action("确定清空应用日志吗？此操作无法撤销。")) return false;
      try {
        const response = await request("/api/logs/clear", { method: "POST" });
        if (!response || response.code !== 0) {
          throw new Error(response?.msg || "清空日志失败");
        }
        log_viewer_event("info", "application logs cleared from viewer");
        return load(1);
      } catch (error) {
        const message = error?.message || String(error);
        error_.as(message);
        log_viewer_event("error", "application logs clear failed", { error: message });
        return false;
      }
    },
    destroy() {
      destroyed_ = true;
      if (refresh_timer_ !== null && typeof clear_interval === "function") {
        clear_interval(refresh_timer_);
      }
      refresh_timer_ = null;
      controls_.forEach(function (control) {
        control.destroy?.();
      });
      log_viewer_event("info", "application logs page unmounted");
    },
    load,
    nextPage() {
      const page_count = Math.max(1, Math.ceil(total_.value / page_size_.value));
      if (page_.value < page_count) return load(page_.value + 1);
      return false;
    },
    previousPage() {
      if (page_.value > 1) return load(page_.value - 1);
      return false;
    },
    ready() {
      destroyed_ = false;
      log_viewer_event("info", "application logs page mounted");
      start_auto_refresh();
      return load(1);
    },
    setAutoRefresh(value) {
      const enabled = Boolean(value);
      auto_refresh_.as(enabled);
      auto_refresh_button_.setVariant(enabled ? "primary" : "outline");
    },
    setComponent(value) {
      component_input_.setValue(String(value || "all").trim() || "all", {
        silence: true,
      });
    },
    setKeyword(value) {
      keyword_input_.setValue(String(value || ""), { silence: true });
    },
    setLevel(value) {
      const next_level = String(value || "all").toLowerCase();
      level_.as(LOG_LEVELS.has(next_level) ? next_level : "all");
      Object.entries(level_buttons_).forEach(function ([level, button]) {
        button.setVariant(level === level_.value ? "primary" : "ghost");
      });
      return load(1);
    },
  };

  return {
    methods,
    state: {
      autoRefresh: auto_refresh_,
      component: component_input_,
      keyword: keyword_input_,
      level: level_,
      loading: loading_,
      page: page_,
      pageSize: page_size_,
      total: total_,
    },
    ui: {
      entries: entries_,
      autoRefreshButton: auto_refresh_button_,
      clearButton: clear_button_,
      componentInput: component_input_,
      error: error_,
      errorVisible: computed(error_, Boolean),
      keywordInput: keyword_input_,
      lastLoaded: last_loaded_,
      levelButtons: level_buttons_,
      loadingLabel: computed(loading_, (loading) => loading ? "刷新中…" : "刷新"),
      logPath: log_path_,
      nextPageButton: next_page_button_,
      pageLabel: Timeless.combine(
        { page: page_, pageSize: page_size_, total: total_ },
        ({ page, pageSize, total }) =>
          `第 ${page} / ${Math.max(1, Math.ceil(total / pageSize))} 页 · ${total} 条`,
      ),
      previousPageButton: previous_page_button_,
      refreshButton: refresh_button_,
      searchButton: search_button_,
    },
  };
}
