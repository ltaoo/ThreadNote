import { callNativeAPI } from "./native.js";
import { normalizeProjectID } from "./projects.js";
import { normalizeTaskID, normalizeStringList } from "./tasks.js";

export const GTD_MILESTONE_STATUS = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  PLANNED: "planned",
};

export function normalizeGTDMilestone(milestone) {
  if (!milestone || typeof milestone !== "object") return null;
  const id = normalizeGTDID(milestone.id);
  const title = String(milestone.title || "").trim();
  if (!id || !title) return null;
  return {
    completedAt: String(milestone.completedAt || ""),
    createdAt: milestone.createdAt || new Date().toISOString(),
    id,
    projectIds: normalizeStringList(milestone.projectIds).map(normalizeProjectID).filter(Boolean),
    reviewMemoId: String(milestone.reviewMemoId || "").trim(),
    status: normalizeGTDMilestoneStatus(milestone.status),
    targetAt: String(milestone.targetAt || ""),
    taskIds: normalizeStringList(milestone.taskIds).map(normalizeTaskID).filter(Boolean),
    title,
    updatedAt: milestone.updatedAt || "",
  };
}

export function normalizeGTDID(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeGTDMilestoneStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === GTD_MILESTONE_STATUS.ACTIVE) return GTD_MILESTONE_STATUS.ACTIVE;
  if (status === GTD_MILESTONE_STATUS.COMPLETED) return GTD_MILESTONE_STATUS.COMPLETED;
  if (status === GTD_MILESTONE_STATUS.CANCELLED) return GTD_MILESTONE_STATUS.CANCELLED;
  return GTD_MILESTONE_STATUS.PLANNED;
}

export function loadGTDMilestones() {
  return callNativeAPI("/api/gtd/milestones", { method: "GET" }).then(function (data) {
    return Array.isArray(data.milestones) ? data.milestones.map(normalizeGTDMilestone).filter(Boolean) : [];
  });
}

export function createGTDMilestone(input) {
  return callNativeAPI("/api/gtd/milestones/create", {
    method: "POST",
    args: input && typeof input === "object" ? input : {},
  }).then(function (data) {
    const milestone = normalizeGTDMilestone(data.milestone);
    if (!milestone) throw new Error("create milestone failed");
    return milestone;
  });
}

export function updateGTDMilestone(id, patch) {
  const milestoneId = normalizeGTDID(id);
  if (!milestoneId) return Promise.reject(new Error("milestone id is required"));
  return callNativeAPI("/api/gtd/milestones/update", {
    method: "POST",
    args: Object.assign({}, patch || {}, { id: milestoneId }),
  }).then(function (data) {
    const milestone = normalizeGTDMilestone(data.milestone);
    if (!milestone) throw new Error("update milestone failed");
    return milestone;
  });
}
