import { SmallCalendarModel } from "./small-calendar-model.js?v=20260820-calendar-navigation";
import { Timeless } from "./timeless-icons.js";

function dayAriaLabel(day) {
  return [
    day.key,
    day.isToday ? "今天" : "",
    day.info.title,
    day.countLabel,
  ].filter(Boolean).join("，");
}

export function createSmallCalendarComponent(deps) {
  const {
    Button,
    IconButton,
    applyElementProps,
    attachModel,
    classNames,
    elementView,
    resolveModel,
    setAttribute,
    subscribeModel,
  } = deps;

  return function SmallCalendar(props = {}) {
    const resolved = resolveModel(props, SmallCalendarModel, props);
    const model = resolved.model;
    const root = document.createElement("section");
    const header = document.createElement("header");
    const heading = document.createElement("div");
    const yearLabel = document.createElement("span");
    const monthLabel = document.createElement("strong");
    const navigation = document.createElement("div");
    const context = document.createElement("div");
    const contextCopy = document.createElement("div");
    const threadNode = document.createElement("span");
    const contextText = document.createElement("div");
    const selectedLabel = document.createElement("span");
    const contextMeta = document.createElement("span");
    const contextActions = document.createElement("div");
    const weekdayRow = document.createElement("div");
    const dayGrid = document.createElement("div");

    [
      [root, "small-calendar"],
      [header, "small-calendar-header"],
      [heading, "small-calendar-heading"],
      [yearLabel, "small-calendar-year"],
      [monthLabel, "small-calendar-month"],
      [navigation, "small-calendar-navigation"],
      [context, "small-calendar-selection-context"],
      [contextCopy, "small-calendar-selection-copy"],
      [threadNode, "small-calendar-selection-marker"],
      [contextText, "small-calendar-selection-text"],
      [selectedLabel, "small-calendar-selected-date"],
      [contextMeta, "small-calendar-selected-date-meta"],
      [contextActions, "small-calendar-selection-actions"],
      [weekdayRow, "small-calendar-weekdays"],
      [dayGrid, "small-calendar-day-grid"],
    ].forEach(([element, semanticName]) => {
      element.dataset.n = semanticName;
    });

    applyElementProps(root, props);
    root.className = classNames("tn-small-calendar tn-grid tn-min-w-0", props.class);
    root.setAttribute("aria-label", props.ariaLabel || "小日历");
    header.className = "tn-small-calendar__header tn-flex tn-items-start tn-justify-between tn-gap-3";
    heading.className = "tn-small-calendar__heading tn-grid tn-gap-0-5 tn-min-w-0";
    yearLabel.className = "tn-small-calendar__year tn-text-xs tn-text-tertiary";
    monthLabel.className = "tn-small-calendar__month tn-text-primary";
    navigation.className = "tn-small-calendar__navigation tn-flex tn-items-center";
    context.className = "tn-small-calendar__context tn-flex tn-items-center tn-justify-between tn-gap-2";
    contextCopy.className = "tn-small-calendar__context-copy tn-flex tn-items-center tn-gap-2 tn-min-w-0";
    threadNode.className = "tn-small-calendar__thread-node tn-flex-none";
    threadNode.setAttribute("aria-hidden", "true");
    contextText.className = "tn-small-calendar__context-text tn-grid tn-min-w-0";
    selectedLabel.className = "tn-small-calendar__selection tn-text-xs tn-truncate";
    selectedLabel.setAttribute("aria-live", "polite");
    contextMeta.className = "tn-small-calendar__context-meta tn-text-2xs tn-text-tertiary tn-truncate";
    contextActions.className = "tn-small-calendar__context-actions tn-flex tn-items-center tn-gap-0-5 tn-flex-none";
    weekdayRow.className = "tn-small-calendar__weekdays tn-grid tn-text-center tn-text-2xs tn-text-tertiary";
    weekdayRow.setAttribute("aria-hidden", "true");
    dayGrid.className = "tn-small-calendar__grid tn-grid";
    dayGrid.setAttribute("role", "grid");

    const previousButton = IconButton({
      ariaLabel: "上个月",
      attributes: { n: "small-calendar-previous-month" },
      class: "tn-small-calendar__nav",
      onClick: (event) => model.previousMonth?.(event),
      size: "sm",
      title: "上个月",
      variant: "ghost",
    }, [Timeless.Icon({ attributes: { n: "previous-month-icon" }, name: "chevron-left", size: 15 })]);
    const nextButton = IconButton({
      ariaLabel: "下个月",
      attributes: { n: "small-calendar-next-month" },
      class: "tn-small-calendar__nav",
      onClick: (event) => model.nextMonth?.(event),
      size: "sm",
      title: "下个月",
      variant: "ghost",
    }, [Timeless.Icon({ attributes: { n: "next-month-icon" }, name: "chevron-right", size: 15 })]);
    const todayButton = Button({
      attributes: { n: "small-calendar-today" },
      class: "tn-small-calendar__today",
      onClick: (event) => model.goToday?.(event),
      size: "xs",
      text: "今天",
      variant: "ghost",
    });
    const clearButton = IconButton({
      ariaLabel: "清除日期筛选",
      attributes: { n: "small-calendar-clear-date" },
      class: "tn-small-calendar__clear",
      onClick: (event) => model.clearDate?.(event),
      size: "xs",
      title: "清除日期筛选",
      variant: "ghost",
    }, [Timeless.Icon({ attributes: { n: "clear-date-icon" }, name: "x", size: 12 })]);

    const weekdayLabels = Array.from({ length: 7 }, () => {
      const label = document.createElement("span");
      label.className = "tn-small-calendar__weekday";
      label.dataset.n = "small-calendar-weekday";
      return label;
    });

    const dayElements = [];
    const dayViews = Array.from({ length: 42 }, (_, index) => {
      const solar = document.createElement("span");
      const lunar = document.createElement("span");
      const festival = document.createElement("span");
      const holiday = document.createElement("span");
      const count = document.createElement("span");
      solar.className = "tn-small-calendar__solar";
      lunar.className = "tn-small-calendar__lunar";
      festival.className = "tn-small-calendar__festival";
      holiday.className = "tn-small-calendar__holiday";
      holiday.setAttribute("aria-hidden", "true");
      count.className = "tn-small-calendar__count";
      count.setAttribute("aria-hidden", "true");
      solar.dataset.n = "small-calendar-solar-date";
      lunar.dataset.n = "small-calendar-lunar-date";
      festival.dataset.n = "small-calendar-festival";
      holiday.dataset.n = "small-calendar-holiday-status";
      count.dataset.n = "small-calendar-memo-count";
      const view = Button({
        attributes: { n: "small-calendar-day" },
        class: "tn-small-calendar__day",
        onClick: (event) => {
          const day = model.presentation.days[index];
          if (day) model.selectDate?.(day.key, event);
        },
        size: "xs",
        variant: "ghost",
      }, [solar, lunar, festival, holiday, count]);
      dayElements.push({ count, festival, holiday, lunar, solar, view });
      return view;
    });

    const headingView = elementView(heading, [yearLabel, monthLabel]);
    const navigationView = elementView(navigation, [todayButton, previousButton, nextButton]);
    const headerView = elementView(header, [headingView, navigationView]);
    const contextTextView = elementView(contextText, [selectedLabel, contextMeta]);
    const contextCopyView = elementView(contextCopy, [threadNode, contextTextView]);
    const contextActionsView = elementView(contextActions, [clearButton]);
    const contextView = elementView(context, [contextCopyView, contextActionsView]);
    const weekdayView = elementView(weekdayRow, weekdayLabels);
    const gridView = elementView(dayGrid, dayViews);
    const view = elementView(root, [headerView, contextView, weekdayView, gridView], props);

    function sync() {
      const presentation = model.presentation;
      yearLabel.textContent = presentation.yearLabel;
      monthLabel.textContent = presentation.monthLabel;
      selectedLabel.textContent = presentation.selectedLabel;
      contextMeta.textContent = presentation.contextMeta;
      context.hidden = !presentation.showSelectionContext;
      clearButton.$elm.hidden = !model.state.selectedDate;
      weekdayLabels.forEach((label, index) => {
        label.textContent = presentation.weekdays[index] || "";
      });
      presentation.days.forEach((day, index) => {
        const elements = dayElements[index];
        const button = elements.view.$elm;
        const ariaLabel = dayAriaLabel(day);
        button.className = classNames(
          "tn-button tn-button--ghost tn-button--xs tn-small-calendar__day",
          !day.inMonth && "is-outside",
          day.isToday && "is-today",
          day.isSelected && "is-selected",
          day.count && "has-items",
          day.info.holidayStatus && `is-${day.info.holidayStatus}`,
        );
        button.dataset.date = day.key;
        button.title = ariaLabel;
        setAttribute(button, "aria-label", ariaLabel);
        setAttribute(button, "aria-current", day.isToday ? "date" : null);
        setAttribute(button, "aria-selected", day.isSelected ? "true" : "false");
        setAttribute(button, "role", "gridcell");
        elements.solar.textContent = String(day.date);
        elements.lunar.textContent = day.info.lunarLabel;
        elements.lunar.hidden = Boolean(day.info.festivalLabel);
        elements.festival.textContent = day.info.festivalLabel;
        elements.festival.hidden = !day.info.festivalLabel;
        elements.holiday.textContent = day.info.holidayBadge;
        elements.holiday.hidden = !day.info.holidayBadge;
        elements.count.textContent = day.countLabel;
        elements.count.hidden = !day.count;
      });
    }

    const unsubscribe = subscribeModel(model, sync);
    sync();
    return attachModel(view, model, unsubscribe, resolved.owned);
  };
}
