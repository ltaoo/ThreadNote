/**
 * @file Store 入口 - 路由管理
 */
import { HomePageView } from "@/pages/home/index.js";
import { HomeLayoutView } from "@/pages/home/layout.js";
import { UIExamplePageView } from "@/pages/home/example.js";
import { LoginPageView } from "@/pages/login/index.js";
import { NotFoundPageView } from "@/pages/notfound/index.js";
import { VaultPickerPageView } from "@/pages/vault-picker/index.js";

import { storage } from "./storage.js";
export { client } from "./http_client.js";

Timeless.kit.NavigatorCore.prefix = "/";

const routes_configure = {
  home_layout: {
    title: "首页",
    pathname: "/home",
    component: HomeLayoutView,
    children: {
      index: {
        is_default: true,
        title: "工作台",
        pathname: "/home/index",
        component: HomePageView,
        children: {
          memo: {
            is_default: true,
            title: "Memo",
            pathname: "/home/index/memo",
            component: Timeless.lazy("@/pages/home/home_memo.js"),
          },
          todo: {
            title: "代办",
            pathname: "/home/index/todo",
            component: Timeless.lazy("@/pages/home/home_todo.js"),
          },
          item: {
            title: "事项",
            pathname: "/home/index/item",
            component: Timeless.lazy("@/pages/home/home_item.js"),
          },
          milestone: {
            title: "里程碑",
            pathname: "/home/index/milestone",
            component: Timeless.lazy("@/pages/home/home_milestone.js"),
          },
          link: {
            title: "超链接",
            pathname: "/home/index/link",
            component: Timeless.lazy("@/pages/home/home_link.js"),
          },
          codeblock: {
            title: "代码片段",
            pathname: "/home/index/codeblock",
            component: Timeless.lazy("@/pages/home/home_codeblock.js"),
          },
          file: {
            title: "文件",
            pathname: "/home/index/file",
            component: Timeless.lazy("@/pages/home/home_file.js"),
          },
          image: {
            title: "图片",
            pathname: "/home/index/image",
            component: Timeless.lazy("@/pages/home/home_image.js"),
          },
          clipboard: {
            title: "粘贴板",
            pathname: "/home/index/clipboard",
            component: Timeless.lazy("@/pages/home/home_clipboard.js"),
          },
          board: {
            title: "看板",
            pathname: "/home/index/board",
            component: Timeless.lazy("@/pages/home/home_board.js"),
          },
          rule: {
            title: "流程配置",
            pathname: "/home/index/rule",
            component: Timeless.lazy("@/pages/home/home_rule.js"),
          },
          chat: {
            title: "Chat",
            pathname: "/home/index/chat",
            component: Timeless.lazy("@/pages/home/home_chat.js"),
          },
        },
      },
      example: {
        title: "组件示例",
        pathname: "/home/ui",
        component: UIExamplePageView,
      },
    },
  },
  login: {
    title: "登录",
    pathname: "/login",
    component: LoginPageView,
    options: {
      require: [],
    },
  },
  vault_picker: {
    title: "选择 Vault",
    pathname: "/vault-picker",
    component: VaultPickerPageView,
    options: {
      require: [],
    },
  },
  notfound: {
    title: "404",
    pathname: "/notfound",
    component: NotFoundPageView,
  },
};

export const user = {};
export const router = Timeless.kit.buildRoutes(routes_configure);
export const router$ = new Timeless.kit.NavigatorCore();
export const root_view = new Timeless.kit.RouteViewCore({
  name: "root",
  pathname: "/",
  title: "ROOT",
  visible: true,
  parent: null,
  views: [],
});
root_view.isRoot = true;

export const history = new Timeless.kit.HistoryCore({
  view: root_view,
  router: router$,
  routes: router.routes,
  views: {
    root: root_view,
  },
});

export const app = new Timeless.kit.ApplicationModel({
  clipboard: Timeless.kit.ClipboardModel(),
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

Timeless.web.provide_app(app);
Timeless.web.provide_history(history);
// Timeless.web.provide_http_client(client);
// Timeless.web.provide_socket_client(socket_client$, {
//   WebSocket,
// });
