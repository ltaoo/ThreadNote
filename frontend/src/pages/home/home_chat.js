import { HomeChatPageModel } from "./home_chat.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { mountACPChat } from "./chat.js";

export function mountHomeChatContent(host) {
  return mountACPChat(host);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeChatPageView(props) {
  const vm$ = HomeChatPageModel(props);
  return View(
    {
      class: "page home-chat-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-chat-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: { "data-home-page-main": "true", n: "home-chat-main" },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: { "data-memo-list": "true", n: "home-chat-content" },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}
