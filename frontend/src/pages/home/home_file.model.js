import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeFilePageModel(props) {
  return HomeSectionPageModel(props, "files");
}
