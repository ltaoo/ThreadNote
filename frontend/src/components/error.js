/**
 * @file 错误捕获
 */
import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";

function error_icon() {
  return Timeless.Icon({
    name: "x",
    attributes: { n: "error-modal-close-icon" },
  });
}

function ErrorModalModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const errors_ = runtime.refarr([]);
  const visible_ = runtime.ref(false);
  const methods = {
    hide() {
      visible_.as(false);
      document.body.style.overflow = "";
    },
    show(errors) {
      errors_.as(Array.isArray(errors) ? errors.slice() : []);
      visible_.as(true);
      document.body.style.overflow = "hidden";
    },
  };
  return runtime.defineModel({ state: { errors: errors_, visible: visible_ }, methods });
}

function ErrorModalView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, View, computed } = runtime;
  const modal_class_ = computed(props.vm$.state.visible, function (visible) {
    return "error-modal" + (visible ? " active" : "");
  });
  return View(
    {
      class: modal_class_,
      id: "error-modal",
      attributes: { n: "error-modal-overlay" },
      onClick(event) {
        if (event.target === event.currentTarget) props.vm$.methods.hide();
      },
      onUnmounted() {
        props.vm$.destroy();
      },
    },
    [
      View(
        {
          class: "error-modal-content",
          attributes: {
            "aria-labelledby": "error-modal-title",
            "aria-modal": "true",
            n: "error-modal-content",
            role: "dialog",
          },
        },
        [
          View(
            {
              class: "error-modal-header",
              attributes: { n: "error-modal-header" },
            },
            [
              View(
                {
                  class: "error-modal-title",
                  id: "error-modal-title",
                  attributes: {
                    "aria-level": "3",
                    n: "error-modal-title",
                    role: "heading",
                  },
                },
                ["错误提示"],
              ),
              Button(
                {
                  class: "error-modal-close",
                  attributes: {
                    "aria-label": "关闭错误提示",
                    n: "error-modal-close-button",
                    type: "button",
                  },
                  onClick() {
                    props.vm$.methods.hide();
                  },
                },
                [error_icon()],
              ),
            ],
          ),
          View(
            {
              class: "error-modal-body",
              attributes: { n: "error-modal-body" },
            },
            [
              For({
                each: props.vm$.state.errors,
                render(error, index_) {
                  return View(
                    {
                      class: "error-message",
                      key: String(index_.value),
                      attributes: { n: "error-modal-error-item" },
                    },
                    [
                      View(
                        {
                          style: "font-size: var(--font-2xl, 1.2857rem)",
                          attributes: { n: "error-modal-error-type" },
                        },
                        [error.type],
                      ),
                      View(
                        { attributes: { n: "error-modal-error-message" } },
                        [error.msg],
                      ),
                      View(
                        {
                          style: "margin-left: 12px",
                          attributes: { n: "error-modal-error-source" },
                        },
                        ["at " + error.source],
                      ),
                    ],
                  );
                },
              }),
            ],
          ),
          View(
            {
              class: "error-modal-footer",
              attributes: { n: "error-modal-footer" },
            },
            [
              Button(
                {
                  class: "error-modal-confirm",
                  attributes: {
                    n: "error-modal-confirm-button",
                    type: "button",
                  },
                  onClick() {
                    props.vm$.methods.hide();
                  },
                },
                ["确定"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

class ErrorModal {
  constructor(runtime = TimelessPrimitive) {
    this.runtime = runtime;
    this.vm$ = null;
  }

  mount() {
    if (this.vm$) return;
    insert_error_modal_style();
    this.vm$ = ErrorModalModel({ runtime: this.runtime });
    const view = ErrorModalView({ runtime: this.runtime, vm$: this.vm$ });
    this.runtime.DOM.render(view, document.body);
  }

  show(errors) {
    this.mount();
    this.vm$.methods.show(errors);
  }
}

function insert_error_modal_style() {
  if (document.querySelector("[data-n='error-modal-style']")) return;
  const style = document.createElement("style");
  style.dataset.n = "error-modal-style";
  style.textContent = `
    .error-modal {
      position: fixed; inset: 0; width: 100%; height: 100%;
      background-color: rgba(0, 0, 0, 0.5); display: flex;
      justify-content: center; align-items: center; z-index: 1000;
      opacity: 0; visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }
    .error-modal.active { opacity: 1; visibility: visible; }
    .error-modal-content {
      background-color: var(--BG-0); color: var(--FG-0); border-radius: 8px;
      width: 90%; max-width: 680px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-50px); transition: transform 0.3s ease;
      border: 1px solid var(--FG-3);
    }
    .error-modal.active .error-modal-content { transform: translateY(0); }
    .error-modal-header {
      padding: 8px 12px; border-bottom: 1px solid var(--FG-3);
      display: flex; justify-content: space-between; align-items: center;
    }
    .error-modal-title { margin: 0; font-size: 1.25rem; color: var(--RED); }
    .error-modal-close {
      background: none; border: none; font-size: 1.5rem; cursor: pointer;
      color: var(--FG-1); padding: 0; line-height: 1;
    }
    .error-modal-close:hover { color: var(--FG-0); }
    .error-modal-body {
      overflow-y: auto; padding: 12px; color: var(--FG-0);
      line-height: 1.5; max-height: 400px;
    }
    .error-modal-footer {
      padding: 8px 12px; border-top: 1px solid var(--FG-3);
      display: flex; justify-content: flex-end;
    }
    .error-modal-confirm {
      background-color: var(--RED); color: white; border: none;
      padding: 8px; border-radius: 4px; cursor: pointer;
      font-size: 0.875rem; transition: background-color 0.2s ease;
    }
    .error-modal-confirm:hover { opacity: 0.9; }
    @media (max-width: 480px) {
      .error-modal-content { width: 95%; }
      .error-modal-header, .error-modal-body, .error-modal-footer {
        padding: 12px 16px;
      }
    }
  `;
  document.head.appendChild(style);
}

const error_modal_ = new ErrorModal();
const errors_ = [];

window.addEventListener("error", function (event) {
  event.preventDefault();
  const parsed = parse_error_stack(event.error && event.error.stack);
  if (parsed) errors_.push(parsed);
  if (errors_.length) error_modal_.show(errors_);
});

window.addEventListener("unhandledrejection", function (event) {
  event.preventDefault();
  const parsed = parse_error_stack(event.reason && event.reason.stack);
  if (parsed) errors_.push(parsed);
  if (errors_.length) error_modal_.show(errors_);
});

function parse_error_stack(error_stack) {
  if (!error_stack) return null;
  const regexp = /^([a-zA-Z]{1,}):([\s\S]{1,})[\r\n ]{1,}at([\s\S]{1,})$/;
  const matched = error_stack.match(regexp);
  if (!matched) return null;
  return { type: matched[1], msg: matched[2], source: matched[3] };
}
