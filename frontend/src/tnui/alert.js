import { semantic_props, ui } from "./runtime.js";

export function Alert(props = {}, children = []) {
  const { variant = "default", ...rest } = props;
  return ui.AlertPrimitive.Alert(
    semantic_props(
      {
        ...rest,
        class: `tn-alert--${variant}`,
        variant,
        attributes: { role: "alert", ...(rest.attributes || {}) },
      },
      "tn-alert",
      "alert-root",
    ),
    children,
  );
}

export function AlertTitle(props = {}, children = []) {
  return ui.AlertPrimitive.AlertTitle(
    semantic_props(props, "tn-alert__title", "alert-title"),
    children,
  );
}

export function AlertDescription(props = {}, children = []) {
  return ui.AlertPrimitive.AlertDescription(
    semantic_props(props, "tn-alert__description", "alert-description"),
    children,
  );
}
