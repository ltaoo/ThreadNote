import {
  For,
  Fragment,
  Runtime as Timeless,
  Show,
  View,
  computed,
  destroy_with,
  observe_store,
  require_store,
  semantic_props,
  ui,
  vm,
} from "./runtime.js";

function is_instance(value, Type) {
  return typeof Type === "function" && value instanceof Type;
}

function menu_separator() {
  return ui.DropdownMenuPrimitive.Separator(
    semantic_props({}, "tn-dropdown-menu__separator", "dropdown-menu-separator"),
  );
}

function menu_group(group) {
  const observation = observe_store(group);
  return ui.DropdownMenuPrimitive.Group(
    semantic_props(
      {
        store: group,
        onUnmounted: destroy_with(observation),
      },
      "tn-dropdown-menu__group",
      "dropdown-menu-group",
    ),
    [
      Show({
        when: computed(observation.state_, (state) => Boolean(state.label)),
        ok() {
          return ui.DropdownMenuPrimitive.Label(
            semantic_props({}, "tn-dropdown-menu__label", "dropdown-menu-group-label"),
            [computed(observation.state_, (state) => state.label || "")],
          );
        },
      }),
      For({
        each: computed(observation.state_, (state) => state.items || []),
        render: menu_entry,
      }),
    ],
  );
}

function menu_item(store) {
  const observation = observe_store(store);
  const menu_observation = store.menu ? observe_store(store.menu) : null;
  return View(
    semantic_props(
      {
        onUnmounted() {
          observation.destroy();
          menu_observation?.destroy();
        },
      },
      "tn-dropdown-menu__item-root",
      "dropdown-menu-item-root",
    ),
    [
      ui.DropdownMenuPrimitive.Item(
        semantic_props(
          {
            store,
            class: computed(observation.state_, (state) => [
              state.focused ? "is-focused" : "",
              state.disabled ? "is-disabled" : "",
              store.variant === "destructive" ? "is-danger" : "",
            ].filter(Boolean).join(" ")),
            attributes: {
              "data-variant": store.variant || "default",
            },
          },
          "tn-dropdown-menu__item",
          "dropdown-menu-item",
        ),
        [
          store.icon
            ? View(
              semantic_props({}, "tn-dropdown-menu__icon", "dropdown-menu-item-icon"),
              [store.icon],
            )
            : null,
          View(
            semantic_props({}, "tn-dropdown-menu__item-label", "dropdown-menu-item-label"),
            [store.label],
          ),
          store.shortcut
            ? View(
              semantic_props(
                {},
                "tn-dropdown-menu__shortcut",
                "dropdown-menu-item-shortcut",
              ),
              [computed(observation.state_, (state) => state.shortcut || store.shortcut)],
            )
            : null,
          store.menu
            ? Timeless.Icon({
              name: "chevron-right",
              class: "tn-icon",
              size: 14,
              attributes: { n: "dropdown-menu-submenu-icon" },
            })
            : null,
        ].filter(Boolean),
      ),
      store.menu
        ? Show({
          when: computed(menu_observation.state_, (state) => Boolean(state.open)),
          ok() {
            return ui.DropdownMenuPrimitive.SubMenuContent(
              semantic_props(
                { store: store.menu },
                "tn-popup tn-dropdown-menu__content",
                "dropdown-submenu-content",
              ),
              [
                For({
                  each: computed(menu_observation.state_, (state) => state.items || []),
                  render: menu_entry,
                }),
              ],
            );
          },
        })
        : null,
    ].filter(Boolean),
  );
}

function menu_entry(entry) {
  if (is_instance(entry, vm.MenuSeparatorCore)) return menu_separator();
  if (is_instance(entry, vm.MenuGroupCore)) return menu_group(entry);
  return menu_item(entry);
}

export function DropdownMenu(props = {}, children = []) {
  const { store: provided_store, onUnmounted, ...rest } = props;
  const store = require_store("DropdownMenu", provided_store);
  const observation = observe_store(store);
  return Fragment(
    {
      onUnmounted: destroy_with(observation, onUnmounted),
    },
    [
      children.length
        ? ui.DropdownMenuPrimitive.Trigger(
          semantic_props({ store }, "tn-dropdown-menu__trigger", "dropdown-menu-trigger"),
          children,
        )
        : null,
      ui.DropdownMenuPrimitive.Content(
        semantic_props(
          {
            ...rest,
            store,
            animation: { in: "is-entering", out: "is-exiting" },
          },
          "tn-popup tn-dropdown-menu__content",
          "dropdown-menu-content",
        ),
        () => [
          For({
            each: computed(observation.state_, (state) => state.items || []),
            render: menu_entry,
          }),
        ],
      ),
    ].filter(Boolean),
  );
}
