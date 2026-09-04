import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

import {
  CREDENTIAL_TYPE_OPTIONS,
  HomeCredentialsPageModel,
} from "./home_credentials.model.js";

function CredentialNoticeView(vm$) {
  const { Show, View } = TimelessPrimitive;
  return View(
    {
      class: "credential-notices",
      attributes: { "aria-live": "polite", n: "credential-notices" },
    },
    [
      Show({
        when: TimelessPrimitive.computed(vm$.state.error, Boolean),
        ok() {
          return View(
            {
              as: "p",
              class: "credential-notice is-error",
              attributes: { n: "credential-error-message", role: "alert" },
            },
            [vm$.state.error],
          );
        },
      }),
      Show({
        when: TimelessPrimitive.computed(vm$.state.message, Boolean),
        ok() {
          return View(
            {
              as: "p",
              class: "credential-notice is-success",
              attributes: { n: "credential-success-message", role: "status" },
            },
            [vm$.state.message],
          );
        },
      }),
    ],
  );
}

function CredentialPasswordFieldView(props) {
  const { Input, View } = TimelessPrimitive;
  return View(
    {
      as: "label",
      class: "credential-form-field",
      attributes: { n: props.meaning + "-field" },
    },
    [
      View(
        {
          as: "span",
          class: "credential-form-label",
          attributes: { n: props.meaning + "-label" },
        },
        [props.label],
      ),
      Input({
        autocomplete: props.autocomplete,
        disabled: props.vm$.state.loading,
        value: props.value,
        attributes: {
          "aria-label": props.label,
          n: props.meaning + "-input",
          type: "password",
        },
        onInput(event) {
          props.onInput(event.currentTarget.value);
        },
      }),
    ],
  );
}

function CredentialSetupView(vm$) {
  const { Button, View } = TimelessPrimitive;
  return View(
    {
      as: "section",
      class: "credential-gate-card",
      attributes: { n: "credential-setup-panel" },
    },
    [
      View(
        {
          class: "credential-gate-icon",
          attributes: { n: "credential-setup-icon" },
        },
        [
          Timeless.Icon({
            attributes: { n: "credential-setup-lock-icon" },
            name: "lock",
            size: 24,
          }),
        ],
      ),
      View(
        {
          as: "h2",
          class: "credential-gate-title",
          attributes: { n: "credential-setup-title" },
        },
        ["创建凭证库"],
      ),
      View(
        {
          as: "p",
          class: "credential-gate-description",
          attributes: { n: "credential-setup-description" },
        },
        ["为当前 Vault 设置至少 12 个字符的主密码。主密码无法找回。"],
      ),
      View(
        {
          as: "form",
          class: "credential-gate-form",
          attributes: { n: "credential-setup-form" },
          onSubmit(event) {
            event.preventDefault();
            void vm$.methods.setup();
          },
        },
        [
          CredentialPasswordFieldView({
            autocomplete: "new-password",
            label: "主密码",
            meaning: "credential-setup-password",
            onInput: vm$.methods.setSetupPassword,
            value: vm$.state.setupPassword,
            vm$,
          }),
          CredentialPasswordFieldView({
            autocomplete: "new-password",
            label: "确认主密码",
            meaning: "credential-setup-confirmation",
            onInput: vm$.methods.setSetupConfirmation,
            value: vm$.state.setupConfirmation,
            vm$,
          }),
          Button(
            {
              class: "credential-primary-button",
              disabled: vm$.state.loading,
              attributes: { n: "credential-setup-submit", type: "button" },
              onClick() {
                void vm$.methods.setup();
              },
            },
            ["创建并解锁"],
          ),
        ],
      ),
    ],
  );
}

function CredentialUnlockView(vm$) {
  const { Button, View } = TimelessPrimitive;
  return View(
    {
      as: "section",
      class: "credential-gate-card",
      attributes: { n: "credential-unlock-panel" },
    },
    [
      View(
        {
          class: "credential-gate-icon",
          attributes: { n: "credential-unlock-icon" },
        },
        [
          Timeless.Icon({
            attributes: { n: "credential-unlock-lock-icon" },
            name: "lock",
            size: 24,
          }),
        ],
      ),
      View(
        {
          as: "h2",
          class: "credential-gate-title",
          attributes: { n: "credential-unlock-title" },
        },
        ["凭证库已锁定"],
      ),
      View(
        {
          as: "p",
          class: "credential-gate-description",
          attributes: { n: "credential-unlock-description" },
        },
        ["输入当前 Vault 的主密码。离开本页或空闲 10 分钟后会自动锁定。"],
      ),
      View(
        {
          as: "form",
          class: "credential-gate-form",
          attributes: { n: "credential-unlock-form" },
          onSubmit(event) {
            event.preventDefault();
            void vm$.methods.unlock();
          },
        },
        [
          CredentialPasswordFieldView({
            autocomplete: "current-password",
            label: "主密码",
            meaning: "credential-unlock-password",
            onInput: vm$.methods.setUnlockPassword,
            value: vm$.state.unlockPassword,
            vm$,
          }),
          Button(
            {
              class: "credential-primary-button",
              disabled: vm$.state.loading,
              attributes: { n: "credential-unlock-submit", type: "button" },
              onClick() {
                void vm$.methods.unlock();
              },
            },
            ["解锁"],
          ),
        ],
      ),
    ],
  );
}

function CredentialTypeSelectView(props) {
  const { Select } = TimelessPrimitive;
  return Select({
    class: props.className || "credential-select",
    options: props.options,
    value: props.value,
    attributes: {
      "aria-label": props.label,
      n: props.meaning,
    },
    onChange(event) {
      props.onChange(event.currentTarget.value);
    },
  });
}

function CredentialListView(vm$) {
  const { Button, For, Input, Show, View } = TimelessPrimitive;
  const list_empty_ = TimelessPrimitive.computed(
    vm$.ui.visibleItems,
    function (items) { return items.length === 0; },
  );
  return View(
    {
      as: "aside",
      class: "credential-list-panel",
      attributes: { "aria-label": "凭证列表", n: "credential-list-panel" },
    },
    [
      View(
        {
          class: "credential-list-toolbar",
          attributes: { n: "credential-list-toolbar" },
        },
        [
          Input({
            class: "credential-search-input",
            placeholder: "搜索标题、网址或标签",
            value: vm$.state.query,
            attributes: {
              "aria-label": "搜索凭证",
              n: "credential-search-input",
              type: "search",
            },
            onInput(event) {
              vm$.methods.setQuery(event.currentTarget.value);
            },
          }),
          CredentialTypeSelectView({
            label: "筛选凭证类型",
            meaning: "credential-type-filter",
            onChange: vm$.methods.setTypeFilter,
            options: [{ label: "全部类型", value: "all" }, ...CREDENTIAL_TYPE_OPTIONS],
            value: vm$.state.typeFilter,
          }),
        ],
      ),
      View(
        {
          class: "credential-list",
          attributes: { n: "credential-list" },
        },
        [
          Show({
            when: list_empty_,
            ok() {
              return View(
                {
                  class: "credential-empty-list",
                  attributes: { n: "credential-list-empty" },
                },
                ["暂无匹配凭证"],
              );
            },
          }),
          For({
            each: vm$.ui.visibleItems,
            render(item) {
              return Button(
                {
                  class: vm$.ui.itemButtonClass(item.id),
                  attributes: {
                    n: "credential-list-item",
                    title: item.title,
                    type: "button",
                  },
                  onClick() {
                    void vm$.methods.selectItem(item.id);
                  },
                },
                [
                  View(
                    {
                      class: "credential-list-item-icon",
                      attributes: { n: "credential-list-item-icon" },
                    },
                    [
                      Timeless.Icon({
                        attributes: { n: "credential-list-item-key-icon" },
                        name: "key",
                        size: 16,
                      }),
                    ],
                  ),
                  View(
                    {
                      class: "credential-list-item-copy",
                      attributes: { n: "credential-list-item-copy" },
                    },
                    [
                      View(
                        {
                          as: "strong",
                          attributes: { n: "credential-list-item-title" },
                        },
                        [item.title],
                      ),
                      View(
                        {
                          as: "span",
                          attributes: { n: "credential-list-item-meta" },
                        },
                        [vm$.ui.typeLabel(item.type), item.url ? " · " + item.url : ""],
                      ),
                    ],
                  ),
                ],
              );
            },
          }),
        ],
      ),
    ],
  );
}

function CredentialEditorFieldView(vm$, field) {
  const { Button, Checkbox, Input, Textarea, View } = TimelessPrimitive;
  const secret_class_ = TimelessPrimitive.computed(
    vm$.state.draftRevealedFields,
    function (revealed) {
      return "credential-field-value-input" +
        (field.secret && !revealed.includes(field.id) ? " is-secret" : "");
    },
  );
  return View(
    {
      class: "credential-editor-field-row",
      attributes: { n: "credential-editor-field-row" },
    },
    [
      Input({
        class: "credential-field-name-input",
        value: field.label,
        attributes: {
          "aria-label": "字段名称",
          n: "credential-editor-field-name",
          type: "text",
        },
        onInput(event) {
          vm$.methods.setDraftFieldValue(field.id, "label", event.currentTarget.value);
        },
      }),
      Textarea({
        class: secret_class_,
        value: field.value,
        attributes: {
          "aria-label": field.label + "的值",
          n: "credential-editor-field-value",
          rows: "2",
          spellcheck: "false",
        },
        onInput(event) {
          vm$.methods.setDraftFieldValue(field.id, "value", event.currentTarget.value);
        },
      }),
      View(
        {
          as: "label",
          class: "credential-secret-checkbox",
          attributes: { n: "credential-editor-field-secret-control" },
        },
        [
          Checkbox({
            checked: field.secret,
            attributes: {
              "aria-label": field.label + "是敏感字段",
              n: "credential-editor-field-secret",
            },
            onChange(event) {
              vm$.methods.setDraftFieldSecret(field.id, event.currentTarget.checked);
            },
          }),
          View(
            {
              as: "span",
              attributes: { n: "credential-editor-field-secret-label" },
            },
            ["敏感"],
          ),
        ],
      ),
      field.secret
        ? Button(
          {
            class: "credential-text-button",
            attributes: {
              n: "credential-editor-field-toggle",
              type: "button",
            },
            onClick() {
              vm$.methods.toggleDraftField(field.id);
            },
          },
          [TimelessPrimitive.computed(
            vm$.state.draftRevealedFields,
            function (revealed) {
              return revealed.includes(field.id) ? "隐藏" : "显示";
            },
          )],
        )
        : null,
      Button(
        {
          class: "credential-icon-button is-danger",
          attributes: {
            "aria-label": "移除字段",
            n: "credential-editor-field-remove",
            title: "移除字段",
            type: "button",
          },
          onClick() {
            vm$.methods.removeDraftField(field.id);
          },
        },
        [
          Timeless.Icon({
            attributes: { n: "credential-editor-field-remove-icon" },
            name: "x",
            size: 16,
          }),
        ],
      ),
    ].filter(Boolean),
  );
}

function CredentialEditorView(vm$) {
  const { Button, For, Input, Textarea, View } = TimelessPrimitive;
  const draft_value_ = function (name) {
    return TimelessPrimitive.computed(vm$.state.draft, function (draft) {
      return draft?.[name] || "";
    });
  };
  return View(
    {
      as: "form",
      class: "credential-detail-panel credential-editor",
      attributes: { n: "credential-editor" },
      onSubmit(event) {
        event.preventDefault();
        void vm$.methods.saveDraft();
      },
    },
    [
      View(
        {
          class: "credential-detail-heading",
          attributes: { n: "credential-editor-heading" },
        },
        [
          View(
            {
              as: "h2",
              attributes: { n: "credential-editor-title" },
            },
            [TimelessPrimitive.computed(vm$.state.draft, function (draft) {
              return draft?.id ? "编辑凭证" : "新建凭证";
            })],
          ),
          View(
            {
              class: "credential-detail-actions",
              attributes: { n: "credential-editor-actions" },
            },
            [
              Button(
                {
                  class: "credential-secondary-button",
                  attributes: { n: "credential-editor-cancel", type: "button" },
                  onClick() {
                    vm$.methods.cancelEdit();
                  },
                },
                ["取消"],
              ),
              Button(
                {
                  class: "credential-primary-button",
                  disabled: vm$.state.loading,
                  attributes: { n: "credential-editor-save", type: "button" },
                  onClick() {
                    void vm$.methods.saveDraft();
                  },
                },
                ["保存"],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "credential-editor-grid",
          attributes: { n: "credential-editor-metadata" },
        },
        [
          View(
            {
              as: "label",
              class: "credential-form-field",
              attributes: { n: "credential-editor-title-field" },
            },
            [
              View(
                {
                  as: "span",
                  class: "credential-form-label",
                  attributes: { n: "credential-editor-title-label" },
                },
                ["标题"],
              ),
              Input({
                value: draft_value_("title"),
                attributes: {
                  "aria-label": "凭证标题",
                  n: "credential-editor-title-input",
                  type: "text",
                },
                onInput(event) {
                  vm$.methods.setDraftValue("title", event.currentTarget.value);
                },
              }),
            ],
          ),
          View(
            {
              as: "label",
              class: "credential-form-field",
              attributes: { n: "credential-editor-type-field" },
            },
            [
              View(
                {
                  as: "span",
                  class: "credential-form-label",
                  attributes: { n: "credential-editor-type-label" },
                },
                ["类型"],
              ),
              CredentialTypeSelectView({
                label: "凭证类型",
                meaning: "credential-editor-type-input",
                onChange: vm$.methods.setDraftType,
                options: CREDENTIAL_TYPE_OPTIONS,
                value: draft_value_("type"),
              }),
            ],
          ),
          View(
            {
              as: "label",
              class: "credential-form-field",
              attributes: { n: "credential-editor-url-field" },
            },
            [
              View(
                {
                  as: "span",
                  class: "credential-form-label",
                  attributes: { n: "credential-editor-url-label" },
                },
                ["网址 / 服务"],
              ),
              Input({
                value: draft_value_("url"),
                attributes: {
                  "aria-label": "网址或服务",
                  n: "credential-editor-url-input",
                  type: "text",
                },
                onInput(event) {
                  vm$.methods.setDraftValue("url", event.currentTarget.value);
                },
              }),
            ],
          ),
          View(
            {
              as: "label",
              class: "credential-form-field",
              attributes: { n: "credential-editor-tags-field" },
            },
            [
              View(
                {
                  as: "span",
                  class: "credential-form-label",
                  attributes: { n: "credential-editor-tags-label" },
                },
                ["标签"],
              ),
              Input({
                value: vm$.ui.draftTags,
                attributes: {
                  "aria-label": "凭证标签",
                  n: "credential-editor-tags-input",
                  placeholder: "工作, 生产",
                  type: "text",
                },
                onInput(event) {
                  vm$.methods.setDraftTags(event.currentTarget.value);
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          as: "section",
          class: "credential-editor-fields",
          attributes: { n: "credential-editor-fields" },
        },
        [
          View(
            {
              class: "credential-section-heading",
              attributes: { n: "credential-editor-fields-heading" },
            },
            [
              View(
                {
                  as: "h3",
                  attributes: { n: "credential-editor-fields-title" },
                },
                ["字段"],
              ),
              Button(
                {
                  class: "credential-text-button",
                  attributes: { n: "credential-editor-field-add", type: "button" },
                  onClick() {
                    vm$.methods.addDraftField();
                  },
                },
                ["添加字段"],
              ),
            ],
          ),
          For({
            each: vm$.state.draftFields,
            render(field) {
              return CredentialEditorFieldView(vm$, field);
            },
          }),
        ],
      ),
      View(
        {
          as: "label",
          class: "credential-form-field",
          attributes: { n: "credential-editor-notes-field" },
        },
        [
          View(
            {
              as: "span",
              class: "credential-form-label",
              attributes: { n: "credential-editor-notes-label" },
            },
            ["备注"],
          ),
          Textarea({
            class: "credential-notes-input",
            value: draft_value_("notes"),
            attributes: {
              "aria-label": "凭证备注",
              n: "credential-editor-notes-input",
              rows: "5",
            },
            onInput(event) {
              vm$.methods.setDraftValue("notes", event.currentTarget.value);
            },
          }),
        ],
      ),
    ],
  );
}

function CredentialDetailFieldView(vm$, field) {
  const { Button, View } = TimelessPrimitive;
  return View(
    {
      class: "credential-detail-field",
      attributes: { n: "credential-detail-field" },
    },
    [
      View(
        {
          as: "span",
          class: "credential-detail-field-label",
          attributes: { n: "credential-detail-field-label" },
        },
        [field.label],
      ),
      View(
        {
          as: "code",
          class: "credential-detail-field-value",
          attributes: { n: "credential-detail-field-value" },
        },
        [vm$.ui.fieldDisplayValue(field)],
      ),
      View(
        {
          class: "credential-detail-field-actions",
          attributes: { n: "credential-detail-field-actions" },
        },
        [
          field.secret && field.hasValue
            ? Button(
              {
                class: "credential-text-button",
                attributes: { n: "credential-detail-field-reveal", type: "button" },
                onClick() {
                  void vm$.methods.toggleReveal(field);
                },
              },
              [vm$.ui.fieldActionLabel(field)],
            )
            : null,
          field.hasValue
            ? Button(
              {
                class: "credential-icon-button",
                attributes: {
                  "aria-label": "复制" + field.label,
                  n: "credential-detail-field-copy",
                  title: "复制" + field.label,
                  type: "button",
                },
                onClick() {
                  void vm$.methods.copyField(field);
                },
              },
              [
                Timeless.Icon({
                  attributes: { n: "credential-detail-field-copy-icon" },
                  name: "copy",
                  size: 15,
                }),
              ],
            )
            : null,
        ].filter(Boolean),
      ),
    ],
  );
}

function CredentialDetailView(vm$) {
  const { Button, For, View } = TimelessPrimitive;
  const selected_value_ = function (name) {
    return TimelessPrimitive.computed(vm$.state.selectedItem, function (item) {
      return item?.[name] || "";
    });
  };
  return View(
    {
      as: "article",
      class: "credential-detail-panel",
      attributes: { n: "credential-detail" },
    },
    [
      View(
        {
          class: "credential-detail-heading",
          attributes: { n: "credential-detail-heading" },
        },
        [
          View(
            {
              attributes: { n: "credential-detail-title-copy" },
            },
            [
              View(
                {
                  as: "span",
                  class: "credential-type-label",
                  attributes: { n: "credential-detail-type" },
                },
                [TimelessPrimitive.computed(vm$.state.selectedItem, function (item) {
                  return vm$.ui.typeLabel(item?.type);
                })],
              ),
              View(
                {
                  as: "h2",
                  attributes: { n: "credential-detail-title" },
                },
                [selected_value_("title")],
              ),
            ],
          ),
          View(
            {
              class: "credential-detail-actions",
              attributes: { n: "credential-detail-actions" },
            },
            [
              Button(
                {
                  class: "credential-secondary-button",
                  attributes: { n: "credential-detail-edit", type: "button" },
                  onClick() {
                    void vm$.methods.editSelected();
                  },
                },
                ["编辑"],
              ),
              Button(
                {
                  class: "credential-danger-button",
                  attributes: { n: "credential-detail-delete", type: "button" },
                  onClick() {
                    void vm$.methods.deleteSelected();
                  },
                },
                ["删除"],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "credential-detail-meta",
          attributes: { n: "credential-detail-meta" },
        },
        [
          View(
            {
              as: "span",
              attributes: { n: "credential-detail-url" },
            },
            [selected_value_("url")],
          ),
          View(
            {
              as: "span",
              attributes: { n: "credential-detail-updated-at" },
            },
            [TimelessPrimitive.computed(vm$.state.selectedItem, function (item) {
              const formatted = vm$.ui.formatUpdatedAt(item?.updatedAt);
              return formatted ? "更新于 " + formatted : "";
            })],
          ),
        ],
      ),
      View(
        {
          as: "section",
          class: "credential-detail-fields",
          attributes: { n: "credential-detail-fields" },
        },
        [
          For({
            each: vm$.state.selectedFields,
            render(field) {
              return CredentialDetailFieldView(vm$, field);
            },
          }),
        ],
      ),
      View(
        {
          as: "section",
          class: "credential-detail-notes",
          attributes: { n: "credential-detail-notes" },
        },
        [
          View(
            {
              as: "h3",
              attributes: { n: "credential-detail-notes-title" },
            },
            ["备注"],
          ),
          View(
            {
              as: "p",
              attributes: { n: "credential-detail-notes-content" },
            },
            [TimelessPrimitive.computed(vm$.state.selectedItem, function (item) {
              return item?.notes || "暂无备注";
            })],
          ),
        ],
      ),
    ],
  );
}

function CredentialWorkspaceView(vm$) {
  const { Button, Show, View } = TimelessPrimitive;
  const editing_ = TimelessPrimitive.computed(vm$.state.draft, Boolean);
  const selected_ = TimelessPrimitive.computed(vm$.state.selectedItem, Boolean);
  return View(
    {
      class: "credential-workspace",
      attributes: { n: "credential-workspace" },
    },
    [
      View(
        {
          class: "credential-toolbar",
          attributes: { n: "credential-toolbar" },
        },
        [
          View(
            {
              attributes: { n: "credential-toolbar-copy" },
            },
            [
              View(
                {
                  as: "h1",
                  attributes: { n: "credential-page-title" },
                },
                ["凭证库"],
              ),
              View(
                {
                  as: "p",
                  attributes: { n: "credential-page-subtitle" },
                },
                ["密码、API Token、SSH 密钥与自定义凭证"],
              ),
            ],
          ),
          View(
            {
              class: "credential-toolbar-actions",
              attributes: { n: "credential-toolbar-actions" },
            },
            [
              Button(
                {
                  class: "credential-primary-button",
                  attributes: { n: "credential-new-button", type: "button" },
                  onClick() {
                    vm$.methods.newItem();
                  },
                },
                [
                  Timeless.Icon({
                    attributes: { n: "credential-new-button-icon" },
                    name: "plus",
                    size: 16,
                  }),
                  View(
                    {
                      as: "span",
                      attributes: { n: "credential-new-button-label" },
                    },
                    ["新建凭证"],
                  ),
                ],
              ),
              Button(
                {
                  class: "credential-secondary-button",
                  attributes: { n: "credential-lock-button", type: "button" },
                  onClick() {
                    void vm$.methods.lock();
                  },
                },
                [
                  Timeless.Icon({
                    attributes: { n: "credential-lock-button-icon" },
                    name: "lock",
                    size: 15,
                  }),
                  View(
                    {
                      as: "span",
                      attributes: { n: "credential-lock-button-label" },
                    },
                    ["锁定"],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "credential-content",
          attributes: { n: "credential-content" },
        },
        [
          CredentialListView(vm$),
          View(
            {
              as: "main",
              class: "credential-main-panel",
              attributes: { n: "credential-main-panel" },
            },
            [
              Show({
                when: editing_,
                ok() {
                  return CredentialEditorView(vm$);
                },
                else() {
                  return Show({
                    when: selected_,
                    ok() {
                      return CredentialDetailView(vm$);
                    },
                    else() {
                      return View(
                        {
                          class: "credential-empty-detail",
                          attributes: { n: "credential-detail-empty" },
                        },
                        [
                          Timeless.Icon({
                            attributes: { n: "credential-detail-empty-icon" },
                            name: "key",
                            size: 28,
                          }),
                          View(
                            {
                              as: "strong",
                              attributes: { n: "credential-detail-empty-title" },
                            },
                            ["选择或新建凭证"],
                          ),
                          View(
                            {
                              as: "span",
                              attributes: { n: "credential-detail-empty-description" },
                            },
                            ["敏感字段仅在明确显示、复制或编辑时读取。"],
                          ),
                        ],
                      );
                    },
                  });
                },
              }),
            ],
          ),
        ],
      ),
    ],
  );
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeCredentialsPageView(props) {
  const { Show, View } = TimelessPrimitive;
  const vm$ = HomeCredentialsPageModel(props);
  const is_loading_ = TimelessPrimitive.computed(
    vm$.state.phase,
    function (phase) { return phase === "loading"; },
  );
  const is_setup_ = TimelessPrimitive.computed(
    vm$.state.phase,
    function (phase) { return phase === "setup"; },
  );
  const is_locked_ = TimelessPrimitive.computed(
    vm$.state.phase,
    function (phase) { return phase === "locked"; },
  );
  const is_unlocked_ = TimelessPrimitive.computed(
    vm$.state.phase,
    function (phase) { return phase === "unlocked"; },
  );

  return View(
    {
      class: "page home-credentials-page w-full h-full",
      dataset: { pathname: props.view?.pathname || "", section: "credentials" },
      attributes: { n: "home-credentials-page" },
      onMounted() {
        void vm$.methods.init();
      },
      onUnmounted() {
        vm$.methods.destroy();
      },
    },
    [
      CredentialNoticeView(vm$),
      Show({
        when: is_loading_,
        ok() {
          return View(
            {
              class: "credential-loading",
              attributes: { n: "credential-loading", role: "status" },
            },
            ["正在读取凭证库…"],
          );
        },
      }),
      Show({ when: is_setup_, ok() { return CredentialSetupView(vm$); } }),
      Show({ when: is_locked_, ok() { return CredentialUnlockView(vm$); } }),
      Show({ when: is_unlocked_, ok() { return CredentialWorkspaceView(vm$); } }),
    ],
  );
}
