import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeTodoPageModel(props) {
  return HomeSectionPageModel(props, "todos");
}
