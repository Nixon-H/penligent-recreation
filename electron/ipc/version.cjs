const { app, ipcMain } = require("electron");
const https = require("https");
const { compareVersions } = require("./version-compare.cjs");

/**
 * Version checking.
 *
 * The reference asks Penligent's public version endpoint which release is
 * current and offers the update when the served version is newer than the
 * running one. The endpoint needs no credentials, so the recreation uses the
 * same one.
 */
const VERSION_URL = "https://api.penligent.ai/api/version/active";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { accept: "application/json" }, timeout: 15000 },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`version endpoint returned ${response.statusCode}`));
          return;
        }
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("version request timed out")));
    request.on("error", reject);
  });
}

function register() {
  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle("check-for-update", async () => {
    const current = app.getVersion();
    try {
      const payload = await fetchJson(VERSION_URL);
      const latest = payload?.data?.version || payload?.version || "";
      return {
        current,
        latest,
        updateAvailable: compareVersions(latest, current) > 0,
        description: payload?.data?.description || "",
        url: "https://www.penligent.ai/download"
      };
    } catch (error) {
      return { current, latest: "", updateAvailable: false, description: "", error: error.message };
    }
  });
}

module.exports = { register, compareVersions };
