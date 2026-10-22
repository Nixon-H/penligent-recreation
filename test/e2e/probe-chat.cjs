#!/usr/bin/env node
/**
 * Probes the chat panel's controls on the installed application.
 *
 * Every control on the right-hand side is clicked in turn and the effect is
 * reported, so a control that does nothing is visible.
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const WebSocket = require("ws");

const PORT = 9349;
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
      if (
        targets.some((t) => t.type === "page" && !t.url.includes("splash"))
      )
        break;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
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
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
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
  // A real mouse click at the element's centre.
  const clickAt = async (selector) => {
    const box = await evaluate(
      `(() => { const e = document.querySelector('${selector}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`
    );
    if (!box) return { clicked: false, reason: "absent" };
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1
      });
    }
    return { clicked: true, box };
  };

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.result?.exceptionDetails) {
      return { error: r.result.exceptionDetails.exception?.description };
    }
    return r.result?.result?.value;
  };
  await send("Runtime.enable");

  // Wait for the chat panel to be rendered.
  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(
      `(() => Boolean(document.querySelector('.select-search-container') && document.querySelector('.input-box')))()`
    );
    if (ready) break;
    await sleep(500);
  }

  // The controls on the right-hand side.
  const controls = await evaluate(
    `(() => [...document.querySelectorAll('.home-content-right *')].filter(e => e.className && typeof e.className === 'string')
       .map(e => e.className).filter(c => /button|select|input|submit|search|mode/i.test(c))
       .filter((v, i, a) => a.indexOf(v) === i).slice(0, 40))()`
  );
  console.log("the controls on the right:");
  for (const c of controls || []) console.log("   ", c);

  // --- the web search toggle -----------------------------------------------
  const searchBefore = await evaluate(
    `(() => { const e = document.querySelector('.select-search-container'); if (!e) return 'absent'; const i = e.querySelector('svg'); return { cls: e.className, icon: i ? i.getAttribute('class') : 'none' }; })()`
  );
  await clickAt(".select-search-container");
  await sleep(900);
  const searchAfter = await evaluate(
    `(() => { const e = document.querySelector('.select-search-container'); if (!e) return 'absent'; const i = e.querySelector('svg'); return { cls: e.className, icon: i ? i.getAttribute('class') : 'none' }; })()`
  );
  const searchNotice = await evaluate(
    `(() => [...document.querySelectorAll('.notice-item')].map(n => n.innerText.replace(/\\n/g, ' / ')).join(' | '))()`
  );
  console.log(`\nthe web search container: "${searchBefore}" -> "${searchAfter}"`);
  console.log(`   the notice it raised: ${searchNotice || "(none)"}`);

  // --- the second search container (the AI settings) ------------------------
  const before = await evaluate(
    `(() => document.querySelectorAll('.select-search-container').length)()`
  );
  const errs = [];
  const onErr = (m) => {
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    }
    if (m.method === "Runtime.exceptionThrown") {
      errs.push((m.params.exceptionDetails.exception?.description || "exception").slice(0, 200));
    }
  };
  const originalOnMessage = ws.onmessage;
  ws.onmessage = (m) => {
    try {
      onErr(JSON.parse(m.data));
    } catch {
      /* not json */
    }
    originalOnMessage(m);
  };
  const box = await evaluate(
    `(() => { const list = [...document.querySelectorAll('.select-search-container')]; const e = list[list.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: e.getAttribute('title') }; })()`
  );
  console.log(`\nthe second search container: ${JSON.stringify(box)}`);
  if (box) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    }
  }
  await sleep(900);
  const dialogs = await evaluate(
    `(() => ({ open: Boolean(document.querySelector('.dialog-container')), title: (document.querySelector('.dialog-container .title')||{}).innerText || '' }))()`
  );
  console.log(`\nthe search containers: ${before}`);
  console.log(`   after clicking the second: ${JSON.stringify(dialogs)}`);
  console.log(`   the errors it raised: ${errs.length ? errs.join(' | ') : '(none)'}`);
  ws.onmessage = originalOnMessage;

  // --- the mode dropdown ---------------------------------------------------
  const modeBefore = await evaluate(
    `(() => { const e = document.querySelector('.select-mode-absolute-container'); return e ? e.children.length : 'absent'; })()`
  );
  await clickAt(".select-mode-container");
  await sleep(900);
  const modeAfter = await evaluate(
    `(() => { const e = document.querySelector('.select-mode-absolute-container'); return e ? e.children.length : 'absent'; })()`
  );
  const modeVisible = await evaluate(
    `(() => { const e = document.querySelector('.select-mode-absolute-container'); if (!e) return 'absent'; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, display: getComputedStyle(e).display, children: e.children.length }; })()`
  );
  console.log(`\nthe mode dropdown: ${JSON.stringify(modeBefore)} -> ${JSON.stringify(modeAfter)}`);
  console.log(`   the dropdown's box: ${JSON.stringify(modeVisible)}`);

  // --- the input ------------------------------------------------------------
  await clickAt(".input-box");
  await sleep(500);
  const focused = await evaluate(
    `(() => { const e = document.querySelector('.input-box'); if (!e) return 'absent'; return document.activeElement === e ? 'focused' : 'NOT focused: ' + (document.activeElement ? document.activeElement.className || document.activeElement.tagName : 'none'); })()`
  );
  console.log(`\nthe input: ${focused}`);

  // --- the send button ------------------------------------------------------
  const sendBefore = await evaluate(
    `(() => [...document.querySelectorAll('.notice-item')].length)()`
  );
  await clickAt(".submit-button-container");
  await sleep(900);
  const sendAfter = await evaluate(
    `(() => [...document.querySelectorAll('.notice-item')].map(n => n.innerText.replace(/\\n/g, ' / ')).join(' | '))()`
  );
  console.log(`\nthe send button raised: ${sendAfter || "(none)"} (${sendBefore} notices before)`);

  // --- what is on the right, and does it take clicks? -----------------------
  const hit = await evaluate(
    `(() => {
      const e = document.elementFromPoint(760, 400);
      const chain = [];
      let n = e;
      while (n && chain.length < 6) { chain.push(n.className || n.tagName); n = n.parentElement; }
      return chain;
    })()`
  );
  console.log(`\nwhat is under the pointer in the right panel: ${JSON.stringify(hit)}`);

  ws.close();
  try {
    execSync(
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
