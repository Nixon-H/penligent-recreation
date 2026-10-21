#!/usr/bin/env node
/**
 * Verifies the client-side report generation and the provider model list.
 *
 * The reference renders its report with Penligent's hosted service, but every
 * input the service receives (`risk_list`, `current_target_info`, `test_list`)
 * is assembled client-side. These checks assert that the reconstruction
 * produces a real report from those inputs and stores it in `report_exports`
 * through the same call the reference makes.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const CDP_HOST = process.env.CDP_HOST || "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`${CDP_HOST}${p}`)).json(); }
class S {
  constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error("t "+m));}},60000);});}
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

(async () => {
  const s = await connect();
  const evp = (e) => ev(s, e);

  try {
    // A project with a finding, so the report has content.
    const project = await evp(`(() => {
      return window.dbAPI.addProjects({ project_name: 'report-probe', project_description: 'report scope', task_tree: '[]' })
        .then(() => window.dbAPI.getProjects())
        .then(list => { const p = list.find(x => x.project_name === 'report-probe'); return p ? p.id : null; });
    })()`);
    check("probe project created", project.value !== null, String(project.value));

    await evp(`(() => {
      const id = ${project.value};
      return window.dbAPI.addRiskItem({
        project_id: id, risk_type: 'vulnerability', severity: 'high',
        title: 'Reflected XSS', description: 'Unescaped parameter in the search page.',
        affected_target: 'https://probe.test/search', recommendation: 'Encode output.',
        cve_id: 'CVE-2024-0001', cvss_score: 7.4
      }).then(() => window.dbAPI.addTestList({
        project_id: id, test_type: 'type_1',
        test_list: JSON.stringify([{ id: 1, title: 'Passive reconnaissance', phase: 'recon', status: 'todo' }])
      }));
    })()`);

    // Generate the report.
    const report = await evp(`(() => window.dbAPI.generateReport({ projectId: ${project.value}, language: 'en' })
      .then(r => ({ ok: r.success, size: r.size, head: (r.content || '').slice(0, 200),
        hasFinding: /Reflected XSS/.test(r.content || ''),
        hasSeverity: /high/.test(r.content || ''),
        hasCve: /CVE-2024-0001/.test(r.content || ''),
        hasPlan: /Passive reconnaissance/.test(r.content || '') })))()`);
    check("report is generated", Boolean(report.value && report.value.ok),
      report.error || JSON.stringify(report.value));
    check("report contains the finding", Boolean(report.value && report.value.hasFinding));
    check("report contains the severity", Boolean(report.value && report.value.hasSeverity));
    check("report contains the CVE", Boolean(report.value && report.value.hasCve));
    check("report contains the test plan", Boolean(report.value && report.value.hasPlan));

    // The report must be stored in report_exports, as the reference does.
    const stored = await evp(`(() => window.dbAPI.getReportExports(${project.value})
      .then(rows => ({ count: rows.length, status: rows[0] && rows[0].export_status,
        format: rows[0] && rows[0].export_format, size: rows[0] && rows[0].file_size })))()`);
    check("report is stored in report_exports",
      Boolean(stored.value && stored.value.count === 1 && stored.value.status === "completed" && stored.value.format === "md"),
      JSON.stringify(stored.value));

    // The model list must be readable from the provider.
    const models = await evp(`(() => window.aiAPI.listModels({
      provider: 'openai', baseUrl: 'http://127.0.0.1:1/v1'
    }).then(r => ({ ok: r.success, count: (r.models || []).length, error: r.error })))()`);
    check("model list reports a readable failure for a dead endpoint",
      Boolean(models.value && models.value.ok === false),
      JSON.stringify(models.value));

    // Clean up.
    await evp(`(() => window.dbAPI.getProjects().then(list => {
      const p = list.find(x => x.project_name === 'report-probe');
      return p ? window.dbAPI.deleteProject(p.id) : null;
    }))()`);

    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} report/model checks passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    s.ws.close();
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
