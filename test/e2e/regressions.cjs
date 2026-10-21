#!/usr/bin/env node
/**
 * Regression tests for bugs found by the audit.
 *
 * Each check corresponds to a defect that was present and has been fixed:
 *   B1  saving the AI settings without retyping the key erased the stored key
 *   B2  "Test connection" sent `apiKey: undefined`, shadowing the stored key
 *   B3  the user's message was sent twice in every request
 *   B4  command output was sent over IPC as a Buffer instead of text
 *   B5  a provider answering with plain JSON instead of SSE produced no reply
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const PROVIDER_HOST = process.env.PROVIDER_HOST || "127.0.0.1";
/* Where the *test* can reach the mock server. It may differ from the address
   the application uses (for example when the mock runs in a container). */
const MOCK_QUERY_HOST = process.env.MOCK_QUERY_HOST || PROVIDER_HOST;
const OPENAI_PORT = 18080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`${CDP_HOST}${p}`)).json(); }
class S {
  constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error("t "+m));}},40000);});}
}
async function connect(){
  const t=(await httpJson("/json/list")).find(x=>x.type==="page"&&!x.url.startsWith("devtools://"));
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=()=>j(new Error("ws"));});
  const s=new S(ws);
  ws.onmessage=m=>{const g=JSON.parse(m.data);if(g.id&&s.p.has(g.id)){const{r,j}=s.p.get(g.id);s.p.delete(g.id);g.error?j(new Error(JSON.stringify(g.error))):r(g.result);}};
  await s.send("Page.enable");await s.send("Runtime.enable");return s;
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

async function lastRequest(port) {
  const res = await fetch(`http://${MOCK_QUERY_HOST}:${port}/__last`);
  return res.json();
}

(async () => {
  const external = Boolean(process.env.PROVIDER_HOST);
  const server = external
    ? null
    : spawn(process.execPath, [path.join(__dirname, "mock-provider.cjs")], {
        stdio: ["ignore", "pipe", "pipe"]
      });
  if (server) server.stdout.on("data", (d) => process.stdout.write(`  [mock] ${d}`));
  await sleep(external ? 500 : 1200);

  const s = await connect();
  const evp = (e) => ev(s, e);

  try {
    // B1 — saving without retyping the key must keep the stored key.
    await evp(`(() => window.aiAPI.setConfig({
      provider: 'openai', baseUrl: 'http://${PROVIDER_HOST}:${OPENAI_PORT}/v1',
      apiKey: 'sk-keep-me', model: 'mock-gpt'
    }).then(() => 1))()`);

    const saved = await evp(`(() => window.aiAPI.setConfig({
      provider: 'openai', baseUrl: 'http://${PROVIDER_HOST}:${OPENAI_PORT}/v1', model: 'mock-gpt'
    }).then(c => ({ hasKey: c.hasApiKey })))()`);
    check("B1: saving without a new key keeps the stored key",
      Boolean(saved.value && saved.value.hasKey),
      JSON.stringify(saved.value));

    // The key must still authenticate — prove it by reading it back through a
    // real request rather than trusting the flag.
    const probe = await evp(`(() => window.aiAPI.test().then(r => ({ ok: r.success, content: r.content })))()`);
    check("B1: the retained key still authenticates",
      Boolean(probe.value && probe.value.ok),
      JSON.stringify(probe.value));

    // B2 — an explicit undefined override must not shadow the stored key.
    const probe2 = await evp(`(() => window.aiAPI.test({ apiKey: undefined, model: 'mock-gpt' })
      .then(r => ({ ok: r.success, content: r.content })))()`);
    check("B2: an undefined override does not shadow the stored key",
      Boolean(probe2.value && probe2.value.ok),
      JSON.stringify(probe2.value));

    const sent = await lastRequest(OPENAI_PORT);
    check("B2: the request carried the stored key",
      Boolean(sent && sent.headers && /sk-keep-me/.test(String(sent.headers.authorization || sent.headers.Authorization || ""))),
      sent ? String(sent.headers.authorization || sent.headers.Authorization || "no auth header") : "no request recorded");

    // B3 — the user's message must appear exactly once in the request.
    const project = await evp(`(() => {
      return window.dbAPI.addProjects({ project_name: 'audit-probe', project_description: 'audit', task_tree: '[]' })
        .then(() => window.dbAPI.getProjects())
        .then(list => { const p = list.find(x => x.project_name === 'audit-probe'); return p ? p.id : null; });
    })()`);
    check("audit project created", project.value !== null, String(project.value));

    const dup = await evp(`(() => {
      const id = ${JSON.stringify(project.value)};
      return window.dbAPI.addChatRecords({ project_id: id, chat_type: 'user', chat_content: 'unique-marker-42' })
        .then(() => window.dbAPI.getChatRecords(id))
        .then(records => window.aiAPI.complete({
          messages: records.map(r => ({ role: r.chat_type === 'assistant' ? 'assistant' : 'user', content: r.chat_content }))
        }))
        .then(() => 'sent');
    })()`);
    void dup;
    const last = await lastRequest(OPENAI_PORT);
    const userMessages = (last?.body?.messages || []).filter((m) => m.content === "unique-marker-42");
    check("B3: the request contains the user message exactly once",
      userMessages.length === 1,
      `count=${userMessages.length}`);

    // B4 — command output must arrive as text.
    const cmd = await evp(`(() => new Promise((resolve) => {
      const id = 'audit-cmd';
      const dispose = window.commandAPI.onCommandData((payload) => {
        if (payload.commandId !== id) return;
        if (payload.type === 'data') {
          dispose();
          resolve({ typeofChunk: typeof payload.chunk, isBuffer: !!(payload.chunk && payload.chunk.type === 'Buffer'),
                     sample: String(payload.chunk).slice(0, 40) });
        }
      });
      window.commandAPI.executeCommand({ command: 'echo audit-output', commandId: id })
        .then(() => {});
      setTimeout(() => resolve({ timedOut: true }), 10000);
    }))()`);
    check("B4: command output arrives as a string",
      Boolean(cmd.value && cmd.value.typeofChunk === "string" && cmd.value.isBuffer === false),
      JSON.stringify(cmd.value));

    // B6 — the endpoint must be normalised for every base-URL shape.
    const endpoints = await evp(`(() => {
      const cases = [
        ['openai', 'https://api.openai.com', 'https://api.openai.com/v1/chat/completions'],
        ['openai', 'https://api.openai.com/v1', 'https://api.openai.com/v1/chat/completions'],
        ['openai', 'http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
        ['openai', 'https://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1/chat/completions'],
        ['anthropic', 'https://api.anthropic.com', 'https://api.anthropic.com/v1/messages'],
        ['anthropic', 'https://api.anthropic.com/v1', 'https://api.anthropic.com/v1/messages'],
        ['anthropic', 'https://api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages']
      ];
      return Promise.all(cases.map(async ([provider, baseUrl, expected]) => {
        const c = await window.aiAPI.setConfig({ provider, baseUrl, model: 'mock-gpt' });
        return { provider, baseUrl, expected, got: c.endpoint, ok: c.endpoint === expected };
      }));
    })()`);
    const endpointResults = Array.isArray(endpoints.value) ? endpoints.value : [];
    check("B6: every base-URL shape resolves to the right endpoint",
      endpointResults.length === 7 && endpointResults.every((r) => r.ok),
      JSON.stringify(endpointResults.filter((r) => !r.ok)));

    // B5 — a provider that ignores `stream` must still produce a reply.
    await evp(`(() => window.aiAPI.setConfig({
      provider: 'openai', baseUrl: 'http://${PROVIDER_HOST}:${OPENAI_PORT}/v1',
      apiKey: 'sk-keep-me', model: 'mock-nostream'
    }).then(() => 1))()`);

    const noStream = await evp(`(() => new Promise((resolve) => {
      let text = '';
      const id = 'audit-nostream';
      const dispose = window.aiAPI.onStreamData((payload) => {
        if (payload.id !== id) return;
        if (payload.type === 'delta') text += payload.delta;
        if (payload.type === 'end') { dispose(); resolve({ text }); }
        if (payload.type === 'error') { dispose(); resolve({ error: payload.error }); }
      });
      window.aiAPI.stream({ id, messages: [{ role: 'user', content: 'plain json please' }] })
        .then(r => { if (!r.success) { dispose(); resolve({ error: r.error }); } });
      setTimeout(() => resolve({ text, timedOut: true }), 15000);
    }))()`);
    check("B5: a non-SSE provider response still yields a reply",
      Boolean(noStream.value && /MOCK-OPENAI/.test(noStream.value.text || "")),
      JSON.stringify(noStream.value));

    // Clean up.
    await evp(`(() => window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name === 'audit-probe');
      return p ? window.dbAPI.deleteProject(p.id) : null;
    }))()`);

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} regression checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    if (server) server.kill();
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
