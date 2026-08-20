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
  items: {
    eyebrow: "GTD / TRIAGE",
    hideComposer: true,
    searchPlaceholder: "搜索开放事项、标签或决策",
    subtitle: "像 Issue 一样管理 open loops",
    title: "Open Loops",
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
    searchPlaceholder: "搜索任务、清单或上下文",
    subtitle: "Inbox、Today、Scheduled 与任务 notes",
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
