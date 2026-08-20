/**
 * @file Store 入口 - 路由管理
 */
import { router } from "./routes.js";
import { storage } from "./storage.js";
export { client } from "./http_client.js";
export { router };
export const views = router.views;

Timeless.kit.NavigatorCore.prefix = "";

// @ts-ignore
export const router$ = new Timeless.kit.NavigatorCore();
export const user = {};

export const view = new Timeless.kit.RouteViewCore({
  name: "root",
  pathname: "/",
  title: "ROOT",
  visible: true,
  parent: null,
  views: [],
});
view.isRoot = true;

export const history = new Timeless.kit.HistoryCore({
  view,
  router: router$,
  routes: router.routes,
  views: {
    root: view,
  },
});

export const app = new Timeless.kit.ApplicationModel({
  // @ts-ignore
  user,
  storage,
  async beforeReady() {
    const route = router.routesWithPathname[router$.pathname];
    console.log("before ready - route", route);
    const route_name = route ? route.name : router.defaultRouteName;
    history.push(route_name, router$.query, { ignore: true });
    return Timeless.Result.Ok(null);
  },
});

history.onRouteChange(({ reason, view, href, ignore }) => {
  const { title } = view || {};
  if (title) {
    app.setTitle(title);
  }
  if (ignore) return;
  if (reason === "push") {
    router$.pushState(href);
  }
  if (reason === "replace") {
    router$.replaceState(href);
  }
});

window.addEventListener(
  "click",
  (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = closestAnchor(event.target);
    if (!link) return;

    const externalURL = externalBrowserURL(
      link.getAttribute("href") || link.href || "",
    );
    if (!externalURL) return;

    event.preventDefault();
    event.stopPropagation();
    confirmOpenExternalLink(externalURL);
  },
  true,
);

history.onClickLink(({ href, target }) => {
  const externalURL = externalBrowserURL(href);
  if (externalURL) {
    confirmOpenExternalLink(externalURL);
    return;
  }

  // @ts-ignore
  const { pathname, query } = Timeless.kit.NavigatorCore.parse(href);
  const route = router.routesWithPathname[pathname];
  if (!route) {
    app.tip?.({ text: ["没有匹配的页面"] });
    return;
  }
  if (target === "_blank") {
    window.open(href);
    return;
  }
  history.push(route.name, query);
});

function closestAnchor(target) {
  let node = target;
  if (node && node.nodeType === 3) node = node.parentElement;
  if (!node || typeof node.closest !== "function") return null;
  return node.closest("a[href]");
}

function externalBrowserURL(href) {
  const value = String(href || "").trim();
  if (!/^https?:\/\//i.test(value)) return "";

  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.host) {
      return url.href;
    }
  } catch (_) {}
  return "";
}

function confirmOpenExternalLink(url) {
  openExternalLinkInDefaultBrowser(url);
}

function openExternalLinkInDefaultBrowser(url) {
  if (typeof invoke !== "function") {
    window.open(url, "_blank", "noopener");
    return;
  }

  invoke("/api/external/open?url=" + encodeURIComponent(url), {
    method: "GET",
  }).then(
    (resp) => {
      if (!resp || resp.code !== 0) {
        app.tip?.({ text: [(resp && resp.msg) || "打开链接失败"] });
      }
    },
    (err) => {
      app.tip?.({ text: ["打开链接失败: " + err] });
    },
  );
}

// @ts-ignore
Timeless.web.provide_app(app);
// @ts-ignore
Timeless.web.provide_history(history);
