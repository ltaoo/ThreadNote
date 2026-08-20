import assert from "node:assert/strict";
import test from "node:test";

import {
  activeViewMeta,
  boardCardTemplate,
  codeBlocksFilterTemplate,
  codeBlockTemplate,
  fileGridTemplate,
  gtdItemCardTemplate,
  linkTemplate,
  memoTemplate,
  pinnedMemoTemplate,
  projectDetailViewTemplate,
  projectOptionsTemplate,
  projectSidebarItemTemplate,
  shellTemplate,
  taskCardTemplate,
  todoGroupTemplate,
} from "./memo-templates.js";
import { FileBrowserModel } from "./memo-file-browser-model.js";

test("link card exposes branded content and semantic actions", () => {
  const html = linkTemplate({
    label: "ThreadNote 使用指南",
    memoId: "memo-link-card",
    url: "https://docs.example.com/threadnote/start",
  }, {});

  assert.match(html, /data-n="link-card"/);
  assert.match(html, /data-n="link-card-favicon"/);
  assert.match(html, /data-n="link-card-title">ThreadNote 使用指南<\/span>/);
  assert.match(html, /data-n="link-card-url">https:\/\/docs\.example\.com\/threadnote\/start<\/span>/);
  assert.match(html, /data-n="link-card-open-cue"/);
  assert.match(html, /data-n="link-card-actions" role="group" aria-label="链接操作"/);
  assert.equal((html.match(/data-n="link-card-(?:copy|fetch-title|open-source)"/g) || []).length, 3);
});

test("legacy default Project color follows the current theme", () => {
  const project = { color: "#2563eb", id: "project-work", name: "Work" };
  const optionsHTML = projectOptionsTemplate([project], project.id);
  const sidebarHTML = projectSidebarItemTemplate(project, 3, true);
  const memoHTML = memoTemplate({
    content: "Project memo",
    createdAt: "2026-08-20T08:00:00.000Z",
    id: "memo-project-theme",
    projectId: project.id,
    visibility: "PUBLIC",
  }, "", {}, false, [project], {});

  assert.match(optionsHTML, /data-color="var\(--tn-color-primary-fill\)"/);
  assert.match(sidebarHTML, /memo-project-dot" style="--project-color: var\(--tn-color-primary-fill\)"/);
  assert.match(memoHTML, /memo-project-badge" style="--project-color: var\(--tn-color-primary-fill\)"/);
});

test("custom Project color remains project-specific", () => {
  const project = { color: "#d89a33", id: "project-local", name: "Local" };

  assert.match(projectOptionsTemplate([project], project.id), /data-color="#d89a33"/);
  assert.match(projectSidebarItemTemplate(project, 1, false), /--project-color: #d89a33/);
});

test("file collection renders Finder icons and image-only thumbnails", () => {
  const resources = [
    {
      label: "产品说明.pdf",
      memo: { content: "", createdAt: "2026-08-20T08:00:00.000Z", visibility: "PUBLIC" },
      memoId: "memo-file-1",
      type: "file",
      url: "https://example.com/files/product.pdf",
    },
    {
      label: "设计稿.png",
      memo: { content: "", createdAt: "2026-08-20T09:00:00.000Z", visibility: "PUBLIC" },
      memoId: "memo-file-2",
      type: "image",
      url: "https://example.com/files/design.png",
    },
  ];
  const model = new FileBrowserModel();
  const html = fileGridTemplate(model.setResources(resources));

  assert.match(html, /class="memo-file-grid" data-n="finder-file-grid"/);
  assert.equal((html.match(/data-n="finder-file-item"/g) || []).length, 2);
  assert.match(html, /data-file-kind="pdf"/);
  assert.match(html, /data-file-kind="image"/);
  assert.equal((html.match(/data-n="finder-file-thumbnail"/g) || []).length, 1);
  assert.match(html, /class="memo-finder-file-thumbnail"[^>]*design\.png/);
  assert.doesNotMatch(html, /memo-resource-card|memo-resource-preview/);
});

function codeBlock(lines) {
  return {
    aliases: [],
    code: lines.join("\n"),
    endLineIndex: lines.length + 1,
    id: "memo-code-list:0:" + (lines.length + 1) + ":code",
    label: "JavaScript 片段",
    language: "javascript",
    lineIndex: 0,
    marked: true,
    memo: {
      content: "# snippet: JavaScript 片段\n```javascript\n" + lines.join("\n") + "\n```",
      createdAt: "2026-08-20T08:00:00.000Z",
      id: "memo-code-list",
      visibility: "PUBLIC",
    },
    memoId: "memo-code-list",
    sourceMemoId: "memo-code-list",
    sourceType: "memo",
  };
}

function longMemo() {
  return {
    content: Array.from({ length: 40 }, function (_item, index) {
      return `第 ${index + 1} 行内容`;
    }).join("\n"),
    createdAt: "2026-08-20T08:00:00.000Z",
    id: "memo-expand-test",
    visibility: "PUBLIC",
  };
}

test("memo card exposes a single one-way reading affordance while collapsed", () => {
  const html = memoTemplate(longMemo(), "", {}, false, [], {});

  assert.match(html, /class="memo-expand-button"/);
  assert.match(html, /data-action="expandMemo"/);
  assert.match(html, />展开全文<\/span>/);
  assert.doesNotMatch(html, /toggleMemoExpand|>收起<\/span>/);
});

test("expanded memo card removes the reading affordance", () => {
  const html = memoTemplate(longMemo(), "", {}, true, [], {});

  assert.match(html, /memo-list-collapse is-expanded/);
  assert.doesNotMatch(html, /memo-expand-button|data-action="expandMemo"/);
});

test("memo pin action uses a persistent unpin affordance without a duplicate badge", () => {
  const html = memoTemplate({ ...longMemo(), pinned: true }, "", {}, false, [], {});

  assert.match(html, /class="memo-card is-pinned /);
  assert.match(html, /class="memo-card-head-actions"/);
  assert.match(html, /memo-pin-action is-active/);
  assert.match(html, /data-n="memo-pin-toggle"/);
  assert.match(html, /title="取消置顶" aria-label="取消置顶" aria-pressed="true"/);
  assert.match(html, /data-n="unpin-icon"/);
  assert.doesNotMatch(html, /memo-pin-label/);
});

test("memo pin action keeps the regular pin affordance while unpinned", () => {
  const html = memoTemplate(longMemo(), "", {}, false, [], {});

  assert.match(html, /data-n="memo-pin-toggle"/);
  assert.match(html, /title="置顶" aria-label="置顶" aria-pressed="false"/);
  assert.match(html, /data-n="pin-icon"/);
  assert.doesNotMatch(html, /memo-pin-action is-active|data-n="unpin-icon"/);
});

test("pinned memo uses the compact feed-card structure", () => {
  const memo = {
    ...longMemo(),
    content: "# 本地服务入口\n\n正文 #workspace",
    projectId: "project-local",
  };
  const html = pinnedMemoTemplate(memo, { showLineNumbers: false }, false, [
    { id: "project-local", name: "本地服务", color: "#d89a33" },
  ]);

  assert.match(html, /class="memo-pinned-item memo-pinned-card"/);
  assert.match(html, /memo-card-author-info memo-pinned-author-info/);
  assert.match(html, /class="memo-pinned-footer"/);
  assert.match(html, />本地服务<\/span>/);
  assert.match(html, /字符/);
  assert.match(html, /#workspace/);
  assert.match(html, /data-action="togglePin"/);
  assert.match(html, /data-n="pinned-memo-unpin"/);
  assert.match(html, /title="取消置顶" aria-label="取消置顶" aria-pressed="true"/);
  assert.match(html, /data-n="unpin-icon"/);
  assert.match(html, /data-action="detachMemo"/);
});

test("expanded pinned memo removes the one-way reading affordance", () => {
  const html = pinnedMemoTemplate(longMemo(), { showLineNumbers: false }, true, []);

  assert.match(html, /memo-pinned-collapse memo-list-collapse is-expanded/);
  assert.doesNotMatch(html, /memo-expand-button|data-action="expandMemo"/);
});

test("composer draft status sits immediately before the preview action", () => {
  const html = shellTemplate();

  assert.doesNotMatch(html, /memo-composer-kicker|CAPTURE|快速记录/);
  assert.match(
    html,
    /class="memo-composer-actions">\s*<span class="memo-composer-draft-status"[^>]*>已存草稿<\/span>\s*<button[^>]*data-action="toggleComposerPreview"/,
  );
  assert.doesNotMatch(
    html,
    /class="memo-editor-switch memo-composer-switch">[\s\S]*?data-composer-draft-status[\s\S]*?<\/div>\s*<div class="memo-composer-toolbar">/,
  );
});

test("shell shows the memo total in the all filter and omits the feed count", () => {
  const html = shellTemplate();

  assert.match(
    html,
    /data-filter="all"[\s\S]*?data-all-nav-count[^>]*data-n="all-memo-count"/,
  );
  assert.doesNotMatch(html, /data-feed-count|memo-feed-count/);
});

test("shell omits the overview section from the home inspector", () => {
  const html = shellTemplate();

  assert.match(html, /data-calendar/);
  assert.match(html, /data-pinned-list/);
  assert.doesNotMatch(html, /data-stats|memo-stats|>概览</);
});

test("shell exposes project creation only from the sidebar plus button", () => {
  const html = shellTemplate();
  const createProjectActions = html.match(/data-action="createProject"/g) || [];

  assert.equal(createProjectActions.length, 1);
  assert.match(
    html,
    /class="memo-project-create-btn"[^>]*data-n="sidebar-project-create"[^>]*aria-label="新建 Project"/,
  );
  assert.doesNotMatch(
    html,
    /class="tn-button memo-icon-text-button"[^>]*data-action="createProject"/,
  );
});

test("shell keeps settings outside the sidebar scroll content", () => {
  const html = shellTemplate();
  const scrollContentEnd = html.indexOf('<div class="memo-sidebar-footer"');
  const settingsPosition = html.indexOf('data-n="home-sidebar-settings"');

  assert.match(html, /class="memo-sidebar-scroll" data-n="home-sidebar-scroll-content"/);
  assert.ok(scrollContentEnd > 0);
  assert.ok(settingsPosition > scrollContentEnd);
});

test("only the memo home view exposes the shared topbar shortcuts", () => {
  const nonHomeViews = [
    "todos",
    "items",
    "milestones",
    "links",
    "codeblocks",
    "files",
    "images",
    "clipboard",
    "project-detail",
    "boards",
    "rules",
    "chat",
  ];

  assert.equal(activeViewMeta("memos").showHomeActions, true);
  nonHomeViews.forEach(function (view) {
    assert.equal(Boolean(activeViewMeta(view).showHomeActions), false, view);
  });
});

test("code snippet collection reuses the memo multiline code workbench", () => {
  const html = codeBlockTemplate(codeBlock(["const first = 1;", "const second = 2;"]));

  assert.match(html, /memo-fenced-code-multiline/);
  assert.match(html, /data-code-line-count="2"/);
  assert.match(html, /data-n="code-line-number">1<\/span>/);
  assert.match(html, /data-n="code-line-number">2<\/span>/);
  assert.equal((html.match(/data-action="copyCodeBlock"/g) || []).length, 1);
});

test("code snippet collection keeps the compact preview for one line", () => {
  const html = codeBlockTemplate(codeBlock(["const only = true;"]));

  assert.match(html, /memo-code-block-preview/);
  assert.doesNotMatch(html, /memo-fenced-code-multiline|code-line-number-gutter/);
});

test("code snippet collection exposes a semantic show-all checkbox", () => {
  const markedOnly = codeBlocksFilterTemplate(false, 2, 5);
  const all = codeBlocksFilterTemplate(true, 5, 5);

  assert.match(markedOnly, /<tn-checkbox[\s\S]*?data-code-blocks-show-all/);
  assert.doesNotMatch(markedOnly, /data-code-blocks-show-all[\s\S]*?checked/);
  assert.match(markedOnly, />2 \/ 5<\/span>/);
  assert.match(all, /data-code-blocks-show-all[\s\S]*?checked/);
});

test("todo surfaces share the semantic checkbox component", () => {
  const task = {
    boardId: "board-1",
    id: "task-1",
    linkedMemoIds: [],
    linkedTaskIds: [],
    status: "open",
    tags: [],
    title: "统一 Checkbox",
  };
  const memo = {
    content: "- [ ] 统一 Checkbox",
    createdAt: "2026-08-20T08:00:00.000Z",
    id: "memo-1",
    visibility: "PUBLIC",
  };
  const surfaces = [
    taskCardTemplate(task, {}),
    gtdItemCardTemplate(task, {}),
    projectDetailViewTemplate({ id: "project-1" }, [], function () { return ""; }, [task], "tasks", []),
    boardCardTemplate(task),
    todoGroupTemplate("代办", [{ checked: false, lineIndex: 0, memo, memoId: memo.id, text: "统一 Checkbox" }]),
  ];

  surfaces.forEach(function (html) {
    assert.match(html, /<tn-checkbox[^>]*memo-todo-checkbox/);
    assert.match(html, /control-class="tn-checkbox--todo"/);
    assert.doesNotMatch(html, /<input type="checkbox"/);
  });
});

test("project detail renders total counts and semantic scroll loaders", () => {
  const html = projectDetailViewTemplate(
    { id: "project-1" },
    [{ id: "memo-1" }],
    function (memo) { return `<article data-n="project-memo-card">${memo.id}</article>`; },
    [{ id: "task-1", status: "open", title: "Task one" }],
    "memos",
    [],
    {
      memoHasMore: true,
      memoTotal: 12,
      query: "release",
      taskHasMore: true,
      taskTotal: 8,
    },
  );

  assert.match(html, /Memo <span class="memo-project-tab-count">12<\/span>/);
  assert.match(html, /待办 <span class="memo-project-tab-count">8<\/span>/);
  assert.match(html, /data-n="project-memo-scroll-loader"/);
  assert.match(html, /data-n="project-task-scroll-loader"/);
  assert.match(html, /value="release"/);
});
