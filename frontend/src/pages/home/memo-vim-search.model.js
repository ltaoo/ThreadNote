export function MemoVimSearchModel(runtime = globalThis.Timeless) {
  if (!runtime?.ref) {
    throw new TypeError("MemoVimSearchModel requires the Timeless runtime");
  }

  const visible = runtime.ref(false);
  const query = runtime.ref("");
  let request_ = null;
  let focus_view_ = null;
  let destroyed_ = false;

  function close() {
    const was_visible = visible.value;
    request_ = null;
    visible.as(false);
    return was_visible;
  }

  function open(request) {
    if (destroyed_ || typeof request?.submit !== "function") return false;
    request_ = request;
    query.as(String(request.query || ""));
    visible.as(true);
    queueMicrotask(function () {
      if (!destroyed_ && visible.value && request_ === request) focus_view_?.();
    });
    return true;
  }

  function cancel() {
    if (!request_) return false;
    const request = request_;
    close();
    request.cancel?.();
    return true;
  }

  function submit() {
    if (!request_) return false;
    const request = request_;
    const value = String(query.value || "");
    close();
    return value ? request.submit(value) : request.cancel?.() ?? true;
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" && event.key !== "Escape") return false;
    event.preventDefault();
    event.stopPropagation();
    return event.key === "Enter" ? submit() : cancel();
  }

  return {
    cancel,
    close,
    destroy() {
      if (destroyed_) return;
      destroyed_ = true;
      close();
      focus_view_ = null;
      query.destroy?.();
      visible.destroy?.();
    },
    handleKeyDown,
    open,
    query,
    setFocusView(handler) {
      focus_view_ = typeof handler === "function" ? handler : null;
    },
    setQuery(value) {
      query.as(String(value || ""));
    },
    submit,
    visible,
  };
}
