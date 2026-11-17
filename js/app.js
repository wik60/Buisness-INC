// UI layer for Delusional Business Inc.
import * as E from './engine.js';
import { CITIES, KINDS, SIZES, BUSINESS_TYPES, BT, POSITIONS, OFFICE_ROLES, TAX_BRACKETS, TAX_PERIOD, JOB_LADDER, DAYS_PER_PROMOTION } from './data.js';

const KEY = 'dbi-save-v1';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------- state
let S = load();
const ui = {
  tab: 'home',
  stacks: { home: [], biz: [], prop: [], hire: [], fin: [] },
  prop: { mode: 'market', city: 'warsaw', kind: 'commercial', sort: 'price' },
  hire: { src: 'recruit', source: 'jobCenter', bizId: null, pos: 'floor', count: 3, days: 3, staffBiz: 'all' },
  expand: new Set(),
  busy: false,
};
let sheet = null; // { el, back, render }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? E.migrate(JSON.parse(raw)) : null;
  } catch (e) { console.warn(e); return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save: storage full', 'bad'); }
}

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, o) => E.fmt(v, o);
const signed = v => (v >= 0 ? '+' : '') + money(v);
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const pct = v => `${Math.round(v * 100)}%`;
const bizImg = t => `assets/biz/${t}.svg`;
const uiImg = n => `assets/ui/${n}.svg`;
const plural = (n, w) => `${n} ${n === 1 ? w : w === 'person' ? 'people' : w + 's'}`;

function trafficBars(v) {
  const n = Math.max(1, Math.ceil(v / 20));
  return `<span class="traffic" title="Customer flow ${v}">${[6, 9, 12, 15, 18].map((h, i) => `<i class="${i < n ? 'on' : ''}" style="height:${h}px"></i>`).join('')}<span>${v}</span></span>`;
}
const skillBar = s => `<span class="skill"><span class="bar ${s >= 70 ? 'green' : s < 30 ? 'orange' : ''}"><i style="width:${Math.round(s)}%"></i></span>${Math.round(s)}</span>`;

function sparkline(vals, w = 96, h = 36, stroke = '#fff') {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / r * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function lineChart(vals, color = 'var(--tint)') {
  const w = 340, h = 160, pad = 6;
  if (vals.length < 2) return `<div class="center muted small" style="padding:50px 0">Simulate a few days to see the chart</div>`;
  const min = Math.min(0, ...vals), max = Math.max(...vals), r = max - min || 1;
  const xy = vals.map((v, i) => [pad + i / (vals.length - 1) * (w - 2 * pad), h - 18 - (v - min) / r * (h - 36)]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const zeroY = h - 18 - (0 - min) / r * (h - 36);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${w}" y1="${zeroY}" y2="${zeroY}" stroke="var(--sep)" stroke-dasharray="3 4"/>
    <path d="${line}L${xy.at(-1)[0]} ${h - 18}L${xy[0][0]} ${h - 18}Z" fill="url(#lg)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <text x="${w - 4}" y="12" text-anchor="end" font-size="11" fill="var(--label2)">${money(max)}</text>
  </svg>`;
}
function barChart(vals) {
  const w = 340, h = 140;
  if (!vals.length) return `<div class="center muted small" style="padding:40px 0">No data yet</div>`;
  const max = Math.max(1, ...vals.map(Math.abs));
  const hasNeg = vals.some(v => v < 0);
  const zero = hasNeg ? h / 2 : h - 4;
  const scale = (hasNeg ? h / 2 - 6 : h - 10) / max;
  const bw = w / vals.length;
  return `<svg class="chart" style="height:140px" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line x1="0" x2="${w}" y1="${zero}" y2="${zero}" stroke="var(--sep)"/>
    ${vals.map((v, i) => { const bh = Math.max(1, Math.abs(v) * scale); return `<rect x="${(i * bw + bw * .15).toFixed(1)}" y="${(v >= 0 ? zero - bh : zero).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${v >= 0 ? 'var(--green)' : 'var(--red)'}"/>`; }).join('')}
  </svg>`;
}
function ring(frac, color = 'var(--tint)', label = '') {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--fill2)" stroke-width="7"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" font-size="15" font-weight="700" fill="var(--label)">${label}</text></svg>`;
}

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  biz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18"/></svg>',
  prop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 21V8l6-4v17M10 21V10l10 3v8M2 21h20M14 15h2M14 18h2M6.5 11h1M6.5 14h1M6.5 17h1"/></svg>',
  hire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9.5" cy="8" r="4"/><path d="M2 21c.5-4 3.5-6 7.5-6s7 2 7.5 6M19 8v6M16 11h6"/></svg>',
  fin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/></svg>',
};
const TABS = [['home', 'Home'], ['biz', 'Business'], ['prop', 'Property'], ['hire', 'Hire'], ['fin', 'Finance']];

// ---------------------------------------------------------------- toast / alert / sheet
let toastTimer;
function toast(msg, tone = '', onTap) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.className = `toast glass ${tone}`;
  t.innerHTML = msg;
  t.onclick = onTap ? () => { t.classList.remove('show'); onTap(); } : null;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), onTap ? 3200 : 2600);
}
function fail(err) { if (err && typeof err === 'string') { toast(`⚠️ ${esc(err)}`, 'bad'); return true; } return false; }

function confirmDialog(title, msg, ok = 'OK', destructive = false) {
  return new Promise(res => {
    const w = document.createElement('div');
    w.className = 'alert-wrap';
    w.innerHTML = `<div class="alert glass"><h4>${title}</h4><p>${msg}</p>
      <button class="btn block ${destructive ? 'red' : ''}" data-r="1">${ok}</button>
      <button class="btn block gray" data-r="0">Cancel</button></div>`;
    document.body.append(w);
    requestAnimationFrame(() => w.classList.add('show'));
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== w) return;
      w.classList.remove('show');
      setTimeout(() => w.remove(), 200);
      res(b ? b.dataset.r === '1' : false);
    });
  });
}

function openSheet(title, render, opts = {}) {
  closeSheet(true);
  const back = document.createElement('div');
  back.className = 'backdrop';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="grabber"></div><div class="sheet-head"><span style="width:34px">${opts.left || ''}</span><h3>${title}</h3><button class="close" data-act="closeSheet" aria-label="Close">✕</button></div><div class="sheet-body"></div>`;
  $('#app').append(back, el);
  sheet = { el, back, render, title };
  refreshSheet();
  requestAnimationFrame(() => { back.classList.add('show'); el.classList.add('show'); });
  back.addEventListener('click', () => closeSheet());
  // drag to dismiss
  let y0 = null, dy = 0;
  const head = el.querySelector('.sheet-head'), grab = el.querySelector('.grabber');
  for (const h of [head, grab]) {
    h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; el.style.transition = 'none'; }, { passive: true });
    h.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
    h.addEventListener('touchend', () => { el.style.transition = ''; el.style.transform = ''; if (dy > 110) closeSheet(); y0 = null; dy = 0; });
  }
}
function refreshSheet() {
  if (!sheet || !sheet.render) return;
  const body = sheet.el.querySelector('.sheet-body');
  const st = body.scrollTop;
  const html = sheet.render();
  if (html == null) return closeSheet();
  body.innerHTML = html;
  body.scrollTop = st;
}
function closeSheet(instant) {
  if (!sheet) return;
  const { el, back } = sheet;
  sheet = null;
  if (instant) { el.remove(); back.remove(); return; }
  el.classList.remove('show'); back.classList.remove('show');
  setTimeout(() => { el.remove(); back.remove(); }, 380);
}

// ---------------------------------------------------------------- render loop
function refresh() {
  render();
  refreshSheet();
}
function currentView() {
  const st = ui.stacks[ui.tab];
  return st.length ? st[st.length - 1] : { view: ui.tab };
}
function render(anim) {
  if (!S) return renderOnboarding();
  const app = $('#app');
  let screen = $('#screen');
  const v = currentView();
  const key = `${ui.tab}:${v.view}:${v.id || ''}`;
  const keep = screen && screen.dataset.key === key ? screen.scrollTop : 0;
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'screen';
    app.append(screen);
    screen.addEventListener('scroll', () => {
      const nb = screen.querySelector('.navbar');
      if (nb) nb.classList.toggle('scrolled', screen.scrollTop > 36);
    }, { passive: true });
  }
  screen.className = 'screen' + (anim ? ` ${anim}` : '');
  screen.dataset.key = key;
  const views = { home: viewHome, biz: viewBizList, bizDetail: viewBizDetail, prop: viewProperty, hire: viewHire, fin: viewFinance };
  screen.innerHTML = (views[v.view] || viewHome)(v);
  screen.scrollTop = keep;
  const nb = screen.querySelector('.navbar');
  if (nb) nb.classList.toggle('scrolled', screen.scrollTop > 36);
  renderDock();
  if (S.gameOver && !sheet) showGameOver();
}

function navbar(title, { left = '<span class="nav-spacer"></span>', right = '<span class="nav-spacer"></span>' } = {}) {
  return `<div class="navbar">${left}<div class="nav-title">${esc(title)}</div><div style="display:flex;gap:8px">${right}</div></div>`;
}
const backBtn = label => `<button class="nav-btn tint" data-act="back">‹ ${esc(label)}</button>`;

function renderDock() {
  let dock = $('#dock');
  if (!dock) { dock = document.createElement('div'); dock.id = 'dock'; dock.className = 'dock'; $('#app').append(dock); }
  const est = E.taxEstimate(S);
  const sub = S.cash < 0 ? `<span class="neg">Overdraft · bankrupt in ${14 - S.negDays} days</span>` : `Tax in ${plural(est.daysLeft, 'day')} · ${money(S.cash)}`;
  const hireBadge = '';
  dock.innerHTML = `
    <div class="accessory glass">
      <div class="day"><b>Day ${S.day} · ${DOW[S.day % 7]}</b><span>${sub}</span></div>
      <button class="ff" data-act="sim7" ${ui.busy ? 'disabled' : ''} aria-label="Simulate 7 days">+7</button>
      <button class="go" data-act="sim1" ${ui.busy ? 'disabled' : ''}>Next Day ▶</button>
    </div>
    <nav class="tabbar glass">${TABS.map(([id, label]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${ICONS[id]}<span>${label}</span>${id === 'hire' ? hireBadge : ''}</button>`).join('')}</nav>`;
}

// ---------------------------------------------------------------- onboarding
function renderOnboarding() {
  $('#app').innerHTML = `<div class="onboard">
    <img class="icon" src="assets/icon.svg" alt="">
    <h1>Delusional<br>Business Inc.</h1>
    <p>You have a normal job, $2,500 and an unreasonable amount of confidence. Rent a shop in Warsaw, London or New York, hire people and simulate your way to billionaire.</p>
    <input class="field" id="ceo" placeholder="Your name, CEO" maxlength="24" autocomplete="off">
    <button class="btn block" data-act="start">Start my empire</button>
  </div>`;
}

// ---------------------------------------------------------------- HOME
function viewHome() {
  const nw = E.netWorth(S);
  const last = S.lastReport;
  const est = E.taxEstimate(S);
  const job = E.jobInfo(S);
  const cashHist = S.ledger.slice(-30).map(x => x.cash);
  const nextPromo = DAYS_PER_PROMOTION - (S.job.daysWorked % DAYS_PER_PROMOTION);
  return `${navbar('Day ' + S.day, { left: `<button class="nav-btn icon" data-act="help" aria-label="How to play">?</button>`, right: `<button class="nav-btn icon" data-act="settings" aria-label="Settings">⚙︎</button>` })}
  <div class="wrap">
    <div class="large-title">Day ${S.day}</div>
    <div class="subtitle">${esc(S.ceo)} · ${E.rankFor(nw)}</div>
    <div class="hero">
      <div class="spark">${sparkline(cashHist)}</div>
      <div class="label">Cash</div>
      <div class="big">${money(S.cash, { compact: Math.abs(S.cash) >= 1e7 })}</div>
      <div class="stats">
        <div class="stat"><b>${money(nw)}</b><span>Net worth</span></div>
        <div class="stat"><b>${last ? signed(last.net) : '—'}</b><span>Yesterday</span></div>
      </div>
    </div>
    ${S.cash < 0 ? `<div class="card mt" style="border:1px solid var(--red)"><b class="neg">You're in overdraft.</b><div class="small muted mt" style="margin-top:4px">0.2% daily interest. Stay negative ${14 - S.negDays} more days and you go bankrupt.</div></div>` : ''}
    <div class="group mt">
      <button class="row with-icon" data-act="tab" data-tab="fin">
        ${ring(1 - (est.daysLeft - 1) / TAX_PERIOD, 'var(--red)', est.daysLeft)}
        <div class="grow"><div class="title">Income tax in ${plural(est.daysLeft, 'day')}</div>
        <div class="sub">Estimate ${money(est.due)} · top bracket ${pct(est.top)}</div></div><span class="chev"></span>
      </button>
    </div>
    <div class="section-h"><h2>Day Job</h2></div>
    <div class="group">
      <div class="row with-icon"><img class="tile" src="${uiImg('job')}" alt="">
        <div class="grow"><div class="title">${S.job.employed ? esc(job.title) : 'Unemployed (by choice)'}</div>
        <div class="sub">${S.job.employed ? `${money(job.pay)}/day · ${S.job.level < JOB_LADDER.length - 1 ? `promotion in ${plural(nextPromo, 'day')}` : 'top of the ladder'}` : 'Full-time CEO. No safety net.'}</div></div>
        ${S.job.employed ? `<button class="btn sm red" data-act="quitJob">Quit</button>` : `<button class="btn sm gray" data-act="rejoinJob">Get a job</button>`}
      </div>
    </div>
    <div class="section-h"><h2>Businesses</h2>${S.businesses.length ? `<button class="link" data-act="newBiz">New</button>` : ''}</div>
    ${S.businesses.length ? `<div class="group">${S.businesses.map(b => bizRow(b)).join('')}</div>` : emptyBiz()}
    ${S.log.length ? `<div class="section-h"><h2>Activity</h2></div><div class="group">${S.log.slice(0, 8).map(e => `<div class="event"><span class="dot ${e.tone}"></span><div class="grow">${esc(e.text)}<div class="small muted">Day ${e.day}</div></div></div>`).join('')}</div>` : ''}
  </div>`;
}
function emptyBiz() {
  return `<div class="card empty"><img src="assets/icon.svg" alt=""><h3>Start your empire</h3><p>Pick one of 20 business types. A coffee shop costs just ${money(BT.coffee.license)} to register.</p><button class="btn" data-act="newBiz">New Business</button></div>`;
}
function bizRow(b) {
  const issues = E.requirements(S, b);
  const p = b.last;
  return `<button class="row with-icon" data-act="openBiz" data-id="${b.id}"><img class="tile" src="${bizImg(b.type)}" alt="">
    <div class="grow"><div class="title">${esc(b.name)}</div><div class="sub">${issues.length ? '⚠️ ' + esc(issues[0]) : `${BT[b.type].name} · ${E.workersOf(S, b.id).length} staff`}</div></div>
    <div class="value ${p ? cls(p.profit) : ''}">${p ? signed(p.profit) : ''}</div><span class="chev"></span></button>`;
}

// ---------------------------------------------------------------- BUSINESSES
function viewBizList() {
  const tot = S.businesses.reduce((a, b) => a + (b.last ? b.last.profit : 0), 0);
  return `${navbar('Businesses', { right: `<button class="nav-btn icon tint" data-act="newBiz" aria-label="New business">＋</button>` })}
  <div class="wrap">
    <div class="large-title">Businesses</div>
    <div class="subtitle">${plural(S.businesses.length, 'company')} · ${plural(S.workers.length, 'employee')}</div>
    ${S.businesses.length ? `<div class="grid2" style="margin-bottom:14px">
      <div class="metric"><div class="k">Profit yesterday</div><div class="v ${cls(tot)}">${signed(tot)}</div></div>
      <div class="metric"><div class="k">Payroll / day</div><div class="v">${money(S.workers.reduce((a, w) => a + E.wageFor(S, w), 0))}</div></div></div>` : ''}
    ${S.businesses.length ? S.businesses.map(b => bizCard(b)).join('') : emptyBiz()}
  </div>`;
}
function bizCard(b) {
  const t = BT[b.type];
  const issues = E.requirements(S, b);
  const main = E.parcelById(S, b.mainId);
  return `<button class="biz-card" data-act="openBiz" data-id="${b.id}">
    <img class="tile lg" src="${bizImg(b.type)}" alt="">
    <div class="grow" style="flex:1;min-width:0">
      <div class="title bold" style="font-size:17px">${esc(b.name)}</div>
      <div class="small muted">${t.name}${main ? ` · ${CITIES[main.city].flag} ${esc(E.districtOf(main).name)}` : ''}</div>
      <div class="meta">${issues.length ? '<span class="pill orange">Setup needed</span>' : '<span class="pill green">Open</span>'}
        <span class="pill">👥 ${E.workersOf(S, b.id).length}</span><span class="pill">⭐ ${Math.round(b.rep)}</span>
        ${b.last ? `<span class="pill ${b.last.profit >= 0 ? 'green' : 'red'}">${signed(b.last.profit)}</span>` : ''}</div>
    </div><span class="chev"></span></button>`;
}

function viewBizDetail(v) {
  const b = E.bizById(S, v.id);
  if (!b) { ui.stacks[ui.tab].pop(); return viewBizList(); }
  const t = BT[b.type];
  const issues = E.requirements(S, b);
  const main = E.parcelById(S, b.mainId), office = E.parcelById(S, b.officeId), wh = E.parcelById(S, b.warehouseId);
  const L = b.last;
  const cityCost = CITIES[main ? main.city : 'london'].cost;
  const adPresets = [0, 50, 250, 1000, 5000, 25000].map(x => Math.round(x * cityCost / 10) * 10);
  const backLabel = ui.tab === 'home' ? 'Home' : 'Businesses';
  return `${navbar(b.name, { left: backBtn(backLabel), right: `<button class="nav-btn icon" data-act="renameBiz" data-id="${b.id}" aria-label="Rename">✎</button>` })}
  <div class="wrap">
    <div class="biz-head"><img class="tile xl" src="${bizImg(b.type)}" alt="">
      <h1>${esc(b.name)}</h1>
      <div class="muted">${t.name}${main ? ` · ${CITIES[main.city].flag} ${esc(E.districtOf(main).name)}, ${CITIES[main.city].name}` : ''}</div>
      ${issues.length ? '<span class="pill orange">Closed · setup needed</span>' : '<span class="pill green">Open for business</span>'}
    </div>
    ${issues.length ? `<div class="section-h"><h2>Setup checklist</h2></div><div class="group">${checklist(b)}</div>` : ''}
    ${L && !issues.length ? `<div class="grid2">
      <div class="metric"><div class="k">Revenue</div><div class="v">${money(L.revenue)}</div><div class="s">yesterday</div></div>
      <div class="metric"><div class="k">Profit</div><div class="v ${cls(L.profit)}">${signed(L.profit)}</div><div class="s">after all costs</div></div>
      <div class="metric"><div class="k">Customers</div><div class="v">${fmtNum(L.customers)}</div><div class="s">of ${fmtNum(L.demand)} wanted · cap ${fmtNum(L.capacity)}</div></div>
      <div class="metric"><div class="k">Satisfaction</div><div class="v">${L.sat ?? '—'}</div><div class="s">reputation ${Math.round(b.rep)}/100</div></div>
    </div>
    ${L.notes.length ? `<div class="group mt">${L.notes.map(n => `<div class="event"><span class="dot bad"></span><div>${esc(n)}</div></div>`).join('')}</div>` : ''}
    <div class="card mt"><div class="kv"><span>Revenue</span><span>${money(L.revenue)}</span></div><div class="kv"><span>Goods & materials</span><span class="neg">−${money(L.cogs)}</span></div>
      <div class="kv"><span>Wages</span><span class="neg">−${money(L.wages)}</span></div><div class="kv"><span>Property</span><span class="neg">−${money(L.property)}</span></div>
      ${L.ads ? `<div class="kv"><span>Ads</span><span class="neg">−${money(L.ads)}</span></div>` : ''}</div>` : ''}
    ${b.history.length > 1 ? `<div class="section-h"><h2>Profit, last ${Math.min(30, b.history.length)} days</h2></div><div class="card">${barChart(b.history.slice(-30).map(h => h.profit))}</div>` : ''}

    <div class="section-h"><h2>Locations</h2></div>
    <div class="group">
      ${locRow(b, 'main', main, `Main location`, t.premises.includes('office') ? 'commercial' : 'commercial')}
      ${t.warehouse ? locRow(b, 'warehouse', wh, 'Warehouse', 'warehouse') : ''}
      ${locRow(b, 'office', office, 'Office (HR, Recruiters…)', 'office')}
    </div>
    <div class="footnote">${t.premises.includes('office') ? 'Main location can be a commercial parcel or an office. ' : ''}Needs ${SIZES[t.minSize].label} size or bigger${t.airport ? ' at an airport' : ''}.${t.warehouse ? ' Each warehouse worker supports about two floor staff.' : ''}</div>

    <div class="section-h"><h2>Staff</h2></div>
    ${staffGroup(b, 'floor', t.role + 's', main)}
    ${t.warehouse ? staffGroup(b, 'warehouse', 'Warehouse workers', wh) : ''}
    ${staffGroup(b, 'office', 'Office staff', office)}

    <div class="section-h"><h2>Advertising</h2></div>
    <div class="card"><div class="kv" style="padding-top:0"><span>Daily ad budget</span><b>${money(b.ads)}/day</b></div>
      <div class="presets">${adPresets.map(a => `<button class="${b.ads === a ? 'on' : ''}" data-act="ads" data-id="${b.id}" data-v="${a}">${a ? money(a) : 'Off'}</button>`).join('')}</div>
      <div class="small muted mt" style="margin-top:10px">Ads raise demand with diminishing returns. Only worth it when you have spare capacity.</div></div>

    <button class="btn block red mt2" data-act="closeBiz" data-id="${b.id}">Close business</button>
    <div class="footnote center">Founded on day ${b.founded}</div>
  </div>`;
}
const fmtNum = n => n >= 100 ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 10) / 10).toString();

function checklist(b) {
  const t = BT[b.type];
  const items = [];
  const main = E.parcelById(S, b.mainId), wh = E.parcelById(S, b.warehouseId);
  items.push([!!main, `Location (${SIZES[t.minSize].label}+ ${t.premises.join('/')})`, `data-act="pick" data-biz="${b.id}" data-slot="main"`, 'Choose']);
  if (t.warehouse) items.push([!!wh, 'Warehouse', `data-act="pick" data-biz="${b.id}" data-slot="warehouse"`, 'Choose']);
  items.push([E.workersOf(S, b.id, 'floor').length > 0, `Hire ${t.role}s`, `data-act="hireFor" data-biz="${b.id}" data-pos="floor"`, 'Hire', !main]);
  if (t.warehouse) items.push([E.workersOf(S, b.id, 'warehouse').length > 0, 'Hire warehouse workers', `data-act="hireFor" data-biz="${b.id}" data-pos="warehouse"`, 'Hire', !wh]);
  return items.map(([done, label, act, btn, disabled]) => `<div class="row"><span class="check ${done ? 'on' : ''}"></span><div class="grow"><div class="title" style="${done ? 'color:var(--label2)' : ''}">${label}</div></div>
    ${done ? '' : `<button class="btn sm ${disabled ? 'gray' : ''}" ${act} ${disabled ? 'disabled' : ''}>${btn}</button>`}</div>`).join('');
}

function parcelSub(p) {
  const d = E.districtOf(p);
  const cost = p.status === 'rented' ? `rent ${money(p.rentLocked)}/day` : p.status === 'owned' ? `owned · upkeep ${money(E.parcelDailyCost(S, p))}/day` : '';
  return `${CITIES[p.city].flag} ${esc(d.name)} · ${SIZES[p.size].label}, ${p.cap} staff · flow ${p.traffic}${cost ? ' · ' + cost : ''}`;
}
function locRow(b, slot, p, label, kind) {
  if (!p) return `<div class="row with-icon"><img class="tile" src="${KINDS[slot === 'main' ? 'commercial' : kind].img}" alt="" style="opacity:.5"><div class="grow"><div class="title">${label}</div><div class="sub">Not set${slot === 'office' ? ' · optional' : ''}</div></div><button class="btn sm" data-act="pick" data-biz="${b.id}" data-slot="${slot}">Choose</button></div>`;
  return `<button class="row with-icon" data-act="parcel" data-id="${p.id}"><img class="tile" src="${KINDS[p.kind].img}" alt=""><div class="grow"><div class="title">${label}: ${esc(p.address)}</div><div class="sub">${parcelSub(p)}</div></div><span class="chev"></span></button>`;
}

function staffGroup(b, group, label, parcel) {
  const isOffice = group === 'office';
  const ws = S.workers.filter(w => w.bizId === b.id && (isOffice ? OFFICE_ROLES.includes(w.pos) : w.pos === group)).sort((a, c) => c.skill - a.skill);
  const cap = parcel ? parcel.cap : 0;
  const key = `${b.id}:${group}`;
  const shown = ui.expand.has(key) ? ws : ws.slice(0, 6);
  const head = `<div class="row"><div class="grow"><div class="title">${label}</div><div class="sub">${parcel ? `${ws.length}/${cap} spots · ${money(ws.reduce((a, w) => a + E.wageFor(S, w, b), 0))}/day` : 'Needs a location first'}</div></div>
    ${parcel ? `<button class="btn sm" data-act="hireFor" data-biz="${b.id}" data-pos="${isOffice ? (ws.some(w => w.pos === 'recruiter') ? 'hr' : 'recruiter') : group}" ${ws.length >= cap ? 'disabled' : ''}>Hire</button>` : ''}</div>`;
  const rows = shown.map(w => `<button class="row" data-act="worker" data-id="${w.id}"><div class="grow"><div class="title">${esc(w.name)}</div><div class="sub">${isOffice ? POSITIONS[w.pos].name + ' · ' : ''}${money(E.wageFor(S, w, b))}/day</div></div>${skillBar(w.skill)}</button>`).join('');
  const more = ws.length > 6 ? `<button class="list-more" data-act="expand" data-key="${key}">${ui.expand.has(key) ? 'Show less' : `Show all ${ws.length}`}</button>` : '';
  return `<div class="group">${head}${rows}${more}</div>${isOffice && parcel && !ws.length ? `<div class="footnote">Office roles: Recruiter (skilled hires), HR Manager (training, needed above 15 staff), Accountant (lower tax), Marketing Manager (more customers).</div>` : ''}`;
}

// ---------------------------------------------------------------- PROPERTY
function viewProperty() {
  const mine = S.parcels.filter(p => p.status !== 'market');
  const P = ui.prop;
  return `${navbar('Property')}
  <div class="wrap">
    <div class="large-title">Property</div>
    <div class="subtitle">Rent or buy parcels, offices and warehouses</div>
    <div class="seg" style="margin-bottom:14px">
      <button class="${P.mode === 'market' ? 'on' : ''}" data-act="propMode" data-v="market">Market</button>
      <button class="${P.mode === 'mine' ? 'on' : ''}" data-act="propMode" data-v="mine">My Property (${mine.length})</button>
    </div>
    ${P.mode === 'market' ? marketView() : mineView(mine)}
  </div>`;
}
function cityHero(cityId) {
  const c = CITIES[cityId];
  const idx = S.index[cityId];
  return `<div class="city-hero" style="background-image:url(assets/city/${cityId}.svg)"><div class="tag"><b>${c.flag} ${c.name}</b><span>Price index ${(idx * 100).toFixed(1)} · wages ×${c.wage} · spending ×${c.spend}</span></div></div>`;
}
function citySeg(act, cur) {
  return `<div class="seg">${Object.values(CITIES).map(c => `<button class="${cur === c.id ? 'on' : ''}" data-act="${act}" data-v="${c.id}">${c.flag} ${c.name}</button>`).join('')}</div>`;
}
function marketView() {
  const P = ui.prop;
  const city = CITIES[P.city];
  const sorters = { price: (a, b) => a.basePrice - b.basePrice, traffic: (a, b) => b.traffic - a.traffic, size: (a, b) => b.cap - a.cap };
  const groups = city.districts.map(d => ({ d, list: S.parcels.filter(p => p.city === P.city && p.district === d.id && p.kind === P.kind && p.status === 'market').sort(sorters[P.sort]) })).filter(g => g.list.length);
  if (P.sort !== 'price') groups.sort((a, b) => P.sort === 'traffic' ? b.d.traffic - a.d.traffic : b.list[0].cap - a.list[0].cap);
  return `${citySeg('propCity', P.city)}
    <div class="mt">${cityHero(P.city)}</div>
    <div class="chips mt">${Object.entries(KINDS).map(([k, v]) => `<button class="chip ${P.kind === k ? 'on' : ''}" data-act="propKind" data-v="${k}">${v.short}</button>`).join('')}
      <span style="width:8px;flex:none"></span>
      ${[['price', 'Cheapest'], ['traffic', 'Busiest'], ['size', 'Biggest']].map(([k, l]) => `<button class="chip ${P.sort === k ? 'on' : ''}" data-act="propSort" data-v="${k}">${l}</button>`).join('')}</div>
    ${groups.length ? groups.map(g => `<div class="dist-h"><b>${esc(g.d.name)}</b><span class="small muted">${'$'.repeat(Math.max(1, Math.round(g.d.price * 2)))} · ${g.d.big ? '✈︎ airport · ' : ''}flow ~${g.d.traffic}</span></div>
      <div class="group">${g.list.map(p => marketRow(p)).join('')}</div>`).join('') : `<div class="card empty"><p>No ${KINDS[P.kind].short.toLowerCase()} listings left in ${city.name}.</p></div>`}`;
}
function marketRow(p) {
  return `<button class="row with-icon" data-act="parcel" data-id="${p.id}"><img class="tile" src="${KINDS[p.kind].img}" alt="">
    <div class="grow"><div class="title">${SIZES[p.size].label} · ${p.cap} staff</div><div class="sub">${esc(p.address)}</div><div style="margin-top:4px">${trafficBars(p.traffic)}</div></div>
    <div class="value"><div style="color:var(--label);font-weight:600">${money(E.parcelRent(S, p))}<span class="small muted">/day</span></div><div class="small">buy ${money(E.parcelValue(S, p))}</div></div></button>`;
}
function mineView(mine) {
  if (!mine.length) return `<div class="card empty"><img src="${uiImg('commercial')}" alt=""><h3>No property yet</h3><p>Rent a parcel to open your first business. Renting is cheap to start; buying saves money long-term and can gain value.</p><button class="btn" data-act="propMode" data-v="market">Browse market</button></div>`;
  const daily = mine.reduce((a, p) => a + E.parcelDailyCost(S, p), 0);
  const owned = mine.filter(p => p.status === 'owned').reduce((a, p) => a + E.parcelValue(S, p), 0);
  return `<div class="grid2"><div class="metric"><div class="k">Daily cost</div><div class="v">${money(daily)}</div></div><div class="metric"><div class="k">Owned value</div><div class="v">${money(owned)}</div></div></div>
    <div class="group mt">${mine.map(p => {
      const b = E.bizById(S, p.bizId);
      return `<button class="row with-icon" data-act="parcel" data-id="${p.id}"><img class="tile" src="${KINDS[p.kind].img}" alt="">
        <div class="grow"><div class="title">${esc(p.address)}</div><div class="sub">${parcelSub(p)}</div><div class="sub">${b ? `Used by ${esc(b.name)}` : '<span class="neg">Unused — still costs money</span>'}</div></div>
        <span class="pill ${p.status === 'owned' ? 'blue' : ''}">${p.status === 'owned' ? 'Owned' : 'Rented'}</span></button>`;
    }).join('')}</div>`;
}

// parcel detail sheet
function parcelSheet(id, ctx = {}) {
  openSheet('Property', () => {
    const p = E.parcelById(S, id);
    if (!p) return null;
    const d = E.districtOf(p);
    const b = E.bizById(S, p.bizId);
    const val = E.parcelValue(S, p);
    let actions = '';
    if (p.status === 'market') {
      const opts = assignOptions(p);
      const sel = ctx.assign || (opts[0] ? opts[0].v : '');
      actions = `<div class="mt2"><label class="small muted" style="margin-left:4px">Use it for</label>
        <select class="field mt" style="margin-top:6px" id="assignSel">${opts.map(o => `<option value="${o.v}" ${o.v === sel ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}<option value="" ${sel === '' ? 'selected' : ''}>Nothing yet (just acquire)</option></select></div>
        <div class="btn-row mt"><button class="btn gray" data-act="acquire" data-id="${p.id}" data-mode="rent">Rent ${money(E.parcelRent(S, p))}/day</button><button class="btn" data-act="acquire" data-id="${p.id}" data-mode="buy">Buy ${money(val)}</button></div>
        <div class="footnote">Renting costs ${money(E.moveInCost(S, p))} up front (${3} days), then ${money(E.parcelRent(S, p))}/day. Buying costs ${money(val)} once, then ${money(Math.round(val * 0.0002))}/day upkeep. Sell any time for 95% of market value.</div>`;
    } else {
      const opts = assignOptions(p);
      actions = `${b ? `<div class="group mt2"><button class="row with-icon" data-act="openBiz" data-id="${b.id}"><img class="tile" src="${bizImg(b.type)}" alt=""><div class="grow"><div class="title">${esc(b.name)}</div><div class="sub">Uses this ${KINDS[p.kind].short.toLowerCase()}</div></div><span class="chev"></span></button></div>
        <button class="btn block gray mt" data-act="unassign" data-id="${p.id}">Stop using for ${esc(b.name)}</button>` :
        opts.length ? `<div class="mt2"><label class="small muted" style="margin-left:4px">Assign to</label><select class="field" style="margin-top:6px" id="assignSel">${opts.map(o => `<option value="${o.v}">${esc(o.l)}</option>`).join('')}</select></div><button class="btn block mt" data-act="assignMine" data-id="${p.id}">Assign</button>` : `<div class="footnote mt">None of your businesses can use this ${KINDS[p.kind].short.toLowerCase()} right now.</div>`}
        <button class="btn block red mt" data-act="release" data-id="${p.id}">${p.status === 'owned' ? `Sell for ${money(Math.round(val * 0.95))}` : 'End lease'}</button>`;
    }
    return `<div class="biz-head"><img class="tile xl" src="${KINDS[p.kind].img}" alt=""><h1>${esc(p.address)}</h1><div class="muted">${CITIES[p.city].flag} ${esc(d.name)}, ${CITIES[p.city].name}</div></div>
      <div class="card">
        <div class="kv"><span>Type</span><span>${KINDS[p.kind].name}</span></div>
        <div class="kv"><span>Size</span><span>${SIZES[p.size].label} · ${p.cap} staff</span></div>
        <div class="kv"><span>Customer flow</span><span>${trafficBars(p.traffic)}</span></div>
        <div class="kv"><span>Market value</span><span>${money(val)}</span></div>
        ${p.status === 'market' ? `<div class="kv"><span>Rent</span><span>${money(E.parcelRent(S, p))}/day</span></div>` : ''}
        ${p.status === 'rented' ? `<div class="kv"><span>Your rent</span><span>${money(p.rentLocked)}/day (locked)</span></div>` : ''}
        ${p.status === 'owned' ? `<div class="kv"><span>You paid</span><span>${money(p.boughtFor)} <span class="${cls(val - p.boughtFor)}">(${signed(val - p.boughtFor)})</span></span></div>` : ''}
      </div>${actions}`;
  });
}
function assignOptions(p) {
  const out = [];
  for (const b of S.businesses) {
    for (const slot of ['main', 'warehouse', 'office']) {
      if (slot === 'warehouse' && !BT[b.type].warehouse) continue;
      if (E.parcelFits(S, b, p, slot)) continue;
      const cur = b[slot === 'main' ? 'mainId' : slot + 'Id'];
      const label = slot === 'main' ? 'main location' : slot;
      out.push({ v: `${b.id}|${slot}`, l: `${b.name} — ${label}${cur ? ' (replace current)' : ''}`, empty: !cur });
    }
  }
  return out.sort((a, b) => b.empty - a.empty);
}

// picker: choose a parcel for a business slot
function pickerSheet(bizId, slot) {
  const b0 = E.bizById(S, bizId);
  const c0 = E.bizCity(S, b0);
  const state = { city: c0 || ui.prop.city, sort: 'price' };
  openSheet(slot === 'main' ? 'Choose location' : slot === 'office' ? 'Choose office' : 'Choose warehouse', () => {
    const b = E.bizById(S, bizId);
    if (!b) return null;
    const t = BT[b.type];
    const fits = p => !E.parcelFits(S, b, p, slot);
    const mineFree = S.parcels.filter(p => p.status !== 'market' && !p.bizId && fits(p));
    const market = S.parcels.filter(p => p.status === 'market' && p.city === state.city && fits(p))
      .sort((a, c) => state.sort === 'traffic' ? (c.traffic - a.traffic) || (a.basePrice - c.basePrice) : state.sort === 'size' ? c.cap - a.cap : a.basePrice - c.basePrice);
    const row = p => `<div class="row with-icon"><img class="tile" src="${KINDS[p.kind].img}" alt="">
      <div class="grow"><div class="title">${SIZES[p.size].label} · ${p.cap} staff · ${esc(E.districtOf(p).name)}</div><div class="sub">${esc(p.address)}</div><div style="margin-top:3px">${trafficBars(p.traffic)}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
        <button class="btn sm" data-act="acq" data-id="${p.id}" data-mode="rent" data-biz="${b.id}" data-slot="${slot}">Rent ${money(E.parcelRent(S, p))}/d</button>
        <button class="btn sm gray" data-act="acq" data-id="${p.id}" data-mode="buy" data-biz="${b.id}" data-slot="${slot}">Buy ${money(E.parcelValue(S, p))}</button></div></div>`;
    return `${mineFree.length ? `<div class="section-h" style="margin-top:6px"><h2>Your free property</h2></div><div class="group">${mineFree.map(p => `<div class="row with-icon"><img class="tile" src="${KINDS[p.kind].img}" alt=""><div class="grow"><div class="title">${esc(p.address)}</div><div class="sub">${parcelSub(p)}</div></div><button class="btn sm" data-act="assign" data-id="${p.id}" data-biz="${b.id}" data-slot="${slot}">Use</button></div>`).join('')}</div>` : ''}
      <div class="mt">${citySeg('pickCity', state.city)}</div>
      <div class="footnote" style="margin:10px 4px">${slot === 'main' ? `${t.name}: ${SIZES[t.minSize].label}+ ${t.premises.join(' or ')}${t.airport ? ' at an airport' : ''}. ${t.traffic > 0.4 ? 'Customer flow matters a lot.' : 'Customer flow barely matters — go cheap.'}` : slot === 'office' ? 'Holds your Recruiters, HR Managers, Accountants and Marketing Managers.' : 'Holds warehouse workers that move your stock.'} Renting needs 3 days up front.</div>
      <div class="chips" style="margin-bottom:10px">${[['price', 'Cheapest'], ['traffic', 'Busiest'], ['size', 'Biggest']].map(([k, l]) => `<button class="chip ${state.sort === k ? 'on' : ''}" data-act="pickSort" data-v="${k}">${l}</button>`).join('')}</div>
      ${market.length ? `<div class="group">${market.map(row).join('')}</div>` : `<div class="card empty"><p>Nothing suitable in ${CITIES[state.city].name}. Try another city.</p></div>`}`;
  });
  sheet.state = state;
}

// ---------------------------------------------------------------- HIRE
function hireTarget() {
  const H = ui.hire;
  if (!E.bizById(S, H.bizId)) H.bizId = S.businesses[0]?.id || null;
  const b = E.bizById(S, H.bizId);
  if (b) {
    const opts = posOptions(b);
    if (!opts.find(o => o.v === H.pos)) H.pos = 'floor';
  }
  return b;
}
function posOptions(b) {
  const t = BT[b.type];
  const out = [];
  const cap = pos => { const c = E.positionCapacity(S, b, pos); return c.parcel ? `${c.used}/${c.cap}` : 'no location'; };
  out.push({ v: 'floor', l: `${t.role} (${cap('floor')})` });
  if (t.warehouse) out.push({ v: 'warehouse', l: `Warehouse Worker (${cap('warehouse')})` });
  for (const r of OFFICE_ROLES) out.push({ v: r, l: `${POSITIONS[r].name} (office ${cap(r)})` });
  return out;
}
function viewHire() {
  const H = ui.hire;
  return `${navbar('Hire')}
  <div class="wrap">
    <div class="large-title">Hire</div>
    <div class="subtitle">${plural(S.workers.length, 'employee')} · payroll ${money(S.workers.reduce((a, w) => a + E.wageFor(S, w), 0))}/day</div>
    <div class="seg" style="margin-bottom:14px">
      <button class="${H.src === 'recruit' ? 'on' : ''}" data-act="hireSrc" data-v="recruit">Recruit</button>
      <button class="${H.src === 'orders' ? 'on' : ''}" data-act="hireSrc" data-v="orders">Searches${S.orders.length ? ` (${S.orders.length})` : ''}</button>
      <button class="${H.src === 'staff' ? 'on' : ''}" data-act="hireSrc" data-v="staff">My Staff</button>
    </div>
    ${H.src === 'staff' ? staffView() : H.src === 'orders' ? ordersView() : recruitView()}
  </div>`;
}
function recruitView() {
  const H = ui.hire;
  const b = hireTarget();
  if (!b) return `<div class="card empty"><img src="${uiImg('jobcenter')}" alt=""><h3>No business to hire for</h3><p>Found a business and get it a location first.</p><button class="btn" data-act="newBiz">New Business</button></div>`;
  const hasRec = E.recruiters(S).length > 0;
  if (!hasRec) H.source = 'jobCenter';
  const R = E.RECRUIT[H.source];
  const capInfo = E.positionCapacity(S, b, H.pos);
  H.days = Math.min(Math.max(1, H.days || 3), R.maxDays);
  const q0 = E.quoteRecruit(S, { src: H.source, bizId: b.id, pos: H.pos, count: 1, days: H.days });
  const maxC = Math.max(1, q0.maxCount);
  H.count = Math.min(Math.max(1, H.count || 1), maxC);
  return `<div class="card target">
      <div><label>Business</label><select class="field" data-change="hireBiz">${S.businesses.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div><label>Position</label><select class="field" data-change="hirePos">${posOptions(b).map(o => `<option value="${o.v}" ${o.v === H.pos ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>
    </div>
    ${!capInfo.parcel ? `<div class="card mt"><b>${esc(b.name)} needs ${POSITIONS[H.pos].where === 'main' ? 'a location' : 'an ' + POSITIONS[H.pos].where} for this position.</b><div class="mt"><button class="btn sm" data-act="pick" data-biz="${b.id}" data-slot="${POSITIONS[H.pos].where}">Choose ${POSITIONS[H.pos].where === 'main' ? 'location' : POSITIONS[H.pos].where}</button></div></div>` : ''}
    ${H.pos !== 'floor' && H.pos !== 'warehouse' ? `<div class="footnote">${POSITIONS[H.pos].desc}</div>` : ''}

    <div class="section-h"><h2>Who searches</h2></div>
    <div class="group">
      <button class="row with-icon" data-act="recSource" data-v="jobCenter"><img class="tile lg" src="${uiImg('jobcenter')}" alt="">
        <div class="grow"><div class="title">Public Job Center</div><div class="sub">Low-skilled · up to 10 people per day of searching</div></div><span class="check ${H.source === 'jobCenter' ? 'on' : ''}"></span></button>
      <button class="row with-icon" data-act="recSource" data-v="recruiter"><img class="tile lg" src="${uiImg('recruiter')}" alt="" style="${hasRec ? '' : 'opacity:.45'}">
        <div class="grow"><div class="title">Your Recruiters${hasRec ? ` (${E.recruiters(S).length})` : ''}</div><div class="sub">${hasRec ? `Skilled · up to ${100 * Math.min(3, E.recruiters(S).length)} people per day` : 'Locked — hire a Recruiter into an office'}</div></div>${hasRec ? `<span class="check ${H.source === 'recruiter' ? 'on' : ''}"></span>` : '<span class="chev"></span>'}</button>
    </div>

    <div class="section-h"><h2>Search</h2></div>
    <div class="card">
      <div class="kv" style="padding-top:0"><span>People</span><b id="recCountLbl">${H.count}</b></div>
      <input type="range" class="slider" id="recCount" min="1" max="${maxC}" value="${H.count}" ${q0.maxCount ? '' : 'disabled'}>
      <div class="kv" style="margin-top:10px"><span>Wait</span><b id="recDaysLbl">${plural(H.days, 'day')}</b></div>
      <input type="range" class="slider" id="recDays" min="1" max="${R.maxDays}" value="${H.days}">
      <div class="small muted" style="display:flex;justify-content:space-between;margin-top:4px"><span>Rush · pricier</span><span>Patient · cheaper, better people</span></div>
    </div>
    <div id="recDyn">${recruitQuote()}</div>
    ${S.orders.length ? `<div class="footnote center"><button class="link" style="color:var(--tint);font-weight:600" data-act="hireSrc" data-v="orders">${plural(S.orders.length, 'search')} in progress ›</button></div>` : ''}`;
}
function recruitQuote() {
  const H = ui.hire;
  const b = hireTarget();
  if (!b) return '';
  const q = E.quoteRecruit(S, { src: H.source, bizId: b.id, pos: H.pos, count: H.count, days: H.days });
  const speed = q.mult >= 1.6 ? 'Rush fee' : q.mult > 1.05 ? 'Fast' : q.mult > 0.9 ? 'Standard' : 'Patience discount';
  return `<div class="card mt">
      <div class="kv" style="padding-top:0"><span>Arrive on</span><span>Day ${q.arrive} (${DOW[q.arrive % 7]})</span></div>
      <div class="kv"><span>Expected skill</span><span>${q.skillLo}–${q.skillHi}</span></div>
      <div class="kv"><span>Their wages</span><span>~${money(q.wageLo || 0)}–${money(q.wageHi || 0)}/day each</span></div>
      <div class="kv"><span>Fee per person</span><span>${money(q.perHire)} <span class="pill ${q.mult > 1.05 ? 'orange' : 'green'}">${speed} ×${q.mult.toFixed(2)}</span></span></div>
      <div class="kv"><span>Free spots</span><span>${q.free}</span></div>
    </div>
    <div class="sticky-action"><div class="hire-bar glass">
      <div class="grow"><b>${q.error && !q.total ? 'Can’t recruit' : `${money(q.total)} total`}</b><span class="${q.ok ? 'muted' : 'neg'}">${q.ok ? `${plural(H.count, 'person', )} · in ${plural(H.days, 'day')}` : esc(q.error || '')}</span></div>
      <button class="btn" data-act="doRecruit" ${q.ok ? '' : 'disabled'}>Recruit</button></div></div>`;
}
function ordersView() {
  if (!S.orders.length) return `<div class="card empty"><img src="${uiImg('recruiter')}" alt=""><h3>No searches running</h3><p>Start a search and new staff arrive on the day you chose.</p><button class="btn" data-act="hireSrc" data-v="recruit">Recruit</button></div>`;
  return `<div class="group">${S.orders.slice().sort((a, c) => a.arrive - c.arrive).map(o => {
    const b = E.bizById(S, o.bizId);
    const role = o.pos === 'floor' ? BT[b.type].role : POSITIONS[o.pos].name;
    const done = Math.min(1, (S.day - o.started) / o.days);
    const left = o.arrive - S.day;
    return `<div class="row with-icon"><img class="tile" src="${uiImg(o.src === 'jobCenter' ? 'jobcenter' : 'recruiter')}" alt="">
      <div class="grow"><div class="title">${o.count} × ${esc(role)}</div><div class="sub">${esc(b.name)} · ${left <= 0 ? 'arriving now' : `arrive day ${o.arrive} (in ${plural(left, 'day')})`}</div>
      <div class="bar" style="margin-top:6px"><i style="width:${Math.round(done * 100)}%"></i></div></div>
      <button class="btn sm red" data-act="cancelOrder" data-id="${o.id}">Cancel</button></div>`;
  }).join('')}</div><div class="footnote">Cancelling refunds 50% of the fee. If there's no room when people arrive, you get their share back.</div>`;
}
function staffView() {
  const H = ui.hire;
  if (!S.workers.length) return `<div class="card empty"><img src="${uiImg('jobcenter')}" alt=""><h3>No employees</h3><p>Your future employees are waiting at the Job Center.</p><button class="btn" data-act="hireSrc" data-v="jobCenter">Go to Job Center</button></div>`;
  const list = S.businesses.filter(b => H.staffBiz === 'all' || b.id === H.staffBiz);
  return `<div class="chips"><button class="chip ${H.staffBiz === 'all' ? 'on' : ''}" data-act="staffBiz" data-v="all">All</button>${S.businesses.map(b => `<button class="chip ${H.staffBiz === b.id ? 'on' : ''}" data-act="staffBiz" data-v="${b.id}">${esc(b.name)}</button>`).join('')}</div>
    ${list.map(b => {
      const ws = S.workers.filter(w => w.bizId === b.id).sort((a, c) => c.skill - a.skill);
      if (!ws.length) return '';
      const key = 'staff:' + b.id;
      const shown = ui.expand.has(key) ? ws : ws.slice(0, 12);
      return `<div class="dist-h"><b>${esc(b.name)}</b><span class="small muted">${ws.length} · avg skill ${Math.round(ws.reduce((a, w) => a + w.skill, 0) / ws.length)}</span></div>
      <div class="group">${shown.map(w => `<button class="row" data-act="worker" data-id="${w.id}"><div class="grow"><div class="title">${esc(w.name)}</div><div class="sub">${w.pos === 'floor' ? BT[b.type].role : POSITIONS[w.pos].name} · ${money(E.wageFor(S, w, b))}/day</div></div>${skillBar(w.skill)}</button>`).join('')}
      ${ws.length > 12 ? `<button class="list-more" data-act="expand" data-key="${key}">${ui.expand.has(key) ? 'Show less' : `Show all ${ws.length}`}</button>` : ''}</div>`;
    }).join('')}`;
}
function workerSheet(id) {
  openSheet('Employee', () => {
    const w = S.workers.find(x => x.id === id);
    if (!w) return null;
    const b = E.bizById(S, w.bizId);
    const t = BT[b.type];
    const isOffice = OFFICE_ROLES.includes(w.pos);
    const moves = isOffice ? OFFICE_ROLES.filter(r => r !== w.pos) : [];
    return `<div class="biz-head"><img class="tile xl" src="${isOffice ? uiImg('office') : w.pos === 'warehouse' ? uiImg('warehouse') : bizImg(b.type)}" alt=""><h1>${esc(w.name)}</h1><div class="muted">${w.pos === 'floor' ? t.role : POSITIONS[w.pos].name} at ${esc(b.name)}</div></div>
      <div class="card"><div class="kv"><span>Skill</span><span>${skillBar(w.skill)}</span></div>
      <div class="kv"><span>Wage</span><span>${money(E.wageFor(S, w, b))}/day</span></div>
      <div class="kv"><span>Productivity</span><span>×${E.productivity(w.skill, w.pos === 'floor' ? t.skillImpact : 1).toFixed(2)}</span></div>
      <div class="kv"><span>Hired</span><span>Day ${w.hired}</span></div></div>
      <div class="footnote">Skill grows a little every day, faster with an HR Manager. Wages follow skill.</div>
      ${moves.length ? `<div class="section-h"><h2>Change role</h2></div><div class="group">${moves.map(r => `<button class="row" data-act="moveWorker" data-id="${w.id}" data-pos="${r}"><div class="grow"><div class="title">${POSITIONS[r].name}</div><div class="sub">${POSITIONS[r].desc}</div></div><span class="chev"></span></button>`).join('')}</div>` : ''}
      <button class="btn block red mt2" data-act="fire" data-id="${w.id}">Fire ${esc(w.name.split(' ')[0])}</button>`;
  });
}

// ---------------------------------------------------------------- FINANCE
function viewFinance() {
  const est = E.taxEstimate(S);
  const L = S.lastReport;
  const nets = S.ledger.slice(-30).map(x => x.net).filter((_, i, a) => i > 0 || a.length < 30);
  const avg7 = S.ledger.slice(-7).reduce((a, x) => a + x.net, 0) / Math.max(1, Math.min(7, S.ledger.length));
  const owned = S.parcels.filter(p => p.status === 'owned').reduce((a, p) => a + E.parcelValue(S, p), 0);
  const bizVal = S.businesses.reduce((a, b) => a + E.businessValue(S, b), 0);
  const income = Math.max(0, S.tax.periodIncome);
  let prev = 0;
  return `${navbar('Finance')}
  <div class="wrap">
    <div class="large-title">Finance</div>
    <div class="subtitle">Net worth ${money(E.netWorth(S))}</div>
    <div class="grid2">
      <div class="metric"><div class="k">Cash</div><div class="v ${S.cash < 0 ? 'neg' : ''}">${money(S.cash)}</div></div>
      <div class="metric"><div class="k">7-day avg</div><div class="v ${cls(avg7)}">${signed(Math.round(avg7))}</div><div class="s">per day</div></div>
      <div class="metric"><div class="k">Property</div><div class="v">${money(owned)}</div><div class="s">owned, market value</div></div>
      <div class="metric"><div class="k">Businesses</div><div class="v">${money(bizVal)}</div><div class="s">≈ 90 days of profit</div></div>
    </div>
    <div class="section-h"><h2>Cash</h2></div>
    <div class="card">${lineChart(S.ledger.slice(-90).map(x => x.cash))}</div>
    <div class="section-h"><h2>Daily net income</h2></div>
    <div class="card">${barChart(nets)}<div class="legend"><span><i style="background:var(--green)"></i>profit</span><span><i style="background:var(--red)"></i>loss</span></div></div>

    <div class="section-h"><h2>Income tax</h2></div>
    <div class="tax-card"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="small" style="opacity:.85">DUE IN ${plural(est.daysLeft, 'DAY').toUpperCase()} (DAY ${S.day + est.daysLeft - 1})</div><div class="big">${money(est.due)}</div><div class="small" style="opacity:.9">on ${money(income)} income this period · effective ${pct(est.effective * (1 - est.relief))}</div></div>
      <img class="tile lg" src="${uiImg('tax')}" alt="" style="box-shadow:0 6px 20px rgba(0,0,0,.2)"></div></div>
    <div class="card mt"><div class="small muted" style="margin-bottom:6px">Paid every ${TAX_PERIOD} days on your total income for the period (salary + business profit). The more you make, the higher the rate.</div>
      <table class="br">${TAX_BRACKETS.map(br => { const row = `<tr class="${income > prev && (income <= br.upTo || br.upTo === Infinity) ? 'cur' : ''}"><td>${money(prev)} – ${br.upTo === Infinity ? '∞' : money(br.upTo)}</td><td style="text-align:right">${pct(br.rate)}</td></tr>`; prev = br.upTo; return row; }).join('')}</table>
      ${est.relief ? `<div class="kv mt"><span>Accountant relief</span><span class="pos">−${pct(est.relief)}</span></div>` : `<div class="small muted mt">Tip: Accountants in an office cut your tax bill by up to 30%.</div>`}</div>
    ${S.tax.history.length ? `<div class="group mt">${S.tax.history.slice(0, 10).map(h => `<div class="row"><div class="grow"><div class="title">Day ${h.day}</div><div class="sub">income ${money(h.income)} · effective ${pct(h.income ? h.due / h.income : 0)}</div></div><div class="value neg">−${money(h.due)}</div></div>`).join('')}</div>` : ''}

    ${L ? `<div class="section-h"><h2>Yesterday (day ${L.day})</h2></div>${reportRows(L)}` : ''}
  </div>`;
}
function reportRows(r) {
  return `<div class="group">
    ${r.salary ? `<div class="row with-icon"><img class="tile" src="${uiImg('job')}" alt=""><div class="grow"><div class="title">Day job salary</div></div><div class="value pos">+${money(r.salary)}</div></div>` : ''}
    ${r.businesses.map(x => `<button class="row with-icon" data-act="openBiz" data-id="${x.id}"><img class="tile" src="${bizImg(x.type)}" alt=""><div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">${x.revenue ? `${money(x.revenue)} revenue · ${fmtNum(x.customers)} customers` : esc(x.notes[0] || 'No sales')}</div></div><div class="value ${cls(x.profit)}">${signed(x.profit)}</div></button>`).join('')}
    ${r.idleProperty ? `<div class="row with-icon"><img class="tile" src="${uiImg('commercial')}" alt=""><div class="grow"><div class="title">Unused property</div></div><div class="value neg">−${money(r.idleProperty)}</div></div>` : ''}
    ${r.extra ? `<div class="row with-icon"><img class="tile" src="${uiImg('bank')}" alt=""><div class="grow"><div class="title">Fines & repairs</div></div><div class="value neg">−${money(r.extra)}</div></div>` : ''}
    ${r.interest ? `<div class="row with-icon"><img class="tile" src="${uiImg('bank')}" alt=""><div class="grow"><div class="title">Overdraft interest</div></div><div class="value neg">−${money(r.interest)}</div></div>` : ''}
    ${r.tax ? `<div class="row with-icon"><img class="tile" src="${uiImg('tax')}" alt=""><div class="grow"><div class="title">Income tax</div><div class="sub">${pct(r.tax.effective)} effective on ${money(r.tax.income)}</div></div><div class="value neg">−${money(r.tax.due)}</div></div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- reports
function aggregate(reports) {
  const out = { day: reports[0].day, to: reports.at(-1).day, salary: 0, businesses: [], idleProperty: 0, extra: 0, interest: 0, tax: null, net: 0, events: [] };
  const byBiz = new Map();
  for (const r of reports) {
    out.salary += r.salary; out.idleProperty += r.idleProperty; out.extra += r.extra; out.interest += r.interest; out.net += r.net;
    out.events.push(...r.events.map(e => ({ ...e, day: r.day })));
    if (r.tax) out.tax = r.tax;
    for (const x of r.businesses) {
      const a = byBiz.get(x.id) || { ...x, revenue: 0, profit: 0, customers: 0, notes: x.notes };
      a.revenue += x.revenue; a.profit += x.profit; a.customers += x.customers; a.notes = x.notes;
      byBiz.set(x.id, a);
    }
    if (r.gameOver) out.gameOver = true;
  }
  out.businesses = [...byBiz.values()];
  return out;
}
function showReport(reports) {
  const r = reports.length === 1 ? reports[0] : aggregate(reports);
  const title = reports.length === 1 ? `Day ${r.day} report` : `Days ${r.day}–${r.to}`;
  openSheet(title, () => `
    ${r.tax ? `<div class="tax-card" style="margin-bottom:14px"><div class="small" style="opacity:.85">TAX DAY</div><div class="big">−${money(r.tax.due)}</div><div class="small">${pct(r.tax.effective)} effective rate on ${money(r.tax.income)} income${r.tax.relief ? ` · accountants saved ${pct(r.tax.relief)}` : ''}</div></div>` : ''}
    <div class="report-net"><div class="small muted">Net ${reports.length === 1 ? 'today' : 'this week'}</div><div class="big ${cls(r.net)}">${signed(r.net)}</div><div class="small muted">Cash now ${money(S.cash)}</div></div>
    ${reportRows(r)}
    ${r.events.length ? `<div class="section-h"><h2>Events</h2></div><div class="group">${r.events.map(e => `<div class="event"><span class="dot ${e.tone}"></span><div>${esc(e.text)}${e.day && reports.length > 1 ? `<div class="small muted">Day ${e.day}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    <button class="btn block mt2" data-act="closeSheet">Continue</button>`);
}
function showGameOver() {
  openSheet('Bankrupt', () => `<div class="empty"><img src="${uiImg('tax')}" alt=""><h3>Delusion over (for now)</h3>
    <p>${esc(S.ceo)} stayed in overdraft for 14 days and the bank pulled the plug on day ${S.day - 1}. Peak delusion reached: ${E.rankFor(Math.max(...S.ledger.map(l => l.cash)))}.</p>
    <button class="btn block" data-act="restart">Start over</button></div>`);
}

// ---------------------------------------------------------------- business creation
function newBizSheet() {
  const st = { type: null, name: '' };
  openSheet('New Business', () => {
    if (!st.type) {
      return `<div class="footnote" style="margin:0 4px 14px">You have ${money(S.cash)}. Prices shown are the registration fee — you'll also need to rent a location and hire staff.</div>
      <div class="biz-grid">${BUSINESS_TYPES.map(t => `<button data-act="pickType" data-v="${t.id}" class="${S.cash < t.license ? 'lock' : ''}"><img src="${bizImg(t.id)}" alt="">${t.name}<span class="muted" style="font-weight:500">${money(t.license)}</span></button>`).join('')}</div>`;
    }
    const t = BT[st.type];
    const short = t.license - S.cash;
    const margin = 1 - t.cogs;
    return `<button class="nav-btn tint" data-act="pickType" data-v="">‹ All types</button>
      <div class="biz-head"><img class="tile xl" src="${bizImg(t.id)}" alt=""><h1>${t.name}</h1><div class="muted">${esc(t.blurb)}</div></div>
      <div class="card">
        <div class="kv"><span>Registration fee</span><b>${money(t.license)}</b></div>
        <div class="kv"><span>Location</span><span>${SIZES[t.minSize].label}+ ${t.premises.join(' / ')}${t.airport ? ' (airport)' : ''}</span></div>
        <div class="kv"><span>Warehouse</span><span>${t.warehouse ? 'Required' : 'Not needed'}</span></div>
        <div class="kv"><span>Staff</span><span>${t.role}s (~${money(t.wage)}/day in London)</span></div>
        <div class="kv"><span>Avg sale</span><span>${money(t.ticket)} · ${pct(margin)} margin</span></div>
        <div class="kv"><span>Customer flow matters</span><span>${t.traffic > 0.7 ? 'A lot' : t.traffic > 0.4 ? 'Somewhat' : 'Barely'}</span></div>
        <div class="kv"><span>Skill matters</span><span>${t.skillImpact >= 1.5 ? 'Enormously' : t.skillImpact > 1.05 ? 'A lot' : 'Normal'}</span></div>
      </div>
      <div class="mt"><input class="field" id="bizName" placeholder="${esc(`${S.ceo}'s ${t.name}`)}" maxlength="30" value="${esc(st.name)}" autocomplete="off"></div>
      <button class="btn block mt" data-act="found" data-v="${t.id}" ${short > 0 ? 'disabled' : ''}>${short > 0 ? `Need ${money(short)} more` : `Register for ${money(t.license)}`}</button>`;
  });
  sheet.state = st;
}

// ---------------------------------------------------------------- settings / help
function settingsSheet() {
  openSheet('Settings', () => `
    <div class="section-h" style="margin-top:6px"><h2>CEO</h2></div>
    <div class="btn-row"><input class="field" id="ceoName" value="${esc(S.ceo)}" maxlength="24"><button class="btn" style="flex:none" data-act="saveName">Save</button></div>
    <div class="section-h"><h2>Save data</h2></div>
    <div class="footnote" style="margin:0 4px 10px">Your game is saved automatically on this device only. Export a backup to move it to another device.</div>
    <div class="group">
      <button class="row" data-act="export"><div class="grow"><div class="title" style="color:var(--tint)">Export save file</div></div></button>
      <button class="row" data-act="import"><div class="grow"><div class="title" style="color:var(--tint)">Import save file</div></div></button>
      <button class="row" data-act="copySave"><div class="grow"><div class="title" style="color:var(--tint)">Copy save to clipboard</div></div></button>
    </div>
    <div class="group mt"><button class="row" data-act="reset"><div class="grow"><div class="title neg">Reset game</div></div></button></div>
    <div class="section-h"><h2>Install</h2></div>
    <div class="card small" style="line-height:1.5">On iPhone: open this page in Safari, tap <b>Share</b> → <b>Add to Home Screen</b>. It runs full-screen and works offline.</div>
    <div class="footnote center mt2">Delusional Business Inc. · v1.0</div>`);
}
function helpSheet() {
  openSheet('How to play', () => `<div class="help">
    <p>Start with a day job and ${money(2500)}. Each tap of <b>Next Day</b> simulates one day: you get paid, your businesses serve customers, and costs are deducted.</p>
    <h4>1. Start a business</h4><p>Pick from 20 types. Each needs a registration fee and a location of a minimum size. Clothing, Supermarket, Furniture, Cosmetics, Construction and Delivery also need a <b>warehouse</b> with warehouse workers.</p>
    <h4>2. Property</h4><ul><li>Parcels in Warsaw, London and New York — each district has different prices and <b>customer flow</b>.</li><li>Size limits how many staff fit.</li><li>Rent (3 days up front, then daily) or buy (one-off, small upkeep, sell later for 95% of market value).</li><li>Offices hold HR, Recruiters, Accountants and Marketing Managers.</li></ul>
    <h4>3. Hiring</h4><ul><li>Start a <b>search</b>: choose how many people and how many days to wait. Rushing costs up to 2.2× more; waiting longer is cheaper and finds better-skilled people.</li><li><b>Job Center</b>: low-skilled people, up to 10 per day of searching.</li><li><b>Recruiters</b> (in an office): skilled people, up to 100 per day of searching each. Better recruiters → better people, lower fees.</li><li>Skill (0–100) drives productivity and customer satisfaction, which builds reputation and demand.</li><li>Above 15 staff a business needs an HR Manager.</li></ul>
    <h4>4. Taxes</h4><p>Every ${TAX_PERIOD} days you pay progressive income tax on your total income for the period (10% → 42%). Accountants lower the bill.</p>
    <h4>5. Don't go broke</h4><p>Negative cash costs 0.2% interest a day. 14 days in a row in overdraft and you're bankrupt.</p>
    <h4>Tips</h4><ul><li>A coffee shop in a cheap district is the classic first step.</li><li>Lawyers, engineers and game devs earn a lot more when highly skilled.</li><li>Watch the "turned away customers" warning — that's money left on the table.</li></ul>
  </div>`);
}

// ---------------------------------------------------------------- actions
function goBizDetail(id) {
  closeSheet();
  if (ui.tab !== 'home' && ui.tab !== 'biz') ui.tab = 'biz';
  const st = ui.stacks[ui.tab];
  if (ui.tab === 'biz') st.length = 0;
  st.push({ view: 'bizDetail', id });
  render('push-in');
}
function commit(err) {
  if (fail(err)) return false;
  save();
  refresh();
  return true;
}
function selectedAssign() {
  const el = $('#assignSel');
  if (!el || !el.value) return null;
  const [bizId, slot] = el.value.split('|');
  return { bizId, slot };
}
async function releaseFlow(id) {
  const p = E.parcelById(S, id);
  const n = E.staffAffected(S, id);
  const msg = (p.status === 'owned' ? `You'll get ${money(Math.round(E.parcelValue(S, p) * 0.95))}.` : 'Rent stops from tomorrow.') + (n ? ` ${plural(n, 'employee')} working here will be laid off.` : '');
  if (!await confirmDialog(p.status === 'owned' ? 'Sell property?' : 'End lease?', msg, p.status === 'owned' ? 'Sell' : 'End lease', true)) return;
  commit(E.releaseParcel(S, id));
  closeSheet();
}

const A = {
  start() {
    S = E.newGame($('#ceo').value);
    save();
    $('#app').innerHTML = '';
    render();
    setTimeout(helpSheet, 300);
  },
  tab(d) {
    if (ui.tab === d.tab && ui.stacks[d.tab].length) { ui.stacks[d.tab].length = 0; render('pop-in'); return; }
    ui.tab = d.tab;
    const sc = $('#screen'); if (sc) sc.dataset.key = '';
    render();
  },
  back() { ui.stacks[ui.tab].pop(); render('pop-in'); },
  closeSheet() { closeSheet(); },
  settings: settingsSheet,
  help: helpSheet,
  async sim1() {
    if (ui.busy) return;
    const before = S.job.level;
    const r = E.simulateDay(S);
    save();
    refresh();
    if (!r) return;
    if (r.tax || r.gameOver || r.promoted || r.events.length > 1) showReport([r]);
    else toast(`<span>Day ${r.day}: <b class="${cls(r.net)}">${signed(r.net)}</b></span>${r.events[0] ? ` · ${esc(r.events[0].text)}` : ''} <span class="muted">›</span>`, '', () => showReport([r]));
    void before;
  },
  sim7() {
    if (ui.busy) return;
    const rs = E.simulateDays(S, 7);
    save();
    refresh();
    if (rs.length) showReport(rs);
  },
  quitJob: async () => { if (await confirmDialog('Quit your day job?', `You'll lose ${money(E.jobInfo(S).pay)}/day. You can get a job again later, but you'll start from the bottom.`, 'Quit', true)) { E.quitJob(S); commit(); } },
  rejoinJob: () => { E.rejoinJob(S); commit(); toast(`Hired as ${JOB_LADDER[0].title}`, 'good'); },
  newBiz: newBizSheet,
  pickType(d) { sheet.state.type = d.v || null; refreshSheet(); sheet.el.querySelector('.sheet-body').scrollTop = 0; },
  found(d) {
    const name = $('#bizName')?.value;
    const r = E.foundBusiness(S, d.v, name);
    if (fail(r)) return;
    save();
    toast(`🎉 ${esc(E.bizById(S, r.id).name)} registered`, 'good');
    goBizDetail(r.id);
    setTimeout(() => pickerSheet(r.id, 'main'), 450);
  },
  openBiz(d) { goBizDetail(d.id); },
  async renameBiz(d) {
    const b = E.bizById(S, d.id);
    const n = prompt('Business name', b.name);
    if (n && n.trim()) { b.name = n.trim().slice(0, 30); commit(); }
  },
  async closeBiz(d) {
    const b = E.bizById(S, d.id);
    if (!await confirmDialog(`Close ${esc(b.name)}?`, `All ${E.workersOf(S, b.id).length} staff are let go and leases end. Owned property stays yours. The registration fee is lost.`, 'Close business', true)) return;
    E.closeBusiness(S, d.id);
    ui.stacks[ui.tab].pop();
    commit();
  },
  ads(d) { E.setAds(S, d.id, +d.v); commit(); },
  expand(d) { ui.expand.has(d.key) ? ui.expand.delete(d.key) : ui.expand.add(d.key); refresh(); },
  pick(d) { pickerSheet(d.biz, d.slot); },
  pickCity(d) { sheet.state.city = d.v; refreshSheet(); },
  pickSort(d) { sheet.state.sort = d.v; refreshSheet(); },
  acq(d) {
    const p = E.parcelById(S, d.id);
    const err = E.acquireParcel(S, d.id, d.mode, d.biz, d.slot);
    if (fail(err)) return;
    save(); closeSheet(); refresh();
    toast(`${d.mode === 'buy' ? 'Bought' : 'Rented'} ${esc(p.address)}`, 'good');
  },
  assign(d) { if (commit(E.assignParcel(S, d.id, d.biz, d.slot))) { closeSheet(); toast('Location assigned', 'good'); } },
  parcel(d) { parcelSheet(d.id); },
  acquire(d) {
    const a = selectedAssign();
    const p = E.parcelById(S, d.id);
    const err = E.acquireParcel(S, d.id, d.mode, a?.bizId, a?.slot);
    if (fail(err)) return;
    save(); refresh();
    toast(`${d.mode === 'buy' ? 'Bought' : 'Rented'} ${esc(p.address)}`, 'good');
  },
  assignMine(d) { const a = selectedAssign(); if (a) commit(E.assignParcel(S, d.id, a.bizId, a.slot)); },
  async unassign(d) {
    const n = E.staffAffected(S, d.id);
    if (n && !await confirmDialog('Stop using this property?', `${plural(n, 'employee')} working here will be laid off.`, 'Continue', true)) return;
    commit(E.unassignParcel(S, d.id));
  },
  release(d) { releaseFlow(d.id); },
  propMode(d) { ui.prop.mode = d.v; render(); },
  propCity(d) { ui.prop.city = d.v; render(); },
  propKind(d) { ui.prop.kind = d.v; render(); },
  propSort(d) { ui.prop.sort = d.v; render(); },
  hireSrc(d) { ui.hire.src = d.v; render(); },
  hireFor(d) {
    closeSheet();
    ui.hire.bizId = d.biz; ui.hire.pos = d.pos;
    ui.hire.src = 'recruit';
    ui.hire.source = E.recruiters(S).length ? 'recruiter' : 'jobCenter';
    ui.tab = 'hire';
    render('push-in');
  },
  hireRecruiterHelp() {
    const b = S.businesses.find(x => x.officeId) || S.businesses[0];
    if (!b) return A.newBiz();
    ui.hire.bizId = b.id; ui.hire.pos = 'recruiter'; ui.hire.src = 'recruit'; ui.hire.source = 'jobCenter'; ui.tab = 'hire';
    if (!b.officeId) { pickerSheet(b.id, 'office'); toast('First, an office for ' + esc(b.name)); }
    render();
  },
  recSource(d) {
    if (d.v === 'recruiter' && !E.recruiters(S).length) return A.hireRecruiterHelp();
    ui.hire.source = d.v; render();
  },
  doRecruit() {
    const H = ui.hire;
    const b = E.bizById(S, H.bizId);
    const n = H.count, days = H.days;
    if (commit(E.startRecruit(S, { src: H.source, bizId: H.bizId, pos: H.pos, count: n, days }))) {
      toast(`🔎 Searching for ${plural(n, 'person')} for ${esc(b.name)} — arriving day ${S.day + days}`, 'good');
      H.count = 1; render();
    }
  },
  async cancelOrder(d) {
    const o = S.orders.find(x => x.id === d.id);
    if (!o || !await confirmDialog('Cancel search?', `You get ${money(Math.round(o.paid / 2))} back (50%).`, 'Cancel search', true)) return;
    commit(E.cancelOrder(S, d.id));
  },
  staffBiz(d) { ui.hire.staffBiz = d.v; render(); },
  worker(d) { workerSheet(d.id); },
  async fire(d) {
    const w = S.workers.find(x => x.id === d.id);
    if (!await confirmDialog(`Fire ${esc(w.name)}?`, 'They leave immediately. No severance (this is a delusional business).', 'Fire', true)) return;
    E.fire(S, [d.id]); commit(); closeSheet();
  },
  moveWorker(d) { if (commit(E.moveWorker(S, d.id, d.pos))) toast('Role changed', 'good'); },
  saveName() { const v = $('#ceoName').value.trim(); if (v) { S.ceo = v.slice(0, 24); commit(); toast('Saved', 'good'); } },
  export() {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delusional-business-day${S.day}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  async copySave() {
    try { await navigator.clipboard.writeText(JSON.stringify(S)); toast('Save copied', 'good'); }
    catch { toast('Clipboard not available', 'bad'); }
  },
  import() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json,text/plain';
    inp.onchange = async () => {
      try {
        const data = E.migrate(JSON.parse(await inp.files[0].text()));
        if (!await confirmDialog('Replace current game?', `Load the save from day ${data.day}? Your current progress will be overwritten.`, 'Load', true)) return;
        S = data; save(); closeSheet(); ui.tab = 'home'; Object.values(ui.stacks).forEach(s => s.length = 0); render();
        toast('Save loaded', 'good');
      } catch (e) { toast('That file is not a valid save', 'bad'); }
    };
    inp.click();
  },
  async reset() {
    if (!await confirmDialog('Reset game?', 'Everything is deleted from this device. This cannot be undone.', 'Reset', true)) return;
    A.restart();
  },
  restart() {
    localStorage.removeItem(KEY);
    S = null; closeSheet(true);
    Object.values(ui.stacks).forEach(s => s.length = 0); ui.tab = 'home';
    $('#app').innerHTML = '';
    render();
  },
};

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset); }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change;
  if (k === 'hireBiz') { ui.hire.bizId = e.target.value; render(); }
  if (k === 'hirePos') { ui.hire.pos = e.target.value; render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'bizName' && sheet?.state) sheet.state.name = e.target.value;
  if (e.target.id === 'recCount' || e.target.id === 'recDays') {
    const H = ui.hire;
    if (e.target.id === 'recCount') H.count = +e.target.value;
    else {
      H.days = +e.target.value;
      const q = E.quoteRecruit(S, { src: H.source, bizId: H.bizId, pos: H.pos, count: 1, days: H.days });
      const c = $('#recCount');
      c.max = Math.max(1, q.maxCount);
      H.count = Math.min(H.count, Math.max(1, q.maxCount));
      c.value = H.count;
    }
    $('#recCountLbl').textContent = H.count;
    $('#recDaysLbl').textContent = plural(H.days, 'day');
    $('#recDyn').innerHTML = recruitQuote();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ceo') A.start();
});
// edge swipe back
let sx = null, sy = 0;
document.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX < 24 && ui.stacks[ui.tab]?.length && !sheet ? t.clientX : null; sy = t.clientY; }, { passive: true });
document.addEventListener('touchend', e => { if (sx == null) return; const t = e.changedTouches[0]; if (t.clientX - sx > 80 && Math.abs(t.clientY - sy) < 60) A.back(); sx = null; }, { passive: true });

function fitViewport() {
  let h = window.innerHeight;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone && window.innerWidth < window.innerHeight && screen.height > h) h = screen.height;
  document.documentElement.style.setProperty('--app-h', h + 'px');
}
fitViewport();
addEventListener('resize', fitViewport);
addEventListener('orientationchange', () => setTimeout(fitViewport, 300));

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
