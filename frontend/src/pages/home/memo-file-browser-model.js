import { fileDisplayName } from "../../domain/memo-resources.js";

const FILE_BROWSER_ACTIONS = new Set(["copy", "source", "view"]);

export class FileBrowserModel {
  constructor() {
    this.state = {
      contextItemId: "",
      items: [],
      selectedItemId: "",
    };
  }

  setResources(resources) {
    const previousSelection = this.state.selectedItemId;
    this.state.items = (Array.isArray(resources) ? resources : []).map(fileBrowserItem);
    this.state.selectedItemId = this.itemById(previousSelection) ? previousSelection : "";
    this.state.contextItemId = "";
    return this.items();
  }

  items() {
    return this.state.items.slice();
  }

  itemById(itemId) {
    const id = String(itemId || "");
    return this.state.items.find(function (item) {
      return item.id === id;
    }) || null;
  }

  select(itemId) {
    const item = this.itemById(itemId);
    this.state.selectedItemId = item ? item.id : "";
    return item;
  }

  clearSelection() {
    this.state.selectedItemId = "";
  }

  openContext(itemId) {
    const item = this.select(itemId);
    this.state.contextItemId = item ? item.id : "";
    return item;
  }

  closeContext() {
    this.state.contextItemId = "";
  }

  performContextAction(action) {
    const normalizedAction = String(action || "");
    const item = this.itemById(this.state.contextItemId);
    this.closeContext();
    if (!item || !FILE_BROWSER_ACTIONS.has(normalizedAction)) return null;
    return {
      action: normalizedAction,
      item,
    };
  }
}

export function fileBrowserItem(resource, index) {
  const value = resource && typeof resource === "object" ? resource : {};
  const name = fileDisplayName(value.label, value.url) || "未命名文件";
  const extension = fileExtension(name, value.url);
  const kind = fileKind(value.type, extension);
  return {
    badge: fileBadge(kind, extension),
    id: fileItemId(value, index),
    kind,
    kindLabel: fileKindLabel(kind),
    memoId: String(value.sourceMemoId || value.memoId || ""),
    name,
    sourceCommentId: String(value.sourceCommentId || ""),
    sourceType: String(value.sourceType || "memo"),
    type: String(value.type || "file"),
    url: String(value.url || ""),
  };
}

function fileItemId(resource, index) {
  const explicitId = String(resource.id || "").trim();
  if (explicitId) return explicitId;
  return [
    String(resource.sourceMemoId || resource.memoId || "file"),
    String(resource.lineIndex === undefined ? "" : resource.lineIndex),
    String(resource.url || ""),
    String(index === undefined ? 0 : index),
  ].join(":");
}

function fileExtension(name, url) {
  return extensionFromValue(name) || extensionFromValue(url);
}

function extensionFromValue(value) {
  const cleanValue = String(value || "").split(/[?#]/)[0];
  const match = cleanValue.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "";
}

function fileKind(type, extension) {
  if (type === "image" || /^(?:avif|bmp|gif|heic|jpe?g|png|svg|webp)$/.test(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (/^(?:doc|docx|odt|pages|rtf)$/.test(extension)) return "document";
  if (/^(?:csv|numbers|ods|xls|xlsx)$/.test(extension)) return "spreadsheet";
  if (/^(?:key|odp|ppt|pptx)$/.test(extension)) return "presentation";
  if (/^(?:7z|gz|rar|tar|zip)$/.test(extension)) return "archive";
  if (/^(?:aac|flac|m4a|mp3|wav)$/.test(extension)) return "audio";
  if (/^(?:avi|mkv|mov|mp4|webm)$/.test(extension)) return "video";
  if (/^(?:css|go|html|java|js|json|jsx|md|py|rs|sh|ts|tsx|xml|yaml|yml)$/.test(extension)) return "code";
  if (/^(?:log|txt)$/.test(extension)) return "text";
  return "file";
}

function fileBadge(kind, extension) {
  if (extension) return extension.slice(0, 4).toUpperCase();
  if (kind === "image") return "IMG";
  return "FILE";
}

function fileKindLabel(kind) {
  return {
    archive: "压缩文件",
    audio: "音频文件",
    code: "代码文件",
    document: "文档",
    file: "文件",
    image: "图片文件",
    pdf: "PDF 文档",
    presentation: "演示文稿",
    spreadsheet: "电子表格",
    text: "文本文件",
    video: "视频文件",
  }[kind] || "文件";
}
