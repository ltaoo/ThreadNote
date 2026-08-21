import { Timeless } from "./timeless-icons.js";

export function LoadingView() {
  return View(
    {
      class: "route-loading dm-page dm-grid dm-place-center dm-text-muted dm-p-8",
      attributes: { n: "route-loading-state", role: "status" },
    },
    ["页面加载中…"],
  );
}

export function ErrorFallbackView(error, view_name) {
  return View(
    {
      class: "route-error dm-page dm-grid dm-place-center dm-p-8",
      attributes: { n: "route-error-state", role: "alert" },
    },
    [
      View(
        {
          class: "route-error-card",
          attributes: { n: "route-error-card" },
        },
        [
          View(
            {
              class: "route-error-card__icon",
              attributes: { "aria-hidden": "true", n: "route-error-icon" },
            },
            [
              Timeless.Icon({
                name: "circle-alert",
                size: 24,
                attributes: { n: "route-error-symbol" },
              }),
            ],
          ),
          View(
            {
              class: "route-error-card__content",
              attributes: { n: "route-error-content" },
            },
            [
              View(
                {
                  as: "strong",
                  class: "route-error-card__title",
                  attributes: { n: "route-error-title" },
                },
                ["页面加载失败"],
              ),
              View(
                {
                  as: "span",
                  class: "route-error-card__context",
                  attributes: { n: "route-error-context" },
                },
                [view_name || "未知页面"],
              ),
            ],
          ),
          View(
            {
              as: "pre",
              class: "route-error-card__detail",
              attributes: { n: "route-error-detail" },
            },
            [error.message],
          ),
        ],
      ),
    ],
  );
}
