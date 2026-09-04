import { semantic_props, ui } from "./runtime.js";

export function Progress(props = {}) {
  const { store, value, max, ...rest } = props;
  return ui.ProgressPrimitive.Root(
    semantic_props({ ...rest, store, value, max }, "tn-progress", "progress-root"),
    [
      ui.ProgressPrimitive.Indicator(
        semantic_props(
          { store, value, max },
          "tn-progress__indicator",
          "progress-indicator",
        ),
      ),
    ],
  );
}
