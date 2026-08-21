import { ComponentModel } from "@/component-models.js";
import { TimelessPrimitive } from "@/timeless-icons.js";

let project_select_id = 0;

function option_value(value) {
  return value == null ? "" : String(value);
}

function normalize_option(option, index) {
  const value = option_value(option?.value);
  return Object.freeze({
    color: option?.color || "",
    count: Math.max(0, Number(option?.count) || 0),
    disabled: Boolean(option?.disabled),
    label: String(option?.label ?? value),
    searchText: String(option?.searchText ?? option?.label ?? value)
      .trim()
      .toLocaleLowerCase(),
    value,
    key: value || `unassigned-${index}`,
  });
}

function normalize_options(options) {
  return Object.freeze(
    (Array.isArray(options) ? options : []).map(normalize_option),
  );
}

function options_equal(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((option, index) => {
    const candidate = right[index];
    return Boolean(
      candidate &&
        option.color === candidate.color &&
        option.count === candidate.count &&
        option.disabled === candidate.disabled &&
        option.key === candidate.key &&
        option.label === candidate.label &&
        option.searchText === candidate.searchText &&
        option.value === candidate.value,
    );
  });
}

function creation_error_message(error) {
  const message = String(error?.message || error || "").trim();
  return message || "创建 Project 失败，请稍后重试";
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

function rect_snapshot(target) {
  const element = resolve_element(target);
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }
  try {
    const rect = element.getBoundingClientRect();
    return {
      bottom: Number(rect.bottom) || 0,
      height: Number(rect.height) || 0,
      left: Number(rect.left) || 0,
      right: Number(rect.right) || 0,
      top: Number(rect.top) || 0,
      width: Number(rect.width) || 0,
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
    };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

function element_snapshot(target) {
  const element = resolve_element(target);
  if (!element) return null;
  return {
    connected: Boolean(element.isConnected),
    id: String(element.id || ""),
    semanticName: String(
      element.getAttribute?.("data-n") || element.getAttribute?.("n") || "",
    ),
    tagName: String(element.tagName || element.nodeName || "unknown"),
  };
}

function event_snapshot(event) {
  if (!event) return null;
  return {
    button: Number(event.button) || 0,
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
    defaultPrevented: Boolean(event.defaultPrevented),
    pointerId: Number(event.pointerId) || 0,
    pointerType: String(event.pointerType || "unknown"),
    target: element_snapshot(event.target),
    type: String(event.type || "unknown"),
  };
}

function style_snapshot(target) {
  const element = resolve_element(target);
  if (!element) return null;
  const inline_style = element.style || {};
  let computed_style = null;
  try {
    computed_style = globalThis.getComputedStyle?.(element) || null;
  } catch (_) {
    computed_style = null;
  }
  return {
    display: String(computed_style?.display || inline_style.display || ""),
    left: String(computed_style?.left || inline_style.left || ""),
    opacity: String(computed_style?.opacity || inline_style.opacity || ""),
    pointerEvents: String(
      computed_style?.pointerEvents || inline_style.pointerEvents || "",
    ),
    position: String(computed_style?.position || inline_style.position || ""),
    top: String(computed_style?.top || inline_style.top || ""),
    transform: String(computed_style?.transform || inline_style.transform || ""),
    zIndex: String(computed_style?.zIndex || inline_style.zIndex || ""),
  };
}

export class ProjectSelectModel extends ComponentModel {
  constructor(options = {}) {
    const runtime = options.runtime || TimelessPrimitive;
    if (
      !runtime?.vm?.DialogCore ||
      !runtime?.vm?.InputCore ||
      !runtime?.vm?.PopperCore ||
      !runtime?.vm?.PresenceCore
    ) {
      throw new Error("ProjectSelectModel requires the Timeless VM runtime");
    }

    const normalized_options = normalize_options(options.options);
    const value = option_value(options.value ?? options.defaultValue);
    super({
      activeIndex: -1,
      createError: "",
      creating: false,
      disabled: Boolean(options.disabled),
      open: false,
      options: normalized_options,
      placeholder: String(options.placeholder || "选择 Project"),
      query: "",
      value,
    });

    project_select_id += 1;
    this.id = `project-select-${project_select_id}`;
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
    const global_logger =
      globalThis.FrontendLogger || globalThis.Logger || null;
    this._logger =
      options.logger || (options.diagnostics === true ? global_logger : null);
    this._diagnostics_enabled = Boolean(this._logger);
    this._on_change = options.onChange || null;
    this._on_create_project = options.onCreateProject || null;
    this._active_interaction_id = "";
    this._created_project = null;
    this._diagnostic_unsubscribers = [];
    this._destroyed = false;
    this._floating_element = null;
    this._interaction_sequence = 0;
    this._search_element = null;
    this._suppress_next_trigger_click = false;
    this._trigger_click_suppression_timer = null;
    this._trigger_element = null;
    this._value_listeners = new Set();
    this.create_name_input = new runtime.vm.InputCore({
      allowClear: true,
      autoComplete: false,
      autoFocus: true,
      defaultValue: "",
      maxLength: 120,
      onChange: () => this.clearCreateError(),
      onEnter: () => this.createProject(),
      placeholder: "例如：产品重构",
    });
    this.create_dialog = new runtime.vm.DialogCore({
      closeable: true,
      footer: true,
      title: "Create Project",
      onOk: () => this.createProject(),
    });
    this._unsubscribe_create_dialog_hidden = this.create_dialog.onHidden(() => {
      this._restore_after_create();
    });
    this._unsubscribe_create_dialog_show = this.create_dialog.onShow(() => {
      queueMicrotask(() => this.create_name_input.focus?.());
    });
    if (
      this._diagnostics_enabled &&
      typeof this.presence.onStateChange === "function"
    ) {
      this._diagnostic_unsubscribers.push(
        this.presence.onStateChange((presence_state) => {
          this._log("debug", "presence-state-change", {
            presence: { ...presence_state },
            selectOpen: this.state.open,
          });
          this._schedule_diagnostic("presence-state-change");
        }),
      );
    }
    if (
      this._diagnostics_enabled &&
      typeof this.popper.onStateChange === "function"
    ) {
      this._diagnostic_unsubscribers.push(
        this.popper.onStateChange((popper_state) => {
          this._log(
            popper_state.isPlaced ? "info" : "debug",
            popper_state.isPlaced
              ? "popper-position-computed"
              : "popper-state-change",
            {
              floatingRect: this._floating_rect(),
              popper: { ...popper_state },
              referenceRect: this._reference_rect("popper-state-change"),
            },
          );
          if (popper_state.isPlaced) {
            this._schedule_diagnostic("popper-position-applied");
          }
        }),
      );
    }
    if (
      this._diagnostics_enabled &&
      typeof this.popper.onReferenceMounted === "function"
    ) {
      this._diagnostic_unsubscribers.push(
        this.popper.onReferenceMounted(() => {
          this._log("debug", "popper-reference-mounted", {
            referenceRect: this._reference_rect("reference-mounted-event"),
          });
        }),
      );
    }
    if (
      this._diagnostics_enabled &&
      typeof this.popper.onFloatingMounted === "function"
    ) {
      this._diagnostic_unsubscribers.push(
        this.popper.onFloatingMounted(() => {
          this._log("debug", "popper-floating-mounted", {
            floatingRect: this._floating_rect(),
            referenceRect: this._reference_rect("floating-mounted-event"),
          });
        }),
      );
    }
    if (
      this._diagnostics_enabled &&
      typeof this.popper.onReferenceOutOfView === "function"
    ) {
      this._diagnostic_unsubscribers.push(
        this.popper.onReferenceOutOfView(() => {
          this._log("warn", "popper-reference-out-of-view", {
            snapshot: this.diagnosticSnapshot(),
          });
        }),
      );
    }
    this._log("info", "initialized", {
      disabled: this.state.disabled,
      hasExplicitPlatform: Boolean(popper_platform),
      optionCount: normalized_options.length,
      popper: { ...this.popper.state },
      presence: { ...this.presence.state },
      selectedValue: value,
      viewport: this._viewport_snapshot(),
    });
    const initial_viewport = this._viewport_snapshot();
    if (!initial_viewport?.width || !initial_viewport?.height) {
      this._log("error", "popper-platform-invalid", {
        hasExplicitPlatform: Boolean(popper_platform),
        viewport: initial_viewport,
      });
    }
  }

  get value() {
    return this.state.value;
  }

  onStateChange(listener) {
    return this.subscribe(listener);
  }

  onValueChange(listener) {
    if (typeof listener !== "function") return () => {};
    this._value_listeners.add(listener);
    return () => this._value_listeners.delete(listener);
  }

  setCreateProjectHandler(handler) {
    this._on_create_project =
      typeof handler === "function" ? handler : null;
  }

  selectedOption(state = this.state) {
    return state.options.find((option) => option.value === state.value) || null;
  }

  filteredOptions(state = this.state) {
    const query = state.query.trim().toLocaleLowerCase();
    if (!query) return state.options;
    return state.options.filter((option) => option.searchText.includes(query));
  }

  optionId(option) {
    const safe_key = encodeURIComponent(option?.key || "option").replaceAll(
      "%",
      "_",
    );
    return `${this.id}-option-${safe_key}`;
  }

  activeDescendant(state = this.state) {
    const option = this.filteredOptions(state)[state.activeIndex];
    return option ? this.optionId(option) : "";
  }

  resultSummary(state = this.state) {
    const visible_count = this.filteredOptions(state).length;
    if (state.query.trim()) return `${visible_count} 个搜索结果`;
    const project_count = state.options.filter((option) => option.value).length;
    return `${project_count} 个 Project`;
  }

  setOptions(options) {
    const normalized_options = normalize_options(options);
    if (options_equal(normalized_options, this.state.options)) {
      return this.state.options;
    }
    const filtered_options = this.filteredOptions({
      ...this.state,
      options: normalized_options,
    });
    this.setState({
      activeIndex: this._preferred_active_index(
        filtered_options,
        this.state.value,
      ),
      options: normalized_options,
    });
    this._log("debug", "options-updated", {
      optionCount: normalized_options.length,
      selectOpen: this.state.open,
    });
    if (this.state.open) void this.placePopper("options-updated");
    return normalized_options;
  }

  setValue(value, options = {}) {
    const next_value = option_value(value);
    if (next_value === this.state.value) {
      this._log("debug", "value-update-skipped", { value: next_value });
      return next_value;
    }
    const previous_value = this.state.value;
    this.setState({ value: next_value });
    this._log("info", "value-updated", {
      previousValue: previous_value,
      silent: Boolean(options.silent),
      value: next_value,
    });
    if (!options.silent) {
      this._on_change?.(next_value, options.event);
      this._value_listeners.forEach((listener) => {
        listener(next_value, options.event);
      });
    }
    return next_value;
  }

  setDisabled(disabled) {
    const next_disabled = Boolean(disabled);
    if (next_disabled === this.state.disabled) return next_disabled;
    this.setState({ disabled: next_disabled });
    this._log("info", "disabled-updated", { disabled: next_disabled });
    if (next_disabled) this.close({ reason: "disabled" });
    return next_disabled;
  }

  setQuery(query) {
    const next_query = String(query ?? "");
    const filtered_options = this.filteredOptions({
      ...this.state,
      query: next_query,
    });
    this.setState({
      activeIndex: this._preferred_active_index(
        filtered_options,
        this.state.value,
      ),
      query: next_query,
    });
    this._log("debug", "query-updated", {
      query: next_query,
      resultCount: filtered_options.length,
      selectOpen: this.state.open,
    });
    if (this.state.open) void this.placePopper("query-updated");
  }

  open(options = {}) {
    const interaction_id =
      options.interactionId || this._start_interaction("open", options.event);
    this._log("info", "open-requested", {
      disabled: this.state.disabled,
      presence: { ...this.presence.state },
      referenceRect: this._reference_rect("open-requested"),
      selectOpen: this.state.open,
    }, interaction_id);
    if (this.state.disabled || this.state.open) {
      this._log("debug", "open-skipped", {
        disabled: this.state.disabled,
        selectOpen: this.state.open,
      }, interaction_id);
      return false;
    }
    const filtered_options = this.filteredOptions({
      ...this.state,
      query: "",
    });
    this.setState({
      activeIndex: this._preferred_active_index(
        filtered_options,
        this.state.value,
      ),
      open: true,
      query: "",
    });
    this.presence.show();
    this._log("info", "open-state-committed", {
      presence: { ...this.presence.state },
      referenceRect: this._reference_rect("open-state-committed"),
      selectOpen: this.state.open,
    }, interaction_id);
    this._schedule_diagnostic("open-render", {
      interactionId: interaction_id,
      place: true,
    });
    this._focus_search();
    return true;
  }

  close(options = {}) {
    const interaction_id =
      options.interactionId ||
      this._active_interaction_id ||
      this._start_interaction("close", options.event);
    this._log("info", "close-requested", {
      presence: { ...this.presence.state },
      reason: String(options.reason || "unspecified"),
      selectOpen: this.state.open,
    }, interaction_id);
    if (!this.state.open && !this.presence.state.visible) {
      this._log("debug", "close-skipped", {
        presence: { ...this.presence.state },
        selectOpen: this.state.open,
      }, interaction_id);
      return false;
    }
    this.setState({ open: false, query: "" });
    this.presence.hide();
    if (options.restoreFocus) this._focus_trigger();
    this._log("info", "close-state-committed", {
      presence: { ...this.presence.state },
      reason: String(options.reason || "unspecified"),
      selectOpen: this.state.open,
    }, interaction_id);
    return true;
  }

  toggle(options = {}) {
    const interaction_id =
      options.interactionId ||
      this._active_interaction_id ||
      this._start_interaction("toggle", options.event);
    this._log("debug", "toggle-requested", {
      selectOpen: this.state.open,
    }, interaction_id);
    if (this.state.open) {
      return this.close({
        ...options,
        interactionId: interaction_id,
        reason: options.reason || "trigger-toggle",
      });
    }
    return this.open({ ...options, interactionId: interaction_id });
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

  setActiveIndex(index) {
    const options = this.filteredOptions();
    const next_index = Number(index);
    if (!Number.isInteger(next_index) || !options[next_index]) return;
    if (options[next_index].disabled) return;
    this.setState({ activeIndex: next_index });
  }

  setActiveValue(value) {
    const next_value = option_value(value);
    const index = this.filteredOptions().findIndex(
      (option) => option.value === next_value,
    );
    this.setActiveIndex(index);
  }

  select(value, event) {
    const option = this.state.options.find(
      (entry) => entry.value === option_value(value),
    );
    this._log("info", "option-select-requested", {
      event: event_snapshot(event),
      optionDisabled: Boolean(option?.disabled),
      optionFound: Boolean(option),
      value: option_value(value),
    });
    if (!option || option.disabled) {
      this._log("warn", "option-select-rejected", {
        optionDisabled: Boolean(option?.disabled),
        optionFound: Boolean(option),
        value: option_value(value),
      });
      return false;
    }
    this.setValue(option.value, { event });
    this.close({
      event,
      reason: "option-selected",
      restoreFocus: true,
    });
    this._log("info", "option-select-complete", {
      label: option.label,
      value: option.value,
    });
    return true;
  }

  selectActive(event) {
    const option = this.filteredOptions()[this.state.activeIndex];
    if (!option) return false;
    return this.select(option.value, event);
  }

  handleTriggerKeyDown(event) {
    this.ensureTriggerElement(event, "trigger-keydown");
    this._log("debug", "trigger-keydown", {
      key: String(event.key || ""),
      selectOpen: this.state.open,
    });
    if (this.state.disabled) return false;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") {
        this._suppress_trigger_click_once();
      }
      if (!this.state.open) this.open({ event });
      if (event.key === "ArrowDown" && this.state.activeIndex < 0) {
        this.moveActive(1);
      }
      if (event.key === "ArrowUp" && this.state.activeIndex < 0) {
        this.moveActive(-1);
      }
      return true;
    }
    if (event.key === "Escape" && this.state.open) {
      event.preventDefault();
      this.close({ event, reason: "trigger-escape", restoreFocus: true });
      return true;
    }
    return false;
  }

  handleTriggerPointerDown(event) {
    this.ensureTriggerElement(event, "trigger-pointerdown");
    const interaction_id = this._start_interaction("pointerdown", event);
    this._log("info", "trigger-pointerdown", {
      event: event_snapshot(event),
      presence: { ...this.presence.state },
      referenceRect: this._reference_rect("trigger-pointerdown"),
      selectOpen: this.state.open,
    }, interaction_id);
    if (this.state.disabled) {
      this._log("warn", "trigger-pointerdown-disabled", {}, interaction_id);
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this._suppress_trigger_click_once();
    const changed = this.toggle({
      event,
      interactionId: interaction_id,
      reason: "trigger-pointerdown",
    });
    this._log("info", "trigger-pointerdown-complete", {
      changed,
      event: event_snapshot(event),
      presence: { ...this.presence.state },
      referenceRect: this._reference_rect("pointerdown-complete"),
      selectOpen: this.state.open,
    }, interaction_id);
    return true;
  }

  handleTriggerClick(event) {
    this.ensureTriggerElement(event, "trigger-click");
    const preceding_event_handled = this._consume_trigger_click_suppression();
    this._log("info", "trigger-click", {
      event: event_snapshot(event),
      floatingRect: this._floating_rect(),
      precedingEventHandled: preceding_event_handled,
      popper: { ...this.popper.state },
      presence: { ...this.presence.state },
      referenceRect: this._reference_rect("trigger-click"),
      selectOpen: this.state.open,
    });
    if (!preceding_event_handled && !this.state.disabled) {
      const interaction_id = this._start_interaction("click", event);
      const changed = this.toggle({
        event,
        interactionId: interaction_id,
        reason: "trigger-click-fallback",
      });
      this._log("info", "trigger-click-fallback-complete", {
        changed,
        presence: { ...this.presence.state },
        referenceRect: this._reference_rect("trigger-click-fallback-complete"),
        selectOpen: this.state.open,
      }, interaction_id);
    }
    this._schedule_diagnostic("trigger-click-after-render");
    return true;
  }

  handleSearchKeyDown(event) {
    this._log("debug", "search-keydown", {
      activeIndex: this.state.activeIndex,
      composing: Boolean(event.isComposing),
      key: String(event.key || ""),
      query: this.state.query,
    });
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.moveActive(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (this.selectActive(event)) return true;
      return this.openCreateDialog(event);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close({ event, reason: "search-escape", restoreFocus: true });
      return true;
    }
    return false;
  }

  openCreateDialog(event) {
    this._log("info", "create-dialog-open-requested", {
      creating: this.state.creating,
      disabled: this.state.disabled,
      event: event_snapshot(event),
      suggestedName: this.state.query.trim(),
    });
    if (this.state.disabled || this.state.creating) {
      this._log("warn", "create-dialog-open-rejected", {
        creating: this.state.creating,
        disabled: this.state.disabled,
      });
      return false;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const suggested_name = this.state.query.trim();
    this._created_project = null;
    this.clearCreateError();
    this.create_name_input.setValue(suggested_name, { silence: true });
    this.close({ event, reason: "create-dialog-opening" });
    queueMicrotask(() => {
      if (this._destroyed) return;
      this.create_dialog.show();
      this._log("info", "create-dialog-opened", {
        presence: { ...this.create_dialog.presence?.state },
        suggestedName: suggested_name,
      });
    });
    return true;
  }

  clearCreateError() {
    if (!this.state.createError) return;
    this.create_name_input.setStatus?.("normal");
    this.setState({ createError: "" });
  }

  async createProject() {
    if (this.state.creating) {
      this._log("warn", "create-project-skipped", { reason: "already-creating" });
      return false;
    }
    const name = String(this.create_name_input.value || "").trim();
    this._log("info", "create-project-requested", { name });
    if (!name) {
      this.create_name_input.setStatus?.("error");
      this.setState({ createError: "请输入 Project 名称" });
      this.create_name_input.focus?.();
      this._log("warn", "create-project-validation-failed", {
        reason: "empty-name",
      });
      return false;
    }
    if (!this._on_create_project) {
      this.create_name_input.setStatus?.("error");
      this.setState({ createError: "当前无法创建 Project" });
      this._log("error", "create-project-handler-missing", { name });
      return false;
    }

    this._set_creating(true);
    try {
      const created = await this._on_create_project(name);
      const created_value = option_value(created?.id ?? created?.value);
      if (!created_value) throw new Error("创建结果缺少 Project ID");
      this._created_project = {
        label: String(created?.name || created?.label || name),
        value: created_value,
      };
      this.clearCreateError();
      this.create_dialog.hide();
      this._log("info", "create-project-complete", {
        label: this._created_project.label,
        value: this._created_project.value,
      });
      return created;
    } catch (error) {
      this.create_name_input.setStatus?.("error");
      this.setState({ createError: creation_error_message(error) });
      this._log("error", "create-project-failed", { error, name });
      return false;
    } finally {
      this._set_creating(false);
    }
  }

  setTriggerElement(element) {
    const trigger_element = resolve_element(element);
    this._trigger_element = trigger_element || null;
    const trigger_rect = this._diagnostics_enabled
      ? rect_snapshot(trigger_element)
      : null;
    this._log("info", trigger_element ? "trigger-mounted" : "trigger-unmounted", {
      element: element_snapshot(trigger_element),
      referenceRect: trigger_rect,
    });
    if (!trigger_element) {
      this.popper.removeReference?.();
      return;
    }
    if (
      this._diagnostics_enabled &&
      (!trigger_rect?.width || !trigger_rect?.height)
    ) {
      this._log("error", "trigger-reference-rect-invalid", {
        element: element_snapshot(trigger_element),
        referenceRect: trigger_rect,
      });
    }
    const model = this;
    this.popper.setReference(
      {
        $el: trigger_element,
        getRect() {
          const rect = trigger_element.getBoundingClientRect();
          if (model._diagnostics_enabled) {
            model._log("debug", "reference-rect-read", {
              element: element_snapshot(trigger_element),
              rect: rect_snapshot({ getBoundingClientRect: () => rect }),
            });
          }
          return rect;
        },
      },
      { force: true },
    );
    this._log("info", "reference-configured", {
      popper: { ...this.popper.state },
      referenceRect: this._reference_rect("reference-configured"),
      viewport: this._viewport_snapshot(),
    });
  }

  ensureTriggerElement(event, reason) {
    const trigger_element = resolve_element(
      event?.currentTarget || event?.target,
    );
    if (!trigger_element) {
      this._log("error", "trigger-reference-unavailable", {
        event: event_snapshot(event),
        reason: String(reason || "unspecified"),
      });
      return null;
    }
    if (
      trigger_element !== this._trigger_element ||
      !this.popper.reference?.getRect
    ) {
      this.setTriggerElement(trigger_element);
      return trigger_element;
    }
    this._log("debug", "trigger-reference-confirmed", {
      element: element_snapshot(trigger_element),
      reason: String(reason || "unspecified"),
      referenceRect: this._reference_rect(reason),
    });
    return trigger_element;
  }

  setSearchElement(element) {
    this._search_element = resolve_element(element);
    this._log("debug", this._search_element ? "search-mounted" : "search-unmounted", {
      element: element_snapshot(this._search_element),
      rect: this._diagnostics_enabled
        ? rect_snapshot(this._search_element)
        : null,
      selectOpen: this.state.open,
    });
    if (this._search_element && this.state.open) this._focus_search();
  }

  handleAnimationEnd(event) {
    this._log("debug", "presence-animation-end", {
      event: event_snapshot(event),
      presence: { ...this.presence.state },
    });
    this.presence.handleAnimationEnd();
  }

  handlePopupViewCreated() {
    this._log("debug", "popup-view-created", {
      presence: { ...this.presence.state },
      selectOpen: this.state.open,
    });
  }

  handlePortalMounted(element) {
    this._log("debug", "portal-mounted", {
      element: element_snapshot(element),
      presence: { ...this.presence.state },
    });
  }

  handlePortalUnmounted() {
    this._log("debug", "portal-unmounted", {
      presence: { ...this.presence.state },
      selectOpen: this.state.open,
    });
  }

  handlePopperContentMounted(element) {
    this._floating_element = resolve_element(element);
    if (this._diagnostics_enabled) {
      this._log("info", "popper-content-mounted", {
        floatingElement: element_snapshot(this._floating_element),
        floatingRect: this._floating_rect(),
        floatingStyle: style_snapshot(this._floating_element),
        popper: { ...this.popper.state },
        referenceRect: this._reference_rect("content-mounted"),
        viewport: this._viewport_snapshot(),
      });
    }
    this._schedule_diagnostic("popper-content-mounted", { place: true });
  }

  handlePopperContentUnmounted() {
    this._log("info", "popper-content-unmounted", {
      floatingRect: this._floating_rect(),
      popper: { ...this.popper.state },
      presence: { ...this.presence.state },
    });
    this._floating_element = null;
  }

  handlePopperDismiss(reason) {
    this._log("warn", "popper-dismiss", {
      reason: String(reason || "outside-pointerdown"),
      snapshot: this.diagnosticSnapshot(),
    });
    return this.close({ reason: reason || "popper-dismiss" });
  }

  diagnosticSnapshot() {
    if (!this._diagnostics_enabled) return null;
    return {
      floatingElement: element_snapshot(this._floating_element),
      floatingRect: this._floating_rect(),
      floatingStyle: style_snapshot(this._floating_element),
      popper: { ...this.popper.state },
      presence: { ...this.presence.state },
      referenceElement: element_snapshot(this._trigger_element),
      referenceRect: this._reference_rect("diagnostic-snapshot"),
      selectOpen: this.state.open,
      viewport: this._viewport_snapshot(),
    };
  }

  placePopper(reason) {
    const place_reason = String(reason || "unspecified");
    this._log("debug", "popper-place-requested", {
      reason: place_reason,
      snapshot: this.diagnosticSnapshot(),
    });
    if (typeof this.popper.place !== "function") {
      this._log("error", "popper-place-unavailable", { reason: place_reason });
      return Promise.resolve(false);
    }
    let placement_result;
    try {
      placement_result = this.popper.place({
        desc: `ProjectSelect:${this.id}:${place_reason}`,
      });
    } catch (error) {
      this._log("error", "popper-place-failed", {
        error,
        reason: place_reason,
      });
      return Promise.resolve(false);
    }
    return Promise.resolve(placement_result).then(
      () => {
        this._log("info", "popper-place-complete", {
          reason: place_reason,
          snapshot: this.diagnosticSnapshot(),
        });
        return Boolean(this.popper.state?.isPlaced);
      },
      (error) => {
        this._log("error", "popper-place-failed", {
          error,
          reason: place_reason,
          snapshot: this.diagnosticSnapshot(),
        });
        return false;
      },
    );
  }

  _preferred_active_index(options, value) {
    const selected_index = options.findIndex(
      (option) => option.value === value && !option.disabled,
    );
    if (selected_index >= 0) return selected_index;
    return options.findIndex((option) => !option.disabled);
  }

  _focus_search() {
    queueMicrotask(() => {
      if (!this.state.open) return;
      this._search_element?.focus?.({ preventScroll: true });
      this._log("debug", "search-focus-requested", {
        element: element_snapshot(this._search_element),
        selectOpen: this.state.open,
      });
    });
  }

  _focus_trigger() {
    queueMicrotask(() => {
      this._trigger_element?.focus?.({ preventScroll: true });
      this._log("debug", "trigger-focus-requested", {
        element: element_snapshot(this._trigger_element),
      });
    });
  }

  _start_interaction(kind, event) {
    this._interaction_sequence += 1;
    this._active_interaction_id =
      `${this.id}:${String(kind || "interaction")}:${this._interaction_sequence}`;
    this._log("debug", "interaction-started", {
      event: event_snapshot(event),
      kind: String(kind || "interaction"),
    }, this._active_interaction_id);
    return this._active_interaction_id;
  }

  _log(level, event_name, details = {}, interaction_id) {
    const logger = this._logger;
    const builder_name = {
      debug: "Debug",
      error: "Error",
      info: "Info",
      warn: "Warn",
    }[level] || "Info";
    if (!logger || typeof logger[builder_name] !== "function") return;
    try {
      logger[builder_name]()
        .Str("scope", "ProjectSelect")
        .Str("projectSelectId", this.id)
        .Str(
          "interactionId",
          interaction_id ?? this._active_interaction_id ?? "",
        )
        .Str("projectSelectEvent", event_name)
        .Object("details", details)
        .Msg(`ProjectSelect ${event_name}`);
    } catch (_) {
      // Diagnostics must never affect the component interaction.
    }
  }

  _reference_rect(reason) {
    if (!this._diagnostics_enabled) return null;
    if (!this.popper.reference?.getRect) return null;
    try {
      const rect = this.popper.reference.getRect();
      return rect_snapshot({ getBoundingClientRect: () => rect });
    } catch (error) {
      this._log("error", "reference-position-failed", {
        error,
        reason: String(reason || "unspecified"),
      });
      return null;
    }
  }

  _floating_rect() {
    if (!this._diagnostics_enabled) return null;
    if (this.popper.floating?.getRect) {
      try {
        const rect = this.popper.floating.getRect();
        return rect_snapshot({ getBoundingClientRect: () => rect });
      } catch (error) {
        return { error: String(error?.message || error) };
      }
    }
    return rect_snapshot(this._floating_element);
  }

  _viewport_snapshot() {
    if (!this._diagnostics_enabled) return null;
    try {
      const viewport = this.popper.platform?.getViewportSize?.();
      return viewport
        ? {
          height: Number(viewport.height) || 0,
          width: Number(viewport.width) || 0,
        }
        : null;
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  }

  _schedule_diagnostic(stage, options = {}) {
    const should_place = Boolean(options.place && this.state.open);
    if (!this._diagnostics_enabled && !should_place) return;
    const interaction_id =
      options.interactionId || this._active_interaction_id;
    queueMicrotask(() => {
      if (this._destroyed) return;
      if (this._diagnostics_enabled) {
        this._log("debug", `${stage}-microtask`, {
          snapshot: this.diagnosticSnapshot(),
        }, interaction_id);
      }
      if (options.place && this.state.open) {
        void this.placePopper(`${stage}-microtask`);
      }
      if (!this._diagnostics_enabled) return;
      const schedule_frame = globalThis.requestAnimationFrame || ((callback) => {
        return globalThis.setTimeout(callback, 0);
      });
      schedule_frame(() => {
        if (this._destroyed) return;
        this._log("debug", `${stage}-frame`, {
          snapshot: this.diagnosticSnapshot(),
        }, interaction_id);
      });
    });
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

  _set_creating(creating) {
    const next_creating = Boolean(creating);
    this.setState({ creating: next_creating });
    this.create_dialog.okBtn.setLoading?.(next_creating);
    if (next_creating) this.create_dialog.cancelBtn.disable?.();
    else this.create_dialog.cancelBtn.enable?.();
    this.create_dialog.closeable = !next_creating;
  }

  _restore_after_create() {
    const created_project = this._created_project;
    if (!created_project || this._destroyed) return;
    this._log("info", "restore-after-create-requested", {
      createdProject: created_project,
    });
    this._created_project = null;
    if (!this.open()) return;
    this.setQuery(created_project.label);
    this.setActiveValue(created_project.value);
    this._log("info", "restore-after-create-complete", {
      activeIndex: this.state.activeIndex,
      createdProject: created_project,
      selectOpen: this.state.open,
    });
  }

  destroy() {
    this._log("info", "destroyed", { snapshot: this.diagnosticSnapshot() });
    this._destroyed = true;
    this._consume_trigger_click_suppression();
    this._unsubscribe_create_dialog_hidden?.();
    this._unsubscribe_create_dialog_show?.();
    this._diagnostic_unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this._diagnostic_unsubscribers.length = 0;
    this.presence.reset?.();
    this.popper.reset?.();
    this.create_dialog.presence?.reset?.();
    this.create_dialog.destroy?.();
    this.create_name_input.destroy?.();
    this.presence.destroy?.();
    this.popper.destroy?.();
    this._value_listeners.clear();
    this._search_element = null;
    this._trigger_element = null;
    super.destroy();
  }
}
