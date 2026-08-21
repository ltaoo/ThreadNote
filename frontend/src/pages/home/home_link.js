import { TimelessPrimitive } from "@/timeless-icons.js";
import { callNativeAPI } from "@/domain/native.js";
import { extractTags } from "@/domain/memos.js";
import {
  collectLinks,
  sortMemoReference,
} from "@/domain/memo-resources.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";

import { HomeLinkPageModel } from "./home_link.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { compactFileURL, safeUrl } from "./memo-markdown.js";
import { closestElement, copyText } from "./memo-utils.js";
import { parseHost } from "./memo-view-model.js";
import {
  appendTimelessHost,
  EmptyStateView,
  iconActionButton,
  memoIcon,
  reactiveWhen,
} from "./home_view_shared.js";

export function FetchTitleLogView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View } = runtime;
  return View(
    {
      class: "tn-overlay tn-dialog-layer is-open memo-dialog",
      attributes: {
        "data-fetch-title-log": "true",
        n: "fetch-title-log-overlay",
      },
    },
    [
      View(
        {
          class: "tn-dialog tn-dialog--md memo-dialog-panel",
          style: {
            display: "flex",
            flexDirection: "column",
            maxHeight: "80vh",
            maxWidth: "600px",
          },
          attributes: { n: "fetch-title-log-dialog" },
        },
        [
          View(
            {
              class: "memo-dialog-head",
              attributes: { n: "fetch-title-log-header" },
            },
            [
              View({ as: "h2", attributes: { n: "fetch-title-log-title" } }, [
                "获取标题日志",
              ]),
              Button(
                {
                  class:
                    "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                  attributes: {
                    "aria-label": "关闭",
                    "data-fetch-title-log-close": "true",
                    n: "fetch-title-log-close",
                    title: "关闭",
                    type: "button",
                  },
                },
                [memoIcon("x", "fetch-title-log-close-icon")],
              ),
            ],
          ),
          View(
            {
              class: "memo-dialog-body",
              style: { overflowY: "auto", padding: "16px" },
              attributes: { n: "fetch-title-log-body" },
            },
            [
              View(
                {
                  class: "memo-fetch-log",
                  attributes: { n: "fetch-title-log-rows" },
                },
                [
                  For({
                    each: props.rows || [],
                    render(row) {
                      const row_class_ = computed(
                        ref(row.ok),
                        function (ok) {
                          if (ok === true) return "memo-fetch-log-row is-ok";
                          if (ok === false) {
                            return "memo-fetch-log-row is-error";
                          }
                          return "memo-fetch-log-row";
                        },
                      );
                      const value_class_ = computed(
                        reactiveWhen(row.mono || row.path),
                        function (mono) {
                          if (mono) return "memo-fetch-log-mono";
                          return "";
                        },
                      );
                      return View(
                        {
                          class: row_class_,
                          attributes: { n: "fetch-title-log-row" },
                        },
                        [
                          View(
                            {
                              as: "span",
                              class: "memo-fetch-log-label",
                              attributes: { n: "fetch-title-log-row-label" },
                            },
                            [row.label],
                          ),
                          View(
                            {
                              as: "span",
                              class: value_class_,
                              attributes: { n: "fetch-title-log-row-value" },
                            },
                            [
                              row.value,
                              Show({
                                when: reactiveWhen(row.path),
                                ok() {
                                  return Button(
                                    {
                                      class:
                                        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                                      attributes: {
                                        [row.pathAttribute]: row.path,
                                        n: "fetch-title-log-copy-path",
                                        title: "复制路径",
                                        type: "button",
                                      },
                                    },
                                    [
                                      memoIcon(
                                        "copy",
                                        "fetch-title-log-copy-path-icon",
                                      ),
                                    ],
                                  );
                                },
                              }),
                            ],
                          ),
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

const LINK_TITLES_STORAGE_KEY = "demo-desktop:links:fetched-titles:v1";
const LINKS_PAGE_SIZE = 20;

export function createHomeLinkState() {
  return {
    domainChips: [],
    linkTitles: loadLinkTitles(),
    linksDomainFilter: "",
    linksPage: 1,
  };
}

export function createHomeLinkController(options) {
  const { elements, root, state } = options;

  function visible_links() {
    const query = state.query.toLowerCase();
    const domain_filter = state.linksDomainFilter.toLowerCase();
    return collectLinks(options.scopedMemoDocuments())
      .filter(function (link) {
        if (
          state.activeTag &&
          !extractTags(link.memo.content).includes(state.activeTag)
        ) {
          return false;
        }
        if (domain_filter) {
          const host = parseHost(link.url).host;
          if (!host.includes(domain_filter)) return false;
        }
        if (!query) return true;
        return `${link.label} ${link.url} ${link.sourceText} ${link.memo.content} ${link.memo.visibility} ${link.memo.alias || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort(function (left, right) {
        return sortMemoReference(left, right, state.sortDesc);
      });
  }

  function render_links_collection() {
    const links = visible_links();
    const paginated = links.slice(0, state.linksPage * LINKS_PAGE_SIZE);
    let input_value = state.linksDomainFilter;
    if (state.domainChips.includes(state.linksDomainFilter)) input_value = "";
    renderTimelessView(
      elements.memoList,
      LinksView({
        activeDomain: state.linksDomainFilter,
        chips: state.domainChips,
        hasMore: paginated.length < links.length,
        inputValue: input_value,
        links: paginated.map(function (link) {
          const fetched = state.linkTitles[link.url] || "";
          const host = parseHost(link.url).host;
          let favicon = "↗";
          if (host) {
            favicon = host.slice(0, 2).replace(/^./, function (char) {
              return char.toUpperCase();
            });
          }
          return {
            compactUrl: compactFileURL(link.url),
            favicon,
            fetched: Boolean(fetched),
            href: safeUrl(link.url),
            memoId: link.memoId,
            title: fetched || link.label || link.url,
            url: link.url,
          };
        }),
      }),
    );
  }

  function render_links() {
    options.beforeRender();
    state.linksPage = 1;
    render_links_collection();
    saveLinksDomainFilter(state.linksDomainFilter);
  }

  function append_links_page() {
    const links = visible_links();
    const start = (state.linksPage - 1) * LINKS_PAGE_SIZE;
    const end = state.linksPage * LINKS_PAGE_SIZE;
    if (links.slice(start, end).length === 0) return;
    render_links_collection();
  }

  function load_next_page() {
    const links = visible_links();
    const maximum_page = Math.ceil(links.length / LINKS_PAGE_SIZE);
    if (state.linksPage >= maximum_page) return false;
    state.linksPage += 1;
    append_links_page();
    return true;
  }

  function copy_link(action) {
    const link_card = closestElement(action, "[data-link-url]");
    let url = "";
    if (link_card && link_card.dataset) url = link_card.dataset.linkUrl;
    if (!url) return;
    copyText(url).then(
      function () {
        options.showToast("已复制链接");
      },
      function () {
        options.showToast("复制失败");
      },
    );
  }

  function fetch_link_title(action) {
    const link_card = closestElement(action, "[data-link-url]");
    let url = "";
    if (link_card && link_card.dataset) url = link_card.dataset.linkUrl;
    if (!url) return;
    action.disabled = true;
    action.classList.add("is-loading");
    callNativeAPI("/api/links/fetch-title", {
      args: { url },
      method: "POST",
    })
      .then(function (data) {
        let title = "";
        if (data && data.title) title = String(data.title).trim();
        if (!title) {
          render_fetch_title_log(url, data || {});
          return;
        }
        state.linkTitles[url] = title;
        saveLinkTitles(state.linkTitles);
        render_links();
        options.showToast("已获取标题");
      })
      .catch(function (error) {
        let message = "网络错误";
        if (error && error.message) message = error.message;
        render_fetch_title_log(url, { error: message, ok: false, url });
      })
      .finally(function () {
        action.disabled = false;
        action.classList.remove("is-loading");
      });
  }

  function render_fetch_title_log(url, data) {
    close_fetch_title_log();
    const host = appendTimelessHost(root, {
      attributes: {
        "data-fetch-title-log-host": "true",
        n: "fetch-title-log-host",
      },
    });
    renderTimelessView(
      host,
      FetchTitleLogView(fetch_title_log_presentation(url, data)),
    );
    host.addEventListener("click", function (event) {
      const overlay = closestElement(event.target, "[data-fetch-title-log]");
      if (overlay && event.target === overlay) close_fetch_title_log();
      const close_button = closestElement(
        event.target,
        "[data-fetch-title-log-close]",
      );
      if (close_button) close_fetch_title_log();
      const copy_button =
        closestElement(event.target, "[data-copy-html-path]") ||
        closestElement(event.target, "[data-copy-raw-path]");
      if (!copy_button) return;
      const copy_path =
        copy_button.dataset.copyHtmlPath ||
        copy_button.dataset.copyRawPath ||
        "";
      copyText(copy_path).then(
        function () {
          options.showToast("已复制文件路径");
        },
        function () {
          options.showToast("复制失败");
        },
      );
    });
  }

  function close_fetch_title_log() {
    const host = root.querySelector("[data-fetch-title-log-host]");
    if (!host) return;
    unmountTimelessView(host);
    host.remove();
  }

  function fetch_title_log_path_row(label, path, path_attribute) {
    return { label, path, pathAttribute: path_attribute, value: path };
  }

  function fetch_title_log_presentation(url, data) {
    const ok = data.ok === true;
    const status_code = data.status_code || 0;
    const content_type = data.content_type || "";
    const body_size = data.body_size || 0;
    const title = data.title || "";
    const title_found = data.title_found === true;
    const title_source = data.title_source || "";
    const error = data.error || "";
    const preview = data.html_preview || "";
    const html_path = data.html_path || "";
    const raw_path = data.raw_path || "";
    let status_value = "✗ " + (error || "请求失败");
    if (ok) status_value = "✓ 请求成功";
    const rows = [
      { label: "URL", value: url },
      { label: "状态", ok, value: status_value },
    ];
    if (status_code) {
      rows.push({
        label: "HTTP 状态码",
        ok: status_code >= 200 && status_code < 400,
        value: String(status_code),
      });
    }
    if (content_type) rows.push({ label: "Content-Type", value: content_type });
    if (body_size) {
      let size_value = body_size + " bytes";
      if (body_size >= 1024) size_value = (body_size / 1024).toFixed(1) + " KB";
      rows.push({ label: "响应大小", value: size_value });
    }
    if (ok) {
      let extract_message =
        "✗ 未找到任何标题标签 (<title>, og:title, twitter:title)";
      if (title_found) {
        extract_message = "✓ 找到标题";
        if (title_source) extract_message += " (" + title_source + ")";
      }
      rows.push({ label: "标题提取", ok: title_found, value: extract_message });
      if (title) rows.push({ label: "标题内容", value: title });
      if (preview) rows.push({ label: "HTML 预览", mono: true, value: preview });
      if (html_path) {
        rows.push(
          fetch_title_log_path_row(
            "已解析 HTML",
            html_path,
            "data-copy-html-path",
          ),
        );
      }
      if (raw_path) {
        rows.push(
          fetch_title_log_path_row(
            "原始响应数据",
            raw_path,
            "data-copy-raw-path",
          ),
        );
      }
    }
    return { rows };
  }

  function refresh_domain_filter() {
    callNativeAPI("/api/links/domain-filter", { method: "GET" }).then(
      function (data) {
        let filter = "";
        if (data && data.filter) filter = String(data.filter).trim();
        if (filter === state.linksDomainFilter) return;
        state.linksDomainFilter = filter;
        if (state.activeView === "links") render_links();
      },
      function () {},
    );
  }

  function refresh_domain_chips() {
    callNativeAPI("/api/links/domain-chips", { method: "GET" }).then(
      function (data) {
        let chips = [];
        if (data && Array.isArray(data.chips)) chips = data.chips;
        state.domainChips = chips;
        if (state.activeView === "links") render_links();
      },
      function () {},
    );
  }

  function add_domain_chip(raw) {
    if (!raw) return;
    let host = raw.trim();
    try {
      let source = host;
      if (!/^https?:\/\//i.test(source)) source = "https://" + source;
      host = new URL(source).hostname;
    } catch (_) {}
    if (!host || state.domainChips.includes(host)) return;
    state.domainChips.push(host);
    saveDomainChips(state.domainChips);
    state.linksDomainFilter = "";
    if (state.activeView === "links") render_links_collection();
    saveLinksDomainFilter(state.linksDomainFilter);
  }

  function remove_domain_chip(domain) {
    if (!domain) return;
    state.domainChips = state.domainChips.filter(function (item) {
      return item !== domain;
    });
    saveDomainChips(state.domainChips);
    if (state.linksDomainFilter === domain) state.linksDomainFilter = "";
    render_links();
  }

  return {
    addDomainChip: add_domain_chip,
    appendLinksPage: append_links_page,
    copyLink: copy_link,
    fetchLinkTitle: fetch_link_title,
    loadNextPage: load_next_page,
    refreshDomainChips: refresh_domain_chips,
    refreshLinksDomainFilter: refresh_domain_filter,
    removeLinksDomainChip: remove_domain_chip,
    renderLinks: render_links,
    renderLinksCollection: render_links_collection,
    visibleLinks: visible_links,
  };
}

export function HomeLinkContentView(props) {
  return LinksView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeLinkPageView(props) {
  const vm$ = HomeLinkPageModel(props);
  return View(
    {
      class: "page home-link-page w-full h-full",
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
        meaning: "home-link-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-link-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-link-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function LinksView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, Link, View } = runtime;
  return runtime.Fragment({}, [
    View(
      {
        class: "memo-links-domain-bar",
        attributes: { n: "memo-links-domain-bar" },
      },
      [
        View(
          {
            class: "memo-domain-input-wrap",
            attributes: { n: "memo-domain-filter-field" },
          },
          [
            Input({
              class: "memo-domain-input",
              type: "text",
              value: props.inputValue,
              placeholder: "按域名筛选...",
              attributes: {
                autocomplete: "off",
                "data-action": "filterLinksDomainInput",
                n: "memo-domain-filter-input",
                type: "text",
              },
            }),
          ],
        ),
        View(
          {
            class: "memo-domain-chips",
            attributes: { n: "memo-domain-filter-chips" },
          },
          [
            For({
              each: props.chips || [],
              render(domain) {
                const class_name_ = computed(
                  reactiveWhen(domain === props.activeDomain),
                  function (active) {
                    if (active) return "memo-domain-chip is-active";
                    return "memo-domain-chip";
                  },
                );
                return View(
                  {
                    as: "span",
                    class: class_name_,
                    attributes: { n: "memo-domain-filter-chip" },
                  },
                  [
                    Button(
                      {
                        class: "memo-domain-chip-btn",
                        attributes: {
                          "data-action": "filterLinksDomain",
                          "data-domain": domain,
                          n: "memo-domain-filter-chip-button",
                          type: "button",
                        },
                      },
                      [domain],
                    ),
                    Button(
                      {
                        class: "memo-domain-chip-remove",
                        attributes: {
                          "data-action": "removeLinksDomainChip",
                          "data-domain": domain,
                          n: "memo-domain-filter-chip-remove",
                          title: "移除此筛选域名",
                          type: "button",
                        },
                      },
                      [memoIcon("x", "memo-domain-filter-chip-remove-icon")],
                    ),
                  ],
                );
              },
            }),
            View(
              {
                as: "span",
                class: "memo-domain-chip-add",
                attributes: { n: "memo-domain-filter-add" },
              },
              [
                Input({
                  class: "memo-domain-chip-add-input",
                  type: "text",
                  placeholder: "+ 域名",
                  attributes: {
                    autocomplete: "off",
                    "data-action": "addLinksDomainChip",
                    n: "memo-domain-filter-add-input",
                    type: "text",
                  },
                }),
              ],
            ),
          ],
        ),
      ],
    ),
    Show({
      when: reactiveWhen(props.links?.length),
      ok() {
        return For({
          each: props.links,
          render(link) {
            const title_class_ = computed(
              reactiveWhen(link.fetched),
              function (fetched) {
                if (fetched) return "memo-resource-title is-fetched-title";
                return "memo-resource-title";
              },
            );
            return View(
              {
                as: "article",
                class: "memo-resource-card is-link",
                attributes: {
                  "data-link-url": link.url,
                  "data-memo-id": link.memoId,
                  n: "link-card",
                },
              },
              [
                Link(
                  {
                    class: "memo-resource-target",
                    href: link.href,
                    rel: "noreferrer",
                    target: "_blank",
                    attributes: {
                      "aria-label": "打开链接：" + link.title,
                      n: "link-card-target",
                    },
                  },
                  [
                    View(
                      {
                        as: "span",
                        class: "memo-link-favicon is-fallback",
                        attributes: {
                          "aria-hidden": "true",
                          n: "link-card-favicon",
                        },
                      },
                      [link.favicon],
                    ),
                    View(
                      {
                        as: "span",
                        class: "memo-resource-body",
                        attributes: { n: "link-card-content" },
                      },
                      [
                        View(
                          {
                            as: "span",
                            class: title_class_,
                            attributes: { n: "link-card-title" },
                          },
                          [link.title],
                        ),
                        View(
                          {
                            as: "span",
                            class: "memo-resource-url",
                            attributes: { n: "link-card-url" },
                          },
                          [link.compactUrl],
                        ),
                      ],
                    ),
                    View(
                      {
                        as: "span",
                        class: "memo-link-open-cue",
                        attributes: {
                          "aria-hidden": "true",
                          n: "link-card-open-cue",
                        },
                      },
                      [memoIcon("external-link", "link-card-open-icon")],
                    ),
                  ],
                ),
                View(
                  {
                    class: "memo-link-actions",
                    attributes: {
                      "aria-label": "链接操作",
                      n: "link-card-actions",
                      role: "group",
                    },
                  },
                  [
                    iconActionButton(runtime, {
                      action: "copyLink",
                      class:
                        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-copy-button",
                      icon: "copy",
                      label: "复制链接",
                      meaning: "link-card-copy",
                    }),
                    iconActionButton(runtime, {
                      action: "fetchLinkTitle",
                      class:
                        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-fetch-title-button",
                      icon: "refresh-cw",
                      label: "获取标题",
                      meaning: "link-card-fetch-title",
                    }),
                    iconActionButton(runtime, {
                      action: "openSourceMemo",
                      class:
                        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button memo-link-source-button",
                      icon: "eye",
                      label: "来源 memo",
                      meaning: "link-card-open-source",
                    }),
                  ],
                ),
              ],
            );
          },
        });
      },
      else() {
        return EmptyStateView({
          message: "没有匹配的链接",
          meaning: "memo-links-empty",
          runtime,
        });
      },
    }),
    Show({
      when: reactiveWhen(props.hasMore),
      ok() {
        return View(
          {
            class: "memo-feed-load-more",
            attributes: { n: "memo-links-load-more" },
          },
          ["加载更多..."],
        );
      },
    }),
  ]);
}


export function loadLinkTitles() {
  try {
    return (
      JSON.parse(localStorage.getItem(LINK_TITLES_STORAGE_KEY) || "null") || {}
    );
  } catch (_) {
    return {};
  }
}

export function saveLinkTitles(titles) {
  try {
    localStorage.setItem(LINK_TITLES_STORAGE_KEY, JSON.stringify(titles));
  } catch (_) {
    /* ignore */
  }
}

export function saveLinksDomainFilter(filter) {
  callNativeAPI("/api/links/domain-filter/save", {
    method: "POST",
    args: { filter: filter },
  }).catch(function () {
    /* ignore save errors */
  });
}

export function saveDomainChips(chips) {
  callNativeAPI("/api/links/domain-chips/save", {
    method: "POST",
    args: { chips: chips },
  }).catch(function () {
    /* ignore save errors */
  });
}


export function copyInlineLinkFromAction(action, notify) {
  const linkNode = closestElement(action, "[data-inline-link-url]");
  let url = "";
  if (linkNode && linkNode.dataset) url = linkNode.dataset.inlineLinkUrl;
  if (!url) return;
  copyText(url).then(
    () => notify("已复制链接"),
    () => notify("复制失败"),
  );
}


// __HOME_LINK_VIEWS__
