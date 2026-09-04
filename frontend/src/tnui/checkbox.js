import {
  Runtime as Timeless,
  computed,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

export function Checkbox(props = {}) {
  const { store: provided_store, id, onUnmounted, ...rest } = props;
  const store = require_store("Checkbox", provided_store);
  const observation = observe_store(store);
  return ui.CheckboxPrimitive.Root(
    semantic_props(
      { store, onUnmounted: destroy_with(observation, onUnmounted) },
      "tn-checkbox-root",
      "checkbox-root",
    ),
    [
      ui.CheckboxPrimitive.Input(
        semantic_props({ store, id }, "tn-checkbox__input", "checkbox-input"),
      ),
      ui.CheckboxPrimitive.Box(
        semantic_props(
          {
            ...rest,
            store,
            class: computed(observation.state_, (state) => [
              state.checked ? "is-checked" : "",
              state.disabled ? "is-disabled" : "",
            ].filter(Boolean).join(" ")),
          },
          "tn-checkbox",
          "checkbox-box",
        ),
        [
          Timeless.Icon({
            name: "check",
            size: 14,
            class: computed(observation.state_, (state) =>
              state.checked ? "tn-icon" : "tn-icon is-hidden",
            ),
            attributes: { n: "checkbox-check-icon" },
          }),
        ],
      ),
    ],
  );
}
