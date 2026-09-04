import { require_store, semantic_props, ui } from "./runtime.js";

export function Switch(props = {}) {
  const { store: provided_store, id, ...rest } = props;
  const store = require_store("Switch", provided_store);
  return ui.SwitchPrimitive.Root(
    semantic_props({ ...rest, store, id }, "tn-switch", "switch-root"),
    [
      ui.SwitchPrimitive.Thumb(
        semantic_props({ store }, "tn-switch__thumb", "switch-thumb"),
      ),
    ],
  );
}
