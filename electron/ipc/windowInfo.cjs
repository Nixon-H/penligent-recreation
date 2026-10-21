const { ipcMain, BrowserWindow } = require("electron");

/**
 * The window controls.
 *
 * The reference exposes six channels from its preload and serves them here:
 * the window's state, and the five actions its title bar offers. Every one
 * of them acts on the focused window.
 */

/**
 * The window a command acts on.
 *
 * The reference uses the focused window. A window that has been minimised
 * is not focused, so the title bar's buttons would stop working after the
 * window is minimised — the main window is used instead.
 */
function targetWindow() {
  return BrowserWindow.getFocusedWindow() || mainWindow();
}

let mainWindowRef = null;

/** The main window, so the commands work when nothing is focused. */
function mainWindow() {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef;
  const windows = BrowserWindow.getAllWindows();
  return windows.find((window) => !window.isDestroyed()) || null;
}

/** The main process tells the module which window is the main one. */
function setMainWindow(window) {
  mainWindowRef = window;
}

/** The focused window's state. */
function windowState() {
  const window = targetWindow();
  if (!window) return null;
  return {
    isMaximized: window.isMaximized(),
    isMinimized: window.isMinimized(),
    isFullScreen: window.isFullScreen()
  };
}

ipcMain.handle("get-window-state", async () => windowState());

ipcMain.on("window-minimize", () => {
  const window = targetWindow();
  if (window) window.minimize();
});

ipcMain.on("window-maximize", () => {
  const window = targetWindow();
  if (window) window.maximize();
});

ipcMain.on("window-unmaximize", () => {
  const window = targetWindow();
  if (window) window.unmaximize();
});

ipcMain.on("window-close", () => {
  const window = targetWindow();
  if (window) window.close();
});

ipcMain.on("window-exit-full-screen", () => {
  const window = targetWindow();
  if (window) window.setFullScreen(false);
});

module.exports = { windowState, setMainWindow };
