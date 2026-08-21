import {
  Runtime as Timeless,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

export function Input(props = {}) {
  const {
    store: provided_store,
    rootClass,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Input", provided_store);
  const observation = observe_store(store);
  return ui.InputPrimitive.Root(
    semantic_props(
      {
        store,
        class: rootClass,
        onUnmounted: destroy_with(observation, onUnmounted),
      },
      "tn-input-root",
      "input-root",
    ),
    [
      ui.InputPrimitive.Input(
        semantic_props({ ...rest, store }, "tn-input", "input-control"),
      ),
      ui.InputPrimitive.Clear(
        semantic_props(
          {
            store,
            attributes: { "aria-label": "清空输入" },
          },
          "tn-input__action",
          "input-clear-button",
        ),
        [
          Timeless.Icon({
            name: "circle-x",
            class: "tn-icon",
            size: 14,
            attributes: { n: "input-clear-icon" },
          }),
        ],
      ),
      ui.InputPrimitive.Loading(
        semantic_props({ store }, "tn-input__loading", "input-loading"),
        [
          Timeless.Icon({
            name: "loader-circle",
            class: "tn-icon",
            size: 14,
            attributes: { n: "input-loading-icon" },
          }),
        ],
      ),
    ],
  );
}
