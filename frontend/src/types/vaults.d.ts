export interface VaultEntry {
  id: string;
  lastOpenedAt: string;
  name: string;
  path: string;
  provider: "local" | "cloudflare" | string;
}

export interface CloudflareVaultConfig {
  accountId: string;
  apiToken: string;
  databaseId: string;
  name?: string;
  r2AccessKeyId: string;
  r2Bucket: string;
  r2SecretAccessKey: string;
}

export interface VaultContext {
  entry: VaultEntry;
  memoDir: string;
  rootDir: string;
  veloDir: string;
}

export interface VaultStatus {
  active: VaultContext | null;
  dataFileExists: boolean;
  dataPath: string;
  vaults: VaultEntry[];
}

export interface VaultOpenResult {
  active?: VaultContext;
  created?: boolean;
  existing?: boolean;
  registry?: unknown;
}
