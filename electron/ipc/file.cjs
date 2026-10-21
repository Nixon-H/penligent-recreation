/**
 * Penligent — file system IPC handlers.
 */
const { ipcMain, dialog, app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

ipcMain.handle("show-save-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(
    BrowserWindowOf(event),
    options || {}
  );
  return result;
});

ipcMain.handle("show-open-dialog", async (event, options) => {
  const result = await dialog.showOpenDialog(
    BrowserWindowOf(event),
    options || {}
  );
  return result;
});

ipcMain.handle("write-file", (_event, filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
  return { success: true, path: filePath };
});

ipcMain.handle("read-file", async (_event, filePath) => {
  try {
    // The reference returns the content under `content`.
    return { success: true, content: await fs.promises.readFile(filePath, "utf8") };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("read-dir-files", (_event, dirPath) => {
  if (!fs.existsSync(dirPath)) return { success: false, error: "not found", files: [] };
  const files = fs.readdirSync(dirPath).map((name) => {
    const full = path.join(dirPath, name);
    const stat = fs.statSync(full);
    return { name, path: full, isDirectory: stat.isDirectory(), size: stat.size };
  });
  return { success: true, files };
});

ipcMain.handle("get-file-path", (_event, type) => {
  // The reference returns a path, not an object.
  if (type === "proxy-certs") {
    return path.join(app.getPath("userData"), "proxy-certs", "ca.crt");
  }
  return app.getPath("userData");
});

ipcMain.handle("get-file-path-legacy", (_event, name, defaultPath) => ({
  name,
  defaultPath: defaultPath || path.join(app.getPath("documents"), name || "")
}));

ipcMain.handle("copy-file-to-path", (_event, src, dest) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return { success: true, path: dest };
});

ipcMain.handle("get-plugin-file-list", async (_event) => {
  // The reference reads <userData>/tools and returns a flat list of names.
  const dir = path.join(app.getPath("userData"), "tools");
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => !name.endsWith(".lock"))
      .map((name) => name);
  } catch {
    return [];
  }
});

function BrowserWindowOf(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}
