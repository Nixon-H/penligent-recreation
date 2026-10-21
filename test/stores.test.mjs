import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(import.meta.url);

/**
 * The dialog store and the theme and font-size stores.
 *
 * The stores are loaded through their source so they can be exercised under
 * plain Node, with the small DOM surface they touch stubbed.
 */

/** The DOM the theme and font-size stores write to. */
function stubDom() {
  const classes = new Set();
  globalThis.document = {
    documentElement: {
      classList: {
        add: (name) => classes.add(name),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        get value() {
          return [...classes].join(" ");
        }
      },
      style: {},
      get className() {
        return [...classes].join(" ");
      }
    }
  };
  globalThis.window = { dbAPI: { setUserSetting: () => {} } };
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value))
    };
  }
  return classes;
}

function loadStores() {
  const { useDialogStore } = require(resolve(root, "src/stores/dialog.js"));
  const { useThemeStore, useFontSizeStore } = require(resolve(root, "src/stores/ui.js"));
  return { useDialogStore, useThemeStore, useFontSizeStore };
}

describe("dialog store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("opens a dialog by name", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    assert.equal(store.dialogStr, "");
    store.openDialog("report");
    assert.equal(store.dialogStr, "report");
  });

  it("keeps the last ten names, as the reference does", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    for (let index = 0; index < 14; index++) {
      store.openDialog(`dialog-${index}`);
    }
    assert.equal(store.history.length, 10);
    assert.equal(store.history[0], "dialog-4");
    assert.equal(store.history[9], "dialog-13");
  });

  it("keeps the update notice exclusive", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    store.openDialog("new-version");
    store.openDialog("report");
    assert.equal(store.dialogStr, "new-version");
  });

  it("closes the open dialog", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    store.openDialog("task-create");
    store.closeDialog();
    assert.equal(store.dialogStr, "");
  });

  it("ignores an empty name", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    assert.equal(store.openDialog(""), false);
    assert.equal(store.dialogStr, "");
  });

  it("holds the screen for the update notice", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    store.openDialog("new-version");
    assert.equal(store.openDialog("report"), false);
    assert.equal(store.dialogStr, "new-version");
  });

  it("opens the environment dialog when the task dialog is not configured", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    // The reference opens `env-path` when the interpreter or the script path
    // is missing.
    store.openDialog("task-create");
    assert.equal(store.dialogStr, "env-path");
  });

  it("skips the gates when asked to", async () => {
    const { useDialogStore } = await loadStores();
    const store = useDialogStore();
    store.openDialogSkip("task-create");
    assert.equal(store.dialogStr, "task-create");
  });
});

describe("theme and font size", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubDom();
  });

  it("applies the theme class to the document element", async () => {
    const { useThemeStore } = await loadStores();
    const store = useThemeStore();
    store.setTheme("dark");
    assert.equal(store.theme, "dark");
    assert.equal(document.documentElement.className, "theme-dark");
    store.setTheme("light");
    assert.equal(document.documentElement.className, "theme-light");
  });

  it("scales the root font size the way the reference does", async () => {
    const { useFontSizeStore } = await loadStores();
    const store = useFontSizeStore();
    assert.equal(store.rootFontSize, 12);
    store.increase();
    assert.equal(store.scale, 1.125);
    assert.equal(store.rootFontSize, 13.5);
    store.decrease();
    assert.equal(store.scale, 1);
    assert.equal(store.rootFontSize, 12);
  });

  it("offers the reference's presets", async () => {
    const { useFontSizeStore } = await loadStores();
    const store = useFontSizeStore();
    assert.deepEqual(store.presets, { small: 0.875, medium: 1, large: 1.125, xlarge: 1.25 });
    store.setPreset("xlarge");
    assert.equal(store.rootFontSize, 15);
  });

  it("caps the scale at the reference's ceiling", async () => {
    const { useFontSizeStore } = await loadStores();
    const store = useFontSizeStore();
    for (let index = 0; index < 20; index++) store.increase();
    assert.equal(store.scale, 1.5);
  });
});

describe("shared AI configuration", () => {
  it("is stored installation-wide, not per profile", async () => {
    // The reference's own AI token lives in the `users` table, but this
    // reconstruction has no account, so the provider configuration is kept
    // in `user_settings`, whose key is unique and carries no user column —
    // every profile on the installation reads the same configuration.
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync(resolve(root, "electron/db/schema.cjs"), "utf8");
    const match = schema.match(
      /CREATE TABLE IF NOT EXISTS user_settings \(([\s\S]*?)\)`/
    );
    assert.ok(match, "user_settings table not found");
    assert.match(match[1], /setting_key TEXT UNIQUE NOT NULL/);
    assert.doesNotMatch(match[1], /user_id/);
    void require;
  });

  it("offers Penligent's own provider alongside the user's endpoint", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(resolve(root, "src/stores/ai.js"), "utf8");
    assert.match(source, /key: "penligent"/);
    assert.match(source, /https:\/\/api\.penligent\.ai/);
    assert.match(source, /penliai-4-5-101/);
  });
});
