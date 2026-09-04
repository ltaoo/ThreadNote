import { callNativeAPI } from "./native.js";

const LOCAL_DIRECTORY_PROVIDERS = new Set(["local", "github", "git", "s3", "r2"]);

export function normalizeVaultSyncProvider(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeVaultSync(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const config = raw.config && typeof raw.config === "object" ? raw.config : {};
  const status = raw.status && typeof raw.status === "object" ? raw.status : {};
  const provider = normalizeVaultSyncProvider(config.provider || status.provider || "local") || "local";
  const uses_local_directory = typeof raw.usesLocalDirectory === "boolean"
    ? raw.usesLocalDirectory
    : LOCAL_DIRECTORY_PROVIDERS.has(provider);
  return {
    config,
    provider,
    status,
    usesLocalDirectory: uses_local_directory,
  };
}

export function loadVaultSync() {
  return callNativeAPI("/api/vault/sync", { method: "GET" }).then(normalizeVaultSync);
}

export function openVaultSyncDirectory() {
  return callNativeAPI("/api/vault/sync/open-directory", { method: "POST", args: {} });
}
