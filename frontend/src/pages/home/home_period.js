import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { tn } from "@/tnui.js";

import { HomePeriodPageModel } from "./home_period.model.js";

function PeriodItemView(item) {
  const { View } = TimelessPrimitive;
  const classes = ["period-item", `is-${item.kind}`];
  if (item.status === "completed") classes.push("is-completed");
  if (item.status === "cancelled") classes.push("is-cancelled");
  const badge_variant = item.kind === "memo"
    ? "primary"
    : item.status === "completed"
      ? "success"
      : item.status === "cancelled"
        ? "danger"
        : "warning";
  const meta = [item.timeLabel, item.statusLabel].filter(Boolean).join(" · ");
  return tn.Card(
    {
      as: "article",
      class: classes.join(" "),
      attributes: {
        n: `home-period-${item.kind}-item`,
        title: item.title,
      },
    },
    [
      View(
        {
          class: "period-item-meta",
          attributes: { n: "home-period-item-meta" },
        },
        [
          tn.Badge(
            {
              variant: badge_variant,
              attributes: { n: "home-period-item-kind" },
            },
            [item.kindLabel],
          ),
          meta
            ? View(
              {
                as: "span",
                class: "period-item-detail",
                attributes: { n: "home-period-item-detail" },
              },
              [meta],
            )
            : null,
        ].filter(Boolean),
      ),
      View(
        {
          as: "h4",
          class: "period-item-title",
          attributes: { n: "home-period-item-title" },
        },
        [item.title],
      ),
    ],
  );
}

function PeriodListView(vm$) {
  const { For, View } = TimelessPrimitive;
  return View(
    {
      class: "period-day-list",
      attributes: {
        "aria-label": vm$.ui.periodLabel,
        n: "home-period-day-list",
      },
    },
    [
      For({
        each: vm$.ui.days,
        render(day) {
          const classes = ["period-day"];
          if (day.isToday) classes.push("is-today");
          return View(
            {
              as: "section",
              class: classes.join(" "),
              attributes: {
                "aria-label": day.label,
                n: "home-period-day",
              },
            },
            [
              View(
                {
                  class: "period-day-heading",
                  attributes: { n: "home-period-day-heading" },
                },
                [
                  View(
                    {
                      as: "time",
                      class: "period-day-date",
                      attributes: {
                        datetime: day.dateKey,
                        n: "home-period-day-date",
                      },
                    },
                    [
                      View(
                        {
                          as: "span",
                          class: "period-day-weekday",
                          attributes: { n: "home-period-day-weekday" },
                        },
                        [day.weekday],
                      ),
                      View(
                        {
                          class: "period-day-number",
                          attributes: { n: "home-period-day-number" },
                        },
                        [day.dateNumber],
                      ),
                    ],
                  ),
                  View(
                    {
                      as: "span",
                      class: "period-day-count",
                      attributes: { n: "home-period-day-count" },
                    },
                    [day.itemCount ? `${day.itemCount} 项` : "无内容"],
                  ),
                ],
              ),
              day.itemCount
                ? View(
                  {
                    class: "period-day-projects",
                    attributes: { n: "home-period-day-projects" },
                  },
                  [
                    For({
                      each: day.projectGroups,
                      render(group) {
                        return View(
                          {
                            as: "section",
                            class: "period-project-group",
                            attributes: { n: "home-period-project-group" },
                          },
                          [
                            View(
                              {
                                class: "period-project-heading",
                                attributes: { n: "home-period-project-heading" },
                              },
                              [
                                View({
                                  as: "span",
                                  class: "period-project-dot",
                                  style: { "--project-color": group.color },
                                  attributes: {
                                    "aria-hidden": "true",
                                    n: "home-period-project-color",
                                  },
                                }),
                                View(
                                  {
                                    as: "h3",
                                    attributes: { n: "home-period-project-name" },
                                  },
                                  [group.label],
                                ),
                                View(
                                  {
                                    as: "strong",
                                    attributes: { n: "home-period-project-count" },
                                  },
                                  [String(group.items.length)],
                                ),
                              ],
                            ),
                            View(
                              {
                                class: "period-project-items",
                                attributes: { n: "home-period-project-items" },
                              },
                              [
                                For({
                                  each: group.items,
                                  render(item) {
                                    return PeriodItemView(item);
                                  },
                                }),
                              ],
                            ),
                          ],
                        );
                      },
                    }),
                  ],
                )
                : View(
                  {
                    class: "period-day-empty",
                    attributes: { n: "home-period-day-empty" },
                  },
                  ["这一天没有 Memo 或待办"],
                ),
            ],
          );
        },
      }),
    ],
  );
}

function PeriodToolbar(vm$) {
  const { View } = TimelessPrimitive;
  function icon_button(label, icon, action, meaning) {
    return Timeless.Button(
      {
        class: "period-icon-button",
        onClick: action,
        attributes: {
          "aria-label": label,
          n: meaning,
          title: label,
          type: "button",
        },
      },
      [Timeless.Icon({ name: icon, size: 16 })],
    );
  }

  return View(
    {
      class: "period-toolbar",
      attributes: { "aria-label": "视图控制", n: "home-period-toolbar" },
    },
    [
      View(
        {
          class: "period-navigation",
          attributes: { n: "home-period-navigation" },
        },
        [
          icon_button("上一周期", "chevron-left", vm$.methods.previous, "home-period-previous"),
          Timeless.Button(
            {
              class: "period-today-button",
              onClick: vm$.methods.today,
              attributes: { n: "home-period-today", type: "button" },
            },
            ["今天"],
          ),
          icon_button("下一周期", "chevron-right", vm$.methods.next, "home-period-next"),
        ],
      ),
    ],
  );
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomePeriodPageView(props) {
  const { Show, View } = TimelessPrimitive;
  const vm$ = HomePeriodPageModel(props);
  return View(
    {
      class: "page home-period-page w-full h-full",
      dataset: {
        pathname: props.view?.pathname || "",
        section: vm$.state.period,
      },
      attributes: { n: "home-period-page" },
      onMounted() {
        vm$.methods.ready();
      },
      onUnmounted() {
        vm$.methods.destroy();
      },
    },
    [
      View(
        {
          as: "header",
          class: "period-header",
          attributes: { n: "home-period-header" },
        },
        [
          View(
            {
              class: "period-heading-copy",
              attributes: { n: "home-period-heading-copy" },
            },
            [
              View(
                {
                  as: "span",
                  class: "period-eyebrow",
                  attributes: { n: "home-period-eyebrow" },
                },
                [vm$.ui.periodLabel],
              ),
              View(
                {
                  as: "h1",
                  attributes: { n: "home-period-title" },
                },
                [vm$.ui.title],
              ),
              View(
                {
                  as: "p",
                  attributes: { n: "home-period-summary" },
                },
                [
                  "当前周期 · ",
                  View(
                    { as: "strong", attributes: { n: "home-period-memo-count" } },
                    [vm$.ui.memoCount],
                  ),
                  " 条 Memo · ",
                  View(
                    { as: "strong", attributes: { n: "home-period-task-count" } },
                    [vm$.ui.taskCount],
                  ),
                  " 个待办",
                ],
              ),
            ],
          ),
          PeriodToolbar(vm$),
        ],
      ),
      View(
        {
          as: "main",
          class: "period-main tn-scrollbar-hidden",
          attributes: { n: "home-period-main" },
        },
        [
          Show({
            when: vm$.ui.loading,
            ok() {
              return View(
                {
                  class: "period-status",
                  attributes: { n: "home-period-loading", role: "status" },
                },
                ["正在整理当前周期的 Memo 与待办…"],
              );
            },
          }),
          Show({
            when: vm$.ui.errorVisible,
            ok() {
              return View(
                {
                  class: "period-status is-error",
                  attributes: { n: "home-period-error", role: "alert" },
                },
                [
                  View({ as: "span" }, [vm$.ui.error]),
                  Timeless.Button(
                    {
                      class: "period-retry-button",
                      onClick: vm$.methods.reload,
                      attributes: { n: "home-period-retry", type: "button" },
                    },
                    ["重新加载"],
                  ),
                ],
              );
            },
          }),
          Show({
            when: vm$.ui.contentVisible,
            ok() {
              return PeriodListView(vm$);
            },
          }),
        ],
      ),
    ],
  );
}
