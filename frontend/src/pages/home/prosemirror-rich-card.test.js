import test from "node:test";
import assert from "node:assert/strict";

import {
  ProseMirrorFileDropCardModel,
  ProseMirrorRichCardModel,
  prosemirror_card_presentation,
} from "./prosemirror-rich-card.js";

function test_runtime() {
  return {
    defineModel(config) {
      return {
        ...config,
        destroy() {
          Object.values(config.state).forEach((value) => value.destroy?.());
        },
      };
    },
    ref(initial_value) {
      return {
        destroyed: false,
        value: initial_value,
        as(next_value) {
          this.value = next_value;
        },
        destroy() {
          this.destroyed = true;
        },
      };
    },
  };
}

function node(type, attrs) {
  return { type: { name: type }, attrs };
}

test("normalizes ProseMirror file cards without changing schema attributes", () => {
  const card = prosemirror_card_presentation(
    node("file_link", {
      href: "https://example.com/report.pdf",
      name: "report.pdf",
      syntax: "markdown",
    }),
  );

  assert.equal(card.tagName, "a");
  assert.equal(card.semanticName, "prosemirror-file-card");
  assert.equal(card.text, "report.pdf");
  assert.equal(card.attrs.href, "https://example.com/report.pdf");
  assert.match(card.className, /file-link-node-markdown/);
});

test("derives reactive image upload card status text", () => {
  const uploading = prosemirror_card_presentation(
    node("image_upload", { fileName: "cover.png", status: "uploading" }),
  );
  const failed = prosemirror_card_presentation(
    node("image_upload", { message: "network unavailable", status: "error" }),
  );

  assert.equal(uploading.text, "正在上传 cover.png");
  assert.equal(uploading.kind, "IMG");
  assert.equal(failed.text, "上传失败：network unavailable");
  assert.equal(failed.kind, "ERROR");
});

test("model owns card updates and ProseMirror selection state", () => {
  const runtime = test_runtime();
  const model = ProseMirrorRichCardModel({
    runtime,
    node: node("time", { value: "2026-08-20 16:30" }),
  });

  model.methods.selectNode();
  assert.equal(model.state.selected.value, true);
  assert.equal(
    model.methods.updateNode(node("time", { value: "2026-08-21 09:00" })),
    true,
  );
  assert.equal(model.state.card.value.text, "2026-08-21 09:00");
  assert.equal(
    model.methods.updateNode(node("image_link", { src: "cover.png" })),
    false,
  );
  assert.equal(model.state.card.value.type, "time");

  model.methods.deselectNode();
  assert.equal(model.state.selected.value, false);
  model.destroy();
  assert.equal(model.state.card.destroyed, true);
});

test("file drop card model normalizes decoration state", () => {
  const model = ProseMirrorFileDropCardModel({
    runtime: test_runtime(),
    pluginState: { count: 0, placement: "unknown" },
  });

  assert.deepEqual(model.state.data.value, {
    count: 1,
    placement: "between",
  });
  model.destroy();
  assert.equal(model.state.data.destroyed, true);
});
