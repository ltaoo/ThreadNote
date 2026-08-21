import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeBoardPageModel(props) {
  return HomeSectionPageModel(props, "boards");
}
