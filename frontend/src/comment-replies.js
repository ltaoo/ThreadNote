import { readCommentDetailPayload } from "./comment-detail-model.js";
import { CommentRepliesModel } from "./comment-replies.model.js";
import {
  TimelessPrimitive,
} from "./timeless-icons.js";
import { memoQuickSearchHighlightParts } from "./pages/home/memo-quick-search-model.js";

function dom_node(element$) {
  return element$?.$elm?.get$elm?.() || element$?.$elm || null;
}

function highlight_query(root, query, active) {
  const text = String(query || "").trim();
  if (!root || !text) return;
  const text_nodes = [];
  collect_text_nodes(root, text_nodes);
  const marks = [];
  text_nodes.forEach(function (text_node) {
    const parts = memoQuickSearchHighlightParts(text_node.textContent, text);
    if (!parts.some(function (part) { return part.matched; })) return;
    const parent = text_node.parentNode;
    if (!parent) return;
    parts.forEach(function (part) {
      if (!part.matched) {
        parent.insertBefore(document.createTextNode(part.text), text_node);
        return;
      }
      const mark = document.createElement("mark");
      mark.className = "memo-find-match";
      mark.dataset.n = "comment-query-match";
      mark.textContent = part.text;
      marks.push(mark);
      parent.insertBefore(mark, text_node);
    });
    parent.removeChild(text_node);
  });
  if (active && marks[0]) marks[0].classList.add("is-active");
}

function collect_text_nodes(node, output) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node);
    return;
  }
  if (
    node.nodeType !== Node.ELEMENT_NODE ||
    node.matches("mark, script, style, button")
  ) {
    return;
  }
  Array.from(node.childNodes).forEach(function (child) {
    collect_text_nodes(child, output);
  });
}

export function RichMarkdownView(props) {
  const { RichText, View } = props.runtime;
  let content$ = null;
  content$ = View(
    {
      class: props.class,
      attributes: { n: props.meaning },
      onMounted() {
        highlight_query(dom_node(content$), props.query, props.active);
      },
    },
    [
      RichText({
        attributes: { n: props.meaning + "-rich-text" },
        content: props.html,
      }),
    ],
  );
  return content$;
}

function ReactionBadgesView(props) {
  const { For, View } = props.runtime;
  if (!props.reactions.length) return null;
  return View(
    {
      class: "memo-reactions-badges",
      attributes: { n: props.meaning + "-reaction-list" },
    },
    [
      For({
        each: props.reactions,
        render(emoji) {
          return View(
            {
              class: "memo-reaction-badge is-active",
              attributes: { n: props.meaning + "-reaction" },
            },
            [emoji],
          );
        },
      }),
    ],
  );
}

export function CommentCardView(props) {
  const { View } = props.runtime;
  const item = props.item;
  return View(
    {
      class:
        "memo-comment memo-window-comment" +
        (props.highlighted ? " is-highlighted" : ""),
      attributes: {
        "data-comment-id": item.id,
        n: props.meaning,
        role: "article",
      },
    },
    [
      View(
        {
          class: "memo-comment-head",
          attributes: { n: props.meaning + "-header" },
        },
        [
          View(
            {
              class: "memo-avatar memo-comment-avatar",
              attributes: { "aria-hidden": "true", n: props.meaning + "-avatar" },
            },
            ["U"],
          ),
          View(
            { attributes: { n: props.meaning + "-author-details" } },
            [
              View(
                {
                  class: "memo-comment-author",
                  attributes: { n: props.meaning + "-author" },
                },
                ["You"],
              ),
              View(
                {
                  as: "time",
                  attributes: {
                    datetime: item.time,
                    n: props.meaning + "-time",
                  },
                },
                [item.relativeTime],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-window-comment-bubble",
          attributes: { n: props.meaning + "-bubble" },
        },
        [
          View(
            {
              class: "memo-window-comment-collapse is-expanded",
              attributes: { n: props.meaning + "-content-region" },
            },
            [
              RichMarkdownView({
                active: props.highlighted,
                class: "memo-content memo-comment-content",
                html: item.html,
                meaning: props.meaning + "-content",
                query: props.query,
                runtime: props.runtime,
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-comment-footer",
          attributes: { n: props.meaning + "-footer" },
        },
        [
          ReactionBadgesView({
            meaning: props.meaning,
            reactions: item.reactions,
            runtime: props.runtime,
          }),
          item.replyCount
            ? View(
                {
                  class: "memo-comment-reply-badge",
                  attributes: { n: props.meaning + "-reply-count" },
                },
                [item.replyCount + "条回复"],
              )
            : null,
        ],
      ),
    ],
  );
}

export function MemoCardView(props) {
  const { For, View } = props.runtime;
  const memo = props.memo;
  const meaning = props.meaning || "comment-detail-memo";
  return View(
    {
      class: "memo-card memo-window-card",
      attributes: {
        "data-memo-id": memo.id,
        n: meaning + "-card",
        role: "article",
      },
    },
    [
      View(
        {
          class: "memo-card-head memo-window-card-head",
          attributes: { n: meaning + "-header" },
        },
        [
          View(
            {
              class: "memo-author",
              attributes: { n: meaning + "-author" },
            },
            [
              View(
                {
                  class: "memo-avatar",
                  attributes: { "aria-hidden": "true", n: meaning + "-avatar" },
                },
                ["U"],
              ),
              View(
                { attributes: { n: meaning + "-author-details" } },
                [
                  View(
                    {
                      class: "memo-author-name",
                      attributes: { n: meaning + "-author-name" },
                    },
                    ["You"],
                  ),
                  View(
                    {
                      as: "time",
                      attributes: {
                        datetime: memo.createdAt,
                        n: meaning + "-time",
                      },
                    },
                    [memo.relativeTime],
                  ),
                  ReactionBadgesView({
                    meaning,
                    reactions: memo.reactions,
                    runtime: props.runtime,
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-card-meta memo-window-card-meta",
              attributes: { n: meaning + "-meta" },
            },
            [
              memo.pinned
                ? View(
                    {
                      class: "memo-pin-label",
                      attributes: { n: meaning + "-pinned" },
                    },
                    ["置顶"],
                  )
                : null,
              memo.backlinks
                ? View(
                    {
                      class: "memo-backlink-label",
                      attributes: { n: meaning + "-backlinks" },
                    },
                    [memo.backlinks + " 引用"],
                  )
                : null,
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-card-reading",
          attributes: { n: meaning + "-reading" },
        },
        [
          View(
            {
              class: "memo-card-reading-main",
              attributes: { n: meaning + "-reading-main" },
            },
            [
              RichMarkdownView({
                active: false,
                class: "memo-content",
                html: memo.html,
                meaning: meaning + "-content",
                query: props.query,
                runtime: props.runtime,
              }),
              View(
                {
                  class: "memo-card-summary",
                  attributes: { n: meaning + "-summary" },
                },
                [
                  View(
                    {
                      class: "memo-card-stats",
                      attributes: { n: meaning + "-stat-list" },
                    },
                    [
                      For({
                        each: memo.stats,
                        render(stat) {
                          return View(
                            {
                              class: "memo-card-stat",
                              attributes: { n: meaning + "-stat" },
                            },
                            [stat.label],
                          );
                        },
                      }),
                    ],
                  ),
                  memo.tags.length
                    ? View(
                        {
                          class: "memo-card-tags",
                          attributes: { n: meaning + "-tag-list" },
                        },
                        [
                          For({
                            each: memo.tags,
                            render(tag) {
                              return View(
                                {
                                  attributes: { n: meaning + "-tag" },
                                },
                                ["#" + tag],
                              );
                            },
                          }),
                        ],
                      )
                    : null,
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

function SectionView(props) {
  const { View } = props.runtime;
  return View(
    {
      class:
        "comment-detail-section" +
        (props.class ? " " + props.class : ""),
      attributes: {
        "aria-label": props.title,
        n: props.meaning,
        role: "region",
      },
    },
    [
      View(
        {
          class: "comment-detail-section-title",
          attributes: { n: props.meaning + "-title" },
        },
        [
          props.title,
          props.count == null
            ? null
            : View(
                {
                  as: "strong",
                  attributes: { n: props.meaning + "-count" },
                },
                [props.count],
              ),
        ],
      ),
      View(
        {
          class:
            "comment-detail-section-body" +
            (props.comments ? " memo-comment-list" : ""),
          attributes: { n: props.meaning + "-body" },
        },
        props.children,
      ),
    ],
  );
}

function CommentDetailContentView(props) {
  const { For, Show, View } = props.runtime;
  const query = props.vm$.state.query.value;
  return View(
    {
      class: "comment-detail-content",
      attributes: { n: "comment-detail-content" },
    },
    [
      SectionView({
        children: [
          CommentCardView({
            highlighted: true,
            item: props.vm$.state.comment.value,
            meaning: "comment-detail-primary-comment",
            query,
            runtime: props.runtime,
          }),
        ],
        class: "comment-detail-primary",
        comments: true,
        meaning: "comment-detail-primary-section",
        runtime: props.runtime,
        title: "评论内容",
      }),
      SectionView({
        children: [
          MemoCardView({
            memo: props.vm$.state.memo.value,
            query,
            runtime: props.runtime,
          }),
        ],
        class: "comment-detail-memo",
        meaning: "comment-detail-memo-section",
        runtime: props.runtime,
        title: "所在 Memo",
      }),
      Show({
        when: props.runtime.computed(props.vm$.state.replyTo, Boolean),
        ok() {
          return [
            SectionView({
              children: [
                CommentCardView({
                  highlighted: false,
                  item: props.vm$.state.replyTo.value,
                  meaning: "comment-detail-parent-comment",
                  query,
                  runtime: props.runtime,
                }),
              ],
              comments: true,
              meaning: "comment-detail-parent-section",
              runtime: props.runtime,
              title: "回复的评论",
            }),
          ];
        },
      }),
      Show({
        when: props.runtime.computed(props.vm$.state.replies, function (items) {
          return items.length > 0;
        }),
        ok() {
          return [
            SectionView({
              children: [
                For({
                  each: props.vm$.state.replies,
                  render(item) {
                    return CommentCardView({
                      highlighted: false,
                      item,
                      meaning: "comment-detail-reply-comment",
                      query,
                      runtime: props.runtime,
                    });
                  },
                }),
              ],
              comments: true,
              count: props.vm$.state.replies.value.length,
              meaning: "comment-detail-replies-section",
              runtime: props.runtime,
              title: "收到的回复",
            }),
          ];
        },
      }),
    ],
  );
}

export function CommentRepliesView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.For || !runtime?.RichText || !runtime?.Show || !runtime?.View) {
    throw new Error("CommentRepliesView requires the Timeless DOM runtime");
  }
  const { Show, View } = runtime;
  return View(
    {
      class: "memo-window-shell comment-detail-page velo-drag",
      attributes: { n: "comment-detail-page" },
      onMounted() {
        props.vm$.methods.load(props.commentId);
      },
      onUnmounted() {
        props.vm$.destroy();
      },
    },
    [
      View(
        {
          class: "memo-window-titlebar velo-drag",
          attributes: { n: "comment-detail-titlebar", role: "banner" },
        },
        [
          View(
            {
              class: "memo-window-native-controls",
              attributes: { "aria-hidden": "true", n: "comment-detail-native-controls" },
            },
            [],
          ),
          View(
            {
              class: "memo-window-drag-region",
              attributes: { "aria-hidden": "true", n: "comment-detail-drag-region" },
            },
            [],
          ),
          View(
            {
              class: "comment-detail-window-title",
              attributes: { n: "comment-detail-window-title" },
            },
            ["评论详情"],
          ),
        ],
      ),
      View(
        {
          class: "memo-window-body velo-no-drag comment-detail-body",
          attributes: { n: "comment-detail-body", role: "main" },
        },
        [
          Show({
            when: props.vm$.state.loading,
            ok() {
              return [
                View(
                  {
                    class: "memo-window-empty",
                    attributes: { n: "comment-detail-loading", role: "status" },
                  },
                  ["正在加载评论..."],
                ),
              ];
            },
            else() {
              return [
                Show({
                  when: props.vm$.state.found,
                  ok() {
                    return [CommentDetailContentView({ ...props, runtime })];
                  },
                  else() {
                    return [
                      View(
                        {
                          class: "memo-window-empty",
                          attributes: { n: "comment-detail-error", role: "status" },
                        },
                        [props.vm$.state.error],
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

function mount_comment_replies() {
  const root = document.querySelector("#root");
  if (!root) return;
  const comment_id = String(
    new URLSearchParams(window.location.search).get("id") || "",
  ).trim();
  const services =
    typeof globalThis.invoke === "function"
      ? { request: globalThis.invoke }
      : {
          readLocal(id) {
            return readCommentDetailPayload(globalThis.localStorage, id);
          },
        };
  const vm$ = CommentRepliesModel({ runtime: TimelessPrimitive, services });
  const view = CommentRepliesView({
    commentId: comment_id,
    runtime: TimelessPrimitive,
    vm$,
  });
  TimelessPrimitive.DOM.render(view, root);
  document.title = "ThreadNote";

  let remove_message_listener = null;
  if (typeof globalThis.onGoMessage === "function") {
    remove_message_listener = globalThis.onGoMessage(function (payload) {
      if (
        !payload ||
        payload.type !== "comment_detail_updated" ||
        payload.commentId !== comment_id
      ) {
        return;
      }
      vm$.methods.load(comment_id);
    });
  }
  globalThis.addEventListener(
    "pagehide",
    function cleanup_comment_replies() {
      if (typeof remove_message_listener === "function") {
        remove_message_listener();
      }
      view.beforeUnmounted?.();
      view.destroy?.();
    },
    { once: true },
  );
}

document.addEventListener("DOMContentLoaded", function () {
  if (!/\/comment-replies\.html$/.test(globalThis.location?.pathname || "")) {
    return;
  }
  mount_comment_replies();
});
