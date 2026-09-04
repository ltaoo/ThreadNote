import { Runtime, semantic_props } from "./runtime.js";

export function Label(props = {}, children = []) {
  return Runtime.Label(
    semantic_props(props, "tn-label", "label-root"),
    children,
  );
}
