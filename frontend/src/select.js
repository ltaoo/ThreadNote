import { Timeless } from "./timeless-icons.js";

function optionRows(options, rows = [], group = "") {
  (Array.isArray(options) ? options : []).forEach((option) => {
    if (!option) return;
    if (Array.isArray(option.options)) {
      const nextGroup = option.label || group;
      rows.push({ group: nextGroup, type: "group" });
      optionRows(option.options, rows, nextGroup);
      return;
    }
    rows.push({ ...option, group, type: "option" });
  });
  return rows;
}

function valuesEqual(left, right) {
  return Object.is(left, right) || String(left ?? "") === String(right ?? "");
}

export function createSelectComponent(deps) {
  const {
    SelectModel,
    applyElementProps,
    classNames,
    floatingControlModel,
    modelState,
    nextId,
    resolveModel,
    setAttribute,
    subscribeModel,
  } = deps;

  function primitiveEnvironment() {
    if (typeof window === "undefined") return null;
    const Runtime = window.Timeless;
    const ui = Runtime?.ui;
    if (
      !Runtime?.DOM?.render
      || !Runtime?.View
      || !ui?.SelectPrimitive
      || !Runtime?.vm?.SelectCore
    ) {
      return null;
    }
    return { Runtime, ui };
  }

  function primitiveOptionView(environment, store, entry) {
    const { Runtime, ui } = environment;
    const itemState = Runtime.refobj(entry.state);
    const unsubscribe = entry.onStateChange((state) => itemState.as(state));
    const metadata = entry._tn_option || entry;
    const group = entry._tn_group_start
      ? Runtime.View({ class: "tn-select__group", attributes: { role: "presentation" } }, [
        entry._tn_group,
      ])
      : null;
    const markerStyle = metadata.color
      ? { "background-color": metadata.color }
      : undefined;
    const marker = Runtime.View({
      class: classNames(
        "tn-select__marker",
        metadata.color && "is-color",
        metadata.kind && `is-${metadata.kind}`,
      ),
      style: markerStyle,
    });
    const label = ui.SelectPrimitive.ItemText({}, [
      Runtime.View({ class: "tn-select__option-label" }, [
        entry.label ?? String(entry.value ?? ""),
      ]),
    ]);
    const copy = Runtime.View({ class: "tn-select__option-copy" }, [
      label,
      metadata.description
        ? Runtime.View({ type: "small" }, [metadata.description])
        : null,
    ]);
    const indicator = ui.SelectPrimitive.ItemIndicator({
      class: "tn-select__option-indicator",
      store: entry,
    }, [
      Timeless.Icon({
        name: "check",
        size: 14,
        attributes: { n: "select-option-check-icon" },
      }),
    ]);
    const meta = Runtime.View({ class: "tn-select__option-meta" }, [
      metadata.count === undefined || metadata.count === null
        ? null
        : Runtime.View({ class: "tn-select__option-count" }, [String(metadata.count)]),
      indicator,
    ]);
    const option = ui.SelectPrimitive.Item({
      attributes: {
        "aria-selected": Runtime.computed(itemState, (state) => String(state.selected)),
        role: "option",
      },
      class: Runtime.computed(itemState, (state) => classNames(
        "tn-select__option",
        state.selected && "is-selected",
        state.focused && "is-active",
        state.disabled && "is-disabled",
      )),
      dataset: { value: String(entry.value ?? "") },
      item$: entry,
      onUnmounted() {
        unsubscribe?.();
        itemState.destroy?.();
      },
      select$: store,
    }, [marker, copy, meta]);
    return Runtime.Fragment({}, [group, option].filter(Boolean));
  }

  function primitiveSelectView(props, resolved, environment) {
    const { Runtime, ui } = environment;
    const model = resolved.model;
    const store = model.primitiveStore || model;
    const root = document.createElement("div");
    const hidden = document.createElement("input");
    const mount = document.createElement("div");
    const panelId = nextId("tn-select-list");
    const size = ["sm", "md", "lg"].includes(props.size) ? props.size : "md";
    const variant = ["outlined", "filled", "borderless"].includes(props.variant)
      ? props.variant
      : "outlined";
    const state = Runtime.refobj(store.state);
    const options = Runtime.computed(state, (value) => value.options || []);
    let mounted = false;

    root.className = "tn-select-root";
    hidden.type = "hidden";
    hidden.className = "tn-select__input";
    mount.className = "tn-select__primitive-mount";
    if (props.name) hidden.name = props.name;
    applyElementProps(root, { class: props.rootClass });
    applyElementProps(hidden, { attributes: props.inputAttributes });
    root.append(hidden, mount);

    const leading = Runtime.View({
      class: Runtime.computed(state, (value) => classNames(
        "tn-select__leading",
        !value.selectedOption?._tn_option?.color && "is-empty",
      )),
    }, [
      Runtime.Show({
        when: Runtime.computed(state, (value) => Boolean(value.selectedOption?._tn_option?.color)),
        ok: () => [Runtime.View({
          class: "tn-select__selected-color",
          style: {
            "background-color": Runtime.computed(
              state,
              (value) => value.selectedOption?._tn_option?.color || "transparent",
            ),
          },
        })],
      }),
    ]);
    const value = ui.SelectPrimitive.Value({
      class: Runtime.computed(state, (current) => classNames(
        "tn-select__value",
        !current.selectedOption && "is-placeholder",
      )),
      store,
    });
    const icon = ui.SelectPrimitive.Icon({
      attributes: { "aria-hidden": "true" },
      class: "tn-select__icon",
      store,
    }, [
      Timeless.Icon({
        name: "chevron-down",
        size: 15,
        attributes: { n: "select-control-chevron-icon" },
      }),
    ]);
    const trigger = ui.SelectPrimitive.Trigger({
      class: classNames(
        "tn-select",
        `tn-select--${size}`,
        `tn-select--${variant}`,
        props.class,
      ),
      id: props.id,
      onKeyDown(event) {
        if (model.handleKeyDown?.(event.key, event)) {
          event.preventDefault();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!store.state.open) store.show();
          if (event.key === "ArrowDown") store.focusNextOption();
          else store.focusPrevOption();
        } else if (event.key === "Escape") {
          event.preventDefault();
          store.hide();
        }
      },
      onMounted(event) {
        const element = event.target.get$elm();
        const focusTrigger = () => {
          element.focus({ preventScroll: true });
        };
        element.type = "button";
        element.addEventListener("pointerdown", focusTrigger);
        element.addEventListener("click", focusTrigger);
        setAttribute(element, "aria-controls", panelId);
        setAttribute(element, "aria-label", props.ariaLabel);
        setAttribute(element, "aria-invalid", props.invalid ? "true" : null);
        setAttribute(element, "aria-required", props.required ? "true" : null);
        if (props.title) element.title = props.title;
        Object.entries(props.triggerAttributes || {}).forEach(([name, attrValue]) => {
          setAttribute(element, name, attrValue);
        });
      },
      store,
      type: "button",
    }, [leading, value, icon]);
    const content = ui.SelectPrimitive.Content({
      animation: {
        in: "tn-select-panel-in",
        out: "tn-select-panel-out",
      },
      attributes: {
        "data-tn-select-panel": panelId,
        id: panelId,
        role: "listbox",
      },
      class: "tn-popup tn-popup--select tn-select__panel",
      store,
    }, () => [
      ui.SelectPrimitive.Viewport({ class: "tn-select__list", store }, [
        Runtime.For({
          each: options,
          render: (entry) => primitiveOptionView(environment, store, entry),
        }),
      ]),
    ]);
    const primitiveView = ui.SelectPrimitive.Root({ store }, [trigger, content]);

    function sync() {
      const current = modelState(model);
      hidden.value = current.value == null ? "" : String(current.value);
      hidden.disabled = Boolean(current.disabled);
      root.className = classNames(
        "tn-select-root",
        `tn-select-root--${size}`,
        `tn-select-root--${variant}`,
        current.open && "is-open",
        current.disabled && "is-disabled",
        props.invalid && "is-invalid",
        props.rootClass,
      );
    }

    const unsubscribeState = store.onStateChange((nextState) => state.as(nextState));
    const unsubscribeModel = subscribeModel(model, sync);
    sync();
    return {
      t: "view",
      $elm: root,
      control: hidden,
      get panel() {
        return document.querySelector(`[data-tn-select-panel="${panelId}"]`);
      },
      model,
      get trigger() {
        return root.querySelector(".tn-select");
      },
      render() {
        return root;
      },
      onMounted() {
        if (mounted) return;
        mounted = true;
        Runtime.DOM.render(primitiveView, mount);
      },
      beforeUnmounted() {
        primitiveView.beforeUnmounted?.();
      },
      onUnmounted() {
        unsubscribeState?.();
        unsubscribeModel?.();
        primitiveView.onUnmounted?.();
        state.destroy?.();
        options.destroy?.();
        if (resolved.owned) model.destroy?.();
      },
    };
  }

  return function Select(props = {}) {
    const environment = primitiveEnvironment();
    const resolved = resolveModel(props, SelectModel, {
      ...props,
      floatingControlModel,
      primitiveRuntime: environment?.bridge,
      value: props.value ?? props.defaultValue,
    });
    const model = resolved.model;
    const primitiveStore = model.primitiveStore || (
      model?.popper$
      && Array.isArray(model?.state?.options)
      && model.state.options.every((entry) => typeof entry?.onStateChange === "function")
        ? model
        : null
    );
    if (environment && primitiveStore) {
      return primitiveSelectView(props, resolved, environment);
    }
    const root = document.createElement("div");
    const hidden = document.createElement("input");
    const trigger = document.createElement("button");
    const leading = document.createElement("span");
    const value = document.createElement("span");
    const panel = document.createElement("div");
    const list = document.createElement("div");
    const listId = nextId("tn-select-list");
    const size = ["sm", "md", "lg"].includes(props.size) ? props.size : "md";
    const variant = ["outlined", "filled", "borderless"].includes(props.variant)
      ? props.variant
      : "outlined";

    root.className = "tn-select-root";
    hidden.type = "hidden";
    hidden.className = "tn-select__input";
    trigger.type = "button";
    trigger.className = "tn-select";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-autocomplete", "none");
    trigger.setAttribute("aria-controls", listId);
    leading.className = "tn-select__leading";
    value.className = "tn-select__value";
    panel.className = "tn-popup tn-popup--select tn-select__panel";
    panel.hidden = true;
    list.className = "tn-select__list";
    list.id = listId;
    list.setAttribute("role", "listbox");

    applyElementProps(root, { class: props.rootClass });
    applyElementProps(trigger, {
      ariaLabel: props.ariaLabel,
      attributes: props.triggerAttributes,
      class: props.class,
      title: props.title,
    });
    applyElementProps(hidden, { attributes: props.inputAttributes });
    if (props.name) hidden.name = props.name;

    const leadingIcon = props.leading || null;
    if (leadingIcon) {
      let node = leadingIcon;
      if (leadingIcon?.t === "icon" && Timeless?.DOM?.buildAndRender) {
        node = Timeless.DOM.buildAndRender(leadingIcon).dom;
      } else if (typeof leadingIcon.render === "function") {
        node = leadingIcon.render();
      }
      if (node) leading.appendChild(node);
    }
    trigger.append(
      leading,
      value,
      Timeless.DOM.buildAndRender(
        Timeless.Icon({
          name: "chevron-down",
          class: "tn-select__icon",
          size: 15,
          attributes: { n: "select-trigger-icon" },
        }),
      ).dom,
    );
    panel.appendChild(list);
    root.append(hidden, trigger, panel);

    function placePanel() {
      const rootRect = root.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const width = Math.min(
        320,
        Math.max(220, rootRect.width),
        window.innerWidth - margin * 2,
      );
      panel.style.position = "fixed";
      panel.style.width = `${Math.round(width)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.round(Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, rootRect.left),
      ))}px`;
      panel.style.top = `${Math.round(rootRect.bottom + gap)}px`;
      const panelRect = panel.getBoundingClientRect();
      if (
        panelRect.bottom > window.innerHeight - 8
        && rootRect.top > panelRect.height + 8
      ) {
        panel.style.top = `${Math.round(rootRect.top - panelRect.height - gap)}px`;
      }
    }

    function syncPanelPortal(open) {
      if (open) {
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = false;
        placePanel();
        return;
      }
      panel.hidden = true;
      if (panel.parentElement !== root) root.appendChild(panel);
      panel.removeAttribute("style");
    }

    function handleViewportChange() {
      if (modelState(model).open) placePanel();
    }

    function renderOptionList(state) {
      const rows = optionRows(state.options);
      const selectable = rows.filter((row) => row.type === "option" && !row.disabled);
      list.replaceChildren();
      rows.forEach((row) => {
        if (row.type === "group") {
          const heading = document.createElement("div");
          heading.className = "tn-select__group";
          heading.textContent = row.group;
          heading.setAttribute("role", "presentation");
          list.appendChild(heading);
          return;
        }

        const option = document.createElement("button");
        const marker = document.createElement("span");
        const copy = document.createElement("span");
        const label = document.createElement("span");
        const meta = document.createElement("span");
        const selectableIndex = selectable.findIndex((entry) => entry === row);
        const selected = valuesEqual(row.value, state.value);
        const active = selectableIndex === state.activeIndex;
        option.type = "button";
        option.className = classNames(
          "tn-select__option",
          selected && "is-selected",
          active && "is-active",
          row.disabled && "is-disabled",
        );
        option.disabled = Boolean(row.disabled);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(selected));
        option.dataset.value = String(row.value ?? "");
        marker.className = classNames(
          "tn-select__marker",
          row.color && "is-color",
          row.kind && `is-${row.kind}`,
        );
        if (row.color) marker.style.backgroundColor = row.color;
        copy.className = "tn-select__option-copy";
        label.className = "tn-select__option-label";
        label.textContent = row.label ?? String(row.value ?? "");
        copy.appendChild(label);
        if (row.description) {
          const description = document.createElement("small");
          description.textContent = row.description;
          copy.appendChild(description);
        }
        meta.className = "tn-select__option-meta";
        meta.textContent = row.count === undefined || row.count === null ? "" : String(row.count);
        option.append(marker, copy, meta);
        option.addEventListener("pointermove", () => {
          if (selectableIndex >= 0 && modelState(model).activeIndex !== selectableIndex) {
            model.setActiveIndex?.(selectableIndex);
          }
        });
        option.addEventListener("click", (event) => {
          model.select?.(row.value, { event });
          trigger.focus();
        });
        list.appendChild(option);
      });
    }

    function sync() {
      const state = modelState(model);
      const selected = model.selectedOption?.()
        || state.value2
        || optionRows(state.options).find((option) =>
          option.type === "option" && valuesEqual(option.value, state.value),
        )
        || null;
      const currentValue = state.value ?? "";
      const isPlaceholder = !selected;
      hidden.value = currentValue == null ? "" : String(currentValue);
      hidden.disabled = Boolean(state.disabled);
      value.textContent = selected
        ? selected.label ?? String(selected.value ?? "")
        : state.placeholder || props.placeholder || "请选择";
      value.classList.toggle("is-placeholder", isPlaceholder);
      leading.hidden = !leadingIcon && !selected?.color;
      if (!leadingIcon && selected?.color) {
        leading.replaceChildren();
        const dot = document.createElement("span");
        dot.className = "tn-select__selected-color";
        dot.style.backgroundColor = selected.color;
        leading.appendChild(dot);
      }
      trigger.disabled = Boolean(state.disabled);
      trigger.setAttribute("aria-expanded", String(Boolean(state.open)));
      root.className = classNames(
        "tn-select-root",
        `tn-select-root--${size}`,
        `tn-select-root--${variant}`,
        state.open && "is-open",
        state.disabled && "is-disabled",
        props.invalid && "is-invalid",
        props.rootClass,
      );
      trigger.className = classNames(
        "tn-select",
        `tn-select--${size}`,
        `tn-select--${variant}`,
        props.class,
      );
      setAttribute(trigger, "aria-invalid", props.invalid ? "true" : null);
      renderOptionList(state);
      syncPanelPortal(Boolean(state.open));
    }

    trigger.addEventListener("pointerdown", () => {
      trigger.focus({ preventScroll: true });
    });
    trigger.addEventListener("click", () => {
      trigger.focus({ preventScroll: true });
      if (typeof model.toggle === "function") model.toggle();
      else if (modelState(model).open) model.hide?.();
      else model.show?.();
    });
    trigger.addEventListener("keydown", (event) => {
      if (model.handleKeyDown?.(event.key, event)) event.preventDefault();
    });
    document.addEventListener("pointerdown", handlePointerDown);

    function handlePointerDown(event) {
      if (!root.contains(event.target) && !panel.contains(event.target)) {
        if (typeof model.close === "function") model.close();
        else model.hide?.();
      }
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const unsubscribe = subscribeModel(model, sync);
    sync();
    const view = {
      t: "view",
      $elm: root,
      control: hidden,
      model,
      panel,
      trigger,
      render() {
        return root;
      },
      onMounted() {},
      beforeUnmounted() {},
      onUnmounted() {
        document.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
        panel.remove();
        unsubscribe?.();
        if (resolved.owned) model.destroy?.();
      },
    };
    return view;
  };
}

export { optionRows };
