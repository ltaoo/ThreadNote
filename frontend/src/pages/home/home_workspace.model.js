/** @typedef {import("./home.models").HomeSection} HomeSection */
/** @typedef {import("./home.models").HomeSectionController} HomeSectionController */
/** @typedef {import("./home.models").HomeWorkspaceModelInstance} HomeWorkspaceModelInstance */
/** @typedef {import("./home.models").HomePageProps} HomePageProps */
/** @typedef {import("./home.models").ReactiveRef<HomeSection>} HomeSectionRef */
/** @typedef {import("./home.models").ReactiveRef<string>} StringRef */

/** @type {WeakMap<object, HomeWorkspaceModelInstance>} */
const workspace_models_ = new WeakMap();
/** @type {HomeWorkspaceModelInstance | null} */
let fallback_workspace_model_ = null;

function create_sidebar_state() {
  return {
    activeProjectId: ref(""),
    allNavCount: ref("0"),
    boardNavCount: ref(""),
    chatNavCount: ref(""),
    clipboardNavCount: ref(""),
    codeNavCount: ref(""),
    fileNavCount: ref(""),
    imageNavCount: ref(""),
    linkNavCount: ref(""),
    milestoneNavCount: ref(""),
    projects: ref([]),
    rulesNavCount: ref(""),
    tags: ref([]),
    tagSummary: ref("暂无标签"),
    todoNavCount: ref(""),
  };
}

/** @returns {HomeWorkspaceModelInstance} */
function createHomeWorkspaceModel() {
  /** @type {HomeSectionRef} */
  const active_section_ = ref("memos");
  /** @type {StringRef} */
  const active_filter_ = ref("all");
  /** @type {StringRef} */
  const active_tag_ = ref("");
  /** @type {Map<HomeSection, HomeSectionController>} */
  const controllers_ = new Map();
  const sidebar_ = create_sidebar_state();

  return {
    sidebar: sidebar_,
    state: {
      activeFilter: active_filter_,
      activeSection: active_section_,
      activeTag: active_tag_,
    },
    methods: {
      activate(section) {
        if (!section) return;
        active_section_.as(section);
        if (section !== "memos") sidebar_.activeProjectId.as("");
        controllers_.get(section)?.activateView(section);
      },
      activateFilter(filter) {
        const next_filter = filter || "all";
        active_filter_.as(next_filter);
        active_tag_.as("");
        controllers_.get("memos")?.activateFilter(next_filter);
      },
      activateMemo(memo_id, options = {}) {
        const controller = controllers_.get("memos");
        if (!controller) return false;
        if (options.reveal !== false) active_section_.as("memos");
        return controller.activateMemo(memo_id, options);
      },
      activateTag(tag) {
        const next_tag = String(tag || "");
        active_section_.as("memos");
        active_filter_.as("all");
        active_tag_.as(active_tag_.value === next_tag ? "" : next_tag);
        controllers_.get("memos")?.activateTag(next_tag);
      },
      clearActiveMemo() {
        return controllers_.get("memos")?.clearActiveMemo() || false;
      },
      run(section, method, ...args) {
        const controller = controllers_.get(section);
        if (typeof controller?.[method] !== "function") return false;
        controller[method](...args);
        return true;
      },
      syncSidebarSelection(selection = {}) {
        active_filter_.as(String(selection.activeFilter || "all"));
        active_tag_.as(String(selection.activeTag || ""));
        sidebar_.activeProjectId.as(String(selection.activeProjectId || ""));
      },
      register(section, controller) {
        controllers_.set(section, controller);
        if (active_section_.value === section) controller?.activateView(section);

        return function unregister() {
          if (controllers_.get(section) === controller) {
            controllers_.delete(section);
          }
        };
      },
    },
  };
}

/**
 * Coordinates the independent KeepAlive child-page controllers with the shared
 * sidebar route state.
 *
 * @param {HomePageProps["app"]} app
 * @returns {HomeWorkspaceModelInstance}
 */
export function HomeWorkspaceModel(app) {
  if (!app || (typeof app !== "object" && typeof app !== "function")) {
    fallback_workspace_model_ ||= createHomeWorkspaceModel();
    return fallback_workspace_model_;
  }

  let workspace_model = workspace_models_.get(app);
  if (!workspace_model) {
    workspace_model = createHomeWorkspaceModel();
    workspace_models_.set(app, workspace_model);
  }
  return workspace_model;
}
