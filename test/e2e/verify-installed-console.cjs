#!/usr/bin/env node
/**
 * Checks the installed application for console errors and for a clean exit.
 *
 * Usage: node verify-installed-console.cjs
 */
const { spawn } = require("child_process");
const http = require("http");
const WebSocket = require("ws");

const PORT = 9346;
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

(async () => {
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

  const ws = new WebSocket(page.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 268435456
  });
  await new Promise((r) => {
    ws.on("open", r);
  });

  const errors = [];
  let step = "start";
  const warnings = [];
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.method === "Runtime.consoleAPICalled") {
      const type = g.params.type;
      const text = (g.params.args || [])
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 300);
      if (type === "error") errors.push(`[${step}] ${text}`);
      if (type === "warning") warnings.push(text);
    }
    if (g.method === "Runtime.exceptionThrown") {
      const d = g.params.exceptionDetails;
      const frames = (d.stackTrace?.callFrames || [])
        .slice(0, 6)
        .map((f) => `${f.functionName || "?"}@${f.url.split("/").pop()}:${f.lineNumber}`)
        .join(" | ");
      errors.push(
        `[${step}] ${(d.exception?.description || d.text || "exception").slice(0, 200)} :: ${frames}`
      );
    }
    if (g.id && pending.has(g.id)) {
      pending.get(g.id)(g);
      pending.delete(g.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");

  // Walk the same views the comparison walks.
  const nav = async (sel, idx) => {
    await send("Runtime.evaluate", {
      expression: `(() => { const e=[...document.querySelectorAll('${sel}')][${idx}]; if(e) e.click(); })()`
    });
    await sleep(900);
  };
  const NAVS = [
    [".home-content-center .nav-container .nav-item", 0],
    [".home-content-center .nav-container .nav-item", 1],
    [".home-content-center .nav-container .nav-item", 2],
    [".home-content-center .nav-container .nav-item", 3],
    [".home-content-center .nav-container .nav-item", 4],
    [".home-content-left .nav-item", 1]
  ];
  for (const [sel, idx] of NAVS) {
    step = `nav ${sel} ${idx}`;
    await nav(sel, idx);
  }

  // The dialogs, opened the way the header opens them.
  const DIALOGS = [
    ["penligent:settings", null],
    ["penligent:toolbox", null],
    ["penligent:skills", null],
    ["penligent:agent-nav", null],
    ["penligent:credit", { mode: "not-subscribed" }],
    ["penligent:credit", { mode: "not-limit" }],
    ["penligent:risk-download", null],
    ["penligent:report-download", null],
    ["penligent:feed-back", null],
    ["penligent:notice-subscribe", null],
    ["penligent:env-path", null]
  ];
  for (const [event, detail] of DIALOGS) {
    step = `dialog ${event}`;
    await send("Runtime.evaluate", {
      expression: `(() => { window.dispatchEvent(new CustomEvent('${event}', { detail: ${JSON.stringify(detail)} })); })()`
    });
    await sleep(700);
    // The backdrop closes it again.
    await send("Runtime.evaluate", {
      expression: `(() => { const c = document.querySelector('.dialog-container .container'); if (c) c.click(); })()`
    });
    await sleep(400);
  }

  console.log(`console errors : ${errors.length}`);
  for (const e of errors.slice(0, 12)) console.log("  !", e);
  console.log(`console warnings: ${warnings.length}`);
  for (const w of warnings.slice(0, 6)) console.log("  ~", w);

  // The exit: the window has to close the application.
  const count = () =>
    require("child_process")
      .execSync(
        "ps -eo args | grep -c '[/]opt/Penligent-Recreation/penligent-recreation' || true"
      )
      .toString()
      .trim();
  const before = count();
  // The close button in the title bar, as the operator clicks it.
  await send("Runtime.evaluate", {
    expression: `(() => { const b = document.querySelector('.header-right-button.close-button'); if (b) b.click(); })()`
  });
  await sleep(3000);
  const after = count();
  console.log(`processes before the close: ${before}`);
  console.log(`processes after the close : ${after}`);

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
  process.exit(errors.length ? 1 : 0);
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
