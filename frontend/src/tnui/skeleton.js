import { semantic_props, ui } from "./runtime.js";

export function Skeleton(props = {}) {
  return ui.SkeletonPrimitive.Skeleton(
    semantic_props(props, "tn-skeleton", "skeleton-root"),
  );
}
