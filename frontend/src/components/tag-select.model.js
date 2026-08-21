import { ComponentModel } from "@/component-models.js";
import { TimelessPrimitive } from "@/timeless-icons.js";

let tag_select_id = 0;

function option_value(value) {
  return String(value ?? "").trim();
}

function normalize_option(option, index) {
  const value = option_value(option?.value ?? option?.tag);
  return Object.freeze({
    count: Math.max(0, Number(option?.count) || 0),
    disabled: Boolean(option?.disabled),
    key: value || `tag-${index}`,
    label: String(option?.label ?? (value ? `#${value}` : "标签")),
    searchText: String(option?.searchText ?? option?.label ?? value)
      .trim()
      .toLocaleLowerCase(),
    value,
  });
}

function normalize_options(options) {
  return Object.freeze(
    (Array.isArray(options) ? options : [])
      .map(normalize_option)
      .filter((option) => option.value),
  );
}

function normalize_values(values) {
  return Object.freeze(
    Array.from(
      new Set(
        (Array.isArray(values) ? values : [values])
          .map(option_value)
          .filter(Boolean),
      ),
    ),
  );
}

function values_equal(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function options_key(options) {
  return JSON.stringify(
    options.map((option) => [
      option.value,
      option.label,
      option.count,
      option.disabled,
    ]),
  );
}

function resolve_element(element) {
  let resolved = element || null;
  for (let depth = 0; depth < 3 && resolved; depth += 1) {
    if (typeof resolved.get$elm === "function") {
      const next_element = resolved.get$elm();
      if (!next_element || next_element === resolved) break;
      resolved = next_element;
      continue;
    }
    if (resolved.$el && resolved.$el !== resolved) {
      resolved = resolved.$el;
      continue;
    }
    break;
  }
  return resolved;
}

export class TagSelectModel extends ComponentModel {
  constructor(options = {}) {
    const runtime = options.runtime || TimelessPrimitive;
    if (!runtime?.vm?.PopperCore || !runtime?.vm?.PresenceCore) {
      throw new Error("TagSelectModel requires the Timeless VM runtime");
    }

    const normalized_options = normalize_options(options.options);
    super({
      activeIndex: normalized_options.findIndex((option) => !option.disabled),
      disabled: Boolean(options.disabled),
      open: false,
      options: normalized_options,
      placeholder: String(options.placeholder || "标签"),
      query: "",
      values: normalize_values(options.values ?? options.defaultValues),
    });

    tag_select_id += 1;
    this.id = `tag-select-${tag_select_id}`;
    this.list_id = `${this.id}-listbox`;
    const popper_options = {
      align: "start",
      offsetY: 8,
      side: "bottom",
      strategy: "fixed",
    };
    const popper_platform = options.platform || runtime.DOM?.platform;
    if (popper_platform) popper_options.platform = popper_platform;
    this.popper = new runtime.vm.PopperCore(popper_options);
    this.presence = new runtime.vm.PresenceCore();
    this._destroyed = false;
    this._floating_element = null;
    this._on_change = typeof options.onChange === "function"
      ? options.onChange
      : null;
    this._options_key = options_key(normalized_options);
    this._search_element = null;
    this._suppress_next_trigger_click = false;
    this._trigger_click_suppression_timer = null;
    this._trigger_element = null;
    this._value_listeners = new Set();
  }

  get values() {
    return this.state.values;
  }

  onStateChange(listener) {
    return this.subscribe(listener);
  }

  onValueChange(listener) {
    if (typeof listener !== "function") return () => {};
    this._value_listeners.add(listener);
    return () => this._value_listeners.delete(listener);
  }

  filteredOptions(state = this.state) {
    const query = state.query.trim().toLocaleLowerCase();
    if (!query) return state.options;
    return state.options.filter((option) => option.searchText.includes(query));
  }

  selectedCount(state = this.state) {
    return state.values.length;
  }

  triggerLabel(state = this.state) {
    return state.placeholder;
  }

  resultSummary(state = this.state) {
    const visible_count = this.filteredOptions(state).length;
    if (state.query.trim()) return `${visible_count} 个搜索结果`;
    return `${state.options.length} 个标签`;
  }

  isSelected(value, state = this.state) {
    return state.values.includes(option_value(value));
  }

  optionId(option) {
    const safe_key = encodeURIComponent(option?.key || "tag").replaceAll(
      "%",
      "_",
    );
    return `${this.id}-option-${safe_key}`;
  }

  activeDescendant(state = this.state) {
    const option = this.filteredOptions(state)[state.activeIndex];
    return option ? this.optionId(option) : "";
  }

  setOptions(options) {
    const normalized_options = normalize_options(options);
    const next_options_key = options_key(normalized_options);
    if (next_options_key === this._options_key) return;
    this._options_key = next_options_key;
    const filtered_options = this.filteredOptions({
      ...this.state,
      options: normalized_options,
    });
    this.setState({
      activeIndex: this._preferred_active_index(filtered_options),
      options: normalized_options,
    });
    if (this.state.open) void this.placePopper();
  }

  setValues(values, options = {}) {
    const next_values = normalize_values(values);
    if (values_equal(next_values, this.state.values)) return this.state.values;
    this.setState({ values: next_values });
    if (!options.silent) {
      this._on_change?.(next_values, options.event);
      this._value_listeners.forEach((listener) => {
        listener(next_values, options.event);
      });
    }
    return next_values;
  }

  toggleValue(value, event) {
    const next_value = option_value(value);
    const option = this.state.options.find(
      (entry) => entry.value === next_value,
    );
    if (!option || option.disabled) return false;
    const next_values = this.isSelected(next_value)
      ? this.state.values.filter((item) => item !== next_value)
      : this.state.values.concat(next_value);
    this.setValues(next_values, { event });
    this.setActiveValue(next_value);
    return true;
  }

  clear(event) {
    this.setValues([], { event });
  }

  setQuery(query) {
    const next_query = String(query ?? "");
    const filtered_options = this.filteredOptions({
      ...this.state,
      query: next_query,
    });
    this.setState({
      activeIndex: this._preferred_active_index(filtered_options),
      query: next_query,
    });
    if (this.state.open) void this.placePopper();
  }

  open() {
    if (this.state.disabled || this.state.open) return false;
    const filtered_options = this.filteredOptions({
      ...this.state,
      query: "",
    });
    this.setState({
      activeIndex: this._preferred_active_index(filtered_options),
      open: true,
      query: "",
    });
    this.presence.show();
    queueMicrotask(() => {
      if (this._destroyed || !this.state.open) return;
      this._search_element?.focus?.({ preventScroll: true });
      void this.placePopper();
    });
    return true;
  }

  close(options = {}) {
    if (!this.state.open && !this.presence.state.visible) return false;
    this.setState({ open: false, query: "" });
    this.presence.hide();
    if (options.restoreFocus) {
      queueMicrotask(() => {
        this._trigger_element?.focus?.({ preventScroll: true });
      });
    }
    return true;
  }

  toggle(options = {}) {
    if (this.state.open) return this.close(options);
    return this.open(options);
  }

  moveActive(direction) {
    const options = this.filteredOptions();
    if (!options.length) {
      this.setState({ activeIndex: -1 });
      return null;
    }
    const step = direction < 0 ? -1 : 1;
    let index = this.state.activeIndex;
    for (let attempt = 0; attempt < options.length; attempt += 1) {
      index = (index + step + options.length) % options.length;
      if (!options[index].disabled) {
        this.setState({ activeIndex: index });
        return options[index];
      }
    }
    return null;
  }

  setActiveValue(value) {
    const next_value = option_value(value);
    const index = this.filteredOptions().findIndex(
      (option) => option.value === next_value,
    );
    if (index < 0 || this.filteredOptions()[index]?.disabled) return;
    this.setState({ activeIndex: index });
  }

  toggleActive(event) {
    const option = this.filteredOptions()[this.state.activeIndex];
    if (!option) return false;
    return this.toggleValue(option.value, event);
  }

  handleTriggerKeyDown(event) {
    this.ensureTriggerElement(event);
    if (this.state.disabled) return false;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") {
        this._suppress_trigger_click_once();
      }
      if (!this.state.open) this.open({ event });
      return true;
    }
    if (event.key === "Escape" && this.state.open) {
      event.preventDefault();
      this.close({ restoreFocus: true });
      return true;
    }
    return false;
  }

  handleTriggerPointerDown(event) {
    this.ensureTriggerElement(event);
    if (this.state.disabled) return false;
    event.preventDefault();
    event.stopPropagation();
    this._suppress_trigger_click_once();
    this.toggle({ event });
    return true;
  }

  handleTriggerClick(event) {
    this.ensureTriggerElement(event);
    const preceding_event_handled = this._consume_trigger_click_suppression();
    if (!preceding_event_handled && !this.state.disabled) {
      this.toggle({ event });
    }
    return true;
  }

  handleSearchKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.moveActive(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if ((event.key === "Enter" || event.key === " ") && !event.isComposing) {
      event.preventDefault();
      return this.toggleActive(event);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close({ restoreFocus: true });
      return true;
    }
    return false;
  }

  setTriggerElement(element) {
    const trigger_element = resolve_element(element);
    this._trigger_element = trigger_element || null;
    if (!trigger_element) {
      this.popper.removeReference?.();
      return;
    }
    this.popper.setReference(
      {
        $el: trigger_element,
        getRect() {
          return trigger_element.getBoundingClientRect();
        },
      },
      { force: true },
    );
  }

  ensureTriggerElement(event) {
    const trigger_element = resolve_element(
      event?.currentTarget || event?.target,
    );
    if (
      trigger_element &&
      (trigger_element !== this._trigger_element || !this.popper.reference)
    ) {
      this.setTriggerElement(trigger_element);
    }
    return trigger_element;
  }

  setSearchElement(element) {
    this._search_element = resolve_element(element);
    if (this._search_element && this.state.open) {
      queueMicrotask(() => this._search_element?.focus?.({ preventScroll: true }));
    }
  }

  handlePopperContentMounted(element) {
    this._floating_element = resolve_element(element);
    queueMicrotask(() => {
      if (this.state.open) void this.placePopper();
    });
  }

  handlePopperContentUnmounted() {
    this._floating_element = null;
  }

  handlePopperDismiss() {
    return this.close();
  }

  handleAnimationEnd() {
    this.presence.handleAnimationEnd();
  }

  placePopper() {
    if (typeof this.popper.place !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(this.popper.place()).then(() => true, () => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  _preferred_active_index(options) {
    const selected_index = options.findIndex(
      (option) => this.isSelected(option.value) && !option.disabled,
    );
    if (selected_index >= 0) return selected_index;
    return options.findIndex((option) => !option.disabled);
  }

  _suppress_trigger_click_once() {
    this._suppress_next_trigger_click = true;
    globalThis.clearTimeout?.(this._trigger_click_suppression_timer);
    this._trigger_click_suppression_timer = globalThis.setTimeout?.(() => {
      this._suppress_next_trigger_click = false;
      this._trigger_click_suppression_timer = null;
    }, 1000);
  }

  _consume_trigger_click_suppression() {
    const suppressed = this._suppress_next_trigger_click;
    this._suppress_next_trigger_click = false;
    globalThis.clearTimeout?.(this._trigger_click_suppression_timer);
    this._trigger_click_suppression_timer = null;
    return suppressed;
  }

  destroy() {
    this._destroyed = true;
    this._consume_trigger_click_suppression();
    this.presence.reset?.();
    this.popper.reset?.();
    this.presence.destroy?.();
    this.popper.destroy?.();
    this._value_listeners.clear();
    this._floating_element = null;
    this._search_element = null;
    this._trigger_element = null;
    super.destroy();
  }
}
