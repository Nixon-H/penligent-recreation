#!/usr/bin/env node
/**
 * UI-level verification of the AI features: configure a provider, send a chat
 * message through the real composer, and generate a test plan from the Task
 * List view. Asserts that both are persisted in the database.
 */
const fs = require("fs");
const path = require("path");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const PROVIDER_HOST = process.env.PROVIDER_HOST || "127.0.0.1";
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

(async () => {
  const s = await connect();
  const evp = (e) => ev(s, e);

  try {
    // Configure the mock OpenAI-compatible provider.
    await evp(`(() => window.aiAPI.setConfig({
      provider: 'openai',
      baseUrl: 'http://${PROVIDER_HOST}:18080/v1',
      apiKey: 'sk-ui-test',
      model: 'mock-gpt'
    }).then(() => 1))()`);

    // Create a project and select it in the store.
    const project = await evp(`(() => {
      return window.dbAPI.addProjects({ project_name: 'ui-ai-probe', project_description: 'ui test', task_tree: '[]' })
        .then(() => window.dbAPI.getProjects())
        .then(list => { const p = list.find(x => x.project_name === 'ui-ai-probe'); return p ? p.id : null; });
    })()`);
    check("probe project created", project.value !== null, String(project.value));

    // Reload so the Pinia store picks the new project up, then select it in
    // the Projects view.
    await s.send("Page.reload", { ignoreCache: true });
    await sleep(3500);
    await evp(`(() => {
      const items = [...document.querySelectorAll('.home-content-left .nav-item')];
      if (items[0]) items[0].click();
      return 1;
    })()`);
    await sleep(700);
    const selected = await evp(`(() => {
      const cards = [...document.querySelectorAll('.home-content-left .task-item')];
      const card = cards.find(c => (c.innerText || '').indexOf('ui-ai-probe') !== -1);
      if (!card) return 'project card not found: ' + cards.length;
      card.click();
      return 'selected';
    })()`);
    check("project selected in the Projects view", selected.value === "selected", String(selected.value));
    await sleep(900);

    // Type into the composer and send.
    const sent = await evp(`(() => {
      const box = document.querySelector('.input-box');
      if (!box) return 'no composer';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, 'enumerate the attack surface please');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    check("message typed into the composer", sent.value === "typed", String(sent.value));
    await sleep(300);

    const submitted = await evp(`(() => {
      const btn = document.querySelector('.submit-button-container');
      if (!btn) return 'no submit button';
      btn.click();
      return 'clicked';
    })()`);
    check("send button clicked", submitted.value === "clicked", String(submitted.value));
    await sleep(3500);

    // The assistant reply is streamed and then persisted; poll briefly so the
    // assertion is not racing the Vue re-render.
    let bubbles = { value: [] };
    for (let attempt = 0; attempt < 20; attempt++) {
      bubbles = await evp(`(() => {
        const items = [...document.querySelectorAll('.chat-bubble')].map(b => b.innerText.trim());
        return items;
      })()`);
      if ((bubbles.value || []).some((t) => t.indexOf("MOCK-OPENAI") !== -1)) break;
      await sleep(1000);
    }
    check("chat shows the user message",
      Boolean(bubbles.value && bubbles.value.some(t => t.indexOf('enumerate the attack surface') !== -1)),
      JSON.stringify(bubbles.value));
    check("chat shows the streamed assistant reply",
      Boolean(bubbles.value && bubbles.value.some(t => t.indexOf('MOCK-OPENAI') !== -1)),
      JSON.stringify(bubbles.value));

    const persisted = await evp(`(() => {
      return window.dbAPI.getProjects().then(list => {
        const p = list.find(x => x.project_name === 'ui-ai-probe');
        return window.dbAPI.getChatRecords(p.id).then(records => ({
          count: records.length,
          types: records.map(r => r.chat_type),
          assistant: records.some(r => r.chat_type === 'assistant' && (r.chat_content || '').indexOf('MOCK-OPENAI') !== -1)
        }));
      });
    })()`);
    check("both messages persisted in chat_records",
      Boolean(persisted.value && persisted.value.count >= 2 && persisted.value.assistant),
      JSON.stringify(persisted.value));

    // Generate a test plan from the Task List view.
    await evp(`(() => {
      const items = [...document.querySelectorAll('.home-content-center .nav-container .nav-item')];
      if (items[0]) items[0].click();
      return 1;
    })()`);
    await sleep(800);
    const gen = await evp(`(() => {
      const btn = document.querySelector('.generate-button');
      if (!btn) return 'no generate button';
      btn.click();
      return 'clicked';
    })()`);
    check("generate button clicked", gen.value === "clicked", String(gen.value));
    await sleep(4000);

    const plan = await evp(`(() => {
      return window.dbAPI.getProjects().then(list => {
        const p = list.find(x => x.project_name === 'ui-ai-probe');
        return window.dbAPI.getAllTestLists().then(lists => {
          const mine = lists.filter(l => l.project_id === p.id);
          return { count: mine.length, sample: mine[0] ? String(mine[0].test_list).slice(0, 80) : null };
        });
      });
    })()`);
    check("AI test plan stored in test_lists",
      Boolean(plan.value && plan.value.count >= 1),
      JSON.stringify(plan.value));

    // Clean up the probe project.
    await evp(`(() => window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name === 'ui-ai-probe');
      return p ? window.dbAPI.deleteProject(p.id) : null;
    }))()`);

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} AI UI checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
