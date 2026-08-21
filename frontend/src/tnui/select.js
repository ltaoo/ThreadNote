import {
  For,
  Fragment,
  Runtime as Timeless,
  Show,
  View,
  class_names,
  computed,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
  vm,
} from "./runtime.js";

function is_select_group(entry) {
  return typeof vm.SelectGroupCore === "function" && entry instanceof vm.SelectGroupCore;
}

function select_entry(select_store, entry) {
  if (is_select_group(entry)) {
    return Fragment({}, [
      entry.label
        ? View(
          semantic_props({}, "tn-select__group-label", "select-group-label"),
          [entry.label],
        )
        : null,
      For({
        each: entry.options || [],
        render(child) {
          return select_entry(select_store, child);
        },
      }),
    ].filter(Boolean));
  }

  const observation = observe_store(entry);
  return ui.SelectPrimitive.Item(
    semantic_props(
      {
        select$: select_store,
        item$: entry,
        class: computed(observation.state_, (state) => [
          state.focused ? "is-focused" : "",
          state.selected ? "is-selected" : "",
          state.disabled ? "is-disabled" : "",
        ].filter(Boolean).join(" ")),
        onUnmounted: destroy_with(observation),
      },
      "tn-select__item",
      "select-option",
    ),
    [
      ui.SelectPrimitive.ItemText(
        semantic_props({}, "tn-select__item-text", "select-option-label"),
        [entry.label],
      ),
      ui.SelectPrimitive.ItemIndicator(
        semantic_props(
          { store: entry },
          "tn-select__item-indicator",
          "select-option-indicator",
        ),
        [
          Timeless.Icon({
            name: "check",
            class: "tn-icon",
            size: 12,
            attributes: { n: "select-option-check-icon" },
          }),
        ],
      ),
    ],
  );
}

export function Select(props = {}) {
  const {
    contentClass: content_class,
    store: provided_store,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Select", provided_store);
  const {
    class: trigger_class,
    onClick: provided_on_click,
    onPointerDown: provided_on_pointer_down,
    ...trigger_props
  } = rest;
  const observation = observe_store(store);
  let suppress_next_click = false;
  let click_suppression_timer = null;

  function suppress_click_once() {
    suppress_next_click = true;
    globalThis.clearTimeout(click_suppression_timer);
    click_suppression_timer = globalThis.setTimeout(function () {
      suppress_next_click = false;
      click_suppression_timer = null;
    }, 1000);
  }

  function consume_click_suppression() {
    const suppressed = suppress_next_click;
    suppress_next_click = false;
    globalThis.clearTimeout(click_suppression_timer);
    click_suppression_timer = null;
    return suppressed;
  }

  function ensure_trigger_reference(event) {
    const event_target = event.currentTarget || event.target;
    const trigger_element =
      event_target?.get$elm?.()
      || event_target?.closest?.(".tn-select")
      || event_target;
    if (!trigger_element?.getBoundingClientRect) return;
    store.setTrigger?.(trigger_element);
    store.popper$?.setReference(
      {
        $el: trigger_element,
        getRect() {
          return trigger_element.getBoundingClientRect();
        },
      },
      { force: true },
    );
  }

  const show_clear_ = computed(observation.state_, (state) =>
    Boolean(state.allowClear && state.value != null && !state.loading && !state.disabled),
  );

  const primitive_select = ui.SelectPrimitive.Root(
    { store },
    [
      ui.SelectPrimitive.Trigger(
        semantic_props(
          {
            ...trigger_props,
            store,
            class: class_names([
              trigger_class,
              computed(observation.state_, (state) => [
                state.open ? "is-open" : "",
                state.disabled ? "is-disabled" : "",
              ].filter(Boolean).join(" ")),
            ]),
            onPointerDown(event) {
              const target = event.target;
              if (
                target?.tagName === "INPUT"
                || target?.tagName === "TEXTAREA"
                || target?.isContentEditable
              ) {
                provided_on_pointer_down?.(event);
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation?.();
              ensure_trigger_reference(event);
              suppress_click_once();
              store.handleClickTrigger();
              provided_on_pointer_down?.(event);
            },
            onClick(event) {
              if (!consume_click_suppression()) {
                event.preventDefault();
                event.stopPropagation();
                ensure_trigger_reference(event);
                store.handleClickTrigger();
              }
              provided_on_click?.(event);
            },
          },
          "tn-select",
          "select-trigger",
        ),
        [
          Show({
            when: computed(observation.state_, (state) => Boolean(state.search)),
            ok() {
              return ui.SelectPrimitive.Search(
                semantic_props({ store }, "tn-select__search", "select-search-input"),
              );
            },
            else() {
              return View(
                semantic_props(
                  {
                    class: computed(observation.state_, (state) =>
                      state.selectedOption ? "" : "is-placeholder",
                    ),
                  },
                  "tn-select__value",
                  "select-value",
                ),
                [
                  computed(observation.state_, (state) => {
                    const selected_option = state.selectedOption;
                    return selected_option?.label
                      ?? selected_option?.value
                      ?? state.placeholder
                      ?? "Select...";
                  }),
                ],
              );
            },
          }),
          Show({
            when: show_clear_,
            ok() {
              return ui.SelectPrimitive.Clear(
                semantic_props(
                  { store, attributes: { "aria-label": "清除选择" } },
                  "tn-select__action",
                  "select-clear-button",
                ),
                [
                  Timeless.Icon({
                    name: "x",
                    class: "tn-icon",
                    size: 14,
                    attributes: { n: "select-clear-icon" },
                  }),
                ],
              );
            },
            else() {
              return ui.SelectPrimitive.Icon(
                semantic_props({ store }, "tn-select__action", "select-chevron"),
                [
                  Timeless.Icon({
                    name: "chevron-down",
                    class: "tn-icon",
                    size: 14,
                    attributes: { n: "select-chevron-icon" },
                  }),
                ],
              );
            },
          }),
        ],
      ),
      Show({
        when: computed(observation.state_, (state) => Boolean(state.open)),
        ok() {
          return ui.SelectPrimitive.Content(
            semantic_props(
              {
                store,
                class: content_class,
                attributes: { role: "listbox" },
                animation: { in: "is-entering", out: "is-exiting" },
              },
              "tn-popup tn-select__content",
              "select-popup",
            ),
            () => [
              ui.SelectPrimitive.Viewport(
                semantic_props({ store }, "tn-select__viewport", "select-options"),
                [
                  Show({
                    when: computed(
                      observation.state_,
                      (state) => Boolean(state.loading),
                    ),
                    ok() {
                      return View(
                        semantic_props(
                          {},
                          "tn-select__state",
                          "select-loading-state",
                        ),
                        ["加载中…"],
                      );
                    },
                    else() {
                      return For({
                        each: computed(
                          observation.state_,
                          (state) =>
                            state.options || store.raw_options || store.options || [],
                        ),
                        render(entry) {
                          return select_entry(store, entry);
                        },
                      });
                    },
                  }),
                ],
              ),
            ],
          );
        },
      }),
    ],
  );

  return View(
    semantic_props(
      {
        as: "span",
        class: computed(observation.state_, (state) => [
          state.open ? "is-open" : "",
          state.disabled ? "is-disabled" : "",
        ].filter(Boolean).join(" ")),
        onUnmounted: destroy_with(observation, function () {
          consume_click_suppression();
          onUnmounted?.();
        }),
      },
      "tn-select-root",
      "select-root",
    ),
    [primitive_select],
  );
}
