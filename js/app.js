// UI layer for Delusional Business Inc.
import * as E from './engine.js';
import * as W from './world.js';
import * as M from './empire.js';
import * as BL from './billion.js';
import * as MR from './more.js';
import * as S2 from './sports2.js';
import { CITIES, KINDS, SIZES, BUSINESS_TYPES, BT, POSITIONS, OFFICE_ROLES, SUPPORT_ROLES, EQUIPMENT, WAREHOUSE_EQUIPMENT, OFFICE_EQUIPMENT, EQUIP_RESALE, SECURITY_REQUIRED, STOCK, STOCK_DELIVERY_DAYS, AUTO_STOCK_DAYS, DAY_SHORT, DAY_NAMES, WEEK_ORDER, BASE_HOURS, SUNDAY_PAY, PRICE_MIN, PRICE_MAX, CAR_TIERS, CLEANER_RATIO, SECURITY_RATIO, TAX_BRACKETS, TAX_PERIOD, JOB_LADDER, DAYS_PER_PROMOTION } from './data.js';

const LEGACY_KEY = 'dbi-save-v1';
const INDEX_KEY = 'dbi-saves';
const slotKey = id => `dbi-slot-${id}`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------- save slots
// Several games can live side by side: an index of slots + one localStorage entry per slot.
let IDX = loadIndex();
function loadIndex() {
  let idx = null;
  try { idx = JSON.parse(localStorage.getItem(INDEX_KEY)); } catch { /* ignore */ }
  if (!idx || !Array.isArray(idx.slots)) idx = { current: null, slots: [] };
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && !idx.slots.length) { // move the single pre-1.10 save into slot 1
    const id = newSlotId();
    try {
      localStorage.setItem(slotKey(id), legacy);
      idx.slots.push({ id, ...summaryOf(JSON.parse(legacy)) });
      idx.current = id;
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* keep legacy */ }
  }
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch { /* ignore */ }
  return idx;
}
function newSlotId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function summaryOf(st) {
  let nw = st.cash;
  try { nw = E.netWorth(st); } catch { /* old save */ }
  return { ceo: st.ceo, day: st.day, cash: Math.round(st.cash), netWorth: Math.round(nw), businesses: (st.businesses || []).length, updated: Date.now(), gameOver: !!st.gameOver, retired: st.gameOverReason === 'retired' };
}
function saveIndex() { try { localStorage.setItem(INDEX_KEY, JSON.stringify(IDX)); } catch { /* ignore */ } }

// ---------------------------------------------------------------- state
let S = load();
const ui = {
  tab: 'home',
  stacks: { home: [], biz: [], prop: [], hire: [], emp: [], fin: [] },
  emp: { seg: 'factories', city: 'warsaw', sportsCity: 'london' },
  prop: { mode: 'market', city: 'warsaw', kind: 'commercial', sort: 'price' },
  hire: { src: 'recruit', source: 'jobCenter', bizId: null, pos: 'floor', count: 3, days: 3, staffBiz: 'all' },
  expand: new Set(),
  busy: false,
};
let sheet = null; // { el, back, render }

function load() {
  if (!IDX.current) return null;
  try {
    const raw = localStorage.getItem(slotKey(IDX.current));
    return raw ? E.migrate(JSON.parse(raw)) : null;
  } catch (e) { console.warn(e); return null; }
}
function save() {
  if (!S) return;
  if (!IDX.current) { IDX.current = newSlotId(); }
  try { localStorage.setItem(slotKey(IDX.current), JSON.stringify(S)); }
  catch (e) { toast('Could not save: storage full', 'bad'); return; }
  const meta = { id: IDX.current, ...summaryOf(S) };
  const i = IDX.slots.findIndex(x => x.id === IDX.current);
  if (i >= 0) IDX.slots[i] = { ...IDX.slots[i], ...meta }; else IDX.slots.push(meta);
  saveIndex();
}
function resetUI() {
  Object.values(ui.stacks).forEach(st => st.length = 0);
  ui.tab = 'home'; ui.expand.clear(); ui.lcShown = false;
  ui.hire.bizId = null; ui.hire.src = 'recruit';
}
function switchSlot(id) {
  save();
  IDX.current = id; saveIndex();
  S = load();
  closeSheet(true); resetUI();
  $('#app').innerHTML = '';
  render();
  if (S) toast(`Loaded ${esc(S.ceo)} · day ${S.day}`, 'good');
}
function startNewSlot() {
  save();
  ui.returnTo = IDX.current;
  IDX.current = null; saveIndex();
  S = null; closeSheet(true); resetUI();
  $('#app').innerHTML = '';
  render();
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
const plural = (n, w) => `${n} ${n === 1 ? w : w === 'person' ? 'people' : w === 'free spot' ? 'free spots' : w + 's'}`;

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
function lineChart(vals, color = 'var(--tint)', fromZero = true) {
  const w = 340, h = 160, pad = 6;
  if (vals.length < 2) return `<div class="center muted small" style="padding:50px 0">Simulate a few days to see the chart</div>`;
  let min = fromZero ? Math.min(0, ...vals) : Math.min(...vals), max = Math.max(...vals);
  if (!fromZero) { const pad = (max - min) * 0.1 || Math.abs(max) * 0.01 || 1; min -= pad; max += pad; }
  const r = max - min || 1;
  const xy = vals.map((v, i) => [pad + i / (vals.length - 1) * (w - 2 * pad), h - 18 - (v - min) / r * (h - 36)]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const zeroY = h - 18 - (0 - min) / r * (h - 36);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${fromZero ? `<line x1="0" x2="${w}" y1="${zeroY}" y2="${zeroY}" stroke="var(--sep)" stroke-dasharray="3 4"/>` : `<text x="${w - 4}" y="${h - 22}" text-anchor="end" font-size="11" fill="var(--label2)">${money(Math.min(...vals))}</text>`}
    <path d="${line}L${xy.at(-1)[0]} ${h - 18}L${xy[0][0]} ${h - 18}Z" fill="url(#lg)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <text x="${w - 4}" y="12" text-anchor="end" font-size="11" fill="var(--label2)">${money(Math.max(...vals))}</text>
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
  emp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11z"/><path d="M4 21h16"/></svg>',
};
const TABS = [['home', 'Home'], ['biz', 'Business'], ['prop', 'Property'], ['hire', 'Hire'], ['emp', 'Empire'], ['fin', 'Finance']];

// ---------------------------------------------------------------- toast / alert / sheet
let toastTimer;
function toast(msg, tone = '', onTap, ms) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.className = `toast glass ${tone}`;
  t.innerHTML = msg;
  t.onclick = onTap ? () => { t.classList.remove('show'); onTap(); } : null;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || (onTap ? 3200 : 2600));
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
  setTimeout(() => { el.remove(); back.remove(); if (S && S.gameOver && !sheet && $('#ceo') == null) showGameOver(); }, 380);
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
  const views = { home: viewHome, biz: viewBizList, bizDetail: viewBizDetail, hqDetail: viewHQ, emp: viewEmpire, prop: viewProperty, hire: viewHire, fin: viewFinance };
  screen.innerHTML = (views[v.view] || viewHome)(v);
  screen.scrollTop = keep;
  const nb = screen.querySelector('.navbar');
  if (nb) nb.classList.toggle('scrolled', screen.scrollTop > 36);
  renderDock();
  if (S.gameOver && !sheet) showGameOver();
  else if (S.bankruptcyPending && !sheet && !ui.lcShown) { ui.lcShown = true; setTimeout(showLastChance, 300); }
}

function navbar(title, { left = '<span class="nav-spacer"></span>', right = '<span class="nav-spacer"></span>' } = {}) {
  return `<div class="navbar">${left}<div class="nav-title">${esc(title)}</div><div style="display:flex;gap:8px">${right}</div></div>`;
}
const backBtn = label => `<button class="nav-btn tint" data-act="back">‹ ${esc(label)}</button>`;

function renderDock() {
  let dock = $('#dock');
  if (!dock) { dock = document.createElement('div'); dock.id = 'dock'; dock.className = 'dock'; $('#app').append(dock); }
  const est = E.taxEstimate(S);
  const sub = S.bankruptcyPending ? `<span class="neg">0 days left · repay ${money(-S.cash)}</span>` : S.cash < 0 ? `<span class="neg">Overdraft · bankrupt in ${14 - S.negDays} days</span>` : `Tax in ${plural(est.daysLeft, 'day')} · ${money(S.cash)}`;
  const nReady = (S.shortlists || []).length;
  const hireBadge = nReady ? `<span class="badge">${nReady}</span>` : '';
  dock.innerHTML = `
    <div class="accessory glass">
      <div class="day"><b>${DOW[S.day % 7]} ${MR.dateLabel(S.day)}</b><span>${sub}</span></div>
      ${S.bankruptcyPending ? `<button class="go" style="background:var(--red);box-shadow:0 4px 14px rgba(255,59,48,.4)" data-act="lastChance">Sell assets</button>` : `<button class="ff" data-act="sim7" ${ui.busy ? 'disabled' : ''} aria-label="Simulate 7 days">+7</button>
      <button class="go" data-act="sim1" ${ui.busy ? 'disabled' : ''}>Next Day ▶</button>`}
    </div>
    <nav class="tabbar glass">${TABS.map(([id, label]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${ICONS[id]}<span>${label}</span>${id === 'hire' ? hireBadge : ''}</button>`).join('')}</nav>`;
}

// ---------------------------------------------------------------- onboarding
function onboardLegacy() {
  const L = legacyStore();
  const on = Object.entries(L.perks).filter(([k, v]) => v && MR.LEGACY_PERKS[k]);
  const ch = ui.challenges || [];
  const heirOn = L.last && (ui.heir ?? true);
  const fund = heirOn ? MR.trustFund(L.last.nw, ch.includes('clean') ? 0 : (L.perks.trust || 0)) : 0;
  const chip = (on, act, v, label) => `<button data-act="${act}" ${v ? `data-v="${v}"` : ''} style="border:0;border-radius:16px;padding:7px 11px;font-size:13px;font-weight:600;background:${on ? '#fff' : 'rgba(255,255,255,.18)'};color:${on ? '#5a2bd6' : '#fff'}">${label}</button>`;
  if (!L.hall.length && !on.length) return '';
  const mult = 1 + ch.reduce((a, k) => a + MR.CHALLENGES[k].mult, 0);
  return `<div style="margin:12px 2px 0;font-size:13px;opacity:.95">
    ${L.last ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">${chip(heirOn, 'toggleHeir', '', heirOn ? '👑 Heir of ' + esc(L.last.name) : '👑 Start a new family')}<span style="opacity:.85">${heirOn ? `generation ${(L.last.gen || 1) + 1}${fund ? ` · inherits ${money(fund)}` : ''}` : ''}</span></div>` : ''}
    <div style="opacity:.85;margin-bottom:6px">Challenges ${ch.length ? `· points ×${mult.toFixed(2)}` : '(optional, more points)'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${Object.entries(MR.CHALLENGES).map(([k, c]) => chip(ch.includes(k), 'pickChallenge', k, `${c.icon} ${c.label}`)).join('')}</div>
    ${ch.length ? `<div style="opacity:.85;margin-top:6px">${ch.map(k => MR.CHALLENGES[k].desc).join(' · ')}</div>` : ''}
    ${on.length ? `<div style="margin-top:8px;${ch.includes('clean') ? 'text-decoration:line-through;opacity:.6' : ''}">🏛️ Perks: ${on.map(([k, v]) => `${MR.LEGACY_PERKS[k].icon} ${MR.LEGACY_PERKS[k].label} ${v}`).join(' · ')}</div>` : ''}
  </div>`;
}
function renderOnboarding() {
  $('#app').innerHTML = `<div class="onboard">
    <img class="icon" src="assets/icon.svg" alt="">
    <h1>Delusional<br>Business Inc.</h1>
    <p>You have a normal job, a little cash and an unreasonable amount of confidence. Rent a shop in Warsaw, London or New York, hire people and simulate your way to billionaire.</p>
    <input class="field" id="ceo" placeholder="Your name, CEO" maxlength="24" autocomplete="off">
    <div class="seg" style="margin-top:12px;background:rgba(255,255,255,.18)">${Object.entries(W.DIFFICULTIES).map(([k, d]) => `<button class="${(ui.newDiff || 'normal') === k ? 'on' : ''}" style="${(ui.newDiff || 'normal') === k ? 'color:#5a2bd6' : 'color:#fff'}" data-act="pickDiff" data-v="${k}">${d.label}</button>`).join('')}</div>
    <div style="font-size:13px;opacity:.85;margin:8px 4px 0">${W.DIFFICULTIES[ui.newDiff || 'normal'].desc} Start with ${money(W.DIFFICULTIES[ui.newDiff || 'normal'].startCash)}.</div>
    ${onboardLegacy()}
    <button class="btn block" data-act="start">Start my empire</button>
    ${IDX.slots.length ? `<button class="btn block" style="background:rgba(255,255,255,.18);color:#fff;margin-top:10px" data-act="cancelNew">${ui.returnTo ? 'Back to my current game' : 'Load a saved game'}</button>` : ''}
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
  return `${navbar('Day ' + S.day, { left: `<button class="nav-btn icon" data-act="help" aria-label="How to play">?</button>`, right: `${inboxBtn()}<button class="nav-btn icon" data-act="settings" aria-label="Settings">⚙︎</button>` })}
  <div class="wrap">
    <div class="large-title">Day ${S.day}</div>
    <div class="subtitle">${esc(S.ceo)}${S.dynasty ? ` · 👑 gen ${S.dynasty.gen}` : ''} · ${E.rankFor(nw)} · Rich list #${M.richRank(S, nw)}</div>
    <div style="margin:-4px 0 10px;display:flex;gap:6px;flex-wrap:wrap"><span class="pill">📅 ${MR.dateLabel(S.day)}</span>${seasonPill()}</div>
    <div class="hero">
      <div class="spark">${sparkline(cashHist)}</div>
      <div class="label">Cash</div>
      <div class="big">${money(S.cash, { compact: Math.abs(S.cash) >= 1e7 })}</div>
      <div class="stats">
        <div class="stat"><b>${money(nw)}</b><span>Net worth</span></div>
        <div class="stat"><b>${last ? signed(last.net) : '—'}</b><span>Yesterday</span></div>
      </div>
    </div>
    ${goalCard()}
    ${economyCard()}
    ${decisionCards()}
    ${S.bankruptcyPending ? `<button class="card mt" style="border:1px solid var(--red);width:100%;text-align:left" data-act="lastChance"><b class="neg">0 days left — the bank wants its ${money(-S.cash)} back.</b><div class="small muted" style="margin-top:4px">Time is frozen. Sell property, factories, shares or your club to repay it, or you're bankrupt. Tap to see what you can sell.</div></button>`
      : S.cash < 0 ? `<div class="card mt" style="border:1px solid var(--red)"><b class="neg">You're in overdraft.</b><div class="small muted mt" style="margin-top:4px">0.2% daily interest. Stay negative ${14 - S.negDays} more days and you go bankrupt — unless you can sell assets to repay it.</div></div>` : ''}
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
    ${E.netWorth(S) < 2e6 ? hustleChips() : ''}
    <div class="section-h"><h2>Businesses</h2>${S.businesses.length ? `<button class="link" data-act="newBiz">New</button>` : ''}</div>
    ${S.businesses.length ? `<div class="group">${S.businesses.map(b => bizRow(b)).join('')}</div>` : emptyBiz()}
    ${S.log.length ? `<div class="section-h"><h2>Activity</h2></div><div class="group">${S.log.slice(0, 8).map(e => `<div class="event"><span class="dot ${e.tone}"></span><div class="grow">${esc(e.text)}<div class="small muted">Day ${e.day}</div></div></div>`).join('')}</div>` : ''}
  </div>`;
}
function economyCard() {
  const e = S.economy;
  if (!e) return '';
  const ph = W.PHASES[e.phase];
  const pctv = Math.round((e.mult - 1) * 100);
  return `<div class="group mt"><div class="row with-icon"><div class="tile" style="display:grid;place-items:center;font-size:22px;background:var(--fill)">${ph.icon}</div>
    <div class="grow"><div class="title">Economy: ${ph.label}</div><div class="sub">Customer demand ${pctv >= 0 ? '+' : ''}${pctv}% · difficulty ${W.diff(S).label}</div></div></div></div>`;
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
    ${S.businesses.length ? hqCard() + S.businesses.map(b => bizCard(b)).join('') : emptyBiz()}
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
      ${issues.length ? '<span class="pill orange">Closed · setup needed</span>' : E.isOpenOn(b, S.day) ? `<span class="pill green">Open today · ${b.hours || BASE_HOURS}h</span>` : `<span class="pill">Closed today (${DAY_SHORT[S.day % 7]})</span>`}
      ${(() => { const c = E.competition(S, b); return c && c.war ? `<span class="pill red">⚔️ Price war · ${plural(c.war, 'day')} left</span>` : ''; })()}
      ${b.downtime ? `<span class="pill red">${b.downtime.reason === 'strike' ? '✊ On strike' : '🔥 Closed for repairs'} · ${plural(b.downtime.days, 'day')}</span>` : ''}
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

    ${scheduleSection(b)}
    ${pricingSection(b, main)}
    ${b.type === 'usedcars' ? auctionSection(b, main) : E.usesStock(b) ? stockSection(b, main) : ''}
    ${t.group === 'cars' ? tierProgress(b) : ''}

    <div class="section-h"><h2>Equipment</h2></div>
    <div class="group">
      ${equipRow(b, 'floor', main)}
      ${t.warehouse ? equipRow(b, 'warehouse', wh) : ''}
      ${equipRow(b, 'office', office)}
    </div>
    <div class="footnote">Every piece of equipment lets more people work. Sell back for ${Math.round(EQUIP_RESALE * 100)}% of the price.</div>

    <div class="section-h"><h2>Staff</h2></div>
    ${benchCard(b)}
    ${moraleCard(b)}
    ${staffGroup(b, 'floor', t.role + 's', main)}
    ${staffGroup(b, 'support', E.needsSecurity(b) ? 'Cleaning & security' : 'Cleaning', main)}
    ${t.warehouse ? staffGroup(b, 'warehouse', 'Warehouse workers', wh) : ''}
    ${staffGroup(b, 'office', 'Office staff', office)}

    ${bizExtras(b)}
    ${insuranceCard(b)}
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
  items.push([E.equipCount(b, 'floor') > 0, `Buy ${EQUIPMENT[b.type].name.toLowerCase()} (${money(EQUIPMENT[b.type].cost)})`, `data-act="buyEq" data-biz="${b.id}" data-g="floor"`, 'Buy', !main]);
  if (t.warehouse) items.push([E.equipCount(b, 'warehouse') > 0, `Buy ${WAREHOUSE_EQUIPMENT.name.toLowerCase()} (${money(WAREHOUSE_EQUIPMENT.cost)})`, `data-act="buyEq" data-biz="${b.id}" data-g="warehouse"`, 'Buy', !wh]);
  items.push([E.workersOf(S, b.id, 'floor').length > 0, `Hire ${t.role}s`, `data-act="hireFor" data-biz="${b.id}" data-pos="floor"`, 'Hire', !main || !E.equipCount(b, 'floor')]);
  if (t.warehouse) items.push([E.workersOf(S, b.id, 'warehouse').length > 0, 'Hire warehouse workers', `data-act="hireFor" data-biz="${b.id}" data-pos="warehouse"`, 'Hire', !wh || !E.equipCount(b, 'warehouse')]);
  if (E.usesStock(b)) {
    const inc = (b.incoming || []).map(o => o.arrive).sort((x, y) => x - y)[0];
    if (STOCK[b.type].auctionOnly) items.push([(b.stock || 0) >= 1, inc && !(b.stock >= 1) ? `Cars arriving day ${inc}` : 'Buy cars at the auction (below)', `data-act="noop"`, '↓', true]);
    else items.push([(b.stock || 0) >= 1, inc && !(b.stock >= 1) ? `Stock arriving day ${inc}` : `Order stock (arrives in ${STOCK_DELIVERY_DAYS} days)`, `data-act="orderStock" data-biz="${b.id}" data-q="${Math.max(1, Math.min(E.stockQuote(S, b, 0).room, Math.ceil(E.dailySales(S, b) * 5)))}"`, `Order ${money(Math.ceil(Math.max(1, Math.min(E.stockQuote(S, b, 0).room, Math.ceil(E.dailySales(S, b) * 5))) * E.unitCost(S, b)))}`, !main || !!inc]);
  }
  items.push([E.workersOf(S, b.id, 'cleaner').length > 0, 'Hire a cleaner', `data-act="hireFor" data-biz="${b.id}" data-pos="cleaner"`, 'Hire', !main]);
  if (E.needsSecurity(b)) items.push([E.workersOf(S, b.id, 'security').length > 0, 'Hire a security guard', `data-act="hireFor" data-biz="${b.id}" data-pos="security"`, 'Hire', !main]);
  return items.map(([done, label, act, btn, disabled]) => `<div class="row"><span class="check ${done ? 'on' : ''}"></span><div class="grow"><div class="title" style="${done ? 'color:var(--label2)' : ''}">${label}</div></div>
    ${done ? '' : `<button class="btn sm ${disabled ? 'gray' : ''}" ${act} ${disabled ? 'disabled' : ''}>${btn}</button>`}</div>`).join('');
}

function stockSection(b, main) {
  const st = STOCK[b.type];
  const have = Math.floor(b.stock || 0);
  const cap = E.storageCap(S, b);
  const daily = E.dailySales(S, b);
  const daysLeft = daily > 0 ? have / daily : 0;
  const per = E.unitCost(S, b);
  const room = E.stockQuote(S, b, 0).room;
  const unitStr = n => `${Math.round(n).toLocaleString('en-US')} ${st.unit}`;
  const presets = [];
  for (const d of [3, 7, 14]) {
    const want = Math.ceil(daily * d), qty = Math.min(room, want);
    if (qty < 1 || presets.some(x => x.qty === qty)) continue;
    presets.push({ d, qty, label: qty < want ? 'Fill storage' : `${d} days` });
  }
  const cents = v => v < 10 ? '$' + v.toFixed(2) : money(v);
  const incoming = (b.incoming || []).slice().sort((a, c) => a.arrive - c.arrive);
  return `<div class="section-h"><h2>Stock</h2><span class="small muted">${esc(st.goods)}</span></div>
    <div class="card">
      ${!main ? `<div class="small muted">Get a location first — stock is stored there${BT[b.type].warehouse ? ' and in your warehouse' : ''}.</div>` : `
      <div class="kv" style="padding-top:0"><span>In stock</span><b class="${have < daily ? 'neg' : ''}">${unitStr(have)}</b></div>
      <div class="bar ${daysLeft < 2 ? 'orange' : 'green'}" style="margin:4px 0 6px"><i style="width:${Math.min(100, Math.round(have / cap * 100))}%"></i></div>
      <div class="kv"><span>Lasts</span><span>${have < 1 ? '<span class="neg">Out of stock</span>' : `~${daysLeft < 10 ? daysLeft.toFixed(1) : Math.round(daysLeft)} days at ~${Math.round(daily).toLocaleString('en-US')}/day`}</span></div>
      <div class="kv"><span>Cost</span><span>${cents(per)} per ${st.unit.replace(/s$/, '')} · storage ${unitStr(cap)}</span></div>
      ${incoming.length ? `<div class="kv"><span>On the way</span><span style="text-align:right">${incoming.map(o => `${unitStr(o.qty)} · day ${o.arrive}`).join('<br>')}</span></div>` : ''}
      <div class="small muted" style="margin:10px 0 6px">Order — arrives in ${STOCK_DELIVERY_DAYS} days (day ${S.day + STOCK_DELIVERY_DAYS})</div>
      ${presets.length ? `<div class="presets">${presets.map(x => `<button data-act="orderStock" data-biz="${b.id}" data-q="${x.qty}">${x.label} · ${money(Math.ceil(x.qty * per))}</button>`).join('')}<button data-act="orderStockCustom" data-biz="${b.id}">Custom…</button></div>` : `<div class="small neg">Storage is full (counting stock on the way).</div>`}
      ${M.factoryFor(S, b.type) ? `<button class="row" style="padding:12px 0 0;min-height:0" data-act="factorySupply" data-biz="${b.id}"><div class="grow"><div class="title">Supplied by your ${esc(M.FACTORIES[M.factoryFor(S, b.type).type].name)}</div><div class="sub">Factory stock costs 45% of normal (8% extra from another city)</div></div><span class="check ${b.factorySupply !== false ? 'on' : ''}"></span></button>` : ''}
      <button class="row" style="padding:12px 0 0;min-height:0" data-act="autoStock" data-biz="${b.id}"><div class="grow"><div class="title">Auto-restock</div><div class="sub">Keeps about ${AUTO_STOCK_DAYS} days of stock, ordering automatically</div></div><span class="check ${b.autoStock ? 'on' : ''}"></span></button>`}
    </div>`;
}
function carTierRow(x) {
  const t = BT[x.type];
  const lock = E.tierLock(S, x.type);
  const prog = x.unlock ? Math.min(1, E.carsSold(S, x.unlock.type) / x.unlock.sold) : 1;
  return `<button class="row with-icon" data-act="pickType" data-v="${t.id}" style="align-items:flex-start;padding-top:14px;padding-bottom:14px">
    <img class="tile lg" src="${bizImg(t.id)}" alt="" style="${lock ? 'filter:grayscale(.8);opacity:.6' : ''}">
    <div class="grow"><div class="title">${lock ? '🔒 ' : ''}Tier ${t.tier}: ${t.tierName}</div>
      <div class="sub">~${money(t.ticket)} per car · ${money(t.license)} to register</div>
      <div class="sub">${STOCK[t.id].auctionOnly ? 'Stock: buy by hand at the auction' : 'Stock: order or automate'}</div>
      ${x.unlock ? `<div style="margin-top:6px" class="small ${lock ? 'muted' : 'pos'}">${lock ? `Sell ${x.unlock.sold.toLocaleString('en-US')} ${BT[x.unlock.type].tierName.toLowerCase()} · ${E.carsSold(S, x.unlock.type).toLocaleString('en-US')} so far` : 'Unlocked'}</div>
      <div class="bar ${lock ? '' : 'green'}" style="margin-top:4px"><i style="width:${Math.round(prog * 100)}%"></i></div>` : ''}
    </div><span class="chev"></span></button>`;
}
function tierProgress(b) {
  const t = BT[b.type];
  const next = CAR_TIERS.find(x => x.unlock && x.unlock.type === b.type);
  const sold = E.carsSold(S, b.type);
  if (!next) return `<div class="footnote">${sold.toLocaleString('en-US')} ${t.tierName.toLowerCase()} sold — top tier.</div>`;
  const prog = Math.min(1, sold / next.unlock.sold);
  return `<div class="card mt"><div class="kv" style="padding-top:0"><span>${t.tierName} sold</span><b>${sold.toLocaleString('en-US')} / ${next.unlock.sold.toLocaleString('en-US')}</b></div>
    <div class="bar green"><i style="width:${Math.round(prog * 100)}%"></i></div>
    <div class="small muted" style="margin-top:6px">${prog >= 1 ? `🎉 ${BT[next.type].name} unlocked — open one from New Business.` : `Unlocks the ${BT[next.type].name} (${BT[next.type].tierName.toLowerCase()}).`}</div></div>`;
}
function auctionSection(b, main) {
  const have = Math.floor(b.stock || 0);
  const cap = E.storageCap(S, b);
  const avg = have ? (b.stockValue || 0) / have : 0;
  const incoming = (b.incoming || []).slice().sort((a, c) => a.arrive - c.arrive);
  const bids = (S.bids || []).filter(x => x.bizId === b.id);
  const room = cap - have - incoming.length - bids.length;
  const sell = main ? BT.usedcars.ticket * (b.price || 1) * CITIES[main.city].spend : 0;
  const lots = S.auction.lots;
  const shown = ui.expand.has('auction') ? lots : lots.slice(0, 10);
  return `<div class="section-h"><h2>Car auction</h2><span class="small muted">new cars every day</span></div>
    ${!main ? `<div class="card small muted">Get a location first — cars are parked on your lot.</div>` : `
    <div class="card">
      <div class="kv" style="padding-top:0"><span>On your lot</span><b class="${have ? '' : 'neg'}">${have} car${have === 1 ? '' : 's'}${have ? ` · avg cost ${money(avg)}` : ''}</b></div>
      <div class="kv"><span>You sell for</span><span>~${money(sell)} each</span></div>
      <div class="kv"><span>Lot space</span><span>${Math.max(0, room)} free of ${cap}</span></div>
      ${incoming.length ? `<div class="kv"><span>On the way</span><span style="text-align:right" class="small">${incoming.map(o => `${esc(o.label || plural(o.qty, 'car'))} · day ${o.arrive}`).join('<br>')}</span></div>` : ''}
      ${bids.length ? `<div class="kv"><span>Your bids (decided tonight)</span><span style="text-align:right" class="small">${bids.map(x => `${esc(x.model)} · ${money(x.price)}`).join('<br>')}</span></div>` : ''}
    </div>
    <div class="footnote">Buy now, or bid ${Math.round(E.BID_DISCOUNT * 100)}% lower — bids win about ${Math.round(E.BID_WIN_CHANCE * 100)}% of the time and are decided at the end of the day. Cars arrive ${STOCK_DELIVERY_DAYS} days after you win them.</div>
    ${lots.length ? `<div class="group mt">${shown.map(l => { const pr = E.lotPrice(S, l, b); const margin = sell ? 1 - pr / sell : 0; return `<div class="row">
      <div class="grow"><div class="title">${esc(l.model)}</div><div class="sub">${(l.km / 1000).toFixed(0)}k km · ${money(pr)}${l.ratio < 0.68 ? ' · <span class="pos">bargain</span>' : ''} · <span class="${margin > 0.15 ? 'pos' : margin < 0.05 ? 'neg' : ''}">${Math.round(margin * 100)}% margin</span></div></div>
      <div style="display:flex;gap:6px"><button class="btn sm gray" data-act="bidLot" data-id="${l.id}" data-biz="${b.id}">Bid ${money(Math.round(pr * (1 - E.BID_DISCOUNT) / 10) * 10)}</button><button class="btn sm" data-act="buyLot" data-id="${l.id}" data-biz="${b.id}">Buy</button></div></div>`; }).join('')}
      ${lots.length > 10 ? `<button class="list-more" data-act="expand" data-key="auction">${ui.expand.has('auction') ? 'Show fewer' : `Show all ${lots.length}`}</button>` : ''}</div>
      <div class="presets mt"><button data-act="buyBargains" data-biz="${b.id}">Buy all bargains</button><button data-act="bidAll" data-biz="${b.id}">Bid on everything</button></div>`
      : `<div class="card empty mt"><p>Sold out for today. New cars tomorrow.</p></div>`}`}`;
}
function benchCard(b) {
  const fits = E.benchFor(S, b);
  if (!fits.length) return '';
  const byCat = {};
  for (const w of fits) { const l = E.catLabel(E.catOf(S, w)); byCat[l] = (byCat[l] || 0) + 1; }
  return `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:12px"><img class="tile" src="${uiImg('jobcenter')}" alt="">
    <div style="flex:1;min-width:0"><div class="bold">${plural(fits.length, 'unassigned worker')} can work here</div><div class="small muted">${Object.entries(byCat).map(([l, n]) => `${n} ${esc(l)}`).join(' · ')}</div></div>
    <button class="btn sm" data-act="placeBench" data-biz="${b.id}">Place all</button></div>`;
}
function moraleCard(b) {
  const m = Math.round(b.morale ?? 70), target = Math.round(W.moraleTarget(S, b));
  const pay = b.payLevel || 1;
  return `<div class="card" style="margin-bottom:12px">
    <div class="kv" style="padding-top:0"><span>Morale</span><b class="${m < 35 ? 'neg' : m >= 70 ? 'pos' : ''}">${m}/100 <span class="small muted">→ ${target}</span></b></div>
    <div class="bar ${m < 35 ? 'orange' : 'green'}" style="margin:4px 0 8px"><i style="width:${m}%"></i></div>
    <div class="small muted" style="margin-bottom:8px">Low morale means slower work, unhappy customers, people quitting and even strikes. Better pay, an HR Manager, a General Manager and sane hours help.</div>
    <div class="kv"><span>Pay level</span><b>${Math.round(pay * 100)}% of market</b></div>
    <div class="presets">${W.PAY_LEVELS.map(x => `<button class="${Math.abs(pay - x) < 0.001 ? 'on' : ''}" data-act="setPay" data-biz="${b.id}" data-v="${x}">${Math.round(x * 100)}%</button>`).join('')}</div>
    ${W.needsManager(S, b) ? `<div class="small ${W.hasManager(S, b) ? 'pos' : 'neg'}" style="margin-top:10px">${W.hasManager(S, b) ? '✓ Has a General Manager' : `⚠️ Needs a General Manager — you run more than ${W.diff(S).freeBiz} businesses. Without one: −20% output, unhappier staff.`}</div>` : ''}
  </div>`;
}
function insuranceCard(b) {
  return `<div class="section-h"><h2>Insurance</h2></div>
    <div class="card"><button class="row" style="padding:0;min-height:0" data-act="toggleInsure" data-biz="${b.id}"><div class="grow"><div class="title">Business insurance</div><div class="sub">${money(W.insurancePremium(S, b))}/day · covers ${Math.round((1 - W.INSURED_SHARE) * 100)}% of lawsuits, fires, fines and breaches</div></div><span class="check ${b.insured ? 'on' : ''}"></span></button>
    <div class="small muted" style="margin-top:8px">Bigger businesses attract bigger lawsuits.</div></div>`;
}
function scheduleSection(b) {
  const pat = E.weekPattern(b);
  const h = b.hours || BASE_HOURS;
  const openDays = (b.days || []).filter(x => x !== false).length || 7;
  return `<div class="section-h"><h2>Opening hours</h2><span class="small muted">${openDays} day${openDays > 1 ? 's' : ''} · ${h}h/day</span></div>
    <div class="card">
      <div class="week">${WEEK_ORDER.map(d => { const on = E.isOpenOn(b, d); const busy = pat[d]; return `<button class="wday ${on ? 'on' : ''} ${S.day % 7 === d ? 'today' : ''}" data-act="toggleDay" data-biz="${b.id}" data-d="${d}"><b>${DAY_SHORT[d].slice(0, 2)}</b><i style="height:${Math.round(6 + busy * 14)}px"></i></button>`; }).join('')}</div>
      <div class="small muted" style="margin:6px 2px 12px">Bars show how busy each day usually is. Staff aren't paid on closed days; Sundays cost ${SUNDAY_PAY}× in wages.</div>
      <div class="kv" style="padding-top:0"><span>Hours open per day</span><b>${h}h${h > BASE_HOURS ? ` · ${h - BASE_HOURS}h overtime` : ''}</b></div>
      <div class="presets">${[6, 8, 10, 12, 16, 24].map(x => `<button class="${h === x ? 'on' : ''}" data-act="setHours" data-biz="${b.id}" data-v="${x}">${x === 24 ? '24/7' : x + 'h'}</button>`).join('')}</div>
      <div class="small muted" style="margin-top:10px">Longer hours = more customers (with diminishing returns) and more capacity, but every hour past ${BASE_HOURS} is paid at 1.25× and very long days tire staff out.</div>
    </div>`;
}
function pricingSection(b, main) {
  const t = BT[b.type];
  const c = E.competition(S, b);
  const pr = b.price || 1;
  const city = CITIES[main ? main.city : 'london'];
  const cents = v => v < 10 ? '$' + v.toFixed(2) : money(v);
  const base = t.ticket * city.spend;
  const pf = main ? E.priceDemandFactor(S, b) : 1;
  return `<div class="section-h"><h2>Pricing</h2>${c ? `<span class="small muted">competition: ${E.compLevelLabel(c.level)}</span>` : ''}</div>
    <div class="card">
      ${c && c.war ? `<div class="pill red" style="margin-bottom:10px">⚔️ Price war — competitors are ${Math.round((1 - c.price) * 100)}% cheaper for ${plural(c.war, 'more day')}</div>` : ''}
      <div class="kv" style="padding-top:0"><span>Your price</span><b>${cents(base * pr)} <span class="pill ${pr > 1 ? 'orange' : pr < 1 ? 'green' : ''}">${pr === 1 ? 'market' : (pr > 1 ? '+' : '') + Math.round((pr - 1) * 100) + '%'}</span></b></div>
      ${c ? `<div class="kv"><span>Competitors charge</span><span>${cents(base * c.price)} (${c.price >= 1 ? '+' : ''}${Math.round((c.price - 1) * 100)}%)</span></div>
      <div class="kv"><span>Effect on customers</span><span class="${pf >= 1 ? 'pos' : 'neg'}">${pf >= 1 ? '+' : ''}${Math.round((pf - 1) * 100)}% demand</span></div>` : '<div class="small muted">Get a location to see local competitors.</div>'}
      <div class="presets mt" style="margin-top:10px">${[0.7, 0.85, 1, 1.15, 1.3, 1.5].map(x => `<button class="${Math.abs(pr - x) < 0.001 ? 'on' : ''}" data-act="setPrice" data-biz="${b.id}" data-v="${x}">${x === 1 ? 'Market' : (x > 1 ? '+' : '') + Math.round((x - 1) * 100) + '%'}</button>`).join('')}</div>
      <div class="btn-row mt" style="margin-top:8px"><button class="btn sm gray" data-act="nudgePrice" data-biz="${b.id}" data-v="-0.05">−5%</button><button class="btn sm gray" data-act="nudgePrice" data-biz="${b.id}" data-v="0.05">+5%</button></div>
      ${c ? `<button class="row" style="padding:12px 0 0;min-height:0" data-act="buyout" data-biz="${b.id}"><div class="grow"><div class="title">Buy out competitors</div><div class="sub">${c.boughtOut && c.boughtOut > S.day ? `Available again on day ${c.boughtOut}` : `${money(W.buyoutCost(S, b))} · competition −30%, their prices +5%`}</div></div><span class="chev"></span></button>` : ''}
      <div class="small muted" style="margin-top:10px">Cheaper than competitors wins customers and happier reviews, but undercutting hard can start a <b>price war</b>. If you're turning customers away anyway, raise prices.</div>
    </div>`;
}
function moveSection(w) {
  const st = sheet.state || (sheet.state = {});
  const cat = E.catOf(S, w);
  const targets = [S.hq, ...S.businesses].filter(x => x.id !== w.bizId && E.posForCat(S, x, cat));
  if (!targets.length) return `<div class="footnote mt">No ${w.bizId ? 'other ' : ''}business has a job for a ${esc(E.catLabel(cat))}${w.bizId ? '' : ' yet'}.</div>`;
  if (!targets.some(x => x.id === st.mvBiz)) st.mvBiz = targets[0].id;
  const tb = E.bizById(S, st.mvBiz);
  st.mvPos = E.posForCat(S, tb, cat);
  const c = E.positionCapacity(S, tb, st.mvPos);
  const wage = E.wageFor(S, { skill: w.skill, pos: st.mvPos }, tb);
  return `<div class="section-h"><h2>${w.bizId ? 'Move to' : 'Place in'}</h2></div>
    <div class="card target">
      <div><label>Business</label><select class="field" data-change="mvBiz">${targets.map(x => `<option value="${x.id}" ${x.id === st.mvBiz ? 'selected' : ''}>${E.isHQ(x) ? '🏢 ' : ''}${esc(x.name)}</option>`).join('')}</select></div>
      <div><label>Job</label><div class="field" style="display:flex;align-items:center;color:var(--label2);overflow:hidden;white-space:nowrap">${esc(E.catLabel(cat))}</div></div>
    </div>
    <div class="footnote">${c.parcel ? `${Math.max(0, c.cap - c.used)} free spot${c.cap - c.used === 1 ? '' : 's'} there.` : 'No location for this job there yet.'} People keep the job they were hired for.</div>
    <button class="btn block mt" data-act="placeW" data-id="${w.id}" ${c.parcel && c.used < c.cap ? '' : 'disabled'}>${w.bizId ? 'Move' : 'Place'} · ${money(wage)}/day</button>`;
}
function benchWorkerView(w) {
  return `<div class="biz-head"><img class="tile xl" src="${uiImg('jobcenter')}" alt=""><h1>${esc(w.name)}</h1><div class="muted">${esc(E.catLabel(E.catOf(S, w)))} · unassigned</div></div>
    <div class="card"><div class="kv"><span>Skill</span><span>${skillBar(w.skill)}</span></div>
    <div class="kv"><span>Standby pay</span><span>${money(w.benchWage || 0)}/day (${Math.round(E.BENCH_PAY * 100)}%)</span></div>
    <div class="kv"><span>Hired</span><span>Day ${w.hired}</span></div></div>
    ${S.businesses.length || S.hq.officeId ? moveSection(w) : '<div class="footnote mt">Open a business to place them.</div>'}
    <button class="btn block red mt2" data-act="fire" data-id="${w.id}">Let ${esc(w.name.split(' ')[0])} go</button>`;
}
function servesLabel(w) {
  const ids = E.hqServedList(S, w);
  if (!w.serves || !w.serves.length) return 'all businesses';
  return ids.length === 1 ? esc(E.bizById(S, ids[0])?.name || '1 business') : `${ids.length} businesses`;
}
function servesPicker(w) {
  if (w.pos === 'recruiter' || w.pos === 'accountant') return `<div class="footnote">${w.pos === 'recruiter' ? 'Recruiters work for the whole company.' : 'Accountants cut tax for the whole company.'}</div>`;
  const all = !w.serves || !w.serves.length;
  return `<div class="section-h"><h2>Works for</h2></div>
    <div class="group">
      <button class="row" data-act="servesAll" data-id="${w.id}"><span class="check ${all ? 'on' : ''}"></span><div class="grow"><div class="title">All businesses</div><div class="sub">Includes businesses you open later</div></div></button>
      ${S.businesses.map(b => `<button class="row with-icon" data-act="servesToggle" data-id="${w.id}" data-biz="${b.id}"><span class="check ${!all && w.serves.includes(b.id) ? 'on' : ''}"></span><img class="tile" src="${bizImg(b.type)}" alt=""><div class="grow"><div class="title">${esc(b.name)}</div><div class="sub">${E.workersOf(S, b.id).length} staff</div></div></button>`).join('')}
    </div>
    <div class="footnote">${w.pos === 'staffing' ? `Replaces people who quit or get poached at these businesses — up to ${E.coordinatorCapacity(w)} a day.` : w.pos === 'hr' ? 'One HR Manager looks after 40 employees, shared across the businesses they work for.' : 'A Marketing Manager\'s boost is spread across their businesses — the more they cover, the smaller the boost each gets.'}</div>`;
}
function staffingCard() {
  const coords = E.staffingCoordinators(S);
  const vac = (S.vacancies || []).length, rep = (S.replacements || []).length;
  return `<div class="section-h"><h2>Staffing</h2></div>
    <div class="card">${coords.length ? `<div class="kv" style="padding-top:0"><span>Staffing Coordinators</span><b>${coords.length} · up to ${coords.reduce((a, w) => a + E.coordinatorCapacity(w), 0)}/day</b></div>
      <div class="kv"><span>Open vacancies</span><span>${vac}</span></div><div class="kv"><span>Replacements on the way</span><span>${rep}</span></div>
      <div class="small muted" style="margin-top:6px">They fill gaps from Unassigned first, otherwise hire someone of similar skill (arrives in ${E.REPLACE_DAYS} days${S.workers.some(w => w.pos === 'recruiter' && w.bizId === E.HQ_ID) ? ', free thanks to your HQ Recruiter' : ', small Job Center fee — free with an HQ Recruiter'}).</div>`
      : `<div class="small">Hire a <b>Staffing Coordinator</b> here and people who quit or get poached are replaced automatically.${vac ? ` <span class="neg">${plural(vac, 'vacancy').replace('vacancys', 'vacancies')} waiting right now.</span>` : ''}</div>
      ${S.hq.officeId ? `<button class="btn sm mt" data-act="hireFor" data-biz="${E.HQ_ID}" data-pos="staffing">Hire a Staffing Coordinator</button>` : ''}`}</div>`;
}
function hqCard() {
  const hq = S.hq;
  const staff = S.workers.filter(w => w.bizId === E.HQ_ID).length;
  const office = E.parcelById(S, hq.officeId);
  return `<button class="biz-card" data-act="openHQ">
    <img class="tile lg" src="${uiImg('office')}" alt="">
    <div class="grow" style="flex:1;min-width:0"><div class="title bold" style="font-size:17px">Headquarters</div>
      <div class="small muted">${office ? `${CITIES[office.city].flag} ${esc(E.districtOf(office).name)} · ${staff} shared staff` : 'Shared office — one HR or marketing person for many businesses'}</div>
      <div class="meta">${office ? '<span class="pill blue">Global office</span>' : '<span class="pill">Not set up</span>'}</div></div><span class="chev"></span></button>`;
}
function viewHQ() {
  const hq = S.hq;
  const office = E.parcelById(S, hq.officeId);
  const backLabel = ui.tab === 'home' ? 'Home' : 'Businesses';
  return `${navbar('Headquarters', { left: backBtn(backLabel) })}
  <div class="wrap">
    <div class="biz-head"><img class="tile xl" src="${uiImg('office')}" alt=""><h1>Headquarters</h1>
      <div class="muted">One global office. Its HR Managers, Marketing Managers and Staffing Coordinators can work for several businesses at once; Recruiters and Accountants work for the whole company.</div></div>
    <div class="section-h"><h2>Office</h2></div>
    <div class="group">${locRow(hq, 'office', office, 'HQ office', 'office')}${office ? equipRow(hq, 'office', office) : ''}</div>
    ${staffingCard()}
    ${benchCard(S.hq)}
    <div class="section-h"><h2>Shared staff</h2></div>
    ${staffGroup(hq, 'office', 'Headquarters staff', office)}
    <div class="footnote">Tap someone to choose which businesses they work for.</div>
  </div>`;
}
function supportNeeds(b) {
  const core = S.workers.filter(w => w.bizId === b.id && !SUPPORT_ROLES.includes(w.pos)).length;
  const has = pos => S.workers.filter(w => w.bizId === b.id && w.pos === pos).length;
  const cn = Math.max(1, Math.ceil(core / CLEANER_RATIO));
  let out = `Cleaners ${has('cleaner')}/${cn} needed`;
  if (E.needsSecurity(b)) out += ` · Security ${has('security')}/${Math.max(1, Math.ceil(core / SECURITY_RATIO))} needed`;
  if (W.needsManager(S, b)) out += ` · Manager ${Math.min(1, has('manager'))}/1 needed`;
  return out;
}
function equipRow(b, group, parcel) {
  const eq = E.equipFor(b, group);
  const n = E.equipCount(b, group);
  const c = E.positionCapacity(S, b, group === 'office' ? 'recruiter' : group);
  const full = parcel && n * eq.staff >= c.spaceCap;
  const who = group === 'floor' ? BT[b.type].role + 's' : group === 'warehouse' ? 'warehouse workers' : 'office staff';
  const icon = group === 'floor' ? bizImg(b.type) : uiImg(group);
  return `<div class="row with-icon"><img class="tile" src="${icon}" alt="" style="${parcel ? '' : 'opacity:.45'}">
    <div class="grow"><div class="title">${esc(eq.name)}</div><div class="sub">${parcel ? `×${n} · fits ${Math.min(n * eq.staff, c.spaceCap)}/${c.spaceCap} ${who}` : `Needs ${group === 'floor' ? 'a location' : group === 'office' ? 'an office' : 'a warehouse'} first`} · ${money(eq.cost)} each</div></div>
    ${parcel ? `<div style="display:flex;gap:6px"><button class="btn sm gray" data-act="sellEq" data-biz="${b.id}" data-g="${group}" ${n ? '' : 'disabled'} aria-label="Sell one">−</button><button class="btn sm" data-act="buyEq" data-biz="${b.id}" data-g="${group}" ${full ? 'disabled' : ''} aria-label="Buy one">+</button></div>` : ''}</div>`;
}
function parcelSub(p) {
  const d = E.districtOf(p);
  const cost = p.status === 'rented' ? `rent ${money(p.rentLocked)}/day${p.leaseEnd ? ` · lease to day ${p.leaseEnd}` : ''}` : p.status === 'owned' ? `owned · upkeep ${money(E.parcelDailyCost(S, p))}/day` : '';
  return `${CITIES[p.city].flag} ${esc(d.name)} · ${SIZES[p.size].label}, ${p.cap} staff · flow ${p.traffic}${cost ? ' · ' + cost : ''}`;
}
function locRow(b, slot, p, label, kind) {
  if (!p) return `<div class="row with-icon"><img class="tile" src="${KINDS[slot === 'main' ? 'commercial' : kind].img}" alt="" style="opacity:.5"><div class="grow"><div class="title">${label}</div><div class="sub">Not set${slot === 'office' ? ' · optional' : ''}</div></div><button class="btn sm" data-act="pick" data-biz="${b.id}" data-slot="${slot}">Choose</button></div>`;
  return `<button class="row with-icon" data-act="parcel" data-id="${p.id}"><img class="tile" src="${KINDS[p.kind].img}" alt=""><div class="grow"><div class="title">${label}: ${esc(p.address)}</div><div class="sub">${parcelSub(p)}</div></div><span class="chev"></span></button>`;
}

function staffGroup(b, group, label, parcel) {
  const isOffice = group === 'office';
  const isSupport = group === 'support';
  const roles = isOffice ? OFFICE_ROLES : isSupport ? SUPPORT_ROLES : [group];
  const ws = S.workers.filter(w => w.bizId === b.id && roles.includes(w.pos)).sort((a, c) => c.skill - a.skill);
  const ci = E.positionCapacity(S, b, roles[0]);
  const cap = ci.cap;
  const key = `${b.id}:${group}`;
  const shown = ui.expand.has(key) ? ws : ws.slice(0, 6);
  const head = `<div class="row"><div class="grow"><div class="title">${label}</div><div class="sub">${parcel ? `${ws.length}/${cap} spots${ci.equip && ci.equipCap < ci.spaceCap ? ' (limited by equipment)' : ''} · ${money(ws.reduce((a, w) => a + E.wageFor(S, w, b), 0))}/day` : 'Needs a location first'}</div>${isSupport ? `<div class="sub">${supportNeeds(b)}</div>` : ''}</div>
    ${parcel ? `<button class="btn sm" data-act="hireFor" data-biz="${b.id}" data-pos="${isOffice ? (ws.some(w => w.pos === 'recruiter') ? 'hr' : 'recruiter') : isSupport ? (W.needsManager(S, b) && !W.hasManager(S, b) && ws.some(w => w.pos === 'cleaner') ? 'manager' : ws.some(w => w.pos === 'cleaner') && E.needsSecurity(b) ? 'security' : 'cleaner') : group}" ${ws.length >= cap ? 'disabled' : ''}>Hire</button>` : ''}</div>`;
  const rows = shown.map(w => `<button class="row" data-act="worker" data-id="${w.id}"><div class="grow"><div class="title">${esc(w.name)}</div><div class="sub">${isOffice || isSupport ? POSITIONS[w.pos].name + ' · ' : ''}${E.isHQ(b) ? servesLabel(w) + ' · ' : ''}${money(E.wageFor(S, w, b))}/day</div></div>${skillBar(w.skill)}</button>`).join('');
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
    ${P.mode === 'market' ? marketView() + priceTrend() : mineView(mine) + devSection()}
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
        <div class="grow"><div class="title">${esc(p.address)}</div><div class="sub">${parcelSub(p)}</div><div class="sub">${b ? `Used by ${esc(b.name)}` : p.leasedOut ? `<span class="pos">Leased out · +${money(p.leasedOut.rent)}/day</span>` : '<span class="neg">Unused — still costs money</span>'}</div></div>
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
      </div>${leaseBlock(p)}${p.leasedOut ? '' : actions}${p.leasedOut ? `<div class="footnote">End the lease to use or sell this property.</div>` : ''}`;
  });
}
function assignOptions(p) {
  const out = [];
  if (p.kind === 'office') out.push({ v: `${E.HQ_ID}|office`, l: `🏢 Headquarters (shared office)${S.hq.officeId ? ' (replace current)' : ''}`, empty: !S.hq.officeId });
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

// ---------------------------------------------------------------- EMPIRE
function viewEmpire() {
  const nw = E.netWorth(S);
  const seg = ui.emp.seg;
  const body = seg === 'factories' ? factoriesView() : seg === 'stocks' ? stocksView(nw) : seg === 'sports' ? sportsSub() + (ui.emp.sport === 'bball' ? bballView() : ui.emp.sport === 'racing' ? racingView() : sportsView()) : seg === 'billions' ? billionsView(nw) : richView(nw);
  return `${navbar('Empire')}
  <div class="wrap">
    <div class="large-title">Empire</div>
    <div class="subtitle">Rich list #${M.richRank(S, nw)} · net worth ${money(nw)}</div>
    <div class="seg" style="margin-bottom:14px">${[['factories', 'Factories'], ['stocks', 'Stocks'], ['sports', 'Sports'], ['billions', 'Billions'], ['rich', 'Rich']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="empSeg" data-v="${k}">${l}</button>`).join('')}</div>
    ${body}
  </div>`;
}
function factoriesView() {
  const bonus = M.constructionBonus(S);
  const mine = S.factories.map(f => {
    const F = M.FACTORIES[f.type], L = f.last;
    const status = f.buildLeft > 0 ? `<span class="pill orange">Building · ${plural(f.buildLeft, 'day')}</span>` : f.upgrading ? `<span class="pill blue">Upgrading · ${plural(f.upgrading, 'day')}</span>` : '<span class="pill green">Running</span>';
    return `<div class="card mt"><div style="display:flex;gap:12px;align-items:center"><img class="tile lg" src="${uiImg('factory')}" alt="">
      <div style="flex:1;min-width:0"><div class="bold">${esc(F.name)}</div><div class="small muted">${CITIES[f.city].flag} ${CITIES[f.city].name} · level ${f.level}/${M.MAX_LEVEL}</div><div style="margin-top:4px">${status}</div></div></div>
      ${L ? `<div class="kv mt"><span>Capacity</span><span>${money(L.capacity)}/day of goods</span></div>
      <div class="kv"><span>Shipped to your shops</span><span>${money(L.shipped)} · saves you ~${money(L.shipped * (1 - M.PROD_COST))}</span></div>
      <div class="kv"><span>Sold wholesale</span><span>${money(L.wholesale)}</span></div>
      <div class="kv"><span>Production + running</span><span class="neg">−${money(L.prod + L.op)}</span></div>
      <div class="kv"><span>Factory result</span><b class="${cls(L.net)}">${signed(L.net)}/day</b></div>` : `<div class="small muted mt">${F.supplies.length ? `Supplies: ${F.supplies.map(t => BT[t].name).join(', ')}` : 'Sells everything wholesale'}</div>`}
      ${factoryExtras(f)}
      <div class="btn-row mt"><button class="btn sm red" data-act="sellFactory" data-id="${f.id}">Sell ${money(M.factoryValue(f))}</button>${f.level < M.MAX_LEVEL ? `<button class="btn sm" data-act="upgradeFactory" data-id="${f.id}" ${f.buildLeft > 0 || f.upgrading ? 'disabled' : ''}>Upgrade ${money(M.upgradeCost(S, f))}</button>` : ''}</div></div>`;
  }).join('');
  return `${S.factories.length ? `<div class="section-h" style="margin-top:4px"><h2>Your factories</h2></div>${mine}` : `<div class="card empty"><img src="${uiImg('factory')}" alt=""><h3>No factories yet</h3><p>Factories make stock for your shops at 45% of the usual cost and sell anything left over wholesale.</p></div>`}
    <div class="section-h"><h2>Build a factory</h2></div>
    ${citySeg('empCity', ui.emp.city)}
    <div class="footnote" style="margin:10px 4px">${bonus ? '✓ Your Construction Company builds it 20% cheaper and 40% faster.' : 'Tip: own a Construction Company with 5+ builders to build 20% cheaper and 40% faster.'} Shops in other cities pay 8% extra shipping.</div>
    <div class="group">${Object.entries(M.FACTORIES).map(([k, F]) => {
      const q = M.buildQuote(S, k);
      const shops = S.businesses.filter(b => F.supplies.includes(b.type)).length;
      return `<div class="row with-icon"><img class="tile" src="${F.supplies.length ? bizImg(F.supplies[0]) : uiImg('factory')}" alt=""><div class="grow"><div class="title">${esc(F.name)}</div>
        <div class="sub">${F.supplies.length ? `for ${F.supplies.map(t => BT[t].name).join(' & ')}${shops ? ` · you have ${shops}` : ''}` : `⛓️ upstream: makes ${F.feeds.map(k => M.FACTORIES[k].name).join(', ')} 15% cheaper`}</div>
        <div class="sub">${money(F.value)}/day of goods · ${q.days} days to build · ${money(F.op)}/day running</div></div>
        <button class="btn sm" data-act="buildFactory" data-v="${k}" ${S.cash < q.cost ? 'disabled' : ''}>${money(q.cost)}</button></div>`;
    }).join('')}</div>`;
}
function pctChange(a, b) { const v = (a - b) / b * 100; return `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`; }
function stocksView(nw) {
  const port = M.portfolioValue(S);
  const basis = Object.values(S.market.holdings).reduce((a, h) => a + h.cost, 0);
  const ipo = S.ipo;
  const company = ipo ? `<div class="card"><div style="display:flex;gap:12px;align-items:center"><img class="tile lg" src="${uiImg('empire')}" alt=""><div style="flex:1"><div class="bold">${esc(S.ceo)} Holdings · public</div><div class="small muted">Share price ${money(M.sharePrice(S, nw) < 100 ? Math.round(M.sharePrice(S, nw) * 100) / 100 : M.sharePrice(S, nw))} · public owns ${Math.round(ipo.pct * 1000) / 10}%</div></div></div>
      <div class="kv mt"><span>Board confidence</span><b class="${ipo.confidence < 30 ? 'neg' : ''}">${Math.round(ipo.confidence)}/100</b></div>
      <div class="bar ${ipo.confidence < 30 ? 'orange' : 'green'}"><i style="width:${Math.round(ipo.confidence)}%"></i></div>
      <div class="kv"><span>Next shareholder review</span><span>day ${ipo.nextReview} · target +${Math.round(W.diff(S).ipoTarget * 100)}% net worth</span></div>
      <div class="kv"><span>Growth so far this quarter</span><span>${pctChange(nw, ipo.base)}</span></div>
      <div class="small muted" style="margin:6px 0 8px">Shareholders get ${Math.round(ipo.pct * 100)}% of your profits as dividends.${W.diff(S).ousting ? ' If board confidence hits 0 you are voted out.' : ''}</div>
      <div class="presets">${[0.05, 0.1].filter(x => x < ipo.pct).map(x => `<button data-act="buyback" data-v="${x}">Buy back ${x * 100}% · ${money(M.buybackQuote(S, x, nw))}</button>`).join('')}<button data-act="buyback" data-v="all">Go private · ${money(M.buybackQuote(S, ipo.pct, nw))}</button></div></div>`
    : `<button class="biz-card" data-act="ipo"><img class="tile lg" src="${uiImg('empire')}" alt=""><div style="flex:1"><div class="bold">Take your company public</div><div class="small muted">${nw >= M.IPO_MIN_NET ? `Sell up to 49% for about ${money(M.ipoQuote(S, 0.49, nw).proceeds)}` : `Needs ${money(M.IPO_MIN_NET)} net worth`}</div></div><span class="chev"></span></button>`;
  return `${company}
    <div class="grid2 mt"><div class="metric"><div class="k">Portfolio</div><div class="v">${money(port)}</div><div class="s">${basis ? `${port >= basis ? '+' : ''}${money(port - basis)} unrealised` : 'no shares yet'}</div></div>
      <div class="metric"><div class="k">Realised</div><div class="v ${cls(S.market.realized)}">${signed(Math.round(S.market.realized))}</div><div class="s">taxed as income</div></div></div>
    ${positionsCard()}
    <div class="section-h"><h2>Market</h2><span class="small muted">${W.PHASES[S.economy.phase].icon} ${W.PHASES[S.economy.phase].label}</span></div>
    <div class="group">${Object.values(S.market.stocks).map(st => {
      const h = S.market.holdings[st.t];
      return `<button class="row" data-act="stock" data-v="${st.t}"><div style="width:52px" class="bold small">${st.t}</div><div class="grow"><div class="title" style="font-size:15px">${esc(st.name)}</div><div class="sub">${st.sector}${st.div ? ` · ${Math.round(st.div * 100)}% dividend` : ''}${h ? ` · you own ${h.qty.toLocaleString('en-US')}` : ''}</div></div>
        <div style="text-align:right"><div class="bold">${money(st.price < 100 ? Math.round(st.price * 100) / 100 : st.price)}</div><div class="small">${pctChange(st.price, st.open)}</div></div>${sparkline(st.hist.slice(-30), 56, 26, st.price >= st.hist[Math.max(0, st.hist.length - 30)] ? 'var(--green)' : 'var(--red)')}</button>`;
    }).join('')}</div>
    <div class="footnote">Prices follow the economy and company news. ${Math.round(M.TRADE_FEE * 1000) / 10}% fee per trade. Dividends are paid every 90 days.</div>`;
}
function stockSheet(t) {
  openSheet(t, () => {
    const st = S.market.stocks[t];
    const h = S.market.holdings[t];
    const fmtp = v => money(v < 100 ? Math.round(v * 100) / 100 : v);
    return `<div class="biz-head"><h1>${esc(st.name)}</h1><div class="muted">${st.sector} · ${fmtp(st.price)} ${pctChange(st.price, st.open)} today</div></div>
      <div class="card">${lineChart(st.hist, st.price >= st.hist[0] ? 'var(--green)' : 'var(--red)', false)}</div>
      <div class="card mt"><div class="kv" style="padding-top:0"><span>You own</span><b>${h ? h.qty.toLocaleString('en-US') : 0} shares</b></div>
        ${h ? `<div class="kv"><span>Value</span><span>${money(h.qty * st.price)} (${h.qty * st.price >= h.cost ? '+' : ''}${money(h.qty * st.price - h.cost)})</span></div>` : ''}
        <div class="kv"><span>Dividend</span><span>${st.div ? `${Math.round(st.div * 100)}% a year, paid every 90 days` : 'none'}</span></div></div>
      <div class="section-h"><h2>Buy</h2></div>
      <div class="presets">${[10, 100, 1000, 10000, 100000].map(q => `<button data-act="trade" data-t="${t}" data-q="${q}">${q.toLocaleString('en-US')} · ${money(q * st.price)}</button>`).join('')}<button data-act="trade" data-t="${t}" data-q="max">Max</button></div>
      ${h ? `<div class="section-h"><h2>Sell</h2></div><div class="presets">${[10, 100, 1000, 10000].filter(q => q < h.qty).map(q => `<button data-act="trade" data-t="${t}" data-q="${-q}">${q.toLocaleString('en-US')}</button>`).join('')}<button data-act="trade" data-t="${t}" data-q="all">All ${h.qty.toLocaleString('en-US')}</button></div>` : ''}
      ${stockExtras(t)}`;
  });
}
function ipoSheet() {
  openSheet('Go public', () => {
    const nw = E.netWorth(S);
    if (nw < M.IPO_MIN_NET) return `<div class="empty"><img src="${uiImg('empire')}" alt=""><h3>Not big enough yet</h3><p>Investors want a company worth at least ${money(M.IPO_MIN_NET)}. You're at ${money(nw)}.</p></div>`;
    return `<div class="biz-head"><img class="tile xl" src="${uiImg('empire')}" alt=""><h1>Ring the bell</h1><div class="muted">Sell part of your company on the stock exchange for a huge cash injection.</div></div>
      <div class="card small" style="line-height:1.5">After the IPO:<ul style="margin:6px 0;padding-left:18px"><li>Shareholders get their share of your daily profits as dividends.</li><li>Every 90 days they review growth (target +${Math.round(W.diff(S).ipoTarget * 100)}% net worth per quarter).</li><li>Missed targets lower board confidence.${W.diff(S).ousting ? ' At 0 you are voted out — game over.' : ' (On Easy they never vote you out.)'}</li><li>You can buy shares back later.</li></ul></div>
      <div class="group mt">${[0.1, 0.2, 0.3, 0.4, 0.49].map(p => `<button class="row" data-act="doIPO" data-v="${p}"><div class="grow"><div class="title">Sell ${Math.round(p * 100)}%</div><div class="sub">you keep ${Math.round((1 - p) * 100)}%</div></div><div class="value pos">+${money(M.ipoQuote(S, p, nw).proceeds)}</div></button>`).join('')}</div>`;
  });
}
function sportsView() {
  const c = S.sports.club;
  if (!c) {
    const city = ui.emp.sportsCity;
    const lg = S.sports.leagues[city], lg2 = S.sports.leagues2[city];
    return `<div class="card empty" style="padding:24px 16px"><img src="${uiImg('sports')}" alt=""><h3>Buy a football club</h3><p>Pay player wages, earn sponsors, ticket sales and prize money. Titles boost all your businesses in that city.</p></div>
      <div class="mt">${citySeg('sportsCity', city)}</div>
      <div class="section-h"><h2>${M.LEAGUE_NAMES[city]}</h2><span class="small muted">season ${lg.season}</span></div>
      <div class="group">${lg.teams.slice().sort((a, b) => b.rating - a.rating).map(t => `<div class="row"><div class="grow"><div class="title">${esc(t.name)}</div><div class="sub">rating ${t.rating} · ${t.pts} pts</div></div><button class="btn sm" data-act="buyClub" data-id="${t.id}" ${S.cash < M.clubPrice(S, t, city) ? 'disabled' : ''}>${money(M.clubPrice(S, t, city))}</button></div>`).join('')}</div>
      <div class="section-h"><h2>Division 2</h2><span class="small muted">cheaper · top 2 go up</span></div>
      <div class="group">${lg2.teams.slice().sort((a, b) => b.rating - a.rating).map(t => `<div class="row"><div class="grow"><div class="title">${esc(t.name)}</div><div class="sub">rating ${t.rating} · ${t.pts} pts</div></div><button class="btn sm" data-act="buyClub" data-id="${t.id}" ${S.cash < M.clubPrice(S, t, city) ? 'disabled' : ''}>${money(M.clubPrice(S, t, city))}</button></div>`).join('')}</div>`;
  }
  const { lg, div } = M.leagueOf(S, c.city, c.teamId);
  const table = M.standings(lg);
  const pos = table.findIndex(t => t.id === c.teamId) + 1;
  const me = table[pos - 1];
  const next = lg.fixtures[lg.round] && lg.fixtures[lg.round].find(p => p.includes(c.teamId));
  const oppId = next && (next[0] === c.teamId ? next[1] : next[0]);
  const opp = oppId && lg.teams.find(t => t.id === oppId);
  const wages = c.players.reduce((a, p) => a + p.wage, 0);
  const daysToSat = (6 - S.day % 7 + 7) % 7;
  return `<div class="card"><div style="display:flex;gap:12px;align-items:center"><img class="tile lg" src="${uiImg('sports')}" alt=""><div style="flex:1"><div class="bold" style="font-size:18px">${esc(c.name)}</div><div class="small muted">${M.LEAGUE_NAMES[c.city]}${div === 2 ? M.LEAGUE2 : ''} · season ${lg.season} · round ${lg.round}/${M.ROUNDS}</div></div></div>
      <div class="grid3 mt"><div class="metric" style="background:var(--fill)"><div class="k">Position</div><div class="v">${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Rating</div><div class="v">${Math.round(M.clubRating(c, S))}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Record</div><div class="v" style="font-size:17px">${me.w}-${me.d}-${me.l}</div></div></div>
      ${opp ? `<div class="kv mt"><span>Next match</span><span>${next[0] === c.teamId ? 'vs' : '@'} ${esc(opp.name)} (${opp.rating}) · ${daysToSat ? `in ${plural(daysToSat, 'day')}` : 'today'}</span></div>` : ''}
      <div class="kv"><span>Player wages</span><span class="neg">−${money(wages)}/day</span></div>
      <div class="kv"><span>Sponsors</span><span class="pos">+${money(c.last ? c.last.sponsor : 0)}/day</span></div>
      <div class="kv"><span>Stadium</span><span>${M.STADIUM_CAPS[c.stadium].toLocaleString('en-US')} seats</span></div>
      <div class="small muted" style="margin:8px 0 6px">Ticket prices</div>
      <div class="presets">${[0.75, 1, 1.25, 1.5, 2].map(x => `<button class="${Math.abs(c.ticket - x) < 0.001 ? 'on' : ''}" data-act="ticket" data-v="${x}">${x === 1 ? 'Normal' : Math.round((x - 1) * 100) + '%'}</button>`).join('')}</div>
      <div class="btn-row mt">${c.stadium < M.STADIUM_CAPS.length - 1 ? `<button class="btn sm" data-act="stadium">Expand stadium ${money(M.stadiumUpgradeCost(c))}</button>` : ''}<button class="btn sm red" data-act="sellClub">Sell club ${money(M.clubValue(S))}</button></div>
    </div>
    ${footballExtras(c)}
    <div class="section-h"><h2>Table</h2><span class="small muted">prize for 1st: ${money(M.PRIZES[0] * CITIES[c.city].spend * (div === 2 ? M.DIV2_PRIZE : 1))}</span></div>
    <div class="group">${table.map((t, i) => `<div class="row" style="min-height:40px;padding:8px 16px;${t.id === c.teamId ? 'background:rgba(10,122,255,.12)' : ''}"><div style="width:22px" class="bold small">${i + 1}</div><div class="grow"><div class="title" style="font-size:15px">${esc(t.name)}</div></div><div class="small muted" style="width:70px;text-align:right">${t.w}-${t.d}-${t.l} ${t.gf - t.ga >= 0 ? '+' : ''}${t.gf - t.ga}</div><div class="bold" style="width:34px;text-align:right">${t.pts}</div></div>`).join('')}</div>
    ${S.sports.results.length ? `<div class="section-h"><h2>Results</h2></div><div class="group">${S.sports.results.slice(0, 6).map(r => `<div class="row" style="min-height:40px"><span class="pill ${r.res === 'W' ? 'green' : r.res === 'L' ? 'red' : ''}">${r.res}</span><div class="grow"><div class="title" style="font-size:15px">${r.my}–${r.their} ${r.home ? 'vs' : '@'} ${esc(r.opp)}</div><div class="sub">day ${r.day}${r.tickets ? ` · tickets ${money(r.tickets)}` : ''}</div></div></div>`).join('')}</div>` : ''}
    <div class="section-h"><h2>Squad</h2><span class="small muted">${c.players.length}/25 · best 11 play</span></div>
    <div class="group">${c.players.slice().sort((a, b) => b.rating - a.rating).map(p => `<button class="row" data-act="sellPlayer" data-id="${p.id}"><div style="width:30px" class="small bold muted">${p.pos}</div><div class="grow"><div class="title" style="font-size:15px">${esc(p.name)}${p.injured > S.day ? ' 🤕' : ''}${p.academy ? ' 🌱' : ''}</div><div class="sub">age ${p.age} · ${money(p.wage)}/day · worth ${money(p.value)}</div></div>${skillBar(p.rating)}</button>`).join('')}</div>
    <div class="footnote">Tap a player to sell them for 80% of their value.</div>
    <div class="section-h"><h2>Transfer market</h2><span class="small muted">new players weekly</span></div>
    <div class="group">${S.sports.transfers.map(p => `<div class="row"><div style="width:30px" class="small bold muted">${p.pos}</div><div class="grow"><div class="title" style="font-size:15px">${esc(p.name)} · ${p.rating}</div><div class="sub">age ${p.age} · ${money(p.wage)}/day</div></div><button class="btn sm" data-act="signPlayer" data-id="${p.id}" ${S.cash < p.value ? 'disabled' : ''}>${money(p.value)}</button></div>`).join('')}</div>`;
}
const RICHSEC = k => M.RICH_SECTORS[k] || { icon: '💼' };
function richProfileSheet(name) {
  openSheet('Rich list', () => {
    const nw = E.netWorth(S);
    const list = [...S.richlist.map(r => ({ name: r.name, nw: r.nw })), { name: '__me', nw }].sort((a, b) => b.nw - a.nw);
    const rank = list.findIndex(x => x.name === name) + 1;
    if (name === '__me') return myProfile(nw, rank);
    const r = M.richProfile(S, name);
    if (!r) return null;
    const ch = r.nw - r.prev, chPct = r.prev ? ch / r.prev * 100 : 0;
    const h = r.hist;
    const d30 = h.length > 1 ? r.nw - h[Math.max(0, h.length - 31)] : 0;
    const days = h.slice(1).map((v, i) => v - h[i]);
    const best = days.length ? Math.max(...days) : 0, worst = days.length ? Math.min(...days) : 0;
    const gap = r.nw - nw;
    const invested = r.companies.reduce((a, c) => a + c.w, 0);
    return `<div class="biz-head"><div class="tile xl" style="display:grid;place-items:center;font-size:44px;background:var(--fill)">${RICHSEC(r.industry).icon}</div><h1>${esc(r.name)}</h1>
        <div class="muted">#${rank} in the world · ${money(r.nw)}</div>
        <div class="pill ${gap > 0 ? '' : 'green'}">${gap > 0 ? `${money(gap)} richer than you` : `${money(-gap)} poorer than you`}</div></div>
      <div class="grid2">
        <div class="metric"><div class="k">Yesterday</div><div class="v ${cls(ch)}">${signed(ch)}</div><div class="s">${chPct >= 0 ? '+' : ''}${chPct.toFixed(2)}%</div></div>
        <div class="metric"><div class="k">Last ${Math.min(30, h.length - 1)} days</div><div class="v ${cls(d30)}">${signed(d30)}</div><div class="s">${h.length > 1 ? `${(d30 / h[Math.max(0, h.length - 31)] * 100).toFixed(1)}%` : 'new on the list'}</div></div>
        <div class="metric"><div class="k">Best day</div><div class="v pos" style="font-size:18px">${signed(best)}</div></div>
        <div class="metric"><div class="k">Worst day</div><div class="v neg" style="font-size:18px">${signed(worst)}</div></div>
      </div>
      <div class="section-h"><h2>Net worth</h2><span class="small muted">last ${h.length} days</span></div>
      <div class="card">${lineChart(h, ch >= 0 ? 'var(--green)' : 'var(--red)', false)}</div>
      <div class="section-h"><h2>About</h2></div>
      <div class="card"><div class="kv" style="padding-top:0"><span>Age</span><span>${r.age}</span></div><div class="kv"><span>Lives in</span><span>${esc(r.home)}</span></div>
        <div class="kv"><span>Fortune</span><span>${r.selfMade ? 'Self-made' : 'Inherited'}</span></div><div class="kv"><span>Main industry</span><span>${RICHSEC(r.industry).icon} ${esc(r.industry)}</span></div>
        <div class="kv"><span>Employees (all companies)</span><span>${M.richEmployees(r).toLocaleString('en-US')}</span></div></div>
      <div class="section-h"><h2>Companies</h2><span class="small muted">${r.companies.length}</span></div>
      <div class="group">${r.companies.slice().sort((a, b) => b.w - a.w).map(c => `<div class="row with-icon"><div class="tile" style="display:grid;place-items:center;font-size:20px;background:var(--fill)">${RICHSEC(c.sector).icon}</div>
        <div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.sector)} · owns ${c.stake}% · ${money(r.nw * c.w)}</div><div class="sub">yesterday ${signed(ch * c.w)}</div></div>
        ${nw >= BL.BILLION ? `<button class="btn sm" data-act="takeover" data-npc="${esc(r.name)}" data-c="${esc(c.name)}">Buy ${money(BL.takeoverPrice(S, r.name, c.name).price)}</button>` : ''}</div>`).join('')}
        <div class="row with-icon"><div class="tile" style="display:grid;place-items:center;font-size:20px;background:var(--fill)">💵</div><div class="grow"><div class="title">Cash, yachts & other</div></div><div class="value">${money(r.nw * (1 - invested))}</div></div></div>
      <div class="footnote">${nw >= BL.BILLION ? 'Buying a company pays you a share of its profits every day and gives your empire a lasting bonus for its industry. Their main company costs a 60% premium, others 30%.' : `Reach ${money(BL.BILLION)} net worth to buy their companies.`}</div>`;
  });
}
function myProfile(nw, rank) {
  const byType = {};
  for (const b of S.businesses) byType[b.type] = (byType[b.type] || 0) + 1;
  const L = S.lastReport;
  const bizVal = S.businesses.reduce((a, b) => a + E.businessValue(S, b), 0);
  const prop = S.parcels.filter(p => p.status === 'owned').reduce((a, p) => a + E.parcelValue(S, p), 0);
  const fac = S.factories.reduce((a, f) => a + M.factoryValue(f), 0);
  const next = S.richlist.filter(r => r.nw > nw).sort((a, b) => a.nw - b.nw)[0];
  return `<div class="biz-head"><img class="tile xl" src="assets/icon.svg" alt=""><h1>${esc(S.ceo)} (you)</h1><div class="muted">#${rank} in the world · ${money(nw)}</div>
      ${next ? `<div class="pill">${money(next.nw - nw)} to pass ${esc(next.name)}</div>` : '<div class="pill green">Richest person in the world</div>'}</div>
    <div class="grid2">
      <div class="metric"><div class="k">Yesterday</div><div class="v ${cls(L ? L.net : 0)}">${L ? signed(L.net) : '—'}</div><div class="s">net income</div></div>
      <div class="metric"><div class="k">Cash</div><div class="v">${money(S.cash)}</div></div>
      <div class="metric"><div class="k">Employees</div><div class="v">${S.workers.length.toLocaleString('en-US')}</div></div>
      <div class="metric"><div class="k">Day</div><div class="v">${S.day}</div><div class="s">${W.diff(S).label}</div></div>
    </div>
    <div class="section-h"><h2>Cash</h2><span class="small muted">last ${Math.min(90, S.ledger.length)} days</span></div>
    <div class="card">${lineChart(S.ledger.slice(-90).map(x => x.cash))}</div>
    <div class="section-h"><h2>What you own</h2></div>
    <div class="group">
      ${Object.entries(byType).map(([t, n]) => `<div class="row with-icon"><img class="tile" src="${bizImg(t)}" alt=""><div class="grow"><div class="title">${n} × ${esc(BT[t].name)}</div></div></div>`).join('') || '<div class="row"><div class="grow muted">No businesses yet</div></div>'}
      ${S.factories.length ? `<div class="row with-icon"><img class="tile" src="${uiImg('factory')}" alt=""><div class="grow"><div class="title">${plural(S.factories.length, 'factory').replace('factorys', 'factories')}</div></div><div class="value">${money(fac)}</div></div>` : ''}
      ${S.sports.club ? `<div class="row with-icon"><img class="tile" src="${uiImg('sports')}" alt=""><div class="grow"><div class="title">${esc(S.sports.club.name)}</div></div><div class="value">${money(M.clubValue(S))}</div></div>` : ''}
      ${M.portfolioValue(S) ? `<div class="row with-icon"><img class="tile" src="${uiImg('stocks')}" alt=""><div class="grow"><div class="title">Share portfolio</div></div><div class="value">${money(M.portfolioValue(S))}</div></div>` : ''}
      ${prop ? `<div class="row with-icon"><img class="tile" src="${uiImg('commercial')}" alt=""><div class="grow"><div class="title">Owned property</div></div><div class="value">${money(prop)}</div></div>` : ''}
      <div class="row with-icon"><img class="tile" src="${uiImg('empire')}" alt=""><div class="grow"><div class="title">Businesses (valuation)</div>${S.ipo ? `<div class="sub">you own ${Math.round((1 - S.ipo.pct) * 100)}% after the IPO</div>` : ''}</div><div class="value">${money(bizVal)}</div></div>
    </div>`;
}
function richView(nw) {
  const list = S.richlist.map(r => ({ ...r, me: false }));
  list.push({ name: `${S.ceo} (you)`, nw, me: true });
  list.sort((a, b) => b.nw - a.nw);
  return `<div class="card empty" style="padding:22px 16px"><img src="${uiImg('crown')}" alt=""><h3>#${M.richRank(S, nw)} of ${list.length}</h3><p>${list.findIndex(x => x.me) === 0 ? 'You are the richest person in the world. Fully delusional.' : `Next up: ${esc(list[list.findIndex(x => x.me) - 1].name)} at ${money(list[list.findIndex(x => x.me) - 1].nw)}`}</p></div>
    <div class="group mt">${list.map((r, i) => { const ch = r.me ? (S.lastReport ? S.lastReport.net : 0) : r.nw - (r.prev ?? r.nw); return `<button class="row" data-act="richProfile" data-v="${r.me ? '__me' : esc(r.name)}" style="${r.me ? 'background:rgba(10,122,255,.14)' : ''}"><div style="width:28px" class="bold">${i + 1}</div>
      <div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${r.me ? 'Your empire' : `${RICHSEC(r.industry).icon} ${esc(r.industry)} · ${esc(r.home || '')}`}</div></div>
      <div style="text-align:right"><div class="bold" style="${r.me ? 'color:var(--tint)' : ''}">${money(r.nw)}</div><div class="small ${cls(ch)}">${signed(ch)}${!r.me && r.move ? ` ${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}` : ''}</div></div><span class="chev"></span></button>`; }).join('')}</div>
    <div class="footnote">Tap anyone to see their companies and how their money moves. The change under each name is yesterday's.</div>`;
}

// ---------------------------------------------------------------- BILLIONS
function decisionCards() {
  const ds = (S.billion && S.billion.decisions) || [];
  return ds.map(d => `<button class="card mt" style="width:100%;text-align:left;border:1px solid var(--orange);display:flex;gap:12px;align-items:center" data-act="decision" data-id="${d.id}">
    <div style="font-size:30px">${d.icon}</div><div style="flex:1"><div class="bold">Decision: ${esc(d.title)}</div><div class="small muted">Answer within ${plural(Math.max(0, d.deadline - S.day), 'day')} or "${esc(d.options[d.def].label)}" happens</div></div><span class="chev"></span></button>`).join('');
}
function decisionSheet(id) {
  openSheet('Decision', () => {
    const d = S.billion && S.billion.decisions.find(x => x.id === id);
    if (!d) return null;
    return `<div class="biz-head"><div style="font-size:56px">${d.icon}</div><h1>${esc(d.title)}</h1><div class="muted">${esc(d.text)}</div></div>
      <div class="group">${d.options.map((o, i) => `<button class="row" data-act="decide" data-id="${d.id}" data-i="${i}" style="align-items:flex-start;padding-top:14px;padding-bottom:14px">
        <div class="grow"><div class="title" style="white-space:normal">${esc(o.label)}</div>${o.note ? `<div class="sub" style="white-space:normal">${esc(o.note)}</div>` : ''}</div><span class="chev"></span></button>`).join('')}</div>
      <div class="footnote">No answer within ${plural(Math.max(0, d.deadline - S.day), 'day')} and "${esc(d.options[d.def].label)}" happens automatically.</div>`;
  });
}
function billionsView(nw) {
  const B = S.billion;
  const locked = nw < BL.BILLION;
  const hold = B.holdings;
  const holdVal = hold.reduce((a, h) => a + h.value, 0), holdDay = hold.reduce((a, h) => a + (h.last || 0), 0);
  const sectors = [...new Set(hold.map(h => h.sector))];
  const city = ui.emp.megaCity || 'london';
  const ach = BL.ACHIEVEMENTS;
  const got = ach.filter(a => B.achievements[a[0]]).length;
  return `${locked ? `<div class="card empty" style="padding:22px 16px"><img src="${uiImg('crown')}" alt=""><h3>Billionaire tier</h3><p>At ${money(BL.BILLION)} net worth you can take over rich-list companies and build megaprojects. You're at ${money(nw)} (${Math.min(100, nw / BL.BILLION * 100).toFixed(1)}%).</p><div class="bar green" style="max-width:260px;margin:0 auto"><i style="width:${Math.min(100, nw / BL.BILLION * 100)}%"></i></div></div>` : ''}
    ${B.decisions.length ? `<div class="section-h" style="margin-top:4px"><h2>Decisions</h2></div>${decisionCards()}` : ''}

    <div class="section-h"><h2>Your companies</h2><span class="small muted">${hold.length ? `${money(holdDay)}/day` : ''}</span></div>
    ${hold.length ? `<div class="grid2"><div class="metric"><div class="k">Value</div><div class="v">${money(holdVal)}</div></div><div class="metric"><div class="k">Payouts</div><div class="v pos">+${money(holdDay)}</div><div class="s">per day</div></div></div>
      ${hold.map(h => `<div class="card mt"><div style="display:flex;gap:12px;align-items:center"><div class="tile lg" style="display:grid;place-items:center;font-size:30px;background:var(--fill)">${RICHSEC(h.sector).icon}</div>
        <div style="flex:1;min-width:0"><div class="bold">${esc(h.name)}</div><div class="small muted">${esc(h.sector)} · bought from ${esc(h.from)} · day ${h.since}</div><div class="small">${money(h.value)} <span class="${cls(h.value - h.cost)}">(${signed(h.value - h.cost)})</span> · <span class="pos">+${money(h.last || 0)}/day</span></div></div></div>
        <div class="presets mt">${Object.entries(BL.STRATEGIES).map(([k, st]) => `<button class="${h.strategy === k ? 'on' : ''}" data-act="strategy" data-id="${h.id}" data-v="${k}">${st.label}</button>`).join('')}<button data-act="sellHolding" data-id="${h.id}">Sell ${money(h.value * 0.95)}</button></div>
        <div class="small muted" style="margin-top:6px">${esc(BL.STRATEGIES[h.strategy].desc)}</div></div>`).join('')}`
      : `<div class="card small muted">${locked ? 'Unlocks at $1B.' : 'No companies yet.'} Open anyone on the <b>Rich list</b> and buy one of their companies.</div>`}
    ${!locked ? `<button class="btn block gray mt" data-act="empSeg" data-v="rich">Browse the rich list</button>` : ''}
    <div class="section-h"><h2>Industry bonuses</h2><span class="small muted">${sectors.length}/${Object.keys(BL.SYNERGIES).length}</span></div>
    <div class="group">${Object.entries(BL.SYNERGIES).map(([k, v]) => `<div class="row" style="min-height:44px;${sectors.includes(k) ? '' : 'opacity:.45'}"><div style="width:26px">${RICHSEC(k).icon}</div><div class="grow"><div class="title" style="font-size:15px">${esc(k)}</div><div class="sub" style="white-space:normal">${esc(v)}</div></div>${sectors.includes(k) ? '<span class="pill green">Active</span>' : ''}</div>`).join('')}</div>

    <div class="section-h"><h2>Megaprojects</h2></div>
    ${B.projects.map(p => { const Mg = BL.MEGA[p.type]; return `<div class="card mt"><div style="display:flex;gap:12px;align-items:center"><div style="font-size:34px">${Mg.icon}</div><div style="flex:1"><div class="bold">${Mg.name}</div><div class="small muted">${CITIES[p.city].flag} ${CITIES[p.city].name}</div></div>
      ${p.done ? '<span class="pill green">Complete</span>' : p.paused ? '<span class="pill red">Paused</span>' : '<span class="pill orange">Building</span>'}</div>
      ${p.done ? `<div class="kv mt"><span>Income</span><span class="pos">+${money(p.last || Mg.income)}/day</span></div><div class="kv"><span>Bonus</span><span style="text-align:right">${esc(Mg.perk)}</span></div>`
        : `<div class="bar green mt"><i style="width:${Math.round(p.progress / p.days * 100)}%"></i></div><div class="kv"><span>Progress</span><span>${p.progress}/${p.days} days</span></div><div class="kv"><span>Cost</span><span class="neg">−${money(BL.projectDaily(p))}/day</span></div><div class="kv"><span>Paid so far</span><span>${money(p.paid)} of ${money(p.budget)}</span></div>`}</div>`; }).join('')}
    ${locked ? '<div class="card small muted mt">Unlocks at $1B.</div>' : `<div class="mt">${citySeg('megaCity', city)}</div>
    <div class="group mt">${Object.entries(BL.MEGA).filter(([k]) => !B.projects.some(p => p.type === k && !p.done)).map(([k, Mg]) => `<div class="row" style="align-items:flex-start;padding-top:12px;padding-bottom:12px"><div style="font-size:28px;width:36px">${Mg.icon}</div>
      <div class="grow"><div class="title">${Mg.name}</div><div class="sub" style="white-space:normal">${money(Mg.cost * W.diff(S).cost)} over ${Mg.days} days → +${money(Mg.income)}/day, +${Mg.prestige} prestige</div><div class="sub" style="white-space:normal">${esc(Mg.perk)}</div></div>
      <button class="btn sm" data-act="startProject" data-v="${k}" ${S.cash < Mg.cost * 0.1 * W.diff(S).cost ? 'disabled' : ''}>Start</button></div>`).join('')}</div>
    <div class="footnote">10% down payment, then paid daily. Keep enough cash or construction pauses.</div>`}

    <div class="section-h"><h2>Achievements</h2><span class="small muted">${got}/${ach.length} · prestige ${S.prestige || 0}</span></div>
    <div class="group">${ach.map(([id, icon, name, desc, , pts]) => { const d = B.achievements[id]; return `<div class="row" style="min-height:48px;${d ? '' : 'opacity:.5'}"><div style="font-size:24px;width:32px">${d ? icon : '🔒'}</div><div class="grow"><div class="title" style="font-size:15px">${esc(name)}</div><div class="sub">${esc(desc)}${d ? ` · day ${d}` : ''}</div></div><span class="pill ${d ? 'green' : ''}">+${pts}</span></div>`; }).join('')}</div>
    ${B.history && B.history.length ? `<div class="section-h"><h2>Past decisions</h2></div><div class="group">${B.history.slice(0, 8).map(h => `<div class="event"><span class="dot"></span><div><b>${esc(h.title)}</b> — ${esc(h.choice)}<div class="small muted">${esc(h.result)} · day ${h.day}</div></div></div>`).join('')}</div>` : ''}`;
}

// ---------------------------------------------------------------- HIRE
const catBizOptions = (cat, sel, withBench) => (withBench ? `<option value="bench" ${sel === 'bench' ? 'selected' : ''}>👥 Unassigned (place later)</option>` : '') + [S.hq, ...S.businesses].filter(x => E.posForCat(S, x, cat)).map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${E.isHQ(x) ? '🏢 ' : ''}${esc(x.name)}</option>`).join('');
const bizOptions = (sel, withBench) => (withBench ? `<option value="bench" ${sel === 'bench' ? 'selected' : ''}>👥 Unassigned (place later)</option>` : '') + [S.hq, ...S.businesses].map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${E.isHQ(x) ? '🏢 ' : ''}${esc(x.name)}</option>`).join('');
function hireTarget() {
  const H = ui.hire;
  if (!E.bizById(S, H.bizId)) H.bizId = S.businesses[0]?.id || null;
  const b = E.bizById(S, H.bizId);
  if (b) {
    const opts = posOptions(b);
    if (!opts.find(o => o.v === H.pos)) H.pos = opts[0].v;
  }
  return b;
}
function posOptions(b) {
  const out = [];
  const cap = pos => { const c = E.positionCapacity(S, b, pos); return c.parcel ? `${c.used}/${c.cap}` : 'no location'; };
  if (E.isHQ(b)) { for (const r of OFFICE_ROLES) out.push({ v: r, l: `${POSITIONS[r].name} (HQ ${cap(r).replace('no location', 'no office')})` }); return out; }
  const t = BT[b.type];
  out.push({ v: 'floor', l: `${t.role} (${cap('floor')})` });
  if (t.warehouse) out.push({ v: 'warehouse', l: `Warehouse Worker (${cap('warehouse')})` });
  out.push({ v: 'cleaner', l: `Cleaner (${cap('cleaner')})` });
  out.push({ v: 'manager', l: `General Manager (${cap('manager')})` });
  if (E.needsSecurity(b)) out.push({ v: 'security', l: `Security Guard (${cap('security')})` });
  for (const r of OFFICE_ROLES) if (!POSITIONS[r].hqOnly) out.push({ v: r, l: `${POSITIONS[r].name} (office ${cap(r)})` });
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
      <button class="${H.src === 'orders' ? 'on' : ''}" data-act="hireSrc" data-v="orders">Searches${S.orders.length + (S.shortlists || []).length ? ` (${S.orders.length + (S.shortlists || []).length})` : ''}</button>
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
  if (R.maxDays) H.days = Math.min(Math.max(1, H.days || 3), R.maxDays);
  const q0 = E.quoteRecruit(S, { src: H.source, bizId: b.id, pos: H.pos, count: 1, days: H.days });
  const maxC = Math.max(1, q0.maxCount);
  H.count = Math.min(Math.max(1, H.count || 1), maxC);
  return `${starCards()}<div class="card target">
      <div><label>Business</label><select class="field" data-change="hireBiz">${bizOptions(b.id)}</select></div>
      <div><label>Position</label><select class="field" data-change="hirePos">${posOptions(b).map(o => `<option value="${o.v}" ${o.v === H.pos ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>
    </div>
    ${!capInfo.parcel ? (() => { const wh = POSITIONS[H.pos].where === 'support' ? 'main' : POSITIONS[H.pos].where; return `<div class="card mt"><b>${esc(b.name)} needs ${wh === 'main' ? 'a location' : wh === 'office' ? 'an office' : 'a warehouse'} for this position.</b><div class="mt"><button class="btn sm" data-act="pick" data-biz="${b.id}" data-slot="${wh}">Choose ${wh === 'main' ? 'location' : wh}</button></div></div>`; })() : ''}
    ${H.pos !== 'floor' && H.pos !== 'warehouse' ? `<div class="footnote">${POSITIONS[H.pos].desc}</div>` : ''}
    ${capInfo.parcel && capInfo.equip && capInfo.equipCap < capInfo.spaceCap ? `<div class="card mt" style="display:flex;align-items:center;gap:12px"><div class="grow small" style="flex:1">${capInfo.equipCap ? `Equipment fits ${capInfo.equipCap} of ${capInfo.spaceCap} possible staff.` : `<b>No equipment yet.</b> Nobody can work here without it.`} Each ${esc(capInfo.equip.name.toLowerCase())} adds ${capInfo.equip.staff}.</div><button class="btn sm" data-act="buyEq" data-biz="${b.id}" data-g="${capInfo.group}">Buy ${money(capInfo.equip.cost)}</button></div>` : ''}

    <div class="section-h"><h2>Who searches</h2></div>
    <div class="group">
      <button class="row with-icon" data-act="recSource" data-v="jobCenter"><img class="tile lg" src="${uiImg('jobcenter')}" alt="">
        <div class="grow"><div class="title">Public Job Center</div><div class="sub">Low-skilled · you pick size & wait · fee per candidate</div></div><span class="check ${H.source === 'jobCenter' ? 'on' : ''}"></span></button>
      <button class="row with-icon" data-act="recSource" data-v="recruiter"><img class="tile lg" src="${uiImg('recruiter')}" alt="" style="${hasRec ? '' : 'opacity:.45'}">
        <div class="grow"><div class="title">Your Recruiters${hasRec ? ` (${E.recruiters(S).length})` : ''}</div><div class="sub">${hasRec ? `Skilled · free · always 3 days · up to ${100 * Math.min(3, E.recruiters(S).length)} per search` : 'Locked — hire a Recruiter into an office'}</div></div>${hasRec ? `<span class="check ${H.source === 'recruiter' ? 'on' : ''}"></span>` : '<span class="chev"></span>'}</button>
    </div>

    <div class="section-h"><h2>Search</h2></div>
    <div class="card">
      <div class="kv" style="padding-top:0"><span>Candidates to find</span><b id="recCountLbl">${H.count}</b></div>
      <input type="range" class="slider" id="recCount" min="1" max="${maxC}" value="${H.count}" ${q0.maxCount ? '' : 'disabled'}>
      ${H.source === 'jobCenter' ? `<div class="kv" style="margin-top:10px"><span>Wait</span><b id="recDaysLbl">${plural(H.days, 'day')}</b></div>
      <input type="range" class="slider" id="recDays" min="1" max="${R.maxDays}" value="${H.days}">
      <div class="small muted" style="display:flex;justify-content:space-between;margin-top:4px"><span>Rush · pricier</span><span>Patient · cheaper, better people</span></div>`
      : `<div class="kv" style="margin-top:10px"><span>Wait</span><b>3 days · free</b></div><div class="small muted">Your recruiters always take 3 days and charge nothing extra — you already pay their wages.</div>`}
      <div class="small muted" style="margin-top:8px">When the search finishes, you choose who to hire from the shortlist. Unpicked candidates leave after ${E.SHORTLIST_DAYS} days.</div>
    </div>
    <div id="recDyn">${recruitQuote()}</div>
    ${(S.shortlists || []).length ? `<div class="footnote center"><button class="link" style="color:var(--tint);font-weight:600" data-act="hireSrc" data-v="orders">${plural(S.shortlists.length, 'shortlist')} ready to pick ›</button></div>` : S.orders.length ? `<div class="footnote center"><button class="link" style="color:var(--tint);font-weight:600" data-act="hireSrc" data-v="orders">${plural(S.orders.length, 'search')} in progress ›</button></div>` : ''}`;
}
function recruitQuote() {
  const H = ui.hire;
  const b = hireTarget();
  if (!b) return '';
  const q = E.quoteRecruit(S, { src: H.source, bizId: b.id, pos: H.pos, count: H.count, days: H.days });
  const speed = q.mult >= 1.6 ? 'Rush fee' : q.mult > 1.05 ? 'Fast' : q.mult > 0.9 ? 'Standard' : 'Patience discount';
  return `<div class="card mt">
      <div class="kv" style="padding-top:0"><span>Shortlist ready</span><span>Day ${q.arrive} (${DOW[q.arrive % 7]})</span></div>
      <div class="kv"><span>Expected skill</span><span>${q.skillLo}–${q.skillHi}</span></div>
      <div class="kv"><span>Their wages</span><span>~${money(q.wageLo || 0)}–${money(q.wageHi || 0)}/day each</span></div>
      ${H.source === 'jobCenter' ? `<div class="kv"><span>Fee per candidate</span><span>${money(q.perHire)} <span class="pill ${q.mult > 1.05 ? 'orange' : 'green'}">${speed} ×${q.mult.toFixed(2)}</span></span></div>` : `<div class="kv"><span>Fee</span><span class="pos">Free</span></div>`}
      <div class="kv"><span>Free spots now</span><span>${q.free}</span></div>
    </div>
    ${q.warn ? `<div class="footnote" style="color:var(--orange)">⚠️ ${esc(q.warn)}</div>` : ''}
    <div class="sticky-action"><div class="hire-bar glass">
      <div class="grow"><b>${!q.ok && !q.total ? 'Can’t search' : q.total ? `${money(q.total)} total` : 'Free'}</b><span class="${q.ok ? 'muted' : 'neg'}">${q.ok ? `${plural(H.count, 'candidate')} · ready in ${plural(q.days, 'day')}` : esc(q.error || '')}</span></div>
      <button class="btn" data-act="doRecruit" ${q.ok ? '' : 'disabled'}>Search</button></div></div>`;
}
function roleName(bizId, pos) {
  const b = E.bizById(S, bizId);
  return pos === 'floor' ? (b ? BT[b.type].role : 'Floor staff') : POSITIONS[pos].name;
}
function ordersView() {
  const lists = S.shortlists || [];
  if (!S.orders.length && !lists.length) return `<div class="card empty"><img src="${uiImg('recruiter')}" alt=""><h3>No searches running</h3><p>Start a search. When it finishes you get a shortlist and choose who to hire.</p><button class="btn" data-act="hireSrc" data-v="recruit">New search</button></div>`;
  const ready = lists.length ? `<div class="section-h" style="margin-top:4px"><h2>Ready to pick</h2></div><div class="group">${lists.slice().sort((a, c) => a.expires - c.expires).map(sl => {
    const b = E.bizById(S, sl.bizId);
    const left = sl.expires - S.day;
    return `<button class="row with-icon" data-act="shortlist" data-id="${sl.id}"><img class="tile" src="${uiImg(sl.src === 'jobCenter' ? 'jobcenter' : 'recruiter')}" alt="">
      <div class="grow"><div class="title">${plural(sl.candidates.length, 'candidate')} · ${esc(roleName(sl.bizId, sl.pos))}</div>
      <div class="sub">${b ? esc(b.name) + ' · ' : ''}best skill ${sl.candidates[0].skill} · <span class="${left <= 1 ? 'neg' : ''}">leave in ${plural(left, 'day')}</span></div></div>
      <span class="pill blue">Pick</span><span class="chev"></span></button>`;
  }).join('')}</div>` : '';
  const running = S.orders.length ? `<div class="section-h"><h2>Searching</h2></div><div class="group">${S.orders.slice().sort((a, c) => a.arrive - c.arrive).map(o => {
    const b = E.bizById(S, o.bizId);
    const done = Math.min(1, (S.day - o.started) / o.days);
    const left = o.arrive - S.day;
    return `<div class="row with-icon"><img class="tile" src="${uiImg(o.src === 'jobCenter' ? 'jobcenter' : 'recruiter')}" alt="">
      <div class="grow"><div class="title">${o.count} × ${esc(roleName(o.bizId, o.pos))}</div><div class="sub">${b ? esc(b.name) + ' · ' : ''}shortlist ${left <= 0 ? 'ready now' : `day ${o.arrive} (in ${plural(left, 'day')})`}${o.paid ? '' : ' · free'}</div>
      <div class="bar" style="margin-top:6px"><i style="width:${Math.round(done * 100)}%"></i></div></div>
      <button class="btn sm red" data-act="cancelOrder" data-id="${o.id}">Cancel</button></div>`;
  }).join('')}</div><div class="footnote">Cancelling a Job Center search refunds 50% of the fee.</div>` : '';
  return ready + running;
}
function shortlistSheet(id) {
  const sl0 = E.shortlistById(S, id);
  if (!sl0) return;
  const st = { sel: new Set(), bizId: E.bizById(S, sl0.bizId) ? sl0.bizId : (S.businesses[0]?.id || 'bench'), pos: sl0.pos };
  openSheet('Pick who to hire', () => {
    const sl = E.shortlistById(S, id);
    if (!sl) return null;
    const cat = sl.cat || E.catFor(S, sl.bizId, sl.pos);
    if (st.bizId !== 'bench' && !E.posForCat(S, E.bizById(S, st.bizId), cat)) st.bizId = [S.hq, ...S.businesses].find(x => E.posForCat(S, x, cat))?.id || 'bench';
    const bench = st.bizId === 'bench';
    const b = bench ? null : E.bizById(S, st.bizId);
    if (b) st.pos = E.posForCat(S, b, cat);
    const c = b ? E.positionCapacity(S, b, st.pos) : { parcel: true, cap: Infinity, used: 0 };
    const free = bench ? Infinity : c.parcel ? c.cap - c.used : 0;
    const ref = b || E.bizById(S, sl.bizId) || S.businesses[0];
    const wageOf = x => ref ? E.wageFor(S, { skill: x.skill, pos: b ? st.pos : sl.pos }, ref) : 0;
    const sel = sl.candidates.filter(x => st.sel.has(x.id));
    const wages = sel.reduce((a, x) => a + wageOf(x) * (bench ? E.BENCH_PAY : 1), 0);
    const left = sl.expires - S.day;
    return `<div class="footnote" style="margin:0 4px 12px">${plural(sl.candidates.length, 'candidate')} from ${sl.src === 'jobCenter' ? 'the Job Center' : 'your recruiters'}. Anyone you don't pick leaves in ${plural(left, 'day')}.</div>
      <div class="card target">
        <div><label>Business</label><select class="field" data-change="slBiz">${catBizOptions(cat, bench ? 'bench' : b.id, true)}</select></div>
        <div><label>Job</label><div class="field" style="display:flex;align-items:center;color:var(--label2);overflow:hidden;white-space:nowrap">${esc(E.catLabel(cat))}</div></div>
      </div>
      ${bench ? `<div class="footnote">They join your company without a workplace and get ${Math.round(E.BENCH_PAY * 100)}% standby pay until you place them (My Staff → tap someone → Place in).</div>` : !c.parcel ? `<div class="footnote neg">No ${POSITIONS[st.pos].where === 'office' ? 'office' : POSITIONS[st.pos].where === 'warehouse' ? 'warehouse' : 'location'} for this position yet.</div>`
        : free <= 0 ? `<div class="card mt" style="display:flex;align-items:center;gap:12px"><div class="small" style="flex:1">No free spots.${c.equip && c.equipCap < c.spaceCap ? ` Each ${esc(c.equip.name.toLowerCase())} adds ${c.equip.staff}.` : ''}</div>${c.equip && c.equipCap < c.spaceCap ? `<button class="btn sm" data-act="buyEq" data-biz="${b.id}" data-g="${c.group}">Buy ${money(c.equip.cost)}</button>` : ''}</div>`
        : `<div class="footnote">${plural(free, 'free spot')} at ${esc(b.name)}.</div>`}
      ${!bench && free <= 0 ? `<div class="footnote"><button class="link" style="color:var(--tint);font-weight:600" data-act="slBench">No room? Hire them as unassigned staff instead ›</button></div>` : ''}
      <div class="presets mt" style="margin-bottom:10px">
        ${[3, 5, 10].filter(n => n < sl.candidates.length).map(n => `<button data-act="slTop" data-n="${n}">Best ${n}</button>`).join('')}
        <button data-act="slTop" data-n="fill">Fill free spots</button>
        ${sel.length ? `<button data-act="slNone">Clear</button>` : ''}
      </div>
      <div class="group">${sl.candidates.map(x => `<button class="row" data-act="slToggle" data-id="${x.id}"><span class="check ${st.sel.has(x.id) ? 'on' : ''}"></span>
        <div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">wants ${money(wageOf(x))}/day${bench ? ` · ${money(wageOf(x) * E.BENCH_PAY)} on standby` : ''}</div></div>${skillBar(x.skill)}</button>`).join('')}</div>
      <div class="btn-row mt2">
        <button class="btn red" data-act="slDismiss">Dismiss all</button>
        <button class="btn" data-act="slHire" ${sel.length && free >= sel.length ? '' : 'disabled'}>${sel.length ? `Hire ${sel.length} · ${money(wages)}/day` : 'Select people'}</button>
      </div>
      ${!bench && sel.length > free && c.parcel ? `<div class="footnote neg center">Only ${plural(Math.max(0, free), 'free spot')} — select fewer or make room.</div>` : ''}`;
  });
  sheet.state = st;
  sheet.slId = id;
}
function staffView() {
  const H = ui.hire;
  if (!S.workers.length) return `<div class="card empty"><img src="${uiImg('jobcenter')}" alt=""><h3>No employees</h3><p>Your future employees are waiting at the Job Center.</p><button class="btn" data-act="hireSrc" data-v="jobCenter">Go to Job Center</button></div>`;
  const list = [S.hq, ...S.businesses].filter(b => H.staffBiz === 'all' || b.id === H.staffBiz);
  const bench = E.benchWorkers(S).sort((a, c) => c.skill - a.skill);
  const benchHtml = bench.length && (H.staffBiz === 'all' || H.staffBiz === 'bench') ? `<div class="dist-h"><b>👥 Unassigned</b><span class="small muted">${bench.length} · standby ${money(bench.reduce((a, w) => a + (w.benchWage || 0), 0))}/day</span></div>
      <div class="group">${(ui.expand.has('staff:bench') ? bench : bench.slice(0, 12)).map(w => `<button class="row" data-act="worker" data-id="${w.id}"><div class="grow"><div class="title">${esc(w.name)}</div><div class="sub">${esc(E.catLabel(E.catOf(S, w)))} · ${money(w.benchWage || 0)}/day standby</div></div>${skillBar(w.skill)}</button>`).join('')}
      ${bench.length > 12 ? `<button class="list-more" data-act="expand" data-key="staff:bench">${ui.expand.has('staff:bench') ? 'Show less' : `Show all ${bench.length}`}</button>` : ''}</div>
      <div class="footnote">Tap someone to place them in a business.</div>` : '';
  return `<div class="chips"><button class="chip ${H.staffBiz === 'all' ? 'on' : ''}" data-act="staffBiz" data-v="all">All</button>${bench.length ? `<button class="chip ${H.staffBiz === 'bench' ? 'on' : ''}" data-act="staffBiz" data-v="bench">Unassigned (${bench.length})</button>` : ''}${[S.hq, ...S.businesses].map(b => `<button class="chip ${H.staffBiz === b.id ? 'on' : ''}" data-act="staffBiz" data-v="${b.id}">${esc(b.name)}</button>`).join('')}</div>
    ${benchHtml}
    ${list.map(b => {
      const ws = S.workers.filter(w => w.bizId === b.id).sort((a, c) => c.skill - a.skill);
      if (!ws.length) return '';
      const key = 'staff:' + b.id;
      const shown = ui.expand.has(key) ? ws : ws.slice(0, 12);
      return `<div class="dist-h"><b>${esc(b.name)}</b><span class="small muted">${ws.length} · avg skill ${Math.round(ws.reduce((a, w) => a + w.skill, 0) / ws.length)}</span></div>
      <div class="group">${shown.map(w => `<button class="row" data-act="worker" data-id="${w.id}"><div class="grow"><div class="title">${esc(w.name)}${starTag(w)}</div><div class="sub">${w.pos === 'floor' ? BT[b.type].role : POSITIONS[w.pos].name}${E.isHQ(b) ? ' · ' + servesLabel(w) : ''} · ${money(E.wageFor(S, w, b))}/day</div></div>${skillBar(w.skill)}</button>`).join('')}
      ${ws.length > 12 ? `<button class="list-more" data-act="expand" data-key="${key}">${ui.expand.has(key) ? 'Show less' : `Show all ${ws.length}`}</button>` : ''}</div>`;
    }).join('')}`;
}
function workerSheet(id) {
  openSheet('Employee', () => {
    const w = S.workers.find(x => x.id === id);
    if (!w) return null;
    const b = E.bizById(S, w.bizId);
    if (!b) return benchWorkerView(w);
    const t = BT[b.type];
    const isOffice = OFFICE_ROLES.includes(w.pos);
    const moves = isOffice ? OFFICE_ROLES.filter(r => r !== w.pos && (E.isHQ(b) || !POSITIONS[r].hqOnly)) : SUPPORT_ROLES.includes(w.pos) ? SUPPORT_ROLES.filter(r => r !== w.pos && (r !== 'security' || E.needsSecurity(b))) : [];
    return `<div class="biz-head"><img class="tile xl" src="${isOffice ? uiImg('office') : w.pos === 'warehouse' ? uiImg('warehouse') : bizImg(b.type)}" alt=""><h1>${esc(w.name)}</h1><div class="muted">${w.pos === 'floor' ? t.role : POSITIONS[w.pos].name} at ${esc(b.name)}</div>${w.star ? `<div class="pill orange">${MR.TRAITS[w.star].icon} ${MR.TRAITS[w.star].label}: ${esc(MR.TRAITS[w.star].desc)}</div>` : ''}</div>
      <div class="card"><div class="kv"><span>Job</span><span>${esc(E.catLabel(E.catOf(S, w)))}</span></div>
      <div class="kv"><span>Skill</span><span>${skillBar(w.skill)}</span></div>
      <div class="kv"><span>Wage</span><span>${money(E.wageFor(S, w, b))}/day</span></div>
      <div class="kv"><span>Productivity</span><span>×${E.productivity(w.skill, w.pos === 'floor' ? t.skillImpact : 1).toFixed(2)}</span></div>
      <div class="kv"><span>Hired</span><span>Day ${w.hired}</span></div></div>
      <div class="footnote">Skill grows a little every day, faster with an HR Manager. Wages follow skill.</div>
      ${E.isHQ(b) ? servesPicker(w) : ''}
      ${moveSection(w)}
      ${w.pos === 'floor' && !E.isHQ(b) ? (MR.canPromote(S, w) ? `<button class="btn block mt" data-act="promote" data-id="${w.id}">Promote to General Manager</button>` : `<div class="footnote">${w.skill >= 70 ? (E.workersOf(S, b.id, 'manager').length ? `${esc(b.name)} already has a General Manager.` : 'Promotion needs a free spot for a manager.') : 'Reach skill 70 to be promoted to General Manager.'}</div>`) : ''}
      <button class="btn block gray mt" data-act="benchW" data-id="${w.id}">Move to Unassigned (${Math.round(E.BENCH_PAY * 100)}% standby pay)</button>
      ${false && moves.length ? `<div class="section-h"><h2>Change role</h2></div><div class="group">${moves.map(r => `<button class="row" data-act="moveWorker" data-id="${w.id}" data-pos="${r}"><div class="grow"><div class="title">${POSITIONS[r].name}</div><div class="sub">${POSITIONS[r].desc}</div></div><span class="chev"></span></button>`).join('')}</div>` : ''}
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
    <div class="subtitle">Net worth ${money(E.netWorth(S))}${S.ipo ? ` · you own ${Math.round((1 - S.ipo.pct) * 100)}%` : ''}</div>
    ${economyCard()}<div class="mt"></div>
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
    ${breakdownSection()}

    <div class="section-h"><h2>Income tax</h2></div>
    <div class="tax-card"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="small" style="opacity:.85">DUE IN ${plural(est.daysLeft, 'DAY').toUpperCase()} (DAY ${S.day + est.daysLeft - 1})</div><div class="big">${money(est.due)}</div><div class="small" style="opacity:.9">on ${money(income)} income this period · effective ${pct(est.effective * (1 - est.relief))}</div></div>
      <img class="tile lg" src="${uiImg('tax')}" alt="" style="box-shadow:0 6px 20px rgba(0,0,0,.2)"></div></div>
    <div class="card mt"><div class="small muted" style="margin-bottom:6px">Paid every ${TAX_PERIOD} days on your total income for the period (salary + business profit). The more you make, the higher the rate.</div>
      <table class="br">${TAX_BRACKETS.map(br => { const row = `<tr class="${income > prev && (income <= br.upTo || br.upTo === Infinity) ? 'cur' : ''}"><td>${money(prev)} – ${br.upTo === Infinity ? '∞' : money(br.upTo)}</td><td style="text-align:right">${pct(br.rate)}</td></tr>`; prev = br.upTo; return row; }).join('')}</table>
      ${est.relief ? `<div class="kv mt"><span>Accountant relief</span><span class="pos">−${pct(est.relief)}</span></div>` : `<div class="small muted mt">Tip: Accountants in an office cut your tax bill by up to 30%.</div>`}</div>
    ${S.tax.history.length ? `<div class="group mt">${S.tax.history.slice(0, 10).map(h => `<div class="row"><div class="grow"><div class="title">Day ${h.day}</div><div class="sub">income ${money(h.income)} · effective ${pct(h.income ? h.due / h.income : 0)}</div></div><div class="value neg">−${money(h.due)}</div></div>`).join('')}</div>` : ''}

    ${MR.taxRelief(S) ? `<div class="footnote">Lobbying cuts your tax bill by a further ${pct(MR.taxRelief(S))}.</div>` : ''}
    ${loansSection()}
    ${politicsSection()}
    ${L ? `<div class="section-h"><h2>Yesterday (day ${L.day})</h2></div>${reportRows(L)}` : ''}
  </div>`;
}
function reportRows(r) {
  return `<div class="group">
    ${r.salary ? `<div class="row with-icon"><img class="tile" src="${uiImg('job')}" alt=""><div class="grow"><div class="title">Day job salary</div></div><div class="value pos">+${money(r.salary)}</div></div>` : ''}
    ${r.businesses.map(x => `<button class="row with-icon" data-act="openBiz" data-id="${x.id}"><img class="tile" src="${bizImg(x.type)}" alt=""><div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">${x.revenue ? `${money(x.revenue)} revenue · ${fmtNum(x.customers)} customers` : esc(x.notes[0] || 'No sales')}</div></div><div class="value ${cls(x.profit)}">${signed(x.profit)}</div></button>`).join('')}
    ${r.hq && r.hq.total ? `<button class="row with-icon" data-act="openHQ"><img class="tile" src="${uiImg('office')}" alt=""><div class="grow"><div class="title">Headquarters</div><div class="sub">shared staff ${money(r.hq.wages)} · office ${money(r.hq.property)}</div></div><div class="value neg">−${money(r.hq.total)}</div></button>` : ''}
    ${r.factories && r.factories.list && r.factories.list.length ? `<button class="row with-icon" data-act="goEmpire" data-v="factories"><img class="tile" src="${uiImg('factory')}" alt=""><div class="grow"><div class="title">Factories</div><div class="sub">${plural(r.factories.list.length, 'factory').replace('factorys', 'factories')}</div></div><div class="value ${cls(r.factories.net)}">${signed(r.factories.net)}</div></button>` : ''}
    ${r.sports ? `<button class="row with-icon" data-act="goEmpire" data-v="sports"><img class="tile" src="${uiImg('sports')}" alt=""><div class="grow"><div class="title">Sports club</div><div class="sub">wages, sponsors, tickets, prizes</div></div><div class="value ${cls(r.sports)}">${signed(r.sports)}</div></button>` : ''}
    ${r.holdings ? `<button class="row with-icon" data-act="goEmpire" data-v="billions"><img class="tile" src="${uiImg('empire')}" alt=""><div class="grow"><div class="title">Your companies</div><div class="sub">profit payouts</div></div><div class="value pos">+${money(r.holdings)}</div></button>` : ''}
    ${r.projects ? `<button class="row with-icon" data-act="goEmpire" data-v="billions"><img class="tile" src="${uiImg('crown')}" alt=""><div class="grow"><div class="title">Megaprojects</div><div class="sub">${r.projects < 0 ? 'construction' : 'income'}</div></div><div class="value ${cls(r.projects)}">${signed(r.projects)}</div></button>` : ''}
    ${r.dividends ? `<div class="row with-icon"><img class="tile" src="${uiImg('stocks')}" alt=""><div class="grow"><div class="title">Dividends received</div></div><div class="value pos">+${money(r.dividends)}</div></div>` : ''}
    ${r.publicDividends ? `<div class="row with-icon"><img class="tile" src="${uiImg('stocks')}" alt=""><div class="grow"><div class="title">Paid to shareholders</div><div class="sub">${S.ipo ? Math.round(S.ipo.pct * 100) + '% of profit' : ''}</div></div><div class="value neg">−${money(r.publicDividends)}</div></div>` : ''}
    ${extraReportRows(r)}
    ${r.bench ? `<div class="row with-icon"><img class="tile" src="${uiImg('jobcenter')}" alt=""><div class="grow"><div class="title">Unassigned staff</div><div class="sub">standby pay</div></div><div class="value neg">−${money(r.bench)}</div></div>` : ''}
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
    out.bench = (out.bench || 0) + (r.bench || 0);
    for (const k of ['hustle', 'franchise', 'leaseIncome', 'loanInterest', 'loanPaid', 'bball', 'racing']) out[k] = (out[k] || 0) + (r[k] || 0);
    if (r.recap) out.recap = r.recap;
    out.sports = (out.sports || 0) + (r.sports || 0);
    out.holdings = (out.holdings || 0) + (r.holdings || 0);
    out.projects = (out.projects || 0) + (r.projects || 0);
    out.dividends = (out.dividends || 0) + (r.dividends || 0);
    out.publicDividends = (out.publicDividends || 0) + (r.publicDividends || 0);
    if (r.factories) { out.factories ||= { net: 0, list: r.factories.list }; out.factories.net += r.factories.net; out.factories.list = r.factories.list; }
    if (r.hq) { out.hq ||= { wages: 0, property: 0, total: 0 }; out.hq.wages += r.hq.wages; out.hq.property += r.hq.property; out.hq.total += r.hq.total; }
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
function showLastChance() {
  openSheet('Last chance', () => {
    if (!S.bankruptcyPending) return null;
    const opts = E.liquidationOptions(S);
    const owed = -S.cash;
    const total = opts.reduce((a, x) => a + x.value, 0);
    return `<div class="empty" style="padding:10px 10px 16px"><img src="${uiImg('bank')}" alt=""><h3>Repay ${money(owed)} to survive</h3>
      <p>You've been in overdraft for 14 days. Sell enough to get your cash back to $0 and you're back in business. Time is frozen until then.</p></div>
      <div class="card"><div class="kv" style="padding-top:0"><span>Overdraft</span><b class="neg">${money(owed)}</b></div><div class="kv"><span>Everything below is worth</span><b class="${total >= owed ? 'pos' : 'neg'}">${money(total)}</b></div></div>
      <div class="group mt">${opts.map(o => `<div class="row"><div class="grow"><div class="title">${esc(o.label)}</div><div class="sub">${esc(o.sub)}</div></div><button class="btn sm ${o.value >= owed ? 'green' : ''}" data-act="lcSell" data-kind="${o.kind}" data-id="${o.id}">Sell ${money(o.value)}</button></div>`).join('')}</div>
      <div class="footnote">Selling property a business uses moves its staff to Unassigned. You can close this and look around (for example to close loss-making businesses), but days won't pass until the debt is repaid.</div>
      <button class="btn block red mt2" data-act="declareBankrupt">Declare bankruptcy</button>`;
  });
}
function showGameOver() {
  const ousted = S.gameOverReason === 'ousted';
  if (S.gameOverReason === 'retired') return openSheet('Retired', () => `<div class="empty"><img src="${uiImg('crown')}" alt=""><h3>${esc(S.ceo)} has retired</h3>
    <p>After ${S.retiredDay || S.day} days and a net worth of ${money(E.netWorth(S))}, ${esc(S.ceo)} hands over the keys. ${S.retiredPoints ? `They earned <b>${S.retiredPoints} legacy points</b> and joined the Hall of Fame.` : 'Your legacy points are waiting in Settings.'} Their heir can carry on the family name.</p>
    <button class="btn block" data-act="restart">Start a new game</button><button class="btn block gray mt" data-act="settings">Settings & saves</button></div>`);
  openSheet(ousted ? 'Voted out' : 'Bankrupt', () => `<div class="empty"><img src="${uiImg(ousted ? 'stocks' : 'tax')}" alt=""><h3>Delusion over (for now)</h3>
    <p>${ousted ? `Shareholders lost all confidence and the board voted ${esc(S.ceo)} out as CEO on day ${S.day - 1}.` : `${esc(S.ceo)} stayed in overdraft for 14 days and the bank pulled the plug on day ${S.day - 1}.`} Peak delusion reached: ${E.rankFor(Math.max(...S.ledger.map(l => l.cash)))}.</p>
    <button class="btn block" data-act="restart">Start over</button></div>`);
}

// ---------------------------------------------------------------- business creation
function newBizSheet() {
  const st = { type: null, name: '' };
  openSheet('New Business', () => {
    if (!st.type) {
      return `<div class="footnote" style="margin:0 4px 14px">You have ${money(S.cash)}. Prices shown are the registration fee — you'll also need to rent a location and hire staff.</div>
      <div class="biz-grid">${BUSINESS_TYPES.filter(t => !t.hidden).map(t => t.group === 'cars'
        ? `<button data-act="pickType" data-v="carTiers" class="${S.cash < BT.usedcars.license ? 'lock' : ''}"><img src="${bizImg('cars')}" alt="">Car Dealership<span class="muted" style="font-weight:500">3 tiers · from ${money(BT.usedcars.license)}</span></button>`
        : `<button data-act="pickType" data-v="${t.id}" class="${S.cash < t.license || E.tierLock(S, t.id) ? 'lock' : ''}"><img src="${bizImg(t.id)}" alt="">${t.unlockNW && E.tierLock(S, t.id) ? '🔒 ' : ''}${t.name}<span class="muted" style="font-weight:500">${t.unlockNW && E.tierLock(S, t.id) ? `${money(t.unlockNW)}+ net worth` : money(t.license)}</span></button>`).join('')}</div>`;
    }
    if (st.type === 'carTiers') {
      return `<button class="nav-btn tint" data-act="pickType" data-v="">‹ All types</button>
        <div class="biz-head"><img class="tile xl" src="${bizImg('cars')}" alt=""><h1>Car Dealership</h1><div class="muted">Start with cheap used cars from the auction. Sell enough to unlock the next tier.</div></div>
        <div class="group">${CAR_TIERS.map(x => carTierRow(x)).join('')}</div>`;
    }
    const t = BT[st.type];
    const short = t.license - S.cash;
    const margin = 1 - t.cogs;
    const lock = E.tierLock(S, t.id);
    return `<button class="nav-btn tint" data-act="pickType" data-v="${t.group === 'cars' ? 'carTiers' : ''}">‹ ${t.group === 'cars' ? 'Car tiers' : 'All types'}</button>
      <div class="biz-head"><img class="tile xl" src="${bizImg(t.id)}" alt=""><h1>${t.name}</h1><div class="muted">${esc(t.blurb)}</div></div>
      <div class="card">
        <div class="kv"><span>Registration fee</span><b>${money(t.license)}</b></div>
        <div class="kv"><span>Location</span><span>${SIZES[t.minSize].label}+ ${t.premises.join(' / ')}${t.airport ? ' (airport)' : ''}</span></div>
        <div class="kv"><span>Warehouse</span><span>${t.warehouse ? 'Required' : 'Not needed'}</span></div>
        <div class="kv"><span>Equipment</span><span style="text-align:right">${esc(EQUIPMENT[t.id].name)}<br><span class="small muted">${money(EQUIPMENT[t.id].cost)} per ${EQUIPMENT[t.id].staff} staff</span></span></div>
        <div class="kv"><span>Stock</span><span style="text-align:right">${STOCK[t.id] ? `${esc(STOCK[t.id].goods)} · arrives in ${STOCK_DELIVERY_DAYS} days${STOCK[t.id].auctionOnly ? '<br><span class="small muted">bought by hand at the daily auction</span>' : '<br><span class="small muted">can be automated</span>'}` : 'Not needed (service)'}</span></div>
        <div class="kv"><span>Support staff</span><span>Cleaner${SECURITY_REQUIRED.includes(t.id) ? ' + security' : ''}</span></div>
        <div class="kv"><span>Staff</span><span>${t.role}s (~${money(t.wage)}/day in London)</span></div>
        <div class="kv"><span>Avg sale</span><span>${money(t.ticket)} · ${pct(margin)} margin</span></div>
        <div class="kv"><span>Customer flow matters</span><span>${t.traffic > 0.7 ? 'A lot' : t.traffic > 0.4 ? 'Somewhat' : 'Barely'}</span></div>
        <div class="kv"><span>Skill matters</span><span>${t.skillImpact >= 1.5 ? 'Enormously' : t.skillImpact > 1.05 ? 'A lot' : 'Normal'}</span></div>
      </div>
      <div class="mt"><input class="field" id="bizName" placeholder="${esc(`${S.ceo}'s ${t.name}`)}" maxlength="30" value="${esc(st.name)}" autocomplete="off"></div>
      <button class="btn block mt" data-act="found" data-v="${t.id}" ${short > 0 || lock ? 'disabled' : ''}>${lock ? '🔒 Locked' : short > 0 ? `Need ${money(short)} more` : `Register for ${money(t.license)}`}</button>
      ${lock ? `<div class="footnote center">${esc(lock)}</div>` : ''}`;
  });
  sheet.state = st;
}

// ---------------------------------------------------------------- settings / help
function settingsSheet() {
  openSheet('Settings', () => `
    <div class="section-h" style="margin-top:6px"><h2>CEO</h2></div>
    <div class="btn-row"><input class="field" id="ceoName" value="${esc(S.ceo)}" maxlength="24"><button class="btn" style="flex:none" data-act="saveName">Save</button></div>
    <div class="section-h"><h2>Difficulty</h2></div>
    <div class="seg">${Object.entries(W.DIFFICULTIES).map(([k, d]) => `<button class="${S.difficulty === k ? 'on' : ''}" data-act="setDiff" data-v="${k}">${d.label}</button>`).join('')}</div>
    <div class="footnote" style="margin:8px 4px 0">${W.diff(S).desc} Changes apply from the next day.</div>
    <div class="section-h"><h2>Saves</h2><button class="link" data-act="newSave">New game</button></div>
    <div class="group">${IDX.slots.slice().sort((a, c) => (c.id === IDX.current) - (a.id === IDX.current) || c.updated - a.updated).map(sl => `<div class="row with-icon">
      <img class="tile" src="assets/icon.svg" alt="" style="${sl.id === IDX.current ? '' : 'filter:grayscale(.6);opacity:.75'}">
      <div class="grow"><div class="title">${esc(sl.ceo)}${sl.id === IDX.current ? ' <span class="pill blue">Playing</span>' : ''}${sl.retired ? ' <span class="pill orange">Retired</span>' : sl.gameOver ? ' <span class="pill red">Bankrupt</span>' : ''}</div>
      <div class="sub">Day ${sl.day} · ${money(sl.netWorth ?? sl.cash)} net worth · ${plural(sl.businesses || 0, 'business').replace('businesss', 'businesses')}</div>
      <div class="sub">${new Date(sl.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div></div>
      ${sl.id === IDX.current ? '' : `<div style="display:flex;gap:6px"><button class="btn sm gray" data-act="deleteSlot" data-id="${sl.id}" aria-label="Delete">🗑</button><button class="btn sm" data-act="loadSlot" data-id="${sl.id}">Play</button></div>`}</div>`).join('')}</div>
    <div class="footnote" style="margin:8px 4px 0">Starting a new game keeps your other saves — switch between them here any time.</div>
    ${legacySection()}
    <div class="section-h"><h2>Backup</h2></div>
    <div class="footnote" style="margin:0 4px 10px">Saves live on this device only. Export a backup to move a game to another device; imported games are added as a new save.</div>
    <div class="group">
      <button class="row" data-act="export"><div class="grow"><div class="title" style="color:var(--tint)">Export save file</div></div></button>
      <button class="row" data-act="import"><div class="grow"><div class="title" style="color:var(--tint)">Import save file</div></div></button>
      <button class="row" data-act="copySave"><div class="grow"><div class="title" style="color:var(--tint)">Copy save to clipboard</div></div></button>
    </div>
    <div class="group mt"><button class="row" data-act="reset"><div class="grow"><div class="title neg">Delete this save</div><div class="sub">Other saves are kept</div></div></button></div>
    <div class="section-h"><h2>Install</h2></div>
    <div class="card small" style="line-height:1.5">On iPhone: open this page in Safari, tap <b>Share</b> → <b>Add to Home Screen</b>. It runs full-screen and works offline.</div>
    <div class="footnote center mt2">Delusional Business Inc. · v${self.APP_VERSION || '?'}<br>updated ${self.APP_BUILD || ''}<br><span style="opacity:.6">${displayInfo()}</span></div>`);
}
function helpSheet() {
  openSheet('How to play', () => `<div class="help">
    <p>Start with a day job and ${money(4000)}. Each tap of <b>Next Day</b> simulates one day: you get paid, your businesses serve customers, and costs are deducted.</p>
    <h4>1. Start a business</h4><p>Pick from 20 types. Each needs a registration fee and a location of a minimum size. Clothing, Supermarket, Furniture, Cosmetics, Construction and Delivery also need a <b>warehouse</b> with warehouse workers.</p>
    <h4>Equipment & support staff</h4><ul><li>Staff need equipment to work: registers, espresso machines, workstations, vans… Each piece fits a set number of people.</li><li>Every business needs a <b>cleaner</b> (1 per ~10 staff), or customers get unhappy.</li><li>Jewelry, car dealerships, hotels, supermarkets, airlines, clothing and cosmetics need <b>security</b> (1 per ~15 staff), or you lose stock to theft.</li></ul>
    <h4>Week & opening hours</h4><p>Day 1 is a Monday. Every business type has busy and quiet days — restaurants peak Friday and Saturday, offices are dead at weekends. Choose which days each business opens and for how many hours. Staff aren't paid on closed days, Sundays cost ${SUNDAY_PAY}× in wages, and hours past ${BASE_HOURS} are overtime.</p>
    <h4>Prices & competition</h4><p>Set each business's price. Competitors in that city react: undercut them and they follow, overcharge and you lose customers. Rarely a <b>price war</b> breaks out — competitors slash prices for a week or two, and some go under afterwards.</p>
    <h4>Headquarters</h4><p>Rent one global office for your company. HR Managers, Marketing Managers and Staffing Coordinators there can work for several businesses at once (tap them to choose which). Staffing Coordinators automatically replace people who quit or get poached. Recruiters and Accountants work company-wide.</p>
    <h4>A harder world</h4><ul><li><b>Economy</b>: booms and recessions move demand ±15–30%. You get a warning about 10 days ahead.</li><li><b>Saturation</b>: your own shops of the same type in one city share customers — expand to other cities and types.</li><li><b>Leases</b> renew every 90 days at market rent, often higher.</li><li><b>Morale</b>: pay, hours, HR and management matter. Unhappy staff quit or strike.</li><li><b>General Managers</b>: beyond a few businesses, each one needs a manager.</li><li><b>Risks</b>: lawsuits, fines, fires and data breaches grow with your size. Insurance covers 80%.</li></ul>
    <h4>Empire (endgame)</h4><ul><li><b>Factories</b> make stock for your shops at 45% of the cost and sell the rest wholesale. Owning a Construction Company with 5+ builders makes them cheaper and faster to build.</li><li><b>Stocks</b>: trade shares, collect dividends — or take your own company public. Shareholders then expect growth every 90 days; disappoint them enough and they vote you out.</li><li><b>Sports</b>: buy a football club, sign players, fill the stadium, win titles for prestige.</li><li><b>Rich list</b>: climb past the world's billionaires.</li></ul>
    <h4>Billionaire tier</h4><ul><li><b>Decisions</b> (from ${money(BL.DECISIONS_FROM)}): dilemmas with real consequences — unions, scandals, offers, lawsuits. Answer within ${BL.DECISION_DAYS} days or the default happens.</li><li><b>Takeovers</b> (from ${money(BL.BILLION)}): buy companies from the rich list. They pay you every day and give your empire a bonus for their industry.</li><li><b>Megaprojects</b>: towers, islands, arenas, AI, space, a smart city. Paid daily while building — keep enough cash or construction pauses.</li><li><b>New business types</b>: Investment Bank ($1B+), Biotech Lab ($5B+), Space Launch Company ($20B+).</li><li><b>Achievements</b> give prestige.</li></ul>
    <h4>Version 4 extras</h4><ul><li><b>Goals</b> on Home guide your first days (with cash rewards). <b>Side hustles</b> pay a little extra while you still have a day job.</li><li><b>Calendar</b>: 12 months of 30 days. Seasons change demand — gyms in January, hotels in summer, shops at Christmas, and <b>Black Friday</b> (+80% for shops, 4 days).</li><li><b>Business upgrades</b>: quality level, renovation, loyalty, delivery apps, self-checkout, premium fit-out, staff training and <b>franchising</b> (6% royalties).</li><li><b>Stars</b>: rare top employees with special traits appear in Hire. Floor staff with skill 70+ can be <b>promoted</b> to General Manager.</li><li><b>Rivals</b>: named chains open stores next to you, poach staff and start price wars. Fight back with a marketing blitz or buy them out.</li><li><b>Bank loans</b>, <b>property development</b> (build, then use, sell or lease to tenants) and property prices that follow the economy.</li><li><b>Factories</b>: upstream suppliers (farm, chemicals, steel) make others cheaper; automation, safety systems and accidents.</li><li><b>Stocks</b>: short selling, options and insider tips (risky!). Activist investors may come after public companies.</li><li><b>Sports</b>: formations, injuries, youth academy, two divisions with promotion and relegation, plus <b>basketball</b> and a <b>racing team</b>.</li><li><b>Politics</b> (Finance tab): lobby for tax relief or run for mayor.</li><li><b>Legacy</b> (Settings → Legacy): retire a CEO to earn points (fortune, prestige, achievements, titles, years) and join the Hall of Fame. Spend points on 11 perks, start the next game as the <b>heir</b> (each generation earns more, a trust fund can pass on money), pick <b>challenges</b> for bigger point multipliers, and climb the dynasty ranks from Bronze to Diamond. Each year ends with a <b>recap</b>. Important events collect in the 🔔 <b>inbox</b>.</li></ul>
    <h4>Stock</h4><p>Shops that sell products (clothing, coffee, bakery, cars, restaurant, supermarket, jewelry, furniture, cosmetics) need stock. Each sale uses one unit. Orders arrive ${STOCK_DELIVERY_DAYS} days after you place them, so order before you run out — or turn on <b>Auto-restock</b>. A warehouse adds storage.</p>
    <h4>2. Property</h4><ul><li>Parcels in Warsaw, London and New York — each district has different prices and <b>customer flow</b>.</li><li>Size limits how many staff fit.</li><li>Rent (3 days up front, then daily) or buy (one-off, small upkeep, sell later for 95% of market value).</li><li>Offices hold HR, Recruiters, Accountants and Marketing Managers.</li></ul>
    <h4>3. Hiring</h4><ul><li>Start a <b>search</b>. When it finishes you get a <b>shortlist</b> and pick exactly who to hire (and where). Unpicked candidates leave after ${E.SHORTLIST_DAYS} days.</li><li><b>Job Center</b>: low-skilled people. You choose how many and how long to wait — rushing costs up to 2.2× more, waiting is cheaper and finds slightly better people. Up to 10 candidates per day of waiting.</li><li><b>Your Recruiters</b> (in an office): skilled people, <b>free</b>, always 3 days, up to 100 candidates per search each. Better recruiters find better people.</li><li>Skill (0–100) drives productivity and customer satisfaction, which builds reputation and demand.</li><li>Above 15 staff a business needs an HR Manager.</li><li>People keep the job they were hired for — a Security Guard can't become a Cleaner, a Barista only works in coffee shops.</li><li>No room anywhere? Hire people as <b>Unassigned</b> staff — they wait on ${Math.round(0.5 * 100)}% standby pay until you place them (My Staff → tap someone → Place in).</li></ul>
    <h4>4. Taxes</h4><p>Every ${TAX_PERIOD} days you pay progressive income tax on your total income for the period (10% → 42%). Accountants lower the bill.</p>
    <h4>5. Don't go broke</h4><p>Negative cash costs 0.2% interest a day. 14 days in a row in overdraft and you're bankrupt.</p>
    <h4>Tips</h4><ul><li>A coffee shop in a cheap district is the classic first step.</li><li>Lawyers, engineers and game devs earn a lot more when highly skilled.</li><li>Watch the "turned away customers" warning — that's money left on the table.</li></ul>
  </div>`);
}

// ---------------------------------------------------------------- v4 UI: goals, inbox, upgrades, stars, loans, politics, legacy, more sports
const LEGACY_STORE = 'dbi-legacy';
function legacyStore() {
  let L;
  try { L = JSON.parse(localStorage.getItem(LEGACY_STORE)); } catch { L = null; }
  L ||= {};
  L.points ||= 0; L.perks ||= {}; L.hall ||= []; L.lifetime ??= L.hall.reduce((a, h) => a + (h.points || 0), 0) || L.points;
  return L;
}
const perkSpent = L => Object.entries(L.perks).reduce((a, [k, v]) => a + (MR.LEGACY_PERKS[k] ? MR.LEGACY_PERKS[k].cost * v : 0), 0);
function saveLegacy(L) { try { localStorage.setItem(LEGACY_STORE, JSON.stringify(L)); } catch { /* ignore */ } }
const seasonPill = () => MR.isBlackFriday(S.day) ? '<span class="pill red">🛍️ Black Friday</span>' : MR.monthOf(S.day) === 11 ? '<span class="pill green">🎄 Christmas season</span>' : MR.monthOf(S.day) >= 5 && MR.monthOf(S.day) <= 7 ? '<span class="pill orange">☀️ Summer</span>' : '';
const starTag = w => w.star ? ` <span class="pill orange" style="font-size:11px">${MR.TRAITS[w.star].icon} ${MR.TRAITS[w.star].label}</span>` : '';

function goalCard() {
  const T = S.tutorial;
  if (!T || T.step >= MR.GOALS.length) return '';
  const g = MR.GOALS[T.step];
  return `<div class="card mt" style="border:1px solid var(--tint)"><div style="display:flex;gap:12px;align-items:center"><div style="font-size:28px">🎯</div>
    <div style="flex:1"><div class="small muted">Goal ${T.step + 1} of ${MR.GOALS.length} · reward ${money(g.reward)}</div><div class="bold">${esc(g.text)}</div></div>
    <button class="link small" data-act="skipGoals">Skip</button></div>
    <div class="bar green mt"><i style="width:${Math.round(T.step / MR.GOALS.length * 100)}%"></i></div></div>`;
}
function inboxBtn() {
  const n = MR.unread(S);
  return `<button class="nav-btn icon" data-act="inbox" aria-label="Inbox" style="position:relative">🔔${n ? `<span class="badge" style="position:absolute;top:-4px;right:-6px">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
}
function inboxSheet() {
  openSheet('Inbox', () => {
    const list = S.inbox || [];
    return `<div class="footnote" style="margin:0 4px 12px">Important events land here. Real phone notifications would need a server, and this game runs entirely on your phone, so the inbox (and the badge on 🔔) is how you catch up.</div>
      ${list.length ? `<div class="group">${list.slice(0, 80).map(e => `<div class="event" style="${e.read ? '' : 'background:rgba(10,122,255,.08)'}"><span class="dot ${e.tone}"></span><div class="grow">${esc(e.text)}<div class="small muted">${MR.dateLabel(e.day)} · day ${e.day}</div></div></div>`).join('')}</div>` : '<div class="card empty"><p>Nothing yet.</p></div>'}`;
  });
  MR.markRead(S); save(); renderDock();
  setTimeout(() => { const sc = $('#screen'); if (sc && ui.tab === 'home') render(); }, 50);
}
function hustleChips() {
  if (!S.job.employed) return '';
  return `<div class="card mt"><div class="small muted" style="margin-bottom:8px">Side hustle after work</div>
    <div class="presets"><button class="${!S.job.hustle ? 'on' : ''}" data-act="hustle" data-v="">None</button>${Object.entries(MR.HUSTLES).map(([k, h]) => `<button class="${S.job.hustle === k ? 'on' : ''}" data-act="hustle" data-v="${k}">${h.icon} ${h.label}</button>`).join('')}</div>
    <div class="small muted" style="margin-top:8px">${S.job.hustle ? esc(MR.HUSTLES[S.job.hustle].desc) : 'Earn a little extra in the evenings while you build your first business.'}</div></div>`;
}

// ---- business page additions
function bizExtras(b) {
  const main = E.parcelById(S, b.mainId);
  if (!main) return '';
  const t = BT[b.type];
  const Q = MR.QUALITY;
  const ups = Object.entries(MR.UPGRADES).filter(([, U]) => U.fits(b, t));
  const fr = b.franchise, frErr = MR.franchiseCheck(S, b);
  const tc = MR.trainCost(S, b), cool = b.trained && S.day - b.trained < MR.TRAIN_COOLDOWN;
  const r = MR.rivalFor(S, b), share = MR.marketShare(S, b);
  const stars = E.workersOf(S, b.id).filter(w => w.star);
  return `<div class="section-h"><h2>Quality</h2></div>
    <div class="seg">${Object.entries(Q).map(([k, q]) => `<button class="${(b.quality || 'standard') === k ? 'on' : ''}" data-act="quality" data-id="${b.id}" data-v="${k}">${q.label}</button>`).join('')}</div>
    <div class="footnote" style="margin:8px 4px 0">${esc(Q[b.quality || 'standard'].desc)} · goods ×${Q[b.quality || 'standard'].cost} · satisfaction ${Q[b.quality || 'standard'].sat >= 0 ? '+' : ''}${Q[b.quality || 'standard'].sat}</div>
    ${ups.length ? `<div class="section-h"><h2>Upgrades</h2></div><div class="group">${ups.map(([k, U]) => `<div class="row"><div style="font-size:22px;width:30px">${U.icon}</div><div class="grow"><div class="title">${U.name}</div><div class="sub" style="white-space:normal">${esc(U.desc)}</div></div>
      ${b.upg && b.upg[k] ? '<span class="pill green">Done</span>' : `<button class="btn sm" data-act="upgrade" data-id="${b.id}" data-v="${k}" ${S.cash < U.cost(S, b) ? 'disabled' : ''}>${money(U.cost(S, b))}</button>`}</div>`).join('')}</div>` : ''}
    <div class="section-h"><h2>Training</h2></div>
    <div class="card" style="display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="bold">Staff course</div><div class="small muted">Everyone here gains up to +8 skill and a bit of morale. ${cool ? `Next course on day ${b.trained + MR.TRAIN_COOLDOWN}.` : `Every ${MR.TRAIN_COOLDOWN} days.`}</div></div>
      <button class="btn sm" data-act="train" data-id="${b.id}" ${cool || !tc || S.cash < tc ? 'disabled' : ''}>${tc ? money(tc) : '—'}</button></div>
    ${stars.length ? `<div class="footnote">Stars here: ${stars.map(w => `${MR.TRAITS[w.star].icon} ${esc(w.name)} (${esc(MR.TRAITS[w.star].desc)})`).join(' · ')}</div>` : ''}
    ${t.traffic >= 0.3 ? `<div class="section-h"><h2>Franchise</h2></div>
    ${fr ? `<div class="card"><div class="kv" style="padding-top:0"><span>Franchise stores</span><b>${fr.units}</b></div><div class="kv"><span>Royalties</span><span class="pos">+${money(fr.last || 0)}/day</span></div><div class="kv"><span>Earned so far</span><span>${money(fr.earned || 0)}</span></div>
      <div class="small muted" style="margin:6px 0">Other people open stores under your brand and pay you ${Math.round(MR.FRANCHISE_ROYALTY * 100)}% of their sales. More reputation = more stores; below 60 they start closing.</div>
      <button class="btn sm red" data-act="sellFranchise" data-id="${b.id}">Sell the franchise ${money(MR.franchiseValue(b))}</button></div>`
      : `<div class="card" style="display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="bold">Franchise this brand</div><div class="small muted">${frErr ? esc(frErr) : `Let others open copies and collect ${Math.round(MR.FRANCHISE_ROYALTY * 100)}% royalties.`}</div></div>
        <button class="btn sm" data-act="franchise" data-id="${b.id}" ${frErr || S.cash < MR.franchiseCost(S, b) ? 'disabled' : ''}>${money(MR.franchiseCost(S, b))}</button></div>`}` : ''}
    ${share ? `<div class="section-h"><h2>Competition</h2></div>
    <div class="card"><div class="kv" style="padding-top:0"><span>Your market share</span><b>${(share.share * 100).toFixed(1)}%</b></div>
      <div class="bar green"><i style="width:${Math.min(100, share.share * 100)}%"></i></div>
      ${r ? `<div class="kv mt"><span>Main rival</span><b>${esc(r.name)}</b></div><div class="kv"><span>Owner</span><span>${esc(r.owner)}</span></div>
      <div class="kv"><span>Their stores · strength</span><span>${r.stores} · ${Math.round(r.strength * 100)}/100</span></div><div class="kv"><span>Their share</span><span>${(share.rivalShare * 100).toFixed(1)}%</span></div>
      ${r.near === b.id && r.nearUntil > S.day ? '<div class="small neg" style="margin:4px 0">They opened a store right next to you (−10% customers)</div>' : ''}
      <div class="small muted" style="margin:6px 0 8px">Rivals open stores near you, poach your best staff and start price wars.</div>
      <div class="btn-row"><button class="btn sm gray" data-act="blitz" data-id="${b.id}" ${S.cash < MR.blitzCost(S, b) ? 'disabled' : ''}>Marketing blitz ${money(MR.blitzCost(S, b))}</button><button class="btn sm" data-act="buyRival" data-id="${b.id}" ${S.cash < MR.rivalBuyoutCost(S, b) ? 'disabled' : ''}>Buy them out ${money(MR.rivalBuyoutCost(S, b))}</button></div>`
      : '<div class="small muted mt">No big rival chain in this market — just independents.</div>'}</div>` : ''}`;
}

// ---- star candidates (Hire tab)
function starCards() {
  const list = (S.stars || []).filter(x => x.expires > S.day);
  if (!list.length) return '';
  return `<div class="section-h" style="margin-top:4px"><h2>🌟 Star candidates</h2><span class="small muted">rare · leave soon</span></div>
    <div class="group">${list.map(st => `<button class="row" data-act="starSheet" data-id="${st.id}"><div style="font-size:24px;width:32px">${MR.TRAITS[st.trait].icon}</div>
      <div class="grow"><div class="title">${esc(st.name)} · ${esc(E.catLabel(st.cat))}</div><div class="sub" style="white-space:normal">${MR.TRAITS[st.trait].label}: ${esc(MR.TRAITS[st.trait].desc)} · leaves in ${plural(st.expires - S.day, 'day')}</div></div>${skillBar(st.skill)}</button>`).join('')}</div>`;
}
function starSheet(id) {
  openSheet('Star candidate', () => {
    const st = (S.stars || []).find(x => x.id === id);
    if (!st) return null;
    const opts = S.businesses.map(b => ({ b, q: MR.starQuote(S, st, b) })).filter(x => x.q);
    return `<div class="biz-head"><div style="font-size:56px">${MR.TRAITS[st.trait].icon}</div><h1>${esc(st.name)}</h1><div class="muted">${esc(E.catLabel(st.cat))} · skill ${st.skill}</div>
        <div class="pill orange">${MR.TRAITS[st.trait].label}: ${esc(MR.TRAITS[st.trait].desc)}</div></div>
      <div class="footnote" style="margin:0 4px 10px">Stars want ${MR.STAR_WAGE}× normal pay plus a signing bonus of 30 days' wages. They leave on day ${st.expires}.</div>
      ${opts.length ? `<div class="group">${opts.map(({ b, q }) => { const c = E.positionCapacity(S, b, q.pos); const free = c.parcel && c.used < c.cap; return `<div class="row with-icon"><img class="tile" src="${bizImg(b.type)}" alt=""><div class="grow"><div class="title">${esc(b.name)}</div><div class="sub">${money(q.wage)}/day · ${free ? 'has a free spot' : '<span class="neg">no free spot</span>'}</div></div>
        <button class="btn sm" data-act="hireStar" data-id="${st.id}" data-biz="${b.id}" ${free && S.cash >= q.bonus ? '' : 'disabled'}>Sign ${money(q.bonus)}</button></div>`; }).join('')}</div>` : '<div class="card small muted">None of your businesses has this kind of job.</div>'}`;
  });
}

// ---- Finance additions
function loansSection() {
  const L = S.loans || [];
  const lim = MR.loanLimit(S);
  const st = ui.loan || (ui.loan = { amount: 0.25, term: 180 });
  const amount = Math.round(lim * st.amount / 1000) * 1000;
  const q = amount ? MR.loanQuote(S, amount, st.term) : null;
  return `<div class="section-h"><h2>🏦 Bank loans</h2><span class="small muted">debt ${money(MR.loanDebt(S))}</span></div>
    ${L.length ? `<div class="group">${L.map(l => `<div class="row"><div class="grow"><div class="title">${money(l.principal)} at ${(l.rate * 100).toFixed(1)}%</div><div class="sub">${money(l.daily)}/day · ${plural(l.left, 'day')} left · owe ${money(l.balance)}</div></div><button class="btn sm gray" data-act="repayLoan" data-id="${l.id}" ${S.cash < l.balance ? 'disabled' : ''}>Repay</button></div>`).join('')}</div>` : ''}
    <div class="card mt"><div class="kv" style="padding-top:0"><span>The bank will lend you</span><b>${money(lim)}</b></div>
      ${lim > 0 ? `<div class="small muted" style="margin:8px 0 6px">Amount</div><div class="presets">${[0.1, 0.25, 0.5, 1].map(x => `<button class="${st.amount === x ? 'on' : ''}" data-act="loanAmt" data-v="${x}">${money(Math.round(lim * x / 1000) * 1000)}</button>`).join('')}</div>
      <div class="small muted" style="margin:8px 0 6px">Paid back over</div><div class="presets">${MR.LOAN_TERMS.map(t => `<button class="${st.term === t ? 'on' : ''}" data-act="loanTerm" data-v="${t}">${t} days</button>`).join('')}</div>
      ${q ? `<div class="kv mt"><span>Interest</span><span>${(q.rate * 100).toFixed(1)}% a year</span></div><div class="kv"><span>You pay</span><span>${money(q.daily)}/day · ${money(q.total)} in total</span></div>` : ''}
      <button class="btn block mt" data-act="takeLoan" ${amount ? '' : 'disabled'}>Borrow ${money(amount)}</button>` : '<div class="small muted mt">Grow your net worth to borrow more.</div>'}
      <div class="small muted" style="margin-top:8px">Cheaper than the overdraft (0.2%/day ≈ 73%/year). Payments come out daily; repay early any time.</div></div>`;
}
function breakdownSection() {
  const bs = S.businesses.filter(b => b.last);
  if (bs.length < 2) return '';
  const by = key => { const m = {}; for (const b of bs) { const k = key(b); if (k) m[k] = (m[k] || 0) + b.last.profit; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bars = rows => { const max = Math.max(1, ...rows.map(r => Math.abs(r[1]))); return rows.map(([l, v]) => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><div class="small" style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l}</div><div style="flex:1;height:14px;background:var(--fill);border-radius:7px;overflow:hidden"><i style="display:block;height:100%;width:${Math.abs(v) / max * 100}%;background:${v >= 0 ? 'var(--green)' : 'var(--red)'};border-radius:7px"></i></div><div class="small ${cls(v)}" style="width:76px;text-align:right">${signed(v)}</div></div>`).join(''); };
  const city = by(b => { const m = E.parcelById(S, b.mainId); return m ? `${CITIES[m.city].flag} ${CITIES[m.city].name}` : null; });
  const type = by(b => BT[b.type].name);
  const per = bs.map(b => ({ b, n: E.workersOf(S, b.id).length })).filter(x => x.n).map(x => ({ ...x, v: x.b.last.profit / x.n })).sort((a, c) => c.v - a.v);
  return `<div class="section-h"><h2>Profit by city</h2><span class="small muted">yesterday</span></div><div class="card">${bars(city)}</div>
    <div class="section-h"><h2>Profit by type</h2></div><div class="card">${bars(type)}</div>
    <div class="section-h"><h2>Profit per employee</h2></div>
    <div class="group">${per.slice(0, 10).map((x, i) => `<button class="row with-icon" data-act="openBiz" data-id="${x.b.id}"><div style="width:22px" class="bold small">${i + 1}</div><img class="tile" src="${bizImg(x.b.type)}" alt=""><div class="grow"><div class="title">${esc(x.b.name)}</div><div class="sub">${plural(x.n, 'employee')}</div></div><div class="value ${cls(x.v)}">${signed(Math.round(x.v))}</div></button>`).join('')}</div>`;
}
function politicsSection() {
  const P = S.politics;
  const nw = E.netWorth(S);
  const nextLobby = MR.LOBBY_LEVELS[P.lobby];
  const city = ui.polCity || 'warsaw';
  const spendOpts = [1, 5, 20, 50].map(m => Math.round(m * 1e6 * CITIES[city].cost));
  const sp = ui.polSpend ?? spendOpts[1];
  const el = MR.nextElection(S.day + 1);
  return `<div class="section-h"><h2>🏛️ Politics</h2><span class="small muted">prestige ${S.prestige || 0}</span></div>
    <div class="card"><div class="bold">Lobbying</div><div class="small muted" style="margin:4px 0 8px">Pay lobbyists to bend the tax code. Every 90 days there's a small chance of a scandal.</div>
      <div class="kv"><span>Current tax relief</span><b class="pos">${pct(MR.taxRelief(S))}</b></div>
      ${nextLobby ? `<button class="btn block mt" data-act="lobby" ${S.cash < nextLobby.cost * W.diff(S).cost ? 'disabled' : ''}>Lobby for ${pct(nextLobby.relief)} relief · ${money(nextLobby.cost * W.diff(S).cost)}</button>` : '<div class="small muted mt">Maximum influence.</div>'}</div>
    <div class="card mt"><div class="bold">Run for mayor</div>
      ${P.mayor && P.mayor.until > S.day ? `<div class="pill green mt">You are mayor of ${CITIES[P.mayor.city].name} until day ${P.mayor.until}</div><div class="small muted mt">Your businesses there get +5% customers and 40% fewer fines, lawsuits and accidents.</div>`
      : P.campaign ? `<div class="small muted mt">Campaigning in ${CITIES[P.campaign.city].name} — election on day ${P.campaign.election} (${MR.dateLabel(P.campaign.election)}). Chance about ${pct(MR.winChance(S, P.campaign.city, P.campaign.spend))}.</div>`
      : nw < 10e6 ? `<div class="small muted mt">You need ${money(10e6)} net worth to be taken seriously.</div>`
      : `<div class="small muted" style="margin:4px 0 8px">Elections are on ${MR.dateLabel(el)} (day ${el}). Mayors get +5% customers and fewer risks in their city for a year, plus 15 prestige.</div>
        ${citySeg('polCity', city)}
        <div class="presets mt">${spendOpts.map(v => `<button class="${sp === v ? 'on' : ''}" data-act="polSpend" data-v="${v}">${money(v)}</button>`).join('')}</div>
        <div class="kv mt"><span>Chance to win</span><b>${pct(MR.winChance(S, city, sp))}</b></div>
        <button class="btn block mt" data-act="runMayor" ${S.cash < sp ? 'disabled' : ''}>Start campaign · ${money(sp)}</button>`}</div>`;
}

// ---- Property additions
function devSection() {
  const st = ui.dev || (ui.dev = { city: 'warsaw', district: null, kind: 'commercial', size: 'M' });
  const city = CITIES[st.city];
  st.district ||= city.districts[0].id;
  if (!city.districts.some(d => d.id === st.district)) st.district = city.districts[0].id;
  const q = MR.devQuote(S, st.city, st.district, st.kind, st.size);
  return `<div class="section-h"><h2>🏗️ Develop property</h2></div>
    ${S.devs.length ? `<div class="group">${S.devs.map(d => `<div class="row"><div class="grow"><div class="title">${SIZES[d.size].label} ${KINDS[d.kind].short.toLowerCase()} · ${esc(CITIES[d.city].districts.find(x => x.id === d.district).name)}</div><div class="bar green" style="margin-top:6px"><i style="width:${Math.round(d.progress / d.days * 100)}%"></i></div><div class="sub">${d.progress}/${d.days} days</div></div></div>`).join('')}</div>` : ''}
    <div class="card mt"><div class="small muted" style="margin-bottom:8px">Build new property for about 60% of its market price. When it's done you own it: use it, sell it or lease it out.</div>
      ${citySeg('devCity', st.city)}
      <select class="field mt" data-change="devDistrict">${city.districts.map(d => `<option value="${d.id}" ${d.id === st.district ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <div class="chips mt">${Object.entries(KINDS).map(([k, v]) => `<button class="chip ${st.kind === k ? 'on' : ''}" data-act="devKind" data-v="${k}">${v.short}</button>`).join('')}<span style="width:8px;flex:none"></span>${Object.keys(MR.DEV_DAYS).map(k => `<button class="chip ${st.size === k ? 'on' : ''}" data-act="devSize" data-v="${k}">${SIZES[k].label}</button>`).join('')}</div>
      ${q ? `<div class="kv mt"><span>Build cost</span><b>${money(q.cost)}</b></div><div class="kv"><span>Market value when done</span><span class="pos">~${money(q.value)}</span></div><div class="kv"><span>Time</span><span>${q.days} days${q.bonus ? ' (Construction Company bonus)' : ''}</span></div>
      <button class="btn block mt" data-act="develop" ${S.cash < q.cost ? 'disabled' : ''}>Start building</button>` : ''}</div>`;
}
function priceTrend() {
  const H = S.indexHist || {};
  if (!Object.values(H).some(h => h.length > 5)) return '';
  const colors = { warsaw: 'var(--red)', london: 'var(--tint)', nyc: 'var(--green)' };
  return `<div class="section-h"><h2>Property prices</h2><span class="small muted">price index, last ${Math.max(...Object.values(H).map(h => h.length))} days</span></div>
    <div class="grid3">${Object.entries(H).map(([c, h]) => `<div class="metric"><div class="k">${CITIES[c].flag} ${CITIES[c].name}</div><div class="v" style="font-size:18px">${(h.at(-1) * 100).toFixed(1)}</div><div class="s">${pctChange(h.at(-1), h[0])}</div>${sparkline(h, 80, 28, colors[c])}</div>`).join('')}</div>
    <div class="footnote">Prices rise in booms and fall in recessions. Buy low, sell high.</div>`;
}
function leaseBlock(p) {
  if (p.status !== 'owned' || p.bizId) return '';
  return p.leasedOut ? `<div class="card mt"><div class="kv" style="padding-top:0"><span>Leased to a tenant</span><b class="pos">+${money(p.leasedOut.rent)}/day</b></div><div class="kv"><span>Lease renews</span><span>day ${p.leasedOut.until}</span></div><button class="btn sm gray mt" data-act="endLease" data-id="${p.id}">End the lease</button></div>`
    : `<div class="card mt" style="display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="bold">Lease it out</div><div class="small muted">A tenant pays you ~${money(Math.round(E.parcelRent(S, p) * 0.9))}/day (90% of market rent), renewed every 90 days.</div></div><button class="btn sm" data-act="leaseOut" data-id="${p.id}">Lease</button></div>`;
}

// ---- Empire additions
function factoryExtras(f) {
  const F = M.FACTORIES[f.type];
  const fed = M.fedBy(S, f.type);
  return `${f.down > 0 ? `<div class="pill red mt">🚨 Closed after an accident · ${plural(f.down, 'day')}</div>` : ''}
    ${F.feeds ? `<div class="small muted mt">Supplies raw materials to: ${F.feeds.map(k => M.FACTORIES[k].name).join(', ')} (they run 15% cheaper)</div>` : fed ? `<div class="small pos mt">✓ Supplied by your ${M.FACTORIES[fed.type].name} — 15% cheaper to run</div>` : ''}
    <div class="presets mt">${f.automation ? '<button class="on" disabled>🤖 Automated</button>' : `<button data-act="facExtra" data-id="${f.id}" data-v="automation">🤖 Automate −30% running · ${money(M.extraCost(S, f, 'automation'))}</button>`}
      ${f.safety ? '<button class="on" disabled>🦺 Safety systems</button>' : `<button data-act="facExtra" data-id="${f.id}" data-v="safety">🦺 Safety −80% accidents · ${money(M.extraCost(S, f, 'safety'))}</button>`}</div>`;
}
function positionsCard() {
  const sh = Object.entries(S.market.shorts || {}), op = S.market.options || [], tip = S.market.tip;
  if (!sh.length && !op.length && !(tip && tip.until >= S.day)) return '';
  return `${tip && tip.until >= S.day ? `<div class="card mt" style="border:1px solid var(--orange)"><b>🤫 Tip: ${tip.t} will ${tip.dir > 0 ? 'rise' : 'fall'}</b><div class="small muted">Until day ${tip.until}. It might not be true — and trading it is insider trading.</div></div>` : ''}
    ${sh.length ? `<div class="section-h"><h2>Short positions</h2></div><div class="group">${sh.map(([t, x]) => { const st = S.market.stocks[t]; const pnl = x.qty * (x.entry - st.price); return `<div class="row"><div class="grow"><div class="title">${t} · ${x.qty.toLocaleString('en-US')} shares</div><div class="sub">sold at ${money(x.entry < 100 ? Math.round(x.entry * 100) / 100 : x.entry)} · now ${money(st.price < 100 ? Math.round(st.price * 100) / 100 : st.price)}</div></div><div class="value ${cls(pnl)}" style="margin-right:8px">${signed(Math.round(pnl))}</div><button class="btn sm gray" data-act="cover" data-t="${t}">Close</button></div>`; }).join('')}</div>` : ''}
    ${op.length ? `<div class="section-h"><h2>Options</h2></div><div class="group">${op.map(o => { const v = M.optionValue(S, o); return `<div class="row"><div class="grow"><div class="title">${o.contracts} × ${o.t} ${o.type === 'call' ? 'CALL' : 'PUT'} @ ${money(o.strike)}</div><div class="sub">expires day ${o.expiry} · paid ${money(o.cost)}</div></div><div class="value ${cls(v - o.cost)}">${money(v)}</div></div>`; }).join('')}</div>` : ''}`;
}
function stockExtras(t) {
  const st = S.market.stocks[t];
  const sh = (S.market.shorts || {})[t];
  const prem = (type, k) => Math.round(M.optionPremium(st, type, Math.round(st.price * k * 100) / 100) * 100);
  return `<div class="section-h"><h2>Short sell</h2><span class="small muted">bet on a fall</span></div>
    ${sh ? `<div class="card"><div class="kv" style="padding-top:0"><span>Short ${sh.qty.toLocaleString('en-US')} at</span><span>${money(sh.entry < 100 ? Math.round(sh.entry * 100) / 100 : sh.entry)}</span></div><div class="kv"><span>Profit / loss</span><b class="${cls(sh.qty * (sh.entry - st.price))}">${signed(Math.round(sh.qty * (sh.entry - st.price)))}</b></div><button class="btn sm gray mt" data-act="cover" data-t="${t}">Close the short</button></div>` : ''}
    <div class="presets">${[100, 1000, 10000, 100000].map(q => `<button data-act="short" data-t="${t}" data-q="${q}">${q.toLocaleString('en-US')} · margin ${money(q * st.price * M.SHORT_MARGIN)}</button>`).join('')}</div>
    <div class="footnote">You borrow shares and sell them; you profit if the price falls. Needs 50% of the value in cash, costs ${(M.BORROW_FEE * 100).toFixed(2)}% a day, and is force-closed if you lose 50%.</div>
    <div class="section-h"><h2>Options</h2><span class="small muted">${M.OPTION_DAYS} days · 100 shares each</span></div>
    <div class="group">${[['call', 1.05, 'Call +5%', 'pays if the price ends above'], ['call', 1, 'Call at today\'s price', 'pays if it rises'], ['put', 1, 'Put at today\'s price', 'pays if it falls'], ['put', 0.95, 'Put −5%', 'pays if the price ends below']].map(([type, k, label, note]) => `<div class="row"><div class="grow"><div class="title">${label}</div><div class="sub">strike ${money(Math.round(st.price * k * 100) / 100)} · ${note} · ${money(prem(type, k))} each</div></div>
      <div style="display:flex;gap:6px">${[1, 10, 100].map(n => `<button class="btn sm ${n === 1 ? 'gray' : ''}" data-act="option" data-t="${t}" data-type="${type}" data-k="${k}" data-n="${n}" ${S.cash < prem(type, k) * n ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="footnote">You can only lose what you pay. At expiry you get the difference × 100 shares; gains are taxed.</div>`;
}
function footballExtras(c) {
  const { div } = M.leagueOf(S, c.city, c.teamId);
  const injured = c.players.filter(p => p.injured > S.day);
  return `<div class="card mt"><div class="small muted" style="margin-bottom:6px">Formation</div>
      <div class="presets">${Object.entries(M.FORMATIONS).map(([k, f]) => `<button class="${(c.formation || 'balanced') === k ? 'on' : ''}" data-act="formation" data-v="${k}">${f.label}</button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Attack scores more and concedes more; defend does the opposite.</div>
      <div class="kv mt"><span>Youth academy</span><span>level ${c.academy || 0}/${M.ACADEMY_MAX} · ${c.academy ? `${plural(c.academy, 'graduate')} each season` : 'none'}</span></div>
      ${(c.academy || 0) < M.ACADEMY_MAX ? `<button class="btn sm mt" data-act="academy" ${S.cash < M.academyCost(c) ? 'disabled' : ''}>${c.academy ? 'Upgrade' : 'Build'} academy ${money(M.academyCost(c))}</button>` : ''}
      ${injured.length ? `<div class="small neg mt">🤕 Injured: ${injured.map(p => `${esc(p.name)} (${p.injured - S.day}d)`).join(', ')}</div>` : ''}
      <div class="small muted mt">${div === 2 ? 'Division 2: top 2 are promoted. Prizes, tickets and sponsors are lower here.' : 'Division 1: the bottom 2 are relegated each season.'} Good players stuck on the bench get unhappy.</div></div>`;
}
function sportsSub() {
  const k = ui.emp.sport || 'football';
  return `<div class="chips" style="margin-bottom:12px">${[['football', '⚽ Football'], ['bball', '🏀 Basketball'], ['racing', '🏎️ Racing']].map(([v, l]) => `<button class="chip ${k === v ? 'on' : ''}" data-act="sportSub" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function bballView() {
  const B = S.bball, T = B.team;
  if (!T) {
    const city = ui.emp.bbCity || 'nyc';
    const lg = B.leagues[city];
    return `<div class="card empty" style="padding:22px 16px"><div style="font-size:44px">🏀</div><h3>Buy a basketball team</h3><p>Games every Wednesday and Saturday, ${S2.BB_GAMES} regular-season games, then a top-4 playoff. Champions get ${money(S2.BB_PRIZES.champion)} and prestige.</p></div>
      <div class="seg mt">${Object.keys(S2.BB_LEAGUES).map(c => `<button class="${city === c ? 'on' : ''}" data-act="bbCity" data-v="${c}">${CITIES[c].flag} ${CITIES[c].name}</button>`).join('')}</div>
      <div class="group mt">${lg.teams.slice().sort((a, b) => b.rating - a.rating).map(t => `<div class="row"><div class="grow"><div class="title">${esc(t.name)}</div><div class="sub">rating ${t.rating} · ${t.w}-${t.l}</div></div><button class="btn sm" data-act="buyBb" data-c="${city}" data-id="${t.id}" ${S.cash < S2.bbPrice(S, t, city) ? 'disabled' : ''}>${money(S2.bbPrice(S, t, city))}</button></div>`).join('')}</div>`;
  }
  const lg = B.leagues[T.city], table = S2.bbStandings(lg), me = lg.teams.find(t => t.id === T.id);
  return `<div class="card"><div class="bold" style="font-size:18px">🏀 ${esc(T.name)}</div><div class="small muted">${S2.BB_LEAGUES[T.city]} · season ${lg.season} · ${lg.playoffs ? `playoffs: ${lg.playoffs.round}` : `game ${lg.game}/${S2.BB_GAMES}`}</div>
      <div class="grid3 mt"><div class="metric" style="background:var(--fill)"><div class="k">Record</div><div class="v" style="font-size:18px">${me.w}-${me.l}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Rating</div><div class="v">${Math.round(me.rating)}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Titles</div><div class="v">${B.titles}</div></div></div>
      <div class="kv mt"><span>Payroll</span><span class="neg">−${money(S2.bbPayrollCost(T))}/day</span></div><div class="kv"><span>Sponsors</span><span class="pos">+${money(T.last ? T.last.sponsor : 0)}/day</span></div>
      <div class="small muted" style="margin:8px 0 6px">Player budget (better players, +5 rating per level)</div>
      <div class="presets">${Array.from({ length: S2.BB_PAYROLL_MAX + 1 }, (_, i) => `<button class="${T.payroll === i ? 'on' : ''}" data-act="bbPayroll" data-v="${i}">${i === 0 ? 'Min' : i}</button>`).join('')}</div>
      <div class="small muted" style="margin:8px 0 6px">Tickets</div><div class="presets">${[0.75, 1, 1.5, 2].map(x => `<button class="${Math.abs(T.ticket - x) < 0.001 ? 'on' : ''}" data-act="bbTicket" data-v="${x}">${x === 1 ? 'Normal' : Math.round((x - 1) * 100) + '%'}</button>`).join('')}</div>
      <div class="btn-row mt">${T.coaching < S2.BB_COACH_MAX ? `<button class="btn sm" data-act="bbCoach" ${S.cash < S2.bbCoachCost(T) ? 'disabled' : ''}>Coaching staff ${money(S2.bbCoachCost(T))}</button>` : ''}<button class="btn sm red" data-act="sellBb">Sell ${money(S2.bbValue(S))}</button></div></div>
    <div class="section-h"><h2>Standings</h2><span class="small muted">top 4 reach the playoffs</span></div>
    <div class="group">${table.map((t, i) => `<div class="row" style="min-height:40px;${t.id === T.id ? 'background:rgba(10,122,255,.12)' : ''}"><div style="width:22px" class="bold small">${i + 1}</div><div class="grow"><div class="title" style="font-size:15px">${esc(t.name)}</div></div><div class="bold">${t.w}-${t.l}</div></div>`).join('')}</div>
    ${B.results.length ? `<div class="section-h"><h2>Results</h2></div><div class="group">${B.results.slice(0, 6).map(r => `<div class="row" style="min-height:40px"><span class="pill ${r.res === 'W' ? 'green' : 'red'}">${r.res}</span><div class="grow"><div class="title" style="font-size:15px">${r.mine}–${r.theirs} ${r.home ? 'vs' : '@'} ${esc(r.opp)}</div><div class="sub">day ${r.day}${r.tickets ? ` · tickets ${money(r.tickets)}` : ''}</div></div></div>`).join('')}</div>` : ''}`;
}
function racingView() {
  const R = S.racing, mine = S2.myRaceTeam(S);
  const table = R.teams.slice().sort((a, b) => b.pts - a.pts);
  if (!mine) return `<div class="card empty" style="padding:22px 16px"><div style="font-size:44px">🏎️</div><h3>Buy a racing team</h3><p>${S2.RACES} races a season, one every other Sunday. Invest in car R&D, sign drivers, win the constructors' title for ${money(S2.CONSTRUCTOR_PRIZES[0])}.</p></div>
    <div class="group mt">${table.map(t => `<div class="row"><div class="grow"><div class="title">${esc(t.name)}</div><div class="sub">car ${Math.round(t.car)} · ${t.drivers.map(d => esc(d.name)).join(' & ')} · ${t.pts} pts</div></div><button class="btn sm" data-act="buyRace" data-id="${t.id}" ${S.cash < S2.racePrice(t) ? 'disabled' : ''}>${money(S2.racePrice(t))}</button></div>`).join('')}</div>`;
  const pos = table.indexOf(mine) + 1;
  const rnd = [10e6, 50e6, 200e6];
  return `<div class="card"><div class="bold" style="font-size:18px">🏎️ ${esc(mine.name)}</div><div class="small muted">Season ${R.season} · race ${R.race}/${S2.RACES} · next race in ${plural((14 - S.day % 14) % 14 || 14, 'day')}</div>
      <div class="grid3 mt"><div class="metric" style="background:var(--fill)"><div class="k">Championship</div><div class="v">${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Points</div><div class="v">${mine.pts}</div></div><div class="metric" style="background:var(--fill)"><div class="k">Car</div><div class="v">${mine.car.toFixed(1)}</div></div></div>
      <div class="kv mt"><span>Running costs + drivers</span><span class="neg">−${money(R.team.last ? R.team.last.wages : 0)}/day</span></div>
      <div class="small muted" style="margin:8px 0 6px">Car R&D (rivals keep improving — so must you)</div>
      <div class="presets">${rnd.map(v => `<button data-act="rnd" data-v="${v}" ${S.cash < v ? 'disabled' : ''}>${money(v)}</button>`).join('')}</div>
      <button class="btn sm red mt" data-act="sellRace">Sell team ${money(S2.raceValue(S))}</button></div>
    <div class="section-h"><h2>Drivers</h2></div>
    <div class="group">${mine.drivers.map(d => `<div class="row"><div class="grow"><div class="title">${esc(d.name)}</div><div class="sub">${money(S2.driverWage(d.skill))}/day</div></div>${skillBar(d.skill)}</div>`).join('')}</div>
    <div class="section-h"><h2>Driver market</h2><span class="small muted">changes every 2 weeks</span></div>
    <div class="group">${R.market.map((d, i) => `<div class="row"><div class="grow"><div class="title">${esc(d.name)} · ${d.skill}</div><div class="sub">age ${d.age} · ${money(S2.driverWage(d.skill))}/day · fee ${money(S2.driverFee(d))}</div></div><div style="display:flex;gap:6px">${[0, 1].map(seat => `<button class="btn sm ${seat ? 'gray' : ''}" data-act="signDriver" data-i="${i}" data-seat="${seat}" ${S.cash < S2.driverFee(d) ? 'disabled' : ''}>Seat ${seat + 1}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="section-h"><h2>Constructors' championship</h2></div>
    <div class="group">${table.map((t, i) => `<div class="row" style="min-height:40px;${t === mine ? 'background:rgba(10,122,255,.12)' : ''}"><div style="width:22px" class="bold small">${i + 1}</div><div class="grow"><div class="title" style="font-size:15px">${esc(t.name)}</div><div class="sub">car ${Math.round(t.car)}</div></div><div class="bold">${t.pts}</div></div>`).join('')}</div>
    ${R.results.length ? `<div class="section-h"><h2>Recent races</h2></div><div class="group">${R.results.slice(0, 5).map(r => `<div class="event"><span class="dot ${r.best <= 3 ? 'good' : ''}"></span><div>Race ${r.race}: ${esc(r.txt)}${r.prize ? ` · ${money(r.prize)}` : ''}<div class="small muted">day ${r.day}</div></div></div>`).join('')}</div>` : ''}`;
}

// ---- legacy & recap
function legacySection() {
  const L = legacyStore(), R = MR.dynastyRank(L.lifetime);
  return `<div class="section-h"><h2>🏛️ Legacy</h2><span class="small muted">${L.points} points to spend</span></div>
    <div class="group"><button class="row" data-act="legacy"><div style="font-size:26px;width:34px">${R.icon === '·' ? '🏛️' : R.icon}</div><div class="grow"><div class="title">${R.label === 'Nobody' ? 'Perks, Hall of Fame & dynasty' : R.label}</div><div class="sub">${L.hall.length ? `${plural(L.hall.length, 'retired CEO')} · ${L.lifetime} lifetime points` : 'Retire a CEO to start your dynasty'}</div></div><span class="chev">›</span></button></div>
    ${S.gameOver ? '' : `<button class="btn block gray mt" data-act="retire">Retire ${esc(S.ceo)} (+${MR.legacyPoints(S, L.lifetime)} points)</button>`}`;
}
function legacySheet() {
  openSheet('Legacy', () => {
    const L = legacyStore(), R = MR.dynastyRank(L.lifetime), N = MR.nextDynastyRank(L.lifetime);
    const seg = ui.legacySeg || 'perks';
    const head = `<div class="biz-head"><div style="font-size:52px">${R.icon === '·' ? '🏛️' : R.icon}</div><h1>${R.label === 'Nobody' ? 'No dynasty yet' : R.label}</h1>
      <div class="muted">${L.lifetime} lifetime points${R.bonus ? ` · +${Math.round(R.bonus * 100)}% points when retiring` : ''}</div>
      ${N ? `<div class="bar green" style="width:70%;margin:10px auto 0"><i style="width:${Math.round((L.lifetime - R.at) / (N.at - R.at) * 100)}%"></i></div><div class="small muted" style="margin-top:6px">${N.at - L.lifetime} more to ${N.icon} ${N.label} (+${Math.round(N.bonus * 100)}%)</div>` : ''}</div>
      <div class="seg" style="margin-bottom:12px">${[['perks', 'Perks'], ['hall', 'Hall of Fame'], ['how', 'How it works']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="legacySeg" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (seg === 'hall') return head + (L.hall.length ? `<div class="group">${L.hall.slice().sort((a, b) => b.nw - a.nw).map((h, i) => `<div class="row" style="align-items:flex-start"><div class="bold small" style="width:22px;padding-top:2px">${i + 1}</div><div class="grow"><div class="title">${esc(h.ceo)}${h.gen > 1 ? ` <span class="small muted">gen ${h.gen}</span>` : ''}</div>
        <div class="sub" style="white-space:normal">${money(h.nw)} · peak ${money(h.peak)} · ${plural(h.days, 'day')} · ${W.DIFFICULTIES[h.difficulty] ? W.DIFFICULTIES[h.difficulty].label : ''}${h.titles ? ` · 🏆 ${h.titles}` : ''}${h.achievements ? ` · 🎖️ ${h.achievements}` : ''}${h.challenges && h.challenges.length ? ` · ${h.challenges.map(k => MR.CHALLENGES[k] ? MR.CHALLENGES[k].icon : '').join('')}` : ''}</div>
        <div class="small muted">retired ${new Date(h.when).toLocaleDateString()}</div></div><div class="value pos">+${h.points}</div></div>`).join('')}</div>` : '<div class="card empty"><p>Retired CEOs are remembered here.</p></div>');
    if (seg === 'how') return head + `<div class="card"><p class="small" style="margin:0 0 8px"><b>Retire</b> (Settings → Retire) to end a game and bank points. You earn points for your fortune, prestige, achievements (2 each), sports titles (5 each) and every year in business (2 each).</p>
      <p class="small" style="margin:0 0 8px"><b>Dynasty</b>: start the next game as the heir and every generation earns +5% more points (up to +50%). With the Trust fund perk the heir also inherits part of the fortune.</p>
      <p class="small" style="margin:0 0 8px"><b>Challenges</b> on the new-game screen make the game harder but multiply the points you earn:</p>
      ${Object.values(MR.CHALLENGES).map(c => `<div class="kv"><span>${c.icon} ${c.label} — ${esc(c.desc)}</span><b class="pos">+${Math.round(c.mult * 100)}%</b></div>`).join('')}
      <p class="small" style="margin:8px 0 0"><b>Dynasty ranks</b> come from all points you've ever earned and boost future points: ${MR.DYNASTY_RANKS.slice(1).map(r => `${r.icon} ${r.at}`).join(' · ')}.</p></div>`;
    const spent = perkSpent(L);
    return head + `<div class="group">${Object.entries(MR.LEGACY_PERKS).map(([k, P]) => { const lvl = L.perks[k] || 0; return `<div class="row"><div style="font-size:22px;width:30px">${P.icon}</div><div class="grow"><div class="title">${P.label} · ${lvl}/${P.max}</div><div class="sub" style="white-space:normal">${esc(P.desc)}</div></div>${lvl < P.max ? `<button class="btn sm" data-act="buyPerk" data-v="${k}" ${L.points < P.cost ? 'disabled' : ''}>${P.cost} pts</button>` : '<span class="pill green">Max</span>'}</div>`; }).join('')}</div>
      <div class="footnote">${L.points} points left. Perks apply to games you start from now on.</div>
      ${spent ? `<button class="btn block gray mt" data-act="resetPerks">Reset perks (refund ${Math.floor(spent * 0.75)} of ${spent} points)</button>` : ''}`;
  });
}
function recapSheet(R) {
  openSheet(`Year ${R.year} in review`, () => `<div class="biz-head"><div style="font-size:56px">🎆</div><h1>Year ${R.year}</h1><div class="muted">${esc(S.ceo)}'s empire</div></div>
    <div class="grid2">
      <div class="metric"><div class="k">Net worth</div><div class="v">${money(R.endNW)}</div><div class="s">${R.startNW ? pctChange(R.endNW, R.startNW || 1) : ''} from ${money(R.startNW || 0)}</div></div>
      <div class="metric"><div class="k">Rich list</div><div class="v">#${R.endRank}</div><div class="s">${R.startRank ? (R.startRank > R.endRank ? `▲ ${R.startRank - R.endRank} places` : R.startRank < R.endRank ? `▼ ${R.endRank - R.startRank}` : 'no change') : ''}</div></div>
      <div class="metric"><div class="k">Business profit</div><div class="v ${cls(R.total)}">${signed(R.total)}</div></div>
      <div class="metric"><div class="k">Taxes paid</div><div class="v neg">${money(R.taxes)}</div></div>
      <div class="metric"><div class="k">Businesses · staff</div><div class="v" style="font-size:18px">${R.businesses} · ${R.staff.toLocaleString('en-US')}</div></div>
      <div class="metric"><div class="k">Achievements</div><div class="v">${R.achievements}</div><div class="s">prestige ${R.prestige}</div></div>
    </div>
    <div class="group mt">
      ${R.best && R.best.profit > 0 ? `<div class="row with-icon"><img class="tile" src="${bizImg(R.best.type)}" alt=""><div class="grow"><div class="title">🏆 Star of the year</div><div class="sub">${esc(R.best.name)}</div></div><div class="value pos">${signed(R.best.profit)}</div></div>` : ''}
      ${R.worst ? `<div class="row with-icon"><img class="tile" src="${bizImg(R.worst.type)}" alt=""><div class="grow"><div class="title">🐌 Needs attention</div><div class="sub">${esc(R.worst.name)}</div></div><div class="value ${cls(R.worst.profit)}">${signed(R.worst.profit)}</div></div>` : ''}
    </div>
    <button class="btn block mt2" data-act="closeSheet">On to year ${R.year + 1}</button>`);
}
function extraReportRows(r) {
  const row = (icon, title, sub, v) => v ? `<div class="row with-icon"><div class="tile" style="display:grid;place-items:center;font-size:20px;background:var(--fill)">${icon}</div><div class="grow"><div class="title">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="value ${cls(v)}">${signed(v)}</div></div>` : '';
  return row('🛵', 'Side hustle', S.job.hustle ? MR.HUSTLES[S.job.hustle].label : '', r.hustle)
    + row('🏪', 'Franchise royalties', '', r.franchise)
    + row('🔑', 'Rent from tenants', '', r.leaseIncome)
    + row('🏦', 'Loan interest', r.loanPaid ? `${money(r.loanPaid)} paid to the bank` : '', -(r.loanInterest || 0))
    + row('🏀', 'Basketball', '', r.bball)
    + row('🏎️', 'Racing team', '', r.racing);
}

const A4 = {
  skipGoals() { MR.skipGoals(S); commit(); },
  inbox: inboxSheet,
  hustle(d) { MR.setHustle(S, d.v); commit(); },
  quality(d) { const b = E.bizById(S, d.id); if (b) { b.quality = d.v; commit(); } },
  upgrade(d) { if (commit(MR.buyUpgrade(S, d.id, d.v))) toast(`${MR.UPGRADES[d.v].icon} ${MR.UPGRADES[d.v].name} done`, 'good'); },
  train(d) { if (commit(MR.trainStaff(S, d.id))) toast('🎓 Training finished — skills up', 'good'); },
  async franchise(d) { const b = E.bizById(S, d.id); if (await confirmDialog('Franchise this brand?', `Pay ${money(MR.franchiseCost(S, b))} for the legal work and marketing. Franchise stores open over time as long as reputation stays high.`, 'Franchise')) commit(MR.startFranchise(S, d.id)); },
  async sellFranchise(d) { if (await confirmDialog('Sell the franchise network?', 'Royalties stop.', 'Sell', true)) commit(MR.sellFranchise(S, d.id)); },
  blitz(d) { const r = MR.marketingBlitz(S, d.id); if (r === 'retaliated') { commit(); toast('⚔️ They hit back with a price war!', 'bad'); } else if (commit(r)) toast('📣 Blitz done — your rival is weaker', 'good'); },
  async buyRival(d) { const b = E.bizById(S, d.id); const r = MR.rivalFor(S, b); if (r && await confirmDialog(`Buy out ${r.name}?`, `${money(MR.rivalBuyoutCost(S, b))} removes them from this market for good.`, 'Buy out')) if (commit(MR.buyOutRival(S, d.id))) toast(`🤝 ${esc(r.name)} is gone`, 'good'); },
  starSheet(d) { starSheet(d.id); },
  hireStar(d) { if (commit(MR.hireStar(S, d.id, d.biz))) { closeSheet(); toast('🌟 Star signed!', 'good'); } },
  promote(d) { if (commit(MR.promote(S, d.id))) toast('Promoted to General Manager', 'good'); },
  loanAmt(d) { ui.loan.amount = +d.v; render(); },
  loanTerm(d) { ui.loan.term = +d.v; render(); },
  takeLoan() { const lim = MR.loanLimit(S); if (commit(MR.takeLoan(S, Math.round(lim * ui.loan.amount / 1000) * 1000, ui.loan.term))) toast('🏦 Loan paid out', 'good'); },
  repayLoan(d) { commit(MR.repayLoan(S, d.id)); },
  lobby() { if (commit(MR.lobby(S))) toast('🏛️ Lobbying paid off: lower taxes', 'good'); },
  polCity(d) { ui.polCity = d.v; ui.polSpend = null; render(); },
  polSpend(d) { ui.polSpend = +d.v; render(); },
  async runMayor() { const city = ui.polCity || 'warsaw'; const sp = ui.polSpend ?? Math.round(5e6 * CITIES[city].cost); if (await confirmDialog(`Run for mayor of ${CITIES[city].name}?`, `${money(sp)} on the campaign. Chance about ${pct(MR.winChance(S, city, sp))}. The money is gone either way.`, 'Campaign')) commit(MR.runForMayor(S, city, sp)); },
  devCity(d) { ui.dev.city = d.v; ui.dev.district = null; render(); },
  devKind(d) { ui.dev.kind = d.v; render(); },
  devSize(d) { ui.dev.size = d.v; render(); },
  develop() { const st = ui.dev; if (commit(MR.startDevelopment(S, st.city, st.district, st.kind, st.size))) toast('🏗️ Construction started', 'good'); },
  leaseOut(d) { if (commit(MR.leaseOut(S, d.id))) toast('🔑 Leased to a tenant', 'good'); },
  endLease(d) { commit(MR.endLease(S, d.id)); },
  facExtra(d) { if (commit(M.factoryExtra(S, d.id, d.v))) toast(d.v === 'automation' ? '🤖 Factory automated' : '🦺 Safety systems installed', 'good'); },
  cover(d) { commit(M.coverShort(S, d.t)); },
  short(d) { if (commit(M.openShort(S, d.t, +d.q))) toast(`Shorted ${(+d.q).toLocaleString('en-US')} ${d.t}`); },
  option(d) { if (commit(M.buyOption(S, d.t, d.type, +d.k, +d.n))) toast(`Bought ${d.n} ${d.t} ${d.type}${+d.n > 1 ? 's' : ''}`); },
  formation(d) { M.setFormation(S, d.v); commit(); },
  academy() { commit(M.upgradeAcademy(S)); },
  sportSub(d) { ui.emp.sport = d.v; render(); },
  bbCity(d) { ui.emp.bbCity = d.v; render(); },
  async buyBb(d) { const t = S.bball.leagues[d.c].teams.find(x => x.id === d.id); if (await confirmDialog(`Buy ${t.name}?`, `${money(S2.bbPrice(S, t, d.c))}. You pay the payroll every day.`, 'Buy')) commit(S2.buyBbTeam(S, d.c, d.id)); },
  bbPayroll(d) { S2.setPayroll(S, +d.v); commit(); },
  bbTicket(d) { S2.setBbTicket(S, +d.v); commit(); },
  bbCoach() { commit(S2.upgradeCoaching(S)); },
  async sellBb() { if (await confirmDialog('Sell the team?', `You get ${money(S2.bbValue(S))}.`, 'Sell', true)) commit(S2.sellBbTeam(S)); },
  async buyRace(d) { const t = S.racing.teams.find(x => x.id === d.id); if (await confirmDialog(`Buy ${t.name}?`, `${money(S2.racePrice(t))}. Running a team costs ${money(S2.RACE_OPS)}/day plus driver wages.`, 'Buy')) commit(S2.buyRaceTeam(S, d.id)); },
  rnd(d) { const g = S2.investRnd(S, +d.v); if (typeof g === 'string') return fail(g); commit(); toast(`🔧 Car +${g.toFixed(1)}`, 'good'); },
  async sellRace() { if (await confirmDialog('Sell the racing team?', `You get ${money(S2.raceValue(S))}.`, 'Sell', true)) commit(S2.sellRaceTeam(S)); },
  signDriver(d) { if (commit(S2.signDriver(S, +d.i, +d.seat))) toast('🏎️ Driver signed', 'good'); },
  legacy() { legacySheet(); },
  legacySeg(d) { ui.legacySeg = d.v; refreshSheet(); },
  async resetPerks() { const L = legacyStore(), spent = perkSpent(L); if (!await confirmDialog('Reset all perks?', `You get ${Math.floor(spent * 0.75)} of the ${spent} points back.`, 'Reset', true)) return; L.points += Math.floor(spent * 0.75); L.perks = {}; saveLegacy(L); refreshSheet(); },
  pickChallenge(d) { ui.challenges ||= []; ui.challenges = ui.challenges.includes(d.v) ? ui.challenges.filter(x => x !== d.v) : [...ui.challenges, d.v]; renderOnboarding(); },
  toggleHeir() { ui.heir = !(ui.heir ?? true); renderOnboarding(); },
  buyPerk(d) { const L = legacyStore(), P = MR.LEGACY_PERKS[d.v]; if (L.points < P.cost || (L.perks[d.v] || 0) >= P.max) return; L.points -= P.cost; L.perks[d.v] = (L.perks[d.v] || 0) + 1; saveLegacy(L); refreshSheet(); toast(`${P.label} level ${L.perks[d.v]} — applies to new games`, 'good'); },
  async retire() {
    const L = legacyStore(), B = MR.legacyBreakdown(S, L.lifetime);
    const lines = B.rows.map(([l, v]) => `${l}: ${v}`).join(' · ') + (B.cm > 1 ? ` · challenges ×${B.cm.toFixed(2)}` : '') + (B.dynBonus ? ` · generation ${B.gen} +${Math.round(B.dynBonus * 100)}%` : '') + (B.rankBonus ? ` · dynasty rank +${Math.round(B.rankBonus * 100)}%` : '');
    if (!await confirmDialog(`Retire ${S.ceo} for ${B.total} points?`, `${lines}. This save ends; ${esc(S.ceo)} joins the Hall of Fame and your next CEO can be their heir. Other saves are not affected.`, 'Retire', true)) return;
    L.points += B.total; L.lifetime += B.total;
    L.hall.push(MR.hallEntry(S, B.total));
    L.last = { name: S.ceo, gen: S.dynasty ? S.dynasty.gen : 1, nw: Math.round(E.netWorth(S)) };
    saveLegacy(L);
    S.gameOver = true; S.gameOverReason = 'retired'; S.retiredDay = S.day; S.retiredPoints = B.total;
    save(); closeSheet(true); refresh();
  },

};

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
  if (E.checkRecovery(S)) { closeSheet(); setTimeout(() => toast(`🎉 Debt repaid with ${money(S.cash)} to spare — back in business!`, 'good', null, 5000), 50); }
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
  const msg = (p.status === 'owned' ? `You'll get ${money(Math.round(E.parcelValue(S, p) * 0.95))}.` : 'Rent stops from tomorrow.') + (n ? ` ${plural(n, 'employee')} working here will move to Unassigned staff (50% standby pay).` : '');
  if (!await confirmDialog(p.status === 'owned' ? 'Sell property?' : 'End lease?', msg, p.status === 'owned' ? 'Sell' : 'End lease', true)) return;
  commit(E.releaseParcel(S, id));
  closeSheet();
}

const A = {
  start() {
    const L = legacyStore();
    const heir = L.last && (ui.heir ?? true) ? { name: L.last.name, gen: (L.last.gen || 1) + 1, lastNW: L.last.nw } : null;
    S = E.newGame($('#ceo').value, ui.newDiff || 'normal', { perks: L.perks, challenges: ui.challenges || [], heir });
    ui.challenges = [];
    IDX.current = newSlotId();
    ui.returnTo = null;
    save();
    $('#app').innerHTML = '';
    render();
    healSoon();
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
  lastChance() { showLastChance(); },
  async lcSell(d) {
    const o = E.liquidationOptions(S).find(x => x.kind === d.kind && x.id === d.id);
    if (!o) return;
    if (o.kind === 'parcel' && E.staffAffected(S, o.id) && !await confirmDialog('Sell this property?', `${plural(E.staffAffected(S, o.id), 'employee')} working there will move to Unassigned staff.`, 'Sell', true)) return;
    if (fail(E.liquidate(S, d.kind, d.id))) return;
    if (E.checkRecovery(S)) { save(); closeSheet(); refresh(); toast(`🎉 Debt repaid with ${money(S.cash)} to spare — back in business!`, 'good', null, 5000); return; }
    save(); refresh();
    toast(`Sold ${esc(o.label)} · ${money(-S.cash)} still owed`);
  },
  async declareBankrupt() {
    if (!await confirmDialog('Declare bankruptcy?', 'Game over for this save. You can start a new game afterwards.', 'Declare bankruptcy', true)) return;
    if (fail(E.declareBankruptcy(S))) { save(); closeSheet(); refresh(); return; }
    save(); closeSheet(true); refresh();
  },
  async sim1() {
    if (ui.busy) return;
    if (S.gameOver) return showGameOver();
    if (S.bankruptcyPending) return showLastChance();
    const before = S.job.level;
    const r = E.simulateDay(S);
    save();
    refresh();
    if (!r) return;
    if (r.lastChance) { showReport([r]); setTimeout(showLastChance, 400); return; }
    if (r.recap) { recapSheet(r.recap); return; }
    if (r.newDecision && !r.tax && !r.gameOver) { decisionSheet(r.newDecision); return; }
    const ready = r.events.find(e => e.text.startsWith('Search done'));
    if (ready && !(r.tax || r.gameOver)) toast(`👥 ${esc(ready.text.replace(' — pick who to hire', ''))} <b>— tap to pick</b>`, 'good', () => { ui.tab = 'hire'; ui.hire.src = 'orders'; ui.stacks.hire.length = 0; render(); }, 6000);
    else if (r.tax || r.gameOver || r.promoted || r.events.length > 1) showReport([r]);
    else toast(`<span>Day ${r.day}: <b class="${cls(r.net)}">${signed(r.net)}</b></span>${r.events[0] ? ` · ${esc(r.events[0].text)}` : ''} <span class="muted">›</span>`, '', () => showReport([r]));
    void before;
  },
  sim7() {
    if (ui.busy) return;
    if (S.gameOver) return showGameOver();
    if (S.bankruptcyPending) return showLastChance();
    const rs = E.simulateDays(S, 7);
    save();
    refresh();
    if (rs.some(r => r.lastChance)) { setTimeout(showLastChance, 100); return; }
    if (S.billion && S.billion.decisions.length) toast(`⚖️ ${plural(S.billion.decisions.length, 'decision')} waiting — check Home`, '', () => decisionSheet(S.billion.decisions[0].id), 5000);
    const rc = rs.find(x => x.recap);
    if (rs.length) showReport(rs);
    if (rc) setTimeout(() => recapSheet(rc.recap), 350);
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
    healSoon();
    if (n && n.trim()) { b.name = n.trim().slice(0, 30); commit(); }
  },
  async closeBiz(d) {
    const b = E.bizById(S, d.id);
    if (!await confirmDialog(`Close ${esc(b.name)}?`, `All ${E.workersOf(S, b.id).length} staff move to Unassigned (you can place or let them go later) and leases end. Owned property stays yours. The registration fee is lost.`, 'Close business', true)) return;
    E.closeBusiness(S, d.id);
    ui.stacks[ui.tab].pop();
    commit();
  },
  ads(d) { E.setAds(S, d.id, +d.v); commit(); },
  openHQ() {
    closeSheet();
    if (ui.tab !== 'home' && ui.tab !== 'biz') ui.tab = 'biz';
    const st = ui.stacks[ui.tab];
    if (ui.tab === 'biz') st.length = 0;
    st.push({ view: 'hqDetail', id: E.HQ_ID });
    render('push-in');
  },
  toggleDay(d) {
    const b = E.bizById(S, d.biz);
    const days = (b.days || Array(7).fill(true)).slice();
    days[+d.d] = !days[+d.d];
    commit(E.setSchedule(S, d.biz, { days }));
  },
  setHours(d) { commit(E.setSchedule(S, d.biz, { hours: +d.v })); },
  setPrice(d) { commit(E.setPrice(S, d.biz, +d.v)); },
  nudgePrice(d) { const b = E.bizById(S, d.biz); commit(E.setPrice(S, d.biz, (b.price || 1) + +d.v)); },
  servesAll(d) { commit(E.setServes(S, d.id, [])); },
  servesToggle(d) {
    const w = S.workers.find(x => x.id === d.id);
    let ids = (!w.serves || !w.serves.length) ? [] : w.serves.slice();
    ids = ids.includes(d.biz) ? ids.filter(x => x !== d.biz) : [...ids, d.biz];
    commit(E.setServes(S, d.id, ids));
  },
  noop() {},
  pickDiff(d) { ui.newDiff = d.v; const v = $('#ceo')?.value; renderOnboarding(); if (v) $('#ceo').value = v; },
  setDiff(d) { W.setDifficulty(S, d.v); commit(); toast(`Difficulty: ${W.diff(S).label}`); },
  setPay(d) { W.setPayLevel(S, d.biz, +d.v); commit(); },
  toggleInsure(d) { const b = E.bizById(S, d.biz); W.setInsured(S, d.biz, !b.insured); commit(); toast(b.insured ? 'Insured' : 'Insurance cancelled'); },
  async buyout(d) {
    const b = E.bizById(S, d.biz);
    const cost = W.buyoutCost(S, b);
    if (!await confirmDialog('Buy out competitors?', `Spend ${money(cost)} buying up rival ${esc(BT[b.type].name.toLowerCase())}s in this city. Competition drops and the rest raise prices.`, 'Buy out')) return;
    if (commit(W.buyOutCompetitors(S, d.biz))) toast('Competitors bought out', 'good');
  },
  factorySupply(d) { const b = E.bizById(S, d.biz); b.factorySupply = b.factorySupply === false; commit(); },
  goEmpire(d) { closeSheet(); ui.tab = 'emp'; ui.emp.seg = d.v; ui.stacks.emp.length = 0; render(); },
  empSeg(d) { ui.emp.seg = d.v; render(); },
  empCity(d) { ui.emp.city = d.v; render(); },
  sportsCity(d) { ui.emp.sportsCity = d.v; render(); },
  async buildFactory(d) {
    const q = M.buildQuote(S, d.v);
    if (!await confirmDialog(`Build a ${M.FACTORIES[d.v].name}?`, `${money(q.cost)} in ${CITIES[ui.emp.city].name}. Ready in ${q.days} days.`, 'Build')) return;
    if (commit(M.buildFactory(S, d.v, ui.emp.city))) toast('🏗️ Construction started', 'good');
  },
  async upgradeFactory(d) {
    const f = S.factories.find(x => x.id === d.id);
    if (!await confirmDialog('Upgrade factory?', `${money(M.upgradeCost(S, f))} for level ${f.level + 1} (+${money(M.FACTORIES[f.type].value)} capacity/day). Takes ${M.UPGRADE_DAYS} days.`, 'Upgrade')) return;
    commit(M.upgradeFactory(S, d.id));
  },
  async sellFactory(d) {
    const f = S.factories.find(x => x.id === d.id);
    if (!await confirmDialog('Sell factory?', `You get ${money(M.factoryValue(f))} (half of what you invested).`, 'Sell', true)) return;
    commit(M.sellFactory(S, d.id));
  },
  stock(d) { stockSheet(d.v); },
  decision(d) { decisionSheet(d.id); },
  decide(d) {
    const msg = BL.resolveDecision(S, d.id, +d.i);
    if (msg && /^You need/.test(msg)) return fail(msg);
    commit(); closeSheet();
    toast(esc(msg), '', null, 4500);
  },
  async takeover(d) {
    const q = BL.takeoverPrice(S, d.npc, d.c);
    const r = M.richProfile(S, d.npc), c = r && r.companies.find(x => x.name === d.c);
    if (!q || !c) return;
    if (!await confirmDialog(`Buy ${esc(d.c)}?`, `${money(q.price)} (${q.main ? '60' : '30'}% premium on ${money(q.value)}). Pays out a share of its profits daily. Bonus: ${esc(BL.SYNERGIES[c.sector] || '')}.`, 'Buy company')) return;
    if (commit(BL.takeOver(S, d.npc, d.c, E.netWorth(S)))) { closeSheet(); toast(`🦈 You now own ${esc(d.c)}`, 'good'); }
  },
  strategy(d) { BL.setStrategy(S, d.id, d.v); commit(); },
  async sellHolding(d) {
    const h = S.billion.holdings.find(x => x.id === d.id);
    if (await confirmDialog(`Sell ${esc(h.name)}?`, `You get ${money(h.value * 0.95)} and lose its ${esc(h.sector)} bonus (unless you own another ${esc(h.sector)} company).`, 'Sell', true)) commit(BL.sellHolding(S, d.id));
  },
  megaCity(d) { ui.emp.megaCity = d.v; render(); },
  async startProject(d) {
    const Mg = BL.MEGA[d.v];
    const city = ui.emp.megaCity || 'london';
    if (!await confirmDialog(`Build a ${Mg.name}?`, `${money(Mg.cost * W.diff(S).cost)} in total: 10% now, the rest paid daily over ${Mg.days} days. If you run short of cash, construction pauses.`, 'Start building')) return;
    if (commit(BL.startProject(S, d.v, city, E.netWorth(S)))) toast(`${Mg.icon} Construction started in ${CITIES[city].name}`, 'good');
  },
  richProfile(d) { richProfileSheet(d.v); },
  trade(d) {
    const st = S.market.stocks[d.t];
    let q = d.q === 'max' ? Math.floor(Math.max(0, S.cash) / (st.price * (1 + M.TRADE_FEE))) : d.q === 'all' ? -((S.market.holdings[d.t] || {}).qty || 0) : +d.q;
    if (commit(M.tradeStock(S, d.t, q))) toast(`${q > 0 ? 'Bought' : 'Sold'} ${Math.abs(q).toLocaleString('en-US')} ${d.t}`, 'good');
  },
  ipo() { ipoSheet(); },
  async doIPO(d) {
    const nw = E.netWorth(S);
    const q = M.ipoQuote(S, +d.v, nw);
    if (!await confirmDialog('Go public?', `Sell ${Math.round(+d.v * 100)}% of your company for ${money(q.proceeds)}. Shareholders then get ${Math.round(+d.v * 100)}% of your profits and review growth every 90 days${W.diff(S).ousting ? ' — fail them badly enough and you\'re out' : ''}.`, 'Ring the bell')) return;
    if (commit(M.goPublic(S, +d.v, nw))) { closeSheet(); toast(`🔔 You're public! Raised ${money(q.proceeds)}`, 'good'); }
  },
  async buyback(d) {
    const nw = E.netWorth(S);
    const pct = d.v === 'all' ? S.ipo.pct : Math.min(+d.v, S.ipo.pct);
    const cost = M.buybackQuote(S, pct, nw);
    if (!await confirmDialog('Buy back shares?', `${money(cost)} for ${Math.round(pct * 1000) / 10}% of the company.${pct >= S.ipo.pct ? ' You\'ll be private again.' : ''}`, 'Buy back')) return;
    commit(M.buyBack(S, pct, nw));
  },
  async buyClub(d) {
    const lg = M.leagueOf(S, ui.emp.sportsCity, d.id).lg;
    const t = lg.teams.find(x => x.id === d.id);
    const price = M.clubPrice(S, t, ui.emp.sportsCity);
    if (!await confirmDialog(`Buy ${esc(t.name)}?`, `${money(price)}. You'll pay player wages every day and earn sponsorship, tickets on home matchdays (Saturdays) and prize money at the end of each season.`, 'Buy club')) return;
    if (commit(M.buyClub(S, ui.emp.sportsCity, d.id))) toast(`⚽ You own ${esc(t.name)}!`, 'good');
  },
  async sellClub() { if (await confirmDialog('Sell your club?', `You get ${money(M.clubValue(S))}.`, 'Sell', true)) commit(M.sellClub(S)); },
  signPlayer(d) { if (commit(M.signPlayer(S, d.id))) toast('✍️ Player signed', 'good'); },
  async sellPlayer(d) {
    const p = S.sports.club.players.find(x => x.id === d.id);
    if (await confirmDialog(`Sell ${esc(p.name)}?`, `You get ${money(Math.round(p.value * 0.8))}.`, 'Sell', true)) commit(M.sellPlayer(S, d.id));
  },
  async stadium() {
    const c = S.sports.club;
    if (await confirmDialog('Expand stadium?', `${money(M.stadiumUpgradeCost(c))} for ${M.STADIUM_CAPS[c.stadium + 1].toLocaleString('en-US')} seats.`, 'Build')) commit(M.upgradeStadium(S));
  },
  ticket(d) { M.setTicket(S, +d.v); commit(); },
  buyLot(d) { if (commit(E.buyLot(S, d.id, d.biz))) toast(`🚗 Bought — arrives day ${S.day + STOCK_DELIVERY_DAYS}`, 'good'); },
  bidLot(d) { if (commit(E.bidLot(S, d.id, d.biz))) toast('Bid placed — decided at the end of the day'); },
  buyBargains(d) {
    const b = E.bizById(S, d.biz);
    let n = 0, err = null;
    for (const l of S.auction.lots.filter(l => l.ratio < 0.68)) { err = E.buyLot(S, l.id, b.id); if (err) break; n++; }
    commit();
    toast(n ? `🚗 Bought ${plural(n, 'bargain car')}` : esc(err || 'No bargains today'), n ? 'good' : 'bad');
  },
  bidAll(d) {
    let n = 0, err = null;
    for (const l of S.auction.lots.slice()) { err = E.bidLot(S, l.id, d.biz); if (err) break; n++; }
    commit();
    toast(n ? `Placed ${plural(n, 'bid')}` : esc(err || 'Nothing to bid on'), n ? '' : 'bad');
  },
  orderStock(d) {
    const b = E.bizById(S, d.biz);
    const q = E.stockQuote(S, b, +d.q);
    if (commit(E.orderStock(S, d.biz, +d.q))) toast(`📦 ${(+d.q).toLocaleString('en-US')} ${STOCK[b.type].unit} ordered (${money(q.cost)}) — arriving day ${S.day + STOCK_DELIVERY_DAYS}`, 'good');
  },
  orderStockCustom(d) {
    const b = E.bizById(S, d.biz);
    const room = E.stockQuote(S, b, 0).room;
    const v = prompt(`How many ${STOCK[b.type].unit}? (room for ${room.toLocaleString('en-US')}, ${E.unitCost(S, b) < 10 ? '$' + E.unitCost(S, b).toFixed(2) : money(E.unitCost(S, b))} each)`, String(Math.min(room, Math.ceil(E.dailySales(S, b) * 5))));
    healSoon();
    const n = parseInt(v, 10);
    if (n > 0) A.orderStock({ biz: d.biz, q: n });
  },
  autoStock(d) { const b = E.bizById(S, d.biz); E.setAutoStock(S, d.biz, !b.autoStock); commit(); toast(b.autoStock ? 'Auto-restock on' : 'Auto-restock off'); },
  buyEq(d) { if (commit(E.buyEquipment(S, d.biz, d.g))) toast(`Bought ${esc(E.equipFor(E.bizById(S, d.biz), d.g).name.toLowerCase())}`, 'good'); },
  sellEq(d) { commit(E.sellEquipment(S, d.biz, d.g)); },
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
    if (n && !await confirmDialog('Stop using this property?', `${plural(n, 'employee')} working here will move to Unassigned staff (50% standby pay).`, 'Continue', true)) return;
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
      toast(`🔎 Searching for ${plural(n, 'candidate')} for ${esc(b.name)} — shortlist on day ${S.day + E.searchDays(H.source, days)}`, 'good');
      H.count = 1; render();
    }
  },
  shortlist(d) { shortlistSheet(d.id); },
  slToggle(d) { const s2 = sheet.state.sel; s2.has(d.id) ? s2.delete(d.id) : s2.add(d.id); refreshSheet(); },
  slNone() { sheet.state.sel.clear(); refreshSheet(); },
  slBench() { sheet.state.bizId = 'bench'; refreshSheet(); },
  slTop(d) {
    const st = sheet.state, sl = E.shortlistById(S, sheet.slId), b = st.bizId === 'bench' ? null : E.bizById(S, st.bizId);
    const c = b ? E.positionCapacity(S, b, st.pos) : null;
    const free = !b ? Infinity : c.parcel ? c.cap - c.used : 0;
    const n = Math.min(d.n === 'fill' ? (b ? free : sl.candidates.length) : +d.n, free, sl.candidates.length);
    if (n <= 0) return toast('No free spots in that position', 'bad');
    st.sel = new Set(sl.candidates.slice(0, n).map(x => x.id));
    refreshSheet();
  },
  slHire() {
    const st = sheet.state, bench = st.bizId === 'bench', b = bench ? null : E.bizById(S, st.bizId), n = st.sel.size;
    if (commit(E.hireFromShortlist(S, sheet.slId, [...st.sel], bench ? null : st.bizId, st.pos))) {
      st.sel.clear();
      toast(bench ? `Welcome aboard! ${plural(n, 'new hire')} waiting as unassigned staff` : `Welcome aboard! ${plural(n, 'new hire')} at ${esc(b.name)}`, 'good');
      if (!E.shortlistById(S, sheet.slId)) closeSheet();
    }
  },
  async slDismiss() {
    const sl = E.shortlistById(S, sheet.slId);
    if (!await confirmDialog('Dismiss shortlist?', `${plural(sl.candidates.length, 'candidate')} will leave. Search fees aren't refunded.`, 'Dismiss', true)) return;
    E.dismissShortlist(S, sheet.slId); commit(); closeSheet();
  },
  async cancelOrder(d) {
    const o = S.orders.find(x => x.id === d.id);
    if (!o || !await confirmDialog('Cancel search?', o.paid ? `You get ${money(Math.round(o.paid / 2))} back (50%).` : 'The candidates found so far are lost.', 'Cancel search', true)) return;
    commit(E.cancelOrder(S, d.id));
  },
  staffBiz(d) { ui.hire.staffBiz = d.v; render(); },
  worker(d) { workerSheet(d.id); },
  placeBench(d) {
    const r = E.placeBench(S, d.biz);
    commit();
    toast(r.placed ? `👥 Placed ${plural(r.placed, 'worker')}${r.left ? ` · ${r.left} didn't fit (no free spots)` : ''}` : 'No free spots for them — buy equipment or get more space', r.placed ? 'good' : 'bad');
  },
  placeW(d) {
    const st = sheet.state, tb = E.bizById(S, st.mvBiz);
    if (commit(E.assignWorker(S, d.id, st.mvBiz, st.mvPos))) toast(`Moved to ${esc(tb.name)}`, 'good');
  },
  benchW(d) { if (commit(E.benchWorker(S, d.id))) toast('Moved to Unassigned staff'); },
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
        save();
        S = data; IDX.current = newSlotId(); save();
        closeSheet(true); resetUI(); $('#app').innerHTML = ''; render();
        toast(`Imported ${esc(S.ceo)} · day ${S.day} as a new save`, 'good');
      } catch (e) { toast('That file is not a valid save', 'bad'); }
    };
    inp.click();
  },
  async reset() {
    if (!await confirmDialog('Delete this save?', `${esc(S.ceo)}'s game (day ${S.day}) is deleted from this device. Your other saves are kept. This cannot be undone.`, 'Delete', true)) return;
    A.restart();
  },
  restart() {
    const id = IDX.current;
    if (id) { localStorage.removeItem(slotKey(id)); IDX.slots = IDX.slots.filter(x => x.id !== id); }
    IDX.current = null; saveIndex(); ui.returnTo = null;
    S = null; closeSheet(true); resetUI();
    $('#app').innerHTML = '';
    render();
  },
  newSave() { startNewSlot(); },
  loadSlot(d) { switchSlot(d.id); },
  async deleteSlot(d) {
    const sl = IDX.slots.find(x => x.id === d.id);
    if (!sl || !await confirmDialog('Delete save?', `${esc(sl.ceo)} · day ${sl.day} will be deleted. This cannot be undone.`, 'Delete', true)) return;
    localStorage.removeItem(slotKey(d.id));
    IDX.slots = IDX.slots.filter(x => x.id !== d.id); saveIndex();
    refreshSheet();
  },
  cancelNew() {
    const back = ui.returnTo && IDX.slots.some(x => x.id === ui.returnTo) ? ui.returnTo : IDX.slots.slice().sort((a, c) => c.updated - a.updated)[0]?.id;
    ui.returnTo = null;
    if (back) switchSlot(back);
  },
};

Object.assign(A, A4);

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
  if (k === 'slBiz' && sheet?.state) { sheet.state.bizId = e.target.value; sheet.state.sel.clear(); refreshSheet(); }
  if (k === 'slPos' && sheet?.state) { sheet.state.pos = e.target.value; refreshSheet(); }
  if (k === 'mvBiz' && sheet?.state) { sheet.state.mvBiz = e.target.value; refreshSheet(); }
  if (k === 'mvPos' && sheet?.state) { sheet.state.mvPos = e.target.value; refreshSheet(); }
  if (k === 'devDistrict') { ui.dev.district = e.target.value; render(); }
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
    const dl = $('#recDaysLbl'); if (dl) dl.textContent = plural(H.days, 'day');
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

// iOS home-screen apps have a WebKit bug: after the keyboard opens once, the viewport stays
// ~59px short (black band at the bottom) until the app is force-quit. Hiding and re-showing the
// full-height #app forces WebKit to re-measure, which restores the full screen.
let maxH = window.innerHeight;
const STANDALONE = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
document.documentElement.classList.toggle('standalone', STANDALONE);
function fitViewport() {
  maxH = Math.max(maxH, window.innerHeight);
}
function displayInfo() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const info = `${STANDALONE ? 'home-screen' : 'browser'} · view ${window.innerHeight}/${screen.height} · app ${$('#app').offsetHeight} · safe ${parseInt(cs.paddingTop)}/${parseInt(cs.paddingBottom)}`;
  probe.remove();
  return info;
}
function healViewport() {
  if (maxH - window.innerHeight <= 4) return;
  const app = $('#app'), sc = $('#screen');
  const top = sc ? sc.scrollTop : 0;
  app.style.display = 'none';
  void app.offsetHeight;
  app.style.display = '';
  if (sc) sc.scrollTop = top;
  fitViewport();
}
const healSoon = () => { setTimeout(healViewport, 140); setTimeout(healViewport, 600); };
fitViewport();
if (S) save(); // persist anything migrate() repaired (e.g. a revived save)
addEventListener('resize', fitViewport);
addEventListener('orientationchange', () => setTimeout(fitViewport, 300));
document.addEventListener('focusout', e => { if (e.target.matches('input, select, textarea')) healSoon(); });
addEventListener('pageshow', healSoon);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') healSoon(); });

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  // a new version took over: reload once so every file is from the same version (game is already saved)
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; save(); location.reload(); }
  });
}

// Ask the server which version is live; offer a reload if this copy is older.
async function checkForUpdate() {
  try {
    const txt = await (await fetch(`js/version.js?t=${Date.now()}`, { cache: 'no-store' })).text();
    const live = (txt.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
    if (live && live !== self.APP_VERSION) {
      toast(`⬆️ Version ${esc(live)} is available — <b>tap to update</b>`, 'good', () => { save(); location.reload(); }, 15000);
    }
  } catch { /* offline: ignore */ }
}
setTimeout(checkForUpdate, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
