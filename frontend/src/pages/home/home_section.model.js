import {
  createMemosPageState,
  createMemosPageUIState,
  destroyMemosPageUIState,
  mountMemosHome,
} from "./memos.js";
import { logMemoPagination } from "@/domain/memo-pagination-log.js";
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
  let scroll_event_count_ = 0;
  let last_scroll_log_at_ = 0;
  let memo_main_scroll_element_ = null;
  let memo_main_scroll_handler_ = null;
  let memo_load_more_sentinel_ = null;
  let memo_load_more_observer_ = null;
  let memo_load_more_intersected_ = false;

  function mounted_element(event) {
    const target = event?.target || event;
    if (typeof target?.get$elm === "function") return target.get$elm();
    return target;
  }

  function detach_memo_main_scroll() {
    if (memo_main_scroll_element_ && memo_main_scroll_handler_) {
      memo_main_scroll_element_.removeEventListener(
        "scroll",
        memo_main_scroll_handler_,
      );
    }
    memo_main_scroll_element_ = null;
    memo_main_scroll_handler_ = null;
  }

  function disconnect_memo_load_more_observer() {
    memo_load_more_observer_?.disconnect();
    memo_load_more_observer_ = null;
    memo_load_more_sentinel_ = null;
    memo_load_more_intersected_ = false;
  }

  function observe_memo_load_more_sentinel() {
    const sentinel = memo_load_more_sentinel_;
    const observer = memo_load_more_observer_;
    if (!sentinel || !observer || destroyed_) return;
    observer.observe(sentinel);
  }

  function collect_page_elements(root) {
    const selectors = {
      attachInput: "[data-attach-input]",
      calendar: "[data-calendar]",
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
      if (!root) {
        logMemoPagination("error", "page-model-init-missing-root");
        return;
      }
      logMemoPagination("info", "page-model-init", { section });
      mounted_ = true;
      activate();
      queueMicrotask(function () {
        if (!mounted_ || destroyed_) return;
        collect_page_elements(root);
        controller_ = mountMemosHome(root, {
          elements,
          history: props.history,
          isSidebarActive() {
            return workspace$.state.activeSection.value === section;
          },
          loadMoreMemos(source) {
            return methods.loadMoreMemos(source);
          },
          observeMemoLoadMoreSentinel(event) {
            methods.observeMemoLoadMoreSentinel(event);
          },
          unobserveMemoLoadMoreSentinel() {
            methods.unobserveMemoLoadMoreSentinel();
          },
          routeView: props.view,
          section,
          sidebar: workspace$.sidebar,
          state: page_state.state,
          stateRefs: page_state.refs,
          syncSidebarSelection(selection) {
            workspace$.methods.syncSidebarSelection(selection);
          },
          ui,
        });
        logMemoPagination("info", "page-controller-mounted", { section });
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
    async loadMoreMemos(source = "unknown") {
      logMemoPagination("info", "page-model-load-more-called", {
        controllerReady: Boolean(controller_),
        source,
      });
      try {
        const changed = Boolean(await controller_?.loadMoreMemos(source));
        logMemoPagination("info", "page-model-load-more-complete", {
          changed,
          source,
        });
        return changed;
      } catch (error) {
        logMemoPagination(
          "error",
          "page-model-load-more-failed",
          { source },
          error,
        );
        throw error;
      } finally {
        ui.memoMainScroll.finishLoadingMore();
        logMemoPagination("debug", "scroll-core-finished", { source });
      }
    },
    mountMemoMainScroll(event) {
      const scroll_element = mounted_element(event);
      detach_memo_main_scroll();
      if (typeof scroll_element?.addEventListener !== "function") {
        logMemoPagination("error", "native-scroll-mount-failed", {
          targetFound: Boolean(scroll_element),
        });
        return;
      }
      memo_main_scroll_element_ = scroll_element;
      memo_main_scroll_handler_ = function (scroll_event) {
        methods.handleMemoMainScroll(scroll_event);
      };
      scroll_element.addEventListener("scroll", memo_main_scroll_handler_, {
        passive: true,
      });
      const styles = globalThis.getComputedStyle?.(scroll_element);
      logMemoPagination("info", "native-scroll-mounted", {
        clientHeight: Number(scroll_element.clientHeight) || 0,
        nodeName: String(scroll_element.nodeName || ""),
        overflowY: String(styles?.overflowY || ""),
        scrollHeight: Number(scroll_element.scrollHeight) || 0,
        semanticName: String(
          scroll_element.getAttribute?.("data-n") ||
            scroll_element.getAttribute?.("n") ||
            "",
        ),
      });
    },
    unmountMemoMainScroll() {
      detach_memo_main_scroll();
    },
    handleMemoMainScroll(event) {
      let target = event?.currentTarget || event?.target || event;
      if (typeof target?.get$elm === "function") target = target.get$elm();
      const scroll_top = Math.max(0, Number(target?.scrollTop) || 0);
      const client_height = Math.max(0, Number(target?.clientHeight) || 0);
      const scroll_height = Math.max(0, Number(target?.scrollHeight) || 0);
      const distance_to_bottom = Math.max(
        0,
        scroll_height - client_height - scroll_top,
      );
      scroll_event_count_ += 1;
      const now = Date.now();
      const near_bottom = distance_to_bottom <= 240;
      if (
        scroll_event_count_ === 1 ||
        near_bottom ||
        now - last_scroll_log_at_ >= 2000
      ) {
        last_scroll_log_at_ = now;
        logMemoPagination(near_bottom ? "info" : "debug", "native-scroll", {
          clientHeight: client_height,
          distanceToBottom: distance_to_bottom,
          eventCount: scroll_event_count_,
          scrollHeight: scroll_height,
          scrollTop: scroll_top,
          targetFound: Boolean(target),
        });
      }
      if (
        scroll_top > 0 &&
        distance_to_bottom <= 160 &&
        !Boolean(ui.memoFeedLoading.value)
      ) {
        logMemoPagination("info", "native-scroll-threshold-reached", {
          distanceToBottom: distance_to_bottom,
          scrollTop: scroll_top,
        });
        return methods.loadMoreMemos("native-scroll");
      }
      return false;
    },
    observeMemoLoadMoreSentinel(event) {
      const sentinel = mounted_element(event);
      disconnect_memo_load_more_observer();
      if (!sentinel || typeof globalThis.IntersectionObserver !== "function") {
        logMemoPagination("error", "load-more-sentinel-mount-failed", {
          intersectionObserverAvailable:
            typeof globalThis.IntersectionObserver === "function",
          targetFound: Boolean(sentinel),
        });
        return;
      }
      memo_load_more_sentinel_ = sentinel;
      memo_load_more_observer_ = new globalThis.IntersectionObserver(
        function (entries) {
          const entry = entries.find(function (candidate) {
            return candidate.target === memo_load_more_sentinel_;
          });
          if (!entry) return;
          logMemoPagination(
            entry.isIntersecting ? "info" : "debug",
            "load-more-sentinel-intersection",
            {
              intersectionRatio: Number(entry.intersectionRatio) || 0,
              isIntersecting: Boolean(entry.isIntersecting),
            },
          );
          if (!entry.isIntersecting) {
            memo_load_more_intersected_ = false;
            return;
          }
          if (
            destroyed_ ||
            Boolean(ui.memoFeedLoading.value) ||
            memo_load_more_intersected_
          ) {
            return;
          }
          memo_load_more_intersected_ = true;
          methods.loadMoreMemos("intersection-observer");
        },
        {
          root: null,
          rootMargin: "0px 0px 240px 0px",
          threshold: 0.01,
        },
      );
      logMemoPagination("info", "load-more-sentinel-mounted");
      observe_memo_load_more_sentinel();
    },
    unobserveMemoLoadMoreSentinel() {
      disconnect_memo_load_more_observer();
    },
    acceptClipboardItem() {
      controller_?.acceptClipboardItem();
    },
    hideClipboardCard(options) {
      controller_?.hideClipboardCard(options);
    },
    requestClipboardLatest(options) {
      controller_?.requestClipboardLatest(options);
    },
    toggleTagFilter(tag) {
      controller_?.toggleTagFilter(String(tag || ""));
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
      detach_memo_main_scroll();
      disconnect_memo_load_more_observer();
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
