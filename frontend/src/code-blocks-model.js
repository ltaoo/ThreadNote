export class CodeBlocksModel {
  constructor(options = {}) {
    const pageSize = Number(options.pageSize);
    this.state = {
      limit: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 20,
      pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 20,
      showAll: Boolean(options.showAll),
    };
  }

  setShowAll(showAll) {
    const nextShowAll = Boolean(showAll);
    if (this.state.showAll !== nextShowAll) {
      this.state.showAll = nextShowAll;
      this.resetPagination();
    }
    return this.state.showAll;
  }

  resetPagination() {
    this.state.limit = this.state.pageSize;
  }

  visibleBlocks(blocks) {
    const items = Array.isArray(blocks) ? blocks : [];
    if (this.state.showAll) return items.slice();
    return items.filter(function (block) {
      return Boolean(block && block.marked);
    });
  }

  select(blocks) {
    const items = this.visibleBlocks(blocks);
    const visibleItems = items.slice(0, this.state.limit);
    return Object.freeze({
      hasMore: visibleItems.length < items.length,
      items: visibleItems,
      total: items.length,
    });
  }

  loadNext(blocks) {
    const items = this.visibleBlocks(blocks);
    const start = Math.min(this.state.limit, items.length);
    if (start >= items.length) {
      return Object.freeze({ hasMore: false, items: [], total: items.length });
    }

    this.state.limit = Math.min(items.length, start + this.state.pageSize);
    return Object.freeze({
      hasMore: this.state.limit < items.length,
      items: items.slice(start, this.state.limit),
      total: items.length,
    });
  }
}
