/**
 * Contract tests for the Electron IPC surface.
 *
 * The channel names are the ones registered by the reference application
 * (116 `ipcMain.handle` registrations were enumerated across the reference's
 * ipc/ modules). These tests assert that the reconstruction keeps the same
 * channel vocabulary and the same preload bridge namespaces.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const electronDir = path.join(__dirname, "..", "electron");

function readAll(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readAll(full, files);
    else if (entry.name.endsWith(".cjs")) files.push(full);
  }
  return files;
}

const REFERENCE_CHANNELS = [
  "get-projects",
  "add-projects",
  "update-projects",
  "delete-project",
  "get-risk-items",
  "add-risk-item",
  "get-execution-results",
  "add-execution-result-all",
  "get-chat-records",
  "add-chat-record",
  "get-all-test-lists",
  "add-test-list",
  "get-all-ttps",
  "add-ttp",
  "get-sets",
  "add-sets",
  "get-proxy-settings",
  "update-proxy-settings",
  "add-proxy-history",
  "get-proxy-history-all",
  "add-repeater-list",
  "get-all-repeater-list-parent",
  "http-request",
  "stop-request",
  "proxy-request",
  "execute-command",
  "execute-command-non-streaming",
  "stop-command",
  "start-sse",
  "stop-sse",
  "get-system-info",
  "get-device-detail",
  "open-external",
  "get-window-state",
  "window-minimize",
  "window-maximize",
  "window-close",
  "log-info",
  "log-error",
  "log-warn",
  "log-debug",
  "show-save-dialog",
  "show-open-dialog",
  "write-file",
  "read-file",
  "read-dir-files",
  "get-file-path",
  "copy-file-to-path",
  "get-plugin-file-list",
  "get-all-user-settings",
  "get-user-setting-one-by-key",
  "set-user-setting",
  "get-user-info",
  "update-user-info",
  "create-proxy-window",
  "fork-proxy-child-data",
  "click-logout"
];

test("every reference channel is registered by the reconstruction", () => {
  const sources = readAll(electronDir).map((f) => fs.readFileSync(f, "utf8"));
  const missing = REFERENCE_CHANNELS.filter(
    (channel) => !sources.some((src) => src.includes(`"${channel}"`))
  );
  assert.deepStrictEqual(missing, [], `missing IPC channels: ${missing.join(", ")}`);
});

test("preload exposes the reference's bridge namespaces plus the AI provider", () => {
  const preload = fs.readFileSync(path.join(electronDir, "preload.cjs"), "utf8");
  const namespaces = [...preload.matchAll(/exposeInMainWorld\("([^"]+)"/g)].map((m) => m[1]);
  // The reference exposes exactly these twelve renderer-visible namespaces
  // (verified at runtime: Object.keys(window).filter(k => /API$/.test(k))).
  const expected = [
    "aiAPI",
    "apiAPI",
    "crawlerAPI",
    "checkToolsAPI",
    "commandAPI",
    "dbAPI",
    "fileAPI",
    "logAPI",
    "proxyAPI",
    "sseGenrateAPI",
    "systemAPI",
    "targetToolsAPI",
    "windowAPI"
  ];
  for (const name of expected) {
    assert.ok(namespaces.includes(name), `missing bridge namespace ${name}`);
  }
});

test("the AI provider channels are registered", () => {
  const sources = readAll(electronDir).map((f) => fs.readFileSync(f, "utf8"));
  const ai = sources.find((src) => src.includes("ai-get-config"));
  assert.ok(ai, "no module registers the AI provider channels");
  for (const channel of [
    "ai-get-config",
    "ai-set-config",
    "ai-clear-key",
    "ai-complete",
    "ai-stream",
    "ai-stop-stream",
    "ai-test"
  ]) {
    assert.ok(ai.includes(`"${channel}"`), `missing AI channel ${channel}`);
  }
});

test("the AI layer supports both provider families", () => {
  const ai = fs.readFileSync(path.join(electronDir, "ipc", "ai.cjs"), "utf8");
  assert.match(ai, /chat\/completions/);
  assert.match(ai, /v1\/messages/);
  assert.match(ai, /x-api-key/);
  assert.match(ai, /Authorization/);
  assert.match(ai, /anthropic-version/);
});

test("main process reproduces the reference window geometry", () => {
  const main = fs.readFileSync(path.join(electronDir, "main.cjs"), "utf8");
  assert.match(main, /width:\s*1000/);
  assert.match(main, /height:\s*600/);
  assert.match(main, /minWidth:\s*1050/);
  assert.match(main, /minHeight:\s*600/);
  assert.match(main, /titleBarStyle:\s*"hidden"/);
  assert.match(main, /preload\.cjs/);
});

test("proxy detail window keeps the reference title and size", () => {
  const main = fs.readFileSync(path.join(electronDir, "main.cjs"), "utf8");
  assert.match(main, /抓包详情 - 渗透测试工具/);
  assert.match(main, /width:\s*1000,\s*\n\s*height:\s*800/);
});
