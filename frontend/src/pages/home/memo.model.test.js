import assert from "node:assert/strict";
import test from "node:test";

import { MemoListModel, filterMemoList } from "./memo.model.js";

/** @type {import("./home.models").HomeMemoRecord[]} */
const memos = [
  {
    alias: "release",
    archived: false,
    content: "Public memo #work",
    createdAt: "2026-08-21T09:00:00Z",
    id: "memo-public",
    kind: "",
    pinned: true,
    private: false,
    projectId: "project-one",
    reactions: [],
    taskId: "",
    updatedAt: "",
    visibility: "PUBLIC",
  },
  {
    alias: "",
    archived: false,
    content: "Private memo #home",
    createdAt: "2026-08-20T09:00:00Z",
    id: "memo-private",
    kind: "",
    pinned: false,
    private: false,
    projectId: "",
    reactions: [],
    taskId: "",
    updatedAt: "",
    visibility: "PRIVATE",
  },
  {
    alias: "",
    archived: true,
    content: "Archived memo #work",
    createdAt: "2026-08-19T09:00:00Z",
    id: "memo-archived",
    kind: "",
    pinned: false,
    private: false,
    projectId: "project-one",
    reactions: [],
    taskId: "",
    updatedAt: "",
    visibility: "PRIVATE",
  },
];

test("memo list model loads and normalizes vault memos", async function () {
  const vm$ = MemoListModel({
    services: {
      async loadMemosFromVault() {
        return [memos[0], null, { content: "missing id" }];
      },
    },
  });

  const list = await vm$.loadList();

  assert.equal(list.length, 1);
  assert.equal(list[0].id, "memo-public");
  assert.deepEqual(list[0].reactions, []);
});

test("memo list model applies constructor and per-load conditions", async function () {
  const vm$ = MemoListModel({
    conditions: { activeFilter: "all", activeTag: "work" },
    services: {
      async loadMemosFromVault() {
        return memos;
      },
    },
  });

  assert.deepEqual(
    (await vm$.loadList()).map((memo) => memo.id),
    ["memo-public"],
  );
  assert.deepEqual(
    (await vm$.loadList({ activeFilter: "archive" })).map((memo) => memo.id),
    ["memo-archived"],
  );
});

test("memo list filtering supports project, date, comment query, and sorting", function () {
  /** @type {import("./home.models").MemoListConditions} */
  const conditions = {
    activeFilter: "all",
    activeProjectFilter: "unassigned",
    comments: [
      {
        content: "searchable reply",
        memoId: "memo-private",
      },
    ],
    query: "SEARCHABLE",
    selectedDate: "2026-08-20",
    sortDesc: true,
  };

  assert.deepEqual(
    filterMemoList(memos, conditions).map((memo) => memo.id),
    ["memo-private"],
  );
  assert.deepEqual(
    filterMemoList(memos, { activeFilter: "all", sortDesc: false }).map(
      (memo) => memo.id,
    ),
    ["memo-private", "memo-public"],
  );
});
