import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const button_css = readFileSync(new URL("./button.css", import.meta.url), "utf8");
const style_css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("primary button owns its hover and active colors", () => {
  assert.match(
    button_css,
    /\.tn-button--primary[^{}]*:hover\s*\{[^{}]*background: var\(--tn-button-primary-bg-hover\);[^{}]*\}/,
  );
  assert.match(
    button_css,
    /\.tn-button--primary[^{}]*:active\s*\{[^{}]*background: var\(--tn-button-primary-bg-active\);[^{}]*\}/,
  );
});

test("button interactions exclude disabled and loading states", () => {
  const primary_hover_selector = button_css.match(
    /(\.tn-button--primary[^{}]*:hover)\s*\{/,
  )?.[1];

  assert.ok(primary_hover_selector);
  assert.match(primary_hover_selector, /:disabled/);
  assert.match(primary_hover_selector, /\.is-disabled/);
  assert.match(primary_hover_selector, /\.is-loading/);
  assert.match(primary_hover_selector, /\[aria-disabled="true"\]/);
  assert.match(button_css, /\.tn-button:where\(:disabled, \.is-disabled, \[aria-disabled="true"\]\)/);
  assert.match(button_css, /\.tn-button\.is-loading\s*\{/);
  assert.match(
    button_css,
    /\.tn-button\.tn-button--primary:is\([^)]*\.is-loading[^)]*\):hover/,
  );
});

test("style tokens define readable button states for both themes", () => {
  const required_tokens = [
    "--tn-button-default-bg-hover",
    "--tn-button-default-bg-active",
    "--tn-button-primary-bg-hover",
    "--tn-button-primary-bg-active",
    "--tn-button-secondary-bg-active",
    "--tn-button-danger-bg-hover",
    "--tn-button-danger-bg-active",
    "--tn-button-loading-opacity",
  ];

  for (const token of required_tokens) {
    assert.match(style_css, new RegExp(`${token}:`));
  }

  const dark_theme = style_css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(dark_theme);
  assert.match(dark_theme, /--tn-button-default-bg-hover:/);
  assert.match(dark_theme, /--tn-button-danger-bg-active:/);
});
