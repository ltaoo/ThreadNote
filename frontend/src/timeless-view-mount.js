import { TimelessPrimitive } from "./timeless-icons.js";

const mount_by_host_ = new WeakMap();

function destroy_mounted_view(mounted) {
  if (!mounted) return;
  mounted.view.beforeUnmounted?.();
  mounted.dom?.remove?.();
  mounted.view.onUnmounted?.();
  mounted.vnode?.destroy?.();
}

export function TimelessViewMountModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref) {
    throw new Error("TimelessViewMountModel requires the Timeless runtime");
  }
  const view_ = runtime.ref(null);
  return runtime.defineModel({
    state: { view: view_ },
    methods: {
      setView(view) {
        view_.as(view || null);
      },
    },
  });
}

export function TimelessViewMount(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const host = props.host;
  const vm$ = props.vm$;
  let mounted_ = null;
  let unsubscribe_ = null;

  function render_view(view) {
    destroy_mounted_view(mounted_);
    mounted_ = null;
    host.replaceChildren();
    if (!view) return;
    const rendered = runtime.DOM.buildAndRender(view);
    mounted_ = { dom: rendered.dom, view, vnode: rendered.vnode };
    host.appendChild(rendered.dom);
    globalThis.queueMicrotask(function () {
      if (mounted_ && mounted_.view === view) {
        view.onMounted?.({ target: rendered.vnode });
      }
    });
  }

  return {
    mount() {
      if (unsubscribe_) return;
      unsubscribe_ = vm$.state.view.subscribe({ onChange: render_view });
      render_view(vm$.state.view.value);
    },
    destroy() {
      unsubscribe_?.();
      unsubscribe_ = null;
      destroy_mounted_view(mounted_);
      mounted_ = null;
      host.replaceChildren();
      vm$.destroy();
    },
  };
}

export function renderTimelessView(host, view, options = {}) {
  if (!host) return null;
  const runtime = options.runtime || TimelessPrimitive;
  let mount = mount_by_host_.get(host);
  if (!mount) {
    const vm$ = TimelessViewMountModel({ runtime });
    const controller = TimelessViewMount({ host, runtime, vm$ });
    controller.mount();
    mount = { controller, vm$ };
    mount_by_host_.set(host, mount);
  }
  mount.vm$.methods.setView(view);
  return mount;
}

export function unmountTimelessView(host) {
  const mount = mount_by_host_.get(host);
  if (mount) {
    mount.controller.destroy();
    mount_by_host_.delete(host);
    return;
  }
  host?.replaceChildren();
}
