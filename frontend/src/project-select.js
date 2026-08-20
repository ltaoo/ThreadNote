export function createProjectSelectComponent(deps) {
  const {
    ProjectSelectModel,
    Select,
    classNames,
    floatingControlModel,
    resolveModel,
  } = deps;

  return function ProjectSelect(props = {}) {
    const primitiveRuntime = typeof window === "undefined"
      ? null
      : window.Timeless?.ui?.SelectPrimitive
        ? window.Timeless
        : null;
    const resolved = resolveModel(props, ProjectSelectModel, {
      ...props,
      floatingControlModel,
      primitiveRuntime,
      value: props.value ?? props.defaultValue,
    });
    const view = Select({
      ...props,
      model: resolved.model,
      rootClass: classNames("tn-project-select", props.rootClass),
    });
    const originalUnmounted = view.onUnmounted.bind(view);
    view.onUnmounted = function () {
      originalUnmounted();
      if (resolved.owned) resolved.model.destroy?.();
    };
    view.model = resolved.model;
    return view;
  };
}
