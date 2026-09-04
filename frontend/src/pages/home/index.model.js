import { HomeWorkspaceModel } from "./home_workspace.model.js";

/** @typedef {import("./home.models").HomeRouteKey} HomeRouteKey */
/** @typedef {import("./home.models").HomeRouteView} HomeRouteView */
/** @typedef {import("./home.models").HomeSection} HomeSection */

/** @type {Readonly<Record<HomeSection, HomeRouteKey>>} */
const HOME_VIEW_ROUTE_KEYS = Object.freeze({
  boards: "board",
  chat: "chat",
  clipboard: "clipboard",
  codeblocks: "codeblock",
  credentials: "credentials",
  files: "file",
  images: "image",
  links: "link",
  logs: "logs",
  memos: "memo",
  milestones: "milestone",
  rules: "rule",
  todos: "todo",
});

/** @type {Readonly<Record<string, HomeSection>>} */
const HOME_ROUTE_KEY_VIEWS = Object.freeze(
  /** @type {Record<string, HomeSection>} */ (
    Object.fromEntries(
      Object.entries(HOME_VIEW_ROUTE_KEYS).map(function ([view, route_key]) {
        return [route_key, view];
      }),
    )
  ),
);

/**
 * @param {HomeRouteView | null | undefined} route_view
 * @returns {HomeSection}
 */
function home_view_from_route(route_view) {
  const route_key = String(route_view?.name || "")
    .split(".")
    .pop();
  return HOME_ROUTE_KEY_VIEWS[route_key] || "memos";
}

/**
 * @param {HomeSection} active_view
 * @returns {string}
 */
function home_route_name(active_view) {
  return `root.home_layout.index.${HOME_VIEW_ROUTE_KEYS[active_view] || "memo"}`;
}

/**
 * @param {unknown} value
 * @returns {HomeSection}
 */
function normalize_home_section(value) {
  const section = String(value || "memos");
  if (Object.prototype.hasOwnProperty.call(HOME_VIEW_ROUTE_KEYS, section)) {
    return /** @type {HomeSection} */ (section);
  }
  return "memos";
}

/**
 * Opens the standalone settings window without depending on whichever
 * KeepAlive child controller happens to be active.
 *
 * @returns {Promise<boolean>}
 */
export async function openSettingsWindow() {
  if (typeof globalThis.invoke === "function") {
    const response = await globalThis.invoke(
      "/api/open_window?pathname=%2Fsettings",
      { method: "GET" },
    );
    if (!response || response.code !== 0) {
      throw new Error(response?.msg || "打开设置失败");
    }
    return true;
  }

  if (typeof globalThis.window?.open === "function") {
    globalThis.window.open("settings.html", "_blank", "noopener");
    return true;
  }
  return false;
}

/** @param {import("./home.models").HomePageProps} props */
export function HomePageModel(props) {
  const workspace$ = HomeWorkspaceModel(props.app);
  const elements = {};
  const listeners = [];

  function activate_route(route_view) {
    workspace$.methods.activate(home_view_from_route(route_view));
  }

  if (typeof props.view?.onCurViewChange === "function") {
    listeners.push(props.view.onCurViewChange(activate_route));
  }

  const methods = {
    handleClick(event) {
      const project = event.target.closest?.("[data-project-detail]");
      if (project) {
        workspace$.methods.activate("memos");
        workspace$.methods.run(
          "memos",
          "openProject",
          String(project.dataset.projectDetail || ""),
        );
        props.history.push(home_route_name("memos"), {});
        return;
      }

      const tag = event.target.closest?.("[data-tag]");
      if (tag) {
        workspace$.methods.activateTag(String(tag.dataset.tag || ""));
        props.history.push(home_route_name("memos"), {});
        return;
      }

      const view = event.target.closest?.("[data-view]");
      if (view) {
        const active_view = normalize_home_section(view.dataset.view);
        workspace$.methods.activate(active_view);
        props.history.push(home_route_name(active_view), {});
        return;
      }

      const filter = event.target.closest?.("[data-filter]");
      if (filter) {
        const active_filter = String(filter.dataset.filter || "all");
        workspace$.methods.activate("memos");
        workspace$.methods.activateFilter(active_filter);
        props.history.push(
          home_route_name("memos"),
          active_filter === "all" ? {} : { filter: active_filter },
        );
        return;
      }

      const action = event.target.closest?.("[data-action]");
      if (!action) return;
      const active_section = workspace$.state.activeSection.value;
      if (action.dataset.action === "createProject") {
        workspace$.methods.run(active_section, "createProject");
      } else if (action.dataset.action === "openSettings") {
        openSettingsWindow().catch(function (error) {
          console.error("[home] failed to open settings window", error);
        });
      }
    },
    init() {
      activate_route(props.view?.curView);
    },
  };

  return {
    elements,
    methods,
    state: {
      activeFilter: workspace$.state.activeFilter,
      activeTag: workspace$.state.activeTag,
      activeView: workspace$.state.activeSection,
    },
    ui: workspace$.sidebar,
    destroy() {
      listeners.forEach(function (unsubscribe) {
        unsubscribe?.();
      });
    },
  };
}
