import { callNativeAPI } from "./native.js";

export function rebuildMemoIndex() {
  return callNativeAPI("/api/settings/cloud-storage/rebuild-index", {
    args: {},
    method: "POST",
  });
}
