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
import { teamGroup, teamGroupLabel, teamInGroup, leagueGroups } from './draft-groups.js';
import { onTheClock } from './draft-engine.js';
import {
  totalPicks, totalRounds, ownerOf, pickLabel, teamById, takenTeamIds,
  leagueCounts, clockElapsedMs, WRITE_IN_LEAGUES
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

const POOL_LIMIT = 60;
const POOL_LIMIT_PHONE = 40;
const LEAGUE_PREVIEW = 5;   // Rank + All: top teams shown per league section
const SORT_KEY = 'draftPoolSort';
const SORTS = [{ key: 'az', label: 'A–Z' }, { key: 'rank', label: 'Rank' }];

function loadSort(){
  try { return localStorage.getItem(SORT_KEY) === 'rank' ? 'rank' : 'az'; } catch(e){ return 'az'; }
}
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
  group: null,            // conference/division within the filtered league, or null
  sort: loadSort(),       // Available list order: 'az' or 'rank' (remembered per device)
  search: '',
  showAll: false,
  picking: false,         // a pick is in flight; ignore further taps until the room answers
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
  mobileTab: 'pick',      // phone shell: 'pick' | 'board' | 'team'
  rosterOf: null          // roster panel: drafter picked from its dropdown, or null for mine
};

// Which side panels are folded away (desktop/tablet only), remembered per
// device so the layout you settled on is still there next time. A folded
// column shrinks to a slim rail with a live count.
const PANELS_KEY = 'teamDashboardDraftPanels';
function loadCollapsed(){
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY)) || {};
    return { left: !!saved.left, right: !!saved.right };
  } catch (e){
    return { left: false, right: false };
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
        <div class="dr-col-head"><h2>Available</h2><span class="dr-head-right"><span id="dr-avail-count" class="dr-dim"></span><span id="dr-sort" class="dr-sort"></span></span><button class="dr-caret" onclick="draftTogglePanel('left')" aria-label="Collapse Available" aria-expanded="true">&lsaquo;</button></div>
        <input id="dr-search" class="dr-search" type="search" placeholder="Search or add a college team" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" oninput="draftSearch(this.value)">
        <div id="dr-chips" class="dr-chips"></div>
        <div id="dr-groups" class="dr-chips dr-groups"></div>
        <div id="dr-pool" class="dr-pool"></div>
      </section>
      <section class="dr-col dr-center">
        <div id="dr-clock"></div>
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

// League by league, each in rank order (unranked teams, e.g. write-ins,
// last). Rank only means something within a league, so the All view
// shows one section per league (see rankSectionsHtml).
function rankOrder(pool){
  const leagueIdx = Object.fromEntries(Object.keys(LEAGUE_UI).map((k, i) => [k, i]));
  return pool.slice().sort((a, b) =>
    (leagueIdx[a.league] - leagueIdx[b.league]) || ((a.rank || Infinity) - (b.rank || Infinity)) || a.name.localeCompare(b.name));
}

function alphaOrder(pool){
  const leagueIdx = Object.fromEntries(Object.keys(LEAGUE_UI).map((k, i) => [k, i]));
  return pool.slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (leagueIdx[a.league] - leagueIdx[b.league]));
}

let orderedCache = { pool: null, sort: null, list: [] };
function orderedPool(pool){
  if(orderedCache.pool !== pool || orderedCache.sort !== ui.sort){
    orderedCache = { pool, sort: ui.sort, list: ui.sort === 'rank' ? rankOrder(pool) : alphaOrder(pool) };
  }
  return orderedCache.list;
}

function poolRowHtml(d, team){
  const lg = leagueUi(team.league);
  const queued = draftStore.queue.includes(team.id);
  const fits = teamFits(d, team);
  let action = '';
  if(!fits) action = '<span class="dr-full">Full</span>';
  else if(d.canAct){
    action = `<button class="dr-draft-btn mine" onclick="draftClick('${team.id}')">Draft</button>`;
  }
  const meta = team.custom ? 'Write-in' : (team.rank ? `#${team.rank}` : '');
  // The group label narrows the list to that division (or conference).
  const g = teamGroup(team);
  const group = g
    ? `<button class="dr-row-group" onclick="draftSetGroup('${team.league}', '${esc(g.div || g.conf)}')">${esc(teamGroupLabel(team))}</button>`
    : '';
  return `<div class="dr-row${fits ? '' : ' dim'}">
    ${tileHtml(team, 'md')}
    <div class="dr-row-main">
      <div class="dr-row-name">${esc(team.name)}</div>
      <div class="dr-row-meta"><i style="background:${lg.color}"></i>${lg.label}${meta ? ` · ${meta}` : ''}${group ? ` · ${group}` : ''}</div>
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
  setRegion('dr-sort', SORTS.map(o =>
    `<button class="${ui.sort === o.key ? 'on' : ''}" onclick="draftSetSort('${o.key}')" aria-pressed="${ui.sort === o.key}">${o.label}</button>`
  ).join(''));
  const counts = {};
  available.forEach(t => { counts[t.league] = (counts[t.league] || 0) + 1; });

  const chips = [{ key: 'all', label: 'All', color: null, n: available.length }]
    .concat(Object.keys(d.s.config.caps).map(k => ({ key: k, label: leagueUi(k).label, color: leagueUi(k).color, n: counts[k] || 0 })));
  setRegion('dr-chips', chips.map(c =>
    `<button class="dr-chip${ui.filter === c.key ? ' on' : ''}" onclick="draftSetFilter('${c.key}')">${c.color ? `<i style="background:${c.color}"></i>` : ''}${c.label}<span>${c.n}</span></button>`
  ).join(''));

  // Second row: the selected league's conferences/divisions, with how
  // many teams each still has available.
  const groups = ui.filter === 'all' ? [] : leagueGroups(ui.filter, d.s.pool);
  if(ui.group && !groups.includes(ui.group)) ui.group = null;
  setRegion('dr-groups', groups.map(k => {
    const n = available.filter(t => t.league === ui.filter && teamInGroup(t, k)).length;
    return `<button class="dr-chip${ui.group === k ? ' on' : ''}${n ? '' : ' empty'}" onclick="draftSetGroup('${ui.filter}', '${esc(k)}')">${esc(k)}<span>${n}</span></button>`;
  }).join(''));

  const q = ui.search.trim().toLowerCase();
  const filtered = available.filter(t =>
    (ui.filter === 'all' || t.league === ui.filter) &&
    (!ui.group || teamInGroup(t, ui.group)) &&
    (!q || t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q) || teamGroupLabel(t).toLowerCase().includes(q))
  );
  if(ui.sort === 'rank' && ui.filter === 'all'){
    setRegion('dr-pool', rankSectionsHtml(d, filtered, !!q) + writeInCardHtml(d, filtered));
    const count = document.getElementById('dr-avail-count');
    if(count) count.textContent = `${available.length} left`;
    const railCount = document.getElementById('dr-rail-left-count');
    if(railCount) railCount.textContent = String(available.length);
    return;
  }
  const limit = isPhone() ? POOL_LIMIT_PHONE : POOL_LIMIT;
  const shown = ui.showAll ? filtered : filtered.slice(0, limit);
  const more = filtered.length > limit
    ? `<button class="dr-showall" onclick="draftToggleShowAll()">${ui.showAll ? `Show ${ui.sort === 'rank' ? 'top' : 'first'} ${limit}` : `Show all ${filtered.length}`}</button>` : '';
  setRegion('dr-pool', shown.map(t => poolRowHtml(d, t)).join('') + more + writeInCardHtml(d, filtered));
  const count = document.getElementById('dr-avail-count');
  if(count) count.textContent = `${available.length} left`;
  const railCount = document.getElementById('dr-rail-left-count');
  if(railCount) railCount.textContent = String(available.length);
}

// Rank + All: one section per league with its best teams still
// available, and a link into that league's full list. A search shows
// every match instead of just the top few.
function rankSectionsHtml(d, filtered, searching){
  return Object.keys(d.s.config.caps).map(league => {
    const teams = filtered.filter(t => t.league === league);
    if(!teams.length) return '';
    const lg = leagueUi(league);
    const shown = searching ? teams : teams.slice(0, LEAGUE_PREVIEW);
    const more = teams.length > shown.length
      ? `<button class="dr-showall" onclick="draftSetFilter('${league}')">See all ${teams.length} ${lg.label}</button>` : '';
    return `<div class="dr-section-head"><i style="background:${lg.color}"></i>${lg.label}<span>${teams.length} left</span></div>`
      + shown.map(t => poolRowHtml(d, t)).join('') + more;
  }).join('');
}

// ---- Center: clock card, up next, board ----

// The on-the-clock display. Desktop and tablet get a one-line strip (who,
// which pick, the timer); the phone shell gets a compact two-row card, since
// a strip's worth of text doesn't fit a phone's width.
function clockCardHtml(d){
  const { s } = d;
  const phone = isPhone();
  if(s.phase === 'done'){
    return phone
      ? `<div class="dr-clock-card done"><div><div class="dr-eyebrow" style="color:var(--win)">DRAFT COMPLETE</div><div class="dr-done-title">${d.total} picks. Rosters are set.</div></div></div>`
      : `<div class="dr-clock-card done strip"><span class="dr-eyebrow" style="color:var(--win)">DRAFT COMPLETE</span><span class="dr-clock-sub">${d.total} picks. Rosters are set.</span></div>`;
  }
  const info = d.clockInfo;
  const mine = d.myTurn;
  const natural = drafterNaturalOwner(d, info.slot);
  const via = natural !== info.owner ? natural : null;
  const highest = Math.max(-1, ...Object.keys(s.picks).map(Number));
  const makeUp = info.slot < highest;
  const round = Math.floor(info.slot / d.n) + 1;
  const eyebrow = `${mine ? "YOU'RE ON THE CLOCK" : 'ON THE CLOCK'}${makeUp ? `<span class="dr-badge">${phone ? 'MAKE-UP PICK' : 'MAKE-UP'}</span>` : ''}`;
  const banners = `${d.proxy ? `<div class="dr-proxy-note">Commissioner: picking for ${esc(drafterName(info.owner))}</div>` : ''}
    ${!s.clock.running ? '<div class="dr-paused">Draft paused by the commissioner. The clock is stopped.</div>' : ''}`;
  if(phone){
    return `
    <div class="dr-clock-card${mine ? ' mine' : ''}">
      <div class="dr-clock-main">
        <div class="dr-eyebrow${mine ? ' gold' : ''}">${eyebrow}</div>
        <div class="dr-clock-name">${esc(drafterName(info.owner))}</div>
        <div class="dr-clock-sub">Round ${round} · Pick ${info.slot + 1} of ${d.total}${via ? ` · via ${esc(drafterName(via))}` : ''}</div>
      </div>
      <div class="dr-timer-box">
        <div class="dr-timer" id="dr-timer">0:00</div>
        <div class="dr-bar"><span id="dr-bar"></span></div>
        <div class="dr-timer-note" id="dr-timer-note"></div>
      </div>
    </div>
    ${banners}`;
  }
  const proxyBtn = draftStore.commissioner && !d.myTurn && d.running
    ? `<button class="dr-btn dr-btn-gold dr-proxy-btn" onclick="draftProxy()">${d.proxy ? 'Cancel' : `Pick for ${esc(drafterName(info.owner))}`}</button>` : '';
  return `
    <div class="dr-clock-card strip${mine ? ' mine' : ''}">
      <span class="dr-eyebrow${mine ? ' gold' : ''}">${eyebrow}</span>
      <span class="dr-clock-name">${esc(drafterName(info.owner))}</span>
      <span class="dr-clock-sub">R${round} · P${info.slot + 1} of ${d.total}${via ? ` · via ${esc(drafterName(via))}` : ''}</span>
      ${proxyBtn}
      <span class="dr-strip-timer"><span class="dr-timer" id="dr-timer">0:00</span><span class="dr-bar"><span id="dr-bar"></span></span></span>
    </div>
    ${banners}`;
}

function drafterNaturalOwner(d, slot){
  const round = Math.floor(slot / d.n), pos = slot % d.n;
  return d.s.order[round % 2 === 0 ? pos : d.n - 1 - pos];
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

// Whose roster the panel shows: mine unless a drafter was picked from its
// dropdown (ui.rosterOf), falling back to mine if that pick no longer applies.
function rosterOwner(d){
  const drafters = d.s.config.drafters;
  if(ui.rosterOf && ui.rosterOf !== d.me && drafters.includes(ui.rosterOf)) return ui.rosterOf;
  return drafters.includes(d.me) ? d.me : drafters[0];
}

function rosterPicks(d, who){
  const { s } = d;
  return Object.keys(s.picks)
    .filter(k => (s.order ? ownerOf(Number(k), s.order, s.overrides) : s.picks[k].by) === who)
    .map(k => teamById(s.pool, s.picks[k].team)).filter(Boolean);
}

function rosterHtml(d){
  const { s } = d;
  const who = rosterOwner(d);
  const mine = rosterPicks(d, who);
  const rows = Object.keys(s.config.caps).filter(k => s.config.caps[k] > 0).map(k => {
    const cap = s.config.caps[k];
    const have = mine.filter(t => t.league === k);
    const slots = Array.from({ length: cap }, (_, i) => have[i] ? tileHtml(have[i], 'sm') : '<span class="dr-slot"></span>').join('');
    const lg = leagueUi(k);
    return `<div class="dr-roster-row${have.length >= cap ? ' full' : ''}"><span class="dr-roster-lg" style="color:${lg.color}">${lg.label}</span><span class="dr-slots">${slots}</span><span class="dr-roster-n">${have.length}/${cap}</span></div>`;
  }).join('');
  const railCount = document.getElementById('dr-rail-right-count');
  if(railCount) railCount.textContent = `${rosterPicks(d, d.me).length}/${d.rounds}`;
  const options = (s.order || s.config.drafters).map(id =>
    `<option value="${esc(id)}"${id === who ? ' selected' : ''}>${esc(drafterName(id))}${id === d.me ? ' (Yours)' : ''}</option>`).join('');
  return `<div class="dr-col-head"><h2>Roster</h2><label class="dr-roster-pick"><select onchange="draftViewRoster(this.value)" aria-label="Whose roster to show">${options}</select></label><button class="dr-caret" onclick="draftTogglePanel('right')" aria-label="Collapse My roster and queue" aria-expanded="true">&rsaquo;</button></div>${rows}`;
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
      const draft = isTop && d.myTurn ? `<button class="dr-draft-btn mine wide" onclick="draftClick('${t.id}')">Draft ${esc(t.name)}</button>` : '';
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
        <div class="dm-search-row">
          <input id="dr-search" class="dr-search" type="search" placeholder="Search or add a college team" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" oninput="draftSearch(this.value)">
          <span id="dr-sort" class="dr-sort"></span>
        </div>
        <div id="dr-chips" class="dr-chips dm-chips"></div>
        <div id="dr-groups" class="dr-chips dr-groups"></div>
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
    return `<div class="dm-qrow">${tileHtml(t, 'md')}<div class="dr-row-main"><div class="dr-row-name">${esc(t.name)}</div><div class="dr-row-meta">${leagueUi(t.league).label}</div></div>
      <button class="dr-draft-btn mine" onclick="draftClick('${t.id}')">Draft</button></div>`;
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

window.draftSetFilter = key => { ui.filter = key; ui.group = null; ui.showAll = false; scheduleRender(); };
// Tapping the selected group again clears it.
window.draftSetGroup = (league, group) => {
  ui.group = ui.filter === league && ui.group === group ? null : group;
  ui.filter = league;
  ui.showAll = false;
  scheduleRender();
};
window.draftSearch = value => { ui.search = value; ui.showAll = false; scheduleRender(); };
window.draftSetSort = key => {
  ui.sort = key === 'rank' ? 'rank' : 'az';
  ui.showAll = false;
  try { localStorage.setItem(SORT_KEY, ui.sort); } catch(e){}
  scheduleRender();
};
window.draftViewRoster = id => { ui.rosterOf = id || null; scheduleRender(); };
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

// One tap drafts. The commissioner can undo or change any pick, so a stray
// tap is cheap to fix and the extra "Confirm" step only cost time on the clock.
// The pick carries the slot it was made for, so a second tap (or a lagging
// screen) can't land on the following pick, and `picking` ignores taps while
// this one is still in flight.
window.draftClick = async id => {
  const d = derive();
  if(!d || !d.canAct || ui.picking) return;
  ui.picking = true;
  const proxying = d.proxy;
  const result = await run({ type: 'pick', team: id, slot: d.clockInfo.slot }, proxying ? null : undefined);
  ui.picking = false;
  if(result.ok && proxying) ui.proxySlot = null;
};

window.draftAddWriteIn = async league => {
  const name = ui.search.trim();
  const result = await run({ type: 'addWriteIn', league, name });
  if(result.ok){
    ui.group = null; ui.filter = league;
    ui.pendingSelect = name;
  } else if(result.error === 'exists' && result.detail){
    const twin = draftStore.pool.find(t => t.id === result.detail);
    if(twin){ ui.group = null; ui.filter = twin.league; ui.search = twin.name; syncSearchInput(); }
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
  ui.group = null; ui.filter = hit.league;
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
