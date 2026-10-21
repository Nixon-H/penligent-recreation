/**
 * Penligent — vulnerability scanner.
 *
 * Reconstructed from the reference application's `ipc/scanner/scanner.cjs`.
 *
 * The "scanner" shipped in the reference package is **xray** (v1.8.2), an
 * open-source vulnerability scanner, bundled at
 * `resources/depency/scanner/scanner_linux_amd64` with its `config.yaml`.
 * The reference drives it exactly as reproduced below:
 *
 *   <scanner> webscan --json-output <result.json> \
 *             [--plugins baseline,sqldet,xss,cmd-injection,path-traversal] \
 *             --url <target>
 *
 * The JSON output is read back, and every finding is stored in the
 * `scan_result` table.
 */
const { spawn } = require("child_process");
const { readFileSync, existsSync, unlinkSync, mkdirSync } = require("fs");
const { resolve } = require("node:path");
const { randomBytes } = require("crypto");
const { ipcMain, app } = require("electron");
const { addScanResult } = require("../../db/crawlerRepo.cjs");
const {
  resourcePath,
  binaryExists,
  scannerPath: scannerPathForPlatform
} = require("./paths.cjs");

const DEFAULT_PLUGINS = "baseline,sqldet,xss,cmd-injection,path-traversal";

class Scanner {
  constructor(options) {
    if (!options.ScannerPath) throw new Error("ScannerPath is required");
    if (!options.outputDir) throw new Error("outputDir is required");
    this.projectId = options.projectId || 0;
    // The request the scan belongs to.
    this.reqId = options.reqId || 0;
    this.ScannerPath = options.ScannerPath;
    this.outputDir = options.outputDir;
  }

  async run(target, options = {}) {
    const token = randomBytes(8).toString("hex");
    let resultFile = resolve(this.outputDir, `Scanner_result_${token}.json`);
    if (process.platform === "linux") {
      resultFile = resolve("/tmp", `Scanner_result_${token}.json`);
    }

    const args = ["webscan"];
    args.push("--json-output", resultFile);
    if (options.plugins) args.push("--plugins", options.plugins);
    args.push("--url", target);

    try {
      await this._executeCommand(this.ScannerPath, args);
      const findings = this._readAndParseResults(resultFile);
      for (const finding of findings) {
        this._storeFinding(finding);
      }
      return findings;
    } finally {
      if (existsSync(resultFile)) {
        try {
          unlinkSync(resultFile);
        } catch {
          /* best effort */
        }
      }
    }
  }

  _readAndParseResults(file) {
    if (!existsSync(file)) return [];
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return [];
    }
    const items = Array.isArray(parsed) ? parsed : parsed?.results || [];
    return items
      .filter((item) => item && item.target && item.target.url)
      .map((item) => {
        // The reference's own transformation.
        const finding = {
          targetUrl: item.target?.url || "",
          vulnerableUrl: item.detail?.addr || "",
          pluginName: item.plugin || "",
          vulnerabilityType: item.plugin || "",
          riskLevel: riskLevelFor(item.plugin),
          payload: item.detail?.payload || "",
          requestData: "",
          responseData: "",
          vulnerableParams: item.detail?.extra?.param || {}
        };
        if (item.detail?.snapshot && item.detail.snapshot.length > 0) {
          const snapshot = item.detail.snapshot[0];
          if (Array.isArray(snapshot)) {
            finding.requestData = snapshot[0] || "";
            finding.responseData = snapshot[1] || "";
          }
        }
        return finding;
      });
  }

  _storeFinding(finding) {
    try {
      addScanResult({
        projectId: this.projectId,
        reqId: this.reqId || 0,
        targetUrl: finding.targetUrl,
        vulnerableUrl: finding.vulnerableUrl,
        vulnerabilityType: finding.vulnerabilityType,
        riskLevel: finding.riskLevel,
        payload: finding.payload,
        requestData: finding.requestData,
        responseData: finding.responseData,
        vulnerableParams: finding.vulnerableParams
      });
    } catch (error) {
      console.warn("[penligent] failed to store scan result:", error.message);
    }
  }

  _executeCommand(command, args) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, { cwd: this.outputDir });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        if (code !== 0 && code !== 1) {
          const error = new Error(`Scanner failed with exit code ${code}`);
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

/**
 * The level of a finding.
 *
 * The reference has exactly three: the serious plugins are high, the
 * injection and redirection plugins are medium, and everything else is low.
 */
function riskLevelFor(plugin) {
  const name = String(plugin || "");
  const high = ["sqldet", "cmd-injection", "xxe", "ssrf"];
  const medium = ["xss", "path-traversal", "redirect", "crlf-injection"];
  if (high.some((token) => name.includes(token))) return "high";
  if (medium.some((token) => name.includes(token))) return "medium";
  return "low";
}

ipcMain.handle("run-scanner", async (_event, projectId, reqId, url, extra) => {
  const scannerPath = extra?.ScannerPath || scannerPathForPlatform();
  if (!binaryExists(scannerPath)) {
    return {
      success: false,
      error: "The scanner binary is not present in this installation."
    };
  }
  const output = outputDir || app.getPath("temp");
  try {
    mkdirSync(output, { recursive: true });
    const scanner = new Scanner({
      reqId: reqId || 0,
      ScannerPath: scannerPath,
      outputDir: output,
      projectId: projectId || 0
    });
    const findings = await scanner.run(url, {
      plugins: extra?.plugins || DEFAULT_PLUGINS
    });
    return { success: true, findings, count: findings.length };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
});

ipcMain.handle("scanner-info", () => ({
  available: binaryExists(scannerPathForPlatform()),
  path: scannerPathForPlatform(),
  plugins: DEFAULT_PLUGINS.split(",")
}));

module.exports = { Scanner, DEFAULT_PLUGINS };
