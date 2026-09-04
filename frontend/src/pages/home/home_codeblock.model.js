import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeCodeblockPageModel(props) {
  return HomeSectionPageModel(props, "codeblocks");
}
