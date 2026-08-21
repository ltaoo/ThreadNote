import { findTaskColumn } from "@/domain/board-rules.js";
import { errorMessage } from "@/domain/memo-repository.js";
import {
  createProjectInVault,
  loadProjects,
  loadProjectsFromVault,
  saveProjects,
} from "@/domain/memo-repository.js";
import {
  normalizeProjectFilter,
  normalizeProjectID,
  normalizeProjectPayload,
  projectThemeColor,
} from "@/domain/projects.js";
import { ProjectDetailPaginationModel } from "@/project-detail-pagination-model.js";
import { TimelessPrimitive } from "@/timeless-icons.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { MemoFeedView } from "./home_memo.js";
import { BoardPresetsView } from "./home_board.js";
import { HomeTodoContentView as TaskCollectionsView } from "./home_todo.js";
import {
  EmptyStateView,
  memoIcon,
  reactiveWhen,
} from "./home_view_shared.js";

const LAST_PROJECT_STORAGE_KEY = "demo-desktop:memos:last-project:v1";

export function HomeProjectListContentView(props) {
  return ProjectListView(props);
}

export function HomeProjectContentView(props) {
  return ProjectDetailView(props);
}

export function createHomeProjectState() {
  return {
    activeProjectFilter: "all",
    activeProjectId: "",
    projectActiveTab: "memos",
    composerProjectId: "",
    lastComposerProjectId: localStorage.getItem(LAST_PROJECT_STORAGE_KEY) || "",
    projects: loadProjects(),
  };
}

export function createHomeProjectController(options) {
  const { elements, state, ui } = options;
  const pagination_model = new ProjectDetailPaginationModel();
  let scroll_observer = null;

  function render_all() {
    options.renderAll();
  }

  function toast(message) {
    options.showToast(message);
  }

  function project_memo_count(project_id) {
    return state.memos.filter(
      (memo) => memo.projectId === project_id && !memo.archived,
    ).length;
  }

  function project_label(project_id) {
    const id = normalizeProjectID(project_id);
    if (!id) return "未归属";
    return state.projects.find((project) => project.id === id)?.name ||
      "未知 Project";
  }

  function project_options_presentation() {
    return state.projects
      .filter((project) => !project.archived)
      .map((project) => ({
        color: projectThemeColor(project.color),
        label: project.name,
        value: project.id,
      }));
  }

  function memo_project_presentation(project_id) {
    const id = normalizeProjectID(project_id);
    if (!id) return null;
    const project = state.projects.find((item) => item?.id === id);
    return {
      color: projectThemeColor(project?.color),
      name: project?.name || "未知 Project",
    };
  }

  function render_projects() {
    const projects = state.projects.filter((project) => !project.archived);
    if (elements.projectList) {
      renderTimelessView(
        elements.projectList,
        ProjectListView({
          projects: projects.map((project) => ({
            active:
              state.activeView === "project-detail" &&
              state.activeProjectId === project.id,
            color: projectThemeColor(project.color),
            count: project_memo_count(project.id),
            id: project.id,
            name: project.name,
          })),
        }),
      );
    }
    if (!elements.projectFilterSelect) return;
    const current_value = elements.projectFilterSelect.value;
    renderTimelessView(
      elements.projectFilterSelect,
      ProjectOptionsView({
        baseOptions: [
          {
            count: state.memos.filter((memo) => !memo.archived).length,
            kind: "all",
            label: "全部",
            value: "all",
          },
          {
            count: state.memos.filter(
              (memo) => !memo.projectId && !memo.archived,
            ).length,
            kind: "unassigned",
            label: "未归属",
            value: "unassigned",
          },
        ],
        projects: projects.map((project) => ({
          color: projectThemeColor(project.color),
          count: project_memo_count(project.id),
          label: project.name,
          value: project.id,
        })),
        selected: current_value,
      }),
    );
    const exists = Array.from(elements.projectFilterSelect.options || []).some(
      (option) => option.value === current_value,
    );
    let selected_value = state.activeProjectFilter || "all";
    if (exists) selected_value = current_value;
    elements.projectFilterSelect.value = selected_value;
  }

  function render_composer_project_select() {
    if (!elements.projectSelect) return;
    renderTimelessView(
      elements.projectSelect,
      ProjectOptionsView({
        projects: project_options_presentation(),
        selected: state.composerProjectId,
      }),
    );
    elements.projectSelect.value = state.composerProjectId || "";
  }

  function disconnect_scroll_observer() {
    scroll_observer?.disconnect();
    scroll_observer = null;
  }

  function observe_scroll_loader() {
    disconnect_scroll_observer();
    if (
      typeof window.IntersectionObserver !== "function" ||
      !["memos", "tasks"].includes(state.projectActiveTab)
    ) {
      return;
    }
    const collection = state.projectActiveTab;
    const loader = elements.memoList.querySelector(
      `[data-project-scroll-loader="${collection}"]`,
    );
    const container = elements.memoList.parentElement;
    if (!loader || !container) return;
    scroll_observer = new window.IntersectionObserver(
      function (entries) {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (
          !visible ||
          state.activeView !== "project-detail" ||
          state.projectActiveTab !== collection
        ) {
          return;
        }
        if (pagination_model.loadNext(collection)) render_project_detail();
      },
      { root: container, rootMargin: "0px 0px 80px 0px" },
    );
    scroll_observer.observe(loader);
  }

  function render_project_detail() {
    elements.memoMain?.classList.remove("is-project-board-active");
    const project = state.projects.find(
      (item) => item.id === state.activeProjectId && !item.archived,
    );
    if (!project) {
      disconnect_scroll_observer();
      renderTimelessView(
        elements.memoList,
        EmptyStateView({
          meaning: "project-detail-empty",
          message: "项目不存在或已归档",
        }),
      );
      return;
    }
    if (elements.topbarProjectActions) {
      renderTimelessView(
        elements.topbarProjectActions,
        ProjectActionsView({ projectId: project.id }),
      );
    }
    const selection = pagination_model.select({
      memos: state.memos,
      projectId: state.activeProjectId,
      query: state.query,
      tasks: state.tasks,
    });
    const boards = state.boards.filter(
      (board) => board.projectId === state.activeProjectId,
    );
    const board_active = boards.some(
      (board) => board.id === state.projectActiveTab,
    );
    elements.memoMain?.classList.toggle(
      "is-project-board-active",
      board_active,
    );
    if (board_active && elements.memoMain) elements.memoMain.scrollTop = 0;
    ui.mainTitle.as(project.name);
    ui.mainSubtitle.as(
      `${selection.memos.total} 条 memo · ${selection.tasks.total} 个待办`,
    );

    const board_presentations = boards.map(function (board) {
      const tasks_by_column = Object.fromEntries(
        board.columns.map((column) => [column.id, []]),
      );
      const board_task_ids = new Set();
      state.tasks.forEach(function (task) {
        if (task.boardId !== board.id) return;
        const column = findTaskColumn(board, task);
        const column_id = column?.id || board.columns[0]?.id;
        if (!tasks_by_column[column_id]) return;
        tasks_by_column[column_id].push(task);
        board_task_ids.add(task.id);
      });
      const available_tasks = selection.allTasks
        .filter((task) => !board_task_ids.has(task.id))
        .map(options.taskPresentation);
      return {
        columnCount: board.columns.length,
        id: board.id,
        title: board.title,
        view: options.boardView(board, tasks_by_column, available_tasks),
      };
    });

    renderTimelessView(
      elements.memoList,
      ProjectDetailView({
        activeTab: state.projectActiveTab,
        boards: board_presentations,
        memoHasMore: selection.memos.hasMore,
        memos: selection.memos.items.map(options.safeMemoView),
        memoTotal: selection.memos.total,
        presets: state.boardPresets,
        projectId: project.id,
        projects: project_options_presentation(),
        query: state.query,
        showPresets: Boolean(
          state.boardPresetsOpen && state.boardPresetsProjectId,
        ),
        taskHasMore: selection.tasks.hasMore,
        tasks: selection.tasks.items.map(options.taskPresentation),
        taskTotal: selection.tasks.total,
      }),
    );
    options.syncMemoExpandControls();
    observe_scroll_loader();
  }

  function remember_composer_project(project_id) {
    state.lastComposerProjectId = project_id || "";
    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, state.lastComposerProjectId);
  }

  function select_project_filter(value) {
    const next = normalizeProjectFilter(value);
    options.clearRetainedCompletedTasks();
    state.activeView = "memos";
    state.activeProjectId = "";
    state.activeProjectFilter = next;
    state.activeTag = "";
    options.clearSelectedDate();
    if (next === "unassigned") state.composerProjectId = "";
    else if (next !== "all") {
      state.composerProjectId = next;
      remember_composer_project(next);
    } else state.composerProjectId = state.lastComposerProjectId || "";
    render_all();
  }

  function open_project_detail(project_id) {
    options.clearRetainedCompletedTasks();
    state.activeView = "project-detail";
    state.activeProjectId = project_id;
    state.activeFilter = "all";
    state.activeTag = "";
    state.editingId = "";
    state.editPreviewVisible = false;
    state.projectActiveTab = "memos";
    state.commentPreviewVisible = false;
    state.commentingMemoId = "";
    state.commentDraft = "";
    state.query = "";
    options.clearSelectedDate();
    state.linksDomainFilter = "";
    if (elements.memoList.parentElement) {
      elements.memoList.parentElement.scrollTop = 0;
    }
    render_all();
  }

  function select_project_tab(tab_id) {
    state.projectActiveTab = tab_id;
    if (elements.memoList.parentElement) {
      elements.memoList.parentElement.scrollTop = 0;
    }
    render_project_detail();
  }

  function close_project_detail() {
    state.activeView = "memos";
    state.activeProjectId = "";
    render_all();
  }

  function resolve_or_create_project(name) {
    const existing = state.projects.find(
      (project) => !project.archived && project.name === name,
    );
    if (existing) return Promise.resolve(existing.id);
    return createProjectInVault(name).then(function (project) {
      const normalized = normalizeProjectPayload(project);
      if (!normalized) return "";
      state.projects = state.projects.concat(normalized);
      saveProjects(state.projects);
      render_projects();
      return normalized.id;
    });
  }

  function refresh_projects() {
    return loadProjectsFromVault().then(
      function (payload) {
        state.projects = payload.projects
          .map(normalizeProjectPayload)
          .filter(Boolean);
        saveProjects(state.projects);
        render_all();
      },
      (error) => toast("读取 project 失败: " + errorMessage(error)),
    );
  }

  function create_project() {
    options.showPrompt("Project 名称", "").then(function (name) {
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return toast("Project 名称不能为空");
      createProjectInVault(trimmed).then(
        function (project) {
          const normalized = normalizeProjectPayload(project);
          if (!normalized) return;
          state.projects = state.projects.concat(normalized);
          saveProjects(state.projects);
          render_projects();
          toast("已创建 Project");
        },
        (error) => toast("创建 Project 失败: " + errorMessage(error)),
      );
    });
  }

  function edit_project(project_id) {
    const project = state.projects.find((item) => item.id === project_id);
    if (!project) return;
    options.showPrompt("编辑 Project 名称", project.name).then(function (name) {
      const trimmed = name?.trim();
      if (!trimmed || trimmed === project.name) return;
      state.projects = state.projects.map(function (item) {
        if (item.id === project_id) {
          return {
            ...item,
            name: trimmed,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });
      saveProjects(state.projects);
      render_all();
    });
  }

  function archive_project(project_id) {
    const project = state.projects.find((item) => item.id === project_id);
    if (!project) return;
    state.projects = state.projects.map(function (item) {
      if (item.id === project_id) {
        return {
          ...item,
          archived: true,
          updatedAt: new Date().toISOString(),
        };
      }
      return item;
    });
    saveProjects(state.projects);
    state.activeView = "memos";
    state.activeProjectId = "";
    toast("已归档 Project: " + project.name);
    render_all();
  }

  return {
    archiveProjectFromDetail: archive_project,
    createProjectFromPrompt: create_project,
    destroy: disconnect_scroll_observer,
    disconnectProjectScrollObserver: disconnect_scroll_observer,
    editProjectFromDetail: edit_project,
    loadNext: (collection) => pagination_model.loadNext(collection),
    memoProjectPresentation: memo_project_presentation,
    closeProjectDetail: close_project_detail,
    openProjectDetail: open_project_detail,
    projectLabel: project_label,
    projectOptionsPresentation: project_options_presentation,
    refreshProjectsFromVault: refresh_projects,
    rememberComposerProject: remember_composer_project,
    renderComposerProjectSelect: render_composer_project_select,
    renderProjectDetail: render_project_detail,
    renderProjects: render_projects,
    resolveOrCreateProjectByName: resolve_or_create_project,
    selectProjectFilter: select_project_filter,
    selectProjectTab: select_project_tab,
  };
}

export function ProjectListView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.projects?.length) {
    return View(
      {
        class: "memo-sidebar-empty",
        attributes: { n: "memo-project-list-empty" },
      },
      ["暂无 Project"],
    );
  }
  return runtime.Fragment({}, [
    For({
      each: props.projects,
      render(project) {
        const class_name_ = computed(
          reactiveWhen(project.active),
          function (active) {
            if (active) return "memo-nav-button memo-project-item is-active";
            return "memo-nav-button memo-project-item";
          },
        );
        return Button(
          {
            class: class_name_,
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
  ]);
}

export function ProjectOptionsView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Fragment, SelectOption } = runtime;
  let base_options = [
    { count: null, kind: "unassigned", label: "未归属", value: "" },
  ];
  if (Array.isArray(props.baseOptions)) base_options = props.baseOptions;
  return Fragment({}, [
    For({
      each: base_options.concat(props.projects || []),
      render(option) {
        return SelectOption({ label: option.label, value: option.value });
      },
    }),
  ]);
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
    {
      class: "memo-project-topbar-actions",
      attributes: { n: "project-detail-actions" },
    },
    [
      action("editProject", "编辑", "project-edit-button"),
      action(
        "createProjectBoard",
        "从模板创建看板",
        "project-create-board-button",
      ),
      action("archiveProject", "归档", "project-archive-button"),
    ],
  );
}

export function ProjectDetailView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  const active_tab = props.activeTab || "memos";
  const tab = function (id, label, count) {
    const class_name_ = computed(
      reactiveWhen(active_tab === id),
      function (active) {
        if (active) return "memo-project-tab is-active";
        return "memo-project-tab";
      },
    );
    return Button(
      {
        class: class_name_,
        attributes: {
          "data-project-tab": id,
          n: "project-" + id + "-tab",
          type: "button",
        },
      },
      [
        label,
        View(
          {
            as: "span",
            class: "memo-project-tab-count",
            attributes: { n: "project-" + id + "-tab-count" },
          },
          [count],
        ),
      ],
    );
  };
  const panel = function (id, children, extra_attributes = {}) {
    const class_name_ = computed(
      reactiveWhen(active_tab === id),
      function (active) {
        if (active) return "memo-project-tab-panel";
        return "memo-project-tab-panel hidden";
      },
    );
    return View(
      {
        class: class_name_,
        attributes: {
          ...extra_attributes,
          "data-project-tab-panel": id,
          n: "project-" + id + "-panel",
        },
      },
      children,
    );
  };
  return runtime.Fragment({}, [
    View(
      {
        class: "memo-project-detail",
        attributes: { "data-project-id": props.projectId, n: "project-detail" },
      },
      [
        View(
          {
            class: "memo-project-tabs",
            attributes: { n: "project-detail-tabs" },
          },
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
            {
              class: "memo-project-tab-toolbar",
              attributes: { n: "project-memo-toolbar" },
            },
            [
              View(
                {
                  as: "label",
                  class: "memo-search memo-project-memo-search",
                  attributes: { n: "project-memo-search-label" },
                },
                [
                  memoIcon("search", "project-memo-search-icon"),
                  Input({
                    type: "search",
                    value: props.query || "",
                    placeholder: "搜索项目内 memos",
                    attributes: {
                      "data-project-memo-search": "true",
                      n: "project-memo-search-input",
                      type: "search",
                    },
                  }),
                ],
              ),
              Button(
                {
                  class: "tn-button tn-button--primary memo-primary-button",
                  attributes: {
                    "data-action": "createMemo",
                    n: "project-create-memo-button",
                    type: "button",
                  },
                },
                ["新建 Memo"],
              ),
            ],
          ),
          View(
            {
              class: "memo-project-memo-list",
              attributes: { n: "project-memo-list" },
            },
            [
              MemoFeedView({
                memos: props.memos || [],
                projects: props.projects || [],
                runtime,
              }),
              Show({
                when: reactiveWhen(props.memoHasMore),
                ok() {
                  return View(
                    {
                      class: "memo-feed-load-more",
                      attributes: {
                        "data-project-scroll-loader": "memos",
                        n: "project-memo-scroll-loader",
                      },
                    },
                    ["继续向下滚动加载"],
                  );
                },
              }),
            ],
          ),
        ]),
        panel("tasks", [
          View(
            {
              class: "memo-project-todo-list",
              attributes: { n: "project-task-list" },
            },
            [
              TaskCollectionsView({
                groups: (() => {
                  if (props.tasks?.length) {
                    return [{ items: props.tasks, label: "待办" }];
                  }
                  return [];
                })(),
                hideWorkspace: true,
                mode: "tasks",
                runtime,
              }),
              Show({
                when: reactiveWhen(props.taskHasMore),
                ok() {
                  return View(
                    {
                      class: "memo-feed-load-more",
                      attributes: {
                        "data-project-scroll-loader": "tasks",
                        n: "project-task-scroll-loader",
                      },
                    },
                    ["继续向下滚动加载"],
                  );
                },
              }),
            ],
          ),
        ]),
        For({
          each: props.boards || [],
          render(board) {
            const children = [];
            if (board.view) children.push(board.view);
            return panel(board.id, children, {
              "data-project-board": "true",
            });
          },
        }),
      ],
    ),
    Show({
      when: reactiveWhen(props.showPresets),
      ok() {
        return BoardPresetsView({
          presets: props.presets || [],
          projectId: props.projectId,
          runtime,
        });
      },
    }),
  ]);
}


// __HOME_PROJECT_VIEWS__
