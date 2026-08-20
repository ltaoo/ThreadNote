import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";

const FILTERS = Object.freeze([
  { icon: "hash", id: "all", label: "全部" },
  { icon: "pin", id: "pinned", label: "置顶" },
  { icon: "lock", id: "private", label: "仅自己" },
  { icon: "globe", id: "public", label: "公开" },
  { icon: "archive", id: "archive", label: "归档" },
]);

const COLLECTIONS = Object.freeze([
  { count: "data-todo-nav-count", icon: "check", id: "todos", label: "代办" },
  { count: "data-item-nav-count", icon: "hash", id: "items", label: "事项" },
  { count: "data-milestone-nav-count", icon: "clock", id: "milestones", label: "里程碑" },
  { count: "data-link-nav-count", icon: "link", id: "links", label: "超链接" },
  { count: "data-code-nav-count", icon: "code", id: "codeblocks", label: "代码片段" },
  { count: "data-file-nav-count", icon: "paperclip", id: "files", label: "文件" },
  { count: "data-image-nav-count", icon: "image", id: "images", label: "图片" },
  { count: "data-clipboard-nav-count", icon: "copy", id: "clipboard", label: "粘贴板" },
  { count: "data-board-nav-count", icon: "columns", id: "boards", label: "看板" },
  { count: "data-rules-nav-count", icon: "workflow", id: "rules", label: "流程配置" },
  { count: "data-chat-nav-count", icon: "comment", id: "chat", label: "Chat" },
]);

const EDITOR_TOOLS = Object.freeze([
  { command: "bold", icon: "bold", label: "粗体" },
  { command: "italic", icon: "italic", label: "斜体" },
  { command: "code", icon: "code", label: "代码" },
  { command: "list", icon: "list", label: "列表" },
  { command: "checklist", icon: "check", label: "任务" },
  { command: "tag", icon: "hash", label: "标签" },
  { command: "link", icon: "link", label: "链接" },
  { command: "image", icon: "image", label: "图片" },
  { command: "attach", icon: "paperclip", label: "附件" },
  { command: "date", icon: "clock", label: "时间" },
]);

export function memoIcon(name, meaning) {
  return Timeless.Icon({ name, attributes: { n: meaning } });
}

function navButton(runtime, item, index) {
  const count_attributes = item.count ? { [item.count]: "true" } : {};
  return runtime.Button(
    {
      class: "memo-nav-button",
      attributes: {
        ...count_attributes,
        "data-filter": item.filter,
        "data-view": item.view,
        n: "memo-navigation-" + item.id,
        type: "button",
      },
    },
    [
      memoIcon(item.icon, "memo-navigation-" + item.id + "-icon"),
      runtime.View(
        { as: "span", attributes: { n: "memo-navigation-" + item.id + "-label" } },
        [item.label],
      ),
      item.id === "all"
        ? runtime.View(
            {
              as: "strong",
              attributes: { "data-all-nav-count": "true", n: "all-memo-count" },
            },
            [],
          )
        : item.count
          ? runtime.View(
              {
                as: "strong",
                attributes: { [item.count]: "true", n: "memo-navigation-" + item.id + "-count" },
              },
              [],
            )
          : null,
    ],
  );
}

function topbarAction(runtime, action, icon_name, label, meaning) {
  return runtime.Button(
    {
      class: "tn-button memo-icon-text-button",
      attributes: {
        "data-action": action,
        n: meaning,
        title: label,
        type: "button",
      },
    },
    [
      memoIcon(icon_name, meaning + "-icon"),
      runtime.View({ as: "span", attributes: { n: meaning + "-label" } }, [label]),
    ],
  );
}

function editorToolButton(runtime, tool) {
  return runtime.Button(
    {
      class: "memo-tool-button",
      attributes: {
        "aria-label": tool.label,
        "data-editor-command": tool.command,
        n: "memo-composer-" + tool.command + "-button",
        title: tool.label,
        type: "button",
      },
    },
    [memoIcon(tool.icon, "memo-composer-" + tool.command + "-icon")],
  );
}

function projectSelect(runtime, meaning, data_attribute) {
  return runtime.Select({
    attributes: {
      "aria-label": "Project",
      [data_attribute]: "true",
      n: meaning,
    },
    options: [{ label: "未归属", value: "" }],
    placeholder: "未归属",
    value: "",
  });
}

function visibilitySelect(runtime) {
  const options = [
    { label: "仅自己", value: "PRIVATE" },
    { label: "公开", value: "PUBLIC" },
  ];
  return runtime.Select({
    attributes: {
      "aria-label": "可见性",
      "data-visibility-select": "true",
      n: "memo-composer-visibility-select",
    },
    options,
    placeholder: "可见性",
    value: "PRIVATE",
  });
}

export function MemoWorkspaceShellView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Img, Input, View } = runtime;
  return View(
    { class: "memo-shell", attributes: { n: "memo-workspace-shell" } },
    [
      View(
        {
          as: "aside",
          class: "memo-sidebar",
          attributes: { "aria-label": "Memo navigation", n: "home-sidebar" },
        },
        [
          View(
            { class: "memo-sidebar-scroll", attributes: { n: "home-sidebar-scroll-content" } },
            [
              View(
                { class: "memo-brand", attributes: { n: "memo-brand" } },
                [
                  View(
                    { class: "memo-brand-mark", attributes: { n: "memo-brand-mark" } },
                    [
                      Img({ attributes: { alt: "", n: "memo-brand-logo", src: "/public/threadnote-logo.svg" } }),
                    ],
                  ),
                  View(
                    { attributes: { n: "memo-brand-copy" } },
                    [
                      View({ class: "memo-brand-title", attributes: { n: "memo-brand-title" } }, ["ThreadNote"]),
                      View({ class: "memo-brand-subtitle", attributes: { n: "memo-brand-subtitle" } }, ["Local workspace"]),
                    ],
                  ),
                ],
              ),
              View(
                { as: "nav", class: "memo-nav", attributes: { "aria-label": "Memo filters", n: "memo-filter-navigation" } },
                [
                  For({
                    each: FILTERS,
                    render(item, index) {
                      return navButton(runtime, { ...item, filter: item.id }, index);
                    },
                  }),
                ],
              ),
              View(
                { class: "memo-sidebar-section", attributes: { n: "memo-project-navigation-section" } },
                [
                  View(
                    { class: "memo-sidebar-heading", attributes: { n: "memo-project-navigation-heading" } },
                    [
                      View({ as: "span", attributes: { n: "memo-project-navigation-title" } }, ["Projects"]),
                      Button(
                        {
                          class: "memo-project-create-btn",
                          attributes: {
                            "aria-label": "新建 Project",
                            "data-action": "createProject",
                            n: "sidebar-project-create",
                            title: "新建 Project",
                            type: "button",
                          },
                        },
                        [memoIcon("plus", "memo-project-create-icon")],
                      ),
                    ],
                  ),
                  View(
                    { class: "memo-project-list", attributes: { "data-project-list": "true", n: "memo-project-list" } },
                    [],
                  ),
                ],
              ),
              View(
                { class: "memo-sidebar-section", attributes: { n: "memo-collection-navigation-section" } },
                [
                  View(
                    { class: "memo-sidebar-heading", attributes: { n: "memo-collection-navigation-heading" } },
                    [View({ as: "span", attributes: { n: "memo-collection-navigation-title" } }, ["聚合"])],
                  ),
                  View(
                    {
                      as: "nav",
                      class: "memo-nav memo-collection-nav",
                      attributes: { "aria-label": "Memo collections", n: "memo-collection-navigation" },
                    },
                    [
                      For({
                        each: COLLECTIONS,
                        render(item, index) {
                          return navButton(runtime, { ...item, view: item.id }, index);
                        },
                      }),
                    ],
                  ),
                ],
              ),
              View(
                { class: "memo-sidebar-section", attributes: { n: "memo-tag-navigation-section" } },
                [
                  View(
                    { class: "memo-sidebar-heading", attributes: { n: "memo-tag-navigation-heading" } },
                    [
                      View({ as: "span", attributes: { n: "memo-tag-navigation-title" } }, ["标签"]),
                      View(
                        { as: "span", attributes: { "data-tag-summary": "true", n: "memo-tag-summary" } },
                        [],
                      ),
                    ],
                  ),
                  View(
                    { class: "memo-tag-list", attributes: { "data-tag-list": "true", n: "memo-tag-list" } },
                    [],
                  ),
                ],
              ),
            ],
          ),
          View(
            { class: "memo-sidebar-footer", attributes: { n: "home-sidebar-footer" } },
            [
              Button(
                {
                  class: "memo-nav-button memo-settings-button",
                  attributes: {
                    "data-action": "openSettings",
                    n: "home-sidebar-settings",
                    type: "button",
                  },
                },
                [
                  memoIcon("settings", "home-sidebar-settings-icon"),
                  View({ as: "span", attributes: { n: "home-sidebar-settings-label" } }, ["设置"]),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        { as: "main", class: "memo-main", attributes: { n: "memo-main" } },
        [
          View(
            { as: "header", class: "memo-topbar", attributes: { n: "memo-topbar" } },
            [
              View(
                { class: "memo-topbar-copy", attributes: { n: "memo-topbar-copy" } },
                [
                  View(
                    { class: "memo-topbar-eyebrow", attributes: { "data-main-eyebrow": "true", n: "memo-main-eyebrow" } },
                    ["THREAD / INBOX"],
                  ),
                  View({ as: "h1", attributes: { "data-main-title": "true", n: "memo-main-title" } }, ["Inbox"]),
                  View(
                    { as: "p", attributes: { "data-main-subtitle": "true", n: "memo-main-subtitle" } },
                    ["捕捉、整理、回看"],
                  ),
                ],
              ),
              View(
                { class: "memo-topbar-actions", attributes: { n: "memo-topbar-actions" } },
                [
                  View(
                    { as: "span", attributes: { "data-topbar-default-actions": "true", n: "memo-topbar-default-actions" } },
                    [
                      topbarAction(runtime, "openTimeline", "clock", "时间线", "memo-open-timeline-button"),
                      topbarAction(runtime, "openSlimMemos", "list", "精简版", "memo-open-slim-button"),
                      topbarAction(runtime, "openSlimGTD", "check", "代办", "memo-open-gtd-button"),
                      topbarAction(runtime, "sortMemos", "list-filter", "排序", "memo-sort-button"),
                    ],
                  ),
                  View(
                    {
                      as: "span",
                      attributes: { "data-topbar-project-actions": "true", n: "memo-topbar-project-actions" },
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
              as: "section",
              class: "memo-composer",
              attributes: { "aria-label": "Create memo", "data-composer": "true", n: "memo-composer" },
            },
            [
              View(
                { class: "memo-composer-head", attributes: { n: "memo-composer-header" } },
                [
                  View(
                    {
                      class: "memo-tool-group memo-tool-group-head",
                      attributes: { "aria-label": "命令", n: "memo-composer-tools" },
                    },
                    [
                      For({
                        each: EDITOR_TOOLS,
                        render(tool) {
                          return editorToolButton(runtime, tool);
                        },
                      }),
                    ],
                  ),
                  View(
                    { class: "memo-select-wrap", attributes: { n: "memo-composer-project-control" } },
                    [
                      View(
                        { as: "span", class: "memo-select-icon", attributes: { n: "memo-composer-project-icon" } },
                        [memoIcon("hash", "memo-composer-project-symbol")],
                      ),
                      projectSelect(runtime, "memo-composer-project-select", "data-project-select"),
                    ],
                  ),
                  View(
                    { as: "span", class: "memo-visibility-group", attributes: { n: "memo-composer-visibility-group" } },
                    [
                      View(
                        { class: "memo-select-wrap", attributes: { n: "memo-composer-visibility-control" } },
                        [
                          View(
                            { as: "span", class: "memo-select-icon", attributes: { n: "memo-composer-visibility-icon" } },
                            [memoIcon("lock", "memo-composer-visibility-symbol")],
                          ),
                          visibilitySelect(runtime),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              View(
                { class: "memo-editor-switch memo-composer-switch", attributes: { n: "memo-composer-editor-switch" } },
                [
                  View(
                    {
                      class: "memo-editor-host",
                      attributes: {
                        "data-composer-host": "true",
                        "data-editor-switch-host": "true",
                        n: "memo-composer-editor-host",
                      },
                    },
                    [],
                  ),
                  View(
                    {
                      as: "section",
                      class: "memo-editor-preview memo-composer-preview",
                      attributes: { "data-composer-preview": "true", n: "memo-composer-preview" },
                      hidden: true,
                    },
                    [],
                  ),
                ],
              ),
              View(
                { class: "memo-composer-toolbar", attributes: { n: "memo-composer-toolbar" } },
                [
                  View(
                    { class: "memo-composer-status-line", attributes: { n: "memo-composer-status-line" } },
                    [
                      View({ as: "span", attributes: { "data-composer-vim-status": "true", n: "memo-composer-vim-status" } }, []),
                      View({ as: "span", attributes: { "data-composer-status": "true", n: "memo-composer-status" } }, []),
                    ],
                  ),
                  View(
                    { class: "memo-composer-actions", attributes: { n: "memo-composer-actions" } },
                    [
                      View(
                        {
                          as: "span",
                          class: "memo-composer-draft-status",
                          attributes: {
                            "aria-live": "polite",
                            "data-composer-draft-status": "true",
                            n: "memo-composer-draft-status",
                            role: "status",
                          },
                          hidden: true,
                        },
                        ["已存草稿"],
                      ),
                      Button(
                        {
                          class: "tn-button tn-button--secondary memo-secondary-button",
                          attributes: {
                            "aria-pressed": "false",
                            "data-action": "toggleComposerPreview",
                            n: "memo-composer-preview-button",
                            type: "button",
                          },
                        },
                        [
                          memoIcon("eye", "memo-composer-preview-icon"),
                          View({ as: "span", attributes: { n: "memo-composer-preview-label" } }, ["预览"]),
                        ],
                      ),
                      Button(
                        {
                          class: "tn-button tn-button--primary memo-primary-button",
                          attributes: { "data-action": "createMemo", n: "memo-create-button", type: "button" },
                        },
                        [
                          memoIcon("send", "memo-create-icon"),
                          View({ as: "span", attributes: { n: "memo-create-label" } }, ["发布"]),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              Input({
                class: "memo-hidden-input",
                type: "file",
                attributes: { "data-attach-input": "true", multiple: "multiple", n: "memo-attachment-input", type: "file" },
              }),
            ],
          ),
          View(
            { as: "section", class: "memo-feed-tools", attributes: { "aria-label": "Memo search", n: "memo-feed-tools" } },
            [
              View(
                { as: "label", class: "memo-search", attributes: { n: "memo-search-control" } },
                [
                  memoIcon("search", "memo-search-icon"),
                  Input({
                    type: "search",
                    placeholder: "搜索 memos",
                    attributes: { "data-search-input": "true", n: "memo-search-input", type: "search" },
                  }),
                ],
              ),
              View(
                { class: "memo-select-wrap memo-project-filter-wrap", attributes: { n: "memo-project-filter-control" } },
                [
                  View(
                    { as: "span", class: "memo-select-icon", attributes: { n: "memo-project-filter-icon" } },
                    [memoIcon("hash", "memo-project-filter-symbol")],
                  ),
                  projectSelect(runtime, "memo-project-filter-select", "data-project-filter-select"),
                ],
              ),
              runtime.Checkbox({
                class: "memo-code-blocks-show-all",
                attributes: {
                  "aria-label": "查看全部代码块",
                  "data-code-blocks-show-all": "true",
                  hidden: "hidden",
                  n: "code-snippet-show-all-checkbox",
                },
              }),
              Button(
                {
                  class: "tn-button tn-button--ghost memo-clear-button",
                  attributes: { "data-action": "clearFilters", n: "memo-clear-filters-button", type: "button" },
                },
                ["重置"],
              ),
            ],
          ),
          View(
            {
              as: "section",
              class: "memo-list",
              attributes: { "aria-label": "Memo list", "data-memo-list": "true", n: "memo-list" },
            },
            [],
          ),
        ],
      ),
      View(
        { as: "aside", class: "memo-inspector", attributes: { "aria-label": "Memo details", n: "memo-inspector" } },
        [
          View(
            { as: "section", class: "memo-inspector-section memo-inspector-section--calendar", attributes: { n: "memo-calendar-section" } },
            [View({ class: "tn-w-full", attributes: { "data-calendar": "true", n: "memo-calendar" } }, [])],
          ),
          View(
            { as: "section", class: "memo-inspector-section", attributes: { n: "memo-pinned-section" } },
            [
              View({ class: "memo-inspector-title", attributes: { n: "memo-pinned-title" } }, ["置顶"]),
              View({ class: "memo-pinned-list", attributes: { "data-pinned-list": "true", n: "memo-pinned-list" } }, []),
            ],
          ),
        ],
      ),
      SearchPaletteView({ runtime }),
      View(
        {
          as: "section",
          class: "memo-clipboard-card",
          attributes: { "data-clipboard-card": "true", n: "memo-clipboard-card" },
          hidden: true,
        },
        [],
      ),
      View(
        { class: "memo-toast", attributes: { "data-toast": "true", n: "memo-toast", role: "status" } },
        [],
      ),
    ],
  );
}

export function SearchPaletteView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Input, View } = runtime;
  return View(
    {
      class: "memo-command-palette",
      attributes: { "data-memo-search-palette": "true", n: "memo-search-palette" },
      hidden: true,
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
            { as: "label", class: "memo-command-search", attributes: { n: "memo-search-field" } },
            [
              memoIcon("search", "memo-search-field-icon"),
              Input({
                type: "search",
                placeholder: "搜索 memo / 评论 / 代办",
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
              attributes: { "data-memo-search-results": "true", n: "memo-search-results", role: "listbox" },
            },
            [],
          ),
        ],
      ),
    ],
  );
}

export function ImageContextMenuView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;
  function option(action, icon_name, label) {
    return Button(
      {
        class: "tn-menu__item memo-image-context-option",
        attributes: {
          "data-image-context-action": action,
          n: "memo-image-context-" + action,
          role: "menuitem",
          type: "button",
        },
      },
      [
        memoIcon(icon_name, "memo-image-context-" + action + "-icon"),
        View({ as: "span", attributes: { n: "memo-image-context-" + action + "-label" } }, [label]),
      ],
    );
  }
  return runtime.Fragment({}, [
    option("copy", "copy", "复制图片"),
    option("preview", "image", "预览图片"),
  ]);
}

export function ClipboardCardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Img, View } = runtime;
  if (!props.item) return null;
  return runtime.Fragment({}, [
    View(
      { as: "header", class: "memo-clipboard-head", attributes: { n: "memo-clipboard-header" } },
      [
        View(
          { as: "span", class: "memo-clipboard-type", attributes: { n: "memo-clipboard-type" } },
          [props.typeLabel],
        ),
        Button(
          {
            class: "memo-clipboard-close",
            attributes: {
              "aria-label": "关闭",
              "data-action": "clipboardDismiss",
              n: "memo-clipboard-close-button",
              title: "关闭",
              type: "button",
            },
          },
          [memoIcon("x", "memo-clipboard-close-icon")],
        ),
      ],
    ),
    props.item.type === "image" && props.item.dataURL
      ? Img({ class: "memo-clipboard-image", attributes: { alt: "Clipboard image preview", n: "memo-clipboard-image", src: props.item.dataURL } })
      : View(
          { as: "p", class: "memo-clipboard-text", attributes: { n: "memo-clipboard-text" } },
          [props.preview],
        ),
    View(
      { as: "footer", class: "memo-clipboard-actions", attributes: { n: "memo-clipboard-actions" } },
      [
        Button(
          {
            class: "tn-button tn-button--secondary memo-secondary-button",
            attributes: { "data-action": "clipboardDismiss", n: "memo-clipboard-ignore-button", type: "button" },
          },
          ["忽略"],
        ),
        Button(
          {
            class: "tn-button tn-button--primary memo-primary-button",
            attributes: { "data-action": "clipboardAccept", n: "memo-clipboard-accept-button", type: "button" },
            disabled: props.working,
          },
          [props.actionLabel],
        ),
      ],
    ),
  ]);
}

function highlightedPartsView(runtime, parts, meaning) {
  return runtime.Fragment({}, [
    runtime.For({
      each: Array.isArray(parts) ? parts : [],
      render(part) {
        return part && part.matched
          ? runtime.View(
              { as: "mark", class: "memo-command-match", attributes: { n: meaning + "-match" } },
              [String(part.text || "")],
            )
          : String(part?.text || "");
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
        return Button(
          {
            class: "memo-command-result" + (active ? " is-active" : ""),
            attributes: {
              "aria-selected": active ? "true" : "false",
              "data-memo-search-result": result.key,
              n: "memo-search-result",
              role: "option",
              type: "button",
            },
          },
          [
            View(
              { as: "span", class: "memo-command-result-title", attributes: { n: "memo-search-result-title" } },
              [
                View(
                  { as: "span", class: "memo-command-result-kind", attributes: { n: "memo-search-result-kind" } },
                  [result.kindLabel],
                ),
                highlightedPartsView(runtime, result.titleParts, "memo-search-result-title"),
              ],
            ),
            View(
              { as: "span", class: "memo-command-result-summary", attributes: { n: "memo-search-result-summary" } },
              [highlightedPartsView(runtime, result.summaryParts, "memo-search-result-summary")],
            ),
            View(
              { as: "span", class: "memo-command-result-meta", attributes: { n: "memo-search-result-meta" } },
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
      { class: "memo-editor-preview-empty", attributes: { n: props.meaning + "-empty" } },
      [props.emptyLabel || "暂无预览内容"],
    );
  }
  return View(
    { class: "memo-content", attributes: { n: props.meaning + "-content" } },
    [RichText({ attributes: { n: props.meaning + "-rich-text" }, content: props.html })],
  );
}

export function ProjectListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.projects?.length) {
    return View(
      { class: "memo-sidebar-empty", attributes: { n: "memo-project-list-empty" } },
      ["暂无 Project"],
    );
  }
  return runtime.Fragment({}, [
    For({
      each: props.projects,
      render(project) {
        return Button(
          {
            class: "memo-nav-button memo-project-item" + (project.active ? " is-active" : ""),
            attributes: {
              "data-project-detail": project.id,
              n: "memo-project-navigation-item",
              type: "button",
            },
          },
          [
            View(
              {
                as: "span",
                class: "memo-project-dot",
                style: { "--project-color": project.color },
                attributes: { n: "memo-project-navigation-color" },
              },
              [],
            ),
            View(
              { as: "span", attributes: { n: "memo-project-navigation-name" } },
              [project.name],
            ),
            View(
              { as: "strong", attributes: { n: "memo-project-navigation-count" } },
              [project.count],
            ),
          ],
        );
      },
    }),
  ]);
}

export function ProjectOptionsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Fragment, SelectOption } = runtime;
  const base_options = Array.isArray(props.baseOptions)
    ? props.baseOptions
    : [{ count: null, kind: "unassigned", label: "未归属", value: "" }];
  return Fragment({}, [
    For({
      each: base_options.concat(props.projects || []),
      render(option) {
        return SelectOption({ label: option.label, value: option.value });
      },
    }),
  ]);
}

export function TagListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.tags?.length) {
    return View({ class: "memo-empty-mini", attributes: { n: "memo-tag-list-empty" } }, ["暂无标签"]);
  }
  return runtime.Fragment({}, [
    For({
      each: props.tags,
      render(item) {
        return Button(
          {
            class: "memo-tag-filter" + (item.active ? " is-active" : ""),
            attributes: { "data-tag": item.tag, n: "memo-tag-filter", type: "button" },
          },
          [
            View({ as: "span", attributes: { n: "memo-tag-filter-label" } }, ["#" + item.tag]),
            View({ as: "span", attributes: { n: "memo-tag-filter-count" } }, [item.count]),
          ],
        );
      },
    }),
  ]);
}

export function EmptyStateView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  return runtime.View(
    {
      class: props.class || "memo-empty-state",
      attributes: { n: props.meaning || "memo-empty-state" },
    },
    [String(props.message || "")],
  );
}

export function ProjectActionsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;
  const action = function (name, label, meaning) {
    return Button(
      {
        class: "tn-button memo-icon-text-button",
        attributes: {
          "data-action": name,
          "data-project-id": props.projectId,
          n: meaning,
          type: "button",
        },
      },
      [label],
    );
  };
  return View(
    { class: "memo-project-topbar-actions", attributes: { n: "project-detail-actions" } },
    [
      action("editProject", "编辑", "project-edit-button"),
      action("createProjectBoard", "从模板创建看板", "project-create-board-button"),
      action("archiveProject", "归档", "project-archive-button"),
    ],
  );
}

export function ProjectDetailView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  const active_tab = props.activeTab || "memos";
  const tab = function (id, label, count) {
    return Button(
      {
        class: "memo-project-tab" + (active_tab === id ? " is-active" : ""),
        attributes: { "data-project-tab": id, n: "project-" + id + "-tab", type: "button" },
      },
      [
        label,
        View({ as: "span", class: "memo-project-tab-count", attributes: { n: "project-" + id + "-tab-count" } }, [count]),
      ],
    );
  };
  const panel = function (id, children, extra_attributes = {}) {
    return View(
      {
        class: "memo-project-tab-panel" + (active_tab === id ? "" : " hidden"),
        attributes: { ...extra_attributes, "data-project-tab-panel": id, n: "project-" + id + "-panel" },
      },
      children,
    );
  };
  return runtime.Fragment({}, [
    View(
      { class: "memo-project-detail", attributes: { "data-project-id": props.projectId, n: "project-detail" } },
      [
        View(
          { class: "memo-project-tabs", attributes: { n: "project-detail-tabs" } },
          [
            tab("memos", "Memo", props.memoTotal || 0),
            tab("tasks", "待办", props.taskTotal || 0),
            For({
              each: props.boards || [],
              render(board) {
                return tab(board.id, board.title, board.columnCount + "列");
              },
            }),
          ],
        ),
        panel("memos", [
          View(
            { class: "memo-project-tab-toolbar", attributes: { n: "project-memo-toolbar" } },
            [
              View(
                { as: "label", class: "memo-search memo-project-memo-search", attributes: { n: "project-memo-search-label" } },
                [
                  memoIcon("search", "project-memo-search-icon"),
                  Input({
                    type: "search",
                    value: props.query || "",
                    placeholder: "搜索项目内 memos",
                    attributes: { "data-project-memo-search": "true", n: "project-memo-search-input", type: "search" },
                  }),
                ],
              ),
              Button(
                { class: "tn-button tn-button--primary memo-primary-button", attributes: { "data-action": "createMemo", n: "project-create-memo-button", type: "button" } },
                ["新建 Memo"],
              ),
            ],
          ),
          View(
            { class: "memo-project-memo-list", attributes: { n: "project-memo-list" } },
            [
              MemoFeedView({ memos: props.memos || [], projects: props.projects || [], runtime }),
              props.memoHasMore
                ? View({ class: "memo-feed-load-more", attributes: { "data-project-scroll-loader": "memos", n: "project-memo-scroll-loader" } }, ["继续向下滚动加载"])
                : null,
            ],
          ),
        ]),
        panel("tasks", [
          View(
            { class: "memo-project-todo-list", attributes: { n: "project-task-list" } },
            [
              TaskCollectionsView({
                groups: props.tasks?.length ? [{ items: props.tasks, label: "待办" }] : [],
                hideWorkspace: true,
                mode: "tasks",
                runtime,
              }),
              props.taskHasMore
                ? View({ class: "memo-feed-load-more", attributes: { "data-project-scroll-loader": "tasks", n: "project-task-scroll-loader" } }, ["继续向下滚动加载"])
                : null,
            ],
          ),
        ]),
        For({
          each: props.boards || [],
          render(board) {
            return panel(board.id, board.view ? [board.view] : [], { "data-project-board": "true" });
          },
        }),
      ],
    ),
    props.showPresets
      ? BoardPresetsView({ presets: props.presets || [], projectId: props.projectId, runtime })
      : null,
  ]);
}

export function FetchTitleLogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: { "data-fetch-title-log": "true", n: "fetch-title-log-overlay" },
    },
    [
      View(
        {
          class: "tn-dialog tn-dialog--md memo-dialog-panel",
          style: { display: "flex", flexDirection: "column", maxHeight: "80vh", maxWidth: "600px" },
          attributes: { n: "fetch-title-log-dialog" },
        },
        [
          View(
            { class: "memo-dialog-head", attributes: { n: "fetch-title-log-header" } },
            [
              View({ as: "h2", attributes: { n: "fetch-title-log-title" } }, ["获取标题日志"]),
              Button(
                { class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button", attributes: { "aria-label": "关闭", "data-fetch-title-log-close": "true", n: "fetch-title-log-close", title: "关闭", type: "button" } },
                [memoIcon("x", "fetch-title-log-close-icon")],
              ),
            ],
          ),
          View(
            { class: "memo-dialog-body", style: { overflowY: "auto", padding: "16px" }, attributes: { n: "fetch-title-log-body" } },
            [
              View(
                { class: "memo-fetch-log", attributes: { n: "fetch-title-log-rows" } },
                [
                  For({
                    each: props.rows || [],
                    render(row) {
                      return View(
                        { class: "memo-fetch-log-row" + (row.ok === true ? " is-ok" : row.ok === false ? " is-error" : ""), attributes: { n: "fetch-title-log-row" } },
                        [
                          View({ as: "span", class: "memo-fetch-log-label", attributes: { n: "fetch-title-log-row-label" } }, [row.label]),
                          View(
                            { as: "span", class: row.mono || row.path ? "memo-fetch-log-mono" : "", attributes: { n: "fetch-title-log-row-value" } },
                            [
                              row.value,
                              row.path
                                ? Button(
                                    {
                                      class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                                      attributes: { [row.pathAttribute]: row.path, n: "fetch-title-log-copy-path", title: "复制路径", type: "button" },
                                    },
                                    [memoIcon("copy", "fetch-title-log-copy-path-icon")],
                                  )
                                : null,
                            ],
                          ),
                        ],
                      );
                    },
                  }),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

export function HistoryDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  let body = null;
  if (props.loading) {
    body = View({ class: "history-loading", attributes: { n: "history-loading" } }, ["加载中..."]);
  } else if (props.error) {
    body = View({ class: "history-error", attributes: { n: "history-error" } }, [props.error]);
  } else if (!props.versions?.length) {
    body = View({ class: "history-empty", attributes: { n: "history-empty" } }, ["暂无历史版本"]);
  } else {
    body = For({
      each: props.versions,
      render(version) {
        return View(
          { class: "history-version-row", attributes: { "data-history-version": version.version, n: "history-version-row" } },
          [
            View(
              { class: "history-version-info", attributes: { n: "history-version-info" } },
              [
                View({ as: "span", class: "history-version-number", attributes: { n: "history-version-number" } }, ["v" + version.version]),
                View({ as: "span", class: "history-version-time", attributes: { n: "history-version-time" } }, [version.time]),
                version.changed
                  ? View({ as: "span", class: "history-version-fields", attributes: { n: "history-version-fields" } }, [version.changed])
                  : null,
              ],
            ),
            View(
              { class: "history-version-actions", attributes: { n: "history-version-actions" } },
              [
                Button(
                  { class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button", attributes: { "data-action": "toggleHistoryDiff", "data-version": version.version, n: "history-toggle-diff", title: version.expanded ? "收起差异" : "展开差异", type: "button" } },
                  [memoIcon(version.expanded ? "chevron-up" : "eye", "history-toggle-diff-icon")],
                ),
                Button(
                  { class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button", disabled: version.restoring, attributes: { "data-action": "restoreHistoryVersion", "data-version": version.version, n: "history-restore-version", title: "回退", type: "button" } },
                  version.restoring ? ["回退中..."] : [memoIcon("rotate-ccw", "history-restore-version-icon")],
                ),
              ],
            ),
            version.expanded
              ? version.diffLoading
                ? View({ class: "history-diff-loading", attributes: { n: "history-diff-loading" } }, ["加载中..."])
                : View(
                    { class: "history-inline-diff", attributes: { n: "history-inline-diff" } },
                    [
                      For({
                        each: version.diff || [],
                        render(segment) {
                          return View(
                            { class: "history-diff-segment is-" + segment.type, attributes: { n: "history-diff-" + segment.type } },
                            [segment.text],
                          );
                        },
                      }),
                    ],
                  )
              : null,
          ],
        );
      },
    });
  }
  return View(
    { class: "history-dialog-backdrop", attributes: { "data-history-backdrop": "true", n: "history-dialog-backdrop" } },
    [
      View(
        { class: "history-dialog-card", attributes: { n: "history-dialog" } },
        [
          View(
            { class: "history-dialog-head", attributes: { n: "history-dialog-header" } },
            [
              View({ as: "h2", attributes: { n: "history-dialog-title" } }, [props.title]),
              View({ as: "span", class: "history-record-id", attributes: { n: "history-record-id" } }, [props.recordId]),
              Button(
                { class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button", attributes: { "aria-label": "关闭", "data-action": "closeHistoryDialog", n: "history-dialog-close", type: "button" } },
                [memoIcon("x", "history-dialog-close-icon")],
              ),
            ],
          ),
          View(
            { class: "history-dialog-body", attributes: { n: "history-dialog-body" } },
            [View({ class: "history-version-list", attributes: { n: "history-version-list" } }, [body])],
          ),
        ],
      ),
    ],
  );
}

const REACTIONS = Object.freeze(["👍", "👎", "😄", "🎉", "❤️", "🚀", "👀"]);

function iconActionButton(runtime, props) {
  return runtime.Button(
    {
      class:
        (props.class || "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button") +
        (props.active ? " is-active" : "") +
        (props.danger ? " is-danger" : ""),
      attributes: {
        "aria-controls": props.controls,
        "aria-expanded": props.expanded,
        "aria-haspopup": props.hasPopup,
        "aria-label": props.label,
        "aria-pressed": props.pressed,
        "data-action": props.action,
        "data-board-id": props.boardId,
        "data-comment-id": props.commentId,
        "data-memo-id": props.memoId,
        "data-rule-id": props.ruleId,
        n: props.meaning,
        title: props.label,
        type: props.type || "button",
      },
      disabled: props.disabled,
    },
    [
      memoIcon(props.icon, props.meaning + "-icon"),
      props.text
        ? runtime.View(
            { as: "span", attributes: { n: props.meaning + "-label" } },
            [props.text],
          )
        : null,
      props.count
        ? runtime.View(
            { as: "span", class: "memo-action-count", attributes: { n: props.meaning + "-count" } },
            [props.count],
          )
        : null,
    ],
  );
}

function PrivateOverlayView(props) {
  const { View } = props.runtime;
  return View(
    { class: "memo-private-overlay", attributes: { n: props.meaning + "-private-overlay" } },
    [
      memoIcon("lock", props.meaning + "-private-icon"),
      View({ as: "strong", attributes: { n: props.meaning + "-private-title" } }, [props.label]),
      View(
        { as: "span", attributes: { n: props.meaning + "-private-description" } },
        ["解锁后可查看内容"],
      ),
    ],
  );
}

function MemoStatsView(props) {
  const { Button, For, View } = props.runtime;
  if (!props.stats?.length && !props.tags?.length) return null;
  return props.runtime.Fragment({}, [
    props.stats?.length
      ? View(
          { class: "memo-card-stats", attributes: { n: props.meaning + "-stats" } },
          [
            For({
              each: props.stats,
              render(label) {
                return View(
                  { as: "span", class: "memo-card-stat", attributes: { n: props.meaning + "-stat" } },
                  [label],
                );
              },
            }),
          ],
        )
      : null,
    props.tags?.length
      ? View(
          { class: "memo-card-tags", attributes: { n: props.meaning + "-tags" } },
          [
            For({
              each: props.tags,
              render(tag) {
                return props.interactiveTags
                  ? Button(
                      {
                        attributes: { "data-tag": tag, n: props.meaning + "-tag", type: "button" },
                      },
                      ["#" + tag],
                    )
                  : View(
                      { as: "span", attributes: { n: props.meaning + "-tag" } },
                      ["#" + tag],
                    );
              },
            }),
          ],
        )
      : null,
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
    { as: "nav", class: "memo-card-toc", attributes: { "aria-label": "Memo 目录", n: props.meaning + "-toc" } },
    [
      View({ class: "memo-card-toc-title", attributes: { n: props.meaning + "-toc-title" } }, ["目录"]),
      View(
        { as: "ol", class: "memo-card-toc-list", attributes: { n: props.meaning + "-toc-list" } },
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
                        { as: "span", attributes: { n: props.meaning + "-toc-label" } },
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
      attributes: { "data-memo-id": props.memoId, n: props.meaning + "-reactions" },
    },
    [
      active.size
        ? View(
            { class: "memo-reactions-badges", attributes: { n: props.meaning + "-reaction-badges" } },
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
          )
        : null,
      View(
        { class: "memo-reactions-add-wrap", attributes: { n: props.meaning + "-reaction-control" } },
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
              attributes: { "data-reactions-picker": "true", n: props.meaning + "-reaction-picker" },
              hidden: true,
            },
            [
              For({
                each: REACTIONS,
                render(emoji) {
                  return Button(
                    {
                      class: "memo-picker-emoji" + (active.has(emoji) ? " is-active" : ""),
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

function VisibilityOptionsView(props) {
  const options = [
    { label: "仅自己", value: "PRIVATE" },
    { label: "私密", value: "SECRET" },
    { label: "工作区", value: "PROTECTED" },
    { label: "公开", value: "PUBLIC" },
  ];
  return props.runtime.For({
    each: options,
    render(option) {
      return props.runtime.SelectOption({ label: option.label, value: option.value });
    },
  });
}

function InlineEditorView(props) {
  const { Button, View } = props.runtime;
  const prefix = props.comment ? "comment-edit" : "edit";
  return View(
    { class: props.comment ? "memo-comment-edit" : "memo-inline-editor", attributes: { n: "memo-" + prefix + "-editor" } },
    [
      View(
        { class: "memo-editor-switch", attributes: { n: "memo-" + prefix + "-switch" } },
        [
          View(
            {
              class: "memo-editor-host is-inline" + (props.comment ? " memo-comment-edit-host" : ""),
              attributes: {
                [props.comment ? "data-comment-edit-host" : "data-edit-host"]: "true",
                "data-editor-switch-host": "true",
                n: "memo-" + prefix + "-host",
              },
            },
            [],
          ),
          View(
            {
              as: "section",
              class: "memo-editor-preview " + (props.comment ? "memo-comment-edit-preview" : "memo-edit-preview"),
              attributes: {
                [props.comment ? "data-comment-edit-preview" : "data-edit-preview"]: "true",
                n: "memo-" + prefix + "-preview",
              },
              hidden: true,
            },
            [],
          ),
        ],
      ),
      View(
        { class: "memo-inline-actions" + (props.comment ? " memo-comment-edit-actions" : ""), attributes: { n: "memo-" + prefix + "-actions" } },
        [
          View(
            {
              class: "memo-inline-status-line",
              attributes: {
                [props.comment ? "data-comment-edit-vim-status" : "data-edit-vim-status"]: "true",
                n: "memo-" + prefix + "-vim-status",
              },
            },
            [],
          ),
          !props.comment
            ? View(
                { class: "memo-select-wrap is-compact", attributes: { n: "memo-edit-project-control" } },
                [
                  props.runtime.Select({
                    attributes: { "aria-label": "编辑 Project", "data-edit-project": "true", n: "memo-edit-project-select" },
                    options: [{ label: "未归属", value: "" }].concat(props.projects || []),
                    placeholder: "未归属",
                    value: props.projectId || "",
                  }),
                ],
              )
            : null,
          !props.comment
            ? View(
                { class: "memo-select-wrap is-compact", attributes: { n: "memo-edit-visibility-control" } },
                [
                  props.runtime.Select({
                    attributes: { "aria-label": "编辑可见性", "data-edit-visibility": "true", n: "memo-edit-visibility-select" },
                    options: [{ label: "仅自己", value: "PRIVATE" }, { label: "私密", value: "SECRET" }, { label: "工作区", value: "PROTECTED" }, { label: "公开", value: "PUBLIC" }],
                    placeholder: "可见性",
                    value: props.visibility,
                  }),
                ],
              )
            : null,
          iconActionButton(props.runtime, {
            action: props.comment ? "toggleCommentEditPreview" : "toggleEditPreview",
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "eye",
            label: "预览",
            meaning: "memo-" + prefix + "-preview-button",
            pressed: "false",
            text: "预览",
          }),
          iconActionButton(props.runtime, {
            action: props.comment ? "cancelCommentEdit" : "cancelEdit",
            class: "tn-button tn-button--secondary memo-secondary-button",
            icon: "x",
            label: "取消",
            meaning: "memo-" + prefix + "-cancel-button",
            text: "取消",
          }),
          iconActionButton(props.runtime, {
            action: props.comment ? "saveCommentEdit" : "saveEdit",
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
    { as: "span", class: "memo-comment-reaction-wrap", attributes: { n: "memo-comment-reaction-control" } },
    [
      iconActionButton(props.runtime, {
        action: "toggleCommentReactions",
        commentId: props.comment.id,
        icon: "smile",
        label: "添加反应",
        meaning: "memo-comment-reaction-add",
      }),
      View(
        { class: "memo-reactions-picker", attributes: { "data-reactions-picker": "true", n: "memo-comment-reaction-picker" }, hidden: true },
        [
          For({
            each: REACTIONS,
            render(emoji) {
              return Button(
                {
                  class: "memo-picker-emoji" + (active.has(emoji) ? " is-active" : ""),
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
  return View(
    {
      as: "article",
      class: "memo-comment" + (comment.editing ? " is-editing" : "") + (comment.private ? " is-private" : ""),
      attributes: { "data-comment-id": comment.id, n: "memo-comment" },
    },
    [
      comment.private
        ? PrivateOverlayView({ label: "仅自己可见", meaning: "memo-comment", runtime: props.runtime })
        : null,
      View(
        { as: "header", class: "memo-comment-head", attributes: { n: "memo-comment-header" } },
        [
          View({ class: "memo-avatar memo-comment-avatar", attributes: { n: "memo-comment-avatar" } }, ["U"]),
          View(
            { attributes: { n: "memo-comment-author-details" } },
            [
              View({ class: "memo-comment-author", attributes: { n: "memo-comment-author" } }, ["You"]),
              View(
                { as: "time", attributes: { datetime: comment.time, n: "memo-comment-time" } },
                [comment.relativeTime],
              ),
            ],
          ),
        ],
      ),
      comment.editing
        ? InlineEditorView({ comment: true, runtime: props.runtime })
        : props.runtime.Fragment({}, [
            View(
              { class: "memo-comment-bubble", attributes: { n: "memo-comment-bubble" } },
              [
                View(
                  { class: "memo-comment-hover-actions", attributes: { "aria-label": "评论操作", n: "memo-comment-actions" } },
                  [
                    iconActionButton(props.runtime, { action: "copyComment", icon: "copy", label: "复制", meaning: "memo-comment-copy-button" }),
                    iconActionButton(props.runtime, { action: "replyToComment", icon: "reply", label: "回复", meaning: "memo-comment-reply-button" }),
                    iconActionButton(props.runtime, { action: "editComment", icon: "edit", label: "编辑评论", meaning: "memo-comment-edit-button" }),
                    comment.hasHistory
                      ? iconActionButton(props.runtime, { action: "openCommentHistory", icon: "history", label: "版本历史", meaning: "memo-comment-history-button" })
                      : null,
                    iconActionButton(props.runtime, { action: "deleteComment", danger: true, icon: "trash2", label: "删除评论", meaning: "memo-comment-delete-button" }),
                    CommentReactionPickerView({ comment, runtime: props.runtime }),
                  ],
                ),
                comment.replyTo
                  ? View(
                      { class: "memo-comment-reply-to", attributes: { n: "memo-comment-reply-source" } },
                      [
                        View({ as: "span", class: "memo-comment-reply-to-label", attributes: { n: "memo-comment-reply-source-label" } }, ["回复"]),
                        View(
                          { as: "span", class: "memo-comment-reply-to-content", attributes: { n: "memo-comment-reply-source-content", title: comment.replyTitle } },
                          [comment.replyLabel],
                        ),
                      ],
                    )
                  : null,
                View(
                  { class: "memo-content memo-comment-content", attributes: { n: "memo-comment-content" } },
                  [RichText({ attributes: { n: "memo-comment-rich-text" }, content: comment.html })],
                ),
              ],
            ),
            !comment.private
              ? View(
                  { class: "memo-comment-footer", attributes: { n: "memo-comment-footer" } },
                  [
                    comment.reactions?.length
                      ? View(
                          { class: "memo-reactions-badges", attributes: { n: "memo-comment-reaction-badges" } },
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
                        )
                      : null,
                    comment.replyCount
                      ? Button(
                          {
                            class: "memo-comment-reply-badge",
                            attributes: { "data-action": "openCommentReplies", n: "memo-comment-reply-count", type: "button" },
                          },
                          [comment.replyCount + "条回复"],
                        )
                      : null,
                  ],
                )
              : null,
          ]),
    ],
  );
}

function CommentComposerView(props) {
  const { View } = props.runtime;
  return View(
    { class: "memo-comment-editor", attributes: { n: "memo-comment-composer" } },
    [
      View(
        { class: "memo-editor-switch", attributes: { n: "memo-comment-composer-switch" } },
        [
          View(
            {
              class: "memo-editor-host is-inline",
              attributes: { "data-comment-host": "true", "data-editor-switch-host": "true", n: "memo-comment-composer-host" },
            },
            [],
          ),
          View(
            {
              as: "section",
              class: "memo-editor-preview memo-comment-preview",
              attributes: { "data-comment-preview": "true", n: "memo-comment-preview" },
              hidden: true,
            },
            [],
          ),
        ],
      ),
      View(
        { class: "memo-inline-actions memo-comment-actions", attributes: { n: "memo-comment-composer-actions" } },
        [
          View({ class: "memo-inline-status-line", attributes: { "data-comment-vim-status": "true", n: "memo-comment-vim-status" } }, []),
          props.runtime.Select({
            class: "memo-comment-visibility-select",
            attributes: { "aria-label": "评论可见范围", "data-comment-visibility-select": "true", n: "memo-comment-visibility-select" },
            options: [{ label: "仅自己", value: "PRIVATE" }, { label: "私密", value: "SECRET" }, { label: "工作区", value: "PROTECTED" }, { label: "公开", value: "PUBLIC" }],
            placeholder: "可见范围",
            value: props.visibility,
          }),
          iconActionButton(props.runtime, { action: "toggleCommentPreview", class: "tn-button tn-button--secondary memo-secondary-button", icon: "eye", label: "预览", meaning: "memo-comment-preview-button", pressed: "false", text: "预览" }),
          iconActionButton(props.runtime, { action: "cancelComment", class: "tn-button tn-button--secondary memo-secondary-button", icon: "x", label: "取消", meaning: "memo-comment-cancel-button", text: "取消" }),
          iconActionButton(props.runtime, { action: "saveComment", class: "tn-button tn-button--primary memo-primary-button", icon: "check", label: "评论", meaning: "memo-comment-save-button", text: "评论" }),
        ],
      ),
    ],
  );
}

function MemoCommentsView(props) {
  const { Button, For, View } = props.runtime;
  return View(
    { as: "section", class: "memo-comments", attributes: { "aria-label": "评论", n: "memo-comments" } },
    [
      View(
        { class: "memo-comments-title", attributes: { n: "memo-comments-title" } },
        [
          View({ as: "span", attributes: { n: "memo-comments-title-label" } }, ["评论"]),
          props.comments.length
            ? View({ as: "strong", attributes: { n: "memo-comments-count" } }, [props.comments.length])
            : null,
        ],
      ),
      props.comments.length
        ? View(
            { class: "memo-comment-list " + (props.expanded ? "is-expanded" : "is-collapsed"), attributes: { n: "memo-comment-list" } },
            [
              For({
                each: props.visibleComments,
                render(comment) {
                  return MemoCommentView({ comment, runtime: props.runtime });
                },
              }),
            ],
          )
        : null,
      props.hasOverflow
        ? Button(
            {
              class: "memo-comment-list-toggle",
              attributes: {
                "aria-expanded": props.expanded ? "true" : "false",
                "data-action": "toggleMemoComments",
                n: "memo-comments-toggle-button",
                type: "button",
              },
            },
            [
              View({ as: "span", attributes: { n: "memo-comments-toggle-label" } }, [props.toggleLabel]),
              memoIcon("chevron-down", "memo-comments-toggle-icon"),
            ],
          )
        : null,
      props.commenting
        ? CommentComposerView({ runtime: props.runtime, visibility: props.commentVisibility })
        : null,
    ],
  );
}

function MemoMoreMenuView(props) {
  const { Button, View } = props.runtime;
  function item(action, icon_name, label, danger) {
    return Button(
      {
        class: "tn-menu__item memo-card-more-item" + (danger ? " is-danger" : ""),
        attributes: { "data-action": action, n: "memo-more-" + action, role: "menuitem", type: "button" },
      },
      [
        memoIcon(icon_name, "memo-more-" + action + "-icon"),
        View({ as: "span", attributes: { n: "memo-more-" + action + "-label" } }, [label]),
      ],
    );
  }
  return View(
    {
      class: "tn-popup tn-popup--menu tn-menu tn-dropdown-menu memo-card-more-menu",
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
      props.memo.hasHistory ? item("openMemoHistory", "history", "版本历史") : null,
      View(
        { class: "tn-menu__separator memo-card-more-separator", attributes: { n: "memo-more-separator", role: "separator" } },
        [],
      ),
      props.memo.archived
        ? item("restoreMemo", "undo2", "恢复 Memo")
        : item("archiveMemo", "archive", "归档 Memo"),
      item("deleteMemo", "trash2", "删除 Memo", true),
    ],
  );
}

export function MemoCardView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, RichText, View } = runtime;
  const memo = props.memo;
  if (memo.error) {
    return View(
      { as: "article", class: "memo-card is-archived", attributes: { "data-memo-id": memo.id, n: "memo-card-error" } },
      [View({ class: "memo-empty-mini", attributes: { n: "memo-card-error-message" } }, [memo.error])],
    );
  }
  const menu_id = "memo-more-menu-" + memo.id;
  return View(
    {
      as: "article",
      class: memo.className,
      attributes: { "data-memo-id": memo.id, n: "memo-card" },
    },
    [
      memo.private
        ? PrivateOverlayView({ label: memo.visibility.label, meaning: "memo-card", runtime })
        : null,
      View(
        { as: "header", class: "memo-card-head", attributes: { n: "memo-card-header" } },
        [
          View(
            { class: "memo-card-author-info", attributes: { n: "memo-card-author" } },
            [
              View({ as: "span", class: "memo-author-name", attributes: { n: "memo-card-author-name" } }, ["You"]),
              View({ as: "time", attributes: { datetime: memo.createdAt, n: "memo-card-time" } }, [memo.relativeTime]),
            ],
          ),
          View(
            { class: "memo-card-meta", attributes: { n: "memo-card-meta" } },
            [
              memo.showVisibility
                ? View(
                    { as: "span", class: "memo-visibility", attributes: { n: "memo-card-visibility" } },
                    [memoIcon(memo.visibility.icon, "memo-card-visibility-icon"), memo.visibility.label],
                  )
                : null,
              memo.alias
                ? View({ as: "span", class: "memo-alias-label", attributes: { n: "memo-card-alias" } }, ["@" + memo.alias])
                : null,
              memo.backlinks
                ? View({ as: "span", class: "memo-backlink-label", attributes: { n: "memo-card-backlinks" } }, [memo.backlinks + " 引用"])
                : null,
              View(
                { class: "memo-card-head-actions", attributes: { n: "memo-card-header-actions" } },
                [
                  memo.hasToc
                    ? iconActionButton(runtime, { action: "toggleMemoToc", active: memo.tocVisible, icon: "scroll-text", label: memo.tocVisible ? "隐藏目录" : "显示目录", meaning: "memo-toc-toggle" })
                    : null,
                  iconActionButton(runtime, { action: "togglePin", active: memo.pinned, icon: memo.pinned ? "unpin" : "pin", label: memo.pinned ? "取消置顶" : "置顶", meaning: "memo-pin-toggle", pressed: memo.pinned ? "true" : "false" }),
                  iconActionButton(runtime, { action: "detachMemo", icon: "external-link", label: "分离为窗口", meaning: "memo-detach-button" }),
                  iconActionButton(runtime, { action: "copyMemo", icon: "copy", label: "复制", meaning: "memo-copy-button" }),
                ],
              ),
            ],
          ),
        ],
      ),
      memo.editing
        ? InlineEditorView({
            projectId: memo.projectId,
            projects: props.projects || [],
            runtime,
            visibility: memo.editVisibility,
          })
        : View(
            { class: "memo-card-reading" + (memo.tocVisible ? " has-toc" : ""), attributes: { n: "memo-card-reading" } },
            [
              View(
                { class: "memo-card-reading-main", attributes: { n: "memo-card-reading-main" } },
                [
                  View(
                    {
                      class: "memo-list-collapse " + (memo.expanded ? "is-expanded" : "is-collapsed") + (!memo.expanded && memo.short ? " is-short" : ""),
                      attributes: {
                        "data-memo-collapse": "true",
                        "data-memo-lines": memo.lineCount,
                        n: "memo-card-collapse",
                      },
                    },
                    [
                      View(
                        { class: "memo-content", attributes: { n: "memo-card-content" } },
                        [RichText({ attributes: { n: "memo-card-rich-text" }, content: memo.html })],
                      ),
                      !memo.expanded
                        ? Button(
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
                              View({ as: "span", attributes: { n: "memo-expand-label" } }, ["展开全文"]),
                            ],
                          )
                        : null,
                    ],
                  ),
                ],
              ),
              memo.tocVisible
                ? MemoTocView({ headings: memo.headings, meaning: "memo-card", runtime })
                : null,
            ],
          ),
      View(
        { as: "footer", class: "memo-card-actions", attributes: { n: "memo-card-footer" } },
        [
          View(
            { class: "memo-card-operation-meta", attributes: { n: "memo-card-operation-meta" } },
            [
              ProjectBadgeView({ meaning: "memo-card", project: memo.project, runtime }),
              MemoStatsView({ interactiveTags: true, meaning: "memo-card", runtime, stats: memo.stats, tags: memo.tags }),
            ],
          ),
          !memo.editing && !memo.private
            ? MemoReactionsView({ meaning: "memo-card", memoId: memo.id, reactions: memo.reactions, runtime })
            : null,
          View(
            { class: "memo-card-actions-buttons", attributes: { n: "memo-card-action-buttons" } },
            [
              iconActionButton(runtime, { action: "copyMemoRef", icon: "link", label: "复制引用", meaning: "memo-copy-reference-button" }),
              iconActionButton(runtime, { action: "commentMemo", count: memo.commentCount, icon: "comment", label: "评论", meaning: "memo-comment-button" }),
              iconActionButton(runtime, { action: "editMemo", icon: "edit", label: "编辑", meaning: "memo-edit-button" }),
              View(
                {
                  class: "memo-card-more" + (memo.moreOpen ? " is-open" : ""),
                  attributes: { "data-memo-id": memo.id, "data-memo-more": "true", n: "memo-more-control" },
                },
                [
                  iconActionButton(runtime, {
                    action: "toggleMemoMore",
                    controls: menu_id,
                    expanded: memo.moreOpen ? "true" : "false",
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
      !memo.editing && (memo.comments.length || memo.commenting)
        ? MemoCommentsView({
            commentVisibility: memo.commentVisibility,
            commenting: memo.commenting,
            comments: memo.comments,
            expanded: memo.commentsExpanded,
            hasOverflow: memo.commentsOverflow,
            runtime,
            toggleLabel: memo.commentsToggleLabel,
            visibleComments: memo.visibleComments,
          })
        : null,
    ],
  );
}

export function MemoFeedView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Fragment, View } = runtime;
  if (!props.memos?.length) {
    return View(
      { class: "memo-empty-state", attributes: { n: "memo-feed-empty" } },
      [
        View(
          { class: "memo-empty-icon", attributes: { n: "memo-feed-empty-icon" } },
          [memoIcon("search", "memo-feed-empty-symbol")],
        ),
        View({ as: "h2", attributes: { n: "memo-feed-empty-title" } }, ["没有匹配的 memo"]),
        runtime.Button(
          {
            class: "tn-button tn-button--secondary memo-secondary-button",
            attributes: { "data-action": "clearFilters", n: "memo-feed-clear-filters", type: "button" },
          },
          ["查看全部"],
        ),
      ],
    );
  }
  return Fragment({}, [
    For({
      each: props.memos,
      render(memo) {
        return MemoCardView({ memo, projects: props.projects, runtime });
      },
    }),
    props.hasMore
      ? View({ class: "memo-feed-load-more", attributes: { n: "memo-feed-load-more" } }, ["加载更多..."])
      : null,
  ]);
}

export function PinnedMemoListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, RichText, View } = runtime;
  if (!props.memos?.length) {
    return View({ class: "memo-empty-mini", attributes: { n: "memo-pinned-empty" } }, ["暂无置顶"]);
  }
  return runtime.Fragment({}, [
    For({
      each: props.memos,
      render(memo) {
        return View(
          {
            as: "article",
            class: "memo-pinned-item memo-pinned-card",
            attributes: { "aria-label": "置顶 Memo", "data-memo-id": memo.id, n: "memo-pinned-card" },
          },
          [
            View(
              { as: "header", class: "memo-pinned-head", attributes: { n: "memo-pinned-header" } },
              [
                View(
                  { class: "memo-card-author-info memo-pinned-author-info", attributes: { n: "memo-pinned-author" } },
                  [
                    View({ as: "span", class: "memo-author-name", attributes: { n: "memo-pinned-author-name" } }, ["You"]),
                    View({ as: "time", attributes: { datetime: memo.createdAt, n: "memo-pinned-time" } }, [memo.relativeTime]),
                  ],
                ),
                View(
                  { class: "memo-pinned-actions", attributes: { n: "memo-pinned-actions" } },
                  [
                    iconActionButton(runtime, { action: "togglePin", active: true, icon: "unpin", label: "取消置顶", meaning: "pinned-memo-unpin", pressed: "true" }),
                    iconActionButton(runtime, { action: "detachMemo", icon: "external-link", label: "分离为窗口", meaning: "memo-pinned-detach" }),
                  ],
                ),
              ],
            ),
            View(
              {
                class: "memo-pinned-collapse memo-list-collapse " + (memo.expanded ? "is-expanded" : "is-collapsed") + (!memo.expanded && memo.short ? " is-short" : ""),
                attributes: { "data-memo-collapse": "true", "data-memo-lines": memo.lineCount, n: "memo-pinned-collapse" },
              },
              [
                View(
                  { class: "memo-pinned-content memo-content", attributes: { n: "memo-pinned-content" } },
                  [RichText({ attributes: { n: "memo-pinned-rich-text" }, content: memo.html })],
                ),
                !memo.expanded
                  ? Button(
                      {
                        class: "memo-expand-button memo-pinned-expand-button",
                        attributes: { "aria-expanded": "false", "aria-label": "展开全文", "data-action": "expandMemo", n: "memo-pinned-expand", title: "展开全文", type: "button" },
                      },
                      [memoIcon("chevron-down", "memo-pinned-expand-icon"), View({ as: "span", attributes: { n: "memo-pinned-expand-label" } }, ["展开全文"])],
                    )
                  : null,
              ],
            ),
            View(
              { as: "footer", class: "memo-pinned-footer", attributes: { n: "memo-pinned-footer" } },
              [
                View(
                  { class: "memo-card-operation-meta", attributes: { n: "memo-pinned-meta" } },
                  [
                    ProjectBadgeView({ meaning: "memo-pinned", project: memo.project, runtime }),
                    MemoStatsView({ meaning: "memo-pinned", runtime, stats: memo.stats, tags: memo.tags }),
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
        { class: "memo-dialog-head", attributes: { n: "source-memo-dialog-header" } },
        [
          View({ as: "h2", attributes: { n: "source-memo-dialog-title" } }, ["来源 Memo"]),
          Button(
            {
              class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: { "data-source-memo-dialog-close": "true", n: "source-memo-dialog-close", title: "关闭", type: "button" },
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
            { class: "memo-content", attributes: { n: "source-memo-dialog-content" } },
            [RichText({ attributes: { n: "source-memo-dialog-rich-text" }, content: props.html })],
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
        View({ as: "span", attributes: { n: "memo-dialog-" + name + "-label" } }, [label]),
      ],
    );
  }
  return View(
    {
      as: "section",
      class: "tn-dialog tn-dialog--md memo-dialog-panel memo-comment-dialog-panel",
      attributes: {
        "aria-labelledby": "memo-dialog-title",
        "aria-modal": "true",
        n: "memo-dialog-panel",
        role: "dialog",
      },
    },
    [
      View(
        { as: "header", class: "memo-dialog-head", attributes: { n: "memo-dialog-header" } },
        [
          View(
            { attributes: { n: "memo-dialog-heading" } },
            [
              View({ as: "h2", attributes: { id: "memo-dialog-title", n: "memo-dialog-title" } }, [props.title]),
              props.description
                ? View({ as: "p", attributes: { n: "memo-dialog-description" } }, [props.description])
                : null,
            ],
          ),
          Button(
            {
              class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
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
          props.replyTo
            ? View(
                { class: "memo-dialog-reply-to", attributes: { n: "memo-dialog-reply-source" } },
                [
                  View({ as: "span", class: "memo-dialog-reply-to-label", attributes: { n: "memo-dialog-reply-source-label" } }, ["回复"]),
                  View(
                    { as: "span", class: "memo-dialog-reply-to-content", attributes: { n: "memo-dialog-reply-source-content", title: props.replyTo } },
                    [props.replyTo],
                  ),
                ],
              )
            : null,
          View(
            { class: "memo-editor-switch memo-dialog-editor-switch", attributes: { n: "memo-dialog-editor-switch" } },
            [
              View(
                {
                  class: "memo-editor-host memo-dialog-editor-host",
                  attributes: { "data-editor-switch-host": "true", "data-memo-dialog-editor-host": "true", n: "memo-dialog-editor-host" },
                },
                [],
              ),
              View(
                {
                  as: "section",
                  class: "memo-editor-preview memo-dialog-preview",
                  attributes: { "data-memo-dialog-preview": "true", n: "memo-dialog-preview" },
                  hidden: true,
                },
                [],
              ),
            ],
          ),
        ],
      ),
      View(
        { as: "footer", class: "memo-dialog-actions", attributes: { n: "memo-dialog-actions" } },
        [
          View({ class: "memo-inline-status-line", attributes: { "data-memo-dialog-vim-status": "true", n: "memo-dialog-vim-status" } }, []),
          action("preview", "tn-button tn-button--secondary memo-secondary-button", "eye", "预览"),
          action("cancel", "tn-button tn-button--secondary memo-secondary-button", "x", "取消"),
          action("save", "tn-button tn-button--primary memo-primary-button", "check", props.saveLabel),
        ],
      ),
    ],
  );
}

export function InlineTaskDetailView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    { class: "inline-task-detail-dialog", attributes: { n: "inline-task-detail-dialog" } },
    [
      View(
        { class: "inline-task-detail-header", attributes: { n: "inline-task-detail-header" } },
        [
          View(
            { as: "span", class: "inline-task-detail-status " + props.statusClass, attributes: { n: "inline-task-detail-status" } },
            [props.statusLabel],
          ),
          Button(
            {
              class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: { "data-inline-task-detail-close": "true", n: "inline-task-detail-close-button", title: "关闭", type: "button" },
            },
            [memoIcon("x", "inline-task-detail-close-icon")],
          ),
        ],
      ),
      View(
        { class: "inline-task-detail-body", attributes: { n: "inline-task-detail-body" } },
        [
          View({ class: "inline-task-detail-title", attributes: { n: "inline-task-detail-title" } }, [props.title]),
          props.description
            ? View({ class: "inline-task-detail-desc", attributes: { n: "inline-task-detail-description" } }, [props.description])
            : null,
          View(
            { class: "inline-task-detail-meta", attributes: { n: "inline-task-detail-meta" } },
            [
              For({
                each: props.rows || [],
                render(row) {
                  return View(
                    { class: "inline-task-detail-row", attributes: { n: "inline-task-detail-meta-row" } },
                    [
                      View({ as: "span", class: "inline-task-detail-label", attributes: { n: "inline-task-detail-meta-label" } }, [row.label]),
                      View({ as: "span", attributes: { n: "inline-task-detail-meta-value" } }, [row.value]),
                    ],
                  );
                },
              }),
            ],
          ),
        ],
      ),
      View(
        { class: "inline-task-detail-footer", attributes: { n: "inline-task-detail-footer" } },
        [
          props.memoId
            ? Button(
                {
                  class: "tn-button tn-button--secondary memo-secondary-button",
                  attributes: { "data-inline-task-detail-focus-memo": "true", n: "inline-task-detail-focus-memo", type: "button" },
                },
                ["定位 Memo"],
              )
            : null,
          Button(
            {
              class: "tn-button tn-button--primary memo-primary-button",
              attributes: { "data-inline-task-detail-close": "true", n: "inline-task-detail-confirm-close", type: "button" },
            },
            ["关闭"],
          ),
        ],
      ),
    ],
  );
}

export function CompletedTimeEditorView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input } = runtime;
  return runtime.Fragment({}, [
    Input({
      class: "memo-task-completed-time-input",
      type: "datetime-local",
      value: props.value,
      attributes: { n: "memo-task-completed-time-input", type: "datetime-local" },
    }),
    Button(
      { class: "memo-task-completed-time-confirm", attributes: { n: "memo-task-completed-time-confirm", title: "确认", type: "button" } },
      [memoIcon("check", "memo-task-completed-time-confirm-icon")],
    ),
    Button(
      { class: "memo-task-completed-time-cancel", attributes: { n: "memo-task-completed-time-cancel", title: "取消", type: "button" } },
      [memoIcon("x", "memo-task-completed-time-cancel-icon")],
    ),
  ]);
}

export function TaskEditDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, Select, View } = runtime;
  const priorities = [
    { label: "无", value: "none" },
    { label: "低", value: "low" },
    { label: "中", value: "medium" },
    { label: "高", value: "high" },
  ];
  const quick = [
    { label: "10 分钟前", value: 10 },
    { label: "30 分钟前", value: 30 },
    { label: "1 小时前", value: 60 },
    { label: "1 天前", value: 1440 },
  ];
  function close_button(label, primary) {
    return Button(
      {
        class: primary
          ? "tn-button tn-button--primary memo-primary-button"
          : "tn-button tn-button--secondary memo-secondary-button",
        attributes: {
          [primary ? "data-task-edit-save" : "data-task-edit-cancel"]: "true",
          n: primary ? "task-edit-save-button" : "task-edit-cancel-button",
          type: "button",
        },
      },
      [label],
    );
  }
  return View(
    { class: "memo-dialog task-edit-dialog", attributes: { n: "task-edit-dialog-panel" } },
    [
      View(
        { class: "task-edit-dialog-header", attributes: { n: "task-edit-dialog-header" } },
        [
          View({ as: "h3", attributes: { n: "task-edit-dialog-title" } }, ["编辑任务"]),
          Button(
            {
              class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
              attributes: { "data-task-edit-cancel": "true", n: "task-edit-dialog-close", title: "关闭", type: "button" },
            },
            [memoIcon("x", "task-edit-dialog-close-icon")],
          ),
        ],
      ),
      View(
        { class: "task-edit-dialog-body", attributes: { n: "task-edit-dialog-body" } },
        [
          View(
            { class: "task-edit-field", attributes: { n: "task-edit-title-field" } },
            [
              View({ as: "label", attributes: { n: "task-edit-title-label" } }, ["标题"]),
              Input({ type: "text", value: props.title, attributes: { "data-task-edit-title": "true", n: "task-edit-title-input", type: "text" } }),
            ],
          ),
          View(
            { class: "task-edit-field-row", attributes: { n: "task-edit-field-row" } },
            [
              View(
                { class: "task-edit-field", attributes: { n: "task-edit-due-field" } },
                [
                  View({ as: "label", attributes: { n: "task-edit-due-label" } }, ["截止日期"]),
                  Input({ type: "date", value: props.dueValue, attributes: { "data-task-edit-due": "true", n: "task-edit-due-input", type: "date" } }),
                ],
              ),
              View(
                { class: "task-edit-field", attributes: { n: "task-edit-priority-field" } },
                [
                  View({ as: "label", attributes: { n: "task-edit-priority-label" } }, ["优先级"]),
                  Select({
                    attributes: { "data-task-edit-priority": "true", n: "task-edit-priority-select" },
                    options: priorities,
                    placeholder: "优先级",
                    value: props.priority,
                  }),
                ],
              ),
            ],
          ),
          View(
            { class: "task-edit-reminders", attributes: { n: "task-edit-reminders" } },
            [
              View({ as: "label", attributes: { n: "task-edit-reminders-label" } }, ["提醒"]),
              View(
                { class: "task-edit-reminder-quick", attributes: { n: "task-edit-reminder-quick-list" } },
                [
                  For({
                    each: quick,
                    render(option) {
                      return Button(
                        {
                          class: "task-edit-reminder-chip",
                          attributes: { "data-task-reminder-quick": option.value, n: "task-edit-reminder-quick-button", type: "button" },
                        },
                        [option.label],
                      );
                    },
                  }),
                ],
              ),
              View(
                { class: "task-edit-reminder-custom", attributes: { n: "task-edit-reminder-custom" } },
                [
                  Input({ type: "datetime-local", attributes: { "data-task-reminder-abs-input": "true", n: "task-edit-reminder-absolute-input", type: "datetime-local" } }),
                  Button(
                    {
                      class: "tn-button tn-button--primary memo-primary-button",
                      attributes: { "data-task-reminder-abs-confirm": "true", n: "task-edit-reminder-absolute-add", type: "button" },
                    },
                    ["添加"],
                  ),
                ],
              ),
              props.reminders?.length
                ? View(
                    { class: "task-edit-reminder-list", attributes: { n: "task-edit-reminder-list" } },
                    [
                      For({
                        each: props.reminders,
                        render(reminder, index$) {
                          const index = index$?.value ?? 0;
                          return View(
                            { class: "task-edit-reminder-item", attributes: { n: "task-edit-reminder-item" } },
                            [
                              View({ as: "span", attributes: { n: "task-edit-reminder-item-label" } }, [reminder.label]),
                              reminder.fired
                                ? View({ as: "span", class: "task-edit-reminder-fired", attributes: { n: "task-edit-reminder-fired" } }, ["已触发"])
                                : null,
                              Button(
                                {
                                  class: "task-edit-reminder-delete",
                                  attributes: { "data-task-reminder-del": index, n: "task-edit-reminder-delete", title: "删除", type: "button" },
                                },
                                [memoIcon("x", "task-edit-reminder-delete-icon")],
                              ),
                            ],
                          );
                        },
                      }),
                    ],
                  )
                : View({ as: "p", class: "task-edit-reminder-empty", attributes: { n: "task-edit-reminder-empty" } }, ["暂无提醒"]),
            ],
          ),
        ],
      ),
      View(
        { class: "task-edit-dialog-footer", attributes: { n: "task-edit-dialog-footer" } },
        [close_button("取消", false), close_button("保存", true)],
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
        { as: "header", class: "memo-window-titlebar velo-drag", attributes: { "data-velo-drag": "true", n: "detached-memo-titlebar" } },
        [
          View({ class: "memo-window-native-controls", attributes: { "aria-hidden": "true", n: "detached-memo-native-controls" } }, []),
          View({ class: "memo-window-drag-region", attributes: { "aria-hidden": "true", n: "detached-memo-drag-region" } }, []),
          View(
            { class: "memo-window-title-actions", attributes: { n: "detached-memo-title-actions" } },
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
                  attributes: { "data-window-project": "true", n: "detached-memo-project" },
                  hidden: true,
                },
                [],
              ),
            ],
          ),
        ],
      ),
      View(
        { class: "memo-find-bar", attributes: { "data-find-bar": "true", n: "detached-memo-find-bar" }, hidden: true },
        [
          View(
            { as: "label", class: "memo-find-input-wrap", attributes: { n: "detached-memo-find-field" } },
            [
              View(
                { as: "span", class: "memo-find-icon", attributes: { n: "detached-memo-find-icon" } },
                [memoIcon("search", "detached-memo-find-symbol")],
              ),
              Input({
                type: "text",
                placeholder: "在 memo 中搜索...",
                attributes: { autocomplete: "off", "data-find-input": "true", n: "detached-memo-find-input", type: "text" },
              }),
              View({ as: "span", class: "memo-find-count", attributes: { "data-find-count": "true", n: "detached-memo-find-count" } }, []),
            ],
          ),
          small_button("data-find-prev", "chevron-up", "上一个 (Shift+Enter)", "detached-memo-find-previous"),
          small_button("data-find-next", "chevron-down", "下一个 (Enter)", "detached-memo-find-next"),
          small_button("data-find-close", "x", "关闭 (Escape)", "detached-memo-find-close"),
        ],
      ),
      View(
        { as: "main", class: "memo-window-body velo-no-drag", attributes: { "data-window-content": "true", n: "detached-memo-content" } },
        [],
      ),
      View(
        { class: "memo-window-comment-form velo-no-drag", attributes: { "data-window-comment-form": "true", n: "detached-comment-form" } },
        [
          small_button("data-window-comment-attach", "plus", "添加图片或附件", "detached-comment-attach"),
          View(
            { class: "memo-editor-switch memo-window-comment-switch", attributes: { n: "detached-comment-editor-switch" } },
            [
              View(
                {
                  class: "memo-editor-host memo-window-comment-editor",
                  attributes: { "data-editor-switch-host": "true", "data-window-comment-editor": "true", n: "detached-comment-editor-host" },
                },
                [],
              ),
              View(
                {
                  as: "section",
                  class: "memo-editor-preview memo-window-comment-preview velo-no-drag",
                  attributes: { "data-window-comment-preview": "true", n: "detached-comment-preview" },
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
            attributes: { "data-window-comment-file-input": "true", multiple: "multiple", n: "detached-comment-file-input", type: "file" },
          }),
        ],
      ),
      SearchPaletteView({ runtime }),
      View({ class: "memo-toast", attributes: { "data-toast": "true", n: "detached-memo-toast", role: "status" } }, []),
    ],
  );
}

function detachedCommentAction(runtime, props) {
  return runtime.Button(
    {
      class: props.class || "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
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
      props.icon ? memoIcon(props.icon, "detached-comment-" + props.action + "-icon") : null,
      props.text
        ? runtime.View({ as: "span", attributes: { n: "detached-comment-" + props.action + "-label" } }, [props.text])
        : null,
    ],
  );
}

function DetachedCommentReactionPickerView(props) {
  const { Button, For, View } = props.runtime;
  const active = new Set(props.comment.reactions || []);
  return View(
    { as: "span", class: "memo-comment-reaction-wrap memo-reactions-add-wrap", attributes: { n: "detached-comment-reaction-control" } },
    [
      detachedCommentAction(props.runtime, { action: "toggleCommentReactions", icon: "smile", label: "添加反应" }),
      View(
        { class: "memo-reactions-picker", attributes: { "data-reactions-picker": "true", n: "detached-comment-reaction-picker" }, hidden: true },
        [
          For({
            each: REACTIONS,
            render(emoji) {
              return Button(
                {
                  class: "memo-picker-emoji" + (active.has(emoji) ? " is-active" : ""),
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
  return View(
    {
      as: "article",
      class: "memo-comment memo-window-comment" + (comment.editing ? " is-editing" : "") + (comment.highlighted ? " is-highlighted" : ""),
      attributes: { "data-comment-id": comment.id, n: "detached-comment" },
    },
    [
      View(
        { as: "header", class: "memo-comment-head", attributes: { n: "detached-comment-header" } },
        [
          View({ class: "memo-avatar memo-comment-avatar", attributes: { n: "detached-comment-avatar" } }, ["U"]),
          View(
            { attributes: { n: "detached-comment-author-details" } },
            [
              View({ class: "memo-comment-author", attributes: { n: "detached-comment-author" } }, ["You"]),
              View({ as: "time", attributes: { datetime: comment.time, n: "detached-comment-time" } }, [comment.relativeTime]),
            ],
          ),
        ],
      ),
      comment.editing
        ? View(
            { class: "memo-window-comment-edit", attributes: { n: "detached-comment-editor" } },
            [
              View(
                { class: "memo-editor-switch", attributes: { n: "detached-comment-editor-switch" } },
                [
                  View(
                    {
                      class: "memo-editor-host is-inline memo-window-comment-edit-host",
                      attributes: { "data-editor-switch-host": "true", "data-window-comment-edit-host": "true", n: "detached-comment-edit-host" },
                    },
                    [],
                  ),
                  View(
                    {
                      as: "section",
                      class: "memo-editor-preview memo-window-comment-edit-preview",
                      attributes: { "data-window-comment-edit-preview": "true", n: "detached-comment-edit-preview" },
                      hidden: true,
                    },
                    [],
                  ),
                ],
              ),
              View(
                { class: "memo-window-comment-edit-actions", attributes: { n: "detached-comment-edit-actions" } },
                [
                  detachedCommentAction(props.runtime, { action: "preview", class: "tn-button tn-button--secondary memo-secondary-button", icon: "eye", label: "预览", pressed: "false", text: "预览" }),
                  detachedCommentAction(props.runtime, { action: "cancel", class: "tn-button tn-button--secondary memo-secondary-button", icon: "x", label: "取消", text: "取消" }),
                  detachedCommentAction(props.runtime, { action: "save", class: "tn-button tn-button--primary memo-primary-button", icon: "check", label: "保存", text: "保存" }),
                ],
              ),
            ],
          )
        : props.runtime.Fragment({}, [
            View(
              { class: "memo-window-comment-bubble", attributes: { n: "detached-comment-bubble" } },
              [
                View(
                  {
                    class: "memo-window-comment-collapse " + (comment.expanded ? "is-expanded" : "is-collapsed"),
                    attributes: { "data-window-comment-collapse": "true", n: "detached-comment-collapse" },
                  },
                  [
                    View(
                      { class: "memo-window-comment-hover-actions", attributes: { "aria-label": "评论操作", n: "detached-comment-actions" } },
                      [
                        detachedCommentAction(props.runtime, { action: "copy", icon: "copy", label: "复制" }),
                        detachedCommentAction(props.runtime, { action: "reply", icon: "reply", label: "回复" }),
                        detachedCommentAction(props.runtime, { action: "edit", icon: "edit", label: "编辑评论" }),
                        comment.hasHistory ? detachedCommentAction(props.runtime, { action: "history", icon: "history", label: "版本历史" }) : null,
                        detachedCommentAction(props.runtime, { action: "delete", class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button is-danger", icon: "trash2", label: "删除评论" }),
                        DetachedCommentReactionPickerView({ comment, runtime: props.runtime }),
                      ],
                    ),
                    comment.replyTo
                      ? View(
                          { class: "memo-comment-reply-to", attributes: { n: "detached-comment-reply-source" } },
                          [
                            View({ as: "span", class: "memo-comment-reply-to-label", attributes: { n: "detached-comment-reply-label" } }, ["回复"]),
                            View({ as: "span", class: "memo-comment-reply-to-content", attributes: { n: "detached-comment-reply-content", title: comment.replyTitle } }, [comment.replyLabel]),
                          ],
                        )
                      : null,
                    View(
                      { class: "memo-content memo-comment-content", attributes: { n: "detached-comment-content" } },
                      [RichText({ attributes: { n: "detached-comment-rich-text" }, content: comment.html })],
                    ),
                    detachedCommentAction(props.runtime, {
                      action: "toggleExpand",
                      class: "memo-expand-button memo-window-comment-expand-button",
                      icon: "chevron-down",
                      label: comment.expanded ? "收起" : "展开",
                      text: comment.expanded ? "收起" : "展开",
                    }),
                  ],
                ),
              ],
            ),
            View(
              { class: "memo-comment-footer", attributes: { n: "detached-comment-footer" } },
              [
                comment.reactions?.length
                  ? View(
                      { class: "memo-reactions-badges", attributes: { n: "detached-comment-reaction-badges" } },
                      [
                        For({
                          each: comment.reactions,
                          render(emoji) {
                            return Button(
                              {
                                class: "memo-reaction-badge is-active",
                                attributes: { "data-action": "toggleCommentReaction", "data-comment-id": comment.id, "data-emoji": emoji, n: "detached-comment-reaction-badge", type: "button" },
                              },
                              [emoji],
                            );
                          },
                        }),
                      ],
                    )
                  : null,
                comment.replyCount
                  ? Button(
                      { class: "memo-comment-reply-badge", attributes: { "data-window-comment-action": "openCommentReplies", n: "detached-comment-reply-count", type: "button" } },
                      [comment.replyCount + "条回复"],
                    )
                  : null,
              ],
            ),
          ]),
    ],
  );
}

export function DetachedMemoCardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, RichText, View } = runtime;
  const memo = props.memo;
  return View(
    { as: "article", class: "memo-card memo-window-card", attributes: { "data-memo-id": memo.id, n: "detached-memo-card" } },
    [
      View(
        { as: "header", class: "memo-card-head memo-window-card-head", attributes: { n: "detached-memo-card-header" } },
        [
          View(
            { class: "memo-author", attributes: { n: "detached-memo-author" } },
            [
              View({ class: "memo-avatar", attributes: { n: "detached-memo-avatar" } }, ["U"]),
              View(
                { attributes: { n: "detached-memo-author-details" } },
                [
                  View({ class: "memo-author-name", attributes: { n: "detached-memo-author-name" } }, ["You"]),
                  View({ as: "time", attributes: { datetime: memo.createdAt, n: "detached-memo-time" } }, [memo.relativeTime]),
                  MemoReactionsView({ meaning: "detached-memo", memoId: memo.id, reactions: memo.reactions, runtime }),
                ],
              ),
            ],
          ),
          View(
            { class: "memo-card-meta memo-window-card-meta", attributes: { n: "detached-memo-meta" } },
            [
              View(
                { class: "memo-card-head-actions", attributes: { n: "detached-memo-actions" } },
                [
                  iconActionButton(runtime, { action: "editMemo", icon: "edit", label: "编辑", meaning: "detached-memo-edit" }),
                  iconActionButton(runtime, { action: "copyMemo", icon: "copy", label: "复制", meaning: "detached-memo-copy" }),
                  iconActionButton(runtime, { action: "copyMemoRef", icon: "link", label: "复制引用", meaning: "detached-memo-copy-reference" }),
                  memo.hasHistory ? iconActionButton(runtime, { action: "openMemoHistory", icon: "history", label: "版本历史", meaning: "detached-memo-history" }) : null,
                ],
              ),
              memo.pinned ? View({ as: "span", class: "memo-pin-label", attributes: { n: "detached-memo-pinned" } }, ["置顶"]) : null,
              memo.backlinks ? View({ as: "span", class: "memo-backlink-label", attributes: { n: "detached-memo-backlinks" } }, [memo.backlinks + " 引用"]) : null,
            ],
          ),
        ],
      ),
      View(
        { class: "memo-card-reading" + (memo.headings?.length ? " has-toc" : ""), attributes: { n: "detached-memo-reading" } },
        [
          View(
            { class: "memo-card-reading-main", attributes: { n: "detached-memo-reading-main" } },
            [
              View(
                { class: "memo-content", attributes: { n: "detached-memo-content" } },
                [RichText({ attributes: { n: "detached-memo-rich-text" }, content: memo.html })],
              ),
              MemoStatsView({ meaning: "detached-memo", runtime, stats: memo.stats, tags: memo.tags }),
            ],
          ),
          MemoTocView({ headings: memo.headings, meaning: "detached-memo", runtime }),
        ],
      ),
      props.comments?.length
        ? View(
            { as: "section", class: "memo-window-comments", attributes: { "aria-label": "评论", n: "detached-memo-comments" } },
            [
              View({ class: "memo-window-comments-title", attributes: { n: "detached-memo-comments-title" } }, ["评论"]),
              View(
                { class: "memo-comment-list", attributes: { n: "detached-memo-comment-list" } },
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
          )
        : null,
    ],
  );
}

export function ClipboardCurrentView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Img, View } = runtime;
  if (!props.item?.id) {
    return View(
      { class: "memo-empty-state", attributes: { n: "memo-clipboard-current-empty" } },
      [
        View({ class: "memo-empty-icon", attributes: { n: "memo-clipboard-current-empty-icon" } }, [memoIcon("copy", "memo-clipboard-current-empty-symbol")]),
        View({ as: "h2", attributes: { n: "memo-clipboard-current-empty-title" } }, ["暂无粘贴板内容"]),
        Button(
          { class: "tn-button tn-button--secondary memo-secondary-button", attributes: { "data-action": "clipboardRefresh", n: "memo-clipboard-current-refresh", type: "button" } },
          ["刷新"],
        ),
      ],
    );
  }
  const item = props.item;
  const icon_name = item.type === "image" ? "image" : item.type === "link" ? "link" : "copy";
  return View(
    { as: "article", class: "memo-resource-card memo-clipboard-current is-" + (item.type || "text"), attributes: { n: "memo-clipboard-current" } },
    [
      View(
        { as: "header", class: "memo-clipboard-current-head", attributes: { n: "memo-clipboard-current-header" } },
        [
          View(
            { class: "memo-resource-target memo-clipboard-current-summary", attributes: { n: "memo-clipboard-current-summary" } },
            [
              View({ as: "span", class: "memo-resource-icon", attributes: { n: "memo-clipboard-current-icon" } }, [memoIcon(icon_name, "memo-clipboard-current-symbol")]),
              View(
                { as: "span", class: "memo-resource-body", attributes: { n: "memo-clipboard-current-details" } },
                [
                  View({ as: "span", class: "memo-resource-title", attributes: { n: "memo-clipboard-current-title" } }, ["当前粘贴板的内容"]),
                  View({ as: "span", class: "memo-resource-url", attributes: { n: "memo-clipboard-current-meta" } }, [props.meta]),
                ],
              ),
            ],
          ),
          View(
            { class: "memo-clipboard-current-actions", attributes: { n: "memo-clipboard-current-actions" } },
            [
              iconActionButton(runtime, { action: "clipboardRefresh", class: "tn-button tn-button--secondary memo-secondary-button", icon: "undo2", label: "刷新", meaning: "memo-clipboard-current-refresh", text: "刷新" }),
              iconActionButton(runtime, { action: "clipboardAccept", class: "tn-button tn-button--primary memo-primary-button", disabled: props.working, icon: "plus", label: props.actionLabel, meaning: "memo-clipboard-current-save", text: props.actionLabel }),
            ],
          ),
        ],
      ),
      View(
        { class: "memo-clipboard-current-preview", attributes: { n: "memo-clipboard-current-preview" } },
        [
          item.type === "image" && item.dataURL
            ? Img({ class: "memo-clipboard-current-image", attributes: { alt: "当前粘贴板图片", n: "memo-clipboard-current-image", src: item.dataURL } })
            : View({ as: "pre", class: "memo-clipboard-current-text", attributes: { n: "memo-clipboard-current-text" } }, [item.content || "空内容"]),
        ],
      ),
    ],
  );
}

export function PinDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  const is_set = props.mode === "set";
  return View(
    { class: "pin-dialog-backdrop", attributes: { "data-pin-backdrop": "true", n: "memo-pin-dialog-backdrop" } },
    [
      View(
        { class: "pin-dialog-card", attributes: { n: "memo-pin-dialog" } },
        [
          View({ as: "h2", class: "pin-dialog-title", attributes: { n: "memo-pin-dialog-title" } }, [is_set ? "设置隐私 PIN" : "输入 PIN 解锁"]),
          View({ as: "p", class: "pin-dialog-desc", attributes: { n: "memo-pin-dialog-description" } }, [is_set ? "请设置一个至少 4 位的 PIN 以保护私密内容" : "请输入 PIN 查看私密内容"]),
          props.error
            ? View({ class: "pin-dialog-error", attributes: { n: "memo-pin-dialog-error" } }, [props.error])
            : null,
          Input({ type: "password", placeholder: "输入 PIN", attributes: { autofocus: "autofocus", "data-pin-input": "true", maxlength: "16", n: "memo-pin-input", type: "password" } }),
          View(
            { class: "pin-dialog-actions", attributes: { n: "memo-pin-dialog-actions" } },
            [
              Button({ class: "tn-button tn-button--secondary memo-secondary-button", attributes: { "data-action": "cancelPinDialog", n: "memo-pin-cancel", type: "button" } }, ["取消"]),
              Button({ class: "tn-button tn-button--primary memo-primary-button", attributes: { "data-action": "submitPin", n: "memo-pin-submit", type: "button" } }, [is_set ? "设置" : "解锁"]),
            ],
          ),
        ],
      ),
    ],
  );
}

export function InlinePromptView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  return runtime.Fragment({}, [
    View({ class: "memo-inline-prompt-title", attributes: { n: "memo-inline-prompt-title" } }, [props.title]),
    Input({ class: "memo-inline-prompt-input", type: "text", value: props.value, attributes: { n: "memo-inline-prompt-input", type: "text" } }),
    View(
      { class: "memo-inline-prompt-buttons", attributes: { n: "memo-inline-prompt-actions" } },
      [
        Button({ class: "memo-inline-prompt-cancel", attributes: { n: "memo-inline-prompt-cancel", type: "button" } }, ["取消"]),
        Button({ class: "memo-inline-prompt-ok", attributes: { n: "memo-inline-prompt-confirm", type: "button" } }, ["确认"]),
      ],
    ),
  ]);
}

export function ConfirmDeleteView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, View } = runtime;
  const action_attribute = props.actionAttribute || "data-delete-dialog-action";
  function action(value, label, danger) {
    return Button(
      {
        class: danger
          ? "tn-button tn-button--danger memo-primary-button is-danger"
          : "tn-button tn-button--secondary memo-secondary-button",
        attributes: { [action_attribute]: value, n: props.meaning + "-" + value, type: "button" },
      },
      [label],
    );
  }
  return View(
    { as: "section", class: "tn-dialog tn-dialog--sm tn-dialog--alert memo-delete-panel", attributes: { "aria-modal": "true", n: props.meaning, role: "dialog" } },
    [
      View(
        { as: "header", class: "memo-delete-head", attributes: { n: props.meaning + "-header" } },
        [
          View({ as: "span", class: "memo-delete-icon", attributes: { n: props.meaning + "-icon" } }, [memoIcon("trash2", props.meaning + "-symbol")]),
          View(
            { attributes: { n: props.meaning + "-heading" } },
            [
              View({ as: "h2", attributes: { n: props.meaning + "-title" } }, [props.title]),
              View({ as: "p", attributes: { n: props.meaning + "-description" } }, [props.description]),
            ],
          ),
        ],
      ),
      props.options?.length
        ? View(
            { class: "memo-delete-options", attributes: { n: props.meaning + "-options" } },
            props.options.map(function (option) {
              return View(
                { as: "label", class: "memo-delete-option", attributes: { n: props.meaning + "-option" } },
                [
                  Checkbox({ checked: true, attributes: { [option.attribute]: "true", n: props.meaning + "-option-input" } }),
                  View(
                    { as: "span", attributes: { n: props.meaning + "-option-copy" } },
                    [
                      View({ as: "strong", attributes: { n: props.meaning + "-option-title" } }, [option.title]),
                      View({ as: "small", attributes: { n: props.meaning + "-option-detail" } }, [option.detail]),
                    ],
                  ),
                ],
              );
            }),
          )
        : null,
      View(
        { as: "footer", class: "memo-delete-actions", attributes: { n: props.meaning + "-actions" } },
        [action("cancel", "取消", false), action("confirm", "删除", true)],
      ),
    ],
  );
}

export function SourceEditDialogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, Input, Select, View } = runtime;
  function field(label, control, meaning) {
    return View(
      { class: "memo-form-field", attributes: { n: meaning } },
      [View({ as: "label", attributes: { n: meaning + "-label" } }, [label]), control],
    );
  }
  function text_input(name, value, options = {}) {
    return Input({
      type: "text",
      value,
      placeholder: options.placeholder,
      attributes: {
        "data-source-edit-field": options.readonly ? undefined : "true",
        n: "source-edit-" + name + "-input",
        name: options.readonly ? undefined : name,
        readonly: options.readonly ? "readonly" : undefined,
        type: "text",
      },
    });
  }
  function checkbox(name, checked) {
    return View(
      { class: "memo-form-field", attributes: { n: "source-edit-" + name + "-field" } },
      [
        View(
          { as: "label", attributes: { n: "source-edit-" + name + "-label" } },
          [
            Checkbox({ checked, attributes: { "data-source-edit-field": "true", n: "source-edit-" + name + "-input", name } }),
            " " + name,
          ],
        ),
      ],
    );
  }
  return View(
    { class: "tn-dialog tn-dialog--md memo-dialog-panel", style: { "max-width": "520px" }, attributes: { n: "source-edit-dialog-panel" } },
    [
      View(
        { class: "memo-dialog-head", attributes: { n: "source-edit-dialog-header" } },
        [
          View({ as: "h2", attributes: { n: "source-edit-dialog-title" } }, ["编辑源数据"]),
          Button(
            { class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button", attributes: { "data-source-edit-dialog-close": "true", n: "source-edit-dialog-close", title: "关闭", type: "button" } },
            [memoIcon("x", "source-edit-dialog-close-icon")],
          ),
        ],
      ),
      View(
        { class: "memo-dialog-body", style: { padding: "16px" }, attributes: { n: "source-edit-dialog-body" } },
        [
          View(
            { attributes: { "data-source-edit-form": "true", n: "source-edit-form" } },
            [
              field("memo ID", text_input("id", props.memo.id || "", { readonly: true }), "source-edit-id-field"),
              field("alias", text_input("alias", props.memo.alias || "", { placeholder: "快捷搜索别名" }), "source-edit-alias-field"),
              field("createdAt", text_input("createdAt", props.createdAt), "source-edit-created-field"),
              field("updatedAt", text_input("updatedAt", props.updatedAt), "source-edit-updated-field"),
              field(
                "visibility",
                Select({
                  attributes: { "data-source-edit-field": "true", n: "source-edit-visibility-select", name: "visibility" },
                  options: props.visibilityOptions,
                  placeholder: "可见性",
                  value: props.visibility,
                }),
                "source-edit-visibility-field",
              ),
              checkbox("private", props.private),
              checkbox("pinned", props.memo.pinned),
              checkbox("archived", props.memo.archived),
              field("projectId", text_input("projectId", props.memo.projectId || ""), "source-edit-project-field"),
              field("kind", text_input("kind", props.memo.kind || ""), "source-edit-kind-field"),
              field("taskId", text_input("taskId", props.memo.taskId || ""), "source-edit-task-field"),
              View(
                { class: "memo-dialog-actions", attributes: { n: "source-edit-actions" } },
                [
                  Button(
                    { class: "tn-button tn-button--secondary memo-secondary-button", attributes: { "data-open-file": props.memo.id || "", n: "source-edit-open-file", type: "button" } },
                    [memoIcon("external-link", "source-edit-open-file-icon"), " 打开文件"],
                  ),
                  View({ style: { flex: "1" }, attributes: { n: "source-edit-action-spacer" } }, []),
                  Button({ class: "tn-button tn-button--secondary memo-secondary-button", attributes: { "data-source-edit-dialog-close": "true", n: "source-edit-cancel", type: "button" } }, ["取消"]),
                  Button({ class: "tn-button tn-button--primary memo-primary-button", attributes: { "data-source-edit-save": "true", n: "source-edit-save", type: "button" } }, ["保存"]),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

export function LinksView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, Link, View } = runtime;
  return runtime.Fragment({}, [
    View(
      { class: "memo-links-domain-bar", attributes: { n: "memo-links-domain-bar" } },
      [
        View(
          { class: "memo-domain-input-wrap", attributes: { n: "memo-domain-filter-field" } },
          [
            Input({
              class: "memo-domain-input",
              type: "text",
              value: props.inputValue,
              placeholder: "按域名筛选...",
              attributes: { autocomplete: "off", "data-action": "filterLinksDomainInput", n: "memo-domain-filter-input", type: "text" },
            }),
          ],
        ),
        View(
          { class: "memo-domain-chips", attributes: { n: "memo-domain-filter-chips" } },
          [
            For({
              each: props.chips || [],
              render(domain) {
                return View(
                  { as: "span", class: "memo-domain-chip" + (domain === props.activeDomain ? " is-active" : ""), attributes: { n: "memo-domain-filter-chip" } },
                  [
                    Button({ class: "memo-domain-chip-btn", attributes: { "data-action": "filterLinksDomain", "data-domain": domain, n: "memo-domain-filter-chip-button", type: "button" } }, [domain]),
                    Button(
                      { class: "memo-domain-chip-remove", attributes: { "data-action": "removeLinksDomainChip", "data-domain": domain, n: "memo-domain-filter-chip-remove", title: "移除此筛选域名", type: "button" } },
                      [memoIcon("x", "memo-domain-filter-chip-remove-icon")],
                    ),
                  ],
                );
              },
            }),
            View(
              { as: "span", class: "memo-domain-chip-add", attributes: { n: "memo-domain-filter-add" } },
              [Input({ class: "memo-domain-chip-add-input", type: "text", placeholder: "+ 域名", attributes: { autocomplete: "off", "data-action": "addLinksDomainChip", n: "memo-domain-filter-add-input", type: "text" } })],
            ),
          ],
        ),
      ],
    ),
    props.links?.length
      ? For({
          each: props.links,
          render(link) {
            return View(
              { as: "article", class: "memo-resource-card is-link", attributes: { "data-link-url": link.url, "data-memo-id": link.memoId, n: "link-card" } },
              [
                Link(
                  { class: "memo-resource-target", href: link.href, rel: "noreferrer", target: "_blank", attributes: { "aria-label": "打开链接：" + link.title, n: "link-card-target" } },
                  [
                    View(
                      { as: "span", class: "memo-link-favicon is-fallback", attributes: { "aria-hidden": "true", n: "link-card-favicon" } },
                      [link.favicon],
                    ),
                    View(
                      { as: "span", class: "memo-resource-body", attributes: { n: "link-card-content" } },
                      [
                        View({ as: "span", class: "memo-resource-title" + (link.fetched ? " is-fetched-title" : ""), attributes: { n: "link-card-title" } }, [link.title]),
                        View({ as: "span", class: "memo-resource-url", attributes: { n: "link-card-url" } }, [link.compactUrl]),
                      ],
                    ),
                    View({ as: "span", class: "memo-link-open-cue", attributes: { "aria-hidden": "true", n: "link-card-open-cue" } }, [memoIcon("external-link", "link-card-open-icon")]),
                  ],
                ),
                View(
                  { class: "memo-link-actions", attributes: { "aria-label": "链接操作", n: "link-card-actions", role: "group" } },
                  [
                    iconActionButton(runtime, { action: "copyLink", class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-copy-button", icon: "copy", label: "复制链接", meaning: "link-card-copy" }),
                    iconActionButton(runtime, { action: "fetchLinkTitle", class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-fetch-title-button", icon: "refresh-cw", label: "获取标题", meaning: "link-card-fetch-title" }),
                    iconActionButton(runtime, { action: "openSourceMemo", class: "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-source-button", icon: "eye", label: "来源 memo", meaning: "link-card-open-source" }),
                  ],
                ),
              ],
            );
          },
        })
      : EmptyStateView({ message: "没有匹配的链接", meaning: "memo-links-empty", runtime }),
    props.hasMore
      ? View({ class: "memo-feed-load-more", attributes: { n: "memo-links-load-more" } }, ["加载更多..."])
      : null,
  ]);
}

export function CodeBlocksView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, View } = runtime;
  if (!props.blocks?.length) {
    return EmptyStateView({ message: props.hidden ? "当前筛选隐藏了未标记代码块" : "没有匹配的代码片段", meaning: "memo-code-empty", runtime });
  }
  return runtime.Fragment({}, [
    For({
      each: props.blocks,
      render(block) {
        return View(
          {
            as: "article",
            class: "memo-resource-card is-code " + (block.marked ? "is-snippet" : "is-unmarked"),
            attributes: { "data-code-block-id": block.id, "data-memo-id": block.memoId, n: "code-snippet-card" },
          },
          [
            View(
              { class: "memo-code-block-head", attributes: { n: "code-snippet-header" } },
              [
                View({ as: "span", class: "memo-resource-icon", attributes: { n: "code-snippet-icon" } }, [memoIcon("code", "code-snippet-symbol")]),
                View(
                  { as: "span", class: "memo-resource-body", attributes: { n: "code-snippet-summary" } },
                  [
                    View(
                      { as: "span", class: "memo-resource-title", attributes: { n: "code-snippet-title" } },
                      [block.label, View({ as: "span", class: "memo-code-block-badge", attributes: { n: "code-snippet-marker" } }, [block.marked ? "已标记" : "未标记"])],
                    ),
                    View({ as: "span", class: "memo-resource-url", attributes: { n: "code-snippet-metadata" } }, [block.meta]),
                  ],
                ),
                iconActionButton(runtime, { action: "copyCodeBlock", icon: "copy", label: "复制代码", meaning: "code-snippet-copy" }),
              ],
            ),
            View(
              { as: "pre", class: "memo-code-block-preview", attributes: { n: "code-snippet-preview" } },
              [View({ as: "code", attributes: { "data-code-block-code": "true", n: "code-snippet-content" } }, [block.code || "空代码块"])],
            ),
            View(
              { class: "memo-resource-source", attributes: { n: "code-snippet-source" } },
              [
                Button({ class: "memo-source-reference", attributes: { "data-action": "openSourceMemo", n: "code-snippet-open-source", type: "button" } }, ["来源 Memo"]),
                View({ class: "memo-todo-meta", attributes: { n: "code-snippet-source-metadata" } }, [block.sourceMeta]),
              ],
            ),
          ],
        );
      },
    }),
    props.hasMore
      ? View({ class: "memo-feed-load-more", attributes: { n: "code-snippet-scroll-loader" } }, ["继续向下滚动加载"])
      : null,
  ]);
}

export function FileGridView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Img, View } = runtime;
  if (!props.items?.length) {
    return EmptyStateView({ message: "没有匹配的文件", meaning: "finder-file-empty-state", runtime });
  }
  return View(
    { class: "memo-file-grid", attributes: { "aria-label": "文件图标视图", "data-file-browser-grid": "true", n: "finder-file-grid", role: "grid" } },
    [
      For({
        each: props.items,
        render(item) {
          return Button(
            {
              class: "memo-finder-file",
              attributes: {
                "aria-label": item.name + "，" + item.kindLabel + "，右键查看",
                "aria-selected": "false",
                "data-file-badge": item.badge,
                "data-file-browser-id": item.id,
                "data-file-browser-item": "true",
                "data-file-href": item.href,
                "data-file-kind": item.kind,
                "data-file-url": item.url,
                "data-image-preview-title": item.previewSrc ? item.name : undefined,
                "data-preview-src": item.previewSrc || undefined,
                n: "finder-file-item",
                role: "gridcell",
                title: item.name + "（右键查看）",
                type: "button",
              },
            },
            [
              item.previewSrc
                ? View(
                    { as: "span", class: "memo-finder-file-icon is-thumbnail", attributes: { "aria-hidden": "true", n: "finder-file-thumbnail-frame" } },
                    [Img({ class: "memo-finder-file-thumbnail", attributes: { alt: "", loading: "lazy", n: "finder-file-thumbnail", src: item.previewSrc } })],
                  )
                : View({ as: "span", class: "memo-finder-file-icon", attributes: { "aria-hidden": "true", "data-file-badge": item.badge, n: "finder-file-icon" } }, []),
              View({ as: "span", class: "memo-finder-file-name", attributes: { n: "finder-file-name" } }, [item.name]),
            ],
          );
        },
      }),
    ],
  );
}

export function ImageGridView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Img, View } = runtime;
  if (!props.images?.length) {
    return EmptyStateView({ message: "当前没有图片", meaning: "memo-images-empty", runtime });
  }
  return View(
    { class: "memo-image-grid", attributes: { n: "memo-image-grid" } },
    [
      For({
        each: props.images,
        render(item) {
          return View(
            { as: "article", class: "memo-image-card", attributes: { "data-image-preview-src": item.src, "data-image-preview-title": item.label, "data-memo-id": item.memoId, n: "memo-image-card" } },
            [
              Img({ attributes: { alt: item.label || "image", loading: "lazy", n: "memo-image-card-image", src: item.src } }),
              View(
                { class: "memo-image-card-info", attributes: { n: "memo-image-card-info" } },
                [
                  View({ as: "span", class: "memo-image-card-name", attributes: { n: "memo-image-card-name" } }, [item.label]),
                  View({ as: "span", class: "memo-image-card-source", attributes: { n: "memo-image-card-source" } }, [item.source]),
                ],
              ),
            ],
          );
        },
      }),
    ],
  );
}

export function TaskCollectionsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Checkbox, For, Input, Select, View } = runtime;
  function create_form() {
    if (props.mode === "milestones") {
      return View(
        { class: "memo-task-create", attributes: { "data-gtd-milestone-create-form": "true", n: "gtd-milestone-create-form" } },
        [
          Input({ type: "text", placeholder: "新增阶段目标，例如 v0.2 GTD Inbox", attributes: { autocomplete: "off", n: "gtd-milestone-create-title", name: "title", type: "text" } }),
          Select({ attributes: { "aria-label": "状态", n: "gtd-milestone-create-status", name: "status" }, options: [{ label: "计划中", value: "planned" }, { label: "进行中", value: "active" }], placeholder: "状态", value: "planned" }),
          Input({ type: "date", attributes: { "aria-label": "目标日期", n: "gtd-milestone-create-target", name: "targetAt", type: "date" } }),
          iconActionButton(runtime, { action: "createGTDMilestoneSubmit", class: "tn-button tn-button--primary memo-primary-button", icon: "plus", label: "添加", meaning: "gtd-milestone-create-submit", text: "添加" }),
        ],
      );
    }
    if (props.mode === "items") {
      return View(
        { class: "memo-task-create", attributes: { "data-gtd-item-create-form": "true", n: "gtd-item-create-form" } },
        [
          Input({ type: "text", placeholder: "捕捉开放事项、bug、想法或问题", attributes: { autocomplete: "off", n: "gtd-item-create-title", name: "title", type: "text" } }),
          Select({ attributes: { "aria-label": "事项类型", n: "gtd-item-create-type", name: "type" }, options: [{ label: "想法", value: "idea" }, { label: "功能", value: "feature" }, { label: "Bug", value: "bug" }, { label: "问题", value: "question" }, { label: "杂项", value: "chore" }], placeholder: "事项类型", value: "idea" }),
          Select({ attributes: { "aria-label": "里程碑", n: "gtd-item-create-milestone", name: "milestoneId" }, options: [{ label: "无里程碑", value: "" }].concat((props.milestones || []).map(function (item) { return { label: item.title, value: item.id }; })), placeholder: "无里程碑", value: "" }),
          iconActionButton(runtime, { action: "createGTDItemSubmit", class: "tn-button tn-button--primary memo-primary-button", icon: "plus", label: "添加", meaning: "gtd-item-create-submit", text: "添加" }),
        ],
      );
    }
    return View(
      { class: "memo-task-create", attributes: { "data-task-create-form": "true", n: "task-create-form" } },
      [
        Input({ type: "text", placeholder: "添加任务到 Inbox", attributes: { autocomplete: "off", n: "task-create-title", name: "title", type: "text" } }),
        Select({ attributes: { "aria-label": "优先级", n: "task-create-priority", name: "priority" }, options: [{ label: "无优先级", value: "none" }, { label: "低", value: "low" }, { label: "中", value: "medium" }, { label: "高", value: "high" }], placeholder: "优先级", value: "none" }),
        Input({ type: "date", attributes: { "aria-label": "截止日期", n: "task-create-due", name: "dueAt", type: "date" } }),
        Select({ attributes: { "aria-label": "可见范围", n: "task-create-visibility", name: "visibility" }, options: [{ label: "仅自己", value: "PRIVATE" }, { label: "私密", value: "SECRET" }, { label: "工作区", value: "PROTECTED" }, { label: "公开", value: "PUBLIC" }], placeholder: "可见范围", value: "PRIVATE" }),
        iconActionButton(runtime, { action: "createTaskSubmit", class: "tn-button tn-button--primary memo-primary-button", icon: "plus", label: "添加", meaning: "task-create-submit", text: "添加" }),
      ],
    );
  }
  function card_view(item) {
    const is_task = props.mode === "tasks";
    const is_item = props.mode === "items";
    return View(
      {
        as: "article",
        class: "memo-task-card" + (item.complete ? " is-complete" : "") + " is-priority-" + (item.priority || "none") + (item.private ? " is-private" : ""),
        attributes: {
          [is_task ? "data-task-id" : is_item ? "data-gtd-item-id" : "data-gtd-milestone-id"]: item.id,
          n: props.mode + "-card",
        },
      },
      [
        item.private ? PrivateOverlayView({ label: "仅自己可见", meaning: props.mode + "-card", runtime }) : null,
        props.mode === "milestones"
          ? View({ as: "span", class: "memo-task-check", attributes: { "aria-hidden": "true", n: "gtd-milestone-status-marker" } }, [])
          : Checkbox({
              checked: item.complete,
              class: "memo-task-check memo-todo-checkbox",
              attributes: {
                "aria-label": is_task ? "切换任务完成状态" : "切换事项完成状态",
                [is_task ? "data-task-complete" : "data-gtd-item-complete"]: "true",
                n: is_task ? "task-completion-checkbox" : "gtd-item-completion-checkbox",
              },
            }),
        View(
          { class: "memo-task-body", attributes: { n: props.mode + "-card-body" } },
          [
            View(
              { class: "memo-task-title-row", attributes: { n: props.mode + "-card-title-row" } },
              [
                View({ as: "strong", attributes: { n: props.mode + "-card-title" } }, [item.title]),
                item.badge ? View({ as: "span", class: "memo-task-priority", attributes: { n: props.mode + "-card-badge" } }, [item.badge]) : null,
              ],
            ),
            View(
              { class: "memo-task-meta", attributes: { n: props.mode + "-card-meta" } },
              [
                For({
                  each: item.meta || [],
                  render(meta) {
                    if (meta.action) {
                      return Button(
                        { class: meta.class, attributes: { "data-action": meta.action, "data-comment-id": meta.commentId, "data-completed-at": meta.completedAt, "data-memo-id": meta.memoId, "data-source-comment-id": meta.commentId, "data-source-memo-id": meta.memoId, n: props.mode + "-card-meta-action", title: meta.title, type: "button" } },
                        [meta.label],
                      );
                    }
                    return View({ as: meta.time ? "time" : "span", attributes: { datetime: meta.datetime, n: props.mode + "-card-meta-item" } }, [meta.label]);
                  },
                }),
              ],
            ),
            item.note ? View({ as: "p", class: "memo-task-note", attributes: { n: props.mode + "-card-note" } }, [item.note]) : null,
          ],
        ),
        View(
          { class: "memo-task-actions", attributes: { n: props.mode + "-card-actions" } },
          [
            For({
              each: item.actions || [],
              render(action) {
                return iconActionButton(runtime, {
                  action: action.action,
                  danger: action.danger,
                  icon: action.icon,
                  label: action.label,
                  meaning: props.mode + "-" + action.action,
                });
              },
            }),
          ],
        ),
      ],
    );
  }
  return runtime.Fragment({}, [
    props.hideWorkspace
      ? null
      : View(
          { as: "section", class: "memo-task-workspace", attributes: { n: props.mode + "-workspace" } },
          [
            create_form(),
            props.filters?.length
              ? View(
                  { class: "memo-task-tabs", attributes: { "aria-label": "Task filters", n: "task-filter-tabs", role: "tablist" } },
                  [
                    For({
                      each: props.filters,
                      render(filter) {
                        return Button(
                          { class: "memo-task-tab" + (filter.active ? " is-active" : ""), attributes: { "data-task-filter": filter.value, n: "task-filter-tab", type: "button" } },
                          [View({ as: "span", attributes: { n: "task-filter-label" } }, [filter.label]), View({ as: "strong", attributes: { n: "task-filter-count" } }, [filter.count || ""])],
                        );
                      },
                    }),
                  ],
                )
              : null,
          ],
        ),
    props.groups?.length
      ? For({
          each: props.groups,
          render(group) {
            return View(
              { as: "section", class: "memo-todo-group memo-task-group", attributes: { "aria-label": group.label, n: props.mode + "-group" } },
              [
                View(
                  { class: "memo-todo-group-head", attributes: { n: props.mode + "-group-header" } },
                  [View({ as: "span", attributes: { n: props.mode + "-group-title" } }, [group.label]), View({ as: "strong", attributes: { n: props.mode + "-group-count" } }, [group.items.length])],
                ),
                For({ each: group.items, render: card_view }),
              ],
            );
          },
        })
      : EmptyStateView({ message: "没有匹配的任务", meaning: props.mode + "-empty", runtime }),
  ]);
}

export function BoardPresetsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    { class: "tn-overlay tn-dialog-layer is-open memo-board-presets-overlay", attributes: { "data-board-presets-overlay": "true", n: "board-presets-overlay" } },
    [
      View(
        { class: "tn-dialog tn-dialog--lg memo-board-presets-dialog", attributes: { n: "board-presets-dialog" } },
        [
          View(
            { class: "memo-board-presets-header", attributes: { n: "board-presets-header" } },
            [
              View({ as: "h3", attributes: { n: "board-presets-title" } }, ["选择模板"]),
              Button(
                { class: "memo-board-presets-close", attributes: { "data-action": props.projectId ? "closeProjectBoardPresets" : "closeBoardPresets", n: "board-presets-close", type: "button" } },
                [memoIcon("x", "board-presets-close-icon")],
              ),
            ],
          ),
          View(
            { class: "memo-board-presets-list", attributes: { n: "board-presets-list" } },
            [
              For({
                each: props.presets || [],
                render(preset, index$) {
                  const index = index$?.value ?? 0;
                  return View(
                    { class: "memo-board-preset-item", attributes: { "data-preset-index": index, n: "board-preset-item" } },
                    [
                      View(
                        { class: "memo-board-preset-info", attributes: { n: "board-preset-info" } },
                        [
                          View({ as: "strong", attributes: { n: "board-preset-title" } }, [preset.title]),
                          View(
                            { class: "memo-board-preset-columns", attributes: { n: "board-preset-columns" } },
                            [For({ each: preset.columns || [], render(column) { return View({ as: "span", class: "memo-board-preset-column-tag", attributes: { n: "board-preset-column" } }, [column.label]); } })],
                          ),
                        ],
                      ),
                      Button(
                        {
                          class: "memo-board-preset-use-btn",
                          attributes: {
                            "data-action": props.projectId ? "createProjectBoardFromPreset" : "createBoardFromPreset",
                            "data-preset-index": index,
                            "data-project-id": props.projectId,
                            n: "board-preset-use",
                            type: "button",
                          },
                        },
                        ["使用"],
                      ),
                    ],
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

export function BoardListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  return runtime.Fragment({}, [
    View(
      { class: "memo-board-list", attributes: { n: "board-list" } },
      [
        View(
          { class: "memo-board-list-header", attributes: { n: "board-list-header" } },
          [
            View({ as: "h2", attributes: { n: "board-list-title" } }, ["看板列表"]),
            Button({ class: "memo-board-preset-btn", attributes: { "data-action": "showBoardPresets", n: "board-list-show-presets", type: "button" } }, ["从模板创建"]),
          ],
        ),
        View(
          { class: "memo-board-create-form", attributes: { "data-board-create-form": "true", n: "board-create-form" } },
          [
            Input({ class: "memo-board-create-input", type: "text", placeholder: "输入看板名称快速创建（默认三列）", attributes: { autocomplete: "off", n: "board-create-title", name: "title", type: "text" } }),
            Button({ class: "memo-board-create-submit", attributes: { "data-action": "createBoardSubmit", n: "board-create-submit", type: "button" } }, ["创建"]),
          ],
        ),
        props.boards?.length
          ? View(
              { class: "memo-board-list-items", attributes: { n: "board-list-items" } },
              [
                For({
                  each: props.boards,
                  render(board) {
                    return View(
                      { class: "memo-board-list-item", attributes: { "data-board-id": board.id, n: "board-list-item" } },
                      [
                        View(
                          { class: "memo-board-list-item-info", attributes: { n: "board-list-item-info" } },
                          [View({ as: "strong", attributes: { n: "board-list-item-title" } }, [board.title]), View({ as: "span", attributes: { n: "board-list-item-count" } }, [board.columnCount + " 列"])],
                        ),
                        View(
                          { class: "memo-board-list-item-actions", attributes: { n: "board-list-item-actions" } },
                          [
                            Button({ class: "memo-board-select-btn", attributes: { "data-action": "selectBoard", "data-board-id": board.id, n: "board-list-enter", type: "button" } }, ["进入"]),
                            Button({ class: "memo-board-delete-btn", attributes: { "aria-label": "删除看板", "data-action": "deleteBoard", "data-board-id": board.id, n: "board-list-delete", title: "删除看板", type: "button" } }, [memoIcon("trash2", "board-list-delete-icon")]),
                          ],
                        ),
                      ],
                    );
                  },
                }),
              ],
            )
          : View({ class: "memo-board-list-empty", attributes: { n: "board-list-empty" } }, ["暂无看板，创建一个吧"]),
      ],
    ),
    props.showPresets ? BoardPresetsView({ presets: props.presets, runtime }) : null,
  ]);
}

function BoardCardView(props) {
  const { Checkbox, View } = props.runtime;
  const task = props.task;
  return View(
    {
      class: "memo-board-card" + (task.priority !== "none" ? " is-priority-" + task.priority : "") + (task.complete ? " is-completed" : ""),
      attributes: { "data-board-id": task.boardId, "data-task-id": task.id, draggable: "true", n: "board-task-card" },
    },
    [
      Checkbox({ checked: task.complete, class: "memo-board-card-check memo-todo-checkbox", attributes: { "aria-label": "切换任务完成状态", "data-board-card-complete": "true", n: "board-card-completion-checkbox" } }),
      View(
        { class: "memo-board-card-body-inner", attributes: { n: "board-task-card-body" } },
        [
          View({ class: "memo-board-card-title", attributes: { n: "board-task-card-title" } }, [task.title]),
          task.due
            ? View({ class: "memo-board-card-meta", attributes: { n: "board-task-card-meta" } }, [View({ as: "span", class: "memo-board-card-due", attributes: { n: "board-task-card-due" } }, [task.due])])
            : null,
        ],
      ),
    ],
  );
}

export function BoardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, Select, View } = runtime;
  return runtime.Fragment({}, [
    View(
      { class: "memo-board", attributes: { "data-board-id": props.board.id, n: "board-detail" } },
      [
        View(
          { class: "memo-board-header", attributes: { n: "board-header" } },
          [
            View(
              { class: "memo-board-header-actions", attributes: { n: "board-header-actions" } },
              [
                props.availableTasks?.length
                  ? Select({
                      class: "memo-board-task-select",
                      attributes: { "data-board-id": props.board.id, "data-board-task-select": "true", n: "board-task-select" },
                      options: props.availableTasks.map(function (task) { return { label: task.title, value: task.id }; }),
                      placeholder: "选择待办…",
                      value: "",
                    })
                  : null,
                View(
                  { class: "memo-board-add-task-form", attributes: { "data-board-add-task-form": "true", n: "board-add-task-form" } },
                  [
                    Input({ type: "text", placeholder: "快速添加任务...", attributes: { autocomplete: "off", n: "board-add-task-title", name: "title", type: "text" } }),
                    iconActionButton(runtime, { action: "addBoardTaskSubmit", boardId: props.board.id, class: "memo-board-add-task-submit", icon: "plus", label: "添加任务", meaning: "board-add-task-submit" }),
                  ],
                ),
                iconActionButton(runtime, { action: "refreshBoard", boardId: props.board.id, class: "memo-board-refresh-btn", icon: "refresh-cw", label: "刷新看板", meaning: "board-refresh" }),
                iconActionButton(runtime, { action: "openAddRuleDialog", boardId: props.board.id, class: "memo-board-rules-btn", icon: "plus", label: "添加规则", meaning: "board-add-rule", text: "添加规则" }),
                iconActionButton(runtime, { action: "deleteBoard", boardId: props.board.id, class: "memo-board-delete-board-btn", icon: "trash2", label: "删除看板", meaning: "board-delete" }),
              ],
            ),
          ],
        ),
        View(
          { class: "memo-board-columns", attributes: { n: "board-columns" } },
          [
            For({
              each: props.columns || [],
              render(column) {
                return View(
                  { class: "memo-board-column", attributes: { "data-column-id": column.id, n: "board-column" } },
                  [
                    View(
                      { class: "memo-board-column-header", attributes: { n: "board-column-header" } },
                      [View({ as: "h3", attributes: { n: "board-column-title" } }, [column.label]), View({ as: "span", class: "memo-board-column-count", attributes: { n: "board-column-count" } }, [column.tasks.length])],
                    ),
                    View(
                      { class: "memo-board-column-body", attributes: { "data-column-drop": column.id, n: "board-column-body" } },
                      column.tasks.length
                        ? [For({ each: column.tasks, render(task) { return BoardCardView({ runtime, task }); } })]
                        : [View({ class: "memo-board-empty", attributes: { n: "board-column-empty" } }, ["此列暂无任务"])],
                    ),
                  ],
                );
              },
            }),
          ],
        ),
      ],
    ),
    props.ruleEditor ? BoardRuleEditorView({ ...props.ruleEditor, runtime }) : null,
  ]);
}

function selectOptions(runtime, options, selected, attributes, meaning) {
  return runtime.Select({
    class: "board-rule-editor-select",
    attributes: { ...attributes, n: meaning },
    options,
    placeholder: options[0]?.label || "请选择",
    value: selected,
  });
}

export function BoardRuleConditionRowView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input, View } = runtime;
  const condition = props.condition || { field: "status", operator: "equals", value: "" };
  const show_value = !["isEmpty", "isNotEmpty"].includes(condition.operator);
  return runtime.Fragment({}, [
    selectOptions(runtime, [{ value: "status", label: "status" }, { value: "tags", label: "tags" }, { value: "priority", label: "priority" }], condition.field, { "data-cond-field": "true" }, "board-rule-condition-field"),
    selectOptions(runtime, [{ value: "equals", label: "=" }, { value: "notEquals", label: "!=" }, { value: "contains", label: "包含" }, { value: "notContains", label: "不包含" }, { value: "isEmpty", label: "为空" }, { value: "isNotEmpty", label: "不为空" }], condition.operator, { "data-cond-operator": "true" }, "board-rule-condition-operator"),
    Input({ class: "board-rule-editor-input", type: "text", value: show_value ? condition.value || "" : "", placeholder: "值", style: show_value ? {} : { display: "none" }, attributes: { "data-cond-value": "true", n: "board-rule-condition-value", type: "text" } }),
    Button({ class: "board-rule-item-btn is-danger", attributes: { "data-action": "removeRuleCondition", n: "board-rule-condition-remove", title: "移除条件", type: "button" } }, [memoIcon("x", "board-rule-condition-remove-icon")]),
  ]);
}

export function BoardRuleActionRowView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input } = runtime;
  const action = props.action || { type: "addTags", params: {} };
  let control = null;
  if (action.type === "setStatus") {
    control = selectOptions(runtime, ["open", "completed", "cancelled", "archived"].map(function (value) { return { label: value, value }; }), action.params?.status || "open", { "data-action-status": "true" }, "board-rule-action-status");
  } else if (action.type === "setPriority") {
    control = selectOptions(runtime, ["", "high", "medium", "low"].map(function (value) { return { label: value || "无", value }; }), action.params?.priority || "", { "data-action-priority": "true" }, "board-rule-action-priority");
  } else {
    control = Input({ class: "board-rule-editor-input", type: "text", value: (action.params?.tags || []).join(", "), placeholder: "标签，逗号分隔", attributes: { "data-action-tags": "true", n: "board-rule-action-tags", type: "text" } });
  }
  return runtime.Fragment({}, [
    selectOptions(runtime, [{ value: "addTags", label: "添加标签" }, { value: "removeTags", label: "移除标签" }, { value: "setStatus", label: "设置状态" }, { value: "setPriority", label: "设置优先级" }], action.type, { "data-action-type": "true" }, "board-rule-action-type"),
    control,
    Button({ class: "board-rule-item-btn is-danger", attributes: { "data-action": "removeRuleAction", n: "board-rule-action-remove", title: "移除动作", type: "button" } }, [memoIcon("x", "board-rule-action-remove-icon")]),
  ]);
}

export function BoardRuleEditorView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  const rule = props.rule || { actions: [], conditions: [], enabled: true, name: "", trigger: {} };
  const columns = [{ id: "", label: "任意列" }].concat(props.columns || []);
  return View(
    { class: "board-rule-editor-overlay", attributes: { "data-board-rule-editor-overlay": "true", n: "board-rule-editor-overlay" } },
    [
      View(
        { class: "board-rule-editor-dialog", attributes: { n: "board-rule-editor-dialog" } },
        [
          View(
            { class: "board-rule-editor-header", attributes: { n: "board-rule-editor-header" } },
            [View({ as: "h3", attributes: { n: "board-rule-editor-title" } }, [props.isNew ? "添加规则" : "编辑规则"]), Button({ class: "board-rule-editor-close", attributes: { "data-action": "closeRuleEditor", n: "board-rule-editor-close", type: "button" } }, [memoIcon("x", "board-rule-editor-close-icon")])],
          ),
          View(
            { class: "board-rule-editor-body", attributes: { n: "board-rule-editor-body" } },
            [
              View({ class: "board-rule-editor-section", attributes: { n: "board-rule-name-section" } }, [View({ as: "label", attributes: { n: "board-rule-name-label" } }, ["规则名称"]), Input({ class: "board-rule-editor-input", type: "text", value: rule.name || "", placeholder: "规则名称", attributes: { n: "board-rule-name-input", name: "name", type: "text" } })]),
              View({ class: "board-rule-editor-section", attributes: { n: "board-rule-enabled-section" } }, [View({ as: "label", class: "board-rule-editor-checkbox", attributes: { n: "board-rule-enabled-label" } }, [runtime.Checkbox({ checked: rule.enabled !== false, attributes: { n: "board-rule-enabled-input", name: "enabled" } }), " 启用"])]),
              View(
                { class: "board-rule-editor-section", attributes: { n: "board-rule-trigger-section" } },
                [
                  View({ as: "label", attributes: { n: "board-rule-trigger-label" } }, ["触发条件"]),
                  View(
                    { class: "board-rule-editor-row", attributes: { n: "board-rule-trigger-row" } },
                    [
                      selectOptions(runtime, [{ value: "task.enterColumn", label: "进入列" }], "task.enterColumn", { name: "triggerType" }, "board-rule-trigger-type"),
                      selectOptions(runtime, columns.map(function (column) { return { label: column.label, value: column.id }; }), rule.trigger?.columnId || "", { name: "triggerColumnId" }, "board-rule-trigger-column"),
                      selectOptions(runtime, columns.map(function (column, index) { return { label: index ? column.label : "任意来源列", value: column.id }; }), rule.trigger?.fromColumnId || "", { name: "triggerFromColumnId" }, "board-rule-trigger-source-column"),
                    ],
                  ),
                ],
              ),
              View(
                { class: "board-rule-editor-section", attributes: { n: "board-rule-conditions-section" } },
                [
                  View({ as: "label", attributes: { n: "board-rule-conditions-label" } }, ["条件（全部满足）"]),
                  View(
                    { attributes: { "data-rule-conditions": "true", n: "board-rule-conditions" } },
                    [For({ each: rule.conditions?.length ? rule.conditions : [{}], render(condition) { return View({ class: "board-rule-condition-row", attributes: { n: "board-rule-condition-row" } }, [BoardRuleConditionRowView({ condition, runtime })]); } })],
                  ),
                  Button({ class: "board-rule-add-btn", attributes: { "data-action": "addRuleCondition", n: "board-rule-add-condition", type: "button" } }, [memoIcon("plus", "board-rule-add-condition-icon"), " 加条件"]),
                ],
              ),
              View(
                { class: "board-rule-editor-section", attributes: { n: "board-rule-actions-section" } },
                [
                  View({ as: "label", attributes: { n: "board-rule-actions-label" } }, ["动作"]),
                  View(
                    { attributes: { "data-rule-actions": "true", n: "board-rule-actions" } },
                    [For({ each: rule.actions?.length ? rule.actions : [{}], render(action) { return View({ class: "board-rule-action-row", attributes: { n: "board-rule-action-row" } }, [BoardRuleActionRowView({ action, runtime })]); } })],
                  ),
                  Button({ class: "board-rule-add-btn", attributes: { "data-action": "addRuleAction", n: "board-rule-add-action", type: "button" } }, [memoIcon("plus", "board-rule-add-action-icon"), " 加动作"]),
                ],
              ),
            ],
          ),
          View(
            { class: "board-rule-editor-footer", attributes: { n: "board-rule-editor-footer" } },
            [Button({ class: "tn-button tn-button--secondary memo-secondary-button", attributes: { "data-action": "closeRuleEditor", n: "board-rule-editor-cancel", type: "button" } }, ["取消"]), Button({ class: "tn-button tn-button--primary memo-primary-button", attributes: { "data-action": "saveRule", n: "board-rule-editor-save", type: "button" } }, ["保存"])],
          ),
        ],
      ),
    ],
  );
}

export function BoardRulesOverviewView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, For, View } = runtime;
  return runtime.Fragment({}, [
    View(
      { class: "memo-rules-overview", attributes: { n: "board-rules-overview" } },
      props.boards?.length
        ? [For({ each: props.boards, render(board) { return View(
            { class: "memo-rules-group", attributes: { n: "board-rules-group" } },
            [
              View({ class: "memo-rules-group-header", attributes: { n: "board-rules-group-header" } }, [View({ as: "span", class: "memo-rules-group-title", attributes: { n: "board-rules-group-title" } }, [board.title]), View({ as: "span", class: "memo-rules-group-count", attributes: { n: "board-rules-group-count" } }, [board.rules.length + " 条规则"])]),
              View(
                { class: "memo-rules-group-cards", attributes: { n: "board-rules-cards" } },
                board.rules.length
                  ? [For({ each: board.rules, render(rule) { return View(
                      { class: "memo-rules-card" + (rule.enabled ? "" : " is-disabled"), attributes: { "data-board-id": board.id, "data-rule-id": rule.id, n: "board-rule-card" } },
                      [
                        View({ class: "memo-rules-card-header", attributes: { n: "board-rule-card-header" } }, [View({ class: "memo-rules-card-title-section", attributes: { n: "board-rule-card-title-section" } }, [View({ as: "strong", class: "memo-rules-card-name", attributes: { n: "board-rule-card-name" } }, [rule.name]), View({ as: "span", class: "memo-rules-card-trigger", attributes: { n: "board-rule-card-trigger" } }, [rule.triggerLabel])]), View({ class: "memo-rules-card-toggle", attributes: { n: "board-rule-card-toggle" } }, [View({ as: "label", class: "memo-rules-toggle-label", attributes: { n: "board-rule-card-toggle-label" } }, [Checkbox({ checked: rule.enabled, attributes: { "data-board-id": board.id, "data-rule-id": rule.id, "data-rule-toggle": "true", n: "board-rule-card-toggle-input" } }), View({ as: "span", class: "memo-rules-toggle-text", attributes: { n: "board-rule-card-toggle-text" } }, [rule.enabled ? "启用" : "禁用"])])])]),
                        View({ class: "memo-rules-card-body", attributes: { n: "board-rule-card-body" } }, [rule.conditionLabel ? View({ class: "memo-rules-card-row", attributes: { n: "board-rule-card-condition" } }, [View({ as: "span", class: "memo-rules-card-label", attributes: { n: "board-rule-card-condition-label" } }, ["条件"]), View({ as: "span", attributes: { n: "board-rule-card-condition-value" } }, [rule.conditionLabel])]) : null, View({ class: "memo-rules-card-row", attributes: { n: "board-rule-card-action" } }, [View({ as: "span", class: "memo-rules-card-label", attributes: { n: "board-rule-card-action-label" } }, ["动作"]), View({ as: "span", attributes: { n: "board-rule-card-action-value" } }, [rule.actionLabel])])]),
                        View({ class: "memo-rules-card-actions", attributes: { n: "board-rule-card-actions" } }, [
                          iconActionButton(runtime, { action: "moveRuleUp", boardId: board.id, class: "memo-rules-card-btn", icon: "chevron-up", label: "上移", meaning: "board-rule-move-up", ruleId: rule.id }),
                          iconActionButton(runtime, { action: "moveRuleDown", boardId: board.id, class: "memo-rules-card-btn", icon: "chevron-down", label: "下移", meaning: "board-rule-move-down", ruleId: rule.id }),
                          iconActionButton(runtime, { action: "editRule", boardId: board.id, class: "memo-rules-card-btn", icon: "edit", label: "编辑", meaning: "board-rule-edit", ruleId: rule.id }),
                          iconActionButton(runtime, { action: "deleteRule", boardId: board.id, class: "memo-rules-card-btn is-danger", icon: "trash2", label: "删除", meaning: "board-rule-delete", ruleId: rule.id }),
                        ]),
                      ],
                    ); } })]
                  : [View({ class: "memo-rules-group-empty", attributes: { n: "board-rules-group-empty" } }, ["暂无规则 — ", Button({ class: "memo-rules-add-link", attributes: { "data-action": "openAddRuleDialog", "data-board-id": board.id, n: "board-rules-add", type: "button" } }, ["添加规则"])])],
              ),
            ],
          ); } })]
        : [View({ class: "memo-rules-empty", attributes: { n: "board-rules-empty" } }, ["暂无看板。请先创建看板。"])],
    ),
    props.ruleEditor ? BoardRuleEditorView({ ...props.ruleEditor, runtime }) : null,
  ]);
}
