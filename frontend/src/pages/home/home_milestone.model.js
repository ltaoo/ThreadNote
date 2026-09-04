import { HomeSectionPageModel } from "./home_section.model.js";

/** @param {import("./home.models").HomePageProps} props */
export function HomeMilestonePageModel(props) {
  return HomeSectionPageModel(props, "milestones");
}
