import { semantic_props, ui } from "./runtime.js";

export function Separator(props = {}) {
  const { orientation = "horizontal", ...rest } = props;
  return ui.SeparatorPrimitive.Separator(
    semantic_props(
      { ...rest, class: `tn-separator--${orientation}`, orientation },
      "tn-separator",
      "separator-root",
    ),
  );
}
