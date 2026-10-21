/**
 * Penligent — system information IPC handlers.
 *
 * The reference reports OS/distro, CPU, memory, disk and device identity,
 * plus a hardware-derived "hidden info" value used to bind a licence to the
 * machine. The same fields are produced here.
 */
const { ipcMain, app } = require("electron");
const os = require("os");
const fs = require("fs");
const path = require("path");

function readDistribution() {
  try {
    const raw = fs.readFileSync("/etc/os-release", "utf8");
    const entries = Object.fromEntries(
      raw
        .split("\n")
        .filter((line) => line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index).trim(),
            line.slice(index + 1).trim().replace(/^"|"$/g, "")
          ];
        })
    );
    return {
      name: entries.NAME || os.type(),
      version: entries.VERSION || os.release(),
      codename: entries.VERSION_CODENAME || "",
      id: entries.ID || ""
    };
  } catch {
    return { name: os.type(), version: os.release(), codename: "", id: "" };
  }
}

function systemInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    distribution: readDistribution(),
    cpuModel: os.cpus()[0]?.model ?? "",
    cpuCores: os.cpus().length,
    totalMemory,
    freeMemory,
    usedMemory: totalMemory - freeMemory,
    homedir: os.homedir(),
    user: os.userInfo().username,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  };
}

function machineId() {
  const candidates = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
  for (const candidate of candidates) {
    try {
      const value = fs.readFileSync(candidate, "utf8").trim();
      if (value) return value;
    } catch {
      /* try the next candidate */
    }
  }
  return `${os.hostname()}-${os.userInfo().username}`;
}

ipcMain.handle("get-system-info", () => systemInfo());

ipcMain.handle("get-device-detail", () => ({
  machineId: machineId(),
  platform: process.platform,
  arch: process.arch,
  hostname: os.hostname()
}));

ipcMain.handle("get-hidden-info", () => machineId());
ipcMain.handle("get-hidden-info-two", () => machineId());

module.exports = { systemInfo, machineId };
