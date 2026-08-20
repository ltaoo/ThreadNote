import { MemoCardModel } from "./memo-card-model.js?v=20260820-memo-expand-measured";
import { Timeless } from "./timeless-icons.js";

const visibilityLabels = Object.freeze({
  PRIVATE: "私密",
  PROTECTED: "受保护",
  PUBLIC: "公开",
  SECRET: "加密",
});

function defaultDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function normalizeViews(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value];
}

export function createMemoCardComponent(deps) {
  const {
    Avatar,
    Badge,
    Button,
    IconButton,
    Popover,
    applyElementProps,
    classNames,
    modelState,
    resolveModel,
    setAttribute,
    subscribeModel,
  } = deps;

  return function MemoCard(props = {}, children = []) {
    const resolved = resolveModel(props, MemoCardModel, props);
    const model = resolved.model;
    const root = document.createElement("article");
    const header = document.createElement("header");
    const author = document.createElement("div");
    const avatarSlot = document.createElement("div");
    const authorCopy = document.createElement("div");
    const authorLine = document.createElement("div");
    const authorName = document.createElement("strong");
    const createdAt = document.createElement("time");
    const meta = document.createElement("div");
    const badgesSlot = document.createElement("div");
    const headerActions = document.createElement("div");
    const body = document.createElement("div");
    const title = document.createElement("h3");
    const content = document.createElement("div");
    const customContent = document.createElement("div");
    const expandSlot = document.createElement("div");
    const error = document.createElement("div");
    const footer = document.createElement("footer");
    const summary = document.createElement("div");
    const footerActions = document.createElement("div");
    const buckets = new Map();
    let mounted = false;
    let rendered = false;
    let lastMemo = null;

    header.className = "tn-flex tn-items-start tn-justify-between tn-gap-3";
    author.className = "tn-flex tn-items-center tn-gap-2 tn-min-w-0";
    avatarSlot.className = "tn-flex-none";
    authorCopy.className = "tn-grid tn-gap-0-5 tn-min-w-0";
    authorLine.className = "tn-flex tn-items-center tn-flex-wrap tn-gap-1-5 tn-min-w-0";
    authorName.className = "tn-memo-card__author tn-truncate";
    createdAt.className = "tn-memo-card__time tn-text-xs tn-text-tertiary";
    meta.className = "tn-flex tn-items-center tn-flex-wrap tn-justify-end tn-gap-1";
    badgesSlot.className = "tn-flex tn-items-center tn-flex-wrap tn-justify-end tn-gap-1";
    headerActions.className = "tn-memo-card__head-actions tn-flex tn-items-center tn-gap-0-5";
    body.className = "tn-grid tn-gap-2 tn-min-w-0";
    title.className = "tn-memo-card__title";
    content.className = "tn-memo-card__content";
    customContent.className = "tn-memo-card__custom-content tn-min-w-0";
    expandSlot.className = "tn-flex tn-justify-center";
    error.className = "tn-memo-card__error tn-text-sm";
    error.setAttribute("role", "alert");
    footer.className = "tn-memo-card__footer tn-flex tn-items-center tn-flex-wrap tn-justify-between tn-gap-2 tn-border-t";
    summary.className = "tn-flex tn-items-center tn-flex-wrap tn-gap-1-5 tn-min-w-0";
    footerActions.className = "tn-flex tn-items-center tn-flex-wrap tn-justify-end tn-gap-1";
    applyElementProps(root, props);
    authorLine.append(authorName, createdAt);
    authorCopy.append(authorLine);
    author.append(avatarSlot, authorCopy);
    meta.append(badgesSlot, headerActions);
    header.append(author, meta);
    body.append(title, content, customContent, expandSlot, error);
    footer.append(summary, footerActions);
    root.append(header, body, footer);

    function unmountBucket(views) {
      views.forEach((view) => {
        if (!view || typeof view.render !== "function") return;
        if (mounted) view.beforeUnmounted?.();
        view.onUnmounted?.();
      });
    }

    function replaceBucket(name, container, value) {
      const previous = buckets.get(name) || [];
      unmountBucket(previous);
      container.replaceChildren();
      const views = normalizeViews(value);
      views.forEach((view) => {
        if (view && typeof view.render === "function") {
          const element = view.render();
          if (element) container.appendChild(element);
          if (mounted) view.onMounted?.();
          return;
        }
        if (typeof window !== "undefined" && view instanceof window.Node) {
          container.appendChild(view);
          return;
        }
        container.appendChild(document.createTextNode(String(view)));
      });
      buckets.set(name, views);
    }

    function actionButton(name, label, handler, options = {}) {
      return IconButton(
        {
          ariaLabel: label,
          attributes: options.semanticName ? { n: options.semanticName } : undefined,
          class: classNames(
            "tn-memo-card__action",
            options.danger && "is-danger",
          ),
          onClick: handler,
          size: "icon",
          title: label,
          variant: "ghost",
        },
        options.icons || [Timeless.Icon({ name, size: 15 })],
      );
    }

    function menuAction(name, label, handler, options = {}) {
      return Button({
        ariaLabel: label,
        attributes: { role: "menuitem" },
        class: classNames(
          "tn-memo-card__menu-action",
          options.danger && "is-danger",
        ),
        onClick: handler,
        prefix: Timeless.Icon({ name, size: 15 }),
        size: "sm",
        text: label,
        variant: "ghost",
      });
    }

    const pinAction = actionButton(
      "pin",
      "置顶",
      (event) => model.togglePinned?.(event),
      {
        icons: [
          Timeless.Icon({
            attributes: { n: "memo-pin-icon" },
            class: "tn-memo-card__pin-icon",
            name: "pin",
            size: 15,
          }),
          Timeless.Icon({
            attributes: { n: "memo-unpin-icon" },
            class: "tn-memo-card__unpin-icon",
            name: "unpin",
            size: 15,
          }),
        ],
        semanticName: "memo-pin-toggle",
      },
    );
    const openAction = actionButton("external", "打开 Memo", (event) =>
      model.open?.(event),
    );
    const commentAction = actionButton("comment", "评论", (event) =>
      model.comment?.(event),
    );
    const editAction = actionButton("edit", "编辑", (event) =>
      model.edit?.(event),
    );
    let moreMenu = null;
    const archiveAction = menuAction("archive", "归档", (event) => {
      moreMenu?.model?.hide?.("action");
      model.toggleArchived?.(event);
    });
    const deleteAction = menuAction(
      "trash",
      "删除",
      (event) => {
        moreMenu?.model?.hide?.("action");
        model.delete?.(event);
      },
      { danger: true },
    );
    const moreAction = actionButton("moreHorizontal", "更多操作", () => {});
    const expandAction = Button({
      ariaLabel: "展开全文",
      class: "tn-memo-card__expand-action",
      onClick: (event) => model.expand?.(event),
      prefix: Timeless.Icon({ class: "tn-memo-card__expand-icon", name: "chevron-down", size: 14 }),
      size: "xs",
      text: "展开全文",
      variant: "ghost",
    });
    const headerActionViews = props.showActions === false ? [] : [pinAction];
    if (props.showActions !== false && props.showOpen !== false) {
      headerActionViews.push(openAction);
    }
    const footerActionViews = [];
    if (props.showActions !== false && props.showComment !== false) {
      footerActionViews.push(commentAction);
    }
    if (props.showActions !== false && props.showEdit !== false) {
      footerActionViews.push(editAction);
    }
    const moreActionViews = [];
    if (props.showActions !== false && props.showArchive !== false) {
      moreActionViews.push(archiveAction);
    }
    if (
      props.showActions !== false &&
      (props.showDelete === true || typeof props.onDelete === "function")
    ) {
      moreActionViews.push(deleteAction);
    }
    if (moreActionViews.length) {
      moreMenu = Popover({
        class: "tn-memo-card__more-menu",
        closeOnOutside: true,
        content: moreActionViews,
        offset: 6,
        placement: "top-end",
        role: "menu",
      }, [moreAction]);
      footerActionViews.push(moreMenu);
    }
    replaceBucket("header-actions", headerActions, headerActionViews);
    replaceBucket("footer-actions", footerActions, footerActionViews);
    replaceBucket("expand", expandSlot, [expandAction]);

    function updateAction(view, action, busyAction) {
      view.model?.setLoading?.(busyAction === action);
      view.model?.setDisabled?.(Boolean(busyAction) && busyAction !== action);
    }

    function memoBadges(memo) {
      const views = [];
      if (memo.visibility && memo.visibility !== "PUBLIC") {
        views.push(Badge({ variant: "default" }, [
          visibilityLabels[memo.visibility] || memo.visibility,
        ]));
      }
      if (memo.alias) views.push(Badge({}, [`@${memo.alias}`]));
      if (memo.projectLabel) views.push(Badge({}, [memo.projectLabel]));
      if (memo.archived) views.push(Badge({ variant: "warning" }, ["已归档"]));
      return views;
    }

    function memoSummary(memo, presentation) {
      const views = [];
      if (props.showStats !== false) {
        views.push(Badge({}, [`${presentation.characterCount} 字符`]));
        if (memo.backlinks) views.push(Badge({}, [`${memo.backlinks} 引用`]));
        if (memo.comments) views.push(Badge({}, [`${memo.comments} 评论`]));
      }
      if (props.showTags !== false) {
        memo.tags.forEach((tag) => {
          views.push(Button(
            {
              class: "tn-memo-card__tag",
              onClick: (event) => model.clickTag?.(tag, event),
              size: "xs",
              variant: "ghost",
            },
            [`#${tag}`],
          ));
        });
      }
      if (props.showReactions !== false) {
        memo.reactions.forEach((reaction) => {
          views.push(Button(
            {
              ariaLabel: `切换反应 ${reaction}`,
              class: "tn-memo-card__reaction",
              onClick: (event) => model.toggleReaction?.(reaction, event),
              size: "xs",
              variant: "secondary",
            },
            [reaction],
          ));
        });
      }
      return views;
    }

    function updateMemoContent(memo, presentation) {
      const hasCustomContent = children.length > 0 || typeof props.renderContent === "function";
      content.classList.toggle("tn-hidden", hasCustomContent);
      customContent.classList.toggle("tn-hidden", !hasCustomContent);
      if (!hasCustomContent) return;
      const custom = children.length
        ? children
        : props.renderContent(memo, model);
      replaceBucket("custom-content", customContent, custom);
    }

    function sync() {
      const state = modelState(model);
      const memo = state.memo || model.memo || props.memo || {};
      const presentation = model.presentation || {
        body: String(memo.content || ""),
        characterCount: Array.from(String(memo.content || "")).length,
        collapsible: false,
        pinAction: {
          icon: memo.pinned ? "unpin" : "pin",
          label: memo.pinned ? "取消置顶" : "置顶",
        },
        title: String(memo.title || ""),
      };
      const pinActionPresentation = presentation.pinAction || {
        icon: memo.pinned ? "unpin" : "pin",
        label: memo.pinned ? "取消置顶" : "置顶",
      };
      const expanded = Boolean(state.expanded);
      const busyAction = state.busyAction || null;
      root.className = classNames(
        "tn-memo-card tn-relative tn-grid tn-gap-3 tn-p-4 tn-bg-surface tn-border tn-rounded-md tn-shadow-xs tn-transition-colors",
        memo.pinned && "is-pinned",
        memo.archived && "is-archived",
        state.selected && "is-selected",
        props.clickable && "is-clickable tn-cursor-pointer",
        props.selectable && "is-selectable tn-cursor-pointer",
        props.class,
      );
      setAttribute(root, "data-memo-id", memo.id || null);
      setAttribute(root, "aria-selected", props.selectable ? String(Boolean(state.selected)) : null);
      setAttribute(root, "aria-busy", busyAction ? "true" : null);
      title.textContent = presentation.title;
      title.hidden = !presentation.title;
      content.textContent = presentation.body;
      content.className = classNames(
        "tn-memo-card__content",
        !expanded && presentation.collapsible && "is-collapsed",
        (children.length > 0 || typeof props.renderContent === "function") && "tn-hidden",
      );
      expandAction.$elm.hidden = !presentation.collapsible || expanded;
      expandAction.$elm.setAttribute("aria-expanded", String(expanded));
      pinAction.$elm.classList.toggle(
        "is-pinned",
        pinActionPresentation.icon === "unpin",
      );
      pinAction.$elm.title = pinActionPresentation.label;
      pinAction.$elm.setAttribute("aria-label", pinActionPresentation.label);
      pinAction.$elm.setAttribute("aria-pressed", String(Boolean(memo.pinned)));
      archiveAction.$elm.title = memo.archived ? "恢复" : "归档";
      archiveAction.$elm.setAttribute("aria-label", archiveAction.$elm.title);
      archiveAction.model?.setText?.(archiveAction.$elm.title);
      error.textContent = state.error
        ? String(state.error.message || state.error)
        : "";
      error.classList.toggle("tn-hidden", !state.error);
      updateAction(pinAction, "pin", busyAction);
      updateAction(openAction, "open", busyAction);
      updateAction(commentAction, "comment", busyAction);
      updateAction(editAction, "edit", busyAction);
      updateAction(archiveAction, "archive", busyAction);
      updateAction(deleteAction, "delete", busyAction);
      moreAction.model?.setDisabled?.(Boolean(busyAction));
      if (memo !== lastMemo) {
        authorName.textContent = memo.author || "You";
        createdAt.textContent = (props.formatDate || defaultDateLabel)(memo.createdAt);
        createdAt.dateTime = memo.createdAt || "";
        replaceBucket("avatar", avatarSlot, [Avatar({
          alt: memo.author || "",
          fallback: (memo.author || "Y").slice(0, 1).toUpperCase(),
          size: "sm",
          src: memo.authorAvatar || "",
        })]);
        replaceBucket("badges", badgesSlot, memoBadges(memo));
        replaceBucket("summary", summary, memoSummary(memo, presentation));
        updateMemoContent(memo, presentation);
        lastMemo = memo;
      }
      footer.classList.toggle(
        "tn-hidden",
        props.showFooter === false || (!summary.childNodes.length && !footerActionViews.length),
      );
    }

    function handleRootClick(event) {
      if (!props.clickable && !props.selectable) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      if (props.selectable) {
        model.setSelected?.(!Boolean(modelState(model).selected), event);
      }
      if (props.clickable) model.open?.(event);
    }

    function handleRootKeydown(event) {
      if ((!props.clickable && !props.selectable) || event.target !== root) return;
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (props.selectable) {
        model.setSelected?.(!Boolean(modelState(model).selected), event);
      }
      if (props.clickable) model.open?.(event);
    }

    if (props.clickable || props.selectable) {
      root.tabIndex = props.tabIndex ?? 0;
      setAttribute(root, "aria-label", props.ariaLabel || "打开 Memo");
    }
    root.addEventListener("click", handleRootClick);
    root.addEventListener("keydown", handleRootKeydown);
    const unsubscribe = subscribeModel(model, sync);
    sync();

    return {
      t: "view",
      $elm: root,
      model,
      render() {
        rendered = true;
        return root;
      },
      onMounted() {
        if (!rendered || mounted) return;
        mounted = true;
        props.onMounted?.(root);
        buckets.forEach((views) => {
          views.forEach((view) => view?.onMounted?.());
        });
      },
      beforeUnmounted() {
        if (!mounted) return;
        props.beforeUnmounted?.(root);
        buckets.forEach((views) => {
          views.forEach((view) => view?.beforeUnmounted?.());
        });
      },
      onUnmounted() {
        unsubscribe();
        buckets.forEach((views) => {
          views.forEach((view) => view?.onUnmounted?.());
        });
        buckets.clear();
        mounted = false;
        if (resolved.owned) model.destroy?.();
        props.onUnmounted?.(root);
      },
    };
  };
}
