/* LungPath web app. All clinical logic comes from the Kotlin rules engine (global LungPath, from lungpath-core.js). */
(function () {
'use strict';
const L = globalThis.LungPath;
const app = document.getElementById('app');
if (!L) { app.innerHTML = '<div class="content"><p>LungPath could not load its rules engine. Reload the page.</p></div>'; return; }

const I = {
  back:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z"/></svg>',
  nod:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  lung:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8M12 11c-2 0-3 1-4 3M12 11c2 0 3 1 4 3"/><path d="M8 7c-3 1-5 5-5 10 0 2 1 3 3 3 3 0 4-2 4-5V9M16 7c3 1 5 5 5 10 0 2-1 3-3 3-3 0-4-2-4-5V9"/></svg>',
  tools:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/></svg>'
};
const SEV = {DISCHARGE:'ok', SURVEILLANCE:'warn', ACTION:'bad', INFO:'info'};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const pct = p => L.percent(p);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
};

/* ---------------- state ---------------- */
const S = {
  stack:['home'],
  w:null,
  bk:{brock:{age:65,female:false,familyHistory:false,emphysema:false,upperLobe:true,noduleCount:1,spiculation:false}, size:'12', type:'SOLID'},
  hd:{p:'15', up:'MODERATE'},
  vd:{vol:true, a:'180', b:'260', days:'90'},
  tnm:{ed:'NINTH', t:'T1c', n:'N0', m:'M0'},
  gr:{pat:'ACINAR', hg:false},
  tx:{histology:'NSCLC_NON_SQUAMOUS', stage:'ADVANCED', driver:'NONE', pdL1:'AT_LEAST_50'}
};
const defaultBrock = () => ({age:65,female:false,familyHistory:false,emphysema:false,upperLobe:true,noduleCount:1,spiculation:false});
function newW(pre){ S.w = Object.assign({step:'EXCL', hist:[], exclusions:[], type:null, unit:'DIAMETER_MM', size:'', brock:defaultBrock(), pet:null, subsolid:null, baseline:new Date()}, pre || {}); }
function caseInput(){
  const w = S.w, v = parseFloat(w.size);
  const sized = w.hist.includes('SIZE') || w.step === 'RESULT';
  return {
    exclusions: w.exclusions.slice(), type: w.type,
    sizeValue: (sized && v > 0) ? v : null, sizeUnit: w.unit,
    brock: w.brock, pet: w.pet, subsolid: w.subsolid
  };
}
function scanDate(m){ const d = new Date(S.w.baseline); d.setMonth(d.getMonth() + m); return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}); }

/* ---------------- navigation ---------------- */
const top = () => S.stack[S.stack.length - 1];
function go(id){ S.stack.push(id); render(true); }
function tab(id){ S.stack = [id]; render(true); }
function back(){
  if (top() === 'wizard' && S.w.hist.length){
    if (S.w.step === 'RESULT'){ S.w.pet = null; S.w.subsolid = null; }
    S.w.step = S.w.hist.pop(); render(true); return;
  }
  if (S.stack.length > 1) S.stack.pop();
  render(true);
}
function step(next){ S.w.hist.push(S.w.step); S.w.step = next; render(true); }
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; app.appendChild(t); setTimeout(() => t.remove(), 1800); }

/* ---------------- building blocks ---------------- */
const result = (sev, tag, title, detail, big) => `<div class="result ${SEV[sev] || sev}"><div class="tag">${esc(tag)}</div>${big != null ? `<div class="big">${esc(big)}</div>` : ''}${title ? `<h3>${esc(title)}</h3>` : ''}${detail ? `<p>${esc(detail)}</p>` : ''}</div>`;
const src = s => s ? `<div class="src">${esc(s)}</div>` : '';
const card = (title, body, attrs) => `<button class="card tap" ${attrs}><h3>${esc(title)}</h3><p>${esc(body)}</p></button>`;
const chips = (opts, sel, attr) => `<div class="chips">${opts.map(o => `<button class="chip ${o.id === sel ? 'sel' : ''}" data-${attr}="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
function timeline(scans, cls){
  return `<div class="timeline" style="color:var(--${cls || 'primary'})">${scans.map(s => `<div class="tl"><span class="d" style="color:var(--fg)">${s.months === 0 ? 'Today' : esc(scanDate(s.months))}</span><span class="dot"></span><span class="t" style="color:var(--fg)">${esc(s.label)}</span></div>`).join('')}</div>`;
}
function table(title, rows){
  return `<div class="card">${title ? `<h3>${esc(title)}</h3>` : ''}<table class="tbl">${rows.map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join('')}</table></div>`;
}
const BROCK_SWITCHES = [['female','Female'],['familyHistory','Family history of lung cancer'],['emphysema','Emphysema on CT'],['upperLobe','Upper lobe location'],['spiculation','Spiculation']];
function brockForm(ctx, b){
  return `<div class="card" style="gap:10px">
    <div class="grid2"><div class="field"><label for="${ctx}-age">Age (years)</label><input id="${ctx}-age" data-bctx="${ctx}" data-bk="age" inputmode="numeric" value="${b.age}"></div>
    <div class="field"><label for="${ctx}-cnt">Number of nodules</label><input id="${ctx}-cnt" data-bctx="${ctx}" data-bk="noduleCount" inputmode="numeric" value="${b.noduleCount}"></div></div>
    ${BROCK_SWITCHES.map(([k, t]) => `<label class="sw" for="${ctx}-${k}"><span>${t}</span><input type="checkbox" id="${ctx}-${k}" data-bctx="${ctx}" data-bk="${k}" ${b[k] ? 'checked' : ''}></label>`).join('')}
  </div>`;
}

/* ---------------- screens ---------------- */
const SCR = {};

SCR.home = {title:'LungPath', tab:'home', html:() => {
  const standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `
  <div class="banner"><span>Decision support for clinicians. Always discuss at MDT. Draft content, not yet clinically validated.</span></div>
  ${ios && !standalone ? '<div class="card"><h3>Install on your iPhone</h3><p>Tap the Share button in Safari, then <b>Add to Home Screen</b>. LungPath then opens full-screen and works offline.</p></div>' : ''}
  <button class="hero" data-go="nodules" style="border:0;text-align:left;cursor:pointer;font:inherit"><h3>Pulmonary nodules</h3><p>BTS 2015 pathway · Brock · Herder · volumetry and VDT · follow-up schedule</p></button>
  ${card('Lung cancer', 'NICE NG122 · TNM 8th and 9th · histology and grading · biomarkers · treatment lines', 'data-go="cancer"')}
  <div class="lbl">Quick tools</div>
  <div class="grid2">
    <button class="mini" data-go="brock"><b>Brock score</b><span>Malignancy risk</span></button>
    <button class="mini" data-go="herder"><b>Herder score</b><span>After PET-CT</span></button>
    <button class="mini" data-go="vdt"><b>Growth / VDT</b><span>Volume doubling time</span></button>
    <button class="mini" data-go="tnm"><b>TNM stage</b><span>8th and 9th edition</span></button>
  </div>
  <div class="lbl">Try a sample case</div>
  ${card('67-year-old woman, 9 mm solid nodule', 'Right upper lobe, spiculated, emphysema. Walks through Brock then Herder.', 'data-sample="1"')}
  ${card('58-year-old man, 12 mm part-solid nodule', 'Left upper lobe. Shows the subsolid route and 4-year surveillance.', 'data-sample="2"')}`;
}};

SCR.nodules = {title:'Pulmonary nodules', tab:'nodules', html:() => `
  <div class="hero"><h3>Nodule pathway</h3><p>Step-by-step BTS 2015 assessment for incidental nodules in adults. Ends with a management plan and scan dates.</p>
  <div class="row" style="margin-top:6px"><button class="btn" data-start="1">Start pathway</button></div></div>
  <div class="lbl">Calculators</div>
  ${card('Brock model', 'Initial risk for nodules ≥8 mm or ≥300 mm³, and for persistent subsolid nodules', 'data-go="brock"')}
  ${card('Herder model', 'Updates the risk after PET-CT uptake', 'data-go="herder"')}
  ${card('Growth and VDT', 'Volume change and doubling time between two scans', 'data-go="vdt"')}
  <div class="lbl">Reference</div>
  ${card('Pathway at a glance', 'Size thresholds, follow-up intervals and risk actions on one screen', 'data-go="nodref"')}`};

SCR.nodref = {title:'Pathway at a glance', html:() =>
  table('Solid nodules', [['<5 mm or <80 mm³','Discharge'],['5 to <6 mm','CT at 1 year'],['6 to <8 mm or 80 to <300 mm³','CT at 3 months, then 1 year (volumetry)'],['≥8 mm or ≥300 mm³','Brock. Under 10%: CT surveillance. 10% or more: PET-CT then Herder']]) +
  table('After PET-CT (Herder)', [['<10%','CT surveillance'],['10–70%','Consider image-guided biopsy, excision or non-surgical treatment, or surveillance by patient choice'],['>70%','Consider excision or non-surgical treatment (for example SABR); biopsy where appropriate']]) +
  table('Growth on surveillance', [['VDT >600 days','Discharge (stable means ≤25% volume change at 1 year)'],['400–600 days','Ongoing surveillance or biopsy and treatment by patient preference'],['VDT ≤400 days','Treat as growing: biopsy, excision or non-surgical treatment']]) +
  `<div class="card"><h3>Subsolid nodules</h3><p>≥5 mm: CT at 3 months. Resolved: discharge. Persistent: Brock plus patient factors, then CT at 1, 2 and 4 years, or treatment. PET-CT is not recommended for pure ground glass. Growth or a new solid component: consider resection or non-surgical treatment.</p></div>` +
  src('BTS 2015 pulmonary nodule guideline, Algorithms 1–4')};

/* ---- nodule pathway ---- */
const STEPS = ['EXCL','TYPE','SIZE','RESULT'];
SCR.wizard = {title:'Nodule pathway', html:() => {
  const idx = STEPS.indexOf(S.w.step);
  return `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>` + WZ[S.w.step]();
}, mount:() => { if (S.w.step === 'RESULT') renderWizardResult(); }};
const WZ = {};
WZ.EXCL = () => `<div class="lbl">Step 1 · Does the nodule need follow-up?</div><p style="margin:0;font-size:13.5px;color:var(--fg-2)">Tick any that apply.</p>
  <div class="opt">${L.exclusions().map(e => { const on = S.w.exclusions.includes(e.id); return `<button class="choice ${on ? 'sel' : ''}" data-excl="${e.id}"><span class="chk">${on ? '✓' : ''}</span><span><b>${esc(e.label)}</b></span></button>`; }).join('')}</div>
  <div class="row"><button class="btn" data-next="EXCL">Continue</button></div>`;
WZ.TYPE = () => `<div class="lbl">Step 2 · Nodule type</div><div class="opt">${[['SOLID','Solid','Homogeneous soft tissue density'],['PURE_GROUND_GLASS','Pure ground glass','No solid component'],['PART_SOLID','Part-solid','Ground glass with a solid component']]
  .map(([k, t, s]) => `<button class="choice ${S.w.type === k ? 'sel' : ''}" data-type="${k}"><span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>`;
WZ.SIZE = () => { const w = S.w, mm = w.unit === 'DIAMETER_MM'; return `<div class="lbl">Step 3 · Size</div>
  ${chips([{id:'DIAMETER_MM', label:'Max diameter (mm)'}, {id:'VOLUME_MM3', label:'Volume (mm³)'}], w.unit, 'unit')}
  <div class="field"><label for="sz">${mm ? 'Maximum axial diameter, mm' : 'Semi-automated volume, mm³'}</label><input id="sz" inputmode="decimal" value="${esc(w.size)}" placeholder="${mm ? 'e.g. 9' : 'e.g. 350'}"></div>
  <p style="margin:0;font-size:12.5px;color:var(--fg-2)">BTS prefers volumetry where available.${w.type && w.type !== 'SOLID' ? ' For subsolid nodules use the whole nodule size.' : ''}</p>
  <div class="row"><button class="btn" data-next="SIZE">See management</button></div>`; };
WZ.RESULT = () => {
  const res = L.assessNodule(caseInput()), w = S.w;
  let head = '';
  if (w.type && res.diameterMm != null && !w.exclusions.length){
    const t = {SOLID:'Solid', PURE_GROUND_GLASS:'Pure ground glass', PART_SOLID:'Part-solid'}[w.type];
    const sz = w.unit === 'DIAMETER_MM' ? `${w.size} mm` : `${w.size} mm³ · ≈${L.fixed(res.diameterMm, 1)} mm diameter`;
    head = `<div class="card"><p><b style="color:var(--fg)">${t} nodule, ${esc(sz)}</b></p><p id="wz-sub"></p></div>`;
  }
  const brock = res.needsBrockInputs && !w.pet
    ? result('INFO', 'Risk assessment', 'Brock score', 'Solid nodules ≥8 mm or ≥300 mm³ need an initial risk estimate. Results update as you edit.') + brockForm('wz', w.brock)
    : '';
  return head + brock + '<div id="wz-res" style="display:flex;flex-direction:column;gap:12px"></div>';
};
function renderWizardResult(){
  const el = app.querySelector('#wz-res'); if (!el) return;
  const w = S.w, input = caseInput(), res = L.assessNodule(input), r = res.recommendation;
  const sub = app.querySelector('#wz-sub');
  if (sub) sub.textContent = (res.brockRisk != null && w.pet) ? `Brock ${pct(res.brockRisk)} · PET-CT uptake ${w.pet.toLowerCase()}` : '';
  const big = res.herderRisk != null ? pct(res.herderRisk) : res.brockRisk != null ? pct(res.brockRisk) : null;
  let h = result(r.severity, r.tag, r.title, r.detail, big);
  const cls = SEV[r.severity] === 'info' ? 'primary' : SEV[r.severity];
  if (r.nextInput === 'PET'){
    h += `<div class="lbl">Step 4 · PET-CT uptake</div><div class="opt">${L.petUptakes().map(p => `<button class="choice" data-pet="${p.id}"><span><b>${esc(p.label)}</b><small>${esc(p.description)}</small></span></button>`).join('')}</div>`;
  } else if (r.nextInput === 'SUBSOLID_FOLLOW_UP'){
    h += timeline(r.schedule, cls) + `<div class="lbl">Outcome of the 3-month CT</div><div class="opt">${L.subsolidOutcomes().map(o => `<button class="choice" data-subsolid="${o.id}"><span><b>${esc(o.label)}</b></span></button>`).join('')}</div>`;
  } else {
    if (r.schedule.length) h += timeline(r.schedule, cls);
    if (r.severity === 'SURVEILLANCE' && w.type === 'SOLID') h += '<div class="row"><button class="btn tonal" data-go="vdt">Open growth / VDT tool</button></div>';
    if (r.severity === 'ACTION') h += '<div class="card"><h3>Before treatment</h3><p>Confirm fitness (performance status, lung function) and refer to the lung cancer MDT. If malignancy is confirmed, stage with TNM.</p><div class="row"><button class="btn tonal" data-go="tnm">Open TNM staging</button></div></div>';
  }
  h += src(r.source);
  const outOfScope = L.exclusions().some(e => e.outOfScope && w.exclusions.includes(e.id));
  if (!r.nextInput && !outOfScope){
    S.copy = L.letterSummary(input, scanDate);
    h += `<div class="row"><button class="btn tonal" data-copy="1">Copy for letter</button>${navigator.share ? '<button class="btn text" data-share="1">Share</button>' : ''}</div><pre id="copysrc" hidden style="white-space:pre-wrap;font:12px var(--mono);background:var(--surface-2);padding:10px;border-radius:10px;margin:0">${esc(S.copy)}</pre>`;
  }
  if (!r.nextInput) h += '<div class="row"><button class="btn tonal" data-start="1">New nodule</button><button class="btn text" data-tab="nodules">Done</button></div>';
  el.innerHTML = h;
}

/* ---- calculators ---- */
SCR.brock = {title:'Brock model', html:() => `<p style="margin:0;font-size:13.5px;color:var(--fg-2)">Probability that a CT-detected nodule is malignant. Updates as you type.</p>
  <div class="field"><label for="bk-size">Maximum diameter, mm</label><input id="bk-size" data-calc="bk-size" inputmode="decimal" value="${esc(S.bk.size)}"></div>
  ${chips([{id:'SOLID', label:'Solid'}, {id:'PURE_GROUND_GLASS', label:'Ground glass'}, {id:'PART_SOLID', label:'Part-solid'}], S.bk.type, 'bktype')}
  ${brockForm('bk', S.bk.brock)}<div id="bk-out"></div>${src('Brock full model with spiculation (McWilliams 2013)')}`, mount:brockOut};
function brockOut(){
  const el = app.querySelector('#bk-out'), d = parseFloat(S.bk.size);
  if (!(d > 0)){ el.innerHTML = '<div class="card"><p>Enter the nodule diameter.</p></div>'; return; }
  const p = L.brock(S.bk.brock, d, S.bk.type), hi = p >= 0.10;
  el.innerHTML = result(hi ? 'ACTION' : 'DISCHARGE', 'Probability of malignancy', null, hi ? '10% or more: BTS recommends PET-CT (solid nodules) then the Herder model.' : 'Under 10%: BTS recommends CT surveillance.', pct(p));
}
SCR.herder = {title:'Herder model', html:() => `<p style="margin:0;font-size:13.5px;color:var(--fg-2)">Combines pre-test risk (Brock) with PET-CT uptake.</p>
  <div class="field"><label for="hd-p">Pre-test probability from Brock, %</label><input id="hd-p" data-calc="hd-p" inputmode="decimal" value="${esc(S.hd.p)}"></div>
  <div class="lbl">FDG uptake</div>${chips(L.petUptakes(), S.hd.up, 'hup')}
  <div id="hd-out"></div>${src('Herder 2005 · BTS 2015 Algorithm 3')}`, mount:herderOut};
function herderOut(){
  const el = app.querySelector('#hd-out'), p = parseFloat(S.hd.p);
  if (!(p >= 0 && p <= 100)){ el.innerHTML = '<div class="card"><p>Enter a probability between 0 and 100.</p></div>'; return; }
  const h = L.herder(p / 100, S.hd.up), r = h.recommendation;
  const up = L.petUptakes().find(u => u.id === S.hd.up);
  el.innerHTML = `<p style="margin:0;font-size:13px;color:var(--fg-2)">${esc(up.description)}</p>` + result(r.severity, 'Probability of malignancy', r.title, r.detail, pct(h.probability));
}
SCR.vdt = {title:'Growth and VDT', html:() => `${chips([{id:'vol', label:'Volumes (mm³)'}, {id:'mm', label:'Diameters (mm)'}], S.vd.vol ? 'vol' : 'mm', 'vmode')}
  <div class="grid2"><div class="field"><label for="vd-a">Earlier scan</label><input id="vd-a" data-calc="vd-a" inputmode="decimal" value="${esc(S.vd.a)}"></div><div class="field"><label for="vd-b">Latest scan</label><input id="vd-b" data-calc="vd-b" inputmode="decimal" value="${esc(S.vd.b)}"></div></div>
  <div class="field"><label for="vd-d">Days between scans</label><input id="vd-d" data-calc="vd-d" inputmode="numeric" value="${esc(S.vd.days)}"></div>
  <div id="vd-out"></div>`, mount:vdtOut};
const GROWTH = {
  NO_SIGNIFICANT_GROWTH:['DISCHARGE','No significant growth','Volume change under 25%. If this is the 1-year scan, discharge.'],
  SLOW:['DISCHARGE','VDT over 600 days','Slow growth. BTS advises discharge.'],
  INTERMEDIATE:['SURVEILLANCE','VDT 400–600 days','Offer ongoing surveillance, or biopsy and treatment, depending on patient preference.'],
  FAST:['ACTION','VDT 400 days or less','Treat as growing. Consider biopsy, excision or non-surgical treatment; discuss at MDT.']
};
function vdtOut(){
  const el = app.querySelector('#vd-out');
  let a = parseFloat(S.vd.a), b = parseFloat(S.vd.b); const d = parseFloat(S.vd.days);
  if (!(a > 0 && b > 0 && d > 0)){ el.innerHTML = '<div class="card"><p>Enter both measurements and the interval.</p></div>'; return; }
  if (!S.vd.vol){ a = L.sphereVolume(a); b = L.sphereVolume(b); }
  const g = L.growth(a, b, d), [sev, t, s] = GROWTH[g.category];
  el.innerHTML = result(sev, `Volume change ${g.change >= 0 ? '+' : ''}${L.fixed(g.change * 100, 0)}%`, t, s, g.doublingTimeDays != null ? Math.round(g.doublingTimeDays) + ' d' : '—') +
    src('VDT = t × ln2 ÷ ln(V2/V1)' + (S.vd.vol ? '' : ' · volumes estimated from diameters as spheres') + ' · BTS 2015 Algorithm 2');
}

/* ---- lung cancer ---- */
SCR.cancer = {title:'Lung cancer', tab:'cancer', html:() => `
  <div class="hero"><h3>Lung cancer</h3><p>From diagnosis to treatment lines, following NICE NG122 and NICE technology appraisals.</p></div>
  ${card('TNM staging', '8th and 9th edition, with stage group', 'data-go="tnm"')}
  ${card('Histology and grading', 'WHO 5th edition types and IASLC adenocarcinoma grade', 'data-go="histo"')}
  ${card('Biomarker testing', 'Who to test, what to test, and what each result unlocks', 'data-go="bio"')}
  ${card('Treatment explorer', 'First-line and later lines by stage, histology, driver and PD-L1', 'data-go="tx"')}
  ${card('Diagnosis and staging pathway', 'NG122 investigation sequence', 'data-go="diag"')}`};

SCR.tnm = {title:'TNM staging', html:() => {
  const t = S.tnm, cats = L.tnmCategories(t.ed), sg = L.tnmStage(t.ed, t.t, t.n, t.m);
  const sel = (k, label, list) => `<div class="field"><label for="tnm-${k}">${label}</label><select id="tnm-${k}" data-tnm="${k}">${list.map(c => `<option value="${esc(c.code)}" ${t[k] === c.code ? 'selected' : ''}>${esc(c.code)} · ${esc(c.description)}</option>`).join('')}</select></div>`;
  return chips([{id:'NINTH', label:'9th edition (2025)'}, {id:'EIGHTH', label:'8th edition'}], t.ed, 'ed') +
    `<div class="result info"><div class="stage"><div class="big">${sg ? esc(sg) : '—'}</div><div><div class="tag">Stage group</div><p class="mono">${esc(t.t)} ${esc(t.n)} ${esc(t.m)}</p></div></div></div>` +
    sel('t', 'T · Primary tumour', cats.t) + sel('n', 'N · Regional nodes', cats.n) + sel('m', 'M · Distant metastasis', cats.m) +
    (t.ed === 'NINTH' ? '<div class="card"><p><b style="color:var(--fg)">What changed in the 9th edition:</b> N2 is split into N2a and N2b, and M1c into M1c1 and M1c2. T1N1 is now IIA and T1N2a is IIB.</p></div>' : '') +
    src(`IASLC TNM ${t.ed === 'NINTH' ? '9th' : '8th'} edition · table to be licensed from UICC`);
}};

SCR.histo = {title:'Histology and grading', html:() => {
  const pats = L.adenoPatterns(), p = pats.find(x => x.id === S.gr.pat), g = L.iaslcGrade(S.gr.pat, S.gr.hg);
  return table('Main types (WHO 5th edition)', [['Adenocarcinoma','Most common NSCLC. Includes AIS, MIA, invasive non-mucinous and mucinous types'],['Squamous cell','Central, smoking-related. Driver testing if never or light smoker'],['Large cell / NOS','Diagnosis of exclusion; use IHC (TTF-1, p40) to subtype'],['Neuroendocrine','Typical and atypical carcinoid, LCNEC, small cell carcinoma']]) +
    `<div class="lbl">IASLC grade · invasive non-mucinous adenocarcinoma</div><p style="margin:0;font-size:13px;color:var(--fg-2)">Predominant pattern</p>` +
    chips(pats, S.gr.pat, 'pat') +
    `<label class="sw" for="gr-hg"><span>High-grade patterns ≥20% (solid, micropapillary, cribriform, complex glandular)</span><input type="checkbox" id="gr-hg" ${S.gr.hg || p.alwaysHighGrade ? 'checked' : ''} ${p.alwaysHighGrade ? 'disabled' : ''}></label>` +
    (p.alwaysHighGrade ? '<div class="banner">A solid or micropapillary predominant tumour has at least 20% high-grade pattern by definition.</div>' : '') +
    result(g.grade === 1 ? 'DISCHARGE' : g.grade === 2 ? 'SURVEILLANCE' : 'ACTION', 'IASLC grade', g.description, null, 'G' + g.grade) +
    src('IASLC grading system (Moreira et al., 2020) · WHO 5th edition 2021');
}};

SCR.bio = {title:'Biomarker testing', html:() => { const b = L.biomarkers(); return `
  <div class="card"><h3>Who to test</h3><p>${esc(b.whoToTest)}</p></div><div class="card"><h3>How</h3><p>${esc(b.howToTest)}</p></div>
  ${table('If positive', b.markers.map(m => [m.name, m.ifPositive]))}
  <div class="row"><button class="btn tonal" data-go="tx">Open treatment explorer</button></div>
  ${src('NICE NG122 · NHS National Genomic Test Directory · NICE TAs (check current status)')}`; }};

SCR.diag = {title:'Diagnosis pathway', html:() => `<div class="timeline" style="color:var(--primary)">${L.diagnosisSteps().map(s => `<div class="tl"><span class="d" style="color:var(--fg)">${esc(s.label)}</span><span class="dot"></span><span class="t" style="color:var(--fg)">${esc(s.detail)}</span></div>`).join('')}</div>${src('NICE NG122 (2019, updated 2024) · summarised')}`};

SCR.tx = {title:'Treatment explorer', html:() => {
  const q = S.tx, o = L.treatmentOptions(), t = L.treatment(q.histology, q.stage, q.driver, q.pdL1), sclc = q.histology === 'SMALL_CELL';
  return `<div class="lbl">Histology</div>${chips(o.histology, q.histology, 'txh')}
    <div class="lbl">Stage</div>${chips(o.stage.map(s => ({id:s.id, label: sclc ? s.smallCellLabel : s.label})), q.stage, 'txs')}
    ${t.asksDriver ? `<div class="lbl">Driver</div>${chips(o.driver, q.driver, 'txd')}` : ''}
    ${t.asksPdL1 ? `<div class="lbl">PD-L1 TPS</div>${chips(o.pdL1, q.pdL1, 'txp')}` : ''}
    <div class="lines">${t.lines.map((l, i) => `<div class="line"><span class="n">${i + 1}</span><div><h4>${esc(l.title)}</h4><ul>${l.items.map(x => `<li>${rich(x)}</li>`).join('')}</ul></div></div>`).join('')}</div>
    ${q.histology === 'NSCLC_SQUAMOUS' && t.asksDriver && q.driver !== 'NONE' ? '<div class="banner">Drivers are rare in squamous NSCLC; confirm histology and consider adenosquamous carcinoma.</div>' : ''}
    <div class="banner">Drug availability changes often. Check the current NICE technology appraisal and Cancer Drugs Fund status before prescribing.</div>
    ${src('NICE NG122 · NICE technology appraisals · summarised')}`;
}};

SCR.tools = {title:'Tools', tab:'tools', html:() => `
  <div class="grid2">
    <button class="mini" data-go="brock"><b>Brock</b><span>Nodule malignancy risk</span></button>
    <button class="mini" data-go="herder"><b>Herder</b><span>Post PET-CT risk</span></button>
    <button class="mini" data-go="vdt"><b>Growth / VDT</b><span>Doubling time</span></button>
    <button class="mini" data-go="tnm"><b>TNM 8 / 9</b><span>Stage group</span></button>
    <button class="mini" data-go="histo"><b>IASLC grade</b><span>Adenocarcinoma</span></button>
    <button class="mini" data-go="tx"><b>Treatment lines</b><span>By driver and PD-L1</span></button>
  </div>
  <div class="lbl">About</div>
  <div class="card"><h3>Content version</h3><p class="mono" style="font-size:12.5px">${esc(L.contentVersion)}</p><p>${esc(L.disclaimer)}</p></div>
  <div class="card"><h3>Sources</h3>${L.sources().map(s => `<p style="font-size:12.5px">• ${esc(s)}</p>`).join('')}</div>`};

/* ---------------- render ---------------- */
const NAV = [['home','Home',I.home],['nodules','Nodules',I.nod],['cancer','Cancer',I.lung],['tools','Tools',I.tools]];
const TAB_OF = {wizard:'nodules', nodref:'nodules', brock:'nodules', herder:'nodules', vdt:'nodules', tnm:'cancer', histo:'cancer', bio:'cancer', tx:'cancer', diag:'cancer'};
function render(resetScroll){
  const id = top(), s = SCR[id], ct = s.tab || TAB_OF[id] || 'home';
  const old = app.querySelector('.content'), y = old && !resetScroll ? old.scrollTop : 0;
  app.innerHTML = `<div class="appbar">${S.stack.length > 1 ? `<button class="iconbtn" data-back="1" aria-label="Back">${I.back}</button>` : '<span style="width:8px"></span>'}<h2>${esc(s.title)}</h2></div>
    <div class="content">${s.html()}</div>
    <nav class="nav">${NAV.map(([k, l, ic]) => `<button class="${ct === k ? 'on' : ''}" data-tab="${k}"><span class="pill">${ic}</span>${l}</button>`).join('')}</nav>
    ${disclaimerHtml()}`;
  if (s.mount) s.mount();
  app.querySelector('.content').scrollTop = y;
}
const DISC_KEY = 'lungpath-disclaimer-' + L.contentVersion;
function disclaimerHtml(){
  if (store.get(DISC_KEY) === 'yes') return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="disc-t"><div class="box"><h3 id="disc-t">Before you start</h3><p>${esc(L.disclaimer)}</p><div class="row"><button class="btn" data-accept="1">I understand</button></div></div></div>`;
}

function copyText(txt){
  const fallback = () => { const pre = app.querySelector('#copysrc'); if (pre){ pre.hidden = false; const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Select and copy the text'); } };
  try { navigator.clipboard.writeText(txt).then(() => toast('Summary copied'), fallback); } catch (e) { fallback(); }
}

app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.accept){ store.set(DISC_KEY, 'yes'); const m = app.querySelector('.modal'); if (m) m.remove(); return; }
  if (d.back) return back();
  if (d.tab) return tab(d.tab);
  if (d.go) return go(d.go);
  if (d.copy) return copyText(S.copy);
  if (d.share){ navigator.share({title:'Nodule summary', text:S.copy}).catch(() => {}); return; }
  if (d.start){ newW(); S.stack = ['nodules', 'wizard']; return render(true); }
  if (d.sample){
    newW(d.sample === '1'
      ? {type:'SOLID', size:'9', brock:{age:67,female:true,familyHistory:false,emphysema:true,upperLobe:true,noduleCount:1,spiculation:true}}
      : {type:'PART_SOLID', size:'12', brock:{age:58,female:false,familyHistory:false,emphysema:false,upperLobe:true,noduleCount:1,spiculation:false}});
    S.w.hist = ['EXCL', 'TYPE', 'SIZE']; S.w.step = 'RESULT'; S.stack = ['nodules', 'wizard']; return render(true);
  }
  if (d.excl){ const x = S.w.exclusions, i = x.indexOf(d.excl); if (i >= 0) x.splice(i, 1); else x.push(d.excl); return render(); }
  if (d.next === 'EXCL') return step(S.w.exclusions.length ? 'RESULT' : 'TYPE');
  if (d.type){ S.w.type = d.type; return step('SIZE'); }
  if (d.unit){ S.w.unit = d.unit; S.w.size = ''; return render(); }
  if (d.next === 'SIZE'){ if (!(parseFloat(S.w.size) > 0)){ toast('Enter a size first'); return; } return step('RESULT'); }
  if (d.pet){ S.w.pet = d.pet; return render(true); }
  if (d.subsolid){ S.w.subsolid = d.subsolid; return render(); }
  if (d.bktype){ S.bk.type = d.bktype; return render(); }
  if (d.hup){ S.hd.up = d.hup; return render(); }
  if (d.vmode){ S.vd.vol = d.vmode === 'vol'; if (S.vd.vol){ S.vd.a = '180'; S.vd.b = '260'; } else { S.vd.a = '7'; S.vd.b = '8'; } return render(); }
  if (d.ed){ const t = S.tnm; t.ed = d.ed; t.n = L.convertN(t.n, t.ed); t.m = L.convertM(t.m, t.ed); return render(); }
  if (d.pat){ S.gr.pat = d.pat; return render(); }
  if (d.txh){ S.tx.histology = d.txh; return render(); }
  if (d.txs){ S.tx.stage = d.txs; return render(); }
  if (d.txd){ S.tx.driver = d.txd; return render(); }
  if (d.txp){ S.tx.pdL1 = d.txp; return render(); }
});

app.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (el.id === 'sz'){ S.w.size = el.value; return; }
  if (d.bk){
    const b = d.bctx === 'wz' ? S.w.brock : S.bk.brock;
    if (el.type === 'checkbox') b[d.bk] = el.checked;
    else { const v = parseInt(el.value, 10); if (v > 0) b[d.bk] = v; else return; }
    if (d.bctx === 'wz'){ S.w.pet = null; renderWizardResult(); } else brockOut();
    return;
  }
  if (d.calc === 'bk-size'){ S.bk.size = el.value; return brockOut(); }
  if (d.calc === 'hd-p'){ S.hd.p = el.value; return herderOut(); }
  if (d.calc === 'vd-a'){ S.vd.a = el.value; return vdtOut(); }
  if (d.calc === 'vd-b'){ S.vd.b = el.value; return vdtOut(); }
  if (d.calc === 'vd-d'){ S.vd.days = el.value; return vdtOut(); }
});
app.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.tnm){ S.tnm[el.dataset.tnm] = el.value; return render(); }
  if (el.id === 'gr-hg'){ S.gr.hg = el.checked; return render(); }
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sz'){ const b = app.querySelector('[data-next="SIZE"]'); if (b) b.click(); } });

render(true);
})();
