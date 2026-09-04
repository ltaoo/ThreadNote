import assert from "node:assert/strict";
import test from "node:test";

import { renderMemoMarkdown } from "./memo-markdown.js";

test("multi-line fenced code renders an ink workbench with gutter metadata", function () {
  const lines = Array.from({ length: 24 }, function (_item, index) {
    return `const line_${index + 1} = ${index + 1};`;
  });
  const html = renderMemoMarkdown(["```javascript"].concat(lines, ["```"]).join("\n"), {
    sourceId: "memo-code-test",
  });

  assert.match(html, /memo-fenced-code-multiline/);
  assert.match(html, /memo-fenced-code-collapsible/);
  assert.match(html, /data-code-line-count="24"/);
  assert.match(html, /<span class="memo-fenced-code-meta"[^>]*>24 行<\/span>/);
  assert.match(html, /<div class="memo-fenced-code-gutter"[^>]*aria-hidden="true">/);
  assert.match(html, /<span data-n="code-line-number">24<\/span>/);
  assert.match(html, /<span data-n="code-copy-label">复制<\/span>/);
  assert.equal((html.match(/data-action="toggleCodeCollapse"/g) || []).length, 1);
  assert.doesNotMatch(html, /展开剩余/);
  assert.doesNotMatch(html, /memo-fenced-code-overlay|memo-fenced-code-expand-btn/);
});

test("single-line fenced code keeps copy affordance without a multiline class", function () {
  const html = renderMemoMarkdown("```sh\necho threadnote\n```", { sourceId: "memo-code-single" });

  assert.match(html, /memo-fenced-code-singleline/);
  assert.doesNotMatch(html, /memo-fenced-code-collapsible/);
  assert.match(html, /data-code-line-count="1"/);
});

test("multi-line code uses the legacy highlighter when CSS highlights are available", function () {
  const original_css = globalThis.CSS;
  const original_highlight = globalThis.Highlight;
  const original_range = globalThis.Range;
  const original_hljs = globalThis.hljs;
  let legacy_highlight_calls = 0;

  try {
    globalThis.CSS = { highlights: new Map() };
    globalThis.Highlight = function Highlight() {};
    globalThis.Range = function Range() {};
    globalThis.hljs = {
      getLanguage() {
        return true;
      },
      highlight() {
        legacy_highlight_calls += 1;
        return { value: '<span class="legacy-highlight">code</span>' };
      },
    };

    const html = renderMemoMarkdown(
      "```javascript\nconst value = 1;\nconsole.log(value);\n```",
      { sourceId: "memo-code-deferred" },
    );

    assert.equal(legacy_highlight_calls, 1);
    assert.match(html, /legacy-highlight/);
  } finally {
    if (original_css === undefined) delete globalThis.CSS;
    else globalThis.CSS = original_css;
    if (original_highlight === undefined) delete globalThis.Highlight;
    else globalThis.Highlight = original_highlight;
    if (original_range === undefined) delete globalThis.Range;
    else globalThis.Range = original_range;
    if (original_hljs === undefined) delete globalThis.hljs;
    else globalThis.hljs = original_hljs;
  }
});

test("memo tasks render through the shared Checkbox component mount", function () {
  const html = renderMemoMarkdown("- [ ] 规划样式\n- [x] 完成交互", {
    sourceId: "memo-checkbox-test",
  });

  assert.match(html, /<tn-checkbox class="memo-task-checkbox memo-todo-checkbox"/);
  assert.match(html, /control-class="tn-checkbox--todo tn-checkbox--memo"/);
  assert.match(html, /data-task-line="0"/);
  assert.match(html, /data-task-source-memo-id="memo-checkbox-test"/);
  assert.match(html, /data-task-line="1"[^>]* checked/);
  assert.doesNotMatch(html, /<input type="checkbox"/);
});

test("readonly memo tasks keep the shared Checkbox component disabled", function () {
  const html = renderMemoMarkdown("- [ ] 只读任务", {
    readonly: true,
    sourceId: "memo-checkbox-readonly",
  });

  assert.match(html, /<tn-checkbox[^>]* disabled/);
});
