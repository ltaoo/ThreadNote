import assert from "node:assert/strict";
import test from "node:test";

import { DatePickerModel } from "./date-picker-model.js";
import { SelectModel } from "./component-models.js";
import { FloatingControlModel } from "./floating-control-model.js";

const NOW = () => new Date(2026, 7, 19, 14, 35);

test("DatePickerModel builds a Monday-first six-week calendar", () => {
  const model = new DatePickerModel({
    now: NOW,
    value: "2026-08-19",
  });
  const days = model.calendarDays();

  assert.equal(days.length, 42);
  assert.equal(days[0].key, "2026-07-27");
  assert.equal(days[41].key, "2026-09-06");
  assert.equal(days.find((day) => day.key === "2026-08-19").selected, true);
  assert.equal(days.find((day) => day.key === "2026-08-19").today, true);
});

test("DatePickerModel keeps date and time in a local datetime value", () => {
  const values = [];
  const model = new DatePickerModel({
    mode: "datetime-local",
    now: NOW,
    onChange: (value) => values.push(value),
    value: "2026-08-19T09:20",
  });

  model.setTime(18, 5);
  model.selectDate("2026-08-22");

  assert.equal(model.state.value, "2026-08-22T18:05");
  assert.deepEqual(values, ["2026-08-19T18:05", "2026-08-22T18:05"]);
});

test("DatePickerModel supports time-only values, clear, and reset", () => {
  const model = new DatePickerModel({
    mode: "time",
    now: NOW,
    value: "08:15",
  });

  model.setTime(23, 59);
  assert.equal(model.state.value, "23:59");
  model.clear();
  assert.equal(model.state.value, "");
  model.reset();
  assert.equal(model.state.value, "08:15");
});

test("DatePickerModel navigates across year boundaries", () => {
  const model = new DatePickerModel({ now: NOW, value: "2026-01-03" });

  model.navigateMonth(-1);

  assert.equal(model.state.viewYear, 2025);
  assert.equal(model.state.viewMonth, 11);
});

test("DatePickerModel and SelectModel keep form-control popups mutually exclusive", () => {
  const floatingControlModel = new FloatingControlModel();
  const datePicker = new DatePickerModel({ floatingControlModel, now: NOW });
  const select = new SelectModel({
    floatingControlModel,
    options: [
      { label: "无优先级", value: "none" },
      { label: "高", value: "high" },
    ],
    value: "none",
  });

  datePicker.setOpen(true);
  assert.equal(datePicker.state.open, true);

  select.open();
  assert.equal(datePicker.state.open, false);
  assert.equal(select.state.open, true);
  assert.equal(floatingControlModel.isActive(select), true);

  datePicker.setOpen(true);
  assert.equal(select.state.open, false);
  assert.equal(datePicker.state.open, true);
  assert.equal(floatingControlModel.isActive(datePicker), true);
});
