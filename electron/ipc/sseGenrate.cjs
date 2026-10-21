const { ipcMain } = require("electron");
const { registerSSE, stopSSE, removeSSE, hasSSE } = require("./taskManager.cjs");

/**
 * The SSE streams.
 *
 * Two shapes exist. `start-sse` runs a request and reports it on one
 * `sse-data` channel; `start-sse-genrate` is the reference's generator, which
 * reports on a channel named after the stream — `<sseId>-data`,
 * `<sseId>-end` and `<sseId>-error` — so that several streams can be told
 * apart.
 */
const streams = new Map();

/** Register a stream's abort controller with the task manager. */
function register(taskId, sseId, controller) {
  streams.set(sseId, controller);
  if (taskId) registerSSE(taskId, sseId, controller);
}

function unregister(taskId, sseId) {
  streams.delete(sseId);
  if (taskId) removeSSE(taskId, sseId);
}

/** The reference's generator. */
ipcMain.handle("start-sse-genrate", async (event, options) => {
  const { url, method = "GET", headers = {}, body = null, taskId = "" } = options || {};
  const sseId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const controller = new AbortController();
  register(taskId, sseId, controller);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      event.sender.send(`${sseId}-error`, {
        sseId,
        error: `Request failed with status ${response.status}`,
        done: true
      });
      return { success: false, sseId, error: `status ${response.status}` };
    }
    if (!response.body) {
      event.sender.send(`${sseId}-error`, { sseId, error: "Response body is null", done: true });
      return { success: false, sseId, error: "no body" };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      event.sender.send(`${sseId}-data`, { sseId, data: text, done: false });
    }
    event.sender.send(`${sseId}-end`, { sseId, done: true });
    unregister(taskId, sseId);
    return { success: true, sseId };
  } catch (error) {
    event.sender.send(`${sseId}-error`, { sseId, error: error.message, done: true });
    unregister(taskId, sseId);
    return { success: false, sseId, error: error.message };
  }
});

ipcMain.handle("stop-sse-genrate", (_event, sseId) => {
  const controller = streams.get(sseId);
  if (controller) {
    try {
      controller.abort();
    } catch {
      /* already stopped */
    }
  }
  streams.delete(sseId);
  return { success: true };
});

module.exports = { hasSSE, stopSSE, register, unregister };
