// Endgame: factories, stock market + IPO, sports clubs, rich list.
import { CITIES, BT, STOCK } from './data.js';
import { bizById, parcelById, unitCost, dailySales, incomingStock, stockQuote, workersOf, fmt, businessValue } from './engine.js';
import { diff, PHASES } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(mean, sd) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const uid = s => `${(s.nextId++).toString(36)}`;
const econ = s => (s.economy ? s.economy.mult : 1);

export function initEmpire(s) {
  s.factories ||= [];
  s.market ||= newMarket();
  s.market.shorts ||= {};
  s.market.options ||= [];
  s.ipo ??= null;
  s.sports ||= newSports();
  ensureDiv2(s);
  s.richlist ||= newRichList();
  s.richlist.forEach(profile);
  s.prestige ??= 0;
}

// ======================================================================= FACTORIES
// Capacity is measured in retail-cost value of goods per day. Producing costs 45% of that value.
// Your own shops get goods at that price; anything left over is sold wholesale at 75%.
export const FACTORIES = {
  roastery: { name: 'Coffee Roastery', supplies: ['coffee'], value: 11500, build: 1.5e6, days: 25, op: 900 },
  bakeryplant: { name: 'Industrial Bakery', supplies: ['bakery'], value: 11500, build: 1.5e6, days: 25, op: 900 },
  textile: { name: 'Textile Factory', supplies: ['clothing'], value: 30800, build: 4e6, days: 30, op: 2450 },
  cosmeticslab: { name: 'Cosmetics Lab', supplies: ['cosmetics'], value: 23100, build: 3e6, days: 30, op: 1850 },
  furniturefactory: { name: 'Furniture Factory', supplies: ['furniture'], value: 30800, build: 4e6, days: 35, op: 2450 },
  foodplant: { name: 'Food Processing Plant', supplies: ['restaurant', 'supermarket'], value: 92300, build: 12e6, days: 40, op: 7400 },
  jewelryworks: { name: 'Jewelry Workshop', supplies: ['jewelry'], value: 46200, build: 6e6, days: 35, op: 3700 },
  carplant: { name: 'Car Plant', supplies: ['cars'], value: 615400, build: 80e6, days: 60, op: 49250 },
  supercar: { name: 'Supercar Atelier', supplies: ['luxcars'], value: 1153800, build: 150e6, days: 75, op: 92300 },
  // upstream suppliers: they sell everything wholesale and make the factories they feed 15% cheaper to run
  farm: { name: 'Agricultural Farm', supplies: [], feeds: ['roastery', 'bakeryplant', 'foodplant'], value: 46200, build: 6e6, days: 40, op: 3700 },
  chemplant: { name: 'Chemical Plant', supplies: [], feeds: ['cosmeticslab', 'textile', 'jewelryworks'], value: 76900, build: 10e6, days: 45, op: 6150 },
  steelmill: { name: 'Steel Mill', supplies: [], feeds: ['carplant', 'supercar', 'furniturefactory'], value: 307700, build: 40e6, days: 60, op: 24600 },
};
export const AUTOMATION = { costShare: 0.3, opMult: 0.7 }, SAFETY = { costShare: 0.1, accidentMult: 0.2 };
export const fedBy = (s, type) => s.factories.find(u => u.buildLeft <= 0 && (FACTORIES[u.type].feeds || []).includes(type));
export function factoryExtra(s, id, kind) {
  const f = s.factories.find(x => x.id === id);
  if (!f) return 'Not found';
  if (f[kind]) return 'Already installed';
  const cost = Math.round(FACTORIES[f.type].build * (kind === 'automation' ? AUTOMATION.costShare : SAFETY.costShare) * diff(s).cost);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost; f.invested += cost; f[kind] = s.day;
  return null;
}
// ---------- factory workers ----------
export const FACTORY_WAGE = 95, HIRE_FEE = 60, TRAIN_FEE = 150, FACTORY_TRAIN_COOLDOWN = 30, FACTORY_QUIT = 0.002;
export const crewNeed = (f) => Math.max(4, Math.round(FACTORIES[f.type].value / 1500)) * f.level * (f.automation ? 0.6 : 1) | 0;
export const crewWage = (s, f) => Math.round(FACTORY_WAGE * (0.6 + 0.9 * (f.crew.skill / 100)) * CITIES[f.city].wage * (s.shady && s.shady.cashPay ? 0.85 : 1));
export const crewFactor = f => { const need = crewNeed(f); return need ? Math.min(1, f.crew.n / need) * (0.75 + 0.5 * f.crew.skill / 100) : 1; };
export const hireFee = (s, f, n) => Math.round(n * HIRE_FEE * CITIES[f.city].wage * diff(s).cost);
export function ensureCrew(s, f, full) {
  if (f.crew) return;
  f.crew = full ? { n: crewNeed(f), skill: 55, auto: true, trained: 0 } : { n: 0, skill: 50, auto: true, trained: 0 };
}
export function hireCrew(s, id, n) {
  const f = s.factories.find(x => x.id === id);
  if (!f) return 'Not found';
  ensureCrew(s, f);
  if (n === 'fill') n = Math.max(0, crewNeed(f) - f.crew.n);
  if (n <= 0) return 'The factory is fully staffed';
  const fee = hireFee(s, f, n);
  if (s.cash < fee) return `Hiring ${n} costs ${fmt(fee)}`;
  s.cash -= fee;
  const newSkill = clamp(48 + (s.legacy && !s.legacyOff ? 6 * (s.legacy.talent || 0) : 0), 20, 90);
  f.crew.skill = Math.round((f.crew.skill * f.crew.n + newSkill * n) / (f.crew.n + n));
  f.crew.n += n;
  return null;
}
export function fireCrew(s, id, n) {
  const f = s.factories.find(x => x.id === id);
  if (!f || !f.crew) return 'Not found';
  f.crew.n = Math.max(0, f.crew.n - n);
  return null;
}
export const trainCrewCost = (s, f) => Math.round(f.crew.n * TRAIN_FEE * CITIES[f.city].wage * diff(s).cost);
export function trainCrew(s, id) {
  const f = s.factories.find(x => x.id === id);
  if (!f || !f.crew || !f.crew.n) return 'No workers to train';
  if (f.crew.trained && s.day - f.crew.trained < FACTORY_TRAIN_COOLDOWN) return `Next course on day ${f.crew.trained + FACTORY_TRAIN_COOLDOWN}`;
  if (f.crew.skill >= 95) return 'Your workers are already top-notch';
  const cost = trainCrewCost(s, f);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  f.crew.skill = Math.min(95, f.crew.skill + 8);
  f.crew.trained = s.day;
  return null;
}
export const extraCost = (s, f, kind) => Math.round(FACTORIES[f.type].build * (kind === 'automation' ? AUTOMATION.costShare : SAFETY.costShare) * diff(s).cost);
export const PROD_COST = 0.45, WHOLESALE = 0.75, MAX_LEVEL = 5, OTHER_CITY = 1.08, UPGRADE_DAYS = 12;

export function constructionBonus(s) {
  const builders = s.businesses.filter(b => b.type === 'construction').reduce((a, b) => a + workersOf(s, b.id, 'floor').length, 0);
  return builders >= 5;
}
export function buildQuote(s, type) {
  const F = FACTORIES[type];
  const bonus = constructionBonus(s);
  return { cost: Math.round(F.build * (bonus ? 0.8 : 1) * diff(s).cost), days: Math.ceil(F.days * (bonus ? 0.6 : 1)), bonus };
}
export function buildFactory(s, type, city) {
  const F = FACTORIES[type];
  if (!F || !CITIES[city]) return 'Pick a factory and a city';
  const q = buildQuote(s, type);
  if (s.cash < q.cost) return `You need ${fmt(q.cost)}`;
  s.cash -= q.cost;
  s.factories.push({ id: uid(s), type, city, level: 1, buildLeft: q.days, upgrading: 0, invested: q.cost, last: null, history: [], crew: { n: 0, skill: 50, auto: false, trained: 0 } });
  return null;
}
export const upgradeCost = (s, f) => Math.round(FACTORIES[f.type].build * 0.5 * f.level * diff(s).cost);
export function upgradeFactory(s, id) {
  const f = s.factories.find(x => x.id === id);
  if (!f) return 'Not found';
  if (f.buildLeft > 0) return 'Still under construction';
  if (f.upgrading > 0) return 'Already upgrading';
  if (f.level >= MAX_LEVEL) return 'Already at max level';
  const cost = upgradeCost(s, f);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  f.invested += cost;
  f.upgrading = UPGRADE_DAYS;
  return null;
}
export const factoryValue = f => Math.round(f.invested * 0.5);
export function sellFactory(s, id) {
  const f = s.factories.find(x => x.id === id);
  if (!f) return 'Not found';
  s.cash += factoryValue(f);
  s.factories = s.factories.filter(x => x !== f);
  return null;
}
export const factoryFor = (s, type) => s.factories.find(f => f.buildLeft <= 0 && FACTORIES[f.type].supplies.includes(type));

function factoryDay(s, report) {
  const out = { cash: 0, net: 0, list: [] };
  for (const f of s.factories) {
    const F = FACTORIES[f.type];
    ensureCrew(s, f, true); // factories from before workers existed come fully staffed
    if (f.buildLeft > 0) {
      f.buildLeft--;
      if (f.buildLeft === 0) report.events.push({ tone: 'good', text: `🏭 Your ${F.name} in ${CITIES[f.city].name} is built — hire ${crewNeed(f)} workers to start production (Empire → Factories)` });
      continue;
    }
    // staff turnover, replaced automatically if auto-hire is on
    const C = f.crew;
    let quits = 0;
    for (let i = 0; i < Math.min(C.n, 60); i++) if (Math.random() < FACTORY_QUIT * Math.max(1, C.n / 60)) quits++;
    quits = Math.min(quits, C.n);
    C.n -= quits;
    let crewCost = 0;
    if (C.auto && C.n < crewNeed(f)) {
      const n = crewNeed(f) - C.n;
      const fee = hireFee(s, f, n);
      if (s.cash - fee > 0) { crewCost += fee; C.skill = Math.round((C.skill * C.n + 48 * n) / (C.n + n)); C.n += n; }
    }
    crewCost += C.n * crewWage(s, f);
    if (f.upgrading > 0) {
      f.upgrading--;
      if (f.upgrading === 0) { f.level++; report.events.push({ tone: 'good', text: `🏭 ${F.name} upgraded to level ${f.level}` }); }
    }
    const opCost = Math.round(F.op * 0.5 * f.level * diff(s).cost * (f.automation ? AUTOMATION.opMult : 1)) + crewCost; // half of the old running cost is now the crew's wages
    if (f.down > 0) { // closed after an accident: no output, half the running costs
      f.down--;
      const half = Math.round(opCost / 2);
      f.last = { capacity: 0, shipped: 0, internal: 0, wholesale: 0, prod: 0, op: half, net: -half, down: f.down + 1 };
      out.cash -= half; out.net -= half; out.list.push({ id: f.id, name: F.name, net: -half });
      continue;
    }
    if (Math.random() < 0.0025 * (f.safety ? SAFETY.accidentMult : 1)) {
      f.down = randi(3, 10);
      const dmg = Math.round(F.build * 0.02 * diff(s).cost);
      out.cash -= dmg; out.net -= dmg;
      report.events.push({ tone: 'bad', text: `🚨 Accident at your ${F.name}! Closed for ${f.down} days, repairs ${fmt(dmg)}${f.safety ? '' : ' — safety systems would have prevented most of this'}` });
      continue;
    }
    let budget = Math.round(F.value * f.level * crewFactor(f));
    const capacity = budget;
    const costShare = PROD_COST * (fedBy(s, f.type) ? 0.85 : 1);
    const prod = Math.round(capacity * costShare);
    const op = opCost;
    let internal = 0, shippedValue = 0;
    for (const b of s.businesses) {
      if (!F.supplies.includes(b.type) || b.factorySupply === false) continue;
      const main = parcelById(s, b.mainId);
      if (!main || !STOCK[b.type]) continue;
      const unit = unitCost(s, b);
      const target = Math.ceil(dailySales(s, b) * 7);
      const need = target - Math.floor(b.stock || 0) - incomingStock(b);
      const qty = Math.min(need, stockQuote(s, b, 0).room, Math.floor(budget / unit));
      if (qty < 1) continue;
      const value = qty * unit;
      budget -= value;
      shippedValue += value;
      const paid = Math.round(value * costShare * (main.city === f.city ? 1 : OTHER_CITY));
      b.incoming ||= [];
      b.incoming.push({ qty, arrive: s.day + 1, paid, label: F.name });
      internal += paid;
    }
    const wholesale = Math.round(budget * WHOLESALE * econ(s));
    const net = internal + wholesale - prod - op;
    f.last = { capacity, shipped: Math.round(shippedValue), internal, wholesale, prod, op, net, crew: crewCost };
    f.history.push(net);
    if (f.history.length > 30) f.history.shift();
    out.cash += wholesale - prod - op; // internal transfers are paid by your own shops (already in their stock cost)
    out.net += net;
    out.list.push({ id: f.id, name: F.name, net });
  }
  return out;
}

// ======================================================================= STOCK MARKET
const COMPANIES = [
  ['VLTX', 'Voltex Energy', 'Energy', 48, 0.018, 0.04], ['NIMB', 'Nimbus Cloud', 'Tech', 210, 0.028, 0.0],
  ['GRVY', 'Gravy Foods', 'Consumer', 36, 0.012, 0.035], ['ORBT', 'Orbital Air', 'Travel', 22, 0.03, 0.0],
  ['MDLN', 'Medline Health', 'Health', 95, 0.014, 0.02], ['BRCK', 'Brickhaus Homes', 'Real estate', 64, 0.02, 0.045],
  ['PXLS', 'Pixelstorm Games', 'Tech', 120, 0.034, 0.0], ['STLR', 'Stellar Motors', 'Auto', 155, 0.026, 0.01],
  ['CRST', 'Crestbank', 'Finance', 58, 0.016, 0.05], ['LUXE', 'Maison Luxe', 'Luxury', 340, 0.02, 0.015],
  ['FRSH', 'FreshCart', 'Retail', 27, 0.015, 0.03], ['QNTM', 'Quantum Labs', 'Tech', 18, 0.045, 0.0],
];
export const TRADE_FEE = 0.002;
function newMarket() {
  const stocks = {};
  for (const [t, name, sector, p, vol, div] of COMPANIES) stocks[t] = { t, name, sector, price: p, vol, div, open: p, hist: [p] };
  return { stocks, holdings: {}, realized: 0, shorts: {}, options: [] };
}
// ---------- short selling ----------
export const SHORT_MARGIN = 0.5, BORROW_FEE = 0.0003;
export function shortValue(s) {
  let v = 0;
  for (const [t, sh] of Object.entries(s.market.shorts || {})) v += sh.qty * (sh.entry - s.market.stocks[t].price);
  return v;
}
export function openShort(s, t, qty) {
  const st = s.market.stocks[t];
  if (!st || qty <= 0) return 'Nothing to short';
  const need = (qty * st.price) * SHORT_MARGIN;
  if (s.cash < need) return `Short selling needs ${fmt(need)} in cash as margin`;
  s.market.shorts ||= {};
  const sh = s.market.shorts[t] || { qty: 0, entry: 0 };
  sh.entry = (sh.entry * sh.qty + st.price * qty) / (sh.qty + qty);
  sh.qty += qty;
  s.market.shorts[t] = sh;
  markTipTrade(s, t, qty * st.price);
  s.cash -= qty * st.price * TRADE_FEE;
  return null;
}
export function coverShort(s, t) {
  const sh = s.market.shorts && s.market.shorts[t];
  if (!sh) return 'No short position';
  const st = s.market.stocks[t];
  const pnl = sh.qty * (sh.entry - st.price) - sh.qty * st.price * TRADE_FEE;
  s.cash += pnl;
  s.market.realized += pnl;
  s.tax.periodIncome += pnl;
  delete s.market.shorts[t];
  return null;
}
// ---------- options (30 days, 100 shares per contract) ----------
export const OPTION_DAYS = 30;
export function optionPremium(st, type, strike) {
  const intrinsic = Math.max(0, type === 'call' ? st.price - strike : strike - st.price);
  return Math.max(0.01, intrinsic + st.price * 0.4 * st.vol * Math.sqrt(OPTION_DAYS));
}
export function buyOption(s, t, type, strikeMult, contracts) {
  const st = s.market.stocks[t];
  if (!st || contracts <= 0) return 'Nothing to buy';
  const strike = Math.round(st.price * strikeMult * 100) / 100;
  const cost = Math.round(optionPremium(st, type, strike) * 100 * contracts);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  markTipTrade(s, t, cost * 5);
  s.market.options ||= [];
  s.market.options.push({ id: uid(s), t, type, strike, contracts, cost, expiry: s.day + OPTION_DAYS });
  return null;
}
export function optionValue(s, o) {
  const st = s.market.stocks[o.t];
  return Math.max(0, o.type === 'call' ? st.price - o.strike : o.strike - st.price) * 100 * o.contracts;
}
// insider trading: buying or selling a stock you got a tip on can get you investigated later
export function markTipTrade(s, t, value = 0) {
  const tip = s.market.tip;
  if (tip && tip.t === t && s.day <= tip.until + 5) { tip.traded = true; tip.stake = (tip.stake || 0) + Math.abs(value) * 0.15; }
}
export function portfolioValue(s) {
  let v = 0;
  for (const [t, h] of Object.entries(s.market.holdings)) v += h.qty * s.market.stocks[t].price;
  for (const o of s.market.options || []) v += optionValue(s, o);
  return v + shortValue(s);
}
function marketDay(s, report) {
  const e = s.economy;
  const sectorShock = {};
  let dividends = 0;
  for (const st of Object.values(s.market.stocks)) {
    sectorShock[st.sector] ??= gauss(0, 0.006);
    const drift = 0.0003 + (e.mult - 1) * 0.004 + (e.target - e.mult) * 0.01;
    let r = gauss(drift, st.vol) + sectorShock[st.sector];
    const tip = s.market.tip;
    if (tip && tip.t === st.t && tip.real && s.day <= tip.until) r += tip.dir * 0.06;
    if (Math.random() < 0.015) {
      const move = rand(0.08, 0.22) * (Math.random() < 0.5 ? -1 : 1);
      r += move;
      if (s.market.holdings[st.t]) report.events.push({ tone: move > 0 ? 'good' : 'bad', text: `${move > 0 ? '🚀' : '💥'} ${st.name} (${st.t}) ${move > 0 ? 'jumped' : 'fell'} ${Math.round(Math.abs(move) * 100)}% on ${move > 0 ? 'strong results' : 'bad news'}` });
    }
    st.open = st.price;
    st.price = Math.max(0.5, Math.round(st.price * (1 + r) * 100) / 100);
    st.hist.push(st.price);
    if (st.hist.length > 120) st.hist.shift();
    if (s.day % 90 === 0 && s.market.holdings[st.t]) dividends += s.market.holdings[st.t].qty * st.price * st.div / 4;
  }
  // shorts: daily borrowing fee and margin calls
  let fees = 0;
  for (const [t, sh] of Object.entries(s.market.shorts || {})) {
    const st = s.market.stocks[t];
    fees += sh.qty * st.price * BORROW_FEE;
    if (sh.qty * (st.price - sh.entry) > sh.qty * sh.entry * 0.5) { coverShort(s, t); report.events.push({ tone: 'bad', text: `📉 Margin call: your ${t} short was closed at a big loss` }); }
  }
  // options expire
  for (const o of (s.market.options || []).filter(x => x.expiry <= s.day)) {
    const pay = optionValue(s, o);
    s.cash += pay;
    s.market.realized += pay - o.cost;
    s.tax.periodIncome += pay - o.cost;
    report.events.push({ tone: pay > o.cost ? 'good' : 'bad', text: `📜 ${o.contracts} ${o.t} ${o.type} option${o.contracts > 1 ? 's' : ''} expired: ${pay ? `paid ${fmt(pay)}` : 'worthless'} (cost ${fmt(o.cost)})` });
  }
  s.market.options = (s.market.options || []).filter(x => x.expiry > s.day);
  // insider-trading investigation
  const tip = s.market.tip;
  if (tip && s.day === tip.until + 20) {
    if (tip.traded && Math.random() < 0.25) {
      const fine = Math.round(Math.max(1e5, tip.stake || 0) * 2);
      s.cash -= fine; s.prestige = Math.max(0, (s.prestige || 0) - 10);
      report.events.push({ tone: 'bad', text: `🕵️ Insider-trading investigation: fined ${fmt(fine)}, prestige −10` });
    }
    s.market.tip = null;
  }
  return Math.round(dividends - fees);
}
export function tradeStock(s, t, qty) {
  const st = s.market.stocks[t];
  if (!st || !qty) return 'Nothing to trade';
  const h = s.market.holdings[t] || { qty: 0, cost: 0 };
  markTipTrade(s, t, qty * st.price);
  if (qty > 0) {
    const cost = qty * st.price * (1 + TRADE_FEE);
    if (s.cash < cost) return `You need ${fmt(cost)}`;
    s.cash -= cost;
    h.cost += cost; h.qty += qty;
    s.market.holdings[t] = h;
  } else {
    const n = Math.min(-qty, h.qty);
    if (!n) return 'You don\'t own any';
    const proceeds = n * st.price * (1 - TRADE_FEE);
    const basis = h.cost * n / h.qty;
    s.cash += proceeds;
    const gain = proceeds - basis;
    s.market.realized += gain;
    s.tax.periodIncome += gain; // capital gains are taxed with your income
    h.qty -= n; h.cost -= basis;
    if (h.qty <= 0) delete s.market.holdings[t];
  }
  return null;
}

// ---------- your own company on the stock exchange ----------
export const IPO_MIN_NET = 25e6;
export const IPO_SHARES = 100e6;
export function companyValuation(s, nw) {
  return Math.max(0, nw) * 1.3 * econ(s) * (s.ipo ? 0.7 + s.ipo.confidence / 170 : 1);
}
export function ipoQuote(s, pct, nw) {
  return { proceeds: Math.round(companyValuation(s, nw) * pct * 0.95), pct };
}
export function goPublic(s, pct, nw) {
  if (s.ipo) return 'Already public';
  if (nw < IPO_MIN_NET) return `You need a net worth of ${fmt(IPO_MIN_NET)}`;
  pct = clamp(pct, 0.1, 0.49);
  const q = ipoQuote(s, pct, nw);
  s.cash += q.proceeds;
  s.ipo = { pct, confidence: 70, since: s.day, nextReview: s.day + 90, base: nw + q.proceeds, raised: q.proceeds, history: [] };
  return null;
}
export const sharePrice = (s, nw) => companyValuation(s, nw) / IPO_SHARES;
export function buybackQuote(s, pct, nw) {
  return Math.round(companyValuation(s, nw) * pct * 1.05);
}
export function buyBack(s, pct, nw) {
  if (!s.ipo) return 'Not public';
  pct = Math.min(pct, s.ipo.pct);
  const cost = buybackQuote(s, pct, nw);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  s.ipo.pct = Math.round((s.ipo.pct - pct) * 1000) / 1000;
  if (s.ipo.pct <= 0.001) s.ipo = null;
  return null;
}
function ipoDay(s, report, operatingProfit, nw) {
  if (!s.ipo) return 0;
  const div = Math.round(Math.max(0, operatingProfit) * s.ipo.pct);
  if (s.day >= s.ipo.nextReview) {
    const growth = nw / Math.max(1, s.ipo.base) - 1;
    const target = diff(s).ipoTarget;
    const delta = clamp((growth - target) * 220, -30, 20);
    s.ipo.confidence = clamp(s.ipo.confidence + delta, 0, 100);
    s.ipo.history.unshift({ day: s.day, growth, target, confidence: s.ipo.confidence });
    s.ipo.base = nw;
    s.ipo.nextReview = s.day + 90;
    report.events.push({ tone: growth >= target ? 'good' : 'bad', text: `📊 Shareholder review: net worth ${growth >= 0 ? '+' : ''}${Math.round(growth * 100)}% this quarter (target +${Math.round(target * 100)}%). Board confidence ${Math.round(s.ipo.confidence)}/100` });
    if (diff(s).ousting && s.ipo.confidence <= 0) {
      s.gameOver = true; s.gameOverReason = 'ousted';
      report.gameOver = true;
      report.events.push({ tone: 'bad', text: '🚪 The board voted you out as CEO' });
    } else if (diff(s).ousting && s.ipo.confidence < 25) {
      report.events.push({ tone: 'bad', text: '⚠️ The board is losing patience — miss the next target and they may vote you out' });
    }
  }
  return div;
}

// ======================================================================= SPORTS (football)
const CLUB_NAMES = {
  warsaw: ['Wola Wolves', 'Praga Pirates', 'Mokotów Mavericks', 'Vistula Kings', 'Ursynów United', 'Żoliborz Rangers', 'Bemowo Eagles', 'Bielany Blaze', 'Ochota Athletic', 'Wawer Wanderers'],
  london: ['Thames Rovers', 'Camden Comets', 'Brixton Bulldogs', 'Hackney Hawks', 'Greenwich Mariners', 'Islington Lions', 'Peckham Phoenix', 'Fulham Foxes', 'Croydon Crusaders', 'Barking Bees'],
  nyc: ['Brooklyn Bridges', 'Queens Comets', 'Harlem Hustle', 'Bronx Bombers FC', 'Staten Islanders', 'Manhattan Metros', 'Hudson Hammers', 'Astoria Aces', 'Flushing Flyers', 'SoHo Sharks'],
};
const CLUB_NAMES2 = {
  warsaw: ['Targówek Titans', 'Wilanów Warriors', 'Rembertów Rovers', 'Wesoła Wizards', 'Włochy Wings', 'Ursus United', 'Białołęka Bears', 'Sadyba Stars', 'Natolin Knights', 'Gocław Gulls'],
  london: ['Walthamstow Wolves', 'Stratford Stallions', 'Wimbledon Wasps', 'Richmond Ravens', 'Kingston Kestrels', 'Enfield Elks', 'Harrow Hares', 'Bromley Badgers', 'Ealing Eagles', 'Lewisham Lynx'],
  nyc: ['Yonkers Yetis', 'Newark Knights', 'Bayside Buccaneers', 'Rockaway Riptide', 'Tribeca Titans', 'Inwood Owls', 'Red Hook Reds', 'Jamaica Jaguars', 'Riverdale Rams', 'Bushwick Bandits'],
};
export const LEAGUE_NAMES = { warsaw: 'Warsaw City League', london: 'London Football League', nyc: 'New York Soccer League' };
export const LEAGUE2 = ' — Division 2';
export const STADIUM_CAPS = [15000, 25000, 40000, 60000, 80000];
export const ROUNDS = 18;
export const PRIZES = [30e6, 18e6, 12e6, 8e6, 6e6, 4.5e6, 3.5e6, 2.5e6, 1.8e6, 1.2e6];
export const DIV2_PRIZE = 0.25;
export const FORMATIONS = {
  balanced: { label: '4-4-2 Balanced', for: 1, against: 1 },
  attack: { label: '4-3-3 Attack', for: 1.25, against: 1.2 },
  defense: { label: '5-3-2 Defend', for: 0.8, against: 0.75 },
};
export const ACADEMY_MAX = 3;
const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'MF', 'DF', 'FW', 'GK', 'MF', 'DF', 'FW', 'MF'];
const FIRST = ['Leo', 'Mateo', 'Jan', 'Kai', 'Noah', 'Luca', 'Theo', 'Omar', 'Kuba', 'Diego', 'Malik', 'Finn', 'Arlo', 'Ivan', 'Rafa', 'Yusuf', 'Bruno', 'Elias', 'Tomás', 'Sam'];
const LAST = ['Silva', 'Nowak', 'Okafor', 'Müller', 'Rossi', 'Kowalski', 'Mensah', 'Hughes', 'García', 'Santos', 'Novak', 'Diallo', 'Berg', 'Costa', 'Wiśniewski', 'Reyes', 'Kane', 'Moreau', 'Jensen', 'Ali'];

const mkTeams = (city, names, lo, hi, tag) => names.map((name, i) => ({ id: `${city}-${tag}${i}`, name, rating: Math.round(rand(lo, hi)), pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
function newLeague(city, names, lo, hi, tag) {
  const lg = { season: 1, round: 0, fixtures: [], teams: mkTeams(city, names, lo, hi, tag) };
  lg.fixtures = makeFixtures(lg.teams.map(t => t.id));
  return lg;
}
function newSports() {
  const leagues = {}, leagues2 = {};
  for (const city of Object.keys(CLUB_NAMES)) {
    leagues[city] = newLeague(city, CLUB_NAMES[city], 42, 80, '');
    leagues2[city] = newLeague(city, CLUB_NAMES2[city], 32, 58, 'd2-');
  }
  return { leagues, leagues2, club: null, transfers: [], transfersDay: 0, results: [] };
}
function ensureDiv2(s) {
  s.sports.leagues2 ||= {};
  for (const city of Object.keys(CLUB_NAMES)) {
    if (s.sports.leagues2[city]) continue;
    const lg = newLeague(city, CLUB_NAMES2[city], 32, 58, 'd2-');
    lg.round = s.sports.leagues[city].round; lg.season = s.sports.leagues[city].season;
    s.sports.leagues2[city] = lg;
  }
  const c = s.sports.club;
  if (c) { c.formation ||= 'balanced'; c.academy ??= 0; }
}
function makeFixtures(ids) {
  // circle method round robin, then reversed for the second half
  const n = ids.length, arr = ids.slice(), rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push(r % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds.concat(rounds.map(p => p.map(([a, b]) => [b, a])));
}
export function leagueOf(s, city, teamId) {
  if (s.sports.leagues[city].teams.some(t => t.id === teamId)) return { lg: s.sports.leagues[city], div: 1 };
  if (s.sports.leagues2 && s.sports.leagues2[city] && s.sports.leagues2[city].teams.some(t => t.id === teamId)) return { lg: s.sports.leagues2[city], div: 2 };
  return { lg: s.sports.leagues[city], div: 1 };
}
const playerWage = (rating, city) => Math.round(300 * Math.pow(rating / 50, 4) * CITIES[city].wage);
const playerValue = (rating, age, city) => Math.round(playerWage(rating, city) * 450 * (age < 24 ? 1.4 : age > 30 ? 0.6 : 1) / 1000) * 1000;
function makePlayer(s, rating, city, pos, age) {
  age ??= randi(18, 34);
  return { id: uid(s), name: `${pick(FIRST)} ${pick(LAST)}`, pos: pos || pick(['GK', 'DF', 'MF', 'FW']), rating: Math.round(clamp(rating, 30, 95)), age, wage: 0, value: 0, city };
}
function priced(p) { p.wage = playerWage(p.rating, p.city); p.value = playerValue(p.rating, p.age, p.city); return p; }
export function clubPrice(s, team, city) { return Math.round(15e6 * Math.pow(team.rating / 50, 4) * CITIES[city].cost / 1e5) * 1e5; }
export const fit = (s, p) => !(p.injured > s.day);
export function bestEleven(s, club) { return club.players.filter(p => fit(s, p)).sort((a, b) => b.rating - a.rating).slice(0, 11); }
export function clubRating(club, s) {
  const best = s ? bestEleven(s, club) : club.players.slice().sort((a, b) => b.rating - a.rating).slice(0, 11);
  return best.length ? (best.reduce((a, p) => a + p.rating, 0) + 30 * (11 - best.length)) / 11 : 30;
}
export function buyClub(s, city, teamId) {
  if (s.sports.club) return 'You already own a club — sell it first';
  const { lg, div } = leagueOf(s, city, teamId);
  const team = lg && lg.teams.find(t => t.id === teamId);
  if (!team) return 'Club not found';
  const price = clubPrice(s, team, city);
  if (s.cash < price) return `You need ${fmt(price)}`;
  s.cash -= price;
  const players = POS.map(pos => priced(makePlayer(s, gauss(team.rating, 6), city, pos)));
  s.sports.club = { teamId, city, name: team.name, players, stadium: 0, ticket: 1, bought: s.day, price, last: null, formation: 'balanced', academy: 0 };
  team.rating = Math.round(clubRating(s.sports.club, s));
  refreshTransfers(s, true);
  void div;
  return null;
}
export const clubValue = s => s.sports.club ? Math.round(s.sports.club.price * 0.6 + s.sports.club.players.reduce((a, p) => a + p.value, 0) * 0.5) : 0;
export function sellClub(s) {
  if (!s.sports.club) return 'No club';
  s.cash += clubValue(s);
  s.sports.club = null;
  return null;
}
function refreshTransfers(s, force) {
  const c = s.sports.club;
  if (!c || (!force && s.day - s.sports.transfersDay < 7)) return;
  const team = leagueOf(s, c.city, c.teamId).lg.teams.find(t => t.id === c.teamId);
  s.sports.transfers = Array.from({ length: 12 }, () => priced(makePlayer(s, gauss(team.rating + 4, 10), c.city))).sort((a, b) => b.rating - a.rating);
  s.sports.transfersDay = s.day;
}
export function signPlayer(s, id) {
  const c = s.sports.club;
  if (!c) return 'Buy a club first';
  if (c.players.length >= 25) return 'Squad is full (25)';
  const p = s.sports.transfers.find(x => x.id === id);
  if (!p) return 'Player gone';
  if (s.cash < p.value) return `Transfer fee: ${fmt(p.value)}`;
  s.cash -= p.value;
  c.players.push(p);
  s.sports.transfers = s.sports.transfers.filter(x => x !== p);
  return null;
}
export function sellPlayer(s, id) {
  const c = s.sports.club;
  const p = c && c.players.find(x => x.id === id);
  if (!p) return 'Not found';
  if (c.players.length <= 11) return 'You need at least 11 players';
  s.cash += Math.round(p.value * 0.8);
  c.players = c.players.filter(x => x !== p);
  return null;
}
export const stadiumUpgradeCost = c => Math.round(20e6 * (c.stadium + 1) * CITIES[c.city].cost);
export function upgradeStadium(s) {
  const c = s.sports.club;
  if (!c) return 'No club';
  if (c.stadium >= STADIUM_CAPS.length - 1) return 'Stadium is already the biggest';
  const cost = stadiumUpgradeCost(c);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  c.stadium++;
  return null;
}
export const academyCost = c => Math.round(10e6 * ((c.academy || 0) + 1) * CITIES[c.city].cost);
export function upgradeAcademy(s) {
  const c = s.sports.club;
  if (!c) return 'No club';
  if ((c.academy || 0) >= ACADEMY_MAX) return 'Academy is already top level';
  const cost = academyCost(c);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  c.academy = (c.academy || 0) + 1;
  return null;
}
export function setFormation(s, f) { if (s.sports.club && FORMATIONS[f]) s.sports.club.formation = f; }
export function setTicket(s, v) { if (s.sports.club) s.sports.club.ticket = clamp(v, 0.5, 2.5); }
function poisson(l) { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= Math.random(); } while (p > L); return k - 1; }

function playRound(s, cityId, lg, report, out) {
  const c = s.sports.club;
  const pairs = lg.fixtures[lg.round] || [];
  for (const [h, a] of pairs) {
    const H = lg.teams.find(t => t.id === h), A = lg.teams.find(t => t.id === a);
    const d = (H.rating + 4 - A.rating) / 12;
    let lh = 1.3 * Math.exp(d * 0.4), la = 1.1 * Math.exp(-d * 0.4);
    const mine = c && c.city === cityId && (h === c.teamId || a === c.teamId);
    if (mine) {
      const F = FORMATIONS[c.formation] || FORMATIONS.balanced;
      if (h === c.teamId) { lh *= F.for; la *= F.against; } else { la *= F.for; lh *= F.against; }
    }
    const gh = poisson(lh), ga = poisson(la);
    H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
    if (gh > ga) { H.w++; H.pts += 3; A.l++; } else if (gh < ga) { A.w++; A.pts += 3; H.l++; } else { H.d++; A.d++; H.pts++; A.pts++; }
    if (!mine) continue;
    const home = h === c.teamId;
    const my = home ? gh : ga, their = home ? ga : gh;
    const opp = home ? A : H;
    const res = my > their ? 'W' : my < their ? 'L' : 'D';
    let tickets = 0;
    if (home) {
      const pos = standings(lg).findIndex(t => t.id === c.teamId);
      const arena = s.billion && s.billion.projects.some(p => p.type === 'arena' && p.done) ? 0.25 : 0;
      const div2 = leagueOf(s, c.city, c.teamId).div === 2 ? 0.6 : 1;
      const draw = clamp(0.45 + arena + (10 - pos) * 0.04 + (H.rating - 55) / 100 - (c.ticket - 1) * 0.35, 0.15, 1) * div2;
      tickets = Math.round(STADIUM_CAPS[c.stadium] * draw * 30 * c.ticket * CITIES[cityId].spend * econ(s));
      out.net += tickets;
      c.last.tickets = tickets;
    }
    // injuries
    const hurt = [];
    for (const p of bestEleven(s, c)) if (Math.random() < 0.03) { p.injured = s.day + randi(7, 28); hurt.push(p.name); }
    s.sports.results.unshift({ day: s.day, home, opp: opp.name, my, their, res, tickets });
    s.sports.results.length = Math.min(s.sports.results.length, 20);
    report.events.push({ tone: res === 'W' ? 'good' : res === 'L' ? 'bad' : 'info', text: `⚽ ${c.name} ${my}–${their} ${opp.name} (${home ? 'home' : 'away'})${tickets ? ` · tickets ${fmt(tickets)}` : ''}${hurt.length ? ` · injured: ${hurt.join(', ')}` : ''}` });
  }
  lg.round++;
}

function sportsDay(s, report) {
  ensureDiv2(s);
  const out = { cash: 0, net: 0 };
  const c = s.sports.club;
  if (c) {
    const city = CITIES[c.city];
    const team = leagueOf(s, c.city, c.teamId).lg.teams.find(t => t.id === c.teamId);
    team.rating = Math.round(clubRating(c, s));
    const wages = c.players.reduce((a, p) => a + p.wage, 0);
    const div2 = leagueOf(s, c.city, c.teamId).div === 2 ? 0.5 : 1;
    const sponsor = Math.round(2000 * Math.pow(team.rating / 50, 3) * city.spend * econ(s) * div2);
    out.net += sponsor - wages;
    c.last = { wages, sponsor, tickets: 0 };
    refreshTransfers(s);
  }
  // matchday every Saturday, both divisions
  if (s.day % 7 === 6) {
    for (const cityId of Object.keys(s.sports.leagues)) {
      const lg1 = s.sports.leagues[cityId], lg2 = s.sports.leagues2[cityId];
      playRound(s, cityId, lg1, report, out);
      playRound(s, cityId, lg2, report, out);
      if (lg1.round >= ROUNDS) out.net += seasonEnd(s, cityId, report);
    }
  }
  out.cash = out.net;
  return out;
}
export const standings = lg => lg.teams.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
const ord = n => n + (['st', 'nd', 'rd'][n - 1] || 'th');
function seasonEnd(s, cityId, report) {
  const lg1 = s.sports.leagues[cityId], lg2 = s.sports.leagues2[cityId];
  const t1 = standings(lg1), t2 = standings(lg2);
  const c = s.sports.club;
  let prize = 0;
  if (c && c.city === cityId) {
    const { div } = leagueOf(s, cityId, c.teamId);
    const table = div === 1 ? t1 : t2;
    const pos = table.findIndex(t => t.id === c.teamId);
    prize = Math.round(PRIZES[pos] * CITIES[cityId].spend * (div === 2 ? DIV2_PRIZE : 1));
    const repBoost = div === 1 ? (pos === 0 ? 8 : pos < 3 ? 3 : 0) : 0;
    if (repBoost) for (const b of s.businesses) { const m = parcelById(s, b.mainId); if (m && m.city === cityId) b.rep = clamp(b.rep + repBoost, 0, 100); }
    if (div === 1 && pos === 0) { s.prestige += 10; s.sports.titles = (s.sports.titles || 0) + 1; }
    const fate = div === 1 && pos >= 8 ? ' — relegated to Division 2 😬' : div === 2 && pos <= 1 ? ' — promoted to Division 1! 🎉' : '';
    report.events.push({ tone: pos < 3 ? 'good' : 'info', text: `🏆 Season ${lg1.season} over: ${c.name} finished ${ord(pos + 1)}${div === 2 ? ' in Division 2' : ''} — prize ${fmt(prize)}${repBoost ? `, your ${CITIES[cityId].name} businesses gain reputation +${repBoost}` : ''}${fate}` });
    // ageing, development and the academy
    for (const p of c.players) { p.age++; p.rating = clamp(p.rating + (p.age < 25 ? randi(0, 4) + (p.academy ? 2 : 0) : p.age > 30 ? -randi(0, 4) : randi(-1, 2)), 30, 95); priced(p); }
    const team = table.find(t => t.id === c.teamId);
    for (let i = 0; i < (c.academy || 0) && c.players.length < 25; i++) {
      const kid = priced(makePlayer(s, gauss(team.rating - 12 + c.academy * 4, 5), c.city, null, randi(16, 18)));
      kid.academy = true;
      c.players.push(kid);
      report.events.push({ tone: 'good', text: `🌱 Academy graduate ${kid.name} (${kid.pos}, rating ${kid.rating}, age ${kid.age}) joined the first team` });
    }
    // unhappy benched players lose form
    const best = new Set(bestEleven(s, c).map(p => p.id));
    const benched = c.players.filter(p => !best.has(p.id) && p.rating >= team.rating);
    for (const p of benched.slice(0, 2)) { p.rating = clamp(p.rating - 3, 30, 95); priced(p); report.events.push({ tone: 'bad', text: `😤 ${p.name} is unhappy about sitting on the bench (rating −3) — play or sell them` }); }
  }
  // promotion / relegation: bottom two of Division 1 swap with the top two of Division 2
  const down = t1.slice(-2), up = t2.slice(0, 2);
  lg1.teams = lg1.teams.filter(t => !down.includes(t)).concat(up);
  lg2.teams = lg2.teams.filter(t => !up.includes(t)).concat(down);
  for (const lg of [lg1, lg2]) {
    for (const t of lg.teams) { if (!c || t.id !== c.teamId) t.rating = clamp(t.rating + randi(-3, 3), lg === lg1 ? 40 : 30, lg === lg1 ? 88 : 66); Object.assign(t, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }); }
    lg.round = 0; lg.season++;
    lg.fixtures = makeFixtures(lg.teams.map(t => t.id));
  }
  return prize;
}

// ======================================================================= RICH LIST
const RICH = ['Viktor Hollenbeck', 'Mira Castellane', 'Johan Stray', 'Aiko Morimoto', 'Rafael Quintero', 'Celine Duvall', 'Bartosz Zielny', 'Harriet Vance', 'Dev Malhotra', 'Lars Ekholm', 'Sienna Ward', 'Omar Haddad', 'Greta Lindqvist', 'Marcus Oyelaran', 'Ines Barbosa', 'Felix Achterberg', 'Yuki Tanabe', 'Tomasz Wrona', 'Clara Beaumont', 'Elon Mosk (no relation)', 'Priya Sethi', 'Nikolai Varga', 'Hugo Delacroix', 'Amara Nwosu', 'Sebastian Kroll'];
export const RICH_SECTORS = {
  Tech: { icon: '💻', suf: ['Systems', 'Labs', 'Software', 'AI', 'Cloud'] },
  Energy: { icon: '⚡', suf: ['Energy', 'Power', 'Petroleum', 'Renewables'] },
  Retail: { icon: '🛒', suf: ['Mart', 'Stores', 'Retail Group', 'Outlets'] },
  Luxury: { icon: '💎', suf: ['Maison', 'Couture', 'Jewellers', 'Atelier'] },
  Media: { icon: '📺', suf: ['Media', 'Studios', 'Broadcasting', 'Pictures'] },
  Finance: { icon: '🏦', suf: ['Capital', 'Bank', 'Partners', 'Holdings'] },
  'Real estate': { icon: '🏙️', suf: ['Properties', 'Estates', 'Developments', 'REIT'] },
  Auto: { icon: '🚗', suf: ['Motors', 'Automotive', 'Mobility'] },
  Pharma: { icon: '💊', suf: ['Pharma', 'Biotech', 'Therapeutics', 'Health'] },
  Logistics: { icon: '📦', suf: ['Logistics', 'Freight', 'Shipping', 'Express'] },
  Food: { icon: '🍔', suf: ['Foods', 'Brands', 'Beverages', 'Kitchens'] },
  Gaming: { icon: '🎮', suf: ['Games', 'Interactive', 'Entertainment'] },
  Telecom: { icon: '📡', suf: ['Telecom', 'Mobile', 'Networks'] },
};
const PREFIX = ['Nova', 'Apex', 'Blue', 'Iron', 'Silver', 'Quantum', 'Orion', 'Atlas', 'Vertex', 'Helix', 'Summit', 'Polar', 'Crimson', 'Golden', 'Lumen', 'Titan', 'Echo', 'Stellar', 'Zephyr', 'Northwind', 'Meridian', 'Obsidian', 'Aurora', 'Falcon'];
const HOMES = ['Warsaw 🇵🇱', 'London 🇬🇧', 'New York 🇺🇸', 'Monaco 🇲🇨', 'Zurich 🇨🇭', 'Dubai 🇦🇪', 'Singapore 🇸🇬', 'Tokyo 🇯🇵', 'Paris 🇫🇷', 'São Paulo 🇧🇷', 'Mumbai 🇮🇳', 'Stockholm 🇸🇪', 'Lagos 🇳🇬', 'Toronto 🇨🇦', 'Berlin 🇩🇪', 'Sydney 🇦🇺'];
function genCompanies(industry) {
  const n = randi(2, 5), sectors = Object.keys(RICH_SECTORS);
  const list = [];
  for (let i = 0; i < n; i++) {
    const sector = i === 0 ? industry : pick(sectors);
    list.push({ name: `${pick(PREFIX)} ${pick(RICH_SECTORS[sector].suf)}`, sector, w: i === 0 ? rand(0.4, 0.7) : rand(0.05, 0.3), stake: randi(i === 0 ? 30 : 8, i === 0 ? 100 : 60) });
  }
  const total = list.reduce((a, c) => a + c.w, 0), invested = rand(0.8, 0.95);
  for (const c of list) c.w = c.w / total * invested;
  return list;
}
// make sure every rich-list entry has a full profile (older saves only had name + net worth)
function profile(r) {
  r.age ??= randi(29, 88);
  r.home ??= pick(HOMES);
  r.selfMade ??= Math.random() < 0.65;
  r.industry ??= pick(Object.keys(RICH_SECTORS));
  r.companies ??= genCompanies(r.industry);
  r.hist ??= [r.nw];
  r.prev ??= r.nw;
  return r;
}
function newRichList() {
  return RICH.map(name => profile({ name, nw: Math.round(Math.exp(rand(Math.log(2e8), Math.log(2.5e11)))), g: rand(0.0002, 0.0012) })).sort((a, b) => b.nw - a.nw);
}
function richDay(s) {
  const before = new Map(s.richlist.map((r, i) => [r.name, i]));
  for (const r of s.richlist) {
    profile(r);
    r.prev = r.nw;
    r.nw = Math.round(r.nw * (1 + gauss(r.g + (econ(s) - 1) * 0.002, 0.008)));
    r.hist.push(r.nw);
    if (r.hist.length > 90) r.hist.shift();
  }
  s.richlist.sort((a, b) => b.nw - a.nw);
  s.richlist.forEach((r, i) => { r.move = before.get(r.name) - i; });
}
export const richProfile = (s, name) => { const r = s.richlist.find(x => x.name === name); return r ? profile(r) : null; };
export function richEmployees(r) { return r.companies.reduce((a, c) => a + Math.round(r.nw * c.w / 350000), 0); }
export function richRank(s, nw) { return s.richlist.filter(r => r.nw > nw).length + 1; }

// ======================================================================= daily hook + net worth
export function empireDay(s, report, operatingProfit, nw) {
  const fac = factoryDay(s, report);
  const dividends = marketDay(s, report);
  const sp = sportsDay(s, report);
  richDay(s);
  const publicDiv = ipoDay(s, report, operatingProfit + fac.net, nw);
  report.factories = fac;
  report.sports = sp.net;
  report.dividends = dividends;
  report.publicDividends = publicDiv;
  return { cash: fac.cash + sp.cash + dividends - publicDiv, net: fac.net + sp.net + dividends - publicDiv };
}
export function empireAssets(s) {
  return s.factories.reduce((a, f) => a + factoryValue(f), 0) + portfolioValue(s) + clubValue(s);
}
export { PHASES };
