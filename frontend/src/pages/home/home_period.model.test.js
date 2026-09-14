import assert from "node:assert/strict";
import test from "node:test";

import {
  HomePeriodPageModel,
  buildPeriodView,
  periodRange,
  periodTitle,
  shiftPeriod,
} from "./home_period.model.js";

globalThis.ref = function (initial_value) {
  return {
    value: initial_value,
    as(next_value) {
      this.value = next_value;
    },
  };
};

globalThis.computed = function (source, transform) {
  return {
    get value() {
      return transform(source.value);
    },
  };
};

globalThis.Timeless = {
  combine(sources, transform) {
    return {
      get value() {
        return transform(Object.fromEntries(
          Object.entries(sources).map(([key, source]) => [key, source.value]),
        ));
      },
    };
  },
};

test("week period starts on Monday and uses an exclusive end", function () {
  const range = periodRange("week", new Date(2026, 8, 9, 15));

  assert.equal(range.start.getFullYear(), 2026);
  assert.equal(range.start.getMonth(), 8);
  assert.equal(range.start.getDate(), 7);
  assert.equal(range.start.getDay(), 1);
  assert.equal(range.end.getDate(), 14);
  assert.equal(periodTitle("week", new Date(2026, 8, 9)), "2026年9月7日 – 9月13日");
});

test("month period and navigation stay aligned to calendar months", function () {
  const shifted = shiftPeriod("month", new Date(2026, 0, 31), 1);
  const range = periodRange("month", shifted);

  assert.equal(range.start.getMonth(), 1);
  assert.equal(range.start.getDate(), 1);
  assert.equal(range.end.getMonth(), 2);
  assert.equal(range.end.getDate(), 1);
  assert.equal(periodTitle("month", shifted), "2026年2月");
});

test("period view combines memo and task dates and groups missing projects as unassigned", function () {
  const view = buildPeriodView({
    anchor: new Date(2026, 8, 9),
    period: "week",
    memos: [
      {
        archived: false,
        content: "# 周一记录",
        createdAt: "2026-09-07T09:30:00",
        id: "memo-1",
        projectId: "project-a",
      },
      {
        archived: false,
        content: "无归属 Memo",
        createdAt: "2026-09-13T20:00:00+08:00",
        id: "memo-2",
        projectId: "",
      },
      {
        archived: false,
        content: "下周内容",
        createdAt: "2026-09-14T00:00:00+08:00",
        id: "memo-next-week",
        projectId: "project-a",
      },
      {
        archived: true,
        content: "已归档",
        createdAt: "2026-09-08T12:00:00+08:00",
        id: "memo-archived",
        projectId: "project-a",
      },
    ],
    projects: [
      {
        archived: false,
        color: "#123456",
        createdAt: "2026-01-01T00:00:00Z",
        id: "project-a",
        name: "Alpha",
        sortOrder: 1,
      },
    ],
    tasks: [
      {
        createdAt: "2026-08-01T10:00:00+08:00",
        dueAt: "2026-09-07T16:00:00",
        id: "task-same-project",
        projectId: "project-a",
        startAt: "",
        status: "open",
        title: "同项目任务",
      },
      {
        createdAt: "2026-08-01T10:00:00+08:00",
        dueAt: "2026-09-12",
        id: "task-due",
        projectId: "project-a",
        startAt: "",
        status: "open",
        title: "有截止日期",
      },
      {
        createdAt: "2026-09-10T10:00:00+08:00",
        dueAt: "",
        id: "task-created",
        projectId: "",
        startAt: "",
        status: "completed",
        title: "按创建时间回退",
      },
      {
        createdAt: "2026-09-08T10:00:00+08:00",
        dueAt: "",
        id: "task-archived",
        projectId: "project-a",
        startAt: "",
        status: "archived",
        title: "已归档任务",
      },
    ],
  });

  assert.equal(view.memoCount, 2);
  assert.equal(view.taskCount, 3);
  assert.equal(view.items.length, 5);
  assert.equal(view.days.length, 7);
  assert.equal(view.days[0].weekday, "周一");
  assert.deepEqual(
    view.days[0].projectGroups.map((group) => [group.label, group.items.length]),
    [["Alpha", 2]],
  );
  assert.deepEqual(
    view.days[0].projectGroups[0].items.map((item) => item.timeLabel),
    ["09:30", "16:00"],
  );
  assert.equal(
    view.items.find((item) => item.id === "task-created").statusLabel,
    "已完成",
  );
  assert.deepEqual(
    view.days.find((day) => day.dateKey === "2026-09-10").projectGroups
      .map((group) => [group.label, group.items.length]),
    [["未归属", 1]],
  );
  assert.equal(
    view.days.find((day) => day.dateKey === "2026-09-12").items[0].id,
    "task-due",
  );
});

test("month view lists only the days in that month", function () {
  const view = buildPeriodView({
    anchor: new Date(2026, 8, 15),
    memos: [],
    period: "month",
    projects: [],
    tasks: [],
  });

  assert.equal(view.days.length, 30);
  assert.equal(view.days[0].dateKey, "2026-09-01");
  assert.equal(view.days.at(-1).dateKey, "2026-09-30");
});

test("period page model loads each collection into the chronological list", async function () {
  const model = HomePeriodPageModel({
    app: {},
    loadMemos: async () => [{
      archived: false,
      content: "Today memo",
      createdAt: "2026-09-12T09:00:00+08:00",
      id: "memo-today",
      projectId: "",
    }],
    loadProjects: async () => ({ projects: [] }),
    loadTasks: async () => ({ tasks: [] }),
    now: new Date(2026, 8, 12),
    period: "week",
  });

  assert.equal(model.ui.loading.value, true);
  assert.equal(await model.methods.ready(), true);
  assert.equal(model.ui.loading.value, false);
  assert.equal(model.ui.contentVisible.value, true);
  assert.equal(model.ui.memoCount.value, "1");
  assert.equal(model.ui.days.value[0].weekday, "周一");
  assert.equal(model.ui.days.value[5].projectGroups[0].label, "未归属");
  model.methods.destroy();
});
