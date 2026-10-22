#!/usr/bin/env node
/**
 * Verifies the installed application against the reference's stored shots.
 *
 * The reference's container is no longer available, so this drives the
 * *installed* build (not the dev copy) through the same seven views and
 * compares each screenshot with the reference's stored one.
 *
 * Usage: node verify-installed-views.cjs [--out <dir>]
 */
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const http = require("http");

const OUT =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  "/home/nixon/penligent-analysis/compare";
// The reference's stored screenshots. They were taken in the container the
// original was extracted into, with that container's fonts.
const REF_DIR = process.env.REF_SHOTS || "/home/nixon/penligent-analysis/compare";
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 25000);
    });
  }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.exceptionDetails) {
      return {
        error: (r.exceptionDetails.exception?.description || "").slice(0, 300)
      };
    }
    return { value: r.result?.value };
  }
  async shot(file) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }
}

/** The ImageMagick metric between two images, as a percentage of the area. */
function metric(a, b, kind) {
  try {
    const out = execFileSync(
      "compare",
      ["-metric", kind, a, b, "null:"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return out.trim();
  } catch (error) {
    return String(error.stderr || error.message).trim().split("\n")[0];
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const child = spawn(
    "/usr/bin/penligent-recreation",
    ["--no-sandbox", `--remote-debugging-port=${PORT}`],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      if (targets.some((t) => t.type === "page")) break;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  // The splash window is open while the application starts, so the main
  // window is the one that is not the splash.
  const page =
    targets?.find((t) => t.type === "page" && !t.url.includes("splash")) ||
    targets?.find((t) => t.type === "page");
  if (!page) {
    console.error("the installed application did not come up");
    process.exit(1);
  }

  const WebSocket = require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 268435456
  });
  await new Promise((r) => {
    ws.on("open", r);
  });
  const s = new Session(ws);
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.id && s.pending.has(g.id)) {
      const { resolve } = s.pending.get(g.id);
      s.pending.delete(g.id);
      g.error ? resolve({ error: g.error }) : resolve(g.result);
    }
  };
  await s.send("Page.enable");
  await s.send("Runtime.enable");

  // The reference's shots were taken at 1000x600, so the viewport is pinned
  // to the same size and the comparison is like for like.
  await s.send("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false
  });

  // A clean state, so the views render the same way the reference's did.
  await s.evaluate(
    `(() => window.dbAPI && window.dbAPI.getProjects ? window.dbAPI.getProjects()
      .then(list => Promise.all(list.map(p => window.dbAPI.deleteProject(p.id))))
      .then(() => 1) : 1)()`
  );
  await sleep(600);
  await s.send("Page.reload", { ignoreCache: true });
  // The renderer has to have painted before anything is captured, or the
  // shot catches the bundle being read as text.
  for (let i = 0; i < 40; i++) {
    const ready = await s.evaluate(
      `(() => { const app = document.getElementById('app'); return Boolean(app && app.children.length); })()`
    );
    if (ready.value) break;
    await sleep(500);
  }
  await sleep(1500);
  await s.evaluate(
    `(() => { const b=document.querySelector('svg.close-button'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); })()`
  );
  await sleep(900);

  const VIEWS = [
    { name: "shell", sel: null, idx: null },
    { name: "centre-tasklist", sel: ".home-content-center .nav-container .nav-item", idx: 0 },
    { name: "centre-target", sel: ".home-content-center .nav-container .nav-item", idx: 1 },
    { name: "centre-threatmap", sel: ".home-content-center .nav-container .nav-item", idx: 2 },
    { name: "centre-findings", sel: ".home-content-center .nav-container .nav-item", idx: 3 },
    { name: "centre-results", sel: ".home-content-center .nav-container .nav-item", idx: 4 },
    { name: "left-toolconfig", sel: ".home-content-left .nav-item", idx: 1 }
  ];

  const clickNav = async (sel, idx) => {
    await s.evaluate(
      `(() => { const e=[...document.querySelectorAll('${sel}')][${idx}]; if(e) e.click(); })()`
    );
  };

  const reset = async () => {
    await s.evaluate(
      `(()=>{const l=[...document.querySelectorAll('.home-content-left .nav-item')];if(l[0])l[0].click();})()`
    );
    await sleep(300);
    await s.evaluate(
      `(()=>{const c=[...document.querySelectorAll('.home-content-center .nav-container .nav-item')];if(c[0])c[0].click();})()`
    );
    await sleep(500);
  };

  const results = [];
  for (const view of VIEWS) {
    await reset();
    if (view.sel) {
      await clickNav(view.sel, view.idx);
      await sleep(1200);
    }
    const rec = path.join(OUT, `installed-${view.name}.png`);
    await s.shot(rec);
    const ref = path.join(REF_DIR, `fin-ref-${view.name}.png`);
    const ae = metric(ref, rec, "AE");
    const rmse = metric(ref, rec, "RMSE");
    const pct = (() => {
      const value = Number(ae);
      if (!Number.isFinite(value)) return "n/a";
      const size = execFileSync("identify", ["-format", "%wx%h", ref], {
        encoding: "utf8"
      });
      const [w, h] = size.split("x").map(Number);
      return `${((value / (w * h)) * 100).toFixed(2)}%`;
    })();
    results.push({ view: view.name, AE: ae, RMSE: rmse, pixelPct: pct });
    console.log(
      `${view.name.padEnd(20)} AE=${String(ae).padEnd(10)} pixels=${pct.padEnd(8)} RMSE=${rmse}`
    );
  }

  // The console must be clean.
  const errors = await s.evaluate(
    `(() => (window.__consoleErrors || []).length)()`
  );

  fs.writeFileSync(
    path.join(OUT, "installed-views.json"),
    JSON.stringify({ results, consoleErrors: errors.value }, null, 2)
  );
  ws.close();
  // The harness must not leave the application running.
  try {
    require("child_process")
      .execSync(
        "ps -eo pid,args | grep '[/]opt/Penligent-Recreation/penligent-recreation' | awk '{print $1}' | xargs -r kill",
        { stdio: "ignore" }
      );
  } catch {
    /* nothing to stop */
  }
  process.exit(0);
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
