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

   Commissioner controls (a bar under the header, only while signed in):
   pause/resume, undo, reset, trade, click a filled board cell to change
   that pick, and "Pick for {name}" to draft for whoever is on the clock.
   Phones (<=700px) get their own shell — a compact clock over Pick /
   Board / My team tabs — instead of the three-column layout; the
   commissioner bar stays desktop-only. See docs/draft-room-plan.md.
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
const POOL_LIMIT_PHONE = 40;
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
  pendingSelect: null,    // write-in just added: filter/search to it once the pool frame arrives
  proxySlot: null,        // commissioner is drafting for whoever owns this slot
  proxyArm: false,        // enter proxy mode for whatever slot is on the clock once the next state lands
  modal: null,            // null | 'edit' | 'trade' | 'reset'
  editSlot: null,
  trade: null,            // { aDrafter, aSlot, bDrafter, bSlot } while the trade modal is open
  mobileTab: 'pick'       // phone shell: 'pick' | 'board' | 'team'
};

// Which panels are folded away (desktop/tablet only), remembered per device so the
// layout you settled on is still there next time. Collapsing Available or the
// roster/queue column shrinks it to a slim rail; collapsing the clock keeps a
// one-line strip, since the timer is the one thing you always need.
const PANELS_KEY = 'teamDashboardDraftPanels';
function loadCollapsed(){
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY)) || {};
    return { left: !!saved.left, clock: !!saved.clock, right: !!saved.right };
  } catch (e){
    return { left: false, clock: false, right: false };
  }
}
ui.collapsed = loadCollapsed();
const collapsedKeys = () => Object.keys(ui.collapsed).filter(k => ui.collapsed[k]);

const phoneQuery = window.matchMedia ? window.matchMedia('(max-width: 700px)') : null;
const isPhone = () => !!phoneQuery && phoneQuery.matches;

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
  // The commissioner can draft for whoever is on the clock. `actor` is the
  // roster a Draft tap would land on; caps in the pool list are checked against it.
  if(ui.proxyArm && d.clockInfo){ ui.proxySlot = d.clockInfo.slot; ui.proxyArm = false; }
  d.proxy = draftStore.commissioner && d.running && !!d.clockInfo && ui.proxySlot === d.clockInfo.slot && !d.myTurn;
  d.actor = d.proxy ? d.clockInfo.owner : d.me;
  d.actorCounts = d.proxy ? leagueCounts(s.picks, s.pool, s.order, s.overrides, d.actor) : d.myCounts;
  d.canAct = d.myTurn || d.proxy;
  return d;
}

// `counts` defaults to whoever a Draft tap would draft for (me, or the
// on-the-clock drafter while proxying); the queue passes my own counts.
function teamFits(d, team, counts){
  return ((counts || d.actorCounts)[team.league] || 0) < (d.s.config.caps[team.league] || 0);
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
    <div class="dr-layout" data-left-tab="${ui.leftTab}" data-collapsed="${collapsedKeys().join(' ')}">
      <div class="dr-tabs">
        <button class="dr-tab" data-tab="available" onclick="draftLeftTab('available')">Available</button>
        <button class="dr-tab" data-tab="team" onclick="draftLeftTab('team')">My team</button>
      </div>
      <section class="dr-col dr-left">
        <button class="dr-rail" onclick="draftTogglePanel('left')" aria-label="Expand Available" aria-expanded="false"><span class="dr-caret" aria-hidden="true">&rsaquo;</span><span class="dr-rail-label">Available</span><span class="dr-rail-count" id="dr-rail-left-count"></span></button>
        <div class="dr-col-head"><h2>Available</h2><span id="dr-avail-count" class="dr-dim"></span><button class="dr-caret" onclick="draftTogglePanel('left')" aria-label="Collapse Available" aria-expanded="true">&lsaquo;</button></div>
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
        <button class="dr-rail" onclick="draftTogglePanel('right')" aria-label="Expand My roster and queue" aria-expanded="false"><span class="dr-caret" aria-hidden="true">&lsaquo;</span><span class="dr-rail-label">My roster</span><span class="dr-rail-count" id="dr-rail-right-count"></span></button>
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
  const limit = isPhone() ? POOL_LIMIT_PHONE : POOL_LIMIT;
  const shown = ui.showAll ? filtered : filtered.slice(0, limit);
  const more = filtered.length > limit
    ? `<button class="dr-showall" onclick="draftToggleShowAll()">${ui.showAll ? `Show top ${limit}` : `Show all ${filtered.length}`}</button>` : '';
  setRegion('dr-pool', shown.map(t => poolRowHtml(d, t)).join('') + more + writeInCardHtml(d, filtered));
  const count = document.getElementById('dr-avail-count');
  if(count) count.textContent = `${available.length} left`;
  const railCount = document.getElementById('dr-rail-left-count');
  if(railCount) railCount.textContent = String(available.length);
}

// ---- Center: clock card, up next, board ----

// The caret that folds the on-the-clock area down to a strip (desktop only;
// the phone shell shares this card but has its own compact layout).
const clockCaret = compact => isPhone() ? '' : `<button class="dr-caret dr-clock-caret" onclick="draftTogglePanel('clock')" aria-label="${compact ? 'Expand' : 'Collapse'} the clock panel" aria-expanded="${!compact}">${compact ? '&rsaquo;' : '&lsaquo;'}</button>`;

function clockCardHtml(d){
  const { s } = d;
  const compact = ui.collapsed.clock && !isPhone();
  if(s.phase === 'done'){
    if(compact) return `<div class="dr-clock-card done compact">${clockCaret(true)}<span class="dr-eyebrow" style="color:var(--win)">DRAFT COMPLETE</span><span class="dr-clock-sub">${d.total} picks</span></div>`;
    return `<div class="dr-clock-card done">${clockCaret(false)}<div><div class="dr-eyebrow" style="color:var(--win)">DRAFT COMPLETE</div><div class="dr-done-title">${d.total} picks. Rosters are set.</div></div></div>`;
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
  const proxyBtn = draftStore.commissioner && !d.myTurn && d.running && !isPhone()
    ? `<button class="dr-btn dr-btn-gold dr-proxy-btn" onclick="draftProxy()">${d.proxy ? 'Cancel' : `Pick for ${esc(drafterName(info.owner))}`}</button>` : '';
  if(compact){
    return `
    <div class="dr-clock-card compact${mine ? ' mine' : ''}">
      ${clockCaret(true)}
      <span class="dr-eyebrow${mine ? ' gold' : ''}">${mine ? "YOU'RE ON THE CLOCK" : 'ON THE CLOCK'}${makeUp ? '<span class="dr-badge">MAKE-UP</span>' : ''}</span>
      <span class="dr-clock-name">${esc(drafterName(info.owner))}</span>
      <span class="dr-clock-sub">R${round} · P${info.slot + 1}${via ? ` · via ${esc(drafterName(via))}` : ''}</span>
      ${proxyBtn}
      <span class="dr-compact-timer"><span class="dr-timer" id="dr-timer">0:00</span><span class="dr-bar"><span id="dr-bar"></span></span></span>
    </div>
    ${d.proxy ? `<div class="dr-proxy-note">Commissioner: picking for ${esc(drafterName(info.owner))}</div>` : ''}
    ${!s.clock.running ? '<div class="dr-paused">Draft paused by the commissioner. The clock is stopped.</div>' : ''}`;
  }
  return `
    <div class="dr-clock-card${mine ? ' mine' : ''}">
      ${clockCaret(false)}
      <div class="dr-clock-main">
        <div class="dr-eyebrow${mine ? ' gold' : ''}">${mine ? "YOU'RE ON THE CLOCK" : 'ON THE CLOCK'}${makeUp ? '<span class="dr-badge">MAKE-UP PICK</span>' : ''}</div>
        <div class="dr-clock-name">${esc(drafterName(info.owner))}</div>
        <div class="dr-clock-sub">Round ${round} · Pick ${info.slot + 1} of ${d.total}${via ? ` · via ${esc(drafterName(via))}` : ''}</div>
        <div class="dr-needs"><span class="dr-dim">Still needs</span>${chips}</div>
        ${proxyBtn}
      </div>
      <div class="dr-timer-box">
        <div class="dr-timer" id="dr-timer">0:00</div>
        <div class="dr-bar"><span id="dr-bar"></span></div>
        <div class="dr-timer-note" id="dr-timer-note"></div>
      </div>
    </div>
    ${d.proxy ? `<div class="dr-proxy-note">Commissioner: picking for ${esc(drafterName(info.owner))}</div>` : ''}
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
        const edit = draftStore.commissioner ? ` onclick="draftEditPick(${slot})" role="button" tabindex="0"` : '';
        cells.push(`<div class="dr-cell filled${mine ? ' mine' : ''}${edit ? ' editable' : ''}"${edit}><div class="dr-cell-top"><span>${label}</span><span style="color:${lg.color}">${lg.label}</span></div><div class="dr-cell-team">${team ? tileHtml(team, 'xs') : ''}<span>${team ? esc(team.name) : '—'}</span></div></div>`);
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
  const railCount = document.getElementById('dr-rail-right-count');
  if(railCount) railCount.textContent = `${done}/${d.rounds}`;
  return `<div class="dr-col-head"><h2>My roster</h2><span class="dr-dim">${done} of ${d.rounds} · ${d.rounds - done} to go</span><button class="dr-caret" onclick="draftTogglePanel('right')" aria-label="Collapse My roster and queue" aria-expanded="true">&rsaquo;</button></div>${rows}`;
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
    const topFit = list.find(t => teamFits(d, t, d.myCounts));
    body = list.map((t, i) => {
      const fits = teamFits(d, t, d.myCounts);
      const isTop = topFit === t;
      const lg = leagueUi(t.league);
      const tag = isTop ? `<span class="dr-tag gold">Top fit · ${lg.label}</span>` : (fits ? `<span class="dr-tag">${lg.label}</span>` : `<span class="dr-tag dim">${lg.label} full</span>`);
      const confirming = ui.confirming === t.id;
      const draft = isTop && d.myTurn ? `<button class="dr-draft-btn mine wide${confirming ? ' confirm' : ''}" onclick="draftClick('${t.id}')">${confirming ? 'Confirm' : `Draft ${esc(t.name)}`}</button>` : '';
      return `<div class="dr-q${isTop && d.myTurn ? ' top' : ''}${fits ? '' : ' dim'}">
        <div class="dr-q-row"><span class="dr-q-i">${i + 1}</span>${tileHtml(t, 'sm')}<span class="dr-q-name">${esc(t.name)}</span>${tag}
          <span class="dr-q-ctl"><button onclick="draftMoveQueue('${t.id}',-1)" aria-label="Move up">▲</button><button onclick="draftMoveQueue('${t.id}',1)" aria-label="Move down">▼</button><button onclick="draftToggleQueue('${t.id}')" aria-label="Remove">×</button></span></div>
        ${draft}
      </div>`;
    }).join('');
  }
  return `<div class="dr-col-head dr-queue-head"><h2>My queue</h2><span class="dr-dim">${list.length} ranked</span></div>${body}`;
}

// ---- Commissioner bar + modals ----

function commBarHtml(d){
  const anyPicks = Object.keys(d.s.picks).length > 0;
  const live = d.s.phase === 'draft';
  return `<span class="dr-comm-label">COMMISSIONER</span>
    ${live ? `<button class="dr-btn" onclick="${d.s.clock.running ? 'draftPause' : 'draftResume'}()">${d.s.clock.running ? 'Pause' : 'Resume'}</button>` : ''}
    <button class="dr-btn"${anyPicks ? '' : ' disabled'} onclick="draftUndo()">Undo pick</button>
    ${d.s.order && d.s.phase !== 'done' ? '<button class="dr-btn" onclick="draftOpenTrade()">Trade</button>' : ''}
    <button class="dr-btn dr-btn-ghost" onclick="draftOpenReset()">Reset</button>`;
}

function renderCommBar(d){
  const el = document.getElementById('draft-comm');
  if(!el) return;
  const show = !!d && draftStore.commissioner && d.s.phase !== 'lobby' && !isPhone();
  el.hidden = !show;
  if(show && regionHtml.get('draft-comm') !== commBarHtml(d)){
    const html = commBarHtml(d);
    el.innerHTML = html;
    regionHtml.set('draft-comm', html);
  }
}

function drafterOptions(d, selected){
  return d.s.config.drafters.map(id => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(drafterName(id))}</option>`).join('');
}

function unpickedSlotsOf(d, drafterId){
  const slots = [];
  for(let slot = 0; slot < d.total; slot++){
    if(!d.s.picks[slot] && ownerOf(slot, d.s.order, d.s.overrides) === drafterId) slots.push(slot);
  }
  return slots;
}

function slotOptions(d, drafterId, selected){
  return unpickedSlotsOf(d, drafterId).map(slot => `<option value="${slot}"${slot === selected ? ' selected' : ''}>${pickLabel(slot, d.n)}</option>`).join('');
}

function modalBody(d){
  if(ui.modal === 'edit'){
    const pick = d.s.picks[ui.editSlot];
    const team = pick && teamById(d.s.pool, pick.team);
    if(!pick || !team) return null;
    const owner = esc(drafterName(ownerOf(ui.editSlot, d.s.order, d.s.overrides)));
    return `<h3>Change this pick</h3>
      <div class="dr-modal-team">${tileHtml(team, 'md')}<div><b>${esc(team.name)}</b><span>${leagueUi(team.league).label} · drafted by ${esc(drafterName(pick.by))} · ${pickLabel(ui.editSlot, d.n)}</span></div></div>
      <p>Removing puts ${esc(team.name)} back in the pool. ${owner} goes straight back on the clock for this slot, and the draft picks up where it left off after that.</p>
      <div class="dr-modal-btns">
        <button class="dr-btn dr-btn-gold" onclick="draftRemovePick('proxy')">Remove and pick for ${owner}</button>
        <button class="dr-btn dr-btn-red" onclick="draftRemovePick('owner')">Remove and let ${owner} re-pick</button>
        <button class="dr-btn" onclick="draftCloseModal()">Cancel</button>
      </div>`;
  }
  if(ui.modal === 'trade' && ui.trade){
    const t = ui.trade;
    const valid = t.aDrafter !== t.bDrafter && t.aSlot !== null && t.bSlot !== null;
    const preview = valid ? `${esc(drafterName(t.aDrafter))} gets ${pickLabel(t.bSlot, d.n)} · ${esc(drafterName(t.bDrafter))} gets ${pickLabel(t.aSlot, d.n)}` : 'Choose two different drafters, each with an open pick.';
    const side = (label, dk, sk) => `<div class="dr-trade-col"><div class="dr-eyebrow">${label}</div>
      <select onchange="draftTradeSet('${dk}', this.value)">${drafterOptions(d, t[dk])}</select>
      <select onchange="draftTradeSet('${sk}', this.value)">${slotOptions(d, t[dk], t[sk]) || '<option value="">No open picks</option>'}</select></div>`;
    return `<h3>Trade picks</h3>
      <p>Swap two future picks. The board updates for everyone.</p>
      <div class="dr-trade-grid">${side('GIVES', 'aDrafter', 'aSlot')}${side('FOR', 'bDrafter', 'bSlot')}</div>
      <div class="dr-trade-preview">${preview}</div>
      <div class="dr-modal-btns"><button class="dr-btn dr-btn-gold"${valid ? '' : ' disabled'} onclick="draftTradeSubmit()">Swap picks</button><button class="dr-btn" onclick="draftCloseModal()">Cancel</button></div>`;
  }
  if(ui.modal === 'reset'){
    return `<h3>Reset the draft?</h3>
      <p>This clears every pick, any trades and the lottery order, and returns everyone to the lobby. The team pool is kept (write-ins are removed).</p>
      <div class="dr-modal-btns"><button class="dr-btn dr-btn-red" onclick="draftDoReset()">Reset draft</button><button class="dr-btn" onclick="draftCloseModal()">Cancel</button></div>`;
  }
  return null;
}

function renderModal(d){
  const el = document.getElementById('draft-modal');
  if(!el) return;
  const body = d && ui.modal ? modalBody(d) : null;
  if(!body){ el.hidden = true; el.innerHTML = ''; regionHtml.delete('draft-modal'); if(ui.modal && d) ui.modal = null; return; }
  el.hidden = false;
  const html = `<div class="dr-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">${body}</div>`;
  if(regionHtml.get('draft-modal') !== html){ el.innerHTML = html; regionHtml.set('draft-modal', html); }
}

// ---- Phone shell ----

function phoneShellHtml(){
  const tab = (key, label) => `<button class="dm-tab${ui.mobileTab === key ? ' on' : ''}" data-tab="${key}" onclick="draftMobileTab('${key}')">${label}</button>`;
  return `
    <div class="dm" data-tab="${ui.mobileTab}">
      <div class="dm-top">
        <div id="dr-clock"></div>
        <div class="dm-tabs">${tab('pick', 'Pick')}${tab('board', 'Board')}${tab('team', 'My team')}</div>
      </div>
      <section class="dm-pane" data-pane="pick">
        <div id="dm-queue-top"></div>
        <input id="dr-search" class="dr-search" type="search" placeholder="Search or add a college team" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" oninput="draftSearch(this.value)">
        <div id="dr-chips" class="dr-chips dm-chips"></div>
        <div id="dr-pool" class="dr-pool"></div>
      </section>
      <section class="dm-pane" data-pane="board"><div id="dm-board"></div></section>
      <section class="dm-pane" data-pane="team"><div id="dr-roster"></div><div id="dr-queue"></div></section>
    </div>`;
}

// Top of the Pick tab on your turn: your first three queued teams that fit.
function phoneQueueHtml(d){
  if(!d.myTurn) return '';
  const fits = queueTeams(d).filter(t => teamFits(d, t, d.myCounts)).slice(0, 3);
  if(!fits.length) return '';
  return `<div class="dm-from-queue"><div class="dr-eyebrow gold">FROM YOUR QUEUE</div>${fits.map(t => {
    const confirming = ui.confirming === t.id;
    return `<div class="dm-qrow">${tileHtml(t, 'md')}<div class="dr-row-main"><div class="dr-row-name">${esc(t.name)}</div><div class="dr-row-meta">${leagueUi(t.league).label}</div></div>
      <button class="dr-draft-btn mine${confirming ? ' confirm' : ''}" onclick="draftClick('${t.id}')">${confirming ? 'Confirm' : 'Draft'}</button></div>`;
  }).join('')}</div>`;
}

// The last three rounds, newest first, ending at whoever is on the clock.
function phoneBoardHtml(d){
  const last = d.clockInfo ? d.clockInfo.slot : d.total - 1;
  const first = Math.max(0, (Math.floor(last / d.n) - 2) * d.n);
  const rows = [];
  for(let slot = last; slot >= first; slot--){
    const owner = ownerOf(slot, d.s.order, d.s.overrides);
    const pick = d.s.picks[slot];
    const team = pick && teamById(d.s.pool, pick.team);
    const cur = d.clockInfo && slot === d.clockInfo.slot;
    const body = team
      ? `${tileHtml(team, 'sm')}<span class="dm-b-name">${esc(team.name)}</span><span class="dm-b-lg" style="color:${leagueUi(team.league).color}">${leagueUi(team.league).label}</span>`
      : (cur ? '<span class="dm-b-clock">On the clock</span>' : '<span class="dr-dim">—</span>');
    rows.push(`<div class="dm-brow${cur ? ' cur' : ''}${owner === d.me ? ' mine' : ''}"><span class="dm-b-label">${pickLabel(slot, d.n)}</span><span class="dm-b-owner">${owner === d.me ? 'You' : esc(drafterName(owner))}</span><span class="dm-b-team">${body}</span></div>`);
  }
  return `<div class="dr-col-head"><h2>Board</h2><span class="dr-dim">Last 3 rounds</span></div>${rows.join('')}`;
}

function renderPhone(d){
  if(ui.shell !== 'phone'){
    root().innerHTML = phoneShellHtml();
    ui.shell = 'phone';
    regionHtml.clear();
  }
  const shell = root().querySelector('.dm');
  shell.dataset.tab = ui.mobileTab;
  shell.querySelectorAll('.dm-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.mobileTab));
  renderPool(d);
  setRegion('dr-clock', clockCardHtml(d));
  setRegion('dm-queue-top', phoneQueueHtml(d));
  setRegion('dm-board', phoneBoardHtml(d));
  setRegion('dr-roster', rosterHtml(d));
  setRegion('dr-queue', queueHtml(d));
  updateClock();
}

// ---- Render ----

function updateTabs(){
  const layout = document.querySelector('.dr-layout');
  if(!layout) return;
  layout.dataset.leftTab = ui.leftTab;
  layout.dataset.collapsed = collapsedKeys().join(' ');
  layout.querySelectorAll('.dr-rail').forEach(b => b.setAttribute('aria-expanded', 'false'));
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
  const folded = ui.collapsed.clock;
  setRegion('dr-upnext', folded ? '' : upNextHtml(d));
  setRegion('dr-last', folded ? '' : lastPickHtml(d));
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
    renderCommBar(null);
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
    renderCommBar(null);
    renderModal(null);
    return;
  }
  if(ui.shell === 'lobby') ui.shell = null;
  if(isPhone()) renderPhone(d); else renderLive(d);
  renderCommBar(d);
  renderModal(d);
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
  const proxying = d.proxy;
  const result = await run({ type: 'pick', team: id, slot: d.clockInfo.slot }, proxying ? null : undefined);
  if(result.ok && proxying) ui.proxySlot = null;
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

// ---- Commissioner actions ----

window.draftProxy = () => {
  const d = derive();
  if(!d || !d.clockInfo) return;
  ui.proxySlot = d.proxy ? null : d.clockInfo.slot;
  scheduleRender();
};
window.draftPause = () => run({ type: 'pause' }, null);
window.draftResume = () => run({ type: 'resume' }, null);
window.draftUndo = () => run({ type: 'undo' }, null);

window.draftCloseModal = () => { ui.modal = null; ui.trade = null; ui.editSlot = null; scheduleRender(); };
window.draftOpenReset = () => { ui.modal = 'reset'; scheduleRender(); };
window.draftDoReset = async () => {
  const result = await run({ type: 'reset' }, null);
  if(result.ok){ ui.proxySlot = null; window.draftCloseModal(); }
};

window.draftEditPick = slot => {
  if(!draftStore.commissioner) return;
  ui.editSlot = slot;
  ui.modal = 'edit';
  scheduleRender();
};
// Removing a pick reopens that slot ("make-up" pick); either the owner
// re-picks, or the commissioner drafts for them right away.
window.draftRemovePick = async mode => {
  const slot = ui.editSlot;
  const result = await run({ type: 'removePick', slot }, null);
  if(!result.ok) return;
  if(mode === 'proxy') ui.proxyArm = true;
  window.draftCloseModal();
};

window.draftOpenTrade = () => {
  const d = derive();
  if(!d || !d.s.order) return;
  const ids = d.s.config.drafters;
  const aDrafter = d.clockInfo ? d.clockInfo.owner : ids[0];
  const bDrafter = ids.find(id => id !== aDrafter);
  const first = id => (unpickedSlotsOf(d, id)[0] ?? null);
  ui.trade = { aDrafter, aSlot: first(aDrafter), bDrafter, bSlot: first(bDrafter) };
  ui.modal = 'trade';
  scheduleRender();
};
window.draftTradeSet = (field, value) => {
  const d = derive();
  if(!d || !ui.trade) return;
  if(field === 'aDrafter' || field === 'bDrafter'){
    ui.trade[field] = value;
    const slotKey = field === 'aDrafter' ? 'aSlot' : 'bSlot';
    ui.trade[slotKey] = unpickedSlotsOf(d, value)[0] ?? null;
  } else {
    ui.trade[field] = value === '' ? null : Number(value);
  }
  scheduleRender();
};
window.draftTradeSubmit = async () => {
  const t = ui.trade;
  if(!t || t.aSlot === null || t.bSlot === null) return;
  const result = await run({ type: 'trade', a: t.aSlot, b: t.bSlot }, null);
  if(result.ok){ toast('Picks swapped.'); window.draftCloseModal(); }
};

window.draftTogglePanel = key => {
  if(!(key in ui.collapsed)) return;
  ui.collapsed[key] = !ui.collapsed[key];
  try { localStorage.setItem(PANELS_KEY, JSON.stringify(ui.collapsed)); } catch (e){}
  updateTabs();
  scheduleRender();
  // The board just got more (or less) room: keep the pick on the clock in view
  // once the column transition has finished.
  setTimeout(() => {
    const cell = document.querySelector('.dr-cell[data-current]');
    if(cell) cell.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, 260);
};

window.draftMobileTab = tab => { ui.mobileTab = tab; scheduleRender(); };

// ---- View lifecycle (called by js/board.js's switchView) ----

if(phoneQuery){
  const onChange = () => { ui.shell = null; scheduleRender(); };
  if(phoneQuery.addEventListener) phoneQuery.addEventListener('change', onChange);
  else if(phoneQuery.addListener) phoneQuery.addListener(onChange);
}

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
