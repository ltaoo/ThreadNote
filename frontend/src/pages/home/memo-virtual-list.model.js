export class MemoVirtualListModel {
  constructor(options = {}) {
    this.estimated_height = Math.max(1, options.estimatedHeight ?? 320);
    this.overscan = Math.max(0, options.overscan ?? 800);
    this.gap = Math.max(0, options.gap ?? 12);
    this.padding_top = Math.max(0, options.paddingTop ?? 4);
    this.padding_bottom = Math.max(0, options.paddingBottom ?? 24);
    this.items = [];
    this.keys = [];
    this.index_by_key = new Map();
    this.heights = new Map();
    this.offsets = [];
    this.pinned_keys = new Set();
    this.viewport_top = 0;
    this.viewport_height = 0;
    this.items_end = this.padding_top;
    this.total_height = this.padding_top + this.padding_bottom;
  }

  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    this.keys = this.items.map(function (item, index) {
      return String(item?.id || index);
    });
    this.index_by_key = new Map(
      this.keys.map(function (key, index) {
        return [key, index];
      }),
    );
    const live_keys = new Set(this.keys);
    this.heights.forEach((_, key) => {
      if (!live_keys.has(key)) this.heights.delete(key);
    });
    this.rebuild();
  }

  setViewport(top, height) {
    this.viewport_top = Math.max(0, Number(top) || 0);
    this.viewport_height = Math.max(0, Number(height) || 0);
  }

  setPinnedKeys(keys) {
    this.pinned_keys = new Set(
      (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || "").trim())
        .filter((key) => this.index_by_key.has(key)),
    );
  }

  setBottomPadding(padding_bottom) {
    this.padding_bottom = Math.max(0, Number(padding_bottom) || 0);
    this.rebuild();
  }

  invalidateMeasurements(keep_keys = []) {
    const keep = new Set(keep_keys);
    this.heights.forEach((_, key) => {
      if (!keep.has(key)) this.heights.delete(key);
    });
    this.rebuild();
  }

  measure(key, height) {
    const normalized_key = String(key || "");
    const index = this.index_by_key.get(normalized_key);
    const next_height = Math.ceil(Number(height) || 0);
    if (index === undefined || next_height <= 0) return 0;
    const previous_height = this.heightAt(index);
    const delta = next_height - previous_height;
    if (!delta) return 0;
    const above_viewport =
      this.offsets[index] + previous_height <= this.viewport_top;
    this.heights.set(normalized_key, next_height);
    this.rebuild();
    return above_viewport ? delta : 0;
  }

  heightAt(index) {
    return this.heights.get(this.keys[index]) || this.estimated_height;
  }

  offsetAt(index) {
    return this.offsets[index] ?? this.items_end;
  }

  indexForKey(key) {
    return this.index_by_key.get(String(key || ""));
  }

  renderIndexes() {
    if (!this.items.length) return [];
    const start_y = Math.max(0, this.viewport_top - this.overscan);
    const end_y = this.viewport_top + this.viewport_height + this.overscan;
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.offsetAt(middle) + this.heightAt(middle) < start_y) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const indexes = new Set();
    for (let index = low; index < this.items.length; index += 1) {
      if (this.offsetAt(index) > end_y) break;
      indexes.add(index);
    }
    this.pinned_keys.forEach((key) => indexes.add(this.index_by_key.get(key)));
    return Array.from(indexes).sort((left, right) => left - right);
  }

  rebuild() {
    let offset = this.padding_top;
    this.offsets = this.items.map((_, index) => {
      const current = offset;
      offset += this.heightAt(index);
      if (index < this.items.length - 1) offset += this.gap;
      return current;
    });
    this.items_end = offset;
    this.total_height = offset + this.padding_bottom;
  }
}
