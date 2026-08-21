import { TimelessPrimitive } from "@/timeless-icons.js";
import { callNativeAPI } from "@/domain/native.js";
import { extractTags } from "@/domain/memos.js";
import {
  collectResources,
  sortMemoReference,
} from "@/domain/memo-resources.js";
import { errorMessage } from "@/domain/memo-repository.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";

import { HomeImagePageModel } from "./home_image.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import {
  compactFileURL,
  safeImageUrl,
} from "./memo-markdown.js";
import { closestElement } from "./memo-utils.js";
import {
  appendTimelessHost,
  EmptyStateView,
  memoIcon,
} from "./home_view_shared.js";

export function ImageContextMenuView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;

  function option(action, icon_name, label) {
    return Button(
      {
        class: "tn-menu__item memo-image-context-option",
        attributes: {
          "data-image-context-action": action,
          n: "memo-image-context-" + action,
          role: "menuitem",
          type: "button",
        },
      },
      [
        memoIcon(icon_name, "memo-image-context-" + action + "-icon"),
        View(
          {
            as: "span",
            attributes: { n: "memo-image-context-" + action + "-label" },
          },
          [label],
        ),
      ],
    );
  }

  return runtime.Fragment({}, [
    option("copy", "copy", "复制图片"),
    option("preview", "image", "预览图片"),
  ]);
}

export function createHomeImageController(options) {
  const { elements, state } = options;

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

  function render_images() {
    options.beforeRender();
    const images = visible_resources().filter(function (resource) {
      return resource.type === "image" && is_local_asset(resource);
    });
    renderTimelessView(
      elements.memoList,
      ImageGridView({
        images: images
          .map(function (resource) {
            return {
              label: resource.label || compactFileURL(resource.url),
              memoId: resource.memoId,
              source: compactFileURL(resource.url),
              src: safeImageUrl(resource.url),
            };
          })
          .filter(function (item) {
            return item.src;
          }),
      }),
    );
  }

  return { renderImages: render_images };
}

export function HomeImageContentView(props) {
  return ImageGridView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeImagePageView(props) {
  const vm$ = HomeImagePageModel(props);
  return View(
    {
      class: "page home-image-page w-full h-full",
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
        meaning: "home-image-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-image-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-image-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function ImageGridView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { For, Img, View } = runtime;
  if (!props.images?.length) {
    return EmptyStateView({
      message: "当前没有图片",
      meaning: "memo-images-empty",
      runtime,
    });
  }
  return View(
    { class: "memo-image-grid", attributes: { n: "memo-image-grid" } },
    [
      For({
        each: props.images,
        render(item) {
          return View(
            {
              as: "article",
              class: "memo-image-card",
              attributes: {
                "data-image-preview-src": item.src,
                "data-image-preview-title": item.label,
                "data-memo-id": item.memoId,
                n: "memo-image-card",
              },
            },
            [
              Img({
                attributes: {
                  alt: item.label || "image",
                  loading: "lazy",
                  n: "memo-image-card-image",
                  src: item.src,
                },
              }),
              View(
                {
                  class: "memo-image-card-info",
                  attributes: { n: "memo-image-card-info" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-image-card-name",
                      attributes: { n: "memo-image-card-name" },
                    },
                    [item.label],
                  ),
                  View(
                    {
                      as: "span",
                      class: "memo-image-card-source",
                      attributes: { n: "memo-image-card-source" },
                    },
                    [item.source],
                  ),
                ],
              ),
            ],
          );
        },
      }),
    ],
  );
}


export function bindMemoImageContextMenu(root, options = {}) {
  let menu = null;
  let imageTarget = null;

  function handleContextMenu(event) {
    const target = memoImageContextTarget(event.target);
    if (!target || !root.contains(target)) return;

    const payload = memoImageClipboardPayload(target);
    if (!payload || (!payload.source && !payload.url && !payload.contentBase64))
      return;

    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY, target);
  }

  function openMenu(x, y, target) {
    closeMenu();
    imageTarget = target;
    menu = appendTimelessHost(document.body, {
      class:
        "tn-popup tn-popup--menu tn-menu tn-context-menu memo-image-context-menu",
      attributes: { n: "memo-image-context-menu-host", role: "menu" },
    });
    renderTimelessView(menu, ImageContextMenuView());
    menu.addEventListener("click", handleMenuClick);
    positionMenu(menu, x, y);
    window.setTimeout(function () {
      document.addEventListener("click", handleDocumentClick, true);
      document.addEventListener("keydown", handleMenuKeydown, true);
      window.addEventListener("blur", closeMenu);
      window.addEventListener("resize", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
    }, 0);
  }

  function handleDocumentClick(event) {
    if (menu && menu.contains(event.target)) return;
    closeMenu();
  }

  function handleMenuClick(event) {
    const action = closestElement(event.target, "[data-image-context-action]");
    if (!action || !menu || !menu.contains(action)) return;

    event.preventDefault();
    event.stopPropagation();
    const target = imageTarget;
    closeMenu();
    if (!target) return;

    switch (action.dataset.imageContextAction) {
    case "copy":
      copyMemoImageToClipboard(target, options.notify);
      break;
    case "preview":
      if (typeof options.onPreview === "function") options.onPreview(target);
      break;
    default:
      break;
    }
  }

  function handleMenuKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  function closeMenu() {
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("keydown", handleMenuKeydown, true);
    window.removeEventListener("blur", closeMenu);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", closeMenu, true);
    if (menu) {
      menu.removeEventListener("click", handleMenuClick);
      unmountTimelessView(menu);
      menu.remove();
    }
    menu = null;
    imageTarget = null;
  }

  root.addEventListener("contextmenu", handleContextMenu);

  return {
    destroy() {
      root.removeEventListener("contextmenu", handleContextMenu);
      closeMenu();
    },
  };
}

function positionMenu(menu, x, y) {
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(
    margin,
    Math.min(x, window.innerWidth - rect.width - margin),
  );
  const top = Math.max(
    margin,
    Math.min(y, window.innerHeight - rect.height - margin),
  );
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function memoImageContextTarget(target) {
  const node = closestElement(target, "[data-image-preview-src]");
  return node || null;
}

function memoImageClipboardPayload(element) {
  const host = closestElement(element, "[data-image-preview-src]") || element;
  const dataset = (host && host.dataset) || {};
  let image = null;
  if (element && element.tagName === "IMG") image = element;
  else if (host && host.querySelector) image = host.querySelector("img");
  const url = String(
    dataset.imagePreviewSrc ||
      (image && (image.getAttribute("src") || image.src)) ||
      "",
  ).trim();
  const source = String(dataset.imagePreviewSource || "").trim();
  const title = String(
    dataset.imagePreviewTitle || (image && image.getAttribute("alt")) || "",
  ).trim();
  return {
    source,
    title,
    url,
  };
}

function copyMemoImageToClipboard(element, notify) {
  const payload = memoImageClipboardPayload(element);
  let report = function () {};
  if (typeof notify === "function") report = notify;
  if (!payload || (!payload.source && !payload.url)) return;

  callNativeAPI("/api/clipboard/image/write", {
    args: payload,
    method: "POST",
  }).then(
    function () {
      report("已复制图片");
    },
    function (err) {
      report("复制图片失败: " + errorMessage(err));
    },
  );
}


// __HOME_IMAGE_VIEWS__
