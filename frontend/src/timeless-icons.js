const ICON_ATTRIBUTES = Object.freeze({
  class: "lucide",
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "2",
  viewBox: "0 0 24 24",
});

function editorIcon(name, children) {
  return {
    tag: "svg",
    attrs: { ...ICON_ATTRIBUTES, class: `lucide lucide-${name}` },
    children,
  };
}

const EDITOR_ICONS = Object.freeze({
  bold: editorIcon("bold", [
    {
      tag: "path",
      attrs: { d: "M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8" },
    },
  ]),
  italic: editorIcon("italic", [
    { tag: "line", attrs: { x1: "19", x2: "10", y1: "4", y2: "4" } },
    { tag: "line", attrs: { x1: "14", x2: "5", y1: "20", y2: "20" } },
    { tag: "line", attrs: { x1: "15", x2: "9", y1: "4", y2: "20" } },
  ]),
  link: editorIcon("link", [
    {
      tag: "path",
      attrs: {
        d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
      },
    },
  ]),
  list: editorIcon("list", [
    { tag: "path", attrs: { d: "M3 6h.01" } },
    { tag: "path", attrs: { d: "M3 12h.01" } },
    { tag: "path", attrs: { d: "M3 18h.01" } },
    { tag: "path", attrs: { d: "M8 6h13" } },
    { tag: "path", attrs: { d: "M8 12h13" } },
    { tag: "path", attrs: { d: "M8 18h13" } },
  ]),
  "list-checks": editorIcon("list-checks", [
    { tag: "path", attrs: { d: "m3 7 2 2 4-4" } },
    { tag: "path", attrs: { d: "m3 17 2 2 4-4" } },
    { tag: "path", attrs: { d: "M13 6h8" } },
    { tag: "path", attrs: { d: "M13 12h8" } },
    { tag: "path", attrs: { d: "M13 18h8" } },
  ]),
  paperclip: editorIcon("paperclip", [
    {
      tag: "path",
      attrs: {
        d: "m16 6-8.4 8.6a2 2 0 0 0 2.8 2.8l8.4-8.6a4 4 0 1 0-5.6-5.6l-8.4 8.5a6 6 0 1 0 8.5 8.5l8.4-8.5",
      },
    },
  ]),
  tag: editorIcon("tag", [
    {
      tag: "path",
      attrs: {
        d: "M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z",
      },
    },
    {
      tag: "circle",
      attrs: { cx: "7.5", cy: "7.5", fill: "currentColor", r: ".5" },
    },
  ]),
});

export const Timeless = globalThis.Timeless;
export const TimelessPrimitive = globalThis.Timeless;

Timeless?.registerIcons?.(EDITOR_ICONS);
