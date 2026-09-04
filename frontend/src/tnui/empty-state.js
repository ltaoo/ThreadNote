import { View, semantic_props } from "./runtime.js";

export function EmptyState(props = {}, children = []) {
  const { icon, title, description, ...rest } = props;
  return View(
    semantic_props(rest, "tn-empty-state", "empty-state-root"),
    [
      icon
        ? View(
          semantic_props({}, "tn-empty-state__icon", "empty-state-icon"),
          [icon],
        )
        : null,
      title
        ? View(
          semantic_props({ as: "h3" }, "tn-empty-state__title", "empty-state-title"),
          [title],
        )
        : null,
      description
        ? View(
          semantic_props(
            { as: "p" },
            "tn-empty-state__description",
            "empty-state-description",
          ),
          [description],
        )
        : null,
      children.length
        ? View(
          semantic_props({}, "tn-empty-state__actions", "empty-state-actions"),
          children,
        )
        : null,
    ].filter(Boolean),
  );
}
