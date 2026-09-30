/* ============================================================
   Race chart math (Points tab → Race, docs/points-race-plan.md).
   Pure functions only: no DOM, no fetch, so the renderer (js/race.js)
   and Node tests (tests/race-math.test.mjs) share them.

   Time is in whole days. A series is indexed from its ORIGIN, the first
   day with a history sample (worker/points-history.js): index 0 is that
   day and `today` is the last index. Windows are [a, b] in the same
   index space and may be fractional (they're animated) or reach before
   0 / past today (the season axis spans the whole class).
   ============================================================ */
import { assignRank } from './rank.js';

const DAY_MS = 864e5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- Days ----

// 'YYYY-MM-DD' <-> days since the epoch (UTC, so no DST drift).
export function dayNumber(iso){
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoOfDay(n){
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// "Sep 29"
export function fmtDay(n){
  const d = new Date(n * DAY_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ---- Series ----

// History days -> per-drafter arrays from the first sample through
// `todayIso`, with a day that has no sample holding the previous one
// (nobody opened the app that day). Ranks per day come from the same
// assignRank as the Points table. null when there's no history.
export function buildSeries(historyDays, drafters, todayIso){
  const days = (historyDays || []).filter(x => x && x.p && x.l).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  if(!days.length) return null;
  const origin = dayNumber(days[0].d);
  const today = Math.max(dayNumber(todayIso), dayNumber(days[days.length - 1].d)) - origin;
  const ids = drafters.map(d => d.id);
  const proj = {}, locked = {}, rank = {}, lrank = {}, pos = {};
  ids.forEach(id => { proj[id] = []; locked[id] = []; rank[id] = []; lrank[id] = []; pos[id] = []; });

  let next = 0, cur = null;
  for(let i = 0; i <= today; i++){
    while(next < days.length && dayNumber(days[next].d) - origin <= i) cur = days[next++];
    ids.forEach(id => {
      proj[id].push(Number.isInteger(cur.p[id]) ? cur.p[id] : 0);
      locked[id].push(Number.isInteger(cur.l[id]) ? cur.l[id] : 0);
    });
  }

  for(let i = 0; i <= today; i++){
    const rows = standingsAt({ drafters, proj, locked }, i);
    rows.forEach((r, p) => {
      rank[r.id].push(r.rankLabel);
      lrank[r.id].push(r.lockedRankLabel);
      pos[r.id].push(p);
    });
  }
  return { origin, today, drafters, ids, proj, locked, rank, lrank, pos };
}

// One day's rows in the shape the Points table renders (obTableHtml):
// best first, projected rank plus locked rank.
export function standingsAt(series, i){
  const rows = series.drafters.map(d => {
    const total = series.proj[d.id][i], confirmedTotal = series.locked[d.id][i];
    return { id: d.id, name: d.name, total, confirmedTotal, provisionalTotal: total - confirmedTotal };
  });
  assignRank(rows, 'confirmedTotal', 'lockedRank');
  return assignRank(rows, 'total', 'rank');
}

// Value at a fractional day, clamped to the series.
export function interp(arr, t){
  const n = arr.length;
  if(!n) return 0;
  const c = Math.max(0, Math.min(n - 1, t));
  const a = Math.floor(c), b = Math.min(n - 1, a + 1), f = c - a;
  return arr[a] + (arr[b] - arr[a]) * f;
}

export function seasonRange(series){
  let lo = Infinity, hi = -Infinity;
  series.ids.forEach(id => series.proj[id].forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  return { lo, hi };
}

// ---- Windows ----

// The months from the first sample through today, as chips. `start` /
// `end` are the month's first day and the next month's first day. A
// label that would repeat (the class runs ~15 months) gets its year.
export function monthsOf(series){
  const out = [];
  const first = new Date(series.origin * DAY_MS), last = new Date((series.origin + series.today) * DAY_MS);
  let y = first.getUTCFullYear(), m = first.getUTCMonth();
  while(y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth())){
    const start = Math.round(Date.UTC(y, m, 1) / DAY_MS) - series.origin;
    const end = Math.round(Date.UTC(y, m + 1, 1) / DAY_MS) - series.origin;
    out.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, label: MONTHS[m], year: y, start, end });
    if(++m > 11){ m = 0; y++; }
  }
  const seen = {};
  out.forEach(x => { seen[x.label] = (seen[x.label] || 0) + 1; });
  out.forEach(x => { if(seen[x.label] > 1) x.label += ` '${String(x.year).slice(2)}`; });
  return out;
}

export const MONTH_PAD = 2;       // days shown either side of a month
export const MIN_WINDOW = 10;     // a short first month still gets this many days

// A month's window, starting no earlier than the first sample (nothing
// is drawn before it) but never narrower than MIN_WINDOW.
export function monthWindow(month){
  const b = month.end - 1 + MONTH_PAD;
  const a = Math.min(Math.max(month.start, 0) - MONTH_PAD, b - MIN_WINDOW);
  return [a, b];
}

// Replay's camera: most of a month behind the playhead, a week ahead.
export function followWindow(t){
  return [t - 24, t + 7];
}

export function monthIndexAt(months, t){
  const i = months.findIndex(m => t >= m.start && t < m.end);
  return i === -1 ? (t < 0 ? 0 : months.length - 1) : i;
}

// Pointer position (0..1 across the plot) -> a whole day inside the
// window, never past today or before the first sample.
export function dayAtFraction(frac, win, today){
  const [a, b] = win;
  const d = Math.round(a + frac * (b - a));
  return Math.max(Math.max(0, Math.ceil(a)), Math.min(today, Math.floor(b), d));
}

// ---- Y axis ----

const STEPS = [5, 10, 20, 25, 50, 100];

// Every drafter's min/max inside the window (edges interpolated, so a pan
// moves it continuously), padded 12% (at least 6), blended toward the
// whole season's range as the window widens from a month to the season.
// Floored at 0 unless someone is actually below it (a last-place rule
// can take a drafter negative), in which case it pads below them too.
export function yDomain(series, win, seasonWin){
  const [a, b] = win;
  const ts = [a, b];
  for(let t = Math.ceil(a); t < b; t++) ts.push(t);
  let lo = Infinity, hi = -Infinity;
  series.ids.forEach(id => ts.forEach(t => {
    if(t > series.today + 1) return;
    const v = interp(series.proj[id], t);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }));
  const season = seasonRange(series);
  const negative = season.lo < 0;
  const pad = Math.max(6, (hi - lo) * 0.12);
  lo = negative ? lo - pad : Math.max(0, lo - pad);
  hi += pad;
  const floor = negative ? season.lo - Math.max(6, (season.hi - season.lo) * 0.05) : 0;
  const monthW = 31 + 2 * MONTH_PAD, fullW = seasonWin[1] - seasonWin[0];
  const k = Math.max(0, Math.min(1, (b - a - monthW) / Math.max(1, fullW - monthW)));
  const seasonHi = Math.max(season.hi * 1.05, floor + 10);
  lo += (floor - lo) * k;
  hi += (seasonHi - hi) * k;
  const range = hi - lo;
  const step = STEPS.find(s => range / s <= 6) || STEPS[STEPS.length - 1];
  return { lo, hi, step, every: range / step > 4 ? 2 : 1 };
}

// Grid values for a domain, low to high. Labels go on every `every`th.
export function gridValues(domain){
  const out = [];
  for(let v = Math.ceil(domain.lo / domain.step) * domain.step; v <= domain.hi; v += domain.step) out.push(v);
  return out;
}

// ---- X axis ----

// Month-sized windows get weekly ticks on the 1st/8th/15th/22nd/29th;
// wider ones get month starts, every other month once it's crowded.
export function xTicks(series, win){
  const [a, b] = win, out = [];
  if(b - a <= 45){
    // Not in the padding either side of a month, where a tick would sit
    // on top of the month's own 1st.
    for(let t = Math.ceil(a + MONTH_PAD); t <= b - MONTH_PAD; t++){
      const d = new Date((series.origin + t) * DAY_MS).getUTCDate();
      if((d - 1) % 7 === 0 && d < 30) out.push({ t, label: fmtDay(series.origin + t) });
    }
    return out;
  }
  const months = [];
  const first = new Date((series.origin + Math.ceil(a)) * DAY_MS);
  let y = first.getUTCFullYear(), m = first.getUTCMonth() + (first.getUTCDate() > 1 ? 1 : 0);
  for(;;){
    const t = Math.round(Date.UTC(y, m, 1) / DAY_MS) - series.origin;
    if(t > b) break;
    months.push({ t, label: MONTHS[((m % 12) + 12) % 12] });
    m++;
  }
  const every = months.length > 7 ? 2 : 1;
  return months.filter((_, i) => i % every === 0);
}

// ---- Labels ----

// Head labels sorted top to bottom, pushed apart to `gap` px, kept inside
// [top, bottom]. Mutates and returns each item's `y`.
export function spreadLabels(items, gap, top, bottom){
  const labs = items.slice().sort((p, q) => p.y - q.y);
  labs.forEach((l, i) => { l.y = Math.max(l.y, i ? labs[i - 1].y + gap : top); });
  for(let i = labs.length - 1; i >= 0; i--){
    const lim = i === labs.length - 1 ? bottom : labs[i + 1].y - gap;
    labs[i].y = Math.min(labs[i].y, lim);
  }
  return labs;
}
