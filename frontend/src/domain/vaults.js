import { callNativeAPI } from "./native.js";

export function normalizeVaultEntry(vault) {
  if (!vault || typeof vault !== "object") return null;
  const path = String(vault.path || "").trim();
  if (!path) return null;
  return {
    id: String(vault.id || "").trim(),
    lastOpenedAt: vault.lastOpenedAt || "",
    name: String(vault.name || "Vault").trim() || "Vault",
    path,
    provider: String(vault.provider || "local").trim().toLowerCase() || "local",
  };
}

export function normalizeVaultStatus(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  return {
    active: data.active || null,
    dataFileExists: Boolean(data.dataFileExists),
    dataPath: String(data.dataPath || ""),
    vaults: Array.isArray(data.vaults)
      ? data.vaults.map(normalizeVaultEntry).filter(Boolean)
      : [],
  };
}

export function normalizeVaultPath(value) {
  return String(value || "").trim();
}

export function loadVaultStatus() {
  return callNativeAPI("/api/vault/status", { method: "GET" }).then(normalizeVaultStatus);
}

export function selectVaultDirectory() {
  return callNativeAPI("/api/vault/select-directory", { method: "GET" }).then(function (data) {
    return normalizeVaultPath(data && data.path);
  });
}

export function openVault(path) {
  const value = normalizeVaultPath(path);
  if (!value) return Promise.reject(new Error("请输入或选择 vault 目录"));
  return callNativeAPI("/api/vault/open", {
    method: "POST",
    args: { path: value },
  });
}

export function openRegisteredVault(id) {
  const value = String(id || "").trim();
  if (!value) return Promise.reject(new Error("请选择已登记的 vault"));
  return callNativeAPI("/api/vault/open-registered", {
    method: "POST",
    args: { id: value },
  });
}

export function openCloudflareVault(config) {
  const value = config && typeof config === "object" ? config : {};
  return callNativeAPI("/api/vault/open-cloudflare", {
    method: "POST",
    args: {
      accountId: String(value.accountId || "").trim(),
      apiToken: String(value.apiToken || "").trim(),
      databaseId: String(value.databaseId || "").trim(),
      name: String(value.name || "").trim(),
      r2AccessKeyId: String(value.r2AccessKeyId || "").trim(),
      r2Bucket: String(value.r2Bucket || "").trim(),
      r2SecretAccessKey: String(value.r2SecretAccessKey || "").trim(),
    },
  });
}

export function openVaultPicker() {
  return callNativeAPI("/api/vault/switch", { method: "POST", args: {} });
}
