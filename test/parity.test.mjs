import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Every source file of the renderer and the main process. */
function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "locales" || entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|vue)$/.test(entry)) files.push(full);
    }
  };
  walk(join(root, "src"));
  walk(join(root, "electron"));
  return files;
}

function relative(file) {
  return file.replace(`${root}/`, "");
}

/**
 * The parity check.
 *
 * The reference's own wording is the yardstick. Every locale key the
 * reference references in its code must appear in this reconstruction, and
 * the eleven locale tables must stay in step with one another.
 *
 * The manifest is committed, so this runs without the de-obfuscated bundle.
 * Regenerate it with `node scripts/build-reference-usage.mjs`.
 */
const manifest = JSON.parse(
  readFileSync(join(root, "reference", "used-keys.json"), "utf8")
);

const LANGUAGES = [
  "en", "jp", "kr", "ru", "zh", "fr", "de", "ar", "tw", "es", "pt"
];

/** Every character of this reconstruction's own source. */
function sourceText() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "locales" || entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|vue|json)$/.test(entry)) {
        parts.push(readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(root, "src"));
  walk(join(root, "electron"));
  return parts.join("\n");
}

describe("feature parity", () => {
  const source = sourceText();

  it("uses every locale key the reference uses", () => {
    const missing = manifest.used.filter((key) => !source.includes(key));
    assert.deepEqual(
      missing,
      [],
      `${missing.length} of the ${manifest.used.length} keys the reference uses ` +
        `are not in this reconstruction:\n  ${missing.slice(0, 20).join("\n  ")}`
    );
  });

  it("has the reference's full locale tables", () => {
    for (const language of LANGUAGES) {
      const table = JSON.parse(
        readFileSync(join(root, "src", "locales", `${language}.json`), "utf8")
      );
      assert.ok(
        Object.keys(table).length >= 45,
        `${language} has too few namespaces: ${Object.keys(table).length}`
      );
    }
  });

  it("keeps the eleven locale tables in step", () => {
    const reference = JSON.parse(
      readFileSync(join(root, "src", "locales", "en.json"), "utf8")
    );
    const namespaces = Object.keys(reference).sort();
    for (const language of LANGUAGES) {
      const table = JSON.parse(
        readFileSync(join(root, "src", "locales", `${language}.json`), "utf8")
      );
      assert.deepEqual(
        Object.keys(table).sort(),
        namespaces,
        `${language} has different namespaces`
      );
      for (const namespace of namespaces) {
        assert.deepEqual(
          Object.keys(table[namespace]).sort(),
          Object.keys(reference[namespace]).sort(),
          `${language}.${namespace} has different keys`
        );
      }
    }
  });

  it("never asks for a key the tables do not have", () => {
    // A call site that names a key which does not exist shows the user the
    // raw key path, so every key the source asks for must resolve.
    const table = JSON.parse(
      readFileSync(join(root, "src", "locales", "en.json"), "utf8")
    );
    const missing = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
        const key = match[1];
        const [namespace, ...rest] = key.split(".");
        const body = table[namespace];
        if (!body) {
          missing.push(`${key} (${relative(file)})`);
          continue;
        }
        if (rest.length && !(rest.join(".") in body)) {
          missing.push(`${key} (${relative(file)})`);
        }
      }
    }
    assert.deepEqual(missing, [], `keys asked for but not in the tables:\n  ${missing.join("\n  ")}`);
  });

  it("does not leave a key empty in any language", () => {
    for (const language of LANGUAGES) {
      const table = JSON.parse(
        readFileSync(join(root, "src", "locales", `${language}.json`), "utf8")
      );
      for (const [namespace, entries] of Object.entries(table)) {
        for (const [key, value] of Object.entries(entries)) {
          // The reference's `xray_info_format` holds an object per
          // vulnerability type — a description and a remediation.
          if (value && typeof value === "object") {
            for (const [field, text] of Object.entries(value)) {
              assert.equal(
                typeof text,
                "string",
                `${language}.${namespace}.${key}.${field} is not a string`
              );
              assert.ok(
                text.length > 0,
                `${language}.${namespace}.${key}.${field} is empty`
              );
            }
            continue;
          }
          assert.equal(
            typeof value,
            "string",
            `${language}.${namespace}.${key} is not a string`
          );
          assert.ok(
            value.length > 0,
            `${language}.${namespace}.${key} is empty`
          );
        }
      }
    }
  });
});
