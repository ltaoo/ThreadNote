import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { collectCodeBlocks } from "@/domain/memo-resources.js";
import { extractTags } from "@/domain/memos.js";
import { sortMemoReference } from "@/domain/memo-resources.js";
import { CodeBlocksModel } from "@/code-blocks-model.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { HomeCodeblockPageModel } from "./home_codeblock.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { formatRelativeDate } from "./memo-date.js";
import { closestElement, copyText } from "./memo-utils.js";
import {
  EmptyStateView,
  iconActionButton,
  reactiveWhen,
} from "./home_view_shared.js";

export function createHomeCodeblockController(options) {
  const { elements, state } = options;
  const model = new CodeBlocksModel();

  function matches_search_query(value, query) {
    const haystack = String(value || "").toLowerCase();
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return true;
    if (haystack.includes(needle)) return true;
    const terms = needle.split(/\s+/).filter(Boolean);
    return terms.length > 0 && terms.every(function (term) {
      return haystack.includes(term);
    });
  }

  function search_text(block) {
    let aliases = "";
    if (Array.isArray(block.aliases)) aliases = block.aliases.join(" ");
    return [
      block.label,
      block.title,
      block.language,
      aliases,
      block.code,
      block.sourceText,
      block.memo.content,
      block.memo.visibility,
      block.memo.alias || "",
      options.projectLabel(block.memo.projectId),
    ].join(" ");
  }

  function sort_blocks(left, right) {
    if (left.marked !== right.marked) {
      if (left.marked) return -1;
      return 1;
    }
    return sortMemoReference(left, right, state.sortDesc);
  }

  function visible_blocks() {
    const query = state.query.toLowerCase();
    return collectCodeBlocks(options.scopedMemoDocuments())
      .filter(function (block) {
        if (
          state.activeTag &&
          !extractTags(block.memo.content).includes(state.activeTag)
        ) {
          return false;
        }
        if (!query) return true;
        return matches_search_query(search_text(block), query);
      })
      .sort(sort_blocks);
  }

  function render_collection() {
    const all_blocks = visible_blocks();
    const page = model.select(all_blocks);
    renderTimelessView(
      elements.memoList,
      CodeBlocksView({
        blocks: page.items.map(function (block) {
          let line_range = String(block.lineIndex + 1);
          if (block.endLineIndex > block.lineIndex) {
            line_range = block.lineIndex + 1 + "-" + (block.endLineIndex + 1);
          }
          let aliases = [];
          if (Array.isArray(block.aliases)) aliases = block.aliases;
          let meta = "第 " + line_range + " 行";
          if (block.language) meta += " / " + block.language;
          if (aliases.length) meta += " / " + aliases.join(" ");
          return {
            code: block.code || "",
            id: block.id,
            label: block.label || "代码片段",
            marked: Boolean(block.marked),
            memoId: block.memoId,
            meta,
            sourceMeta:
              formatRelativeDate(block.memo.createdAt) +
              " / " +
              options.projectLabel(block.memo.projectId),
          };
        }),
        hasMore: page.hasMore,
        hidden: !model.state.showAll && all_blocks.length > 0,
      }),
    );
  }

  function render_codeblocks() {
    options.beforeRender();
    model.resetPagination();
    render_collection();
  }

  function append_page() {
    const next_page = model.loadNext(visible_blocks());
    if (next_page.items.length === 0) return;
    render_collection();
  }

  function copy_codeblock(action) {
    copyCodeBlockFromAction(
      action,
      options.scopedMemoDocuments(),
      options.showToast,
    );
  }

  return {
    appendCodeBlocksPage: append_page,
    copyCodeBlock: copy_codeblock,
    model,
    renderCodeBlocks: render_codeblocks,
    renderCodeBlocksCollection: render_collection,
    visibleCodeBlocks: visible_blocks,
  };
}

export function HomeCodeblockContentView(props) {
  return CodeBlocksView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeCodeblockPageView(props) {
  const vm$ = HomeCodeblockPageModel(props);
  return View(
    {
      class: "page home-codeblock-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-codeblock-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-codeblock-main" },
        },
        [
          Checkbox({
            class: "memo-code-blocks-show-all",
            attributes: {
              "aria-label": "查看全部代码块",
              "data-code-blocks-show-all": "true",
              n: "home-codeblock-show-all",
            },
            checked: vm$.ui.codeBlocksShowAllChecked,
          }),
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: {
                "data-memo-list": "true",
                n: "home-codeblock-content",
              },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function CodeBlocksView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  if (!props.blocks?.length) {
    let message = "没有匹配的代码片段";
    if (props.hidden) message = "当前筛选隐藏了未标记代码块";
    return EmptyStateView({
      message,
      meaning: "memo-code-empty",
      runtime,
    });
  }
  return runtime.Fragment({}, [
    For({
      each: props.blocks,
      render(block) {
        const card_class_ = computed(
          reactiveWhen(block.marked),
          function (marked) {
            if (marked) return "memo-resource-card is-code is-snippet";
            return "memo-resource-card is-code is-unmarked";
          },
        );
        return View(
          {
            as: "article",
            class: card_class_,
            attributes: {
              "data-code-block-id": block.id,
              "data-memo-id": block.memoId,
              n: "code-snippet-card",
            },
          },
          [
            View(
              {
                class: "memo-code-block-head",
                attributes: { n: "code-snippet-header" },
              },
              [
                View(
                  {
                    as: "span",
                    class: "memo-resource-icon",
                    attributes: { n: "code-snippet-icon" },
                  },
                  [
                    Timeless.Icon({
                      name: "braces",
                      attributes: { n: "code-snippet-symbol" },
                    }),
                  ],
                ),
                View(
                  {
                    as: "span",
                    class: "memo-resource-body",
                    attributes: { n: "code-snippet-summary" },
                  },
                  [
                    View(
                      {
                        as: "span",
                        class: "memo-resource-title",
                        attributes: { n: "code-snippet-title" },
                      },
                      [
                        block.label,
                        View(
                          {
                            as: "span",
                            class: "memo-code-block-badge",
                            attributes: { n: "code-snippet-marker" },
                          },
                          [
                            Show({
                              when: reactiveWhen(block.marked),
                              ok() {
                                return "已标记";
                              },
                              else() {
                                return "未标记";
                              },
                            }),
                          ],
                        ),
                      ],
                    ),
                    View(
                      {
                        as: "span",
                        class: "memo-resource-url",
                        attributes: { n: "code-snippet-metadata" },
                      },
                      [block.meta],
                    ),
                  ],
                ),
                iconActionButton(runtime, {
                  action: "copyCodeBlock",
                  icon: "copy",
                  label: "复制代码",
                  meaning: "code-snippet-copy",
                }),
              ],
            ),
            View(
              {
                as: "pre",
                class: "memo-code-block-preview",
                attributes: { n: "code-snippet-preview" },
              },
              [
                View(
                  {
                    as: "code",
                    attributes: {
                      "data-code-block-code": "true",
                      n: "code-snippet-content",
                    },
                  },
                  [block.code || "空代码块"],
                ),
              ],
            ),
            View(
              {
                class: "memo-resource-source",
                attributes: { n: "code-snippet-source" },
              },
              [
                Button(
                  {
                    class: "memo-source-reference",
                    attributes: {
                      "data-action": "openSourceMemo",
                      n: "code-snippet-open-source",
                      type: "button",
                    },
                  },
                  ["来源 Memo"],
                ),
                View(
                  {
                    class: "memo-todo-meta",
                    attributes: { n: "code-snippet-source-metadata" },
                  },
                  [block.sourceMeta],
                ),
              ],
            ),
          ],
        );
      },
    }),
    Show({
      when: reactiveWhen(props.hasMore),
      ok() {
        return View(
          {
            class: "memo-feed-load-more",
            attributes: { n: "code-snippet-scroll-loader" },
          },
          ["继续向下滚动加载"],
        );
      },
    }),
  ]);
}


export function copyCodeBlockFromAction(action, memos, notify) {
  const blockNode =
    closestElement(action, "[data-code-block-id]") ||
    closestElement(action, ".memo-fenced-code-block");
  let block_id = "";
  if (blockNode && blockNode.dataset) block_id = blockNode.dataset.codeBlockId;
  let memo_list = [];
  if (Array.isArray(memos)) memo_list = memos;
  let block = null;
  if (block_id) {
    block = collectCodeBlocks(memo_list).find((item) => item.id === block_id);
  }
  let code = codeBlockTextFromNode(blockNode);
  if (block) code = block.code;
  if (code === null) return;
  copyText(code).then(
    () => notify("已复制代码片段"),
    () => notify("复制失败"),
  );
}


export function toggleCodeCollapse(action) {
  const block = closestElement(action, ".memo-fenced-code-block");
  if (!block) return;
  const collapsed = block.classList.toggle("memo-fenced-code-collapsed");
  const btn = block.querySelector(".memo-code-collapse-button");
  if (btn) {
    let label = "收起代码";
    if (collapsed) label = "展开代码";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
}


function codeBlockTextFromNode(blockNode) {
  if (!blockNode || typeof blockNode.querySelector !== "function") return null;
  const codeNode = blockNode.querySelector("[data-code-block-code]");
  if (codeNode) return codeNode.textContent || "";
  const codeNodes = blockNode.querySelectorAll("pre code");
  if (codeNodes.length === 0) return null;
  return Array.from(codeNodes)
    .map(function (node) {
      return node.textContent || "";
    })
    .join("\n");
}


// __HOME_CODEBLOCK_VIEWS__
