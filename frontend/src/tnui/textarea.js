import {
  Runtime as Timeless,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

export function Textarea(props = {}) {
  const {
    store: provided_store,
    rootClass,
    showClear = false,
    showLoading = false,
    showCount = false,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Textarea", provided_store);
  const observation = observe_store(store);
  return ui.TextareaPrimitive.Root(
    semantic_props(
      {
        store,
        class: rootClass,
        onUnmounted: destroy_with(observation, onUnmounted),
      },
      "tn-textarea-root",
      "textarea-root",
    ),
    [
      ui.TextareaPrimitive.Textarea(
        semantic_props({ ...rest, store }, "tn-textarea", "textarea-control"),
      ),
      showClear
        ? ui.TextareaPrimitive.Clear(
          semantic_props(
            { store, attributes: { "aria-label": "清空输入" } },
            "tn-textarea__action",
            "textarea-clear-button",
          ),
          [
            Timeless.Icon({
              name: "circle-x",
              class: "tn-icon",
              size: 14,
              attributes: { n: "textarea-clear-icon" },
            }),
          ],
        )
        : null,
      showLoading
        ? ui.TextareaPrimitive.Loading(
          semantic_props({ store }, "tn-textarea__loading", "textarea-loading"),
          [
            Timeless.Icon({
              name: "loader-circle",
              class: "tn-icon",
              size: 14,
              attributes: { n: "textarea-loading-icon" },
            }),
          ],
        )
        : null,
      showCount
        ? ui.TextareaPrimitive.Count(
          semantic_props({ store }, "tn-textarea__count", "textarea-character-count"),
          [],
        )
        : null,
    ].filter(Boolean),
  );
}
