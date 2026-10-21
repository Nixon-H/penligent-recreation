#!/usr/bin/env node
/**
 * Extracts the `xray_info_format` namespace from the reference for every
 * language.
 *
 * The reference's tables carry a namespace the earlier extraction missed,
 * because it is written as a reference to another object rather than inline.
 * The namespace describes each xray vulnerability type with a localised
 * description and a localised remediation.
 */
const fs = require("fs");
const path = require("path");

const BUNDLE =
  process.env.BUNDLE ||
  "/home/nixon/penligent-analysis/evidence/renderer-deobfuscated.js";
const LOCALE_DIR = path.join(__dirname, "..", "src", "locales");

const bundle = fs.readFileSync(BUNDLE, "utf8");

/** The balanced `{…}` literal that starts at `start`. */
function literalAt(start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < bundle.length; i++) {
    const c = bundle[i];
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return bundle.slice(start, i + 1);
    }
  }
  return null;
}

function evaluate(text) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`"use strict"; return (${text});`)();
  } catch {
    return null;
  }
}

// The locale registries name the variable each language's table lives in.
const languageFor = new Map();
const messages = bundle.match(/messages:\s*\{([\s\S]{0,2000}?)\}\s*\)/);
if (!messages) {
  console.error("the reference's message table was not found");
  process.exit(1);
}
for (const entry of messages[1].matchAll(/([a-zA-Z-]+)\s*:\s*(a0_0x[0-9a-f]+|fs)/g)) {
  languageFor.set(entry[2], entry[1]);
}
console.log("languages mapped:", languageFor.size);

// The xray namespace lives inside each language's registry, so the language
// is found first and the namespace's own variable second.
let added = 0;
for (const [registry, language] of languageFor) {
  const declaration = bundle.match(new RegExp(`const\\s+${registry}\\s*=\\s*\\{`));
  if (!declaration) continue;
  const registryStart = bundle.indexOf("{", declaration.index);
  const registryText = literalAt(registryStart);
  if (!registryText) continue;
  const named = registryText.match(/xray_info_format:\s*(a0_0x[0-9a-f]+)/);
  if (!named) continue;
  const variable = named[1];

  const declaration2 = bundle.match(new RegExp(`const\\s+${variable}\\s*=\\s*\\{`));
  if (!declaration2) continue;
  const start = bundle.indexOf("{", declaration2.index);
  const text = literalAt(start);
  if (!text) continue;
  const table = evaluate(text);
  if (!table || typeof table !== "object") continue;

  const file = path.join(LOCALE_DIR, `${language}.json`);
  if (!fs.existsSync(file)) {
    console.log(`  ${language}: no table on disk, skipped`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data["xray_info_format"] = table;
  fs.writeFileSync(file, JSON.stringify(data, indent=2) + "\n");
  console.log(`  ${language}: ${Object.keys(table).length} entries added`);
  added += 1;
}

if (added === 0) {
  console.error("no xray_info_format namespace was extracted");
  process.exit(1);
}
