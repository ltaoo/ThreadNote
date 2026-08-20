import { Timeless } from "./timeless-icons.js";

let componentId = 0;

export function nextId(prefix) {
  componentId += 1;
  return `${prefix}-${componentId}`;
}

export function classNames(...values) {
  return values
    .flat(Infinity)
    .filter(Boolean)
    .map((value) => (typeof value === "string" ? value : value.toString()))
    .join(" ");
}

export function setAttribute(element, name, value) {
  if (value === undefined || value === null || value === false) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value === true ? "" : String(value));
}

export function applyElementProps(element, props = {}) {
  const attributes = { ...(props.attributes || {}) };
  if (props.id !== undefined) attributes.id = props.id;
  if (props.title !== undefined) attributes.title = props.title;
  if (props.role !== undefined) attributes.role = props.role;
  if (props.tabIndex !== undefined) attributes.tabindex = props.tabIndex;
  if (props.ariaLabel !== undefined) attributes["aria-label"] = props.ariaLabel;
  Object.entries(attributes).forEach(([name, value]) => {
    setAttribute(element, name, value);
  });
  Object.entries(props.dataset || {}).forEach(([name, value]) => {
    setAttribute(element, `data-${name}`, value);
  });
  if (props.style) {
    if (typeof props.style === "string") {
      element.style.cssText = props.style;
    } else {
      Object.assign(element.style, props.style.value || props.style);
    }
  }
}

function appendChild(element, child, childViews) {
  if (child === undefined || child === null || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((entry) => appendChild(element, entry, childViews));
    return;
  }
  if (typeof child === "function") {
    appendChild(element, child(), childViews);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    element.appendChild(document.createTextNode(String(child)));
    return;
  }
  if (typeof window !== "undefined" && child instanceof window.Node) {
    element.appendChild(child);
    return;
  }
  if (child && typeof child.render === "function") {
    const childElement = child.render();
    if (childElement) element.appendChild(childElement);
    childViews.push(child);
  }
}

export function elementView(element, children = [], lifecycle = {}) {
  const childViews = [];
  let rendered = false;
  return {
    t: "view",
    $elm: element,
    append(child) {
      children.push(child);
      if (rendered) appendChild(element, child, childViews);
    },
    render() {
      if (!rendered) {
        appendChild(element, children, childViews);
        rendered = true;
      }
      return element;
    },
    onMounted() {
      lifecycle.onMounted?.(element);
      childViews.forEach((child) => child.onMounted?.());
    },
    beforeUnmounted() {
      lifecycle.beforeUnmounted?.(element);
      childViews.forEach((child) => child.beforeUnmounted?.());
    },
    onUnmounted() {
      lifecycle.onUnmounted?.(element);
      childViews.forEach((child) => child.onUnmounted?.());
    },
  };
}

export function simpleView(tag, baseClass, props = {}, children = []) {
  const { as, class: extraClass } = props;
  const element = document.createElement(as || tag);
  element.className = classNames(baseClass, extraClass);
  applyElementProps(element, props);
  return elementView(element, children, props);
}

export function modelState(model) {
  return (model && model.state) || {};
}

export function subscribeModel(model, listener) {
  if (model && typeof model.onStateChange === "function") {
    return model.onStateChange(listener) || (() => {});
  }
  if (model && typeof model.subscribe === "function") {
    const unsubscribe = model.subscribe(listener);
    if (typeof unsubscribe === "function") return unsubscribe;
  }
  return () => {};
}

export function attachModel(view, model, unsubscribe, owned) {
  const originalUnmounted = view.onUnmounted.bind(view);
  view.model = model;
  view.onUnmounted = function () {
    unsubscribe?.();
    originalUnmounted();
    if (owned && typeof model.destroy === "function") model.destroy();
  };
  return view;
}

export function resolveModel(props, ModelType, options) {
  const providedModel = props.model || props.store;
  return {
    model: providedModel || new ModelType(options),
    owned: !providedModel,
  };
}

export function callModel(model, methods, ...args) {
  const method = methods.find((name) => typeof model?.[name] === "function");
  return method ? model[method](...args) : undefined;
}

export function portalView(rootView, lifecycle = {}) {
  const marker = document.createComment("threadnote-portal");
  let attached = false;
  return {
    t: "view",
    $elm: marker,
    render() {
      rootView.render();
      if (!attached) {
        document.body.appendChild(rootView.$elm);
        attached = true;
      }
      return marker;
    },
    onMounted() {
      rootView.onMounted?.();
      lifecycle.onMounted?.();
    },
    beforeUnmounted() {
      rootView.beforeUnmounted?.();
      lifecycle.beforeUnmounted?.();
    },
    onUnmounted() {
      lifecycle.onUnmounted?.();
      rootView.onUnmounted?.();
      rootView.$elm.remove();
      marker.remove();
      attached = false;
    },
  };
}

export function placePopover(trigger, content, placement, offset) {
  const triggerRect = trigger.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const [side, align = "center"] = placement.split("-");
  const horizontal = side === "top" || side === "bottom";
  let x = horizontal
    ? triggerRect.left + (triggerRect.width - contentRect.width) / 2
    : side === "left"
      ? triggerRect.left - contentRect.width - offset
      : triggerRect.right + offset;
  let y = horizontal
    ? side === "top"
      ? triggerRect.top - contentRect.height - offset
      : triggerRect.bottom + offset
    : triggerRect.top + (triggerRect.height - contentRect.height) / 2;
  if (horizontal && align === "start") x = triggerRect.left;
  if (horizontal && align === "end") x = triggerRect.right - contentRect.width;
  if (!horizontal && align === "start") y = triggerRect.top;
  if (!horizontal && align === "end") y = triggerRect.bottom - contentRect.height;
  const margin = 8;
  x = Math.min(window.innerWidth - contentRect.width - margin, Math.max(margin, x));
  y = Math.min(window.innerHeight - contentRect.height - margin, Math.max(margin, y));
  content.style.left = `${Math.round(x)}px`;
  content.style.top = `${Math.round(y)}px`;
}

export function Icon(props = {}) {
  return Timeless.Icon({
    ...props,
    class: classNames("tn-icon", props.class),
    name: props.name || "info",
  });
}
