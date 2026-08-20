import assert from "node:assert/strict";
import test from "node:test";

import { FileBrowserModel, fileBrowserItem } from "./memo-file-browser-model.js";

test("file browser model derives Finder icon kinds without exposing content", () => {
  const image = fileBrowserItem({ label: "设计稿", memoId: "memo-image", type: "image", url: "@assets/local/design.png" }, 0);
  const document = fileBrowserItem({ label: "需求说明", memoId: "memo-pdf", type: "file", url: "@assets/local/spec.pdf" }, 1);

  assert.equal(image.kind, "image");
  assert.equal(image.badge, "PNG");
  assert.equal(document.kind, "pdf");
  assert.equal(document.kindLabel, "PDF 文档");
});

test("file browser model owns selection and context action state", () => {
  const model = new FileBrowserModel();
  const items = model.setResources([
    { id: "file-one", label: "notes.txt", memoId: "memo-one", type: "file", url: "@assets/local/notes.txt" },
  ]);

  assert.equal(model.openContext(items[0].id).name, "notes.txt");
  assert.equal(model.state.selectedItemId, "file-one");
  assert.deepEqual(model.performContextAction("view"), { action: "view", item: items[0] });
  assert.equal(model.state.contextItemId, "");
});
