#!/usr/bin/env node
/**
 * Capture the onboarding walkthrough from BOTH applications and pixel-diff
 * each step. Usage: node onbcmp2.cjs <refCdp> <recCdp> <outDir>
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
async function shot(s,name){const r=await s.send('Page.captureScreenshot',{format:'png'});
  const f=path.join(OUT,name);fs.writeFileSync(f,Buffer.from(r.data,'base64'));return f;}

async function walk(s, prefix, steps) {
  const out = [];
  for (let step = 1; step <= steps; step++) {
    await sleep(700);
    const info = (await ev(s, `(() => {
      const content = document.querySelector('.step-chip')?.closest('.content');
      if (!content) return null;
      return { title: content.querySelector('.title')?.innerText.trim(),
        stepTitle: content.querySelector('.step-title')?.innerText.trim(),
        subtitle: content.querySelector('.step-subtitle')?.innerText.trim(),
        bullets: [...content.querySelectorAll('.step-bullet')].map(b=>b.innerText.trim()),
        languages: [...content.querySelectorAll('.language-option')].map(b=>b.innerText.trim()),
        buttons: [...content.querySelectorAll('.button-container button')].map(b=>b.innerText.trim()),
        chipLabels: [...content.querySelectorAll('.chip-label')].map(b=>b.innerText.trim()) };
    })()`)).value;
    if (!info) { console.log(`${prefix}: dialog gone at step ${step}`); break; }
    const file = await shot(s, `${prefix}-${step}.png`);
    out.push({ step, info, file });
    const adv = (await ev(s, `(() => {
      const btns=[...document.querySelectorAll('.dialog-container button, .container button')];
      const next=btns.find(b=>/next|start|login/i.test(b.innerText||''));
      if(!next) return 'NO NEXT';
      next.click(); return 'clicked';
    })()`)).value;
    if (adv === 'NO NEXT') break;
    await sleep(700);
  }
  return out;
}

function metric(a, b, kind) {
  try {
    return execFileSync('compare', ['-metric', kind, a, b, 'null:'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  } catch (e) { return (e.stderr || '').toString().trim(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ref = await connect(process.argv[2]);
  const rec = await connect(process.argv[3]);

  // Reset the walkthrough in both applications.
  await ev(ref, "window.dbAPI.setUserSetting('onboarding_status','','string','Onboarding status').then(()=>1)");
  await ev(rec, "window.dbAPI.setUserSetting('onboarding_status','','string','Onboarding status').then(()=>1)");
  await sleep(800);
  await ref.send('Page.reload', { ignoreCache: true });
  await rec.send('Page.reload', { ignoreCache: true });
  await sleep(4000);

  const refSteps = await walk(ref, 'onb-ref', 6);
  console.log('reference steps captured:', refSteps.length);

  // Reset the recreation's onboarding flag and reload.
  await ev(rec, `(() => { localStorage.removeItem('penligent.onboarding.seen'); return 1; })()`);
  await rec.send('Page.reload', { ignoreCache: true });
  await sleep(3500);
  const recSteps = await walk(rec, 'onb-rec', 6);
  console.log('recreation steps captured:', recSteps.length);

  const rows = [];
  for (let i = 0; i < Math.min(refSteps.length, recSteps.length); i++) {
    const a = refSteps[i].file, b = recSteps[i].file;
    rows.push({
      step: i + 1,
      refTitle: refSteps[i].info.stepTitle,
      recTitle: recSteps[i].info.stepTitle,
      titleMatch: refSteps[i].info.stepTitle === recSteps[i].info.stepTitle,
      subtitleMatch: refSteps[i].info.subtitle === recSteps[i].info.subtitle,
      bulletsMatch: JSON.stringify(refSteps[i].info.bullets) === JSON.stringify(recSteps[i].info.bullets),
      languagesMatch: JSON.stringify(refSteps[i].info.languages) === JSON.stringify(recSteps[i].info.languages),
      buttonsMatch: JSON.stringify(refSteps[i].info.buttons) === JSON.stringify(recSteps[i].info.buttons),
      chipsMatch: JSON.stringify(refSteps[i].info.chipLabels) === JSON.stringify(recSteps[i].info.chipLabels),
      AE: metric(a, b, 'AE'),
      RMSE: metric(a, b, 'RMSE')
    });
  }
  console.log(JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(OUT, 'onboarding-comparison.json'), JSON.stringify(rows, null, 2));
  ref.ws.close(); rec.ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
