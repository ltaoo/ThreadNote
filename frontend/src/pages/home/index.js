import { mountMemosHome } from "./memos.js?v=20260820-compact-finder-thumbnails";

export function HomePageView() {
  let memoApp = null;

  return View(
    {
      class: "page memos-page w-full h-full",
      onMounted(el) {
        memoApp = mountMemosHome(el);
      },
      onUnmounted() {
        if (memoApp) memoApp.destroy();
        memoApp = null;
      },
    },
    [],
  );
}
