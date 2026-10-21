/**
 * Penligent — server-sent events IPC handlers.
 *
 * The reference streams the agent conversation from the Penligent API using
 * SSE and forwards each event to the renderer over the "sse-data" channel.
 */
const { ipcMain } = require("electron");
const { taskManager } = require("./taskManager.cjs");

const API_BASE = () => process.env.VITE_API_BASE || "https://api.penligent.ai";

const streams = new Map();

ipcMain.handle("start-sse", async (event, options) => {
  const { sseId = `sse-${Date.now()}`, url, headers, body, taskId } = options || {};
  if (!url) return { success: false, error: "missing url" };

  const controller = new AbortController();
  taskManager.registerAbort(taskId, sseId, controller);

  const send = (payload) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send("sse-data", { sseId, ...payload });
  };

  (async () => {
    try {
      const response = await fetch(API_BASE() + url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      if (!response.body) {
        send({ type: "error", error: "no response body" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            try {
              send({ type: "message", data: JSON.parse(data) });
            } catch {
              send({ type: "message", data });
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      send({ type: "end" });
    } catch (error) {
      if (error.name !== "AbortError") {
        send({ type: "error", error: error.message });
      }
    } finally {
      streams.delete(sseId);
    }
  })();

  streams.set(sseId, controller);
  return { success: true, sseId };
});

ipcMain.handle("stop-sse", (_event, sseId) => {
  const controller = streams.get(sseId);
  if (controller) {
    controller.abort();
    streams.delete(sseId);
    return { success: true };
  }
  taskManager.stopAbort(null, sseId);
  return { success: true };
});
