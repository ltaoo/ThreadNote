(function install_timeless_icon_runtime(window_object) {
  var runtime = window_object.Timeless || {};
  var raw_icon_factory = runtime.Icon;
  var svg_namespace = "http://www.w3.org/2000/svg";

  if (typeof raw_icon_factory !== "function" || typeof runtime.registerIcons !== "function") {
    throw new Error("Timeless icon runtime requires timeless.umd.min.js");
  }

  function svg_node(tag, attributes, children) {
    return {
      tag: tag,
      attrs: attributes || {},
      children: children || [],
    };
  }

  function path_node(d) {
    return svg_node("path", { d: d });
  }

  function circle_node(cx, cy, radius) {
    return svg_node("circle", { cx: cx, cy: cy, r: radius });
  }

  function rect_node(x, y, width, height, radius) {
    var attributes = { x: x, y: y, width: width, height: height };
    if (radius !== undefined) attributes.rx = radius;
    return svg_node("rect", attributes);
  }

  function line_node(x1, y1, x2, y2) {
    return svg_node("line", { x1: x1, y1: y1, x2: x2, y2: y2 });
  }

  function polyline_node(points) {
    return svg_node("polyline", { points: points });
  }

  function polygon_node(points) {
    return svg_node("polygon", { points: points });
  }

  function icon_node(children) {
    return svg_node("svg", {
      "aria-hidden": "true",
      fill: "none",
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": "2",
      viewBox: "0 0 24 24",
    }, children);
  }

  var icon_registry = {
    actual: icon_node([
      rect_node("4", "4", "16", "16", "2"),
      rect_node("8", "8", "8", "8"),
    ]),
    archive: icon_node([
      rect_node("3", "4", "18", "4", "1"),
      path_node("M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"),
      path_node("M10 12h4"),
    ]),
    bell: icon_node([
      path_node("M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"),
      path_node("M13.73 21a2 2 0 0 1-3.46 0"),
    ]),
    bold: icon_node([
      path_node("M7 5h6.2a3.3 3.3 0 0 1 0 6.6H7z"),
      path_node("M7 11.6h7.2a3.7 3.7 0 0 1 0 7.4H7z"),
    ]),
    brush: icon_node([
      path_node("M9 18c-2 0-4 1-5 3 4 0 7-1 7-4"),
      path_node("M14 5l5 5"),
      path_node("M10 15 20 5a2.1 2.1 0 0 0-3-3L7 12z"),
    ]),
    calendar: icon_node([
      rect_node("3", "4", "18", "18", "2"),
      line_node("16", "2", "16", "6"),
      line_node("8", "2", "8", "6"),
      line_node("3", "10", "21", "10"),
    ]),
    check: icon_node([path_node("M20 6 9 17l-5-5")]),
    chevronDown: icon_node([path_node("m6 9 6 6 6-6")]),
    chevronLeft: icon_node([path_node("m15 18-6-6 6-6")]),
    chevronRight: icon_node([path_node("m9 18 6-6-6-6")]),
    chevronUp: icon_node([path_node("m18 15-6-6-6 6")]),
    clock: icon_node([
      circle_node("12", "12", "9"),
      path_node("M12 7v5l3 2"),
    ]),
    cloud: icon_node([path_node("M17.5 19H7a5 5 0 1 1 1-9.9 6 6 0 0 1 11.4 2.5A3.8 3.8 0 0 1 17.5 19z")]),
    code: icon_node([
      path_node("m9 18-6-6 6-6"),
      path_node("m15 6 6 6-6 6"),
    ]),
    columns: icon_node([
      rect_node("3", "3", "7", "18", "1"),
      rect_node("14", "3", "7", "18", "1"),
    ]),
    comment: icon_node([path_node("M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z")]),
    copy: icon_node([
      rect_node("9", "9", "11", "11", "2"),
      rect_node("4", "4", "11", "11", "2"),
    ]),
    download: icon_node([
      path_node("M12 3v12"),
      path_node("m7 10 5 5 5-5"),
      path_node("M5 21h14"),
    ]),
    edit: icon_node([
      path_node("M12 20h9"),
      path_node("M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"),
    ]),
    external: icon_node([
      path_node("M15 3h6v6"),
      path_node("M10 14 21 3"),
      path_node("M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"),
    ]),
    eye: icon_node([
      path_node("M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"),
      circle_node("12", "12", "3"),
    ]),
    fit: icon_node([
      path_node("M8 3H5a2 2 0 0 0-2 2v3"),
      path_node("M16 3h3a2 2 0 0 1 2 2v3"),
      path_node("M8 21H5a2 2 0 0 1-2-2v-3"),
      path_node("M16 21h3a2 2 0 0 0 2-2v-3"),
    ]),
    flag: icon_node([
      path_node("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"),
      line_node("4", "22", "4", "15"),
    ]),
    folder: icon_node([path_node("M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z")]),
    globe: icon_node([
      circle_node("12", "12", "9"),
      path_node("M3 12h18"),
      path_node("M12 3a14 14 0 0 1 0 18"),
      path_node("M12 3a14 14 0 0 0 0 18"),
    ]),
    hand: icon_node([
      path_node("M18 11V7a2 2 0 0 0-4 0v4"),
      path_node("M14 10V5a2 2 0 0 0-4 0v6"),
      path_node("M10 10V6a2 2 0 0 0-4 0v8"),
      path_node("M6 14v-2a2 2 0 0 0-4 0v3a7 7 0 0 0 7 7h3a6 6 0 0 0 6-6v-5a2 2 0 0 0-4 0v1"),
    ]),
    hash: icon_node([
      path_node("M4 9h16"),
      path_node("M4 15h16"),
      path_node("M10 3 8 21"),
      path_node("m16 3-2 18"),
    ]),
    history: icon_node([
      circle_node("12", "12", "9"),
      path_node("M12 7v5l3 2"),
      path_node("M3 12h1"),
      path_node("M20 12h1"),
    ]),
    home: icon_node([
      path_node("M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
      polyline_node("9 22 9 12 15 12 15 22"),
    ]),
    image: icon_node([
      rect_node("3", "5", "18", "14", "2"),
      circle_node("8.5", "10", "1.5"),
      path_node("m21 15-4-4L8 19"),
    ]),
    info: icon_node([
      circle_node("12", "12", "9"),
      path_node("M12 11v5"),
      path_node("M12 8h.01"),
    ]),
    inputSource: icon_node([
      rect_node("3", "4", "18", "16", "2"),
      path_node("M7 8h.01M11 8h.01M15 8h.01M7 12h10M9 16h6"),
    ]),
    italic: icon_node([
      path_node("M19 4h-9"),
      path_node("M14 20H5"),
      path_node("m15 4-6 16"),
    ]),
    keyboard: icon_node([
      rect_node("3", "5", "18", "14", "2"),
      path_node("M7 9h.01M11 9h.01M15 9h.01M7 13h10"),
    ]),
    link: icon_node([
      path_node("M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"),
      path_node("M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"),
    ]),
    list: icon_node([
      path_node("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"),
    ]),
    lock: icon_node([
      rect_node("4", "10", "16", "10", "2"),
      path_node("M8 10V7a4 4 0 0 1 8 0v3"),
    ]),
    mapPin: icon_node([
      path_node("M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"),
      circle_node("12", "10", "3"),
    ]),
    memo: icon_node([
      path_node("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"),
      polyline_node("14 2 14 8 20 8"),
    ]),
    menu: icon_node([
      circle_node("12", "5", "1"),
      circle_node("12", "12", "1"),
      circle_node("12", "19", "1"),
    ]),
    minus: icon_node([path_node("M5 12h14")]),
    moreHorizontal: icon_node([
      circle_node("5", "12", "1"),
      circle_node("12", "12", "1"),
      circle_node("19", "12", "1"),
    ]),
    note: icon_node([
      path_node("M6 3h12v18H6z"),
      path_node("M9 8h6M9 12h6M9 16h4"),
    ]),
    paperclip: icon_node([path_node("m21.4 11.1-9.2 9.2a6 6 0 1 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5")]),
    pin: icon_node([
      path_node("m15 4 5 5-4 4v5l-2 2-5-5-5-5 2-2h5z"),
      path_node("m9 15-5 5"),
    ]),
    plus: icon_node([
      path_node("M12 5v14"),
      path_node("M5 12h14"),
    ]),
    refresh: icon_node([
      path_node("M21.5 2v6h-6"),
      path_node("M2.5 22v-6h6"),
      path_node("M2 11.5a10 10 0 0 1 18.8-4.3"),
      path_node("M22 12.5a10 10 0 0 1-18.8 4.3"),
    ]),
    reply: icon_node([
      polyline_node("9 17 4 12 9 7"),
      path_node("M20 18v-2a4 4 0 0 0-4-4H4"),
    ]),
    restore: icon_node([
      path_node("M3 12a9 9 0 1 0 3-6.7"),
      path_node("M3 4v6h6"),
    ]),
    rotateLeft: icon_node([
      path_node("M3 12a9 9 0 1 0 3-6.7"),
      path_node("M3 4v6h6"),
    ]),
    rotateRight: icon_node([
      path_node("M21 12a9 9 0 1 1-3-6.7"),
      path_node("M21 4v6h-6"),
    ]),
    search: icon_node([
      circle_node("11", "11", "7"),
      path_node("m21 21-4.3-4.3"),
    ]),
    send: icon_node([
      path_node("m22 2-7 20-4-9-9-4z"),
      path_node("M22 2 11 13"),
    ]),
    settings: icon_node([
      circle_node("12", "12", "3"),
      path_node("M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"),
    ]),
    shield: icon_node([path_node("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10")]),
    smile: icon_node([
      circle_node("12", "12", "10"),
      path_node("M8 14s1.5 2 4 2 4-2 4-2"),
      line_node("9", "9", "9.01", "9"),
      line_node("15", "9", "15.01", "9"),
    ]),
    sort: icon_node([
      path_node("M6 9h12M9 15h6M3 3h18M10 21h4"),
    ]),
    toc: icon_node([
      path_node("M3 7h14M3 11h14M3 15h10"),
      circle_node("20", "7", "1.5"),
      circle_node("20", "11", "1.5"),
      circle_node("16.5", "15", "1.5"),
    ]),
    trash: icon_node([
      path_node("M3 6h18"),
      path_node("M8 6V4h8v2"),
      path_node("M19 6l-1 14H6L5 6"),
    ]),
    unpin: icon_node([
      path_node("M12.2 4.2 15 7l-4 4v3l-1.5 1.5"),
      path_node("M8.5 8.5 4 13l3 3"),
      path_node("m18 12 2-2-5-5"),
      path_node("m2 2 20 20"),
      path_node("m9 17-5 5"),
    ]),
    warning: icon_node([
      path_node("M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"),
      path_node("M12 9v4M12 17h.01"),
    ]),
    workflow: icon_node([
      rect_node("3", "4", "5", "4", "1"),
      rect_node("16", "4", "5", "4", "1"),
      rect_node("9", "16", "6", "4", "1"),
      path_node("M5.5 8v3a2 2 0 0 0 2 2H10M18.5 8v3a2 2 0 0 1-2 2H14M12 13v3"),
    ]),
    x: icon_node([
      path_node("M18 6 6 18"),
      path_node("m6 6 12 12"),
    ]),
    zoomIn: icon_node([
      circle_node("11", "11", "7"),
      path_node("M11 8v6M8 11h6m7 10-4.3-4.3"),
    ]),
    zoomOut: icon_node([
      circle_node("11", "11", "7"),
      path_node("M8 11h6m7 10-4.3-4.3"),
    ]),
  };

  icon_registry.attachment = icon_registry.paperclip;
  icon_registry.close = icon_registry.x;
  icon_registry.emoji = icon_registry.smile;
  icon_registry.explore = icon_registry.globe;
  icon_registry.reset = icon_registry.restore;
  icon_registry["chevron-down"] = icon_registry.chevronDown;
  icon_registry["chevron-left"] = icon_registry.chevronLeft;
  icon_registry["chevron-right"] = icon_registry.chevronRight;
  icon_registry["chevron-up"] = icon_registry.chevronUp;
  icon_registry["input-source"] = icon_registry.inputSource;
  icon_registry["map-pin"] = icon_registry.mapPin;
  icon_registry["more-horizontal"] = icon_registry.moreHorizontal;
  icon_registry["rotate-left"] = icon_registry.rotateLeft;
  icon_registry["rotate-right"] = icon_registry.rotateRight;
  icon_registry["zoom-in"] = icon_registry.zoomIn;
  icon_registry["zoom-out"] = icon_registry.zoomOut;

  var latest_registry = runtime.getIconRegistry();
  var latest_aliases = {
    actual: "square",
    attachment: "paperclip",
    calendar: "calendar",
    check: "check",
    chevronDown: "chevron-down",
    chevronLeft: "chevron-left",
    chevronRight: "chevron-right",
    chevronUp: "chevron-up",
    clock: "clock",
    code: "braces",
    columns: "panel-left",
    comment: "message-square-more",
    copy: "copy",
    download: "download",
    external: "external-link",
    folder: "folder",
    history: "history",
    home: "house",
    image: "image",
    menu: "menu",
    memo: "file-text",
    moreHorizontal: "ellipsis",
    note: "file-text",
    plus: "plus",
    refresh: "refresh-cw",
    reply: "corner-down-right",
    restore: "undo2",
    rotateLeft: "rotate-ccw",
    search: "search",
    settings: "settings",
    sort: "list-filter",
    toc: "scroll-text",
    trash: "trash2",
    warning: "circle-alert",
    workflow: "git-fork",
    x: "x",
  };

  Object.keys(latest_aliases).forEach(function (project_name) {
    var latest_name = latest_aliases[project_name];
    if (latest_registry[latest_name]) icon_registry[project_name] = latest_registry[latest_name];
  });
  Object.keys(latest_registry).forEach(function (latest_name) {
    icon_registry[latest_name] = latest_registry[latest_name];
  });
  runtime.registerIcons(icon_registry);

  function render_asn(asn_node) {
    var element = document.createElementNS(svg_namespace, asn_node.tag);
    Object.keys(asn_node.attrs || {}).forEach(function (attribute_name) {
      element.setAttribute(attribute_name, String(asn_node.attrs[attribute_name]));
    });
    (asn_node.children || []).forEach(function (child_node) {
      element.appendChild(render_asn(child_node));
    });
    return element;
  }

  function semantic_name(icon_name, state) {
    var attributes = state.attributes || {};
    var dataset = state.dataset || {};
    return attributes.n || attributes["data-n"] || dataset.n || String(icon_name) + "-icon";
  }

  function render_icon(icon) {
    var state = icon.state || {};
    var icon_name = state.name;
    var asn_node = icon_registry[icon_name] || icon_registry.info;
    var element = render_asn(asn_node);
    var size = state.size || 24;
    var meaning = semantic_name(icon_name, state);

    element.setAttribute("width", String(size));
    element.setAttribute("height", String(size));
    element.setAttribute("n", meaning);
    element.setAttribute("data-n", meaning);
    if (state.color && state.color !== "currentColor") element.style.color = state.color;
    (state.styleSet || []).filter(Boolean).forEach(function (class_name) {
      element.classList.add(class_name);
    });
    Object.assign(element.style, state.style || {});
    Object.keys(state.attributes || {}).forEach(function (attribute_name) {
      var value = state.attributes[attribute_name];
      if (value === undefined || value === null || value === false) return;
      element.setAttribute(attribute_name, value === true ? "" : String(value));
    });
    Object.keys(state.dataset || {}).forEach(function (dataset_name) {
      var value = state.dataset[dataset_name];
      if (value === undefined || value === null || value === false) return;
      element.setAttribute("data-" + dataset_name, value === true ? "" : String(value));
    });
    return element;
  }

  function icon_factory(props) {
    var icon_props = Object.assign({}, props || {});
    var icon_attributes = Object.assign({}, icon_props.attributes || {});
    var meaning = icon_attributes.n || icon_attributes["data-n"] || String(icon_props.name || "info") + "-icon";
    icon_attributes.n = meaning;
    icon_attributes["data-n"] = meaning;
    icon_props.attributes = icon_attributes;

    var icon = raw_icon_factory(icon_props);
    icon.render = function render_timeless_icon() {
      return render_icon(icon);
    };
    icon.toString = function timeless_icon_to_string() {
      return new XMLSerializer().serializeToString(render_icon(icon));
    };
    return icon;
  }

  icon_factory.register = raw_icon_factory.register;
  runtime.Icon = icon_factory;

  function upgrade_declarative_icons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("[data-timeless-icon]").forEach(function (placeholder) {
      var icon_name = placeholder.getAttribute("data-timeless-icon");
      var size_value = Number(placeholder.getAttribute("data-icon-size"));
      var meaning = placeholder.getAttribute("data-n") || icon_name + "-icon";
      var icon = runtime.Icon({
        name: icon_name,
        size: Number.isFinite(size_value) && size_value > 0 ? size_value : 24,
        class: placeholder.className,
        attributes: { n: meaning, "data-n": meaning },
      });
      placeholder.replaceWith(icon.render());
    });
  }

  runtime.upgradeIcons = upgrade_declarative_icons;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      upgrade_declarative_icons(document);
    }, { once: true });
  } else {
    upgrade_declarative_icons(document);
  }
})(window);
