/**
 * @file 路由配置
 */
import { HomePageView } from "@/pages/home/index.js";
import { HomeLayoutView } from "@/pages/home/layout.js";
import { UIExamplePageView } from "@/pages/home/example.js";
import { LoginPageView } from "@/pages/login/index.js";
import { NotFoundPageView } from "@/pages/notfound/index.js";
import { VaultPickerPageView } from "@/pages/vault-picker/index.js";

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
      },
      example: {
        title: "组件示例",
        pathname: "/home/ui",
        component: UIExamplePageView,
      },
    },
    options: {
      require: [],
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

export const router = Timeless.kit.buildRoutes(routes_configure);
