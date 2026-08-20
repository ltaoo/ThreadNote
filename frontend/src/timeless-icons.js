function escape_attribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fallback_icon(props = {}) {
  const icon_name = props.name || "info";
  const attributes = { ...(props.attributes || {}) };
  const meaning = attributes.n || attributes["data-n"] || `${icon_name}-icon`;
  const size = props.size || 24;
  const class_name = props.class ? ` class="${escape_attribute(props.class)}"` : "";
  const html = `<span${class_name} data-timeless-icon="${escape_attribute(icon_name)}" data-icon-size="${escape_attribute(size)}" data-n="${escape_attribute(meaning)}" aria-hidden="true"></span>`;

  return {
    t: "icon",
    state: {
      attributes: { ...attributes, n: meaning, "data-n": meaning },
      name: icon_name,
      size,
    },
    render() {
      if (typeof document === "undefined") return null;
      const icon = document.createElement("span");
      if (props.class) icon.className = String(props.class);
      icon.dataset.timelessIcon = String(icon_name);
      icon.dataset.iconSize = String(size);
      icon.dataset.n = String(meaning);
      icon.setAttribute("aria-hidden", "true");
      return icon;
    },
    toString() {
      return html;
    },
  };
}

export const Timeless = globalThis.Timeless?.Icon
  ? globalThis.Timeless
  : { Icon: fallback_icon };

export const TimelessPrimitive = globalThis.Timeless;
