import {
  createMemosPageState,
  createMemosPageUIState,
  destroyMemosPageUIState,
  mountMemosHome,
} from "./memos.js";
import { HomeWorkspaceModel } from "./home_workspace.model.js";

/** @typedef {import("./home.models").HomeElementRegistry} HomeElementRegistry */
/** @typedef {import("./home.models").HomePageProps} HomePageProps */
/** @typedef {import("./home.models").HomeSection} HomeSection */
/** @typedef {import("./home.models").HomeSectionController} HomeSectionController */

/**
 * Creates the independent state and controller owned by one KeepAlive child
 * page. Each route retains its own editor and collection state while hidden.
 *
 * @param {HomePageProps} props
 * @param {HomeSection} section
 */
export function HomeSectionPageModel(props, section) {
  const page_state = createMemosPageState(section);
  const ui = createMemosPageUIState();
  /** @type {HomeElementRegistry} */
  const elements = {};
  const route_active_ = ref(Boolean(props.view?.visible));
  const pathname_ = ref(String(props.view?.pathname || ""));
  const section_ = ref(section);
  const workspace$ = HomeWorkspaceModel(props.app);
  /** @type {Array<() => void>} */
  const listeners = [];
  /** @type {HomeSectionController | null} */
  let controller_ = null;
  let mounted_ = false;
  /** @type {(() => void) | null} */
  let unregister_controller_ = null;
  let destroyed_ = false;

  function mounted_element(event) {
    const target = event?.target || event;
    if (typeof target?.get$elm === "function") return target.get$elm();
    return target;
  }

  function collect_page_elements(root) {
    const selectors = {
      attachInput: "[data-attach-input]",
      calendar: "[data-calendar]",
      clipboardCard: "[data-clipboard-card]",
      composerHost: "[data-composer-host]",
      composerVimStatus: "[data-composer-vim-status]",
      memoList: "[data-memo-list]",
      memoMain: "[data-home-page-main]",
      memoSearchInput: "[data-memo-search-input]",
      memoSearchPalette: "[data-memo-search-palette]",
      memoSearchResults: "[data-memo-search-results]",
      pinnedList: "[data-pinned-list]",
      projectFilterSelect: "[data-project-filter-select]",
      projectList: "[data-project-list]",
      projectSelect: "[data-project-select]",
      tagList: "[data-tag-list]",
      topbarProjectActions: "[data-topbar-project-actions]",
      visibilitySelect: "[data-visibility-select]",
    };
    Object.entries(selectors).forEach(function ([name, selector]) {
      elements[name] = root.querySelector(selector);
    });
  }

  function activate() {
    workspace$.methods.activate(section);
    if (section === "memos") {
      workspace$.methods.activateFilter(
        String(props.view?.query?.filter || "all"),
      );
    }
  }

  if (typeof props.view?.onStateChange === "function") {
    listeners.push(
      props.view.onStateChange(function (next_state) {
        route_active_.as(Boolean(next_state.visible));
      }),
    );
  }
  if (typeof props.view?.onShow === "function") {
    listeners.push(
      props.view.onShow(function () {
        route_active_.as(true);
        activate();
      }),
    );
  }

  const methods = {
    init(event) {
      const root = mounted_element(event);
      if (!root) return;
      mounted_ = true;
      activate();
      queueMicrotask(function () {
        if (!mounted_ || destroyed_) return;
        collect_page_elements(root);
        controller_ = mountMemosHome(root, {
          elements,
          history: props.history,
          routeView: props.view,
          state: page_state.state,
          ui,
        });
        unregister_controller_ = workspace$.methods.register(
          section,
          controller_,
        );
        controller_.activateView(section);
        if (section === "memos") {
          controller_.activateFilter(
            String(props.view?.query?.filter || "all"),
          );
        }
      });
    },
  };

  return {
    data: page_state.state,
    elements,
    methods,
    state: {
      ...page_state.refs,
      pathname: pathname_,
      routeActive: route_active_,
      section: section_,
    },
    ui,
    destroy() {
      if (destroyed_) return;
      destroyed_ = true;
      mounted_ = false;
      listeners.forEach(function (unsubscribe) {
        unsubscribe?.();
      });
      unregister_controller_?.();
      unregister_controller_ = null;
      controller_?.destroy();
      controller_ = null;
      page_state.destroy();
      destroyMemosPageUIState(ui);
      route_active_.destroy?.();
      pathname_.destroy?.();
      section_.destroy?.();
    },
  };
}
