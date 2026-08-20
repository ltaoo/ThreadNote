import { ComponentModel } from "./component-models.js";

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function contentTags(content) {
  const matches = String(content || "").match(/#[\p{L}\p{N}_-]+/gu) || [];
  return uniqueStrings(matches.map((tag) => tag.slice(1)));
}

function normalizedMemo(memo = {}) {
  const content = String(memo.content || "");
  const reactions = Object.freeze(uniqueStrings(memo.reactions));
  const tags = Object.freeze(uniqueStrings(memo.tags).length
    ? uniqueStrings(memo.tags)
    : contentTags(content));
  return Object.freeze({
    ...memo,
    alias: String(memo.alias || ""),
    archived: Boolean(memo.archived),
    author: String(memo.author || memo.authorName || "You"),
    authorAvatar: String(memo.authorAvatar || memo.avatar || ""),
    backlinks: Math.max(0, Number(memo.backlinks) || 0),
    comments: Math.max(
      0,
      Number(Array.isArray(memo.comments) ? memo.comments.length : memo.comments) || 0,
    ),
    content,
    createdAt: memo.createdAt || "",
    id: String(memo.id || ""),
    pinned: Boolean(memo.pinned),
    projectLabel: String(memo.projectLabel || memo.project || ""),
    reactions,
    tags,
    title: String(memo.title || ""),
    updatedAt: memo.updatedAt || "",
    visibility: String(memo.visibility || "PUBLIC"),
  });
}

function presentationForMemo(memo) {
  const lines = memo.content.split("\n");
  const firstContentLine = lines.findIndex((line) => line.trim());
  const firstLine = firstContentLine >= 0 ? lines[firstContentLine].trim() : "";
  const heading = firstLine.match(/^#{1,6}\s+(.+)$/);
  const title = memo.title || (heading ? heading[1].trim() : "");
  const body = title && heading
    ? lines.filter((_, index) => index !== firstContentLine).join("\n").trim()
    : memo.content;
  return Object.freeze({
    body,
    characterCount: Array.from(memo.content).length,
    collapsible: body.length > 360 || body.split("\n").length > 8,
    pinAction: Object.freeze({
      icon: memo.pinned ? "unpin" : "pin",
      label: memo.pinned ? "取消置顶" : "置顶",
    }),
    title,
  });
}

export class MemoCardModel extends ComponentModel {
  constructor(options = {}) {
    super({
      busyAction: null,
      error: null,
      expanded: Boolean(options.expanded),
      memo: normalizedMemo(options.memo),
      selected: Boolean(options.selected),
    });
    this._onAction = options.onAction || null;
    this._onArchiveChange = options.onArchiveChange || null;
    this._onComment = options.onComment || null;
    this._onDelete = options.onDelete || null;
    this._onEdit = options.onEdit || null;
    this._onError = options.onError || null;
    this._onOpen = options.onOpen || null;
    this._onPinChange = options.onPinChange || null;
    this._onReaction = options.onReaction || null;
    this._onSelect = options.onSelect || null;
    this._onTagClick = options.onTagClick || null;
  }

  get memo() {
    return this.state.memo;
  }

  get presentation() {
    return presentationForMemo(this.state.memo);
  }

  setMemo(memo) {
    this.setState({ memo: normalizedMemo(memo) });
  }

  setSelected(selected, event) {
    const nextSelected = Boolean(selected);
    this.setState({ selected: nextSelected });
    if (!this._onSelect) return nextSelected;
    return this._captureActionError(
      "select",
      () => this._onSelect(nextSelected, this.state.memo, event),
    );
  }

  expand(event) {
    if (this.state.expanded) return false;
    this.setState({ expanded: true });
    this._notifyAction("expand", { event, expanded: true });
    return true;
  }

  toggleExpanded(event) {
    return this.expand(event);
  }

  open(event) {
    return this._runAction(
      "open",
      this._onOpen ? () => this._onOpen(this.state.memo, event) : null,
      event,
    );
  }

  edit(event) {
    return this._runAction(
      "edit",
      this._onEdit ? () => this._onEdit(this.state.memo, event) : null,
      event,
    );
  }

  comment(event) {
    return this._runAction(
      "comment",
      this._onComment ? () => this._onComment(this.state.memo, event) : null,
      event,
    );
  }

  delete(event) {
    return this._runAction(
      "delete",
      this._onDelete ? () => this._onDelete(this.state.memo, event) : null,
      event,
    );
  }

  togglePinned(event) {
    const pinned = !this.state.memo.pinned;
    return this._runAction(
      "pin",
      this._onPinChange
        ? () => this._onPinChange(pinned, this.state.memo, event)
        : null,
      event,
      { pinned },
      () => this.setMemo({ ...this.state.memo, pinned }),
    );
  }

  toggleArchived(event) {
    const archived = !this.state.memo.archived;
    return this._runAction(
      "archive",
      this._onArchiveChange
        ? () => this._onArchiveChange(archived, this.state.memo, event)
        : null,
      event,
      { archived },
      () => this.setMemo({ ...this.state.memo, archived }),
    );
  }

  clickTag(tag, event) {
    const normalizedTag = String(tag || "").trim();
    if (!normalizedTag) return undefined;
    return this._runAction(
      "tag",
      this._onTagClick
        ? () => this._onTagClick(normalizedTag, this.state.memo, event)
        : null,
      event,
      { tag: normalizedTag },
    );
  }

  async toggleReaction(reaction, event) {
    const normalizedReaction = String(reaction || "").trim();
    if (!normalizedReaction || this.state.busyAction) return false;
    const reactions = this.state.memo.reactions.includes(normalizedReaction)
      ? this.state.memo.reactions.filter((item) => item !== normalizedReaction)
      : [...this.state.memo.reactions, normalizedReaction];
    return this._runAction(
      "reaction",
      this._onReaction
        ? () => this._onReaction(normalizedReaction, this.state.memo, event)
        : null,
      event,
      { reaction: normalizedReaction, reactions },
      () => this.setMemo({ ...this.state.memo, reactions }),
    );
  }

  dismissError() {
    this.setState({ error: null });
  }

  _notifyAction(action, detail = {}) {
    if (!this._onAction) return undefined;
    return this._captureActionError(
      action,
      () => this._onAction(action, this.state.memo, detail),
    );
  }

  _captureActionError(action, callback) {
    try {
      const result = callback();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          this.setState({ error });
          this._onError?.(error, action, this.state.memo);
        });
      }
      return result;
    } catch (error) {
      this.setState({ error });
      this._onError?.(error, action, this.state.memo);
      return false;
    }
  }

  async _runAction(action, perform, event, detail = {}, commit) {
    if (this.state.busyAction) return false;
    this.setState({ busyAction: action, error: null });
    try {
      const result = perform ? await perform() : undefined;
      if (result !== false) commit?.();
      this._notifyAction(action, { ...detail, event, result });
      return result;
    } catch (error) {
      this.setState({ error });
      this._onError?.(error, action, this.state.memo);
      return false;
    } finally {
      this.setState({ busyAction: null });
    }
  }
}

export class MemoCardMenuModel extends ComponentModel {
  constructor() {
    super({ openMemoId: "" });
  }

  open(memoId) {
    const openMemoId = String(memoId || "").trim();
    if (!openMemoId) return false;
    this.setState({ openMemoId });
    return true;
  }

  close() {
    if (!this.state.openMemoId) return false;
    this.setState({ openMemoId: "" });
    return true;
  }

  toggle(memoId) {
    const nextMemoId = String(memoId || "").trim();
    if (!nextMemoId) return false;
    if (this.state.openMemoId === nextMemoId) return this.close();
    return this.open(nextMemoId);
  }

  isOpen(memoId) {
    return this.state.openMemoId === String(memoId || "").trim();
  }
}

export class MemoCardExpansionModel extends ComponentModel {
  constructor(options = {}) {
    super({
      collapsedLineCount: Math.max(1, Math.floor(Number(options.collapsedLineCount) || 36)),
      expandedMemoIds: Object.freeze(uniqueStrings(options.expandedMemoIds)),
    });
  }

  measureContent(renderedHeight, lineHeight) {
    const normalizedRenderedHeight = Math.max(0, Number(renderedHeight) || 0);
    const normalizedLineHeight = Math.max(0, Number(lineHeight) || 0);
    const collapsedHeight = normalizedLineHeight
      ? Math.round(normalizedLineHeight * this.state.collapsedLineCount)
      : 0;
    return Object.freeze({
      collapsedHeight,
      hasOverflow: collapsedHeight > 0 && normalizedRenderedHeight > collapsedHeight + 1,
      renderedHeight: normalizedRenderedHeight,
    });
  }

  expand(memoId) {
    const normalizedMemoId = String(memoId || "").trim();
    if (!normalizedMemoId || this.isExpanded(normalizedMemoId)) return false;
    this.setState({
      expandedMemoIds: Object.freeze(
        this.state.expandedMemoIds.concat(normalizedMemoId),
      ),
    });
    return true;
  }

  isExpanded(memoId) {
    const normalizedMemoId = String(memoId || "").trim();
    return Boolean(
      normalizedMemoId && this.state.expandedMemoIds.includes(normalizedMemoId),
    );
  }
}

export const createMemoCardModel = (options) => new MemoCardModel(options);
export const createMemoCardMenuModel = () => new MemoCardMenuModel();
export const createMemoCardExpansionModel = (options) => new MemoCardExpansionModel(options);
