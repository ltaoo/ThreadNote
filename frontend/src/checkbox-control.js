import {
  renderTimelessView,
  unmountTimelessView,
} from "./timeless-view-mount.js";

const checkbox_store_key = Symbol("threadnote.checkbox.store");
let checkbox_component_promise = null;

export function forwardCheckboxStoreChange(
  control,
  store,
  EventType = globalThis.Event,
) {
  if (!control || typeof store?.onChange !== "function") return function () {};
  return store.onChange(function () {
    control.dispatchEvent(new EventType("change", { bubbles: true }));
  });
}

function load_checkbox_component() {
  if (globalThis.tn?.Checkbox) return Promise.resolve(globalThis.tn.Checkbox);
  if (!checkbox_component_promise) {
    checkbox_component_promise = import("./tnui.js").then(
      ({ tn }) => tn.Checkbox,
    );
  }
  return checkbox_component_promise;
}

export function setCheckboxControlValue(control, checked) {
  const value = Boolean(checked);
  control?.[checkbox_store_key]?.setValue?.(value, { silence: true });
  if (control && !control[checkbox_store_key]) control.checked = value;
  control?.closest?.("tn-checkbox")?.toggleAttribute("checked", value);
  return value;
}

export function registerCheckboxElement(tag_name = "tn-checkbox") {
  if (
    typeof window === "undefined" ||
    !window.customElements ||
    window.customElements.get(tag_name)
  ) return;

  const Runtime = window.Timeless;
  const CheckboxCore = Runtime.vm?.CheckboxCore || Runtime.ui?.CheckboxCore;
  if (!CheckboxCore) return;

  class ThreadNoteCheckboxElement extends window.HTMLElement {
    static get observedAttributes() {
      return ["checked", "disabled", "indeterminate"];
    }

    get checked() {
      if (this._checkbox_store) {
        return Boolean(this._checkbox_store.state?.checked);
      }
      return this.hasAttribute("checked");
    }

    set checked(value) {
      this.toggleAttribute("checked", Boolean(value));
    }

    async connectedCallback() {
      if (this._checkbox_view) return;
      const connection_token = Symbol("checkbox-connection");
      this._checkbox_connection_token = connection_token;
      const Checkbox = await load_checkbox_component();
      if (
        this._checkbox_connection_token !== connection_token ||
        !this.isConnected ||
        this._checkbox_view
      ) return;
      if (!this.dataset.n) this.dataset.n = "embedded-checkbox-host";
      const store = new CheckboxCore({
        checked: this.hasAttribute("checked"),
        disabled: this.hasAttribute("disabled"),
        indeterminate: this.hasAttribute("indeterminate"),
      });
      const view = Checkbox({
        store,
        id: this.getAttribute("id") || undefined,
        attributes: { n: "embedded-checkbox" },
      });
      this._checkbox_store = store;
      this._checkbox_view = view;
      renderTimelessView(this, view, { runtime: Runtime });
      this._checkbox_change_unsubscribe = forwardCheckboxStoreChange(
        this,
        store,
        window.Event,
      );
      const input = this.querySelector("input");
      if (input) {
        input[checkbox_store_key] = store;
        this._checkbox_native_change_listener = function (event) {
          event.stopPropagation();
        };
        input.addEventListener("change", this._checkbox_native_change_listener);
      }
    }

    disconnectedCallback() {
      this._checkbox_connection_token = null;
      const input = this.querySelector("input");
      if (input && this._checkbox_native_change_listener) {
        input.removeEventListener(
          "change",
          this._checkbox_native_change_listener,
        );
      }
      this._checkbox_native_change_listener = null;
      this._checkbox_change_unsubscribe?.();
      this._checkbox_change_unsubscribe = null;
      unmountTimelessView(this);
      this._checkbox_view = null;
      this._checkbox_store?.destroy?.();
      this._checkbox_store = null;
    }

    attributeChangedCallback(name) {
      const store = this._checkbox_store;
      if (!store) return;
      if (name === "checked") {
        store.setValue?.(this.hasAttribute("checked"), { silence: true });
      }
      if (name === "disabled") store.setDisabled?.(this.hasAttribute("disabled"));
      if (name === "indeterminate") {
        store.setIndeterminate?.(this.hasAttribute("indeterminate"));
      }
    }
  }

  window.customElements.define(tag_name, ThreadNoteCheckboxElement);
}
