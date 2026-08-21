import assert from "node:assert/strict";
import test from "node:test";

import {
  activeViewMeta,
  applyContentOpsToString,
  detachedMemoRenderContext,
  MemoCardViewModel,
  parseHost,
  stripMemoFrontmatter,
} from "./memo-view-model.js";

function createTestRef(initial_value) {
  return {
    value: initial_value,
    as(next_value) {
      this.value = next_value;
    },
    destroy() {},
  };
}

function createMemoCardViewModel(options = {}) {
  return new MemoCardViewModel({ createRef: createTestRef, ...options });
}

test("active view metadata exposes home actions only for the memo feed", function () {
  assert.equal(activeViewMeta("memos").showHomeActions, true);
  ["boards", "chat", "codeblocks", "files", "images", "links", "milestones", "project-detail", "rules", "todos"].forEach(function (view) {
    assert.equal(Boolean(activeViewMeta(view).showHomeActions), false, view);
  });
});

test("parseHost normalizes common host names and rejects invalid URLs", function () {
  assert.deepEqual(parseHost("https://www.example.com/docs"), {
    host: "example.com",
    hostname: "www.example.com",
  });
  assert.deepEqual(parseHost("not a URL"), { host: "", hostname: "" });
});

test("content operations replay unicode-safe history edits", function () {
  assert.equal(applyContentOpsToString("甲🙂乙", [
    { count: 2, type: "retain" },
    { count: 1, type: "delete" },
    { text: "丙", type: "insert" },
  ]), "甲🙂丙");
});

test("memo frontmatter is removed without changing plain markdown", function () {
  assert.equal(stripMemoFrontmatter("---\nvisibility: PRIVATE\n---\n\n正文"), "正文");
  assert.equal(stripMemoFrontmatter("# 标题\n正文"), "# 标题\n正文");
});

test("detached render context reuses the model-owned reference index", function () {
  const state = { editorSettings: { lineNumbers: true }, memos: [] };
  const first = detachedMemoRenderContext(state, "memo-1", { readonly: true });
  const second = detachedMemoRenderContext(state, "memo-2");
  assert.equal(first.index, second.index);
  assert.deepEqual(first.stack, ["memo-1"]);
  assert.equal(first.readonly, true);
});

test("MemoCardViewModel owns independent active sources", function () {
  const first = createMemoCardViewModel({ presentation: { id: "memo-1" } });
  const second = createMemoCardViewModel({ presentation: { id: "memo-2" } });

  first.setMoreMenuOpen(true);
  second.onMouseEnter();

  assert.equal(first.active.value, true);
  assert.equal(first.isActiveSource("menu-open"), true);
  assert.equal(second.active.value, true);
  assert.equal(second.isActiveSource("pointer"), true);

  second.onMouseLeave();
  assert.equal(second.active.value, false);
  assert.equal(first.active.value, true);

  first.setMoreMenuOpen(false);
  assert.equal(first.active.value, false);
  first.destroy();
  second.destroy();
});

test("MemoCardViewModel exposes external active control", function () {
  const first = createMemoCardViewModel({ presentation: { id: "memo-1" } });
  const second = createMemoCardViewModel({ presentation: { id: "memo-2" } });

  first.setActive(true);
  second.setActive(true);
  assert.equal(first.active.value, true);
  assert.equal(second.active.value, true);

  first.setActive(false);
  assert.equal(first.active.value, false);
  assert.equal(second.active.value, true);
  first.destroy();
  second.destroy();
});

test("MemoCardViewModel stays active while its reaction menu is open", function () {
  let menu_listener = null;
  let menu_destroy_count = 0;
  const reaction_menu = {
    state: { visible: false },
    onStateChange(listener) {
      menu_listener = listener;
      return function () {};
    },
  };
  const model = createMemoCardViewModel({
    presentation: {
      id: "memo-1",
      reactionMenu: reaction_menu,
      reactionMenuDestroy() {
        menu_destroy_count += 1;
      },
    },
  });

  model.onMouseEnter();
  menu_listener({ visible: true });
  model.onMouseLeave();
  assert.equal(model.active.value, true);
  assert.equal(model.isActiveSource("reaction-menu-open"), true);

  menu_listener({ visible: false });
  assert.equal(model.active.value, false);
  model.destroy();
  assert.equal(menu_destroy_count, 1);
});

test("MemoCardViewModel owns menu and presentation cleanup", function () {
  let menu_listener = null;
  let menu_destroy_count = 0;
  let unregister_count = 0;
  const more_menu = {
    state: { visible: false },
    onStateChange(listener) {
      menu_listener = listener;
      return function () {
        unregister_count += 1;
      };
    },
  };
  const model = createMemoCardViewModel({
    presentation: {
      id: "memo-1",
      moreMenu: more_menu,
      moreMenuDestroy() {
        menu_destroy_count += 1;
      },
    },
  });

  menu_listener({ visible: true });
  assert.equal(model.active.value, true);
  model.destroy();
  model.destroy();
  assert.equal(menu_destroy_count, 1);
  assert.equal(unregister_count, 1);
});

test("MemoCardViewModel reuses its menu store across presentation updates", function () {
  let current_listener = null;
  let current_destroy_count = 0;
  let current_unregister_count = 0;
  let next_destroy_count = 0;
  const current_menu = {
    state: { items: ["old"], visible: false },
    onStateChange(listener) {
      current_listener = listener;
      return function () {
        current_unregister_count += 1;
      };
    },
    setItems(items) {
      this.state.items = items;
    },
  };
  const next_menu = { state: { items: ["new"], visible: false } };
  const model = createMemoCardViewModel({
    presentation: {
      id: "memo-1",
      moreMenu: current_menu,
      moreMenuDestroy() {
        current_destroy_count += 1;
      },
    },
  });

  current_listener({ visible: true });
  model.updatePresentation({
    id: "memo-1",
    moreMenu: next_menu,
    moreMenuDestroy() {
      next_destroy_count += 1;
    },
  });

  assert.equal(model.moreMenu, current_menu);
  assert.deepEqual(current_menu.state.items, ["new"]);
  assert.equal(model.active.value, true);
  assert.equal(next_destroy_count, 1);
  assert.equal(current_destroy_count, 0);
  assert.equal(current_unregister_count, 0);
  model.destroy();
  assert.equal(current_destroy_count, 1);
  assert.equal(current_unregister_count, 1);
});
