import { TimelessPrimitive } from "@/timeless-icons.js";

const CARD_TYPES = new Set([
  "file_link",
  "image_link",
  "image_upload",
  "time",
]);

function node_type_name(node) {
  if (!node) return "";
  if (typeof node.type === "string") return node.type;
  return String(node.type?.name || "");
}

function image_upload_status(value) {
  if (["uploading", "success", "error"].includes(value)) return value;
  return "uploading";
}

function image_upload_text(attrs) {
  const status = image_upload_status(attrs.status);
  const message = String(attrs.message || "").trim();
  const file_name = String(attrs.fileName || "").trim();
  if (status === "success") return message || file_name || "上传完成";
  if (status === "error") return "上传失败：" + (message || "未知错误");
  return "正在上传 " + (file_name || "图片");
}

export function prosemirror_card_presentation(node) {
  const type = node_type_name(node);
  if (!CARD_TYPES.has(type)) return null;
  const attrs = node?.attrs || {};

  if (type === "file_link") {
    const href = String(attrs.href || "");
    const text = String(attrs.name || href || "文件");
    let class_name = "file-link-node";
    if (attrs.syntax === "markdown") class_name += " file-link-node-markdown";
    return Object.freeze({
      attrs: Object.freeze({ href, name: text, syntax: String(attrs.syntax || "") }),
      className: class_name,
      kind: "FILE",
      semanticName: "prosemirror-file-card",
      tagName: "a",
      text,
      title: href || text,
      type,
    });
  }

  if (type === "image_link") {
    const src = String(attrs.src || "");
    const text = String(attrs.alt || src || "图片");
    return Object.freeze({
      attrs: Object.freeze({ alt: text, src }),
      className: "image-link-node",
      kind: "IMG",
      semanticName: "prosemirror-image-card",
      tagName: "span",
      text,
      title: src || text,
      type,
    });
  }

  if (type === "image_upload") {
    const status = image_upload_status(attrs.status);
    const text = image_upload_text({ ...attrs, status });
    let kind = "IMG";
    if (status === "error") kind = "ERROR";
    else if (status === "success") kind = "DONE";
    return Object.freeze({
      attrs: Object.freeze({
        fileName: String(attrs.fileName || ""),
        id: String(attrs.id || ""),
        message: String(attrs.message || ""),
        status,
      }),
      className: "image-upload-node image-upload-node-" + status,
      kind,
      semanticName: "prosemirror-image-upload-card",
      tagName: "span",
      text,
      title: text,
      type,
    });
  }

  const value = String(attrs.value || "");
  return Object.freeze({
    attrs: Object.freeze({ value }),
    className: "time-node",
    kind: "TIME",
    semanticName: "prosemirror-time-card",
    tagName: "time",
    text: value,
    title: value,
    type,
  });
}

export function ProseMirrorRichCardModel(props = {}) {
  const initial_card = prosemirror_card_presentation(props.node);
  if (!initial_card) {
    throw new Error("Unsupported ProseMirror rich card node");
  }

  const card_ = ref(initial_card);
  const selected_ = ref(false);
  let destroyed_ = false;

  const state = {
    card: card_,
    selected: selected_,
  };

  const methods = {
    deselectNode() {
      if (!destroyed_) selected_.as(false);
    },

    selectNode() {
      if (!destroyed_) selected_.as(true);
    },

    updateNode(node) {
      if (destroyed_) return false;
      const next_card = prosemirror_card_presentation(node);
      if (!next_card || next_card.type !== initial_card.type) return false;
      card_.as(next_card);
      return true;
    },
  };

  const model = defineModel({ state, methods });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    destroy_model();
  };
  return model;
}

export function ProseMirrorRichCardView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const vm$ = props.vm$;
  const { Link, View } = runtime;
  const initial_card = vm$.state.card.value;
  const card_class_ = combine(
    { card: vm$.state.card, selected: vm$.state.selected },
    function (state) {
      let selected_class = "";
      if (state.selected) selected_class = "ProseMirror-selectednode is-selected";
      return [
        state.card.className,
        "prosemirror-rich-card",
        selected_class,
      ]
        .filter(Boolean)
        .join(" ");
    },
  );
  const kind_ = computed(vm$.state.card, function (card) {
    return card.kind;
  });
  const text_ = computed(vm$.state.card, function (card) {
    return card.text;
  });
  const title_ = computed(vm$.state.card, function (card) {
    return card.title;
  });
  const href_ = computed(vm$.state.card, function (card) {
    if (card.type === "file_link") return card.attrs.href;
    return null;
  });
  const datetime_ = computed(vm$.state.card, function (card) {
    if (card.type === "time") return card.attrs.value;
    return null;
  });
  const status_ = computed(vm$.state.card, function (card) {
    if (card.type === "image_upload") return card.attrs.status;
    return null;
  });
  const upload_id_ = computed(vm$.state.card, function (card) {
    if (card.type === "image_upload") return card.attrs.id;
    return null;
  });
  const upload_message_ = computed(vm$.state.card, function (card) {
    if (card.type === "image_upload") return card.attrs.message;
    return null;
  });
  const image_src_ = computed(vm$.state.card, function (card) {
    if (card.type === "image_link") return card.attrs.src;
    return null;
  });
  const image_alt_ = computed(vm$.state.card, function (card) {
    if (card.type === "image_link") return card.attrs.alt;
    return null;
  });
  const file_name_ = computed(vm$.state.card, function (card) {
    if (card.type === "file_link") return card.attrs.name;
    if (card.type === "image_upload") return card.attrs.fileName;
    return null;
  });
  const file_syntax_ = computed(vm$.state.card, function (card) {
    if (card.type === "file_link") return card.attrs.syntax;
    return null;
  });
  const attributes = {
    contenteditable: "false",
    "data-card-kind": kind_,
    n: initial_card.semanticName,
    title: title_,
  };

  if (initial_card.type === "file_link") {
    attributes["data-file-link"] = "true";
    attributes["data-file-link-syntax"] = file_syntax_;
    attributes["data-file-name"] = file_name_;
  } else if (initial_card.type === "image_link") {
    attributes["data-image-alt"] = image_alt_;
    attributes["data-image-link"] = "true";
    attributes["data-image-src"] = image_src_;
  } else if (initial_card.type === "image_upload") {
    attributes["aria-live"] = "polite";
    attributes["data-file-name"] = file_name_;
    attributes["data-image-upload"] = "true";
    attributes["data-image-upload-id"] = upload_id_;
    attributes["data-message"] = upload_message_;
    attributes["data-status"] = status_;
    attributes.role = "status";
  } else {
    attributes["data-time-node"] = "true";
    attributes.datetime = datetime_;
  }

  if (initial_card.type === "file_link") {
    return Link(
      {
        class: card_class_,
        href: href_,
        rel: "noopener noreferrer",
        target: "_blank",
        attributes,
      },
      [text_],
    );
  }
  return View({ class: card_class_, attributes }, [text_]);
}

function mount_timeless_view(element$, runtime, destroy_model) {
  const rendered = runtime.DOM.buildAndRender(element$);
  let destroyed_ = false;
  globalThis.queueMicrotask(function () {
    if (!destroyed_) element$.onMounted?.({ target: rendered.vnode });
  });

  return {
    dom: rendered.dom,
    destroy() {
      if (destroyed_) return;
      destroyed_ = true;
      element$.beforeUnmounted?.();
      if (element$.destroy) element$.destroy();
      else element$.onUnmounted?.();
      destroy_model?.();
    },
  };
}

export function createProseMirrorRichCardNodeViews(options = {}) {
  const runtime = options.runtime || TimelessPrimitive;
  if (!runtime?.DOM?.buildAndRender) return {};

  function create_node_view(node) {
    const vm$ = ProseMirrorRichCardModel({ node, runtime });
    const element$ = ProseMirrorRichCardView({ runtime, vm$ });
    const mounted = mount_timeless_view(element$, runtime, function () {
      vm$.destroy();
    });

    return {
      dom: mounted.dom,
      deselectNode() {
        vm$.methods.deselectNode();
      },
      destroy() {
        mounted.destroy();
      },
      ignoreMutation() {
        return true;
      },
      selectNode() {
        vm$.methods.selectNode();
      },
      stopEvent(event) {
        return vm$.state.card.value.type === "file_link" &&
          ["click", "mousedown"].includes(event.type);
      },
      update(next_node) {
        return vm$.methods.updateNode(next_node);
      },
    };
  }

  return Object.fromEntries(
    Array.from(CARD_TYPES, function (type) {
      return [type, create_node_view];
    }),
  );
}

export function ProseMirrorFileDropCardModel(props = {}) {
  let placement = "between";
  if (props.pluginState?.placement === "after") placement = "after";
  const data_ = ref({
    count: Math.max(1, Number(props.pluginState?.count) || 1),
    placement,
  });
  return defineModel({
    state: { data: data_ },
    methods: {},
  });
}

export function ProseMirrorFileDropCardView(props) {
  const runtime = props.runtime || TimelessPrimitive;
  const { View } = runtime;
  const vm$ = props.vm$;
  const badge_ = computed(vm$.state.data, function (data) {
    if (data.count > 1) return String(data.count);
    return "FILE";
  });
  const text_ = computed(vm$.state.data, function (data) {
    if (data.placement === "after") return "释放后在末尾新行插入文件";
    return "释放后在这里插入文件";
  });
  return View(
    {
      class: "file-drop-placeholder file-drop-placeholder-block",
      attributes: {
        "aria-hidden": "true",
        "data-card-kind": badge_,
        n: "prosemirror-file-drop-card",
      },
    },
    [text_],
  );
}

export function createProseMirrorFileDropCard(plugin_state, options = {}) {
  const runtime = options.runtime || TimelessPrimitive;
  const vm$ = ProseMirrorFileDropCardModel({ pluginState: plugin_state, runtime });
  const element$ = ProseMirrorFileDropCardView({ runtime, vm$ });
  return mount_timeless_view(element$, runtime, function () {
    vm$.destroy();
  });
}
