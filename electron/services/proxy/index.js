/**
 * Penligent — proxy child process entry point.
 *
 * Ported from the reference application's `services/proxy/index.js`. The
 * reference forks this file from the Electron main process and drives it over
 * the Node IPC channel; keeping the proxy in its own process means a crash or
 * a hang in the interception engine cannot take the application down.
 */
import ProxyEngine from "./interceptor.js";

const engine = new ProxyEngine();

/** The port the reference's proxy listens on. */
const PROXY_PORT = 17890;

process.on("message", (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "RELEASE") {
    engine.releaseRequest(msg.id, msg.payload || {});
    return;
  }
  if (msg.type === "DROP") {
    engine.dropRequest(msg.id);
    return;
  }
  if (msg.type === "SET_INTERCEPT_CONFIG") {
    engine.updateConfig(msg.payload || {});
    return;
  }
  if (msg.type === "REPLAY") {
    engine.replayRequest(msg.payload || {}).catch((err) => {
      process.send?.({ type: "ERROR", error: err.message });
    });
  }
});

engine.start(PROXY_PORT).catch((err) => {
  process.send?.({ type: "ERROR", error: err.message });
});

process.on("disconnect", () => {
  engine.stop().catch(() => {});
});

export { PROXY_PORT };
