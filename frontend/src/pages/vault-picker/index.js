import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";
import { VaultPickerPageModel } from "./index.model.js";

const { Button, DOM, For, Input, Show, View, computed } =
  TimelessPrimitive;

function VaultItemView(props) {
  const path = String(props.vault.path || "");
  const provider = String(props.vault.provider || "local");
  return Button(
    {
      class: "vault-picker-item",
      disabled: props.vm$.state.loading,
      attributes: {
        n: "vault-picker-recent-item",
        type: "button",
      },
      onClick() {
        props.vm$.methods.openRegisteredVault(props.vault);
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
            name: provider === "cloudflare" ? "cloud-download" : "folder",
            attributes: { n: "vault-picker-provider-icon" },
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

function CloudflareFieldView(props) {
  return View(
    {
      class: "vault-picker-field",
      attributes: { n: props.meaning + "-field" },
    },
    [
      View(
        {
          class: "vault-picker-field-label",
          attributes: { n: props.meaning + "-label" },
        },
        [props.label],
      ),
      Input({
        autocomplete: false,
        disabled: props.vm$.state.loading,
        placeholder: props.placeholder,
        value: props.value,
        attributes: {
          "aria-label": props.label,
          n: props.meaning + "-input",
          type: props.secret ? "password" : "text",
        },
        onInput(event) {
          props.vm$.methods.setCloudflareField(props.field, event.currentTarget.value);
        },
        onKeyDown(event) {
          if (event.key !== "Enter") return;
          event.preventDefault();
          props.vm$.methods.openCloudflareVault();
        },
      }),
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
  const local_mode_ = computed(vm$.state.mode, function (mode) {
    return mode === "local";
  });
  const cloudflare_mode_ = computed(vm$.state.mode, function (mode) {
    return mode === "cloudflare";
  });
  const local_button_class_ = computed(vm$.state.mode, function (mode) {
    return "vault-picker-provider-button" + (mode === "local" ? " is-active" : "");
  });
  const cloudflare_button_class_ = computed(vm$.state.mode, function (mode) {
    return "vault-picker-provider-button" + (mode === "cloudflare" ? " is-active" : "");
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
                  class: "vault-picker-provider-tabs",
                  attributes: {
                    "aria-label": "Vault 类型",
                    n: "vault-picker-provider-tabs",
                    role: "group",
                  },
                },
                [
                  Button(
                    {
                      class: local_button_class_,
                      disabled: vm$.state.loading,
                      attributes: {
                        n: "vault-picker-local-provider-button",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.setMode("local");
                      },
                    },
                    ["本地目录"],
                  ),
                  Button(
                    {
                      class: cloudflare_button_class_,
                      disabled: vm$.state.loading,
                      attributes: {
                        n: "vault-picker-cloudflare-provider-button",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.setMode("cloudflare");
                      },
                    },
                    ["Cloudflare"],
                  ),
                ],
              ),
              Show({
                when: local_mode_,
                ok() {
                  return View(
                    {
                      class: "vault-picker-local-pane",
                      attributes: { n: "vault-picker-local-pane" },
                    },
                    [
                      View(
                        {
                          class: "vault-picker-form",
                          attributes: {
                            "aria-label": "打开本地 Vault",
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
                    ],
                  );
                },
              }),
              Show({
                when: cloudflare_mode_,
                ok() {
                  return View(
                    {
                      class: "vault-picker-cloudflare-pane",
                      attributes: {
                        "aria-label": "打开 Cloudflare Vault",
                        n: "vault-picker-cloudflare-pane",
                        role: "form",
                      },
                    },
                    [
                      CloudflareFieldView({
                        field: "name",
                        label: "Vault 名称",
                        meaning: "vault-picker-cloudflare-name",
                        placeholder: "Cloudflare Vault",
                        value: vm$.state.name,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "accountId",
                        label: "Account ID",
                        meaning: "vault-picker-cloudflare-account-id",
                        placeholder: "Cloudflare Account ID",
                        value: vm$.state.accountId,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "databaseId",
                        label: "D1 Database ID",
                        meaning: "vault-picker-cloudflare-database-id",
                        placeholder: "D1 Database UUID",
                        value: vm$.state.databaseId,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "apiToken",
                        label: "API Token",
                        meaning: "vault-picker-cloudflare-api-token",
                        placeholder: "需要 D1 Read / Write",
                        secret: true,
                        value: vm$.state.apiToken,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "r2Bucket",
                        label: "R2 Bucket",
                        meaning: "vault-picker-cloudflare-r2-bucket",
                        placeholder: "threadnote-assets",
                        value: vm$.state.r2Bucket,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "r2AccessKeyId",
                        label: "R2 Access Key ID",
                        meaning: "vault-picker-cloudflare-r2-access-key",
                        placeholder: "R2 S3 Access Key ID",
                        value: vm$.state.r2AccessKeyId,
                        vm$,
                      }),
                      CloudflareFieldView({
                        field: "r2SecretAccessKey",
                        label: "R2 Secret Access Key",
                        meaning: "vault-picker-cloudflare-r2-secret-key",
                        placeholder: "R2 S3 Secret Access Key",
                        secret: true,
                        value: vm$.state.r2SecretAccessKey,
                        vm$,
                      }),
                      Button(
                        {
                          class: "vault-picker-button is-primary vault-picker-cloudflare-open",
                          disabled: vm$.state.loading,
                          attributes: {
                            n: "vault-picker-cloudflare-open-button",
                            type: "button",
                          },
                          onClick() {
                            vm$.methods.openCloudflareVault();
                          },
                        },
                        [
                          Timeless.Icon({
                            name: "cloud-download",
                            attributes: { n: "vault-picker-cloudflare-open-icon" },
                          }),
                          "连接并打开",
                        ],
                      ),
                    ],
                  );
                },
              }),
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
