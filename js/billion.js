// Billionaire tier: takeovers of rich-list companies (with synergies), megaprojects,
// decision events (dilemmas with real consequences) and achievements.
import { CITIES, BT } from './data.js';
import { bizById, parcelById, workersOf, fmt, netWorth } from './engine.js';
import { diff } from './world.js';
import { RICH_SECTORS, richProfile, clubValue } from './empire.js';

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

export const BILLION = 1e9;
export const DECISIONS_FROM = 20e6;

export function initBillion(s) {
  s.billion ||= { holdings: [], projects: [], decisions: [], achievements: {}, nextDecision: s.day + randi(8, 16), flags: {} };
  s.billion.flags ||= {};
  s.prestige ??= 0;
}

// ======================================================================= TAKEOVERS + SYNERGIES
export const STRATEGIES = {
  growth: { label: 'Growth', cash: 0.05, growth: 0.14, desc: 'Reinvests profits: ~5% a year paid out, value grows ~14%' },
  balanced: { label: 'Balanced', cash: 0.11, growth: 0.05, desc: '~11% a year paid out, value grows ~5%' },
  cashcow: { label: 'Cash cow', cash: 0.2, growth: -0.05, desc: 'Milk it: ~20% a year paid out, value slowly shrinks' },
};
// what owning a company in each sector does for your empire
export const SYNERGIES = {
  Logistics: 'Stock and factory goods 10% cheaper',
  Finance: 'Overdraft interest −75%, 14 extra days before bankruptcy',
  Media: 'All businesses +5% customers',
  'Real estate': 'Rent 10% lower on new leases and renewals',
  Tech: 'All staff 3% more productive',
  Food: 'Food businesses\' stock 10% cheaper',
  Auto: 'Car dealership stock 10% cheaper',
  Luxury: 'Jewelry, cosmetics, clothing & luxury cars +8% customers',
  Energy: 'Property running costs −5%',
  Retail: 'Shops +5% customers',
  Pharma: 'Staff morale +5 (health benefits)',
  Gaming: 'Gaming studios & tech startups +10% customers',
  Telecom: 'Advertising 25% more effective',
};
export const hasSector = (s, sector) => !!(s.billion && s.billion.holdings.some(h => h.sector === sector));
const FOOD = ['coffee', 'bakery', 'restaurant', 'supermarket'];
const CARS = ['usedcars', 'cars', 'luxcars'];
const LUX = ['jewelry', 'cosmetics', 'clothing', 'luxcars'];
const SHOPS = ['clothing', 'coffee', 'bakery', 'cars', 'usedcars', 'luxcars', 'supermarket', 'jewelry', 'furniture', 'cosmetics'];
export function stockCostMult(s, type) {
  let m = 1;
  if (hasSector(s, 'Logistics')) m *= 0.9;
  if (FOOD.includes(type) && hasSector(s, 'Food')) m *= 0.9;
  if (CARS.includes(type) && hasSector(s, 'Auto')) m *= 0.9;
  return m;
}
export function demandMult(s, b) {
  let m = 1;
  if (hasSector(s, 'Media')) m *= 1.05;
  if (SHOPS.includes(b.type) && hasSector(s, 'Retail')) m *= 1.05;
  if (LUX.includes(b.type) && hasSector(s, 'Luxury')) m *= 1.08;
  if (['gaming', 'tech'].includes(b.type) && hasSector(s, 'Gaming')) m *= 1.1;
  const main = parcelById(s, b.mainId);
  if (main && s.billion && s.billion.projects.some(p => p.type === 'city' && p.done && p.city === main.city)) m *= 1.06;
  return m;
}
export const capMultB = s => (hasSector(s, 'Tech') ? 1.03 : 1) * (s.billion && s.billion.projects.some(p => p.type === 'ai' && p.done) ? 1.05 : 1);
export const rentMult = s => hasSector(s, 'Real estate') ? 0.9 : 1;
export const upkeepMult = s => hasSector(s, 'Energy') ? 0.95 : 1;
export const overdraftMult = s => hasSector(s, 'Finance') ? 0.25 : 1;
export const bankruptDaysBonus = s => hasSector(s, 'Finance') ? 14 : 0;
export const moraleBonus = s => (hasSector(s, 'Pharma') ? 5 : 0) + (s.billion && s.billion.projects.some(p => p.type === 'island' && p.done) ? 3 : 0);
export const adMult = s => hasSector(s, 'Telecom') ? 1.25 : 1;

export function takeoverPrice(s, npcName, companyName) {
  const r = richProfile(s, npcName);
  const c = r && r.companies.find(x => x.name === companyName);
  if (!c) return null;
  const main = r.companies.slice().sort((a, b) => b.w - a.w)[0] === c;
  const value = r.nw * c.w;
  return { value: Math.round(value), price: Math.round(value * (main ? 1.6 : 1.3)), main };
}
export function takeOver(s, npcName, companyName, nw) {
  if (nw < BILLION) return `Takeovers unlock at ${fmt(BILLION)} net worth`;
  const r = richProfile(s, npcName);
  const c = r && r.companies.find(x => x.name === companyName);
  if (!c) return 'Company not found';
  const q = takeoverPrice(s, npcName, companyName);
  if (s.cash < q.price) return `You need ${fmt(q.price)}`;
  s.cash -= q.price;
  r.companies = r.companies.filter(x => x !== c); // they get your cash instead, which ends up in "cash & other"
  s.billion.holdings.push({ id: uid(s), name: c.name, sector: c.sector, value: q.value, cost: q.price, from: r.name, since: s.day, strategy: 'balanced', last: 0 });
  return null;
}
export function setStrategy(s, id, k) { const h = s.billion.holdings.find(x => x.id === id); if (h && STRATEGIES[k]) h.strategy = k; }
export function sellHolding(s, id) {
  const h = s.billion.holdings.find(x => x.id === id);
  if (!h) return 'Not found';
  s.cash += Math.round(h.value * 0.95);
  s.billion.holdings = s.billion.holdings.filter(x => x !== h);
  return null;
}
function holdingsDay(s, report) {
  let cash = 0;
  for (const h of s.billion.holdings) {
    const st = STRATEGIES[h.strategy] || STRATEGIES.balanced;
    let move = st.growth / 365 + gauss(0, 0.01) + (econ(s) - 1) * 0.003;
    if (Math.random() < 0.004) {
      const shock = rand(0.08, 0.25) * (Math.random() < 0.45 ? 1 : -1);
      move += shock;
      report.events.push({ tone: shock > 0 ? 'good' : 'bad', text: `${shock > 0 ? '📈' : '📉'} ${h.name} ${shock > 0 ? 'had a breakthrough' : 'hit a scandal'} — value ${shock > 0 ? '+' : ''}${Math.round(shock * 100)}%` });
    }
    h.value = Math.max(1e6, h.value * (1 + move));
    h.last = Math.round(h.value * st.cash / 365 * econ(s));
    cash += h.last;
  }
  return cash;
}

// ======================================================================= MEGAPROJECTS
export const MEGA = {
  tower: { name: 'Skyscraper', icon: '🏙️', cost: 2e9, days: 240, income: 1.1e6, prestige: 20, perk: 'Prestige; office rent income' },
  island: { name: 'Private Island Resort', icon: '🏝️', cost: 1.5e9, days: 180, income: 0.8e6, prestige: 15, perk: 'Executive retreats: staff morale +3 everywhere' },
  arena: { name: 'Mega Arena', icon: '🏟️', cost: 1.2e9, days: 200, income: 0.55e6, prestige: 10, perk: 'Your football club fills 25% more seats' },
  ai: { name: 'AI Supercomputer', icon: '🧠', cost: 5e9, days: 300, income: 2.6e6, prestige: 30, perk: 'All staff 5% more productive' },
  space: { name: 'Space Tourism Program', icon: '🚀', cost: 8e9, days: 400, income: 5e6, prestige: 50, perk: 'The ultimate flex. Launch accidents can happen.' },
  city: { name: 'Smart City District', icon: '🌆', cost: 20e9, days: 600, income: 12e6, prestige: 100, perk: 'Your businesses in that city +6% customers' },
};
export function startProject(s, type, city, nw) {
  if (nw < BILLION) return `Megaprojects unlock at ${fmt(BILLION)} net worth`;
  const M = MEGA[type];
  if (!M || !CITIES[city]) return 'Pick a project and a city';
  if (s.billion.projects.some(p => p.type === type && !p.done)) return 'Already building one';
  const down = Math.round(M.cost * 0.1 * diff(s).cost);
  if (s.cash < down) return `Down payment: ${fmt(down)}`;
  s.cash -= down;
  s.billion.projects.push({ id: uid(s), type, city, progress: 0, days: M.days, paid: down, budget: Math.round(M.cost * diff(s).cost), done: false, paused: false });
  return null;
}
export const projectDaily = p => Math.round((p.budget * 0.9) / p.days);
export const projectValue = p => Math.round(p.done ? p.budget * 0.8 : p.paid * 0.5);
function projectsDay(s, report) {
  let cash = 0;
  for (const p of s.billion.projects) {
    const M = MEGA[p.type];
    if (p.done) {
      let inc = M.income * econ(s);
      if (p.type === 'space' && Math.random() < 0.003) {
        const cost = Math.round(p.budget * 0.1);
        cash -= cost;
        report.events.push({ tone: 'bad', text: `💥 A ${M.name} launch failed. Investigation and repairs: ${fmt(cost)}` });
      }
      cash += inc;
      p.last = Math.round(inc);
      continue;
    }
    const daily = projectDaily(p);
    if (s.cash + cash < daily) {
      if (!p.paused && !(p.pauseNotice > s.day - 30)) { report.events.push({ tone: 'bad', text: `⏸️ ${M.name} construction paused — not enough cash for ${fmt(daily)}/day` }); p.pauseNotice = s.day; }
      p.paused = true;
      continue;
    }
    p.paused = false;
    cash -= daily;
    p.paid += daily;
    p.progress++;
    if (p.progress >= p.days) {
      p.done = true; p.finished = s.day;
      s.prestige += M.prestige;
      report.events.push({ tone: 'good', text: `${M.icon} Your ${M.name} in ${CITIES[p.city].name} is complete! +${M.prestige} prestige` });
    }
  }
  return Math.round(cash);
}

// ======================================================================= DECISIONS
// stake = a sensible amount for this player (~3 days of income, at least $50K)
function stake(s) {
  const recent = s.ledger.slice(-7);
  const avg = recent.reduce((a, x) => a + x.net, 0) / Math.max(1, recent.length);
  return Math.max(50000, Math.round(Math.abs(avg) * 3 / 1000) * 1000);
}
function bigBiz(s, n = 2) { return s.businesses.filter(b => b.last && b.last.revenue).sort((a, b) => b.last.revenue - a.last.revenue).slice(0, n); }
const DECISION_KINDS = {
  union: s => s.workers.length >= 30 && (() => {
    const cost = stake(s);
    return { icon: '✊', title: 'Unions want a raise', text: `Unions representing your ${s.workers.length.toLocaleString('en-US')} employees demand 10% higher pay across every business.`,
      options: [
        { label: 'Accept +10% pay', note: 'Higher wages for good, much happier staff', fx: 'union_accept' },
        { label: `Negotiate +5% (${fmt(cost)} for mediators)`, note: 'Half the raise, a bit happier', cost, fx: 'union_half' },
        { label: 'Refuse', note: 'Risk strikes at your biggest businesses', fx: 'union_refuse' },
      ], def: 2 };
  })(),
  scandal: s => s.businesses.length >= 3 && (() => {
    const cost = stake(s) * 2;
    return { icon: '📰', title: 'Journalists are digging', text: 'An investigative reporter is about to publish a story about working conditions in your empire.',
      options: [
        { label: `Hire a PR firm (${fmt(cost)})`, note: 'The story fizzles out', cost, fx: 'none' },
        { label: 'Improve conditions', note: 'Raise pay 5% everywhere; good press instead', fx: 'scandal_improve' },
        { label: 'Ignore it', note: '60% chance: reputation −15 at every business', fx: 'scandal_ignore' },
      ], def: 2 };
  })(),
  offer: s => (s.sports.club || s.factories.length) && (() => {
    const npc = pick(s.richlist);
    if (s.sports.club && Math.random() < 0.6) {
      const v = clubValue(s), price = Math.round(v * rand(1.3, 1.6));
      return { icon: '🤝', title: `${npc.name} wants your club`, text: `${npc.name} offers ${fmt(price)} for ${s.sports.club.name} (worth about ${fmt(v)}).`,
        options: [{ label: `Sell for ${fmt(price)}`, note: 'Cash now, no more wages — or trophies', fx: 'sell_club', amount: price }, { label: 'Decline', note: 'Keep the club', fx: 'none' }], def: 1 };
    }
    const f = pick(s.factories);
    if (!f) return null;
    const price = Math.round(f.invested * rand(0.8, 1.1));
    return { icon: '🤝', title: `${npc.name} wants a factory`, text: `${npc.name} offers ${fmt(price)} for your factory in ${CITIES[f.city].name} (you invested ${fmt(f.invested)}).`,
      options: [{ label: `Sell for ${fmt(price)}`, note: 'Much more than the usual 50% resale', fx: 'sell_factory', amount: price, ref: f.id }, { label: 'Decline', fx: 'none' }], def: 1 };
  })(),
  bargain: s => netWorth(s) >= BILLION && (() => {
    const r = pick(s.richlist.filter(x => x.companies && x.companies.length > 1));
    if (!r) return null;
    const c = r.companies.slice().sort((a, b) => a.w - b.w)[0];
    const value = Math.round(r.nw * c.w), price = Math.round(value * 0.8);
    return { icon: '💼', title: `${r.name} needs cash fast`, text: `${r.name} will sell you ${c.name} (${c.sector}, worth ${fmt(value)}) for ${fmt(price)} — this offer won't last.`,
      options: [{ label: `Buy for ${fmt(price)}`, note: `Synergy: ${SYNERGIES[c.sector]}`, fx: 'bargain_buy', amount: price, ref: `${r.name}|${c.name}` }, { label: 'Pass', fx: 'none' }], def: 1 };
  })(),
  antitrust: s => {
    const counts = {};
    for (const b of s.businesses) counts[b.type] = (counts[b.type] || 0) + 1;
    const [type, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    if (!type || n < 4) return null;
    const fine = stake(s) * 3;
    return { icon: '⚖️', title: 'Antitrust investigation', text: `Regulators say your ${n} ${BT[type].name.toLowerCase()}s dominate the market.`,
      options: [{ label: `Settle (${fmt(fine)})`, note: 'Pay and move on', cost: fine, fx: 'none' }, { label: 'Fight in court', note: '50%: case dropped · 50%: pay 3× the fine', fx: 'antitrust_fight', amount: fine * 3 }], def: 0 };
  },
  offshore: s => netWorth(s) >= 50e6 && !s.billion.flags.offshore && ({
    icon: '🏝️', title: 'A "creative" tax idea', text: 'Your advisers suggest routing profits through an island holding company.',
    options: [{ label: 'Do it', note: 'Next tax bill −50%, but 30% chance of an audit fine of twice the saving', fx: 'offshore' }, { label: 'Stay clean', fx: 'none' }], def: 1 }),
  charity: s => {
    const city = pick(Object.keys(CITIES)), cost = stake(s) * 4;
    return { icon: '🏥', title: `Fund a hospital in ${CITIES[city].name}?`, text: `The city asks you to fund a new children's hospital for ${fmt(cost)}.`,
      options: [{ label: `Donate ${fmt(cost)}`, note: `+8 prestige, reputation +6 at your ${CITIES[city].name} businesses`, cost, fx: 'charity', ref: city }, { label: 'Decline politely', fx: 'none' }], def: 1 };
  },
  insider: s => s.market && Object.keys(s.market.holdings).length + Object.keys(s.market.shorts || {}).length > 0 && !s.market.tip && (() => {
    const st = pick(Object.values(s.market.stocks));
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { icon: '🤫', title: 'A tip from a friend', text: `A golf buddy whispers that ${st.name} (${st.t}) is about to ${dir > 0 ? 'jump' : 'crash'}. Trading on it would be insider trading.`,
      options: [
        { label: 'Listen', note: 'The tip shows on the stock market for 10 days (70% chance it is real). Trading that stock may get you investigated.', fx: 'tip', ref: `${st.t}|${dir}` },
        { label: 'Walk away', note: 'Stay clean', fx: 'none' },
      ], def: 1 };
  })(),
  activist: s => s.ipo && s.ipo.confidence < 65 && (() => {
    const npc = pick(s.richlist);
    const cost = Math.round(netWorth(s) * 0.01);
    return { icon: '📣', title: `Activist investor: ${npc.name}`, text: `${npc.name} bought a big stake in your company and demands a special dividend and a seat on the board.`,
      options: [
        { label: `Pay a special dividend (${fmt(cost)})`, note: 'Board confidence +15', cost, fx: 'activist_pay' },
        { label: 'Give them a board seat', note: 'Confidence +5, but they take 2% more of your profits for good', fx: 'activist_seat' },
        { label: 'Fight them', note: '50%: confidence +10 · 50%: confidence −20', fx: 'activist_fight' },
      ], def: 2 };
  })(),
  poachStar: s => {
    const w = s.workers.find(x => x.star && x.bizId);
    if (!w) return null;
    const npc = pick(s.richlist);
    return { icon: '🎣', title: `${npc.name} wants ${w.name}`, text: `${npc.name} offered your star employee ${w.name} double pay to join them.`,
      options: [
        { label: 'Counter-offer (+50% pay)', note: `Keep ${w.name}, who costs more from now on`, fx: 'star_keep', ref: w.id },
        { label: `Let ${w.name} go`, note: 'Save the wage, lose the star', fx: 'star_go', ref: w.id },
      ], def: 1 };
  },
  delay: s => {
    const p = s.billion.projects.find(x => !x.done && x.progress > 10);
    if (!p) return null;
    const cost = Math.round(p.budget * 0.08);
    return { icon: '🏗️', title: `${MEGA[p.type].name}: contractor problems`, text: 'Your main contractor has run into trouble.',
      options: [{ label: `Pay ${fmt(cost)} to stay on schedule`, cost, fx: 'none' }, { label: 'Accept a delay', note: '+45 days to finish', fx: 'delay', ref: p.id }], def: 1 };
  },
};
export const DECISION_DAYS = 5;
function maybeDecision(s, report) {
  const B = s.billion;
  B.decisions = B.decisions || [];
  // unanswered decisions resolve with their default
  for (const d of B.decisions.filter(x => x.deadline <= s.day)) {
    const msg = resolveDecision(s, d.id, d.def, true);
    report.events.push({ tone: 'bad', text: `⏰ No answer on "${d.title}" — ${msg}` });
  }
  if (s.day < B.nextDecision || netWorth(s) < DECISIONS_FROM || B.decisions.length >= 2) return;
  B.nextDecision = s.day + randi(12, 24);
  const kinds = Object.keys(DECISION_KINDS).sort(() => Math.random() - 0.5);
  for (const k of kinds) {
    const d = DECISION_KINDS[k](s);
    if (!d) continue;
    d.id = uid(s); d.kind = k; d.day = s.day; d.deadline = s.day + DECISION_DAYS;
    B.decisions.push(d);
    report.events.push({ tone: 'info', text: `${d.icon} Decision needed: ${d.title}` });
    report.newDecision = d.id;
    return;
  }
}
export function resolveDecision(s, id, idx, auto = false) {
  const B = s.billion;
  const d = B.decisions.find(x => x.id === id);
  if (!d) return 'Already decided';
  const o = d.options[idx];
  if (!o) return 'Pick an option';
  if (o.cost && s.cash < o.cost && !auto) return `You need ${fmt(o.cost)}`;
  if (o.cost) s.cash -= o.cost;
  let msg = o.label;
  const all = s.businesses;
  switch (o.fx) {
    case 'union_accept': for (const b of all) { b.payLevel = clamp((b.payLevel || 1) * 1.1, 0.8, 1.6); b.morale = Math.min(100, (b.morale ?? 70) + 12); } msg = 'Pay +10% everywhere, staff are delighted'; break;
    case 'union_half': for (const b of all) { b.payLevel = clamp((b.payLevel || 1) * 1.05, 0.8, 1.6); b.morale = Math.min(100, (b.morale ?? 70) + 5); } msg = 'Deal at +5% pay'; break;
    case 'union_refuse': {
      if (Math.random() < 0.6) { const hit = bigBiz(s); for (const b of hit) b.downtime = { days: randi(2, 4), reason: 'strike', paysWages: false }; msg = `Strikes at ${hit.map(b => b.name).join(' and ')}`; }
      else msg = 'The unions backed down';
      for (const b of all) b.morale = Math.max(0, (b.morale ?? 70) - 6);
      break;
    }
    case 'scandal_improve': for (const b of all) { b.payLevel = clamp((b.payLevel || 1) * 1.05, 0.8, 1.6); b.rep = Math.min(100, b.rep + 3); } msg = 'Pay +5% and good press'; break;
    case 'scandal_ignore': if (Math.random() < 0.6) { for (const b of all) b.rep = Math.max(0, b.rep - 15); msg = 'The story ran — reputation −15 everywhere'; } else msg = 'Nobody read it. Lucky.'; break;
    case 'sell_club': if (s.sports.club) { s.sports.club = null; s.cash += o.amount; msg = `Club sold for ${fmt(o.amount)}`; } break;
    case 'sell_factory': { const f = s.factories.find(x => x.id === o.ref); if (f) { s.factories = s.factories.filter(x => x !== f); s.cash += o.amount; msg = `Factory sold for ${fmt(o.amount)}`; } break; }
    case 'bargain_buy': {
      const [npc, comp] = o.ref.split('|');
      const r = richProfile(s, npc), c = r && r.companies.find(x => x.name === comp);
      if (!c) { msg = 'The deal fell through'; break; }
      if (s.cash < o.amount) { msg = 'Not enough cash — the deal fell through'; break; }
      s.cash -= o.amount;
      r.companies = r.companies.filter(x => x !== c);
      B.holdings.push({ id: uid(s), name: c.name, sector: c.sector, value: Math.round(r.nw * c.w), cost: o.amount, from: r.name, since: s.day, strategy: 'balanced', last: 0 });
      msg = `You now own ${c.name}`;
      break;
    }
    case 'antitrust_fight': if (Math.random() < 0.5) msg = 'Case dropped!'; else { s.cash -= o.amount; msg = `Lost in court: ${fmt(o.amount)}`; } break;
    case 'offshore': B.flags.offshore = true; msg = 'Profits now flow through the island'; break;
    case 'charity': s.prestige += 8; for (const b of all) { const m = parcelById(s, b.mainId); if (m && m.city === o.ref) b.rep = Math.min(100, b.rep + 6); } msg = 'The hospital will carry your name. +8 prestige'; break;
    case 'tip': {
      const [t, dir] = o.ref.split('|');
      s.market.tip = { t, dir: +dir, real: Math.random() < 0.7, until: s.day + 10, traded: false, stake: 0 };
      msg = `You heard the tip about ${t}. Trade carefully.`;
      break;
    }
    case 'activist_pay': if (s.ipo) s.ipo.confidence = Math.min(100, s.ipo.confidence + 15); msg = 'Special dividend paid, board confidence +15'; break;
    case 'activist_seat': if (s.ipo) { s.ipo.confidence = Math.min(100, s.ipo.confidence + 5); s.ipo.pct = Math.min(0.9, s.ipo.pct + 0.02); } msg = 'The activist joined the board'; break;
    case 'activist_fight': if (s.ipo) { if (Math.random() < 0.5) { s.ipo.confidence = Math.min(100, s.ipo.confidence + 10); msg = 'Shareholders backed you, confidence +10'; } else { s.ipo.confidence = Math.max(0, s.ipo.confidence - 20); msg = 'You lost the proxy fight, confidence −20'; } } break;
    case 'star_keep': { const w = s.workers.find(x => x.id === o.ref); if (w) { w.wageMult = (w.wageMult || 1) * 1.5; msg = `${w.name} stays, now on ${Math.round(w.wageMult * 100)}% of normal pay`; } break; }
    case 'star_go': { const w = s.workers.find(x => x.id === o.ref); if (w) { s.workers = s.workers.filter(x => x !== w); msg = `${w.name} left for a rival`; } break; }
    case 'delay': { const p = B.projects.find(x => x.id === o.ref); if (p) p.days += 45; msg = 'Project delayed by 45 days'; break; }
    default: break;
  }
  B.decisions = B.decisions.filter(x => x !== d);
  B.history ||= [];
  B.history.unshift({ day: s.day, title: d.title, choice: o.label, result: msg });
  B.history.length = Math.min(B.history.length, 20);
  return msg;
}
// called by the engine on tax day: the offshore scheme halves the bill once, with audit risk
export function taxAdjust(s, due, report) {
  const B = s.billion;
  if (!B || !B.flags.offshore) return due;
  B.flags.offshore = false;
  const saved = Math.round(due * 0.5);
  if (Math.random() < 0.3) {
    report.events.push({ tone: 'bad', text: `🕵️ Tax audit! The offshore scheme cost you a ${fmt(saved * 2)} fine` });
    return due + saved * 2 - saved;
  }
  report.events.push({ tone: 'good', text: `🏝️ The offshore scheme saved ${fmt(saved)} in tax` });
  return due - saved;
}

// ======================================================================= ACHIEVEMENTS
export const ACHIEVEMENTS = [
  ['first', '🏪', 'Open for business', 'Found your first business', s => s.businesses.length >= 1, 1],
  ['quit', '👋', 'Bye, boss', 'Quit your day job', s => !s.job.employed, 1],
  ['ten', '🏬', 'Chain', 'Run 10 businesses', s => s.businesses.length >= 10, 3],
  ['cities', '🌍', 'Global', 'Have businesses in all 3 cities', s => new Set(s.businesses.map(b => (parcelById(s, b.mainId) || {}).city).filter(Boolean)).size >= 3, 3],
  ['staff100', '👥', 'Employer', '100 employees', s => s.workers.length >= 100, 2],
  ['staff1000', '🏟️', 'Small town', '1,000 employees', s => s.workers.length >= 1000, 5],
  ['staff10000', '🏙️', 'Small city', '10,000 employees', s => s.workers.length >= 10000, 10],
  ['m1', '💵', 'Millionaire', '$1M net worth', s => netWorth(s) >= 1e6, 2],
  ['m100', '💰', 'Hundred-millionaire', '$100M net worth', s => netWorth(s) >= 1e8, 5],
  ['b1', '🤑', 'Billionaire', '$1B net worth', s => netWorth(s) >= 1e9, 10],
  ['b10', '🛥️', 'Decabillionaire', '$10B net worth', s => netWorth(s) >= 1e10, 15],
  ['b100', '🪐', 'Centibillionaire', '$100B net worth', s => netWorth(s) >= 1e11, 25],
  ['top10', '🏅', 'Top 10', 'Reach the top 10 of the rich list', s => s.richlist.filter(r => r.nw > netWorth(s)).length < 10, 10],
  ['top1', '👑', 'Richest person alive', '#1 on the rich list', s => s.richlist.every(r => r.nw <= netWorth(s)), 50],
  ['factory', '🏭', 'Industrialist', 'Build a factory', s => s.factories.some(f => f.buildLeft <= 0), 3],
  ['ipo', '🔔', 'Ring the bell', 'Take your company public', s => !!s.ipo, 5],
  ['club', '⚽', 'Club owner', 'Own a football club', s => !!s.sports.club, 3],
  ['title', '🏆', 'Champions', 'Win a league title', s => (s.sports.titles || 0) > 0, 10],
  ['lux', '🏎️', 'Supercars', 'Open a luxury car dealership', s => s.businesses.some(b => b.type === 'luxcars'), 5],
  ['takeover', '🦈', 'Shark', 'Take over a rich-list company', s => s.billion.holdings.length >= 1, 5],
  ['sectors', '🧩', 'Conglomerate', 'Own companies in 5 sectors', s => new Set(s.billion.holdings.map(h => h.sector)).size >= 5, 15],
  ['mega', '🏗️', 'Builder', 'Complete a megaproject', s => s.billion.projects.some(p => p.done), 10],
  ['space', '🚀', 'To the stars', 'Complete the space program', s => s.billion.projects.some(p => p.done && p.type === 'space'), 25],
  ['bank', '🏦', 'Banker', 'Open an Investment Bank', s => s.businesses.some(b => b.type === 'bank'), 5],
  ['spaceco', '🛰️', 'Rocket company', 'Open a Space Launch Company', s => s.businesses.some(b => b.type === 'spaceco'), 10],
];
function achievementsDay(s, report) {
  const A = s.billion.achievements;
  for (const [id, icon, name, , test, pts] of ACHIEVEMENTS) {
    if (A[id]) continue;
    let ok = false;
    try { ok = test(s); } catch { ok = false; }
    if (ok) { A[id] = s.day; s.prestige += pts; report.events.push({ tone: 'good', text: `${icon} Achievement: ${name} (+${pts} prestige)` }); }
  }
}

// ======================================================================= daily hook + net worth
export function billionDay(s, report) {
  initBillion(s);
  const hold = holdingsDay(s, report);
  const proj = projectsDay(s, report);
  maybeDecision(s, report);
  achievementsDay(s, report);
  report.holdings = hold;
  report.projects = proj;
  return { cash: hold + proj, net: hold + proj };
}
export function billionAssets(s) {
  if (!s.billion) return 0;
  return s.billion.holdings.reduce((a, h) => a + h.value, 0) + s.billion.projects.reduce((a, p) => a + projectValue(p), 0);
}
export { RICH_SECTORS };
