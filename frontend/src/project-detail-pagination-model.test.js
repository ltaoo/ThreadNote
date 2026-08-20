import assert from "node:assert/strict";
import test from "node:test";

import { ProjectDetailPaginationModel } from "./project-detail-pagination-model.js";

function projectItems(projectId, count, type) {
  return Array.from({ length: count }, function (_item, index) {
    return {
      content: type === "memo" ? `Memo ${index}` : undefined,
      createdAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
      id: `${type}-${projectId}-${index}`,
      projectId,
      title: type === "task" ? `Task ${index}` : undefined,
    };
  });
}

test("project detail initially exposes only the first page", () => {
  const model = new ProjectDetailPaginationModel({ memoPageSize: 3, taskPageSize: 2 });
  const result = model.select({
    memos: projectItems("one", 5, "memo").concat(projectItems("two", 2, "memo")),
    projectId: "one",
    tasks: projectItems("one", 4, "task"),
  });

  assert.equal(result.memos.items.length, 3);
  assert.equal(result.memos.total, 5);
  assert.equal(result.memos.hasMore, true);
  assert.equal(result.tasks.items.length, 2);
  assert.equal(result.tasks.total, 4);
  assert.equal(result.tasks.hasMore, true);
});

test("memo and task pages advance independently", () => {
  const model = new ProjectDetailPaginationModel({ memoPageSize: 2, taskPageSize: 2 });
  const options = {
    memos: projectItems("one", 5, "memo"),
    projectId: "one",
    tasks: projectItems("one", 5, "task"),
  };

  model.select(options);
  assert.equal(model.loadNext("memos"), true);
  let result = model.select(options);
  assert.equal(result.memos.items.length, 4);
  assert.equal(result.tasks.items.length, 2);

  assert.equal(model.loadNext("tasks"), true);
  result = model.select(options);
  assert.equal(result.memos.items.length, 4);
  assert.equal(result.tasks.items.length, 4);
});

test("changing project resets both pages and changing search resets memo paging", () => {
  const model = new ProjectDetailPaginationModel({ memoPageSize: 2, taskPageSize: 2 });
  const firstProject = {
    memos: projectItems("one", 5, "memo"),
    projectId: "one",
    tasks: projectItems("one", 5, "task"),
  };

  model.select(firstProject);
  model.loadNext("memos");
  model.loadNext("tasks");

  let result = model.select({ ...firstProject, query: "memo" });
  assert.equal(result.memos.items.length, 2);
  assert.equal(result.tasks.items.length, 4);

  result = model.select({
    memos: projectItems("two", 5, "memo"),
    projectId: "two",
    tasks: projectItems("two", 5, "task"),
  });
  assert.equal(result.memos.items.length, 2);
  assert.equal(result.tasks.items.length, 2);
});

test("project memo search filters before pagination and excludes archived memos", () => {
  const model = new ProjectDetailPaginationModel({ memoPageSize: 5 });
  const memos = projectItems("one", 4, "memo");
  memos[0].title = "Release notes";
  memos[1].content = "release checklist";
  memos[1].archived = true;

  const result = model.select({ memos, projectId: "one", query: "release" });

  assert.deepEqual(result.memos.items.map((memo) => memo.id), ["memo-one-0"]);
  assert.equal(result.memos.total, 1);
  assert.equal(result.memos.hasMore, false);
});
