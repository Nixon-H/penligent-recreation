#!/usr/bin/env node
/**
 * Regenerates the reference-usage manifest.
 *
 * The manifest lists every locale key the reference itself references in its
 * code — the strings it actually shows — as opposed to the ones it merely
 * ships in its locale tables. It is the yardstick the parity test measures
 * against, and it is committed so the check does not depend on the
 * de-obfuscated bundle being present.
 *
 *   node scripts/build-reference-usage.mjs [path-to-deobfuscated-bundle]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const BUNDLE =
  process.argv[2] ||
  process.env.BUNDLE ||
  "/tmp/commandcode-1000/-tmp/76f83a0a-3d5c-45c6-ba65-4a94ab81963d/scratchpad/webcrack-out/deobfuscated.js";
const LOCALE = path.join(here, "..", "src", "locales", "en.json");
const OUT = path.join(here, "..", "reference", "used-keys.json");

if (!fs.existsSync(BUNDLE)) {
  console.error(
    `error: the de-obfuscated reference bundle is not at ${BUNDLE}\n` +
      "       pass its path as the first argument"
  );
  process.exit(1);
}

const bundle = fs.readFileSync(BUNDLE, "utf8");
const locale = JSON.parse(fs.readFileSync(LOCALE, "utf8"));

/**
 * The keys the reference references in code.
 *
 * It calls them as `$t("namespace.key")`, and it also builds some of the
 * names at run time, so both forms are collected.
 */
const used = new Set();
for (const match of bundle.matchAll(/\$t\(\s*"([^"]+)"\s*\)/g)) {
  used.add(match[1]);
}
for (const match of bundle.matchAll(/\$t\(\s*`([^`]+)`\s*\)/g)) {
  used.add(match[1]);
}

// Keys built at run time: "namespace." + a literal.
for (const match of bundle.matchAll(/\$t\(\s*([A-Za-z0-9_$]+)\s*\+\s*"([^"]+)"\s*\)/g)) {
  const namespace = match[1].replace(/^a0_0x[0-9a-f]+$/, "");
  if (namespace) used.add(`${namespace}.${match[2]}`);
}

const known = new Set();
for (const [namespace, entries] of Object.entries(locale)) {
  if (namespace === "registry") continue;
  for (const key of Object.keys(entries || {})) {
    known.add(`${namespace}.${key}`);
  }
}

/**
 * The keys the recreation deliberately omits.
 *
 * The build has no Penligent account, so the sign-in gate and the account
 * block that goes with it are not part of it: the sign-in button opens the
 * AI provider settings, and the account's plan page and sign-out are gone
 * rather than left as controls that cannot do anything.
 */
const EXCLUDED = [
  "header.登录",
  "header.登录中",
  "setting.登录",
  "setting.登录中",
  "setting.查看使用计划",
  "setting.退出登录"
];

const covered = [...known].filter((key) => used.has(key)).sort();
const excluded = covered.filter((key) => EXCLUDED.includes(key));
const required = covered.filter((key) => !EXCLUDED.includes(key));
const localeOnly = [...known].filter((key) => !used.has(key)).sort();
const unknown = [...used].filter((key) => !known.has(key)).sort();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      description:
        "The locale keys the reference itself references in its code. The parity " +
        "test requires every one of them to appear in this reconstruction.",
      source: "penligent.kali_amd64_2.1.6.deb, dist/assets/index-BuPJTjKv.js (de-obfuscated)",
      counts: {
        known: known.size,
        usedByReference: required.length,
        localeOnly: localeOnly.length,
        excluded: excluded.length
      },
      used: required,
      localeOnly,
      excluded: {
        description:
          "The sign-in gate and the account block that goes with it, which " +
          "this reconstruction deliberately omits: the build has no " +
          "Penligent account, so the sign-in button opens the AI provider " +
          "settings and the account's plan page and sign-out are gone " +
          "rather than left as controls that cannot do anything.",
        keys: excluded
      }
    },
    null,
    2
  ) + "\n"
);

console.log(`known keys       : ${known.size}`);
console.log(`used by reference: ${covered.length}`);
console.log(`locale-only      : ${localeOnly.length}`);
console.log(`not in the locale: ${unknown.length}`);
if (unknown.length) {
  console.log("  (referenced by the reference but not in the locale table:)");
  for (const key of unknown.slice(0, 10)) console.log(`   ${key}`);
}
console.log(`wrote ${OUT}`);
