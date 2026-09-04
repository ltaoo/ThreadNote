import { semantic_props, ui } from "./runtime.js";

export function Avatar(props = {}, children = []) {
  const {
    src,
    alt = "",
    fallback,
    size = "md",
    ...rest
  } = props;
  return ui.AvatarPrimitive.Root(
    semantic_props(
      { ...rest, class: `tn-avatar--${size}`, size },
      "tn-avatar",
      "avatar-root",
    ),
    [
      ui.AvatarPrimitive.Image(
        semantic_props({ src, alt }, "tn-avatar__image", "avatar-image"),
      ),
      ui.AvatarPrimitive.Fallback(
        semantic_props({}, "tn-avatar__fallback", "avatar-fallback"),
        children.length ? children : [fallback || alt.slice(0, 1) || "?"],
      ),
    ],
  );
}
