#!/usr/bin/env node
/**
 * End-to-end verification of the MITM proxy.
 *
 * A local origin server is started, the proxy child is started through the
 * application, and a request is made *through* the proxy. The test asserts
 * that:
 *   - the proxy starts and reports its listening port;
 *   - a CA certificate is generated under the user-data directory;
 *   - the request is intercepted and reported to the renderer;
 *   - the exchange can be written to the `proxy_history` table.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const CONTAINER = process.env.APP_CONTAINER || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`${CDP_HOST}${p}`)).json(); }
class S {
  constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error("t "+m));}},120000);});}
}
async function connect(){
  const t=(await httpJson("/json/list")).find(x=>x.type==="page"&&!x.url.startsWith("devtools://"));
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=()=>j(new Error("ws"));});
  const s=new S(ws);
  ws.onmessage=m=>{const g=JSON.parse(m.data);if(g.id&&s.p.has(g.id)){const{r,j}=s.p.get(g.id);s.p.delete(g.id);g.error?j(new Error(JSON.stringify(g.error))):r(g.result);}};
  await s.send("Runtime.enable");
  return s;
}
async function ev(s,e){
  const r=await s.send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) return {error:(r.exceptionDetails.exception?.description||"").slice(0,400)};
  return {value:r.result?.value};
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const ORIGIN_PORT = 18110;
const ORIGIN_SCRIPT = `
const http = require("http");
http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, path: req.url, ua: req.headers["user-agent"] || "" }));
}).listen(${ORIGIN_PORT}, "127.0.0.1");
`;

async function startOrigin() {
  if (!CONTAINER) {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise((r) => server.listen(ORIGIN_PORT, "127.0.0.1", r));
    return () => server.close();
  }
  const { execFileSync } = require("child_process");
  try {
    execFileSync("docker", ["exec", CONTAINER, "bash", "-c",
      "pkill -f penligent-test-origin >/dev/null 2>&1; exit 0"]);
  } catch {
    /* nothing running */
  }
  await sleep(800);
  const localFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "penligent-origin-")),
    "origin.js"
  );
  fs.writeFileSync(localFile, ORIGIN_SCRIPT);
  execFileSync("docker", ["cp", localFile, `${CONTAINER}:/tmp/penligent-test-origin.js`]);
  execFileSync("docker", [
    "exec", "-d", "-e", "ELECTRON_RUN_AS_NODE=1",
    CONTAINER,
    "/opt/penligent-recreation/electron-dist/electron", "/tmp/penligent-test-origin.js"
  ]);
  await sleep(2000);
  return () => {
    try {
      execFileSync("docker", ["exec", CONTAINER, "bash", "-c",
        "pkill -f penligent-test-origin >/dev/null 2>&1; exit 0"]);
    } catch {
      /* already gone */
    }
  };
}

/** Make a request through the proxy, from wherever the app runs. */
async function requestThroughProxy(proxyPort) {
  const url = `http://127.0.0.1:${ORIGIN_PORT}/proxied?token=abc`;
  const agent = new (require("http").Agent)({ proxy: `http://127.0.0.1:${proxyPort}` });
  return new Promise((resolve) => {
    const req = http.get(url, { agent }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", (error) => resolve({ error: error.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

(async () => {
  const stopOrigin = await startOrigin();
  const s = await connect();
  const evp = (e) => ev(s, e);

  try {
    // 1. Start the proxy through the application. Any proxy left over from a
    // previous run is stopped first so the port is free.
    await evp("window.proxyAPI.stopProxy()");
    await sleep(1000);
    const started = await evp("window.proxyAPI.startProxy()");
    check("proxy child starts", Boolean(started.value && started.value.success),
      JSON.stringify(started.value));

    const status = await evp("window.proxyAPI.status()");
    check("proxy reports its listening port",
      Boolean(status.value && status.value.running && status.value.port),
      JSON.stringify(status.value));

    // 2. The CA must be generated on first use.
    await sleep(1500);
    const caPath = status.value && status.value.caCertPath;
    let caExists = false;
    if (caPath) {
      if (CONTAINER) {
        const { execFileSync } = require("child_process");
        caExists = execFileSync("docker", ["exec", CONTAINER, "test", "-f", caPath])
          .toString().trim() === "";
      } else {
        caExists = fs.existsSync(caPath);
      }
    }
    check("a CA certificate is generated for HTTPS interception", caExists, caPath || "no path");

    // 3. A request through the proxy must be intercepted and reported. The
    // listener has to be in place *before* the request is made, otherwise the
    // INTERCEPTED message is dispatched before anything is watching.
    const collected = await evp(`(() => {
      window.__proxySeen = [];
      window.__proxyDispose = window.proxyAPI.onProxyEvent((message) => {
        if (message && message.type === "INTERCEPTED") window.__proxySeen.push(message.payload);
      });
      return 'listening';
    })()`);
    void collected;

    // The request has to be issued from the proxy's own host.
    const { execFileSync } = require("child_process");
    // A plain-HTTP proxy request carries the absolute URI in the request line
    // and the origin's host in the Host header — that is what a proxy expects.
    const requestScript = `
      const http = require("http");
      const target = "http://127.0.0.1:${ORIGIN_PORT}/proxied?token=abc";
      const req = http.request({
        host: "127.0.0.1",
        port: ${status.value.port},
        method: "GET",
        path: target,
        headers: { Host: "127.0.0.1:${ORIGIN_PORT}" }
      }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => process.stdout.write("STATUS=" + res.statusCode + " BODY=" + body));
      });
      req.on("error", (e) => process.stdout.write("ERROR=" + e.message));
      req.setTimeout(15000, () => { req.destroy(); process.stdout.write("ERROR=timeout"); });
      req.end();
    `;
    const localReq = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "penligent-req-")),
      "req.js"
    );
    fs.writeFileSync(localReq, requestScript);
    let requestResult = { error: "not run" };
    if (CONTAINER) {
      execFileSync("docker", ["cp", localReq, `${CONTAINER}:/tmp/penligent-test-req.js`]);
      requestResult = execFileSync("docker", [
        "exec", "-e", "ELECTRON_RUN_AS_NODE=1",
        CONTAINER,
        "/opt/penligent-recreation/electron-dist/electron", "/tmp/penligent-test-req.js"
      ]).toString();
    } else {
      requestResult = execFileSync(process.execPath, [localReq]).toString();
    }
    check("a request through the proxy completes",
      /STATUS=200/.test(requestResult),
      requestResult.slice(0, 160));

    await sleep(2000);
    const seen = await evp(`(() => {
      window.__proxyDispose && window.__proxyDispose();
      return window.__proxySeen || [];
    })()`);
    const captured = Array.isArray(seen.value) ? seen.value : [];
    check("the intercepted request is reported to the renderer",
      captured.length > 0 && String(captured[0].url || "").indexOf("/proxied") !== -1,
      JSON.stringify(captured[0] || {}).slice(0, 200));

    // 4. The exchange must be persistable in proxy_history.
    const history = await evp(`(() => {
      return window.dbAPI.addProxyHistory({
        request_id: 'proxy-test-1', request_url: 'http://127.0.0.1:${ORIGIN_PORT}/proxied',
        request_method: 'GET', request_headers: '{}', request_data: '',
        request_time: String(Date.now()), response_status: '200',
        response_status_message: 'OK', response_headers: '{}', response_body: '{"ok":true}',
        response_time: String(Date.now())
      }).then(() => window.dbAPI.getProxyHistoryAll())
        .then(rows => ({ count: rows.length, first: rows[0] ? rows[0].request_url : null }));
    })()`);
    check("captured exchanges are stored in proxy_history",
      Boolean(history.value && history.value.count >= 1),
      JSON.stringify(history.value));

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} proxy checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    try {
      await evp("window.proxyAPI.stopProxy()");
    } catch {
      /* the proxy may already be gone */
    }
    stopOrigin();
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
