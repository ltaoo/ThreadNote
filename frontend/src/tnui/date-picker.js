import {
  For,
  Runtime as Timeless,
  Show,
  View,
  computed,
  refobj,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function DatePicker(props = {}) {
  const {
    store: provided_store,
    placeholder = "选择日期",
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("DatePicker", provided_store);
  const state_ = refobj(store.state);
  const calendar_state_ = refobj(store.$calendar.state);
  const unlistens = [
    store.onStateChange((state) => state_.as(state)),
    store.$calendar.onChange((state) => calendar_state_.as(state)),
  ];

  return ui.DatePickerPrimitive.Root(
    semantic_props(
      {
        store,
        onUnmounted() {
          unlistens.forEach((unlisten) => unlisten?.());
          state_.destroy?.();
          calendar_state_.destroy?.();
          onUnmounted?.();
        },
      },
      "tn-date-picker-root",
      "date-picker-root",
    ),
    [
      ui.DatePickerPrimitive.Trigger(
        semantic_props({ store }, "tn-date-picker", "date-picker-trigger"),
        [
          ui.DatePickerPrimitive.Value(
            semantic_props(
              { store, placeholder },
              "tn-date-picker__value",
              "date-picker-value",
            ),
          ),
          Show({
            when: computed(
              state_,
              (state) => Boolean(state.allowClear && state.value != null),
            ),
            ok() {
              return ui.DatePickerPrimitive.Clear(
                semantic_props(
                  { store, attributes: { "aria-label": "清除日期" } },
                  "tn-date-picker__action",
                  "date-picker-clear-button",
                ),
                [
                  Timeless.Icon({
                    name: "circle-x",
                    class: "tn-icon",
                    size: 14,
                    attributes: { n: "date-picker-clear-icon" },
                  }),
                ],
              );
            },
            else() {
              return ui.DatePickerPrimitive.Icon(
                semantic_props({}, "tn-date-picker__action", "date-picker-calendar-icon"),
                [
                  Timeless.Icon({
                    name: "calendar",
                    class: "tn-icon",
                    size: 16,
                    attributes: { n: "date-picker-calendar-glyph" },
                  }),
                ],
              );
            },
          }),
        ],
      ),
      ui.DatePickerPrimitive.Content(
        semantic_props(
          {
            ...rest,
            store,
            animation: { in: "is-entering", out: "is-exiting" },
          },
          "tn-popup tn-date-picker__content",
          "date-picker-popup",
        ),
        () => [
          ui.DatePickerPrimitive.Calendar(
            semantic_props({ store }, "tn-date-picker__calendar", "date-picker-calendar"),
            [
              View(
                semantic_props({}, "tn-date-picker__header", "date-picker-header"),
                [
                  ui.DatePickerPrimitive.CalendarPrevButton(
                    semantic_props(
                      { store, attributes: { "aria-label": "上个月" } },
                      "tn-date-picker__nav",
                      "date-picker-previous-month",
                    ),
                    [
                      Timeless.Icon({
                        name: "chevron-left",
                        class: "tn-icon",
                        size: 16,
                        attributes: { n: "date-picker-previous-icon" },
                      }),
                    ],
                  ),
                  ui.DatePickerPrimitive.CalendarHeader(
                    semantic_props(
                      { store },
                      "tn-date-picker__month",
                      "date-picker-current-month",
                    ),
                  ),
                  ui.DatePickerPrimitive.CalendarNextButton(
                    semantic_props(
                      { store, attributes: { "aria-label": "下个月" } },
                      "tn-date-picker__nav",
                      "date-picker-next-month",
                    ),
                    [
                      Timeless.Icon({
                        name: "chevron-right",
                        class: "tn-icon",
                        size: 16,
                        attributes: { n: "date-picker-next-icon" },
                      }),
                    ],
                  ),
                ],
              ),
              ui.DatePickerPrimitive.CalendarGrid(
                semantic_props({ store }, "tn-date-picker__grid", "date-picker-grid"),
                [
                  View(
                    semantic_props(
                      {},
                      "tn-date-picker__weekdays",
                      "date-picker-weekdays",
                    ),
                    WEEKDAYS.map((weekday) =>
                      View(
                        semantic_props(
                          { as: "span" },
                          "tn-date-picker__weekday",
                          `date-picker-weekday-${weekday}`,
                        ),
                        [weekday],
                      ),
                    ),
                  ),
                  For({
                    each: computed(calendar_state_, (state) => state.weeks || []),
                    render(week) {
                      return View(
                        semantic_props({}, "tn-date-picker__week", "date-picker-week"),
                        [
                          For({
                            each: computed(week, (value) => value.dates || []),
                            render(day) {
                              return ui.DatePickerPrimitive.CalendarCell(
                                semantic_props(
                                  {
                                    store,
                                    value: day.value,
                                    isToday: day.is_today,
                                    isPrevMonth: day.is_prev_month,
                                    isNextMonth: day.is_next_month,
                                    class: computed(calendar_state_, (state) => [
                                      state.selectedDay?.time === day.time ? "is-selected" : "",
                                      day.is_today ? "is-today" : "",
                                      day.is_prev_month || day.is_next_month ? "is-outside" : "",
                                    ].filter(Boolean).join(" ")),
                                  },
                                  "tn-date-picker__day",
                                  "date-picker-day",
                                ),
                                [day.text],
                              );
                            },
                          }),
                        ],
                      );
                    },
                  }),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
