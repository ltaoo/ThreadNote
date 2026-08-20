function dataValue(element, name) {
  const value = element.getAttribute(`data-${name}`);
  return value === null ? undefined : value;
}

function optionFromElement(element) {
  return {
    color: dataValue(element, "color"),
    count: dataValue(element, "count"),
    description: dataValue(element, "description"),
    disabled: element.hasAttribute("disabled"),
    kind: dataValue(element, "kind"),
    label: element.getAttribute("label") || element.textContent.trim(),
    selected: element.hasAttribute("selected"),
    value: element.getAttribute("value") ?? element.textContent.trim(),
  };
}

function parseOptionChildren(element) {
  return Array.from(element.children || []).flatMap((child) => {
    if (child.localName === "option") return [optionFromElement(child)];
    if (child.localName !== "optgroup") return [];
    return [{
      disabled: child.hasAttribute("disabled"),
      label: child.getAttribute("label") || "",
      options: Array.from(child.children || [])
        .filter((option) => option.localName === "option")
        .map(optionFromElement),
    }];
  });
}

function flattenOptions(options) {
  return (Array.isArray(options) ? options : []).flatMap((option) =>
    Array.isArray(option?.options) ? flattenOptions(option.options) : [option],
  );
}

function defaultSelectValue(options) {
  const entries = flattenOptions(options).filter(Boolean);
  return entries.find((option) => option.selected)?.value
    ?? entries.find((option) => !option.disabled)?.value
    ?? "";
}

function optionFacade(option) {
  return {
    disabled: Boolean(option.disabled),
    label: option.label ?? String(option.value ?? ""),
    selected: Boolean(option.selected),
    text: option.label ?? String(option.value ?? ""),
    textContent: option.label ?? String(option.value ?? ""),
    value: String(option.value ?? ""),
  };
}

function dispatchControlEvent(element, type, bubbles = true) {
  element.dispatchEvent(new Event(type, { bubbles }));
}

function upgradeProperty(element, property) {
  if (!Object.prototype.hasOwnProperty.call(element, property)) return;
  const value = element[property];
  delete element[property];
  element[property] = value;
}

function hasDeclarativeOptions(element) {
  return Array.from(element.children || []).some((child) =>
    child.localName === "option" || child.localName === "optgroup",
  );
}

function registerSelectElement(windowObject, tagName, Component) {
  if (windowObject.customElements.get(tagName)) return;

  class TimelessSelectElement extends windowObject.HTMLElement {
    static get observedAttributes() {
      return ["disabled", "name", "value"];
    }

    connectedCallback() {
      upgradeProperty(this, "disabled");
      upgradeProperty(this, "value");
      if (!this._select_observer) {
        this._select_observer = new windowObject.MutationObserver(() => {
          if (!hasDeclarativeOptions(this)) return;
          this._scheduleSelectMount(true);
        });
        this._select_observer.observe(this, { childList: true, subtree: true });
      }
      this._scheduleSelectMount(false);
    }

    disconnectedCallback() {
      const view = this._select_view;
      windowObject.queueMicrotask(() => {
        if (this.isConnected || this._select_view !== view) return;
        this._destroySelectView();
        this._select_observer?.disconnect();
        this._select_observer = null;
      });
    }

    attributeChangedCallback(name) {
      const model = this._select_view?.model;
      if (name === "disabled") model?.setDisabled?.(this.hasAttribute("disabled"));
      if (name === "name" && this._select_view?.control) {
        this._select_view.control.name = this.getAttribute("name") || "";
      }
      if (name === "value" && model) {
        this._current_value = this.getAttribute("value") || "";
        model.setValue?.(this._current_value, { silent: true });
      }
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }

    set disabled(value) {
      this.toggleAttribute("disabled", Boolean(value));
    }

    get options() {
      const options = hasDeclarativeOptions(this)
        ? parseOptionChildren(this)
        : this._select_options || [];
      return flattenOptions(options).map(optionFacade);
    }

    get selectedOptions() {
      return this.options.filter((option) => option.value === this.value);
    }

    get selectedIndex() {
      return this.options.findIndex((option) => option.value === this.value);
    }

    set selectedIndex(index) {
      const option = this.options[Number(index)];
      this.value = option ? option.value : "";
    }

    get value() {
      if (this._current_value !== undefined) return String(this._current_value);
      const value = this._select_view?.model?.state?.value;
      return value === null || value === undefined ? "" : String(value);
    }

    set value(value) {
      this._current_value = value === null || value === undefined ? "" : String(value);
      this._select_view?.model?.setValue?.(this._current_value, { silent: true });
    }

    focus(options) {
      this._select_view?.trigger?.focus(options);
    }

    _scheduleSelectMount(refreshOptions) {
      if (refreshOptions) this._refresh_select_options = true;
      if (this._select_mount_scheduled) return;
      this._select_mount_scheduled = true;
      windowObject.queueMicrotask(() => {
        this._select_mount_scheduled = false;
        if (!this.isConnected) return;
        if (this._select_view && !this._refresh_select_options) return;
        this._mountSelect();
      });
    }

    _destroySelectView() {
      const view = this._select_view;
      if (!view) return;
      view.beforeUnmounted?.();
      view.onUnmounted?.();
      this._select_view = null;
      if (this._select_form) this._select_form.removeEventListener("reset", this._select_reset);
      this._select_form = null;
    }

    _mountSelect() {
      if (hasDeclarativeOptions(this)) this._select_options = parseOptionChildren(this);
      this._refresh_select_options = false;
      const options = this._select_options || [];
      const initialValue = this._current_value !== undefined
        ? this._current_value
        : this.hasAttribute("value")
          ? this.getAttribute("value")
          : defaultSelectValue(options);
      this._current_value = initialValue == null ? "" : String(initialValue);
      this._destroySelectView();
      const view = Component({
        ariaLabel: this.getAttribute("aria-label") || "选择选项",
        class: this.getAttribute("control-class") || "",
        disabled: this.hasAttribute("disabled"),
        name: this.getAttribute("name") || undefined,
        onChange: (value) => {
          this._current_value = value === null || value === undefined ? "" : String(value);
          dispatchControlEvent(this, "change");
        },
        options,
        placeholder: this.getAttribute("placeholder") || undefined,
        required: this.hasAttribute("required"),
        rootClass: this.getAttribute("root-class") || "",
        value: initialValue,
      });
      this._select_view = view;
      this.replaceChildren(view.render());
      view.onMounted?.();
      this._select_form = this.closest("form");
      this._select_reset = () => {
        view.model?.reset?.();
        const nextValue = view.model?.state?.value;
        this._current_value = nextValue == null ? "" : String(nextValue);
      };
      this._select_form?.addEventListener("reset", this._select_reset);
    }
  }

  windowObject.customElements.define(tagName, TimelessSelectElement);
}

function registerDatePickerElement(windowObject, tagName, DatePicker) {
  if (windowObject.customElements.get(tagName)) return;

  class TimelessDatePickerElement extends windowObject.HTMLElement {
    static get observedAttributes() {
      return ["disabled", "name", "value"];
    }

    connectedCallback() {
      upgradeProperty(this, "disabled");
      upgradeProperty(this, "value");
      if (this._date_picker_view) return;
      const initialValue = this._current_value !== undefined
        ? this._current_value
        : this.getAttribute("value") || "";
      this._current_value = initialValue;
      const view = DatePicker({
        ariaLabel: this.getAttribute("aria-label") || "选择日期时间",
        class: this.getAttribute("control-class") || "",
        disabled: this.hasAttribute("disabled"),
        minuteStep: Number(this.getAttribute("step")) || 1,
        mode: this.getAttribute("mode") || this.getAttribute("type") || "date",
        name: this.getAttribute("name") || undefined,
        onChange: (value) => {
          this._current_value = value || "";
          dispatchControlEvent(this, "change");
        },
        placeholder: this.getAttribute("placeholder") || undefined,
        rootClass: this.getAttribute("root-class") || "",
        value: initialValue,
      });
      this._date_picker_view = view;
      this.replaceChildren(view.render());
      view.onMounted?.();
      this._date_picker_form = this.closest("form");
      this._date_picker_reset = () => {
        view.model?.reset?.();
        this._current_value = view.model?.state?.value || "";
      };
      this._date_picker_form?.addEventListener("reset", this._date_picker_reset);
      this._date_picker_focusout = () => {
        windowObject.queueMicrotask(() => {
          if (
            !this.contains(windowObject.document.activeElement)
            && !view.panel?.contains(windowObject.document.activeElement)
          ) {
            dispatchControlEvent(this, "blur", false);
          }
        });
      };
      this.addEventListener("focusout", this._date_picker_focusout);
    }

    disconnectedCallback() {
      const view = this._date_picker_view;
      windowObject.queueMicrotask(() => {
        if (this.isConnected || this._date_picker_view !== view) return;
        view?.beforeUnmounted?.();
        view?.onUnmounted?.();
        this._date_picker_view = null;
        this._date_picker_form?.removeEventListener("reset", this._date_picker_reset);
        this._date_picker_form = null;
        this.removeEventListener("focusout", this._date_picker_focusout);
      });
    }

    attributeChangedCallback(name) {
      const view = this._date_picker_view;
      if (name === "disabled") view?.model?.setDisabled?.(this.hasAttribute("disabled"));
      if (name === "name" && view?.control) view.control.name = this.getAttribute("name") || "";
      if (name === "value" && view?.model) {
        this._current_value = this.getAttribute("value") || "";
        view.model.setValue?.(this._current_value, { silent: true });
      }
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }

    set disabled(value) {
      this.toggleAttribute("disabled", Boolean(value));
    }

    get value() {
      return this._current_value || "";
    }

    set value(value) {
      this._current_value = value === null || value === undefined ? "" : String(value);
      this._date_picker_view?.model?.setValue?.(this._current_value, { silent: true });
    }

    focus(options) {
      this._date_picker_view?.trigger?.focus(options);
    }
  }

  windowObject.customElements.define(tagName, TimelessDatePickerElement);
}

export function registerFormComponentElements(deps) {
  if (typeof window === "undefined" || !window.customElements) return;
  registerSelectElement(window, "tn-select", deps.Select);
  registerSelectElement(window, "tn-project-select", deps.ProjectSelect);
  registerDatePickerElement(window, "tn-date-picker", deps.DatePicker);
}

export { defaultSelectValue, flattenOptions, parseOptionChildren };
