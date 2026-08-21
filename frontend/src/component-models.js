/**
 * Legacy application component models.
 *
 * Feature modules still use these models while they migrate. The tnui base
 * components use Timeless.vm stores directly and do not depend on this file.
 */

export class ComponentModel {
  constructor(initialState = {}) {
    this._state = Object.freeze({ ...initialState });
    this._listeners = new Set();
  }

  get state() {
    return this._state;
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  setState(patch) {
    const nextState = { ...this._state, ...patch };
    const changed = Object.keys(nextState).some(
      (key) => nextState[key] !== this._state[key],
    );
    if (!changed) return this._state;
    this._state = Object.freeze(nextState);
    this._listeners.forEach((listener) => listener(this._state));
    return this._state;
  }

  destroy() {
    this._listeners.clear();
  }
}

export class ButtonModel extends ComponentModel {
  constructor(options = {}) {
    super({
      disabled: Boolean(options.disabled),
      loading: Boolean(options.loading),
      text: options.text || "",
    });
    this._onPress = options.onPress || options.onClick || null;
  }

  setDisabled(disabled) {
    this.setState({ disabled: Boolean(disabled) });
  }

  setLoading(loading) {
    this.setState({ loading: Boolean(loading) });
  }

  setText(text) {
    this.setState({ text: text == null ? "" : String(text) });
  }

  press(event) {
    if (this.state.disabled || this.state.loading) return undefined;
    return this._onPress ? this._onPress(event) : undefined;
  }
}

export class InputModel extends ComponentModel {
  constructor(options = {}) {
    super({
      disabled: Boolean(options.disabled),
      invalid: Boolean(options.invalid),
      loading: Boolean(options.loading),
      placeholder: options.placeholder || "",
      readOnly: Boolean(options.readOnly),
      type: options.type || "text",
      value: options.value ?? options.defaultValue ?? "",
    });
    this._onBlur = options.onBlur || null;
    this._onChange = options.onChange || null;
    this._onEnter = options.onEnter || null;
    this._onFocus = options.onFocus || null;
    this._onKeyDown = options.onKeyDown || null;
  }

  setValue(value, options = {}) {
    this.setState({ value });
    if (!options.silent && this._onChange) {
      this._onChange(value, options.event);
    }
    return value;
  }

  clear(event) {
    return this.setValue("", { event });
  }

  enter(event) {
    if (this.state.disabled || this.state.readOnly) return undefined;
    return this._onEnter ? this._onEnter(this.state.value, event) : undefined;
  }

  keyDown(event) {
    return this._onKeyDown ? this._onKeyDown(event) : undefined;
  }

  focus(event) {
    return this._onFocus ? this._onFocus(event) : undefined;
  }

  blur(event) {
    return this._onBlur ? this._onBlur(this.state.value, event) : undefined;
  }

  setDisabled(disabled) {
    this.setState({ disabled: Boolean(disabled) });
  }

  setInvalid(invalid) {
    this.setState({ invalid: Boolean(invalid) });
  }

  setLoading(loading) {
    this.setState({ loading: Boolean(loading) });
  }
}

export class CheckboxModel extends ComponentModel {
  constructor(options = {}) {
    super({
      checked: Boolean(options.checked ?? options.defaultChecked),
      disabled: Boolean(options.disabled),
      indeterminate: Boolean(options.indeterminate),
      label: options.label || "",
    });
    this._onChange = options.onChange || null;
  }

  setValue(checked, options = {}) {
    const nextChecked = Boolean(checked);
    this.setState({ checked: nextChecked, indeterminate: false });
    if (!options.silent && this._onChange) {
      this._onChange(nextChecked, options.event);
    }
    return nextChecked;
  }

  toggle(event) {
    if (this.state.disabled) return this.state.checked;
    return this.setValue(!this.state.checked, { event });
  }

  setDisabled(disabled) {
    this.setState({ disabled: Boolean(disabled) });
  }

  setIndeterminate(indeterminate) {
    this.setState({ indeterminate: Boolean(indeterminate) });
  }
}

export class SwitchModel extends CheckboxModel {}

function optionEntries(options) {
  return (Array.isArray(options) ? options : []).flatMap((option) =>
    Array.isArray(option && option.options)
      ? optionEntries(option.options)
      : [option],
  );
}

function selectableOptionEntries(options) {
  return optionEntries(options).filter((option) => option && !option.disabled);
}

function selectValuesEqual(left, right) {
  return Object.is(left, right) || String(left ?? "") === String(right ?? "");
}

function primitiveSelectEntries(options, ViewModel) {
  const entries = [];
  let previousGroup = null;

  function append(optionList, group = "") {
    (Array.isArray(optionList) ? optionList : []).forEach((option) => {
      if (!option) return;
      if (Array.isArray(option.options)) {
        append(option.options, option.label || group);
        return;
      }
      const item = new ViewModel.SelectItemCore({
        disabled: Boolean(option.disabled),
        label: option.label ?? String(option.value ?? ""),
        value: option.value,
      });
      item._tn_option = option;
      item._tn_group = group;
      item._tn_group_start = Boolean(group && group !== previousGroup);
      previousGroup = group;
      entries.push(item);
    });
  }

  append(options);
  return entries;
}

export class SelectModel extends ComponentModel {
  constructor(options = {}) {
    const selectOptions = Array.isArray(options.options)
      ? options.options.slice()
      : [];
    const initialValue = options.value ?? options.defaultValue ?? null;
    const initialActiveIndex = selectableOptionEntries(selectOptions).findIndex((option) =>
      selectValuesEqual(option.value, initialValue),
    );
    super({
      disabled: Boolean(options.disabled),
      activeIndex: initialActiveIndex,
      defaultValue: initialValue,
      open: false,
      options: selectOptions,
      placeholder: options.placeholder || "请选择",
      required: Boolean(options.required),
      value: initialValue,
    });
    this._onChange = options.onChange || null;
    this._floating_control_model = options.floatingControlModel || null;
    this.primitiveStore = null;
    this._primitive_entries = [];
    this._primitive_event = null;
    this._primitive_value = this.state.value;
    this._primitive_silent = false;
    this._primitive_unsubscribers = [];
    this._primitive_view_model = null;
    this._initializePrimitiveStore(options.primitiveRuntime);
  }

  _syncFloatingControl(open) {
    if (!this._floating_control_model) return;
    if (open) {
      this._floating_control_model.activate(this, () => this.close());
    } else {
      this._floating_control_model.release(this);
    }
  }

  _initializePrimitiveStore(runtime) {
    const ViewModel = runtime?.vm;
    if (
      !runtime?.ui?.SelectPrimitive
      || typeof ViewModel?.SelectCore !== "function"
      || typeof ViewModel?.SelectItemCore !== "function"
    ) {
      return;
    }

    this._primitive_entries = primitiveSelectEntries(this.state.options, ViewModel);
    this._primitive_view_model = ViewModel;
    const store = new ViewModel.SelectCore({
      defaultValue: this.state.value,
      disabled: this.state.disabled,
      onChange: (value) => this._handlePrimitiveChange(value),
      options: this._primitive_entries,
      placeholder: this.state.placeholder,
      position: "popper",
    });
    this.primitiveStore = store;
    this._primitive_unsubscribers.push(store.onStateChange((state) => {
      const open = Boolean(state.open);
      this.setState({
        activeIndex: store.getFocusedIndex?.() ?? this.state.activeIndex,
        disabled: Boolean(state.disabled),
        open,
        placeholder: state.placeholder || this.state.placeholder,
        value: state.value,
      });
      this._syncFloatingControl(open);
    }));
  }

  _handlePrimitiveChange(value) {
    const changed = !selectValuesEqual(value, this._primitive_value);
    const entry = optionEntries(this.state.options).find(
      (option) => option && selectValuesEqual(option.value, value),
    ) || null;
    this._primitive_value = value;
    this.setState({ open: false, value });
    this._syncFloatingControl(false);
    if (changed && !this._primitive_silent && this._onChange) {
      this._onChange(value, entry, this._primitive_event);
    }
  }

  setOptions(options) {
    const nextOptions = Array.isArray(options) ? options.slice() : [];
    const selectable = selectableOptionEntries(nextOptions);
    const selectedIndex = selectable.findIndex((option) =>
      selectValuesEqual(option.value, this.state.value),
    );
    this.setState({
      activeIndex: selectedIndex,
      options: nextOptions,
    });
    if (this.primitiveStore) {
      if (this._primitive_view_model?.SelectItemCore) {
        this._primitive_entries.forEach((entry) => entry.destroy?.());
        this._primitive_entries = primitiveSelectEntries(
          nextOptions,
          this._primitive_view_model,
        );
        this.primitiveStore.setOptions(this._primitive_entries);
        this.primitiveStore.selected_item$ = this._primitive_entries.find((entry) =>
          selectValuesEqual(entry.value, this.primitiveStore.value),
        ) || null;
        this.primitiveStore.focused_item$ = null;
        this.primitiveStore.refresh();
      } else {
        this.primitiveStore.setOptions([]);
      }
    }
  }

  select(value, options = {}) {
    if (this.state.disabled && !options.force) return this.state.value;
    const entry = optionEntries(this.state.options).find(
      (option) => option && selectValuesEqual(option.value, value),
    );
    if (!entry || entry.disabled) return this.state.value;
    const nextValue = entry.value;
    const changed = !selectValuesEqual(nextValue, this.state.value);
    if (this.primitiveStore) {
      this._primitive_event = options.event || null;
      this._primitive_silent = Boolean(options.silent);
      this.primitiveStore.setValue(nextValue);
      this._primitive_event = null;
      this._primitive_silent = false;
      return this.primitiveStore.value;
    }
    this.setState({ open: false, value: nextValue });
    this._syncFloatingControl(false);
    if (changed && !options.silent && this._onChange) {
      this._onChange(nextValue, entry, options.event);
    }
    return nextValue;
  }

  setValue(value, options = {}) {
    return this.select(value, { ...options, force: true });
  }

  clear(event, options = {}) {
    if (this.state.required) return this.state.value;
    if (this.primitiveStore) {
      this._primitive_event = event || null;
      this._primitive_silent = Boolean(options.silent);
      this.primitiveStore.clear();
      this._primitive_event = null;
      this._primitive_silent = false;
      return null;
    }
    this.setState({ open: false, value: null });
    this._syncFloatingControl(false);
    if (!options.silent && this._onChange) this._onChange(null, null, event);
    return null;
  }

  open() {
    if (this.state.disabled) return false;
    if (this.primitiveStore) {
      this.primitiveStore.show();
      this._syncFloatingControl(true);
      return true;
    }
    const selectable = selectableOptionEntries(this.state.options);
    const selectedIndex = selectable.findIndex((option) =>
      selectValuesEqual(option.value, this.state.value),
    );
    this.setState({
      activeIndex: selectedIndex >= 0 ? selectedIndex : 0,
      open: true,
    });
    this._syncFloatingControl(true);
    return true;
  }

  close() {
    if (this.primitiveStore) {
      this.primitiveStore.hide();
      this._syncFloatingControl(false);
      return false;
    }
    this.setState({ open: false });
    this._syncFloatingControl(false);
    return false;
  }

  toggle() {
    return this.state.open ? this.close() : this.open();
  }

  moveActive(offset) {
    if (this.primitiveStore) {
      if (!this.state.open) this.primitiveStore.show();
      this._syncFloatingControl(true);
      if (Number(offset) < 0) this.primitiveStore.focusPrevOption();
      else this.primitiveStore.focusNextOption();
      const activeIndex = this.primitiveStore.getFocusedIndex();
      this.setState({ activeIndex, open: true });
      return activeIndex;
    }
    const selectable = selectableOptionEntries(this.state.options);
    if (!selectable.length) return -1;
    const direction = Number(offset || 0);
    const activeIndex = this.state.activeIndex < 0
      ? direction < 0 ? selectable.length - 1 : 0
      : (this.state.activeIndex + direction + selectable.length) % selectable.length;
    this.setState({ activeIndex, open: true });
    this._syncFloatingControl(true);
    return activeIndex;
  }

  setActiveIndex(index) {
    const selectable = selectableOptionEntries(this.state.options);
    if (!selectable.length) return -1;
    const activeIndex = Math.min(
      selectable.length - 1,
      Math.max(0, Number(index) || 0),
    );
    if (this.primitiveStore) {
      const entry = selectable[activeIndex];
      if (entry) this.primitiveStore.focusOption(entry.value);
    }
    this.setState({ activeIndex });
    return activeIndex;
  }

  selectActive(event) {
    if (this.primitiveStore) {
      this._primitive_event = event || null;
      this.primitiveStore.selectFocusedOption();
      this._primitive_event = null;
      return this.primitiveStore.value;
    }
    const entry = selectableOptionEntries(this.state.options)[this.state.activeIndex];
    return entry ? this.select(entry.value, { event }) : this.state.value;
  }

  handleKeyDown(key, event) {
    switch (key) {
      case "ArrowDown":
        this.moveActive(1);
        return true;
      case "ArrowUp":
        this.moveActive(-1);
        return true;
      case "Enter":
      case " ":
        if (this.state.open) this.selectActive(event);
        else this.open();
        return true;
      case "Escape":
        this.close();
        return true;
      case "Home":
        this.setState({ activeIndex: 0, open: true });
        this._syncFloatingControl(true);
        return true;
      case "End": {
        const lastIndex = Math.max(0, selectableOptionEntries(this.state.options).length - 1);
        this.setState({ activeIndex: lastIndex, open: true });
        this._syncFloatingControl(true);
        return true;
      }
      default:
        return false;
    }
  }

  selectedOption() {
    return optionEntries(this.state.options).find((option) =>
      option && selectValuesEqual(option.value, this.state.value),
    ) || null;
  }

  reset() {
    const nextValue = this.state.defaultValue;
    if (this.primitiveStore) {
      const hasDefaultOption = optionEntries(this.state.options).some(
        (option) => option && selectValuesEqual(option.value, nextValue),
      );
      if (hasDefaultOption) return this.setValue(nextValue, { silent: true });
      this._primitive_silent = true;
      this.primitiveStore.clear();
      this._primitive_silent = false;
      return null;
    }
    if (nextValue === null || nextValue === undefined || nextValue === "") {
      this.setState({ open: false, value: nextValue });
      this._syncFloatingControl(false);
      return nextValue;
    }
    return this.setValue(nextValue, { silent: true });
  }

  setDisabled(disabled) {
    if (this.primitiveStore) {
      this.primitiveStore.disabled = Boolean(disabled);
      if (disabled) this.primitiveStore.hide();
      this.primitiveStore.refresh();
    }
    this.setState({ disabled: Boolean(disabled), open: false });
    this._syncFloatingControl(false);
  }

  destroy() {
    this._syncFloatingControl(false);
    this._primitive_unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe?.());
    this._primitive_entries.splice(0).forEach((entry) => entry.destroy?.());
    this.primitiveStore?.destroy?.();
    this.primitiveStore = null;
    this._primitive_view_model = null;
    super.destroy();
  }
}

export class ProjectSelectModel extends SelectModel {
  constructor(options = {}) {
    super({
      ...options,
      options: options.options || ProjectSelectModel.projectOptions(options),
    });
  }

  static projectOptions(options = {}) {
    const entries = [];
    if (options.includeAll) {
      entries.push({
        kind: "all",
        label: options.allLabel || "全部项目",
        value: options.allValue ?? "all",
      });
    }
    if (options.includeUnassigned !== false) {
      entries.push({
        kind: "unassigned",
        label: options.unassignedLabel || "未归属",
        value: options.unassignedValue ?? "",
      });
    }
    (Array.isArray(options.projects) ? options.projects : []).forEach((project) => {
      if (!project) return;
      entries.push({
        color: project.color || "",
        count: project.count,
        label: project.name || project.label || project.id || "Project",
        value: project.id ?? project.value ?? "",
      });
    });
    return entries;
  }

  setProjects(projects, options = {}) {
    this.setOptions(ProjectSelectModel.projectOptions({
      ...options,
      projects,
    }));
  }
}

export class DialogModel extends ComponentModel {
  constructor(options = {}) {
    super({
      busy: Boolean(options.busy),
      closeable: options.closeable !== false,
      error: null,
      open: Boolean(options.open),
      title: options.title || "",
    });
    this._onCancel = options.onCancel || null;
    this._onConfirm = options.onConfirm || options.onOk || null;
    this._onError = options.onError || null;
    this._onOpenChange = options.onOpenChange || null;
  }

  setOpen(open, reason = "programmatic") {
    const nextOpen = Boolean(open);
    if (nextOpen === this.state.open) return nextOpen;
    this.setState({ open: nextOpen });
    if (this._onOpenChange) this._onOpenChange(nextOpen, reason);
    return nextOpen;
  }

  show() {
    return this.setOpen(true, "show");
  }

  hide(reason = "hide") {
    if (this.state.busy) return false;
    return this.setOpen(false, reason);
  }

  cancel(event) {
    if (!this.state.closeable || this.state.busy) return false;
    const result = this._onCancel ? this._onCancel(event) : undefined;
    if (result !== false) this.hide("cancel");
    return result;
  }

  async confirm(event) {
    if (this.state.busy) return false;
    this.setState({ busy: true, error: null });
    try {
      const result = this._onConfirm
        ? await this._onConfirm(event)
        : undefined;
      if (result !== false) this.setOpen(false, "confirm");
      return result;
    } catch (error) {
      this.setState({ error });
      if (this._onError) this._onError(error);
      return false;
    } finally {
      this.setState({ busy: false });
    }
  }

  setTitle(title) {
    this.setState({ title: title == null ? "" : String(title) });
  }
}

export class PopoverModel extends ComponentModel {
  constructor(options = {}) {
    super({
      open: Boolean(options.open),
      placement: options.placement || options.side || "bottom",
    });
    this._onOpenChange = options.onOpenChange || null;
  }

  setOpen(open, reason = "programmatic") {
    const nextOpen = Boolean(open);
    if (nextOpen === this.state.open) return nextOpen;
    this.setState({ open: nextOpen });
    if (this._onOpenChange) this._onOpenChange(nextOpen, reason);
    return nextOpen;
  }

  show() {
    return this.setOpen(true, "show");
  }

  hide(reason = "hide") {
    return this.setOpen(false, reason);
  }

  toggle() {
    return this.setOpen(!this.state.open, "toggle");
  }
}

export class ProgressModel extends ComponentModel {
  constructor(options = {}) {
    const max = Number(options.max) > 0 ? Number(options.max) : 100;
    const value = Math.min(max, Math.max(0, Number(options.value) || 0));
    super({
      indeterminate: Boolean(options.indeterminate),
      max,
      value,
    });
  }

  setValue(value) {
    const nextValue = Math.min(
      this.state.max,
      Math.max(0, Number(value) || 0),
    );
    this.setState({ indeterminate: false, value: nextValue });
  }

  setIndeterminate(indeterminate) {
    this.setState({ indeterminate: Boolean(indeterminate) });
  }
}

export const createButtonModel = (options) => new ButtonModel(options);
export const createInputModel = (options) => new InputModel(options);
export const createCheckboxModel = (options) => new CheckboxModel(options);
export const createSwitchModel = (options) => new SwitchModel(options);
export const createSelectModel = (options) => new SelectModel(options);
export const createProjectSelectModel = (options) => new ProjectSelectModel(options);
export const createDialogModel = (options) => new DialogModel(options);
export const createPopoverModel = (options) => new PopoverModel(options);
export const createProgressModel = (options) => new ProgressModel(options);
