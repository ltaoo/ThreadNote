(function install_timeless_select_runtime(window_object) {
  var primitive_runtime = window_object.Timeless;
  var shadcn = primitive_runtime && primitive_runtime.shadcn;
  var legacy_runtime = window_object.__tn_legacy_timeless || {};
  var legacy_ui = legacy_runtime.ui || {};

  if (!shadcn || !shadcn.SelectPrimitive || !shadcn.ui) {
    window_object.Timeless = legacy_runtime;
    return;
  }

  legacy_runtime.ui = Object.assign({}, legacy_ui, {
    SelectPrimitive: shadcn.SelectPrimitive,
  });
  legacy_runtime.vm = shadcn.ui;
  legacy_runtime.__select_primitive_runtime = primitive_runtime;
  window_object.Timeless = legacy_runtime;
})(window);
