import assert from "node:assert/strict";
import test from "node:test";

import { SmallCalendarModel } from "./small-calendar-model.js";

test("SmallCalendarModel builds a six-week grid from the configured week start", () => {
  const mondayModel = new SmallCalendarModel({
    month: "2026-08",
    today: "2026-08-19",
    weekStart: "monday",
  });
  const sundayModel = new SmallCalendarModel({
    month: "2026-08",
    today: "2026-08-19",
    weekStart: "sunday",
  });

  assert.equal(mondayModel.presentation.days.length, 42);
  assert.equal(mondayModel.presentation.days[0].key, "2026-07-27");
  assert.equal(mondayModel.presentation.days[41].key, "2026-09-06");
  assert.equal(mondayModel.presentation.monthLabel, "八月");
  assert.equal(mondayModel.presentation.yearLabel, "2026");
  assert.deepEqual(mondayModel.presentation.weekdays, ["一", "二", "三", "四", "五", "六", "日"]);
  assert.equal(sundayModel.presentation.days[0].key, "2026-07-26");
  assert.deepEqual(sundayModel.presentation.weekdays, ["日", "一", "二", "三", "四", "五", "六"]);
});

test("SmallCalendarModel owns month navigation across year boundaries", () => {
  const changes = [];
  const model = new SmallCalendarModel({
    month: "2026-01",
    onChange: (change) => changes.push([change.action, change.month]),
    today: "2026-08-19",
  });

  model.previousMonth();
  model.nextMonth();
  model.nextMonth();

  assert.equal(model.state.month, "2026-02");
  assert.deepEqual(changes, [
    ["previousMonth", "2025-12"],
    ["nextMonth", "2026-01"],
    ["nextMonth", "2026-02"],
  ]);
});

test("SmallCalendarModel toggles date selection and follows outside-month dates", () => {
  const actions = [];
  const model = new SmallCalendarModel({
    month: "2026-08",
    onChange: (change) => actions.push(change.action),
    selectedDate: "2026-08-19",
    today: "2026-08-19",
  });

  model.selectDate("2026-08-19");
  assert.equal(model.state.selectedDate, "");
  model.selectDate("2026-09-02");
  assert.equal(model.state.selectedDate, "2026-09-02");
  assert.equal(model.state.month, "2026-09");
  model.clearDate();

  assert.equal(model.state.selectedDate, "");
  assert.deepEqual(actions, ["selectDate", "selectDate", "clearDate"]);
});

test("SmallCalendarModel derives item counts and calendar annotations in the model", () => {
  const model = new SmallCalendarModel({
    dateCounts: new Map([["2026-08-19", 3]]),
    getDayInfo(date) {
      return date.getDate() === 19
        ? { festivalLabel: "示例节日", holidayBadge: "休", holidayStatus: "holiday", lunarLabel: "初七" }
        : {};
    },
    month: "2026-08",
    selectedDate: "2026-08-19",
    today: "2026-08-19",
  });

  const day = model.presentation.days.find((entry) => entry.key === "2026-08-19");

  assert.equal(day.count, 3);
  assert.equal(day.countLabel, "3 条 Memo");
  assert.equal(day.isToday, true);
  assert.equal(day.info.festivalLabel, "示例节日");
  assert.equal(day.info.holidayStatus, "holiday");
  assert.equal(model.presentation.selectedLabel, "8月19日 · 周三");
  assert.equal(model.presentation.contextMeta, "3 条 Memo");
});

test("SmallCalendarModel omits the selection context until a date is selected", () => {
  const model = new SmallCalendarModel({
    dateCounts: { "2026-08-19": 3 },
    month: "2026-08",
    today: "2026-08-20",
  });

  assert.equal(model.presentation.selectedLabel, "");
  assert.equal(model.presentation.contextMeta, "");
  assert.equal(model.presentation.showSelectionContext, false);
});

test("SmallCalendarModel returns to the current day supplied by its clock", () => {
  const model = new SmallCalendarModel({
    month: "2025-12",
    now: () => new Date(2026, 7, 19, 18, 30),
  });

  model.goToday();

  assert.equal(model.state.today, "2026-08-19");
  assert.equal(model.state.selectedDate, "2026-08-19");
  assert.equal(model.state.month, "2026-08");
});
