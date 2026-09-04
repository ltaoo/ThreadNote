import {
  Timeless,
  TimelessPrimitive,
} from "./timeless-icons.js";
import { renderTimelessView } from "./timeless-view-mount.js";
import {
  GTDSlimModel,
  reminderLabel,
} from "./gtd-slim.model.js";

const PRIORITY_OPTIONS = Object.freeze([
  { label: "无优先级", value: "none" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
]);
const QUICK_REMINDERS = Object.freeze([
  { label: "到期前 10 分钟", minutes: 10 },
  { label: "到期前 30 分钟", minutes: 30 },
  { label: "到期前 1 小时", minutes: 60 },
  { label: "到期前 1 天", minutes: 1440 },
]);

function ReminderPopoverView(props) {
  const { Button, For, Input, View } = props.runtime;
  const task = props.task;
  return View(
    {
      class: "gtd-slim-reminder-popover",
      attributes: { n: "gtd-reminder-popover" },
      onClick(event) {
        event.stopPropagation();
      },
    },
    [
      View(
        {
          class: "gtd-slim-reminder-popover-inner",
          attributes: { n: "gtd-reminder-popover-content" },
        },
        [
          View(
            {
              class: "gtd-slim-reminder-popover-title",
              attributes: { n: "gtd-reminder-popover-title" },
            },
            ["设置提醒"],
          ),
          View(
            {
              class: "gtd-slim-reminder-quick",
              attributes: { n: "gtd-reminder-quick-options" },
            },
            [
              For({
                each: QUICK_REMINDERS,
                render(option) {
                  return Button(
                    {
                      class: "gtd-slim-reminder-quick-btn",
                      attributes: {
                        n: "gtd-reminder-quick-button",
                        type: "button",
                      },
                      onClick() {
                        props.vm$.methods.addRelativeReminder(
                          task.id,
                          option.minutes,
                        );
                      },
                    },
                    [option.label],
                  );
                },
              }),
            ],
          ),
          View(
            {
              class: "gtd-slim-reminder-abs",
              attributes: { n: "gtd-reminder-absolute-control" },
            },
            [
              Input({
                class: "gtd-slim-reminder-abs-input",
                type: "datetime-local",
                value: props.vm$.state.absoluteReminder,
                attributes: {
                  "aria-label": "提醒时间",
                  n: "gtd-reminder-absolute-input",
                  type: "datetime-local",
                },
                onInput(event) {
                  props.vm$.methods.setAbsoluteReminder(
                    event.currentTarget.value,
                  );
                },
              }),
              Button(
                {
                  class: "gtd-slim-reminder-abs-btn",
                  attributes: {
                    n: "gtd-reminder-absolute-confirm",
                    type: "button",
                  },
                  onClick() {
                    props.vm$.methods.addAbsoluteReminder(task.id);
                  },
                },
                ["确定"],
              ),
            ],
          ),
          task.reminders && task.reminders.length
            ? View(
                {
                  class: "gtd-slim-reminder-list",
                  attributes: { n: "gtd-reminder-list" },
                },
                [
                  View(
                    {
                      class: "gtd-slim-reminder-list-title",
                      attributes: { n: "gtd-reminder-list-title" },
                    },
                    ["已设提醒"],
                  ),
                  For({
                    each: task.reminders,
                    render(reminder, index$) {
                      const index = index$?.value ?? 0;
                      return View(
                        {
                          class: "gtd-slim-reminder-item",
                          attributes: { n: "gtd-reminder-item" },
                        },
                        [
                          View(
                            { attributes: { n: "gtd-reminder-item-label" } },
                            [reminderLabel(reminder)],
                          ),
                          Button(
                            {
                              class: "gtd-slim-reminder-delete",
                              attributes: {
                                "aria-label": "删除提醒",
                                n: "gtd-reminder-delete-button",
                                title: "删除",
                                type: "button",
                              },
                              onClick() {
                                props.vm$.methods.deleteReminder(task.id, index);
                              },
                            },
                            [
                              Timeless.Icon({
                                name: "x",
                                attributes: { n: "gtd-reminder-delete-icon" },
                              }),
                            ],
                          ),
                        ],
                      );
                    },
                  }),
                ],
              )
            : null,
        ],
      ),
    ],
  );
}

function CompletedTimeView(props) {
  const { Button, Input, Show, View, computed } = props.runtime;
  const editing_ = computed(
    props.vm$.state.editingCompletedId,
    function (task_id) {
      return task_id === props.task.id;
    },
  );
  return Show({
    when: editing_,
    ok() {
      return [
        View(
          {
            class: "gtd-slim-completed-time-edit",
            attributes: { n: "gtd-completed-time-editor" },
          },
          [
            Input({
              class: "gtd-slim-completed-time-input",
              type: "datetime-local",
              value: props.vm$.state.completedDraft,
              attributes: {
                "aria-label": "完成时间",
                n: "gtd-completed-time-input",
                type: "datetime-local",
              },
              onInput(event) {
                props.vm$.methods.setCompletedDraft(event.currentTarget.value);
              },
              onKeyDown(event) {
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.vm$.methods.saveCompletedEdit(props.task.id);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  props.vm$.methods.cancelCompletedEdit();
                }
              },
            }),
            Button(
              {
                class: "gtd-slim-completed-time-confirm",
                attributes: {
                  "aria-label": "确认完成时间",
                  n: "gtd-completed-time-confirm",
                  title: "确认",
                  type: "button",
                },
                onClick() {
                  props.vm$.methods.saveCompletedEdit(props.task.id);
                },
              },
              [
                Timeless.Icon({
                  name: "check",
                  attributes: { n: "gtd-completed-time-confirm-icon" },
                }),
              ],
            ),
            Button(
              {
                class: "gtd-slim-completed-time-cancel",
                attributes: {
                  "aria-label": "取消编辑完成时间",
                  n: "gtd-completed-time-cancel",
                  title: "取消",
                  type: "button",
                },
                onClick() {
                  props.vm$.methods.cancelCompletedEdit();
                },
              },
              [
                Timeless.Icon({
                  name: "x",
                  attributes: { n: "gtd-completed-time-cancel-icon" },
                }),
              ],
            ),
          ],
        ),
      ];
    },
    else() {
      return [
        Button(
          {
            class: "gtd-slim-completed-time",
            attributes: {
              n: "gtd-completed-time-button",
              title: "点击编辑完成时间",
              type: "button",
            },
            onClick() {
              props.vm$.methods.startCompletedEdit(
                props.task.id,
                props.task.completedAt,
              );
            },
          },
          ["完成 " + props.task.completedLabel],
        ),
      ];
    },
  });
}

function TaskView(props) {
  const { Button, Checkbox, For, Show, View, computed } = props.runtime;
  const task = props.task;
  const reminder_open_ = computed(
    props.vm$.state.reminderTaskId,
    function (task_id) {
      return task_id === task.id;
    },
  );
  return View(
    {
      class:
        "gtd-slim-task " +
        (task.complete ? "is-complete " : "") +
        "is-priority-" +
        task.priorityValue,
      attributes: { n: "gtd-task", role: "article" },
    },
    [
      Checkbox({
        checked: task.complete,
        class: "gtd-slim-check memo-todo-checkbox",
        attributes: {
          "aria-label": "切换任务完成状态",
          n: "gtd-slim-completion-checkbox",
        },
        onChange(event) {
          props.vm$.methods.toggleCompletion(task.id, event.currentTarget.checked);
        },
      }),
      View(
        {
          class: "gtd-slim-task-body",
          attributes: { n: "gtd-task-body" },
        },
        [
          View(
            {
              class: "gtd-slim-task-title",
              attributes: { n: "gtd-task-title" },
            },
            [task.title],
          ),
          View(
            {
              class: "gtd-slim-task-meta",
              attributes: { n: "gtd-task-metadata" },
            },
            [
              task.priorityValue !== "none"
                ? View(
                    {
                      class: "is-priority",
                      attributes: { n: "gtd-task-priority" },
                    },
                    [task.priorityLabel],
                  )
                : null,
              task.dueLabel
                ? View(
                    {
                      class: task.dueState,
                      attributes: {
                        datetime: task.dueAt,
                        n: "gtd-task-due-date",
                      },
                    },
                    ["截止 " + task.dueLabel],
                  )
                : null,
              task.startLabel
                ? View(
                    {
                      attributes: {
                        datetime: task.startAt,
                        n: "gtd-task-start-date",
                      },
                    },
                    ["开始 " + task.startLabel],
                  )
                : null,
              task.listId && task.listId !== "inbox"
                ? View(
                    { attributes: { n: "gtd-task-list" } },
                    [task.listId],
                  )
                : null,
              For({
                each: task.tags,
                render(tag) {
                  return View(
                    { attributes: { n: "gtd-task-tag" } },
                    ["#" + tag],
                  );
                },
              }),
              task.complete && task.completedAt
                ? CompletedTimeView({ ...props, runtime: props.runtime })
                : null,
            ],
          ),
        ],
      ),
      View(
        {
          class: "gtd-slim-task-actions",
          attributes: { n: "gtd-task-actions" },
        },
        [
          Button(
            {
              class:
                "gtd-slim-reminder-btn" +
                (task.hasReminders ? " has-reminders" : ""),
              attributes: {
                "aria-label": "设置提醒",
                n: "gtd-task-reminder-button",
                title: "设置提醒",
                type: "button",
              },
              onClick(event) {
                event.stopPropagation();
                props.vm$.methods.toggleReminder(task.id);
              },
            },
            [
              Timeless.Icon({
                name: "radio-tower",
                attributes: { n: "gtd-task-reminder-icon" },
              }),
            ],
          ),
          Show({
            when: reminder_open_,
            ok() {
              return [ReminderPopoverView({ ...props, runtime: props.runtime })];
            },
          }),
        ],
      ),
    ],
  );
}

function GroupView(props) {
  const { For, View } = props.runtime;
  return View(
    {
      class: "gtd-slim-group",
      attributes: {
        "aria-label": props.group.label,
        n: "gtd-task-group",
        role: "region",
      },
    },
    [
      View(
        {
          class: "gtd-slim-group-head",
          attributes: { n: "gtd-task-group-header" },
        },
        [
          View(
            { attributes: { n: "gtd-task-group-label" } },
            [props.group.label],
          ),
          View(
            { attributes: { n: "gtd-task-group-count" } },
            [props.group.tasks.length],
          ),
        ],
      ),
      For({
        each: props.group.tasks,
        render(task) {
          return TaskView({ task, runtime: props.runtime, vm$: props.vm$ });
        },
      }),
    ],
  );
}

export function GTDSlimView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  const { Button, For, Input, Select, Show, View, computed } = runtime;
  const fixed_class_ = computed(vm$.state.fixed, function (fixed) {
    return "memo-window-icon-button velo-no-drag" +
      (fixed ? " is-active" : "");
  });
  const fixed_label_ = computed(vm$.state.fixed, function (fixed) {
    return fixed ? "取消固定" : "固定在所有窗口上方";
  });
  const is_error_ = computed(vm$.state.listStatus, function (status) {
    return status === "error";
  });
  const is_loading_ = computed(vm$.state.listStatus, function (status) {
    return status === "loading";
  });
  const is_empty_ = computed(vm$.state.listStatus, function (status) {
    return status === "empty";
  });
  const is_ready_ = computed(vm$.state.listStatus, function (status) {
    return status === "ready";
  });
  const toast_class_ = computed(vm$.state.toast, function (toast) {
    return "memo-toast" + (toast ? " is-visible" : "");
  });
  let fixed_unsubscribe_ = null;

  return View(
    {
      class: "memo-window-shell gtd-slim-shell velo-drag",
      attributes: {
        "data-velo-drag": "true",
        n: "gtd-slim-window",
      },
      onClick(event) {
        if (!event.target.closest?.(".gtd-slim-reminder-popover, .gtd-slim-reminder-btn")) {
          vm$.state.reminderTaskId.value && vm$.methods.toggleReminder("");
        }
      },
      onMounted() {
        fixed_unsubscribe_ = vm$.state.fixed.subscribe({
          onChange(fixed) {
            document.body.classList.toggle("is-fixed-window", fixed);
          },
        });
        document.body.classList.toggle("is-fixed-window", vm$.state.fixed.value);
        vm$.methods.init();
      },
      onUnmounted() {
        fixed_unsubscribe_?.();
        fixed_unsubscribe_ = null;
        vm$.destroy();
      },
    },
    [
      View(
        {
          class: "memo-window-titlebar gtd-slim-titlebar velo-drag",
          attributes: {
            "data-velo-drag": "true",
            n: "gtd-slim-titlebar",
          },
        },
        [
          View(
            {
              class: "memo-window-native-controls",
              attributes: {
                "aria-hidden": "true",
                n: "gtd-slim-native-controls",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-window-drag-region",
              attributes: {
                "aria-hidden": "true",
                n: "gtd-slim-drag-region",
              },
            },
            [],
          ),
          View(
            {
              class: "memo-window-title-actions",
              attributes: { n: "gtd-slim-window-actions" },
            },
            [
              Button(
                {
                  class: "memo-window-text-button velo-no-drag",
                  attributes: { n: "gtd-slim-open-full-button", type: "button" },
                  onClick() {
                    vm$.methods.openFull();
                  },
                },
                ["完整版"],
              ),
              Button(
                {
                  class: "memo-window-icon-button velo-no-drag",
                  attributes: {
                    "aria-label": "刷新",
                    n: "gtd-slim-refresh-button",
                    title: "刷新",
                    type: "button",
                  },
                  onClick() {
                    vm$.methods.refresh();
                  },
                },
                [
                  Timeless.Icon({
                    name: "undo2",
                    attributes: { n: "gtd-slim-refresh-icon" },
                  }),
                ],
              ),
              Button(
                {
                  class: fixed_class_,
                  attributes: {
                    "aria-label": fixed_label_,
                    "aria-pressed": vm$.state.fixed,
                    n: "gtd-slim-fixed-button",
                    title: fixed_label_,
                    type: "button",
                  },
                  onClick() {
                    vm$.methods.toggleFixed();
                  },
                },
                [
                  Timeless.Icon({
                    name: "arrow-down-to-line",
                    attributes: { n: "gtd-slim-fixed-icon" },
                  }),
                ],
              ),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-window-body gtd-slim-body velo-no-drag",
          attributes: { n: "gtd-slim-body" },
        },
        [
          View(
            {
              class: "gtd-slim-head",
              attributes: { n: "gtd-slim-heading" },
            },
            [
              View(
                { attributes: { n: "gtd-slim-heading-copy" } },
                [
                  View(
                    {
                      attributes: {
                        "aria-level": "1",
                        n: "gtd-slim-title",
                        role: "heading",
                      },
                    },
                    ["代办"],
                  ),
                  View(
                    { attributes: { n: "gtd-slim-today-label" } },
                    [
                      new Date().toLocaleDateString([], {
                        day: "numeric",
                        month: "long",
                        weekday: "long",
                      }),
                    ],
                  ),
                ],
              ),
              View(
                {
                  class: "gtd-slim-count",
                  attributes: { n: "gtd-slim-count" },
                },
                [vm$.state.count],
              ),
            ],
          ),
          View(
            {
              class: "gtd-slim-form",
              attributes: { n: "gtd-slim-create-form", role: "form" },
            },
            [
              Input({
                autocomplete: "off",
                class: "gtd-slim-title-input",
                disabled: vm$.state.saving,
                placeholder: "添加代办",
                value: vm$.state.title,
                attributes: { "aria-label": "代办标题", n: "gtd-slim-title-input" },
                onInput(event) {
                  vm$.methods.setTitle(event.currentTarget.value);
                },
                onKeyDown(event) {
                  if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault();
                    vm$.methods.createTodo();
                  }
                },
              }),
              Button(
                {
                  class: "gtd-slim-submit",
                  disabled: vm$.state.saving,
                  attributes: {
                    "aria-label": "添加",
                    n: "gtd-slim-submit-button",
                    title: "添加",
                    type: "button",
                  },
                  onClick() {
                    vm$.methods.createTodo();
                  },
                },
                [
                  Timeless.Icon({
                    name: "plus",
                    attributes: { n: "gtd-slim-submit-icon" },
                  }),
                ],
              ),
              View(
                {
                  class: "gtd-slim-form-options",
                  attributes: { n: "gtd-slim-form-options" },
                },
                [
                  Input({
                    class: "gtd-slim-due-input",
                    type: "date",
                    value: vm$.state.dueAt,
                    attributes: {
                      "aria-label": "截止日期",
                      n: "gtd-slim-due-input",
                      type: "date",
                    },
                    onInput(event) {
                      vm$.methods.setDueAt(event.currentTarget.value);
                    },
                  }),
                  Select({
                    options: PRIORITY_OPTIONS,
                    value: vm$.state.priority.value,
                    attributes: {
                      "aria-label": "优先级",
                      n: "gtd-slim-priority-select",
                    },
                    onChange(event) {
                      vm$.methods.setPriority(event.currentTarget.value);
                    },
                  }),
                ],
              ),
            ],
          ),
          View(
            {
              class: "gtd-slim-tabs",
              attributes: {
                "aria-label": "代办过滤",
                n: "gtd-filter-tabs",
                role: "navigation",
              },
            },
            [
              For({
                each: vm$.state.tabs,
                render(tab) {
                  return Button(
                    {
                      class:
                        "gtd-slim-tab" + (tab.active ? " is-active" : ""),
                      attributes: {
                        "aria-pressed": tab.active,
                        n: "gtd-filter-tab",
                        type: "button",
                      },
                      onClick() {
                        vm$.methods.setFilter(tab.value);
                      },
                    },
                    [
                      View(
                        { attributes: { n: "gtd-filter-tab-label" } },
                        [tab.label],
                      ),
                      View(
                        { attributes: { n: "gtd-filter-tab-count" } },
                        [tab.count || ""],
                      ),
                    ],
                  );
                },
              }),
            ],
          ),
          View(
            {
              class: "gtd-slim-list",
              attributes: {
                "aria-label": "代办列表",
                n: "gtd-task-list",
              },
            },
            [
              Show({
                when: is_error_,
                ok() {
                  return [
                    View(
                      {
                        class: "gtd-slim-state",
                        attributes: { n: "gtd-task-error", role: "alert" },
                      },
                      [vm$.state.error],
                    ),
                  ];
                },
              }),
              Show({
                when: is_loading_,
                ok() {
                  return [
                    View(
                      {
                        class: "gtd-slim-state",
                        attributes: { n: "gtd-task-loading", role: "status" },
                      },
                      ["正在加载代办..."],
                    ),
                  ];
                },
              }),
              Show({
                when: is_empty_,
                ok() {
                  return [
                    View(
                      {
                        class: "gtd-slim-state",
                        attributes: { n: "gtd-task-empty" },
                      },
                      [
                        computed(vm$.state.filter, function (filter) {
                          return {
                            all: "还没有代办",
                            completed: "还没有已完成代办",
                            inbox: "Inbox 为空",
                            next: "没有下一步代办",
                            overdue: "没有过期代办",
                            scheduled: "没有计划代办",
                            today: "今天没有代办",
                          }[filter];
                        }),
                      ],
                    ),
                  ];
                },
              }),
              Show({
                when: is_ready_,
                ok() {
                  return [
                    For({
                      each: vm$.state.groups,
                      render(group) {
                        return GroupView({ group, runtime, vm$ });
                      },
                    }),
                  ];
                },
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: toast_class_,
          attributes: {
            "aria-live": "polite",
            n: "gtd-slim-toast",
            role: "status",
          },
        },
        [vm$.state.toast],
      ),
    ],
  );
}

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[GTDSlim] Root element not found");
    return;
  }
  const vm$ = GTDSlimModel();
  renderTimelessView(root, GTDSlimView({ vm$ }));
});
