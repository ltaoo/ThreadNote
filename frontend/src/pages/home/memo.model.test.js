import assert from "node:assert/strict";
import test from "node:test";

import {
  memoFeedCollectionSignature,
  MemoFeedPaginationModel,
  MemoListModel,
  filterMemoList,
} from "./memo.model.js";

/** @type {import("./home.models").HomeMemoRecord[]} */
const memos = [
  {
    alias: "release",
    archived: false,
    content: "Public memo #work #shared",
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
    content: "Private memo #home #shared",
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

test("memo feed collection signature changes when visible memo IDs change", function () {
  const initial = memoFeedCollectionSignature([memos[0], memos[1]]);

  assert.notEqual(
    memoFeedCollectionSignature([memos[2], memos[0], memos[1]]),
    initial,
  );
  assert.notEqual(memoFeedCollectionSignature([memos[0]]), initial);
  assert.equal(
    memoFeedCollectionSignature([
      { ...memos[0], content: "updated presentation" },
      memos[1],
    ]),
    initial,
  );
});

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

test("memo list filtering requires every selected tag", function () {
  assert.deepEqual(
    filterMemoList(memos, {
      activeFilter: "all",
      activeTags: ["work", "shared", "work"],
    }).map((memo) => memo.id),
    ["memo-public"],
  );
  assert.deepEqual(
    filterMemoList(memos, {
      activeFilter: "all",
      activeTags: ["work", "home"],
    }),
    [],
  );
});

test("memo feed pagination resets and requests the next cursor", async function () {
  const requests = [];
  const vm$ = MemoFeedPaginationModel({
    pageSize: 2,
    services: {
      async loadMemoPageFromVault(options) {
        requests.push(options);
        if (!options.cursor) {
          return {
            hasMore: true,
            memos: [memos[0], memos[1]],
            nextCursor: "cursor-2",
            total: 3,
          };
        }
        return {
          hasMore: false,
          memos: [memos[1], memos[2]],
          nextCursor: "",
          total: 3,
        };
      },
    },
  });

  const first_page = await vm$.reset({ archived: false });
  const second_page = await vm$.loadMore();

  assert.deepEqual(requests, [
    { archived: false, cursor: "", limit: 2 },
    { archived: false, cursor: "cursor-2", limit: 2 },
  ]);
  assert.equal(first_page.hasMore, true);
  assert.equal(second_page.hasMore, false);
  assert.deepEqual(
    second_page.memos.map((memo) => memo.id),
    ["memo-public", "memo-private", "memo-archived"],
  );
});

test("memo feed pagination ignores load-more while a request is active", async function () {
  let resolve_page;
  const vm$ = MemoFeedPaginationModel({
    services: {
      loadMemoPageFromVault() {
        return new Promise(function (resolve) {
          resolve_page = resolve;
        });
      },
    },
  });

  const reset_request = vm$.reset();
  const skipped_page = await vm$.loadMore();
  assert.equal(skipped_page.changed, false);
  assert.equal(skipped_page.loading, true);

  resolve_page({ hasMore: false, memos: [], nextCursor: "", total: 0 });
  await reset_request;
  assert.equal(vm$.snapshot().loading, false);
});
