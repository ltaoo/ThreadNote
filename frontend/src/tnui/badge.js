import { semantic_props, ui } from "./runtime.js";

export function Badge(props = {}, children = []) {
  const { variant = "default", ...rest } = props;
  return ui.BadgePrimitive.Badge(
    semantic_props(
      { ...rest, class: `tn-badge--${variant}`, variant },
      "tn-badge",
      "badge-root",
    ),
    children,
  );
}
