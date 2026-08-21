import { HomePageModel } from "./index.model.js";

const FILTERS = Object.freeze([
  { element: "allNavCount", icon: "hash", id: "all", label: "全部" },
  { icon: "pin", id: "pinned", label: "置顶" },
  { icon: "lock", id: "private", label: "仅自己" },
  { icon: "globe", id: "public", label: "公开" },
  { icon: "archive", id: "archive", label: "归档" },
]);

const COLLECTIONS = Object.freeze([
  {
    count: "data-todo-nav-count",
    element: "todoNavCount",
    icon: "check",
    id: "todos",
    label: "代办",
  },
  {
    count: "data-item-nav-count",
    element: "itemNavCount",
    icon: "hash",
    id: "items",
    label: "事项",
  },
  {
    count: "data-milestone-nav-count",
    element: "milestoneNavCount",
    icon: "clock",
    id: "milestones",
    label: "里程碑",
  },
  {
    count: "data-link-nav-count",
    element: "linkNavCount",
    icon: "link",
    id: "links",
    label: "超链接",
  },
  {
    count: "data-code-nav-count",
    element: "codeNavCount",
    icon: "code",
    id: "codeblocks",
    label: "代码片段",
  },
  {
    count: "data-file-nav-count",
    element: "fileNavCount",
    icon: "paperclip",
    id: "files",
    label: "文件",
  },
  {
    count: "data-image-nav-count",
    element: "imageNavCount",
    icon: "image",
    id: "images",
    label: "图片",
  },
  {
    count: "data-clipboard-nav-count",
    element: "clipboardNavCount",
    icon: "copy",
    id: "clipboard",
    label: "粘贴板",
  },
  {
    count: "data-board-nav-count",
    element: "boardNavCount",
    icon: "columns",
    id: "boards",
    label: "看板",
  },
  {
    count: "data-rules-nav-count",
    element: "rulesNavCount",
    icon: "workflow",
    id: "rules",
    label: "流程配置",
  },
  { count: "data-chat-nav-count", icon: "comment", id: "chat", label: "Chat" },
]);

/** @param {import("./home.models").HomePageProps} props */
export function HomePageView(props) {
  const vm$ = HomePageModel(props);

  return View(
    {
      class: "memo-shell home-page-shell w-full h-full",
      dataset: {
        name: props.view.name,
        pathname: props.view.pathname,
      },
      onClick(event) {
        vm$.methods.handleClick(event);
      },
      onMounted() {
        vm$.methods.init();
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          as: "aside",
          class: "memo-sidebar",
          attributes: { "aria-label": "Memo navigation", n: "home-sidebar" },
        },
        [
          View(
            {
              class: "memo-sidebar-scroll",
              attributes: { n: "home-sidebar-scroll-content" },
            },
            [
              View({ class: "memo-brand", attributes: { n: "memo-brand" } }, [
                View(
                  {
                    class: "memo-brand-mark",
                    attributes: { n: "memo-brand-mark" },
                  },
                  [
                    Img({
                      attributes: {
                        alt: "",
                        n: "memo-brand-logo",
                        src: "/public/threadnote-logo.svg",
                      },
                    }),
                  ],
                ),
                View({ attributes: { n: "memo-brand-copy" } }, [
                  View(
                    {
                      class: "memo-brand-title",
                      attributes: { n: "memo-brand-title" },
                    },
                    ["ThreadNote"],
                  ),
                  View(
                    {
                      class: "memo-brand-subtitle",
                      attributes: { n: "memo-brand-subtitle" },
                    },
                    ["Local workspace"],
                  ),
                ]),
              ]),
              View(
                {
                  as: "nav",
                  class: "memo-nav",
                  attributes: {
                    "aria-label": "Memo filters",
                    n: "memo-filter-navigation",
                  },
                },
                [
                  For({
                    each: FILTERS,
                    render(item) {
                      return Timeless.Button(
                        {
                          class: Timeless.classNames([
                            "memo-nav-button",
                            // Timeless.combine(
                            //   {
                            //     activeFilter: state.activeFilter,
                            //     activeTag: state.activeTag,
                            //     activeView: state.activeView,
                            //   },
                            //   (value) => {
                            //     return (
                            //       "memo-nav-button" +
                            //       (value.activeView === "memos" &&
                            //       value.activeFilter === item.filter &&
                            //       !value.activeTag
                            //         ? " is-active"
                            //         : "")
                            //     );
                            //   },
                            // ),
                          ]),
                          attributes: {
                            "data-filter": item.filter,
                            "data-view": item.view,
                            n: "memo-navigation-" + item.id,
                            type: "button",
                          },
                        },
                        [
                          Timeless.Icon({ name: item.icon }),
                          View(
                            {
                              attributes: {
                                n: "memo-navigation-" + item.id + "-label",
                              },
                            },
                            [item.label],
                          ),
                          Show({
                            when: ref(item.id === "all"),
                            ok() {
                              return View(
                                {
                                  as: "strong",
                                  attributes: {
                                    "data-all-nav-count": "true",
                                    n: "all-memo-count",
                                  },
                                },
                                [
                                  // ui?.[item.element] || ""
                                ],
                              );
                            },
                            else() {
                              return Show({
                                when: ref(Boolean(item.count)),
                                ok() {
                                  return View(
                                    {
                                      as: "strong",
                                      attributes: {
                                        [item.count]: "true",
                                        n:
                                          "memo-navigation-" +
                                          item.id +
                                          "-count",
                                      },
                                    },
                                    [
                                      // ui?.[item.element] || ""
                                    ],
                                  );
                                },
                              });
                            },
                          }),
                        ],
                      );
                    },
                  }),
                ],
              ),
              View(
                {
                  class: "memo-sidebar-section",
                  attributes: { n: "memo-project-navigation-section" },
                },
                [
                  View(
                    {
                      class: "memo-sidebar-heading",
                      attributes: { n: "memo-project-navigation-heading" },
                    },
                    [
                      View(
                        {
                          as: "span",
                          attributes: { n: "memo-project-navigation-title" },
                        },
                        ["Projects"],
                      ),
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
                        [
                          // memoIcon("plus", "memo-project-create-icon")
                        ],
                      ),
                    ],
                  ),
                  View(
                    {
                      class: "memo-project-list",
                      attributes: {
                        "data-project-list": "true",
                        n: "memo-project-list",
                      },
                    },
                    [],
                  ),
                ],
              ),
              View(
                {
                  class: "memo-sidebar-section",
                  attributes: { n: "memo-collection-navigation-section" },
                },
                [
                  View(
                    {
                      class: "memo-sidebar-heading",
                      attributes: { n: "memo-collection-navigation-heading" },
                    },
                    [
                      View(
                        {
                          as: "span",
                          attributes: { n: "memo-collection-navigation-title" },
                        },
                        ["聚合"],
                      ),
                    ],
                  ),
                  View(
                    {
                      as: "nav",
                      class: "memo-nav memo-collection-nav",
                      attributes: {
                        "aria-label": "Memo collections",
                        n: "memo-collection-navigation",
                      },
                    },
                    [
                      For({
                        each: COLLECTIONS,
                        render(item) {
                          return Timeless.Button({}, [
                            Timeless.Icon({ name: item.icon }),
                            View({}, [item.label]),
                          ]);
                        },
                      }),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "memo-sidebar-section",
                  attributes: { n: "memo-tag-navigation-section" },
                },
                [
                  View(
                    {
                      class: "memo-sidebar-heading",
                      attributes: { n: "memo-tag-navigation-heading" },
                    },
                    [
                      View(
                        {
                          as: "span",
                          attributes: { n: "memo-tag-navigation-title" },
                        },
                        ["标签"],
                      ),
                      View(
                        {
                          as: "span",
                          attributes: {
                            "data-tag-summary": "true",
                            n: "memo-tag-summary",
                          },
                        },
                        [
                          // ui.tagSummary || ""
                        ],
                      ),
                    ],
                  ),
                  View(
                    {
                      class: "memo-tag-list",
                      attributes: {
                        "data-tag-list": "true",
                        n: "memo-tag-list",
                      },
                    },
                    [],
                  ),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-sidebar-footer",
              attributes: { n: "home-sidebar-footer" },
            },
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
                  // memoIcon("settings", "home-sidebar-settings-icon"),
                  View(
                    {
                      as: "span",
                      attributes: { n: "home-sidebar-settings-label" },
                    },
                    ["设置"],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "home-page-subviews min-w-0 h-full",
          style: { position: "relative" },
        },
        [Timeless.ui.KeepAliveSubViews(props)],
      ),
    ],
  );
}
