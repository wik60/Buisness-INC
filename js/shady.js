// The underworld: off-the-books wages, hiding profits from the taxman, bribes, smuggling,
// money laundering through cash businesses and sabotaging rivals. Everything raises "heat";
// too much heat brings raids, fines and — at the very top — jail.
import { CITIES, BT } from './data.js';
import { fmt, netWorth } from './engine.js';
import { rivalFor, rivalBuyoutCost } from './more.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));

export const HIDE_LEVELS = [0, 0.25, 0.5, 0.75];
export const CONTRABAND = {
  cigs: { icon: '🚬', name: 'Untaxed cigarettes', cost: 50000, mult: 2.1, days: 4, risk: 0.1, heat: 4 },
  bags: { icon: '👜', name: 'Counterfeit designer bags', cost: 500000, mult: 2.4, days: 6, risk: 0.15, heat: 8 },
  watches: { icon: '⌚', name: 'Smuggled luxury watches', cost: 5e6, mult: 2.3, days: 8, risk: 0.2, heat: 12 },
  art: { icon: '🖼️', name: 'Looted antiquities', cost: 50e6, mult: 2.2, days: 12, risk: 0.25, heat: 18 },
};
// cash-heavy businesses can quietly push dirty money through their tills
export const LAUNDRY = { casino: 1.0, coffee: 0.4, bakery: 0.4, restaurant: 0.4, gym: 0.3, hotel: 0.3, realestate: 0.5, jewelry: 0.4, usedcars: 0.4, construction: 0.3 };
export const LAUNDER_FEE = 0.15;
export const JAIL_DAYS = 30;
export const HEAT_LABELS = [[0, 'Clean', 'green'], [20, 'Noticed', 'orange'], [40, 'Watched', 'orange'], [65, 'Investigated', 'red'], [85, 'Wanted', 'red']];
export const heatLabel = h => HEAT_LABELS.filter(x => h >= x[0]).pop();

export function initShady(s) {
  s.shady ||= { heat: 0, dirty: 0, cashPay: false, hide: 0, bribeUntil: 0, fixerDay: -99, shipments: [], jailUntil: 0, stats: { raids: 0, fines: 0, smuggled: 0, laundered: 0 } };
}
const Sh = s => { initShady(s); return s.shady; };
export const inJail = s => s.shady && s.shady.jailUntil > s.day;
export const bribed = s => s.shady && s.shady.bribeUntil > s.day;
const mayor = s => s.politics && s.politics.mayor && s.politics.mayor.until > s.day;
const ownsLawFirm = s => s.businesses.some(b => b.type === 'law');
const addHeat = (s, h) => { const S = Sh(s); S.heat = clamp(S.heat + h * (mayor(s) ? 0.7 : 1), 0, 100); };
const nwFloor = (s, share, min) => Math.max(min, Math.round(Math.max(0, netWorth(s)) * share));

// ---- hooks used by the rest of the engine
export const cashPayMult = s => (s.shady && s.shady.cashPay ? 0.85 : 1);
export const bribeRiskMult = s => (bribed(s) ? 0.3 : 1);
export const jailDemand = s => (inJail(s) ? 0.85 : 1);
export const hiddenShare = s => (s.shady ? s.shady.hide : 0);

// tax day: the hidden share of profit isn't taxed — unless the auditors come
export function taxDay(s, due, report) {
  const S = Sh(s);
  if (!S.hide || due <= 0) return due;
  const full = due / (1 - S.hide);
  const hidden = Math.round(full - due);
  const chance = clamp(0.12 + S.heat / 150 + S.hide * 0.15, 0, 0.9) * (bribed(s) ? 0.6 : 1);
  if (Math.random() < chance) {
    const penalty = hidden * 3;
    s.prestige = Math.max(0, (s.prestige || 0) - 5);
    S.stats.fines += penalty;
    addHeat(s, 15);
    report.events.push({ tone: 'bad', text: `🧾 Tax audit! The ${fmt(hidden)} you hid was found — back taxes and penalties ${fmt(penalty)}, prestige −5` });
    return due + penalty;
  }
  addHeat(s, 10 * S.hide);
  report.events.push({ tone: 'info', text: `🤫 You kept ${fmt(hidden)} away from the taxman this time` });
  return due;
}

// ---- actions
export function setCashPay(s, on) { if (inJail(s)) return 'You are in jail'; Sh(s).cashPay = !!on; return null; }
export function setHide(s, v) { if (inJail(s)) return 'You are in jail'; if (!HIDE_LEVELS.includes(v)) return 'Invalid'; Sh(s).hide = v; return null; }
export const bribeCost = s => nwFloor(s, 0.0015, 50000);
export function bribe(s) {
  const S = Sh(s);
  if (inJail(s)) return 'You are in jail';
  if (bribed(s)) return `Inspectors are already paid until day ${S.bribeUntil}`;
  const c = bribeCost(s);
  if (s.cash < c) return `You need ${fmt(c)}`;
  s.cash -= c; S.bribeUntil = s.day + 60; addHeat(s, 8);
  return null;
}
export const fixerCost = s => nwFloor(s, 0.001, 100000);
export function fixer(s) {
  const S = Sh(s);
  if (S.heat < 1) return 'Nobody is looking at you';
  if (s.day - S.fixerDay < 30) return `The fixer is busy until day ${S.fixerDay + 30}`;
  const c = fixerCost(s);
  if (s.cash < c) return `You need ${fmt(c)}`;
  s.cash -= c; S.fixerDay = s.day; S.heat = Math.max(0, S.heat - 20);
  return null;
}
export function smuggle(s, kind) {
  const S = Sh(s), C = CONTRABAND[kind];
  if (!C) return 'Unknown';
  if (inJail(s)) return 'You are in jail';
  if (S.shipments.length >= 3) return 'Three shipments are already on the way';
  if (s.cash < C.cost) return `You need ${fmt(C.cost)}`;
  s.cash -= C.cost;
  S.shipments.push({ kind, cost: C.cost, arrive: s.day + C.days });
  addHeat(s, C.heat / 2);
  return null;
}
export const seizeChance = (s, kind) => clamp(CONTRABAND[kind].risk + Sh(s).heat / 300, 0, 0.9) * (bribed(s) ? 0.5 : 1);
export const sabotageCost = (s, b) => Math.round(rivalBuyoutCost(s, b) * 0.08);
export function sabotage(s, bizId) {
  const b = s.businesses.find(x => x.id === bizId);
  const r = b && rivalFor(s, b);
  if (!r) return 'No rival to sabotage';
  if (inJail(s)) return 'You are in jail';
  const c = sabotageCost(s, b);
  if (s.cash < c) return `You need ${fmt(c)}`;
  s.cash -= c;
  if (Math.random() < clamp(0.25 + Sh(s).heat / 200, 0, 0.8)) {
    const fine = c * 3;
    s.cash -= fine; s.prestige = Math.max(0, (s.prestige || 0) - 10); Sh(s).stats.fines += fine; addHeat(s, 20);
    return { exposed: true, fine };
  }
  r.strength = Math.max(0.2, r.strength - 0.2);
  r.stores = Math.max(1, r.stores - randi(1, 3));
  addHeat(s, 10);
  return { exposed: false, name: r.name };
}
export const bailCost = s => nwFloor(s, 0.03, 250000);
export function bail(s) {
  if (!inJail(s)) return 'You are free';
  const c = bailCost(s);
  if (s.cash < c) return `Bail is ${fmt(c)}`;
  s.cash -= c; Sh(s).jailUntil = s.day;
  return null;
}
export function launderCapacity(s) {
  let cap = 0;
  for (const b of s.businesses) if (LAUNDRY[b.type] && b.last) cap += Math.max(0, b.last.revenue || 0) * LAUNDRY[b.type] * 0.3;
  return Math.round(cap);
}

// ---- daily
export function shadyDay(s, report) {
  const S = Sh(s);
  let cash = 0;
  // heat cools down by itself (faster with your own lawyers)
  S.heat = Math.max(0, S.heat - (ownsLawFirm(s) ? 0.8 : 0.4));
  if (S.cashPay) addHeat(s, Math.min(1.2, 0.04 * s.businesses.length));
  // shipments
  for (const sh of S.shipments.filter(x => x.arrive <= s.day)) {
    const C = CONTRABAND[sh.kind];
    if (Math.random() < seizeChance(s, sh.kind)) {
      const fine = Math.round(sh.cost * 0.5);
      cash -= fine; S.stats.fines += fine; addHeat(s, 15);
      report.events.push({ tone: 'bad', text: `🚔 Customs seized your ${C.name.toLowerCase()} — goods lost, fine ${fmt(fine)}` });
    } else {
      const v = Math.round(sh.cost * C.mult * rand(0.85, 1.15));
      S.dirty += v; S.stats.smuggled += v;
      report.events.push({ tone: 'good', text: `${C.icon} Your ${C.name.toLowerCase()} sold for ${fmt(v)} in dirty cash — launder it through your cash businesses` });
    }
  }
  S.shipments = S.shipments.filter(x => x.arrive > s.day);
  // laundering
  if (S.dirty > 0) {
    const amt = Math.min(S.dirty, launderCapacity(s));
    if (amt > 0) {
      S.dirty -= amt;
      const clean = Math.round(amt * (1 - LAUNDER_FEE));
      cash += clean; S.stats.laundered += clean;
      addHeat(s, Math.min(2, amt / Math.max(2e5, netWorth(s) * 0.02)));
      report.laundered = clean;
    }
  }
  // raids
  if (S.heat > 40 && !inJail(s)) {
    const p = Math.pow((S.heat - 40) / 60, 2) * 0.03 * (bribed(s) ? 0.5 : 1) * (mayor(s) ? 0.7 : 1);
    if (Math.random() < p) {
      const fine = nwFloor(s, 0.02, 100000);
      const lost = S.dirty;
      cash -= fine; S.dirty = 0; S.stats.raids++; S.stats.fines += fine;
      s.prestige = Math.max(0, (s.prestige || 0) - 8);
      S.cashPay = false;
      if (S.heat >= 85) {
        S.jailUntil = s.day + JAIL_DAYS;
        s.prestige = Math.max(0, (s.prestige || 0) - 20);
        report.events.push({ tone: 'bad', text: `👮 Police raid — and you're arrested! ${JAIL_DAYS} days in jail (your businesses get −15% customers without you), fine ${fmt(fine)}${lost ? `, ${fmt(lost)} dirty cash seized` : ''}, prestige −28` });
      } else {
        report.events.push({ tone: 'bad', text: `👮 Police raid on your offices: fine ${fmt(fine)}${lost ? `, ${fmt(lost)} dirty cash seized` : ''}, prestige −8. Off-the-books pay stopped.` });
      }
      S.heat = Math.max(0, S.heat - 25);
    }
  }
  if (S.jailUntil === s.day) report.events.push({ tone: 'good', text: '🔓 You are out of jail' });
  return cash;
}
export { CITIES, BT };
