import { callNativeAPI } from "./native.js";

export function loadMemoStorageSettings() {
  return callNativeAPI("/api/settings/memo-storage", { method: "GET" });
}

export function saveMemoStorageSettings(config) {
  return callNativeAPI("/api/settings/memo-storage/save", {
    args: config || {},
    method: "POST",
  });
}

export function testD1MemoStorage(config) {
  return callNativeAPI("/api/settings/memo-storage/d1/test", {
    args: config || {},
    method: "POST",
  });
}

export function syncD1MemoStorage() {
  return callNativeAPI("/api/settings/memo-storage/d1/sync", {
    args: {},
    method: "POST",
  });
}
