import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

import { HomeMemoPageModel } from "./home_memo.model.js";
import { HomePageHeader } from "./home_page_header.js";
import {
  iconActionButton,
  memoIcon,
  PrivateOverlayView,
  reactiveWhen,
} from "./home_view_shared.js";

const MEMO_EDITOR_TOOLS = Object.freeze([
  ["bold", "粗体"],
  ["italic", "斜体"],
  ["code", "代码"],
  ["list", "列表"],
  ["checklist", "任务"],
  ["tag", "标签"],
  ["link", "链接"],
  ["image", "图片"],
  ["attach", "附件"],
  ["date", "时间"],
]);

function MemoHeaderActions(vm$) {
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

function MemoComposer(vm$) {
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
              attributes: { "aria-label": "编辑命令" },
            },
            MEMO_EDITOR_TOOLS.map(([command, label]) =>
              Timeless.Button(
                {
                  class: "memo-tool-button",
                  attributes: {
                    "aria-label": label,
                    "data-editor-command": command,
                    title: label,
                    type: "button",
                  },
                },
                [label],
              ),
            ),
          ),
          View(
            {
              as: "select",
              attributes: {
                "aria-label": "Project",
                "data-project-select": "true",
              },
            },
            [],
          ),
          View(
            {
              as: "select",
              attributes: {
                "aria-label": "可见性",
                "data-visibility-select": "true",
              },
            },
            [
              View(
                { as: "option", attributes: { value: "PRIVATE" } },
                ["仅自己"],
              ),
              View(
                { as: "option", attributes: { value: "PUBLIC" } },
                ["公开"],
              ),
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
          Timeless.Button(
            {
              class: "tn-button tn-button--secondary",
              attributes: {
                "data-action": "toggleComposerPreview",
                type: "button",
              },
            },
            ["预览"],
          ),
          Timeless.Button(
            {
              class: "tn-button tn-button--primary",
              disabled: vm$.ui.createButtonDisabled,
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

function MemoFeedTools(vm$) {
  return View(
    {
      as: "section",
      class: "memo-feed-tools",
      hidden: vm$.ui.feedToolsHidden,
      attributes: { "aria-label": "Memo search" },
    },
    [
      Input({
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
          },
        },
        [],
      ),
      Timeless.Button(
        {
          class: "tn-button tn-button--ghost",
          attributes: { "data-action": "clearFilters", type: "button" },
        },
        ["重置"],
      ),
    ],
  );
}

function MemoInspector(vm$) {
  return View(
    {
      as: "aside",
      class: "memo-inspector",
      hidden: vm$.ui.memoInspectorHidden,
      attributes: { "aria-label": "Memo details" },
    },
    [
      View(
        {
          as: "section",
          class: "memo-inspector-section",
          attributes: { n: "home-memo-pinned-section" },
        },
        [
          View({ class: "memo-inspector-title" }, ["置顶"]),
          View(
            {
              class: "memo-pinned-list",
              attributes: { "data-pinned-list": "true" },
            },
            [],
          ),
        ],
      ),
    ],
  );
}

function MemoOverlays(vm$) {
  return Timeless.Fragment({}, [
    View(
      {
        class: "memo-command-palette",
        hidden: vm$.ui.memoSearchPaletteHidden,
        attributes: { "data-memo-search-palette": "true" },
      },
      [
        Input({
          type: "search",
          placeholder: "搜索 memo / 评论 / 代办",
          attributes: { "data-memo-search-input": "true", type: "search" },
        }),
        View(
          { attributes: { "data-memo-search-results": "true" } },
          [],
        ),
      ],
    ),
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

/** @param {import("./home.models").HomePageProps} props */
export default function HomeMemoPageView(props) {
  const vm$ = HomeMemoPageModel(props);
  return View(
    {
      class: "page home-memo-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
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
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-memo-main" },
        },
        [
          MemoComposer(vm$),
          MemoFeedTools(vm$),
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-memo-content" },
            },
            [],
          ),
        ],
      ),
      MemoInspector(vm$),
      MemoOverlays(vm$),
    ],
  );
}

export function SearchPaletteView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Input, View } = runtime;
  const ui = props.ui || {};
  return View(
    {
      class: "memo-command-palette",
      attributes: {
        "data-memo-search-palette": "true",
        hidden: ui.memoSearchPaletteHidden ?? true,
        n: "memo-search-palette",
      },
    },
    [
      View(
        {
          class: "memo-command-panel",
          attributes: {
            "aria-label": "搜索 memo、评论和代办",
            "aria-modal": "true",
            n: "memo-search-panel",
            role: "dialog",
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
              memoIcon("search", "memo-search-field-icon"),
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
        let toggle_icon = "eye";
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
                    memoIcon(toggle_icon, "history-toggle-diff-icon"),
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
                        return memoIcon(
                          "rotate-ccw",
                          "history-restore-version-icon",
                        );
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
  return View(
    {
      class: "history-dialog-backdrop",
      attributes: {
        "data-history-backdrop": "true",
        n: "history-dialog-backdrop",
      },
    },
    [
      View(
        { class: "history-dialog-card", attributes: { n: "history-dialog" } },
        [
          View(
            {
              class: "history-dialog-head",
              attributes: { n: "history-dialog-header" },
            },
            [
              View({ as: "h2", attributes: { n: "history-dialog-title" } }, [
                props.title,
              ]),
              View(
                {
                  as: "span",
                  class: "history-record-id",
                  attributes: { n: "history-record-id" },
                },
                [props.recordId],
              ),
              Button(
                {
                  class:
                    "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                  attributes: {
                    "aria-label": "关闭",
                    "data-action": "closeHistoryDialog",
                    n: "history-dialog-close",
                    type: "button",
                  },
                },
                [memoIcon("x", "history-dialog-close-icon")],
              ),
            ],
          ),
          View(
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
      ),
    ],
  );
}

const REACTIONS = Object.freeze(["👍", "👎", "😄", "🎉", "❤️", "🚀", "👀"]);

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
          iconActionButton(props.runtime, {
            action: "toggleMemoReactions",
            class: "memo-reaction-add-btn",
            icon: "smile",
            label: "添加反应",
            meaning: props.meaning + "-reaction-add",
            memoId: props.memoId,
          }),
          View(
            {
              class: "memo-reactions-picker",
              attributes: {
                "data-reactions-picker": "true",
                n: props.meaning + "-reaction-picker",
              },
              hidden: true,
            },
            [
              For({
                each: REACTIONS,
                render(emoji) {
                  const class_name_ = computed(
                    reactiveWhen(active.has(emoji)),
                    function (selected) {
                      if (selected) return "memo-picker-emoji is-active";
                      return "memo-picker-emoji";
                    },
                  );
                  return Button(
                    {
                      class: class_name_,
                      attributes: {
                        "data-action": "pickMemoReaction",
                        "data-emoji": emoji,
                        "data-memo-id": props.memoId,
                        n: props.meaning + "-reaction-option",
                        type: "button",
                      },
                    },
                    [emoji],
                  );
                },
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
                  props.runtime.Select({
                    attributes: {
                      "aria-label": "编辑 Project",
                      "data-edit-project": "true",
                      n: "memo-edit-project-select",
                    },
                    options: [{ label: "未归属", value: "" }].concat(
                      props.projects || [],
                    ),
                    placeholder: "未归属",
                    value: props.projectId || "",
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
                  props.runtime.Select({
                    attributes: {
                      "aria-label": "编辑可见性",
                      "data-edit-visibility": "true",
                      n: "memo-edit-visibility-select",
                    },
                    options: [
                      { label: "仅自己", value: "PRIVATE" },
                      { label: "私密", value: "SECRET" },
                      { label: "工作区", value: "PROTECTED" },
                      { label: "公开", value: "PUBLIC" },
                    ],
                    placeholder: "可见性",
                    value: props.visibility,
                  }),
                ],
              );
            },
          }),
          iconActionButton(props.runtime, {
            action: preview_action,
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "eye",
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
  const { Button, For, View } = props.runtime;
  const active = new Set(props.comment.reactions || []);
  return View(
    {
      as: "span",
      class: "memo-comment-reaction-wrap",
      attributes: { n: "memo-comment-reaction-control" },
    },
    [
      iconActionButton(props.runtime, {
        action: "toggleCommentReactions",
        commentId: props.comment.id,
        icon: "smile",
        label: "添加反应",
        meaning: "memo-comment-reaction-add",
      }),
      View(
        {
          class: "memo-reactions-picker",
          attributes: {
            "data-reactions-picker": "true",
            n: "memo-comment-reaction-picker",
          },
          hidden: true,
        },
        [
          For({
            each: REACTIONS,
            render(emoji) {
              const class_name_ = computed(
                reactiveWhen(active.has(emoji)),
                function (selected) {
                  if (selected) return "memo-picker-emoji is-active";
                  return "memo-picker-emoji";
                },
              );
              return Button(
                {
                  class: class_name_,
                  attributes: {
                    "data-action": "pickCommentReaction",
                    "data-comment-id": props.comment.id,
                    "data-emoji": emoji,
                    n: "memo-comment-reaction-option",
                    type: "button",
                  },
                },
                [emoji],
              );
            },
          }),
        ],
      ),
    ],
  );
}

function MemoCommentView(props) {
  const { Button, For, RichText, View } = props.runtime;
  const comment = props.comment;
  const class_name_ = computed(
    ref({
      editing: Boolean(comment.editing),
      private: Boolean(comment.private),
    }),
    function (value) {
      let class_name = "memo-comment";
      if (value.editing) class_name += " is-editing";
      if (value.private) class_name += " is-private";
      return class_name;
    },
  );
  return View(
    {
      as: "article",
      class: class_name_,
      attributes: { "data-comment-id": comment.id, n: "memo-comment" },
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
                      icon: "reply",
                      label: "回复",
                      meaning: "memo-comment-reply-button",
                    }),
                    iconActionButton(props.runtime, {
                      action: "editComment",
                      icon: "edit",
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
          props.runtime.Select({
            class: "memo-comment-visibility-select",
            attributes: {
              "aria-label": "评论可见范围",
              "data-comment-visibility-select": "true",
              n: "memo-comment-visibility-select",
            },
            options: [
              { label: "仅自己", value: "PRIVATE" },
              { label: "私密", value: "SECRET" },
              { label: "工作区", value: "PROTECTED" },
              { label: "公开", value: "PUBLIC" },
            ],
            placeholder: "可见范围",
            value: props.visibility,
          }),
          iconActionButton(props.runtime, {
            action: "toggleCommentPreview",
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "eye",
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
      View(
        {
          class: "memo-comments-title",
          attributes: { n: "memo-comments-title" },
        },
        [
          View({ as: "span", attributes: { n: "memo-comments-title-label" } }, [
            "评论",
          ]),
          Show({
            when: reactiveWhen(props.comments.length),
            ok() {
              return View(
                { as: "strong", attributes: { n: "memo-comments-count" } },
                [
                  props.comments.length,
                ],
              );
            },
          }),
        ],
      ),
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
              memoIcon("chevron-down", "memo-comments-toggle-icon"),
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
          });
        },
      }),
    ],
  );
}

function MemoMoreMenuView(props) {
  const { Button, View } = props.runtime;
  function item(action, icon_name, label, danger) {
    const class_name_ = computed(
      reactiveWhen(danger),
      function (is_danger) {
        if (is_danger) return "tn-menu__item memo-card-more-item is-danger";
        return "tn-menu__item memo-card-more-item";
      },
    );
    return Button(
      {
        class: class_name_,
        attributes: {
          "data-action": action,
          n: "memo-more-" + action,
          role: "menuitem",
          type: "button",
        },
      },
      [
        memoIcon(icon_name, "memo-more-" + action + "-icon"),
        View(
          { as: "span", attributes: { n: "memo-more-" + action + "-label" } },
          [label],
        ),
      ],
    );
  }
  return View(
    {
      class:
        "tn-popup tn-popup--menu tn-menu tn-dropdown-menu memo-card-more-menu",
      id: props.menuId,
      attributes: {
        "aria-label": "Memo 更多操作",
        "data-memo-id": props.memo.id,
        "data-memo-more-menu": "true",
        n: "memo-more-menu",
        role: "menu",
      },
      hidden: !props.memo.moreOpen,
    },
    [
      item("detachMemoEdit", "external-link", "在独立窗口中编辑"),
      item("editMemoSource", "code", "编辑源数据"),
      Show({
        when: reactiveWhen(props.memo.hasHistory),
        ok() {
          return item("openMemoHistory", "history", "版本历史");
        },
      }),
      View(
        {
          class: "tn-menu__separator memo-card-more-separator",
          attributes: { n: "memo-more-separator", role: "separator" },
        },
        [],
      ),
      Show({
        when: reactiveWhen(props.memo.archived),
        ok() {
          return item("restoreMemo", "undo2", "恢复 Memo");
        },
        else() {
          return item("archiveMemo", "archive", "归档 Memo");
        },
      }),
      item("deleteMemo", "trash2", "删除 Memo", true),
    ],
  );
}

export function MemoCardView(props) {
  const memo = props.memo;
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, RichText, View } = runtime;

  return Show({
    when: reactiveWhen(memo.error),
    ok() {
      return View(
        {
          as: "article",
          class: "memo-card is-archived",
          attributes: { "data-memo-id": memo.id, n: "memo-card-error" },
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
      const menu_id = "memo-more-menu-" + memo.id;
      let toc_label = "显示目录";
      let pin_icon = "pin";
      let pin_label = "置顶";
      let pin_pressed = "false";
      if (memo.tocVisible) toc_label = "隐藏目录";
      if (memo.pinned) {
        pin_icon = "unpin";
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
      const more_class_ = computed(
        reactiveWhen(memo.moreOpen),
        function (open) {
          if (open) return "memo-card-more is-open";
          return "memo-card-more";
        },
      );
      const more_expanded_ = computed(
        reactiveWhen(memo.moreOpen),
        function (open) {
          if (open) return "true";
          return "false";
        },
      );
      return View(
        {
          as: "article",
          class: memo.className,
          attributes: { "data-memo-id": memo.id, n: "memo-card" },
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
                          memoIcon(
                            memo.visibility.icon,
                            "memo-card-visibility-icon",
                          ),
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
                projects: props.projects || [],
                runtime,
                visibility: memo.editVisibility,
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
                                  memoIcon("chevron-down", "memo-expand-icon"),
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
                    action: "copyMemoRef",
                    icon: "link",
                    label: "复制引用",
                    meaning: "memo-copy-reference-button",
                  }),
                  iconActionButton(runtime, {
                    action: "commentMemo",
                    count: memo.commentCount,
                    icon: "comment",
                    label: "评论",
                    meaning: "memo-comment-button",
                  }),
                  iconActionButton(runtime, {
                    action: "editMemo",
                    icon: "edit",
                    label: "编辑",
                    meaning: "memo-edit-button",
                  }),
                  View(
                    {
                      class: more_class_,
                      attributes: {
                        "data-memo-id": memo.id,
                        "data-memo-more": "true",
                        n: "memo-more-control",
                      },
                    },
                    [
                      iconActionButton(runtime, {
                        action: "toggleMemoMore",
                        controls: menu_id,
                        expanded: more_expanded_,
                        hasPopup: "menu",
                        icon: "ellipsis",
                        label: "更多操作",
                        meaning: "memo-more-button",
                      }),
                      MemoMoreMenuView({ menuId: menu_id, memo, runtime }),
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

export function MemoFeedView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Fragment, View } = runtime;
  return Show({
    when: reactiveWhen(!props.memos?.length),
    ok() {
      return View(
        { class: "memo-empty-state", attributes: { n: "memo-feed-empty" } },
        [
          View(
            {
              class: "memo-empty-icon",
              attributes: { n: "memo-feed-empty-icon" },
            },
            [memoIcon("search", "memo-feed-empty-symbol")],
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
          each: props.memos,
          render(memo) {
            return MemoCardView({ memo, projects: props.projects, runtime });
          },
        }),
        Show({
          when: reactiveWhen(props.hasMore),
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
                      icon: "unpin",
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
                        memoIcon("chevron-down", "memo-pinned-expand-icon"),
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
  const { Button, RichText, View } = runtime;
  return View(
    {
      class: "tn-dialog tn-dialog--md memo-dialog-panel",
      style: { "max-width": "680px" },
      attributes: { n: "source-memo-dialog-panel" },
    },
    [
      View(
        {
          class: "memo-dialog-head",
          attributes: { n: "source-memo-dialog-header" },
        },
        [
          View({ as: "h2", attributes: { n: "source-memo-dialog-title" } }, [
            "来源 Memo",
          ]),
          Button(
            {
              class:
                "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: {
                "data-source-memo-dialog-close": "true",
                n: "source-memo-dialog-close",
                title: "关闭",
                type: "button",
              },
            },
            [memoIcon("x", "source-memo-dialog-close-icon")],
          ),
        ],
      ),
      View(
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
        memoIcon(icon_name, "memo-dialog-" + name + "-icon"),
        View(
          { as: "span", attributes: { n: "memo-dialog-" + name + "-label" } },
          [label],
        ),
      ],
    );
  }
  return View(
    {
      as: "section",
      class:
        "tn-dialog tn-dialog--md memo-dialog-panel memo-comment-dialog-panel",
      attributes: {
        "aria-labelledby": "memo-dialog-title",
        "aria-modal": "true",
        n: "memo-dialog-panel",
        role: "dialog",
      },
    },
    [
      View(
        {
          as: "header",
          class: "memo-dialog-head",
          attributes: { n: "memo-dialog-header" },
        },
        [
          View({ attributes: { n: "memo-dialog-heading" } }, [
            View(
              {
                as: "h2",
                attributes: { id: "memo-dialog-title", n: "memo-dialog-title" },
              },
              [props.title],
            ),
            Show({
              when: reactiveWhen(props.description),
              ok() {
                return View(
                  { as: "p", attributes: { n: "memo-dialog-description" } },
                  [props.description],
                );
              },
            }),
          ]),
          Button(
            {
              class:
                "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: {
                "aria-label": "关闭",
                "data-memo-dialog-action": "close",
                n: "memo-dialog-close-button",
                title: "关闭",
                type: "button",
              },
            },
            [memoIcon("x", "memo-dialog-close-icon")],
          ),
        ],
      ),
      View(
        { class: "memo-dialog-body", attributes: { n: "memo-dialog-body" } },
        [
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
      View(
        {
          as: "footer",
          class: "memo-dialog-actions",
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
            "eye",
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
      [memoIcon(icon_name, meaning + "-icon")],
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
                [memoIcon("pin", "detached-memo-fixed-icon")],
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
                [memoIcon("search", "detached-memo-find-symbol")],
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
            [memoIcon("eye", "detached-comment-preview-toggle-icon")],
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
            [memoIcon("send", "detached-comment-submit-icon")],
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
      SearchPaletteView({ runtime }),
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
          return memoIcon(
            props.icon,
            "detached-comment-" + props.action + "-icon",
          );
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
  const { Button, For, View } = props.runtime;
  const active = new Set(props.comment.reactions || []);
  return View(
    {
      as: "span",
      class: "memo-comment-reaction-wrap memo-reactions-add-wrap",
      attributes: { n: "detached-comment-reaction-control" },
    },
    [
      detachedCommentAction(props.runtime, {
        action: "toggleCommentReactions",
        icon: "smile",
        label: "添加反应",
      }),
      View(
        {
          class: "memo-reactions-picker",
          attributes: {
            "data-reactions-picker": "true",
            n: "detached-comment-reaction-picker",
          },
          hidden: true,
        },
        [
          For({
            each: REACTIONS,
            render(emoji) {
              const class_name_ = computed(
                reactiveWhen(active.has(emoji)),
                function (selected) {
                  if (selected) return "memo-picker-emoji is-active";
                  return "memo-picker-emoji";
                },
              );
              return Button(
                {
                  class: class_name_,
                  attributes: {
                    "data-action": "pickCommentReaction",
                    "data-comment-id": props.comment.id,
                    "data-emoji": emoji,
                    n: "detached-comment-reaction-option",
                    type: "button",
                  },
                },
                [emoji],
              );
            },
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
                    icon: "eye",
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
                          icon: "reply",
                          label: "回复",
                        }),
                        detachedCommentAction(props.runtime, {
                          action: "edit",
                          icon: "edit",
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
                  meaning: "detached-memo",
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
                    icon: "edit",
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
                    icon: "link",
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
  const { Button, Input, View } = runtime;
  const is_set = props.mode === "set";
  return View(
    {
      class: "pin-dialog-backdrop",
      attributes: {
        "data-pin-backdrop": "true",
        n: "memo-pin-dialog-backdrop",
      },
    },
    [
      View({ class: "pin-dialog-card", attributes: { n: "memo-pin-dialog" } }, [
        View(
          {
            as: "h2",
            class: "pin-dialog-title",
            attributes: { n: "memo-pin-dialog-title" },
          },
          [
            Show({
              when: reactiveWhen(is_set),
              ok() {
                return "设置隐私 PIN";
              },
              else() {
                return "输入 PIN 解锁";
              },
            }),
          ],
        ),
        View(
          {
            as: "p",
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
        View(
          {
            class: "pin-dialog-actions",
            attributes: { n: "memo-pin-dialog-actions" },
          },
          [
            Button(
              {
                class: "tn-button tn-button--secondary memo-secondary-button",
                attributes: {
                  "data-action": "cancelPinDialog",
                  n: "memo-pin-cancel",
                  type: "button",
                },
              },
              ["取消"],
            ),
            Button(
              {
                class: "tn-button tn-button--primary memo-primary-button",
                attributes: {
                  "data-action": "submitPin",
                  n: "memo-pin-submit",
                  type: "button",
                },
              },
              [
                Show({
                  when: reactiveWhen(is_set),
                  ok() {
                    return "设置";
                  },
                  else() {
                    return "解锁";
                  },
                }),
              ],
            ),
          ],
        ),
      ]),
    ],
  );
}

export function InlinePromptView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  return runtime.Fragment({}, [
    View(
      {
        class: "memo-inline-prompt-title",
        attributes: { n: "memo-inline-prompt-title" },
      },
      [props.title],
    ),
    Input({
      class: "memo-inline-prompt-input",
      type: "text",
      value: props.value,
      attributes: { n: "memo-inline-prompt-input", type: "text" },
    }),
    View(
      {
        class: "memo-inline-prompt-buttons",
        attributes: { n: "memo-inline-prompt-actions" },
      },
      [
        Button(
          {
            class: "memo-inline-prompt-cancel",
            attributes: { n: "memo-inline-prompt-cancel", type: "button" },
          },
          ["取消"],
        ),
        Button(
          {
            class: "memo-inline-prompt-ok",
            attributes: { n: "memo-inline-prompt-confirm", type: "button" },
          },
          ["确认"],
        ),
      ],
    ),
  ]);
}

export function SourceEditDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, Input, Select, View } = runtime;
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
  function checkbox(name, checked) {
    return View(
      {
        class: "memo-form-field",
        attributes: { n: "source-edit-" + name + "-field" },
      },
      [
        View(
          { as: "label", attributes: { n: "source-edit-" + name + "-label" } },
          [
            Checkbox({
              checked,
              attributes: {
                "data-source-edit-field": "true",
                n: "source-edit-" + name + "-input",
                name,
              },
            }),
            " " + name,
          ],
        ),
      ],
    );
  }
  return View(
    {
      class: "tn-dialog tn-dialog--md memo-dialog-panel",
      style: { "max-width": "520px" },
      attributes: { n: "source-edit-dialog-panel" },
    },
    [
      View(
        {
          class: "memo-dialog-head",
          attributes: { n: "source-edit-dialog-header" },
        },
        [
          View({ as: "h2", attributes: { n: "source-edit-dialog-title" } }, [
            "编辑源数据",
          ]),
          Button(
            {
              class:
                "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: {
                "data-source-edit-dialog-close": "true",
                n: "source-edit-dialog-close",
                title: "关闭",
                type: "button",
              },
            },
            [memoIcon("x", "source-edit-dialog-close-icon")],
          ),
        ],
      ),
      View(
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
                Select({
                  attributes: {
                    "data-source-edit-field": "true",
                    n: "source-edit-visibility-select",
                    name: "visibility",
                  },
                  options: props.visibilityOptions,
                  placeholder: "可见性",
                  value: props.visibility,
                }),
                "source-edit-visibility-field",
              ),
              checkbox("private", props.private),
              checkbox("pinned", props.memo.pinned),
              checkbox("archived", props.memo.archived),
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
              View(
                {
                  class: "memo-dialog-actions",
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
                      memoIcon("external-link", "source-edit-open-file-icon"),
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
                        "data-source-edit-dialog-close": "true",
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
