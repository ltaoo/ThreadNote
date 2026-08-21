import { HomePageModel } from "./index.model.js";

const FILTERS = Object.freeze([
  { count: "allNavCount", icon: "grid-3x3", id: "all", label: "全部" },
  { icon: "arrow-down-to-line", id: "pinned", label: "置顶" },
  { icon: "file-lock", id: "private", label: "仅自己" },
  { icon: "rss", id: "public", label: "公开" },
  { icon: "inbox", id: "archive", label: "归档" },
]);

const COLLECTIONS = Object.freeze([
  {
    count: "data-todo-nav-count",
    element: "todoNavCount",
    icon: "check",
    id: "todos",
    label: "待办",
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
    icon: "file-symlink",
    id: "links",
    label: "超链接",
  },
  {
    count: "data-code-nav-count",
    element: "codeNavCount",
    icon: "braces",
    id: "codeblocks",
    label: "代码片段",
  },
  {
    count: "data-file-nav-count",
    element: "fileNavCount",
    icon: "file",
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
    icon: "panel-left",
    id: "boards",
    label: "看板",
  },
  {
    count: "data-rules-nav-count",
    element: "rulesNavCount",
    icon: "git-fork",
    id: "rules",
    label: "流程配置",
  },
  {
    count: "data-chat-nav-count",
    element: "chatNavCount",
    icon: "message-square-more",
    id: "chat",
    label: "Chat",
  },
]);

function filterButtonClass(vm$, filter) {
  return Timeless.combine(
    {
      activeFilter: vm$.state.activeFilter,
      activeProjectId: vm$.ui.activeProjectId,
      activeTag: vm$.state.activeTag,
      activeView: vm$.state.activeView,
    },
    function (state) {
      const active =
        state.activeView === "memos" &&
        state.activeFilter === filter &&
        !state.activeProjectId &&
        !state.activeTag;
      return "memo-nav-button" + (active ? " is-active" : "");
    },
  );
}

function collectionButtonClass(vm$, view) {
  return computed(vm$.state.activeView, function (active_view) {
    return "memo-nav-button" + (active_view === view ? " is-active" : "");
  });
}

function projectButtonClass(vm$, project_id) {
  return Timeless.combine(
    {
      activeProjectId: vm$.ui.activeProjectId,
      activeView: vm$.state.activeView,
    },
    function (state) {
      const active =
        state.activeView === "memos" &&
        state.activeProjectId === project_id;
      return "memo-nav-button memo-project-item" +
        (active ? " is-active" : "");
    },
  );
}

function tagButtonClass(vm$, tag) {
  return Timeless.combine(
    {
      activeTag: vm$.state.activeTag,
      activeView: vm$.state.activeView,
    },
    function (state) {
      const active = state.activeView === "memos" && state.activeTag === tag;
      return "memo-tag-filter" + (active ? " is-active" : "");
    },
  );
}

function SidebarFilters(vm$) {
  return View(
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
          const children = [
            Timeless.Icon({
              attributes: { n: `memo-navigation-${item.id}-icon` },
              name: item.icon,
              size: 16,
            }),
            View(
              {
                as: "span",
                attributes: { n: `memo-navigation-${item.id}-label` },
              },
              [item.label],
            ),
          ];
          if (item.count) {
            children.push(
              View(
                {
                  as: "strong",
                  attributes: {
                    "data-all-nav-count": "true",
                    n: "all-memo-count",
                  },
                },
                [vm$.ui[item.count]],
              ),
            );
          }
          return Timeless.Button(
            {
              class: filterButtonClass(vm$, item.id),
              attributes: {
                "data-filter": item.id,
                n: `memo-navigation-${item.id}`,
                type: "button",
              },
            },
            children,
          );
        },
      }),
    ],
  );
}

function SidebarProjects(vm$) {
  const empty_ = computed(vm$.ui.projects, function (projects) {
    return projects.length === 0;
  });
  return View(
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
          Timeless.Button(
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
              Timeless.Icon({
                attributes: { n: "memo-project-create-icon" },
                name: "plus",
                size: 14,
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-project-list",
          attributes: { n: "memo-project-list" },
        },
        [
          Show({
            when: empty_,
            ok() {
              return View(
                {
                  class: "memo-sidebar-empty",
                  attributes: { n: "memo-project-list-empty" },
                },
                ["暂无 Project"],
              );
            },
          }),
          For({
            each: vm$.ui.projects,
            render(project) {
              return Timeless.Button(
                {
                  class: projectButtonClass(vm$, project.id),
                  attributes: {
                    "data-project-detail": project.id,
                    n: "memo-project-navigation-item",
                    title: project.name,
                    type: "button",
                  },
                },
                [
                  View({
                    as: "span",
                    class: "memo-project-dot",
                    style: { "--project-color": project.color },
                    attributes: { n: "memo-project-navigation-color" },
                  }),
                  View(
                    {
                      as: "span",
                      attributes: { n: "memo-project-navigation-name" },
                    },
                    [project.name],
                  ),
                  View(
                    {
                      as: "strong",
                      attributes: { n: "memo-project-navigation-count" },
                    },
                    [project.count],
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

function SidebarCollections(vm$) {
  return View(
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
              return Timeless.Button(
                {
                  class: collectionButtonClass(vm$, item.id),
                  attributes: {
                    "data-view": item.id,
                    n: `memo-navigation-${item.id}`,
                    type: "button",
                  },
                },
                [
                  Timeless.Icon({
                    attributes: { n: `memo-navigation-${item.id}-icon` },
                    name: item.icon,
                    size: 16,
                  }),
                  View(
                    {
                      as: "span",
                      attributes: { n: `memo-navigation-${item.id}-label` },
                    },
                    [item.label],
                  ),
                  View(
                    {
                      as: "strong",
                      attributes: {
                        [item.count]: "true",
                        n: `memo-navigation-${item.id}-count`,
                      },
                    },
                    [vm$.ui[item.element]],
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

function SidebarTags(vm$) {
  const empty_ = computed(vm$.ui.tags, function (tags) {
    return tags.length === 0;
  });
  return View(
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
            [vm$.ui.tagSummary],
          ),
        ],
      ),
      View(
        {
          class: "memo-tag-list",
          attributes: { n: "memo-tag-list" },
        },
        [
          Show({
            when: empty_,
            ok() {
              return View(
                {
                  class: "memo-empty-mini",
                  attributes: { n: "memo-tag-list-empty" },
                },
                ["暂无标签"],
              );
            },
          }),
          For({
            each: vm$.ui.tags,
            render(item) {
              return Timeless.Button(
                {
                  class: tagButtonClass(vm$, item.tag),
                  attributes: {
                    "data-tag": item.tag,
                    n: "memo-tag-filter",
                    type: "button",
                  },
                },
                [
                  View(
                    {
                      as: "span",
                      attributes: { n: "memo-tag-filter-label" },
                    },
                    ["#" + item.tag],
                  ),
                  View(
                    {
                      as: "span",
                      attributes: { n: "memo-tag-filter-count" },
                    },
                    [item.count],
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

function HomeSidebar(vm$) {
  return View(
    {
      as: "aside",
      class: "memo-sidebar",
      attributes: { "aria-label": "Memo navigation", n: "home-sidebar" },
    },
    [
      View(
        {
          class: "memo-sidebar-scroll tn-scrollbar-hidden",
          attributes: { n: "home-sidebar-scroll-content" },
        },
        [
          View(
            { class: "memo-brand", attributes: { n: "memo-brand" } },
            [
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
              View(
                { attributes: { n: "memo-brand-copy" } },
                [
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
                ],
              ),
            ],
          ),
          SidebarFilters(vm$),
          SidebarProjects(vm$),
          SidebarCollections(vm$),
          SidebarTags(vm$),
        ],
      ),
      View(
        {
          class: "memo-sidebar-footer",
          attributes: { n: "home-sidebar-footer" },
        },
        [
          Timeless.Button(
            {
              class: "memo-nav-button memo-settings-button",
              attributes: {
                "data-action": "openSettings",
                n: "home-sidebar-settings",
                type: "button",
              },
            },
            [
              Timeless.Icon({
                attributes: { n: "home-sidebar-settings-icon" },
                name: "settings",
                size: 16,
              }),
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
  );
}

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
      attributes: { n: "home-workspace-shell" },
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
      HomeSidebar(vm$),
      View(
        {
          class: "home-page-subviews min-w-0 h-full",
          attributes: { n: "home-workspace-content" },
        },
        [Timeless.ui.KeepAliveSubViews(props)],
      ),
    ],
  );
}
