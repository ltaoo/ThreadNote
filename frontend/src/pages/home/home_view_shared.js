import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

export function reactiveWhen(value) {
  return ref(Boolean(value));
}

export function renderTimelessHost(
  props = {},
  children = [],
  runtime = TimelessPrimitive,
) {
  const host_view = runtime.View(props, children);
  return runtime.DOM.buildAndRender(host_view).dom;
}

export function appendTimelessHost(
  parent,
  props = {},
  children = [],
  runtime = TimelessPrimitive,
) {
  const host = renderTimelessHost(props, children, runtime);
  parent.appendChild(host);
  return host;
}

export function iconActionButton(runtime, props) {
  const class_name_ = computed(
    ref({
      active: Boolean(props.active),
      className:
        props.class ||
        "tn-button tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
      danger: Boolean(props.danger),
    }),
    function (value) {
      let class_name = value.className;
      if (value.active) class_name += " is-active";
      if (value.danger) class_name += " is-danger";
      return class_name;
    },
  );
  return runtime.Button(
    {
      class: class_name_,
      attributes: {
        "aria-controls": props.controls,
        "aria-expanded": props.expanded,
        "aria-haspopup": props.hasPopup,
        "aria-label": props.label,
        "aria-pressed": props.pressed,
        "data-action": props.action,
        "data-board-id": props.boardId,
        "data-comment-id": props.commentId,
        "data-memo-id": props.memoId,
        "data-rule-id": props.ruleId,
        n: props.meaning,
        title: props.label,
        type: props.type || "button",
      },
      disabled: props.disabled,
    },
    [
      Timeless.Icon({
        name: props.icon,
        attributes: { n: props.meaning + "-icon" },
      }),
      Show({
        when: reactiveWhen(props.text),
        ok() {
          return runtime.View(
            { as: "span", attributes: { n: props.meaning + "-label" } },
            [props.text],
          );
        },
      }),
      Show({
        when: reactiveWhen(props.count),
        ok() {
          return runtime.View(
            {
              as: "span",
              class: "memo-action-count",
              attributes: { n: props.meaning + "-count" },
            },
            [props.count],
          );
        },
      }),
    ],
  );
}

export function EmptyStateView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  return runtime.View(
    {
      class: props.class || "memo-empty-state",
      attributes: { n: props.meaning || "memo-empty-state" },
    },
    [String(props.message || "")],
  );
}

export function PrivateOverlayView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  return runtime.View(
    {
      class: "memo-private-overlay",
      attributes: { n: props.meaning + "-private-overlay" },
    },
    [
      Timeless.Icon({
        name: "file-lock",
        attributes: { n: props.meaning + "-private-icon" },
      }),
      runtime.View(
        { as: "strong", attributes: { n: props.meaning + "-private-title" } },
        [props.label],
      ),
      runtime.View(
        {
          as: "span",
          attributes: { n: props.meaning + "-private-description" },
        },
        ["解锁后可查看内容"],
      ),
    ],
  );
}

export function ConfirmDeleteView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, View } = runtime;
  const action_attribute = props.actionAttribute || "data-delete-dialog-action";
  function action(value, label, danger) {
    const class_name_ = computed(
      reactiveWhen(danger),
      function (is_danger) {
        if (is_danger) {
          return "tn-button tn-button--danger memo-primary-button is-danger";
        }
        return "tn-button tn-button--secondary memo-secondary-button";
      },
    );
    return Button(
      {
        class: class_name_,
        attributes: {
          [action_attribute]: value,
          n: props.meaning + "-" + value,
          type: "button",
        },
      },
      [label],
    );
  }
  return View(
    {
      as: "section",
      class: "tn-dialog tn-dialog--sm tn-dialog--alert memo-delete-panel",
      attributes: { "aria-modal": "true", n: props.meaning, role: "dialog" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-delete-head",
          attributes: { n: props.meaning + "-header" },
        },
        [
          View(
            {
              as: "span",
              class: "memo-delete-icon",
              attributes: { n: props.meaning + "-icon" },
            },
            [
              Timeless.Icon({
                name: "trash2",
                attributes: { n: props.meaning + "-symbol" },
              }),
            ],
          ),
          View({ attributes: { n: props.meaning + "-heading" } }, [
            View({ as: "h2", attributes: { n: props.meaning + "-title" } }, [
              props.title,
            ]),
            View(
              { as: "p", attributes: { n: props.meaning + "-description" } },
              [props.description],
            ),
          ]),
        ],
      ),
      Show({
        when: reactiveWhen(props.options?.length),
        ok() {
          return View(
            {
              class: "memo-delete-options",
              attributes: { n: props.meaning + "-options" },
            },
            props.options.map(function (option) {
              return View(
                {
                  as: "label",
                  class: "memo-delete-option",
                  attributes: { n: props.meaning + "-option" },
                },
                [
                  Checkbox({
                    checked: true,
                    attributes: {
                      [option.attribute]: "true",
                      n: props.meaning + "-option-input",
                    },
                  }),
                  View(
                    {
                      as: "span",
                      attributes: { n: props.meaning + "-option-copy" },
                    },
                    [
                      View(
                        {
                          as: "strong",
                          attributes: { n: props.meaning + "-option-title" },
                        },
                        [option.title],
                      ),
                      View(
                        {
                          as: "small",
                          attributes: { n: props.meaning + "-option-detail" },
                        },
                        [option.detail],
                      ),
                    ],
                  ),
                ],
              );
            }),
          );
        },
      }),
      View(
        {
          as: "footer",
          class: "memo-delete-actions",
          attributes: { n: props.meaning + "-actions" },
        },
        [action("cancel", "取消", false), action("confirm", "删除", true)],
      ),
    ],
  );
}
