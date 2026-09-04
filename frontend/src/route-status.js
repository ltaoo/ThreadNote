import { Timeless } from "./timeless-icons.js";
import { createRouteErrorPresentation } from "./route-status.model.js";

export function renderWithErrorBoundary(render_view, view_name) {
  const boundary = Timeless?.ui?.ErrorBoundaryPrimitive?.withErrorBoundary;
  if (typeof boundary === "function") {
    return boundary(render_view, view_name, ErrorFallbackView);
  }
  try {
    return render_view();
  } catch (error) {
    return ErrorFallbackView(error, view_name);
  }
}

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
  const presentation = createRouteErrorPresentation(error, view_name);
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
                ["页面渲染失败 · " + presentation.name],
              ),
              View(
                {
                  as: "span",
                  class: "route-error-card__context",
                  attributes: { n: "route-error-context" },
                },
                [presentation.context],
              ),
            ],
          ),
          View(
            {
              as: "pre",
              class: "route-error-card__detail",
              attributes: { n: "route-error-detail" },
            },
            [presentation.message],
          ),
          presentation.stack
            ? View(
              {
                as: "details",
                class: "route-error-card__stack",
                attributes: { n: "route-error-stack" },
              },
              [
                View(
                  {
                    as: "summary",
                    attributes: { n: "route-error-stack-summary" },
                  },
                  ["查看错误堆栈"],
                ),
                View(
                  {
                    as: "pre",
                    attributes: { n: "route-error-stack-detail" },
                  },
                  [presentation.stack],
                ),
              ],
            )
            : null,
        ],
      ),
    ],
  );
}
