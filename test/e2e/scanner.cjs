#!/usr/bin/env node
/**
 * Verifies the bundled scanner and crawler are wired correctly.
 *
 * The scanner and the crawler both run on the application host, so the target
 * has to be reachable from there as well. When the application runs in a
 * container the target is started inside that container too.
 *
 * The target deliberately returns a 500 with a database error, which is the
 * "sensitive/server-error" signature that xray's baseline plugin reports, so
 * the run produces a real finding that must reach the `scan_result` table.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const CONTAINER = process.env.APP_CONTAINER || "";
const TARGET_PORT = 18100;
const TARGET = `http://127.0.0.1:${TARGET_PORT}/index.php?id=1`;
const TARGET_MARKER = "penligent-test-target";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`${CDP_HOST}${p}`)).json(); }

class S {
  constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error("t "+m));}},300000);});}
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

const TARGET_SCRIPT = `
const http = require("http");
http.createServer((req, res) => {
  if (req.url.indexOf("id=") > -1) {
    res.writeHead(500, { "content-type": "text/html" });
    res.end("<html>You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version near '' at line 1</html>");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<html><body>hello " + req.url + "</body></html>");
}).listen(${TARGET_PORT}, "127.0.0.1");
`;

async function startTarget() {
  if (!CONTAINER) {
    const server = http.createServer((req, res) => {
      if (req.url.indexOf("id=") > -1) {
        res.writeHead(500, { "content-type": "text/html" });
        res.end("<html>You have an error in your SQL syntax near '' at line 1</html>");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><body>hello ${req.url}</body></html>`);
    });
    await new Promise((r) => server.listen(TARGET_PORT, "127.0.0.1", r));
    return () => server.close();
  }

  // Stop a previous run's target so the port is free.
  try {
    execFileSync("docker", ["exec", CONTAINER, "bash", "-c",
      `pkill -f ${TARGET_MARKER} >/dev/null 2>&1; exit 0`]);
  } catch {
    /* nothing was running */
  }
  await sleep(1000);

  const localFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "penligent-target-")),
    "target.js"
  );
  fs.writeFileSync(localFile, TARGET_SCRIPT);
  const remoteFile = `/tmp/${TARGET_MARKER}.js`;
  execFileSync("docker", ["cp", localFile, `${CONTAINER}:${remoteFile}`]);
  execFileSync("docker", [
    "exec", "-d", "-e", "ELECTRON_RUN_AS_NODE=1",
    CONTAINER,
    "/opt/penligent-recreation/electron-dist/electron", remoteFile
  ]);
  await sleep(2500);
  return () => {
    try {
      execFileSync("docker", ["exec", CONTAINER, "bash", "-c",
        `pkill -f ${TARGET_MARKER} >/dev/null 2>&1; exit 0`]);
    } catch {
      /* already gone */
    }
  };
}

(async () => {
  const stopTarget = await startTarget();
  const s = await connect();
  const evp = (e) => ev(s, e);

  try {
    const info = await evp("window.scannerAPI.info()");
    check("scanner binary is bundled and detected",
      Boolean(info.value && info.value.available),
      JSON.stringify(info.value));

    const crawlerInfo = await evp("window.crawlerAPI.info()");
    check("crawler binary is bundled and detected",
      Boolean(crawlerInfo.value && crawlerInfo.value.available),
      JSON.stringify(crawlerInfo.value));

    const project = await evp(`(() => {
      return window.dbAPI.addProjects({ project_name: 'scan-probe', project_description: 'probe', task_tree: '[]' })
        .then(() => window.dbAPI.getProjects())
        .then(list => { const p = list.find(x => x.project_name === 'scan-probe'); return p ? p.id : null; });
    })()`);
    check("probe project created", project.value !== null, String(project.value));

    const scan = await evp(`(() => window.scannerAPI.runScanner(${project.value}, ${JSON.stringify(TARGET)}, '', {}))()`);
    check("scanner runs against a live target",
      Boolean(scan.value && scan.value.success),
      scan.error ? String(scan.value && scan.value.error).slice(0, 300) : `findings=${scan.value && scan.value.count}`);

    const stored = await evp(`(() => window.dbAPI.getRiskScanByProjectId(${project.value})
      .then(rows => ({ count: rows.length, first: rows[0] ? rows[0].vulnerability_type : null })))()`);
    check("scanner findings are stored in scan_result",
      Boolean(stored.value && stored.value.count >= 1),
      JSON.stringify(stored.value));

    const crawl = await evp(`(() => window.crawlerAPI.runCrawler(${project.value}, [${JSON.stringify(TARGET)}], { maxRuntime: 25, maxCrawlCount: 5, logLevel: 'error' }))()`);
    check("crawler runs against a live target",
      Boolean(crawl.value && crawl.value.success),
      crawl.error ? String(crawl.value && crawl.value.error).slice(0, 300) : `requests=${crawl.value && crawl.value.count}`);

    await evp(`(() => window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name === 'scan-probe');
      return p ? window.dbAPI.deleteProject(p.id) : null;
    }))()`);

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} scanner/crawler checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    stopTarget();
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
