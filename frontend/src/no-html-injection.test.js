import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source_root_ = path.dirname(fileURLToPath(import.meta.url));
const forbidden_tokens_ = [
  "." + ["inner", "HTML"].join(""),
  ["insert", "Adjacent", "HTML"].join(""),
  "." + ["outer", "HTML"].join(""),
  ["document", "write"].join("."),
  ["render", "Timeless", "HTML"].join(""),
  ["create", "Timeless", "HTML", "Nodes"].join(""),
  ["unmount", "Timeless", "HTML"].join(""),
];
const legacy_icon_tokens_ = [
  ["memo", "Icon"].join(""),
  ["SVG", "."].join(""),
  ["data", "timeless", "icon"].join("-"),
  ["timeless", "icon", "runtime"].join("-"),
  ["<", "svg"].join(""),
];

async function javascript_files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async function (entry) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascript_files(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  }));
  return nested.flat();
}

test("application JavaScript has no direct HTML injection API", async function () {
  const files = (await javascript_files(source_root_)).concat([
    path.resolve(source_root_, "../public/prosemirror-editor.umd.js"),
  ]);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    forbidden_tokens_.forEach(function (token) {
      if (source.includes(token)) {
        violations.push(path.relative(source_root_, file) + ": " + token);
      }
    });
  }
  assert.deepEqual(violations, []);
});

test("application icons use the native Timeless icon component", async function () {
  const application_root = path.resolve(source_root_, "..");
  const html_files = (await readdir(application_root, { withFileTypes: true }))
    .filter(function (entry) {
      return entry.isFile() && entry.name.endsWith(".html");
    })
    .map(function (entry) {
      return path.join(application_root, entry.name);
    });
  const files = (await javascript_files(source_root_)).concat(html_files);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    legacy_icon_tokens_.forEach(function (token) {
      if (source.includes(token)) {
        violations.push(path.relative(application_root, file) + ": " + token);
      }
    });
  }
  assert.deepEqual(violations, []);
});
