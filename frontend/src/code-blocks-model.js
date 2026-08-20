export class CodeBlocksModel {
  constructor(options = {}) {
    this.state = {
      showAll: Boolean(options.showAll),
    };
  }

  setShowAll(showAll) {
    this.state.showAll = Boolean(showAll);
    return this.state.showAll;
  }

  visibleBlocks(blocks) {
    const items = Array.isArray(blocks) ? blocks : [];
    if (this.state.showAll) return items.slice();
    return items.filter(function (block) {
      return Boolean(block && block.marked);
    });
  }
}
