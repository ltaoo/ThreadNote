import { View, semantic_props } from "./runtime.js";
import { Label } from "./label.js";

export function FormField(props = {}, children = []) {
  const { label, description, error, ...rest } = props;
  return View(
    semantic_props(rest, "tn-form-field", "form-field-root"),
    [
      label
        ? Label({ attributes: { n: "form-field-label" } }, [label])
        : null,
      ...children,
      description
        ? View(
          semantic_props({}, "tn-form-field__description", "form-field-description"),
          [description],
        )
        : null,
      error
        ? View(
          semantic_props(
            { attributes: { role: "alert" } },
            "tn-form-field__error",
            "form-field-error",
          ),
          [error],
        )
        : null,
    ].filter(Boolean),
  );
}
