import { mountDetachedMemoWindow } from "./pages/home/home_memo_detached.js?v=20260821-home-page-split";

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[MemoWindow] Root element not found");
    return;
  }
  mountDetachedMemoWindow(root);
});
