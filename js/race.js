/* ============================================================
   Points tab → Race segment (docs/points-race-plan.md): every drafter's
   projected points (or rank) over the season, a month window with chips
   and a season minimap, Replay, and the Points table re-sorted to the
   day being scrubbed.

   History comes from the worker (GET /points/history, one sample per
   day, worker/points-history.js), mirrored to localStorage. Today's
   point is always the totals on screen (withToday), so the chart's today
   matches the Standings tab. Fake points mode charts a seeded made-up
   history instead. The math is js/race-math.js; this file only draws.

   js/overall.js owns the page: raceHtml() is the segment's markup,
   raceMount() binds it after every list render, raceUnmount() before
   the next one. Scrubbing, panning and Replay redraw only this card and
   its table, never the page, so the hero stays on today.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { fetchJSON, segmentedControlHtml, escapeHtml, ordinal, reducedMotion, skeletonRowsHtml } from './utils.js';
import { chatWorkerBase } from './api.js';
import { withScopeQuery, scopedKey } from './season.js';
import { currentDraftTeamId } from './board.js';
import { lockedAtFor } from './season-lock.js';
import { regularSeasonEnd } from './season-phase.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { obTableHtml, obOpenSheet, isObSimulated } from './overall.js';
import {
  dayNumber, historyDay, fmtDay, buildSeries, standingsAt, interp, monthsOf, monthWindow, followWindow,
  monthIndexAt, dayAtFraction, yDomain, gridValues, xTicks, spreadLabels, withToday, simulatedHistory, MONTH_PAD
} from './race-math.js';

// Chart geometry, in viewBox units (the SVG scales to the card's width).
const W = 310, H = 232, TOP = 14, BOT = 204, TICK_Y = 222, MINI_H = 30;
const PLOT_L = 4, PLOT_W = W - 14;
const PAN_MS = 480;
const SIM_START = '2026-09-01';

// ---- History ----

const HISTORY_KEY = 'teamDashboardPointsHistory';
const HISTORY_FRESH_MS = 5 * 60 * 1000;
let history = loadLocalHistory();   // { days, fetchedAt } | null
let historyLoading = false;

function loadLocalHistory(){
  try {
    const v = JSON.parse(localStorage.getItem(scopedKey(HISTORY_KEY)));
    return v && Array.isArray(v.days) ? v : null;
  } catch (e){
    return null;
  }
}

function refreshHistory(){
  if(historyLoading || isObSimulated()) return;
  if(history && Date.now() - history.fetchedAt < HISTORY_FRESH_MS) return;
  historyLoading = true;
  fetchJSON(withScopeQuery(`${chatWorkerBase()}/points/history`)).then(res => {
    historyLoading = false;
    if(!res || !Array.isArray(res.days)) return;
    history = { days: res.days, fetchedAt: Date.now() };
    try { localStorage.setItem(scopedKey(HISTORY_KEY), JSON.stringify(history)); } catch (e){}
    rerender();
  });
}

// ---- State ----

let mode = 'points';          // 'points' | 'rank'
let zoom = 'month';           // 'month' | 'season'
let monthIdx = 0;             // chip index (reset to the current month on new data)
let win = null;               // [a, b] shown now (animated)
let cursor = null;            // scrubbed day, null = latest in window
let replaying = false, replayT = 0;
let focus = null;             // drafter followed in the chart

let series = null, months = [], seasonWin = [0, 1], markers = [];
let seriesKey = '';
let rowsNow = null, root = null;
let panRaf = 0, replayRaf = 0;
let lastTableKey = '';

function buildState(rows){
  rowsNow = rows;
  const todayIso = historyDay(Date.now());
  const base = isObSimulated() ? simulatedHistory(rows, SIM_START, todayIso) : (history ? history.days : []);
  series = buildSeries(withToday(base, todayIso, rows), rows.map(r => ({ id: r.id, name: r.name })), todayIso);
  months = monthsOf(series);
  markers = lockMarkers();
  seasonWin = [-MONTH_PAD, Math.max(series.today, ...markers.map(m => m.day)) + 10];
  if(!series.ids.includes(focus)) focus = series.ids.includes(currentDraftTeamId) ? currentDraftTeamId : series.ids[0];
  // A new day or new history resets the window; a plain re-render
  // (a data refresh) keeps whatever was being looked at.
  const key = `${series.origin}:${series.today}:${isObSimulated()}`;
  if(key !== seriesKey || !win){
    seriesKey = key;
    monthIdx = months.length - 1;
    win = zoom === 'month' ? monthWindow(months[monthIdx]) : seasonWin;
  }
}

// Each scoring league's lock: where it locked, or where its regular
// season is due to end (a league still showing last season scores next
// year's, so its date moves a year on). EPL has no ESPN calendar, so it
// only shows once locked.
function lockMarkers(){
  const now = Date.now();
  return LEAGUES.filter(l => LEAGUE_SCORING[l.key]).map(l => {
    const at = lockedAtFor(l.key);
    let ts = at ? Date.parse(at) : null;
    if(ts === null){
      const end = regularSeasonEnd(l.key);
      if(!end) return null;
      ts = end.getTime();
      if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(l.key) && ts < now) ts += 364 * 864e5;
    }
    return { key: l.key, abbr: FILTER_CHIP_LABELS[l.key] || l.label, day: dayNumber(historyDay(ts)) - series.origin, locked: !!at };
  }).filter(Boolean);
}

// The day everything reads: the replay playhead, the scrubbed day, or the
// latest day inside the window (a month's last day, not its padding).
function currentDay(){
  if(replaying) return replayT;
  if(cursor !== null) return cursor;
  const end = zoom === 'month' ? win[1] - MONTH_PAD : win[1];
  return Math.max(0, Math.min(series.today, Math.floor(end + 1e-6)));
}

// ---- Markup ----

export function raceHtml(rows){
  rowsNow = rows;
  refreshHistory();
  if(!isObSimulated() && !history && historyLoading){
    return `<div class="race-card" id="race-root">${skeletonRowsHtml(4)}</div>`;
  }
  buildState(rows);
  if(series.today < 1){
    return `
      <div class="ob-idle-block race-idle" id="race-root">
        <div class="ob-idle-title">The race starts here</div>
        <div class="ob-idle-body">Everyone's points are recorded once a day, starting ${fmtDay(series.origin)}. The chart fills in from tomorrow.</div>
      </div>
    `;
  }
  return `<div class="race" id="race-root">${cardHtml()}</div>`;
}

function cardHtml(){
  const modeSeg = segmentedControlHtml([{ key: 'points', label: 'Points' }, { key: 'rank', label: 'Rank' }], mode, 'raceSetMode');
  const chips = months.map((m, i) => `<button type="button" class="race-chip" data-month="${i}" onclick="raceMonth(${i})">${m.label}</button>`).join('');
  return `
    <div class="race-card">
      <div class="race-top">
        <div class="race-top-text">
          <div class="race-title">The race</div>
          <div class="race-sub" data-race="sub"></div>
        </div>
        <div class="race-controls">
          <div class="race-mode">${modeSeg}</div>
          <button type="button" class="race-replay" data-race="replay" onclick="raceToggleReplay()"></button>
        </div>
      </div>
      <div class="race-chips">
        <div class="race-chip-scroll" data-race="chips">${chips}</div>
        <button type="button" class="race-chip all" data-month="all" onclick="raceMonth('all')">All</button>
      </div>
      <div class="race-plot" data-race="plot"><svg viewBox="0 0 ${W} ${H}" data-race="chart" aria-label="Points race chart"></svg></div>
      <div class="race-mini" data-race="mini"><svg viewBox="0 0 ${W} ${MINI_H}" data-race="mini-svg" aria-hidden="true"></svg></div>
    </div>
    <div data-race="table"></div>
  `;
}

const part = name => root && root.querySelector(`[data-race="${name}"]`);

// ---- Drawing ----

const f1 = n => n.toFixed(1);

function draw(){
  if(!root || !series || series.today < 1) return;
  const c = currentDay();
  part('chart').innerHTML = chartSvg(c);
  const mini = part('mini');
  mini.hidden = zoom !== 'month';
  if(!mini.hidden) part('mini-svg').innerHTML = miniSvg();
  const day = Math.round(c);
  const isToday = day === series.today && !replaying;
  const date = fmtDay(series.origin + day);
  const following = focus !== currentDraftTeamId ? ` &middot; following ${escapeHtml(nameOf(focus))}` : '';
  part('sub').innerHTML = `${isToday ? 'Today &middot; ' : ''}${date}${following}`;
  part('replay').innerHTML = replaying ? 'Stop' : '&#9654;&#xFE0E; Replay';
  paintChips(c);
  drawTable(day, isToday ? 'Standings today' : `Standings on ${date}`);
}

const nameOf = id => (series.drafters.find(d => d.id === id) || {}).name || '';

function paintChips(c){
  const active = zoom === 'season' ? 'all' : String(replaying ? monthIndexAt(months, c) : monthIdx);
  root.querySelectorAll('.race-chip').forEach(b => b.classList.toggle('active', b.dataset.month === active));
}

function chartSvg(c){
  const [a, b] = win;
  const x = t => PLOT_L + (t - a) / (b - a) * PLOT_W;
  const n = series.ids.length;
  const dom = mode === 'points' ? yDomain(series, win, seasonWin) : null;
  const yP = v => TOP + (1 - (v - dom.lo) / (dom.hi - dom.lo)) * (BOT - TOP);
  const yR = p => TOP + 6 + p * (BOT - TOP - 12) / Math.max(1, n - 1);
  const valY = (id, t) => mode === 'rank' ? yR(interp(series.pos[id], t)) : yP(interp(series.proj[id], t));
  // Wide windows plot every few days; the ends stay exact.
  const step = b - a > 120 ? 7 : b - a > 60 ? 2 : 1;
  const pts = (id, from, to) => {
    from = Math.max(from, Math.floor(a) - step, 0);
    to = Math.min(to, Math.ceil(b) + step);
    if(to < from) return [];
    const out = [[x(from), valY(id, from)]];
    for(let d = Math.ceil((Math.floor(from) + 1) / step) * step; d < to; d += step) out.push([x(d), valY(id, d)]);
    if(to > from) out.push([x(to), valY(id, to)]);
    return out;
  };
  const path = p => {
    if(!p.length) return '';
    if(mode !== 'rank') return 'M' + p.map(q => `${f1(q[0])} ${f1(q[1])}`).join(' L');
    let s = `M${f1(p[0][0])} ${f1(p[0][1])}`;
    for(let i = 1; i < p.length; i++){
      const [x0, y0] = p[i - 1], [x1, y1] = p[i], dx = (x1 - x0) / 2;
      s += ` C${f1(x0 + dx)} ${f1(y0)} ${f1(x1 - dx)} ${f1(y1)} ${f1(x1)} ${f1(y1)}`;
    }
    return s;
  };

  const out = [`
    <defs>
      <clipPath id="race-clip"><rect x="0" y="-20" width="${W}" height="${BOT + 20}"></rect></clipPath>
      <pattern id="race-live" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" class="race-stripe-bg"></rect><rect width="2.5" height="6" class="race-stripe"></rect>
      </pattern>
    </defs>
  `];

  // Grid and Y labels
  if(mode === 'points'){
    gridValues(dom).forEach(v => {
      out.push(`<line class="race-grid" x1="0" x2="${W}" y1="${f1(yP(v))}" y2="${f1(yP(v))}"></line>`);
      if(v !== 0 && v % (dom.step * dom.every) === 0) out.push(`<text class="race-axis" x="${W}" y="${f1(yP(v) - 4)}" text-anchor="end">${v}</text>`);
    });
  } else {
    for(let p = 0; p < n; p++) out.push(`<text class="race-axis" x="${W}" y="${f1(yR(p) + 3)}" text-anchor="end">${ordinal(p + 1)}</text>`);
  }
  out.push(`<line class="race-base" x1="0" x2="${W}" y1="${BOT}" y2="${BOT}"></line>`);

  // League locks
  markers.forEach(m => {
    const mx = x(m.day);
    if(mx < -2 || mx > W + 2) return;
    const done = m.locked && m.day <= c;
    out.push(`<rect class="race-lock ${done ? 'done' : ''}" x="${f1(mx - 3)}" y="${BOT - 3}" width="6" height="6" transform="rotate(45 ${f1(mx)} ${BOT})"></rect>`);
    if(done) out.push(`<text class="race-lock-label" x="${f1(mx)}" y="${BOT - 8}" text-anchor="middle">${m.abbr}</text>`);
  });

  // X ticks
  xTicks(series, win).forEach(tk => {
    out.push(`<text class="race-tick ${tk.t <= c ? 'past' : ''}" x="${f1(x(tk.t))}" y="${TICK_Y}" text-anchor="middle">${tk.label}</text>`);
  });

  // Today
  const xt = x(series.today);
  if(xt >= -2 && xt <= W + 2){
    out.push(`<line class="race-today" x1="${f1(xt)}" x2="${f1(xt)}" y1="${TOP - 6}" y2="${BOT}"></line>`);
    out.push(`<text class="race-today-label" x="${f1(xt)}" y="${TOP - 8}" text-anchor="middle">TODAY</text>`);
  }

  // The followed drafter's Locked floor, and their Live points hatched above it
  if(mode === 'points' && c > 0){
    const s0 = Math.max(0, Math.floor(a) - 1), fl = Math.floor(c);
    const L = series.locked[focus];
    if(fl >= s0){
      const lk = [[x(s0), yP(L[s0])]];
      for(let w = s0 + 1; w <= fl; w++){ lk.push([x(w), yP(L[w - 1])]); lk.push([x(w), yP(L[w])]); }
      lk.push([x(c), yP(L[fl])]);
      const zeroY = yP(Math.max(dom.lo, Math.min(dom.hi, 0)));
      const poly = arr => arr.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ');
      const proj = pts(focus, s0, c);
      out.push(`<polygon class="race-locked-area" clip-path="url(#race-clip)" points="${poly(lk.concat([[x(c), zeroY], [x(s0), zeroY]]))}"></polygon>`);
      out.push(`<polygon class="race-live-area" clip-path="url(#race-clip)" points="${poly(proj.concat(lk.slice().reverse()))}"></polygon>`);
      out.push(`<path class="race-locked-line" clip-path="url(#race-clip)" d="M${lk.map(q => `${f1(q[0])} ${f1(q[1])}`).join(' L')}"></path>`);
    }
  }

  // Lines: everyone else first, then the followed drafter, then you on top
  const me = currentDraftTeamId;
  const order = series.ids.slice().sort((p, q) => (p === me) - (q === me) || (p === focus) - (q === focus));
  const cls = id => id === me ? 'me' : id === focus ? 'focus' : '';
  if(c < series.today) order.forEach(id => out.push(`<path class="race-ghost" clip-path="url(#race-clip)" d="${path(pts(id, c, series.today))}"></path>`));
  order.forEach(id => out.push(`<path class="race-line ${cls(id)}" clip-path="url(#race-clip)" d="${path(pts(id, 0, c))}"></path>`));
  if(cursor !== null) out.push(`<line class="race-cursor" x1="${f1(x(c))}" x2="${f1(x(c))}" y1="${TOP - 6}" y2="${BOT}"></line>`);

  // Heads: a dot per drafter, labels for you, the followed drafter and the leader
  const hx = x(c);
  if(hx >= -2 && hx <= W + 2){
    const leader = series.ids.reduce((best, id) => interp(series.proj[id], c) > interp(series.proj[best], c) ? id : best, series.ids[0]);
    order.forEach(id => out.push(`<circle class="race-dot ${cls(id)}" cx="${f1(hx)}" cy="${f1(valY(id, c))}" r="${id === me || id === focus ? 4 : 2}"></circle>`));
    let labs = [...new Set([me, focus, leader])].filter(id => series.ids.includes(id)).map(id => ({ id, y: valY(id, c) }));
    if(mode === 'points') labs = spreadLabels(labs, 12, TOP, BOT - 2);
    const flip = hx > W - 72;
    labs.forEach(l => {
      out.push(`<text class="race-label ${cls(l.id)}" data-focus="${l.id}" x="${f1(flip ? hx - 8 : hx + 8)}" y="${f1(l.y + 3.5)}" text-anchor="${flip ? 'end' : 'start'}">${escapeHtml(nameOf(l.id))}<tspan class="v" dx="4">${Math.round(interp(series.proj[l.id], c))}</tspan></text>`);
    });
  }
  return out.join('');
}

// The whole season, small: where the window sits, tap to jump.
function miniSvg(){
  const [sa, sb] = seasonWin;
  const x = t => PLOT_L + (t - sa) / (sb - sa) * PLOT_W;
  let lo = Infinity, hi = -Infinity;
  series.ids.forEach(id => series.proj[id].forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  if(hi - lo < 1){ hi += 1; lo -= 1; }
  const y = v => 3 + (1 - (v - lo) / (hi - lo)) * (MINI_H - 6);
  const step = series.today > 120 ? 3 : 1;
  const line = id => {
    const p = [];
    for(let d = 0; d < series.today; d += step) p.push(`${f1(x(d))} ${f1(y(series.proj[id][d]))}`);
    p.push(`${f1(x(series.today))} ${f1(y(series.proj[id][series.today]))}`);
    return 'M' + p.join(' L');
  };
  const me = currentDraftTeamId;
  const x0 = x(win[0]), x1 = x(win[1]), xt = x(series.today);
  return series.ids.filter(id => id !== me).map(id => `<path class="race-mini-line" d="${line(id)}"></path>`).join('')
    + (series.ids.includes(me) ? `<path class="race-mini-line me" d="${line(me)}"></path>` : '')
    + `<line class="race-today" x1="${f1(xt)}" x2="${f1(xt)}" y1="0" y2="${MINI_H}"></line>`
    + `<rect class="race-mini-mask" x="-2" y="0" width="${f1(Math.max(0, x0 + 2))}" height="${MINI_H}"></rect>`
    + `<rect class="race-mini-mask" x="${f1(x1)}" y="0" width="${f1(Math.max(0, W + 2 - x1))}" height="${MINI_H}"></rect>`
    + `<rect class="race-mini-win" x="${f1(x0)}" y="0.5" width="${f1(Math.max(2, x1 - x0))}" height="${MINI_H - 1}" rx="5"></rect>`;
}

// The Points table for the day on screen. Rows that change place glide
// to their new spot (FLIP); only a new day or focus re-renders it.
function drawTable(day, head){
  const key = `${day}:${focus}:${head}`;
  if(key === lastTableKey) return;
  lastTableKey = key;
  const el = part('table');
  const before = {};
  el.querySelectorAll('.ob-table-row[data-id]').forEach(r => { before[r.dataset.id] = r.getBoundingClientRect().top; });
  el.innerHTML = obTableHtml(standingsAt(series, day), { head, tap: 'raceTapRow', focus, noMoves: true });
  if(reducedMotion()) return;
  el.querySelectorAll('.ob-table-row[data-id]').forEach(r => {
    const from = before[r.dataset.id];
    if(from === undefined) return;
    const dy = from - r.getBoundingClientRect().top;
    if(Math.abs(dy) < 1) return;
    r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
}

// ---- Motion ----

const easeOutCubic = k => 1 - Math.pow(1 - k, 3);

function goWin(to){
  cancelAnimationFrame(panRaf);
  if(reducedMotion()){ win = to; draw(); return; }
  const from = win.slice(), t0 = performance.now();
  const tick = now => {
    if(!root || !root.isConnected) return;
    const k = Math.min(1, (now - t0) / PAN_MS), e = easeOutCubic(k);
    win = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    draw();
    if(k < 1) panRaf = requestAnimationFrame(tick);
  };
  panRaf = requestAnimationFrame(tick);
}

// Replay's camera, never showing more than MONTH_PAD days before history.
function replayWin(t){
  const [a, b] = followWindow(t);
  return a < -MONTH_PAD ? [-MONTH_PAD, -MONTH_PAD + (b - a)] : [a, b];
}

function stopReplay(finished){
  cancelAnimationFrame(replayRaf);
  const at = replayT;
  replaying = false;
  cursor = null;
  monthIdx = finished ? months.length - 1 : monthIndexAt(months, at);
  if(zoom === 'month') goWin(monthWindow(months[monthIdx]));
  else draw();
}

function startReplay(){
  cancelAnimationFrame(panRaf);
  cursor = null;
  // Reduced motion: nothing to watch, so Replay just lands on today.
  if(reducedMotion()){ replayT = series.today; stopReplay(true); return; }
  replaying = true;
  replayT = 0;
  const dur = Math.max(2000, Math.min(6000, series.today * 50));
  const t0 = performance.now();
  const view = document.getElementById('view-overall');
  const tick = now => {
    if(!root || !root.isConnected || !view || !view.classList.contains('active')){ replaying = false; return; }
    replayT = Math.min(series.today, (now - t0) / dur * series.today);
    if(zoom === 'month') win = replayWin(replayT);
    if(replayT >= series.today){ stopReplay(true); return; }
    draw();
    replayRaf = requestAnimationFrame(tick);
  };
  if(zoom === 'month') win = replayWin(0);
  draw();
  replayRaf = requestAnimationFrame(tick);
}

// ---- Handlers ----

export function raceMonth(key){
  if(replaying || !series) return;
  cursor = null;
  if(key === 'all'){ zoom = 'season'; goWin(seasonWin); return; }
  zoom = 'month';
  monthIdx = Math.max(0, Math.min(months.length - 1, Number(key)));
  goWin(monthWindow(months[monthIdx]));
  scrollChipIntoView();
}
window.raceMonth = raceMonth;

export function raceSetMode(key){
  if(key !== 'points' && key !== 'rank') return;
  mode = key;
  const seg = root && root.querySelector('.race-mode');
  if(seg) seg.innerHTML = segmentedControlHtml([{ key: 'points', label: 'Points' }, { key: 'rank', label: 'Rank' }], mode, 'raceSetMode');
  draw();
}
window.raceSetMode = raceSetMode;

export function raceToggleReplay(){
  if(!series) return;
  if(replaying) stopReplay(false);
  else startReplay();
}
window.raceToggleReplay = raceToggleReplay;

// First tap follows a drafter in the chart; tapping the one already
// followed opens their quick sheet, same as a Standings row.
export function raceTapRow(id){
  if(id === focus){ obOpenSheet(id); return; }
  focus = id;
  draw();
}
window.raceTapRow = raceTapRow;

function scrollChipIntoView(){
  const scroller = part('chips');
  const chip = scroller && scroller.querySelector(`[data-month="${monthIdx}"]`);
  if(!chip) return;
  const left = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
  scroller.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function plotFraction(e, el){
  const r = el.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width * W - PLOT_L) / PLOT_W;
}

function bind(){
  const plot = part('plot');
  if(!plot) return;
  const scrub = e => {
    if(replaying) return;
    const d = dayAtFraction(plotFraction(e, plot), win, series.today);
    if(d !== cursor){ cursor = d; draw(); }
  };
  const release = () => { if(!replaying && cursor !== null){ cursor = null; draw(); } };
  plot.addEventListener('pointerdown', scrub);
  plot.addEventListener('pointermove', scrub);
  plot.addEventListener('pointerleave', release);
  plot.addEventListener('pointercancel', release);
  plot.addEventListener('click', e => {
    const label = e.target.closest('[data-focus]');
    if(!label) return;
    focus = label.dataset.focus;
    lastTableKey = '';
    draw();
  });
  part('mini').addEventListener('click', e => {
    const [sa, sb] = seasonWin;
    const t = sa + plotFraction(e, part('mini')) * (sb - sa);
    raceMonth(monthIndexAt(months, Math.max(0, Math.min(series.today, t))));
  });
}

// ---- Lifecycle (called by js/overall.js) ----

export function raceMount(container, rows){
  root = container.querySelector('#race-root');
  if(!root || !series || series.today < 1){ root = null; return; }
  rowsNow = rows;
  lastTableKey = '';
  bind();
  draw();
  const scroller = part('chips');
  if(scroller) scroller.scrollLeft = scroller.scrollWidth;
  if(zoom === 'month') scrollChipIntoView();
}

export function raceUnmount(){
  cancelAnimationFrame(panRaf);
  if(replaying){ cancelAnimationFrame(replayRaf); replaying = false; cursor = null; }
  root = null;
}

// Fresh history landed while Race is up (the chart, its loading
// skeleton or the "starts here" note): rebuild just this segment.
function rerender(){
  const holder = document.getElementById('race-root');
  if(!holder || !rowsNow) return;
  const container = holder.parentElement;
  raceUnmount();
  holder.outerHTML = raceHtml(rowsNow);
  raceMount(container, rowsNow);
}
