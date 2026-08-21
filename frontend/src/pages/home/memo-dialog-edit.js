import {
  VISIBILITY,
  buildMemoReferenceIndex,
} from "@/domain/memos.js";
import {
  Timeless,
  TimelessPrimitive,
} from "@/timeless-icons.js";
import {
  renderTimelessView,
  unmountTimelessView,
} from "@/timeless-view-mount.js";
import { createMiniEditor } from "./memo-editor.js";
import { MemoEditDialogModel } from "./memo-dialog-edit.model.js";
import { renderMemoMarkdown } from "./memo-markdown.js";
import { escapeHTML } from "./memo-utils.js";

function dom_node(element$) {
  return element$?.$elm?.get$elm?.() || element$?.$elm || null;
}

function icon(name, meaning) {
  return Timeless.Icon({ name, attributes: { n: meaning } });
}

function project_options(projects) {
  let project_list = [];
  if (Array.isArray(projects)) project_list = projects;
  return [{ label: "未归属", value: "" }].concat(
    project_list
      .filter(function (project) {
        return project && !project.archived;
      })
      .map(function (project) {
        return {
          id: project.id,
          label: project.name,
          value: project.id,
        };
      }),
  );
}

function visibility_options() {
  return Object.entries(VISIBILITY).map(function ([value, item]) {
    return { label: item.label, value };
  });
}

function preview_html(context, text) {
  const memo = context.memo;
  let memos = [];
  if (Array.isArray(context.memos)) memos = context.memos;
  let stack = [];
  if (memo.id) stack = [memo.id];
  const render_context = {
    depth: 0,
    editorSettings: context.editorSettings || {},
    index: buildMemoReferenceIndex(memos),
    maxDepth: 2,
    readonly: true,
    showLineNumbers: true,
    sourceId: memo.id || "",
    stack,
  };
  try {
    return renderMemoMarkdown(text, render_context);
  } catch (_) {
    return "<p>" + escapeHTML(text) + "</p>";
  }
}

export function MemoEditDialogView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const context = props.context;
  const vm$ = props.vm$;
  const { Button, RichText, Select, View } = runtime;
  const editor_hidden_ = computed(vm$.state.previewVisible, function (visible) {
    return Boolean(visible);
  });
  const panel_class_ = computed(vm$.state.saving, function (saving) {
    let class_name = "tn-overlay tn-dialog-layer is-open memo-dialog";
    if (saving) class_name += " is-saving";
    return class_name;
  });
  const preview_button_label_ = computed(
    vm$.state.previewVisible,
    function (visible) {
      if (visible) return "编辑";
      return "预览";
    },
  );
  const preview_html_ = computed(vm$.state.draft, function (draft) {
    return preview_html(context, String(draft || ""));
  });
  const has_preview_ = computed(vm$.state.draft, function (draft) {
    return Boolean(String(draft || "").trim());
  });
  let editor_ = null;
  let focus_unsubscribe_ = null;
  let editor_host$ = null;
  let vim_status$ = null;

  editor_host$ = View(
    {
      class: "memo-editor-host memo-dialog-editor-host",
      attributes: {
        "data-editor-switch-host": "true",
        hidden: editor_hidden_,
        n: "memo-edit-editor-host",
      },
      onMounted() {
        const editor_host = dom_node(editor_host$);
        const vim_status_host = dom_node(vim_status$);
        if (!editor_host) return;
        editor_ = createMiniEditor(editor_host, {
          memoItems() {
            if (Array.isArray(context.memos)) return context.memos;
            return [];
          },
          onChange(value) {
            vm$.methods.setDraft(value);
          },
          onCommit() {
            return vm$.methods.save({ source: "vim-wq" });
          },
          onDiscard() {
            return vm$.methods.cancel();
          },
          onQuit() {
            return vm$.methods.exitEdit();
          },
          onSave() {
            return vm$.methods.writeDraft();
          },
          onSubmit() {
            return vm$.methods.save();
          },
          onWriteDraft() {
            return vm$.methods.writeDraft();
          },
          placeholder: "编辑 memo...",
          sourceMemoId: context.memo.id || "",
          tagItems() {
            if (typeof context.tagItems === "function") {
              return context.tagItems();
            }
            return [];
          },
          value: vm$.state.draft.value,
          vim: Boolean(context.editorSettings && context.editorSettings.vimMode),
          vimStatusHost: vim_status_host,
        });
        focus_unsubscribe_ = vm$.state.focusRequest.subscribe({
          onChange() {
            editor_?.focus();
          },
        });
        globalThis.requestAnimationFrame(function () {
          editor_?.focus();
        });
      },
      onUnmounted() {
        focus_unsubscribe_?.();
        focus_unsubscribe_ = null;
        editor_?.destroy();
        editor_ = null;
      },
    },
    [],
  );

  vim_status$ = View(
    {
      class: "memo-inline-status-line",
      attributes: { n: "memo-edit-vim-status" },
    },
    [],
  );

  return View(
    {
      class: panel_class_,
      attributes: {
        "data-memo-dialog": "true",
        "data-memo-id": context.memo.id || "",
        n: "memo-edit-dialog-overlay",
      },
      onClick(event) {
        if (event.target === event.currentTarget && !vm$.state.saving.value) {
          vm$.methods.cancel();
        }
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "tn-dialog tn-dialog--md memo-dialog-panel",
          attributes: {
            "aria-labelledby": "memo-dialog-title",
            "aria-modal": "true",
            n: "memo-edit-dialog-panel",
            role: "dialog",
          },
        },
        [
          View(
            {
              class: "memo-dialog-head",
              attributes: { n: "memo-edit-dialog-header" },
            },
            [
              View(
                {
                  attributes: {
                    "aria-level": "2",
                    id: "memo-dialog-title",
                    n: "memo-edit-dialog-title",
                    role: "heading",
                  },
                },
                ["修改 memo"],
              ),
              View(
                {
                  class: "memo-dialog-head-controls",
                  attributes: { n: "memo-edit-dialog-header-controls" },
                },
                [
                  View(
                    {
                      class: "memo-dialog-meta-controls",
                      attributes: { n: "memo-edit-metadata-controls" },
                    },
                    [
                      View(
                        {
                          class: "memo-select-wrap is-compact",
                          attributes: { n: "memo-edit-project-control" },
                        },
                        [
                          Select({
                            class: "tn-project-select",
                            disabled: vm$.state.saving,
                            options: project_options(context.projects),
                            value: vm$.state.projectId.value,
                            attributes: {
                              "aria-label": "编辑 Project",
                              n: "memo-edit-project-select",
                            },
                            onChange(event) {
                              vm$.methods.setProject(event.currentTarget.value);
                            },
                          }),
                        ],
                      ),
                      View(
                        {
                          class: "memo-select-wrap is-compact",
                          attributes: { n: "memo-edit-visibility-control" },
                        },
                        [
                          Select({
                            disabled: vm$.state.saving,
                            options: visibility_options(),
                            value: vm$.state.visibility.value,
                            attributes: {
                              "aria-label": "编辑可见性",
                              n: "memo-edit-visibility-select",
                            },
                            onChange(event) {
                              vm$.methods.setVisibility(event.currentTarget.value);
                            },
                          }),
                        ],
                      ),
                    ],
                  ),
                  Button(
                    {
                      class:
                        "tn-button--ghost tn-button--icon tn-button--sm memo-action-button",
                      disabled: vm$.state.saving,
                      attributes: {
                        "aria-label": "关闭",
                        n: "memo-edit-close-button",
                        title: "关闭",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.exitEdit();
                      },
                    },
                    [icon("x", "memo-edit-close-icon")],
                  ),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-dialog-body",
              attributes: { n: "memo-edit-dialog-body" },
            },
            [
              View(
                {
                  class: "memo-editor-switch memo-dialog-editor-switch",
                  attributes: { n: "memo-edit-editor-switch" },
                },
                [
                  editor_host$,
                  Show({
                    when: vm$.state.previewVisible,
                    ok() {
                      return [
                        View(
                          {
                            class:
                              "memo-editor-preview memo-dialog-preview is-visible",
                            attributes: { n: "memo-edit-preview" },
                          },
                          [
                            Show({
                              when: has_preview_,
                              ok() {
                                return [
                                  View(
                                    {
                                      class: "memo-content",
                                      attributes: {
                                        n: "memo-edit-preview-content",
                                      },
                                    },
                                    [
                                      RichText({
                                        attributes: {
                                          n: "memo-edit-preview-rich-text",
                                        },
                                        content: preview_html_,
                                      }),
                                    ],
                                  ),
                                ];
                              },
                              else() {
                                return [
                                  View(
                                    {
                                      class: "memo-editor-preview-empty",
                                      attributes: {
                                        n: "memo-edit-preview-empty",
                                      },
                                    },
                                    ["暂无预览内容"],
                                  ),
                                ];
                              },
                            }),
                          ],
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
              class: "memo-dialog-actions",
              attributes: { n: "memo-edit-dialog-footer" },
            },
            [
              vim_status$,
              Button(
                {
                  class: "tn-button--secondary memo-secondary-button",
                  disabled: vm$.state.saving,
                  attributes: {
                    "aria-label": preview_button_label_,
                    "aria-pressed": vm$.state.previewVisible,
                    n: "memo-edit-preview-button",
                    title: preview_button_label_,
                    type: "button",
                  },
                  onClick() {
                    vm$.methods.togglePreview();
                  },
                },
                [
                  icon("eye", "memo-edit-preview-icon"),
                  View(
                    { attributes: { n: "memo-edit-preview-button-label" } },
                    [preview_button_label_],
                  ),
                ],
              ),
              Button(
                {
                  class: "tn-button--secondary memo-secondary-button",
                  disabled: vm$.state.saving,
                  attributes: { n: "memo-edit-cancel-button", type: "button" },
                  onClick() {
                    vm$.methods.cancel();
                  },
                },
                [
                  icon("x", "memo-edit-cancel-icon"),
                  View(
                    { attributes: { n: "memo-edit-cancel-label" } },
                    ["取消"],
                  ),
                ],
              ),
              Button(
                {
                  class: "tn-button--primary memo-primary-button",
                  disabled: vm$.state.saving,
                  attributes: { n: "memo-edit-save-button", type: "button" },
                  onClick() {
                    vm$.methods.save();
                  },
                },
                [
                  icon("check", "memo-edit-save-icon"),
                  View(
                    { attributes: { n: "memo-edit-save-label" } },
                    ["保存"],
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

export function mountMemoEditDialog(host, context) {
  if (!context || !context.memo) {
    throw new Error("mountMemoEditDialog requires context.memo");
  }
  const vm$ = MemoEditDialogModel({ context });
  renderTimelessView(host, MemoEditDialogView({ context, vm$ }));
  return {
    destroy() {
      unmountTimelessView(host);
      vm$.destroy();
    },
    focus() {
      vm$.methods.requestFocus();
    },
    getDraft() {
      return vm$.state.draft.value;
    },
  };
}
