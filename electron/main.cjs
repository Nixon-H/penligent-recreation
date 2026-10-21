/**
 * Penligent — Electron main process.
 *
 * Reconstructed from the reference application's `main.cjs` (de-obfuscated with
 * webcrack) and confirmed against live runtime observation.
 *
 * Verified reference facts reproduced here:
 *   - Main window: 1000x600, minWidth 1050, minHeight 600, titleBarStyle
 *     "hidden", shown only once the renderer is ready.
 *   - A second window is opened for the packet-capture detail view
 *     (1000x800, min 800x600).
 *   - dotenv loads `<resourcesPath>/.env.production` in packaged mode.
 *   - IPC handler modules are registered in a fixed order at startup.
 *   - The application is registered as "Penligent" (desktop entry:
 *     StartupWMClass=Penligent, Exec=/opt/Penligent/penligent %U).
 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");

/**
 * The application name.
 *
 * It sets the window's WM_CLASS, which is what ties the running window to the
 * installed desktop entry — without it a desktop environment cannot associate
 * the taskbar icon with the window.
 */
// It must match the StartupWMClass of the installed desktop entry, which
// electron-builder derives from the product name.
app.setName("Penligent-Recreation");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

const IS_DEV =
  process.env.NODE_ENV === "development" ||
  process.env.NODE_ENV === "test" ||
  !app.isPackaged;

/*
 * The reference application renders with Chromium's overlay scrollbars: a
 * classic Linux scrollbar consumes 15px of layout width, which shifts every
 * centred overlay (the onboarding modal measured 116.5px from the left edge
 * in the reference versus 109.5px with a classic scrollbar). Enabling overlay
 * scrollbars reproduces the reference's layout exactly.
 */
{
  const existing = process.argv
    .filter((arg) => arg.startsWith("--enable-features="))
    .map((arg) => arg.slice("--enable-features=".length))
    .join(",");
  const features = existing
    ? `${existing},OverlayScrollbar`
    : "OverlayScrollbar";
  app.commandLine.appendSwitch("enable-features", features);
}

const WINDOW_REGISTRY = new Map();

/* ------------------------------------------------------------------ *
 * Environment
 * ------------------------------------------------------------------ */

function loadEnvironment() {
  const envPath = IS_DEV
    ? path.join(__dirname, ".env." + (process.env.NODE_ENV || "development"))
    : path.join(process.resourcesPath, ".env.production");

  // The reference uses dotenv; a tiny equivalent is enough here and avoids a
  // runtime dependency for a single file.
  try {
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn("[penligent] failed to load environment:", error.message);
  }
}

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */

function createMainWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 1000,
    height: 600,
    minWidth: 1050,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true
    },
    titleBarStyle: "hidden",
    show: false
  });

  WINDOW_REGISTRY.set("main-window", window);
  // The window controls fall back to the main window when nothing is
  // focused, so they keep working after the window is minimised.
  require("./ipc/windowInfo.cjs").setMainWindow(window);

  const publishState = () => {
    if (window.isDestroyed()) return;
    window.webContents.send("window-state-changed", {
      isMaximized: window.isMaximized(),
      isMinimized: window.isMinimized(),
      isFullScreen: window.isFullScreen()
    });
  };
  window.on("maximize", publishState);
  window.on("unmaximize", publishState);
  window.on("minimize", publishState);
  window.on("restore", publishState);
  window.on("enter-full-screen", publishState);
  window.on("leave-full-screen", publishState);

  if (IS_DEV && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  // The reference guards navigation and window opening; a link or a redirect
  // must not take the application away from its own content.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // The reference closes the packet window together with the main window, so
  // that "window-all-closed" fires and the application quits instead of
  // lingering with the capture window still open.
  window.on("close", () => {
    const packet = WINDOW_REGISTRY.get("proxy-window");
    if (packet && !packet.isDestroyed()) packet.close();
  });
  window.on("closed", () => {
    WINDOW_REGISTRY.delete("main-window");
    stopProxyChild();
  });

  return window;
}

/**
 * The packet-capture ("proxy list") detail window. The reference titles it
 * "抓包详情 - 渗透测试工具" and loads the `#/proxy-list` hash route.
 */
function createProxyWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 800,
    minHeight: 600,
    minWidth: 800,
    title: "抓包详情 - 渗透测试工具",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true
    }
  });

  WINDOW_REGISTRY.set("proxy-window", window);

  if (IS_DEV && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL + "/#/proxy-list");
  } else {
    window.loadFile(path.join(__dirname, "../dist/index.html"), {
      hash: "proxy-list"
    });
  }

  window.on("closed", () => {
    WINDOW_REGISTRY.delete("proxy-window");
    stopProxyChild();
  });
  return window;
}

function broadcast(channel, payload) {
  for (const window of WINDOW_REGISTRY.values()) {
    if (!window || window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

/**
 * The shared store.
 *
 * The reference keeps a small object of state that every window can read and
 * write, and patches the change out to all of them.
 */
const sharedStore = {};

ipcMain.handle("store:get-all", () => sharedStore);
ipcMain.handle("store:get", (_event, key) => sharedStore[key]);
ipcMain.on("store:set", (_event, { key, value }) => {
  sharedStore[key] = value;
  broadcast("store:patch", { [key]: value });
});

/** The capture window sends the chat's draft back to the main window. */
ipcMain.on("set-chat-input", (_event, value) => {
  const main = WINDOW_REGISTRY.get("main-window");
  if (main && !main.isDestroyed()) main.webContents.send("set-chat-input", value);
});

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

loadEnvironment();

require("./ipc/systemInfo.cjs");
require("./ipc/windowInfo.cjs");
require("./ipc/log.cjs");
require("./ipc/db.cjs");
require("./ipc/api.cjs");
require("./ipc/ai.cjs");
require("./ipc/sse.cjs");
require("./ipc/command.cjs");
require("./ipc/taskManager.cjs");
require("./ipc/file.cjs");
require("./ipc/proxy.cjs");
require("./ipc/report.cjs");
require("./ipc/scanner/scanner.cjs");
require("./ipc/scanner/crawler.cjs");
require("./ipc/version.cjs").register();
require("./ipc/targetTools.cjs");
require("./ipc/sseGenrate.cjs");

const { initializeDatabase } = require("./db/db.cjs");

/* ------------------------------------------------------------------ *
 * MITM proxy
 *
 * The reference forks `services/proxy/index.js` into a child process and
 * drives it over the Node IPC channel, so that a hang or a crash in the
 * interception engine cannot take the main process down. The child relays
 * every intercepted request and response to the proxy window.
 * ------------------------------------------------------------------ */

const PROXY_PORT = 17890;
let proxyChild = null;

function startProxyChild() {
  if (proxyChild) return proxyChild;

  const childPath = path.join(__dirname, "services", "proxy", "index.js");
  proxyChild = fork(childPath, [], {
    env: {
      ...process.env,
      PENLIGENT_USER_DATA: app.getPath("userData")
    }
  });

  proxyChild.on("message", (message) => {
    broadcast("fork-proxy-child", message);
  });
  proxyChild.on("error", (error) => {
    console.error("[proxyChild] process error:", error);
  });
  proxyChild.on("exit", (code, signal) => {
    console.error(`[proxyChild] exited, code=${code}, signal=${signal}`);
    proxyChild = null;
  });

  return proxyChild;
}

function stopProxyChild() {
  if (!proxyChild) return;
  try {
    proxyChild.kill();
  } catch {
    /* already gone */
  }
  proxyChild = null;
}

ipcMain.handle("create-proxy-window", () => {
  createProxyWindow();
  startProxyChild();
  return { success: true };
});

ipcMain.handle("start-proxy", () => {
  startProxyChild();
  return { success: true, port: PROXY_PORT };
});

ipcMain.handle("stop-proxy", () => {
  stopProxyChild();
  return { success: true };
});

ipcMain.handle("proxy-status", () => ({
  running: Boolean(proxyChild),
  port: PROXY_PORT,
  caCertPath: path.join(app.getPath("userData"), "proxy-certs", "ca.crt")
}));

ipcMain.on("fork-proxy-child-data", (_event, payload) => {
  if (!proxyChild) return;
  proxyChild.send(payload);
});

ipcMain.handle("open-external", async (_event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle("click-logout", async () => {
  const { clearSession } = require("./db/db.cjs");
  clearSession();
  return { success: true };
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const main = WINDOW_REGISTRY.get("main-window");
    if (main) {
      if (main.isMinimized()) main.restore();
      main.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await initializeDatabase(app);
    } catch (error) {
      console.error("[penligent] database initialisation failed:", error);
    }
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  stopProxyChild();
  if (process.platform !== "darwin") app.quit();
});

module.exports = { createMainWindow, createProxyWindow, WINDOW_REGISTRY };
