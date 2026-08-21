import { setCheckboxControlValue } from "@/components.js";
import {
  closeGTDItem,
  createGTDItem,
  deleteGTDItem,
  updateGTDItem,
} from "@/domain/gtd.js";
import { errorMessage } from "@/domain/memo-repository.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { HomeItemPageModel } from "./home_item.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { formatRelativeDate } from "./memo-date.js";
import { TaskCollectionsView } from "./home_todo.js";

export function createHomeItemState() {
  return { gtdItems: [], gtdLoading: false };
}

export function createHomeItemController(options) {
  const { elements, state } = options;

  function active_project_id() {
    if (
      state.activeProjectFilter &&
      state.activeProjectFilter !== "all" &&
      state.activeProjectFilter !== "unassigned"
    ) {
      return state.activeProjectFilter;
    }
    return "";
  }

  function scoped_items() {
    if (state.activeProjectFilter === "unassigned") {
      return state.gtdItems.filter(function (item) {
        return !item.projectId;
      });
    }
    if (state.activeProjectFilter && state.activeProjectFilter !== "all") {
      return state.gtdItems.filter(function (item) {
        return item.projectId === state.activeProjectFilter;
      });
    }
    return state.gtdItems;
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
    if (status === "open") return 0;
    if (status === "triaged") return 1;
    if (status === "waiting") return 2;
    return 3;
  }

  function sort_items(left, right) {
    const status = status_weight(left.status) - status_weight(right.status);
    if (status !== 0) return status;
    const created =
      options.taskTimeValue(right.createdAt || right.updatedAt) -
      options.taskTimeValue(left.createdAt || left.updatedAt);
    if (created !== 0) return created;
    return String(right.id || "").localeCompare(String(left.id || ""));
  }

  function visible_items() {
    const query = state.query.toLowerCase();
    return scoped_items()
      .filter(function (item) {
        if (!query) return true;
        const milestone = state.gtdMilestones.find(function (entry) {
          return entry.id === item.milestoneId;
        });
        return [
          item.title,
          item.type,
          item.status,
          item.decision,
          item.projectId,
          milestone && milestone.title,
          (item.labels || []).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sort_items);
  }

  function grouped_items(items) {
    return [
      { label: "Open", items: items.filter((item) => item.status === "open") },
      {
        label: "已澄清",
        items: items.filter((item) => item.status === "triaged"),
      },
      {
        label: "等待",
        items: items.filter((item) => item.status === "waiting"),
      },
      {
        label: "已关闭",
        items: items.filter(function (item) {
          return item.status === "closed" || item.status === "resolved";
        }),
      },
    ].filter((group) => group.items.length);
  }

  function presentation(item) {
    const closed = item.status === "closed" || item.status === "resolved";
    const type_labels = {
      bug: "Bug",
      chore: "杂项",
      feature: "功能",
      idea: "想法",
      question: "问题",
    };
    const status_labels = {
      closed: "已关闭",
      open: "Open",
      resolved: "已解决",
      triaged: "已澄清",
      waiting: "等待",
    };
    const milestone = state.gtdMilestones.find(function (entry) {
      return entry.id === item.milestoneId;
    });
    const meta = [];
    if (item.projectId) meta.push({ label: options.projectLabel(item.projectId) });
    meta.push({ label: status_labels[item.status] || "Open" });
    if (milestone) meta.push({ label: milestone.title });
    if (item.linkedTaskIds.length) {
      meta.push({ label: item.linkedTaskIds.length + " tasks" });
    }
    if (item.linkedMemoIds.length) {
      meta.push({ label: item.linkedMemoIds.length + " memos" });
    }
    (item.labels || []).slice(0, 4).forEach(function (label) {
      meta.push({ label: "#" + label });
    });
    if (item.createdAt) {
      meta.push({
        datetime: item.createdAt,
        label: "创建 " + formatRelativeDate(item.createdAt),
        time: true,
      });
    }
    const actions = [];
    if (item.status === "open") {
      actions.push({ action: "triageGTDItem", icon: "check", label: "标记已澄清" });
    }
    if (!closed) {
      actions.push({ action: "waitGTDItem", icon: "clock", label: "标记等待" });
      actions.push({ action: "closeGTDItem", icon: "archive", label: "关闭" });
    }
    actions.push({
      action: "deleteGTDItem",
      danger: true,
      icon: "trash2",
      label: "删除",
    });
    return {
      actions,
      badge: type_labels[item.type] || "想法",
      complete: closed,
      id: item.id,
      meta,
      note: item.decision || "",
      priority: "none",
      title: item.title,
    };
  }

  function render_items() {
    options.beforeRender();
    renderTimelessView(
      elements.memoList,
      HomeItemContentView({
        groups: grouped_items(visible_items()).map(function (group) {
          return {
            items: group.items.map(presentation),
            label: group.label,
          };
        }),
        milestones: scoped_milestones().filter(function (item) {
          return item.status !== "completed" && item.status !== "cancelled";
        }),
      }),
    );
  }

  function create_from_form(form) {
    if (!form) return;
    const title = String(options.controlGroupValue(form, "title") || "").trim();
    if (!title) {
      options.showToast("事项标题不能为空");
      return;
    }
    createGTDItem({
      milestoneId: String(
        options.controlGroupValue(form, "milestoneId") || "",
      ).trim(),
      projectId: active_project_id(),
      title,
      type: String(
        options.controlGroupValue(form, "type", "idea") || "idea",
      ).trim(),
    }).then(
      function (item) {
        state.gtdItems = [item].concat(state.gtdItems);
        options.clearControlGroup(form);
        options.renderAll();
        options.showToast("已添加开放事项");
      },
      function (error) {
        options.showToast("添加事项失败: " + errorMessage(error));
      },
    );
  }

  function update_item(item_id, patch, message) {
    const id = String(item_id || "").trim();
    if (!id) return;
    updateGTDItem(id, patch).then(
      function (item) {
        state.gtdItems = state.gtdItems.map(function (entry) {
          if (entry.id === id) return item;
          return entry;
        });
        options.renderAll();
        options.showToast(message || "已更新事项");
      },
      function (error) {
        options.showToast("更新事项失败: " + errorMessage(error));
        options.refreshGTD();
      },
    );
  }

  function close_item(item_id) {
    const id = String(item_id || "").trim();
    if (!id) return;
    closeGTDItem(id).then(
      function (item) {
        state.gtdItems = state.gtdItems.map(function (entry) {
          if (entry.id === id) return item;
          return entry;
        });
        options.renderAll();
        options.showToast("已关闭事项");
      },
      function (error) {
        options.showToast("关闭事项失败: " + errorMessage(error));
        options.refreshGTD();
      },
    );
  }

  function delete_item(item_id) {
    const id = String(item_id || "").trim();
    if (!id || !window.confirm("删除这个 GTD 事项？")) return;
    deleteGTDItem(id).then(
      function () {
        state.gtdItems = state.gtdItems.filter((entry) => entry.id !== id);
        options.renderAll();
        options.showToast("已删除事项");
      },
      function (error) {
        options.showToast("删除事项失败: " + errorMessage(error));
        options.refreshGTD();
      },
    );
  }

  function toggle_completion(item_id, checkbox) {
    const id = String(item_id || "").trim();
    if (!id || !checkbox) return;
    const checked = checkbox.checked;
    checkbox.disabled = true;
    let request = updateGTDItem(id, { status: "open" });
    if (checked) request = closeGTDItem(id);
    request.then(
      function (item) {
        state.gtdItems = state.gtdItems.map(function (entry) {
          if (entry.id === id) return item;
          return entry;
        });
        options.renderAll();
        if (checked) options.showToast("已关闭事项");
        else options.showToast("已重新打开事项");
      },
      function (error) {
        setCheckboxControlValue(checkbox, !checked);
        checkbox.disabled = false;
        let prefix = "重新打开事项失败: ";
        if (checked) prefix = "关闭事项失败: ";
        options.showToast(prefix + errorMessage(error));
      },
    );
  }

  return {
    closeExistingGTDItem: close_item,
    createGTDItemFromForm: create_from_form,
    deleteExistingGTDItem: delete_item,
    renderGTDItems: render_items,
    scopedGTDItems: scoped_items,
    scopedGTDMilestones: scoped_milestones,
    toggleExistingGTDItemCompletion: toggle_completion,
    updateExistingGTDItem: update_item,
    visibleGTDItems: visible_items,
  };
}

export function HomeItemContentView(props) {
  return TaskCollectionsView({ ...props, mode: "items" });
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeItemPageView(props) {
  const vm$ = HomeItemPageModel(props);
  return View(
    {
      class: "page home-item-page w-full h-full",
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
        meaning: "home-item-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-item-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-item-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}
