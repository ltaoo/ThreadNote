import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMemoReferences,
  collectResources,
  getResourceStats,
} from "./memo-resources.js";

test("memo resources include raw managed assets and local images", function () {
  const memo = {
    content: [
      "raw @assets/memo-local/images/photo.png",
      "raw @assets/memo-local/docs/spec.pdf",
      "local://memo-assets/screenshot.webp",
      '<img src="local://memo-assets/html.png" alt="HTML image" />',
      "https://example.com/report.pdf",
    ].join("\n"),
    createdAt: "2026-09-09T01:00:00Z",
    id: "memo-resources",
  };

  const stats = getResourceStats([memo]);
  assert.equal(stats.images, 3);
  assert.equal(stats.files, 2);
  assert.equal(stats.total, 5);
});

test("memo resource extraction ignores assets inside inline and fenced code", function () {
  const memo = {
    content: [
      "`@assets/memo-local/inline.png`",
      "```",
      "@assets/memo-local/fenced.pdf",
      "```",
      "@assets/memo-local/real.png",
    ].join("\n"),
    createdAt: "2026-09-09T01:00:00Z",
    id: "memo-code-resources",
  };

  assert.deepEqual(
    collectResources([memo]).map(function (resource) { return resource.url; }),
    ["@assets/memo-local/real.png"],
  );
});

test("memo references do not double-count markdown, HTML, and raw URLs", function () {
  const memo = {
    content: [
      "![image](@assets/memo-local/photo.png)",
      '<img src="https://example.com/html.png" alt="html" />',
      "https://example.com/raw.pdf",
    ].join("\n"),
    createdAt: "2026-09-09T01:00:00Z",
    id: "memo-resource-ranges",
  };

  assert.deepEqual(
    collectMemoReferences([memo]).map(function (reference) {
      return reference.url;
    }),
    [
      "@assets/memo-local/photo.png",
      "https://example.com/html.png",
      "https://example.com/raw.pdf",
    ],
  );
});
