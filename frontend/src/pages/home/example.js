import { tn } from "@/tnui.js";
import { UIExamplePageModel } from "./example.model.js";

const NAV_ITEMS = [
  { id: "controls", label: "Controls" },
  { id: "list", label: "List" },
  { id: "table", label: "Table" },
];

export function UIExamplePageView(model = new UIExamplePageModel()) {
  return View(
    {
      class: "ui-example-page flex",
      attributes: { n: "ui-example-page" },
      onUnmounted() {
        model.destroy();
      },
    },
    [
      View(
        {
          class: "ui-example-nav w-[320px]",
          attributes: { n: "ui-example-navigation" },
        },
        [
          For({
            each: NAV_ITEMS,
            render(menu) {
              return View(
                {
                  class: "flex items-center px-4 py-2",
                  attributes: { n: `ui-example-navigation-${menu.id}` },
                },
                [Txt(menu.label)],
              );
            },
          }),
        ],
      ),
      View(
        {
          class: "ui-example-main flex-1 w-0 p-4",
          attributes: { n: "ui-example-content" },
        },
        [
          View(
            {
              class: "sections space-y-8",
              attributes: { n: "ui-example-sections" },
            },
            [
              View(
                {
                  class: "section",
                  attributes: { n: "button-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "button-example-title" },
                    },
                    [Txt("Button")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "button-example-controls" },
                    },
                    [
                      tn.Button({ store: model.regular_button_store }, [
                        Txt("Regular Button"),
                      ]),
                      tn.Button({ store: model.primary_button_store }, [
                        Txt("Primary Button"),
                      ]),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "section",
                  attributes: { n: "dropdown-menu-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "dropdown-menu-example-title" },
                    },
                    [Txt("Dropdown Menu")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "dropdown-menu-example-controls" },
                    },
                    [
                      tn.DropdownMenu({ store: model.dropdown_store }, [
                        tn.Button({ store: model.dropdown_trigger_store }, [
                          Txt("Click it"),
                        ]),
                      ]),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "section",
                  attributes: { n: "select-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "select-example-title" },
                    },
                    [Txt("Select")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "select-example-control" },
                    },
                    [tn.Select({ store: model.select_store })],
                  ),
                ],
              ),
              View(
                {
                  class: "section",
                  attributes: { n: "input-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "input-example-title" },
                    },
                    [Txt("Input")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "input-example-control" },
                    },
                    [tn.Input({ store: model.input_store })],
                  ),
                ],
              ),
              View(
                {
                  class: "section",
                  attributes: { n: "checkbox-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "checkbox-example-title" },
                    },
                    [Txt("Checkbox")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "checkbox-example-control" },
                    },
                    [tn.Checkbox({ store: model.checkbox_store })],
                  ),
                ],
              ),
              View(
                {
                  class: "section",
                  attributes: { n: "switch-example-section" },
                },
                [
                  View(
                    {
                      class: "section__title text-2xl",
                      attributes: { n: "switch-example-title" },
                    },
                    [Txt("Switch")],
                  ),
                  View(
                    {
                      class: "section__body space-x-4",
                      attributes: { n: "switch-example-control" },
                    },
                    [tn.Switch({ store: model.switch_store })],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
