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

  return {
    state: {
      activeFilter: active_filter_,
      activeSection: active_section_,
      activeTag: active_tag_,
    },
    methods: {
      activate(section) {
        if (!section) return;
        active_section_.as(section);
        controllers_.get(section)?.activateView(section);
      },
      activateFilter(filter) {
        const next_filter = filter || "all";
        active_filter_.as(next_filter);
        active_tag_.as("");
        controllers_.get("memos")?.activateFilter(next_filter);
      },
      run(section, method, ...args) {
        const controller = controllers_.get(section);
        if (typeof controller?.[method] !== "function") return false;
        controller[method](...args);
        return true;
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
