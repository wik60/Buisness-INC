// Simulation engine for Delusional Business Inc. (no DOM access here)
import {
  CITIES, SIZES, SIZE_ORDER, BUSINESS_TYPES, BT, POSITIONS, OFFICE_ROLES, JOB_LADDER,
  DAYS_PER_PROMOTION, TAX_PERIOD, TAX_BRACKETS, RANKS, FIRST, LAST, KINDS,
  SUPPORT_ROLES, CLEANER_RATIO, SECURITY_RATIO, SECURITY_REQUIRED, EQUIPMENT, WAREHOUSE_EQUIPMENT, OFFICE_EQUIPMENT, EQUIP_RESALE,
} from './data.js';

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

export function newGame(ceo) {
  const s = {
    v: SAVE_VERSION, ceo: (ceo || 'You').trim().slice(0, 24) || 'You', day: 1, cash: START_CASH, nextId: 1,
    job: { employed: true, level: 0, daysWorked: 0 },
    index: { warsaw: 1, london: 1, nyc: 1 },
    parcels: [], businesses: [], workers: [],
    pools: { day: 0, jobCenter: [], recruiter: [] },
    hiresToday: { jobCenter: 0, recruiter: 0 },
    tax: { periodIncome: 0, history: [] },
    ledger: [{ day: 0, cash: START_CASH, net: 0 }],
    negDays: 0, gameOver: false, log: [], lastReport: null, cityEffects: [], orders: [],
  };
  s.parcels = genParcels(s);
  refreshPools(s);
  return s;
}

export function migrate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.parcels)) throw new Error('Not a Delusional Business save');
  s.cityEffects ||= [];
  s.log ||= [];
  s.orders ||= [];
  for (const b of s.businesses) {
    if (b.equip) continue;
    b.equip = {};
    for (const g of ['floor', 'warehouse', 'office']) {
      const eq = equipFor(b, g);
      const n = s.workers.filter(w => w.bizId === b.id && GROUP_POS[g].includes(w.pos)).length;
      b.equip[g] = eq ? Math.ceil(n / eq.staff) : 0; // existing saves get their kit for free
    }
  }
  return s;
}

// ---------- lookups ----------
export const parcelById = (s, id) => s.parcels.find(p => p.id === id);
export const bizById = (s, id) => s.businesses.find(b => b.id === id);
export const districtOf = p => CITIES[p.city].districts.find(d => d.id === p.district);
export const parcelValue = (s, p) => Math.round(p.basePrice * s.index[p.city]);
export const parcelRent = (s, p) => Math.round(parcelValue(s, p) / RENT_DIVISOR);
export const parcelDailyCost = (s, p) => p.status === 'rented' ? p.rentLocked : p.status === 'owned' ? Math.round(parcelValue(s, p) * OWNED_UPKEEP) : 0;
export const moveInCost = (s, p) => parcelRent(s, p) * MOVE_IN_DAYS;
export const sizeAtLeast = (a, b) => SIZE_ORDER.indexOf(a) >= SIZE_ORDER.indexOf(b);

export function bizCity(s, b) {
  const p = parcelById(s, b.mainId) || parcelById(s, b.officeId) || parcelById(s, b.warehouseId);
  return p ? p.city : null;
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
  const spaceCap = group === 'support' ? Math.max(2, Math.ceil(p.cap / 2)) : p.cap;
  return { cap: Math.min(spaceCap, equipCap), used, parcel: p, group, spaceCap, equipCap, equip: eq };
}

export function wageFor(s, w, b = bizById(s, w.bizId)) {
  if (!b) return 0;
  const t = BT[b.type];
  const p = slotParcel(s, b, POSITIONS[w.pos].where);
  const city = CITIES[p ? p.city : (bizCity(s, b) || 'london')];
  const base = w.pos === 'floor' ? t.wage : POSITIONS[w.pos].wage;
  return Math.round(base * (0.6 + 0.9 * w.skill / 100) * city.wage);
}
export const candidateWage = (s, c, b, pos) => wageFor(s, { skill: c.skill, pos }, b);

export const productivity = (skill, impact = 1) => clamp(1 + impact * (skill - 50) / 100, 0.15, 2.2);

export const needsSecurity = b => SECURITY_REQUIRED.includes(b.type);
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
  let nw = s.cash;
  for (const p of s.parcels) if (p.status === 'owned') nw += parcelValue(s, p);
  for (const b of s.businesses) nw += businessValue(s, b);
  return Math.round(nw);
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

// ---------- recruitment orders (choose how many people and how long to wait) ----------
export const RECRUIT = {
  jobCenter: { name: 'Public Job Center', perDay: 10, maxDays: 7, fee: 60, skill: [19, 8], minSkill: 1, maxSkill: 60 },
  recruiter: { name: 'Your Recruiters', perDay: 100, maxDays: 14, fee: 160, skill: [36, 12], minSkill: 25, maxSkill: 99 },
};
// rush costs more, patience is cheaper: 1 day ×2.2, 3 days ×1.13, 7 days ×0.83, 14 days ×0.71
export const speedMult = days => 0.6 + 1.6 / days;
const groupOf = groupKey;

export function reservedFor(s, bizId, pos) {
  const g = groupOf(pos);
  return (s.orders || []).filter(o => o.bizId === bizId && groupOf(o.pos) === g).reduce((a, o) => a + o.count, 0);
}
export function freeSpots(s, b, pos) {
  const c = positionCapacity(s, b, pos);
  return c.parcel ? Math.max(0, c.cap - c.used - reservedFor(s, b.id, pos)) : 0;
}
function recruiterAvg(s) {
  const recs = recruiters(s).slice(0, 3);
  return recs.length ? recs.reduce((a, w) => a + w.skill, 0) / recs.length : 0;
}
function skillMean(s, src, days) {
  const R = RECRUIT[src];
  const base = src === 'recruiter' ? R.skill[0] + 0.45 * recruiterAvg(s) : R.skill[0];
  return base + Math.min(15, (days - 1) * 1.5); // longer searches find better people
}

export function quoteRecruit(s, { src, bizId, pos, count, days }) {
  const R = RECRUIT[src];
  const b = bizById(s, bizId);
  const q = { ok: false, error: null, maxCount: 0, perHire: 0, total: 0, mult: speedMult(days), skillLo: 0, skillHi: 0, free: 0, arrive: s.day + days };
  if (!b) { q.error = 'Pick a business'; return q; }
  if (src === 'recruiter' && !recruiters(s).length) { q.error = 'Hire a Recruiter into an office first'; return q; }
  if (pos === 'warehouse' && !BT[b.type].warehouse) { q.error = `${b.name} doesn't use a warehouse`; return q; }
  const c = positionCapacity(s, b, pos);
  if (!c.parcel) { q.error = `${b.name} needs ${POSITIONS[pos].where === 'office' ? 'an office' : POSITIONS[pos].where === 'warehouse' ? 'a warehouse' : 'a location'} first`; return q; }
  if (c.equip && c.equipCap === 0) { q.error = `Buy equipment first (${c.equip.name.toLowerCase()})`; return q; }
  q.free = freeSpots(s, b, pos);
  const throughput = R.perDay * (src === 'recruiter' ? Math.min(3, recruiters(s).length) : 1) * days;
  q.maxCount = Math.min(q.free, throughput);
  const city = CITIES[c.parcel.city];
  const skillDiscount = src === 'recruiter' ? 1.15 - recruiterAvg(s) / 250 : 1; // good recruiters work faster
  q.perHire = Math.round(R.fee * city.wage * q.mult * skillDiscount);
  q.total = q.perHire * count;
  const m = skillMean(s, src, days);
  q.skillLo = Math.round(clamp(m - R.skill[1], R.minSkill, R.maxSkill));
  q.skillHi = Math.round(clamp(m + R.skill[1], R.minSkill, R.maxSkill));
  q.wageLo = wageFor(s, { skill: q.skillLo, pos }, b);
  q.wageHi = wageFor(s, { skill: q.skillHi, pos }, b);
  if (!q.free) q.error = c.equipCap <= c.used + reservedFor(s, b.id, pos) && c.equipCap < c.spaceCap ? `Buy more equipment (${c.equip.name.toLowerCase()}) to fit more people` : 'No free spots there (counting people already on the way)';
  else if (count > q.maxCount) q.error = `Max ${q.maxCount} in ${days} day${days > 1 ? 's' : ''}`;
  else if (count < 1) q.error = 'Choose how many people';
  else if (s.cash < q.total) q.error = `You need ${fmt(q.total)}`;
  else q.ok = true;
  return q;
}

export function startRecruit(s, opts) {
  const q = quoteRecruit(s, opts);
  if (!q.ok) return q.error;
  s.cash -= q.total;
  s.orders ||= [];
  s.orders.push({ id: uid(s), src: opts.src, bizId: opts.bizId, pos: opts.pos, count: opts.count, days: opts.days, started: s.day, arrive: s.day + opts.days, paid: q.total, mean: skillMean(s, opts.src, opts.days) });
  const b = bizById(s, opts.bizId);
  log(s, `Recruiting ${opts.count} ${opts.pos === 'floor' ? BT[b.type].role : POSITIONS[opts.pos].name}${opts.count > 1 ? 's' : ''} for ${b.name} — arriving day ${s.day + opts.days}`, 'info');
  return null;
}

export function cancelOrder(s, id) {
  const o = (s.orders || []).find(x => x.id === id);
  if (!o) return 'Not found';
  const refund = Math.round(o.paid * 0.5);
  s.cash += refund;
  s.orders = s.orders.filter(x => x !== o);
  log(s, `Cancelled a recruitment order (${fmt(refund)} refunded)`, 'info');
  return null;
}

function deliverOrders(s, report) {
  const due = (s.orders || []).filter(o => o.arrive <= s.day);
  for (const o of due) {
    s.orders = s.orders.filter(x => x !== o);
    const b = bizById(s, o.bizId);
    const R = RECRUIT[o.src];
    const c = b ? positionCapacity(s, b, o.pos) : { parcel: null };
    const fit = c.parcel ? Math.max(0, Math.min(o.count, c.cap - c.used)) : 0;
    for (let i = 0; i < fit; i++) {
      const sk = Math.round(clamp(gauss(o.mean, R.skill[1]), R.minSkill, R.maxSkill));
      s.workers.push({ id: uid(s), name: `${pick(FIRST)} ${pick(LAST)}`, skill: sk, bizId: b.id, pos: o.pos, hired: s.day });
    }
    const missing = o.count - fit;
    let refund = 0;
    if (missing > 0) { refund = Math.round(o.paid / o.count * missing); s.cash += refund; }
    const role = b ? (o.pos === 'floor' ? BT[b.type].role : POSITIONS[o.pos].name) : 'staff';
    const text = fit
      ? `${fit} new ${role}${fit > 1 ? 's' : ''} started at ${b.name}${refund ? ` (${missing} didn't fit, ${fmt(refund)} refunded)` : ''}`
      : `Recruits for ${b ? b.name : 'a closed business'} had nowhere to work — ${fmt(refund)} refunded`;
    if (report) report.events.push({ tone: fit ? 'good' : 'bad', text });
    log(s, text, fit ? 'good' : 'bad');
  }
}


// ---------- actions (return null on success, or an error string) ----------
function log(s, text, tone = 'info') {
  s.log.unshift({ day: s.day, text, tone });
  s.log.length = Math.min(s.log.length, 60);
}

export function foundBusiness(s, typeId, name) {
  const t = BT[typeId];
  if (!t) return 'Unknown business type';
  if (s.cash < t.license) return `You need ${fmt(t.license)} for the license`;
  s.cash -= t.license;
  const b = {
    id: uid(s), type: typeId, name: (name || '').trim().slice(0, 30) || `${s.ceo}'s ${t.name}`,
    mainId: null, officeId: null, warehouseId: null, rep: 40, ads: 0, founded: s.day,
    history: [], effects: [], last: null, equip: { floor: 0, warehouse: 0, office: 0 },
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
  else { p.status = 'rented'; p.rentLocked = parcelRent(s, p); }
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
      s.workers = s.workers.filter(w => !out.includes(w));
      log(s, `${out.length} staff at ${b.name} were laid off (no room)`, 'bad');
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
  for (const k of ['mainId', 'officeId', 'warehouseId']) {
    const p = parcelById(s, b[k]);
    if (!p) continue;
    p.bizId = null;
    if (p.status === 'rented') { p.status = 'market'; p.rentLocked = 0; }
  }
  s.workers = s.workers.filter(w => w.bizId !== b.id);
  for (const o of (s.orders || []).filter(o => o.bizId === b.id)) { s.cash += o.paid; }
  s.orders = (s.orders || []).filter(o => o.bizId !== b.id);
  s.businesses = s.businesses.filter(x => x.id !== b.id);
  let resale = 0;
  for (const g of ['floor', 'warehouse', 'office']) { const eq = equipFor(b, g); if (eq) resale += equipCount(b, g) * eq.cost * EQUIP_RESALE; }
  s.cash += Math.round(resale);
  log(s, `Closed ${b.name}. Owned property kept${resale ? `, equipment sold for ${fmt(resale)}` : ''}.`, 'bad');
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
    if (!parcelById(s, b.mainId) || Math.random() > 0.05) continue;
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

  for (const w of all) r.wages += wageFor(s, w, b);
  for (const p of [main, wh, parcelById(s, b.officeId)]) if (p) r.property += parcelDailyCost(s, p);

  const issues = requirements(s, b);
  if (!issues.length) {
    const city = CITIES[main.city];
    // capacity
    let cap = floor.reduce((a, w) => a + productivity(w.skill, t.skillImpact), 0) * t.serve;
    if (t.warehouse) {
      const whCap = whs.reduce((a, w) => a + productivity(w.skill), 0) * t.serve * 2.2;
      if (whCap < cap) r.notes.push('Warehouse is a bottleneck');
      cap = Math.min(cap, whCap);
    }
    // demand
    const trafficFactor = (1 - t.traffic) + t.traffic * main.traffic / 60;
    const repFactor = 0.5 + b.rep / 100;
    const adFactor = b.ads > 0 ? 1 + 0.22 * Math.log10(1 + b.ads / (40 * city.cost)) : 1;
    let mkt = 1;
    for (const w of all) if (w.pos === 'marketing' && parcelById(s, b.officeId)) mkt += 0.18 * (0.5 + w.skill / 100);
    mkt = Math.min(mkt, 1.8);
    const dow = s.day % 7;
    const weekend = (dow === 6 || dow === 0) ? 1 + 0.18 * t.traffic : 1;
    let eff = 1;
    for (const e of b.effects) eff *= e.mult;
    for (const e of s.cityEffects) if (e.city === main.city) eff *= e.mult;
    const demand = t.serve * main.cap * 1.05 * trafficFactor * repFactor * adFactor * mkt * weekend * eff * rand(0.85, 1.15);
    const served = Math.min(demand, cap);
    // satisfaction
    const avgSkill = floor.reduce((a, w) => a + w.skill, 0) / floor.length;
    let sat = 22 + avgSkill * 0.7;
    if (served < demand) sat -= (1 - served / demand) * 20; else sat += 5;
    const core = all.filter(w => !SUPPORT_ROLES.includes(w.pos)).length;
    const cleanNeed = Math.max(1, Math.ceil(core / CLEANER_RATIO));
    const cleaners = all.filter(w => w.pos === 'cleaner');
    if (cleaners.length < cleanNeed) { sat -= 18 * (1 - cleaners.length / cleanNeed); r.notes.push(`Messy: needs ${cleanNeed} cleaners (has ${cleaners.length})`); }
    else sat += Math.min(4, cleaners.reduce((a, w) => a + w.skill, 0) / cleaners.length / 25);
    const hrCap = all.filter(w => w.pos === 'hr').length * 40;
    if (all.length > 15 && hrCap < all.length) { sat -= 12; r.notes.push('Chaos: needs an HR Manager (office)'); }
    sat = clamp(sat, 0, 100);
    b.rep = clamp(b.rep * 0.92 + sat * 0.08, 0, 100);

    r.demand = Math.round(demand);
    r.capacity = Math.round(cap);
    r.customers = Math.round(served * 10) / 10;
    r.revenue = Math.round(served * t.ticket * city.spend * (0.9 + sat / 500));
    r.cogs = Math.round(r.revenue * t.cogs);
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
    if (served < demand * 0.9) { const c = positionCapacity(s, b, 'floor'); r.notes.push(`Turned away ${Math.round(demand - served)} customers — ${c.used >= c.cap && c.equipCap < c.spaceCap ? 'buy more equipment so you can hire more staff' : 'hire more or better staff'}`); }
  } else {
    r.notes.push('Closed: ' + issues[0]);
    b.rep = clamp(b.rep * 0.98 + 40 * 0.02, 0, 100);
  }
  r.profit = r.revenue - r.cogs - r.wages - r.property - r.ads;

  // training
  const hrs = all.filter(w => w.pos === 'hr');
  const hrBoost = hrs.length ? Math.min(1, hrs.length * 40 / Math.max(1, all.length)) * (hrs.reduce((a, w) => a + w.skill, 0) / hrs.length) / 100 : 0;
  for (const w of all) w.skill = Math.min(100, w.skill + (0.06 + 0.3 * hrBoost) * (1 - w.skill / 105));

  b.effects = b.effects.map(e => ({ ...e, days: e.days - 1 })).filter(e => e.days > 0);
  b.last = r;
  b.history.push({ day: s.day, revenue: r.revenue, profit: r.profit, customers: r.customers, sat: r.sat });
  if (b.history.length > 60) b.history.shift();
  return r;
}

export function simulateDay(s) {
  if (s.gameOver) return null;
  const report = { day: s.day, salary: 0, promoted: null, businesses: [], events: [], idleProperty: 0, extra: 0, interest: 0, tax: null, net: 0, cashBefore: s.cash };

  randomEvents(s, report);

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
  for (const p of s.parcels) if (!p.bizId && (p.status === 'rented' || p.status === 'owned')) report.idleProperty += parcelDailyCost(s, p);

  const bizNet = report.businesses.reduce((a, r) => a + r.profit, 0);
  let net = report.salary + bizNet - report.idleProperty - report.extra;
  s.cash += report.salary + bizNet - report.idleProperty; // extra already deducted
  if (s.cash < 0) {
    report.interest = Math.round(-s.cash * OVERDRAFT_RATE);
    s.cash -= report.interest;
    net -= report.interest;
  }
  s.tax.periodIncome += net;

  // tax day
  if (s.day % TAX_PERIOD === 0) {
    const est = taxEstimate(s);
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
  if (s.negDays >= BANKRUPT_DAYS) { s.gameOver = true; report.gameOver = true; }

  s.ledger.push({ day: s.day, cash: Math.round(s.cash), net: report.net });
  if (s.ledger.length > 200) s.ledger.shift();
  for (const e of report.events) log(s, e.text, e.tone);
  if (report.tax) log(s, `Paid ${fmt(report.tax.due)} income tax`, 'bad');

  s.day++;
  deliverOrders(s, report);
  refreshPools(s);
  s.lastReport = report;
  return report;
}

export function simulateDays(s, n) {
  const reports = [];
  for (let i = 0; i < n && !s.gameOver; i++) reports.push(simulateDay(s));
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
