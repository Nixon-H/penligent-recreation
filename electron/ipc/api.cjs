/**
 * Penligent — HTTP / proxy IPC handlers.
 *
 * Reconstructed from the reference application's `ipc/api.cjs`. The reference
 * performs requests with axios against `process.env.VITE_API_BASE` and
 * returns a normalised envelope: { success, status, data } on success and
 * { success:false, status, data } on failure, with { canceled:true } when the
 * request was aborted through the task manager.
 *
 * The 20 agent API paths recovered from the renderer bundle are:
 *   /api/agent/main/v1/messages, /api/agent/next/v1/messages,
 *   /api/agent/context-summary/v1/messages,
 *   /api/agent/generate-task-tree/v1/messages,
 *   /api/agent/generate-task-focus-description/v1/messages,
 *   /api/agent/tool-summary/v1/messages,
 *   /api/agent/ttp-generate/v1/messages, /api/agent/ttp-select/v1/messages,
 *   /api/agent/verify-vul/v1/messages,
 *   /api/agent/verify-vul-history-compress/v1/messages,
 *   /api/agent/report-export/v1/messages,
 *   /api/agent/skill-detection-tool/v1/messages,
 *   /api/agent/webshell-detection-tool/v1/messages,
 *   /api/agent/http-request-to-python-code-tool/v1/messages,
 *   /api/agent/packet-capture-analysis-tool/v1/messages,
 *   /api/agent/fofa-query/v1/messages,
 *   /api/agent/abnormal-process-analysis-tool/v1/messages,
 *   /api/agent/target-info-update/v1/messages,
 *   /api/agent/force-tool-execution/v1/messages
 * plus the account endpoints /api/user/info, /api/user/profile,
 * /api/generate-token, /api/model/open, /api/token/, /api/version/active and
 * the telemetry endpoints under /api/applog/.
 */
const { ipcMain } = require("electron");
const zlib = require("node:zlib");
const { taskManager } = require("./taskManager.cjs");

const API_BASE = () => process.env.VITE_API_BASE || "https://api.penligent.ai";

ipcMain.handle("http-request", async (_event, options) => {
  const {
    taskId,
    sseId,
    url,
    method = "GET",
    data,
    params,
    headers
  } = options || {};

  const controller = new AbortController();
  taskManager.registerAbort(taskId, sseId, controller);

  try {
    const target = new URL(API_BASE() + (url || ""));
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) target.searchParams.set(key, value);
      }
    }

    const response = await fetch(target, {
      method,
      headers: headers || {},
      body: data === undefined || data === null ? undefined : JSON.stringify(data),
      signal: controller.signal
    });

    const text = await response.text();
    let payload = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* keep the raw text when the body is not JSON */
    }

    return { success: response.ok, status: response.status, data: payload };
  } catch (error) {
    if (error.name === "AbortError") return { canceled: true };
    return {
      success: false,
      status: error.status ?? 0,
      data: error.response?.data ?? error.message
    };
  }
});

ipcMain.handle("stop-request", (_event, { taskId, sseId } = {}) => {
  taskManager.stopAbort(taskId, sseId);
  return { success: true };
});

function decodeResponse(res) {
  const encoding = String(res.headers?.["content-encoding"] || "").toLowerCase();
  const contentType = String(res.headers?.["content-type"] || "").toLowerCase();

  let buffer = Buffer.from(res.data || []);
  if (encoding === "gzip") buffer = zlib.gunzipSync(buffer);
  else if (encoding === "deflate") buffer = zlib.inflateSync(buffer);
  else if (encoding === "br") buffer = zlib.brotliDecompressSync(buffer);

  const text = buffer.toString("utf8");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

ipcMain.handle("proxy-request", async (_event, options) => {
  const { url, method = "GET", data, params } = options || {};
  const headers = { ...(options.headers || {}) };

  const target = new URL(url);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(target, {
      method,
      headers,
      body: data === undefined || data === null ? undefined : JSON.stringify(data),
      signal: controller.signal
    });
    const body = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: decodeResponse({ headers: Object.fromEntries(response.headers.entries()), data: body })
    };
  } catch (error) {
    return {
      statusCode: 0,
      statusMessage: error.name === "AbortError" ? "Timeout" : error.message,
      headers: {},
      body: null
    };
  } finally {
    clearTimeout(timer);
  }
});
