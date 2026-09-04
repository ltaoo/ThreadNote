import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCloudStorageProfile,
  parseCloudStorageAssetProxyUrl,
  publicCloudStorageObjectUrl,
  resolveAssetUrl,
} from "./storage.js";

test("R2 profiles default to the auto region", function () {
  const profile = normalizeCloudStorageProfile({
    id: "cloudflare-r2",
    provider: "R2",
  });

  assert.equal(profile.provider, "r2");
  assert.equal(profile.region, "auto");
});

test("asset proxy parsing keeps the storage identity for provider checks", function () {
  assert.deepEqual(
    parseCloudStorageAssetProxyUrl(
      "/api/oss/assets?storageId=cloudflare-r2&path=images%2Fprivate.png",
      "http://127.0.0.1:18088",
    ),
    {
      key: "images/private.png",
      storageId: "cloudflare-r2",
    },
  );
  assert.equal(
    parseCloudStorageAssetProxyUrl(
      "https://assets.example.com/api/oss/assets?storageId=cloudflare-r2&path=private.png",
      "http://127.0.0.1:18088",
    ),
    null,
  );
});

test("private R2 assets resolve through the authenticated application route", function () {
  const storage = normalizeCloudStorageProfile({
    bucket: "threadnote-assets",
    endpoint: "https://account.r2.cloudflarestorage.com",
    id: "cloudflare-r2",
    provider: "r2",
  });

  assert.equal(
    publicCloudStorageObjectUrl(storage, "images/my photo.png"),
    "/api/oss/assets?storageId=cloudflare-r2&path=images%2Fmy%20photo.png",
  );
  assert.equal(
    resolveAssetUrl("@assets/cloudflare-r2/images/my photo.png", {
      activeStorageId: "cloudflare-r2",
      storages: [storage],
    }),
    "/api/oss/assets?storageId=cloudflare-r2&path=images%2Fmy%20photo.png",
  );
});

test("R2 assets use a configured public domain directly", function () {
  const storage = normalizeCloudStorageProfile({
    id: "cloudflare-r2",
    provider: "r2",
    publicBaseUrl: "https://assets.example.com/",
  });

  assert.equal(
    publicCloudStorageObjectUrl(storage, "images/my photo.png"),
    "https://assets.example.com/images/my%20photo.png",
  );
});
