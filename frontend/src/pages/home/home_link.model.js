import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeLinkPageModel(props) {
  return HomeSectionPageModel(props, "links");
}
