import { TimelessPrimitive } from "@/timeless-icons.js";
import { tn } from "@/tnui.js";

import { HomeLogsPageModel } from "./home_logs.model.js";
import { HomePageHeader } from "./home_page_header.js";

const LOG_LEVELS = Object.freeze([
  ["all", "全部"],
  ["debug", "DEBUG"],
  ["info", "INFO"],
  ["warn", "WARN"],
  ["error", "ERROR"],
]);

const LOG_LEVEL_VARIANTS = Object.freeze({
  debug: "default",
  error: "danger",
  info: "primary",
  warn: "warning",
});

function level_filter_button(vm$, level, label) {
  return tn.Button(
    {
      store: vm$.ui.levelButtons[level],
      attributes: {
        "aria-pressed": computed(vm$.state.level, (active) => active === level),
        n: `home-logs-level-${level}`,
        type: "button",
      },
    },
    [label],
  );
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeLogsPageView(props) {
  const { For, View } = TimelessPrimitive;
  const vm$ = HomeLogsPageModel(props);
  const auto_refresh_label_ = computed(vm$.state.autoRefresh, function (enabled) {
    return enabled ? "自动刷新：开" : "自动刷新：关";
  });

  return View(
    {
      class: "page home-logs-page w-full h-full",
      attributes: { n: "home-logs-page" },
      dataset: { pathname: props.view?.pathname || "", section: "logs" },
      onMounted() {
        vm$.methods.ready();
      },
      onUnmounted() {
        vm$.methods.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: "DIAGNOSTICS / APPLICATION",
        meaning: "home-logs-header",
        subtitle: "前端交互、请求生命周期与后端关键节点的结构化日志",
        title: "运行日志",
      }),
      View(
        {
          as: "main",
          class: "home-logs-main",
          attributes: { n: "home-logs-main" },
        },
        [
          tn.Card(
            {
              as: "section",
              class: "home-logs-toolbar",
              attributes: { "aria-label": "日志筛选", n: "home-logs-toolbar" },
            },
            [
              View(
                {
                  class: "home-logs-search-row",
                  attributes: { n: "home-logs-search-row" },
                },
                [
                  tn.Input({
                    rootClass: "home-logs-keyword-control",
                    store: vm$.ui.keywordInput,
                    type: "search",
                    attributes: {
                      "aria-label": "搜索日志",
                      n: "home-logs-keyword-input",
                      type: "search",
                    },
                  }),
                  tn.Input({
                    rootClass: "home-logs-component-control",
                    store: vm$.ui.componentInput,
                    type: "text",
                    attributes: {
                      "aria-label": "日志组件",
                      n: "home-logs-component-input",
                      type: "text",
                    },
                  }),
                  tn.Button(
                    {
                      store: vm$.ui.searchButton,
                      attributes: { n: "home-logs-search-button", type: "button" },
                    },
                    ["查询"],
                  ),
                ],
              ),
              View(
                {
                  class: "home-logs-actions-row",
                  attributes: { n: "home-logs-actions-row" },
                },
                [
                  View(
                    {
                      class: "home-logs-level-filters",
                      attributes: { n: "home-logs-level-filters" },
                    },
                    LOG_LEVELS.map(([level, label]) =>
                      level_filter_button(vm$, level, label),
                    ),
                  ),
                  View(
                    {
                      class: "home-logs-toolbar-actions",
                      attributes: { n: "home-logs-toolbar-actions" },
                    },
                    [
                      tn.Button(
                        {
                          store: vm$.ui.autoRefreshButton,
                          attributes: {
                            "aria-pressed": vm$.state.autoRefresh,
                            n: "home-logs-auto-refresh-button",
                            type: "button",
                          },
                        },
                        [auto_refresh_label_],
                      ),
                      tn.Button(
                        {
                          store: vm$.ui.refreshButton,
                          attributes: { n: "home-logs-refresh-button", type: "button" },
                        },
                        [vm$.ui.loadingLabel],
                      ),
                      tn.Button(
                        {
                          store: vm$.ui.clearButton,
                          attributes: { n: "home-logs-clear-button", type: "button" },
                        },
                        ["清空"],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          Show({
            when: vm$.ui.errorVisible,
            ok() {
              return tn.Alert(
                {
                  class: "home-logs-error",
                  variant: "danger",
                  attributes: { n: "home-logs-error" },
                },
                [vm$.ui.error],
              );
            },
          }),
          tn.Card(
            {
              class: "home-logs-summary",
              attributes: { n: "home-logs-summary" },
            },
            [
              View({ as: "span", attributes: { n: "home-logs-page-summary" } }, [vm$.ui.pageLabel]),
              View({ as: "span", attributes: { n: "home-logs-last-loaded" } }, ["最近刷新：", vm$.ui.lastLoaded]),
              View({ as: "code", attributes: { n: "home-logs-file-path" } }, [vm$.ui.logPath]),
            ],
          ),
          tn.Card(
            {
              as: "section",
              class: "home-logs-list",
              attributes: { "aria-label": "应用日志", n: "home-logs-list" },
            },
            [
              For({
                each: vm$.ui.entries,
                render(entry) {
                  return View(
                    {
                      as: "article",
                      class: `home-logs-entry is-${entry.level}`,
                      attributes: { n: "home-logs-entry" },
                    },
                    [
                      View(
                        {
                          class: "home-logs-entry-heading",
                          attributes: { n: "home-logs-entry-heading" },
                        },
                        [
                          View({ as: "time", attributes: { n: "home-logs-entry-time" } }, [entry.displayTime]),
                          tn.Badge(
                            {
                              class: "home-logs-entry-level",
                              variant: LOG_LEVEL_VARIANTS[entry.level] || "default",
                              attributes: { n: "home-logs-entry-level" },
                            },
                            [entry.level.toUpperCase()],
                          ),
                          View({ as: "span", class: "home-logs-entry-component", attributes: { n: "home-logs-entry-component" } }, [entry.component]),
                        ],
                      ),
                      View({ as: "p", class: "home-logs-entry-message", attributes: { n: "home-logs-entry-message" } }, [entry.message]),
                      entry.detailsText
                        ? View(
                          {
                            as: "details",
                            class: "home-logs-entry-details",
                            attributes: { n: "home-logs-entry-details" },
                          },
                          [
                            View(
                              {
                                as: "summary",
                                class: "home-logs-entry-details-toggle",
                                attributes: { n: "home-logs-entry-details-toggle" },
                              },
                              ["关键数据"],
                            ),
                            View(
                              {
                                as: "pre",
                                class: "home-logs-entry-details-content",
                                attributes: { n: "home-logs-entry-details-content" },
                              },
                              [entry.detailsText],
                            ),
                          ],
                        )
                        : null,
                    ].filter(Boolean),
                  );
                },
              }),
            ],
          ),
          tn.Card(
            {
              as: "nav",
              class: "home-logs-pagination",
              attributes: { "aria-label": "日志分页", n: "home-logs-pagination" },
            },
            [
              tn.Button(
                {
                  store: vm$.ui.previousPageButton,
                  attributes: { n: "home-logs-previous-page", type: "button" },
                },
                ["上一页"],
              ),
              View({ as: "span", attributes: { n: "home-logs-pagination-label" } }, [vm$.ui.pageLabel]),
              tn.Button(
                {
                  store: vm$.ui.nextPageButton,
                  attributes: { n: "home-logs-next-page", type: "button" },
                },
                ["下一页"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
