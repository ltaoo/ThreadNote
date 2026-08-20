import { RouterSubViews } from "@/components/sub-views.js";

export function HomeLayoutView(props) {
  /** @type {Timeless.kit.RouteViewCore} */
  const view = props.view;
  const curSubView = ref(view.curView);
  view.onCurViewChange((view) => {
    curSubView.value = view;
  });

  return Flex(
    {
      class: "layout_home w-full h-full",
      dataset: {
        name: props.view.name,
        pathname: props.view.pathname,
      },
    },
    [
      RouterSubViews({
        class: "absolute inset-0 right-0 h-full",
        view: view,
        app: props.app,
        history: props.history,
        views: props.views,
        storage: props.storage,
        client: props.client,
      }),
    ],
  );
}
