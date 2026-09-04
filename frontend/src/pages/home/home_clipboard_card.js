import { compactText } from "@/domain/memos.js";
import { TimelessPrimitive } from "@/timeless-icons.js";

function clipboard_type_label(type) {
  if (type === "link") return "链接";
  if (type === "image") return "图片";
  return "文本";
}

function clipboard_action_label(type) {
  if (type === "link") return "保存链接";
  if (type === "image") return "上传文件";
  return "创建 memo";
}

export function ClipboardCardView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Img, Portal, View, computed, isRef, ref, ui } = runtime;
  if (!props.store) throw new TypeError("ClipboardCardView requires a store");
  const item_ = isRef(props.item) ? props.item : ref(props.item || null);
  const leaving_ = isRef(props.leaving)
    ? props.leaving
    : ref(Boolean(props.leaving));
  const working_ = isRef(props.working)
    ? props.working
    : ref(Boolean(props.working));
  const action_label_ = computed(item_, function (item) {
    return clipboard_action_label(item?.type);
  });
  const card_class_ = computed(leaving_, function (leaving) {
    return "memo-clipboard-card" + (leaving ? " is-leaving" : "");
  });
  const image_url_ = computed(item_, function (item) {
    return String(item?.dataURL || "");
  });
  const preview_ = computed(item_, function (item) {
    return compactText(item?.content, 180);
  });
  const show_image_ = computed(item_, function (item) {
    return Boolean(item?.type === "image" && item.dataURL);
  });
  const type_label_ = computed(item_, function (item) {
    return clipboard_type_label(item?.type);
  });

  return ui.PresencePrimitive.Presence(
    { store: props.store },
    () => [
      Portal({}, [
        View(
          {
            as: "section",
            class: card_class_,
            attributes: {
              "aria-label": "粘贴板内容预览",
              "data-clipboard-card": "true",
              n: "memo-clipboard-card",
            },
          },
          [
            View(
              {
                as: "header",
                class: "memo-clipboard-head",
                attributes: { n: "memo-clipboard-header" },
              },
              [
                View(
                  {
                    as: "span",
                    class: "memo-clipboard-type",
                    attributes: { n: "memo-clipboard-type" },
                  },
                  [type_label_],
                ),
                Button(
                  {
                    class: "memo-clipboard-close",
                    attributes: {
                      "aria-label": "关闭",
                      "data-action": "clipboardDismiss",
                      n: "memo-clipboard-close-button",
                      title: "关闭",
                      type: "button",
                    },
                    onClick(event) {
                      event.preventDefault();
                      props.onDismiss?.();
                    },
                  },
                  [
                    runtime.Icon({
                      name: "x",
                      attributes: { n: "memo-clipboard-close-icon" },
                    }),
                  ],
                ),
              ],
            ),
            runtime.Show({
              when: show_image_,
              ok() {
                return Img({
                  class: "memo-clipboard-image",
                  attributes: {
                    alt: "粘贴板图片预览",
                    n: "memo-clipboard-image",
                    src: image_url_,
                  },
                });
              },
              else() {
                return View(
                  {
                    as: "p",
                    class: "memo-clipboard-text",
                    attributes: { n: "memo-clipboard-text" },
                  },
                  [preview_],
                );
              },
            }),
            View(
              {
                as: "footer",
                class: "memo-clipboard-actions",
                attributes: { n: "memo-clipboard-actions" },
              },
              [
                Button(
                  {
                    class:
                      "tn-button tn-button--secondary memo-secondary-button",
                    attributes: {
                      "data-action": "clipboardDismiss",
                      n: "memo-clipboard-ignore-button",
                      type: "button",
                    },
                    onClick(event) {
                      event.preventDefault();
                      props.onDismiss?.();
                    },
                  },
                  ["忽略"],
                ),
                Button(
                  {
                    class:
                      "tn-button tn-button--primary memo-primary-button",
                    attributes: {
                      "data-action": "clipboardAccept",
                      n: "memo-clipboard-accept-button",
                      type: "button",
                    },
                    disabled: working_,
                    onClick(event) {
                      event.preventDefault();
                      props.onAccept?.();
                    },
                  },
                  [action_label_],
                ),
              ],
            ),
          ],
        ),
      ]),
    ],
  );
}
