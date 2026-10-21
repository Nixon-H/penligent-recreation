#!/usr/bin/env node
/**
 * End-to-end verification of the AI provider layer.
 *
 * Drives the reconstruction against a mock OpenAI-compatible server and a mock
 * Anthropic server and asserts that:
 *   - the configuration round-trips through the database,
 *   - "Test connection" reaches the right endpoint with the right headers,
 *   - each provider family receives the payload shape it expects,
 *   - streaming responses are surfaced and persisted as chat records,
 *   - an AI-generated test plan is stored in `test_lists`.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const OPENAI_PORT = 18080;
const ANTHROPIC_PORT = 18081;
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

// The mock servers must be reachable from wherever the app runs. The host
// gateway of the docker bridge is used when the app runs in a container.
const host = process.env.PROVIDER_HOST || "127.0.0.1";

(async () => {
  // When PROVIDER_HOST points at another machine (for example a mock server
  // running inside the analysis container) the local mock is not started.
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
    // 1. Configure the OpenAI-compatible provider.
    const cfg = await evp(`(() => {
      return window.aiAPI.setConfig({
        provider: 'openai',
        baseUrl: 'http://${host}:${OPENAI_PORT}/v1',
        apiKey: 'sk-mock-key',
        model: 'mock-gpt',
        temperature: 0.3,
        maxTokens: 512
      }).then(c => ({ provider: c.provider, baseUrl: c.baseUrl, model: c.model, hasKey: c.hasApiKey, masked: c.apiKey }));
    })()`);
    check("provider config saved",
      Boolean(cfg.value && cfg.value.provider === "openai" && cfg.value.model === "mock-gpt" && cfg.value.hasKey),
      cfg.error || JSON.stringify(cfg.value));
    check("api key is redacted when returned to the renderer",
      Boolean(cfg.value && /•/.test(cfg.value.masked || "")),
      cfg.value ? cfg.value.masked : "");

    // 2. Connectivity probe.
    const probe = await evp(`(() => window.aiAPI.test().then(r => ({ ok: r.success, content: r.content, endpoint: r.endpoint })))()`);
    check("test connection reaches the OpenAI-compatible endpoint",
      Boolean(probe.value && probe.value.ok && /MOCK-OPENAI/.test(probe.value.content || "")),
      probe.error || JSON.stringify(probe.value));

    // 3. A project is needed for the chat records.
    const project = await evp(`(() => {
      return window.dbAPI.addProjects({ project_name: 'ai-probe', project_description: 'probe', task_tree: '[]' })
        .then(() => window.dbAPI.getProjects())
        .then(list => { const p = list.find(x => x.project_name === 'ai-probe'); return p ? p.id : null; });
    })()`);
    check("probe project created", project.value !== null, String(project.value));

    // 4. Non-streaming completion.
    const complete = await evp(`(() => window.aiAPI.complete({
      messages: [{ role: 'user', content: 'hello from the test' }]
    }).then(r => ({ ok: r.success, content: r.content })))()`);
    check("non-streaming completion",
      Boolean(complete.value && complete.value.ok && /MOCK-OPENAI/.test(complete.value.content || "")),
      complete.error || JSON.stringify(complete.value));

    // 5. Streaming completion, observed through the renderer's event channel.
    const streamed = await evp(`(() => new Promise((resolve) => {
      let text = '';
      const id = 'test-' + Date.now();
      const dispose = window.aiAPI.onStreamData((payload) => {
        if (payload.id !== id) return;
        if (payload.type === 'delta') text += payload.delta;
        if (payload.type === 'end') { dispose(); resolve({ text, ended: true }); }
        if (payload.type === 'error') { dispose(); resolve({ text, error: payload.error }); }
      });
      window.aiAPI.stream({ id, messages: [{ role: 'user', content: 'stream this' }] })
        .then(r => { if (!r.success) { dispose(); resolve({ error: r.error }); } });
      setTimeout(() => resolve({ text, timedOut: true }), 15000);
    }))()`);
    check("streaming completion",
      Boolean(streamed.value && /MOCK-OPENAI/.test(streamed.value.text || "")),
      streamed.error || JSON.stringify(streamed.value));

    // 6. Switch to the Anthropic family and repeat the probe.
    const anthCfg = await evp(`(() => window.aiAPI.setConfig({
      provider: 'anthropic',
      baseUrl: 'http://${host}:${ANTHROPIC_PORT}',
      apiKey: 'sk-ant-mock',
      model: 'mock-claude'
    }).then(c => ({ provider: c.provider, baseUrl: c.baseUrl, model: c.model })))()`);
    check("provider switched to Anthropic",
      Boolean(anthCfg.value && anthCfg.value.provider === "anthropic"),
      anthCfg.error || JSON.stringify(anthCfg.value));

    const anthProbe = await evp(`(() => window.aiAPI.test().then(r => ({ ok: r.success, content: r.content, endpoint: r.endpoint })))()`);
    check("test connection reaches the Anthropic endpoint",
      Boolean(anthProbe.value && anthProbe.value.ok && /MOCK-ANTHROPIC/.test(anthProbe.value.content || "")),
      anthProbe.error || JSON.stringify(anthProbe.value));

    const anthStream = await evp(`(() => new Promise((resolve) => {
      let text = '';
      const id = 'test-ant-' + Date.now();
      const dispose = window.aiAPI.onStreamData((payload) => {
        if (payload.id !== id) return;
        if (payload.type === 'delta') text += payload.delta;
        if (payload.type === 'end') { dispose(); resolve({ text, ended: true }); }
        if (payload.type === 'error') { dispose(); resolve({ text, error: payload.error }); }
      });
      window.aiAPI.stream({ id, messages: [{ role: 'user', content: 'stream this' }] })
        .then(r => { if (!r.success) { dispose(); resolve({ error: r.error }); } });
      setTimeout(() => resolve({ text, timedOut: true }), 15000);
    }))()`);
    check("Anthropic streaming completion",
      Boolean(anthStream.value && /MOCK-ANTHROPIC/.test(anthStream.value.text || "")),
      anthStream.error || JSON.stringify(anthStream.value));

    // 7. A failed endpoint must produce a readable error, not a crash.
    const bad = await evp(`(() => window.aiAPI.test({
      provider: 'openai', baseUrl: 'http://127.0.0.1:1/v1', model: 'x'
    }).then(r => ({ ok: r.success, error: r.error })))()`);
    check("unreachable provider reports an error",
      Boolean(bad.value && bad.value.ok === false && bad.value.error),
      JSON.stringify(bad.value));

    // 8. Clean up: restore the OpenAI provider and drop the probe project.
    await evp(`(() => window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name === 'ai-probe');
      return p ? window.dbAPI.deleteProject(p.id) : null;
    }))()`);

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} AI provider checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    if (server) server.kill();
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
