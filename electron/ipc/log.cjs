/**
 * Penligent — logging IPC handlers.
 *
 * The reference writes to <userData>/logs/main.log and archives to .gz when
 * the file exceeds 10 MiB. The same behaviour is reproduced here using the
 * built-in fs module instead of electron-log.
 */
const { ipcMain, app } = require("electron");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const MAX_SIZE = 10 * 1024 * 1024;

function logDirectory() {
  const dir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFile() {
  return path.join(logDirectory(), "main.log");
}

function archiveIfNeeded() {
  const file = logFile();
  try {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).size < MAX_SIZE) return;
    const target = file + ".gz";
    zlib.gzip(fs.readFileSync(file), (error, buffer) => {
      if (error) return;
      fs.writeFileSync(target, buffer, () => {
        fs.unlink(file, () => {});
      });
    });
  } catch {
    /* archiving is best effort */
  }
}

function write(level, args) {
  const line =
    `[${new Date().toISOString()}] [${level}] ` +
    args
      .map((value) =>
        typeof value === "string" ? value : safeStringify(value)
      )
      .join(" ") +
    "\n";
  try {
    fs.appendFileSync(logFile(), line);
    archiveIfNeeded();
  } catch {
    /* logging must never break the app */
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

ipcMain.handle("log-info", (_e, ...args) => write("info", args));
ipcMain.handle("log-error", (_e, ...args) => write("error", args));
ipcMain.handle("log-warn", (_e, ...args) => write("warn", args));
ipcMain.handle("log-debug", (_e, ...args) => write("debug", args));
ipcMain.handle("log-verbose", (_e, ...args) => write("verbose", args));
