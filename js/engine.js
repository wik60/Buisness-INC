// Simulation engine for Delusional Business Inc. (no DOM access here)
import {
  CITIES, SIZES, SIZE_ORDER, BUSINESS_TYPES, BT, POSITIONS, OFFICE_ROLES, JOB_LADDER,
  DAYS_PER_PROMOTION, TAX_PERIOD, TAX_BRACKETS, RANKS, FIRST, LAST, KINDS,
  SUPPORT_ROLES, DAY_SHORT, WEEK_PATTERNS, TYPE_WEEK, SUNDAY_PAY, BASE_HOURS, OVERTIME_PAY, ELASTICITY, PRICE_MIN, PRICE_MAX, CAR_TIERS, AUCTION_MODELS, STOCK, STOCK_DELIVERY_DAYS, AUTO_STOCK_DAYS, CLEANER_RATIO, SECURITY_RATIO, SECURITY_REQUIRED, EQUIPMENT, WAREHOUSE_EQUIPMENT, OFFICE_EQUIPMENT, EQUIP_RESALE,
} from './data.js';
import { initEmpire, empireDay, empireAssets } from './empire.js';
import * as EMP from './empire.js';
import { initBillion, billionDay, billionAssets, stockCostMult, rentMult, upkeepMult, overdraftMult, bankruptDaysBonus, taxAdjust, adMult } from './billion.js';
import { initWorld, diff, worldFactors, worldAfterBusiness, downtimeToday, updateEconomy, leaseDay, LEASE_DAYS } from './world.js';

export const SAVE_VERSION = 1;
const START_CASH = 4000;
const JOB_CENTER_DAILY = 10;
const RECRUITER_DAILY = 100;
const JOB_CENTER_FEE = 60;
const RENT_DIVISOR = 600;          // daily rent = price / 600
const OWNED_UPKEEP = 0.0002;       // daily upkeep for owned property (share of value)
const MOVE_IN_DAYS = 3;            // rent paid up front when renting
const BANKRUPT_DAYS = 14;
const OVERDRAFT_RATE = 0.002;

// ---------- helpers ----------
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
export const round = v => Math.round(v * 100) / 100;

// ---------- world generation ----------
function genParcels(s) {
  const parcels = [];
  for (const city of Object.values(CITIES)) {
    for (const d of city.districts) {
      for (const kind of d.kinds) {
        let sizes = ['S', 'S', 'M', 'M', 'L'];
        if (kind === 'warehouse') sizes = ['S', 'M', 'M', 'L', 'XL'];
        if (d.big) sizes = ['M', 'L', 'XL', 'XL'];
        if (kind === 'office' && d.price >= 1.7) sizes = ['S', 'M', 'L', 'XL'];
        if (kind === 'commercial' && d.traffic >= 85 && !d.big) sizes = ['S', 'S', 'M', 'L', 'XL'];
        for (const size of sizes) {
          const base = SIZES[size];
          const priceVar = rand(0.86, 1.16);
          const price = Math.round(base.price[kind] * d.price * city.cost * priceVar / 100) * 100;
          const traffic = Math.round(clamp(d.traffic * (kind === 'office' ? 0.6 : kind === 'warehouse' ? 0.3 : 1) + rand(-10, 10), 5, 100));
          const cap = Math.max(2, Math.round(base.cap * rand(0.8, 1.25)));
          parcels.push({
            id: uid(s), city: city.id, district: d.id, kind, size, cap, traffic, basePrice: price,
            address: `${randi(1, 220)} ${pick(d.streets)}`,
            status: 'market', bizId: null, rentLocked: 0, boughtFor: 0,
          });
        }
      }
    }
  }
  return parcels;
}

export function newGame(ceo, difficulty = 'normal') {
  const s = {
    v: SAVE_VERSION, ceo: (ceo || 'You').trim().slice(0, 24) || 'You', day: 1, cash: START_CASH, nextId: 1,
    job: { employed: true, level: 0, daysWorked: 0 },
    index: { warsaw: 1, london: 1, nyc: 1 },
    parcels: [], businesses: [], workers: [],
    pools: { day: 0, jobCenter: [], recruiter: [] },
    hiresToday: { jobCenter: 0, recruiter: 0 },
    tax: { periodIncome: 0, history: [] },
    ledger: [{ day: 0, cash: START_CASH, net: 0 }],
    negDays: 0, gameOver: false, log: [], lastReport: null, cityEffects: [], orders: [], shortlists: [], hq: newHQ(), comp: {}, stats: { sold: {} }, auction: { day: 0, lots: [] }, bids: [],
  };
  s.difficulty = difficulty;
  s.cash = diff(s).startCash;
  s.ledger[0].cash = s.cash;
  s.parcels = genParcels(s);
  refreshPools(s);
  refreshAuction(s);
  initWorld(s);
  initEmpire(s);
  initBillion(s);
  return s;
}

export function migrate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.parcels)) throw new Error('Not a Delusional Business save');
  s.cityEffects ||= [];
  s.log ||= [];
  s.orders ||= [];
  s.shortlists ||= [];
  s.hq ||= newHQ();
  s.comp ||= {};
  for (const w of s.workers) if (w.bizId && !w.cat) w.cat = catFor(s, w.bizId, w.pos);
  s.stats ||= { sold: {} };
  s.auction ||= { day: 0, lots: [] };
  s.bids ||= [];
  for (const b of s.businesses) {
    b.days ||= [true, true, true, true, true, true, true];
    b.hours ??= BASE_HOURS;
    b.price ??= 1;
  }
  for (const b of s.businesses) {
    if (b.stock !== undefined && b.stockValue === undefined) b.stockValue = (b.stock || 0) * unitCost(s, b);
    if (b.stock === undefined) { // older saves: start product businesses with ~5 days of stock and auto-restock on
      b.incoming = [];
      b.stock = usesStock(b) ? Math.ceil(dailySales(s, b) * 5) : 0;
      b.autoStock = usesStock(b);
      b.stockValue = b.stock * unitCost(s, b);
    }
    if (b.equip) continue;
    b.equip = {};
    for (const g of ['floor', 'warehouse', 'office']) {
      const eq = equipFor(b, g);
      const n = s.workers.filter(w => w.bizId === b.id && GROUP_POS[g].includes(w.pos)).length;
      b.equip[g] = eq ? Math.ceil(n / eq.staff) : 0; // existing saves get their kit for free
    }
  }
  refreshAuction(s);
  initWorld(s);
  initEmpire(s);
  initBillion(s);
  reviveLastChance(s);
  return s;
}

// Saves that went bankrupt before v2.2 never got the last-chance option. If selling their assets
// would cover the overdraft, reopen them in last-chance mode (unless the player declared bankruptcy).
function reviveLastChance(s) {
  if (!s.gameOver || s.gameOverReason === 'ousted') return;
  if (s.cash >= 0) { // not actually in debt any more: bankruptcy makes no sense, carry on
    s.gameOver = false; s.gameOverReason = null; s.bankruptcyPending = false; s.declaredBankrupt = false; s.negDays = 0;
    log(s, 'The bankruptcy was lifted — you had the cash all along', 'good');
    return;
  }
  if (s.declaredBankrupt) return;
  if (s.cash + liquidationValue(s) < 0) return;
  s.gameOver = false;
  s.gameOverReason = null;
  s.bankruptcyPending = true;
  s.negDays = BANKRUPT_DAYS;
}

// ---------- lookups ----------
export const parcelById = (s, id) => s.parcels.find(p => p.id === id);
export const HQ_ID = 'hq';
export const bizById = (s, id) => id === HQ_ID ? s.hq : s.businesses.find(b => b.id === id);
export const isHQ = b => !!b && b.id === HQ_ID;
function newHQ() {
  return { id: HQ_ID, type: 'hq', name: 'Headquarters', mainId: null, officeId: null, warehouseId: null, equip: { office: 0 }, history: [], effects: [], rep: 50 };
}
// which businesses an HQ worker serves (empty/undefined = all)
export const hqServes = (s, w, bizId) => w.bizId === HQ_ID && (!w.serves || !w.serves.length || w.serves.includes(bizId));
export const hqServedList = (s, w) => (!w.serves || !w.serves.length) ? s.businesses.map(b => b.id) : w.serves.filter(id => s.businesses.some(b => b.id === id));
export function setServes(s, workerId, ids) {
  const w = s.workers.find(x => x.id === workerId);
  if (!w || w.bizId !== HQ_ID) return 'Only Headquarters staff can serve several businesses';
  w.serves = ids && ids.length ? [...new Set(ids)] : [];
  return null;
}
export const districtOf = p => CITIES[p.city].districts.find(d => d.id === p.district);
export const parcelValue = (s, p) => Math.round(p.basePrice * s.index[p.city]);
export const parcelRent = (s, p) => Math.round(parcelValue(s, p) / RENT_DIVISOR * diff(s).cost * rentMult(s));
export const parcelDailyCost = (s, p) => p.status === 'rented' ? p.rentLocked : p.status === 'owned' ? Math.round(parcelValue(s, p) * OWNED_UPKEEP * upkeepMult(s)) : 0;
export const moveInCost = (s, p) => parcelRent(s, p) * MOVE_IN_DAYS;
export const sizeAtLeast = (a, b) => SIZE_ORDER.indexOf(a) >= SIZE_ORDER.indexOf(b);

export function bizCity(s, b) {
  const p = parcelById(s, b.mainId) || parcelById(s, b.officeId) || parcelById(s, b.warehouseId);
  return p ? p.city : null;
}
// ---------- job categories: a worker keeps the job they were hired for ----------
// floor staff are tied to their trade (Barista, Lawyer…); everyone else to their position.
export function catFor(s, bizId, pos) {
  if (pos !== 'floor') return pos;
  const b = bizById(s, bizId);
  return b && !isHQ(b) ? 'role:' + BT[b.type].role : 'floor';
}
// 'floor' (no trade) only exists for unassigned staff from saves older than v2.4: they can take any floor job once
export const catOf = (s, w) => w.cat || (w.bizId ? catFor(s, w.bizId, w.pos) : w.pos);
export const catLabel = cat => !cat ? 'Staff' : cat.startsWith('role:') ? cat.slice(5) : cat === 'floor' ? 'Floor staff (any trade)' : (POSITIONS[cat] ? POSITIONS[cat].name : cat);
export function posForCat(s, b, cat) {
  if (!b || !cat) return null;
  if (isHQ(b)) return OFFICE_ROLES.includes(cat) ? cat : null;
  if (cat === 'floor' || cat === 'role:' + BT[b.type].role) return 'floor';
  if (cat.startsWith('role:') || !POSITIONS[cat] || POSITIONS[cat].hqOnly) return null;
  if (cat === 'warehouse') return BT[b.type].warehouse ? 'warehouse' : null;
  if (cat === 'security') return needsSecurity(b) ? 'security' : null;
  return cat;
}
export const benchFor = (s, b) => s.workers.filter(w => !w.bizId && posForCat(s, b, catOf(s, w)));
// put every unassigned worker who can work here into a free spot, best skill first
export function placeBench(s, bizId) {
  const b = bizById(s, bizId);
  if (!b) return { placed: 0, left: 0 };
  let placed = 0, left = 0;
  for (const w of benchFor(s, b).sort((a, c) => c.skill - a.skill)) {
    const pos = posForCat(s, b, catOf(s, w));
    const c = positionCapacity(s, b, pos);
    if (c.parcel && c.used < c.cap) { w.cat = catOf(s, w) === 'floor' ? catFor(s, b.id, 'floor') : catOf(s, w); w.bizId = b.id; w.pos = pos; delete w.benchWage; delete w.fullWage; placed++; }
    else left++;
  }
  if (placed) log(s, `Placed ${placed} unassigned staff at ${b.name}`, 'good');
  return { placed, left };
}

// ---------- Staffing Coordinators (HQ): replace people who quit or get poached ----------
export const VACANCY_DAYS = 14, REPLACE_DAYS = 3;
export function recordDeparture(s, w) {
  if (!w || !w.bizId || w.bizId === HQ_ID) return;
  s.vacancies ||= [];
  s.vacancies.push({ bizId: w.bizId, pos: w.pos, cat: catOf(s, w), skill: w.skill, day: s.day });
}
export const staffingCoordinators = s => s.workers.filter(w => w.pos === 'staffing' && w.bizId === HQ_ID && s.hq && s.hq.officeId);
export const coordinatorCapacity = w => 3 + Math.floor(w.skill / 20);
function staffingDay(s, report) {
  s.vacancies ||= [];
  s.replacements ||= [];
  // replacements found earlier start work today
  let started = 0, benched = 0;
  for (const r of s.replacements.filter(x => x.arrive <= s.day)) {
    const b = bizById(s, r.bizId);
    const c = b ? positionCapacity(s, b, r.pos) : null;
    const w = { id: uid(s), name: `${pick(FIRST)} ${pick(LAST)}`, skill: r.skill, bizId: null, pos: r.pos, cat: r.cat || catFor(s, r.bizId, r.pos), hired: s.day };
    s.workers.push(w);
    if (c && c.parcel && c.used < c.cap) { w.bizId = b.id; started++; }
    else { const full = b ? wageFor(s, w, b) : 60; w.benchWage = Math.round(full * 0.5); w.fullWage = full; benched++; }
  }
  s.replacements = s.replacements.filter(x => x.arrive > s.day);
  s.vacancies = s.vacancies.filter(v => s.day - v.day <= VACANCY_DAYS && bizById(s, v.bizId));
  const coords = staffingCoordinators(s);
  let fromBench = 0, searching = 0, fees = 0;
  if (coords.length && s.vacancies.length) {
    const hasRecruiter = s.workers.some(w => w.pos === 'recruiter' && w.bizId === HQ_ID);
    const budget = new Map(coords.map(w => [w, coordinatorCapacity(w)]));
    for (const v of s.vacancies.slice()) {
      const coord = coords.find(w => budget.get(w) > 0 && hqServes(s, w, v.bizId));
      if (!coord) continue;
      const b = bizById(s, v.bizId);
      const c = positionCapacity(s, b, v.pos);
      const pending = s.replacements.filter(x => x.bizId === v.bizId && groupKey(x.pos) === groupKey(v.pos)).length;
      if (!c.parcel || c.used + pending >= c.cap) { s.vacancies = s.vacancies.filter(x => x !== v); continue; } // no room anymore
      budget.set(coord, budget.get(coord) - 1);
      s.vacancies = s.vacancies.filter(x => x !== v);
      // 1) someone suitable waiting in Unassigned?
      const bench = s.workers.filter(w => !w.bizId && posForCat(s, b, catOf(s, w)) === v.pos).sort((a, x) => x.skill - a.skill)[0];
      if (bench) { bench.cat = catOf(s, bench) === 'floor' ? catFor(s, b.id, 'floor') : catOf(s, bench); bench.bizId = b.id; bench.pos = v.pos; delete bench.benchWage; delete bench.fullWage; fromBench++; continue; }
      // 2) find someone new of similar skill
      const fee = hasRecruiter ? 0 : Math.round(60 * 1.5 * CITIES[c.parcel.city].wage);
      if (s.cash < fee) continue;
      s.cash -= fee; fees += fee;
      const skill = Math.round(clamp(gauss(v.skill * 0.85 + coord.skill * 0.15, 7), 5, 95));
      s.replacements.push({ bizId: b.id, pos: v.pos, cat: v.cat || catFor(s, b.id, v.pos), skill, arrive: s.day + REPLACE_DAYS });
      searching++;
    }
  }
  report.staffingFees = fees;
  const parts = [];
  if (fromBench) parts.push(`${fromBench} placed from Unassigned`);
  if (searching) parts.push(`${searching} replacement${searching > 1 ? 's' : ''} found, starting day ${s.day + REPLACE_DAYS}${fees ? ` (fees ${fmt(fees)})` : ''}`);
  if (started) parts.push(`${started} replacement${started > 1 ? 's' : ''} started work`);
  if (benched) parts.push(`${benched} had no room and joined Unassigned`);
  if (parts.length) { const text = `🧑‍💼 Staffing: ${parts.join(' · ')}`; report.events.push({ tone: 'good', text }); log(s, text, 'good'); }
}

export const workersOf = (s, bizId, pos) => s.workers.filter(w => w.bizId === bizId && (!pos || w.pos === pos));

export const groupKey = pos => OFFICE_ROLES.includes(pos) ? 'office' : SUPPORT_ROLES.includes(pos) ? 'support' : pos;
const GROUP_POS = { floor: ['floor'], warehouse: ['warehouse'], office: OFFICE_ROLES, support: SUPPORT_ROLES };
export function slotParcel(s, b, where) {
  return parcelById(s, where === 'warehouse' ? b.warehouseId : where === 'office' ? b.officeId : b.mainId);
}
export function equipFor(b, group) {
  if (group === 'floor') return EQUIPMENT[b.type];
  if (group === 'warehouse') return WAREHOUSE_EQUIPMENT;
  if (group === 'office') return OFFICE_EQUIPMENT;
  return null;
}
export const equipCount = (b, group) => (b.equip && b.equip[group]) || 0;
export function positionCapacity(s, b, pos) {
  const group = groupKey(pos);
  const p = slotParcel(s, b, POSITIONS[pos].where);
  const used = s.workers.filter(w => w.bizId === b.id && GROUP_POS[group].includes(w.pos)).length;
  if (!p) return { cap: 0, used, parcel: null, group };
  const eq = equipFor(b, group);
  const equipCap = eq ? equipCount(b, group) * eq.staff : Infinity;
  const spaceCap = group === 'support' ? Math.max(3, Math.ceil(p.cap / 2)) : p.cap;
  return { cap: Math.min(spaceCap, equipCap), used, parcel: p, group, spaceCap, equipCap, equip: eq };
}

export function wageFor(s, w, b = bizById(s, w.bizId)) {
  if (!b) return w.bizId ? 0 : (w.benchWage || 0); // unassigned staff get standby pay
  const t = BT[b.type];
  const p = slotParcel(s, b, POSITIONS[w.pos].where);
  const city = CITIES[p ? p.city : (bizCity(s, b) || 'london')];
  const base = w.pos === 'floor' ? t.wage : POSITIONS[w.pos].wage;
  return Math.round(base * (0.6 + 0.9 * w.skill / 100) * city.wage * diff(s).cost * (isHQ(b) ? 1 : (b.payLevel || 1)));
}
export const candidateWage = (s, c, b, pos) => wageFor(s, { skill: c.skill, pos }, b);

// ---------- unassigned staff (on standby, not working anywhere) ----------
export const BENCH_PAY = 0.5;
export const benchWorkers = s => s.workers.filter(w => !w.bizId);
function toBench(s, w) {
  w.cat = catOf(s, w);
  const full = wageFor(s, w);
  w.benchWage = Math.round(full * BENCH_PAY) || w.benchWage || 20;
  w.fullWage = full || w.fullWage;
  w.bizId = null;
  delete w.serves;
}
export function benchWorker(s, id) {
  const w = s.workers.find(x => x.id === id);
  if (!w || !w.bizId) return 'Not found';
  toBench(s, w);
  log(s, `${w.name} moved to Unassigned staff`, 'info');
  return null;
}
// assign (or move) a worker to a business + position
export function assignWorker(s, id, bizId, pos) {
  const w = s.workers.find(x => x.id === id);
  const b = bizById(s, bizId);
  if (!w) return 'Not found';
  if (!b) return 'Pick a business';
  if (!POSITIONS[pos]) return 'Pick a position';
  const cat = catOf(s, w);
  if (posForCat(s, b, cat) !== pos) return `${w.name} is a ${catLabel(cat)} and keeps that job`;
  if (isHQ(b) && !OFFICE_ROLES.includes(pos)) return 'Headquarters only has office roles';
  if (!isHQ(b) && POSITIONS[pos].hqOnly) return `${POSITIONS[pos].name}s work at Headquarters`;
  if (!isHQ(b) && pos === 'warehouse' && !BT[b.type].warehouse) return `${b.name} doesn't use a warehouse`;
  if (!isHQ(b) && pos === 'security' && !needsSecurity(b)) return `${b.name} doesn't need security`;
  const c = positionCapacity(s, b, pos);
  if (!c.parcel) return `${b.name} needs ${POSITIONS[pos].where === 'office' ? 'an office' : POSITIONS[pos].where === 'warehouse' ? 'a warehouse' : 'a location'} first`;
  const sameGroup = w.bizId === b.id && groupKey(w.pos) === groupKey(pos);
  if (!sameGroup && c.used >= c.cap) return c.equip && c.equipCap < c.spaceCap ? `No room — buy more equipment (${c.equip.name.toLowerCase()})` : 'No free spots there';
  w.cat = cat === 'floor' ? catFor(s, b.id, 'floor') : cat;
  w.bizId = b.id; w.pos = pos;
  delete w.benchWage; delete w.fullWage;
  return null;
}

export const productivity = (skill, impact = 1) => clamp(1 + impact * (skill - 50) / 100, 0.15, 2.2);

export const needsSecurity = b => SECURITY_REQUIRED.includes(b.type);

// ---------- schedule ----------
export const dowOf = day => day % 7; // 0 = Sunday; day 1 is a Monday
export const isOpenOn = (b, day) => !b.days || b.days[dowOf(day)] !== false;
export const weekPattern = b => WEEK_PATTERNS[TYPE_WEEK[b.type] || 'steady'];
export const hoursWageFactor = h => (Math.min(h, BASE_HOURS) + OVERTIME_PAY * Math.max(0, h - BASE_HOURS)) / BASE_HOURS;
export const hoursCapFactor = h => h / BASE_HOURS;
export const hoursDemandFactor = h => Math.pow(h / BASE_HOURS, 0.6);
export function setSchedule(s, bizId, { days, hours }) {
  const b = bizById(s, bizId);
  if (!b || isHQ(b)) return 'Not found';
  if (days) { if (!days.some(Boolean)) return 'Stay open at least one day a week'; b.days = days.map(Boolean); }
  if (hours != null) b.hours = clamp(Math.round(hours), 4, 24);
  return null;
}
// daily wage of a worker today (Sunday premium, overtime for on-site staff, unpaid when closed)
export function wageToday(s, w, b, day) {
  if (isHQ(b)) return wageFor(s, w, b);
  if (!isOpenOn(b, day)) return 0;
  const onSite = !OFFICE_ROLES.includes(w.pos);
  let v = wageFor(s, w, b) * (onSite ? hoursWageFactor(b.hours || BASE_HOURS) : 1);
  if (dowOf(day) === 0) v *= SUNDAY_PAY;
  return v;
}

// HR capacity for a business: its own HR managers (40 staff each) plus its share of HQ HR managers
export function hrShares(s, b) {
  const out = [];
  for (const w of s.workers) {
    if (w.pos !== 'hr') continue;
    if (w.bizId === b.id && parcelById(s, b.officeId)) out.push({ w, cap: 40 });
    else if (hqServes(s, w, b.id) && s.hq.officeId) {
      const ids = hqServedList(s, w);
      const total = ids.reduce((a, id) => a + workersOf(s, id).length, 0) || 1;
      out.push({ w, cap: 40 * workersOf(s, b.id).length / total });
    }
  }
  return out;
}
export const hrCapacity = (s, b) => hrShares(s, b).reduce((a, x) => a + x.cap, 0);
function hrTraining(s, b, staff) {
  const sh = hrShares(s, b);
  if (!sh.length) return 0;
  const cap = sh.reduce((a, x) => a + x.cap, 0);
  const skill = sh.reduce((a, x) => a + x.w.skill * x.cap, 0) / Math.max(1, cap);
  return Math.min(1, cap / Math.max(1, staff)) * skill / 100;
}

// ---------- pricing & competition ----------
const compKey = (city, type) => `${city}:${type}`;
export function competition(s, b) {
  const main = parcelById(s, b.mainId);
  if (!main) return null;
  const k = compKey(main.city, b.type);
  s.comp ||= {};
  if (!s.comp[k]) s.comp[k] = { price: 1, level: clamp(0.35 + Math.random() * 0.3, 0, 1), war: 0, warDepth: 0 };
  return s.comp[k];
}
export function setPrice(s, bizId, v) {
  const b = bizById(s, bizId);
  if (!b || isHQ(b)) return 'Not found';
  b.price = Math.round(clamp(v, PRICE_MIN, PRICE_MAX) * 100) / 100;
  return null;
}
export const compLevelLabel = l => l < 0.25 ? 'Low' : l < 0.5 ? 'Moderate' : l < 0.75 ? 'High' : 'Cut-throat';
// demand multiplier from your price vs competitors
export function priceDemandFactor(s, b) {
  const c = competition(s, b);
  const e = ELASTICITY[b.type] || 1.3;
  const rel = (b.price || 1) / (c ? c.price : 1);
  return Math.pow(rel, -e * (0.5 + (c ? c.level : 0.5))) * Math.pow(b.price || 1, -0.35);
}
function updateCompetition(s, report) {
  const seen = new Map();
  for (const b of s.businesses) {
    const c = competition(s, b);
    if (!c) continue;
    const main = parcelById(s, b.mainId);
    const k = compKey(main.city, b.type);
    if (!seen.has(k)) seen.set(k, { c, city: main.city, type: b.type, bizs: [] });
    seen.get(k).bizs.push(b);
  }
  for (const { c, city, type, bizs } of seen.values()) {
    const myPrice = bizs.reduce((a, b) => a + (b.price || 1), 0) / bizs.length;
    const myProfit = bizs.reduce((a, b) => a + (b.last ? b.last.profit : 0), 0);
    const name = `${BT[type].name.toLowerCase()}s in ${CITIES[city].name}`;
    if (c.war > 0) {
      c.war--;
      if (c.war === 0) {
        c.price = 0.97 + Math.random() * 0.06;
        c.level = clamp(c.level - 0.2, 0.05, 1);
        report.events.push({ tone: 'good', text: `The price war among ${name} is over — some competitors went under` });
      }
      continue;
    }
    // competitors drift back toward normal prices, and react when you undercut them
    let target = 1;
    if (myPrice < c.price * 0.9) target = Math.max(0.75, myPrice * 1.04);
    c.price = clamp(c.price + (target - c.price) * 0.08 + gauss(0, 0.01), 0.6, 1.5);
    // profitable markets attract new competitors; aggressive pricing scares them off
    c.level = clamp(c.level + (myProfit > 0 ? 0.002 : -0.002) + (myPrice < 0.85 ? -0.003 : 0) + (myPrice > 1.25 ? 0.003 : 0) + gauss(0, 0.004), 0.05, 1);
    // rare price war — much likelier when you undercut hard
    const odds = 0.003 * (myPrice < 0.85 ? 4 : 1) * (0.5 + c.level);
    if (Math.random() < odds) {
      c.war = randi(7, 14);
      c.warDepth = rand(0.25, 0.4);
      c.price = clamp(1 - c.warDepth, 0.55, 0.8);
      report.events.push({ tone: 'bad', text: `⚔️ Price war! Competing ${name} cut prices ${Math.round(c.warDepth * 100)}% for ${c.war} days` });
    }
  }
}

// ---------- stock ----------
export const usesStock = b => !!STOCK[b.type];
export function unitCost(s, b) {
  const t = BT[b.type];
  const main = parcelById(s, b.mainId);
  return t.ticket * t.cogs * CITIES[main ? main.city : 'london'].spend * stockCostMult(s, b.type);
}
export function storageCap(s, b) {
  const t = BT[b.type];
  const main = parcelById(s, b.mainId), wh = parcelById(s, b.warehouseId);
  let cap = main ? t.serve * main.cap * 1.05 * 10 : 0;
  if (wh) cap += t.serve * wh.cap * 2.2 * 10;
  return Math.max(1, Math.floor(cap));
}
export const incomingStock = b => (b.incoming || []).reduce((a, o) => a + o.qty, 0);
export function dailySales(s, b) {
  const t = BT[b.type];
  const h = b.history.slice(-3).filter(x => x.customers > 0);
  if (h.length) return h.reduce((a, x) => a + x.customers, 0) / h.length;
  const main = parcelById(s, b.mainId);
  const demand = main ? t.serve * main.cap * 1.05 : t.serve * 4;
  const floor = workersOf(s, b.id, 'floor');
  const staffCap = floor.reduce((a, w) => a + productivity(w.skill, t.skillImpact), 0) * t.serve;
  if (floor.length) return Math.min(demand, staffCap);
  const eq = positionCapacity(s, b, 'floor');           // no staff yet: what the equipment could handle
  return Math.min(demand, Math.max(1, Math.min(eq.cap || 2, 4)) * t.serve * 0.8);
}
export function stockQuote(s, b, qty) {
  const room = storageCap(s, b) - Math.floor(b.stock || 0) - incomingStock(b);
  return { qty, cost: Math.ceil(qty * unitCost(s, b)), room: Math.max(0, room) };
}
export function orderStock(s, bizId, qty, auto = false) {
  const b = bizById(s, bizId);
  if (!b || !usesStock(b)) return 'This business has no stock';
  if (STOCK[b.type].auctionOnly) return 'Cheap cars can only be bought at the car auction';
  if (!parcelById(s, b.mainId)) return 'Get a location first';
  qty = Math.floor(qty);
  const q = stockQuote(s, b, qty);
  if (qty < 1) return 'Nothing to order';
  if (qty > q.room) return q.room ? `Only room for ${q.room} more ${STOCK[b.type].unit}` : 'Storage is full';
  if (s.cash < q.cost) return `You need ${fmt(q.cost)}`;
  s.cash -= q.cost;
  b.incoming ||= [];
  b.incoming.push({ qty, arrive: s.day + STOCK_DELIVERY_DAYS, paid: q.cost });
  if (!auto) log(s, `Ordered ${qty.toLocaleString('en-US')} ${STOCK[b.type].unit} for ${b.name} (${fmt(q.cost)}), arriving day ${s.day + STOCK_DELIVERY_DAYS}`, 'info');
  return null;
}
function receiveStock(s, b) {
  if (!b.incoming || !b.incoming.length) return 0;
  const due = b.incoming.filter(o => o.arrive <= s.day);
  b.incoming = b.incoming.filter(o => o.arrive > s.day);
  const n = due.reduce((a, o) => a + o.qty, 0);
  b.stock = (b.stock || 0) + n;
  b.stockValue = (b.stockValue || 0) + due.reduce((a, o) => a + o.paid, 0);
  return n;
}
function autoRestock(s, b, report) {
  if (!usesStock(b) || !b.autoStock || STOCK[b.type].auctionOnly || !parcelById(s, b.mainId)) return;
  const target = Math.ceil(dailySales(s, b) * AUTO_STOCK_DAYS);
  const pending = Math.floor(b.stock || 0) + incomingStock(b);
  let qty = Math.min(target - pending, stockQuote(s, b, 0).room);
  if (qty < Math.max(1, target * 0.15)) return; // don't place tiny orders every day
  const per = unitCost(s, b);
  if (s.cash < qty * per) qty = Math.floor(Math.max(0, s.cash) / per);
  if (qty < 1) { report.events.push({ tone: 'bad', text: `Auto-restock for ${b.name} skipped — not enough cash` }); return; }
  orderStock(s, b.id, qty, true);
}

export function setAutoStock(s, bizId, on) { const b = bizById(s, bizId); if (b && !STOCK[b.type].auctionOnly) b.autoStock = !!on; }

// ---------- car tiers ----------
export const carsSold = (s, type) => Math.floor((s.stats && s.stats.sold[type]) || 0);
export function tierLock(s, typeId) {
  const t = BT[typeId];
  if (t && t.unlockNW && !s.businesses.some(b => b.type === typeId) && netWorth(s) < t.unlockNW) return `Unlocks at ${fmt(t.unlockNW)} net worth (you have ${fmt(netWorth(s))})`;
  const tier = CAR_TIERS.find(x => x.type === typeId);
  if (!tier || !tier.unlock) return null;
  if (s.businesses.some(b => b.type === typeId)) return null; // already have one
  const sold = carsSold(s, tier.unlock.type);
  if (sold >= tier.unlock.sold) return null;
  return `Sell ${tier.unlock.sold.toLocaleString('en-US')} ${BT[tier.unlock.type].tierName.toLowerCase()} first (${sold.toLocaleString('en-US')} so far)`;
}

// ---------- car auction (cheap cars only) ----------
export function refreshAuction(s) {
  s.auction ||= { day: 0, lots: [] };
  if (s.auction.day === s.day) return;
  const lots = Math.min(48, 8 + 4 * s.businesses.filter(b => b.type === 'usedcars').length);
  s.auction = {
    day: s.day,
    lots: Array.from({ length: lots }, () => ({
      id: uid(s), model: `${randi(2006, 2019)} ${pick(AUCTION_MODELS)}`, km: randi(60, 260) * 1000,
      ratio: Math.round(clamp(gauss(0.78, 0.1), 0.5, 1.02) * 100) / 100,
    })).sort((a, c) => a.ratio - c.ratio),
  };
}
export function lotPrice(s, lot, b) {
  const main = parcelById(s, b && b.mainId);
  return Math.round(lot.ratio * BT.usedcars.ticket * CITIES[main ? main.city : 'london'].spend / 10) * 10;
}
export const BID_DISCOUNT = 0.15, BID_WIN_CHANCE = 0.45;
function auctionCheck(s, lotId, bizId) {
  const lot = s.auction.lots.find(x => x.id === lotId);
  if (!lot) return { err: 'That car is gone' };
  const b = bizById(s, bizId);
  if (!b || b.type !== 'usedcars') return { err: 'Pick a budget car dealership' };
  if (!parcelById(s, b.mainId)) return { err: `${b.name} needs a location first` };
  const room = storageCap(s, b) - Math.floor(b.stock || 0) - incomingStock(b) - s.bids.filter(x => x.bizId === b.id).length;
  if (room < 1) return { err: `${b.name}'s lot is full` };
  return { lot, b };
}
export function buyLot(s, lotId, bizId) {
  const { err, lot, b } = auctionCheck(s, lotId, bizId);
  if (err) return err;
  const price = lotPrice(s, lot, b);
  if (s.cash < price) return `You need ${fmt(price)}`;
  s.cash -= price;
  b.incoming ||= [];
  b.incoming.push({ qty: 1, arrive: s.day + STOCK_DELIVERY_DAYS, paid: price, label: lot.model });
  s.auction.lots = s.auction.lots.filter(x => x !== lot);
  return null;
}
export function bidLot(s, lotId, bizId) {
  const { err, lot, b } = auctionCheck(s, lotId, bizId);
  if (err) return err;
  const price = Math.round(lotPrice(s, lot, b) * (1 - BID_DISCOUNT) / 10) * 10;
  if (s.cash < price) return `You need ${fmt(price)} to back the bid`;
  s.bids.push({ id: lot.id, model: lot.model, bizId: b.id, price });
  s.auction.lots = s.auction.lots.filter(x => x !== lot);
  return null;
}
function resolveBids(s, report) {
  if (!s.bids || !s.bids.length) return;
  let won = 0, lost = 0, spent = 0;
  for (const bid of s.bids) {
    const b = bizById(s, bid.bizId);
    if (b && Math.random() < BID_WIN_CHANCE && s.cash >= bid.price) {
      s.cash -= bid.price; spent += bid.price; won++;
      b.incoming ||= [];
      b.incoming.push({ qty: 1, arrive: s.day + STOCK_DELIVERY_DAYS, paid: bid.price, label: bid.model });
    } else lost++;
  }
  s.bids = [];
  report.events.push({ tone: won ? 'good' : 'bad', text: `Car auction: won ${won} of ${won + lost} bid${won + lost > 1 ? 's' : ''}${won ? ` (${fmt(spent)})` : ''}` });
}
export function requirements(s, b) {
  const t = BT[b.type];
  const issues = [];
  const main = parcelById(s, b.mainId);
  const wh = parcelById(s, b.warehouseId);
  if (!main) issues.push(`Get a ${t.premises.map(k => KINDS[k].short.toLowerCase()).join(' or ')} location (${SIZES[t.minSize].label}+)`);
  if (t.warehouse && !wh) issues.push('Rent or buy a warehouse');
  if (main && !equipCount(b, 'floor')) issues.push(`Buy equipment: ${EQUIPMENT[b.type].name.toLowerCase()}`);
  if (t.warehouse && wh && !equipCount(b, 'warehouse')) issues.push(`Buy warehouse equipment: ${WAREHOUSE_EQUIPMENT.name.toLowerCase()}`);
  if (main && workersOf(s, b.id, 'floor').length === 0) issues.push(`Hire at least one ${t.role}`);
  if (t.warehouse && wh && workersOf(s, b.id, 'warehouse').length === 0) issues.push('Hire warehouse workers');
  if (main && workersOf(s, b.id, 'cleaner').length === 0) issues.push('Hire a cleaner');
  if (main && usesStock(b) && (b.stock || 0) < 1) {
    const next = (b.incoming || []).map(o => o.arrive).sort((a, c) => a - c)[0];
    issues.push(next ? `Waiting for stock (arrives day ${next})` : STOCK[b.type].auctionOnly ? `Buy cars at the auction (they arrive ${STOCK_DELIVERY_DAYS} days later)` : `Order stock (arrives ${STOCK_DELIVERY_DAYS} days after ordering)`);
  }
  if (main && needsSecurity(b) && workersOf(s, b.id, 'security').length === 0) issues.push('Hire a security guard');
  return issues;
}

export function buyEquipment(s, bizId, group, n = 1) {
  const b = bizById(s, bizId);
  const eq = b && equipFor(b, group);
  if (!eq) return 'Not found';
  if (!slotParcel(s, b, group === 'floor' ? 'main' : group)) return `Get ${group === 'floor' ? 'a location' : group === 'office' ? 'an office' : 'a warehouse'} first`;
  const c = positionCapacity(s, b, group === 'office' ? 'recruiter' : group);
  if (equipCount(b, group) * eq.staff >= c.spaceCap) return `No room: this ${group === 'floor' ? 'location' : group} fits ${c.spaceCap} people`;
  const cost = eq.cost * n;
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  b.equip ||= {};
  b.equip[group] = equipCount(b, group) + n;
  log(s, `Bought ${n > 1 ? n + '× ' : ''}${eq.name.toLowerCase()} for ${b.name}`, 'info');
  return null;
}
export function sellEquipment(s, bizId, group) {
  const b = bizById(s, bizId);
  const eq = b && equipFor(b, group);
  if (!eq || !equipCount(b, group)) return 'Nothing to sell';
  const used = positionCapacity(s, b, group === 'office' ? 'recruiter' : group).used;
  if ((equipCount(b, group) - 1) * eq.staff < used) return 'Someone is using it — move or fire staff first';
  b.equip[group]--;
  const v = Math.round(eq.cost * EQUIP_RESALE);
  s.cash += v;
  log(s, `Sold ${eq.name.toLowerCase()} for ${fmt(v)}`, 'info');
  return null;
}

export function parcelFits(s, b, p, slot) {
  if (isHQ(b)) return slot === 'office' && p.kind === 'office' ? null : 'Headquarters needs an office';
  const t = BT[b.type];
  if (slot === 'main') {
    if (!t.premises.includes(p.kind)) return `${t.name} needs a ${t.premises.join(' or ')} parcel`;
    if (!sizeAtLeast(p.size, t.minSize)) return `Needs ${SIZES[t.minSize].label} or bigger`;
    if (t.airport && !districtOf(p).big) return 'Airlines need an airport parcel';
  }
  if (slot === 'office' && p.kind !== 'office') return 'Needs an office';
  if (slot === 'warehouse' && p.kind !== 'warehouse') return 'Needs a warehouse';
  return null;
}

// ---------- money / rank ----------
export function businessValue(s, b) {
  const h = b.history.slice(-14);
  if (!h.length) return 0;
  const avg = h.reduce((a, x) => a + x.profit, 0) / h.length;
  return Math.max(0, Math.round(avg * 90));
}
export function netWorth(s) {
  let ops = 0;
  for (const p of s.parcels) if (p.status === 'owned') ops += parcelValue(s, p);
  for (const b of s.businesses) ops += businessValue(s, b);
  let other = 0;
  if (s.factories) {
    const { portfolioValue } = EMP;
    const port = portfolioValue(s);
    ops += empireAssets(s) - port + billionAssets(s);
    other += port;
  }
  const own = s.ipo ? 1 - s.ipo.pct : 1; // after going public you only own part of the company
  return Math.round(s.cash + other + ops * own);
}
export function rankFor(nw) {
  let r = RANKS[0];
  for (const x of RANKS) if (nw >= x.min) r = x;
  return r.title;
}
export const jobInfo = s => JOB_LADDER[Math.min(s.job.level, JOB_LADDER.length - 1)];

export function taxFor(income) {
  let tax = 0, prev = 0;
  const parts = [];
  for (const br of TAX_BRACKETS) {
    if (income <= prev) break;
    const slice = Math.min(income, br.upTo) - prev;
    tax += slice * br.rate;
    parts.push({ rate: br.rate, slice });
    prev = br.upTo;
  }
  return { tax: Math.round(tax), effective: income > 0 ? tax / income : 0, top: parts.length ? parts[parts.length - 1].rate : TAX_BRACKETS[0].rate };
}
export function accountantRelief(s) {
  let r = 0;
  for (const w of s.workers) if (w.pos === 'accountant' && officeOk(s, w)) r += 0.04 * (0.5 + w.skill / 100);
  return Math.min(0.3, r);
}
export function taxEstimate(s) {
  const base = taxFor(Math.max(0, s.tax.periodIncome));
  const relief = accountantRelief(s);
  return { ...base, relief, due: Math.round(base.tax * (1 - relief)), daysLeft: TAX_PERIOD - ((s.day - 1) % TAX_PERIOD) };
}
function officeOk(s, w) {
  const b = bizById(s, w.bizId);
  return b && parcelById(s, b.officeId);
}

// ---------- recruiting ----------
function makeCandidate(s, skill, src) {
  return { id: uid(s), name: `${pick(FIRST)} ${pick(LAST)}`, skill: Math.round(clamp(skill, 1, 99)), src };
}
export function recruiters(s) {
  return s.workers.filter(w => w.pos === 'recruiter' && officeOk(s, w));
}
export function refreshPools(s) {
  s.pools.day = s.day;
  s.pools.jobCenter = Array.from({ length: 10 }, () => makeCandidate(s, gauss(19, 8), 'jobCenter'));
  const recs = recruiters(s).slice(0, 3);
  if (recs.length) {
    const avg = recs.reduce((a, w) => a + w.skill, 0) / recs.length;
    const n = Math.min(300, RECRUITER_DAILY * recs.length);
    s.pools.recruiter = Array.from({ length: n }, () => makeCandidate(s, clamp(gauss(36 + 0.45 * avg, 12), 28, 99), 'recruiter'))
      .sort((a, b) => b.skill - a.skill);
  } else s.pools.recruiter = [];
  s.hiresToday = { jobCenter: 0, recruiter: 0 };
}
export const hireLimit = (s, src) => src === 'jobCenter' ? JOB_CENTER_DAILY : RECRUITER_DAILY * Math.min(3, recruiters(s).length);
export const hireFee = (s, src, b) => src === 'jobCenter' ? Math.round(JOB_CENTER_FEE * CITIES[bizCity(s, b) || 'london'].wage) : 0;

// ---------- recruitment searches ----------
// A search finds candidates; when it finishes they wait on a shortlist and you pick who to hire.
// Job Center: you choose size and wait (rush costs more). Your own recruiters: free, always 3 days.
export const RECRUIT = {
  jobCenter: { name: 'Public Job Center', perDay: 10, maxDays: 7, fee: 60, skill: [19, 8], minSkill: 1, maxSkill: 60 },
  recruiter: { name: 'Your Recruiters', perSearch: 100, fixedDays: 3, fee: 0, skill: [36, 12], minSkill: 25, maxSkill: 99 },
};
export const SHORTLIST_DAYS = 5; // candidates wait this long before taking other jobs
// rush costs more, patience is cheaper: 1 day ×2.2, 3 days ×1.13, 7 days ×0.83
export const speedMult = days => 0.6 + 1.6 / days;

export function freeSpots(s, b, pos) {
  const c = positionCapacity(s, b, pos);
  return c.parcel ? Math.max(0, c.cap - c.used) : 0;
}
function recruiterAvg(s) {
  const recs = recruiters(s).slice(0, 3);
  return recs.length ? recs.reduce((a, w) => a + w.skill, 0) / recs.length : 0;
}
function skillMean(s, src, days) {
  const R = RECRUIT[src];
  if (src === 'recruiter') return R.skill[0] + 0.45 * recruiterAvg(s);
  return R.skill[0] + Math.min(12, (days - 1) * 1.5); // longer Job Center searches find better people
}
export const searchDays = (src, days) => src === 'recruiter' ? RECRUIT.recruiter.fixedDays : days;

export function quoteRecruit(s, { src, bizId, pos, count, days }) {
  const R = RECRUIT[src];
  days = searchDays(src, days);
  const b = bizById(s, bizId);
  const q = { ok: false, error: null, maxCount: 0, perHire: 0, total: 0, mult: src === 'recruiter' ? 0 : speedMult(days), days, skillLo: 0, skillHi: 0, free: 0, arrive: s.day + days, warn: null };
  if (!b) { q.error = 'Pick a business'; return q; }
  if (src === 'recruiter' && !recruiters(s).length) { q.error = 'Hire a Recruiter into an office first'; return q; }
  if (pos === 'warehouse' && !BT[b.type].warehouse) { q.error = `${b.name} doesn't use a warehouse`; return q; }
  const c = positionCapacity(s, b, pos);
  q.free = freeSpots(s, b, pos);
  if (!c.parcel) q.warn = `${b.name} has no ${POSITIONS[pos].where === 'office' ? 'office' : POSITIONS[pos].where === 'warehouse' ? 'warehouse' : 'location'} yet — get one before the candidates arrive`;
  else if (c.equip && c.equipCap <= c.used) q.warn = `No room right now — buy more equipment (${c.equip.name.toLowerCase()}) before they arrive`;
  else if (!q.free) q.warn = 'No free spots right now — make room before they arrive, or hire them as unassigned staff';
  q.maxCount = src === 'recruiter' ? R.perSearch * Math.min(3, recruiters(s).length) : R.perDay * days;
  const city = CITIES[(c.parcel || slotParcel(s, b, 'main') || { city: 'london' }).city];
  q.perHire = src === 'recruiter' ? 0 : Math.round(R.fee * city.wage * q.mult);
  q.total = q.perHire * count;
  const m = skillMean(s, src, days);
  q.skillLo = Math.round(clamp(m - R.skill[1], R.minSkill, R.maxSkill));
  q.skillHi = Math.round(clamp(m + R.skill[1], R.minSkill, R.maxSkill));
  q.wageLo = wageFor(s, { skill: q.skillLo, pos }, b);
  q.wageHi = wageFor(s, { skill: q.skillHi, pos }, b);
  if (count > q.maxCount) q.error = `Max ${q.maxCount} candidates${src === 'recruiter' ? ' per search' : ` in ${days} day${days > 1 ? 's' : ''}`}`;
  else if (count < 1) q.error = 'Choose how many candidates';
  else if (s.cash < q.total) q.error = `You need ${fmt(q.total)}`;
  else q.ok = true;
  return q;
}

export function startRecruit(s, opts) {
  const q = quoteRecruit(s, opts);
  if (!q.ok) return q.error;
  s.cash -= q.total;
  s.orders ||= [];
  s.orders.push({ id: uid(s), src: opts.src, bizId: opts.bizId, pos: opts.pos, count: opts.count, days: q.days, started: s.day, arrive: s.day + q.days, paid: q.total, mean: skillMean(s, opts.src, q.days) });
  const b = bizById(s, opts.bizId);
  log(s, `Searching for ${opts.count} ${opts.pos === 'floor' ? BT[b.type].role : POSITIONS[opts.pos].name} candidate${opts.count > 1 ? 's' : ''} for ${b.name} — ready day ${s.day + q.days}`, 'info');
  return null;
}

export function cancelOrder(s, id) {
  const o = (s.orders || []).find(x => x.id === id);
  if (!o) return 'Not found';
  const refund = Math.round(o.paid * 0.5);
  s.cash += refund;
  s.orders = s.orders.filter(x => x !== o);
  log(s, `Cancelled a search${refund ? ` (${fmt(refund)} refunded)` : ''}`, 'info');
  return null;
}

function deliverOrders(s, report) {
  s.shortlists ||= [];
  const due = (s.orders || []).filter(o => o.arrive <= s.day);
  for (const o of due) {
    s.orders = s.orders.filter(x => x !== o);
    const R = RECRUIT[o.src];
    const b = bizById(s, o.bizId);
    const candidates = Array.from({ length: o.count }, () => ({ id: uid(s), name: `${pick(FIRST)} ${pick(LAST)}`, skill: Math.round(clamp(gauss(o.mean, R.skill[1]), R.minSkill, R.maxSkill)) }))
      .sort((a, c) => c.skill - a.skill);
    s.shortlists.push({ id: uid(s), src: o.src, bizId: o.bizId, pos: o.pos, cat: catFor(s, o.bizId, o.pos), arrived: s.day, expires: s.day + SHORTLIST_DAYS, candidates });
    const role = b ? (o.pos === 'floor' ? BT[b.type].role : POSITIONS[o.pos].name) : 'staff';
    const text = `Search done: ${o.count} ${role} candidate${o.count > 1 ? 's' : ''}${b ? ` for ${b.name}` : ''} are waiting (best skill ${candidates[0].skill}) — pick who to hire`;
    if (report) report.events.push({ tone: 'good', text });
    log(s, text, 'good');
  }
  // candidates who waited too long take other jobs
  for (const sl of s.shortlists.filter(x => x.expires <= s.day)) {
    s.shortlists = s.shortlists.filter(x => x !== sl);
    const text = `${sl.candidates.length} unpicked candidate${sl.candidates.length > 1 ? 's' : ''} took jobs elsewhere`;
    if (report) report.events.push({ tone: 'bad', text });
    log(s, text, 'bad');
  }
}

export const shortlistById = (s, id) => (s.shortlists || []).find(x => x.id === id);

export function hireFromShortlist(s, slId, candIds, bizId, pos) {
  const sl = shortlistById(s, slId);
  if (!sl) return 'Those candidates are gone';
  sl.cat ||= catFor(s, sl.bizId, sl.pos);
  if (!bizId) { // hire as unassigned staff, place them later
    const picks = sl.candidates.filter(x => candIds.includes(x.id));
    if (!picks.length) return 'Select someone to hire';
    const ref = bizById(s, sl.bizId) || s.businesses[0] || null;
    for (const x of picks) {
      const full = ref ? wageFor(s, { skill: x.skill, pos: sl.pos }, ref) : Math.round(80 * (0.6 + 0.9 * x.skill / 100));
      s.workers.push({ id: x.id, name: x.name, skill: x.skill, bizId: null, pos: sl.pos, cat: sl.cat, hired: s.day, fullWage: full, benchWage: Math.round(full * BENCH_PAY) });
    }
    sl.candidates = sl.candidates.filter(x => !candIds.includes(x.id));
    if (!sl.candidates.length) s.shortlists = s.shortlists.filter(x => x !== sl);
    log(s, `Hired ${picks.length} as unassigned staff`, 'good');
    return null;
  }
  const b = bizById(s, bizId);
  if (!b) return 'Pick a business';
  pos = posForCat(s, b, sl.cat);
  if (!pos) return `These candidates are ${catLabel(sl.cat)}s — ${b.name} has no job for them`;
  const c = positionCapacity(s, b, pos);
  if (!c.parcel) return `${b.name} needs ${POSITIONS[pos].where === 'office' ? 'an office' : POSITIONS[pos].where === 'warehouse' ? 'a warehouse' : 'a location'} first`;
  const free = c.cap - c.used;
  const picks = sl.candidates.filter(x => candIds.includes(x.id));
  if (!picks.length) return 'Select someone to hire';
  if (picks.length > free) return free <= 0
    ? (c.equip && c.equipCap < c.spaceCap ? `No room — buy more equipment (${c.equip.name.toLowerCase()})` : 'No free spots there')
    : `Only ${free} free spot${free === 1 ? '' : 's'} there`;
  for (const x of picks) s.workers.push({ id: x.id, name: x.name, skill: x.skill, bizId: b.id, pos, cat: sl.cat === 'floor' ? catFor(s, b.id, 'floor') : sl.cat, hired: s.day });
  sl.candidates = sl.candidates.filter(x => !candIds.includes(x.id));
  if (!sl.candidates.length) s.shortlists = s.shortlists.filter(x => x !== sl);
  log(s, `Hired ${picks.length} ${pos === 'floor' ? BT[b.type].role : POSITIONS[pos].name}${picks.length > 1 ? 's' : ''} for ${b.name}`, 'good');
  return null;
}

export function dismissShortlist(s, slId) {
  s.shortlists = (s.shortlists || []).filter(x => x.id !== slId);
  return null;
}

// ---------- actions (return null on success, or an error string) ----------
function log(s, text, tone = 'info') {
  s.log.unshift({ day: s.day, text, tone });
  s.log.length = Math.min(s.log.length, 60);
}

export function foundBusiness(s, typeId, name) {
  const t = BT[typeId];
  if (!t) return 'Unknown business type';
  const lock = tierLock(s, typeId);
  if (lock) return lock;
  if (s.cash < t.license) return `You need ${fmt(t.license)} for the license`;
  s.cash -= t.license;
  const b = {
    id: uid(s), type: typeId, name: (name || '').trim().slice(0, 30) || `${s.ceo}'s ${t.name}`,
    mainId: null, officeId: null, warehouseId: null, rep: 40, ads: 0, founded: s.day,
    history: [], effects: [], last: null, equip: { floor: 0, warehouse: 0, office: 0 }, stock: 0, stockValue: 0, incoming: [], autoStock: false, morale: 70, payLevel: 1, insured: false, downtime: null,
    days: [true, true, true, true, true, true, true], hours: BASE_HOURS, price: 1,
  };
  s.businesses.push(b);
  log(s, `Founded ${b.name} (${t.name}) for ${fmt(t.license)}`, 'good');
  return { id: b.id };
}

export function acquireParcel(s, parcelId, mode, bizId, slot) {
  const p = parcelById(s, parcelId);
  if (!p || p.status !== 'market') return 'Parcel no longer available';
  const b = bizId ? bizById(s, bizId) : null;
  if (b) {
    const err = parcelFits(s, b, p, slot);
    if (err) return err;
  }
  const cost = mode === 'buy' ? parcelValue(s, p) : moveInCost(s, p);
  if (s.cash < cost) return `Not enough cash (${fmt(cost)} needed)`;
  s.cash -= cost;
  if (mode === 'buy') { p.status = 'owned'; p.boughtFor = parcelValue(s, p); }
  else { p.status = 'rented'; p.rentLocked = parcelRent(s, p); p.leaseEnd = s.day + LEASE_DAYS; }
  log(s, `${mode === 'buy' ? 'Bought' : 'Rented'} ${KINDS[p.kind].short.toLowerCase()} at ${p.address}, ${districtOf(p).name}`, 'info');
  if (b) assignParcel(s, p.id, b.id, slot);
  return null;
}

export function assignParcel(s, parcelId, bizId, slot) {
  const p = parcelById(s, parcelId);
  const b = bizById(s, bizId);
  if (!p || !b) return 'Not found';
  const err = parcelFits(s, b, p, slot);
  if (err) return err;
  if (p.bizId && p.bizId !== bizId) return 'Parcel is used by another business';
  const key = slot === 'main' ? 'mainId' : slot === 'office' ? 'officeId' : 'warehouseId';
  const old = parcelById(s, b[key]);
  if (old && old.id !== p.id) old.bizId = null;
  b[key] = p.id;
  p.bizId = b.id;
  trimStaff(s, b);
  return null;
}

function trimStaff(s, b) {
  const groups = [['floor'], ['warehouse'], OFFICE_ROLES, SUPPORT_ROLES];
  for (const g of groups) {
    const { cap } = positionCapacity(s, b, g[0]);
    const ws = s.workers.filter(w => w.bizId === b.id && g.includes(w.pos)).sort((a, c) => c.skill - a.skill);
    if (ws.length > cap) {
      const out = ws.slice(cap);
      for (const w of out) toBench(s, w);
      log(s, `${out.length} staff at ${b.name} moved to Unassigned (no room)`, 'bad');
    }
  }
}

export function unassignParcel(s, parcelId) {
  const p = parcelById(s, parcelId);
  if (!p || !p.bizId) return null;
  const b = bizById(s, p.bizId);
  if (b) {
    for (const k of ['mainId', 'officeId', 'warehouseId']) if (b[k] === p.id) b[k] = null;
    p.bizId = null;
    trimStaff(s, b);
  }
  p.bizId = null;
  return null;
}

export function releaseParcel(s, parcelId) {
  const p = parcelById(s, parcelId);
  if (!p) return 'Not found';
  unassignParcel(s, parcelId);
  if (p.status === 'owned') {
    const v = Math.round(parcelValue(s, p) * 0.95);
    s.cash += v;
    log(s, `Sold ${p.address} for ${fmt(v)}`, 'good');
  } else log(s, `Ended lease at ${p.address}`, 'info');
  p.status = 'market'; p.rentLocked = 0; p.boughtFor = 0;
  return null;
}

export function staffAffected(s, parcelId) {
  const p = parcelById(s, parcelId);
  if (!p || !p.bizId) return 0;
  const b = bizById(s, p.bizId);
  if (!b) return 0;
  if (b.mainId === p.id) return s.workers.filter(w => w.bizId === b.id && (w.pos === 'floor' || SUPPORT_ROLES.includes(w.pos))).length;
  if (b.warehouseId === p.id) return workersOf(s, b.id, 'warehouse').length;
  if (b.officeId === p.id) return s.workers.filter(w => w.bizId === b.id && OFFICE_ROLES.includes(w.pos)).length;
  return 0;
}

export function hire(s, candIds, bizId, pos) {
  const b = bizById(s, bizId);
  if (!b) return 'Pick a business';
  const { cap, used, parcel } = positionCapacity(s, b, pos);
  if (!parcel) return `${b.name} needs ${POSITIONS[pos].where === 'office' ? 'an office' : POSITIONS[pos].where === 'warehouse' ? 'a warehouse' : 'a location'} first`;
  if (pos === 'warehouse' && !BT[b.type].warehouse) return `${b.name} doesn't use a warehouse`;
  const cands = candIds.map(id => s.pools.jobCenter.find(c => c.id === id) || s.pools.recruiter.find(c => c.id === id)).filter(Boolean);
  if (!cands.length) return 'Those candidates are gone';
  if (used + cands.length > cap) return `Only ${cap - used} free spot${cap - used === 1 ? '' : 's'} there`;
  for (const src of ['jobCenter', 'recruiter']) {
    const n = cands.filter(c => c.src === src).length;
    if (n && s.hiresToday[src] + n > hireLimit(s, src)) return `Daily limit: ${hireLimit(s, src) - s.hiresToday[src]} more hire(s) from ${src === 'jobCenter' ? 'the Job Center' : 'your recruiters'} today`;
  }
  const fee = cands.reduce((a, c) => a + hireFee(s, c.src, b), 0);
  if (s.cash < fee) return `Hiring fees: ${fmt(fee)} needed`;
  s.cash -= fee;
  for (const c of cands) {
    s.workers.push({ id: c.id, name: c.name, skill: c.skill, bizId: b.id, pos, hired: s.day });
    s.hiresToday[c.src]++;
    s.pools[c.src] = s.pools[c.src].filter(x => x.id !== c.id);
  }
  log(s, `Hired ${cands.length} ${pos === 'floor' ? BT[b.type].role : POSITIONS[pos].name}${cands.length > 1 ? 's' : ''} for ${b.name}`, 'good');
  return null;
}

export function fire(s, workerIds) {
  const set = new Set(workerIds);
  const n = s.workers.filter(w => set.has(w.id)).length;
  s.workers = s.workers.filter(w => !set.has(w.id));
  if (n) log(s, `Let go of ${n} employee${n > 1 ? 's' : ''}`, 'info');
  return null;
}

export function moveWorker(s, workerId, pos) {
  const w = s.workers.find(x => x.id === workerId);
  const b = w && bizById(s, w.bizId);
  if (!b) return 'Not found';
  if (pos !== w.pos) return `${w.name} keeps their job as ${catLabel(catOf(s, w))}`;
  const { cap, used, parcel } = positionCapacity(s, b, pos);
  if (!parcel) return 'No room for that position';
  const sameGroup = groupKey(pos) === groupKey(w.pos);
  if (!sameGroup && used >= cap) return 'That location is full';
  w.pos = pos;
  return null;
}

export function closeBusiness(s, bizId) {
  const b = bizById(s, bizId);
  if (!b) return 'Not found';
  for (const w of s.workers.filter(x => x.bizId === b.id)) toBench(s, w); // staff stay with you, unassigned
  for (const k of ['mainId', 'officeId', 'warehouseId']) {
    const p = parcelById(s, b[k]);
    if (!p) continue;
    p.bizId = null;
    if (p.status === 'rented') { p.status = 'market'; p.rentLocked = 0; }
  }
  s.workers = s.workers.filter(w => w.bizId !== b.id);
  for (const w of s.workers) if (w.serves) w.serves = w.serves.filter(id => id !== b.id);
  s.bids = (s.bids || []).filter(x => x.bizId !== b.id);
  for (const o of (s.orders || []).filter(o => o.bizId === b.id)) { s.cash += o.paid; }
  s.orders = (s.orders || []).filter(o => o.bizId !== b.id);
  s.businesses = s.businesses.filter(x => x.id !== b.id);
  let resale = usesStock(b) ? ((b.stock || 0) + incomingStock(b)) * unitCost(s, b) * 0.5 : 0;
  for (const g of ['floor', 'warehouse', 'office']) { const eq = equipFor(b, g); if (eq) resale += equipCount(b, g) * eq.cost * EQUIP_RESALE; }
  s.cash += Math.round(resale);
  log(s, `Closed ${b.name}. Owned property kept${resale ? `, equipment & stock sold for ${fmt(resale)}` : ''}.`, 'bad');
  return null;
}

export function setAds(s, bizId, amount) {
  const b = bizById(s, bizId);
  if (b) b.ads = clamp(Math.round(amount), 0, 1e7);
}

export function quitJob(s) { s.job.employed = false; log(s, 'You quit your day job. Full delusion mode.', 'info'); }
export function rejoinJob(s) { s.job = { employed: true, level: 0, daysWorked: 0 }; log(s, `Back to work as ${JOB_LADDER[0].title}`, 'info'); }

// ---------- daily simulation ----------
const FOOD = ['coffee', 'bakery', 'restaurant', 'supermarket'];

function randomEvents(s, report) {
  for (const b of s.businesses) {
    if (!parcelById(s, b.mainId) || Math.random() > 0.05 || requirements(s, b).length || !isOpenOn(b, s.day)) continue;
    const roll = Math.random();
    const ws = s.workers.filter(w => w.bizId === b.id);
    if (roll < 0.22) {
      b.effects.push({ mult: 1.6, days: 3, label: 'Viral on social media' });
      report.events.push({ tone: 'good', text: `${b.name} went viral! +60% demand for 3 days` });
    } else if (roll < 0.36) {
      b.rep = clamp(b.rep + 8, 0, 100);
      report.events.push({ tone: 'good', text: `A critic loved ${b.name}. Reputation +8` });
    } else if (roll < 0.52) {
      b.rep = clamp(b.rep - 10, 0, 100);
      report.events.push({ tone: 'bad', text: `An influencer trashed ${b.name}. Reputation −10` });
    } else if (roll < 0.66 && FOOD.includes(b.type)) {
      const fine = Math.round(400 * CITIES[bizCity(s, b)].cost * 2);
      s.cash -= fine; report.extra += fine;
      report.events.push({ tone: 'bad', text: `Health inspector fined ${b.name} ${fmt(fine)}` });
    } else if (roll < 0.8) {
      const p = parcelById(s, b.mainId);
      const cost = Math.round(250 * SIZES[p.size].cap / 4 * CITIES[p.city].cost * rand(0.6, 1.6));
      s.cash -= cost; report.extra += cost;
      report.events.push({ tone: 'bad', text: `Equipment broke at ${b.name}: repairs ${fmt(cost)}` });
    } else if (roll < 0.92 && ws.length) {
      const w = pick(ws);
      w.skill = Math.min(100, w.skill + 6);
      report.events.push({ tone: 'good', text: `${w.name} at ${b.name} had a breakthrough. Skill +6` });
    } else {
      const star = ws.filter(w => w.skill >= 65).sort((a, c) => c.skill - a.skill)[0];
      if (star) {
        recordDeparture(s, star);
        s.workers = s.workers.filter(w => w !== star);
        report.events.push({ tone: 'bad', text: `${star.name} (skill ${Math.round(star.skill)}) got poached from ${b.name}` });
      }
    }
  }
  if (Math.random() < 0.025) {
    const city = pick(Object.keys(CITIES));
    s.cityEffects.push({ city, mult: 1.3, days: 2, label: 'Festival' });
    report.events.push({ tone: 'good', text: `Festival in ${CITIES[city].name}: +30% customers there for 2 days` });
  }
}

function simulateBusiness(s, b, report) {
  const t = BT[b.type];
  const main = parcelById(s, b.mainId);
  const wh = parcelById(s, b.warehouseId);
  const all = s.workers.filter(w => w.bizId === b.id);
  const floor = all.filter(w => w.pos === 'floor');
  const whs = all.filter(w => w.pos === 'warehouse');
  const r = { id: b.id, name: b.name, type: b.type, revenue: 0, cogs: 0, wages: 0, property: 0, ads: 0, profit: 0, customers: 0, demand: 0, capacity: 0, sat: null, notes: [] };

  const down = downtimeToday(b);
  const open = isOpenOn(b, s.day) && !down;
  const hours = b.hours || BASE_HOURS;
  for (const w of all) r.wages += down && !down.paysWages ? 0 : wageToday(s, w, b, s.day);
  r.wages = Math.round(r.wages);
  for (const p of [main, wh, parcelById(s, b.officeId)]) if (p) r.property += parcelDailyCost(s, p);

  const received = usesStock(b) ? receiveStock(s, b) : 0;
  const issues = requirements(s, b);
  r.open = open;
  if (down && !issues.length) {
    r.notes.push(down.reason === 'strike' ? `✊ On strike (${down.days} more day${down.days > 1 ? 's' : ''}) — no sales, no wages` : `🔥 Closed for repairs (${down.days} more day${down.days > 1 ? 's' : ''})`);
    b.rep = clamp(b.rep - 0.5, 0, 100);
  } else if (!open && !issues.length) {
    r.notes.push(`Closed on ${DAY_SHORT[dowOf(s.day)]}s (your schedule)`);
  } else if (!issues.length) {
    const city = CITIES[main.city];
    const WF = worldFactors(s, b);
    r.notes.push(...WF.notes);
    // capacity
    let cap = floor.reduce((a, w) => a + productivity(w.skill, t.skillImpact), 0) * t.serve * hoursCapFactor(hours) * WF.capMult;
    if (t.warehouse) {
      const whCap = whs.reduce((a, w) => a + productivity(w.skill), 0) * t.serve * 2.2 * hoursCapFactor(hours);
      if (whCap < cap) r.notes.push('Warehouse is a bottleneck');
      cap = Math.min(cap, whCap);
    }
    // demand
    const trafficFactor = (1 - t.traffic) + t.traffic * main.traffic / 60;
    const repFactor = 0.5 + b.rep / 100;
    const adFactor = b.ads > 0 ? 1 + 0.22 * adMult(s) * Math.log10(1 + b.ads / (40 * city.cost)) : 1;
    let mkt = 1;
    for (const w of all) if (w.pos === 'marketing' && parcelById(s, b.officeId)) mkt += 0.18 * (0.5 + w.skill / 100);
    for (const w of s.workers) if (w.pos === 'marketing' && hqServes(s, w, b.id) && s.hq.officeId) mkt += 0.18 * (0.5 + w.skill / 100) / Math.sqrt(Math.max(1, hqServedList(s, w).length));
    mkt = Math.min(mkt, 1.8);
    const weekend = weekPattern(b)[dowOf(s.day)] * hoursDemandFactor(hours) * priceDemandFactor(s, b);
    let eff = 1;
    for (const e of b.effects) eff *= e.mult;
    for (const e of s.cityEffects) if (e.city === main.city) eff *= e.mult;
    const demand = t.serve * main.cap * 1.05 * trafficFactor * repFactor * adFactor * mkt * weekend * eff * WF.demand * rand(0.85, 1.15);
    const stockLimited = usesStock(b) && b.stock < Math.min(demand, cap);
    const served = usesStock(b) ? Math.min(demand, cap, b.stock) : Math.min(demand, cap);
    // satisfaction
    const avgSkill = floor.reduce((a, w) => a + w.skill, 0) / floor.length;
    let sat = 22 + avgSkill * 0.7;
    if (served < demand) sat -= (1 - served / demand) * 20; else sat += 5;
    const core = all.filter(w => !SUPPORT_ROLES.includes(w.pos)).length;
    const cleanNeed = Math.max(1, Math.ceil(core / CLEANER_RATIO));
    const cleaners = all.filter(w => w.pos === 'cleaner');
    if (cleaners.length < cleanNeed) { sat -= 18 * (1 - cleaners.length / cleanNeed); r.notes.push(`Messy: needs ${cleanNeed} cleaners (has ${cleaners.length})`); }
    else sat += Math.min(4, cleaners.reduce((a, w) => a + w.skill, 0) / cleaners.length / 25);
    const hrCap = hrCapacity(s, b);
    const priceRel = (b.price || 1) / (competition(s, b) || { price: 1 }).price;
    sat += clamp((1 - priceRel) * 25, -12, 10) + WF.satAdj;
    if (hours > 12) sat -= (hours - 12) * 1.5;
    if (all.length > 15 && hrCap < all.length) { sat -= 12; r.notes.push('Chaos: needs an HR Manager (office)'); }
    sat = clamp(sat, 0, 100);
    b.rep = clamp(b.rep * 0.92 + sat * 0.08, 0, 100);

    r.demand = Math.round(demand);
    r.capacity = Math.round(cap);
    r.customers = Math.round(served * 10) / 10;
    r.revenue = Math.round(served * t.ticket * (b.price || 1) * city.spend * (0.9 + sat / 500));
    if (usesStock(b)) {
      const avg = b.stock > 0 ? (b.stockValue || 0) / b.stock : unitCost(s, b);
      b.stock = Math.max(0, b.stock - served);
      r.cogs = r.prepaid = Math.round(served * avg); // already paid when ordered
      b.stockValue = b.stock > 0 ? Math.max(0, (b.stockValue || 0) - served * avg) : 0;
      s.stats.sold[b.type] = (s.stats.sold[b.type] || 0) + served;
      if (stockLimited) r.notes.push(`Ran out of stock — turned away ${Math.round(Math.min(demand, cap) - served)} customers`);
    } else r.cogs = Math.round(r.revenue * t.cogs);
    if (needsSecurity(b)) {
      const secNeed = Math.max(1, Math.ceil(core / SECURITY_RATIO));
      const guards = all.filter(w => w.pos === 'security');
      const gap = Math.max(0, 1 - guards.reduce((a, w) => a + productivity(w.skill), 0) / secNeed);
      if (gap > 0.01) {
        r.theft = Math.round(r.revenue * 0.12 * gap * rand(0.5, 1.5));
        r.cogs += r.theft;
        r.notes.push(`Theft cost ${fmt(r.theft)} — needs ${secNeed} good security guard${secNeed > 1 ? 's' : ''}`);
      }
    }
    r.ads = b.ads;
    r.sat = Math.round(sat);
    if (served < demand * 0.9 && !stockLimited) { const c = positionCapacity(s, b, 'floor'); r.notes.push(`Turned away ${Math.round(demand - served)} customers — ${c.used >= c.cap && c.equipCap < c.spaceCap ? 'buy more equipment so you can hire more staff' : 'hire more or better staff'}`); }
  } else {
    r.notes.push('Closed: ' + issues[0]);
    b.rep = clamp(b.rep * 0.98 + 40 * 0.02, 0, 100);
  }
  worldAfterBusiness(s, b, r, report);
  r.profit = r.revenue - r.cogs - r.wages - r.property - r.ads - (r.other || 0);

  // training
  const hrBoost = hrTraining(s, b, all.length);
  if (open) for (const w of all) w.skill = Math.min(100, w.skill + (0.06 + 0.3 * hrBoost) * (1 - w.skill / 105));

  if (usesStock(b)) { r.stockLeft = Math.floor(b.stock || 0); r.received = received; }
  b.effects = b.effects.map(e => ({ ...e, days: e.days - 1 })).filter(e => e.days > 0);
  b.last = r;
  b.history.push({ day: s.day, revenue: r.revenue, profit: r.profit, customers: r.customers, sat: r.sat });
  if (b.history.length > 60) b.history.shift();
  return r;
}

export function simulateDay(s) {
  checkRecovery(s);
  if (s.gameOver || s.bankruptcyPending) return null;
  const report = { day: s.day, salary: 0, promoted: null, businesses: [], events: [], idleProperty: 0, extra: 0, interest: 0, tax: null, net: 0, cashBefore: s.cash };

  randomEvents(s, report);
  updateEconomy(s, report);
  leaseDay(s, report);

  if (s.job.employed) {
    report.salary = jobInfo(s).pay;
    s.job.daysWorked++;
    if (s.job.daysWorked % DAYS_PER_PROMOTION === 0 && s.job.level < JOB_LADDER.length - 1) {
      s.job.level++;
      report.promoted = jobInfo(s).title;
      report.events.push({ tone: 'good', text: `Promoted to ${report.promoted}! Salary now ${fmt(jobInfo(s).pay)}/day` });
    }
  }

  for (const b of s.businesses) report.businesses.push(simulateBusiness(s, b, report));
  // headquarters: office cost + shared staff
  const hqStaff = s.workers.filter(w => w.bizId === HQ_ID);
  const hqOffice = parcelById(s, s.hq.officeId);
  report.hq = { wages: Math.round(hqStaff.reduce((a, w) => a + wageFor(s, w, s.hq), 0)), property: hqOffice ? parcelDailyCost(s, hqOffice) : 0 };
  report.hq.total = report.hq.wages + report.hq.property;
  report.bench = benchWorkers(s).reduce((a, w) => a + (w.benchWage || 0), 0);
  for (const w of hqStaff) w.skill = Math.min(100, w.skill + 0.06 * (1 - w.skill / 105));
  updateCompetition(s, report);
  for (const p of s.parcels) if (!p.bizId && (p.status === 'rented' || p.status === 'owned')) report.idleProperty += parcelDailyCost(s, p);

  const bizNet = report.businesses.reduce((a, r) => a + r.profit, 0);
  let net = report.salary + bizNet - report.idleProperty - report.extra - report.hq.total - report.bench;
  const prepaid = report.businesses.reduce((a, r) => a + (r.prepaid || 0), 0); // stock was paid when ordered
  s.cash += report.salary + bizNet + prepaid - report.idleProperty - report.hq.total - report.bench; // extra already deducted
  const emp = empireDay(s, report, bizNet - report.hq.total - report.bench, netWorth(s));
  s.cash += emp.cash;
  net += emp.net;
  const bil = billionDay(s, report);
  s.cash += bil.cash;
  net += bil.net;
  for (const b of s.businesses) autoRestock(s, b, report);
  if (s.cash < 0) {
    report.interest = Math.round(-s.cash * OVERDRAFT_RATE * overdraftMult(s));
    s.cash -= report.interest;
    net -= report.interest;
  }
  s.tax.periodIncome += net;

  // tax day
  if (s.day % TAX_PERIOD === 0) {
    const est = taxEstimate(s);
    est.due = Math.max(0, taxAdjust(s, est.due, report));
    report.tax = { income: Math.max(0, Math.round(s.tax.periodIncome)), due: est.due, effective: est.effective, top: est.top, relief: est.relief };
    s.cash -= est.due;
    net -= est.due;
    s.tax.history.unshift({ day: s.day, ...report.tax });
    s.tax.periodIncome = 0;
  }

  // markets & effects
  for (const c of Object.keys(s.index)) s.index[c] = clamp(s.index[c] * (1 + gauss(0.0004, 0.006)), 0.6, 2.5);
  s.cityEffects = s.cityEffects.map(e => ({ ...e, days: e.days - 1 })).filter(e => e.days > 0);

  report.net = Math.round(net);
  report.cashAfter = s.cash;
  s.cash = round(s.cash);

  if (s.cash < 0) s.negDays++; else s.negDays = 0;
  if (s.negDays >= BANKRUPT_DAYS + bankruptDaysBonus(s)) {
    // last chance: if selling assets could clear the overdraft, freeze time and let the player sell
    if (s.cash + liquidationValue(s) >= 0) {
      s.bankruptcyPending = true;
      report.lastChance = true;
      report.events.push({ tone: 'bad', text: `🏦 The bank calls in your ${fmt(-s.cash)} overdraft. Sell assets to repay it, or go bankrupt.` });
    } else { s.gameOver = true; s.gameOverReason = 'bankrupt'; report.gameOver = true; }
  }

  s.ledger.push({ day: s.day, cash: Math.round(s.cash), net: report.net });
  if (s.ledger.length > 200) s.ledger.shift();
  for (const e of report.events) log(s, e.text, e.tone);
  if (report.tax) log(s, `Paid ${fmt(report.tax.due)} income tax`, 'bad');

  resolveBids(s, report);
  s.day++;
  refreshAuction(s);
  deliverOrders(s, report);
  staffingDay(s, report);
  refreshPools(s);
  s.lastReport = report;
  return report;
}

// ---------- last chance before bankruptcy ----------
export function liquidationOptions(s) {
  const out = [];
  for (const p of s.parcels) if (p.status === 'owned') {
    const b = bizById(s, p.bizId);
    out.push({ kind: 'parcel', id: p.id, label: `${KINDS[p.kind].short}: ${p.address}`, sub: `${districtOf(p).name}, ${CITIES[p.city].name}${b ? ` · used by ${b.name}` : ' · unused'}`, value: Math.round(parcelValue(s, p) * 0.95) });
  }
  for (const f of s.factories || []) out.push({ kind: 'factory', id: f.id, label: EMP.FACTORIES[f.type].name, sub: `${CITIES[f.city].name} · level ${f.level}`, value: EMP.factoryValue(f) });
  for (const [t, h] of Object.entries((s.market && s.market.holdings) || {})) {
    const st = s.market.stocks[t];
    out.push({ kind: 'stock', id: t, label: `${h.qty.toLocaleString('en-US')} ${t} shares`, sub: st.name, value: Math.round(h.qty * st.price * (1 - EMP.TRADE_FEE)) });
  }
  if (s.sports && s.sports.club) out.push({ kind: 'club', id: 'club', label: s.sports.club.name, sub: 'Football club', value: EMP.clubValue(s) });
  return out.sort((a, b) => b.value - a.value);
}
export const liquidationValue = s => liquidationOptions(s).reduce((a, x) => a + x.value, 0);
export function liquidate(s, kind, id) {
  if (kind === 'parcel') return releaseParcel(s, id);
  if (kind === 'factory') return EMP.sellFactory(s, id);
  if (kind === 'stock') return EMP.tradeStock(s, id, -((s.market.holdings[id] || {}).qty || 0));
  if (kind === 'club') return EMP.sellClub(s);
  return 'Unknown asset';
}
// back in business once cash is non-negative
export function checkRecovery(s) {
  if (!s.bankruptcyPending || s.cash < 0) return false;
  s.bankruptcyPending = false;
  s.negDays = 0;
  log(s, 'Overdraft repaid — the bank backs off', 'good');
  return true;
}
export function declareBankruptcy(s) {
  if (checkRecovery(s)) return 'Your cash is positive — no need to go bankrupt';
  s.bankruptcyPending = false;
  s.declaredBankrupt = true;
  s.gameOver = true;
  s.gameOverReason = 'bankrupt';
  s.day++;
  return null;
}

export function simulateDays(s, n) {
  const reports = [];
  for (let i = 0; i < n && !s.gameOver && !s.bankruptcyPending; i++) reports.push(simulateDay(s));
  return reports;
}

// ---------- formatting ----------
export function fmt(v, opts = {}) {
  const neg = v < 0;
  const a = Math.abs(v);
  let str;
  if (opts.compact !== false && a >= 1e9) str = (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
  else if (opts.compact !== false && a >= 1e6) str = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  else if (opts.compact !== false && a >= 1e5) str = (a / 1e3).toFixed(0) + 'K';
  else str = Math.round(a).toLocaleString('en-US');
  return (neg ? '−$' : '$') + str;
}
