import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { tn } from "@/tnui.js";
import { ProjectSelect } from "@/components/project-select.js";

import {
  iconActionButton,
  PrivateOverlayView,
  reactiveWhen,
} from "./home_view_shared.js";

const MEMO_EDITOR_TOOLS = Object.freeze([
  ["bold", "bold", "粗体"],
  ["italic", "italic", "斜体"],
  ["code", "braces", "代码"],
  ["list", "list", "列表"],
  ["checklist", "list-checks", "任务"],
  ["tag", "tag", "标签"],
  ["link", "link", "链接"],
  ["image", "image", "图片"],
  ["attach", "paperclip", "附件"],
  ["date", "calendar", "时间"],
]);

export function MemoHeaderActions(vm$) {
  const action = function (name, label) {
    return Timeless.Button(
      {
        class: "tn-button memo-icon-text-button",
        attributes: { "data-action": name, type: "button" },
      },
      [label],
    );
  };
  return [
    View(
      {
        as: "span",
        hidden: vm$.ui.topbarDefaultActionsHidden,
        attributes: { "data-topbar-default-actions": "true" },
      },
      [
        action("openTimeline", "时间线"),
        action("openSlimMemos", "精简版"),
        action("openSlimGTD", "代办"),
        action("sortMemos", "排序"),
      ],
    ),
    View(
      {
        as: "span",
        hidden: vm$.ui.topbarProjectActionsHidden,
        attributes: { "data-topbar-project-actions": "true" },
      },
      [],
    ),
  ];
}

export function MemoComposer(vm$) {
  return View(
    {
      as: "section",
      class: vm$.ui.composerClass,
      attributes: {
        "aria-label": "Create memo",
        "data-composer": "true",
        n: "home-memo-composer",
      },
    },
    [
      View(
        {
          class: "memo-composer-head",
          attributes: { n: "home-memo-composer-header" },
        },
        [
          View(
            {
              class: "memo-tool-group memo-tool-group-head",
              attributes: {
                "aria-label": "编辑命令",
                n: "home-memo-composer-editor-tools",
              },
            },
            MEMO_EDITOR_TOOLS.map(([command, icon, label]) =>
              tn.Button(
                {
                  class: "memo-tool-button",
                  store: vm$.ui.composerToolButtons.stores[command],
                  attributes: {
                    "aria-label": label,
                    "data-command": command,
                    "data-editor-command": command,
                    title: label,
                    type: "button",
                  },
                },
                [
                  Timeless.Icon({
                    name: icon,
                    size: 16,
                    attributes: {
                      "aria-hidden": "true",
                      n: `home-memo-composer-${command}-icon`,
                    },
                  }),
                ],
              ),
            ),
          ),
          View(
            {
              class:
                "memo-composer-select-control memo-composer-project-control",
              attributes: { n: "home-memo-composer-project-control" },
            },
            [
              ProjectSelect({
                class: "memo-composer-project-select",
                store: vm$.ui.composerProjectSelect,
                attributes: {
                  "aria-label": "Project",
                  "data-project-select": "true",
                },
              }),
            ],
          ),
          View(
            {
              class: "memo-composer-select-control",
              attributes: { n: "home-memo-composer-visibility-control" },
            },
            [
              tn.Select({
                class: "memo-composer-select",
                store: vm$.ui.composerVisibilitySelect.store,
                attributes: {
                  "aria-label": "可见性",
                  "data-visibility-select": "true",
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-editor-switch memo-composer-switch",
          attributes: { n: "home-memo-editor-switch" },
        },
        [
          // The editor library requires a real DOM host. All surrounding UI
          // remains Timeless-rendered.
          View(
            {
              class: "memo-editor-host",
              attributes: {
                "data-composer-host": "true",
                "data-editor-switch-host": "true",
              },
            },
            [],
          ),
          View(
            {
              as: "section",
              class: "memo-editor-preview memo-composer-preview",
              hidden: true,
              attributes: { "data-composer-preview": "true" },
            },
            [],
          ),
        ],
      ),
      View(
        {
          class: "memo-composer-toolbar",
          attributes: { n: "home-memo-composer-toolbar" },
        },
        [
          View(
            { as: "span", attributes: { "data-composer-vim-status": "true" } },
            [],
          ),
          View(
            { as: "span", attributes: { "data-composer-status": "true" } },
            [vm$.ui.composerStatus],
          ),
          View(
            {
              as: "span",
              hidden: vm$.ui.composerDraftStatusHidden,
              attributes: { "data-composer-draft-status": "true" },
            },
            ["已存草稿"],
          ),
          tn.Button(
            {
              store: vm$.ui.composerPreviewButton,
              attributes: {
                "data-action": "toggleComposerPreview",
                type: "button",
              },
            },
            ["预览"],
          ),
          tn.Button(
            {
              store: vm$.ui.composerPublishButton,
              attributes: { "data-action": "createMemo", type: "button" },
            },
            ["发布"],
          ),
        ],
      ),
      Input({
        class: "memo-hidden-input",
        type: "file",
        attributes: {
          "data-attach-input": "true",
          multiple: "multiple",
          type: "file",
        },
      }),
    ],
  );
}

export function MemoFeedTools(vm$) {
  return View(
    {
      as: "section",
      class: "memo-feed-tools",
      hidden: vm$.ui.feedToolsHidden,
      attributes: {
        "aria-label": "Memo search",
        n: "home-memo-feed-tools",
      },
    },
    [
      tn.Input({
        rootClass: "memo-search",
        store: vm$.ui.feedSearchInput,
        type: "search",
        placeholder: vm$.ui.searchPlaceholder,
        attributes: { "data-search-input": "true", type: "search" },
      }),
      View(
        {
          as: "select",
          attributes: {
            "aria-label": "Project filter",
            "data-project-filter-select": "true",
            n: "home-memo-project-filter",
          },
        },
        [],
      ),
      tn.Button(
        {
          store: vm$.ui.feedResetButton,
          attributes: { "data-action": "clearFilters", type: "button" },
        },
        ["重置"],
      ),
    ],
  );
}

function smallCalendarDayAriaLabel(day) {
  return [
    day.key,
    day.isToday ? "今天" : "",
    day.info.title,
    day.countLabel,
  ]
    .filter(Boolean)
    .join("，");
}

function smallCalendarDayClass(day) {
  return [
    "tn-button tn-button--ghost tn-button--xs tn-small-calendar__day",
    !day.inMonth && "is-outside",
    day.isToday && "is-today",
    day.isSelected && "is-selected",
    day.count && "has-items",
    day.info.holidayStatus && `is-${day.info.holidayStatus}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function SmallCalendarView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;
  const model = props.model;
  const presentation = model.presentation;

  const icon_button = function (options) {
    return Button(
      {
        class: `tn-button tn-button--ghost tn-button--icon ${options.class}`,
        onClick(event) {
          options.onClick(event);
        },
        attributes: {
          "aria-label": options.label,
          n: options.meaning,
          title: options.label,
          type: "button",
        },
      },
      [
        View(
          {
            as: "span",
            class: "tn-button__content",
            attributes: { n: `${options.meaning}-content` },
          },
          [
            Timeless.Icon({
              attributes: { n: `${options.meaning}-icon` },
              name: options.icon,
              size: options.size,
            }),
          ],
        ),
      ],
    );
  };

  return View(
    {
      as: "section",
      class: "tn-small-calendar tn-grid tn-min-w-0",
      attributes: {
        "aria-label": props.ariaLabel || "小日历",
        n: "small-calendar",
      },
    },
    [
      View(
        {
          as: "header",
          class:
            "tn-small-calendar__header tn-flex tn-items-start tn-justify-between tn-gap-3",
          attributes: { n: "small-calendar-header" },
        },
        [
          View(
            {
              class: "tn-small-calendar__heading tn-grid tn-gap-0-5 tn-min-w-0",
              attributes: { n: "small-calendar-heading" },
            },
            [
              View(
                {
                  as: "span",
                  class: "tn-small-calendar__year tn-text-xs tn-text-tertiary",
                  attributes: { n: "small-calendar-year" },
                },
                [presentation.yearLabel],
              ),
              View(
                {
                  as: "strong",
                  class: "tn-small-calendar__month tn-text-primary",
                  attributes: { n: "small-calendar-month" },
                },
                [presentation.monthLabel],
              ),
            ],
          ),
          View(
            {
              class:
                "tn-small-calendar__navigation tn-flex tn-items-center",
              attributes: { n: "small-calendar-navigation" },
            },
            [
              Button(
                {
                  class:
                    "tn-button tn-button--ghost tn-button--xs tn-small-calendar__today",
                  onClick(event) {
                    model.goToday(event);
                  },
                  attributes: {
                    n: "small-calendar-today",
                    type: "button",
                  },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "tn-button__content",
                      attributes: { n: "small-calendar-today-content" },
                    },
                    ["今天"],
                  ),
                ],
              ),
              icon_button({
                class: "tn-button--sm tn-small-calendar__nav",
                icon: "chevron-left",
                label: "上个月",
                meaning: "small-calendar-previous-month",
                onClick(event) {
                  model.previousMonth(event);
                },
                size: 15,
              }),
              icon_button({
                class: "tn-button--sm tn-small-calendar__nav",
                icon: "chevron-right",
                label: "下个月",
                meaning: "small-calendar-next-month",
                onClick(event) {
                  model.nextMonth(event);
                },
                size: 15,
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class:
            "tn-small-calendar__weekdays tn-grid tn-text-center tn-text-2xs tn-text-tertiary",
          attributes: {
            "aria-hidden": "true",
            n: "small-calendar-weekdays",
          },
        },
        presentation.weekdays.map(function (weekday) {
          return View(
            {
              as: "span",
              class: "tn-small-calendar__weekday",
              attributes: { n: "small-calendar-weekday" },
            },
            [weekday],
          );
        }),
      ),
      View(
        {
          class: "tn-small-calendar__grid tn-grid",
          attributes: { n: "small-calendar-day-grid", role: "grid" },
        },
        presentation.days.map(function (day) {
          const aria_label = smallCalendarDayAriaLabel(day);
          return Button(
            {
              class: smallCalendarDayClass(day),
              onClick(event) {
                model.selectDate(day.key, event);
              },
              attributes: {
                "aria-current": day.isToday ? "date" : null,
                "aria-label": aria_label,
                "aria-selected": day.isSelected ? "true" : "false",
                "data-date": day.key,
                n: "small-calendar-day",
                role: "gridcell",
                title: aria_label,
                type: "button",
              },
            },
            [
              View(
                {
                  as: "span",
                  class: "tn-button__content",
                  attributes: { n: "small-calendar-day-content" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "tn-small-calendar__solar",
                      attributes: { n: "small-calendar-solar-date" },
                    },
                    [String(day.date)],
                  ),
                  View(
                    {
                      as: "span",
                      class: "tn-small-calendar__lunar",
                      hidden: Boolean(day.info.festivalLabel),
                      attributes: { n: "small-calendar-lunar-date" },
                    },
                    [day.info.lunarLabel],
                  ),
                  View(
                    {
                      as: "span",
                      class: "tn-small-calendar__festival",
                      hidden: !day.info.festivalLabel,
                      attributes: { n: "small-calendar-festival" },
                    },
                    [day.info.festivalLabel],
                  ),
                  View(
                    {
                      as: "span",
                      class: "tn-small-calendar__holiday",
                      hidden: !day.info.holidayBadge,
                      attributes: {
                        "aria-hidden": "true",
                        n: "small-calendar-holiday-status",
                      },
                    },
                    [day.info.holidayBadge],
                  ),
                  View(
                    {
                      as: "span",
                      class: "tn-small-calendar__count",
                      hidden: !day.count,
                      attributes: {
                        "aria-hidden": "true",
                        n: "small-calendar-memo-count",
                      },
                    },
                    [day.countLabel],
                  ),
                ],
              ),
            ],
          );
        }),
      ),
    ],
  );
}

export function MemoInspector(vm$) {
  return View(
    {
      as: "aside",
      class: "memo-inspector tn-scrollbar-hidden",
      hidden: vm$.ui.memoInspectorHidden,
      attributes: { "aria-label": "Memo details", n: "home-memo-inspector" },
    },
    [
      View(
        {
          as: "section",
          class: "memo-inspector-section memo-inspector-section--calendar",
          attributes: { n: "home-memo-calendar-section" },
        },
        [
          View({
            class: "memo-calendar",
            attributes: {
              "data-calendar": "true",
              n: "home-memo-calendar",
            },
          }),
        ],
      ),
      View(
        {
          as: "section",
          class: "memo-inspector-section",
          attributes: { n: "home-memo-pinned-section" },
        },
        [
          View(
            {
              class: "memo-inspector-title",
              attributes: { n: "home-memo-pinned-title" },
            },
            ["置顶"],
          ),
          View(
            {
              class: "memo-pinned-list",
              attributes: {
                "data-pinned-list": "true",
                n: "home-memo-pinned-list",
              },
            },
            [],
          ),
        ],
      ),
    ],
  );
}

export function MemoOverlays(vm$) {
  return Timeless.Fragment({}, [
    SearchPaletteView({ runtime: Timeless, ui: vm$.ui }),
    View(
      {
        as: "section",
        class: vm$.ui.clipboardCardClass,
        hidden: vm$.ui.clipboardCardHidden,
        attributes: { "data-clipboard-card": "true" },
      },
      [],
    ),
    View(
      {
        class: vm$.ui.toastClass,
        attributes: { "data-toast": "true", role: "status" },
      },
      [vm$.ui.toastText],
    ),
  ]);
}

export function SearchPaletteView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Input, View } = runtime;
  const ui = props.ui || {};
  return tn.Dialog(
    {
      class: "memo-command-panel",
      showClose: false,
      store: props.store || ui.memoSearchDialog,
      zIndex: 10000,
      attributes: {
        "aria-label": "搜索 memo、评论和代办",
        "data-memo-search-palette": "true",
        n: "memo-search-palette",
      },
    },
    [
      View(
        {
          as: "label",
          class: "memo-command-search",
          attributes: { n: "memo-search-field" },
        },
        [
          Timeless.Icon({
            name: "search",
            attributes: { n: "memo-search-field-icon" },
          }),
          Input({
            type: "search",
            placeholder: "搜索 memo / 评论 / 代办",
            value: ui.memoSearchQuery,
            attributes: {
              autocomplete: "off",
              "data-memo-search-input": "true",
              n: "memo-search-query-input",
              type: "search",
            },
          }),
        ],
      ),
      View(
        {
          class: "memo-command-results",
          attributes: {
            "data-memo-search-results": "true",
            n: "memo-search-results",
            role: "listbox",
          },
        },
        [],
      ),
    ],
  );
}

function highlightedPartsView(runtime, parts, meaning) {
  let items = [];
  if (Array.isArray(parts)) items = parts;
  return runtime.Fragment({}, [
    runtime.For({
      each: items,
      render(part) {
        return Show({
          when: reactiveWhen(part && part.matched),
          ok() {
            return runtime.View(
              {
                as: "mark",
                class: "memo-command-match",
                attributes: { n: meaning + "-match" },
              },
              [String(part.text || "")],
            );
          },
          else() {
            return String(part?.text || "");
          },
        });
      },
    }),
  ]);
}

export function MemoSearchResultsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.results?.length) {
    return View(
      { class: "memo-command-empty", attributes: { n: "memo-search-empty" } },
      ["没有匹配的 memo、评论或代办"],
    );
  }
  return runtime.Fragment({}, [
    For({
      each: props.results,
      render(result, index$) {
        const index = index$?.value ?? 0;
        const active = index === props.activeIndex;
        const class_name_ = computed(
          reactiveWhen(active),
          function (is_active) {
            if (is_active) return "memo-command-result is-active";
            return "memo-command-result";
          },
        );
        const selected_ = computed(
          reactiveWhen(active),
          function (is_active) {
            if (is_active) return "true";
            return "false";
          },
        );
        return Button(
          {
            class: class_name_,
            attributes: {
              "aria-selected": selected_,
              "data-memo-search-result": result.key,
              n: "memo-search-result",
              role: "option",
              type: "button",
            },
          },
          [
            View(
              {
                as: "span",
                class: "memo-command-result-title",
                attributes: { n: "memo-search-result-title" },
              },
              [
                View(
                  {
                    as: "span",
                    class: "memo-command-result-kind",
                    attributes: { n: "memo-search-result-kind" },
                  },
                  [result.kindLabel],
                ),
                highlightedPartsView(
                  runtime,
                  result.titleParts,
                  "memo-search-result-title",
                ),
              ],
            ),
            View(
              {
                as: "span",
                class: "memo-command-result-summary",
                attributes: { n: "memo-search-result-summary" },
              },
              [
                highlightedPartsView(
                  runtime,
                  result.summaryParts,
                  "memo-search-result-summary",
                ),
              ],
            ),
            View(
              {
                as: "span",
                class: "memo-command-result-meta",
                attributes: { n: "memo-search-result-meta" },
              },
              [result.meta],
            ),
          ],
        );
      },
    }),
  ]);
}

export function EditorPreviewView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { RichText, View } = runtime;
  if (!props.html) {
    return View(
      {
        class: "memo-editor-preview-empty",
        attributes: { n: props.meaning + "-empty" },
      },
      [props.emptyLabel || "暂无预览内容"],
    );
  }
  return View(
    { class: "memo-content", attributes: { n: props.meaning + "-content" } },
    [
      RichText({
        attributes: { n: props.meaning + "-rich-text" },
        content: props.html,
      }),
    ],
  );
}

export function TagListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.tags?.length) {
    return View(
      { class: "memo-empty-mini", attributes: { n: "memo-tag-list-empty" } },
      ["暂无标签"],
    );
  }
  return runtime.Fragment({}, [
    For({
      each: props.tags,
      render(item) {
        const class_name_ = computed(
          reactiveWhen(item.active),
          function (active) {
            if (active) return "memo-tag-filter is-active";
            return "memo-tag-filter";
          },
        );
        return Button(
          {
            class: class_name_,
            attributes: {
              "data-tag": item.tag,
              n: "memo-tag-filter",
              type: "button",
            },
          },
          [
            View({ as: "span", attributes: { n: "memo-tag-filter-label" } }, [
              "#" + item.tag,
            ]),
            View({ as: "span", attributes: { n: "memo-tag-filter-count" } }, [
              item.count,
            ]),
          ],
        );
      },
    }),
  ]);
}

export function HistoryDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  let body = null;
  if (props.loading) {
    body = View(
      { class: "history-loading", attributes: { n: "history-loading" } },
      ["加载中..."],
    );
  } else if (props.error) {
    body = View(
      { class: "history-error", attributes: { n: "history-error" } },
      [props.error],
    );
  } else if (!props.versions?.length) {
    body = View(
      { class: "history-empty", attributes: { n: "history-empty" } },
      ["暂无历史版本"],
    );
  } else {
    body = For({
      each: props.versions,
      render(version) {
        let toggle_title = "展开差异";
        let toggle_icon = "search";
        if (version.expanded) {
          toggle_title = "收起差异";
          toggle_icon = "chevron-up";
        }
        return View(
          {
            class: "history-version-row",
            attributes: {
              "data-history-version": version.version,
              n: "history-version-row",
            },
          },
          [
            View(
              {
                class: "history-version-info",
                attributes: { n: "history-version-info" },
              },
              [
                View(
                  {
                    as: "span",
                    class: "history-version-number",
                    attributes: { n: "history-version-number" },
                  },
                  ["v" + version.version],
                ),
                View(
                  {
                    as: "span",
                    class: "history-version-time",
                    attributes: { n: "history-version-time" },
                  },
                  [version.time],
                ),
                Show({
                  when: reactiveWhen(version.changed),
                  ok() {
                    return View(
                      {
                        as: "span",
                        class: "history-version-fields",
                        attributes: { n: "history-version-fields" },
                      },
                      [version.changed],
                    );
                  },
                }),
              ],
            ),
            View(
              {
                class: "history-version-actions",
                attributes: { n: "history-version-actions" },
              },
              [
                Button(
                  {
                    class:
                      "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                    attributes: {
                      "data-action": "toggleHistoryDiff",
                      "data-version": version.version,
                      n: "history-toggle-diff",
                      title: toggle_title,
                      type: "button",
                    },
                  },
                  [
                    Timeless.Icon({
                      name: toggle_icon,
                      attributes: { n: "history-toggle-diff-icon" },
                    }),
                  ],
                ),
                Button(
                  {
                    class:
                      "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                    disabled: version.restoring,
                    attributes: {
                      "data-action": "restoreHistoryVersion",
                      "data-version": version.version,
                      n: "history-restore-version",
                      title: "回退",
                      type: "button",
                    },
                  },
                  [
                    Show({
                      when: reactiveWhen(version.restoring),
                      ok() {
                        return "回退中...";
                      },
                      else() {
                        return Timeless.Icon({
                          name: "rotate-ccw",
                          attributes: { n: "history-restore-version-icon" },
                        });
                      },
                    }),
                  ],
                ),
              ],
            ),
            Show({
              when: reactiveWhen(version.expanded),
              ok() {
                return Show({
                  when: reactiveWhen(version.diffLoading),
                  ok() {
                    return View(
                      {
                        class: "history-diff-loading",
                        attributes: { n: "history-diff-loading" },
                      },
                      ["加载中..."],
                    );
                  },
                  else() {
                    return View(
                      {
                        class: "history-inline-diff",
                        attributes: { n: "history-inline-diff" },
                      },
                      [
                        For({
                          each: version.diff || [],
                          render(segment) {
                            return View(
                              {
                                class: "history-diff-segment is-" + segment.type,
                                attributes: { n: "history-diff-" + segment.type },
                              },
                              [segment.text],
                            );
                          },
                        }),
                      ],
                    );
                  },
                });
              },
            }),
          ],
        );
      },
    });
  }
  return tn.Dialog(
    {
      class: "history-dialog-card",
      showClose: true,
      store: props.store,
      zIndex: 10000,
      attributes: {
        "data-history-dialog": "true",
        n: "history-dialog",
      },
    },
    [
      tn.DialogHeader(
        {
          class: "history-dialog-head",
          store: props.store,
          attributes: { n: "history-dialog-header" },
        },
        [
          tn.DialogTitle(
            {
              store: props.store,
              attributes: { n: "history-dialog-title" },
            },
            [props.title],
          ),
          View(
            {
              as: "span",
              class: "history-record-id",
              attributes: { n: "history-record-id" },
            },
            [props.recordId],
          ),
        ],
      ),
      tn.DialogBody(
        {
          class: "history-dialog-body",
          attributes: { n: "history-dialog-body" },
        },
        [
          View(
            {
              class: "history-version-list",
              attributes: { n: "history-version-list" },
            },
            [body],
          ),
        ],
      ),
    ],
  );
}

function MemoStatsView(props) {
  const { Button, For, View } = props.runtime;
  if (!props.stats?.length && !props.tags?.length) return null;
  return props.runtime.Fragment({}, [
    Show({
      when: reactiveWhen(props.stats?.length),
      ok() {
        return View(
          {
            class: "memo-card-stats",
            attributes: { n: props.meaning + "-stats" },
          },
          [
            For({
              each: props.stats,
              render(label) {
                return View(
                  {
                    as: "span",
                    class: "memo-card-stat",
                    attributes: { n: props.meaning + "-stat" },
                  },
                  [label],
                );
              },
            }),
          ],
        );
      },
    }),
    Show({
      when: reactiveWhen(props.tags?.length),
      ok() {
        return View(
          {
            class: "memo-card-tags",
            attributes: { n: props.meaning + "-tags" },
          },
          [
            For({
              each: props.tags,
              render(tag) {
                return Show({
                  when: reactiveWhen(
                    props.interactiveTags,
                  ),
                  ok() {
                    return Button(
                      {
                        attributes: {
                          "data-tag": tag,
                          n: props.meaning + "-tag",
                          type: "button",
                        },
                      },
                      ["#" + tag],
                    );
                  },
                  else() {
                    return View(
                      { as: "span", attributes: { n: props.meaning + "-tag" } },
                      ["#" + tag],
                    );
                  },
                });
              },
            }),
          ],
        );
      },
    }),
  ]);
}

function ProjectBadgeView(props) {
  if (!props.project) return null;
  return props.runtime.View(
    {
      as: "span",
      class: "memo-project-badge",
      style: { "--project-color": props.project.color },
      attributes: { n: props.meaning + "-project" },
    },
    [props.project.name],
  );
}

function MemoTocView(props) {
  const { Button, For, View } = props.runtime;
  if (!props.headings?.length) return null;
  return View(
    {
      as: "nav",
      class: "memo-card-toc",
      attributes: { "aria-label": "Memo 目录", n: props.meaning + "-toc" },
    },
    [
      View(
        {
          class: "memo-card-toc-title",
          attributes: { n: props.meaning + "-toc-title" },
        },
        ["目录"],
      ),
      View(
        {
          as: "ol",
          class: "memo-card-toc-list",
          attributes: { n: props.meaning + "-toc-list" },
        },
        [
          For({
            each: props.headings,
            render(heading) {
              return View(
                {
                  as: "li",
                  class: "memo-card-toc-item is-level-" + heading.level,
                  style: { "--memo-toc-depth": heading.depth },
                  attributes: { n: props.meaning + "-toc-item" },
                },
                [
                  Button(
                    {
                      attributes: {
                        "data-memo-toc-line": heading.lineNumber,
                        n: props.meaning + "-toc-button",
                        title: heading.text,
                        type: "button",
                      },
                    },
                    [
                      View(
                        {
                          as: "span",
                          attributes: { n: props.meaning + "-toc-label" },
                        },
                        [heading.text],
                      ),
                    ],
                  ),
                ],
              );
            },
          }),
        ],
      ),
    ],
  );
}

function MemoReactionsView(props) {
  const { Button, For, View } = props.runtime;
  const active = new Set(props.reactions || []);
  return View(
    {
      class: "memo-reactions",
      attributes: {
        "data-memo-id": props.memoId,
        n: props.meaning + "-reactions",
      },
    },
    [
      Show({
        when: reactiveWhen(active.size),
        ok() {
          return View(
            {
              class: "memo-reactions-badges",
              attributes: { n: props.meaning + "-reaction-badges" },
            },
            [
              For({
                each: Array.from(active),
                render(emoji) {
                  return Button(
                    {
                      class: "memo-reaction-badge is-active",
                      attributes: {
                        "data-action": "toggleMemoReaction",
                        "data-emoji": emoji,
                        "data-memo-id": props.memoId,
                        n: props.meaning + "-reaction-badge",
                        type: "button",
                      },
                    },
                    [emoji],
                  );
                },
              }),
            ],
          );
        },
      }),
      View(
        {
          class: "memo-reactions-add-wrap",
          attributes: { n: props.meaning + "-reaction-control" },
        },
        [
          tn.DropdownMenu(
            {
              class: "memo-reaction-menu",
              store: props.menu,
              onUnmounted: props.destroyMenuOnUnmounted
                ? function () {
                  props.menu?.unmount?.();
                }
                : undefined,
              attributes: {
                "aria-label": "选择 Memo 反应",
                "data-memo-id": props.memoId,
                n: props.meaning + "-reaction-menu",
              },
            },
            [
              iconActionButton(props.runtime, {
                class:
                  "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-reaction-add-btn",
                icon: "user",
                label: "添加反应",
                meaning: props.meaning + "-reaction-add",
                memoId: props.memoId,
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

function InlineEditorView(props) {
  const { View } = props.runtime;
  let prefix = "edit";
  let editor_class = "memo-inline-editor";
  let host_class = "memo-editor-host is-inline";
  let host_attribute = "data-edit-host";
  let preview_class = "memo-editor-preview memo-edit-preview";
  let preview_attribute = "data-edit-preview";
  let actions_class = "memo-inline-actions";
  let vim_attribute = "data-edit-vim-status";
  let preview_action = "toggleEditPreview";
  let cancel_action = "cancelEdit";
  let save_action = "saveEdit";
  if (props.comment) {
    prefix = "comment-edit";
    editor_class = "memo-comment-edit";
    host_class += " memo-comment-edit-host";
    host_attribute = "data-comment-edit-host";
    preview_class = "memo-editor-preview memo-comment-edit-preview";
    preview_attribute = "data-comment-edit-preview";
    actions_class += " memo-comment-edit-actions";
    vim_attribute = "data-comment-edit-vim-status";
    preview_action = "toggleCommentEditPreview";
    cancel_action = "cancelCommentEdit";
    save_action = "saveCommentEdit";
  }
  return View(
    {
      class: editor_class,
      attributes: { n: "memo-" + prefix + "-editor" },
    },
    [
      View(
        {
          class: "memo-editor-switch",
          attributes: { n: "memo-" + prefix + "-switch" },
        },
        [
          View(
            {
              class: host_class,
              attributes: {
                [host_attribute]: "true",
                "data-editor-switch-host": "true",
                n: "memo-" + prefix + "-host",
              },
            },
            [],
          ),
          View(
            {
              as: "section",
              class: preview_class,
              attributes: {
                [preview_attribute]: "true",
                n: "memo-" + prefix + "-preview",
              },
              hidden: true,
            },
            [],
          ),
        ],
      ),
      View(
        {
          class: actions_class,
          attributes: { n: "memo-" + prefix + "-actions" },
        },
        [
          View(
            {
              class: "memo-inline-status-line",
              attributes: {
                [vim_attribute]: "true",
                n: "memo-" + prefix + "-vim-status",
              },
            },
            [],
          ),
          Show({
            when: reactiveWhen(!props.comment),
            ok() {
              return View(
                {
                  class: "memo-select-wrap is-compact",
                  attributes: { n: "memo-edit-project-control" },
                },
                [
                  tn.Select({
                    store: props.projectSelect,
                    onUnmounted() {
                      props.projectSelect?.destroy?.();
                    },
                    attributes: {
                      "aria-label": "编辑 Project",
                      "data-edit-project": "true",
                      n: "memo-edit-project-select",
                    },
                  }),
                ],
              );
            },
          }),
          Show({
            when: reactiveWhen(!props.comment),
            ok() {
              return View(
                {
                  class: "memo-select-wrap is-compact",
                  attributes: { n: "memo-edit-visibility-control" },
                },
                [
                  tn.Select({
                    store: props.visibilitySelect,
                    onUnmounted() {
                      props.visibilitySelect?.destroy?.();
                    },
                    attributes: {
                      "aria-label": "编辑可见性",
                      "data-edit-visibility": "true",
                      n: "memo-edit-visibility-select",
                    },
                  }),
                ],
              );
            },
          }),
          iconActionButton(props.runtime, {
            action: preview_action,
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "search",
            label: "预览",
            meaning: "memo-" + prefix + "-preview-button",
            pressed: "false",
            text: "预览",
          }),
          iconActionButton(props.runtime, {
            action: cancel_action,
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "x",
            label: "取消",
            meaning: "memo-" + prefix + "-cancel-button",
            text: "取消",
          }),
          iconActionButton(props.runtime, {
            action: save_action,
            class: "tn-button tn-button--primary memo-primary-button",
            icon: "check",
            label: "保存",
            meaning: "memo-" + prefix + "-save-button",
            text: "保存",
          }),
        ],
      ),
    ],
  );
}

function CommentReactionPickerView(props) {
  const { View } = props.runtime;
  return View(
    {
      as: "span",
      class: "memo-comment-reaction-wrap",
      attributes: { n: "memo-comment-reaction-control" },
    },
    [
      tn.DropdownMenu(
        {
          class: "memo-reaction-menu",
          store: props.comment.reactionMenu,
          onMouseEnter: props.comment.onReactionMenuMouseEnter,
          onMouseLeave: props.comment.onReactionMenuMouseLeave,
          onUnmounted() {
            props.comment.reactionMenuDestroy?.();
          },
          attributes: {
            "aria-label": "选择评论反应",
            "data-comment-id": props.comment.id,
            n: "memo-comment-reaction-menu",
          },
        },
        [
          iconActionButton(props.runtime, {
            commentId: props.comment.id,
            icon: "user",
            label: "添加反应",
            meaning: "memo-comment-reaction-add",
          }),
        ],
      ),
    ],
  );
}

function MemoCommentView(props) {
  const { Button, For, RichText, View } = props.runtime;
  const comment = props.comment;
  let base_class_name = "memo-comment";
  if (comment.editing) base_class_name += " is-editing";
  if (comment.private) base_class_name += " is-private";
  const active_ = comment.active || ref(false);
  const class_name_ = computed(active_, function (active) {
    return `${base_class_name}${active ? " is-active" : ""}`;
  });
  const aria_current_ = computed(active_, function (active) {
    return String(Boolean(active));
  });
  const data_active_ = computed(active_, function (active) {
    return String(Boolean(active));
  });
  return View(
    {
      as: "article",
      class: class_name_,
      onMouseEnter: comment.onMouseEnter,
      onMouseLeave: comment.onMouseLeave,
      attributes: {
        "aria-current": aria_current_,
        "data-active": data_active_,
        "data-comment-id": comment.id,
        n: "memo-comment",
      },
    },
    [
      Show({
        when: reactiveWhen(comment.private),
        ok() {
          return PrivateOverlayView({
            label: "仅自己可见",
            meaning: "memo-comment",
            runtime: props.runtime,
          });
        },
      }),
      View(
        {
          as: "header",
          class: "memo-comment-head",
          attributes: { n: "memo-comment-header" },
        },
        [
          View(
            {
              class: "memo-avatar memo-comment-avatar",
              attributes: { n: "memo-comment-avatar" },
            },
            ["U"],
          ),
          View({ attributes: { n: "memo-comment-author-details" } }, [
            View(
              {
                class: "memo-comment-author",
                attributes: { n: "memo-comment-author" },
              },
              ["You"],
            ),
            View(
              {
                as: "time",
                attributes: { datetime: comment.time, n: "memo-comment-time" },
              },
              [comment.relativeTime],
            ),
          ]),
        ],
      ),
      Show({
        when: reactiveWhen(comment.editing),
        ok() {
          return InlineEditorView({ comment: true, runtime: props.runtime });
        },
        else() {
          return props.runtime.Fragment({}, [
            View(
              {
                class: "memo-comment-bubble",
                attributes: { n: "memo-comment-bubble" },
              },
              [
                View(
                  {
                    class: "memo-comment-hover-actions",
                    attributes: {
                      "aria-label": "评论操作",
                      n: "memo-comment-actions",
                    },
                  },
                  [
                    iconActionButton(props.runtime, {
                      action: "copyComment",
                      icon: "copy",
                      label: "复制",
                      meaning: "memo-comment-copy-button",
                    }),
                    iconActionButton(props.runtime, {
                      action: "replyToComment",
                      icon: "corner-down-right",
                      label: "回复",
                      meaning: "memo-comment-reply-button",
                    }),
                    iconActionButton(props.runtime, {
                      action: "editComment",
                      icon: "file-text",
                      label: "编辑评论",
                      meaning: "memo-comment-edit-button",
                    }),
                    Show({
                      when: reactiveWhen(
                        comment.hasHistory,
                      ),
                      ok() {
                        return iconActionButton(props.runtime, {
                          action: "openCommentHistory",
                          icon: "history",
                          label: "版本历史",
                          meaning: "memo-comment-history-button",
                        });
                      },
                    }),
                    iconActionButton(props.runtime, {
                      action: "deleteComment",
                      danger: true,
                      icon: "trash2",
                      label: "删除评论",
                      meaning: "memo-comment-delete-button",
                    }),
                    CommentReactionPickerView({
                      comment,
                      runtime: props.runtime,
                    }),
                  ],
                ),
                Show({
                  when: reactiveWhen(comment.replyTo),
                  ok() {
                    return View(
                      {
                        class: "memo-comment-reply-to",
                        attributes: { n: "memo-comment-reply-source" },
                      },
                      [
                        View(
                          {
                            as: "span",
                            class: "memo-comment-reply-to-label",
                            attributes: {
                              n: "memo-comment-reply-source-label",
                            },
                          },
                          ["回复"],
                        ),
                        View(
                          {
                            as: "span",
                            class: "memo-comment-reply-to-content",
                            attributes: {
                              n: "memo-comment-reply-source-content",
                              title: comment.replyTitle,
                            },
                          },
                          [comment.replyLabel],
                        ),
                      ],
                    );
                  },
                }),
                View(
                  {
                    class: "memo-content memo-comment-content",
                    attributes: { n: "memo-comment-content" },
                  },
                  [
                    RichText({
                      attributes: { n: "memo-comment-rich-text" },
                      content: comment.html,
                    }),
                  ],
                ),
              ],
            ),
            Show({
              when: reactiveWhen(!comment.private),
              ok() {
                return View(
                  {
                    class: "memo-comment-footer",
                    attributes: { n: "memo-comment-footer" },
                  },
                  [
                    Show({
                      when: reactiveWhen(
                        comment.reactions?.length,
                      ),
                      ok() {
                        return View(
                          {
                            class: "memo-reactions-badges",
                            attributes: { n: "memo-comment-reaction-badges" },
                          },
                          [
                            For({
                              each: comment.reactions,
                              render(emoji) {
                                return Button(
                                  {
                                    class: "memo-reaction-badge is-active",
                                    attributes: {
                                      "data-action": "toggleCommentReaction",
                                      "data-comment-id": comment.id,
                                      "data-emoji": emoji,
                                      n: "memo-comment-reaction-badge",
                                      type: "button",
                                    },
                                  },
                                  [emoji],
                                );
                              },
                            }),
                          ],
                        );
                      },
                    }),
                    Show({
                      when: reactiveWhen(
                        comment.replyCount,
                      ),
                      ok() {
                        return Button(
                          {
                            class: "memo-comment-reply-badge",
                            attributes: {
                              "data-action": "openCommentReplies",
                              n: "memo-comment-reply-count",
                              type: "button",
                            },
                          },
                          [comment.replyCount + "条回复"],
                        );
                      },
                    }),
                  ],
                );
              },
            }),
          ]);
        },
      }),
    ],
  );
}

function CommentComposerView(props) {
  const { View } = props.runtime;
  return View(
    {
      class: "memo-comment-editor",
      attributes: { n: "memo-comment-composer" },
    },
    [
      View(
        {
          class: "memo-editor-switch",
          attributes: { n: "memo-comment-composer-switch" },
        },
        [
          View(
            {
              class: "memo-editor-host is-inline",
              attributes: {
                "data-comment-host": "true",
                "data-editor-switch-host": "true",
                n: "memo-comment-composer-host",
              },
            },
            [],
          ),
          View(
            {
              as: "section",
              class: "memo-editor-preview memo-comment-preview",
              attributes: {
                "data-comment-preview": "true",
                n: "memo-comment-preview",
              },
              hidden: true,
            },
            [],
          ),
        ],
      ),
      View(
        {
          class: "memo-inline-actions memo-comment-actions",
          attributes: { n: "memo-comment-composer-actions" },
        },
        [
          View(
            {
              class: "memo-inline-status-line",
              attributes: {
                "data-comment-vim-status": "true",
                n: "memo-comment-vim-status",
              },
            },
            [],
          ),
          tn.Select({
            class: "memo-comment-visibility-select",
            store: props.visibilitySelect,
            onUnmounted() {
              props.visibilitySelect?.destroy?.();
            },
            attributes: {
              "aria-label": "评论可见范围",
              "data-comment-visibility-select": "true",
              n: "memo-comment-visibility-select",
            },
          }),
          iconActionButton(props.runtime, {
            action: "toggleCommentPreview",
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "search",
            label: "预览",
            meaning: "memo-comment-preview-button",
            pressed: "false",
            text: "预览",
          }),
          iconActionButton(props.runtime, {
            action: "cancelComment",
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "x",
            label: "取消",
            meaning: "memo-comment-cancel-button",
            text: "取消",
          }),
          iconActionButton(props.runtime, {
            action: "saveComment",
            class: "tn-button tn-button--primary memo-primary-button",
            icon: "check",
            label: "评论",
            meaning: "memo-comment-save-button",
            text: "评论",
          }),
        ],
      ),
    ],
  );
}

function MemoCommentsView(props) {
  const { Button, For, View } = props.runtime;
  const list_class_ = computed(
    reactiveWhen(props.expanded),
    function (expanded) {
      if (expanded) return "memo-comment-list is-expanded";
      return "memo-comment-list is-collapsed";
    },
  );
  const aria_expanded_ = computed(
    reactiveWhen(props.expanded),
    function (expanded) {
      if (expanded) return "true";
      return "false";
    },
  );
  return View(
    {
      as: "section",
      class: "memo-comments",
      attributes: { "aria-label": "评论", n: "memo-comments" },
    },
    [
      // View(
      //   {
      //     class: "memo-comments-title",
      //     attributes: { n: "memo-comments-title" },
      //   },
      //   [
      //     View({ as: "span", attributes: { n: "memo-comments-title-label" } }, [
      //       "评论",
      //     ]),
      //     Show({
      //       when: reactiveWhen(props.comments.length),
      //       ok() {
      //         return View(
      //           { as: "strong", attributes: { n: "memo-comments-count" } },
      //           [
      //             props.comments.length,
      //           ],
      //         );
      //       },
      //     }),
      //   ],
      // ),
      Show({
        when: reactiveWhen(props.comments.length),
        ok() {
          return View(
            {
              class: list_class_,
              attributes: { n: "memo-comment-list" },
            },
            [
              For({
                each: props.visibleComments,
                render(comment) {
                  return MemoCommentView({ comment, runtime: props.runtime });
                },
              }),
            ],
          );
        },
      }),
      Show({
        when: reactiveWhen(props.hasOverflow),
        ok() {
          return Button(
            {
              class: "memo-comment-list-toggle",
              attributes: {
                "aria-expanded": aria_expanded_,
                "data-action": "toggleMemoComments",
                n: "memo-comments-toggle-button",
                type: "button",
              },
            },
            [
              View(
                { as: "span", attributes: { n: "memo-comments-toggle-label" } },
                [props.toggleLabel],
              ),
              Timeless.Icon({
                name: "chevron-down",
                attributes: { n: "memo-comments-toggle-icon" },
              }),
            ],
          );
        },
      }),
      Show({
        when: reactiveWhen(props.commenting),
        ok() {
          return CommentComposerView({
            runtime: props.runtime,
            visibility: props.commentVisibility,
            visibilitySelect: props.commentVisibilitySelect,
          });
        },
      }),
    ],
  );
}

function MemoMoreMenuView(props) {
  return tn.DropdownMenu(
    {
      class: "memo-card-more-menu",
      store: props.memo.moreMenu,
      onMouseEnter: props.memo.onMoreMenuMouseEnter,
      onMouseLeave: props.memo.onMoreMenuMouseLeave,
      attributes: {
        "aria-label": "Memo 更多操作",
        "data-memo-id": props.memo.id,
        "data-memo-more-menu": "true",
        n: "memo-more-menu",
      },
    },
    [props.trigger],
  );
}

export function MemoCardView(props) {
  const memo = props.memo;
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, RichText, View } = runtime;
  const active_ = memo.active || ref(false);
  const class_name_ = computed(active_, function (active) {
    return `${memo.className || "memo-card"}${active ? " is-active" : ""}`;
  });
  const aria_current_ = computed(active_, function (active) {
    return String(Boolean(active));
  });
  const data_active_ = computed(active_, function (active) {
    return String(Boolean(active));
  });

  return Show({
    when: reactiveWhen(memo.error),
    ok() {
      return View(
        {
          as: "article",
          class: class_name_,
          onMouseEnter: memo.onMouseEnter,
          onMouseLeave: memo.onMouseLeave,
          attributes: {
            "aria-current": aria_current_,
            "data-active": data_active_,
            "data-memo-card": "true",
            "data-memo-id": memo.id,
            n: "memo-card-error",
            tabindex: "0",
          },
        },
        [
          View(
            {
              class: "memo-empty-mini",
              attributes: { n: "memo-card-error-message" },
            },
            [memo.error],
          ),
        ],
      );
    },
    else() {
      let toc_label = "显示目录";
      let pin_icon = "arrow-down-to-line";
      let pin_label = "置顶";
      let pin_pressed = "false";
      if (memo.tocVisible) toc_label = "隐藏目录";
      if (memo.pinned) {
        pin_icon = "undo2";
        pin_label = "取消置顶";
        pin_pressed = "true";
      }
      const reading_class_ = computed(
        reactiveWhen(memo.tocVisible),
        function (toc_visible) {
          if (toc_visible) return "memo-card-reading has-toc";
          return "memo-card-reading";
        },
      );
      const collapse_class_ = computed(
        ref({
          expanded: Boolean(memo.expanded),
          short: Boolean(memo.short),
        }),
        function (value) {
          let class_name = "memo-list-collapse ";
          if (value.expanded) {
            class_name += "is-expanded";
          } else {
            class_name += "is-collapsed";
          }
          if (!value.expanded && value.short) class_name += " is-short";
          return class_name;
        },
      );
      return View(
        {
          as: "article",
          class: class_name_,
          onMouseEnter: memo.onMouseEnter,
          onMouseLeave: memo.onMouseLeave,
          attributes: {
            "aria-current": aria_current_,
            "data-active": data_active_,
            "data-memo-card": "true",
            "data-memo-id": memo.id,
            n: "memo-card",
            tabindex: "0",
          },
        },
        [
          Show({
            when: reactiveWhen(memo.private),
            ok() {
              return PrivateOverlayView({
                label: memo.visibility.label,
                meaning: "memo-card",
                runtime,
              });
            },
          }),
          View(
            {
              as: "header",
              class: "memo-card-head",
              attributes: { n: "memo-card-header" },
            },
            [
              View(
                {
                  class: "memo-card-author-info",
                  attributes: { n: "memo-card-author" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-author-name",
                      attributes: { n: "memo-card-author-name" },
                    },
                    ["You"],
                  ),
                  View(
                    {
                      as: "time",
                      attributes: {
                        datetime: memo.createdAt,
                        n: "memo-card-time",
                      },
                    },
                    [memo.relativeTime],
                  ),
                ],
              ),
              View(
                {
                  class: "memo-card-meta",
                  attributes: { n: "memo-card-meta" },
                },
                [
                  Show({
                    when: reactiveWhen(memo.showVisibility),
                    ok() {
                      return View(
                        {
                          as: "span",
                          class: "memo-visibility",
                          attributes: { n: "memo-card-visibility" },
                        },
                        [
                          Timeless.Icon({
                            name: memo.visibility.icon,
                            attributes: { n: "memo-card-visibility-icon" },
                          }),
                          memo.visibility.label,
                        ],
                      );
                    },
                  }),
                  Show({
                    when: reactiveWhen(memo.alias),
                    ok() {
                      return View(
                        {
                          as: "span",
                          class: "memo-alias-label",
                          attributes: { n: "memo-card-alias" },
                        },
                        ["@" + memo.alias],
                      );
                    },
                  }),
                  Show({
                    when: reactiveWhen(memo.backlinks),
                    ok() {
                      return View(
                        {
                          as: "span",
                          class: "memo-backlink-label",
                          attributes: { n: "memo-card-backlinks" },
                        },
                        [memo.backlinks + " 引用"],
                      );
                    },
                  }),
                  View(
                    {
                      class: "memo-card-head-actions",
                      attributes: { n: "memo-card-header-actions" },
                    },
                    [
                      Show({
                        when: reactiveWhen(memo.hasToc),
                        ok() {
                          return iconActionButton(runtime, {
                            action: "toggleMemoToc",
                            active: memo.tocVisible,
                            icon: "scroll-text",
                            label: toc_label,
                            meaning: "memo-toc-toggle",
                          });
                        },
                      }),
                      iconActionButton(runtime, {
                        action: "togglePin",
                        active: memo.pinned,
                        icon: pin_icon,
                        label: pin_label,
                        meaning: "memo-pin-toggle",
                        pressed: pin_pressed,
                      }),
                      iconActionButton(runtime, {
                        action: "detachMemo",
                        icon: "external-link",
                        label: "分离为窗口",
                        meaning: "memo-detach-button",
                      }),
                      iconActionButton(runtime, {
                        action: "copyMemo",
                        icon: "copy",
                        label: "复制",
                        meaning: "memo-copy-button",
                      }),
                    ],
                  ),
                ],
              ),
            ],
          ),
          Show({
            when: reactiveWhen(memo.editing),
            ok() {
              return InlineEditorView({
                projectId: memo.projectId,
                projectSelect: memo.editProjectSelect,
                projects: props.projects || [],
                runtime,
                visibility: memo.editVisibility,
                visibilitySelect: memo.editVisibilitySelect,
              });
            },
            else() {
              return View(
                {
                  class: reading_class_,
                  attributes: { n: "memo-card-reading" },
                },
                [
                  View(
                    {
                      class: "memo-card-reading-main",
                      attributes: { n: "memo-card-reading-main" },
                    },
                    [
                      View(
                        {
                          class: collapse_class_,
                          attributes: {
                            "data-memo-collapse": "true",
                            "data-memo-lines": memo.lineCount,
                            n: "memo-card-collapse",
                          },
                        },
                        [
                          View(
                            {
                              class: "memo-content",
                              attributes: { n: "memo-card-content" },
                            },
                            [
                              RichText({
                                attributes: { n: "memo-card-rich-text" },
                                content: memo.html,
                              }),
                            ],
                          ),
                          Show({
                            when: reactiveWhen(!memo.expanded),
                            ok() {
                              return Button(
                                {
                                  class: "memo-expand-button",
                                  attributes: {
                                    "aria-expanded": "false",
                                    "aria-label": "展开全文",
                                    "data-action": "expandMemo",
                                    n: "memo-expand-button",
                                    title: "展开全文",
                                    type: "button",
                                  },
                                },
                                [
                                  Timeless.Icon({
                                    name: "chevron-down",
                                    attributes: { n: "memo-expand-icon" },
                                  }),
                                  View(
                                    {
                                      as: "span",
                                      attributes: { n: "memo-expand-label" },
                                    },
                                    ["展开全文"],
                                  ),
                                ],
                              );
                            },
                          }),
                        ],
                      ),
                    ],
                  ),
                  Show({
                    when: reactiveWhen(memo.tocVisible),
                    ok() {
                      return MemoTocView({
                        headings: memo.headings,
                        meaning: "memo-card",
                        runtime,
                      });
                    },
                  }),
                ],
              );
            },
          }),
          View(
            {
              as: "footer",
              class: "memo-card-actions",
              attributes: { n: "memo-card-footer" },
            },
            [
              View(
                {
                  class: "memo-card-operation-meta",
                  attributes: { n: "memo-card-operation-meta" },
                },
                [
                  ProjectBadgeView({
                    meaning: "memo-card",
                    project: memo.project,
                    runtime,
                  }),
                  MemoStatsView({
                    interactiveTags: true,
                    meaning: "memo-card",
                    runtime,
                    stats: memo.stats,
                    tags: memo.tags,
                  }),
                ],
              ),
              Show({
                when: reactiveWhen(
                  !memo.editing && !memo.private,
                ),
                ok() {
                  return MemoReactionsView({
                    meaning: "memo-card",
                    menu: memo.reactionMenu,
                    memoId: memo.id,
                    reactions: memo.reactions,
                    runtime,
                  });
                },
              }),
              View(
                {
                  class: "memo-card-actions-buttons",
                  attributes: { n: "memo-card-action-buttons" },
                },
                [
                  iconActionButton(runtime, {
                    action: "commentMemo",
                    count: memo.commentCount,
                    icon: "message-square-more",
                    label: "评论",
                    meaning: "memo-comment-button",
                  }),
                  iconActionButton(runtime, {
                    action: "editMemo",
                    icon: "file-text",
                    label: "编辑",
                    meaning: "memo-edit-button",
                  }),
                  View(
                    {
                      class: "memo-card-more",
                      attributes: {
                        "data-memo-id": memo.id,
                        "data-memo-more": "true",
                        n: "memo-more-control",
                      },
                    },
                    [
                      MemoMoreMenuView({
                        memo,
                        runtime,
                        trigger: iconActionButton(runtime, {
                          class:
                            "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-card-more-trigger",
                          hasPopup: "menu",
                          icon: "ellipsis",
                          label: "更多操作",
                          meaning: "memo-more-button",
                        }),
                      }),
                    ],
                  ),
                ],
              ),
            ],
          ),
          Show({
            when: reactiveWhen(
              !memo.editing && (memo.comments.length || memo.commenting),
            ),
            ok() {
              return MemoCommentsView({
                commentVisibility: memo.commentVisibility,
                commentVisibilitySelect: memo.commentVisibilitySelect,
                commenting: memo.commenting,
                comments: memo.comments,
                expanded: memo.commentsExpanded,
                hasOverflow: memo.commentsOverflow,
                runtime,
                toggleLabel: memo.commentsToggleLabel,
                visibleComments: memo.visibleComments,
              });
            },
          }),
        ],
      );
    },
  });
}

export function PinnedMemoListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, RichText, View } = runtime;
  if (!props.memos?.length) {
    return View(
      { class: "memo-empty-mini", attributes: { n: "memo-pinned-empty" } },
      ["暂无置顶"],
    );
  }
  return runtime.Fragment({}, [
    For({
      each: props.memos,
      render(memo) {
        const collapse_class_ = computed(
          ref({
            expanded: Boolean(memo.expanded),
            short: Boolean(memo.short),
          }),
          function (value) {
            let class_name = "memo-pinned-collapse memo-list-collapse ";
            if (value.expanded) {
              class_name += "is-expanded";
            } else {
              class_name += "is-collapsed";
            }
            if (!value.expanded && value.short) class_name += " is-short";
            return class_name;
          },
        );
        return View(
          {
            as: "article",
            class: "memo-pinned-item memo-pinned-card",
            attributes: {
              "aria-label": "置顶 Memo",
              "data-memo-id": memo.id,
              n: "memo-pinned-card",
            },
          },
          [
            View(
              {
                as: "header",
                class: "memo-pinned-head",
                attributes: { n: "memo-pinned-header" },
              },
              [
                View(
                  {
                    class: "memo-card-author-info memo-pinned-author-info",
                    attributes: { n: "memo-pinned-author" },
                  },
                  [
                    View(
                      {
                        as: "span",
                        class: "memo-author-name",
                        attributes: { n: "memo-pinned-author-name" },
                      },
                      ["You"],
                    ),
                    View(
                      {
                        as: "time",
                        attributes: {
                          datetime: memo.createdAt,
                          n: "memo-pinned-time",
                        },
                      },
                      [memo.relativeTime],
                    ),
                  ],
                ),
                View(
                  {
                    class: "memo-pinned-actions",
                    attributes: { n: "memo-pinned-actions" },
                  },
                  [
                    iconActionButton(runtime, {
                      action: "togglePin",
                      active: true,
                      icon: "undo2",
                      label: "取消置顶",
                      meaning: "pinned-memo-unpin",
                      pressed: "true",
                    }),
                    iconActionButton(runtime, {
                      action: "detachMemo",
                      icon: "external-link",
                      label: "分离为窗口",
                      meaning: "memo-pinned-detach",
                    }),
                  ],
                ),
              ],
            ),
            View(
              {
                class: collapse_class_,
                attributes: {
                  "data-memo-collapse": "true",
                  "data-memo-lines": memo.lineCount,
                  n: "memo-pinned-collapse",
                },
              },
              [
                View(
                  {
                    class: "memo-pinned-content memo-content",
                    attributes: { n: "memo-pinned-content" },
                  },
                  [
                    RichText({
                      attributes: { n: "memo-pinned-rich-text" },
                      content: memo.html,
                    }),
                  ],
                ),
                Show({
                  when: reactiveWhen(!memo.expanded),
                  ok() {
                    return Button(
                      {
                        class: "memo-expand-button memo-pinned-expand-button",
                        attributes: {
                          "aria-expanded": "false",
                          "aria-label": "展开全文",
                          "data-action": "expandMemo",
                          n: "memo-pinned-expand",
                          title: "展开全文",
                          type: "button",
                        },
                      },
                      [
                        Timeless.Icon({
                          name: "chevron-down",
                          attributes: { n: "memo-pinned-expand-icon" },
                        }),
                        View(
                          {
                            as: "span",
                            attributes: { n: "memo-pinned-expand-label" },
                          },
                          ["展开全文"],
                        ),
                      ],
                    );
                  },
                }),
              ],
            ),
            View(
              {
                as: "footer",
                class: "memo-pinned-footer",
                attributes: { n: "memo-pinned-footer" },
              },
              [
                View(
                  {
                    class: "memo-card-operation-meta",
                    attributes: { n: "memo-pinned-meta" },
                  },
                  [
                    ProjectBadgeView({
                      meaning: "memo-pinned",
                      project: memo.project,
                      runtime,
                    }),
                    MemoStatsView({
                      meaning: "memo-pinned",
                      runtime,
                      stats: memo.stats,
                      tags: memo.tags,
                    }),
                  ],
                ),
              ],
            ),
          ],
        );
      },
    }),
  ]);
}

export function SourceMemoDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { RichText, View } = runtime;
  return tn.Dialog(
    {
      class: "tn-dialog--md memo-dialog-panel",
      store: props.store,
      style: { "max-width": "680px" },
      attributes: { n: "source-memo-dialog-panel" },
    },
    [
      tn.DialogBody(
        {
          class: "memo-dialog-body",
          style: { "overflow-y": "auto", padding: "16px" },
          attributes: { n: "source-memo-dialog-body" },
        },
        [
          View(
            {
              class: "memo-content",
              attributes: { n: "source-memo-dialog-content" },
            },
            [
              RichText({
                attributes: { n: "source-memo-dialog-rich-text" },
                content: props.html,
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

export function MemoDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;
  function action(name, class_name, icon_name, label) {
    return Button(
      {
        class: class_name,
        attributes: {
          "data-memo-dialog-action": name,
          n: "memo-dialog-" + name + "-button",
          type: "button",
        },
      },
      [
        Timeless.Icon({
          name: icon_name,
          attributes: { n: "memo-dialog-" + name + "-icon" },
        }),
        View(
          { as: "span", attributes: { n: "memo-dialog-" + name + "-label" } },
          [label],
        ),
      ],
    );
  }
  return tn.Dialog(
    {
      class: "tn-dialog--md memo-dialog-panel memo-comment-dialog-panel",
      store: props.store,
      attributes: {
        n: "memo-dialog-panel",
      },
    },
    [
      tn.DialogBody(
        {
          class: "memo-dialog-body",
          attributes: { n: "memo-dialog-body" },
        },
        [
          Show({
            when: reactiveWhen(props.description),
            ok() {
              return tn.DialogDescription(
                { attributes: { n: "memo-dialog-description" } },
                [props.description],
              );
            },
          }),
          Show({
            when: reactiveWhen(props.replyTo),
            ok() {
              return View(
                {
                  class: "memo-dialog-reply-to",
                  attributes: { n: "memo-dialog-reply-source" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-dialog-reply-to-label",
                      attributes: { n: "memo-dialog-reply-source-label" },
                    },
                    ["回复"],
                  ),
                  View(
                    {
                      as: "span",
                      class: "memo-dialog-reply-to-content",
                      attributes: {
                        n: "memo-dialog-reply-source-content",
                        title: props.replyTo,
                      },
                    },
                    [props.replyTo],
                  ),
                ],
              );
            },
          }),
          View(
            {
              class: "memo-editor-switch memo-dialog-editor-switch",
              attributes: { n: "memo-dialog-editor-switch" },
            },
            [
              View(
                {
                  class: "memo-editor-host memo-dialog-editor-host",
                  attributes: {
                    "data-editor-switch-host": "true",
                    "data-memo-dialog-editor-host": "true",
                    n: "memo-dialog-editor-host",
                  },
                },
                [],
              ),
              View(
                {
                  as: "section",
                  class: "memo-editor-preview memo-dialog-preview",
                  attributes: {
                    "data-memo-dialog-preview": "true",
                    n: "memo-dialog-preview",
                  },
                  hidden: true,
                },
                [],
              ),
            ],
          ),
        ],
      ),
      tn.DialogFooter(
        {
          class: "memo-dialog-actions",
          store: props.store,
          attributes: { n: "memo-dialog-actions" },
        },
        [
          View(
            {
              class: "memo-inline-status-line",
              attributes: {
                "data-memo-dialog-vim-status": "true",
                n: "memo-dialog-vim-status",
              },
            },
            [],
          ),
          action(
            "preview",
            "tn-button tn-button--secondary memo-secondary-button",
            "search",
            "预览",
          ),
          action(
            "cancel",
            "tn-button tn-button--secondary memo-secondary-button",
            "x",
            "取消",
          ),
          action(
            "save",
            "tn-button tn-button--primary memo-primary-button",
            "check",
            props.saveLabel,
          ),
        ],
      ),
    ],
  );
}

export function DetachedMemoShellView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  function small_button(attribute, icon_name, title, meaning) {
    return Button(
      {
        class: "memo-window-icon-button",
        attributes: {
          "aria-label": title,
          [attribute]: "true",
          n: meaning,
          title,
          type: "button",
        },
      },
      [
        Timeless.Icon({
          name: icon_name,
          attributes: { n: meaning + "-icon" },
        }),
      ],
    );
  }
  return View(
    {
      class: "memo-window-shell velo-drag",
      attributes: { "data-velo-drag": "true", n: "detached-memo-window" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-window-titlebar velo-drag",
          attributes: { "data-velo-drag": "true", n: "detached-memo-titlebar" },
        },
        [
          View(
            {
              class: "memo-window-native-controls",
              attributes: {
                "aria-hidden": "true",
                n: "detached-memo-native-controls",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-window-drag-region",
              attributes: {
                "aria-hidden": "true",
                n: "detached-memo-drag-region",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-window-title-actions",
              attributes: { n: "detached-memo-title-actions" },
            },
            [
              Button(
                {
                  class: "memo-window-icon-button velo-no-drag",
                  attributes: {
                    "aria-label": "悬浮在所有窗口上方",
                    "data-window-control": "toggleFixed",
                    n: "detached-memo-fixed-button",
                    title: "悬浮在所有窗口上方",
                    type: "button",
                  },
                },
                [
                  Timeless.Icon({
                    name: "arrow-down-to-line",
                    attributes: { n: "detached-memo-fixed-icon" },
                  }),
                ],
              ),
              View(
                {
                  as: "span",
                  class: "memo-window-visibility memo-window-project",
                  attributes: {
                    "data-window-project": "true",
                    n: "detached-memo-project",
                  },
                  hidden: true,
                },
                [],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-find-bar",
          attributes: { "data-find-bar": "true", n: "detached-memo-find-bar" },
          hidden: true,
        },
        [
          View(
            {
              as: "label",
              class: "memo-find-input-wrap",
              attributes: { n: "detached-memo-find-field" },
            },
            [
              View(
                {
                  as: "span",
                  class: "memo-find-icon",
                  attributes: { n: "detached-memo-find-icon" },
                },
                [
                  Timeless.Icon({
                    name: "search",
                    attributes: { n: "detached-memo-find-symbol" },
                  }),
                ],
              ),
              Input({
                type: "text",
                placeholder: "在 memo 中搜索...",
                attributes: {
                  autocomplete: "off",
                  "data-find-input": "true",
                  n: "detached-memo-find-input",
                  type: "text",
                },
              }),
              View(
                {
                  as: "span",
                  class: "memo-find-count",
                  attributes: {
                    "data-find-count": "true",
                    n: "detached-memo-find-count",
                  },
                },
                [],
              ),
            ],
          ),
          small_button(
            "data-find-prev",
            "chevron-up",
            "上一个 (Shift+Enter)",
            "detached-memo-find-previous",
          ),
          small_button(
            "data-find-next",
            "chevron-down",
            "下一个 (Enter)",
            "detached-memo-find-next",
          ),
          small_button(
            "data-find-close",
            "x",
            "关闭 (Escape)",
            "detached-memo-find-close",
          ),
        ],
      ),
      View(
        {
          as: "main",
          class: "memo-window-body velo-no-drag",
          attributes: {
            "data-window-content": "true",
            n: "detached-memo-content",
          },
        },
        [],
      ),
      View(
        {
          class: "memo-window-comment-form velo-no-drag",
          attributes: {
            "data-window-comment-form": "true",
            n: "detached-comment-form",
          },
        },
        [
          small_button(
            "data-window-comment-attach",
            "plus",
            "添加图片或附件",
            "detached-comment-attach",
          ),
          View(
            {
              class: "memo-editor-switch memo-window-comment-switch",
              attributes: { n: "detached-comment-editor-switch" },
            },
            [
              View(
                {
                  class: "memo-editor-host memo-window-comment-editor",
                  attributes: {
                    "data-editor-switch-host": "true",
                    "data-window-comment-editor": "true",
                    n: "detached-comment-editor-host",
                  },
                },
                [],
              ),
              View(
                {
                  as: "section",
                  class:
                    "memo-editor-preview memo-window-comment-preview velo-no-drag",
                  attributes: {
                    "data-window-comment-preview": "true",
                    n: "detached-comment-preview",
                  },
                  hidden: true,
                },
                [],
              ),
            ],
          ),
          Button(
            {
              class: "memo-window-comment-tool",
              attributes: {
                "aria-label": "预览评论",
                "aria-pressed": "false",
                "data-window-comment-preview-toggle": "true",
                n: "detached-comment-preview-toggle",
                title: "预览",
                type: "button",
              },
            },
            [
              Timeless.Icon({
                name: "search",
                attributes: { n: "detached-comment-preview-toggle-icon" },
              }),
            ],
          ),
          Button(
            {
              class: "memo-window-comment-submit",
              attributes: {
                "aria-label": "发送评论",
                "data-window-comment-submit": "true",
                n: "detached-comment-submit",
                title: "发送",
                type: "button",
              },
              disabled: true,
            },
            [
              Timeless.Icon({
                name: "arrow-right",
                attributes: { n: "detached-comment-submit-icon" },
              }),
            ],
          ),
          Input({
            class: "memo-hidden-input",
            type: "file",
            attributes: {
              "data-window-comment-file-input": "true",
              multiple: "multiple",
              n: "detached-comment-file-input",
              type: "file",
            },
          }),
        ],
      ),
      View(
        {
          class: "memo-toast",
          attributes: {
            "data-toast": "true",
            n: "detached-memo-toast",
            role: "status",
          },
        },
        [],
      ),
    ],
  );
}

function detachedCommentAction(runtime, props) {
  return runtime.Button(
    {
      class:
        props.class ||
        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
      attributes: {
        "aria-label": props.label,
        "aria-pressed": props.pressed,
        "data-window-comment-action": props.action,
        n: "detached-comment-" + props.action + "-button",
        title: props.label,
        type: "button",
      },
    },
    [
      Show({
        when: reactiveWhen(props.icon),
        ok() {
          return Timeless.Icon({
            name: props.icon,
            attributes: {
              n: "detached-comment-" + props.action + "-icon",
            },
          });
        },
      }),
      Show({
        when: reactiveWhen(props.text),
        ok() {
          return runtime.View(
            {
              as: "span",
              attributes: { n: "detached-comment-" + props.action + "-label" },
            },
            [props.text],
          );
        },
      }),
    ],
  );
}

function DetachedCommentReactionPickerView(props) {
  const { View } = props.runtime;
  return View(
    {
      as: "span",
      class: "memo-comment-reaction-wrap memo-reactions-add-wrap",
      attributes: { n: "detached-comment-reaction-control" },
    },
    [
      tn.DropdownMenu(
        {
          class: "memo-reaction-menu",
          store: props.comment.reactionMenu,
          onUnmounted() {
            props.comment.reactionMenu?.unmount?.();
          },
          attributes: {
            "aria-label": "选择评论反应",
            "data-comment-id": props.comment.id,
            n: "detached-comment-reaction-menu",
          },
        },
        [
          detachedCommentAction(props.runtime, {
            icon: "user",
            label: "添加反应",
          }),
        ],
      ),
    ],
  );
}

function DetachedCommentView(props) {
  const { Button, For, RichText, View } = props.runtime;
  const comment = props.comment;
  let expand_label = "展开";
  if (comment.expanded) expand_label = "收起";
  const class_name_ = computed(
    ref({
      editing: Boolean(comment.editing),
      highlighted: Boolean(comment.highlighted),
    }),
    function (value) {
      let class_name = "memo-comment memo-window-comment";
      if (value.editing) class_name += " is-editing";
      if (value.highlighted) class_name += " is-highlighted";
      return class_name;
    },
  );
  const collapse_class_ = computed(
    reactiveWhen(comment.expanded),
    function (expanded) {
      if (expanded) {
        return "memo-window-comment-collapse is-expanded";
      }
      return "memo-window-comment-collapse is-collapsed";
    },
  );
  return View(
    {
      as: "article",
      class: class_name_,
      attributes: { "data-comment-id": comment.id, n: "detached-comment" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-comment-head",
          attributes: { n: "detached-comment-header" },
        },
        [
          View(
            {
              class: "memo-avatar memo-comment-avatar",
              attributes: { n: "detached-comment-avatar" },
            },
            ["U"],
          ),
          View({ attributes: { n: "detached-comment-author-details" } }, [
            View(
              {
                class: "memo-comment-author",
                attributes: { n: "detached-comment-author" },
              },
              ["You"],
            ),
            View(
              {
                as: "time",
                attributes: {
                  datetime: comment.time,
                  n: "detached-comment-time",
                },
              },
              [comment.relativeTime],
            ),
          ]),
        ],
      ),
      Show({
        when: reactiveWhen(comment.editing),
        ok() {
          return View(
            {
              class: "memo-window-comment-edit",
              attributes: { n: "detached-comment-editor" },
            },
            [
              View(
                {
                  class: "memo-editor-switch",
                  attributes: { n: "detached-comment-editor-switch" },
                },
                [
                  View(
                    {
                      class:
                        "memo-editor-host is-inline memo-window-comment-edit-host",
                      attributes: {
                        "data-editor-switch-host": "true",
                        "data-window-comment-edit-host": "true",
                        n: "detached-comment-edit-host",
                      },
                    },
                    [],
                  ),
                  View(
                    {
                      as: "section",
                      class:
                        "memo-editor-preview memo-window-comment-edit-preview",
                      attributes: {
                        "data-window-comment-edit-preview": "true",
                        n: "detached-comment-edit-preview",
                      },
                      hidden: true,
                    },
                    [],
                  ),
                ],
              ),
              View(
                {
                  class: "memo-window-comment-edit-actions",
                  attributes: { n: "detached-comment-edit-actions" },
                },
                [
                  detachedCommentAction(props.runtime, {
                    action: "preview",
                    class:
                      "tn-button tn-button--secondary memo-secondary-button",
                    icon: "search",
                    label: "预览",
                    pressed: "false",
                    text: "预览",
                  }),
                  detachedCommentAction(props.runtime, {
                    action: "cancel",
                    class:
                      "tn-button tn-button--secondary memo-secondary-button",
                    icon: "x",
                    label: "取消",
                    text: "取消",
                  }),
                  detachedCommentAction(props.runtime, {
                    action: "save",
                    class: "tn-button tn-button--primary memo-primary-button",
                    icon: "check",
                    label: "保存",
                    text: "保存",
                  }),
                ],
              ),
            ],
          );
        },
        else() {
          return props.runtime.Fragment({}, [
            View(
              {
                class: "memo-window-comment-bubble",
                attributes: { n: "detached-comment-bubble" },
              },
              [
                View(
                  {
                    class: collapse_class_,
                    attributes: {
                      "data-window-comment-collapse": "true",
                      n: "detached-comment-collapse",
                    },
                  },
                  [
                    View(
                      {
                        class: "memo-window-comment-hover-actions",
                        attributes: {
                          "aria-label": "评论操作",
                          n: "detached-comment-actions",
                        },
                      },
                      [
                        detachedCommentAction(props.runtime, {
                          action: "copy",
                          icon: "copy",
                          label: "复制",
                        }),
                        detachedCommentAction(props.runtime, {
                          action: "reply",
                          icon: "corner-down-right",
                          label: "回复",
                        }),
                        detachedCommentAction(props.runtime, {
                          action: "edit",
                          icon: "file-text",
                          label: "编辑评论",
                        }),
                        Show({
                          when: reactiveWhen(
                            comment.hasHistory,
                          ),
                          ok() {
                            return detachedCommentAction(props.runtime, {
                              action: "history",
                              icon: "history",
                              label: "版本历史",
                            });
                          },
                        }),
                        detachedCommentAction(props.runtime, {
                          action: "delete",
                          class:
                            "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button is-danger",
                          icon: "trash2",
                          label: "删除评论",
                        }),
                        DetachedCommentReactionPickerView({
                          comment,
                          runtime: props.runtime,
                        }),
                      ],
                    ),
                    Show({
                      when: reactiveWhen(comment.replyTo),
                      ok() {
                        return View(
                          {
                            class: "memo-comment-reply-to",
                            attributes: { n: "detached-comment-reply-source" },
                          },
                          [
                            View(
                              {
                                as: "span",
                                class: "memo-comment-reply-to-label",
                                attributes: {
                                  n: "detached-comment-reply-label",
                                },
                              },
                              ["回复"],
                            ),
                            View(
                              {
                                as: "span",
                                class: "memo-comment-reply-to-content",
                                attributes: {
                                  n: "detached-comment-reply-content",
                                  title: comment.replyTitle,
                                },
                              },
                              [comment.replyLabel],
                            ),
                          ],
                        );
                      },
                    }),
                    View(
                      {
                        class: "memo-content memo-comment-content",
                        attributes: { n: "detached-comment-content" },
                      },
                      [
                        RichText({
                          attributes: { n: "detached-comment-rich-text" },
                          content: comment.html,
                        }),
                      ],
                    ),
                    detachedCommentAction(props.runtime, {
                      action: "toggleExpand",
                      class:
                        "memo-expand-button memo-window-comment-expand-button",
                      icon: "chevron-down",
                      label: expand_label,
                      text: expand_label,
                    }),
                  ],
                ),
              ],
            ),
            View(
              {
                class: "memo-comment-footer",
                attributes: { n: "detached-comment-footer" },
              },
              [
                Show({
                  when: reactiveWhen(
                    comment.reactions?.length,
                  ),
                  ok() {
                    return View(
                      {
                        class: "memo-reactions-badges",
                        attributes: { n: "detached-comment-reaction-badges" },
                      },
                      [
                        For({
                          each: comment.reactions,
                          render(emoji) {
                            return Button(
                              {
                                class: "memo-reaction-badge is-active",
                                attributes: {
                                  "data-action": "toggleCommentReaction",
                                  "data-comment-id": comment.id,
                                  "data-emoji": emoji,
                                  n: "detached-comment-reaction-badge",
                                  type: "button",
                                },
                              },
                              [emoji],
                            );
                          },
                        }),
                      ],
                    );
                  },
                }),
                Show({
                  when: reactiveWhen(comment.replyCount),
                  ok() {
                    return Button(
                      {
                        class: "memo-comment-reply-badge",
                        attributes: {
                          "data-window-comment-action": "openCommentReplies",
                          n: "detached-comment-reply-count",
                          type: "button",
                        },
                      },
                      [comment.replyCount + "条回复"],
                    );
                  },
                }),
              ],
            ),
          ]);
        },
      }),
    ],
  );
}

export function DetachedMemoCardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, RichText, View } = runtime;
  const memo = props.memo;
  const reading_class_ = computed(
    reactiveWhen(memo.headings?.length),
    function (has_toc) {
      if (has_toc) return "memo-card-reading has-toc";
      return "memo-card-reading";
    },
  );
  return View(
    {
      as: "article",
      class: "memo-card memo-window-card",
      attributes: { "data-memo-id": memo.id, n: "detached-memo-card" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-card-head memo-window-card-head",
          attributes: { n: "detached-memo-card-header" },
        },
        [
          View(
            { class: "memo-author", attributes: { n: "detached-memo-author" } },
            [
              View(
                {
                  class: "memo-avatar",
                  attributes: { n: "detached-memo-avatar" },
                },
                ["U"],
              ),
              View({ attributes: { n: "detached-memo-author-details" } }, [
                View(
                  {
                    class: "memo-author-name",
                    attributes: { n: "detached-memo-author-name" },
                  },
                  ["You"],
                ),
                View(
                  {
                    as: "time",
                    attributes: {
                      datetime: memo.createdAt,
                      n: "detached-memo-time",
                    },
                  },
                  [memo.relativeTime],
                ),
                MemoReactionsView({
                  destroyMenuOnUnmounted: true,
                  meaning: "detached-memo",
                  menu: memo.reactionMenu,
                  memoId: memo.id,
                  reactions: memo.reactions,
                  runtime,
                }),
              ]),
            ],
          ),
          View(
            {
              class: "memo-card-meta memo-window-card-meta",
              attributes: { n: "detached-memo-meta" },
            },
            [
              View(
                {
                  class: "memo-card-head-actions",
                  attributes: { n: "detached-memo-actions" },
                },
                [
                  iconActionButton(runtime, {
                    action: "editMemo",
                    icon: "file-text",
                    label: "编辑",
                    meaning: "detached-memo-edit",
                  }),
                  iconActionButton(runtime, {
                    action: "copyMemo",
                    icon: "copy",
                    label: "复制",
                    meaning: "detached-memo-copy",
                  }),
                  iconActionButton(runtime, {
                    action: "copyMemoRef",
                    icon: "file-symlink",
                    label: "复制引用",
                    meaning: "detached-memo-copy-reference",
                  }),
                  Show({
                    when: reactiveWhen(memo.hasHistory),
                    ok() {
                      return iconActionButton(runtime, {
                        action: "openMemoHistory",
                        icon: "history",
                        label: "版本历史",
                        meaning: "detached-memo-history",
                      });
                    },
                  }),
                ],
              ),
              Show({
                when: reactiveWhen(memo.pinned),
                ok() {
                  return View(
                    {
                      as: "span",
                      class: "memo-pin-label",
                      attributes: { n: "detached-memo-pinned" },
                    },
                    ["置顶"],
                  );
                },
              }),
              Show({
                when: reactiveWhen(memo.backlinks),
                ok() {
                  return View(
                    {
                      as: "span",
                      class: "memo-backlink-label",
                      attributes: { n: "detached-memo-backlinks" },
                    },
                    [memo.backlinks + " 引用"],
                  );
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: reading_class_,
          attributes: { n: "detached-memo-reading" },
        },
        [
          View(
            {
              class: "memo-card-reading-main",
              attributes: { n: "detached-memo-reading-main" },
            },
            [
              View(
                {
                  class: "memo-content",
                  attributes: { n: "detached-memo-content" },
                },
                [
                  RichText({
                    attributes: { n: "detached-memo-rich-text" },
                    content: memo.html,
                  }),
                ],
              ),
              MemoStatsView({
                meaning: "detached-memo",
                runtime,
                stats: memo.stats,
                tags: memo.tags,
              }),
            ],
          ),
          MemoTocView({
            headings: memo.headings,
            meaning: "detached-memo",
            runtime,
          }),
        ],
      ),
      Show({
        when: reactiveWhen(props.comments?.length),
        ok() {
          return View(
            {
              as: "section",
              class: "memo-window-comments",
              attributes: { "aria-label": "评论", n: "detached-memo-comments" },
            },
            [
              View(
                {
                  class: "memo-window-comments-title",
                  attributes: { n: "detached-memo-comments-title" },
                },
                ["评论"],
              ),
              View(
                {
                  class: "memo-comment-list",
                  attributes: { n: "detached-memo-comment-list" },
                },
                [
                  For({
                    each: props.comments,
                    render(comment) {
                      return DetachedCommentView({ comment, runtime });
                    },
                  }),
                ],
              ),
            ],
          );
        },
      }),
    ],
  );
}

export function PinDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Input, View } = runtime;
  const is_set = props.mode === "set";
  return tn.Dialog(
    {
      cancelText: "取消",
      class: "pin-dialog-card",
      confirmText: is_set ? "设置" : "解锁",
      store: props.store,
      zIndex: 10000,
      attributes: {
        "data-pin-dialog": "true",
        n: "memo-pin-dialog",
      },
    },
    [
      tn.DialogBody(
        { attributes: { n: "memo-pin-dialog-body" } },
        [
          tn.DialogDescription(
            {
              class: "pin-dialog-desc",
              attributes: { n: "memo-pin-dialog-description" },
            },
            [
              Show({
                when: reactiveWhen(is_set),
                ok() {
                  return "请设置一个至少 4 位的 PIN 以保护私密内容";
                },
                else() {
                  return "请输入 PIN 查看私密内容";
                },
              }),
            ],
          ),
          Show({
            when: reactiveWhen(props.error),
            ok() {
              return View(
                {
                  class: "pin-dialog-error",
                  attributes: { n: "memo-pin-dialog-error" },
                },
                [props.error],
              );
            },
          }),
          Input({
            type: "password",
            placeholder: "输入 PIN",
            attributes: {
              autofocus: "autofocus",
              "data-pin-input": "true",
              maxlength: "16",
              n: "memo-pin-input",
              type: "password",
            },
          }),
        ],
      ),
    ],
  );
}

export function InlinePromptView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Input } = runtime;
  return tn.Dialog(
    {
      cancelText: "取消",
      class: "memo-inline-prompt-dialog",
      confirmText: "确认",
      store: props.store,
      attributes: { n: "memo-inline-prompt-dialog" },
    },
    [
      tn.DialogBody(
        { attributes: { n: "memo-inline-prompt-body" } },
        [
          Input({
            class: "memo-inline-prompt-input",
            type: "text",
            value: props.value,
            attributes: { n: "memo-inline-prompt-input", type: "text" },
          }),
        ],
      ),
    ],
  );
}

export function SourceEditDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  function field(label, control, meaning) {
    return View({ class: "memo-form-field", attributes: { n: meaning } }, [
      View({ as: "label", attributes: { n: meaning + "-label" } }, [label]),
      control,
    ]);
  }
  function text_input(name, value, options = {}) {
    const attributes = {
      n: "source-edit-" + name + "-input",
      type: "text",
    };
    if (options.readonly) {
      attributes.readonly = "readonly";
    } else {
      attributes["data-source-edit-field"] = "true";
      attributes.name = name;
    }
    return Input({
      type: "text",
      value,
      placeholder: options.placeholder,
      attributes,
    });
  }
  function checkbox(name, store) {
    return View(
      {
        class: "memo-form-field",
        attributes: { n: "source-edit-" + name + "-field" },
      },
      [
        View(
          {
            as: "label",
            attributes: { n: "source-edit-" + name + "-label" },
          },
          [
            tn.Checkbox({
              store,
              onUnmounted() {
                store?.destroy?.();
              },
              attributes: {
                n: "source-edit-" + name + "-input",
              },
            }),
            " " + name,
          ],
        ),
      ],
    );
  }
  return tn.Dialog(
    {
      class: "tn-dialog--md memo-dialog-panel",
      store: props.store,
      style: { "max-width": "520px" },
      attributes: { n: "source-edit-dialog-panel" },
    },
    [
      tn.DialogBody(
        {
          class: "memo-dialog-body",
          style: { padding: "16px" },
          attributes: { n: "source-edit-dialog-body" },
        },
        [
          View(
            {
              attributes: {
                "data-source-edit-form": "true",
                n: "source-edit-form",
              },
            },
            [
              field(
                "memo ID",
                text_input("id", props.memo.id || "", { readonly: true }),
                "source-edit-id-field",
              ),
              field(
                "alias",
                text_input("alias", props.memo.alias || "", {
                  placeholder: "快捷搜索别名",
                }),
                "source-edit-alias-field",
              ),
              field(
                "createdAt",
                text_input("createdAt", props.createdAt),
                "source-edit-created-field",
              ),
              field(
                "updatedAt",
                text_input("updatedAt", props.updatedAt),
                "source-edit-updated-field",
              ),
              field(
                "visibility",
                tn.Select({
                  store: props.visibilitySelect,
                  onUnmounted() {
                    props.visibilitySelect?.destroy?.();
                  },
                  attributes: {
                    "data-source-edit-field": "true",
                    n: "source-edit-visibility-select",
                    name: "visibility",
                  },
                }),
                "source-edit-visibility-field",
              ),
              checkbox("private", props.privateCheckbox),
              checkbox("pinned", props.pinnedCheckbox),
              checkbox("archived", props.archivedCheckbox),
              field(
                "projectId",
                text_input("projectId", props.memo.projectId || ""),
                "source-edit-project-field",
              ),
              field(
                "kind",
                text_input("kind", props.memo.kind || ""),
                "source-edit-kind-field",
              ),
              field(
                "taskId",
                text_input("taskId", props.memo.taskId || ""),
                "source-edit-task-field",
              ),
              tn.DialogFooter(
                {
                  class: "memo-dialog-actions",
                  store: props.store,
                  attributes: { n: "source-edit-actions" },
                },
                [
                  Button(
                    {
                      class:
                        "tn-button tn-button--secondary memo-secondary-button",
                      attributes: {
                        "data-open-file": props.memo.id || "",
                        n: "source-edit-open-file",
                        type: "button",
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "external-link",
                        attributes: { n: "source-edit-open-file-icon" },
                      }),
                      " 打开文件",
                    ],
                  ),
                  View(
                    {
                      style: { flex: "1" },
                      attributes: { n: "source-edit-action-spacer" },
                    },
                    [],
                  ),
                  Button(
                    {
                      class:
                        "tn-button tn-button--secondary memo-secondary-button",
                      attributes: {
                        "data-source-edit-cancel": "true",
                        n: "source-edit-cancel",
                        type: "button",
                      },
                    },
                    ["取消"],
                  ),
                  Button(
                    {
                      class: "tn-button tn-button--primary memo-primary-button",
                      attributes: {
                        "data-source-edit-save": "true",
                        n: "source-edit-save",
                        type: "button",
                      },
                    },
                    ["保存"],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}


// __HOME_MEMO_VIEWS__
