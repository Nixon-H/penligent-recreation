/**
 * Penligent — web crawler.
 *
 * Reconstructed from the reference application's `ipc/scanner/crawler.cjs`.
 *
 * The reference drives the bundled `crawlergo` binary with exactly these
 * arguments:
 *
 *   crawlergo [--chromium-path <chrome>] [--max-tab-count N]
 *              [--max-crawled-count N] [--max-run-time N] [--log-level L]
 *              <target> [<target> …]
 *
 * The crawler writes one JSON object per line on stdout; each line is parsed
 * and stored in the `crawler_result` table.
 */
const { spawn } = require("child_process");
const { ipcMain, app } = require("electron");
const { addCrawlerResult } = require("../../db/crawlerRepo.cjs");
const {
  resourcePath,
  binaryExists,
  chromePath,
  crawlerPath: crawlerPathForPlatform
} = require("./paths.cjs");

/**
 * Paths that make a crawled URL interesting enough to keep.
 * Reproduced verbatim from the reference.
 */
const HIGH_VALUE_PATHS = [
  "/data/", "/json/", "/rest/", "/query", "/search", "/filter", "/export",
  "/import", "/upload/", "/download/", "/file/", "/document/", "/auth/",
  "/authenticate/", "/login/", "/signin/", "/logout/", "/signout/",
  "/register/", "/signup/", "/user/", "/users/", "/profile/", "/account/",
  "/session/", "/token/", "/oauth/", "/sso/", "/admin/", "/administrator/",
  "/manage/", "/manager/", "/config/", "/configuration/", "/setting/",
  "/settings/", "/backup/", "/restore/", "/debug/", "/test/", "api"
];

class Crawler {
  constructor(options) {
    // The event the crawler reports its progress on.
    this.event = options.event || null;
    if (!options.crawlerPath) throw new Error("crawlerPath is required");
    this.projectId = options.projectId || 0;
    this.crawlerPath = options.crawlerPath;
    this.chromePath = options.chromePath;
  }

  async run(targets, options = {}) {
    const list = Array.isArray(targets) ? targets : [targets];
    const args = [];

    if (this.chromePath) args.push("--chromium-path", this.chromePath);
    if (options.maxTabCount) args.push("--max-tab-count", String(options.maxTabCount));
    if (options.maxCrawlCount) args.push("--max-crawled-count", String(options.maxCrawlCount));
    if (options.maxRuntime) args.push("--max-run-time", String(options.maxRuntime));
    if (options.logLevel) args.push("--log-level", String(options.logLevel));
    args.push(...list);

    const records = [];
    let buffer = "";
    const onLine = (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        this._handleJsonLine(line, records);
      }
    };

    await this._executeCommand(this.crawlerPath, args, onLine);
    return { req_list: records };
  }

  _checkIsHighValue(url, isRelative) {
    if (isRelative === false) return true;
    const lower = String(url).toLowerCase();
    return HIGH_VALUE_PATHS.some((candidate) => lower.includes(candidate.toLowerCase()));
  }

  _handleJsonLine(line, records) {
    const text = String(line || "").trim();
    if (!text) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!parsed.url) return;
    parsed.projectId = this.projectId;
    parsed.isHighValue = this._checkIsHighValue(parsed.url, parsed.is_relative);
    records.push(parsed);
    // The reference reports every address it finds.
    if (this.event && !this.event.sender.isDestroyed()) {
      this.event.sender.send("sse-data-crawler", { data: parsed.url });
    }
    try {
      addCrawlerResult(parsed);
    } catch (error) {
      console.warn("[penligent] failed to store crawler result:", error.message);
    }
  }

  _executeCommand(command, args, onLine) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, args);
      let stderr = "";
      child.stdout.on("data", (chunk) => onLine(chunk.toString()));
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        if (code !== 0 && code !== 1) {
          const error = new Error(`Crawler failed with exit code ${code}`);
          error.stderr = stderr;
          reject(error);
        } else {
          resolvePromise({ code });
        }
      });
      child.on("error", reject);
    });
  }
}

ipcMain.handle("run-crawler", async (_event, projectId, targets, options) => {
  const crawlerPath = options?.crawlerPath || crawlerPathForPlatform();
  if (!binaryExists(crawlerPath)) {
    return { success: false, error: "The crawler binary is not present in this installation." };
  }
  const list = Array.isArray(targets) ? targets : [targets].filter(Boolean);
  if (!list.length) {
    return { success: false, error: "No target was supplied." };
  }
  try {
    const crawler = new Crawler({
      event: _event,
      crawlerPath,
      chromePath: options?.chromePath || chromePath(),
      projectId: projectId || 0
    });
    const result = await crawler.run(list, options || {});
    return { success: true, count: result.req_list.length, req_list: result.req_list };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
});

ipcMain.handle("crawler-info", () => {
  const crawlerPath = resourcePath("crawlergo");
  return {
    available: binaryExists(crawlerPath),
    path: crawlerPath,
    chrome: chromePath()
  };
});

ipcMain.handle("crawlergo", async (_event, options) => {
  const crawlerPath = resourcePath("crawlergo");
  if (!binaryExists(crawlerPath)) {
    return { success: false, error: "The crawler binary is not present in this installation." };
  }
  const outputDir = options?.outputDir || app.getPath("temp");
  try {
    const crawler = new Crawler({
      event: _event,
      crawlerPath,
      chromePath: options?.chromePath || chromePath(),
      projectId: options?.projectId || 0
    });
    const result = await crawler.run(options?.targets || [], options || {});
    return { success: true, count: result.req_list.length, outputDir };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
});

module.exports = { Crawler, HIGH_VALUE_PATHS };
