import { ComponentModel } from "./component-models.js";

const WEEKDAYS = Object.freeze(["日", "一", "二", "三", "四", "五", "六"]);
const MONTH_LABELS = Object.freeze([
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
]);
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function dateFromKey(value) {
  const match = String(value || "").match(DATE_KEY_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function normalizeDateKey(value) {
  const keyedDate = dateFromKey(value);
  if (keyedDate) return dateKeyFromDate(keyedDate);
  if (value === "" || value === undefined || value === null) return "";
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateKeyFromDate(date);
}

function normalizeMonthKey(value, fallbackDate) {
  const monthMatch = String(value || "").match(MONTH_KEY_PATTERN);
  if (monthMatch) {
    const month = Number(monthMatch[2]);
    if (month >= 1 && month <= 12) {
      return `${monthMatch[1]}-${padNumber(month)}`;
    }
  }
  const dateKey = normalizeDateKey(value);
  if (dateKey) return dateKey.slice(0, 7);
  return normalizeDateKey(fallbackDate).slice(0, 7);
}

function normalizeWeekStart(value) {
  return value === "sunday" ? "sunday" : "monday";
}

function normalizeDateCounts(value) {
  const entries = value instanceof Map
    ? Array.from(value.entries())
    : Array.isArray(value)
      ? value
      : Object.entries(value && typeof value === "object" ? value : {});
  const counts = {};
  entries.forEach(([key, count]) => {
    const dateKey = normalizeDateKey(key);
    const numericCount = Math.max(0, Math.floor(Number(count) || 0));
    if (dateKey && numericCount) counts[dateKey] = numericCount;
  });
  return Object.freeze(counts);
}

function monthParts(monthKey) {
  const match = String(monthKey || "").match(MONTH_KEY_PATTERN);
  return {
    month: Number(match ? match[2] : 1) - 1,
    year: Number(match ? match[1] : 1970),
  };
}

function shiftedMonthKey(monthKey, delta) {
  const parts = monthParts(monthKey);
  const date = new Date(parts.year, parts.month + delta, 1, 12);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function normalizedDayInfo(value) {
  const info = value && typeof value === "object" ? value : {};
  return Object.freeze({
    festivalLabel: String(info.festivalLabel || ""),
    holidayBadge: String(info.holidayBadge || ""),
    holidayStatus: ["holiday", "workday"].includes(info.holidayStatus)
      ? info.holidayStatus
      : "",
    lunarLabel: String(info.lunarLabel || ""),
    title: String(info.title || ""),
  });
}

function calendarPresentation(state, getDayInfo) {
  const parts = monthParts(state.month);
  const firstDate = new Date(parts.year, parts.month, 1, 12);
  const firstWeekday = state.weekStart === "sunday" ? 0 : 1;
  const offset = (firstDate.getDay() - firstWeekday + 7) % 7;
  const weekdays = WEEKDAYS.slice(firstWeekday).concat(WEEKDAYS.slice(0, firstWeekday));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(parts.year, parts.month, 1 - offset + index, 12);
    const key = dateKeyFromDate(date);
    const count = state.dateCounts[key] || 0;
    let info = {};
    try {
      info = getDayInfo ? getDayInfo(date) : {};
    } catch (_error) {
      info = {};
    }
    return Object.freeze({
      count,
      countLabel: count ? `${count} 条 Memo` : "",
      date: date.getDate(),
      inMonth: date.getMonth() === parts.month,
      info: normalizedDayInfo(info),
      isSelected: key === state.selectedDate,
      isToday: key === state.today,
      key,
    });
  });
  const selectedDate = dateFromKey(state.selectedDate);
  const selectedCount = state.selectedDate ? state.dateCounts[state.selectedDate] || 0 : 0;
  const selectedLabel = selectedDate
    ? `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 · 周${WEEKDAYS[selectedDate.getDay()]}`
    : "";
  const contextMeta = state.selectedDate
    ? selectedCount
      ? `${selectedCount} 条 Memo`
      : "当天没有 Memo"
    : "";
  return Object.freeze({
    contextMeta,
    days: Object.freeze(days),
    monthLabel: MONTH_LABELS[parts.month],
    selectedLabel,
    showSelectionContext: Boolean(state.selectedDate),
    weekdays: Object.freeze(weekdays),
    yearLabel: String(parts.year),
  });
}

export class SmallCalendarModel extends ComponentModel {
  constructor(options = {}) {
    const now = typeof options.now === "function" ? options.now : () => new Date();
    const today = normalizeDateKey(options.today || now());
    const selectedDate = normalizeDateKey(options.selectedDate);
    super({
      dateCounts: normalizeDateCounts(options.dateCounts),
      month: normalizeMonthKey(options.month || selectedDate, today),
      selectedDate,
      today,
      weekStart: normalizeWeekStart(options.weekStart),
    });
    this._getDayInfo = typeof options.getDayInfo === "function" ? options.getDayInfo : null;
    this._now = now;
    this._onChange = typeof options.onChange === "function" ? options.onChange : null;
  }

  get presentation() {
    return calendarPresentation(this.state, this._getDayInfo);
  }

  setData(options = {}) {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(options, "dateCounts")) {
      patch.dateCounts = normalizeDateCounts(options.dateCounts);
    }
    if (Object.prototype.hasOwnProperty.call(options, "month")) {
      patch.month = normalizeMonthKey(options.month, this.state.today);
    }
    if (Object.prototype.hasOwnProperty.call(options, "selectedDate")) {
      patch.selectedDate = normalizeDateKey(options.selectedDate);
    }
    if (Object.prototype.hasOwnProperty.call(options, "today")) {
      patch.today = normalizeDateKey(options.today) || this.state.today;
    }
    if (Object.prototype.hasOwnProperty.call(options, "weekStart")) {
      patch.weekStart = normalizeWeekStart(options.weekStart);
    }
    return this.setState(patch);
  }

  setSelectedDate(value, options = {}) {
    const selectedDate = normalizeDateKey(value);
    const patch = { selectedDate };
    if (selectedDate && options.syncMonth !== false) patch.month = selectedDate.slice(0, 7);
    return this._transition(options.action || "setDate", patch, options.event, options.silent);
  }

  previousMonth(event) {
    return this._transition("previousMonth", {
      month: shiftedMonthKey(this.state.month, -1),
    }, event);
  }

  nextMonth(event) {
    return this._transition("nextMonth", {
      month: shiftedMonthKey(this.state.month, 1),
    }, event);
  }

  selectDate(value, event) {
    const dateKey = normalizeDateKey(value);
    if (!dateKey) return this.state;
    return this._transition("selectDate", {
      month: dateKey.slice(0, 7),
      selectedDate: this.state.selectedDate === dateKey ? "" : dateKey,
    }, event);
  }

  clearDate(event, options = {}) {
    return this._transition("clearDate", { selectedDate: "" }, event, options.silent);
  }

  goToday(event) {
    const today = normalizeDateKey(this._now()) || this.state.today;
    return this._transition("today", {
      month: today.slice(0, 7),
      selectedDate: today,
      today,
    }, event);
  }

  _transition(action, patch, event, silent = false) {
    const previousState = this.state;
    const nextState = this.setState(patch);
    if (!silent && this._onChange) {
      this._onChange(Object.freeze({
        action,
        event,
        month: nextState.month,
        previousState,
        selectedDate: nextState.selectedDate,
      }));
    }
    return nextState;
  }
}

export const createSmallCalendarModel = (options) => new SmallCalendarModel(options);

export {
  calendarPresentation,
  dateFromKey as smallCalendarDateFromKey,
  normalizeDateKey as normalizeSmallCalendarDateKey,
  normalizeMonthKey as normalizeSmallCalendarMonthKey,
};
