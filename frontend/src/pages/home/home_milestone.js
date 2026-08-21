import {
  createGTDMilestone,
  updateGTDMilestone,
} from "@/domain/gtd.js";
import { errorMessage } from "@/domain/memo-repository.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { HomeMilestonePageModel } from "./home_milestone.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { formatDateTime } from "./home_memo_helpers.js";
import { TaskCollectionsView } from "./home_todo.js";

export function createHomeMilestoneState() {
  return { gtdMilestones: [] };
}

export function createHomeMilestoneController(options) {
  const { elements, state } = options;

  function active_project_ids() {
    if (
      state.activeProjectFilter &&
      state.activeProjectFilter !== "all" &&
      state.activeProjectFilter !== "unassigned"
    ) {
      return [state.activeProjectFilter];
    }
    return [];
  }

  function scoped_milestones() {
    if (state.activeProjectFilter === "unassigned") {
      return state.gtdMilestones.filter(function (milestone) {
        return !milestone.projectIds.length;
      });
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.gtdMilestones.filter(function (milestone) {
        return milestone.projectIds.includes(state.activeProjectFilter);
      });
    }
    return state.gtdMilestones;
  }

  function status_weight(status) {
    if (status === "active") return 0;
    if (status === "planned") return 1;
    if (status === "completed") return 2;
    return 3;
  }

  function sort_milestones(left, right) {
    const status = status_weight(left.status) - status_weight(right.status);
    if (status !== 0) return status;
    const target =
      options.taskTimeValue(left.targetAt) -
      options.taskTimeValue(right.targetAt);
    if (target !== 0) return target;
    return (
      options.taskTimeValue(right.updatedAt || right.createdAt) -
      options.taskTimeValue(left.updatedAt || left.createdAt)
    );
  }

  function visible_milestones() {
    const query = state.query.toLowerCase();
    return scoped_milestones()
      .filter(function (milestone) {
        if (!query) return true;
        return [
          milestone.title,
          milestone.status,
          milestone.targetAt,
          milestone.reviewMemoId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sort_milestones);
  }

  function grouped_milestones(milestones) {
    return [
      {
        label: "进行中",
        milestones: milestones.filter((item) => item.status === "active"),
      },
      {
        label: "计划中",
        milestones: milestones.filter((item) => item.status === "planned"),
      },
      {
        label: "已完成",
        milestones: milestones.filter((item) => item.status === "completed"),
      },
      {
        label: "已取消",
        milestones: milestones.filter((item) => item.status === "cancelled"),
      },
    ].filter((group) => group.milestones.length);
  }

  function presentation(milestone) {
    const items = state.gtdItems.filter(function (item) {
      return (
        item.milestoneId === milestone.id || milestone.itemIds.includes(item.id)
      );
    });
    const tasks = state.tasks.filter(function (task) {
      return milestone.taskIds.includes(task.id);
    });
    const status_labels = {
      active: "进行中",
      cancelled: "已取消",
      completed: "已完成",
      planned: "计划中",
    };
    const meta = [];
    if (milestone.targetAt) {
      meta.push({
        datetime: milestone.targetAt,
        label:
          "目标 " +
          formatDateTime(options.taskDateValue(milestone.targetAt)),
        time: true,
      });
    }
    meta.push({
      label:
        items.filter(function (item) {
          return item.status !== "closed" && item.status !== "resolved";
        }).length + " open items",
    });
    meta.push({
      label:
        tasks.filter(function (task) {
          return !["completed", "cancelled", "archived"].includes(task.status);
        }).length + " open tasks",
    });
    meta.push(
      { label: items.length + " items" },
      { label: tasks.length + " tasks" },
    );
    const actions = [];
    if (milestone.status === "planned") {
      actions.push({ action: "activateGTDMilestone", icon: "check", label: "开始" });
    }
    if (milestone.status !== "completed") {
      actions.push({ action: "completeGTDMilestone", icon: "archive", label: "完成" });
    }
    return {
      actions,
      badge: status_labels[milestone.status] || "计划中",
      complete: milestone.status === "completed",
      id: milestone.id,
      meta,
      priority: "none",
      title: milestone.title,
    };
  }

  function render_milestones() {
    options.beforeRender();
    renderTimelessView(
      elements.memoList,
      HomeMilestoneContentView({
        groups: grouped_milestones(visible_milestones()).map(function (group) {
          return {
            items: group.milestones.map(presentation),
            label: group.label,
          };
        }),
      }),
    );
  }

  function create_from_form(form) {
    if (!form) return;
    const title = String(options.controlGroupValue(form, "title") || "").trim();
    if (!title) {
      options.showToast("里程碑标题不能为空");
      return;
    }
    createGTDMilestone({
      projectIds: active_project_ids(),
      status: String(
        options.controlGroupValue(form, "status", "planned") || "planned",
      ).trim(),
      targetAt: String(
        options.controlGroupValue(form, "targetAt") || "",
      ).trim(),
      title,
    }).then(
      function (milestone) {
        state.gtdMilestones = [milestone].concat(state.gtdMilestones);
        options.clearControlGroup(form);
        options.renderAll();
        options.showToast("已添加里程碑");
      },
      function (error) {
        options.showToast("添加里程碑失败: " + errorMessage(error));
      },
    );
  }

  function update_milestone(milestone_id, patch, message) {
    const id = String(milestone_id || "").trim();
    if (!id) return;
    updateGTDMilestone(id, patch).then(
      function (milestone) {
        state.gtdMilestones = state.gtdMilestones.map(function (entry) {
          if (entry.id === id) return milestone;
          return entry;
        });
        options.renderAll();
        options.showToast(message || "已更新里程碑");
      },
      function (error) {
        options.showToast("更新里程碑失败: " + errorMessage(error));
        options.refreshGTD();
      },
    );
  }

  return {
    createGTDMilestoneFromForm: create_from_form,
    renderGTDMilestones: render_milestones,
    scopedGTDMilestones: scoped_milestones,
    updateExistingGTDMilestone: update_milestone,
    visibleGTDMilestones: visible_milestones,
  };
}

export function HomeMilestoneContentView(props) {
  return TaskCollectionsView({ ...props, mode: "milestones" });
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeMilestonePageView(props) {
  const vm$ = HomeMilestonePageModel(props);
  return View(
    {
      class: "page home-milestone-page w-full h-full",
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
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-milestone-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: {
            "data-home-page-main": "true",
            n: "home-milestone-main",
          },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: {
                "data-memo-list": "true",
                n: "home-milestone-content",
              },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}
