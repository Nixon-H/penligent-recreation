#!/usr/bin/env node
/**
 * Clicks every control in every view of the installed application and
 * reports the ones that do nothing or that raise an error.
 *
 * A disposable profile is used, so nothing the sweep destroys matters.
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 9350;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "penligent-sweep-"));
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
    [
      "--no-sandbox",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`
    ],
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
  const errors = [];
  let current = "";
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.method === "Runtime.consoleAPICalled" && g.params.type === "error") {
      errors.push({
        where: current,
        text: (g.params.args || [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" ")
          .slice(0, 220)
      });
    }
    if (g.method === "Runtime.exceptionThrown") {
      errors.push({
        where: current,
        text: (
          g.params.exceptionDetails.exception?.description ||
          g.params.exceptionDetails.text ||
          "exception"
        ).slice(0, 220)
      });
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

  const click = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1
      });
    }
  };

  // Seed an environment and a project, so the views have content to walk.
  current = "seeding";
  const seeded = await evaluate(
    `(async () => {
       await window.dbAPI.setUserSetting('ai_python', '/usr/bin/python3', 'string', 'AI python path');
       await window.dbAPI.setUserSetting('ai_script', '/tmp', 'string', 'AI script path');
       const projects = await window.dbAPI.getProjects();
       if (!projects.length) {
         await window.dbAPI.addProjects({
           project_name: 'Sweep Project',
           project_description: 'A project for the control sweep',
           project_target: 'example.com',
           task_mode: 'Agent',
           testlist_type: 'GENERIC'
         });
       }
       const list = await window.dbAPI.getProjects();
       const id = list[0] && list[0].id;
       if (!id) return [];

       // A test list, a run, a finding, a tool set, credentials and headers,
       // so every view has something to render.
       await window.dbAPI.addTestList({
         project_id: id,
         test_type: 'GENERIC',
         test_list: JSON.stringify([
           { id: 'p1', phase_name: 'Reconnaissance', tasks: [
             { id: 1, item: 'Subdomain enumeration', description: 'Find the subdomains', target: 'example.com', is_complete: false }
           ]},
           { id: 'p2', phase_name: 'Exploitation', tasks: [
             { id: 2, item: 'SQL injection', description: 'Test the parameters', target: 'example.com', is_complete: true }
           ]}
         ]),
         focus_data: JSON.stringify({ id: 1, item: 'Subdomain enumeration' }),
         focus_description: 'Find the subdomains'
       });
       await window.dbAPI.addExecutionResult({
         project_id: id,
         tool_name: 'nmap',
         command: 'nmap -sV example.com',
         parameters: JSON.stringify({ tool_command: 'nmap -sV example.com', explanation: 'A port scan' }),
         result_data: '22/tcp open  ssh',
         status: 'success',
         start_time: Math.floor(Date.now() / 1000) - 60,
         end_time: Math.floor(Date.now() / 1000),
         duration: 60,
         summary: 'The port scan found ssh open'
       });
       await window.dbAPI.addRiskItem({
         project_id: id,
         execution_id: 1,
         risk_type: 'vulnerability',
         severity: 'high',
         title: 'Weak SSH configuration',
         description: 'The server allows password authentication.',
         affected_target: 'example.com:22',
         evidence: JSON.stringify([{ title: 'banner', description: 'SSH-2.0-OpenSSH', evidence: 'banner' }]),
         recommendation: 'Disable password authentication.',
         status: 'open'
       });
       await window.dbAPI.addSets({
         tool_type: 'command',
         set_name: 'nmap',
         command_path: '/usr/bin/nmap',
         command_command: 'nmap -sV {target}',
         api_config: '',
         format_str: ''
       });
       await window.dbAPI.addProjectAuthParameters({
         project_id: id, auth_name: 'admin', auth_username: 'admin', auth_password: 'secret', auth_description: 'The admin account'
       });
       await window.dbAPI.addProjectHeaderParameters({
         project_id: id, header_name: 'X-Api-Key', header_value: 'abc123', header_description: 'The API key'
       });
       await window.dbAPI.addTtp({
         title: 'Subdomain takeover', ttp_type: 'recon', ttp_level: 'high', ttp_priority: 5,
         overview: 'Taking over a subdomain', detection_method: 'Look for a dangling CNAME',
         waf_bypass: '', verification: '', false_positive: '', priority: '', notes: ''
       });
       await window.dbAPI.addChatRecords({
         project_id: id, chat_type: 'user', chat_content: 'Hello', chat_metadata: '{}'
       });
       return list.map(p => p.id);
     })()`
  );
  console.log(`seeded the project ids: ${JSON.stringify(seeded)}`);

  // What the database actually holds.
  const dump = await evaluate(
    `(async () => {
       const projects = await window.dbAPI.getProjects();
       const lists = await window.dbAPI.getAllTestLists();
       const sets = await window.dbAPI.getSets();
       return {
         projects: projects.map(p => ({ id: p.id, name: p.project_name })),
         lists: lists.map(l => ({ id: l.id, project_id: l.project_id, type: l.test_type, list: String(l.test_list).slice(0, 60) })),
         sets: sets.map(s => ({ id: s.id, name: s.set_name }))
       };
     })()`
  );
  console.log("the database holds:", JSON.stringify(dump, null, 1).slice(0, 900));

  // Reload, so the application selects the project it just found and every
  // view has its data.
  await send("Page.reload", { ignoreCache: true });
  await sleep(3500);
  for (let i = 0; i < 20; i++) {
    const ready = await evaluate(
      `(() => Boolean(document.querySelector('.home-content-center .nav-container')))()`
    );
    if (ready) break;
    await sleep(500);
  }
  await sleep(1000);

  // The views to walk: the five centre views and the two left views.
  // Each view, and the text it must show once the data is loaded.
  const VIEWS = [
    ["centre-tasklist", ".home-content-center .nav-container .nav-item", 0, "Subdomain enumeration"],
    ["centre-target", ".home-content-center .nav-container .nav-item", 1, "example.com"],
    ["centre-threatmap", ".home-content-center .nav-container .nav-item", 2, null],
    ["centre-findings", ".home-content-center .nav-container .nav-item", 3, "Weak SSH configuration"],
    ["centre-results", ".home-content-center .nav-container .nav-item", 4, "nmap"],
    ["left-projects", ".home-content-left .nav-item", 0, "Sweep Project"],
    ["left-toolconfig", ".home-content-left .nav-item", 1, "nmap"]
  ];

  // The state of the application after the reload.
  const state = await evaluate(
    `(() => ({
       left: (document.querySelector('.home-content-left .content-container')||{}).innerText || '',
       centre: (document.querySelector('.home-content-center .content-container')||{}).innerText || ''
     }))()`
  );
  console.log("after the reload the left panel shows:", JSON.stringify(String(state.left).slice(0, 220)));
  console.log("after the reload the centre shows  :", JSON.stringify(String(state.centre).slice(0, 220)));

  let clicked = 0;
  const empty = [];
  for (const [name, sel, idx, expect] of VIEWS) {
    current = name;
    await evaluate(
      `(() => { const e=[...document.querySelectorAll('${sel}')][${idx}]; if(e) e.click(); })()`
    );
    await sleep(1200);

    if (expect) {
      const panel = name.startsWith("left")
        ? ".home-content-left .content-container"
        : ".home-content-center .content-container";
      const text = await evaluate(
        `(() => { const c = document.querySelector('${panel}'); return c ? c.innerText : ''; })()`
      );
      if (!String(text || "").includes(expect)) {
        empty.push(`${name}: "${expect}" is not on the screen`);
        console.log(`   --- ${name} shows ---`);
        console.log(String(text || "(nothing)").split("\n").map((l) => "   | " + l).join("\n").slice(0, 900));
      }
    }

    // Every control in the view.
    const controls = await evaluate(
      `(() => {
        const root = document.querySelector('.${name.startsWith("left") ? "home-content-left" : "home-content-center"} .content-container');
        if (!root) return [];
        const out = [];
        for (const e of root.querySelectorAll('button, [role="button"], .icon-button, .tool-item-delete-button, .copy-button, .add-button, .header-button')) {
          const r = e.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, text: (e.innerText || e.title || e.className).trim().slice(0, 40) });
        }
        return out;
      })()`
    );
    for (const c of controls || []) {
      const before = errors.length;
      await click(c.x, c.y);
      await sleep(350);
      clicked += 1;
      if (errors.length > before) {
        console.log(`  ! ${name} :: "${c.text}" raised an error`);
      }
      // Any dialog that opened is closed again.
      await evaluate(
        `(() => { const c = document.querySelector('.dialog-container .container'); if (c) c.click(); })()`
      );
      await sleep(200);
    }
    console.log(`${name}: ${(controls || []).length} controls clicked`);
  }

  // The header's controls.
  current = "header";
  const headerControls = await evaluate(
    `(() => {
      const out = [];
      for (const e of document.querySelectorAll('.header-left .header-left-botton-item, .header-right-button, .login-button')) {
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, text: (e.innerText || e.title || e.className).trim().slice(0, 40) });
      }
      return out;
    })()`
  );
  for (const c of headerControls || []) {
    const before = errors.length;
    await click(c.x, c.y);
    await sleep(500);
    clicked += 1;
    if (errors.length > before) {
      console.log(`  ! header :: "${c.text}" raised an error`);
    }
    await evaluate(
      `(() => { const c = document.querySelector('.dialog-container .container'); if (c) c.click(); })()`
    );
    await sleep(250);
  }
  console.log(`header: ${(headerControls || []).length} controls clicked`);

  console.log(`\n${clicked} controls clicked in total`);
  console.log(`views that do not show their data: ${empty.length}`);
  for (const e of empty) console.log(`  ! ${e}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ! [${e.where}] ${e.text}`);

  ws.close();
  try {
    execSync(
      "ps -eo pid,args | grep '[/]opt/Penligent-Recreation/penligent-recreation' | awk '{print $1}' | xargs -r kill",
      { stdio: "ignore" }
    );
  } catch {
    /* nothing to stop */
  }
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* the profile is on a temporary mount; it will go on its own */
  }
  process.exit(errors.length ? 1 : 0);
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
