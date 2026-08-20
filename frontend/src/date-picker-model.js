import { ComponentModel } from "./component-models.js";

const padDatePart = (value) => String(value).padStart(2, "0");

function normalizeMode(value) {
  const mode = String(value || "date").toLowerCase();
  if (mode === "datetime" || mode === "datetime-local") return "datetime-local";
  if (mode === "time") return "time";
  return "date";
}

function localDateKey(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function timeKey(hour, minute) {
  return `${padDatePart(hour)}:${padDatePart(minute)}`;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseValue(value, mode, now) {
  const raw = String(value || "").trim();
  const fallback = now instanceof Date ? now : new Date();
  const result = {
    date: localDateKey(fallback),
    hour: fallback.getHours(),
    minute: fallback.getMinutes(),
    value: "",
  };

  if (mode === "time") {
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return result;
    result.hour = Math.min(23, Math.max(0, Number(match[1])));
    result.minute = Math.min(59, Math.max(0, Number(match[2])));
    result.value = timeKey(result.hour, result.minute);
    return result;
  }

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (!match || !validDateKey(match[1])) return result;
  result.date = match[1];
  if (match[2] !== undefined) result.hour = Math.min(23, Math.max(0, Number(match[2])));
  if (match[3] !== undefined) result.minute = Math.min(59, Math.max(0, Number(match[3])));
  result.value = mode === "datetime-local"
    ? `${result.date}T${timeKey(result.hour, result.minute)}`
    : result.date;
  return result;
}

function dateFromKey(value) {
  const parts = String(value || "").split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2] || 1);
}

export class DatePickerModel extends ComponentModel {
  constructor(options = {}) {
    const clock = typeof options.now === "function" ? options.now : () => new Date();
    const mode = normalizeMode(options.mode || options.type);
    const parsed = parseValue(options.value ?? options.defaultValue, mode, clock());
    const viewDate = dateFromKey(parsed.date);
    super({
      defaultValue: parsed.value,
      disabled: Boolean(options.disabled),
      hour: parsed.hour,
      minute: parsed.minute,
      mode,
      open: false,
      placeholder: options.placeholder || (mode === "time" ? "选择时间" : mode === "datetime-local" ? "选择日期与时间" : "选择日期"),
      selectedDate: parsed.date,
      value: parsed.value,
      viewMonth: viewDate.getMonth(),
      viewYear: viewDate.getFullYear(),
      weekStart: Number(options.weekStart) === 0 ? 0 : 1,
    });
    this._clock = clock;
    this._floating_control_model = options.floatingControlModel || null;
    this._onChange = options.onChange || null;
    this._onOpenChange = options.onOpenChange || null;
  }

  setOpen(open) {
    if (this.state.disabled && open) return false;
    const nextOpen = Boolean(open);
    if (nextOpen === this.state.open) return nextOpen;
    if (nextOpen) {
      this._floating_control_model?.activate(this, () => this.close());
    } else {
      this._floating_control_model?.release(this);
    }
    this.setState({ open: nextOpen });
    if (this._onOpenChange) this._onOpenChange(nextOpen);
    return nextOpen;
  }

  toggle() {
    return this.setOpen(!this.state.open);
  }

  close() {
    return this.setOpen(false);
  }

  setValue(value, options = {}) {
    const parsed = parseValue(value, this.state.mode, this._clock());
    const viewDate = dateFromKey(parsed.date);
    this.setState({
      hour: parsed.hour,
      minute: parsed.minute,
      selectedDate: parsed.date,
      value: parsed.value,
      viewMonth: viewDate.getMonth(),
      viewYear: viewDate.getFullYear(),
    });
    if (!options.silent && this._onChange) this._onChange(parsed.value, options.event);
    return parsed.value;
  }

  selectDate(dateKey, options = {}) {
    if (!validDateKey(dateKey) || this.state.disabled) return this.state.value;
    const value = this.state.mode === "datetime-local"
      ? `${dateKey}T${timeKey(this.state.hour, this.state.minute)}`
      : dateKey;
    const nextValue = this.setValue(value, options);
    if (this.state.mode === "date") this.close();
    return nextValue;
  }

  setTime(hour, minute, options = {}) {
    if (this.state.disabled) return this.state.value;
    const nextHour = Math.min(23, Math.max(0, Number(hour) || 0));
    const nextMinute = Math.min(59, Math.max(0, Number(minute) || 0));
    const value = this.state.mode === "time"
      ? timeKey(nextHour, nextMinute)
      : `${this.state.selectedDate}T${timeKey(nextHour, nextMinute)}`;
    return this.setValue(value, options);
  }

  clear(event) {
    if (this.state.disabled) return this.state.value;
    this.setState({ value: "" });
    if (this._onChange) this._onChange("", event);
    return "";
  }

  selectToday(options = {}) {
    const now = this._clock();
    const dateKey = localDateKey(now);
    this.setState({ hour: now.getHours(), minute: now.getMinutes() });
    if (this.state.mode === "time") {
      return this.setTime(now.getHours(), now.getMinutes(), options);
    }
    return this.selectDate(dateKey, options);
  }

  navigateMonth(offset) {
    const date = new Date(this.state.viewYear, this.state.viewMonth + Number(offset || 0), 1);
    this.setState({ viewMonth: date.getMonth(), viewYear: date.getFullYear() });
  }

  calendarDays() {
    if (this.state.mode === "time") return [];
    const first = new Date(this.state.viewYear, this.state.viewMonth, 1);
    const weekday = first.getDay();
    const leading = (weekday - this.state.weekStart + 7) % 7;
    const start = new Date(this.state.viewYear, this.state.viewMonth, 1 - leading);
    const today = localDateKey(this._clock());
    return Array.from({ length: 42 }, (_item, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = localDateKey(date);
      return {
        currentMonth: date.getMonth() === this.state.viewMonth,
        day: date.getDate(),
        key,
        selected: Boolean(this.state.value) && key === this.state.selectedDate,
        today: key === today,
      };
    });
  }

  displayValue() {
    if (!this.state.value) return this.state.placeholder;
    if (this.state.mode === "time") return timeKey(this.state.hour, this.state.minute);
    const date = dateFromKey(this.state.selectedDate);
    const dateLabel = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() === this._clock().getFullYear() ? undefined : "numeric",
    }).format(date);
    return this.state.mode === "datetime-local"
      ? `${dateLabel} ${timeKey(this.state.hour, this.state.minute)}`
      : dateLabel;
  }

  reset() {
    return this.setValue(this.state.defaultValue, { silent: true });
  }

  setDisabled(disabled) {
    this.setState({ disabled: Boolean(disabled), open: false });
    this._floating_control_model?.release(this);
  }

  destroy() {
    this._floating_control_model?.release(this);
    super.destroy();
  }
}

export { localDateKey, normalizeMode, parseValue, timeKey };
export const createDatePickerModel = (options) => new DatePickerModel(options);
