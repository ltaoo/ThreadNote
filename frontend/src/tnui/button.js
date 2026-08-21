import {
  Runtime as Timeless,
  computed,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
} from "./runtime.js";

const BUTTON_VARIANTS = new Set([
  "default",
  "primary",
  "secondary",
  "outline",
  "ghost",
  "danger",
  "destructive",
  "link",
]);
const BUTTON_SIZES = new Set(["xs", "sm", "md", "lg", "icon", "icon-sm"]);

function button_state_class(state) {
  const variant = BUTTON_VARIANTS.has(state.variant) ? state.variant : "default";
  const size = BUTTON_SIZES.has(state.size) ? state.size : "md";
  return [
    `tn-button--${variant === "destructive" ? "danger" : variant}`,
    `tn-button--${size}`,
    state.loading ? "is-loading" : "",
    state.disabled ? "is-disabled" : "",
  ].filter(Boolean).join(" ");
}

export function Button(props = {}, children = []) {
  const {
    store: provided_store,
    prefix,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Button", provided_store);
  const observation = observe_store(store);
  return ui.ButtonPrimitive.Root(
    semantic_props(
      {
        ...rest,
        store,
        class: computed(observation.state_, button_state_class),
        onUnmounted: destroy_with(observation, onUnmounted),
      },
      "tn-button",
      "button-root",
    ),
    [
      ui.ButtonPrimitive.Loading(
        semantic_props({ store }, "tn-button__spinner", "button-loading"),
        [
          Timeless.Icon({
            name: "loader-circle",
            class: "tn-icon",
            size: 16,
            attributes: { n: "button-loading-icon" },
          }),
        ],
      ),
      prefix
        ? ui.ButtonPrimitive.Prefix(
          semantic_props({}, "tn-button__prefix", "button-prefix"),
          Array.isArray(prefix) ? prefix : [prefix],
        )
        : null,
      ui.ButtonPrimitive.Content(
        semantic_props({}, "tn-button__content", "button-content"),
        children,
      ),
    ].filter(Boolean),
  );
}

export function IconButton(props = {}, children = []) {
  return Button(
    {
      ...props,
      class: ["tn-icon-button", props.class].filter(Boolean).join(" "),
    },
    children,
  );
}
