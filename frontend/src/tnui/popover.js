import {
  Fragment,
  View,
  computed,
  refobj,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

export function Popover(props = {}, children = []) {
  const {
    store: provided_store,
    content = [],
    title,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Popover", provided_store);
  const presence_ = refobj(store.presence.state);
  const unlisten = store.presence.onStateChange((state) => presence_.as(state));
  return ui.PopoverPrimitive.Root(
    semantic_props(
      {
        store,
        onUnmounted() {
          unlisten?.();
          presence_.destroy?.();
          onUnmounted?.();
        },
      },
      "tn-popover-root",
      "popover-root",
    ),
    [
      ui.PopoverPrimitive.Trigger(
        semantic_props({ store }, "tn-popover__trigger", "popover-trigger"),
        children,
      ),
      ui.PopoverPrimitive.Portal(
        semantic_props({ store }, "tn-popover__portal", "popover-portal"),
        [
          ui.PopoverPrimitive.Content(
            semantic_props(
              {
                ...rest,
                store,
                class: computed(presence_, (state) => [
                  state.enter ? "is-entering" : "",
                  state.exit ? "is-exiting" : "",
                ].filter(Boolean).join(" ")),
              },
              "tn-popup tn-popover",
              "popover-content",
            ),
            [
              title
                ? View(
                  semantic_props({}, "tn-popover__title", "popover-title"),
                  [title],
                )
                : null,
              Fragment({}, content),
            ].filter(Boolean),
          ),
        ],
      ),
    ],
  );
}
