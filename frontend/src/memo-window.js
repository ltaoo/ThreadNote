import { mountDetachedMemoWindow } from "./pages/home/memos.js?v=20260820-todo-checkbox-unify";

document.addEventListener("DOMContentLoaded", function () {
  const root = document.querySelector("#root");
  if (!root) {
    console.error("[MemoWindow] Root element not found");
    return;
  }
  mountDetachedMemoWindow(root);
});
