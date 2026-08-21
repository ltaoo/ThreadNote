import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

import {
  MemoCardView,
  MemoComposer,
  MemoFeedTools,
  MemoHeaderActions,
  MemoInspector,
  MemoOverlays,
} from "./home_memo.components.js";
import { HomeMemoPageModel } from "./home_memo.model.js";
import { HomePageHeader } from "./home_page_header.js";

/** @param {import("./home.models").HomePageProps} props */
export default function HomeMemoPageView(props) {
  const vm$ = HomeMemoPageModel(props);
  const unsubscribe_reach_bottom = vm$.ui.memoMainScroll.onReachBottom(
    function () {
      vm$.methods.loadMoreMemos();
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
        vm$.methods.init(event);
      },
      onUnmounted() {
        unsubscribe_reach_bottom();
        vm$.destroy();
      },
    },
    [
      Timeless.ScrollView(
        {
          class: vm$.ui.memoMainClass,
          horizontal: "hidden",
          store: vm$.ui.memoMainScroll,
          vertical: "auto",
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
              style: {
                padding: "0 20px 12px",
              },
            },
            [
              MemoComposer(vm$),
              MemoFeedTools(vm$),
              View(
                {
                  as: "section",
                  class: vm$.ui.memoListClass,
                  attributes: {
                    "data-memo-list": "true",
                    n: "home-memo-content",
                  },
                },
                [
                  MemoFeedView({
                    hasMore: vm$.ui.memoFeedHasMore,
                    memos: vm$.ui.memoFeedMemos,
                    projects: vm$.ui.memoFeedProjects,
                  }),
                ],
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
  const empty_ = computed(memos_, function (memos) {
    return !memos?.length;
  });
  return Show({
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
        Show({
          when: has_more_,
          ok() {
            return View(
              {
                class: "memo-feed-load-more",
                attributes: { n: "memo-feed-load-more" },
              },
              ["加载更多..."],
            );
          },
        }),
      ]);
    },
  });
}
