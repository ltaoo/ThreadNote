import { View, semantic_props } from "./runtime.js";

export function Spinner(props = {}) {
  const { size = "md", ...rest } = props;
  return View(
    semantic_props(
      {
        ...rest,
        class: `tn-spinner--${size}`,
        attributes: { "aria-label": "加载中", role: "status" },
      },
      "tn-spinner",
      "spinner-root",
    ),
    [],
  );
}
