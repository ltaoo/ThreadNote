export class UIExamplePageModel {
  constructor(runtime = globalThis.Timeless) {
    const { vm } = runtime;

    this.regular_button_store = new vm.ButtonCore();
    this.primary_button_store = new vm.ButtonCore({ variant: "primary" });
    this.dropdown_trigger_store = new vm.ButtonCore({ variant: "outline" });
    this.dropdown_store = new vm.DropdownMenuCore({
      align: "start",
      trigger: "click",
      items: [
        new vm.MenuItemCore({
          label: "Apple",
          onClick: () => this.select_menu_item("apple"),
        }),
        new vm.MenuItemCore({
          label: "Banana",
          onClick: () => this.select_menu_item("banana"),
        }),
      ],
    });
    this.select_store = new vm.SelectCore({
      defaultValue: "apple",
      options: [
        new vm.SelectItemCore({ value: "apple", label: "苹果" }),
        new vm.SelectItemCore({ value: "banana", label: "香蕉" }),
      ],
      position: "popper",
    });
    this.input_store = new vm.InputCore({ defaultValue: "" });
    this.checkbox_store = new vm.CheckboxCore({ checked: false });
    this.switch_store = new vm.SwitchCore({ defaultValue: false });
  }

  select_menu_item(value) {
    console.log(`[UI Example] selected menu item: ${value}`);
  }

  destroy() {
    this.regular_button_store.destroy?.();
    this.primary_button_store.destroy?.();
    this.dropdown_trigger_store.destroy?.();
    this.dropdown_store.unmount?.();
    this.select_store.destroy?.();
    this.input_store.destroy?.();
    this.checkbox_store.destroy?.();
    this.switch_store.destroy?.();
  }
}
