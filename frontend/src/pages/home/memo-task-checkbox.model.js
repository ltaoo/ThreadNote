const task_control_selector = "[data-task-line]";
const checkbox_input_selector = 'input[type="checkbox"]';

function task_control_from_target(target) {
  if (!target || typeof target.matches !== "function") return null;
  if (target.matches(task_control_selector)) return target;
  if (typeof target.closest !== "function") return null;
  return target.closest(task_control_selector);
}

function checked_from_target(target, task_control) {
  if (typeof target.checked === "boolean") return target.checked;
  const checkbox_input = task_control.matches(checkbox_input_selector)
    ? task_control
    : task_control.querySelector?.(checkbox_input_selector);
  if (typeof checkbox_input?.checked === "boolean") {
    return checkbox_input.checked;
  }
  if (typeof task_control.checked === "boolean") return task_control.checked;
  return Boolean(task_control.hasAttribute?.("checked"));
}

export function memoTaskCheckboxChange(target) {
  const task_control = task_control_from_target(target);
  if (!task_control) return null;
  const line_index = Number(task_control.dataset?.taskLine);
  if (!Number.isInteger(line_index) || line_index < 0) return null;
  return {
    checked: checked_from_target(target, task_control),
    control: task_control,
    lineIndex: line_index,
  };
}

export function taskCompletionChecked(control) {
  if (typeof control?.checked === "boolean") return control.checked;
  return Boolean(control?.state?.checked);
}

export function bindTaskCompletionCheckbox(control, initial_checked, on_change) {
  if (typeof control?.onChange !== "function") return function () {};
  let previous_checked = Boolean(initial_checked);
  return control.onChange(function () {
    const checked = taskCompletionChecked(control);
    if (checked === previous_checked) return;
    previous_checked = checked;
    on_change?.(checked, control);
  });
}
