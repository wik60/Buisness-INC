// Harder world: difficulty, economic cycles, market saturation, leases, morale, management, risk.
import { CITIES, BT, OFFICE_ROLES } from './data.js';
import {
  bizById, parcelById, workersOf, hrCapacity, parcelRent, districtOf, competition, fmt, isOpenOn, recordDeparture,
} from './engine.js';
import { demandMult, capMultB, moraleBonus } from './billion.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- difficulty ----------
export const DIFFICULTIES = {
  easy: { label: 'Easy', desc: 'Busier shops, cheaper staff, rare disasters, mild recessions.', demand: 1.15, cost: 0.9, risk: 0.5, cycle: 0.6, startCash: 6000, freeBiz: 8, ousting: false, ipoTarget: 0.03 },
  normal: { label: 'Normal', desc: 'The intended challenge.', demand: 1, cost: 1, risk: 1, cycle: 1, startCash: 4000, freeBiz: 5, ousting: true, ipoTarget: 0.06 },
  hard: { label: 'Hard', desc: 'Pricier staff and rent, deeper recessions, more lawsuits.', demand: 0.9, cost: 1.1, risk: 1.5, cycle: 1.3, startCash: 2500, freeBiz: 4, ousting: true, ipoTarget: 0.08 },
  delusional: { label: 'Delusional', desc: 'Everything wants you broke. Good luck.', demand: 0.8, cost: 1.25, risk: 2.2, cycle: 1.6, startCash: 1000, freeBiz: 3, ousting: true, ipoTarget: 0.1 },
};
export const diff = s => DIFFICULTIES[s.difficulty] || DIFFICULTIES.normal;
export function setDifficulty(s, d) { if (DIFFICULTIES[d]) s.difficulty = d; }

export const LEASE_DAYS = 90;
export const PAY_LEVELS = [0.9, 1, 1.1, 1.25, 1.5];
const OFFICE_TYPES = ['tech', 'law', 'marketing', 'gaming', 'realestate'];
const INJURY_TYPES = ['construction', 'gym', 'delivery', 'security', 'airline'];

export function initWorld(s) {
  s.difficulty ||= 'normal';
  s.economy ||= { phase: 'normal', mult: 1, target: 1, daysLeft: 60 + randi(0, 40), next: 'recession', warned: false };
  for (const b of s.businesses) {
    b.morale ??= 70;
    b.payLevel ??= 1;
    b.insured ??= false;
    b.downtime ??= null;
  }
  for (const p of s.parcels) if (p.status === 'rented' && !p.leaseEnd) p.leaseEnd = s.day + randi(15, LEASE_DAYS);
}

// ---------- economy cycles ----------
export const PHASES = {
  boom: { label: 'Boom', icon: '📈' },
  normal: { label: 'Stable', icon: '➖' },
  recession: { label: 'Recession', icon: '📉' },
};
function nextPhase(cur) {
  const r = Math.random();
  if (cur === 'normal') return r < 0.5 ? 'recession' : r < 0.85 ? 'boom' : 'normal';
  if (cur === 'boom') return r < 0.55 ? 'normal' : 'recession';
  return r < 0.7 ? 'normal' : 'boom';
}
function phaseTarget(s, phase) {
  const a = diff(s).cycle;
  if (phase === 'boom') return 1 + rand(0.1, 0.2) * a;
  if (phase === 'recession') return 1 - rand(0.15, 0.28) * a;
  return 1;
}
export function updateEconomy(s, report) {
  const e = s.economy;
  e.daysLeft--;
  if (e.daysLeft === 10 && e.next !== e.phase) {
    report.events.push({ tone: e.next === 'recession' ? 'bad' : 'good', text: e.next === 'recession' ? '📉 Economists warn a recession is coming in about 10 days' : e.next === 'boom' ? '📈 Analysts expect a boom in about 10 days' : 'Analysts expect the economy to stabilise soon' });
  }
  if (e.daysLeft <= 0) {
    e.phase = s.day < 60 ? 'normal' : e.next;
    e.target = phaseTarget(s, e.phase);
    e.daysLeft = randi(60, 150);
    e.next = nextPhase(e.phase);
    report.events.push({ tone: e.phase === 'recession' ? 'bad' : 'good', text: `${PHASES[e.phase].icon} The economy enters a ${PHASES[e.phase].label.toLowerCase()} — demand ${e.target >= 1 ? '+' : ''}${Math.round((e.target - 1) * 100)}%` });
  }
  e.mult += (e.target - e.mult) * 0.06;
  for (const c of Object.keys(s.index)) s.index[c] = clamp(s.index[c] * (1 + (e.mult - 1) * 0.0015), 0.6, 2.5);
}

// ---------- saturation: your own shops of the same type in one city share customers ----------
export function saturation(s, b) {
  const main = parcelById(s, b.mainId);
  if (!main) return { f: 1, same: 0 };
  let city = 0, dist = 0;
  for (const x of s.businesses) {
    if (x === b || x.type !== b.type) continue;
    const p = parcelById(s, x.mainId);
    if (!p || p.city !== main.city) continue;
    if (p.district === main.district) dist++; else city++;
  }
  return { f: 1 / (1 + 0.3 * city + 0.5 * dist), same: city + dist };
}

// ---------- management: big empires need General Managers ----------
export function managedIndex(s, b) {
  return s.businesses.slice().sort((a, c) => a.founded - c.founded || (a.id < c.id ? -1 : 1)).indexOf(b);
}
export const needsManager = (s, b) => managedIndex(s, b) >= diff(s).freeBiz;
export const hasManager = (s, b) => workersOf(s, b.id, 'manager').length > 0;

// combined demand/capacity/satisfaction modifiers for one business today
export function worldFactors(s, b) {
  const sat = saturation(s, b);
  const notes = [];
  if (sat.same) notes.push(`Sharing customers with ${sat.same} of your other ${BT[b.type].name.toLowerCase()}s in this city (−${Math.round((1 - sat.f) * 100)}%)`);
  let capMult = (0.85 + 0.3 * (b.morale ?? 70) / 100) * capMultB(s);
  let satAdj = ((b.morale ?? 70) - 60) / 8;
  if (needsManager(s, b)) {
    if (hasManager(s, b)) {
      const gm = workersOf(s, b.id, 'manager').sort((a, c) => c.skill - a.skill)[0];
      capMult *= 1 + (gm.skill - 50) / 500;
    } else {
      capMult *= 0.8; satAdj -= 8;
      notes.push(`No General Manager — you run ${s.businesses.length} businesses (${diff(s).freeBiz} without managers on ${diff(s).label})`);
    }
  }
  return { demand: s.economy.mult * sat.f * diff(s).demand * demandMult(s, b), capMult, satAdj, notes };
}

// ---------- downtime (strikes, fires) ----------
export function downtimeToday(b) { return b.downtime && b.downtime.days > 0 ? b.downtime : null; }
function tickDowntime(b) { if (b.downtime) { b.downtime.days--; if (b.downtime.days <= 0) b.downtime = null; } }

// ---------- morale, turnover, strikes ----------
export function moraleTarget(s, b) {
  const staff = workersOf(s, b.id).length;
  let t = 62 + ((b.payLevel || 1) - 1) * 80;
  const h = b.hours || 8;
  if (h > 10) t -= (h - 10) * 2.5;
  if ((b.days || []).filter(x => x !== false).length >= 7) t -= 4;
  if (staff > 5) t -= 15 * (1 - Math.min(1, hrCapacity(s, b) / staff));
  if (needsManager(s, b) && !hasManager(s, b)) t -= 8;
  if (s.economy.phase === 'recession') t += 3; // people cling to jobs
  t += moraleBonus(s);
  return clamp(t, 5, 100);
}
function moraleDay(s, b, report) {
  b.morale = clamp((b.morale ?? 70) + (moraleTarget(s, b) - (b.morale ?? 70)) * 0.1, 0, 100);
  const ws = s.workers.filter(w => w.bizId === b.id);
  if (b.morale < 45 && ws.length) {
    const p = (45 - b.morale) / 100 * 0.03 * Math.sqrt(diff(s).risk);
    const quit = ws.filter(() => Math.random() < p);
    if (quit.length) {
      for (const w of quit) recordDeparture(s, w);
      s.workers = s.workers.filter(w => !quit.includes(w));
      report.events.push({ tone: 'bad', text: `${quit.length} unhappy staff quit ${b.name} (morale ${Math.round(b.morale)})` });
    }
  }
  if (b.downtime && b.downtime.reason === 'strike' && b.morale > 45) {
    b.downtime = null;
    report.events.push({ tone: 'good', text: `The strike at ${b.name} is over` });
  } else if (!b.downtime && b.morale < 28 && ws.length >= 8 && Math.random() < 0.03 * diff(s).risk) {
    b.downtime = { days: randi(2, 4), reason: 'strike', paysWages: false };
    report.events.push({ tone: 'bad', text: `✊ Staff at ${b.name} are on strike for ${b.downtime.days} days — raise pay or improve conditions` });
  }
}

// ---------- risk events & insurance ----------
export const INSURED_SHARE = 0.2; // with insurance you pay 20% of the damage
export function avgRevenue(b) {
  const h = b.history.slice(-14);
  return h.length ? h.reduce((a, x) => a + x.revenue, 0) / h.length : 0;
}
export const insurancePremium = (s, b) => Math.round(Math.max(15, 0.014 * avgRevenue(b)) * diff(s).cost);

function riskDay(s, b, r, report) {
  const avg = avgRevenue(b);
  if (b.insured) { r.insurance = insurancePremium(s, b); r.other += r.insurance; }
  if (avg < 500) return;
  const p = 0.0015 * diff(s).risk * (1 + Math.log10(1 + avg / 3000) / 2);
  if (Math.random() > p) return;
  const hasAcct = s.workers.some(w => w.pos === 'accountant');
  const kinds = ['lawsuit', 'audit'];
  if (OFFICE_TYPES.includes(b.type)) kinds.push('breach'); else kinds.push('fire');
  if (INJURY_TYPES.includes(b.type)) kinds.push('injury');
  const kind = pick(kinds);
  let cost = 0, text = '';
  if (kind === 'lawsuit') { cost = avg * rand(4, 15); text = `⚖️ ${b.name} lost a lawsuit`; }
  if (kind === 'audit') { cost = avg * rand(2, 8) * (hasAcct ? 0.5 : 1); text = `🧾 Regulators fined ${b.name}${hasAcct ? ' (your accountants halved it)' : ''}`; }
  if (kind === 'breach') { cost = avg * rand(3, 12); b.rep = clamp(b.rep - 12, 0, 100); text = `💻 Data breach at ${b.name} — reputation −12`; }
  if (kind === 'injury') { cost = avg * rand(2, 6); text = `🩹 Injury claim against ${b.name}`; }
  if (kind === 'fire') {
    cost = avg * rand(3, 10);
    const days = randi(2, 5);
    b.downtime = { days, reason: 'fire', paysWages: true };
    if (b.stock) { b.stock *= 0.6; b.stockValue = (b.stockValue || 0) * 0.6; }
    text = `🔥 Fire at ${b.name}! Closed for ${days} days, 40% of stock lost`;
  }
  const paid = Math.round(cost * (b.insured ? INSURED_SHARE : 1));
  r.incidents = (r.incidents || 0) + paid;
  r.other += paid;
  report.events.push({ tone: 'bad', text: `${text}: ${fmt(paid)}${b.insured ? ` (insurance paid ${fmt(cost - paid)})` : ' — not insured'}` });
}

// called by the engine after a business's day is simulated (before profit is final)
export function worldAfterBusiness(s, b, r, report) {
  r.other = r.other || 0;
  riskDay(s, b, r, report);
  moraleDay(s, b, report);
  tickDowntime(b);
}

// ---------- leases ----------
export function leaseDay(s, report) {
  for (const p of s.parcels) {
    if (p.status !== 'rented') continue;
    p.leaseEnd ||= s.day + LEASE_DAYS;
    if (p.leaseEnd > s.day) continue;
    const old = p.rentLocked;
    p.rentLocked = Math.round(Math.max(old, parcelRent(s, p)) * rand(1, 1.12));
    p.leaseEnd = s.day + LEASE_DAYS;
    const ch = (p.rentLocked - old) / Math.max(1, old);
    if (ch >= 0.03) report.events.push({ tone: 'bad', text: `🏠 Lease renewed at ${p.address}, ${districtOf(p).name}: rent ${fmt(old)} → ${fmt(p.rentLocked)}/day` });
  }
}

// ---------- buy out competitors ----------
export function buyoutCost(s, b) {
  const c = competition(s, b);
  if (!c) return null;
  const main = parcelById(s, b.mainId);
  const marketDaily = Math.max(2000 * CITIES[main.city].cost, avgRevenue(b) * 3);
  return Math.round(c.level * marketDaily * 120 / 1000) * 1000;
}
export function buyOutCompetitors(s, bizId) {
  const b = bizById(s, bizId);
  const c = b && competition(s, b);
  if (!c) return 'Get a location first';
  if (c.boughtOut && c.boughtOut > s.day) return `Competitors are regrouping — try again on day ${c.boughtOut}`;
  if (c.level < 0.15) return 'There is barely any competition left';
  const cost = buyoutCost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  c.level = clamp(c.level - 0.3, 0.05, 1);
  c.price = clamp(c.price + 0.05, 0.6, 1.5);
  c.war = 0;
  c.boughtOut = s.day + 30;
  return null;
}

export function setPayLevel(s, bizId, v) { const b = bizById(s, bizId); if (b) b.payLevel = clamp(v, 0.8, 1.6); }
export function setInsured(s, bizId, on) { const b = bizById(s, bizId); if (b) b.insured = !!on; }
export const isOfficeRole = pos => OFFICE_ROLES.includes(pos);
export { isOpenOn };
