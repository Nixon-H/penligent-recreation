/**
 * Penligent — bundled resource paths.
 *
 * The reference ships its helper binaries under `resources/depency/`:
 *
 *   depency/scanner/scanner_linux_amd64              xray v1.8.2 + config.yaml
 *   depency/crawlergo                                 the Go crawler
 *   depency/chrome-headless-shell/linux-120.0.6098.0/ the headless Chromium
 *
 * The same layout is used by the reconstruction, so the paths resolve
 * identically in development (`<project>/resources`) and in a packaged
 * application (`<resourcesPath>`).
 */
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/** Root of the bundled `depency` tree. */
function depencyRoot() {
  const packaged = path.join(process.resourcesPath || "", "depency");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", "..", "..", "resources", "depency");
}

/** Absolute path of a bundled resource, relative to the `depency` root. */
function resourcePath(relative) {
  return path.join(depencyRoot(), relative);
}

function binaryExists(binaryPath) {
  try {
    return fs.existsSync(binaryPath) && fs.statSync(binaryPath).isFile();
  } catch {
    return false;
  }
}

/**
 * The headless Chromium used by the crawler, if it is bundled.
 *
 * The reference picks the build for the platform and the architecture it is
 * running on.
 */
function chromePath() {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push(
      "chrome-headless-shell/win64-120.0.6098.0/chrome-headless-shell-win64/chrome-headless-shell.exe"
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "chrome-headless-shell/mac_arm-120.0.6098.0/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
  } else if (process.arch === "arm64") {
    candidates.push("chrome-headless-shell/chrome-linux/headless_shell");
  } else {
    candidates.push(
      "chrome-headless-shell/linux-120.0.6098.0/chrome-headless-shell-linux64/chrome-headless-shell"
    );
  }
  for (const candidate of candidates) {
    const full = resourcePath(candidate);
    if (binaryExists(full)) return full;
  }
  return null;
}

/**
 * The scanner binary.
 *
 * The reference names the build for the platform and the architecture.
 */
function scannerPath() {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push("scanner/scanner_windows_amd64.exe", "scanner/scanner_windows_amd64");
  } else if (process.platform === "darwin") {
    candidates.push("scanner/scanner_darwin_arm64", "scanner/scanner_darwin_amd64");
  } else if (process.arch === "arm64") {
    candidates.push("scanner/scanner_linux_arm64", "scanner/scanner_linux_amd64");
  } else {
    candidates.push("scanner/scanner_linux_amd64");
  }
  for (const candidate of candidates) {
    const full = resourcePath(candidate);
    if (binaryExists(full)) return full;
  }
  return resourcePath(candidates[0]);
}

/** The crawler binary. */
function crawlerPath() {
  const name = process.platform === "win32" ? "crawlergo.exe" : "crawlergo";
  return resourcePath(name);
}

module.exports = {
  depencyRoot,
  resourcePath,
  binaryExists,
  chromePath,
  scannerPath,
  crawlerPath,
  app
};
