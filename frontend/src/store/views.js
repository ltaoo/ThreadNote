/**
 * @file 页面组件映射
 */
import { HomePageView } from "../pages/home/index.js?v=20260820-compact-finder-thumbnails";
import { HomeLayoutView } from "../pages/home/layout.js";
import { UIExamplePageView } from "../pages/home/example.js?v=20260819-workspace-redesign";
import { LoginPageView } from "../pages/login/index.js?v=20260819-workspace-redesign";
import { NotFoundPageView } from "../pages/notfound/index.js?v=20260819-workspace-redesign";
import { VaultPickerPageView } from "../pages/vault-picker/index.js?v=20260819-workspace-redesign";

export const views = {
  "root.home_layout": HomeLayoutView,
  "root.home_layout.index": HomePageView,
  "root.home_layout.example": UIExamplePageView,
  "root.login": LoginPageView,
  "root.vault_picker": VaultPickerPageView,
  "root.notfound": NotFoundPageView,
};
