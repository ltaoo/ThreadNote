import {
  Timeless,
  TimelessPrimitive,
} from "./timeless-icons.js";
import { renderTimelessView } from "./timeless-view-mount.js";
import { TimelineWindowModel } from "./timeline-window.model.js";

function icon(name, meaning) {
  return Timeless.Icon({ name, attributes: { n: meaning } });
}

function dom_node(element$) {
  return element$?.$elm?.get$elm?.() || element$?.$elm || null;
}

function TimelineItemView(props) {
  const { Button, RichText, Show, View } = props.runtime;
  const item = props.item;
  const type_name =
    item.type === "comment"
      ? "评论"
      : item.type === "task"
        ? "完成任务"
        : "memo";
  const icon_name =
    item.type === "comment"
      ? "message-square-more"
      : item.type === "task"
        ? "check"
        : "file-text";
  let collapse$ = null;

  function sync_collapsed_height() {
    const collapse = dom_node(collapse$);
    const content = collapse?.querySelector?.(".memo-content");
    if (!collapse || !content || item.type === "task") return;
    if (item.expanded || item.lineCount <= 36) {
      content.style.maxHeight = "";
      return;
    }
    const line_height = parseFloat(globalThis.getComputedStyle(content).lineHeight);
    if (Number.isFinite(line_height)) {
      content.style.maxHeight = Math.round(line_height * 36) + "px";
    }
  }

  collapse$ = View(
    {
      class:
        item.type === "task"
          ? "timeline-item-card"
          : "timeline-item-card memo-list-collapse " +
            (item.expanded ? "is-expanded" : "is-collapsed") +
            (!item.expanded && item.lineCount <= 36 ? " is-short" : ""),
      attributes: {
        "data-memo-lines": item.lineCount,
        n: "timeline-item-card",
      },
      onMounted: sync_collapsed_height,
    },
    [
      View(
        {
          class: "memo-content",
          attributes: { n: "timeline-item-content" },
        },
        [
          item.type === "task"
            ? item.content
            : RichText({
                attributes: { n: "timeline-item-rich-text" },
                content: item.html,
              }),
        ],
      ),
      Show({
        when: item.type !== "task",
        ok() {
          return [
            Button(
              {
                class: "memo-expand-button",
                attributes: {
                  "aria-expanded": item.expanded,
                  n: "timeline-item-expand-button",
                  type: "button",
                },
                onClick() {
                  props.vm$.methods.toggleExpand(item.id);
                },
              },
              [
                View(
                  { attributes: { n: "timeline-item-expand-label" } },
                  [item.expanded ? "收起" : "展开"],
                ),
                icon("chevron-down", "timeline-item-expand-icon"),
              ],
            ),
          ];
        },
      }),
    ],
  );

  return View(
    {
      class:
        "timeline-item" +
        (item.type === "comment" ? " is-comment" : "") +
        (item.type === "task" ? " is-task" : ""),
      attributes: { n: "timeline-item", role: "article" },
    },
    [
      View(
        {
          class: "timeline-item-dot",
          attributes: { "aria-hidden": "true", n: "timeline-item-dot" },
        },
        [],
      ),
      View(
        {
          class: "timeline-item-body",
          attributes: { n: "timeline-item-body" },
        },
        [
          View(
            {
              class: "timeline-item-head",
              attributes: { n: "timeline-item-header" },
            },
            [
              View(
                {
                  class: "timeline-item-type",
                  attributes: { n: "timeline-item-type" },
                },
                [
                  icon(icon_name, "timeline-item-type-icon"),
                  View(
                    { attributes: { n: "timeline-item-type-label" } },
                    [type_name],
                  ),
                ],
              ),
              View(
                {
                  class: "memo-relative-time",
                  attributes: {
                    datetime: item.createdAt,
                    n: "timeline-item-relative-time",
                    title: item.shortTime,
                  },
                },
                [item.relativeTime],
              ),
            ],
          ),
          Show({
            when: item.type === "comment" && Boolean(item.parentLabel),
            ok() {
              return [
                View(
                  {
                    class: "timeline-item-parent",
                    attributes: { n: "timeline-item-parent" },
                  },
                  ["回复: " + item.parentLabel],
                ),
              ];
            },
          }),
          collapse$,
        ],
      ),
    ],
  );
}

export function TimelineWindowView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  const { Button, For, Input, Show, View, computed } = runtime;
  const is_error_ = computed(vm$.state.status, function (status) {
    return status === "error";
  });
  const is_loading_ = computed(vm$.state.status, function (status) {
    return status === "loading";
  });
  const is_empty_ = computed(vm$.state.status, function (status) {
    return status === "empty";
  });
  const is_ready_ = computed(vm$.state.status, function (status) {
    return status === "ready";
  });
  const toast_class_ = computed(vm$.state.toast, function (toast) {
    return "memo-toast" + (toast ? " is-visible" : "");
  });

  return View(
    {
      class: "memo-window-shell timeline-shell velo-drag",
      attributes: {
        "data-velo-drag": "true",
        n: "timeline-window-shell",
      },
      onClick(event) {
        const memo_ref = event.target.closest?.("[data-memo-ref-target]");
        if (!memo_ref || !event.currentTarget.contains(memo_ref)) return;
        event.preventDefault();
        vm$.methods.openMemo(memo_ref.dataset.memoRefTarget);
      },
      onMounted() {
        document.title = "ThreadNote";
        vm$.methods.init();
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "memo-window-body timeline-body velo-no-drag",
          attributes: { n: "timeline-window-body" },
        },
        [
          View(
            {
              class: "timeline-header",
              attributes: { n: "timeline-header" },
            },
            [
              View(
                {
                  class: "timeline-date-nav",
                  attributes: { n: "timeline-date-navigation" },
                },
                [
                  Button(
                    {
                      class: "timeline-date-btn",
                      attributes: {
                        "aria-label": "前一天",
                        n: "timeline-previous-date-button",
                        title: "前一天",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.navigateDate("prev");
                      },
                    },
                    ["‹"],
                  ),
                  View(
                    {
                      class: "timeline-date-label",
                      attributes: { n: "timeline-selected-date-label" },
                    },
                    [vm$.state.dateLabel],
                  ),
                  Button(
                    {
                      class: "timeline-date-btn",
                      attributes: {
                        "aria-label": "后一天",
                        n: "timeline-next-date-button",
                        title: "后一天",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.navigateDate("next");
                      },
                    },
                    ["›"],
                  ),
                  Button(
                    {
                      class: "timeline-date-btn timeline-today-btn",
                      attributes: {
                        "aria-label": "回到今天",
                        n: "timeline-today-button",
                        title: "回到今天",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.navigateDate("today");
                      },
                    },
                    [icon("clock", "timeline-today-icon")],
                  ),
                ],
              ),
              Input({
                class: "timeline-search",
                placeholder: "搜索...",
                type: "search",
                value: vm$.state.query,
                attributes: {
                  "aria-label": "搜索时间线",
                  n: "timeline-search-input",
                  type: "search",
                },
                onInput(event) {
                  vm$.methods.setQuery(event.currentTarget.value);
                },
              }),
            ],
          ),
          View(
            {
              class: "timeline-list",
              attributes: { "aria-label": "时间线", n: "timeline-item-list" },
              onScroll(event) {
                const list = event.currentTarget;
                if (
                  list.scrollTop + list.clientHeight >=
                  list.scrollHeight - 60
                ) {
                  vm$.methods.loadMore();
                }
              },
            },
            [
              Show({
                when: is_error_,
                ok() {
                  return [
                    View(
                      {
                        class: "timeline-state",
                        attributes: { n: "timeline-error-state", role: "alert" },
                      },
                      [vm$.state.error],
                    ),
                  ];
                },
              }),
              Show({
                when: is_loading_,
                ok() {
                  return [
                    View(
                      {
                        class: "timeline-state",
                        attributes: { n: "timeline-loading-state", role: "status" },
                      },
                      ["正在加载..."],
                    ),
                  ];
                },
              }),
              Show({
                when: is_empty_,
                ok() {
                  return [
                    View(
                      {
                        class: "timeline-state",
                        attributes: { n: "timeline-empty-state" },
                      },
                      ["该日暂无内容"],
                    ),
                  ];
                },
              }),
              Show({
                when: is_ready_,
                ok() {
                  return [
                    For({
                      each: vm$.state.items,
                      render(item) {
                        return TimelineItemView({ item, runtime, vm$ });
                      },
                    }),
                    Show({
                      when: vm$.state.hasMore,
                      ok() {
                        return [
                          View(
                            {
                              class: "timeline-load-more",
                              attributes: { n: "timeline-load-more-status" },
                            },
                            ["加载更多..."],
                          ),
                        ];
                      },
                    }),
                  ];
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: toast_class_,
          attributes: {
            "aria-live": "polite",
            n: "timeline-toast",
            role: "status",
          },
        },
        [vm$.state.toast],
      ),
    ],
  );
}

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[TimelineWindow] Root element not found");
    return;
  }
  const vm$ = TimelineWindowModel();
  renderTimelessView(root, TimelineWindowView({ vm$ }));
});
