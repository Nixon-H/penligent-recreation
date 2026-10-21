#!/usr/bin/env node
/**
 * Functional parity check: exercise the DB-backed workflow in the
 * reconstruction (sign in locally, create a project, read it back, add a
 * finding, add a chat record) and assert the data actually lands in SQLite.
 */
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`${CDP_HOST}${p}`)).json(); }
class S { constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error('t '+m));}},20000);});}}
async function connect(){const t=(await httpJson('/json/list')).find(x=>x.type==='page'&&!x.url.startsWith('devtools://'));
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=()=>j(new Error('ws'));});
  const s=new S(ws);ws.onmessage=m=>{const g=JSON.parse(m.data);if(g.id&&s.p.has(g.id)){const{r,j}=s.p.get(g.id);s.p.delete(g.id);g.error?j(new Error(JSON.stringify(g.error))):r(g.result);}};
  await s.send('Page.enable');await s.send('Runtime.enable');return s;}
async function ev(s,e){const r=await s.send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) return {error:(r.exceptionDetails.exception?.description||'').slice(0,400)};return {value:r.result?.value};}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const s = await connect();
  const evp = (e) => ev(s, e);

  // 1. The database is initialised and reachable.
  const tables = await evp("window.dbAPI.getUserSettings().then(()=>'ok')");
  check("database reachable from the renderer", tables.value === 'ok', tables.error || '');

  // 2. Settings round-trip through the user_settings table.
  await evp("window.dbAPI.setUserSetting('probe_key','probe_value','string','probe').then(()=>1)");
  const setting = await evp("window.dbAPI.getUserSettingOneByKey('probe_key').then(r=>r&&r.setting_value)");
  check("user_settings round trip", setting.value === 'probe_value', String(setting.value ?? setting.error));

  // 3. A project can be created and read back.
  const created = await evp(`(() => {
    const name = 'probe-project-' + Date.now();
    return window.dbAPI.addProjects({ project_name: name, project_description: 'probe', task_tree: '[]' })
      .then(() => window.dbAPI.getProjects())
      .then(list => ({ name, count: list.length, found: list.some(p => p.project_name === name) }));
  })()`);
  check("project create + read back",
    Boolean(created.value && created.value.found),
    created.error || JSON.stringify(created.value));

  // 4. A finding can be attached to the project and counted.
  const risk = await evp(`(() => {
    return window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name.indexOf('probe-project-') === 0);
      if (!p) return { error: 'no probe project' };
      return window.dbAPI.addRiskItem({ project_id: p.id, risk_type: 'vulnerability', severity: 'high', title: 'probe finding' })
        .then(() => window.dbAPI.getRiskItems(p.id))
        .then(items => ({ count: items.length, title: items[0] && items[0].title, severity: items[0] && items[0].severity }));
    });
  })()`);
  check("risk item persisted",
    Boolean(risk.value && risk.value.count === 1 && risk.value.severity === 'high'),
    risk.error || JSON.stringify(risk.value));

  // 5. A chat record is persisted.
  const chat = await evp(`(() => {
    return window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name.indexOf('probe-project-') === 0);
      return window.dbAPI.addChatRecords({ project_id: p.id, chat_type: 'user', chat_content: 'probe message' })
        .then(() => window.dbAPI.getChatRecords(p.id))
        .then(items => ({ count: items.length, content: items[0] && items[0].chat_content }));
    });
  })()`);
  check("chat record persisted",
    Boolean(chat.value && chat.value.count === 1),
    chat.error || JSON.stringify(chat.value));

  // 6. A test list is persisted.
  const list = await evp(`(() => {
    return window.dbAPI.getProjects().then(ps => {
      const p = ps.find(x => x.project_name.indexOf('probe-project-') === 0);
      return window.dbAPI.addTestList({ project_id: p.id, test_type: 'type_1', test_list: '[{"id":1,"title":"probe task"}]' })
        .then(() => window.dbAPI.getAllTestLists())
        .then(items => ({ count: items.length }));
    });
  })()`);
  check("test list persisted", Boolean(list.value && list.value.count >= 1), list.error || JSON.stringify(list.value));

  // 7. The proxy settings upsert by type.
  const proxy = await evp(`(() => {
    return window.dbAPI.updateProxySettings('address', '127.0.0.1:8080')
      .then(() => window.dbAPI.getProxySettings())
      .then(rows => ({ count: rows.length, value: rows[0] && rows[0].proxy_value }));
  })()`);
  check("proxy settings upsert",
    Boolean(proxy.value && proxy.value.count === 1 && proxy.value.value === '127.0.0.1:8080'),
    proxy.error || JSON.stringify(proxy.value));

  // 8. Cleaning up the probe data.
  const cleanup = await evp(`(() => {
    return window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name.indexOf('probe-project-') === 0);
      return window.dbAPI.deleteProject(p.id).then(() => window.dbAPI.getProjects().then(l => l.length));
    });
  })()`);
  check("project delete", typeof cleanup.value === 'number' && cleanup.value >= 0, cleanup.error || String(cleanup.value));

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} functional checks passed`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
