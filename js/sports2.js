// More sports: basketball (London & New York, with playoffs) and a racing team (world championship).
import { CITIES } from './data.js';
import { fmt, parcelById } from './engine.js';

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
const econ = s => (s.economy ? s.economy.mult : 1);
const ord = n => n + (['st', 'nd', 'rd'][n - 1] || 'th');

export function initSports2(s) {
  s.bball ||= newBball();
  s.racing ||= newRacing();
}

// ======================================================================= BASKETBALL
const BB_NAMES = {
  london: ['London Lightning', 'Thames Titans', 'Camden Cobras', 'Soho Sabres', 'Greenwich Giants', 'Brixton Blaze', 'Hackney Hornets', 'Kensington Kings'],
  nyc: ['Manhattan Monarchs', 'Brooklyn Bolts', 'Queens Quake', 'Bronx Bandits', 'Harlem Heat', 'Staten Storm', 'Hudson Hawks', 'Midtown Meteors'],
};
export const BB_LEAGUES = { london: 'London Basketball League', nyc: 'New York Basketball League' };
export const BB_GAMES = 28, BB_PAYROLL_MAX = 5, BB_COACH_MAX = 3;
export const BB_PRIZES = { champion: 15e6, final: 8e6, semi: 4e6 };
function newBball() {
  const leagues = {};
  for (const city of Object.keys(BB_NAMES)) leagues[city] = { season: 1, game: 0, playoffs: null, teams: BB_NAMES[city].map((name, i) => ({ id: `bb-${city}-${i}`, name, rating: Math.round(rand(45, 80)), w: 0, l: 0 })) };
  return { leagues, team: null, results: [], titles: 0 };
}
export const bbPrice = (s, t, city) => Math.round(10e6 * Math.pow(t.rating / 50, 4) * CITIES[city].cost / 1e5) * 1e5;
export const bbPayrollCost = (t) => Math.round(20000 * Math.pow(1.6, t.payroll) * CITIES[t.city].wage);
export const bbCoachCost = t => Math.round(5e6 * (t.coaching + 1) * CITIES[t.city].cost);
export const bbValue = s => s.bball.team ? Math.round(s.bball.team.price * 0.65) : 0;
export function bbRating(s) {
  const T = s.bball.team;
  if (!T) return 0;
  return T.base + T.payroll * 5 + T.coaching * 2;
}
export function buyBbTeam(s, city, id) {
  if (s.bball.team) return 'You already own a basketball team';
  const t = s.bball.leagues[city].teams.find(x => x.id === id);
  if (!t) return 'Team not found';
  const price = bbPrice(s, t, city);
  if (s.cash < price) return `You need ${fmt(price)}`;
  s.cash -= price;
  s.bball.team = { id, city, name: t.name, base: t.rating - 10, payroll: 2, coaching: 0, ticket: 1, price, last: null };
  return null;
}
export function sellBbTeam(s) { if (!s.bball.team) return 'No team'; s.cash += bbValue(s); s.bball.team = null; return null; }
export function setPayroll(s, lvl) { const T = s.bball.team; if (T) T.payroll = clamp(lvl, 0, BB_PAYROLL_MAX); }
export function upgradeCoaching(s) {
  const T = s.bball.team;
  if (!T) return 'No team';
  if (T.coaching >= BB_COACH_MAX) return 'Coaching staff is already elite';
  const cost = bbCoachCost(T);
  if (s.cash < cost) return `You need ${fmt(cost)}`;
  s.cash -= cost; T.coaching++;
  return null;
}
export function setBbTicket(s, v) { if (s.bball.team) s.bball.team.ticket = clamp(v, 0.5, 2.5); }
function bbGame(H, A) {
  const p = 1 / (1 + Math.exp(-((H.rating + 3) - A.rating) / 8));
  const homeWins = Math.random() < p;
  const loser = Math.round(gauss(96, 8)), margin = randi(1, 18);
  return homeWins ? [loser + margin, loser] : [loser, loser + margin];
}
export const bbStandings = lg => lg.teams.slice().sort((a, b) => b.w - a.w || a.l - b.l);
function bbDay(s, report) {
  const B = s.bball, T = B.team;
  let net = 0;
  if (T) {
    const lg = B.leagues[T.city];
    const me = lg.teams.find(t => t.id === T.id);
    me.rating = bbRating(s);
    const wages = bbPayrollCost(T);
    const sponsor = Math.round(1500 * Math.pow(me.rating / 50, 3) * CITIES[T.city].spend * econ(s));
    net += sponsor - wages;
    T.last = { wages, sponsor, tickets: 0 };
  }
  const dow = s.day % 7;
  if (dow !== 3 && dow !== 6) return net; // games on Wednesdays and Saturdays
  for (const [city, lg] of Object.entries(B.leagues)) {
    if (!lg.playoffs) {
      const order = lg.teams.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < order.length; i += 2) net += bbPlay(s, city, order[i], order[i + 1], report);
      lg.game++;
      if (lg.game >= BB_GAMES) {
        const top = bbStandings(lg).slice(0, 4);
        lg.playoffs = { round: 'semi', pairs: [[top[0], top[3]], [top[1], top[2]]], winners: [] };
        if (T && T.city === city) report.events.push({ tone: top.some(t => t.id === T.id) ? 'good' : 'bad', text: `🏀 Regular season over: ${top.some(t => t.id === T.id) ? `${T.name} made the playoffs!` : `${T.name} missed the playoffs`}` });
      }
    } else if (lg.playoffs.round === 'semi') {
      const winners = lg.playoffs.pairs.map(([a, b]) => { const [x, y] = bbGameScore(s, city, a, b, report, 'Semi-final'); net += x; return y; });
      lg.playoffs = { round: 'final', pairs: [winners], semiLosers: lg.playoffs.pairs.flat().filter(t => !winners.includes(t)) };
    } else {
      const [a, b] = lg.playoffs.pairs[0];
      const [x, champ] = bbGameScore(s, city, a, b, report, 'Final');
      net += x;
      if (T && T.city === city) {
        const place = champ.id === T.id ? 'champion' : [a.id, b.id].includes(T.id) ? 'final' : lg.playoffs.semiLosers.some(t => t.id === T.id) ? 'semi' : null;
        if (place) {
          const prize = Math.round(BB_PRIZES[place] * CITIES[city].spend);
          net += prize;
          if (place === 'champion') { s.prestige = (s.prestige || 0) + 8; B.titles++; }
          report.events.push({ tone: 'good', text: `🏆 ${T.name} ${place === 'champion' ? 'won the championship!' : place === 'final' ? 'lost the final' : 'went out in the semi-finals'} — prize ${fmt(prize)}${place === 'champion' ? ' (+8 prestige)' : ''}` });
        }
      }
      for (const t of lg.teams) { t.w = 0; t.l = 0; if (!T || t.id !== T.id) t.rating = clamp(t.rating + randi(-4, 4), 40, 90); }
      lg.game = 0; lg.playoffs = null; lg.season++;
    }
  }
  return net;
}
function bbGameScore(s, city, a, b, report, label) {
  const [ha, hb] = bbGame(a, b);
  const w = ha > hb ? a : b;
  const T = s.bball.team;
  if (T && T.city === city && (a.id === T.id || b.id === T.id)) {
    const mine = a.id === T.id ? ha : hb, theirs = a.id === T.id ? hb : ha, opp = a.id === T.id ? b : a;
    report.events.push({ tone: mine > theirs ? 'good' : 'bad', text: `🏀 ${label}: ${T.name} ${mine}–${theirs} ${opp.name}` });
  }
  return [0, w];
}
function bbPlay(s, city, H, A, report) {
  const [hs, as] = bbGame(H, A);
  if (hs > as) { H.w++; A.l++; } else { A.w++; H.l++; }
  const T = s.bball.team;
  if (!T || T.city !== city || (H.id !== T.id && A.id !== T.id)) return 0;
  const home = H.id === T.id;
  const mine = home ? hs : as, theirs = home ? as : hs, opp = home ? A : H;
  let tickets = 0;
  if (home) {
    const arena = s.billion && s.billion.projects.some(p => p.type === 'arena' && p.done) ? 0.2 : 0;
    const me = s.bball.leagues[city].teams.find(t => t.id === T.id);
    const draw = clamp(0.5 + arena + (me.rating - 60) / 80 + (me.w - me.l) / 60 - (T.ticket - 1) * 0.35, 0.2, 1);
    tickets = Math.round(19000 * draw * 55 * T.ticket * CITIES[city].spend * econ(s));
    T.last.tickets = tickets;
  }
  s.bball.results.unshift({ day: s.day, home, opp: opp.name, mine, theirs, res: mine > theirs ? 'W' : 'L', tickets });
  s.bball.results.length = Math.min(s.bball.results.length, 20);
  return tickets;
}

// ======================================================================= RACING
const TEAMS = ['Apex Racing', 'Vortex GP', 'Falcon Motorsport', 'Nordic Speed', 'Crimson Racing', 'Silverline GP', 'Riviera Velocity', 'Thunder Racing', 'Orbit Motorsport', 'Polar GP'];
const DRIVERS = ['Max Kowalczyk', 'Lena Hartmann', 'Sergio Ruiz', 'Aiden Cole', 'Yuki Mori', 'Pierre Laurent', 'Oscar Lind', 'Mia Rossi', 'Kenji Arai', 'Lucas Brandt', 'Nico Vela', 'Freya Holm', 'Dante Ferro', 'Ravi Shah', 'Theo Marchetti', 'Ivy Chen', 'Leon Duval', 'Sara Novak', 'Felix Wagner', 'Jonas Berg'];
export const RACES = 20;
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const CONSTRUCTOR_PRIZES = [80e6, 50e6, 35e6, 25e6, 18e6, 12e6, 8e6, 5e6, 3e6, 2e6];
export const RACE_PRIZES = [2e6, 1.2e6, 0.8e6, 0.5e6, 0.3e6];
export const RACE_OPS = 150000;
export const driverWage = skill => Math.round(2000 * Math.pow(skill / 60, 4));
function newRacing() {
  const names = DRIVERS.slice().sort(() => Math.random() - 0.5);
  return {
    season: 1, race: 0, titles: 0, results: [], market: [],
    teams: TEAMS.map((name, i) => ({ id: `rc-${i}`, name, car: Math.round(rand(55, 90)), drivers: [names[i * 2], names[i * 2 + 1]].map(n => ({ name: n, skill: randi(55, 95) })), pts: 0 })),
    team: null,
  };
}
export const racePrice = t => Math.round(150e6 * Math.pow(t.car / 70, 3) / 1e6) * 1e6;
export const raceValue = s => s.racing.team ? Math.round(s.racing.team.price * 0.6) : 0;
export function buyRaceTeam(s, id) {
  if (s.racing.team) return 'You already own a racing team';
  const t = s.racing.teams.find(x => x.id === id);
  if (!t) return 'Team not found';
  const price = racePrice(t);
  if (s.cash < price) return `You need ${fmt(price)}`;
  s.cash -= price;
  s.racing.team = { id, name: t.name, price, rnd: 0, last: null };
  refreshDrivers(s, true);
  return null;
}
export function sellRaceTeam(s) { if (!s.racing.team) return 'No team'; s.cash += raceValue(s); s.racing.team = null; return null; }
export const myRaceTeam = s => s.racing.team ? s.racing.teams.find(t => t.id === s.racing.team.id) : null;
export function investRnd(s, amount) {
  const t = myRaceTeam(s);
  if (!t) return 'No team';
  if (s.cash < amount) return `You need ${fmt(amount)}`;
  s.cash -= amount;
  const gain = 6 * Math.log10(1 + amount / (2e6 * Math.pow(t.car / 60, 3)));
  t.car = clamp(t.car + gain, 30, 99);
  s.racing.team.rnd += amount;
  return gain;
}
function refreshDrivers(s, force) {
  const R = s.racing;
  if (!force && R.market.length && s.day - (R.marketDay || 0) < 14) return;
  R.market = Array.from({ length: 6 }, () => ({ name: pick(DRIVERS) + (Math.random() < 0.5 ? ' Jr.' : ''), skill: randi(50, 97), age: randi(19, 36) })).sort((a, b) => b.skill - a.skill);
  R.marketDay = s.day;
}
export const driverFee = d => driverWage(d.skill) * 200;
export function signDriver(s, idx, seat) {
  const t = myRaceTeam(s), d = s.racing.market[idx];
  if (!t || !d) return 'Not available';
  const fee = driverFee(d);
  if (s.cash < fee) return `Signing fee: ${fmt(fee)}`;
  s.cash -= fee;
  t.drivers[seat] = { name: d.name, skill: d.skill };
  s.racing.market.splice(idx, 1);
  return null;
}
function raceDay(s, report) {
  const R = s.racing;
  let net = 0;
  const mine = myRaceTeam(s);
  if (mine) {
    const wages = mine.drivers.reduce((a, d) => a + driverWage(d.skill), 0);
    net -= RACE_OPS + wages;
    mine.car = Math.max(30, mine.car - 0.02); // rivals keep developing
    R.team.last = { wages: wages + RACE_OPS };
    refreshDrivers(s);
  }
  if (s.day % 14 !== 0) return net; // a race every other Sunday
  const entries = [];
  for (const t of R.teams) for (const d of t.drivers) entries.push({ t, d, perf: Math.random() < 0.05 ? -999 : t.car * 0.6 + d.skill * 0.4 + gauss(0, 6) });
  entries.sort((a, b) => b.perf - a.perf);
  entries.forEach((e, i) => { if (e.perf > -999 && RACE_POINTS[i]) e.t.pts += RACE_POINTS[i]; });
  R.race++;
  if (mine) {
    const my = entries.map((e, i) => ({ ...e, pos: i + 1 })).filter(e => e.t === mine);
    const best = Math.min(...my.map(e => e.perf > -999 ? e.pos : 99));
    const prize = best <= RACE_PRIZES.length ? RACE_PRIZES[best - 1] : 0;
    net += prize;
    const txt = my.map(e => e.perf <= -999 ? `${e.d.name} DNF` : `${e.d.name} ${ord(e.pos)}`).join(', ');
    R.results.unshift({ day: s.day, race: R.race, txt, best, prize });
    R.results.length = Math.min(R.results.length, 12);
    report.events.push({ tone: best <= 3 ? 'good' : best > 10 ? 'bad' : 'info', text: `🏎️ Race ${R.race}/${RACES}: ${txt}${prize ? ` · prize ${fmt(prize)}` : ''}` });
  }
  if (R.race >= RACES) {
    const table = R.teams.slice().sort((a, b) => b.pts - a.pts);
    if (mine) {
      const pos = table.indexOf(mine);
      const prize = CONSTRUCTOR_PRIZES[pos] || 0;
      net += prize;
      if (pos === 0) { s.prestige = (s.prestige || 0) + 15; R.titles++; }
      report.events.push({ tone: pos < 3 ? 'good' : 'info', text: `🏁 Season ${R.season} over: ${mine.name} finished ${ord(pos + 1)} in the championship — prize ${fmt(prize)}${pos === 0 ? ' (+15 prestige)' : ''}` });
    }
    for (const t of R.teams) { t.pts = 0; if (t !== mine) t.car = clamp(t.car + randi(-4, 5), 50, 97); }
    R.race = 0; R.season++;
  }
  return net;
}

// ======================================================================= hooks
export function sports2Day(s, report) {
  initSports2(s);
  const bb = bbDay(s, report);
  const rc = raceDay(s, report);
  report.bball = bb;
  report.racing = rc;
  return bb + rc;
}
export const sports2Assets = s => (s.bball ? bbValue(s) : 0) + (s.racing ? raceValue(s) : 0);
export { parcelById };
