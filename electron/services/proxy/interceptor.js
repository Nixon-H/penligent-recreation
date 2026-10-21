/**
 * Penligent — MITM proxy engine.
 *
 * Ported from the reference application's `services/proxy/interceptor.js`,
 * which is a `mockttp`-based intercepting proxy. The reference runs this file
 * in a **forked child process** so that a hung or crashed proxy cannot take
 * the main process down with it.
 *
 * Behaviour reproduced exactly:
 *   - a local mockttp server with a generated CA (common name
 *     "PenLigent Proxy CA"), regenerated whenever the key or certificate is
 *     missing;
 *   - the reference's TLS passthrough list (Google and friends), so that
 *     OAuth and reCAPTCHA flows keep working while the proxy is installed;
 *   - the reference's authentication bypass host list, which are never paused
 *     for an interception decision;
 *   - every request is passed through and *snapshotted*; only requests that
 *     match the interception rules are paused, waiting for the UI to release
 *     or drop them;
 *   - request and response bodies are only read for small, text-like
 *     payloads, with a 300 ms race so that large transfers are never
 *     blocked.
 *
 * The child communicates with the main process over the Node IPC channel:
 *   child → main : INTERCEPTED, PAUSED, INTERCEPTED_RESPONSE, INFO, ERROR
 *   main → child : RELEASE, DROP, SET_INTERCEPT_CONFIG, REPLAY
 */
import mockttp from "mockttp";
import { generateCACertificate } from "mockttp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Hosts that are never paused for an interception decision, so that signing
 * in through a third-party identity provider still works behind the proxy.
 * Reproduced verbatim from the reference.
 */
const AUTH_BYPASS_HOSTS = [
  "accounts.google.com",
  "apis.google.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",
  "www.gstatic.com",
  "ssl.gstatic.com",
  "www.google.com",
  "recaptcha.net",
  "www.recaptcha.net",
  "googleusercontent.com",
  "youtube.com",
  "www.youtube.com",
  "gstatic.com"
];

class ProxyEngine {
  constructor() {
    this.server = null;
    this.pendingRequests = new Map();
    this.interceptConfig = {
      enabled: false,
      timeoutMs: 300000,
      rules: []
    };
    this.caCertPath = "";
  }

  getHostname(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  isAuthBypassHost(rawUrl) {
    const host = this.getHostname(rawUrl);
    if (!host) return false;
    return AUTH_BYPASS_HOSTS.some(
      (item) => host === item || host.endsWith(`.${item}`)
    );
  }

  /**
   * Resolve (and if necessary generate) the CA the proxy uses to sign the
   * certificates it presents for intercepted hosts.
   */
  async getHttpsOptions() {
    const currentFile = fileURLToPath(import.meta.url);
    const proxyDir = path.dirname(currentFile);
    const userDataDir = process.env.PENLIGENT_USER_DATA;
    const defaultCertDir = userDataDir
      ? path.join(userDataDir, "proxy-certs")
      : path.join(proxyDir, "certs");
    const defaultKeyPath = path.join(defaultCertDir, "ca.key");
    const defaultCertPath = path.join(defaultCertDir, "ca.crt");
    const keyPath = process.env.PROXY_CA_KEY_PATH || defaultKeyPath;
    const certPath = process.env.PROXY_CA_CERT_PATH || defaultCertPath;
    this.caCertPath = certPath;

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.mkdirSync(path.dirname(certPath), { recursive: true });
      try {
        const { key, cert } = await generateCACertificate({
          commonName: "PenLigent Proxy CA"
        });
        fs.writeFileSync(keyPath, key, "utf8");
        fs.writeFileSync(certPath, cert, "utf8");
        process.send?.({
          type: "INFO",
          payload: {
            message: "Proxy CA 已自动生成",
            keyPath,
            certPath
          }
        });
      } catch (error) {
        const message = [
          "HTTPS 代理证书自动生成失败，无法启动 HTTPS 抓包。",
          `- key: ${keyPath}`,
          `- cert: ${certPath}`,
          `- error: ${error?.message || String(error)}`
        ].join("\n");
        process.send?.({ type: "ERROR", error: message });
        throw new Error(message);
      }
    }

    return {
      keyPath,
      certPath,
      // TLS passthrough for Google and friends, so the upstream does not 502.
      tlsPassthrough: [
        { hostname: "accounts.google.com" },
        { hostname: "oauth2.googleapis.com" },
        { hostname: "*.googleapis.com" },
        { hostname: "*.googleusercontent.com" },
        { hostname: "apis.google.com" },
        { hostname: "*.google.com" },
        { hostname: "*.gstatic.com" },
        { hostname: "*.recaptcha.net" },
        { hostname: "*.youtube.com" },
        { hostname: "youtube.com" },
        { hostname: "*google*" },
        { hostname: "*bing*" },
        { hostname: "*edge*" }
      ]
    };
  }

  async start(port = 8080) {
    const httpsOptions = await this.getHttpsOptions();
    this.server = mockttp.getLocal({ https: httpsOptions });

    await this.server.start(port);

    await this.server.on("tls-client-error", (event) => {
      process.send?.({
        type: "ERROR",
        error: `TLS client error: ${event.hostname || "unknown-host"}`
      });
    });
    await this.server.on("client-error", (event) => {
      process.send?.({
        type: "ERROR",
        error: `Proxy client error: ${event.errorCode || "unknown-error"}`
      });
    });

    // Default behaviour is pass-through; only matching requests are paused
    // for an interception decision.
    await this.server.forAnyRequest().thenPassThrough({
      beforeRequest: async (req) => {
        const requestId = req.id;
        const method = String(req.method || "").toUpperCase();
        const bypassAuthHost = this.isAuthBypassHost(req.url);
        const snapshot = {
          url: req.url,
          method,
          headers: req.headers,
          // Never block the forward on a CONNECT or a large body.
          body: ""
        };

        if (method !== "CONNECT" && !bypassAuthHost) {
          try {
            snapshot.body = await Promise.race([
              req.body.getText(),
              new Promise((resolve) => setTimeout(() => resolve(""), 300))
            ]);
          } catch {
            snapshot.body = "";
          }
        }

        process.send?.({ type: "INTERCEPTED", id: requestId, payload: snapshot });

        if (bypassAuthHost) return;
        if (!this.shouldPause(snapshot)) return;

        process.send?.({ type: "PAUSED", id: requestId, payload: snapshot });

        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            resolve({});
          }, this.interceptConfig.timeoutMs);

          this.pendingRequests.set(requestId, ({ action = "release", payload = {} } = {}) => {
            clearTimeout(timer);
            this.pendingRequests.delete(requestId);
            if (action === "drop") {
              resolve({ response: "close" });
              return;
            }
            resolve({
              method: payload.method,
              url: payload.url,
              headers: payload.headers,
              body: payload.body
            });
          });
        });
      },

      beforeResponse: async (res, req) => {
        const payload = {
          requestId: req.id || null,
          requestUrl: req.url,
          requestMethod: req.method,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: ""
        };

        const bypassAuthHost = this.isAuthBypassHost(req.url);
        const contentType = String(res.headers?.["content-type"] || "").toLowerCase();
        const contentLength = Number(res.headers?.["content-length"] || 0);
        const isTextLike =
          contentType.includes("application/json") || contentType.includes("text/");
        const shouldReadBody =
          !bypassAuthHost && isTextLike && (contentLength === 0 || contentLength <= 200000);

        if (shouldReadBody) {
          try {
            payload.body = await Promise.race([
              res.body.getText(),
              new Promise((resolve) => setTimeout(() => resolve(""), 300))
            ]);
          } catch {
            payload.body = "";
          }
        }

        process.send?.({
          type: "INTERCEPTED_RESPONSE",
          id: req.id,
          payload
        });
      }
    });
  }

  /** Decide whether a request should be paused for an interception decision. */
  shouldPause(snapshot) {
    if (snapshot.method === "CONNECT") return false;
    if (!this.interceptConfig.enabled) return false;

    const { rules } = this.interceptConfig;
    // With no rules every request is held.
    if (!Array.isArray(rules) || rules.length === 0) return true;

    return rules.some((rule) => {
      if (rule.method && String(rule.method).toUpperCase() !== snapshot.method) {
        return false;
      }
      if (rule.urlIncludes && !snapshot.url.includes(String(rule.urlIncludes))) {
        return false;
      }
      return true;
    });
  }

  resolveRequest(id, modifiedData = {}) {
    const resolver = this.pendingRequests.get(id);
    if (resolver) resolver({ action: "release", payload: modifiedData });
  }

  releaseRequest(id, modifiedData = {}) {
    this.resolveRequest(id, modifiedData);
  }

  dropRequest(id) {
    const resolver = this.pendingRequests.get(id);
    if (resolver) resolver({ action: "drop" });
  }

  updateConfig(config = {}) {
    this.interceptConfig = {
      ...this.interceptConfig,
      ...config,
      rules: Array.isArray(config.rules) ? config.rules : this.interceptConfig.rules
    };
  }

  /** Replay is not implemented in the reference either. */
  async replayRequest() {
    throw new Error("Replay 尚未实现");
  }

  async stop() {
    if (!this.server) return;
    for (const [id, resolver] of this.pendingRequests.entries()) {
      resolver({ action: "release", payload: {} });
      this.pendingRequests.delete(id);
    }
    await this.server.stop();
  }
}

export { AUTH_BYPASS_HOSTS };
export default ProxyEngine;
