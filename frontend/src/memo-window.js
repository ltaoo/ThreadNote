import { mountDetachedMemoWindow } from "./pages/home/home_memo_detached.js";

Object.assign(window, Timeless);

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[MemoWindow] Root element not found");
    return;
  }
  mountDetachedMemoWindow(root);
});
