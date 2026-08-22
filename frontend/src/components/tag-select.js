import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

function semantic_props(runtime, props, base_class, semantic_name) {
  const { class: extra_class, attributes, ...rest } = props || {};
  return {
    ...rest,
    class: runtime.classNames([base_class, extra_class].filter(Boolean)),
    attributes: { ...(attributes || {}), n: semantic_name },
  };
}

function mounted_element(event, node) {
  return (
    event?.target?.get$elm?.() ||
    event?.target?.$elm ||
    node?.$elm ||
    event?.target ||
    null
  );
}

function tag_option_view(runtime, store, state_, option) {
  const { Button, View, computed } = runtime;
  const option_class_ = computed(state_, (state) => {
    const options = store.filteredOptions(state);
    const option_index = options.findIndex(
      (entry) => entry.value === option.value,
    );
    return [
      "tag-select-option",
      store.isSelected(option.value, state) ? "is-selected" : "",
      state.activeIndex === option_index ? "is-active" : "",
      option.disabled ? "is-disabled" : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  return Button(
    semantic_props(
      runtime,
      {
        class: option_class_,
        disabled: option.disabled,
        attributes: {
          "aria-selected": computed(state_, (state) => {
            return String(store.isSelected(option.value, state));
          }),
          "data-tag-value": option.value,
          id: store.optionId(option),
          role: "option",
          tabindex: "-1",
          type: "button",
        },
        onClick(event) {
          store.toggleValue(option.value, event);
        },
        onMouseEnter() {
          store.setActiveValue(option.value);
        },
        onPointerDown(event) {
          event.preventDefault();
          event.stopPropagation();
        },
      },
      "",
      `tag-select-option-${option.key}`,
    ),
    [
      Timeless.Icon({
        name: "check",
        class: "tag-select-check",
        size: 14,
        attributes: {
          "aria-hidden": "true",
          n: `tag-select-option-${option.key}-check-icon`,
        },
      }),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "tag-select-option-label" },
          "",
          `tag-select-option-${option.key}-label`,
        ),
        [option.label],
      ),
      View(
        semantic_props(
          runtime,
          {
            as: "span",
            class: "tag-select-option-count",
            attributes: { title: `${option.count} 条 memo` },
          },
          "",
          `tag-select-option-${option.key}-memo-count`,
        ),
        [String(option.count)],
      ),
    ],
  );
}

export function TagSelect(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const store = props.store;
  if (!store) throw new TypeError("TagSelect requires a store");
  if (!runtime?.Portal || !runtime?.ui?.PresencePrimitive?.Presence) {
    throw new Error("TagSelect requires Timeless Portal and Presence");
  }
  if (!runtime?.ui?.PopperPrimitive?.Content) {
    throw new Error("TagSelect requires Timeless Popper");
  }

  const {
    Button,
    For,
    Input,
    Portal,
    Show,
    View,
    computed,
    refobj,
    ui,
  } = runtime;
  const state_ = refobj(store.state);
  const presence_state_ = refobj(store.presence.state);
  const unsubscribe_state = store.onStateChange((state) => state_.as(state));
  const unsubscribe_presence = store.presence.onStateChange((state) => {
    presence_state_.as(state);
  });
  const filtered_options_ = computed(state_, (state) => {
    return store.filteredOptions(state);
  });
  const selected_count_ = computed(state_, (state) => {
    return store.selectedCount(state);
  });
  const trigger_label_ = computed(state_, (state) => {
    return store.triggerLabel(state);
  });
  const trigger_class_ = computed(state_, (state) => {
    return [
      "tag-select-trigger",
      state.open ? "is-open" : "",
      state.values.length ? "is-active" : "",
      state.disabled ? "is-disabled" : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const popover_class_ = computed(presence_state_, (state) => {
    return [
      "tag-select-popover",
      state.enter ? "is-entering" : "",
      state.exit ? "is-exiting" : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const result_summary_ = computed(state_, (state) => {
    return store.resultSummary(state);
  });
  const empty_ = computed(filtered_options_, (options) => !options.length);
  const has_selected_ = computed(selected_count_, (count) => count > 0);
  let trigger_ = null;

  trigger_ = Button(
    semantic_props(
      runtime,
      {
        class: trigger_class_,
        disabled: computed(state_, (state) => state.disabled),
        attributes: {
          ...(props.attributes || {}),
          "aria-activedescendant": computed(state_, (state) => {
            return store.activeDescendant(state);
          }),
          "aria-controls": store.list_id,
          "aria-expanded": computed(state_, (state) => String(state.open)),
          "aria-haspopup": "listbox",
          role: "combobox",
          type: "button",
        },
        onKeyDown(event) {
          store.handleTriggerKeyDown(event);
        },
        onPointerDown(event) {
          store.handleTriggerPointerDown(event);
        },
        onClick(event) {
          store.handleTriggerClick(event);
        },
        onMounted(event) {
          store.setTriggerElement(mounted_element(event, trigger_));
        },
        onUnmounted() {
          store.setTriggerElement(null);
        },
      },
      "",
      "tag-select-trigger",
    ),
    [
      Timeless.Icon({
        name: "tag",
        class: "tag-select-trigger-icon",
        size: 15,
        attributes: { "aria-hidden": "true", n: "tag-select-trigger-icon" },
      }),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "tag-select-trigger-label" },
          "",
          "tag-select-trigger-label",
        ),
        [trigger_label_],
      ),
      Show({
        when: has_selected_,
        ok() {
          return View(
            semantic_props(
              runtime,
              { as: "span", class: "tag-select-selected-count" },
              "",
              "tag-select-selected-count",
            ),
            [selected_count_],
          );
        },
      }),
      Timeless.Icon({
        name: "chevron-down",
        class: "tag-select-chevron",
        size: 14,
        attributes: { "aria-hidden": "true", n: "tag-select-chevron-icon" },
      }),
    ],
  );

  function popup_view() {
    let search_input_ = null;
    return ui.PopperPrimitive.Content(
      semantic_props(
        runtime,
        {
          class: "tag-select-positioner",
          store: store.popper,
          attributes: { "aria-label": "选择标签" },
          onMounted(event) {
            store.handlePopperContentMounted(mounted_element(event));
          },
          onUnmounted() {
            store.handlePopperContentUnmounted();
          },
          onDismiss() {
            store.handlePopperDismiss();
          },
          onReferenceOutOfView() {
            store.handlePopperDismiss();
          },
        },
        "",
        "tag-select-positioner",
      ),
      [
        View(
          semantic_props(
            runtime,
            {
              class: popover_class_,
              onAnimationEnd(event) {
                if (event.currentTarget !== event.target) return;
                store.handleAnimationEnd(event);
              },
            },
            "",
            "tag-select-popover",
          ),
          [
            View(
              semantic_props(
                runtime,
                { class: "tag-select-search-row" },
                "",
                "tag-select-search-row",
              ),
              [
                Timeless.Icon({
                  name: "search",
                  class: "tag-select-search-icon",
                  size: 15,
                  attributes: {
                    "aria-hidden": "true",
                    n: "tag-select-search-icon",
                  },
                }),
                (search_input_ = Input(
                  semantic_props(
                    runtime,
                    {
                      class: "tag-select-search-input",
                      placeholder: "搜索标签…",
                      type: "search",
                      value: computed(state_, (state) => state.query),
                      attributes: {
                        "aria-activedescendant": computed(state_, (state) => {
                          return store.activeDescendant(state);
                        }),
                        "aria-controls": store.list_id,
                        "aria-label": "搜索标签",
                        autocomplete: "off",
                        spellcheck: "false",
                        type: "search",
                      },
                      onInput(event) {
                        store.setQuery(event.currentTarget.value);
                      },
                      onKeyDown(event) {
                        store.handleSearchKeyDown(event);
                      },
                      onMounted(event) {
                        store.setSearchElement(
                          mounted_element(event, search_input_),
                        );
                      },
                      onUnmounted() {
                        store.setSearchElement(null);
                      },
                    },
                    "",
                    "tag-select-search-input",
                  ),
                )),
              ],
            ),
            View(
              semantic_props(
                runtime,
                {
                  class: "tag-select-list",
                  attributes: {
                    "aria-multiselectable": "true",
                    id: store.list_id,
                    role: "listbox",
                  },
                },
                "",
                "tag-select-options",
              ),
              [
                For({
                  each: filtered_options_,
                  render(option) {
                    return tag_option_view(runtime, store, state_, option);
                  },
                }),
                Show({
                  when: empty_,
                  ok() {
                    return View(
                      semantic_props(
                        runtime,
                        { class: "tag-select-empty" },
                        "",
                        "tag-select-empty-state",
                      ),
                      [
                        Timeless.Icon({
                          name: "tag",
                          size: 18,
                          attributes: {
                            "aria-hidden": "true",
                            n: "tag-select-empty-icon",
                          },
                        }),
                        View(
                          semantic_props(
                            runtime,
                            { as: "span" },
                            "",
                            "tag-select-empty-copy",
                          ),
                          ["没有匹配的标签"],
                        ),
                      ],
                    );
                  },
                }),
              ],
            ),
            View(
              semantic_props(
                runtime,
                { class: "tag-select-footer" },
                "",
                "tag-select-footer",
              ),
              [
                View(
                  semantic_props(
                    runtime,
                    { as: "span", class: "tag-select-result-summary" },
                    "",
                    "tag-select-result-summary",
                  ),
                  [result_summary_],
                ),
                Show({
                  when: has_selected_,
                  ok() {
                    return Button(
                      semantic_props(
                        runtime,
                        {
                          class: "tag-select-clear",
                          attributes: { type: "button" },
                          onClick(event) {
                            event.preventDefault();
                            event.stopPropagation();
                            store.clear(event);
                          },
                          onPointerDown(event) {
                            event.preventDefault();
                            event.stopPropagation();
                          },
                        },
                        "",
                        "tag-select-clear-action",
                      ),
                      ["清空"],
                    );
                  },
                }),
              ],
            ),
          ],
        ),
      ],
    );
  }

  return View(
    semantic_props(
      runtime,
      {
        as: "span",
        class: ["tag-select", props.class].filter(Boolean).join(" "),
        onUnmounted() {
          unsubscribe_state?.();
          unsubscribe_presence?.();
          state_.destroy?.();
          presence_state_.destroy?.();
          props.onUnmounted?.();
        },
      },
      "",
      "tag-select-root",
    ),
    [
      trigger_,
      ui.PresencePrimitive.Presence(
        { store: store.presence },
        () => [Portal({}, [popup_view()])],
      ),
    ],
  );
}
