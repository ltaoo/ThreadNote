import {
  ErrorFallbackView,
  LoadingView,
  renderWithErrorBoundary,
} from "@/route-status.js";

export function HomeLayoutView(props) {
  return renderWithErrorBoundary(
    function () {
      return Flex(
        {
          class: "layout_home w-full h-full",
          dataset: {
            name: props.view.name,
            pathname: props.view.pathname,
          },
          attributes: { n: "home-layout" },
        },
        [
          Timeless.ui.KeepAliveSubViews({
            class: "absolute inset-0 right-0 h-full",
            view: props.view,
            app: props.app,
            history: props.history,
            views: props.views,
            storage: props.storage,
            client: props.client,
            placeholder: [LoadingView()],
            ErrorFallback: ErrorFallbackView,
          }),
        ],
      );
    },
    "home-layout",
  );
}
