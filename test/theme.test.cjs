/**
 * Design-token tests.
 *
 * The theme palettes in src/styles/theme.css are byte-for-byte equivalents of
 * the reference application's compiled stylesheet. These tests assert the
 * values that drive the visible appearance so that a regression is caught
 * immediately.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "..", "src", "styles", "theme.css"),
  "utf8"
);

function block(selector) {
  const start = css.indexOf(selector);
  assert.notStrictEqual(start, -1, `selector ${selector} not found`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function vars(selector) {
  const out = {};
  for (const part of block(selector).split(";")) {
    const index = part.indexOf(":");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

test("dark palette matches the reference :root block", () => {
  const dark = vars(":root");
  assert.strictEqual(dark["--background"], "rgba(13, 13, 13, 1)");
  assert.strictEqual(dark["--foreground"], "rgba(238, 238, 238, 1)");
  assert.strictEqual(dark["--sidebar-bg"], "rgba(37, 37, 38, 1)");
  assert.strictEqual(dark["--activitybar-bg"], "rgba(51, 51, 51, 1)");
  assert.strictEqual(dark["--statusbar-bg"], "rgba(0, 122, 204, 1)");
  assert.strictEqual(dark["--titlebar-bg"], "rgba(44, 44, 44, 1)");
  assert.strictEqual(dark["--button-bg"], "rgba(63, 128, 255, 1)");
  assert.strictEqual(dark["--accent"], "rgb(23, 162, 255)");
  assert.strictEqual(dark["--border"], "rgba(255, 255, 255, .08)");
  assert.strictEqual(dark["--node-risk"], "rgba(238, 174, 38, 1)");
});

test("light palette matches the reference .theme-light block", () => {
  const light = vars(".theme-light");
  assert.strictEqual(light["--background"], "rgb(255, 255, 255)");
  assert.strictEqual(light["--foreground"], "rgb(0, 0, 0)");
  assert.strictEqual(light["--sidebar-bg"], "rgba(243, 243, 243, 1)");
  assert.strictEqual(light["--activitybar-bg"], "rgba(246, 246, 246, 1)");
  assert.strictEqual(light["--statusbar-bg"], "rgba(231, 231, 231, 1)");
  assert.strictEqual(light["--titlebar-bg"], "rgba(240, 240, 240, 1)");
  assert.strictEqual(light["--button-bg"], "rgb(37, 163, 247)");
  assert.strictEqual(light["--accent"], "rgb(48, 172, 255)");
  assert.strictEqual(light["--border"], "rgb(223, 223, 223)");
  assert.strictEqual(light["--muted"], "rgb(100, 100, 100)");
});

test("the light palette only overrides tokens the dark palette defines", () => {
  const dark = Object.keys(vars(":root"));
  const light = Object.keys(vars(".theme-light"));
  // The reference's .theme-light block is deliberately a partial override:
  // the editor/syntax/node tokens keep their dark values.
  assert.ok(light.every((token) => dark.includes(token)));
  assert.ok(light.length < dark.length);
});

test("global stylesheet keeps the reference's omissions", () => {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", "src", "styles", "global.css"),
    "utf8"
  );
  const global = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  // The reference declares no global font-family: the UA default serif
  // ("Times New Roman") is what actually renders.
  assert.ok(!/font-family\s*:/.test(global));
  // The reference declares no universal box-sizing.
  assert.ok(!/\*\s*\{[^}]*box-sizing/.test(global));
  // The reference declares no custom scrollbar width (overlay scrollbars).
  assert.ok(!/::-webkit-scrollbar\s*\{[^}]*width/.test(global));
});
