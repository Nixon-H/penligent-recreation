#!/usr/bin/env node
/**
 * Final comparison harness: drives the reference and the reconstruction
 * through the same sequence of views and records geometry + pixel metrics.
 *
 * Usage: node final-compare.cjs <refCdp> <recCdp> <outDir>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = process.argv[4] || '/home/nixon/penligent-analysis/compare';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(base, p) { return (await fetch(`${base}${p}`)).json(); }
class S { constructor(ws){this.ws=ws;this.id=0;this.p=new Map();}
  send(m,pa={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:pa}));
    return new Promise((r,j)=>{this.p.set(id,{r,j});setTimeout(()=>{if(this.p.has(id)){this.p.delete(id);j(new Error('t '+m));}},25000);});}}
async function connect(base){const t=(await httpJson(base,'/json/list')).find(x=>x.type==='page'&&!x.url.startsWith('devtools://'));
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=()=>j(new Error('ws'));});
  const s=new S(ws);ws.onmessage=m=>{const g=JSON.parse(m.data);if(g.id&&s.p.has(g.id)){const{r,j}=s.p.get(g.id);s.p.delete(g.id);g.error?j(new Error(JSON.stringify(g.error))):r(g.result);}};
  await s.send('Page.enable');await s.send('Runtime.enable');return s;}
async function ev(s,e){const r=await s.send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) return {error:(r.exceptionDetails.exception?.description||'').slice(0,300)};return {value:r.result?.value};}
async function shot(s,n){const r=await s.send('Page.captureScreenshot',{format:'png'});
  const f=path.join(OUT,n);fs.writeFileSync(f,Buffer.from(r.data,'base64'));return f;}

const PROBE = `(() => {
  const box=e=>{if(!e) return null; const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
    return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),
      color:st.color,bg:st.backgroundColor,fs:st.fontSize,padding:st.padding,gap:st.gap};};
  const q=s=>document.querySelector(s);
  return {
    html:{cls:document.documentElement.className,fs:getComputedStyle(document.documentElement).fontSize},
    app:box(q('.app-container')), header:box(q('.header-container')),
    headerLeft:box(q('.header-left')), headerRight:box(q('.header-right')),
    body:box(q('.body-container')), left:box(q('.home-content-left')),
    center:box(q('.home-content-center')), right:box(q('.home-content-right')),
    drag:box(q('.drag-line')), centerContainer:box(q('.center-container')),
    chat:box(q('.chat-container')), footer:box(q('.footer-container')),
    input:box(q('.input-box')), submit:box(q('.submit-button-container')),
    selectMode:box(q('.select-mode-container')), selectSearch:box(q('.select-search-container')),
    headerItems:[...document.querySelectorAll('.header-left .header-left-botton-item')].map(box),
    leftNav:[...document.querySelectorAll('.home-content-left .nav-item')].map(box),
    centerNav:[...document.querySelectorAll('.home-content-center .nav-item')].map(box),
    centerText:(q('.home-content-center .content-container')||{}).innerText?.slice(0,400)
  };
})()`;

function diff(ref, rec, p = '') {
  const out = [];
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(ref) && isObj(rec)) {
    for (const k of new Set([...Object.keys(ref), ...Object.keys(rec)])) out.push(...diff(ref[k], rec[k], p ? `${p}.${k}` : k));
    return out;
  }
  if (Array.isArray(ref) && Array.isArray(rec)) {
    if (ref.length !== rec.length) { out.push({ path: `${p}.length`, ref: ref.length, rec: rec.length }); return out; }
    for (let i = 0; i < ref.length; i++) out.push(...diff(ref[i], rec[i], `${p}[${i}]`));
    return out;
  }
  if (typeof ref === 'number' && typeof rec === 'number') {
    if (Math.abs(ref - rec) > 1.5) out.push({ path: p, ref, rec, delta: +(rec - ref).toFixed(2) });
    return out;
  }
  if (ref !== rec) out.push({ path: p, ref, rec });
  return out;
}

function metric(a, b, kind) {
  try { return execFileSync('compare', ['-metric', kind, a, b, 'null:'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim(); }
  catch (e) { return (e.stderr || '').toString().trim(); }
}

async function clickNav(s, sel, idx) {
  await ev(s, `(() => { const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.getClientRects().length>0);
    if(els[${idx}]) els[${idx}].click(); })()`);
  await sleep(900);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ref = await connect(process.argv[2]);
  const rec = await connect(process.argv[3]);

  // Dismiss any overlay in both applications.
  for (const s of [ref, rec]) {
    await ev(s, `(() => { const b=document.querySelector('svg.close-button'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); })()`);
  }
  await sleep(1200);

  // Put both applications in the same state: no projects and no test lists.
  // The Task List badge renders "/" when a project has no test list, so any
  // leftover data would show up as a false difference.
  for (const s of [ref, rec]) {
    await ev(s, `(() => window.dbAPI && window.dbAPI.getProjects ? window.dbAPI.getProjects()
      .then(list => Promise.all(list.map(p => window.dbAPI.deleteProject(p.id))))
      .then(() => 1) : 1)()`);
  }
  await sleep(600);

  // Reload so the renderer's store picks the reset state up.
  for (const s of [ref, rec]) {
    await s.send("Page.reload", { ignoreCache: true });
  }
  await sleep(3500);
  for (const s of [ref, rec]) {
    await ev(s, `(() => { const b=document.querySelector('svg.close-button'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); })()`);
  }
  await sleep(900);

  const results = [];
  const VIEWS = [
    { name: 'shell', sel: null, idx: null },
    { name: 'centre-tasklist', sel: '.home-content-center .nav-container .nav-item', idx: 0 },
    { name: 'centre-target', sel: '.home-content-center .nav-container .nav-item', idx: 1 },
    { name: 'centre-threatmap', sel: '.home-content-center .nav-container .nav-item', idx: 2 },
    { name: 'centre-findings', sel: '.home-content-center .nav-container .nav-item', idx: 3 },
    { name: 'centre-results', sel: '.home-content-center .nav-container .nav-item', idx: 4 },
    { name: 'left-toolconfig', sel: '.home-content-left .nav-item', idx: 1 }
  ];

  // Reset both applications to a known navigation state before each view.
  const reset = async (s) => {
    await ev(s, "(()=>{const l=[...document.querySelectorAll('.home-content-left .nav-item')];if(l[0])l[0].click();})()");
    await sleep(300);
    await ev(s, "(()=>{const c=[...document.querySelectorAll('.home-content-center .nav-container .nav-item')];if(c[0])c[0].click();})()");
    await sleep(500);
  };

  for (const view of VIEWS) {
    if (view.sel) {
      await reset(ref);
      await reset(rec);
      await clickNav(ref, view.sel, view.idx);
      await clickNav(rec, view.sel, view.idx);
    } else {
      await reset(ref);
      await reset(rec);
    }
    const rp = (await ev(ref, PROBE)).value;
    const cp = (await ev(rec, PROBE)).value;
    const a = await shot(ref, `fin-ref-${view.name}.png`);
    const b = await shot(rec, `fin-rec-${view.name}.png`);
    const d = diff(rp, cp);
    results.push({
      view: view.name,
      geometryDifferences: d.length,
      differences: d.slice(0, 12),
      AE: metric(a, b, 'AE'),
      RMSE: metric(a, b, 'RMSE'),
      refText: rp.centerText, recText: cp.centerText,
      textMatch: (rp.centerText || '') === (cp.centerText || '')
    });
    console.log(`${view.name.padEnd(20)} geoDiff=${String(d.length).padEnd(3)} AE=${results[results.length-1].AE}  textMatch=${results[results.length-1].textMatch}`);
    if (d.length) for (const x of d.slice(0, 6)) console.log(`    ${x.path}: ref=${JSON.stringify(x.ref)} rec=${JSON.stringify(x.rec)}`);
  }

  fs.writeFileSync(path.join(OUT, 'final-comparison.json'), JSON.stringify(results, null, 2));
  ref.ws.close(); rec.ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
