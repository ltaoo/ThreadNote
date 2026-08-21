import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeItemPageModel(props) {
  return HomeSectionPageModel(props, "items");
}
