import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";

import { HomeRulePageModel } from "./home_rule.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import {
  iconActionButton,
  reactiveWhen,
} from "./home_view_shared.js";

export function HomeRuleContentView(props) {
  return BoardRulesOverviewView(props);
}

export function HomeRuleConditionView(props = {}) {
  return BoardRuleConditionRowView(props);
}

export function HomeRuleActionView(props = {}) {
  return BoardRuleActionRowView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeRulePageView(props) {
  const vm$ = HomeRulePageModel(props);
  return View(
    {
      class: "page home-rule-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-rule-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-rule-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-rule-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

function selectOptions(runtime, options, selected, attributes, meaning) {
  return runtime.Select({
    class: "board-rule-editor-select",
    attributes: { ...attributes, n: meaning },
    options,
    placeholder: options[0]?.label || "请选择",
    value: selected,
  });
}

export function BoardRuleConditionRowView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input } = runtime;
  const condition = props.condition || {
    field: "status",
    operator: "equals",
    value: "",
  };
  const show_value = !["isEmpty", "isNotEmpty"].includes(condition.operator);
  const show_value_ = reactiveWhen(show_value);
  const value_ = computed(show_value_, function (visible) {
    if (visible) return condition.value || "";
    return "";
  });
  const style_ = computed(show_value_, function (visible) {
    if (visible) return {};
    return { display: "none" };
  });
  return runtime.Fragment({}, [
    selectOptions(
      runtime,
      [
        { value: "status", label: "status" },
        { value: "tags", label: "tags" },
        { value: "priority", label: "priority" },
      ],
      condition.field,
      { "data-cond-field": "true" },
      "board-rule-condition-field",
    ),
    selectOptions(
      runtime,
      [
        { value: "equals", label: "=" },
        { value: "notEquals", label: "!=" },
        { value: "contains", label: "包含" },
        { value: "notContains", label: "不包含" },
        { value: "isEmpty", label: "为空" },
        { value: "isNotEmpty", label: "不为空" },
      ],
      condition.operator,
      { "data-cond-operator": "true" },
      "board-rule-condition-operator",
    ),
    Input({
      class: "board-rule-editor-input",
      type: "text",
      value: value_,
      placeholder: "值",
      style: style_,
      attributes: {
        "data-cond-value": "true",
        n: "board-rule-condition-value",
        type: "text",
      },
    }),
    Button(
      {
        class: "board-rule-item-btn is-danger",
        attributes: {
          "data-action": "removeRuleCondition",
          n: "board-rule-condition-remove",
          title: "移除条件",
          type: "button",
        },
      },
      [
        Timeless.Icon({
          name: "x",
          attributes: { n: "board-rule-condition-remove-icon" },
        }),
      ],
    ),
  ]);
}

export function BoardRuleActionRowView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Input } = runtime;
  const action = props.action || { type: "addTags", params: {} };
  let control = null;
  if (action.type === "setStatus") {
    control = selectOptions(
      runtime,
      ["open", "completed", "cancelled", "archived"].map(function (value) {
        return { label: value, value };
      }),
      action.params?.status || "open",
      { "data-action-status": "true" },
      "board-rule-action-status",
    );
  } else if (action.type === "setPriority") {
    control = selectOptions(
      runtime,
      ["", "high", "medium", "low"].map(function (value) {
        return { label: value || "无", value };
      }),
      action.params?.priority || "",
      { "data-action-priority": "true" },
      "board-rule-action-priority",
    );
  } else {
    control = Input({
      class: "board-rule-editor-input",
      type: "text",
      value: (action.params?.tags || []).join(", "),
      placeholder: "标签，逗号分隔",
      attributes: {
        "data-action-tags": "true",
        n: "board-rule-action-tags",
        type: "text",
      },
    });
  }
  return runtime.Fragment({}, [
    selectOptions(
      runtime,
      [
        { value: "addTags", label: "添加标签" },
        { value: "removeTags", label: "移除标签" },
        { value: "setStatus", label: "设置状态" },
        { value: "setPriority", label: "设置优先级" },
      ],
      action.type,
      { "data-action-type": "true" },
      "board-rule-action-type",
    ),
    control,
    Button(
      {
        class: "board-rule-item-btn is-danger",
        attributes: {
          "data-action": "removeRuleAction",
          n: "board-rule-action-remove",
          title: "移除动作",
          type: "button",
        },
      },
      [
        Timeless.Icon({
          name: "x",
          attributes: { n: "board-rule-action-remove-icon" },
        }),
      ],
    ),
  ]);
}

export function BoardRuleEditorView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, For, Input, View } = runtime;
  const rule = props.rule || {
    actions: [],
    conditions: [],
    enabled: true,
    name: "",
    trigger: {},
  };
  const columns = [{ id: "", label: "任意列" }].concat(props.columns || []);
  let conditions = [{}];
  let actions = [{}];
  if (rule.conditions?.length) conditions = rule.conditions;
  if (rule.actions?.length) actions = rule.actions;
  return View(
    {
      class: "board-rule-editor-overlay",
      attributes: {
        "data-board-rule-editor-overlay": "true",
        n: "board-rule-editor-overlay",
      },
    },
    [
      View(
        {
          class: "board-rule-editor-dialog",
          attributes: { n: "board-rule-editor-dialog" },
        },
        [
          View(
            {
              class: "board-rule-editor-header",
              attributes: { n: "board-rule-editor-header" },
            },
            [
              View(
                { as: "h3", attributes: { n: "board-rule-editor-title" } },
                [
                  Show({
                    when: reactiveWhen(props.isNew),
                    ok() {
                      return "添加规则";
                    },
                    else() {
                      return "编辑规则";
                    },
                  }),
                ],
              ),
              Button(
                {
                  class: "board-rule-editor-close",
                  attributes: {
                    "data-action": "closeRuleEditor",
                    n: "board-rule-editor-close",
                    type: "button",
                  },
                },
                [
                  Timeless.Icon({
                    name: "x",
                    attributes: { n: "board-rule-editor-close-icon" },
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "board-rule-editor-body",
              attributes: { n: "board-rule-editor-body" },
            },
            [
              View(
                {
                  class: "board-rule-editor-section",
                  attributes: { n: "board-rule-name-section" },
                },
                [
                  View(
                    { as: "label", attributes: { n: "board-rule-name-label" } },
                    ["规则名称"],
                  ),
                  Input({
                    class: "board-rule-editor-input",
                    type: "text",
                    value: rule.name || "",
                    placeholder: "规则名称",
                    attributes: {
                      n: "board-rule-name-input",
                      name: "name",
                      type: "text",
                    },
                  }),
                ],
              ),
              View(
                {
                  class: "board-rule-editor-section",
                  attributes: { n: "board-rule-enabled-section" },
                },
                [
                  View(
                    {
                      as: "label",
                      class: "board-rule-editor-checkbox",
                      attributes: { n: "board-rule-enabled-label" },
                    },
                    [
                      runtime.Checkbox({
                        checked: rule.enabled !== false,
                        attributes: {
                          n: "board-rule-enabled-input",
                          name: "enabled",
                        },
                      }),
                      " 启用",
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "board-rule-editor-section",
                  attributes: { n: "board-rule-trigger-section" },
                },
                [
                  View(
                    {
                      as: "label",
                      attributes: { n: "board-rule-trigger-label" },
                    },
                    ["触发条件"],
                  ),
                  View(
                    {
                      class: "board-rule-editor-row",
                      attributes: { n: "board-rule-trigger-row" },
                    },
                    [
                      selectOptions(
                        runtime,
                        [{ value: "task.enterColumn", label: "进入列" }],
                        "task.enterColumn",
                        { name: "triggerType" },
                        "board-rule-trigger-type",
                      ),
                      selectOptions(
                        runtime,
                        columns.map(function (column) {
                          return { label: column.label, value: column.id };
                        }),
                        rule.trigger?.columnId || "",
                        { name: "triggerColumnId" },
                        "board-rule-trigger-column",
                      ),
                      selectOptions(
                        runtime,
                        columns.map(function (column, index) {
                          let label = column.label;
                          if (!index) label = "任意来源列";
                          return {
                            label,
                            value: column.id,
                          };
                        }),
                        rule.trigger?.fromColumnId || "",
                        { name: "triggerFromColumnId" },
                        "board-rule-trigger-source-column",
                      ),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "board-rule-editor-section",
                  attributes: { n: "board-rule-conditions-section" },
                },
                [
                  View(
                    {
                      as: "label",
                      attributes: { n: "board-rule-conditions-label" },
                    },
                    ["条件（全部满足）"],
                  ),
                  View(
                    {
                      attributes: {
                        "data-rule-conditions": "true",
                        n: "board-rule-conditions",
                      },
                    },
                    [
                      For({
                        each: conditions,
                        render(condition) {
                          return View(
                            {
                              class: "board-rule-condition-row",
                              attributes: { n: "board-rule-condition-row" },
                            },
                            [BoardRuleConditionRowView({ condition, runtime })],
                          );
                        },
                      }),
                    ],
                  ),
                  Button(
                    {
                      class: "board-rule-add-btn",
                      attributes: {
                        "data-action": "addRuleCondition",
                        n: "board-rule-add-condition",
                        type: "button",
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "plus",
                        attributes: { n: "board-rule-add-condition-icon" },
                      }),
                      " 加条件",
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "board-rule-editor-section",
                  attributes: { n: "board-rule-actions-section" },
                },
                [
                  View(
                    {
                      as: "label",
                      attributes: { n: "board-rule-actions-label" },
                    },
                    ["动作"],
                  ),
                  View(
                    {
                      attributes: {
                        "data-rule-actions": "true",
                        n: "board-rule-actions",
                      },
                    },
                    [
                      For({
                        each: actions,
                        render(action) {
                          return View(
                            {
                              class: "board-rule-action-row",
                              attributes: { n: "board-rule-action-row" },
                            },
                            [BoardRuleActionRowView({ action, runtime })],
                          );
                        },
                      }),
                    ],
                  ),
                  Button(
                    {
                      class: "board-rule-add-btn",
                      attributes: {
                        "data-action": "addRuleAction",
                        n: "board-rule-add-action",
                        type: "button",
                      },
                    },
                    [
                      Timeless.Icon({
                        name: "plus",
                        attributes: { n: "board-rule-add-action-icon" },
                      }),
                      " 加动作",
                    ],
                  ),
                ],
              ),
            ],
          ),
          View(
            {
              class: "board-rule-editor-footer",
              attributes: { n: "board-rule-editor-footer" },
            },
            [
              Button(
                {
                  class: "tn-button tn-button--secondary memo-secondary-button",
                  attributes: {
                    "data-action": "closeRuleEditor",
                    n: "board-rule-editor-cancel",
                    type: "button",
                  },
                },
                ["取消"],
              ),
              Button(
                {
                  class: "tn-button tn-button--primary memo-primary-button",
                  attributes: {
                    "data-action": "saveRule",
                    n: "board-rule-editor-save",
                    type: "button",
                  },
                },
                ["保存"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

export function BoardRulesOverviewView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Checkbox, For, View } = runtime;
  return runtime.Fragment({}, [
    View(
      {
        class: "memo-rules-overview",
        attributes: { n: "board-rules-overview" },
      },
      [
        Show({
          when: reactiveWhen(props.boards?.length),
          ok() {
            return For({
              each: props.boards,
              render(board) {
                return View(
                  {
                    class: "memo-rules-group",
                    attributes: { n: "board-rules-group" },
                  },
                  [
                    View(
                      {
                        class: "memo-rules-group-header",
                        attributes: { n: "board-rules-group-header" },
                      },
                      [
                        View(
                          {
                            as: "span",
                            class: "memo-rules-group-title",
                            attributes: { n: "board-rules-group-title" },
                          },
                          [board.title],
                        ),
                        View(
                          {
                            as: "span",
                            class: "memo-rules-group-count",
                            attributes: { n: "board-rules-group-count" },
                          },
                          [board.rules.length + " 条规则"],
                        ),
                      ],
                    ),
                    View(
                      {
                        class: "memo-rules-group-cards",
                        attributes: { n: "board-rules-cards" },
                      },
                      [
                        Show({
                          when: reactiveWhen(board.rules.length),
                          ok() {
                            return For({
                              each: board.rules,
                              render(rule) {
                                const card_class_ = computed(
                                  reactiveWhen(rule.enabled),
                                  function (enabled) {
                                    if (enabled) return "memo-rules-card";
                                    return "memo-rules-card is-disabled";
                                  },
                                );
                                return View(
                                  {
                                    class: card_class_,
                                    attributes: {
                                      "data-board-id": board.id,
                                      "data-rule-id": rule.id,
                                      n: "board-rule-card",
                                    },
                                  },
                                  [
                                    View(
                                      {
                                        class: "memo-rules-card-header",
                                        attributes: {
                                          n: "board-rule-card-header",
                                        },
                                      },
                                      [
                                        View(
                                          {
                                            class:
                                              "memo-rules-card-title-section",
                                            attributes: {
                                              n: "board-rule-card-title-section",
                                            },
                                          },
                                          [
                                            View(
                                              {
                                                as: "strong",
                                                class: "memo-rules-card-name",
                                                attributes: {
                                                  n: "board-rule-card-name",
                                                },
                                              },
                                              [rule.name],
                                            ),
                                            View(
                                              {
                                                as: "span",
                                                class:
                                                  "memo-rules-card-trigger",
                                                attributes: {
                                                  n: "board-rule-card-trigger",
                                                },
                                              },
                                              [rule.triggerLabel],
                                            ),
                                          ],
                                        ),
                                        View(
                                          {
                                            class: "memo-rules-card-toggle",
                                            attributes: {
                                              n: "board-rule-card-toggle",
                                            },
                                          },
                                          [
                                            View(
                                              {
                                                as: "label",
                                                class:
                                                  "memo-rules-toggle-label",
                                                attributes: {
                                                  n: "board-rule-card-toggle-label",
                                                },
                                              },
                                              [
                                                Checkbox({
                                                  checked: rule.enabled,
                                                  attributes: {
                                                    "data-board-id": board.id,
                                                    "data-rule-id": rule.id,
                                                    "data-rule-toggle": "true",
                                                    n: "board-rule-card-toggle-input",
                                                  },
                                                }),
                                                View(
                                                  {
                                                    as: "span",
                                                    class:
                                                      "memo-rules-toggle-text",
                                                    attributes: {
                                                      n: "board-rule-card-toggle-text",
                                                    },
                                                  },
                                                  [
                                                    Show({
                                                      when: reactiveWhen(
                                                        rule.enabled,
                                                      ),
                                                      ok() {
                                                        return "启用";
                                                      },
                                                      else() {
                                                        return "禁用";
                                                      },
                                                    }),
                                                  ],
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                    View(
                                      {
                                        class: "memo-rules-card-body",
                                        attributes: {
                                          n: "board-rule-card-body",
                                        },
                                      },
                                      [
                                        Show({
                                          when: reactiveWhen(
                                            rule.conditionLabel,
                                          ),
                                          ok() {
                                            return View(
                                              {
                                                class: "memo-rules-card-row",
                                                attributes: {
                                                  n: "board-rule-card-condition",
                                                },
                                              },
                                              [
                                                View(
                                                  {
                                                    as: "span",
                                                    class:
                                                      "memo-rules-card-label",
                                                    attributes: {
                                                      n: "board-rule-card-condition-label",
                                                    },
                                                  },
                                                  ["条件"],
                                                ),
                                                View(
                                                  {
                                                    as: "span",
                                                    attributes: {
                                                      n: "board-rule-card-condition-value",
                                                    },
                                                  },
                                                  [rule.conditionLabel],
                                                ),
                                              ],
                                            );
                                          },
                                        }),
                                        View(
                                          {
                                            class: "memo-rules-card-row",
                                            attributes: {
                                              n: "board-rule-card-action",
                                            },
                                          },
                                          [
                                            View(
                                              {
                                                as: "span",
                                                class: "memo-rules-card-label",
                                                attributes: {
                                                  n: "board-rule-card-action-label",
                                                },
                                              },
                                              ["动作"],
                                            ),
                                            View(
                                              {
                                                as: "span",
                                                attributes: {
                                                  n: "board-rule-card-action-value",
                                                },
                                              },
                                              [rule.actionLabel],
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                    View(
                                      {
                                        class: "memo-rules-card-actions",
                                        attributes: {
                                          n: "board-rule-card-actions",
                                        },
                                      },
                                      [
                                        iconActionButton(runtime, {
                                          action: "moveRuleUp",
                                          boardId: board.id,
                                          class: "memo-rules-card-btn",
                                          icon: "chevron-up",
                                          label: "上移",
                                          meaning: "board-rule-move-up",
                                          ruleId: rule.id,
                                        }),
                                        iconActionButton(runtime, {
                                          action: "moveRuleDown",
                                          boardId: board.id,
                                          class: "memo-rules-card-btn",
                                          icon: "chevron-down",
                                          label: "下移",
                                          meaning: "board-rule-move-down",
                                          ruleId: rule.id,
                                        }),
                                        iconActionButton(runtime, {
                                          action: "editRule",
                                          boardId: board.id,
                                          class: "memo-rules-card-btn",
                                          icon: "file-text",
                                          label: "编辑",
                                          meaning: "board-rule-edit",
                                          ruleId: rule.id,
                                        }),
                                        iconActionButton(runtime, {
                                          action: "deleteRule",
                                          boardId: board.id,
                                          class:
                                            "memo-rules-card-btn is-danger",
                                          icon: "trash2",
                                          label: "删除",
                                          meaning: "board-rule-delete",
                                          ruleId: rule.id,
                                        }),
                                      ],
                                    ),
                                  ],
                                );
                              },
                            });
                          },
                          else() {
                            return View(
                              {
                                class: "memo-rules-group-empty",
                                attributes: { n: "board-rules-group-empty" },
                              },
                              [
                                "暂无规则 — ",
                                Button(
                                  {
                                    class: "memo-rules-add-link",
                                    attributes: {
                                      "data-action": "openAddRuleDialog",
                                      "data-board-id": board.id,
                                      n: "board-rules-add",
                                      type: "button",
                                    },
                                  },
                                  ["添加规则"],
                                ),
                              ],
                            );
                          },
                        }),
                      ],
                    ),
                  ],
                );
              },
            });
          },
          else() {
            return View(
              {
                class: "memo-rules-empty",
                attributes: { n: "board-rules-empty" },
              },
              ["暂无看板。请先创建看板。"],
            );
          },
        }),
      ],
    ),
    Show({
      when: reactiveWhen(props.ruleEditor),
      ok() {
        return BoardRuleEditorView({ ...props.ruleEditor, runtime });
      },
    }),
  ]);
}


// __HOME_RULE_VIEWS__
