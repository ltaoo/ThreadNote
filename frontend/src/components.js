import {
  ButtonModel,
  CheckboxModel,
  DialogModel,
  InputModel,
  PopoverModel,
  ProgressModel,
  ProjectSelectModel,
  SelectModel,
  SwitchModel,
} from "./component-models.js";
import { DatePickerModel } from "./date-picker-model.js";
import { floatingControlModel } from "./floating-control-model.js";
import {
  Icon,
  applyElementProps,
  attachModel,
  callModel,
  classNames,
  elementView,
  modelState,
  nextId,
  placePopover,
  portalView,
  resolveModel,
  setAttribute,
  simpleView,
  subscribeModel,
} from "./component-view.js";
import { createMemoCardComponent } from "./memo-card.js";
import { createSmallCalendarComponent } from "./small-calendar.js";
import { createDatePickerComponent } from "./date-picker.js";
import { registerFormComponentElements } from "./form-component-elements.js";
import { createProjectSelectComponent } from "./project-select.js";
import { createSelectComponent } from "./select.js";
import { Timeless } from "./timeless-icons.js";

export * from "./component-models.js";
export * from "./date-picker-model.js";
export * from "./floating-control-model.js";
export * from "./memo-card-model.js";
export * from "./small-calendar-model.js";
export { Icon } from "./component-view.js";

function buttonVariant(props) {
  const legacyVariant = [
    "primary",
    "secondary",
    "outline",
    "ghost",
    "danger",
    "destructive",
    "link",
  ].includes(props.type)
    ? props.type
    : null;
  return props.variant || legacyVariant || "default";
}

export function Button(props = {}, children = []) {
  const resolved = resolveModel(props, ButtonModel, {
    disabled: props.disabled,
    loading: props.loading,
    onClick: props.onClick,
    text: props.text,
  });
  const model = resolved.model;
  const variant = buttonVariant(props);
  const size = props.size || "md";
  const nativeType = ["button", "submit", "reset"].includes(props.type)
    ? props.type
    : props.htmlType || "button";
  const button = document.createElement("button");
  const spinner = document.createElement("span");
  const content = document.createElement("span");
  spinner.className = "tn-spinner tn-button__spinner";
  spinner.setAttribute("aria-hidden", "true");
  content.className = "tn-button__content";
  applyElementProps(button, props);
  button.type = nativeType;
  if (props.name) button.name = props.name;
  if (props.value !== undefined) button.value = props.value;

  const prefix = props.prefix
    ? simpleView("span", "tn-button__prefix", {}, [props.prefix])
    : null;
  const suffix = props.suffix
    ? simpleView("span", "tn-button__suffix", {}, [props.suffix])
    : null;
  const contentChildren = children.length ? children : [modelState(model).text];
  const contentView = elementView(content, contentChildren);
  const view = elementView(
    button,
    [spinner, prefix, contentView, suffix].filter(Boolean),
    props,
  );

  function sync() {
    const state = modelState(model);
    const disabled = Boolean(state.disabled || state.loading);
    button.className = classNames(
      "tn-button",
      `tn-button--${variant === "destructive" ? "danger" : variant}`,
      `tn-button--${size}`,
      state.loading && "is-loading",
      disabled && "is-disabled",
      props.class,
    );
    button.disabled = disabled;
    setAttribute(button, "aria-busy", state.loading ? "true" : null);
    spinner.hidden = !state.loading;
    if (!children.length && content.childNodes.length) {
      content.textContent = state.text || props.text || "";
    }
  }

  button.addEventListener("click", (event) => {
    callModel(model, ["press", "click"], event);
  });
  const unsubscribe = subscribeModel(model, sync);
  sync();
  return attachModel(view, model, unsubscribe, resolved.owned);
}

export function IconButton(props = {}, children = []) {
  return Button(
    {
      ...props,
      ariaLabel: props.ariaLabel || props.label,
      class: classNames("tn-icon-button", props.class),
      size: props.size || "icon",
    },
    children,
  );
}

function inputModelAction(model, method, ...args) {
  const timelessMethod = {
    blur: "handleBlur",
    enter: "enter",
    focus: "handleFocus",
    keyDown: "handleKeyDown",
  }[method];
  return callModel(model, [method, timelessMethod].filter(Boolean), ...args);
}

function createInputControl(props, multiline) {
  const resolved = resolveModel(props, InputModel, {
    ...props,
    value: props.value ?? props.defaultValue,
  });
  const model = resolved.model;
  const root = document.createElement("div");
  const input = document.createElement(multiline ? "textarea" : "input");
  const clear = document.createElement("button");
  const spinner = document.createElement("span");
  const component_name = multiline ? "tn-textarea" : "tn-input";
  const size = ["sm", "md", "lg"].includes(props.size) ? props.size : "md";
  const variant = ["outlined", "filled", "borderless"].includes(props.variant)
    ? props.variant
    : "outlined";
  root.className = `${component_name}-root`;
  input.className = component_name;
  clear.type = "button";
  clear.className = "tn-input__action";
  clear.setAttribute("aria-label", "清空输入");
  spinner.className = "tn-spinner tn-input__spinner";
  spinner.setAttribute("aria-hidden", "true");
  applyElementProps(root, { class: props.rootClass });
  applyElementProps(input, props);
  if (props.name) input.name = props.name;
  if (props.maxLength !== undefined) input.maxLength = props.maxLength;
  if (props.minLength !== undefined) input.minLength = props.minLength;
  if (props.rows !== undefined && multiline) input.rows = props.rows;
  const clearIcon = Timeless.Icon({ name: "x", size: 14 });
  const clearView = elementView(clear, [clearIcon]);
  const leading = props.leading
    ? simpleView("span", "tn-input__leading", {}, [props.leading])
    : null;
  const trailing = props.trailing
    ? simpleView("span", "tn-input__trailing", {}, [props.trailing])
    : null;
  const view = elementView(
    root,
    [leading, input, clearView, spinner, trailing].filter(Boolean),
    props,
  );
  view.control = input;

  function sync() {
    const state = modelState(model);
    const value = state.value ?? model.value ?? "";
    if (input.value !== String(value)) input.value = String(value);
    input.disabled = Boolean(state.disabled ?? model.disabled);
    input.readOnly = Boolean(state.readOnly ?? props.readOnly);
    input.placeholder =
      state.placeholder ?? model.placeholder ?? props.placeholder ?? "";
    if (!multiline)
      input.type = state.type || model.type || props.type || "text";
    const invalid = Boolean(state.invalid || props.invalid);
    setAttribute(input, "aria-invalid", invalid ? "true" : null);
    root.className = classNames(
      `${component_name}-root`,
      `${component_name}-root--${size}`,
      `${component_name}-root--${variant}`,
      invalid && "is-invalid",
      input.disabled && "is-disabled",
      state.loading && "is-loading",
      props.rootClass,
    );
    input.className = classNames(
      component_name,
      `${component_name}--${size}`,
      `${component_name}--${variant}`,
      props.class,
    );
    clear.hidden =
      multiline ||
      props.allowClear === false ||
      !String(value) ||
      input.disabled ||
      input.readOnly ||
      Boolean(state.loading);
    spinner.hidden = !state.loading;
  }

  input.addEventListener("input", (event) => {
    callModel(model, ["setValue"], event.currentTarget.value, { event });
  });
  input.addEventListener("keydown", (event) => {
    inputModelAction(model, "keyDown", event);
    if (
      event.key === "Enter" &&
      !multiline &&
      typeof model.handleKeyDown !== "function"
    ) {
      inputModelAction(model, "enter", event);
    }
  });
  input.addEventListener("focus", (event) =>
    inputModelAction(model, "focus", event),
  );
  input.addEventListener("blur", (event) =>
    inputModelAction(model, "blur", event),
  );
  clear.addEventListener("click", (event) => {
    callModel(model, ["clear"], event);
    input.focus();
  });
  const unsubscribe = subscribeModel(model, sync);
  sync();
  return attachModel(view, model, unsubscribe, resolved.owned);
}

export function Input(props = {}) {
  return createInputControl(props, false);
}

export function Textarea(props = {}) {
  return createInputControl(props, true);
}

const checkboxModelKey = Symbol("threadnote.checkbox.model");

export function Checkbox(props = {}, children = []) {
  const resolved = resolveModel(props, CheckboxModel, props);
  const model = resolved.model;
  const label = document.createElement("label");
  const input = document.createElement("input");
  const box = document.createElement("span");
  const text = document.createElement("span");
  input.type = "checkbox";
  input.className = "tn-checkbox__input";
  box.className = "tn-checkbox__box";
  text.className = "tn-checkbox__label";
  applyElementProps(label, props);
  applyElementProps(input, {
    ariaLabel: props.inputAriaLabel || props.ariaLabel,
    attributes: props.inputAttributes,
    id: props.id,
  });
  if (props.name) input.name = props.name;
  if (props.value !== undefined) input.value = props.value;
  input[checkboxModelKey] = model;
  const boxView = elementView(box, [
    Timeless.Icon({ name: "check", class: "tn-checkbox__check", size: 14 }),
    Timeless.Icon({ name: "minus", class: "tn-checkbox__minus", size: 14 }),
  ]);
  const labelChildren = children.length
    ? children
    : [props.label || modelState(model).label];
  const hasLabel =
    children.length > 0 || Boolean(props.label || modelState(model).label);
  const view = elementView(
    label,
    [input, boxView, hasLabel ? elementView(text, labelChildren) : null].filter(
      Boolean,
    ),
    props,
  );
  view.control = input;

  function sync() {
    const state = modelState(model);
    const checked = Boolean(state.checked ?? model.value);
    const indeterminate = Boolean(state.indeterminate);
    input.checked = checked;
    input.indeterminate = indeterminate;
    input.disabled = Boolean(state.disabled ?? model.disabled);
    setAttribute(
      input,
      "aria-checked",
      indeterminate ? "mixed" : String(checked),
    );
    setAttribute(
      label,
      "data-state",
      indeterminate ? "indeterminate" : checked ? "checked" : "unchecked",
    );
    label.className = classNames(
      "tn-checkbox",
      `tn-checkbox--${props.size || "md"}`,
      hasLabel && "tn-checkbox--labelled",
      checked && "is-checked",
      indeterminate && "is-indeterminate",
      input.disabled && "is-disabled",
      props.class,
    );
  }

  input.addEventListener("change", (event) => {
    callModel(model, ["setValue"], event.currentTarget.checked, { event });
  });
  const unsubscribe = subscribeModel(model, sync);
  sync();
  return attachModel(view, model, unsubscribe, resolved.owned);
}

export function setCheckboxControlValue(control, checked) {
  if (!control) return Boolean(checked);
  const value = Boolean(checked);
  const model = control[checkboxModelKey];
  if (model && typeof model.setValue === "function") {
    model.setValue(value, { silent: true });
  } else {
    control.checked = value;
  }
  const host = control.closest?.("tn-checkbox");
  if (host) host.toggleAttribute("checked", value);
  return value;
}

function checkboxElementInputAttributes(element) {
  const attributes = {};
  Array.from(element.attributes || []).forEach((attribute) => {
    if (attribute.name.startsWith("data-")) {
      attributes[attribute.name] = attribute.value;
    }
  });
  return attributes;
}

export function registerCheckboxElement(tagName = "tn-checkbox") {
  if (
    typeof window === "undefined" ||
    !window.customElements ||
    window.customElements.get(tagName)
  ) {
    return;
  }

  class TimelessCheckboxElement extends window.HTMLElement {
    static get observedAttributes() {
      return ["checked", "disabled", "indeterminate"];
    }

    connectedCallback() {
      if (this._checkbox_view) return;
      const view = Checkbox({
        ariaLabel: this.getAttribute("aria-label") || "复选框",
        checked: this.hasAttribute("checked"),
        class: classNames(
          "tn-checkbox--embedded",
          this.getAttribute("control-class"),
        ),
        disabled: this.hasAttribute("disabled"),
        indeterminate: this.hasAttribute("indeterminate"),
        inputAttributes: checkboxElementInputAttributes(this),
        label: this.getAttribute("label") || "",
        name: this.getAttribute("name") || undefined,
        onChange: (checked) => this.toggleAttribute("checked", checked),
        size: this.getAttribute("size") || "md",
        value: this.getAttribute("value") || undefined,
      });
      this._checkbox_view = view;
      this.replaceChildren(view.render());
      view.onMounted?.();
    }

    disconnectedCallback() {
      const view = this._checkbox_view;
      window.queueMicrotask(() => {
        if (this.isConnected || this._checkbox_view !== view) return;
        view?.beforeUnmounted?.();
        view?.onUnmounted?.();
        this._checkbox_view = null;
      });
    }

    attributeChangedCallback(name) {
      const model = this._checkbox_view?.model;
      if (!model) return;
      if (name === "checked") {
        const checked = this.hasAttribute("checked");
        if (Boolean(modelState(model).checked) !== checked) {
          model.setValue?.(checked, { silent: true });
        }
      }
      if (name === "disabled")
        model.setDisabled?.(this.hasAttribute("disabled"));
      if (name === "indeterminate") {
        model.setIndeterminate?.(this.hasAttribute("indeterminate"));
      }
    }
  }

  window.customElements.define(tagName, TimelessCheckboxElement);
}

export function Switch(props = {}, children = []) {
  const resolved = resolveModel(props, SwitchModel, props);
  const model = resolved.model;
  const label = document.createElement("label");
  const input = document.createElement("input");
  const track = document.createElement("span");
  const thumb = document.createElement("span");
  const text = document.createElement("span");
  input.type = "checkbox";
  input.className = "tn-switch__input";
  track.className = "tn-switch__track";
  thumb.className = "tn-switch__thumb";
  text.className = "tn-switch__label";
  track.appendChild(thumb);
  applyElementProps(label, props);
  applyElementProps(input, { attributes: props.inputAttributes, id: props.id });
  input.setAttribute("role", "switch");
  const labelChildren = children.length ? children : [props.label || ""];
  const view = elementView(
    label,
    [input, track, elementView(text, labelChildren)],
    props,
  );
  view.control = input;

  function sync() {
    const state = modelState(model);
    const checked = Boolean(state.checked ?? model.value);
    input.checked = checked;
    input.disabled = Boolean(state.disabled ?? model.disabled);
    input.setAttribute("aria-checked", String(checked));
    label.className = classNames(
      "tn-switch",
      checked && "is-checked",
      input.disabled && "is-disabled",
      props.class,
    );
  }

  input.addEventListener("change", (event) => {
    callModel(model, ["setValue"], event.currentTarget.checked, { event });
  });
  const unsubscribe = subscribeModel(model, sync);
  sync();
  return attachModel(view, model, unsubscribe, resolved.owned);
}

export const Select = createSelectComponent({
  Icon,
  SelectModel,
  applyElementProps,
  classNames,
  floatingControlModel,
  modelState,
  nextId,
  resolveModel,
  setAttribute,
  subscribeModel,
});

export const DatePicker = createDatePickerComponent({
  DatePickerModel,
  Icon,
  applyElementProps,
  classNames,
  floatingControlModel,
  modelState,
  nextId,
  resolveModel,
  setAttribute,
  subscribeModel,
});

export const ProjectSelect = createProjectSelectComponent({
  ProjectSelectModel,
  Select,
  classNames,
  floatingControlModel,
  resolveModel,
});

export function registerFormComponents() {
  registerFormComponentElements({ DatePicker, ProjectSelect, Select });
}

function dialogIsOpen(state, model) {
  return Boolean(state.open || state.visible || model.open);
}

function dialogIsBusy(state, model) {
  return Boolean(state.busy || state.loading || model.okBtn?.state?.loading);
}

function focusDialog(panel) {
  const target = panel.querySelector(
    "[autofocus], button:not([disabled]), input:not([disabled]), tn-select:not([disabled]), tn-project-select:not([disabled]), tn-date-picker:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  );
  (target || panel).focus();
}

function trapDialogFocus(event, panel) {
  if (event.key !== "Tab") return;
  const controls = Array.from(
    panel.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), tn-select:not([disabled]), tn-project-select:not([disabled]), tn-date-picker:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  );
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function Dialog(props = {}, children = []) {
  const resolved = resolveModel(props, DialogModel, {
    ...props,
    onConfirm: props.onConfirm || props.onOk,
  });
  const model = resolved.model;
  const titleId = props.titleId || nextId("tn-dialog-title");
  const descriptionId = props.descriptionId || nextId("tn-dialog-description");
  const layer = document.createElement("div");
  const overlay = document.createElement("div");
  const panel = document.createElement("section");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  const description = document.createElement("p");
  const body = document.createElement("div");
  const error = document.createElement("div");
  const footer = document.createElement("footer");
  const closeModel = new ButtonModel({
    onPress: (event) => callModel(model, ["cancel", "hide"], event),
  });
  const cancelModel = new ButtonModel({
    onPress: (event) => callModel(model, ["cancel", "hide"], event),
  });
  const confirmModel = new ButtonModel({
    onPress: (event) => callModel(model, ["confirm", "ok"], event),
  });
  const size = ["sm", "md", "lg", "full"].includes(props.size)
    ? props.size
    : "md";
  layer.className = "tn-overlay tn-dialog-layer";
  overlay.className = "tn-dialog-overlay";
  panel.className = classNames("tn-dialog", `tn-dialog--${size}`, props.class);
  header.className = "tn-dialog__header";
  title.className = "tn-dialog__title";
  description.className = "tn-dialog__description";
  body.className = "tn-dialog__body";
  error.className = "tn-dialog__error";
  footer.className = "tn-dialog__footer";
  title.id = titleId;
  description.id = descriptionId;
  error.setAttribute("role", "alert");
  panel.setAttribute("role", props.role || "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;
  panel.setAttribute("aria-labelledby", titleId);
  if (props.description) panel.setAttribute("aria-describedby", descriptionId);
  applyElementProps(panel, props);
  const closeButton = IconButton(
    {
      ariaLabel: props.closeLabel || "关闭",
      class: "tn-dialog__close",
      model: closeModel,
      variant: "ghost",
    },
    [Timeless.Icon({ name: "x" })],
  );
  const cancelButton = Button({ model: cancelModel, variant: "secondary" }, [
    props.cancelText || "取消",
  ]);
  const confirmButton = Button(
    { model: confirmModel, variant: props.confirmVariant || "primary" },
    [props.confirmText || props.okText || "确认"],
  );
  const content = typeof children === "function" ? children(model) : children;
  const contentItems = Array.isArray(content) ? content : [content];
  const hasDialogBody = contentItems.some((item) =>
    item?.$elm?.classList?.contains("tn-dialog__body"),
  );
  const headerView = elementView(header, [
    elementView(title),
    props.description ? elementView(description, [props.description]) : null,
    props.showClose === false ? null : closeButton,
  ]);
  const bodyView = hasDialogBody
    ? contentItems
    : [elementView(body, contentItems)];
  const errorView = elementView(error);
  const footerDisabled = props.showFooter === false || props.footer === false;
  const footerContent =
    props.footerContent ??
    (props.footer && props.footer !== true
      ? props.footer
      : [cancelButton, confirmButton]);
  const footerView = elementView(footer, footerContent);
  const panelView = elementView(panel, [
    headerView,
    bodyView,
    errorView,
    footerDisabled ? null : footerView,
  ]);
  const rootView = elementView(layer, [overlay, panelView]);
  const previousFocus = { value: null };
  let wasOpen = false;

  function sync() {
    const state = modelState(model);
    const open = dialogIsOpen(state, model);
    const busy = dialogIsBusy(state, model);
    const titleText = state.title || props.title || "";
    layer.className = classNames(
      "tn-overlay",
      "tn-dialog-layer",
      open && "is-open",
    );
    layer.hidden = !open;
    setAttribute(layer, "aria-hidden", open ? null : "true");
    setAttribute(panel, "aria-busy", busy ? "true" : null);
    setAttribute(panel, "aria-labelledby", titleText ? titleId : null);
    setAttribute(
      panel,
      "aria-describedby",
      props.description ? descriptionId : null,
    );
    title.textContent = titleText;
    header.hidden =
      !title.textContent && props.showClose === false && !props.description;
    description.textContent = props.description || "";
    overlay.hidden = state.mask === false;
    footer.hidden = footerDisabled || state.footer === false;
    error.textContent = state.error
      ? String(state.error.message || state.error)
      : "";
    error.hidden = !state.error;
    closeModel.setDisabled(busy || state.closeable === false);
    cancelModel.setDisabled(busy || state.closeable === false);
    confirmModel.setLoading(busy);
    if (open && !wasOpen) {
      previousFocus.value = document.activeElement;
      window.requestAnimationFrame(() => focusDialog(panel));
    }
    if (!open && wasOpen && previousFocus.value?.focus) {
      previousFocus.value.focus();
    }
    wasOpen = open;
  }

  function handleKeydown(event) {
    const state = modelState(model);
    if (!dialogIsOpen(state, model)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (!dialogIsBusy(state, model) && state.closeable !== false) {
        callModel(model, ["cancel", "hide"], event);
      }
      return;
    }
    trapDialogFocus(event, panel);
  }

  overlay.addEventListener("click", (event) => {
    const state = modelState(model);
    if (
      !dialogIsBusy(state, model) &&
      state.closeable !== false &&
      props.closeOnOverlay !== false
    ) {
      callModel(model, ["cancel", "hide"], event);
    }
  });
  document.addEventListener("keydown", handleKeydown);
  const unsubscribe = subscribeModel(model, sync);
  const relatedUnsubscribes = [model.okBtn, model.cancelBtn]
    .filter(Boolean)
    .map((relatedModel) => subscribeModel(relatedModel, sync));
  const portal = portalView(rootView, {
    onMounted() {
      props.onMounted?.(panel);
    },
    beforeUnmounted() {
      props.beforeUnmounted?.(panel);
    },
    onUnmounted() {
      unsubscribe();
      relatedUnsubscribes.forEach((unsubscribeRelated) => unsubscribeRelated());
      document.removeEventListener("keydown", handleKeydown);
      closeModel.destroy();
      cancelModel.destroy();
      confirmModel.destroy();
      if (resolved.owned) model.destroy?.();
      previousFocus.value?.focus?.();
      props.onUnmounted?.(panel);
    },
  });
  portal.model = model;
  portal.panel = panel;
  sync();
  return portal;
}

export function DialogHeader(props = {}, children = []) {
  return simpleView("header", "tn-dialog__header", props, children);
}

export function DialogTitle(props = {}, children = []) {
  return simpleView("h2", "tn-dialog__title", props, children);
}

export function DialogDescription(props = {}, children = []) {
  return simpleView("p", "tn-dialog__description", props, children);
}

export function DialogBody(props = {}, children = []) {
  return simpleView("div", "tn-dialog__body", props, children);
}

export function DialogFooter(props = {}, children = []) {
  return simpleView("footer", "tn-dialog__footer", props, children);
}

function popoverIsOpen(state, model) {
  return Boolean(state.open ?? state.visible ?? model.open ?? model.visible);
}

export function Popover(props = {}, children = []) {
  const resolved = resolveModel(props, PopoverModel, props);
  const model = resolved.model;
  const trigger = document.createElement("span");
  const content = document.createElement("div");
  const title = document.createElement("div");
  const body = document.createElement("div");
  trigger.className = classNames("tn-popover__trigger", props.triggerClass);
  content.className = classNames(
    "tn-popup",
    "tn-popup--popover",
    "tn-popover",
    props.class,
  );
  title.className = "tn-popover__title";
  body.className = "tn-popover__body";
  content.setAttribute("role", props.role || "dialog");
  content.id = props.contentId || nextId("tn-popover-content");
  applyElementProps(content, props.contentProps || {});
  const contentChildren =
    typeof props.content === "function"
      ? props.content(model)
      : props.content || [];
  const triggerView = elementView(trigger, children);
  const contentView = elementView(content, [
    props.title ? elementView(title, [props.title]) : null,
    elementView(body, contentChildren),
  ]);
  let rendered = false;
  let hoverTimer = null;
  let triggerControl = trigger;

  function position() {
    if (!popoverIsOpen(modelState(model), model)) return;
    placePopover(
      trigger,
      content,
      modelState(model).placement || props.placement || props.side || "bottom",
      Number(props.offset) || 8,
    );
  }

  function sync() {
    const open = popoverIsOpen(modelState(model), model);
    content.hidden = !open;
    content.className = classNames(
      "tn-popup",
      "tn-popup--popover",
      "tn-popover",
      open && "is-open",
      props.class,
    );
    setAttribute(triggerControl, "aria-expanded", String(open));
    if (open) window.requestAnimationFrame(position);
  }

  function toggle(event) {
    const rect = trigger.getBoundingClientRect();
    callModel(model, ["toggle"], rect, event);
  }

  function show(event) {
    clearTimeout(hoverTimer);
    const rect = trigger.getBoundingClientRect();
    callModel(model, ["show"], rect, event);
  }

  function hide(event) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(
      () => callModel(model, ["hide"], "dismiss", event),
      props.hoverDelay ?? 80,
    );
  }

  function handlePointerDown(event) {
    if (!popoverIsOpen(modelState(model), model)) return;
    if (
      props.closeOnOutside !== false &&
      !trigger.contains(event.target) &&
      !content.contains(event.target)
    ) {
      callModel(model, ["hide"], "outside", event);
    }
  }

  function handleKeydown(event) {
    if (
      event.key === "Escape" &&
      props.closeOnEscape !== false &&
      popoverIsOpen(modelState(model), model)
    ) {
      callModel(model, ["hide"], "escape", event);
      const focusTarget = trigger.querySelector(
        "button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      (focusTarget || triggerControl).focus?.();
    }
  }

  function handleTriggerKeydown(event) {
    if (event.target !== trigger || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggle(event);
  }

  if (props.trigger === "hover") {
    trigger.addEventListener("mouseenter", show);
    trigger.addEventListener("mouseleave", hide);
    trigger.addEventListener("focusin", show);
    trigger.addEventListener("focusout", hide);
    content.addEventListener("mouseenter", () => clearTimeout(hoverTimer));
    content.addEventListener("mouseleave", hide);
    content.addEventListener("focusin", () => clearTimeout(hoverTimer));
    content.addEventListener("focusout", hide);
  } else {
    trigger.addEventListener("click", toggle);
  }
  trigger.addEventListener("keydown", handleTriggerKeydown);
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  const unsubscribe = subscribeModel(model, sync);
  sync();

  const view = {
    t: "view",
    $elm: trigger,
    model,
    render() {
      if (!rendered) {
        triggerView.render();
        triggerControl = trigger.querySelector(
          "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (!triggerControl) {
          triggerControl = trigger;
          trigger.tabIndex = 0;
          trigger.setAttribute("role", "button");
        } else {
          trigger.removeAttribute("aria-expanded");
        }
        triggerControl.setAttribute("aria-controls", content.id);
        triggerControl.setAttribute("aria-haspopup", props.role || "dialog");
        contentView.render();
        document.body.appendChild(content);
        rendered = true;
        sync();
      }
      return trigger;
    },
    onMounted() {
      props.onMounted?.(trigger);
      triggerView.onMounted();
      contentView.onMounted();
    },
    beforeUnmounted() {
      props.beforeUnmounted?.(trigger);
      triggerView.beforeUnmounted();
      contentView.beforeUnmounted();
    },
    onUnmounted() {
      clearTimeout(hoverTimer);
      unsubscribe();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      triggerView.onUnmounted();
      contentView.onUnmounted();
      content.remove();
      if (resolved.owned) model.destroy?.();
      props.onUnmounted?.(trigger);
    },
  };
  return view;
}

export function Label(props = {}, children = []) {
  const view = simpleView("label", "tn-label", props, children);
  if (props.htmlFor) view.$elm.htmlFor = props.htmlFor;
  return view;
}

export function FormField(props = {}, children = []) {
  const id = props.id || nextId("tn-field");
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const control = children[0];
  const controlElement = control?.control || control?.$elm;
  if (controlElement) {
    if (!controlElement.id) controlElement.id = id;
    const describedBy = [
      props.description && descriptionId,
      props.error && errorId,
    ]
      .filter(Boolean)
      .join(" ");
    if (describedBy)
      controlElement.setAttribute("aria-describedby", describedBy);
    if (props.error) controlElement.setAttribute("aria-invalid", "true");
  }
  return simpleView("div", "tn-form-field", props, [
    props.label ? Label({ htmlFor: id }, [props.label]) : null,
    control,
    props.description
      ? simpleView("div", "tn-form-field__description", { id: descriptionId }, [
          props.description,
        ])
      : null,
    props.error
      ? simpleView(
          "div",
          "tn-form-field__error",
          { id: errorId, role: "alert" },
          [props.error],
        )
      : null,
  ]);
}

export function Badge(props = {}, children = []) {
  const variant = props.variant || "default";
  return simpleView(
    "span",
    classNames("tn-badge", `tn-badge--${variant}`),
    props,
    children,
  );
}

export function Avatar(props = {}) {
  const root = document.createElement("span");
  const fallback = document.createElement("span");
  root.className = classNames(
    "tn-avatar",
    `tn-avatar--${props.size || "md"}`,
    props.class,
  );
  applyElementProps(root, props);
  fallback.className = "tn-avatar__fallback";
  fallback.textContent = props.fallback || props.alt?.slice(0, 1) || "";
  const children = [];
  if (props.src) {
    const image = document.createElement("img");
    image.className = "tn-avatar__image";
    image.src = props.src;
    image.alt = props.alt || "";
    image.addEventListener("error", () => image.remove());
    children.push(image);
  }
  children.push(fallback);
  return elementView(root, children, props);
}

export function Card(props = {}, children = []) {
  return simpleView("section", "tn-card", props, children);
}

export function CardHeader(props = {}, children = []) {
  return simpleView("header", "tn-card__header", props, children);
}

export function CardTitle(props = {}, children = []) {
  return simpleView("h3", "tn-card__title", props, children);
}

export function CardDescription(props = {}, children = []) {
  return simpleView("p", "tn-card__description", props, children);
}

export function CardContent(props = {}, children = []) {
  return simpleView("div", "tn-card__content", props, children);
}

export function CardFooter(props = {}, children = []) {
  return simpleView("footer", "tn-card__footer", props, children);
}

export function Table(props = {}, children = []) {
  const wrapper = simpleView("div", "tn-table-wrap", {}, [
    simpleView("table", "tn-table", props, children),
  ]);
  return wrapper;
}

export function TableHeader(props = {}, children = []) {
  return simpleView("thead", "tn-table__header", props, children);
}

export function TableBody(props = {}, children = []) {
  return simpleView("tbody", "tn-table__body", props, children);
}

export function TableRow(props = {}, children = []) {
  return simpleView("tr", "tn-table__row", props, children);
}

export function TableHead(props = {}, children = []) {
  return simpleView("th", "tn-table__head", props, children);
}

export function TableCell(props = {}, children = []) {
  return simpleView("td", "tn-table__cell", props, children);
}

export function Separator(props = {}) {
  const orientation = props.orientation || "horizontal";
  return simpleView(
    "div",
    classNames("tn-separator", `tn-separator--${orientation}`),
    {
      ...props,
      attributes: {
        ...props.attributes,
        "aria-orientation": props.decorative ? null : orientation,
      },
      role: props.decorative ? "none" : "separator",
    },
  );
}

export function Spinner(props = {}) {
  return simpleView(
    "span",
    classNames("tn-spinner", `tn-spinner--${props.size || "md"}`),
    { ...props, role: "status", ariaLabel: props.label || "加载中" },
  );
}

export function Skeleton(props = {}) {
  return simpleView("div", "tn-skeleton", {
    ...props,
    ariaLabel: props.label || "内容加载中",
    role: "status",
  });
}

export function Progress(props = {}) {
  const resolved = resolveModel(props, ProgressModel, props);
  const model = resolved.model;
  const root = document.createElement("div");
  const indicator = document.createElement("div");
  root.className = classNames("tn-progress", props.class);
  indicator.className = "tn-progress__indicator";
  root.setAttribute("role", "progressbar");
  const view = elementView(root, [indicator], props);

  function sync() {
    const state = modelState(model);
    const max = Number(state.max || 100);
    const value = Number(state.value || 0);
    const indeterminate = Boolean(state.indeterminate);
    root.className = classNames(
      "tn-progress",
      indeterminate && "is-indeterminate",
      props.class,
    );
    setAttribute(root, "aria-valuemin", indeterminate ? null : 0);
    setAttribute(root, "aria-valuemax", indeterminate ? null : max);
    setAttribute(root, "aria-valuenow", indeterminate ? null : value);
    indicator.style.width = indeterminate
      ? "40%"
      : `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
  }

  const unsubscribe = subscribeModel(model, sync);
  sync();
  return attachModel(view, model, unsubscribe, resolved.owned);
}

export function Alert(props = {}, children = []) {
  const variant = props.variant || "info";
  const iconName =
    variant === "info" ? "info" : variant === "success" ? "check" : "warning";
  return simpleView(
    "div",
    classNames("tn-alert", `tn-alert--${variant}`),
    { ...props, role: props.role || "status" },
    [
      Timeless.Icon({ name: iconName, class: "tn-alert__icon" }),
      simpleView("div", "tn-alert__content", {}, children),
    ],
  );
}

export function AlertTitle(props = {}, children = []) {
  return simpleView("div", "tn-alert__title", props, children);
}

export function AlertDescription(props = {}, children = []) {
  return simpleView("div", "tn-alert__description", props, children);
}

export function EmptyState(props = {}, children = []) {
  return simpleView("div", "tn-empty-state", props, [
    props.icon
      ? simpleView("div", "tn-empty-state__icon", {}, [props.icon])
      : null,
    props.title
      ? simpleView("h3", "tn-empty-state__title", {}, [props.title])
      : null,
    props.description
      ? simpleView("p", "tn-empty-state__description", {}, [props.description])
      : null,
    children.length
      ? simpleView("div", "tn-empty-state__actions", {}, children)
      : null,
  ]);
}

export const MemoCard = createMemoCardComponent({
  Avatar,
  Badge,
  Button,
  Icon,
  IconButton,
  Popover,
  applyElementProps,
  classNames,
  modelState,
  resolveModel,
  setAttribute,
  subscribeModel,
});
export const SmallCalendar = createSmallCalendarComponent({
  Button,
  Icon,
  IconButton,
  applyElementProps,
  attachModel,
  classNames,
  elementView,
  resolveModel,
  setAttribute,
  subscribeModel,
});

registerFormComponents();
