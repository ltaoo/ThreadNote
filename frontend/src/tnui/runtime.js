const Runtime = globalThis.Timeless;

if (!Runtime?.ui || !Runtime?.vm) {
  throw new Error("tnui 无法启动：Timeless 运行时未加载");
}

export const ui = Runtime.ui;
export const vm = Runtime.vm;
export const computed = Runtime.computed;
export const combine = Runtime.combine;
export const Fragment = Runtime.Fragment;
export const For = Runtime.For;
export const Show = Runtime.Show;
export const View = Runtime.View;
export const ref = Runtime.ref;
export const refobj = Runtime.refobj;

export function class_names(values) {
  return Runtime.classNames((Array.isArray(values) ? values : [values]).filter(Boolean));
}

export function require_store(component_name, store) {
  if (!store) throw new TypeError(`tn.${component_name} 需要 Timeless store`);
  return store;
}

export function semantic_props(props, base_class, semantic_name) {
  const { class: extra_class, attributes, ...rest } = props || {};
  return {
    ...rest,
    class: class_names([base_class, extra_class]),
    attributes: { ...(attributes || {}), n: semantic_name },
  };
}

export function observe_store(store) {
  const state_ = refobj(store.state);
  const unlisten = store.onStateChange((state) => state_.as(state));
  return {
    state_,
    destroy() {
      if (typeof unlisten === "function") unlisten();
      state_.destroy?.();
    },
  };
}

export function destroy_with(observation, callback) {
  return function () {
    observation?.destroy?.();
    callback?.();
  };
}

export { Runtime };
