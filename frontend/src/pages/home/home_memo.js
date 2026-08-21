import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { tn } from "@/tnui.js";
import { TagSelect as TagSelectControl } from "@/components/tag-select.js";
import { logMemoPagination } from "@/domain/memo-pagination-log.js";

import {
  MemoCardView,
  MemoComposer,
  MemoHeaderActions,
  MemoInspector,
  MemoOverlays,
} from "./home_memo.components.js";
import { HomeMemoPageModel } from "./home_memo.model.js";
import { HomePageHeader } from "./home_page_header.js";

export function TagSelect(vm$) {
  return TagSelectControl({
    class: "memo-feed-tag-select",
    store: vm$.ui.feedTagSelect,
    attributes: { "aria-label": "标签筛选", n: "home-memo-tag-filter" },
  });
}

function Tool(vm$) {
  return View(
    {
      as: "section",
      class: "memo-feed-tools",
      hidden: vm$.ui.feedToolsHidden,
      attributes: {
        "aria-label": "Memo search and filters",
        n: "home-memo-feed-tools",
      },
    },
    [
      tn.Input({
        rootClass: "memo-search",
        store: vm$.ui.feedSearchInput,
        type: "search",
        placeholder: vm$.ui.searchPlaceholder,
        attributes: {
          "data-search-input": "true",
          n: "home-memo-search-input",
          type: "search",
        },
      }),
      View(
        {
          class: "memo-project-filter-wrap",
          attributes: { n: "home-memo-project-filter" },
        },
        [
          tn.Select({
            class: "memo-feed-project-select",
            contentClass: "memo-feed-project-select-menu",
            store: vm$.ui.feedProjectSelect.store,
            attributes: {
              "aria-label": "Project filter",
              "data-project-select": "true",
              n: "home-memo-project-filter-select",
            },
          }),
        ],
      ),
      TagSelect(vm$),
      tn.Button(
        {
          store: vm$.ui.feedResetButton,
          attributes: {
            "data-action": "clearFilters",
            n: "home-memo-reset-filters-action",
            type: "button",
          },
        },
        ["重置"],
      ),
    ],
  );
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeMemoPageView(props) {
  const vm$ = HomeMemoPageModel(props);
  const unsubscribe_reach_bottom = vm$.ui.memoMainScroll.onReachBottom(
    function () {
      logMemoPagination("info", "reach-bottom-fired");
      vm$.methods.loadMoreMemos("scroll-core");
    },
  );
  const page_class = computed(vm$.ui.memoShellClass, function (shell_class) {
    return `${shell_class} page home-memo-page w-full h-full`;
  });
  return View(
    {
      class: page_class,
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      attributes: {
        "data-section-shell": "true",
        n: "home-memo-page",
      },
      onMounted(event) {
        logMemoPagination("info", "page-view-mounted");
        vm$.methods.init(event);
      },
      onUnmounted() {
        unsubscribe_reach_bottom();
        vm$.destroy();
      },
    },
    [
      Timeless.ui.ScrollViewPrimitive.Root(
        {
          class: vm$.ui.memoMainClass,
          store: vm$.ui.memoMainScroll,
          style: { overflowY: "auto" },
          onMounted(event) {
            vm$.methods.mountMemoMainScroll(event);
          },
          onUnmounted() {
            vm$.methods.unmountMemoMainScroll();
          },
          attributes: {
            "data-home-page-main": "true",
            n: "home-memo-main",
            role: "main",
          },
        },
        [
          HomePageHeader({
            actions: MemoHeaderActions(vm$),
            eyebrow: vm$.ui.mainEyebrow,
            meaning: "home-memo-header",
            subtitle: vm$.ui.mainSubtitle,
            title: vm$.ui.mainTitle,
          }),
          View(
            {
              attributes: { n: "home-memo-feed-layout" },
              style: {
                padding: "0 20px 12px",
              },
            },
            [
              MemoComposer(vm$),
              Tool(vm$),
              View(
                {
                  as: "section",
                  class: vm$.ui.memoListClass,
                  attributes: {
                    "data-memo-list": "true",
                    n: "home-memo-content",
                  },
                },
                [],
              ),
            ],
          ),
        ],
      ),
      MemoInspector(vm$),
      MemoOverlays(vm$),
    ],
  );
}

export function MemoFeedView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Fragment, View } = runtime;
  const memos_ = isRef(props.memos) ? props.memos : ref(props.memos || []);
  const has_more_ = isRef(props.hasMore)
    ? props.hasMore
    : ref(Boolean(props.hasMore));
  const loading_ = isRef(props.loading)
    ? props.loading
    : ref(Boolean(props.loading));
  const empty_ = computed(memos_, function (memos) {
    return !memos?.length;
  });
  return Fragment({}, [
    Show({
      when: empty_,
      ok() {
        return View(
          { class: "memo-empty-state", attributes: { n: "memo-feed-empty" } },
          [
            View(
              {
                class: "memo-empty-icon",
                attributes: { n: "memo-feed-empty-icon" },
              },
              [
                Timeless.Icon({
                  name: "search",
                  attributes: { n: "memo-feed-empty-symbol" },
                }),
              ],
            ),
            View({ as: "h2", attributes: { n: "memo-feed-empty-title" } }, [
              "没有匹配的 memo",
            ]),
            Button(
              {
                class: "tn-button tn-button--secondary memo-secondary-button",
                attributes: {
                  "data-action": "clearFilters",
                  n: "memo-feed-clear-filters",
                  type: "button",
                },
              },
              ["查看全部"],
            ),
          ],
        );
      },
      else() {
        return Fragment({}, [
          For({
            each: memos_,
            render(memo) {
              const projects = isRef(props.projects)
                ? props.projects.value
                : props.projects;
              return MemoCardView({ memo, projects, runtime });
            },
          }),
        ]);
      },
    }),
    Show({
      when: has_more_,
      ok() {
        const label_ = computed(loading_, function (loading) {
          return loading ? "正在加载..." : "加载更多...";
        });
        return View(
          {
            class: "memo-feed-load-more",
            attributes: { n: "memo-feed-load-more" },
            onMounted(event) {
              props.onLoadMoreSentinelMounted?.(event);
            },
            onUnmounted() {
              props.onLoadMoreSentinelUnmounted?.();
            },
          },
          [
            Button(
              {
                class: "tn-button tn-button--ghost",
                disabled: loading_,
                onClick() {
                  logMemoPagination("info", "load-more-button-clicked");
                  props.onLoadMore?.("button");
                },
                attributes: {
                  n: "memo-feed-load-more-action",
                  type: "button",
                },
              },
              [label_],
            ),
          ],
        );
      },
    }),
  ]);
}
