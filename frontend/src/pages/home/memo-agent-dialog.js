import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";
import { MemoAgentDialogModel } from "./memo-agent-dialog.model.js";

let active_dialog = null;

function dom_node(element$) {
  return element$?.$elm?.get$elm?.() || null;
}

function MemoAgentMessageView(props) {
  let role = "user";
  if (props.message.role === "agent") role = "agent";
  let author = "你";
  if (role === "agent") author = "Agent";
  return props.runtime.View(
    {
      key: props.message.id,
      class: "memo-agent-message is-" + role,
      attributes: { n: "memo-agent-" + role + "-message" },
    },
    [
      props.runtime.View(
        {
          class: "memo-agent-message-label",
          attributes: { n: "memo-agent-message-author" },
        },
        [author],
      ),
      props.runtime.View(
        {
          class: "memo-agent-message-text",
          attributes: { n: "memo-agent-message-text" },
        },
        [props.message.text],
      ),
    ],
  );
}

export function MemoAgentDialogView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  if (!runtime?.Button || !runtime?.For || !runtime?.Select) {
    throw new Error("MemoAgentDialogView requires the Timeless DOM runtime");
  }
  const { Button, For, Select, Textarea, View } = runtime;
  const apply_disabled_ = combine(
    { busy: vm$.state.busy, hasCandidate: vm$.state.hasCandidate },
    function (state) {
      return state.busy || !state.hasCandidate;
    },
  );
  const dialog_class_ = computed(vm$.state.busy, function (busy) {
    let busy_class = "";
    if (busy) busy_class = "is-busy";
    return [
      "tn-overlay tn-dialog-layer is-open memo-agent-dialog",
      busy_class,
    ]
      .filter(Boolean)
      .join(" ");
  });
  const has_messages_ = computed(vm$.state.messages, function (messages) {
    return messages.length > 0;
  });
  const send_text_ = computed(vm$.state.busy, function (busy) {
    if (busy) return "处理中…";
    return "发送";
  });

  let focus_unsubscribe_ = null;
  const instruction_input$ = Textarea({
    disabled: vm$.state.busy,
    placeholder: "例如：改得更简洁，并保留 Markdown 格式",
    value: vm$.state.instruction,
    attributes: {
      autofocus: true,
      n: "memo-agent-instruction-input",
      rows: 3,
    },
    onInput(event) {
      vm$.methods.setInstruction(event.currentTarget.value);
    },
    onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        vm$.methods.send();
      }
    },
    onMounted() {
      // The bundled Textarea primitive subscribes to attributes before its DOM
      // adapter exists, so re-apply the semantic/static attributes at mount.
      instruction_input$.$elm?.setAttribute?.(
        "n",
        "memo-agent-instruction-input",
      );
      instruction_input$.$elm?.setAttribute?.(
        "aria-labelledby",
        "memo-agent-instruction-label",
      );
      instruction_input$.$elm?.setAttribute?.("rows", "3");
      instruction_input$.$elm?.focus?.();
      focus_unsubscribe_ = vm$.state.focusRequest.subscribe({
        onChange() {
          instruction_input$.$elm?.focus?.();
        },
      });
    },
    onUnmounted() {
      focus_unsubscribe_?.();
      focus_unsubscribe_ = null;
    },
  });

  let messages_unsubscribe_ = null;
  function scroll_messages_to_bottom() {
    globalThis.queueMicrotask(function () {
      const node = dom_node(messages_host$);
      if (node) node.scrollTop = node.scrollHeight;
    });
  }
  const messages_host$ = View(
    {
      class: "memo-agent-messages",
      attributes: {
        "aria-live": "polite",
        n: "memo-agent-message-list",
      },
      onMounted() {
        scroll_messages_to_bottom();
        messages_unsubscribe_ = vm$.state.messages.subscribe({
          onChange() {
            scroll_messages_to_bottom();
          },
        });
      },
      onUnmounted() {
        messages_unsubscribe_?.();
        messages_unsubscribe_ = null;
      },
    },
    [
      Show({
        when: has_messages_,
        ok() {
          return [
            For({
              each: vm$.state.messages,
              render(message) {
                return MemoAgentMessageView({ message, runtime });
              },
            }),
          ];
        },
        else() {
          return [
            View(
              {
                class: "memo-agent-empty",
                attributes: { n: "memo-agent-empty-message" },
              },
              ["描述你希望如何修改这段内容。"],
            ),
          ];
        },
      }),
    ],
  );

  return View(
    {
      class: dialog_class_,
      attributes: { n: "memo-agent-dialog-overlay" },
      onClick(event) {
        if (event.target === event.currentTarget) {
          vm$.methods.requestClose("backdrop");
        }
      },
      onKeyDown(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        vm$.methods.requestClose("escape");
      },
      onMounted() {
        vm$.methods.init();
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "tn-dialog tn-dialog--md memo-agent-panel",
          attributes: {
            "aria-labelledby": "memo-agent-title",
            "aria-modal": "true",
            n: "memo-agent-dialog-panel",
            role: "dialog",
          },
        },
        [
          View(
            {
              class: "memo-agent-head",
              attributes: { n: "memo-agent-dialog-header" },
            },
            [
              View(
                {
                  class: "memo-agent-heading-copy",
                  attributes: { n: "memo-agent-heading-copy" },
                },
                [
                  View(
                    {
                      class: "memo-agent-title",
                      attributes: {
                        "aria-level": "2",
                        id: "memo-agent-title",
                        n: "memo-agent-title",
                        role: "heading",
                      },
                    },
                    ["对话编辑"],
                  ),
                  View(
                    {
                      class: "memo-agent-description",
                      attributes: { n: "memo-agent-description" },
                    },
                    ["Agent 会重写当前选区，确认后再替换到编辑器。"],
                  ),
                ],
              ),
              Button(
                {
                  attributes: {
                    "aria-label": "关闭",
                    n: "memo-agent-close-button",
                    type: "button",
                  },
                  onClick() {
                    vm$.methods.requestClose("close-button");
                  },
                },
                [
                  Timeless.Icon({
                    name: "x",
                    attributes: { n: "memo-agent-close-icon" },
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-agent-body",
              attributes: { n: "memo-agent-dialog-body" },
            },
            [
              View(
                {
                  class: "memo-agent-field",
                  attributes: {
                    "aria-labelledby": "memo-agent-agent-label",
                    n: "memo-agent-agent-field",
                    role: "group",
                  },
                },
                [
                  View(
                    {
                      class: "memo-agent-field-label",
                      attributes: {
                        id: "memo-agent-agent-label",
                        n: "memo-agent-agent-label",
                      },
                    },
                    ["Agent"],
                  ),
                  Show({
                    when: vm$.state.agentsReady,
                    ok() {
                      return [
                        Select({
                          disabled: vm$.state.busy,
                          options: vm$.state.agents.value,
                          placeholder: "选择 Agent",
                          value: vm$.state.agentId.value,
                          attributes: {
                            "aria-labelledby": "memo-agent-agent-label",
                            n: "memo-agent-agent-select",
                          },
                          onChange(event) {
                            vm$.methods.setAgent(event.currentTarget.value);
                          },
                        }),
                      ];
                    },
                    else() {
                      return [
                        View(
                          {
                            class: "memo-agent-agent-loading",
                            attributes: {
                              n: "memo-agent-agent-loading",
                              role: "status",
                            },
                          },
                          ["正在加载 Agent…"],
                        ),
                      ];
                    },
                  }),
                ],
              ),
              View(
                {
                  class: "memo-agent-section",
                  attributes: { n: "memo-agent-candidate-section" },
                },
                [
                  View(
                    {
                      class: "memo-agent-field-label",
                      attributes: { n: "memo-agent-candidate-label" },
                    },
                    ["当前替换内容"],
                  ),
                  View(
                    {
                      class: "memo-agent-preview",
                      attributes: { n: "memo-agent-candidate-preview" },
                    },
                    [vm$.state.candidate],
                  ),
                ],
              ),
              messages_host$,
              View(
                {
                  class: "memo-agent-field",
                  attributes: {
                    "aria-labelledby": "memo-agent-instruction-label",
                    n: "memo-agent-instruction-field",
                    role: "group",
                  },
                },
                [
                  View(
                    {
                      class: "memo-agent-field-label",
                      attributes: {
                        id: "memo-agent-instruction-label",
                        n: "memo-agent-instruction-label",
                      },
                    },
                    ["修改要求"],
                  ),
                  instruction_input$,
                ],
              ),
              View(
                {
                  class: "memo-agent-error",
                  attributes: {
                    "aria-live": "assertive",
                    n: "memo-agent-error-message",
                    role: "status",
                  },
                },
                [vm$.state.error],
              ),
            ],
          ),
          View(
            {
              class: "memo-agent-actions",
              attributes: { n: "memo-agent-dialog-footer" },
            },
            [
              View(
                {
                  class: "memo-agent-shortcut",
                  attributes: { n: "memo-agent-send-shortcut" },
                },
                ["⌘/Ctrl + Enter 发送"],
              ),
              View(
                {
                  class: "memo-agent-action-buttons",
                  attributes: { n: "memo-agent-action-buttons" },
                },
                [
                  Button(
                    {
                      disabled: vm$.state.busy,
                      attributes: {
                        n: "memo-agent-send-button",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.send();
                      },
                    },
                    [send_text_],
                  ),
                  Button(
                    {
                      class: "is-primary",
                      disabled: apply_disabled_,
                      attributes: {
                        n: "memo-agent-apply-button",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.applyCandidate();
                      },
                    },
                    ["替换选区"],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

function create_dialog(options) {
  const runtime = options.runtime || TimelessPrimitive;
  let mounted_ = null;
  let destroyed_ = false;
  let dialog = null;
  const vm$ = MemoAgentDialogModel({
    ...options,
    runtime,
    onRequestClose() {
      dialog?.destroy();
    },
  });

  dialog = {
    destroy() {
      if (destroyed_) return;
      destroyed_ = true;
      if (mounted_) {
        mounted_.view.beforeUnmounted?.();
        mounted_.view.destroy?.();
        mounted_.dom.remove();
        mounted_ = null;
      } else {
        vm$.destroy();
      }
      if (active_dialog === dialog) active_dialog = null;
    },

    open() {
      if (destroyed_ || mounted_) return;
      const view = MemoAgentDialogView({ runtime, vm$ });
      const rendered = runtime.DOM.buildAndRender(view);
      mounted_ = { dom: rendered.dom, view };
      document.body.appendChild(rendered.dom);
      globalThis.queueMicrotask(function () {
        if (!destroyed_) view.onMounted?.({ target: rendered.vnode });
      });
    },
  };
  return dialog;
}

export function openMemoAgentDialog(options = {}) {
  active_dialog?.destroy();
  active_dialog = create_dialog(options);
  active_dialog.open();
  return active_dialog;
}
