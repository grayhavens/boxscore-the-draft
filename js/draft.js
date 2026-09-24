/* ============================================================
   Draft room UI (#view-draft, ?view=draft[&room=<name>]).

   Renders whatever the DraftRoom server says (js/draft-client.js) and
   sends the user's intent back as reducer actions; it never decides on
   its own what is legal. Rules-derived values it needs to *show* (whose
   turn it is, caps, what's still available) come from the same pure
   modules the server runs: js/draft-rules.js and js/draft-engine.js.

   Three screens share the view:
   - Lobby: draft order (lottery), commissioner setup. Phase 'lobby'.
   - Live room: Available pool | Board | My roster + queue. Phases
     'draft' and 'done'. Built once as a shell and then updated region by
     region, so the search box keeps focus and scroll positions survive
     every incoming pick.
   - The clock re-renders only its own three elements every 250ms; a
     full render happens only when the server sends new state.

   Commissioner controls beyond the lobby (pause, undo, edit a pick,
   trades, pick-for-someone) and the phone layout arrive in Phase E; see
   docs/draft-room-plan.md.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { LATEST_SEASON_ID } from './seasons/index.js';
import { currentProfileId } from './identity.js';
import { buildDraftPool } from './draft-pool.js';
import { onTheClock } from './draft-engine.js';
import {
  totalPicks, totalRounds, ownerOf, pickLabel, teamById, takenTeamIds,
  leagueCounts, rosterNeeds, clockElapsedMs, WRITE_IN_LEAGUES
} from './draft-rules.js';
import {
  draftStore, subscribeDraft, openDraftConnection, closeDraftConnection, serverNow,
  sendDraftAction, signInCommissioner, resumeCommissioner, saveDraftQueue, requestDraftQueue
} from './draft-client.js';

const LEAGUE_UI = {
  epl: { label: 'EPL', color: '#826AC8' }, nfl: { label: 'NFL', color: '#91C86A' },
  nba: { label: 'NBA', color: '#B57FC0' }, nhl: { label: 'NHL', color: '#6FBFC6' },
  mlb: { label: 'MLB', color: '#6AC87A' }, wnba: { label: 'WNBA', color: '#A8B36A' },
  cfb: { label: 'CFB', color: '#C86AA1' }, mcbb: { label: 'CBB', color: '#C58C6A' }
};
const leagueUi = key => LEAGUE_UI[key] || { label: key.toUpperCase(), color: '#94969E' };

const CONFIRM_MS = 3500;
const POOL_LIMIT = 60;
const UP_NEXT = 6;
const CLOCK_CHOICES = [30, 60, 90, 120, 180, 300];

const ERROR_TEXT = {
  offline: 'Not connected — try again in a moment.',
  forbidden: 'Only the commissioner can do that.',
  bad_phase: "That isn't possible right now.",
  bad_input: 'Something about that request was invalid.',
  no_order: 'Run the lottery first.',
  not_live: 'The draft is not live.',
  paused: 'The draft is paused.',
  stale: 'The board just moved — try again.',
  not_your_turn: "It's not your turn.",
  unknown_team: 'That team is not in the pool.',
  taken: 'That team was just taken.',
  league_full: 'Your roster is full for that league.',
  exists: 'That school is already on the board.',
  nothing_to_undo: 'Nothing to undo.'
};

function errorText(result){
  if(result.error === 'pool_short'){
    const d = result.detail || {};
    return `${leagueUi(d.league).label} pool has ${d.have} teams, needs ${d.need}.`;
  }
  return ERROR_TEXT[result.error] || 'Something went wrong.';
}

// ---- Local (per-device) UI state ----

const ui = {
  filter: 'all',
  search: '',
  showAll: false,
  confirming: null,       // team id awaiting its second tap
  confirmTimer: null,
  leftTab: 'available',   // narrow screens: which panel occupies the side slot
  revealed: null,         // lottery reveal: positions shown from the bottom, or null when settled
  revealTimer: null,
  lastOrderKey: undefined, // undefined until the first state has been seen (so a late joiner doesn't replay the reveal)
  shell: null,            // 'live' once the live-room shell is built
  toastTimer: null,
  pendingSelect: null     // write-in just added: filter/search to it once the pool frame arrives
};

let active = false;
let unsubscribe = null;
let clockTimer = null;
let renderQueued = false;
let lastQueueFor = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const drafterName = id => (DRAFT_TEAMS.find(d => d.id === id) || { name: id }).name;
const root = () => document.getElementById('draft-content');

// ---- Derived state ----

let fullCache = null;
function fullState(){
  const s = draftStore.state;
  if(!s) return null;
  if(!fullCache || fullCache.s !== s || fullCache.pool !== draftStore.pool){
    fullCache = { s, pool: draftStore.pool, full: { ...s, pool: draftStore.pool } };
  }
  return fullCache.full;
}

function derive(){
  const s = fullState();
  if(!s) return null;
  const d = { s, me: currentProfileId, n: s.config.drafters.length };
  d.total = totalPicks(s.config);
  d.rounds = totalRounds(s.config.caps);
  d.taken = takenTeamIds(s.picks);
  d.clockInfo = onTheClock(s);
  d.running = s.phase === 'draft' && s.clock.running;
  d.myTurn = !!d.clockInfo && d.clockInfo.owner === d.me && d.running;
  d.myCounts = s.order ? leagueCounts(s.picks, s.pool, s.order, s.overrides, d.me) : {};
  d.canAct = d.myTurn;
  return d;
}

function teamFits(d, team){
  return (d.myCounts[team.league] || 0) < (d.s.config.caps[team.league] || 0);
}

// ---- Tiles ----

function tileFg(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return '#F3F4F6';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.62 ? '#000000' : '#FFFFFF';
}

function tileHtml(team, size){
  const text = `<span class="dr-tile-abbr">${esc(team.abbr)}</span>`;
  const img = team.badgeUrl
    ? `<img src="${esc(team.badgeUrl)}" alt="" loading="lazy" onerror="this.parentElement.classList.remove('has-crest'); this.remove();">`
    : '';
  return `<span class="dr-tile dr-tile-${size}${team.badgeUrl ? ' has-crest' : ''}" style="background:${esc(team.color)};color:${tileFg(team.color)}">${text}${img}</span>`;
}

// ---- Toast ----

function toast(message){
  const el = document.getElementById('draft-toast');
  if(!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---- Header status ----

function statusPill(d){
  const el = document.getElementById('draft-status');
  if(!el) return;
  let label = 'Connecting…', dot = 'var(--text-mute)';
  if(draftStore.status === 'offline' && !d){ label = 'Offline'; }
  if(d){
    const { s } = d;
    if(s.phase === 'lobby'){ label = 'Pre-draft lobby'; dot = 'var(--accent)'; }
    else if(s.phase === 'done'){ label = 'Draft complete'; dot = 'var(--win)'; }
    else {
      const slot = d.clockInfo ? d.clockInfo.slot : d.total - 1;
      const round = Math.floor(slot / d.n) + 1;
      label = `${d.running ? 'Live' : 'Paused'} · Round ${round} · Pick ${slot + 1} of ${d.total}`;
      dot = d.running ? 'var(--live)' : 'var(--text-sub)';
    }
    if(draftStore.status === 'offline') label += ' · reconnecting';
  }
  el.innerHTML = `<i style="background:${dot}"></i>${esc(label)}`;
  const sub = document.getElementById('draft-sub');
  if(sub){
    const year = Number(LATEST_SEASON_ID) + 1;
    const rounds = d ? d.rounds : 21;
    const room = draftStore.room === 'main' ? '' : ` · room ${esc(draftStore.room)}`;
    sub.innerHTML = `${year} season · Snake · ${rounds} rounds${room}`;
  }
}

// ---- Lobby ----

function lobbyHtml(d){
  const { s } = d;
  const order = s.order;
  const drawn = !!order;
  const revealed = ui.revealed === null ? d.n : ui.revealed;
  const rows = Array.from({ length: d.n }, (_, pos) => {
    const visible = drawn && pos >= d.n - revealed;
    const id = visible ? order[pos] : null;
    const isMe = id === d.me;
    return `<div class="dr-order-row${isMe ? ' me' : ''}${visible ? ' shown' : ''}">
      <span class="dr-order-n">${pos + 1}</span>
      <span class="dr-order-name">${id ? esc(drafterName(id)) : '<span class="dr-dim">—</span>'}</span>
      ${isMe ? '<span class="dr-you">YOU</span>' : ''}
    </div>`;
  }).join('');

  let firstPicks = '';
  if(drawn && revealed >= d.n){
    const myPos = order.indexOf(d.me);
    if(myPos >= 0){
      const picks = [];
      for(let slot = 0; slot < d.total && picks.length < 4; slot++){
        if(ownerOf(slot, order, s.overrides) === d.me) picks.push('#' + (slot + 1));
      }
      firstPicks = `<div class="dr-first-picks">Your first picks: ${picks.join(', ')} …</div>`;
    }
  }

  const settled = !drawn || revealed >= d.n;
  let actions;
  if(draftStore.commissioner){
    const poolBtn = `<button class="dr-btn" onclick="draftLoadPool()">${s.poolSize ? `Reload team pool (${s.poolSize})` : 'Load team pool'}</button>`;
    const clock = `<label class="dr-inline">Clock <select onchange="draftSetClock(this.value)">${CLOCK_CHOICES.map(c => `<option value="${c}"${c === s.config.clockSeconds ? ' selected' : ''}>${c}s</option>`).join('')}</select></label>`;
    const main = !drawn
      ? `<button class="dr-btn dr-btn-primary" onclick="draftRunLottery()">Run lottery</button>`
      : `<button class="dr-btn dr-btn-primary"${settled ? '' : ' disabled'} onclick="draftStart()">Start draft</button>
         <button class="dr-btn"${settled ? '' : ' disabled'} onclick="draftRunLottery()">Re-run lottery</button>`;
    actions = `<div class="dr-actions">${main}</div><div class="dr-actions dr-actions-sub">${poolBtn}${clock}</div>`;
  } else {
    actions = `<div class="dr-wait">${drawn ? 'Waiting for the commissioner to start the draft.' : 'Waiting for the commissioner to run the lottery.'}</div>
      <form class="dr-signin" onsubmit="draftSignIn(event)">
        <input id="dr-pw" type="password" placeholder="Commissioner password" autocomplete="off" aria-label="Commissioner password">
        <button class="dr-btn" type="submit">Sign in</button>
        ${draftStore.authFailed ? '<span class="dr-err">Wrong password</span>' : ''}
      </form>`;
  }

  return `
    <div class="dr-lobby">
      <div class="dr-eyebrow">PRE-DRAFT LOBBY</div>
      <h2 class="dr-lobby-title">The ${Number(LATEST_SEASON_ID) + 1} Draft</h2>
      <p class="dr-lobby-copy">Live snake draft. Take a team from any league in any round, until you hit that league's roster cap. Order is set by random lottery.</p>
      <div class="dr-card">
        <div class="dr-card-head"><h3>Draft order</h3><span class="dr-dim">${!drawn ? 'Not drawn yet' : (settled ? 'Locked in' : 'Drawing…')}</span></div>
        ${rows}
      </div>
      ${firstPicks}
      ${actions}
    </div>`;
}

// ---- Live room shell ----

function shellHtml(){
  return `
    <div class="dr-layout" data-left-tab="${ui.leftTab}">
      <div class="dr-tabs">
        <button class="dr-tab" data-tab="available" onclick="draftLeftTab('available')">Available</button>
        <button class="dr-tab" data-tab="team" onclick="draftLeftTab('team')">My team</button>
      </div>
      <section class="dr-col dr-left">
        <div class="dr-col-head"><h2>Available</h2><span id="dr-avail-count" class="dr-dim"></span></div>
        <input id="dr-search" class="dr-search" type="search" placeholder="Search or add a college team" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" oninput="draftSearch(this.value)">
        <div id="dr-chips" class="dr-chips"></div>
        <div id="dr-pool" class="dr-pool"></div>
      </section>
      <section class="dr-col dr-center">
        <div id="dr-clock"></div>
        <div id="dr-upnext"></div>
        <div id="dr-last"></div>
        <div class="dr-board-scroll" id="dr-board-scroll"><div id="dr-board"></div></div>
      </section>
      <aside class="dr-col dr-right">
        <div id="dr-roster"></div>
        <div id="dr-queue"></div>
      </aside>
    </div>`;
}

// Region HTML is remembered so an unchanged region is left untouched
// (keeps scroll position, hover and focus). Cleared when the shell rebuilds.
const regionHtml = new Map();
function setRegion(id, html){
  const el = document.getElementById(id);
  if(el && regionHtml.get(id) !== html){ el.innerHTML = html; regionHtml.set(id, html); }
}

// ---- Available pool ----

function overallOrder(pool){
  const counts = {};
  pool.forEach(t => { counts[t.league] = (counts[t.league] || 0) + 1; });
  const leagueIdx = Object.fromEntries(Object.keys(LEAGUE_UI).map((k, i) => [k, i]));
  return pool.slice().sort((a, b) => {
    const ka = a.rank ? (a.rank - 1) / counts[a.league] : 2;
    const kb = b.rank ? (b.rank - 1) / counts[b.league] : 2;
    return ka - kb || (leagueIdx[a.league] - leagueIdx[b.league]) || a.name.localeCompare(b.name);
  });
}

let orderedCache = { pool: null, list: [] };
function orderedPool(pool){
  if(orderedCache.pool !== pool) orderedCache = { pool, list: overallOrder(pool) };
  return orderedCache.list;
}

function poolRowHtml(d, team){
  const lg = leagueUi(team.league);
  const queued = draftStore.queue.includes(team.id);
  const fits = teamFits(d, team);
  let action = '';
  if(!fits) action = '<span class="dr-full">Full</span>';
  else if(d.canAct){
    const confirming = ui.confirming === team.id;
    action = `<button class="dr-draft-btn${confirming ? ' confirm' : ''}${d.canAct ? ' mine' : ''}" onclick="draftClick('${team.id}')">${confirming ? 'Confirm' : 'Draft'}</button>`;
  }
  const meta = team.custom ? 'Write-in' : (team.rank ? `#${team.rank}` : '');
  return `<div class="dr-row${fits ? '' : ' dim'}">
    ${tileHtml(team, 'md')}
    <div class="dr-row-main">
      <div class="dr-row-name">${esc(team.name)}</div>
      <div class="dr-row-meta"><i style="background:${lg.color}"></i>${lg.label}${meta ? ` · ${meta}` : ''}</div>
    </div>
    <button class="dr-star${queued ? ' on' : ''}" onclick="draftToggleQueue('${team.id}')" aria-label="${queued ? 'Remove from queue' : 'Add to queue'}" aria-pressed="${queued}">${queued ? '★' : '☆'}</button>
    ${action}
  </div>`;
}

function writeInCardHtml(d, filtered){
  const q = ui.search.trim();
  if(d.s.phase !== 'draft' || q.length < 3) return '';
  if(!(ui.filter === 'all' || WRITE_IN_LEAGUES.includes(ui.filter))) return '';
  const lower = q.toLowerCase();
  const exact = d.s.pool.some(t => WRITE_IN_LEAGUES.includes(t.league) && t.name.toLowerCase() === lower);
  if(exact) return '';
  const targets = WRITE_IN_LEAGUES.filter(l => l in d.s.config.caps && (ui.filter === 'all' || ui.filter === l));
  if(!targets.length) return '';
  const copy = filtered.length
    ? `Not seeing the right “${esc(q)}”? Add it as a write-in.`
    : `“${esc(q)}” isn't on the board. Add it as a write-in college team.`;
  return `<div class="dr-writein"><div>${copy}</div><div class="dr-writein-btns">${targets.map(l => `<button class="dr-btn dr-btn-gold" onclick="draftAddWriteIn('${l}')">Add to ${leagueUi(l).label}</button>`).join('')}</div></div>`;
}

function renderPool(d){
  const available = orderedPool(d.s.pool).filter(t => !d.taken.has(t.id));
  const counts = {};
  available.forEach(t => { counts[t.league] = (counts[t.league] || 0) + 1; });

  const chips = [{ key: 'all', label: 'All', color: null, n: available.length }]
    .concat(Object.keys(d.s.config.caps).map(k => ({ key: k, label: leagueUi(k).label, color: leagueUi(k).color, n: counts[k] || 0 })));
  setRegion('dr-chips', chips.map(c =>
    `<button class="dr-chip${ui.filter === c.key ? ' on' : ''}" onclick="draftSetFilter('${c.key}')">${c.color ? `<i style="background:${c.color}"></i>` : ''}${c.label}<span>${c.n}</span></button>`
  ).join(''));

  const q = ui.search.trim().toLowerCase();
  const filtered = available.filter(t =>
    (ui.filter === 'all' || t.league === ui.filter) &&
    (!q || t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q))
  );
  const shown = ui.showAll ? filtered : filtered.slice(0, POOL_LIMIT);
  const more = filtered.length > POOL_LIMIT
    ? `<button class="dr-showall" onclick="draftToggleShowAll()">${ui.showAll ? `Show top ${POOL_LIMIT}` : `Show all ${filtered.length}`}</button>` : '';
  setRegion('dr-pool', shown.map(t => poolRowHtml(d, t)).join('') + more + writeInCardHtml(d, filtered));
  const count = document.getElementById('dr-avail-count');
  if(count) count.textContent = `${available.length} left`;
}

// ---- Center: clock card, up next, board ----

function clockCardHtml(d){
  const { s } = d;
  if(s.phase === 'done'){
    return `<div class="dr-clock-card done"><div><div class="dr-eyebrow" style="color:var(--win)">DRAFT COMPLETE</div><div class="dr-done-title">${d.total} picks. Rosters are set.</div></div></div>`;
  }
  const info = d.clockInfo;
  const mine = d.myTurn;
  const natural = drafterNaturalOwner(d, info.slot);
  const via = natural !== info.owner ? natural : null;
  const highest = Math.max(-1, ...Object.keys(s.picks).map(Number));
  const makeUp = info.slot < highest;
  const counts = leagueCounts(s.picks, s.pool, s.order, s.overrides, info.owner);
  const needs = rosterNeeds(s.config, counts);
  const chips = Object.keys(needs).map(k => `<span class="dr-need"><i style="background:${leagueUi(k).color}"></i>${leagueUi(k).label} ${needs[k]}</span>`).join('');
  const round = Math.floor(info.slot / d.n) + 1;
  return `
    <div class="dr-clock-card${mine ? ' mine' : ''}">
      <div class="dr-clock-main">
        <div class="dr-eyebrow${mine ? ' gold' : ''}">${mine ? "YOU'RE ON THE CLOCK" : 'ON THE CLOCK'}${makeUp ? '<span class="dr-badge">MAKE-UP PICK</span>' : ''}</div>
        <div class="dr-clock-name">${esc(drafterName(info.owner))}</div>
        <div class="dr-clock-sub">Round ${round} · Pick ${info.slot + 1} of ${d.total}${via ? ` · via ${esc(drafterName(via))}` : ''}</div>
        <div class="dr-needs"><span class="dr-dim">Still needs</span>${chips}</div>
      </div>
      <div class="dr-timer-box">
        <div class="dr-timer" id="dr-timer">0:00</div>
        <div class="dr-bar"><span id="dr-bar"></span></div>
        <div class="dr-timer-note" id="dr-timer-note"></div>
      </div>
    </div>
    ${!s.clock.running ? '<div class="dr-paused">Draft paused by the commissioner. The clock is stopped.</div>' : ''}`;
}

function drafterNaturalOwner(d, slot){
  const round = Math.floor(slot / d.n), pos = slot % d.n;
  return d.s.order[round % 2 === 0 ? pos : d.n - 1 - pos];
}

function upNextHtml(d){
  if(d.s.phase !== 'draft' || !d.clockInfo) return '';
  const chips = [];
  for(let slot = d.clockInfo.slot + 1; slot < d.total && chips.length < UP_NEXT; slot++){
    if(d.s.picks[slot]) continue;
    const owner = ownerOf(slot, d.s.order, d.s.overrides);
    chips.push(`<span class="dr-next${owner === d.me ? ' me' : ''}">${pickLabel(slot, d.n)} ${owner === d.me ? 'You' : esc(drafterName(owner))}</span>`);
  }
  let until = '';
  if(!d.myTurn){
    let count = 0, found = false;
    for(let slot = d.clockInfo.slot; slot < d.total; slot++){
      if(d.s.picks[slot]) continue;
      if(ownerOf(slot, d.s.order, d.s.overrides) === d.me){ found = true; break; }
      count++;
    }
    until = found ? `<span class="dr-until">${count === 1 ? "You're next" : `You pick in ${count}`}</span>` : '';
  }
  return `<div class="dr-upnext"><span class="dr-dim dr-upnext-label">UP NEXT</span>${chips.join('')}${until}</div>`;
}

function lastPickHtml(d){
  const slots = Object.keys(d.s.picks).map(Number);
  if(!slots.length) return '';
  const latest = slots.reduce((a, b) => (d.s.picks[a].n > d.s.picks[b].n ? a : b));
  const p = d.s.picks[latest];
  const team = teamById(d.s.pool, p.team);
  if(!team) return '';
  return `<div class="dr-last">Last pick · <b>${esc(drafterName(p.by))}</b> took ${esc(team.name)} (${leagueUi(team.league).label}) · ${pickLabel(latest, d.n)}</div>`;
}

function boardHtml(d){
  const { s, n } = d;
  const order = s.order;
  const cur = d.clockInfo ? d.clockInfo.slot : -1;
  const head = order.map(id => `<div class="dr-bh${id === d.me ? ' me' : ''}${d.clockInfo && d.clockInfo.owner === id ? ' clock' : ''}">${esc(drafterName(id))}${id === d.me ? ' (you)' : ''}</div>`).join('');
  const rows = [];
  for(let r = 0; r < d.rounds; r++){
    const cells = [];
    for(let c = 0; c < n; c++){
      const slot = r * n + (r % 2 === 0 ? c : n - 1 - c);
      const owner = ownerOf(slot, order, s.overrides);
      const pick = s.picks[slot];
      const traded = owner !== order[c];   // the column is the snake's owner; anything else was traded
      const label = pickLabel(slot, n);
      const mine = owner === d.me;
      if(pick){
        const team = teamById(s.pool, pick.team);
        const lg = team ? leagueUi(team.league) : { label: '', color: '#94969E' };
        cells.push(`<div class="dr-cell filled${mine ? ' mine' : ''}"><div class="dr-cell-top"><span>${label}</span><span style="color:${lg.color}">${lg.label}</span></div><div class="dr-cell-team">${team ? tileHtml(team, 'xs') : ''}<span>${team ? esc(team.name) : '—'}</span></div></div>`);
      } else if(slot === cur){
        cells.push(`<div class="dr-cell current" data-current="1"><div class="dr-cell-top"><span>${label}</span></div><div class="dr-cell-clock">On the clock</div></div>`);
      } else {
        cells.push(`<div class="dr-cell empty${mine ? ' mine' : ''}"><div class="dr-cell-top"><span>${label}</span></div>${traded ? `<div class="dr-cell-traded">→ ${esc(drafterName(owner))}</div>` : ''}</div>`);
      }
    }
    rows.push(`<div class="dr-round"><div class="dr-round-n">${r + 1}<small>${r % 2 === 0 ? '→' : '←'}</small></div>${cells.join('')}</div>`);
  }
  return `<div class="dr-grid" style="--cols:${n}"><div class="dr-grid-head"><div></div>${head}</div>${rows.join('')}</div>`;
}

// ---- Right: roster + queue ----

function rosterHtml(d){
  const { s } = d;
  const mine = Object.keys(s.picks).filter(k => s.picks[k].by === d.me).map(k => teamById(s.pool, s.picks[k].team)).filter(Boolean);
  const done = mine.length;
  const rows = Object.keys(s.config.caps).filter(k => s.config.caps[k] > 0).map(k => {
    const cap = s.config.caps[k];
    const have = mine.filter(t => t.league === k);
    const slots = Array.from({ length: cap }, (_, i) => have[i] ? tileHtml(have[i], 'sm') : '<span class="dr-slot"></span>').join('');
    const lg = leagueUi(k);
    return `<div class="dr-roster-row${have.length >= cap ? ' full' : ''}"><span class="dr-roster-lg" style="color:${lg.color}">${lg.label}</span><span class="dr-slots">${slots}</span><span class="dr-roster-n">${have.length}/${cap}</span></div>`;
  }).join('');
  return `<div class="dr-col-head"><h2>My roster</h2><span class="dr-dim">${done} of ${d.rounds} · ${d.rounds - done} to go</span></div>${rows}`;
}

function queueTeams(d){
  return draftStore.queue.map(id => teamById(d.s.pool, id)).filter(t => t && !d.taken.has(t.id));
}

function queueHtml(d){
  const list = queueTeams(d);
  let body;
  if(!list.length){
    body = `<div class="dr-empty">Star teams in Available to rank them here. Your top fit is one click away when you're up.</div>`;
  } else {
    const topFit = list.find(t => teamFits(d, t));
    body = list.map((t, i) => {
      const fits = teamFits(d, t);
      const isTop = topFit === t;
      const lg = leagueUi(t.league);
      const tag = isTop ? `<span class="dr-tag gold">Top fit · ${lg.label}</span>` : (fits ? `<span class="dr-tag">${lg.label}</span>` : `<span class="dr-tag dim">${lg.label} full</span>`);
      const confirming = ui.confirming === t.id;
      const draft = isTop && d.canAct ? `<button class="dr-draft-btn mine wide${confirming ? ' confirm' : ''}" onclick="draftClick('${t.id}')">${confirming ? 'Confirm' : `Draft ${esc(t.name)}`}</button>` : '';
      return `<div class="dr-q${isTop && d.canAct ? ' top' : ''}${fits ? '' : ' dim'}">
        <div class="dr-q-row"><span class="dr-q-i">${i + 1}</span>${tileHtml(t, 'sm')}<span class="dr-q-name">${esc(t.name)}</span>${tag}
          <span class="dr-q-ctl"><button onclick="draftMoveQueue('${t.id}',-1)" aria-label="Move up">▲</button><button onclick="draftMoveQueue('${t.id}',1)" aria-label="Move down">▼</button><button onclick="draftToggleQueue('${t.id}')" aria-label="Remove">×</button></span></div>
        ${draft}
      </div>`;
    }).join('');
  }
  return `<div class="dr-col-head dr-queue-head"><h2>My queue</h2><span class="dr-dim">${list.length} ranked</span></div>${body}`;
}

// ---- Render ----

function updateTabs(){
  const layout = document.querySelector('.dr-layout');
  if(!layout) return;
  layout.dataset.leftTab = ui.leftTab;
  layout.querySelectorAll('.dr-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.leftTab));
}

function renderLive(d){
  const host = root();
  if(ui.shell !== 'live'){
    host.innerHTML = shellHtml();
    ui.shell = 'live';
    regionHtml.clear();
  }
  updateTabs();
  renderPool(d);
  setRegion('dr-clock', clockCardHtml(d));
  setRegion('dr-upnext', upNextHtml(d));
  setRegion('dr-last', lastPickHtml(d));
  const hadBoard = regionHtml.has('dr-board');
  setRegion('dr-board', boardHtml(d));
  setRegion('dr-roster', rosterHtml(d));
  setRegion('dr-queue', queueHtml(d));
  updateClock();
  const cell = document.querySelector('.dr-cell[data-current]');
  if(cell && (!hadBoard || cell.dataset.scrolled !== String(d.clockInfo && d.clockInfo.slot))){
    cell.dataset.scrolled = String(d.clockInfo && d.clockInfo.slot);
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: hadBoard ? 'smooth' : 'auto' });
  }
}

function render(){
  renderQueued = false;
  if(!active || !root()) return;
  const d = derive();
  statusPill(d);
  if(!d){
    root().innerHTML = `<div class="dr-connecting">${draftStore.status === 'offline' ? "Can't reach the draft room. Retrying…" : 'Connecting to the draft room…'}</div>`;
    ui.shell = null;
    return;
  }
  if(lastQueueFor !== currentProfileId){
    lastQueueFor = currentProfileId;
    requestDraftQueue();
  }
  maybeStartReveal(d);
  if(d.s.phase === 'lobby'){
    if(ui.shell !== 'lobby'){ ui.shell = 'lobby'; }
    root().innerHTML = lobbyHtml(d);
    return;
  }
  if(ui.shell === 'lobby') ui.shell = null;
  renderLive(d);
  applyPendingSelect(d);
}

function scheduleRender(){
  if(renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

// The lottery reveal (600ms per slot, bottom to top) plays only for a
// viewer who was already in the lobby when the order arrived — anyone who
// joins afterwards just sees the settled order.
function maybeStartReveal(d){
  const orderKey = d.s.order ? d.s.order.join(',') : null;
  if(orderKey === ui.lastOrderKey) return;
  const firstLook = ui.lastOrderKey === undefined;
  ui.lastOrderKey = orderKey;
  clearInterval(ui.revealTimer);
  if(orderKey && !firstLook && d.s.phase === 'lobby'){
    ui.revealed = 0;
    ui.revealTimer = setInterval(() => {
      ui.revealed += 1;
      if(ui.revealed >= d.n){ clearInterval(ui.revealTimer); ui.revealed = null; }
      scheduleRender();
    }, 600);
  } else {
    ui.revealed = null;
  }
}

// ---- Clock ----

function fmt(ms){
  const total = Math.ceil(Math.abs(ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function updateClock(){
  const timer = document.getElementById('dr-timer');
  const d = derive();
  if(!timer || !d || d.s.phase !== 'draft') return;
  const limit = d.s.config.clockSeconds * 1000;
  const elapsed = clockElapsedMs(d.s.clock, serverNow());
  const left = limit - elapsed;
  const over = left < 0;
  timer.textContent = (over ? '+' : '') + fmt(left);
  timer.className = 'dr-timer' + (over ? ' over' : (left <= 15000 ? ' low' : ''));
  const bar = document.getElementById('dr-bar');
  if(bar) bar.style.width = `${Math.max(0, Math.min(100, (left / limit) * 100))}%`;
  const note = document.getElementById('dr-timer-note');
  if(note) note.textContent = !d.s.clock.running ? 'Clock stopped' : (over ? 'Over time · no auto-pick' : 'Soft clock');
}

// ---- Actions (wired to window for the inline handlers) ----

async function run(action, from){
  const result = await sendDraftAction(from === undefined ? currentProfileId : from, action);
  if(!result.ok) toast(errorText(result));
  return result;
}

window.draftSetFilter = key => { ui.filter = key; ui.showAll = false; scheduleRender(); };
window.draftSearch = value => { ui.search = value; ui.showAll = false; scheduleRender(); };
window.draftToggleShowAll = () => { ui.showAll = !ui.showAll; scheduleRender(); };
window.draftLeftTab = tab => { ui.leftTab = tab; updateTabs(); };

window.draftToggleQueue = id => {
  const q = draftStore.queue.slice();
  const at = q.indexOf(id);
  if(at >= 0) q.splice(at, 1); else q.push(id);
  saveDraftQueue(q);
};
window.draftMoveQueue = (id, dir) => {
  const q = draftStore.queue.slice();
  const at = q.indexOf(id);
  const to = at + dir;
  if(at < 0 || to < 0 || to >= q.length) return;
  [q[at], q[to]] = [q[to], q[at]];
  saveDraftQueue(q);
};

// Draft → Confirm: the first tap arms the button, a second tap within
// 3.5s makes the pick, otherwise it reverts. Guards against a mis-tap
// burning the pick.
window.draftClick = async id => {
  const d = derive();
  if(!d || !d.canAct) return;
  if(ui.confirming !== id){
    ui.confirming = id;
    clearTimeout(ui.confirmTimer);
    ui.confirmTimer = setTimeout(() => { ui.confirming = null; scheduleRender(); }, CONFIRM_MS);
    scheduleRender();
    return;
  }
  clearTimeout(ui.confirmTimer);
  ui.confirming = null;
  scheduleRender();
  await run({ type: 'pick', team: id, slot: d.clockInfo.slot });
};

window.draftAddWriteIn = async league => {
  const name = ui.search.trim();
  const result = await run({ type: 'addWriteIn', league, name });
  if(result.ok){
    ui.filter = league;
    ui.pendingSelect = name;
  } else if(result.error === 'exists' && result.detail){
    const twin = draftStore.pool.find(t => t.id === result.detail);
    if(twin){ ui.filter = twin.league; ui.search = twin.name; syncSearchInput(); }
  }
  scheduleRender();
};

function syncSearchInput(){
  const input = document.getElementById('dr-search');
  if(input) input.value = ui.search;
}

// After adding a write-in, narrow the list to it (the design's behavior)
// once the pool frame carrying it has arrived.
function applyPendingSelect(d){
  if(!ui.pendingSelect) return;
  const hit = d.s.pool.find(t => t.custom && t.name.toLowerCase() === ui.pendingSelect.toLowerCase());
  if(!hit) return;
  ui.pendingSelect = null;
  ui.filter = hit.league;
  ui.search = hit.name;
  syncSearchInput();
  scheduleRender();
}

window.draftRunLottery = () => run({ type: 'runLottery' }, null);
window.draftStart = () => run({ type: 'startDraft' }, null);
window.draftSetClock = value => run({ type: 'setConfig', clockSeconds: Number(value) }, null);
window.draftLoadPool = async () => {
  const result = await run({ type: 'setPool', teams: buildDraftPool() }, null);
  if(result.ok) toast('Team pool loaded.');
};
window.draftSignIn = async event => {
  event.preventDefault();
  const input = document.getElementById('dr-pw');
  if(!input || !input.value) return;
  await signInCommissioner(input.value);
  scheduleRender();
};

// ---- View lifecycle (called by js/board.js's switchView) ----

export function setDraftActive(on){
  if(on === active) return;
  active = on;
  if(on){
    if(!unsubscribe) unsubscribe = subscribeDraft(scheduleRender);
    openDraftConnection();
    resumeCommissioner();
    clearInterval(clockTimer);
    clockTimer = setInterval(updateClock, 250);
    ui.lastOrderKey = undefined;
    scheduleRender();
  } else {
    clearInterval(clockTimer);
    clearInterval(ui.revealTimer);
    closeDraftConnection();
    if(unsubscribe){ unsubscribe(); unsubscribe = null; }
    ui.shell = null;
  }
}
