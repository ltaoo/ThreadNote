import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";
import { VaultPickerPageModel } from "./index.model.js";

const { Button, DOM, For, Input, Show, View, computed } =
  TimelessPrimitive;

function VaultItemView(props) {
  const path = String(props.vault.path || "");
  return Button(
    {
      class: "vault-picker-item",
      disabled: props.vm$.state.loading,
      attributes: {
        n: "vault-picker-recent-item",
        type: "button",
      },
      onClick() {
        props.vm$.methods.openVault(path);
      },
    },
    [
      View(
        {
          class: "vault-picker-item-icon",
          attributes: { n: "vault-picker-recent-item-icon" },
        },
        [
          Timeless.Icon({
            name: "folder",
            attributes: { n: "vault-picker-folder-icon" },
          }),
        ],
      ),
      View(
        {
          class: "vault-picker-item-copy",
          attributes: { n: "vault-picker-recent-item-copy" },
        },
        [
          View(
            {
              class: "vault-picker-item-name",
              attributes: { n: "vault-picker-recent-item-name" },
            },
            [props.vault.name || "Vault"],
          ),
          View(
            {
              class: "vault-picker-item-path",
              attributes: { n: "vault-picker-recent-item-path" },
            },
            [path],
          ),
        ],
      ),
    ],
  );
}

/** @param {ViewComponentProps} props */
function VaultPickerContentView(props) {
  const vm$ = VaultPickerPageModel(props);
  const status_text_ = computed(vm$.state.dataFileExists, function (exists) {
    return exists ? "已有本机 vault 记录" : "首次打开";
  });
  const data_path_text_ = computed(vm$.state.dataPath, function (path) {
    return path || "-";
  });
  const page_class_ = computed(vm$.state.loading, function (loading) {
    return ["page vault-picker-page w-full h-full", loading ? "is-loading" : ""]
      .filter(Boolean)
      .join(" ");
  });
  const message_class_ = computed(vm$.state.messageType, function (type) {
    return ["vault-picker-message", type ? "is-" + type : ""]
      .filter(Boolean)
      .join(" ");
  });
  const vault_list_empty_ = computed(vm$.state.vaults, function (vaults) {
    return vaults.length === 0;
  });

  return View(
    {
      class: page_class_,
      attributes: { n: "vault-picker-page" },
      onMounted() {
        vm$.methods.init();
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "vault-picker-shell",
          attributes: { n: "vault-picker-shell" },
        },
        [
          View(
            {
              class: "vault-picker-panel",
              attributes: { n: "vault-picker-panel" },
            },
            [
              View(
                {
                  class: "vault-picker-header",
                  attributes: { n: "vault-picker-header" },
                },
                [
                  View(
                    {
                      class: "vault-picker-mark",
                      attributes: { n: "vault-picker-brand-mark" },
                    },
                    [
                      Timeless.Icon({
                        name: "file-text",
                        size: 28,
                        attributes: { n: "vault-picker-brand-icon" },
                      }),
                    ],
                  ),
                  View(
                    {
                      class: "vault-picker-heading-copy",
                      attributes: { n: "vault-picker-heading-copy" },
                    },
                    [
                      View(
                        {
                          class: "vault-picker-title",
                          attributes: {
                            "aria-level": "1",
                            n: "vault-picker-title",
                            role: "heading",
                          },
                        },
                        ["选择 Vault"],
                      ),
                      View(
                        {
                          class: "vault-picker-status",
                          attributes: { n: "vault-picker-status" },
                        },
                        [status_text_],
                      ),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "vault-picker-meta",
                  attributes: { n: "vault-picker-local-record" },
                },
                [
                  View(
                    {
                      class: "vault-picker-meta-label",
                      attributes: { n: "vault-picker-local-record-label" },
                    },
                    ["本机记录"],
                  ),
                  View(
                    {
                      class: "vault-picker-data-path",
                      attributes: { n: "vault-picker-local-record-path" },
                    },
                    [data_path_text_],
                  ),
                ],
              ),
              View(
                {
                  class: "vault-picker-form",
                  attributes: {
                    "aria-label": "打开 Vault",
                    n: "vault-picker-open-form",
                    role: "form",
                  },
                },
                [
                  Input({
                    autocomplete: false,
                    disabled: vm$.state.loading,
                    placeholder: "~/Documents/ThreadNote",
                    value: vm$.state.path,
                    attributes: { n: "vault-picker-path-input", type: "text" },
                    onInput(event) {
                      vm$.methods.setPath(event.currentTarget.value);
                    },
                    onKeyDown(event) {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      vm$.methods.openVault();
                    },
                  }),
                  Button(
                    {
                      class: "vault-picker-button is-primary",
                      disabled: vm$.state.loading,
                      attributes: { n: "vault-picker-open-button", type: "button" },
                      onClick() {
                        vm$.methods.openVault();
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "check",
                        attributes: { n: "vault-picker-open-icon" },
                      }),
                      "打开",
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "vault-picker-actions",
                  attributes: { n: "vault-picker-actions" },
                },
                [
                  Button(
                    {
                      class: "vault-picker-button",
                      disabled: vm$.state.loading,
                      attributes: {
                        n: "vault-picker-choose-directory-button",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.chooseVault();
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "plus",
                        attributes: { n: "vault-picker-add-icon" },
                      }),
                      "选择目录",
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "vault-picker-section",
                  attributes: { n: "vault-picker-recent-section" },
                },
                [
                  View(
                    {
                      class: "vault-picker-section-title",
                      attributes: { n: "vault-picker-recent-title" },
                    },
                    ["最近 Vault"],
                  ),
                  View(
                    {
                      class: "vault-picker-list",
                      attributes: { n: "vault-picker-recent-list" },
                    },
                    [
                      For({
                        each: vm$.state.vaults,
                        render(vault) {
                          return VaultItemView({ vault, vm$ });
                        },
                      }),
                      Show({
                        when: vault_list_empty_,
                        ok() {
                          return [
                            View(
                              {
                                class: "vault-picker-empty",
                                attributes: { n: "vault-picker-empty-state" },
                              },
                              ["暂无 vault"],
                            ),
                          ];
                        },
                      }),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: message_class_,
                  attributes: {
                    "aria-live": "polite",
                    n: "vault-picker-message",
                    role: "status",
                  },
                },
                [vm$.state.message],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

/**
 * The desktop router owns the route host while Timeless.DOM mounts the page
 * content into that host.
 *
 * @param {ViewComponentProps} props
 */
export function VaultPickerPageView(props) {
  const content$ = VaultPickerContentView(props);
  return globalThis.View(
    {
      class: "vault-picker-route-host w-full h-full",
      attributes: { n: "vault-picker-route-host" },
      onMounted(event) {
        const root = event && event.target ? event.target : event;
        DOM.render(content$, root);
      },
      onUnmounted() {
        content$.destroy?.();
      },
    },
    [],
  );
}
