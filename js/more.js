// v4 systems: calendar & seasons, quality, upgrades, franchising, star employees, training, promotions,
// named rivals & market share, property development & leasing, bank loans, side hustles, politics,
// legacy perks, yearly recap, inbox and tutorial goals.
import { CITIES, BT, SIZES, KINDS, STOCK, POSITIONS } from './data.js';
import {
  bizById, parcelById, workersOf, fmt, netWorth, districtOf, parcelValue, parcelRent, positionCapacity,
  requirements, competition, recordDeparture, wageFor, catFor, posForCat, isHQ, uid as engineUid,
} from './engine.js';
import { diff, avgRevenue } from './world.js';
import { constructionBonus } from './empire.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const econ = s => (s.economy ? s.economy.mult : 1);
const uid = s => engineUid(s);
const cityOf = (s, b) => { const p = parcelById(s, b.mainId); return p ? p.city : null; };

export function initMore(s) {
  s.stars ||= [];
  s.loans ||= [];
  s.devs ||= [];
  s.inbox ||= [];
  s.politics ||= { lobby: 0, mayor: null, campaign: null };
  s.job.hustle ??= null;
  s.tutorial ||= { step: s.businesses.length >= 2 || s.day > 120 ? GOALS.length : 0 };
  s.year ||= { n: yearOf(s.day), startNW: null, startRank: null, profit: {}, startDay: s.day, achievements: 0, taxes: 0 };
  for (const b of s.businesses) { b.quality ??= 'standard'; b.upg ||= {}; }
}

// ======================================================================= CALENDAR & SEASONS
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS_PER_YEAR = 360; // twelve 30-day months; day 1 = Monday 1 Jan, year 1
export const yearOf = day => Math.floor((day - 1) / DAYS_PER_YEAR) + 1;
export const monthOf = day => Math.floor(((day - 1) % DAYS_PER_YEAR) / 30);
export const domOf = day => ((day - 1) % 30) + 1;
export const dateLabel = day => `${domOf(day)} ${MONTHS[monthOf(day)]} Y${yearOf(day)}`;
export const doy = day => ((day - 1) % DAYS_PER_YEAR) + 1;
export const isBlackFriday = day => doy(day) >= 325 && doy(day) <= 328;
const SEASON = {
  shop: [0.85, 0.95, 1, 1, 1, 1.03, 1.05, 1.05, 1, 1, 1.08, 1.3],
  food: [0.9, 0.95, 1, 1, 1.03, 1.08, 1.08, 1.08, 1, 1, 1, 1.15],
  cafe: [1.05, 1.05, 1, 1, 0.97, 0.95, 0.93, 0.93, 1, 1.03, 1.05, 1.15],
  travel: [0.85, 0.85, 0.95, 1, 1.05, 1.2, 1.25, 1.25, 1.05, 0.95, 0.9, 1.1],
  gym: [1.25, 1.12, 1.05, 1, 1.05, 1.1, 1, 0.95, 1.05, 1, 0.95, 0.85],
  office: [0.95, 1, 1, 1, 1, 1, 0.95, 0.85, 1.05, 1.05, 1.05, 0.9],
  parcels: [0.9, 0.9, 0.95, 1, 1, 1, 1, 1, 1, 1.05, 1.15, 1.35],
  steady: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05],
};
const TYPE_SEASON = {
  clothing: 'shop', jewelry: 'shop', cosmetics: 'shop', furniture: 'shop', supermarket: 'shop', cars: 'shop', usedcars: 'shop', luxcars: 'shop',
  restaurant: 'food', coffee: 'cafe', bakery: 'cafe', hotel: 'travel', airline: 'travel', gym: 'gym', delivery: 'parcels',
  law: 'office', realestate: 'office', tech: 'office', marketing: 'office', construction: 'office', gaming: 'office', bank: 'office', biotech: 'office',
};
const BF_TYPES = ['clothing', 'jewelry', 'cosmetics', 'furniture', 'supermarket', 'cars', 'usedcars', 'luxcars', 'delivery'];
export function seasonMult(s, b) {
  let m = SEASON[TYPE_SEASON[b.type] || 'steady'][monthOf(s.day)];
  if (isBlackFriday(s.day) && BF_TYPES.includes(b.type)) m *= 1.8;
  return m;
}
function seasonEvents(s, report) {
  const d = doy(s.day);
  if (d === 1) report.events.push({ tone: 'info', text: `🎆 Happy new year ${yearOf(s.day)}! Gyms are packed, shops are quiet` });
  if (d === 151) report.events.push({ tone: 'good', text: '☀️ Summer season: hotels, airlines and restaurants get busier' });
  if (d === 325) report.events.push({ tone: 'good', text: '🛍️ Black Friday! Shops sell 80% more for 4 days' });
  if (d === 331) report.events.push({ tone: 'good', text: '🎄 Christmas season: shops, bakeries and delivery are booming' });
}

// ======================================================================= QUALITY
export const QUALITY = {
  budget: { label: 'Budget', cost: 0.75, sat: -8, desc: 'Cheaper goods and materials, less happy customers' },
  standard: { label: 'Standard', cost: 1, sat: 0, desc: 'The usual' },
  premium: { label: 'Premium', cost: 1.4, sat: 8, desc: 'Better goods, happier customers, higher costs' },
};
export const qualityOf = b => QUALITY[b.quality] || QUALITY.standard;

// ======================================================================= UPGRADES
const FOOD = ['coffee', 'bakery', 'restaurant'];
export const UPGRADES = {
  renovation: { name: 'Renovation', icon: '🛠️', desc: '+5 satisfaction for good, reputation +8 right away', fits: (b, t) => true, cost: (s, b) => Math.round(Math.max(5000 * cc(s, b), avgRevenue(b) * 25) / 100) * 100 },
  loyalty: { name: 'Loyalty programme', icon: '💳', desc: '+6% returning customers; rewards cost 1.5% of revenue', fits: (b, t) => t.traffic >= 0.3, cost: (s, b) => Math.round(3000 * cc(s, b)) },
  delivery: { name: 'Delivery apps', icon: '🛵', desc: '+18% orders through apps; the apps take ~2.5% of revenue', fits: b => FOOD.includes(b.type), cost: (s, b) => Math.round(1000 * cc(s, b)) },
  selfcheckout: { name: 'Self-checkout', icon: '🧾', desc: '+15% capacity, −2 satisfaction', fits: b => ['supermarket', 'clothing', 'cosmetics', 'furniture'].includes(b.type), cost: (s, b) => Math.round(15000 * sizeF(s, b) * cc(s, b)) },
  premiumfit: { name: 'Premium fit-out', icon: '✨', desc: 'Customers accept ~10% higher prices', fits: b => ['jewelry', 'luxcars', 'hotel', 'restaurant', 'cosmetics', 'clothing'].includes(b.type), cost: (s, b) => Math.round(Math.max(20000 * cc(s, b), avgRevenue(b) * 40) / 100) * 100 },
};
function cc(s, b) { const p = parcelById(s, b.mainId); return CITIES[p ? p.city : 'london'].cost; }
function sizeF(s, b) { const p = parcelById(s, b.mainId); return p ? p.cap / 4 : 1; }
export function buyUpgrade(s, bizId, key) {
  const b = bizById(s, bizId), U = UPGRADES[key];
  if (!b || !U) return 'Not found';
  if (!parcelById(s, b.mainId)) return 'Get a location first';
  if (!U.fits(b, BT[b.type])) return 'Not available for this business';
  if (b.upg[key]) return 'Already done';
  const cost = U.cost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  b.upg[key] = s.day;
  if (key === 'renovation') b.rep = Math.min(100, b.rep + 8);
  return null;
}
export function upgradeFactors(s, b) {
  const u = b.upg || {};
  const f = { demand: 1, cap: 1, sat: qualityOf(b).sat, revCost: 0, priceTol: u.premiumfit ? 1.1 : 1 };
  if (u.renovation) f.sat += 5;
  if (u.loyalty) { f.demand *= 1.06; f.revCost += 0.015; }
  if (u.delivery) { f.demand *= 1.18; f.revCost += 0.025; }
  if (u.selfcheckout) { f.cap *= 1.15; f.sat -= 2; }
  return f;
}

// ======================================================================= FRANCHISING
export const FRANCHISE_ROYALTY = 0.06;
export function franchiseCheck(s, b) {
  const t = BT[b.type];
  if (t.traffic < 0.3) return 'Only customer-facing businesses can be franchised';
  if (b.rep < 70) return `Needs reputation 70+ (now ${Math.round(b.rep)})`;
  if (s.day - b.founded < 30) return 'Run it for at least 30 days first';
  if (requirements(s, b).length) return 'It has to be open';
  return null;
}
export const franchiseCost = (s, b) => Math.round(50000 * cc(s, b));
export function startFranchise(s, bizId) {
  const b = bizById(s, bizId);
  if (!b) return 'Not found';
  if (b.franchise) return 'Already franchised';
  const err = franchiseCheck(s, b);
  if (err) return err;
  const cost = franchiseCost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  b.franchise = { units: 0, since: s.day, earned: 0, last: 0 };
  return null;
}
export const franchiseValue = b => b.franchise ? Math.round((b.franchise.last || 0) * 250) : 0;
export function sellFranchise(s, bizId) {
  const b = bizById(s, bizId);
  if (!b || !b.franchise) return 'No franchise';
  s.cash += franchiseValue(b);
  b.franchise = null;
  return null;
}
function franchiseDay(s, b, report) {
  const F = b.franchise;
  if (!F) return 0;
  const target = Math.max(0, Math.floor((b.rep - 60) * 1.2));
  if (F.units < target && Math.random() < 0.12) { F.units++; if (F.units % 10 === 0) report.events.push({ tone: 'good', text: `🏪 ${b.name} now has ${F.units} franchise stores` }); }
  if (b.rep < 60 && F.units > 0 && Math.random() < 0.15) { F.units--; report.events.push({ tone: 'bad', text: `A ${b.name} franchise closed — the brand's reputation is slipping` }); }
  F.last = Math.round(F.units * avgRevenue(b) * 0.6 * FRANCHISE_ROYALTY * econ(s) * seasonMult(s, b));
  F.earned += F.last;
  return F.last;
}

// ======================================================================= STAR EMPLOYEES
export const TRAITS = {
  charismatic: { label: 'Charismatic', icon: '🌟', desc: '+10% customers where they work' },
  efficient: { label: 'Efficient', icon: '⚙️', desc: '+5% output for their whole business' },
  mentor: { label: 'Mentor', icon: '🎓', desc: 'Colleagues learn twice as fast' },
  loyal: { label: 'Loyal', icon: '🤝', desc: 'Never quits; team morale +5' },
  negotiator: { label: 'Negotiator', icon: '💼', desc: 'Stock for their business 5% cheaper' },
  celebrity: { label: 'Celebrity', icon: '📸', desc: '+3 satisfaction, reputation +8 when hired' },
};
export const STAR_WAGE = 2.5;
export const starTraits = (s, b) => new Set(s.workers.filter(w => w.bizId === b.id && w.star).map(w => w.star));
function starDay(s, report) {
  s.stars = s.stars.filter(x => x.expires > s.day);
  if (s.stars.length >= 3 || !s.businesses.length || Math.random() > 0.02 * legacyStarMult(s)) return;
  const b = pick(s.businesses);
  const cat = Math.random() < 0.75 ? catFor(s, b.id, 'floor') : pick(['manager', 'hr', 'marketing', 'security', 'cleaner']);
  const trait = pick(Object.keys(TRAITS));
  const star = { id: uid(s), name: `${pick(['Ava', 'Leo', 'Zara', 'Kai', 'Nina', 'Omar', 'Ivy', 'Hugo', 'Maja', 'Theo'])} ${pick(['Stern', 'Nakamura', 'Okoro', 'Lindgren', 'Moreno', 'Kowal', 'Bright', 'Vance', 'Duarte', 'Ricci'])}`, cat, skill: randi(88, 99), trait, expires: s.day + 7, refBiz: b.id };
  s.stars.push(star);
  report.events.push({ tone: 'good', text: `${TRAITS[trait].icon} A star ${catLabelLite(cat)} is available: ${star.name} (skill ${star.skill}, ${TRAITS[trait].label}) — see Hire` });
}
const catLabelLite = cat => cat.startsWith('role:') ? cat.slice(5) : (POSITIONS[cat] ? POSITIONS[cat].name : cat);
export function starQuote(s, star, b) {
  const pos = posForCat(s, b, star.cat);
  if (!pos) return null;
  const wage = Math.round(wageFor(s, { skill: star.skill, pos }, b) * STAR_WAGE);
  return { pos, wage, bonus: wage * 30 };
}
export function hireStar(s, starId, bizId) {
  const star = s.stars.find(x => x.id === starId);
  const b = bizById(s, bizId);
  if (!star) return 'They signed elsewhere';
  if (!b) return 'Pick a business';
  const q = starQuote(s, star, b);
  if (!q) return `${b.name} has no job for a ${catLabelLite(star.cat)}`;
  const c = positionCapacity(s, b, q.pos);
  if (!c.parcel || c.used >= c.cap) return 'No free spot there';
  if (s.cash < q.bonus) return `Signing bonus: ${fmt(q.bonus)}`;
  s.cash -= q.bonus;
  s.workers.push({ id: star.id, name: star.name, skill: star.skill, bizId: b.id, pos: q.pos, cat: star.cat === 'floor' ? catFor(s, b.id, 'floor') : star.cat, hired: s.day, star: star.trait, wageMult: STAR_WAGE });
  if (star.trait === 'celebrity') b.rep = Math.min(100, b.rep + 8);
  s.stars = s.stars.filter(x => x !== star);
  return null;
}

// ======================================================================= TRAINING & PROMOTIONS
export const TRAIN_COOLDOWN = 30;
export const trainCost = (s, b) => Math.round(workersOf(s, b.id).filter(w => !w.star).reduce((a, w) => a + wageFor(s, w, b), 0) * 5);
export function trainStaff(s, bizId) {
  const b = bizById(s, bizId);
  if (!b) return 'Not found';
  if (b.trained && s.day - b.trained < TRAIN_COOLDOWN) return `Next course on day ${b.trained + TRAIN_COOLDOWN}`;
  const ws = workersOf(s, b.id);
  if (!ws.length) return 'Nobody to train';
  const cost = trainCost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  for (const w of ws) w.skill = Math.min(100, w.skill + 8 * (1 - w.skill / 110));
  b.morale = Math.min(100, (b.morale ?? 70) + 3);
  b.trained = s.day;
  return null;
}
export function canPromote(s, w) {
  if (!w.bizId || isHQ(bizById(s, w.bizId)) || w.pos !== 'floor' || w.skill < 70) return false;
  const b = bizById(s, w.bizId);
  const c = positionCapacity(s, b, 'manager');
  return c.parcel && c.used < c.cap && !workersOf(s, b.id, 'manager').length;
}
export function promote(s, id) {
  const w = s.workers.find(x => x.id === id);
  if (!w || !canPromote(s, w)) return 'Needs skill 70+, a floor job, and a business without a General Manager';
  w.pos = 'manager'; w.cat = 'manager';
  const b = bizById(s, w.bizId);
  b.morale = Math.min(100, (b.morale ?? 70) + 4);
  return null;
}

// ======================================================================= RIVALS & MARKET SHARE
const BRAND_A = ['Urban', 'Golden', 'Royal', 'Metro', 'Blue', 'Happy', 'Prime', 'Little', 'Grand', 'Bright', 'Iron', 'Silver', 'Fox', 'North', 'Liberty', 'Velvet'];
const BRAND_B = { coffee: 'Coffee Co.', bakery: 'Bakehouse', restaurant: 'Kitchen', supermarket: 'Market', clothing: 'Apparel', jewelry: 'Jewellers', cosmetics: 'Beauty', furniture: 'Home', gym: 'Fitness', hotel: 'Hotels', cars: 'Motors', usedcars: 'Auto Deals', luxcars: 'Prestige Cars', law: 'Legal', realestate: 'Realty', tech: 'Labs', marketing: 'Media', construction: 'Builders', gaming: 'Games', airline: 'Airways', security: 'Security', delivery: 'Express', bank: 'Capital', biotech: 'Bio', spaceco: 'Aerospace' };
function ensureRival(s, c, type) {
  if (c.rival !== undefined) return c.rival;
  c.rival = Math.random() < 0.7 ? { name: `${pick(BRAND_A)} ${BRAND_B[type] || 'Group'}`, owner: s.richlist.length ? pick(s.richlist).name : 'Unknown', strength: rand(0.3, 0.8), stores: randi(2, 25), aggression: rand(0.3, 1), near: null, nearUntil: 0 } : null;
  return c.rival;
}
export function rivalFor(s, b) {
  const c = competition(s, b);
  if (!c) return null;
  ensureRival(s, c, b.type);
  return c.rival;
}
export const rivalNearMult = (s, b) => { const r = rivalFor(s, b); return r && r.near === b.id && r.nearUntil > s.day ? 0.9 : 1; };
function rivalsDay(s, report) {
  const markets = new Map();
  for (const b of s.businesses) {
    const c = competition(s, b);
    if (!c) continue;
    const key = `${cityOf(s, b)}:${b.type}`;
    if (!markets.has(key)) markets.set(key, { c, type: b.type, list: [] });
    markets.get(key).list.push(b);
  }
  for (const { c, type, list } of markets.values()) {
    const r = ensureRival(s, c, type);
    if (!r) { if (Math.random() < 0.002) { c.rival = undefined; ensureRival(s, c, type); if (c.rival) report.events.push({ tone: 'bad', text: `🆕 A new rival entered your ${BT[type].name.toLowerCase()} market: ${c.rival.name}` }); } continue; }
    const best = list.filter(b => b.last && b.last.revenue).sort((a, b) => b.last.revenue - a.last.revenue)[0];
    if (best && Math.random() < 0.004 * r.aggression && !(r.nearUntil > s.day)) {
      r.near = best.id; r.nearUntil = s.day + randi(60, 180); r.stores++; c.level = clamp(c.level + 0.05, 0.05, 1);
      report.events.push({ tone: 'bad', text: `🏪 ${r.name} opened a store right next to ${best.name} (−10% customers)` });
    }
    if (Math.random() < 0.003 * r.aggression) {
      const b = pick(list), victims = s.workers.filter(w => w.bizId === b.id && w.pos === 'floor' && !w.star && w.skill >= 60);
      const v = victims.sort((a, x) => x.skill - a.skill)[0];
      if (v) { recordDeparture(s, v); s.workers = s.workers.filter(w => w !== v); report.events.push({ tone: 'bad', text: `🧲 ${r.name} poached ${v.name} (skill ${Math.round(v.skill)}) from ${b.name}` }); }
    }
    if (!c.war && Math.random() < 0.0015 * r.aggression) {
      c.war = randi(7, 14); c.warDepth = rand(0.25, 0.4); c.price = clamp(1 - c.warDepth, 0.55, 0.8);
      report.events.push({ tone: 'bad', text: `⚔️ ${r.name} started a price war: −${Math.round(c.warDepth * 100)}% for ${c.war} days` });
    }
    const myPrice = list.reduce((a, b) => a + (b.price || 1), 0) / list.length;
    if (Math.random() < 0.02) r.stores = Math.max(1, r.stores + (myPrice < 0.95 ? -1 : 1));
    r.strength = clamp(r.strength + (myPrice < 0.9 ? -0.002 : 0.001), 0.1, 1);
  }
}
export function rivalBuyoutCost(s, b) {
  const r = rivalFor(s, b);
  if (!r) return null;
  return Math.round(Math.max(200000 * cc(s, b), avgRevenue(b)) * r.stores * r.strength * 120 / 1000) * 1000;
}
export function buyOutRival(s, bizId) {
  const b = bizById(s, bizId), c = b && competition(s, b), r = c && c.rival;
  if (!r) return 'No rival here';
  const cost = rivalBuyoutCost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  c.rival = null; c.level = clamp(c.level - 0.15, 0.05, 1);
  return null;
}
export const blitzCost = (s, b) => Math.round(Math.max(20000 * cc(s, b), avgRevenue(b) * 30) / 100) * 100;
export function marketingBlitz(s, bizId) {
  const b = bizById(s, bizId), c = b && competition(s, b), r = c && c.rival;
  if (!r) return 'No rival here';
  const cost = blitzCost(s, b);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost;
  r.strength = clamp(r.strength - 0.15, 0.1, 1);
  if (r.near === b.id) r.nearUntil = 0;
  if (Math.random() < 0.3 && !c.war) { c.war = randi(5, 10); c.warDepth = 0.25; c.price = 0.75; return 'retaliated'; }
  return null;
}
// share of customers in this city for this business type
export function marketShare(s, b) {
  const main = parcelById(s, b.mainId), c = competition(s, b);
  if (!main || !c) return null;
  const mine = s.businesses.filter(x => x.type === b.type && cityOf(s, x) === main.city);
  const myCust = mine.reduce((a, x) => a + (x.last ? x.last.customers || 0 : 0), 0);
  const per = Math.max(1, myCust / Math.max(1, mine.length)) || BT[b.type].serve * 4;
  const r = c.rival;
  const rivalCust = r ? r.stores * r.strength * per : 0;
  const indies = c.level * 12 * per;
  return { share: myCust / Math.max(1, myCust + rivalCust + indies), rivalShare: rivalCust / Math.max(1, myCust + rivalCust + indies), stores: mine.length };
}

// ======================================================================= PROPERTY DEVELOPMENT & LEASING
export const DEV_DAYS = { M: 60, L: 100, XL: 150 };
export function devQuote(s, city, districtId, kind, size) {
  const d = CITIES[city].districts.find(x => x.id === districtId);
  if (!d) return null;
  const bonus = constructionBonus(s);
  const marketPrice = SIZES[size].price[kind] * d.price * CITIES[city].cost * s.index[city];
  return { cost: Math.round(marketPrice * 0.6 * (bonus ? 0.8 : 1) / 1000) * 1000, value: Math.round(marketPrice), days: Math.ceil(DEV_DAYS[size] * (bonus ? 0.6 : 1)), bonus };
}
export function startDevelopment(s, city, districtId, kind, size) {
  const q = devQuote(s, city, districtId, kind, size);
  if (!q) return 'Pick a district';
  if (s.cash < q.cost) return `You need ${fmt(q.cost)}`;
  s.cash -= q.cost;
  s.devs.push({ id: uid(s), city, district: districtId, kind, size, cost: q.cost, days: q.days, progress: 0 });
  return null;
}
function devDay(s, report) {
  for (const dv of s.devs.slice()) {
    dv.progress++;
    if (dv.progress < dv.days) continue;
    const d = CITIES[dv.city].districts.find(x => x.id === dv.district);
    const traffic = Math.round(clamp(d.traffic * (dv.kind === 'office' ? 0.6 : dv.kind === 'warehouse' ? 0.3 : 1) + rand(-5, 8), 5, 100));
    const basePrice = Math.round(SIZES[dv.size].price[dv.kind] * d.price * CITIES[dv.city].cost / 100) * 100;
    s.parcels.push({ id: uid(s), city: dv.city, district: dv.district, kind: dv.kind, size: dv.size, cap: Math.round(SIZES[dv.size].cap * 1.15), traffic, basePrice,
      address: `${randi(1, 220)} ${pick(d.streets)} (new build)`, status: 'owned', bizId: null, rentLocked: 0, boughtFor: dv.cost, developed: true });
    s.devs = s.devs.filter(x => x !== dv);
    report.events.push({ tone: 'good', text: `🏗️ Your new ${KINDS[dv.kind].short.toLowerCase()} in ${d.name} is finished — worth ~${fmt(basePrice * s.index[dv.city])}, it cost you ${fmt(dv.cost)}` });
  }
}
export function leaseOut(s, parcelId) {
  const p = parcelById(s, parcelId);
  if (!p || p.status !== 'owned') return 'Only property you own can be leased out';
  if (p.bizId) return 'A business uses it — free it first';
  p.leasedOut = { rent: Math.round(parcelRent(s, p) * 0.9), until: s.day + 90 };
  return null;
}
export function endLease(s, parcelId) { const p = parcelById(s, parcelId); if (p) p.leasedOut = null; return null; }
function leaseIncomeDay(s, report) {
  let inc = 0;
  for (const p of s.parcels) {
    if (!p.leasedOut || p.status !== 'owned') continue;
    if (p.leasedOut.until <= s.day) p.leasedOut = { rent: Math.round(parcelRent(s, p) * 0.9), until: s.day + 90 };
    inc += p.leasedOut.rent;
  }
  return inc;
}

// ======================================================================= BANK LOANS
export const LOAN_TERMS = [90, 180, 360];
export function loanRate(s, term) {
  let r = 0.07 + 0.03 * diff(s).risk + (term >= 360 ? 0.01 : 0);
  if (s.billion && s.billion.holdings.some(h => h.sector === 'Finance')) r -= 0.02;
  r -= legacyLoanCut(s);
  return Math.max(0.02, r);
}
export const loanDebt = s => s.loans.reduce((a, l) => a + l.balance, 0);
export function loanLimit(s) { if (hasChallenge(s, 'debtfree')) return 0; return Math.max(0, Math.round(Math.max(20000, netWorth(s) * 0.4) - loanDebt(s))); }
export function loanQuote(s, amount, term) {
  const r = loanRate(s, term) / DAYS_PER_YEAR;
  const pay = amount * r / (1 - Math.pow(1 + r, -term));
  return { rate: loanRate(s, term), daily: Math.round(pay), total: Math.round(pay * term) };
}
export function takeLoan(s, amount, term) {
  amount = Math.round(amount);
  if (amount <= 0) return 'Pick an amount';
  if (amount > loanLimit(s)) return `The bank will lend at most ${fmt(loanLimit(s))}`;
  const q = loanQuote(s, amount, term);
  s.cash += amount;
  s.loans.push({ id: uid(s), principal: amount, balance: amount, rate: q.rate, daily: q.daily, term, left: term, taken: s.day });
  return null;
}
export function repayLoan(s, id) {
  const l = s.loans.find(x => x.id === id);
  if (!l) return 'Not found';
  if (s.cash < l.balance) return `You need ${fmt(l.balance)}`;
  s.cash -= Math.round(l.balance);
  s.loans = s.loans.filter(x => x !== l);
  return null;
}
function loansDay(s, report) {
  let interest = 0, paid = 0;
  for (const l of s.loans.slice()) {
    const i = l.balance * l.rate / DAYS_PER_YEAR;
    const pay = Math.min(l.daily, l.balance + i);
    l.balance = Math.max(0, l.balance + i - pay);
    l.left--;
    interest += i; paid += pay;
    if (l.balance < 1 || l.left <= 0) { s.loans = s.loans.filter(x => x !== l); report.events.push({ tone: 'good', text: `🏦 Loan of ${fmt(l.principal)} fully repaid` }); }
  }
  return { cash: -Math.round(paid), net: -Math.round(interest) };
}

// ======================================================================= SIDE HUSTLES
export const HUSTLES = {
  delivery: { label: 'Food delivery', icon: '🛵', desc: '+$45 every evening, steady' },
  flipping: { label: 'Flipping sneakers', icon: '👟', desc: 'About +$70/day on average, but some days you lose money' },
  freelance: { label: 'Freelance design', icon: '🎨', desc: '+$95/day, but you\'re tired: promotions come 40% slower' },
};
export function setHustle(s, k) { s.job.hustle = HUSTLES[k] ? k : null; }
function hustleDay(s) {
  if (!s.job.employed || !s.job.hustle) return 0;
  if (s.job.hustle === 'delivery') return 45;
  if (s.job.hustle === 'flipping') return Math.round(clamp(70 + (Math.random() + Math.random() + Math.random() - 1.5) * 220, -150, 400));
  return 95;
}

// ======================================================================= POLITICS
export const LOBBY_LEVELS = [{ cost: 5e6, relief: 0.05 }, { cost: 25e6, relief: 0.1 }, { cost: 100e6, relief: 0.15 }];
export const taxRelief = s => s.politics && s.politics.lobby ? LOBBY_LEVELS[s.politics.lobby - 1].relief : 0;
export function lobby(s) {
  const P = s.politics;
  if (P.lobby >= LOBBY_LEVELS.length) return 'Maximum influence reached';
  const cost = Math.round(LOBBY_LEVELS[P.lobby].cost * diff(s).cost);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost; P.lobby++;
  return null;
}
export const ELECTION_DOY = 300;
export const nextElection = day => { const y = yearOf(day); const e = (y - 1) * DAYS_PER_YEAR + ELECTION_DOY; return e >= day ? e : e + DAYS_PER_YEAR; };
export function winChance(s, city, spend) {
  const local = s.businesses.some(b => cityOf(s, b) === city) ? 0.1 : 0;
  return clamp(0.15 + (s.prestige || 0) / 400 + Math.log10(Math.max(1, spend / (5e6 * CITIES[city].cost))) * 0.2 + local, 0.03, 0.85);
}
export function runForMayor(s, city, spend) {
  const P = s.politics;
  if (P.campaign) return 'You are already campaigning';
  if (P.mayor && P.mayor.until > s.day) return `You are mayor of ${CITIES[P.mayor.city].name} until day ${P.mayor.until}`;
  if (s.cash < spend) return `You need ${fmt(spend)}`;
  s.cash -= spend;
  P.campaign = { city, spend, election: nextElection(s.day + 1) };
  return null;
}
export const isMayorOf = (s, city) => !!(s.politics && s.politics.mayor && s.politics.mayor.city === city && s.politics.mayor.until > s.day);
export const mayorDemand = (s, b) => isMayorOf(s, cityOf(s, b)) ? 1.05 : 1;
export const mayorRisk = (s, b) => isMayorOf(s, cityOf(s, b)) ? 0.6 : 1;
function politicsDay(s, report) {
  const P = s.politics;
  if (P.campaign && s.day >= P.campaign.election) {
    const ch = winChance(s, P.campaign.city, P.campaign.spend);
    if (Math.random() < ch) {
      P.mayor = { city: P.campaign.city, until: s.day + DAYS_PER_YEAR };
      s.prestige += 15;
      report.events.push({ tone: 'good', text: `🗳️ You won! You're mayor of ${CITIES[P.campaign.city].name} for a year (+15 prestige)` });
    } else report.events.push({ tone: 'bad', text: `🗳️ You lost the ${CITIES[P.campaign.city].name} mayoral election` });
    P.campaign = null;
  }
  if (P.mayor && P.mayor.until <= s.day) { report.events.push({ tone: 'info', text: `Your term as mayor of ${CITIES[P.mayor.city].name} has ended` }); P.mayor = null; }
  if (P.lobby && s.day % 90 === 0 && Math.random() < 0.05 * P.lobby) {
    s.prestige = Math.max(0, (s.prestige || 0) - 5);
    for (const b of s.businesses) b.rep = Math.max(0, b.rep - 5);
    report.events.push({ tone: 'bad', text: '📰 Lobbying scandal! Prestige −5, reputation −5 everywhere' });
  }
}

// ======================================================================= LEGACY (perks bought with points from retired games)
export const LEGACY_PERKS = {
  cash: { icon: '💵', label: 'Inheritance', desc: '+$5,000 starting cash per level', max: 5, cost: 10 },
  fame: { icon: '⭐', label: 'Famous name', desc: 'New businesses start with +10 reputation per level', max: 3, cost: 15 },
  talent: { icon: '🔎', label: 'Talent scout', desc: 'Job Center candidates +6 skill per level', max: 3, cost: 15 },
  license: { icon: '📜', label: 'Connections', desc: 'Registration fees −10% per level', max: 3, cost: 20 },
  friends: { icon: '🤝', label: 'Old friends', desc: '2 loyal workers (skill 65, any trade) waiting for you per level', max: 2, cost: 15 },
  learner: { icon: '📈', label: 'Quick learner', desc: 'Day-job promotions come 25% faster per level', max: 2, cost: 10 },
  banker: { icon: '🏦', label: 'Family banker', desc: 'Bank loans −1% interest per level', max: 3, cost: 15 },
  taxman: { icon: '🧾', label: 'Tax lawyer', desc: 'Income tax −5% per level', max: 3, cost: 25 },
  landlord: { icon: '🏠', label: 'Family property', desc: 'Start owning a small shop in Warsaw (level 2: medium)', max: 2, cost: 30 },
  magnet: { icon: '🌟', label: 'Star magnet', desc: 'Star candidates turn up 50% more often per level', max: 2, cost: 20 },
  trust: { icon: '👑', label: 'Trust fund', desc: 'An heir inherits 0.2% of the last retired fortune per level (max $100K per level)', max: 3, cost: 30 },
};
export const CHALLENGES = {
  selfmade: { icon: '🧑‍💻', label: 'Self-made', desc: 'No day job — you start unemployed', mult: 0.25 },
  broke: { icon: '🪙', label: 'Broke', desc: 'Start with a quarter of the cash', mult: 0.2 },
  debtfree: { icon: '🚫', label: 'Debt-free', desc: 'Banks won\'t lend you anything', mult: 0.25 },
  taxed: { icon: '🏛️', label: 'Tax hell', desc: 'Income tax is 25% higher', mult: 0.3 },
  clean: { icon: '🧼', label: 'Clean slate', desc: 'Your legacy perks are switched off', mult: 0.5 },
};
export const DYNASTY_RANKS = [
  { at: 0, label: 'Nobody', icon: '·', bonus: 0 },
  { at: 50, label: 'Bronze dynasty', icon: '🥉', bonus: 0.05 },
  { at: 150, label: 'Silver dynasty', icon: '🥈', bonus: 0.1 },
  { at: 400, label: 'Gold dynasty', icon: '🥇', bonus: 0.15 },
  { at: 1000, label: 'Platinum dynasty', icon: '💠', bonus: 0.2 },
  { at: 2500, label: 'Diamond dynasty', icon: '💎', bonus: 0.3 },
];
export const dynastyRank = lifetime => DYNASTY_RANKS.filter(r => (lifetime || 0) >= r.at).pop();
export const nextDynastyRank = lifetime => DYNASTY_RANKS.find(r => r.at > (lifetime || 0)) || null;
export const trustFund = (lastNW, lvl) => Math.round(Math.min(100000 * lvl, Math.max(0, lastNW) * 0.002 * lvl) / 100) * 100;
const lv = (s, k) => (s.legacy && !s.legacyOff && s.legacy[k]) || 0;
export const hasChallenge = (s, k) => (s.challenges || []).includes(k);

// opts: perks object (old format) or { perks, challenges, heir: { name, gen, lastNW } }
export function applyLegacy(s, opts) {
  const o = opts && (opts.perks || opts.challenges || opts.heir) ? opts : { perks: opts };
  s.legacy = { ...(o.perks || {}) };
  s.challenges = (o.challenges || []).filter(k => CHALLENGES[k]);
  s.legacyOff = hasChallenge(s, 'clean');
  if (hasChallenge(s, 'broke')) s.cash = Math.round(s.cash / 4);
  if (hasChallenge(s, 'selfmade')) s.job.employed = false;
  s.cash += 5000 * lv(s, 'cash');
  if (o.heir) {
    s.dynasty = { gen: o.heir.gen, from: o.heir.name, inherited: 0 };
    const fund = trustFund(o.heir.lastNW, lv(s, 'trust'));
    if (fund) { s.cash += fund; s.dynasty.inherited = fund; }
  }
  for (let i = 0; i < 2 * lv(s, 'friends'); i++) {
    const full = Math.round(80 * (0.6 + 0.9 * 0.65));
    s.workers.push({ id: 'lf' + i, name: `${['Marek', 'Ola', 'Tom', 'Ewa'][i]} ${['Nowak', 'Kowal', 'Green', 'Lis'][i]}`, skill: 65, bizId: null, pos: 'floor', cat: 'floor', hired: 1, fullWage: full, benchWage: Math.round(full * 0.4), loyalFriend: true });
  }
}
// things that need the parcels to exist first
export function applyLegacyLate(s) {
  const l = lv(s, 'landlord');
  if (!l) return;
  const size = l >= 2 ? 'M' : 'S';
  const p = s.parcels.filter(x => x.city === 'warsaw' && x.kind === 'commercial' && x.size === size && x.status === 'market').sort((a, b) => a.price - b.price)[0];
  if (p) { p.status = 'owned'; p.boughtFor = 0; p.inherited = true; }
}
export const legacyLicenseMult = s => 1 - 0.1 * lv(s, 'license');
export const legacyRep = s => 10 * lv(s, 'fame');
export const legacySkill = s => 6 * lv(s, 'talent');
export const legacyPromoBoost = s => 0.25 * lv(s, 'learner');
export const legacyLoanCut = s => 0.01 * lv(s, 'banker');
export const legacyStarMult = s => 1 + 0.5 * lv(s, 'magnet');
export const legacyTaxMult = s => (1 - 0.05 * lv(s, 'taxman')) * (hasChallenge(s, 'taxed') ? 1.25 : 1);
export const challengeMult = s => 1 + (s.challenges || []).reduce((a, k) => a + CHALLENGES[k].mult, 0);

// lifetime = all points ever earned (for the dynasty rank bonus)
export function legacyBreakdown(s, lifetime = 0) {
  const nw = netWorth(s);
  const ach = s.billion ? Object.keys(s.billion.achievements || {}).length : 0;
  const titles = ((s.sports && s.sports.titles) || 0) + ((s.bball && s.bball.titles) || 0) + ((s.racing && s.racing.titles) || 0);
  const years = Math.floor(s.day / DAYS_PER_YEAR);
  const rows = [
    ['Fortune', Math.max(1, Math.round(10 * Math.log10(Math.max(1, nw / 1e5))))],
    ['Prestige', Math.round(s.prestige || 0)],
    ['Achievements', ach * 2],
    ['Sports titles', titles * 5],
    ['Years in business', years * 2],
  ].filter(r => r[1] > 0);
  const base = rows.reduce((a, r) => a + r[1], 0);
  const cm = challengeMult(s);
  const gen = s.dynasty ? s.dynasty.gen : 1;
  const dynBonus = Math.min(0.5, 0.05 * (gen - 1));
  const rankBonus = dynastyRank(lifetime).bonus;
  const total = Math.max(1, Math.round(base * cm * (1 + dynBonus + rankBonus)));
  return { rows, base, cm, gen, dynBonus, rankBonus, total };
}
export const legacyPoints = (s, lifetime = 0) => legacyBreakdown(s, lifetime).total;
export function hallEntry(s, points) {
  const nw = netWorth(s);
  return {
    ceo: s.ceo, gen: s.dynasty ? s.dynasty.gen : 1, days: s.day, nw: Math.round(nw), peak: Math.round(Math.max(nw, s.peakNW || 0)),
    businesses: s.businesses.length, prestige: s.prestige || 0, difficulty: s.difficulty, challenges: s.challenges || [],
    achievements: s.billion ? Object.keys(s.billion.achievements || {}).length : 0,
    titles: ((s.sports && s.sports.titles) || 0) + ((s.bball && s.bball.titles) || 0) + ((s.racing && s.racing.titles) || 0),
    points, when: Date.now(),
  };
}

// ======================================================================= YEARLY RECAP + INBOX + TUTORIAL
function recapDay(s, report, nw, rank) {
  const Y = s.year;
  if (Y.startNW == null) { Y.startNW = nw; Y.startRank = rank; }
  if (!(s.peakNW >= nw)) s.peakNW = Math.round(nw);
  for (const r of report.businesses) Y.profit[r.id] = (Y.profit[r.id] || 0) + r.profit;
  if (report.tax) Y.taxes += report.tax.due;
  if (doy(s.day) !== DAYS_PER_YEAR) return;
  const named = Object.entries(Y.profit).map(([id, p]) => ({ b: bizById(s, id), p })).filter(x => x.b).sort((a, b) => b.p - a.p);
  report.recap = {
    year: Y.n, startNW: Y.startNW, endNW: nw, startRank: Y.startRank, endRank: rank, taxes: Y.taxes,
    best: named[0] ? { name: named[0].b.name, type: named[0].b.type, profit: Math.round(named[0].p) } : null,
    worst: named.length > 1 ? { name: named.at(-1).b.name, type: named.at(-1).b.type, profit: Math.round(named.at(-1).p) } : null,
    total: Math.round(named.reduce((a, x) => a + x.p, 0)),
    achievements: s.billion ? Object.values(s.billion.achievements).filter(d => d > Y.startDay).length : 0,
    businesses: s.businesses.length, staff: s.workers.length, prestige: s.prestige || 0,
  };
  s.recaps ||= [];
  s.recaps.unshift(report.recap);
  s.recaps.length = Math.min(s.recaps.length, 10);
  s.year = { n: Y.n + 1, startNW: nw, startRank: rank, profit: {}, startDay: s.day, taxes: 0 };
}
function inboxDay(s, report) {
  for (const e of report.events) {
    if (!/^[^\w\s$+−-]/.test(e.text)) continue; // keep the headline events (they start with an emoji)
    s.inbox.unshift({ day: s.day, text: e.text, tone: e.tone, read: false });
  }
  s.inbox.length = Math.min(s.inbox.length, 150);
}
export const unread = s => (s.inbox || []).filter(x => !x.read).length;
export function markRead(s) { for (const x of s.inbox || []) x.read = true; }

export const GOALS = [
  { text: 'Found your first business', reward: 300, test: s => s.businesses.length >= 1 },
  { text: 'Rent or buy a location for it', reward: 300, test: s => s.businesses.some(b => b.mainId) },
  { text: 'Buy equipment so staff can work', reward: 300, test: s => s.businesses.some(b => (b.equip || {}).floor > 0) },
  { text: 'Hire 2 workers (Hire tab → search)', reward: 400, test: s => s.workers.filter(w => w.pos === 'floor').length >= 2 },
  { text: 'Hire a cleaner', reward: 300, test: s => s.workers.some(w => w.pos === 'cleaner') },
  { text: 'Get a business fully open', reward: 500, test: s => s.businesses.some(b => b.last && b.last.revenue > 0) },
  { text: 'Make $300 profit in one day', reward: 1000, test: s => s.businesses.some(b => b.last && b.last.profit >= 300) },
  { text: 'Open a second business', reward: 2000, test: s => s.businesses.length >= 2 },
  { text: 'Reach $100,000 net worth', reward: 5000, test: s => netWorth(s) >= 1e5 },
];
export function checkGoals(s) {
  const T = s.tutorial;
  let msg = null;
  while (T.step < GOALS.length && GOALS[T.step].test(s)) {
    s.cash += GOALS[T.step].reward;
    msg = `🎯 Goal done: ${GOALS[T.step].text} (+${fmt(GOALS[T.step].reward)})`;
    T.step++;
  }
  return msg;
}
export function skipGoals(s) { s.tutorial.step = GOALS.length; }

// ======================================================================= daily hook
export function moreDay(s, report, nw, rank) {
  initMore(s);
  seasonEvents(s, report);
  let cash = 0, net = 0;
  const h = hustleDay(s); cash += h; net += h; report.hustle = h;
  let fr = 0;
  for (const b of s.businesses) fr += franchiseDay(s, b, report);
  cash += fr; net += fr; report.franchise = fr;
  const lease = leaseIncomeDay(s, report); cash += lease; net += lease; report.leaseIncome = lease;
  const ln = loansDay(s, report); cash += ln.cash; net += ln.net; report.loanInterest = -ln.net; report.loanPaid = -ln.cash;
  starDay(s, report);
  rivalsDay(s, report);
  devDay(s, report);
  politicsDay(s, report);
  const g = checkGoals(s);
  if (g) report.events.push({ tone: 'good', text: g });
  recapDay(s, report, nw, rank);
  return { cash, net };
}
export function moreAfterDay(s, report) {
  inboxDay(s, report);
  s.indexHist ||= {};
  for (const [c, v] of Object.entries(s.index)) { const h = (s.indexHist[c] ||= []); h.push(Math.round(v * 1000) / 1000); if (h.length > 360) h.shift(); }
}
export const moreLiabilities = s => loanDebt(s);
export const moreAssets = s => s.businesses.reduce((a, b) => a + franchiseValue(b), 0) + s.devs.reduce((a, d) => a + d.cost * 0.8, 0);
export { seasonEvents };
