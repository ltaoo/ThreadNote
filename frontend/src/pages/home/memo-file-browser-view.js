import { closestElement } from "./memo-utils.js";
import { TimelessPrimitive } from "@/timeless-icons.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

function FileContextActionView(action, label, meaning) {
  const { Button, View } = TimelessPrimitive;
  return Button(
    {
      class: "tn-menu__item memo-file-context-option",
      attributes: {
        "data-file-context-action": action,
        n: meaning,
        role: "menuitem",
        type: "button",
      },
    },
    [
      View(
        {
          as: "span",
          attributes: { n: meaning + "-label" },
        },
        [label],
      ),
    ],
  );
}

function FileContextMenuView(item) {
  const { Fragment } = TimelessPrimitive;
  return Fragment({}, [
    FileContextActionView("view", "查看", "finder-file-context-view"),
    item.memoId
      ? FileContextActionView(
          "source",
          "打开来源 memo",
          "finder-file-context-source",
        )
      : null,
    FileContextActionView(
      "copy",
      "复制文件地址",
      "finder-file-context-copy",
    ),
  ]);
}

export function bindFileBrowserView(root, model, options = {}) {
  let menu = null;

  function itemElement(itemId) {
    return Array.from(root.querySelectorAll("[data-file-browser-item]")).find(function (item) {
      return item.dataset.fileBrowserId === itemId;
    }) || null;
  }

  function syncSelection() {
    const selectedItemId = model.state.selectedItemId;
    root.querySelectorAll("[data-file-browser-item]").forEach(function (item) {
      const selected = item.dataset.fileBrowserId === selectedItemId;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function handleClick(event) {
    const item = closestElement(event.target, "[data-file-browser-item]");
    if (item && root.contains(item)) {
      model.select(item.dataset.fileBrowserId);
      syncSelection();
      return;
    }

    const grid = closestElement(event.target, "[data-file-browser-grid]");
    if (grid && root.contains(grid)) {
      model.clearSelection();
      syncSelection();
    }
  }

  function handleContextMenu(event) {
    const item = closestElement(event.target, "[data-file-browser-item]");
    if (!item || !root.contains(item)) return;

    closeMenu();
    const selected = model.openContext(item.dataset.fileBrowserId);
    if (!selected) return;
    event.preventDefault();
    event.stopPropagation();
    syncSelection();
    openMenu(event.clientX, event.clientY, selected);
  }

  function handleKeydown(event) {
    const item = closestElement(event.target, "[data-file-browser-item]");
    if (!item || !root.contains(item)) return;
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;

    closeMenu();
    const selected = model.openContext(item.dataset.fileBrowserId);
    if (!selected) return;
    event.preventDefault();
    syncSelection();
    const rect = item.getBoundingClientRect();
    openMenu(rect.left + Math.min(rect.width, 72), rect.top + Math.min(rect.height, 64), selected);
  }

  function openMenu(x, y, item) {
    menu = document.createElement("div");
    menu.className = "tn-popup tn-popup--menu tn-menu tn-context-menu memo-file-context-menu";
    menu.setAttribute("data-n", "finder-file-context-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", item.name + " 文件操作");
    renderTimelessView(menu, FileContextMenuView(item));
    menu.addEventListener("click", handleMenuClick);
    document.body.appendChild(menu);
    positionMenu(menu, x, y);
    window.setTimeout(function () {
      const firstAction = menu && menu.querySelector("[data-file-context-action]");
      if (firstAction) firstAction.focus();
      document.addEventListener("click", handleDocumentClick, true);
      document.addEventListener("keydown", handleMenuKeydown, true);
      window.addEventListener("blur", closeMenu);
      window.addEventListener("resize", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
    }, 0);
  }

  function handleMenuClick(event) {
    const action = closestElement(event.target, "[data-file-context-action]");
    if (!action || !menu || !menu.contains(action)) return;

    event.preventDefault();
    event.stopPropagation();
    const effect = model.performContextAction(action.dataset.fileContextAction);
    const target = effect ? itemElement(effect.item.id) : null;
    closeMenu();
    if (!effect) return;

    if (effect.action === "view" && typeof options.onView === "function") options.onView(effect.item, target);
    if (effect.action === "source" && typeof options.onOpenSource === "function") options.onOpenSource(effect.item);
    if (effect.action === "copy" && typeof options.onCopy === "function") options.onCopy(effect.item);
  }

  function handleDocumentClick(event) {
    if (menu && menu.contains(event.target)) return;
    closeMenu();
  }

  function handleMenuKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  function closeMenu() {
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
    window.removeEventListener("blur", closeMenu);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", closeMenu, true);
    if (menu) {
      menu.removeEventListener("click", handleMenuClick);
      menu.remove();
    }
    menu = null;
    model.closeContext();
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("contextmenu", handleContextMenu);
  root.addEventListener("keydown", handleKeydown);

  return {
    destroy() {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("contextmenu", handleContextMenu);
      root.removeEventListener("keydown", handleKeydown);
      closeMenu();
    },
    sync: syncSelection,
  };
}

function positionMenu(menu, x, y) {
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}
