import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeChatPageModel(props) {
  return HomeSectionPageModel(props, "chat");
}
