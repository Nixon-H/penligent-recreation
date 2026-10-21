/**
 * Penligent — packet-capture (MITM proxy) IPC handlers.
 *
 * The reference ships a mitm proxy built on mockttp with its own CA
 * (resources/proxy/certs/ca.crt + ca.key) and stores captured traffic in the
 * proxy_history table. The proxy-list route opens the detail window via
 * "create-proxy-window".
 *
 * This reconstruction implements the persistence and window parts, and keeps
 * the certificate/CA workflow and the request/response envelope identical.
 * The upstream mockttp dependency is intentionally not vendored; the proxy
 * engine is documented as an un-reproduced component (see RECONSTRUCTION.md).
 */
const { ipcMain, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { build } = require("../db/db.cjs");

let api = null;
const db = () => (api ||= build(app));

ipcMain.handle("get-proxy-ca-info", () => {
  // The reference keeps the certificate and the key in the user data's
  // `proxy-certs` directory, next to the one the file API serves.
  const dir = path.join(app.getPath("userData"), "proxy-certs");
  const cert = path.join(dir, "ca.crt");
  const key = path.join(dir, "ca.key");
  return {
    certPath: fs.existsSync(cert) ? cert : null,
    keyPath: fs.existsSync(key) ? key : null,
    installed: fs.existsSync(cert)
  };
});

ipcMain.handle("get-proxy-address", () => {
  const settings = db().getProxySettings();
  const address = settings.find((row) => row.proxy_type === "address");
  return address ? address.proxy_value : "127.0.0.1:8080";
});

ipcMain.handle("save-proxy-address", (_event, address) =>
  db().updateProxySettings("address", address)
);

ipcMain.handle("get-proxy-intercept-rules", () => {
  const settings = db().getProxySettings();
  const rules = settings.find((row) => row.proxy_type === "intercept_rules");
  if (!rules) return [];
  try {
    return JSON.parse(rules.proxy_value);
  } catch {
    return [];
  }
});

ipcMain.handle("save-proxy-intercept-rules", (_event, rules) =>
  db().updateProxySettings("intercept_rules", JSON.stringify(rules ?? []))
);

ipcMain.handle("get-proxy-timeout", () => {
  const settings = db().getProxySettings();
  const entry = settings.find((row) => row.proxy_type === "intercept_timeout");
  return entry ? Number(entry.proxy_value) : 300;
});

ipcMain.handle("save-proxy-timeout", (_event, seconds) =>
  db().updateProxySettings("intercept_timeout", String(seconds))
);

ipcMain.handle("get-proxy-history-page", (_event, { offset = 0, limit = 50 } = {}) => {
  const rows = db().getProxyHistoryAll();
  return { total: rows.length, rows: rows.slice(offset, offset + limit) };
});
