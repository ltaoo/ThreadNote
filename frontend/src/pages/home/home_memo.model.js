import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeMemoPageModel(props) {
  return HomeSectionPageModel(props, "memos");
}
