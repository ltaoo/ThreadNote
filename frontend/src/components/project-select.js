import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { tn } from "@/tnui.js";

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

function project_option_view(runtime, store, state_, option) {
  const { Button, View, computed } = runtime;
  const option_class_ = computed(state_, (state) => {
    const options = store.filteredOptions(state);
    const option_index = options.findIndex(
      (entry) => entry.value === option.value,
    );
    return [
      "project-select-option",
      state.value === option.value ? "is-selected" : "",
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
          "aria-selected": computed(
            state_,
            (state) => String(state.value === option.value),
          ),
          "data-project-value": option.value,
          id: store.optionId(option),
          role: "option",
          tabindex: "-1",
          type: "button",
        },
        onClick(event) {
          store.select(option.value, event);
        },
        onMouseEnter() {
          store.setActiveValue(option.value);
        },
        onPointerDown(event) {
          event.preventDefault();
        },
      },
      "",
      `project-select-option-${option.key}`,
    ),
    [
      View(
        semantic_props(
          runtime,
          {
            as: "span",
            class: [
              "project-select-dot",
              option.value ? "" : "is-unassigned",
            ]
              .filter(Boolean)
              .join(" "),
            style: option.color
              ? { "background-color": option.color }
              : undefined,
          },
          "",
          `project-select-option-${option.key}-dot`,
        ),
      ),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "project-select-option-copy" },
          "",
          `project-select-option-${option.key}-copy`,
        ),
        [
          View(
            semantic_props(
              runtime,
              { as: "span", class: "project-select-option-label" },
              "",
              `project-select-option-${option.key}-label`,
            ),
            [option.label],
          ),
          View(
            semantic_props(
              runtime,
              { as: "span", class: "project-select-option-caption" },
              "",
              `project-select-option-${option.key}-caption`,
            ),
            [option.value ? "Project" : "没有关联 Project"],
          ),
        ],
      ),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "project-select-option-meta" },
          "",
          `project-select-option-${option.key}-meta`,
        ),
        [
          View(
            semantic_props(
              runtime,
              {
                as: "span",
                class: "project-select-count",
                attributes: { title: `${option.count} 条 memo` },
              },
              "",
              `project-select-option-${option.key}-memo-count`,
            ),
            [String(option.count)],
          ),
          Timeless.Icon({
            name: "check",
            class: "project-select-check",
            size: 14,
            attributes: {
              "aria-hidden": "true",
              n: `project-select-option-${option.key}-check-icon`,
            },
          }),
        ],
      ),
    ],
  );
}

export function ProjectSelect(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const store = props.store;
  if (!store) throw new TypeError("ProjectSelect requires a store");
  if (!runtime?.Portal || !runtime?.ui?.PresencePrimitive?.Presence) {
    throw new Error("ProjectSelect requires Timeless Portal and Presence");
  }
  if (!runtime?.ui?.PopperPrimitive?.Content) {
    throw new Error("ProjectSelect requires Timeless Popper");
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
  const selected_option_ = computed(state_, (state) => {
    return store.selectedOption(state);
  });
  const selected_label_ = computed(state_, (state) => {
    return store.selectedOption(state)?.label || state.placeholder;
  });
  const selected_count_ = computed(state_, (state) => {
    return String(store.selectedOption(state)?.count ?? 0);
  });
  const trigger_class_ = computed(state_, (state) => {
    return [
      "project-select-trigger",
      state.open ? "is-open" : "",
      state.disabled ? "is-disabled" : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const popover_class_ = computed(presence_state_, (state) => {
    return [
      "project-select-popover",
      state.enter ? "is-entering" : "",
      state.exit ? "is-exiting" : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const result_summary_ = computed(state_, (state) => {
    return store.resultSummary(state);
  });
  const create_action_caption_ = computed(state_, (state) => {
    const query = state.query.trim();
    return query ? `用“${query}”作为名称` : "新建后返回这里继续选择";
  });
  const create_error_ = computed(state_, (state) => state.createError);
  const empty_ = computed(filtered_options_, (options) => !options.length);
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
      "project-select-trigger",
    ),
    [
      View(
        semantic_props(
          runtime,
          {
            as: "span",
            class: computed(selected_option_, (option) => {
              return [
                "project-select-dot project-select-trigger-dot",
                option?.value ? "" : "is-unassigned",
              ]
                .filter(Boolean)
                .join(" ");
            }),
            style: {
              "background-color": computed(
                selected_option_,
                (option) => option?.color || undefined,
              ),
            },
          },
          "",
          "project-select-selected-dot",
        ),
      ),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "project-select-trigger-copy" },
          "",
          "project-select-selected-copy",
        ),
        [
          View(
            semantic_props(
              runtime,
              { as: "span", class: "project-select-trigger-label" },
              "",
              "project-select-selected-label",
            ),
            [selected_label_],
          ),
          View(
            semantic_props(
              runtime,
              { as: "span", class: "project-select-trigger-caption" },
              "",
              "project-select-selected-caption",
            ),
            ["归属"],
          ),
        ],
      ),
      View(
        semantic_props(
          runtime,
          { as: "span", class: "project-select-count is-trigger" },
          "",
          "project-select-selected-memo-count",
        ),
        [selected_count_],
      ),
      Timeless.Icon({
        name: "chevron-down",
        class: "project-select-chevron",
        size: 14,
        attributes: {
          "aria-hidden": "true",
          n: "project-select-chevron-icon",
        },
      }),
    ],
  );

  function popup_view() {
    store.handlePopupViewCreated();
    let search_input_ = null;
    return ui.PopperPrimitive.Content(
      semantic_props(
        runtime,
        {
          class: "project-select-positioner",
          store: store.popper,
          attributes: { "aria-label": "选择 Project" },
          onMounted(event) {
            store.handlePopperContentMounted(
              mounted_element(event),
            );
          },
          onUnmounted() {
            store.handlePopperContentUnmounted();
          },
          onDismiss() {
            store.handlePopperDismiss("outside-pointerdown");
          },
          onReferenceOutOfView() {
            store.handlePopperDismiss("reference-out-of-view");
          },
        },
        "",
        "project-select-positioner",
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
            "project-select-popover",
          ),
          [
            View(
              semantic_props(
                runtime,
                { class: "project-select-search-row" },
                "",
                "project-select-search-row",
              ),
              [
                Timeless.Icon({
                  name: "search",
                  class: "project-select-search-icon",
                  size: 15,
                  attributes: {
                    "aria-hidden": "true",
                    n: "project-select-search-icon",
                  },
                }),
                (search_input_ = Input(
                  semantic_props(
                    runtime,
                    {
                      class: "project-select-search-input",
                      placeholder: "搜索 Project…",
                      type: "search",
                      value: computed(state_, (state) => state.query),
                      attributes: {
                        "aria-activedescendant": computed(state_, (state) => {
                          return store.activeDescendant(state);
                        }),
                        "aria-controls": store.list_id,
                        "aria-label": "搜索 Project",
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
                    "project-select-search-input",
                  ),
                )),
                View(
                  semantic_props(
                    runtime,
                    {
                      as: "kbd",
                      class: "project-select-search-shortcut",
                      attributes: { "aria-hidden": "true" },
                    },
                    "",
                    "project-select-search-shortcut",
                  ),
                  ["Esc"],
                ),
              ],
            ),
            View(
              semantic_props(
                runtime,
                {
                  class: "project-select-list tn-scrollbar-hidden",
                  attributes: { id: store.list_id, role: "listbox" },
                },
                "",
                "project-select-options",
              ),
              [
                For({
                  each: filtered_options_,
                  render(option) {
                    return project_option_view(runtime, store, state_, option);
                  },
                }),
                Show({
                  when: empty_,
                  ok() {
                    return View(
                      semantic_props(
                        runtime,
                        { class: "project-select-empty" },
                        "",
                        "project-select-empty-state",
                      ),
                      [
                        Timeless.Icon({
                          name: "search",
                          size: 18,
                          attributes: {
                            "aria-hidden": "true",
                            n: "project-select-empty-icon",
                          },
                        }),
                        View(
                          semantic_props(
                            runtime,
                            { as: "span" },
                            "",
                            "project-select-empty-copy",
                          ),
                          ["没有匹配的 Project"],
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
                { class: "project-select-create-section" },
                "",
                "project-select-create-section",
              ),
              [
                Button(
                  semantic_props(
                    runtime,
                    {
                      class: "project-select-create-action",
                      attributes: {
                        "aria-label": "Create Project",
                        type: "button",
                      },
                      onClick(event) {
                        store.openCreateDialog(event);
                      },
                      onPointerDown(event) {
                        event.preventDefault();
                        event.stopPropagation();
                      },
                    },
                    "",
                    "project-select-create-action",
                  ),
                  [
                    View(
                      semantic_props(
                        runtime,
                        {
                          as: "span",
                          class: "project-select-create-icon-wrap",
                        },
                        "",
                        "project-select-create-icon-wrap",
                      ),
                      [
                        Timeless.Icon({
                          name: "plus",
                          size: 15,
                          attributes: {
                            "aria-hidden": "true",
                            n: "project-select-create-icon",
                          },
                        }),
                      ],
                    ),
                    View(
                      semantic_props(
                        runtime,
                        {
                          as: "span",
                          class: "project-select-create-copy",
                        },
                        "",
                        "project-select-create-copy",
                      ),
                      [
                        View(
                          semantic_props(
                            runtime,
                            {
                              as: "span",
                              class: "project-select-create-label",
                            },
                            "",
                            "project-select-create-label",
                          ),
                          ["Create Project"],
                        ),
                        View(
                          semantic_props(
                            runtime,
                            {
                              as: "span",
                              class: "project-select-create-caption",
                            },
                            "",
                            "project-select-create-caption",
                          ),
                          [create_action_caption_],
                        ),
                      ],
                    ),
                    Timeless.Icon({
                      name: "external-link",
                      class: "project-select-create-arrow",
                      size: 14,
                      attributes: {
                        "aria-hidden": "true",
                        n: "project-select-create-arrow-icon",
                      },
                    }),
                  ],
                ),
              ],
            ),
            View(
              semantic_props(
                runtime,
                { class: "project-select-footer" },
                "",
                "project-select-footer",
              ),
              [
                View(
                  semantic_props(
                    runtime,
                    { as: "span", class: "project-select-result-summary" },
                    "",
                    "project-select-result-summary",
                  ),
                  [result_summary_],
                ),
                View(
                  semantic_props(
                    runtime,
                    { as: "span", class: "project-select-keyboard-hint" },
                    "",
                    "project-select-keyboard-hint",
                  ),
                  ["↑↓ 移动 · Tab 新建"],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  function create_dialog_view() {
    return tn.Dialog(
      {
        class: "project-select-create-dialog",
        confirmText: "创建",
        cancelText: "取消",
        showClose: false,
        store: store.create_dialog,
        attributes: {
          "aria-describedby": `${store.id}-create-description`,
          "aria-label": "Create Project",
        },
      },
      [
        tn.DialogBody(
          { class: "project-select-create-dialog-body" },
          [
            View(
              semantic_props(
                runtime,
                { class: "project-select-create-intro" },
                "",
                "project-select-create-dialog-intro",
              ),
              [
                View(
                  semantic_props(
                    runtime,
                    {
                      as: "span",
                      class: "project-select-create-dialog-icon",
                    },
                    "",
                    "project-select-create-dialog-icon-wrap",
                  ),
                  [
                    Timeless.Icon({
                      name: "folder",
                      size: 18,
                      attributes: {
                        "aria-hidden": "true",
                        n: "project-select-create-dialog-icon",
                      },
                    }),
                  ],
                ),
                View(
                  semantic_props(
                    runtime,
                    {
                      as: "p",
                      class: "project-select-create-description",
                      attributes: {
                        id: `${store.id}-create-description`,
                      },
                    },
                    "",
                    "project-select-create-dialog-description",
                  ),
                  ["创建完成后会刷新 Project 列表，并回到当前选择器。"],
                ),
              ],
            ),
            tn.FormField(
              {
                class: "project-select-create-field",
                description: "名称最多 120 个字符",
                error: create_error_,
                label: "Project 名称",
              },
              [
                tn.Input({
                  store: store.create_name_input,
                  attributes: {
                    "aria-label": "Project 名称",
                    maxlength: "120",
                    name: "project-name",
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
        class: ["project-select", props.class].filter(Boolean).join(" "),
        onUnmounted() {
          unsubscribe_state?.();
          unsubscribe_presence?.();
          state_.destroy?.();
          presence_state_.destroy?.();
          props.onUnmounted?.();
        },
      },
      "",
      "project-select-root",
    ),
    [
      trigger_,
      ui.PresencePrimitive.Presence(
        { store: store.presence },
        () => [
          Portal(
            {
              onMounted(event) {
                store.handlePortalMounted(mounted_element(event));
              },
              onUnmounted() {
                store.handlePortalUnmounted();
              },
            },
            [popup_view()],
          ),
        ],
      ),
      create_dialog_view(),
    ],
  );
}
