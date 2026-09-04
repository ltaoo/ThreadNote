import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { extractTags } from "@/domain/memos.js";
import {
  collectResources,
  sortMemoReference,
} from "@/domain/memo-resources.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { HomeFilePageModel } from "./home_file.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { FileBrowserModel } from "./memo-file-browser-model.js";
import { bindFileBrowserView } from "./memo-file-browser-view.js";
import { safeImageUrl, safeUrl } from "./memo-markdown.js";
import {
  EmptyStateView,
  reactiveWhen,
} from "./home_view_shared.js";

export function createHomeFileController(options) {
  const { elements, root, state } = options;
  const model = new FileBrowserModel();
  const browser_view = bindFileBrowserView(root, model, {
    onCopy: options.onCopy,
    onOpenSource: options.onOpenSource,
    onView: options.onView,
  });

  function is_local_asset(resource) {
    const url = String((resource && resource.url) || "");
    if (/^@assets\//i.test(url)) return true;
    return /^(data:|local:\/\/|blob:)/i.test(url);
  }

  function visible_resources() {
    const query = state.query.toLowerCase();
    return collectResources(options.scopedMemoDocuments())
      .filter(function (resource) {
        if (
          state.activeTag &&
          !extractTags(resource.memo.content).includes(state.activeTag)
        ) {
          return false;
        }
        if (!query) return true;
        return `${resource.label} ${resource.url} ${resource.sourceText} ${resource.memo.content} ${resource.memo.visibility} ${resource.memo.alias || ""} ${resource.type}`
          .toLowerCase()
          .includes(query);
      })
      .sort(function (left, right) {
        return sortMemoReference(left, right, state.sortDesc);
      });
  }

  function render_files() {
    options.beforeRender();
    const resources = visible_resources().filter(is_local_asset);
    const items = model.setResources(resources);
    renderTimelessView(
      elements.memoList,
      FileGridView({
        items: items.map(function (item) {
          let preview_src = "";
          if (item.kind === "image") preview_src = safeImageUrl(item.url);
          return {
            ...item,
            href: safeUrl(item.url),
            previewSrc: preview_src,
          };
        }),
      }),
    );
    browser_view.sync();
  }

  return {
    destroy: browser_view.destroy,
    isLocalAsset: is_local_asset,
    renderFiles: render_files,
    visibleResources: visible_resources,
  };
}

export function HomeFileContentView(props) {
  return FileGridView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeFilePageView(props) {
  const vm$ = HomeFilePageModel(props);
  return View(
    {
      class: "page home-file-page w-full h-full",
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
        meaning: "home-file-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-file-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-file-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function FileGridView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Img, View } = runtime;
  if (!props.items?.length) {
    return EmptyStateView({
      message: "没有匹配的文件",
      meaning: "finder-file-empty-state",
      runtime,
    });
  }
  return View(
    {
      class: "memo-file-grid",
      attributes: {
        "aria-label": "文件图标视图",
        "data-file-browser-grid": "true",
        n: "finder-file-grid",
        role: "grid",
      },
    },
    [
      For({
        each: props.items,
        render(item) {
          const preview_title_ = computed(
            reactiveWhen(item.previewSrc),
            function (has_preview) {
              if (has_preview) return item.name;
              return undefined;
            },
          );
          return Button(
            {
              class: "memo-finder-file",
              attributes: {
                "aria-label": item.name + "，" + item.kindLabel + "，右键查看",
                "aria-selected": "false",
                "data-file-badge": item.badge,
                "data-file-browser-id": item.id,
                "data-file-browser-item": "true",
                "data-file-href": item.href,
                "data-file-kind": item.kind,
                "data-file-url": item.url,
                "data-image-preview-title": preview_title_,
                "data-preview-src": item.previewSrc || undefined,
                n: "finder-file-item",
                role: "gridcell",
                title: item.name + "（右键查看）",
                type: "button",
              },
            },
            [
              Show({
                when: reactiveWhen(item.previewSrc),
                ok() {
                  return View(
                    {
                      as: "span",
                      class: "memo-finder-file-icon is-thumbnail",
                      attributes: {
                        "aria-hidden": "true",
                        n: "finder-file-thumbnail-frame",
                      },
                    },
                    [
                      Img({
                        class: "memo-finder-file-thumbnail",
                        attributes: {
                          alt: "",
                          loading: "lazy",
                          n: "finder-file-thumbnail",
                          src: item.previewSrc,
                        },
                      }),
                    ],
                  );
                },
                else() {
                  return View(
                    {
                      as: "span",
                      class: "memo-finder-file-icon",
                      attributes: {
                        "aria-hidden": "true",
                        n: "finder-file-icon",
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "file",
                        size: 32,
                        attributes: { n: "finder-file-symbol" },
                      }),
                      View(
                        {
                          as: "small",
                          class: "memo-finder-file-badge",
                          attributes: { n: "finder-file-type-label" },
                        },
                        [item.badge],
                      ),
                    ],
                  );
                },
              }),
              View(
                {
                  as: "span",
                  class: "memo-finder-file-name",
                  attributes: { n: "finder-file-name" },
                },
                [item.name],
              ),
            ],
          );
        },
      }),
    ],
  );
}


// __HOME_FILE_VIEWS__
