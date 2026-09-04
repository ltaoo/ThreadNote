import {
  Fragment,
  Runtime as Timeless,
  Show,
  View,
  class_names,
  computed,
  refobj,
  require_store,
  semantic_props,
  ui,
  vm,
} from "./runtime.js";
import { Button } from "./button.js";

export function Dialog(props = {}, children = []) {
  const {
    store: provided_store,
    showClose = true,
    closeLabel = "关闭",
    cancelText = "取消",
    confirmText = "确认",
    zIndex,
    onUnmounted,
    ...rest
  } = props;
  const store = require_store("Dialog", provided_store);
  const {
    class: content_class,
    attributes: content_attributes,
    ...content_props
  } = rest;
  const state_ = refobj(store.state);
  const presence_ = refobj(store.presence.state);
  const unlistens = [
    store.onStateChange((state) => state_.as(state)),
    store.presence.onStateChange((state) => presence_.as(state)),
  ];
  const layer_z = zIndex ?? 200 + (vm.getGlobalLayerManager?.().size || 0) * 50;

  return ui.DialogPrimitive.Root(
    semantic_props(
      {
        store,
        onUnmounted() {
          unlistens.forEach((unlisten) => unlisten?.());
          state_.destroy?.();
          presence_.destroy?.();
          onUnmounted?.();
        },
      },
      "tn-dialog-root",
      "dialog-root",
    ),
    () => [
      ui.DialogPrimitive.Overlay(
        semantic_props(
          {
            store,
            zIndex: layer_z,
            class: computed(presence_, (state) => [
              state.enter ? "is-entering" : "",
              state.exit ? "is-exiting" : "",
            ].filter(Boolean).join(" ")),
          },
          "tn-dialog__overlay",
          "dialog-overlay",
        ),
      ),
      View(
        semantic_props(
          { style: { "z-index": layer_z + 1 } },
          "tn-dialog__positioner",
          "dialog-positioner",
        ),
        [
          ui.DialogPrimitive.Content(
            semantic_props(
              {
                ...content_props,
                store,
                zIndex: layer_z + 1,
                class: class_names([
                  content_class,
                  computed(presence_, (state) => [
                    state.enter ? "is-entering" : "",
                    state.exit ? "is-exiting" : "",
                  ].filter(Boolean).join(" ")),
                ]),
                attributes: {
                  ...(content_attributes || {}),
                  role: "dialog",
                  "aria-modal": "true",
                },
              },
              "tn-dialog",
              "dialog-content",
            ),
            [
              Show({
                when: computed(state_, (state) => Boolean(state.title)),
                ok() {
                  return ui.DialogPrimitive.Header(
                    semantic_props({ store }, "tn-dialog__header", "dialog-header"),
                    [
                      ui.DialogPrimitive.Title(
                        semantic_props({ store }, "tn-dialog__title", "dialog-title"),
                        [computed(state_, (state) => state.title || "")],
                      ),
                    ],
                  );
                },
              }),
              Fragment({}, typeof children === "function" ? children() : children),
              showClose
                ? ui.DialogPrimitive.Close(
                  semantic_props(
                    {
                      store,
                      attributes: { "aria-label": closeLabel },
                    },
                    "tn-dialog__close",
                    "dialog-close-button",
                  ),
                  [
                    Timeless.Icon({
                      name: "x",
                      class: "tn-icon",
                      size: 16,
                      attributes: { n: "dialog-close-icon" },
                    }),
                  ],
                )
                : null,
              Show({
                when: computed(state_, (state) => Boolean(state.footer)),
                ok() {
                  return ui.DialogPrimitive.Footer(
                    semantic_props({ store }, "tn-dialog__footer", "dialog-footer"),
                    [
                      Button({ store: store.cancelBtn }, [cancelText]),
                      Button({ store: store.okBtn }, [confirmText]),
                    ],
                  );
                },
              }),
            ].filter(Boolean),
          ),
        ],
      ),
    ],
  );
}

export function DialogHeader(props = {}, children = []) {
  const store = require_store("DialogHeader", props.store);
  return ui.DialogPrimitive.Header(
    semantic_props({ ...props, store }, "tn-dialog__header", "dialog-header"),
    children,
  );
}
export function DialogTitle(props = {}, children = []) {
  const store = require_store("DialogTitle", props.store);
  return ui.DialogPrimitive.Title(
    semantic_props({ ...props, store }, "tn-dialog__title", "dialog-title"),
    children,
  );
}
export function DialogDescription(props = {}, children = []) {
  return View(
    semantic_props(props, "tn-dialog__description", "dialog-description"),
    children,
  );
}
export function DialogBody(props = {}, children = []) {
  return View(semantic_props(props, "tn-dialog__body", "dialog-body"), children);
}
export function DialogFooter(props = {}, children = []) {
  const store = require_store("DialogFooter", props.store);
  return ui.DialogPrimitive.Footer(
    semantic_props({ ...props, store }, "tn-dialog__footer", "dialog-footer"),
    children,
  );
}
