import { TimelessPrimitive } from "@/timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";
import { ACPChatModel } from "./chat.model.js";

const ACP_CHAT_DEBUG_KEY = "memo-agent-debug";
const ACP_CHAT_DEBUG_QUERY = "acp_debug";

function is_acp_chat_debug_enabled() {
  try {
    if (typeof window === "undefined") return false;
    if (
      window.location &&
      window.location.search.indexOf(ACP_CHAT_DEBUG_QUERY + "=1") >= 0
    ) {
      return true;
    }
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(ACP_CHAT_DEBUG_KEY) === "1"
    );
  } catch (_) {
    return false;
  }
}

function acp_chat_debug(context, label, payload) {
  if (!is_acp_chat_debug_enabled()) return;
  console.info("[ACP Chat]", new Date().toISOString(), label, {
    mountId: context.mount_id,
    ...(payload || {}),
  });
}

function dom_node(element$) {
  return element$?.$elm?.get$elm?.() || element$?.$elm || null;
}

function ACPChatMessageView(props) {
  const runtime = props.runtime;
  const message = props.message;
  const role = message.role === "user" ? "user" : "assistant";
  return runtime.View(
    {
      class:
        "acp-chat-message is-" +
        role +
        (message.error ? " is-error" : ""),
      key: message.id,
      attributes: { n: "acp-chat-" + role + "-message" },
    },
    [
      runtime.View(
        {
          class: "acp-chat-message-label",
          attributes: { n: "acp-chat-message-author" },
        },
        [role === "user" ? "你" : "Agent"],
      ),
      runtime.View(
        {
          class: "acp-chat-message-content",
          attributes: { n: "acp-chat-message-content" },
        },
        [
          message.text || "正在连接 ACP Agent…",
          runtime.Show({
            when: message.streaming,
            ok() {
              return [
                runtime.View(
                  {
                    class: "acp-chat-cursor",
                    attributes: {
                      "aria-hidden": "true",
                      n: "acp-chat-streaming-cursor",
                    },
                  },
                  [],
                ),
              ];
            },
          }),
        ],
      ),
    ],
  );
}

export function ACPChatView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  if (!runtime?.Button || !runtime?.For || !runtime?.Select) {
    throw new Error("ACPChatView requires the Timeless DOM runtime");
  }
  const { Button, For, Select, Show, Textarea, View, combine, computed } =
    runtime;
  const agent_disabled_ = combine(
    { busy: vm$.state.busy, sessionId: vm$.state.sessionId },
    function (state) {
      return state.busy || Boolean(state.sessionId);
    },
  );
  const has_messages_ = computed(vm$.state.messages, function (messages) {
    return messages.length > 0;
  });

  let input_focus_unsubscribe_ = null;
  const input$ = Textarea({
    disabled: vm$.state.busy,
    placeholder: "给 ACP Agent 发送消息…",
    value: vm$.state.input,
    attributes: {
      "aria-label": "给 ACP Agent 发送消息",
      n: "acp-chat-message-input",
      rows: 3,
    },
    onInput(event) {
      vm$.methods.setInput(event.currentTarget.value);
    },
    onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        vm$.methods.send();
      }
    },
    onMounted() {
      input$.$elm?.setAttribute?.("n", "acp-chat-message-input");
      input$.$elm?.setAttribute?.("aria-label", "给 ACP Agent 发送消息");
      input$.$elm?.setAttribute?.("rows", "3");
      input_focus_unsubscribe_ = vm$.state.focusRequest.subscribe({
        onChange() {
          input$.$elm?.focus?.();
        },
      });
    },
    onUnmounted() {
      input_focus_unsubscribe_?.();
      input_focus_unsubscribe_ = null;
    },
  });

  let messages_unsubscribe_ = null;
  function scroll_messages_to_bottom() {
    globalThis.queueMicrotask(function () {
      const node = dom_node(messages$);
      if (node) node.scrollTop = node.scrollHeight;
    });
  }
  const messages$ = View(
    {
      class: "acp-chat-messages",
      attributes: {
        "aria-live": "polite",
        n: "acp-chat-message-list",
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
                return ACPChatMessageView({ message, runtime });
              },
            }),
          ];
        },
        else() {
          return [
            View(
              {
                class: "acp-chat-empty",
                attributes: { n: "acp-chat-empty-message" },
              },
              [
                View(
                  {
                    class: "acp-chat-empty-title",
                    attributes: { n: "acp-chat-empty-title" },
                  },
                  ["开始 ACP 对话"],
                ),
                View(
                  {
                    class: "acp-chat-empty-description",
                    attributes: { n: "acp-chat-empty-description" },
                  },
                  ["消息会发送给本机已安装的原生 ACP Agent。"],
                ),
              ],
            ),
          ];
        },
      }),
    ],
  );

  return View(
    {
      class: "acp-chat-page",
      attributes: { n: "acp-chat-page" },
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
          class: "acp-chat-toolbar",
          attributes: { n: "acp-chat-toolbar" },
        },
        [
          View(
            {
              class: "acp-chat-agent-field",
              attributes: {
                "aria-labelledby": "acp-chat-agent-label",
                n: "acp-chat-agent-field",
                role: "group",
              },
            },
            [
              View(
                {
                  class: "acp-chat-agent-label",
                  attributes: {
                    id: "acp-chat-agent-label",
                    n: "acp-chat-agent-label",
                  },
                },
                ["Agent"],
              ),
              Show({
                when: vm$.state.agentsReady,
                ok() {
                  return [
                    Select({
                      disabled: agent_disabled_,
                      options: vm$.state.agents.value,
                      value: vm$.state.agentId.value,
                      attributes: {
                        "aria-labelledby": "acp-chat-agent-label",
                        n: "acp-chat-agent-select",
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
                        class: "acp-chat-agent-loading",
                        attributes: {
                          n: "acp-chat-agent-loading",
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
              class: "acp-chat-toolbar-actions",
              attributes: { n: "acp-chat-toolbar-actions" },
            },
            [
              View(
                {
                  class: "acp-chat-status",
                  attributes: {
                    "aria-live": "polite",
                    n: "acp-chat-status",
                  },
                },
                [vm$.state.status],
              ),
              Button(
                {
                  class: "tn-button--secondary memo-secondary-button",
                  disabled: vm$.state.busy,
                  attributes: { n: "acp-chat-new-button", type: "button" },
                  onClick() {
                    vm$.methods.newConversation();
                  },
                },
                ["新建对话"],
              ),
            ],
          ),
        ],
      ),
      messages$,
      View(
        {
          class: "acp-chat-error",
          attributes: {
            "aria-live": "assertive",
            n: "acp-chat-error-message",
            role: "alert",
          },
        },
        [vm$.state.error],
      ),
      View(
        {
          class: "acp-chat-composer",
          attributes: { n: "acp-chat-composer" },
        },
        [
          input$,
          View(
            {
              class: "acp-chat-composer-actions",
              attributes: { n: "acp-chat-composer-actions" },
            },
            [
              View(
                {
                  class: "acp-chat-shortcut",
                  attributes: { n: "acp-chat-send-shortcut" },
                },
                ["⌘/Ctrl + Enter 发送"],
              ),
              Show({
                when: vm$.state.busy,
                ok() {
                  return [
                    Button(
                      {
                        class: "tn-button--secondary memo-secondary-button",
                        attributes: {
                          n: "acp-chat-cancel-button",
                          type: "button",
                        },
                        onClick() {
                          vm$.methods.cancel();
                        },
                      },
                      ["取消"],
                    ),
                  ];
                },
              }),
              Button(
                {
                  class: "tn-button--primary memo-primary-button",
                  disabled: vm$.state.busy,
                  attributes: { n: "acp-chat-send-button", type: "button" },
                  onClick() {
                    vm$.methods.send();
                  },
                },
                ["发送"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

export function mountACPChat(host) {
  const debug_context = {
    mount_id:
      "chat-" +
      new Date().toISOString() +
      "-" +
      Math.floor(Math.random() * 1000000),
  };
  const vm$ = ACPChatModel({
    debug(label, payload) {
      acp_chat_debug(debug_context, label, payload);
    },
  });
  renderTimelessView(host, ACPChatView({ vm$ }));
  return {
    destroy() {
      unmountTimelessView(host);
      vm$.destroy();
    },
  };
}
