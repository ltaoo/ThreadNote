import {
  CommentCardView,
  MemoCardView,
} from "./comment-replies.js";
import { TimelessPrimitive } from "./timeless-icons.js";
import { renderTimelessView } from "./timeless-view-mount.js";
import { TodoWindowModel } from "./todo-window.model.js";
import { memoQuickSearchHighlightParts } from "./pages/home/memo-quick-search-model.js";

function HighlightTextView(props) {
  const { Fragment, View } = props.runtime;
  let active_match_used = false;
  return Fragment(
    {},
    memoQuickSearchHighlightParts(props.text, props.query).map(function (part) {
      if (!part.matched) return part.text;
      const active = props.active && !active_match_used;
      active_match_used = active_match_used || active;
      return View(
        {
          class: "memo-find-match" + (active ? " is-active" : ""),
          attributes: { n: props.meaning + "-query-match" },
        },
        [part.text],
      );
    }),
  );
}

function TodoPrimaryView(props) {
  const { Checkbox, Show, View } = props.runtime;
  const todo = props.todo;
  const status_label = todo.checked ? "已完成" : "未完成";
  const source_label = todo.sourceCommentId ? "来自评论" : "来自 Memo";
  return View(
    {
      class: "todo-detail-primary",
      attributes: {
        "aria-labelledby": "todo-detail-task-title",
        n: "todo-detail-primary",
        role: "region",
      },
    },
    [
      View(
        {
          class: "todo-detail-primary-header",
          attributes: { n: "todo-detail-primary-header" },
        },
        [
          View(
            {
              class: "todo-detail-section-label",
              attributes: { n: "todo-detail-section-label" },
            },
            [
              View(
                {
                  class: "todo-detail-section-mark",
                  attributes: {
                    "aria-hidden": "true",
                    n: "todo-detail-section-mark",
                  },
                },
                [],
              ),
              View(
                { attributes: { n: "todo-detail-section-label-text" } },
                ["当前任务"],
              ),
            ],
          ),
          View(
            {
              class:
                "todo-detail-status " +
                (todo.checked ? "is-complete" : "is-open"),
              attributes: { n: "todo-detail-status" },
            },
            [
              View(
                {
                  class: "todo-detail-status-dot",
                  attributes: {
                    "aria-hidden": "true",
                    n: "todo-detail-status-dot",
                  },
                },
                [],
              ),
              View(
                { attributes: { n: "todo-detail-status-label" } },
                [status_label],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class:
            "todo-detail-card" + (todo.checked ? " is-complete" : ""),
          attributes: { n: "todo-detail-task-card", role: "article" },
        },
        [
          View(
            {
              class: "todo-detail-check-row",
              attributes: { n: "todo-detail-check-row" },
            },
            [
              Checkbox({
                checked: todo.checked,
                class: "memo-todo-checkbox todo-detail-checkbox",
                disabled: true,
                attributes: {
                  "aria-label": "状态：" + status_label,
                  n: "todo-detail-completion-checkbox",
                },
              }),
              View(
                {
                  class: "todo-detail-task-copy",
                  attributes: { n: "todo-detail-task-copy" },
                },
                [
                  View(
                    {
                      class: "todo-detail-task-title",
                      attributes: {
                        "aria-level": "1",
                        id: "todo-detail-task-title",
                        n: "todo-detail-task-title",
                        role: "heading",
                      },
                    },
                    [
                      HighlightTextView({
                        active: true,
                        meaning: "todo-detail-task-title",
                        query: props.query,
                        runtime: props.runtime,
                        text: todo.title,
                      }),
                    ],
                  ),
                  Show({
                    when: Boolean(todo.description),
                    ok() {
                      return [
                        View(
                          {
                            class: "todo-detail-task-description",
                            attributes: { n: "todo-detail-task-description" },
                          },
                          [
                            HighlightTextView({
                              active: false,
                              meaning: "todo-detail-task-description",
                              query: props.query,
                              runtime: props.runtime,
                              text: todo.description,
                            }),
                          ],
                        ),
                      ];
                    },
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "todo-detail-source",
              attributes: { n: "todo-detail-source" },
            },
            [
              View(
                {
                  class: "todo-detail-source-label",
                  attributes: { n: "todo-detail-source-label" },
                },
                [source_label],
              ),
              Show({
                when: Boolean(todo.sourceText),
                ok() {
                  return [
                    View(
                      {
                        class: "todo-detail-source-text",
                        attributes: { n: "todo-detail-source-text" },
                      },
                      [
                        HighlightTextView({
                          active: false,
                          meaning: "todo-detail-source-text",
                          query: props.query,
                          runtime: props.runtime,
                          text: todo.sourceText,
                        }),
                      ],
                    ),
                  ];
                },
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

function ContextCardView(props) {
  const { View } = props.runtime;
  return View(
    {
      class:
        "todo-detail-context-card todo-detail-context-card-" + props.kind,
      attributes: {
        "aria-labelledby": props.titleId,
        n: props.meaning,
        role: "article",
      },
    },
    [
      View(
        {
          class: "todo-detail-context-card-header",
          attributes: { n: props.meaning + "-header" },
        },
        [
          View(
            {
              class: "todo-detail-context-index",
              attributes: {
                "aria-hidden": "true",
                n: props.meaning + "-index",
              },
            },
            [props.index],
          ),
          View(
            {
              class: "todo-detail-context-card-heading",
              attributes: { n: props.meaning + "-heading" },
            },
            [
              View(
                {
                  class: "todo-detail-context-card-kicker",
                  attributes: { n: props.meaning + "-kicker" },
                },
                [props.kicker],
              ),
              View(
                {
                  class: "todo-detail-context-card-title",
                  attributes: {
                    "aria-level": "3",
                    id: props.titleId,
                    n: props.meaning + "-title",
                    role: "heading",
                  },
                },
                [props.title],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class:
            "todo-detail-context-card-body" +
            (props.comments ? " memo-comment-list" : ""),
          attributes: { n: props.meaning + "-body" },
        },
        props.children,
      ),
    ],
  );
}

function TodoDetailContentView(props) {
  const { Show, View } = props.runtime;
  const vm$ = props.vm$;
  const query = vm$.state.query.value;
  return View(
    {
      class: "todo-detail-content",
      attributes: { n: "todo-detail-content" },
    },
    [
      TodoPrimaryView({
        query,
        runtime: props.runtime,
        todo: vm$.state.todo.value,
      }),
      View(
        {
          class: "todo-detail-context",
          attributes: {
            "aria-labelledby": "todo-detail-context-title",
            n: "todo-detail-context",
            role: "region",
          },
        },
        [
          View(
            {
              class: "todo-detail-context-heading",
              attributes: { n: "todo-detail-context-heading" },
            },
            [
              View(
                {
                  class: "todo-detail-context-heading-copy",
                  attributes: { n: "todo-detail-context-heading-copy" },
                },
                [
                  View(
                    {
                      class: "todo-detail-context-eyebrow",
                      attributes: { n: "todo-detail-context-eyebrow" },
                    },
                    ["CONTEXT"],
                  ),
                  View(
                    {
                      class: "todo-detail-context-title",
                      attributes: {
                        "aria-level": "2",
                        id: "todo-detail-context-title",
                        n: "todo-detail-context-title",
                        role: "heading",
                      },
                    },
                    ["关联内容"],
                  ),
                ],
              ),
              View(
                {
                  class: "todo-detail-context-count",
                  attributes: { n: "todo-detail-context-count" },
                },
                [vm$.state.contextCount, " 项"],
              ),
            ],
          ),
          View(
            {
              class: "todo-detail-context-list",
              attributes: { n: "todo-detail-context-list" },
            },
            [
              ContextCardView({
                children: [
                  MemoCardView({
                    meaning: "todo-detail-memo",
                    memo: vm$.state.memo.value,
                    query,
                    runtime: props.runtime,
                  }),
                ],
                index: "01",
                kicker: "来源记录",
                kind: "memo",
                meaning: "todo-detail-memo-context",
                runtime: props.runtime,
                title: "所在 Memo",
                titleId: "todo-detail-memo-title",
              }),
              Show({
                when: props.runtime.computed(vm$.state.comment, Boolean),
                ok() {
                  return [
                    ContextCardView({
                      children: [
                        CommentCardView({
                          highlighted: false,
                          item: vm$.state.comment.value,
                          meaning: "todo-detail-comment",
                          query,
                          runtime: props.runtime,
                        }),
                      ],
                      comments: true,
                      index: "02",
                      kicker: "讨论上下文",
                      kind: "comment",
                      meaning: "todo-detail-comment-context",
                      runtime: props.runtime,
                      title: "所在评论",
                      titleId: "todo-detail-comment-title",
                    }),
                  ];
                },
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

export function TodoWindowView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  const { Show, View } = runtime;
  return View(
    {
      class: "memo-window-shell todo-detail-page velo-drag",
      attributes: {
        "data-velo-drag": "true",
        n: "todo-detail-dialog",
      },
      onMounted() {
        document.title = "ThreadNote";
        vm$.methods.init(props.todoId);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "memo-window-titlebar todo-detail-titlebar velo-drag",
          attributes: {
            "data-velo-drag": "true",
            n: "todo-detail-titlebar",
          },
        },
        [
          View(
            {
              class: "memo-window-native-controls",
              attributes: {
                "aria-hidden": "true",
                n: "todo-detail-native-controls",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-window-drag-region todo-detail-window-heading",
              attributes: { n: "todo-detail-window-heading" },
            },
            [
              View(
                {
                  class: "todo-detail-window-mark",
                  attributes: {
                    "aria-hidden": "true",
                    n: "todo-detail-window-mark",
                  },
                },
                [],
              ),
              View(
                {
                  class: "todo-detail-window-title",
                  attributes: {
                    id: "todo-detail-window-title",
                    n: "todo-detail-window-title",
                  },
                },
                ["代办详情"],
              ),
            ],
          ),
          View(
            {
              class: "todo-detail-titlebar-balance",
              attributes: {
                "aria-hidden": "true",
                n: "todo-detail-titlebar-balance",
              },
            },
            [],
          ),
        ],
      ),
      View(
        {
          class:
            "memo-window-body velo-no-drag comment-detail-body todo-detail-body",
          attributes: {
            "aria-labelledby": "todo-detail-window-title",
            n: "todo-detail-body",
            role: "main",
          },
        },
        [
          Show({
            when: vm$.state.loading,
            ok() {
              return [
                View(
                  {
                    class: "todo-detail-state",
                    attributes: { n: "todo-detail-loading-state", role: "status" },
                  },
                  [
                    View(
                      {
                        class: "todo-detail-state-mark",
                        attributes: {
                          "aria-hidden": "true",
                          n: "todo-detail-loading-mark",
                        },
                      },
                      [],
                    ),
                    View(
                      { attributes: { n: "todo-detail-loading-label" } },
                      ["正在加载代办..."],
                    ),
                  ],
                ),
              ];
            },
            else() {
              return [
                Show({
                  when: vm$.state.found,
                  ok() {
                    return [TodoDetailContentView({ ...props, runtime })];
                  },
                  else() {
                    return [
                      View(
                        {
                          class: "todo-detail-state is-error",
                          attributes: {
                            n: "todo-detail-error-state",
                            role: "alert",
                          },
                        },
                        [
                          View(
                            {
                              class: "todo-detail-state-mark",
                              attributes: {
                                "aria-hidden": "true",
                                n: "todo-detail-error-mark",
                              },
                            },
                            [],
                          ),
                          View(
                            { attributes: { n: "todo-detail-error-label" } },
                            [vm$.state.error],
                          ),
                        ],
                      ),
                    ];
                  },
                }),
              ];
            },
          }),
        ],
      ),
    ],
  );
}

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) return;
  const todo_id = String(
    new URLSearchParams(window.location.search).get("id") || "",
  ).trim();
  const vm$ = TodoWindowModel();
  renderTimelessView(root, TodoWindowView({ todoId: todo_id, vm$ }));
});
