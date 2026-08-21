import { Timeless } from "./timeless-icons.js";

const WEEKDAYS = Object.freeze({
  0: ["日", "一", "二", "三", "四", "五", "六"],
  1: ["一", "二", "三", "四", "五", "六", "日"],
});

export function createDatePickerComponent(deps) {
  const {
    DatePickerModel,
    applyElementProps,
    classNames,
    floatingControlModel,
    modelState,
    nextId,
    resolveModel,
    setAttribute,
    subscribeModel,
  } = deps;

  return function DatePicker(props = {}) {
    const resolved = resolveModel(props, DatePickerModel, {
      ...props,
      floatingControlModel,
      value: props.value ?? props.defaultValue,
    });
    const model = resolved.model;
    const root = document.createElement("div");
    const hidden = document.createElement("input");
    const trigger = document.createElement("button");
    const triggerValue = document.createElement("span");
    const panel = document.createElement("div");
    const calendar = document.createElement("div");
    const calendarHeader = document.createElement("header");
    const previous = document.createElement("button");
    const monthLabel = document.createElement("strong");
    const next = document.createElement("button");
    const weekdays = document.createElement("div");
    const days = document.createElement("div");
    const time = document.createElement("div");
    const hour = document.createElement("input");
    const separator = document.createElement("span");
    const minute = document.createElement("input");
    const timeSuffix = document.createElement("span");
    const footer = document.createElement("footer");
    const clear = document.createElement("button");
    const today = document.createElement("button");
    const done = document.createElement("button");
    const panelId = nextId("tn-date-picker-panel");
    const size = ["sm", "md", "lg"].includes(props.size) ? props.size : "md";
    const variant = ["outlined", "filled", "borderless"].includes(props.variant)
      ? props.variant
      : "outlined";

    root.className = "tn-date-picker-root";
    hidden.type = "hidden";
    hidden.className = "tn-date-picker__input";
    trigger.type = "button";
    trigger.className = "tn-date-picker";
    trigger.setAttribute("aria-controls", panelId);
    trigger.setAttribute("aria-haspopup", "dialog");
    triggerValue.className = "tn-date-picker__value";
    panel.id = panelId;
    panel.className = "tn-popup tn-popup--date-picker tn-date-picker__panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", props.ariaLabel || "日期时间选择");
    panel.hidden = true;
    calendar.className = "tn-date-picker__calendar";
    calendarHeader.className = "tn-date-picker__header";
    previous.type = "button";
    previous.className = "tn-button tn-button--ghost tn-button--icon tn-button--xs tn-date-picker__nav";
    previous.setAttribute("aria-label", "上个月");
    previous.appendChild(
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: "chevron-left",
          size: 15,
          attributes: { n: "date-picker-previous-icon" },
        }),
      ).dom,
    );
    monthLabel.className = "tn-date-picker__month";
    next.type = "button";
    next.className = "tn-button tn-button--ghost tn-button--icon tn-button--xs tn-date-picker__nav";
    next.setAttribute("aria-label", "下个月");
    next.appendChild(
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: "chevron-right",
          size: 15,
          attributes: { n: "date-picker-next-icon" },
        }),
      ).dom,
    );
    weekdays.className = "tn-date-picker__weekdays";
    days.className = "tn-date-picker__days";
    days.setAttribute("role", "grid");
    calendarHeader.append(previous, monthLabel, next);
    calendar.append(calendarHeader, weekdays, days);

    time.className = "tn-date-picker__time";
    hour.type = "number";
    hour.className = "tn-date-picker__time-field";
    hour.min = "0";
    hour.max = "23";
    hour.inputMode = "numeric";
    hour.setAttribute("aria-label", "小时");
    minute.type = "number";
    minute.className = "tn-date-picker__time-field";
    minute.min = "0";
    minute.max = "59";
    minute.step = String(props.minuteStep || 1);
    minute.inputMode = "numeric";
    minute.setAttribute("aria-label", "分钟");
    separator.className = "tn-date-picker__time-separator";
    separator.textContent = ":";
    timeSuffix.className = "tn-date-picker__time-suffix";
    timeSuffix.textContent = "24H";
    time.append(
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: "clock",
          size: 15,
          attributes: { n: "date-picker-time-icon" },
        }),
      ).dom,
      hour,
      separator,
      minute,
      timeSuffix,
    );

    footer.className = "tn-date-picker__footer";
    clear.type = "button";
    clear.className = "tn-button tn-button--ghost tn-button--xs tn-date-picker__text-action";
    clear.textContent = "清除";
    today.type = "button";
    today.className = "tn-button tn-button--ghost tn-button--xs tn-date-picker__text-action";
    today.textContent = "现在";
    done.type = "button";
    done.className = "tn-button tn-button--primary tn-button--xs tn-date-picker__done";
    done.textContent = "完成";
    footer.append(clear, today, done);

    applyElementProps(root, { class: props.rootClass });
    applyElementProps(trigger, {
      ariaLabel: props.ariaLabel,
      attributes: props.triggerAttributes,
      title: props.title,
    });
    applyElementProps(hidden, { attributes: props.inputAttributes });
    if (props.name) hidden.name = props.name;
    trigger.append(
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: props.mode === "time" ? "clock" : "calendar",
          size: 15,
          attributes: { n: "date-picker-trigger-icon" },
        }),
      ).dom,
      triggerValue,
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: "chevron-down",
          class: "tn-date-picker__chevron",
          size: 14,
          attributes: { n: "date-picker-trigger-chevron" },
        }),
      ).dom,
    );
    panel.append(calendar, time, footer);
    root.append(hidden, trigger, panel);

    function placePanel() {
      const rootRect = root.getBoundingClientRect();
      const mode = modelState(model).mode;
      const margin = 8;
      const gap = 6;
      const width = Math.min(
        mode === "time" ? 230 : 288,
        window.innerWidth - margin * 2,
      );
      panel.style.position = "fixed";
      panel.style.width = `${Math.round(width)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.round(Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, rootRect.left),
      ))}px`;
      panel.style.top = `${Math.round(rootRect.bottom + gap)}px`;
      const panelRect = panel.getBoundingClientRect();
      if (
        panelRect.bottom > window.innerHeight - 8
        && rootRect.top > panelRect.height + 8
      ) {
        panel.style.top = `${Math.round(rootRect.top - panelRect.height - gap)}px`;
      }
    }

    function syncPanelPortal(open) {
      if (open) {
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = false;
        placePanel();
        return;
      }
      panel.hidden = true;
      if (panel.parentElement !== root) root.appendChild(panel);
      panel.removeAttribute("style");
    }

    function handleViewportChange() {
      if (modelState(model).open) placePanel();
    }

    function renderWeekdays(state) {
      weekdays.replaceChildren();
      (WEEKDAYS[state.weekStart] || WEEKDAYS[1]).forEach((label) => {
        const cell = document.createElement("span");
        cell.textContent = label;
        weekdays.appendChild(cell);
      });
    }

    function renderDays() {
      days.replaceChildren();
      model.calendarDays().forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = classNames(
          "tn-date-picker__day",
          !entry.currentMonth && "is-outside",
          entry.today && "is-today",
          entry.selected && "is-selected",
        );
        button.textContent = String(entry.day);
        button.dataset.date = entry.key;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-label", entry.key);
        button.setAttribute("aria-selected", String(entry.selected));
        button.addEventListener("click", (event) => {
          model.selectDate(entry.key, { event });
          if (modelState(model).mode === "date") trigger.focus();
        });
        days.appendChild(button);
      });
    }

    function sync() {
      const state = modelState(model);
      const mode = state.mode;
      hidden.value = state.value || "";
      hidden.disabled = Boolean(state.disabled);
      trigger.disabled = Boolean(state.disabled);
      trigger.setAttribute("aria-expanded", String(Boolean(state.open)));
      triggerValue.textContent = model.displayValue();
      triggerValue.classList.toggle("is-placeholder", !state.value);
      calendar.hidden = mode === "time";
      time.hidden = mode === "date";
      done.hidden = mode === "date";
      today.textContent = mode === "date" ? "今天" : "现在";
      monthLabel.textContent = `${state.viewYear} / ${String(state.viewMonth + 1).padStart(2, "0")}`;
      hour.value = String(state.hour).padStart(2, "0");
      minute.value = String(state.minute).padStart(2, "0");
      hour.disabled = Boolean(state.disabled);
      minute.disabled = Boolean(state.disabled);
      root.className = classNames(
        "tn-date-picker-root",
        `tn-date-picker-root--${mode}`,
        `tn-date-picker-root--${size}`,
        `tn-date-picker-root--${variant}`,
        state.open && "is-open",
        state.disabled && "is-disabled",
        props.invalid && "is-invalid",
        props.rootClass,
      );
      trigger.className = classNames(
        "tn-date-picker",
        `tn-date-picker--${size}`,
        `tn-date-picker--${variant}`,
        props.class,
      );
      setAttribute(trigger, "aria-invalid", props.invalid ? "true" : null);
      renderWeekdays(state);
      renderDays();
      syncPanelPortal(Boolean(state.open));
    }

    function commitTime(event) {
      model.setTime(hour.value, minute.value, { event });
    }

    function handlePointerDown(event) {
      if (!root.contains(event.target) && !panel.contains(event.target)) model.close();
    }

    trigger.addEventListener("pointerdown", () => {
      trigger.focus({ preventScroll: true });
    });
    trigger.addEventListener("click", () => {
      trigger.focus({ preventScroll: true });
      model.toggle();
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      model.close();
      event.preventDefault();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      model.close();
      trigger.focus();
      event.preventDefault();
    });
    previous.addEventListener("click", () => model.navigateMonth(-1));
    next.addEventListener("click", () => model.navigateMonth(1));
    hour.addEventListener("change", commitTime);
    minute.addEventListener("change", commitTime);
    clear.addEventListener("click", (event) => model.clear(event));
    today.addEventListener("click", (event) => model.selectToday({ event }));
    done.addEventListener("click", () => {
      model.close();
      trigger.focus();
    });
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const unsubscribe = subscribeModel(model, sync);
    sync();
    return {
      t: "view",
      $elm: root,
      control: hidden,
      model,
      panel,
      trigger,
      render() {
        return root;
      },
      onMounted() {},
      beforeUnmounted() {},
      onUnmounted() {
        document.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
        panel.remove();
        unsubscribe?.();
        if (resolved.owned) model.destroy?.();
      },
    };
  };
}
