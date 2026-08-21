import { buildMemoReferenceIndex } from "@/domain/memos.js";

export function parseHost(url) {
  try {
    const parsed_url = new URL(url);
    const host = parsed_url.hostname.replace(/^www\./, "");
    return { host, hostname: parsed_url.hostname };
  } catch {
    return { host: "", hostname: "" };
  }
}

export function detachedMemoRenderContext(state, source_id, options = {}) {
  const index = state.memoRefIndex || buildMemoReferenceIndex(state.memos);
  state.memoRefIndex = index;
  return {
    depth: options.depth || 0,
    editorSettings: state.editorSettings,
    index,
    maxDepth: options.maxDepth || 2,
    readonly: Boolean(options.readonly),
    showLineNumbers: options.showLineNumbers !== false,
    sourceId: source_id || "",
    stack: options.stack || (source_id ? [source_id] : []),
  };
}

const MEMO_CARD_VIEW_MODEL_RESERVED_KEYS = new Set([
  "active",
  "clearActive",
  "destroy",
  "isActiveSource",
  "moreMenuDestroy",
  "onMoreMenuMouseEnter",
  "onMoreMenuMouseLeave",
  "onMouseEnter",
  "onMouseLeave",
  "reactionMenuDestroy",
  "setActive",
  "setMoreMenuOpen",
  "setReactionMenuOpen",
  "updatePresentation",
]);

export class MemoCardViewModel {
  constructor(options = {}) {
    const create_ref = options.createRef || globalThis.Timeless?.ref;
    if (typeof create_ref !== "function") {
      throw new TypeError("MemoCardViewModel requires a reactive ref factory");
    }

    this.active = create_ref(false);
    this._active_sources = new Set();
    this._destroy_more_menu = null;
    this._destroy_reaction_menu = null;
    this._destroyed = false;
    this._more_menu_destroyed = true;
    this._reaction_menu_destroyed = true;
    this._on_destroy =
      typeof options.onDestroy === "function" ? options.onDestroy : null;
    this._presentation_keys = new Set();
    this._unsubscribe_more_menu = null;
    this._unsubscribe_reaction_menu = null;

    this.onMouseEnter = MemoCardViewModel.prototype.onMouseEnter.bind(this);
    this.onMouseLeave = MemoCardViewModel.prototype.onMouseLeave.bind(this);
    this.onMoreMenuMouseEnter =
      MemoCardViewModel.prototype.onMoreMenuMouseEnter.bind(this);
    this.onMoreMenuMouseLeave =
      MemoCardViewModel.prototype.onMoreMenuMouseLeave.bind(this);
    this.moreMenuDestroy =
      MemoCardViewModel.prototype.moreMenuDestroy.bind(this);
    this.reactionMenuDestroy =
      MemoCardViewModel.prototype.reactionMenuDestroy.bind(this);

    this.updatePresentation(options.presentation);
    if (options.active) this.setActive(true);
  }

  updatePresentation(presentation = {}) {
    if (this._destroyed) return this;
    const current_more_menu = this.moreMenu;
    const next_more_menu = presentation?.moreMenu;
    const next_more_menu_destroy = presentation?.moreMenuDestroy;
    const reuse_more_menu = Boolean(
      current_more_menu &&
      next_more_menu &&
      (current_more_menu === next_more_menu ||
        typeof current_more_menu.setItems === "function"),
    );
    if (reuse_more_menu && current_more_menu !== next_more_menu) {
      current_more_menu.setItems(
        next_more_menu.state?.items || next_more_menu.items || [],
      );
      next_more_menu_destroy?.();
      presentation = {
        ...presentation,
        moreMenu: current_more_menu,
        moreMenuDestroy: this._destroy_more_menu,
      };
    } else {
      this._releaseMoreMenu();
    }

    const current_reaction_menu = this.reactionMenu;
    const next_reaction_menu = presentation?.reactionMenu;
    const next_reaction_menu_destroy = presentation?.reactionMenuDestroy;
    const reuse_reaction_menu = Boolean(
      current_reaction_menu &&
      next_reaction_menu &&
      (current_reaction_menu === next_reaction_menu ||
        typeof current_reaction_menu.setItems === "function"),
    );
    if (reuse_reaction_menu && current_reaction_menu !== next_reaction_menu) {
      current_reaction_menu.setItems(
        next_reaction_menu.state?.items || next_reaction_menu.items || [],
      );
      next_reaction_menu_destroy?.();
      presentation = {
        ...presentation,
        reactionMenu: current_reaction_menu,
        reactionMenuDestroy: this._destroy_reaction_menu,
      };
    } else {
      this._releaseReactionMenu();
    }
    this._presentation_keys.forEach((key) => delete this[key]);
    this._presentation_keys.clear();

    Object.entries(presentation || {}).forEach(([key, value]) => {
      if (
        (key === "moreMenuDestroy" || key === "reactionMenuDestroy") ||
        key.startsWith("_") ||
        MEMO_CARD_VIEW_MODEL_RESERVED_KEYS.has(key)
      ) {
        return;
      }
      this[key] = value;
      this._presentation_keys.add(key);
    });

    this._destroy_more_menu =
      typeof presentation?.moreMenuDestroy === "function"
        ? presentation.moreMenuDestroy
        : null;
    this._more_menu_destroyed = false;
    if (
      !reuse_more_menu &&
      typeof this.moreMenu?.onStateChange === "function"
    ) {
      this._unsubscribe_more_menu = this.moreMenu.onStateChange(
        (menu_state) => this.setMoreMenuOpen(Boolean(menu_state?.visible)),
      );
      this.setMoreMenuOpen(Boolean(this.moreMenu.state?.visible));
    }
    this._destroy_reaction_menu =
      typeof presentation?.reactionMenuDestroy === "function"
        ? presentation.reactionMenuDestroy
        : null;
    this._reaction_menu_destroyed = false;
    if (
      !reuse_reaction_menu &&
      typeof this.reactionMenu?.onStateChange === "function"
    ) {
      this._unsubscribe_reaction_menu = this.reactionMenu.onStateChange(
        (menu_state) => this.setReactionMenuOpen(Boolean(menu_state?.visible)),
      );
      this.setReactionMenuOpen(Boolean(this.reactionMenu.state?.visible));
    }
    return this;
  }

  setActive(active, source = "external") {
    if (this._destroyed) return false;
    const active_source = String(source || "external").trim() || "external";
    if (active) this._active_sources.add(active_source);
    else this._active_sources.delete(active_source);
    const next_active = this._active_sources.size > 0;
    if (this.active.value !== next_active) this.active.as(next_active);
    return next_active;
  }

  clearActive() {
    if (this._destroyed) return false;
    this._active_sources.clear();
    if (this.active.value) this.active.as(false);
    return false;
  }

  isActiveSource(source) {
    return this._active_sources.has(String(source || "").trim());
  }

  setMoreMenuOpen(open) {
    return this.setActive(Boolean(open), "menu-open");
  }

  setReactionMenuOpen(open) {
    return this.setActive(Boolean(open), "reaction-menu-open");
  }

  onMouseEnter() {
    return this.setActive(true, "pointer");
  }

  onMouseLeave() {
    return this.setActive(false, "pointer");
  }

  onMoreMenuMouseEnter() {
    return this.setActive(true, "menu-pointer");
  }

  onMoreMenuMouseLeave() {
    return this.setActive(false, "menu-pointer");
  }

  moreMenuDestroy() {
    this._releaseMoreMenu();
  }

  reactionMenuDestroy() {
    this._releaseReactionMenu();
  }

  _releaseMoreMenu() {
    if (this._more_menu_destroyed) return;
    this._more_menu_destroyed = true;
    this._unsubscribe_more_menu?.();
    this._unsubscribe_more_menu = null;
    this.setMoreMenuOpen(false);
    this._destroy_more_menu?.();
    this._destroy_more_menu = null;
  }

  _releaseReactionMenu() {
    if (this._reaction_menu_destroyed) return;
    this._reaction_menu_destroyed = true;
    this._unsubscribe_reaction_menu?.();
    this._unsubscribe_reaction_menu = null;
    this.setReactionMenuOpen(false);
    this._destroy_reaction_menu?.();
    this._destroy_reaction_menu = null;
  }

  destroy() {
    if (this._destroyed) return;
    this.moreMenuDestroy();
    this.reactionMenuDestroy();
    this._destroyed = true;
    this._active_sources.clear();
    this.active.destroy?.();
    this._on_destroy?.(this);
    this._on_destroy = null;
  }
}

const VIEW_META = Object.freeze({
  boards: {
    eyebrow: "WORKFLOW / BOARDS",
    hideComposer: true,
    searchPlaceholder: "搜索看板或任务",
    subtitle: "可配置工作流的看板视图",
    title: "看板",
  },
  chat: {
    eyebrow: "LOCAL / AGENT",
    hideComposer: true,
    searchPlaceholder: "",
    subtitle: "直接连接本机原生 ACP Agent",
    title: "ACP Chat",
  },
  clipboard: {
    eyebrow: "CAPTURE / CLIPBOARD",
    hideComposer: true,
    searchPlaceholder: "搜索当前粘贴板内容",
    subtitle: "显示当前粘贴板的文本、链接或图片",
    title: "粘贴板",
  },
  codeblocks: {
    eyebrow: "LIBRARY / CODE",
    hideComposer: true,
    searchPlaceholder: "搜索代码片段、别名、命令或来源 memo",
    subtitle: "默认仅显示已标记片段，可切换查看全部代码块",
    title: "代码片段",
  },
  files: {
    eyebrow: "LIBRARY / FILES",
    hideComposer: true,
    searchPlaceholder: "搜索文件、图片或来源 memo",
    subtitle: "Finder 图标视图 · 右键文件可查看或定位来源",
    title: "文件",
  },
  images: {
    eyebrow: "LIBRARY / IMAGES",
    hideComposer: true,
    searchPlaceholder: "搜索图片或来源 memo",
    subtitle: "从所有 memo 中汇总图片，瀑布流展示",
    title: "图片",
  },
  links: {
    eyebrow: "LIBRARY / LINKS",
    hideComposer: true,
    searchPlaceholder: "搜索链接或来源 memo",
    subtitle: "从所有 memo 中汇总超链接",
    title: "超链接",
  },
  memos: {
    eyebrow: "THREAD / INBOX",
    hideComposer: false,
    searchPlaceholder: "搜索 memos",
    showHomeActions: true,
    subtitle: "捕捉、整理、回看",
    title: "Inbox",
  },
  milestones: {
    eyebrow: "GTD / HORIZON",
    hideComposer: true,
    searchPlaceholder: "搜索阶段目标",
    subtitle: "像 Milestone 一样管理阶段收敛",
    title: "Milestones",
  },
  "project-detail": {
    eyebrow: "WORKSPACE / PROJECT",
    hideComposer: true,
    searchPlaceholder: "搜索项目内 memos",
    subtitle: "",
    title: "项目详情",
  },
  rules: {
    eyebrow: "WORKFLOW / RULES",
    hideComposer: true,
    searchPlaceholder: "搜索规则",
    subtitle: "集中管理所有看板的自动化规则",
    title: "流程配置",
  },
  todos: {
    eyebrow: "GTD / TASKS",
    hideComposer: true,
    searchPlaceholder: "搜索任务、标签、清单或上下文",
    subtitle: "需求池、Inbox、Today、Scheduled 与任务 notes",
    title: "GTD",
  },
});

export function activeViewMeta(view) {
  return VIEW_META[view] || VIEW_META.memos;
}

export function applyContentOpsToString(text, operations) {
  if (!operations?.length) return text;
  const runes = Array.from(text);
  const result = [];
  let position = 0;
  operations.forEach(function (operation) {
    if (operation.type === "retain") {
      const count = Math.min(operation.count || 0, runes.length - position);
      if (count > 0) {
        result.push(...runes.slice(position, position + count));
        position += count;
      }
      return;
    }
    if (operation.type === "insert") {
      if (operation.text) result.push(...Array.from(operation.text));
      return;
    }
    if (operation.type === "delete") {
      position = Math.min(runes.length, position + (operation.count || 0));
    }
  });
  if (position < runes.length) result.push(...runes.slice(position));
  return result.join("");
}

export function stripMemoFrontmatter(text) {
  if (typeof text !== "string") return "";
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return text;
  const end_index = lines.slice(1).findIndex(function (line) {
    return line.trim() === "---";
  });
  if (end_index < 0) return text;
  return lines.slice(end_index + 2).join("\n").trim();
}
