import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeImagePageModel(props) {
  return HomeSectionPageModel(props, "images");
}
