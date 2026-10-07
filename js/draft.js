/* ============================================================
   Draft room UI (#view-draft, ?view=draft[&room=<name>]).

   Renders whatever the DraftRoom server says (js/draft-client.js) and
   sends the user's intent back as reducer actions; it never decides on
   its own what is legal. Rules-derived values it needs to *show* (whose
   turn it is, caps, what's still available) come from the same pure
   modules the server runs: js/draft-rules.js and js/draft-engine.js.

   Three screens share the view:
   - Lobby: draft order (lottery), commissioner setup. Phase 'lobby'.
     A mock lobby copies the live room's order once it's drawn (else
     draws its own on arrival) and puts each seat's bot
     switch on the order rows (one table).
   - Live room: Available pool | Board | My roster + queue. Phases
     'draft' and 'done'. Built once as a shell and then updated region by
     region, so the search box keeps focus and scroll positions survive
     every incoming pick.
   - The clock re-renders only its own three elements every 250ms; a
     full render happens only when the server sends new state.

   Commissioner controls (a bar under the header, on every screen size,
   in the live room and mock rooms alike): pause/resume, undo, trade,
   draft settings (clock; bots too in a mock room), download, reset, tap
   a filled board cell/row to change that pick, and "Pick for {name}" to
   draft for whoever is on the clock. Signing in happens only on Settings →
   Commissioner (js/admin.js), the one place the password is typed; this
   room signs in with the one saved there, and shows nothing about it to
   anyone who isn't signed in.
   Mock rooms sign everyone in automatically (worker/draft-room.js).
   Auto-draft (both rooms): each drafter's own switch under My
   queue, in the right column or the My team tab on phones (and in the lobby), has the worker draft for them as soon
   as they go on the clock; the commissioner can switch it on for
   anyone from the live room's settings.
   Phones (<=700px) get their own shell — a compact clock over Pick /
   Board / My team tabs — instead of the three-column layout; the bar
   scrolls sideways there. See docs/draft-room-plan.md.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { openScoringSheet } from './scoring-sheet.js';
import { NEXT_DRAFT_YEAR, NEXT_DRAFT_LABEL } from './seasons/index.js';
import { currentProfileId } from './identity.js';
import { buildDraftPool } from './draft-pool.js';
import { teamGroup, teamGroupLabel, leagueConfs, leagueDivs } from './draft-groups.js';
import { onTheClock } from './draft-engine.js';
import { draftXlsx } from './draft-sheets.js';
import { XLSX_MIME } from './xlsx.js';
import { openSheetOverlay, closeSheetOverlay, enableSheetSwipeToDismiss, teamBadgeHtml, skeletonLinesHtml } from './utils.js';
import { scoutTeam, hasScouting, scoutSummary } from './draft-scout.js';
import { DRAFT_OUTLOOKS } from './draft-outlooks.js';
import { STAR_FILLED_SVG, STAR_OUTLINE_SVG } from './favorites.js';
import {
  totalPicks, totalRounds, ownerOf, pickLabel, teamById, takenTeamIds,
  leagueCounts, clockElapsedMs, WRITE_IN_LEAGUES, isMockRoom, mockRoomOwner, DEFAULT_BOT_SECONDS,
  autoPickLimitMs
} from './draft-rules.js';
import {
  draftStore, subscribeDraft, openDraftConnection, closeDraftConnection, serverNow,
  sendDraftAction, resumeCommissioner, saveDraftQueue, requestDraftQueue
} from './draft-client.js';
import { escapeHtml as esc, EASE_SPRING, EASE_IN_OUT } from './utils.js';
import { fxOn, play, later, pop, flashTint, ringPulse, sheen, stagger, nudge, flyTo, once, setMotionSpeed, atSpeed } from './motion-fx.js';
import { floatPillHtml, buttonHtml, iconButtonHtml, switchHtml, draftClockHtml, setDraftClock, clockHeroHtml, pickLandingHtml, snakeRailHtml, clockMiniHtml } from './ui.js';

const LEAGUE_UI = {
  epl: { label: 'EPL', color: '#826AC8' }, nfl: { label: 'NFL', color: '#91C86A' },
  nba: { label: 'NBA', color: '#B57FC0' }, nhl: { label: 'NHL', color: '#6FBFC6' },
  mlb: { label: 'MLB', color: '#6AC87A' }, wnba: { label: 'WNBA', color: '#A8B36A' },
  cfb: { label: 'CFB', color: '#C86AA1' }, mcbb: { label: 'CBB', color: '#C58C6A' },
  pga: { label: 'PGA', color: '#6AB7A0' }
};
const leagueUi = key => LEAGUE_UI[key] || { label: key.toUpperCase(), color: '#94969E' };

const POOL_LIMIT = 60;
const POOL_LIMIT_PHONE = 40;
const LEAGUE_PREVIEW = 5;   // Rank + All: top teams shown per league section
const SORT_KEY = 'draftPoolSort';
const SORTS = [
  { key: 'rank', label: 'Rank', sub: 'Best available first' },
  { key: 'az', label: 'A–Z', sub: 'Alphabetical' }
];

// Inline SVG icons (currentColor, so they follow the button's color).
const svg = (w, h, body) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  chevL: svg(14, 14, '<path d="M8.5 3 4.5 7l4 4" stroke-width="1.6"/>'),
  chevR: svg(14, 14, '<path d="M5.5 3 9.5 7l-4 4" stroke-width="1.6"/>'),
  chevD: svg(10, 10, '<path d="M2 3.5 5 6.5 8 3.5"/>'),
  star: svg(20, 20, '<polygon points="10,2 12.4,7.2 18,7.6 13.7,11.3 15,16.8 10,13.9 5,16.8 6.3,11.3 2,7.6 7.6,7.2"/>'),
  toTop: svg(12, 12, '<path d="M2 1.5h8M6 10.5V4M3 6.5 6 3.5l3 3"/>'),
  close: svg(10, 10, '<path d="M2 2l6 6M8 2 2 8"/>'),
  download: svg(14, 14, '<path d="M7 2v7M4 6.5 7 9.5l3-3M2.5 12h9"/>'),
  grip: '<svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="6" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="6" cy="12" r="1.3"/></svg>'
};

// Desktop and tablet keep the clock hero up for every turn; minimized, it's
// the one-line strip instead.
const HERO_MIN_KEY = 'draftHeroMin';
function loadHeroMin(){
  try { return localStorage.getItem(HERO_MIN_KEY) === '1'; } catch(e){ return false; }
}

function loadSort(){
  try { return localStorage.getItem(SORT_KEY) === 'az' ? 'az' : 'rank'; } catch(e){ return 'rank'; }
}
const CLOCK_CHOICES = [30, 60, 90, 120, 180, 300];
// Mock rooms auto-pick when the clock runs out, so they get shorter
// clocks to keep a practice run moving, plus how long a bot "thinks".
const MOCK_CLOCK_CHOICES = [10, 15, 30, 60, 90];
const BOT_CHOICES = [1, 3, 5, 10, 20];

const selectHtml = (choices, current, handler) =>
  `<select onchange="${handler}(this.value)">${(choices.includes(current) ? choices : [...choices, current].sort((a, b) => a - b))
    .map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}s</option>`).join('')}</select>`;

const ERROR_TEXT = {
  offline: 'Not connected — try again in a moment.',
  forbidden: 'Only the commissioner can do that.',
  bad_phase: "That isn't possible right now.",
  bad_input: 'Something about that request was invalid.',
  no_order: 'Run the lottery first.',
  no_live_order: 'The live draft order isn\u2019t drawn yet.',
  not_live: 'The draft is not live.',
  paused: 'The draft is paused.',
  stale: 'The board just moved — try again.',
  not_your_turn: "It's not your turn.",
  unknown_team: 'That team is not in the pool.',
  taken: 'That team was just taken.',
  league_full: 'Your roster is full for that league.',
  exists: 'That school is already on the board.',
  unchanged: 'Nothing to change.',
  nothing_to_undo: 'Nothing to undo.'
};

// What a league's pool holds: teams, or for the PGA Tour, golfers.
const poolNoun = league => (league === 'pga' ? 'golfers' : 'teams');

function errorText(result){
  if(result.error === 'pool_short'){
    const d = result.detail || {};
    return `${leagueUi(d.league).label} pool has ${d.have} ${poolNoun(d.league)}, needs ${d.need}.`;
  }
  return ERROR_TEXT[result.error] || 'Something went wrong.';
}

// ---- Local (per-device) UI state ----

const ui = {
  filter: 'all',
  conf: null,             // conference within the filtered league, or null
  div: null,              // division within the filtered league (always inside `conf`), or null
  menu: null,             // open Available popover: null | 'conf' | 'div' | 'sort'
  sort: loadSort(),       // Available list order: 'az' or 'rank' (remembered per device)
  search: '',
  showAll: false,
  picking: false,         // a pick is in flight; ignore further taps until the room answers
  leftTab: 'available',   // narrow screens: which panel occupies the side slot
  revealed: null,         // lottery reveal: positions shown from the bottom, or null when settled
  autoDrawFor: null,      // mock lobby: room:seq the automatic first draw was sent for
  autoPoolFor: null,      // mock lobby: room:caps the automatic pool load was sent for
  revealTimer: null,
  lastOrderKey: undefined, // undefined until the first state has been seen (so a late joiner doesn't replay the reveal)
  shell: null,            // 'live' once the live-room shell is built
  toastTimer: null,
  pendingSelect: null,    // write-in just added: filter/search to it once the pool frame arrives
  proxySlot: null,        // commissioner is drafting for whoever owns this slot
  proxyArm: false,        // enter proxy mode for whatever slot is on the clock once the next state lands
  modal: null,            // null | 'edit' | 'trade' | 'reset' | 'settings'
  teamSheet: null,        // { id, slot } while a team's sheet is open (slot: the pick it came from, if drafted)
  editSlot: null,
  trade: null,            // { aDrafter, aSlot, bDrafter, bSlot } while the trade modal is open
  mobileTab: 'pick',      // phone shell: 'pick' | 'board' | 'team'
  rosterOf: null,         // roster panel: drafter picked from its dropdown, or null for mine
  queueDrag: null,        // team id being dragged in the queue
  queueFocus: null,       // team id to refocus in the queue after a keyboard reorder
  landed: null,           // a pick just landed: { slot, team, owner, auto, count, clock, until, nextText } (phone: mine only)
  lastClock: null,        // the on-the-clock ring's last { sec, total }, for the landing to fade out from
  landTimer: null,        // ends the landing's hold (noteLanding)
  heroMin: loadHeroMin()  // desktop/tablet: the hero is minimized to the one-line strip (remembered per device)
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

// Is the worker drafting for `id` when they're up? (state.autoDraft is
// missing on rooms saved before auto-draft existed.)
const autoDraftOn = (d, id) => (d.s.autoDraft || []).includes(id);

// ---- Auto-draft ----

// My own switch: in the right column (the My team tab on phones),
// between My queue and Roster, and in the lobby so it can be set before the
// draft starts. Just the label and the switch: the guide explains it.
// Nothing for a visitor who isn't drafting.
function autoDraftHtml(d){
  if(!d.s.config.drafters.includes(d.me) || d.s.phase === 'done') return '';
  const on = autoDraftOn(d, d.me);
  return `<div class="dr-auto${on ? ' on' : ''}">
    <span class="dr-auto-label">Auto-draft</span>
    ${switchHtml({ on, label: 'Auto-draft for me', onclick: `draftToggleAuto('${esc(d.me)}')` })}
  </div>`;
}

// Commissioner, live room: one switch per drafter, for anyone who can't
// make it. (A mock room has bots for that.)
function autoDraftRowsHtml(d){
  return (d.s.order || d.s.config.drafters).map(id => {
    const on = autoDraftOn(d, id);
    return `<div class="dr-order-row dr-auto-row${id === d.me ? ' me' : ''}">
      <span class="dr-order-name">${esc(drafterName(id))}${id === d.me ? ' <span class="dr-you">YOU</span>' : ''}${on ? ' <span class="dr-bot-tag">AUTO</span>' : ''}</span>
      ${switchHtml({ on, label: `Auto-draft for ${drafterName(id)}`, onclick: `draftToggleAuto('${esc(id)}')` })}
    </div>`;
  }).join('');
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
  // A golfer's tile is a headshot, cropped to the face rather than fit whole like a crest.
  return `<span class="dr-tile dr-tile-${size}${team.badgeUrl ? ' has-crest' : ''}${team.espnAthleteId ? ' is-person' : ''}" style="background:${esc(team.color)};color:${tileFg(team.color)}">${text}${img}</span>`;
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

// The header pill only speaks up about the connection. Round, pick and
// phase already show in the room itself (the on-the-clock card, the
// lobby, the "Draft complete" card), so repeating them here was noise.
function statusPill(d){
  const el = document.getElementById('draft-status');
  if(!el) return;
  let label = null;
  if(draftStore.status === 'offline') label = d ? 'Reconnecting…' : 'Offline';
  else if(!d) label = 'Connecting…';
  el.hidden = !label;
  el.innerHTML = label ? `<i style="background:var(--text-mute)"></i>${esc(label)}` : '';
  const sub = document.getElementById('draft-sub');
  if(sub){
    const rounds = d ? d.rounds : 21;
    // Mock rooms (Settings → Draft → Mock Draft) aren't any season's draft.
    const mock = isMockRoom(draftStore.room);
    const title = document.getElementById('draft-title');
    const shared = mock && !mockRoomOwner(draftStore.room, d ? d.s.config.drafters : DRAFT_TEAMS.map(t => t.id));
    if(title) title.textContent = shared ? 'Group Rehearsal' : (mock ? 'Mock Draft' : 'Draft');
    const room = mock || draftStore.room === 'main' ? '' : ` · room ${esc(draftStore.room)}`;
    // The scoring rules, one tap away without leaving the room (js/scoring-sheet.js).
    const html = `${mock ? 'Practice' : `${NEXT_DRAFT_LABEL} season`} · Snake · ${rounds} rounds${room}`
      + ' · <button type="button" class="draft-sub-link" onclick="draftOpenScoring()">Scoring</button>';
    // Only on change: this runs every render, and a rebuilt button can eat a tap.
    if(sub.innerHTML !== html) sub.innerHTML = html;
  }
}

// ---- Lobby ----

function lobbyHtml(d){
  const { s } = d;
  const order = s.order;
  const drawn = !!order;
  const revealed = ui.revealed === null ? d.n : ui.revealed;
  const mock = isMockRoom(draftStore.room);
  const rows = mock ? mockOrderRowsHtml(d) : Array.from({ length: d.n }, (_, pos) => {
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
    // A mock room loads its own pool (maybeAutoPool), so only the real
    // room shows the button.
    const poolBtn = mock ? '' : `<button class="dr-btn" onclick="draftLoadPool()">${s.poolSize ? `Reload pool (${s.poolSize})` : 'Load team pool'}</button>`;
    // A mock room can switch between a random order and the live room's
    // (the button is off while it's already using the live one).
    const liveBtn = mock && drawn
      ? `<button class="dr-btn"${s.orderSource === 'live' ? ' disabled' : ''} onclick="draftLiveOrder()">Live draft order</button>`
      : '';
    const main = !drawn
      ? `<button class="dr-btn dr-btn-primary" onclick="draftRunLottery()">Run lottery</button>`
      : `<button class="dr-btn dr-btn-primary"${settled ? '' : ' disabled'} onclick="draftStart()">Start draft</button>
         <button class="dr-btn"${settled ? '' : ' disabled'} onclick="draftRunLottery()">${mock ? 'Random order' : 'Re-run lottery'}</button>${liveBtn}`;
    // One block: the buttons, then the clock. Phones lay it out two to a
    // row, so a mock's bot speed joins it there to pair with the clock
    // (wider screens keep it beside the bot buttons). The primary button
    // spans the row only when what follows it pairs up evenly.
    const timing = (mock ? botSpeedHtml(d, 'dr-narrow-only') : '') + clockSelectHtml(d);
    const rest = (drawn ? 1 : 0) + (liveBtn ? 1 : 0) + (poolBtn ? 1 : 0) + (mock ? 1 : 0) + 1;
    actions = `<div class="dr-lobby-actions${rest % 2 ? '' : ' span'}">
        <div class="dr-action-group">${main}${poolBtn}</div>
        <div class="dr-action-group">${timing}</div>
      </div>`;
  } else if(mock){
    // A mock room signs every socket in on connect; this is the moment before.
    actions = '<div class="dr-wait">Connecting…</div>';
  } else {
    actions = `<div class="dr-wait">${drawn ? 'Waiting for the commissioner to start the draft.' : 'Waiting for the commissioner to run the lottery.'}</div>`;
  }

  return `
    <div class="dr-lobby">
      <p class="dr-lobby-copy">${mock
        ? (mockRoomOwner(draftStore.room, s.config.drafters)
          ? 'Your own practice draft. Nothing counts and nobody else sees it. Bots pick on their own, and if your clock runs out you\u2019re auto-picked from your queue, or the best team left.'
          : 'Group rehearsal, nothing counts. Anyone here can set it up and run it. Bots pick on their own, and anyone whose clock runs out is auto-picked from their queue, or the best team left.')
        : "Live snake draft. Take a team from any league in any round, until you hit that league's roster cap. Order is set by random lottery."}</p>
      <div class="dr-card">
        <div class="dr-card-head"><h3>Draft order</h3><span class="dr-dim">${mock
          ? `${s.orderSource === 'live' ? 'Live draft order · ' : ''}${(s.config.bots || []).length} of ${d.n} bots`
          : (!drawn ? 'Not drawn yet' : (settled ? 'Locked in' : 'Drawing…'))}</span></div>
        ${rows}
        ${mock && draftStore.commissioner ? botActionsHtml(d, 'dr-wide-only') : ''}
      </div>
      ${firstPicks}
      ${autoDraftHtml(d)}
      ${actions}
    </div>`;
}

// Mock rooms only: one table for the draft order and which seats the
// worker drafts for. The order is the live room's once its lottery is
// drawn (worker/draft-room.js), else drawn automatically on arrival (see
// maybeAutoDraw), so the rows only fall back to roster order for the
// moment before it lands. Used by the lobby and the mid-draft modal.
function mockOrderRowsHtml(d){
  const { config, order } = d.s;
  const bots = config.bots || [];
  const canEdit = draftStore.commissioner;
  return (order || config.drafters).map((id, pos) => {
    const on = bots.includes(id);
    const isMe = id === d.me;
    return `<div class="dr-order-row dr-bot-row${isMe ? ' me' : ''}">
      <span class="dr-order-n">${order ? pos + 1 : '<span class="dr-dim">—</span>'}</span>
      <span class="dr-order-name">${esc(drafterName(id))}${isMe ? ' <span class="dr-you">YOU</span>' : ''}${on ? ' <span class="dr-bot-tag">BOT</span>' : ''}</span>
      ${canEdit ? switchHtml({ on, label: `${drafterName(id)} is a bot`, onclick: `draftToggleBot('${id}')` }) : ''}
    </div>`;
  }).join('');
}

// `speedClass` lets the lobby show this bot speed on wide screens only.
function botActionsHtml(d, speedClass = ''){
  return `<div class="dr-actions dr-actions-sub dr-bot-actions">
        <button class="dr-btn" onclick="draftSetBots('others')">Everyone but me</button>
        <button class="dr-btn" onclick="draftSetBots('none')">No bots</button>
        ${botSpeedHtml(d, speedClass)}
      </div>`;
}

function botSpeedHtml(d, cls = ''){
  return `<label class="dr-inline${cls ? ' ' + cls : ''}">Bots pick in ${selectHtml(BOT_CHOICES, d.s.config.botSeconds || DEFAULT_BOT_SECONDS, 'draftSetBotSeconds')}</label>`;
}

function botControlsHtml(d){
  return mockOrderRowsHtml(d) + botActionsHtml(d);
}

// The pick clock select: mock rooms auto-pick when it runs out.
function clockSelectHtml(d){
  return isMockRoom(draftStore.room)
    ? `<label class="dr-inline">Auto-pick after ${selectHtml(MOCK_CLOCK_CHOICES, d.s.config.clockSeconds, 'draftSetClock')}</label>`
    : `<label class="dr-inline">Clock ${selectHtml(CLOCK_CHOICES, d.s.config.clockSeconds, 'draftSetClock')}</label>`;
}

// ---- Live room shell ----

// The phone gets a shorter placeholder so it isn't cut off.
const searchInput = placeholder => `<input id="dr-search" class="dr-search" type="search" placeholder="${placeholder}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" oninput="draftSearch(this.value)">`;

function shellHtml(){
  return `
    <div class="dr-layout" data-left-tab="${ui.leftTab}" data-collapsed="${collapsedKeys().join(' ')}">
      <div class="dr-tabs">
        <button class="dr-tab" data-tab="available" onclick="draftLeftTab('available')">Available</button>
        <button class="dr-tab" data-tab="team" onclick="draftLeftTab('team')">My team</button>
      </div>
      <section class="dr-col dr-left">
        <button class="dr-rail" onclick="draftTogglePanel('left')" aria-label="Expand Available" aria-expanded="false"><span class="dr-caret" aria-hidden="true">${ICON.chevR}</span><span class="dr-rail-label">Available</span><span class="dr-rail-count" id="dr-rail-left-count"></span></button>
        <div class="dr-col-head"><h2>Available</h2><span id="dr-avail-count" class="dr-dim"></span><button class="dr-caret" onclick="draftTogglePanel('left')" aria-label="Collapse Available" aria-expanded="true">${ICON.chevL}</button></div>
        ${searchInput('Search teams, conferences, or add a school')}
        ${leagueTabsShell()}
        <div id="dr-groups" class="dr-scope"></div>
        <div id="dr-pool" class="dr-pool"></div>
      </section>
      <section class="dr-col dr-center">
        <div id="dr-clock"><div id="dr-clock-main"></div><div id="dr-clock-extra"></div></div>
        <div class="dr-board-scroll" id="dr-board-scroll"><div id="dr-board"></div></div>
      </section>
      <aside class="dr-col dr-right">
        <button class="dr-rail" onclick="draftTogglePanel('right')" aria-label="Expand My roster and queue" aria-expanded="false"><span class="dr-caret" aria-hidden="true">${ICON.chevL}</span><span class="dr-rail-label">My roster</span><span class="dr-rail-count" id="dr-rail-right-count"></span></button>
        <div id="dr-queue"></div>
        <div id="dr-autodraft"></div>
        <div id="dr-roster"></div>
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

// The same, but only the nodes that changed are touched, so a starred
// team's row updates without every crest in the list being rebuilt (a new
// lazy <img> shows the tile's abbreviation until it decodes: a flicker).
// For regions of plain rows; a form control that changed is replaced whole.
function patchRegion(id, html){
  const el = document.getElementById(id);
  if(!el || regionHtml.get(id) === html) return;
  const next = document.createElement('template');
  next.innerHTML = html;
  patchChildren(el, next.content);
  regionHtml.set(id, html);
}

// Team rows are matched by their team id, so a pick or a queue reorder
// moves the existing rows instead of rewriting every row below it.
const rowKey = n => n.nodeType === 1 ? (n.getAttribute('data-team') || n.getAttribute('data-id')) : null;

function patchChildren(parent, next){
  const keyed = new Map();
  parent.childNodes.forEach(n => { const k = rowKey(n); if(k) keyed.set(k, n); });
  const want = [...next.childNodes];
  want.forEach((node, i) => {
    const at = parent.childNodes[i] || null;
    const k = rowKey(node);
    const cur = k ? keyed.get(k) : (at && !rowKey(at) ? at : null);
    if(k) keyed.delete(k);
    if(!cur){ parent.insertBefore(node, at); return; }
    if(cur !== at) parent.insertBefore(cur, at);
    if(!cur.isEqualNode(node)) patchNode(cur, node);
  });
  while(parent.childNodes.length > want.length) parent.lastChild.remove();
}

function patchNode(cur, node){
  const sameElement = cur.nodeType === 1 && node.nodeType === 1 && cur.tagName === node.tagName
    && !/^(INPUT|SELECT|TEXTAREA|IMG)$/.test(cur.tagName);
  if(sameElement){
    [...cur.attributes].forEach(a => { if(!node.hasAttribute(a.name)) cur.removeAttribute(a.name); });
    [...node.attributes].forEach(a => { if(cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value); });
    patchChildren(cur, node);
  } else if(cur.nodeType === 3 && node.nodeType === 3){
    cur.textContent = node.textContent;
  } else {
    cur.replaceWith(node);
  }
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

// Rows in a single league's list skip the league tag (the tab already says
// it); the All list leads with it.
function poolRowHtml(d, team){
  const lg = leagueUi(team.league);
  const queued = draftStore.queue.includes(team.id);
  const fits = teamFits(d, team);
  let action = '';
  if(!fits) action = `<span class="dr-full">${lg.label} full</span>`;
  else if(d.canAct){
    action = `<button class="dr-draft-btn mine" onclick="draftClick('${team.id}')">Draft</button>`;
  }
  const inLeague = ui.filter !== 'all';
  const parts = [];
  if(!inLeague) parts.push(`<i style="background:${lg.color}"></i>${lg.label}`);
  if(team.custom) parts.push('Write-in');
  else if(team.rank) parts.push(`#${team.rank}`);
  // The group label narrows the list to that division (or conference).
  const g = teamGroup(team);
  if(g){
    const label = inLeague ? (g.div || g.conf) : teamGroupLabel(team);
    parts.push(`<button class="dr-row-group" title="Show only this group" onclick="draftSetScope('${team.league}', '${esc(g.conf)}', '${esc(g.div || '')}')">${esc(label)}</button>`);
  }
  return `<div class="dr-row${fits ? '' : ' dim'}" data-team="${team.id}" onclick="draftRowOpen(event, '${team.id}')">
    ${tileHtml(team, 'md')}
    <div class="dr-row-main">
      <button type="button" class="dr-row-name dr-open" onclick="draftOpenTeam('${team.id}')">${esc(team.name)}</button>
      <div class="dr-row-meta">${parts.join('<span>·</span>')}</div>
    </div>
    <button class="dr-star${queued ? ' on' : ''}" onclick="draftToggleQueue('${team.id}')" aria-label="${queued ? 'Remove from queue' : 'Add to queue'}" aria-pressed="${queued}">${ICON.star}</button>
    ${action}
  </div>`;
}

// League tabs: one scrolling row inside a frame whose ‹ › buttons appear
// only on a side with more tabs to see (a hidden-scrollbar strip can't
// otherwise be scrolled with a mouse). See syncLeagueTabs.
function leagueTabsShell(){
  return `<div class="dr-ltabs-wrap" id="dr-ltabs-wrap">
    <button class="dr-ltabs-arrow l" onclick="draftTabsScroll(-1)" aria-label="Scroll leagues left" tabindex="-1">${ICON.chevL}</button>
    <div id="dr-chips" class="dr-ltabs"></div>
    <button class="dr-ltabs-arrow r" onclick="draftTabsScroll(1)" aria-label="Scroll leagues right" tabindex="-1">${ICON.chevR}</button>
  </div>`;
}

// Show an arrow (and the edge fade) only where tabs are cut off, and when
// the selected league changes, bring its tab into view.
let tabsFilterShown = null;
function syncLeagueTabs(){
  const wrap = document.getElementById('dr-ltabs-wrap');
  const strip = document.getElementById('dr-chips');
  if(!wrap || !strip) return;
  if(tabsFilterShown !== ui.filter){
    tabsFilterShown = ui.filter;
    const on = strip.querySelector('.dr-ltab.on');
    if(on){
      const pad = 32;
      const left = on.offsetLeft - strip.offsetLeft, right = left + on.offsetWidth;
      if(left - pad < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - pad);
      else if(right + pad > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right + pad - strip.clientWidth;
    }
  }
  const max = strip.scrollWidth - strip.clientWidth;
  wrap.classList.toggle('more-l', strip.scrollLeft > 1);
  wrap.classList.toggle('more-r', strip.scrollLeft < max - 1);
}

// League tabs: All + each league in the draft, with how many are left.
function leagueTabsHtml(d, available){
  const counts = {};
  available.forEach(t => { counts[t.league] = (counts[t.league] || 0) + 1; });
  const tabs = [{ key: 'all', label: 'All', n: available.length }]
    .concat(Object.keys(d.s.config.caps).map(k => ({ key: k, label: leagueUi(k).label, n: counts[k] || 0 })));
  return tabs.map(c =>
    `<button class="dr-ltab${ui.filter === c.key ? ' on' : ''}" onclick="draftSetFilter('${c.key}')" aria-pressed="${ui.filter === c.key}">${c.label}<span>${c.n}</span></button>`
  ).join('');
}

function menuItemHtml(label, n, on, onclick){
  return `<button class="dr-menu-item${on ? ' on' : ''}${n ? '' : ' empty'}" onclick="${onclick}"><span>${esc(label)}</span><span class="dr-menu-n">${n}</span></button>`;
}

function dropdownHtml(key, on, label, items){
  const open = ui.menu === key;
  return `<div class="dr-dd">
    <button class="dr-dd-btn${on ? ' on' : ''}" onclick="draftMenu('${key}')" aria-haspopup="true" aria-expanded="${open}">${esc(label)}${ICON.chevD}</button>
    ${open ? `<div class="dr-menu" role="menu">${items}</div>` : ''}
  </div>`;
}

// The row under the league tabs: Conference / Division menus (when the
// league has them), or a hint, and the sort menu on the right.
function scopeRowHtml(d, available, filtered){
  const parts = [];
  if(ui.menu) parts.push('<div class="dr-menu-back" onclick="draftMenu(null)"></div>');
  const league = ui.filter;
  const confs = league === 'all' ? [] : leagueConfs(league, d.s.pool);
  const divsAll = league === 'all' ? [] : leagueDivs(league, d.s.pool);
  const lgTeams = available.filter(t => t.league === league);
  const inConf = c => lgTeams.filter(t => { const g = teamGroup(t); return g && g.conf === c; }).length;
  const inDiv = v => lgTeams.filter(t => { const g = teamGroup(t); return g && g.div === v; }).length;
  if(confs.length){
    const confScope = ui.conf ? inConf(ui.conf) : lgTeams.length;
    const items = menuItemHtml('All conferences', lgTeams.length, !ui.conf, 'draftSetConf(null)')
      + confs.map(c => menuItemHtml(c, inConf(c), ui.conf === c, `draftSetConf('${esc(c)}')`)).join('');
    parts.push(dropdownHtml('conf', !!ui.conf, ui.conf ? `${ui.conf} · ${confScope}` : 'All conferences', items));
    if(divsAll.length){
      const divs = ui.conf ? divsAll.filter(v => v.conf === ui.conf) : divsAll;
      const items = menuItemHtml(ui.conf ? `All ${ui.conf}` : 'All divisions', confScope, !ui.div, 'draftSetDiv(null)')
        + divs.map(v => menuItemHtml(v.div, inDiv(v.div), ui.div === v.div, `draftSetDiv('${esc(v.div)}')`)).join('');
      parts.push(dropdownHtml('div', !!ui.div, ui.div ? `${ui.div} · ${inDiv(ui.div)}` : 'All divisions', items));
    }
  } else {
    const hint = league === 'all' && ui.sort === 'rank' ? `Top ${LEAGUE_PREVIEW} per league` : `${filtered.length} ${poolNoun(league)}`;
    parts.push(`<span class="dr-scope-hint">${hint}</span>`);
  }
  const sort = SORTS.find(o => o.key === ui.sort);
  const sortItems = SORTS.map(o =>
    `<button class="dr-menu-item dr-menu-sort${ui.sort === o.key ? ' on' : ''}" onclick="draftSetSort('${o.key}')"><span>${o.label}</span><small>${o.sub}</small></button>`).join('');
  parts.push(`<div class="dr-dd dr-dd-sort">
    <button class="dr-sort-btn" onclick="draftMenu('sort')" aria-haspopup="true" aria-expanded="${ui.menu === 'sort'}" aria-label="Sort: ${sort.label}">${sort.label}${ICON.chevD}</button>
    ${ui.menu === 'sort' ? `<div class="dr-menu" role="menu">${sortItems}</div>` : ''}
  </div>`);
  return parts.join('');
}

function renderPool(d){
  const available = orderedPool(d.s.pool).filter(t => !d.taken.has(t.id));

  // Drop a conference/division that no longer applies to the selected league.
  if(ui.filter === 'all' || (ui.conf && !leagueConfs(ui.filter, d.s.pool).includes(ui.conf))){ ui.conf = null; ui.div = null; }
  if(ui.div && !leagueDivs(ui.filter, d.s.pool, ui.conf).some(v => v.div === ui.div)) ui.div = null;

  const q = ui.search.trim().toLowerCase();
  const filtered = available.filter(t => {
    if(ui.filter !== 'all' && t.league !== ui.filter) return false;
    if(ui.conf || ui.div){
      const g = teamGroup(t);
      if(!g || (ui.conf && g.conf !== ui.conf) || (ui.div && g.div !== ui.div)) return false;
    }
    return !q || t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q) || teamGroupLabel(t).toLowerCase().includes(q);
  });

  setRegion('dr-chips', leagueTabsHtml(d, available));
  syncLeagueTabs();
  setRegion('dr-groups', scopeRowHtml(d, available, filtered));

  let list;
  if(ui.sort === 'rank' && ui.filter === 'all'){
    list = rankSectionsHtml(d, filtered, !!q);
  } else {
    const limit = isPhone() ? POOL_LIMIT_PHONE : POOL_LIMIT;
    const shown = ui.showAll ? filtered : filtered.slice(0, limit);
    const scope = ui.div || ui.conf || (ui.filter === 'all' ? 'teams' : leagueUi(ui.filter).label);
    const more = filtered.length > limit
      ? `<button class="dr-showall" onclick="draftToggleShowAll()">${ui.showAll ? 'Show fewer' : `See all ${filtered.length} ${esc(scope)}`}</button>` : '';
    list = shown.map(t => poolRowHtml(d, t)).join('') + more;
  }
  if(!filtered.length && !q){
    const back = ui.conf || ui.div
      ? `<button class="dr-link" onclick="draftSetConf(null)">Show all ${ui.filter === 'all' ? 'teams' : leagueUi(ui.filter).label}</button>` : '';
    list = `<div class="dr-empty">No teams left here. ${back}</div>`;
  }
  patchRegion('dr-pool', list + writeInCardHtml(d, filtered));
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

// ---- Center: clock card, up next, board ----

// The clock region is two parts: the card itself (#dr-clock-main) and
// what goes under it (#dr-clock-extra: who's picking under a landing, the
// proxy button, the paused banner). Changes underneath then never rebuild
// the card, which would cut short a landing that's still playing.
function setClockRegions(d){
  const [main, extra] = clockCardParts(d);
  setRegion('dr-clock-main', main);
  setRegion('dr-clock-extra', extra);
}

// The on-the-clock display. Desktop and tablet show the hero for every
// turn and every pick (minimizable to the one-line strip: who, which pick,
// the timer). What goes under it (who's picking, the proxy button) sits
// along the hero's bottom there (.dr-hero-foot), so the card keeps its
// height. The phone shows the hero only for your own turn; anyone else's
// gets a compact two-row card, since a strip's worth of text doesn't fit a
// phone's width.
function clockCardParts(d){
  const { s } = d;
  const phone = isPhone();
  const wide = !phone && !ui.heroMin;
  // My pick's landing comes first, even over the draft ending: it plays in
  // full before the card catches up (landedFor).
  const landed = landedFor(d);
  if(landed && s.phase !== 'draft') return [landedHeroHtml(d, landed), ''];
  if(s.phase === 'done'){
    const dl = `<button class="dr-btn dr-download-btn" onclick="draftDownload()">${ICON.download}Download board</button>`;
    return [phone
      ? `<div class="dr-clock-card done"><div><div class="dr-eyebrow win">DRAFT COMPLETE</div><div class="dr-done-title">${d.total} picks. Rosters are set.</div></div>${dl}</div>`
      : `<div class="dr-clock-card done strip"><span class="dr-eyebrow win">DRAFT COMPLETE</span><span class="dr-clock-sub">${d.total} picks. Rosters are set.</span>${dl}</div>`, ''];
  }
  const info = d.clockInfo;
  const natural = drafterNaturalOwner(d, info.slot);
  const via = natural !== info.owner ? natural : null;
  const highest = Math.max(-1, ...Object.keys(s.picks).map(Number));
  const makeUp = info.slot < highest;
  const round = Math.floor(info.slot / d.n) + 1;
  const auto = autoDraftOn(d, info.owner);
  const eyebrow = `ON THE CLOCK${makeUp ? `<span class="dr-badge">${phone ? 'MAKE-UP PICK' : 'MAKE-UP'}</span>` : ''}`;
  // Sits beside the name rather than in the eyebrow, which it would wrap.
  const autoBadge = auto ? '<span class="dr-badge">AUTO</span>' : '';
  // The desktop strip already names who's up right beside the button, so
  // it just says Pick there; the phone's button sits apart from the name.
  const proxyLabel = d.proxy ? 'Cancel' : (phone || wide ? `Pick for ${esc(drafterName(info.owner))}` : 'Pick');
  const proxyBtn = draftStore.commissioner && !d.myTurn && d.running
    ? `<button class="dr-btn dr-btn-gold dr-proxy-btn" onclick="draftProxy()" aria-label="${d.proxy ? 'Cancel picking' : `Pick for ${esc(drafterName(info.owner))}`}">${proxyLabel}</button>` : '';
  const banners = `${d.proxy ? `<div class="dr-proxy-note">Commissioner: picking for ${esc(drafterName(info.owner))}</div>` : ''}
    ${!s.clock.running ? '<div class="dr-paused">Draft paused by the commissioner. The clock is stopped.</div>' : ''}`;
  const minBtn = wide ? iconButtonHtml({ icon: 'chevron-down', label: 'Minimize the clock', onclick: 'draftHeroMin(true)', cls: 'clock-hero-min' }) : '';
  if(landed){
    // Back to back at the turn of the snake, it's my clock running under it.
    const who = info.owner === d.me ? 'You’re on the clock again' : `${esc(drafterName(info.owner))} is picking…`;
    const nextUp = `<div class="dr-next-up${info.owner === d.me ? ' mine' : ''}"><span class="draft-live-dot" aria-hidden="true"></span><span class="dr-next-up-who">${who}</span><span class="dr-timer" id="dr-timer">0:00</span>${phone ? '' : proxyBtn}</div>`;
    return [landedHeroHtml(d, landed, minBtn), `
    ${wide ? `<div class="dr-hero-foot">${nextUp}</div>` : nextUp}
    ${phone && proxyBtn ? `<div class="dm-proxy">${proxyBtn}</div>` : ''}
    ${banners}`];
  }
  if(d.myTurn && (phone || wide)){
    const next = myNextSlot(d, info.slot);
    const sub = [
      `Pick ${pickLabel(info.slot, d.n)}`,
      next < 0 ? 'your last pick' : `your next turn is ${pickLabel(next, d.n)}`,
      makeUp ? 'make-up pick' : '',
      via ? `via ${drafterName(via)}` : '',
      auto ? 'auto-draft is on' : ''
    ].filter(Boolean).join(' · ');
    // Rendered full; updateClock sets the time right after, so the region's
    // HTML stays the same from tick to tick and isn't rebuilt.
    const total = clockLimitMs(d) / 1000;
    return [clockHeroHtml({ clockHtml: draftClockHtml({ secondsLeft: total, total }), title: 'You’re on the clock', sub, cornerHtml: minBtn }), banners];
  }
  if(phone){
    return [`
    <div class="dr-clock-card">
      <div class="dr-clock-main">
        <div class="dr-eyebrow">${eyebrow}</div>
        <div class="dr-clock-name"><span class="dr-clock-who">${esc(drafterName(info.owner))}</span>${autoBadge}</div>
        ${via ? `<div class="dr-clock-sub">via ${esc(drafterName(via))}</div>` : ''}
      </div>
      <div class="dr-timer-box">
        <div class="dr-clock-pick">Round ${round} · Pick ${info.slot + 1} of ${d.total}</div>
        <div class="dr-timer" id="dr-timer">0:00</div>
        <div class="dr-bar"><span id="dr-bar"></span></div>
      </div>
    </div>`, `
    ${proxyBtn ? `<div class="dm-proxy">${proxyBtn}</div>` : ''}
    ${banners}`];
  }
  if(wide){
    const sub = [
      `Round ${round}`,
      `Pick ${pickLabel(info.slot, d.n)}`,
      makeUp ? 'make-up pick' : '',
      via ? `via ${drafterName(via)}` : '',
      auto ? 'auto-draft is on' : ''
    ].filter(Boolean).join(' · ');
    const total = clockLimitMs(d) / 1000;
    return [clockHeroHtml({ clockHtml: draftClockHtml({ secondsLeft: total, total }), title: `${drafterName(info.owner)} is on the clock`, sub, others: true, cornerHtml: minBtn }), `
    ${proxyBtn ? `<div class="dr-hero-foot">${proxyBtn}</div>` : ''}
    ${banners}`];
  }
  // Minimized: the strip, gold on your own turn.
  const mine = d.myTurn;
  const expandBtn = iconButtonHtml({ icon: 'chevron-down', label: 'Show the big clock', onclick: 'draftHeroMin(false)', cls: 'dr-strip-expand' });
  return [`
    <div class="dr-clock-card strip${mine ? ' mine' : ''}">
      <span class="dr-eyebrow${mine ? ' gold' : ''}">${mine ? 'YOU’RE ' : ''}${eyebrow}</span>
      <span class="dr-clock-name"><span class="dr-clock-who">${esc(drafterName(info.owner))}</span>${autoBadge}</span>
      ${via ? `<span class="dr-clock-sub">via ${esc(drafterName(via))}</span>` : ''}
      ${proxyBtn}
      <span class="dr-strip-timer"><span class="dr-clock-pick">Round ${round} · Pick ${info.slot + 1} of ${d.total}</span><span class="dr-timer" id="dr-timer">0:00</span><span class="dr-bar"><span id="dr-bar"></span></span></span>
      ${expandBtn}
    </div>`, banners];
}

// The ring turns red for the last 8 seconds.
const HURRY_SEC = 8;

// My next unpicked slot after `slot`, or -1 if I have none left.
function myNextSlot(d, slot){
  for(let i = slot + 1; i < d.total; i++){
    if(!d.s.picks[i] && ownerOf(i, d.s.order, d.s.overrides) === d.me) return i;
  }
  return -1;
}

const pickCount = d => Object.keys(d.s.picks).length;

// My pick, landed (docs/delight-plan.md, Phase 1). For its first few
// seconds (`until`) the hero holds it whatever else happens: the next
// drafter picking in a second (a bot, auto-draft), me back on the clock at
// the turn of the snake, even the draft ending. The draft doesn't wait: the
// board, the rail and the clocks under it keep going, and the card catches
// up once the hold ends (fxClockSwap). After that it stays only while the next
// drafter is still picking.
// Desktop and tablet land everyone's pick (unless the hero is minimized),
// each for its hold only, then hand the hero to whoever's up. Someone
// else's landing gives way at once when I go on the clock.
function landedFor(d){
  const l = ui.landed;
  if(!l) return null;
  const phone = isPhone();
  if(phone ? l.owner !== d.me : ui.heroMin) return null;
  const pick = d.s.picks[l.slot];
  if(!pick || pick.team !== l.team) return null;   // undone or changed
  if(l.owner !== d.me && d.myTurn) return null;
  if(Date.now() < l.until) return l;
  if(!phone || d.s.phase !== 'draft' || d.myTurn || pickCount(d) !== l.count) return null;
  return l;
}

// The hero turned into the landing. The clock and title are still in it,
// hidden, at the time they last showed, so the landing can fade them out.
// Someone else's pick (desktop) still says when you're up next.
function landedHeroHtml(d, l, cornerHtml = ''){
  const team = teamById(d.s.pool, l.team);
  if(!team) return '';
  const mine = l.owner === d.me;
  const name = drafterName(l.owner);
  const c = l.clock || { sec: 0, total: 1 };
  return clockHeroHtml({
    clockHtml: draftClockHtml({ secondsLeft: c.sec, total: c.total, hurry: c.sec <= HURRY_SEC }),
    title: mine ? 'You’re on the clock' : `${name} is on the clock`,
    others: !mine,
    cornerHtml,
    landingHtml: pickLandingHtml({
      color: team.color,
      badgeHtml: tileHtml(team, 'xl'),
      title: mine ? (l.auto ? 'Auto-picked for you' : 'Your pick is in') : (l.auto ? `Auto-picked for ${name}` : `${name}’s pick is in`),
      sub: `${team.name} · ${leagueUi(team.league).label} · Pick ${pickLabel(l.slot, d.n)}`,
      // Frozen while the landing holds, so picks landing under it don't rebuild the hero.
      next: Date.now() < l.until ? l.nextText : nextPickText(d, l.slot, mine)
    })
  });
}

// "You pick again at 2.07 · 12 picks away", from where the clock is now.
// After someone else's pick it's "You pick at …", and nothing once you're done.
function nextPickText(d, slot, mine = true){
  const next = myNextSlot(d, slot);
  if(next < 0) return mine ? 'That was your last pick' : '';
  const away = d.clockInfo ? next - d.clockInfo.slot : 0;
  if(away <= 0) return `You’re up again at ${pickLabel(next, d.n)}`;
  return `You pick ${mine ? 'again ' : ''}at ${pickLabel(next, d.n)} · ${away} pick${away === 1 ? '' : 's'} away`;
}

window.draftHeroMin = on => {
  ui.heroMin = !!on;
  try { localStorage.setItem(HERO_MIN_KEY, on ? '1' : '0'); } catch(e){}
  scheduleRender();
};

// ---- Phone: the pinned mini clock ----

// The hero is too tall to pin over the list. While it's up, the phone's top
// block still sticks, but only once the hero and the rail have scrolled off:
// what stays pinned is a band just above the Pick / Board / My team tabs,
// where a slim bar with the same clock fades in over the rail (yours while
// you're up, the next drafter's while your pick is landed). The band takes
// its own room above the list, so nothing is ever hidden under it. Tapping
// the bar goes back up.
function miniHtml(d){
  if(d.myTurn) return clockMiniHtml({ label: 'You’re on the clock', sub: `Pick ${pickLabel(d.clockInfo.slot, d.n)}`, mine: true, onclick: 'draftToClock()' });
  if(landedFor(d)) return clockMiniHtml({ label: `${drafterName(d.clockInfo.owner)} is picking…`, live: true, onclick: 'draftToClock()' });
  return '';
}

const MINI_BAND = 60;   // the bar (44) with 6 above it and the top block's 10 gap under it
let miniStickAt = null, miniScrollBound = false;

// After each phone render: where the top block sticks (--dm-stick, negative,
// so the hero and rail scroll off first), where the bar sits in it, and the
// scroll offset that pins it.
function pinPhoneTop(){
  const sc = root(), top = sc && sc.querySelector('.dm-top');
  const tabs = top && top.querySelector('.dm-tabs');
  if(!tabs) return;
  if(!miniScrollBound){ sc.addEventListener('scroll', syncMini, { passive: true }); miniScrollBound = true; }
  if(!top.querySelector('.clock-hero')){
    top.style.removeProperty('--dm-stick');
    miniStickAt = null;
  } else {
    const at = tabs.offsetTop - MINI_BAND;
    top.style.setProperty('--dm-stick', `${-at}px`);
    top.style.setProperty('--dm-mini-top', `${at}px`);
    // The top block's own place in the scroller (it leads .dm), so this holds even while it's stuck.
    const dm = top.parentElement;
    miniStickAt = dm.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop + at;
  }
  syncMini();
}

function syncMini(){
  const mini = document.getElementById('dm-mini');
  if(mini) mini.classList.toggle('show', miniStickAt !== null && root().scrollTop >= miniStickAt - 2);
}

// Back up to the hero: eased over `ms` when motion is on (so the landing
// knows when to start), else at once. Returns how long it takes.
const SCROLL_UP_MS = 650;
function scrollToClock(){
  const sc = root();
  const from = sc ? sc.scrollTop : 0;
  if(from <= 0) return 0;
  if(!fxOn()){ sc.scrollTop = 0; return 0; }
  const t0 = performance.now();
  // The drafter touching the list lets go. (Not a scrollTop mismatch: the
  // pick's own re-render shifts the content mid-flight and would read as one.)
  let held = false;
  const stop = () => { held = true; };
  const evs = ['touchstart', 'wheel', 'pointerdown'];
  evs.forEach(ev => sc.addEventListener(ev, stop, { passive: true, once: true }));
  const step = now => {
    const k = Math.min(1, (now - t0) / SCROLL_UP_MS);
    if(held || k >= 1){
      evs.forEach(ev => sc.removeEventListener(ev, stop));
      if(!held) sc.scrollTop = 0;
      return;
    }
    // Ease in and out, so it leaves the list gently and settles on the hero.
    const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    sc.scrollTop = from * (1 - eased);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return SCROLL_UP_MS;
}
window.draftToClock = () => { scrollToClock(); };

// The phone's pick order: three picks back, the one on the clock, and what's
// coming, each done pick with its team's color. A pick slides it along.
const RAIL_BEFORE = 3, RAIL_SLOTS = 12, RAIL_STEP = 64;   // slot 58 + gap 6
function railStart(d){
  const cur = d.clockInfo ? d.clockInfo.slot : d.total - 1;
  return Math.max(0, Math.min(cur - RAIL_BEFORE, d.total - RAIL_SLOTS));
}
function railHtml(d){
  if(d.s.phase !== 'draft' || !d.clockInfo) return '';
  const start = railStart(d), cur = d.clockInfo.slot, slots = [];
  for(let slot = start; slot < Math.min(d.total, start + RAIL_SLOTS); slot++){
    const owner = ownerOf(slot, d.s.order, d.s.overrides);
    const pick = d.s.picks[slot];
    const team = pick && teamById(d.s.pool, pick.team);
    slots.push({ label: pickLabel(slot, d.n), name: owner === d.me ? 'You' : drafterName(owner), state: pick ? 'done' : (slot === cur ? 'now' : ''), chip: team ? team.color : '' });
  }
  return snakeRailHtml({ slots });
}

function drafterNaturalOwner(d, slot){
  const round = Math.floor(slot / d.n), pos = slot % d.n;
  return d.s.order[round % 2 === 0 ? pos : d.n - 1 - pos];
}

function boardHtml(d){
  const { s, n } = d;
  const order = s.order;
  const cur = d.clockInfo ? d.clockInfo.slot : -1;
  const head = order.map(id => `<div class="dr-bh${id === d.me ? ' me' : ''}${d.clockInfo && d.clockInfo.owner === id ? ' clock' : ''}" data-id="${esc(id)}"${autoDraftOn(d, id) ? ' title="Auto-draft is on"' : ''}>${autoDraftOn(d, id) ? '<span class="dr-auto-dot" aria-label="Auto-draft"></span>' : ''}${esc(drafterName(id))}${id === d.me ? ' (you)' : ''}</div>`).join('');
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
        const open = team ? ` onclick="draftOpenTeam('${team.id}', ${slot})" role="button" tabindex="0"` : '';
        cells.push(`<div class="dr-cell filled${mine ? ' mine' : ''}${open ? ' editable' : ''}" data-slot="${slot}"${open}><div class="dr-cell-top"><span>${label}</span><span style="color:${lg.color}">${lg.label}</span></div><div class="dr-cell-team">${team ? tileHtml(team, 'xs') : ''}<span>${team ? esc(team.name) : '—'}</span></div></div>`);
      } else if(slot === cur){
        cells.push(`<div class="dr-cell current" data-current="1" data-slot="${slot}"><div class="dr-cell-top"><span>${label}</span></div><div class="dr-cell-clock">On the clock</div></div>`);
      } else {
        cells.push(`<div class="dr-cell empty${mine ? ' mine' : ''}" data-slot="${slot}"><div class="dr-cell-top"><span>${label}</span></div>${traded ? `<div class="dr-cell-traded">→ ${esc(drafterName(owner))}</div>` : ''}</div>`);
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
    .map(k => {
      const team = teamById(s.pool, s.picks[k].team);
      return team && { ...team, slot: Number(k) };
    }).filter(Boolean);
}

// A filled roster slot: just the logo, with the team's name (and the pick
// it came from) in a tooltip on hover — see the tooltip handlers below. A
// tap or click opens the team's sheet.
function rosterTileHtml(d, team){
  const tip = `${leagueUi(team.league).label} · Pick ${pickLabel(team.slot, d.n)}`;
  return `<button type="button" class="dr-slot-team" data-tip="${esc(team.name)}" data-tip-sub="${esc(tip)}" aria-label="${esc(team.name)}, ${esc(tip)}" onclick="draftOpenTeam('${team.id}', ${team.slot})">${tileHtml(team, 'sm')}</button>`;
}

function rosterHtml(d){
  const { s } = d;
  const who = rosterOwner(d);
  const mine = rosterPicks(d, who);
  const rows = Object.keys(s.config.caps).filter(k => s.config.caps[k] > 0).map(k => {
    const cap = s.config.caps[k];
    const have = mine.filter(t => t.league === k);
    const slots = Array.from({ length: cap }, (_, i) => have[i] ? rosterTileHtml(d, have[i]) : '<span class="dr-slot"></span>').join('');
    const lg = leagueUi(k);
    return `<div class="dr-roster-row${have.length >= cap ? ' full' : ''}" data-league="${k}"><span class="dr-roster-lg" style="color:${lg.color}">${lg.label}</span><span class="dr-slots">${slots}</span><span class="dr-roster-n">${have.length}/${cap}</span></div>`;
  }).join('');
  const railCount = document.getElementById('dr-rail-right-count');
  if(railCount) railCount.textContent = `${rosterPicks(d, d.me).length}/${d.rounds}`;
  const options = (s.order || s.config.drafters).map(id =>
    `<option value="${esc(id)}"${id === who ? ' selected' : ''}>${esc(drafterName(id))}${id === d.me ? ' (Yours)' : ''}</option>`).join('');
  return `<div class="dr-col-head dr-roster-head"><h2>Roster</h2><label class="dr-roster-pick"><select onchange="draftViewRoster(this.value)" aria-label="Whose roster to show">${options}</select>${ICON.chevD}</label></div>${rows}`;
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
      // Drag the grip (or the card) to reorder; Alt+↑/↓ moves a focused card.
      return `<div class="dr-q${isTop && d.myTurn ? ' top' : ''}${fits ? '' : ' dim'}${ui.queueDrag === t.id ? ' dragging' : ''}" data-id="${t.id}" tabindex="0" draggable="true"
          aria-label="${esc(t.name)}, queue position ${i + 1}. Alt plus arrow keys to move."
          ondragstart="draftQueueDrag(event, '${t.id}')" ondragover="draftQueueOver(event)" ondrop="draftQueueDrop(event, '${t.id}')" ondragend="draftQueueDragEnd()">
        <div class="dr-q-row" onclick="draftRowOpen(event, '${t.id}')"><span class="dr-q-grip" title="Drag to reorder">${ICON.grip}</span><span class="dr-q-i">${i + 1}</span>${tileHtml(t, 'sm')}<span class="dr-q-main"><button type="button" class="dr-q-name dr-open" onclick="draftOpenTeam('${t.id}')">${esc(t.name)}</button>${tag}</span>
          <span class="dr-q-ctl">${i > 0 ? `<button onclick="draftQueueTop('${t.id}')" title="Move to top" aria-label="Move ${esc(t.name)} to top">${ICON.toTop}</button>` : ''}<button onclick="draftToggleQueue('${t.id}')" aria-label="Remove ${esc(t.name)} from queue">${ICON.close}</button></span></div>
        ${draft}
      </div>`;
    }).join('');
  }
  return `<div class="dr-col-head dr-queue-head"><h2>My queue</h2><span class="dr-dim">${list.length} ranked</span><button class="dr-caret" onclick="draftTogglePanel('right')" aria-label="Collapse My roster and queue" aria-expanded="true">${ICON.chevR}</button></div>${body}`;
}

// ---- Commissioner bar + modals ----

// The password is only ever entered on Settings → Commissioner
// (js/admin.js); once it's saved there, this room signs in with it
// (resumeCommissioner) and the bar appears. Nobody else sees one.
function commBarHtml(d){
  const anyPicks = Object.keys(d.s.picks).length > 0;
  const live = d.s.phase === 'draft';
  const mock = isMockRoom(draftStore.room);
  return `<span class="dr-comm-label">COMMISSIONER</span>
    ${live ? `<button class="dr-btn" onclick="${d.s.clock.running ? 'draftPause' : 'draftResume'}()">${d.s.clock.running ? 'Pause' : 'Resume'}</button>` : ''}
    <button class="dr-btn"${anyPicks ? '' : ' disabled'} onclick="draftUndo()">Undo pick</button>
    ${d.s.order && d.s.phase !== 'done' ? '<button class="dr-btn" onclick="draftOpenTrade()">Trade</button>' : ''}
    ${live ? `<button class="dr-btn" onclick="draftOpenSettings()">${mock ? 'Bots &amp; clock' : 'Clock &amp; auto-draft'}</button>` : ''}
    <button class="dr-btn" onclick="draftDownload()" title="Everything so far, including who owns each remaining pick">Download board</button>
    <button class="dr-btn dr-btn-ghost" onclick="draftOpenReset()">Reset</button>`;
}

// Off the lobby, in every room, for the signed-in commissioner only (a
// mock room signs everyone in on connect).
function renderCommBar(d){
  const el = document.getElementById('draft-comm');
  if(!el) return;
  const show = !!d && d.s.phase !== 'lobby' && draftStore.commissioner;
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
  if(ui.modal === 'settings'){
    if(!draftStore.commissioner) return null;
    const mock = isMockRoom(draftStore.room);
    return `<h3>${mock ? 'Bots &amp; clock' : 'Clock &amp; auto-draft'}</h3>
      <p>${mock ? 'Takes effect from the pick on the clock now. Bots pick on their own; anyone else is auto-picked when the clock runs out.' : `The clock is soft: it counts up in red when time runs out. Only drafters on auto-draft are picked for, as soon as they go on the clock. Switch it on for anyone who can't make it.`}</p>
      <div class="dr-actions dr-actions-sub">${clockSelectHtml(d)}</div>
      <div class="dr-card dr-modal-card">${mock ? botControlsHtml(d) : autoDraftRowsHtml(d)}</div>
      <div class="dr-modal-btns"><button class="dr-btn" onclick="draftCloseModal()">Done</button></div>`;
  }
  if(ui.modal === 'reset'){
    return `<h3>Reset the draft?</h3>
      <p>This clears every pick, any trades and the lottery order, and returns everyone to the lobby. The team pool is kept (write-ins are removed).</p>
      <div class="dr-modal-btns"><button class="dr-btn dr-btn-red" onclick="draftDoReset()">Reset draft</button><button class="dr-btn" onclick="draftCloseModal()">Cancel</button></div>`;
  }
  return null;
}

// The app's shared .modal-overlay sheet: centered on desktop, a bottom
// sheet on phones (slides up, swipe down to dismiss). Closing leaves the
// body in place so it slides out with the sheet.
function renderModal(d){
  const overlay = document.getElementById('draft-modal');
  const sheet = document.getElementById('draft-modal-content');
  if(!overlay || !sheet) return;
  const body = d && ui.modal ? modalBody(d) : null;
  if(!body){ closeSheetOverlay(overlay); if(ui.modal && d) ui.modal = null; return; }
  if(regionHtml.get('draft-modal') !== body){ sheet.innerHTML = body; regionHtml.set('draft-modal', body); }
  enableSheetSwipeToDismiss(sheet, window.draftCloseModal);
  openSheetOverlay(overlay);
}

// ---- Team sheet ----
// Tapping a team anywhere in the room (Available, the queue, the board, a
// roster slot) opens its scouting sheet: last season, its record so far
// and title odds (js/draft-scout.js), with Draft and Queue on it. Built
// from the app's shared sheet classes (.modal, .modal-head, the golfer
// sheet's too) so it reads as the same sheet.

function sheetBadgeHtml(team){
  return teamBadgeHtml({
    name: esc(team.name), badgeText: esc(team.abbr), badgeUrl: team.badgeUrl ? esc(team.badgeUrl) : null,
    badgeStyle: `background:${esc(team.color)}; color:${tileFg(team.color)};`
  });
}

function ordinal(n){
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function statCellHtml(value, label){
  return `<div class="stat-cell"><div class="num sm">${esc(value)}</div><div class="lbl">${esc(label)}</div></div>`;
}

// One label/value line, in the Scoring sheet's row style.
function scoutRowHtml(label, value, sub){
  const note = sub ? `<div class="scout-sub">${esc(sub)}</div>` : '';
  return `<div class="scoring-item"><div class="scoring-label">${esc(label)}${note}</div><div class="scoring-value">${esc(value)}</div></div>`;
}

// The written outlook for this draft (js/draft-outlooks.js), dated, or
// else a line built from the numbers.
function outlookHtml(team, sc){
  const written = (DRAFT_OUTLOOKS[NEXT_DRAFT_YEAR] || {})[team.id];
  let title = 'Outlook', text = '';
  if(written && written.text){
    text = written.text;
    const at = written.at ? new Date(`${written.at}T12:00:00`) : null;
    if(at && !isNaN(at)) title += ` · ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } else if(sc){
    text = scoutSummary(team, sc);
  }
  if(!text) return sc && sc.last === undefined ? `<div class="modal-section-title">Outlook</div>${skeletonLinesHtml(2)}` : '';
  return `<div class="modal-section-title">${esc(title)}</div><p class="scout-outlook">${esc(text)}</p>`;
}

function scoutStripHtml(sc){
  if(sc.last === undefined) return '<div class="stat-strip"><div class="stat-cell"><div class="lbl">Loading…</div></div></div>';
  const cells = [];
  const last = sc.last;
  if(last && last.absent) cells.push(statCellHtml('—', `${sc.lastLabel} ${sc.recordLabel}`));
  else if(last){
    cells.push(statCellHtml(last.record || '—', `${sc.lastLabel} ${last.ongoing ? 'so far' : sc.recordLabel}`));
    if(last.finish) cells.push(statCellHtml(last.finish.value, `${sc.lastLabel} ${last.ongoing ? 'place' : last.finish.label}`));
  }
  if(sc.now) cells.push(statCellHtml(sc.now.record, `${sc.nowLabel} so far`));
  return cells.length ? `<div class="stat-strip">${cells.join('')}</div>` : '';
}

function scoutBodyHtml(sc){
  const parts = [];
  const last = sc.last;
  if(last === null){
    parts.push(`<div class="no-live-note">Couldn't load last season from ESPN. It'll try again shortly.</div>`);
  } else if(last){
    const rows = [];
    if(last.absent) rows.push(scoutRowHtml(last.absent, ''));
    if(last.points != null) rows.push(scoutRowHtml('Points', String(last.points)));
    if(last.note) rows.push(scoutRowHtml('Qualified for', last.note));
    if(last.postLabel && last.post !== null){
      rows.push(last.post === undefined ? skeletonLinesHtml(1) : scoutRowHtml(last.postLabel, last.post));
    }
    if(rows.length) parts.push(`<div class="modal-section-title">${esc(sc.lastLabel)} season</div><div class="scoring-list scout-list">${rows.join('')}</div>`);
  }
  if(sc.odds === undefined){
    parts.push(`<div class="modal-section-title">Odds</div>${skeletonLinesHtml(2)}`);
  } else if(sc.odds.length){
    const rows = sc.odds.map(o => scoutRowHtml(o.label, o.odds, o.rank ? `${ordinal(o.rank)} best of ${o.of}` : ''));
    parts.push(`<div class="modal-section-title">Odds · DraftKings</div><div class="scoring-list scout-list">${rows.join('')}</div>`);
  }
  return parts.join('');
}

// Draft / Edit pick, or why there's nothing to press.
function sheetActionsHtml(d, team, pickSlot){
  const lg = leagueUi(team.league);
  if(pickSlot != null){
    const owner = ownerOf(pickSlot, d.s.order, d.s.overrides);
    const edit = draftStore.commissioner
      ? buttonHtml({ label: 'Edit pick', variant: 'secondary', onclick: `draftSheetEditPick(${pickSlot})` }) : '';
    return `${edit}<div class="modal-cta-note">Drafted by ${esc(owner === d.me ? 'you' : drafterName(owner))} · Pick ${pickLabel(pickSlot, d.n)}</div>`;
  }
  if(d.s.phase !== 'draft') return '';
  if(!teamFits(d, team)){
    const whose = d.proxy ? `${drafterName(d.actor)}'s` : 'Your';
    return `<div class="modal-cta-note">${esc(whose)} ${lg.label} spots are full</div>`;
  }
  if(d.canAct){
    const label = d.proxy ? `Draft ${team.name} for ${drafterName(d.actor)}` : `Draft ${team.name}`;
    return buttonHtml({ label, onclick: `draftSheetPick('${team.id}')` });
  }
  return d.s.config.drafters.includes(d.me) ? `<div class="modal-cta-note">You can draft when you're on the clock</div>` : '';
}

function teamSheetHtml(d){
  const team = ui.teamSheet && teamById(d.s.pool, ui.teamSheet.id);
  if(!team) return null;
  const lg = leagueUi(team.league);
  const pickSlot = Object.keys(d.s.picks).map(Number).find(k => d.s.picks[k].team === team.id);
  const taken = pickSlot != null;
  const queued = draftStore.queue.includes(team.id);
  const sub = [lg.label];
  if(team.custom) sub.push('Write-in');
  else if(team.rank) sub.push(`#${team.rank} ranked`);
  const group = teamGroupLabel(team);
  if(group) sub.push(group);
  const star = taken ? '' : `<button class="favorite-star${queued ? ' active' : ''}" onclick="draftToggleQueue('${team.id}')" aria-label="${queued ? 'Remove from queue' : 'Add to queue'}" aria-pressed="${queued}">${queued ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</button>`;
  const sc = hasScouting(team) ? scoutTeam(team, scheduleRender) : null;
  return `
    <div class="modal-accent" style="background:${esc(team.color)};"></div>
    <div class="modal-head">
      ${sheetBadgeHtml(team)}
      <div>
        <h2>${esc(team.name)}</h2>
        <div class="modal-sub">${esc(sub.join(' · '))}</div>
      </div>
      <div class="modal-actions">
        ${star}
        <button class="modal-close" onclick="draftCloseTeam()" aria-label="Close">&times;</button>
      </div>
    </div>
    ${sc ? scoutStripHtml(sc) : ''}
    <div class="modal-body">
      ${outlookHtml(team, sc)}
      ${sc ? scoutBodyHtml(sc) : `<div class="no-live-note">No season stats for ${team.custom ? 'write-in teams' : team.league === 'pga' ? 'golfers yet' : 'this team'}.</div>`}
      <div class="scout-actions">${sheetActionsHtml(d, team, taken ? pickSlot : null)}</div>
    </div>`;
}

function renderTeamSheet(d){
  const overlay = document.getElementById('draft-team-sheet');
  const sheet = document.getElementById('draft-team-sheet-content');
  if(!overlay || !sheet) return;
  const body = d && ui.teamSheet ? teamSheetHtml(d) : null;
  if(!body){ closeSheetOverlay(overlay); if(d) ui.teamSheet = null; return; }
  if(regionHtml.get('draft-team-sheet') !== body){ sheet.innerHTML = body; regionHtml.set('draft-team-sheet', body); }
  enableSheetSwipeToDismiss(sheet, window.draftCloseTeam);
  openSheetOverlay(overlay);
}

window.draftOpenTeam = (id, slot) => { ui.menu = null; ui.teamSheet = { id, slot: slot ?? null }; scheduleRender(); };
// Row taps open the sheet unless they landed on one of the row's own buttons.
window.draftRowOpen = (event, id) => {
  if(event.target.closest('button, a, select, input')) return;
  window.draftOpenTeam(id);
};
window.draftCloseTeam = () => { ui.teamSheet = null; scheduleRender(); };
window.draftSheetPick = id => { ui.teamSheet = null; window.draftClick(id); scheduleRender(); };
window.draftSheetEditPick = slot => { ui.teamSheet = null; window.draftEditPick(slot); };

// ---- Phone shell ----

function phoneShellHtml(){
  const tab = (key, label) => `<button class="dm-tab${ui.mobileTab === key ? ' on' : ''}" data-tab="${key}" onclick="draftMobileTab('${key}')">${label}</button>`;
  return `
    <div class="dm" data-tab="${ui.mobileTab}">
      <div class="dm-top">
        <div id="dr-clock"><div id="dr-clock-main"></div><div id="dr-clock-extra"></div></div>
        <div id="dm-rail"></div>
        <div id="dm-mini" class="dm-mini"></div>
        <div class="dm-tabs">${tab('pick', 'Pick')}${tab('board', 'Board')}${tab('team', 'My team')}</div>
      </div>
      <section class="dm-pane" data-pane="pick">
        <div id="dm-queue-top"></div>
        ${searchInput('Search or add a school')}
        ${leagueTabsShell()}
        <div id="dr-groups" class="dr-scope"></div>
        <div id="dr-pool" class="dr-pool"></div>
      </section>
      <section class="dm-pane" data-pane="board"><div id="dm-board"></div></section>
      <section class="dm-pane" data-pane="team"><div id="dr-queue"></div><div id="dr-autodraft"></div><div id="dr-roster"></div></section>
    </div>`;
}

// Top of the Pick tab on your turn: your first three queued teams that fit.
function phoneQueueHtml(d){
  if(!d.myTurn) return '';
  const fits = queueTeams(d).filter(t => teamFits(d, t, d.myCounts)).slice(0, 3);
  if(!fits.length) return '';
  return `<div class="dm-from-queue"><div class="dr-eyebrow gold">FROM YOUR QUEUE</div>${fits.map(t => {
    return `<div class="dm-qrow" data-team="${t.id}" onclick="draftRowOpen(event, '${t.id}')">${tileHtml(t, 'md')}<div class="dr-row-main"><button type="button" class="dr-row-name dr-open" onclick="draftOpenTeam('${t.id}')">${esc(t.name)}</button><div class="dr-row-meta">${leagueUi(t.league).label}</div></div>
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
    const open = team ? ` onclick="draftOpenTeam('${team.id}', ${slot})" role="button" tabindex="0"` : '';
    rows.push(`<div class="dm-brow${cur ? ' cur' : ''}${owner === d.me ? ' mine' : ''}${open ? ' editable' : ''}" data-slot="${slot}"${open}><span class="dm-b-label">${pickLabel(slot, d.n)}</span><span class="dm-b-owner">${owner === d.me ? 'You' : esc(drafterName(owner))}</span><span class="dm-b-team">${body}</span></div>`);
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
  setClockRegions(d);
  setRegion('dm-rail', railHtml(d));
  setRegion('dm-mini', miniHtml(d));
  pinPhoneTop();
  setRegion('dr-autodraft', autoDraftHtml(d));
  patchRegion('dm-queue-top', phoneQueueHtml(d));
  setRegion('dm-board', phoneBoardHtml(d));
  patchRegion('dr-roster', rosterHtml(d));
  patchRegion('dr-queue', queueHtml(d));
  updateClock();
  if(ui.revealScope) revealScopeRow();
}

// A narrower list (a division tapped on a row, a league tab, a filter
// menu) can leave the page scrolled past the filter row, under the
// sticky clock: bring the row back to just below it.
function revealScopeRow(){
  ui.revealScope = false;
  const top = document.querySelector('.dm-top'), row = document.getElementById('dr-groups');
  const scroller = document.getElementById('draft-content');
  if(!top || !row || !scroller) return;
  const gap = row.getBoundingClientRect().top - top.getBoundingClientRect().bottom - 8;
  if(gap < 0) scroller.scrollBy({ top: gap });
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
    tabsFilterShown = null;
  }
  updateTabs();
  renderPool(d);
  setRegion('dr-autodraft', autoDraftHtml(d));
  setClockRegions(d);
  const hadBoard = regionHtml.has('dr-board');
  setRegion('dr-board', boardHtml(d));
  patchRegion('dr-roster', rosterHtml(d));
  patchRegion('dr-queue', queueHtml(d));
  updateClock();
  const cell = document.querySelector('.dr-cell[data-current]');
  if(cell && (!hadBoard || cell.dataset.scrolled !== String(d.clockInfo && d.clockInfo.slot))){
    cell.dataset.scrolled = String(d.clockInfo && d.clockInfo.slot);
    followCurrentPick(hadBoard ? 'smooth' : 'auto');
  }
}

// Centre the pick on the clock inside the board's own scroller. Unlike
// scrollIntoView this never scrolls an ancestor, so the page can't jump (iOS).
function followCurrentPick(behavior){
  const scroller = document.getElementById('dr-board-scroll');
  const cell = scroller && scroller.querySelector('.dr-cell[data-current]');
  if(!cell) return;
  const box = scroller.getBoundingClientRect(), at = cell.getBoundingClientRect();
  scroller.scrollTo({
    top: scroller.scrollTop + (at.top - box.top) - scroller.clientHeight / 2 + at.height / 2,
    left: scroller.scrollLeft + (at.left - box.left) - scroller.clientWidth / 2 + at.width / 2,
    behavior
  });
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
  maybeAutoDraw(d);
  maybeAutoPool(d);
  setMotionSpeed(isMockRoom(draftStore.room) ? 2 : 1);
  const events = draftEvents(d);
  noteLanding(d, events);
  if(d.s.phase === 'lobby'){
    if(ui.shell !== 'lobby'){ ui.shell = 'lobby'; }
    root().innerHTML = lobbyHtml(d);
    renderCommBar(null);
    renderModal(null);
    renderTeamSheet(null);
    return;
  }
  if(ui.shell === 'lobby') ui.shell = null;
  const clockWas = clockSnapshot();
  if(isPhone()) renderPhone(d); else renderLive(d);
  playDraftEvents(d, events);
  if(clockWas) fxClockSwap(clockWas);
  renderCommBar(d);
  renderModal(d);
  renderTeamSheet(d);
  applyPendingSelect(d);
  if(ui.queueFocus){
    const item = document.querySelector(`.dr-q[data-id="${ui.queueFocus}"]`);
    ui.queueFocus = null;
    if(item) item.focus();
  }
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
  // Mock rooms skip it: a practice run shouldn't make you wait 6s per draw.
  if(orderKey && !firstLook && d.s.phase === 'lobby' && !isMockRoom(draftStore.room)){
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

// A mock lobby always has an order: the first signed-in viewer to see it
// undrawn (a new room, or one just reset) draws it. `ifUndrawn` makes a
// second viewer racing the same draw a no-op instead of a reshuffle, and
// its refusal is expected, so it isn't toasted.
function maybeAutoDraw(d){
  if(d.s.order || d.s.phase !== 'lobby' || !draftStore.commissioner || !isMockRoom(draftStore.room)) return;
  const key = `${draftStore.room}:${d.s.seq}`;
  if(ui.autoDrawFor === key) return;
  ui.autoDrawFor = key;
  sendDraftAction(currentProfileId, { type: 'runLottery', ifUndrawn: true });
}

// Does the pool fall short of what startDraft needs (every league's cap
// for every drafter)? A new room has no pool at all, and a sports change
// can add a league the pool doesn't have yet.
function poolShort(s){
  const { caps, drafters } = s.config;
  return Object.keys(caps).some(league => s.pool.filter(t => t.league === league).length < caps[league] * drafters.length);
}

function loadPool(){
  // The room's own sports (a group's caps, js/groups.js), not every league.
  const caps = draftStore.state.config.caps;
  return run({ type: 'setPool', teams: buildDraftPool(Object.keys(caps).filter(k => caps[k] > 0)) }, null);
}

// A mock lobby loads its own team pool, like it draws its own order, so
// it's ready to start. Once per room and set of sports, so a pool that
// still comes up short (too few teams in a league) isn't resent forever.
function maybeAutoPool(d){
  if(d.s.phase !== 'lobby' || !draftStore.commissioner || !isMockRoom(draftStore.room) || !poolShort(d.s)) return;
  const key = `${draftStore.room}:${JSON.stringify(d.s.config.caps)}`;
  if(ui.autoPoolFor === key) return;
  ui.autoPoolFor = key;
  loadPool();
}

// ---- Live effects (docs/motion-plan.md, Phase 1) ----
//
// render() rebuilds regions from state, so effects come from comparing the
// state it last saw with this one (draftEvents) and play on the new DOM
// once it's written (playDraftEvents). As with the lottery reveal, the
// first render, a reconnect, or joining late shows the settled room with
// no effects. A burst of picks between two renders (a commissioner catching
// up, auto-picks) collapses to the newest one.

const fx = {
  prev: null,          // snapshot from the last render, null until the next one is a first look
  stale: undefined,    // the state seen while disconnected; the first newer one is a first look
  sent: null,          // { team, slot, rect, ghost, row, at }: my pick in flight, measured before the re-render
  nudged: null,        // clock slot the time's-up nudge already played for
  railStart: null,     // first slot the phone's pick rail showed last render
  railShift: 0         // how many slots it moved along this render
};

function fxSnapshot(d){
  return {
    room: draftStore.room,
    order: d.s.order ? d.s.order.join(',') : '',
    phase: d.s.phase,
    slots: new Set(Object.keys(d.s.picks).map(Number)),
    myTurn: d.myTurn,
    clockOwner: d.clockInfo ? d.clockInfo.owner : null,
    myCounts: { ...d.myCounts }
  };
}

function draftEvents(d){
  if(draftStore.status !== 'open'){
    fx.prev = null;
    fx.stale = draftStore.state;
    return [];
  }
  if(fx.stale !== undefined){
    if(draftStore.state === fx.stale) return [];
    fx.stale = undefined;
  }
  const prev = fx.prev, cur = fxSnapshot(d);
  fx.prev = cur;
  if(!prev || prev.room !== cur.room || prev.order !== cur.order || document.hidden) return [];
  const events = [];
  if(cur.myTurn && !prev.myTurn) events.push({ type: 'clock', from: prev.clockOwner });
  const added = [...cur.slots].filter(slot => !prev.slots.has(slot));
  if(added.length){
    const slot = Math.max(...added);
    const pick = d.s.picks[slot];
    const owner = ownerOf(slot, d.s.order, d.s.overrides);
    const sent = fx.sent && fx.sent.slot === slot && fx.sent.team === pick.team && Date.now() - fx.sent.at < 15000 ? fx.sent : null;
    fx.sent = null;
    // Mine: a pick for my own roster, or one I just made for someone (proxy).
    events.push({ type: 'pick', slot, team: pick.team, owner, sent, mine: !!sent || owner === d.me });
    if(cur.phase === 'draft' && cur.slots.size % d.n === 0) events.push({ type: 'snake', round: cur.slots.size / d.n + 1 });
    Object.keys(cur.myCounts).forEach(league => {
      if((cur.myCounts[league] || 0) > (prev.myCounts[league] || 0)) events.push({ type: 'slot', league, count: cur.myCounts[league] });
    });
  }
  if(prev.phase === 'draft' && cur.phase === 'done') events.push({ type: 'done' });
  return events;
}

// Before the room re-renders: a pick turns the hero into the landing
// (landedFor: mine on a phone, anyone's on desktop), and the pick rail
// notes how far it's moving. On desktop a landing holds at least
// DESK_LAND_HOLD_MS, and mine isn't cut short by another pick landing.
const DESK_LAND_HOLD_MS = 6000;
function noteLanding(d, events){
  const desk = !isPhone();
  const holding = ui.landed && ui.landed.owner === d.me && Date.now() < ui.landed.until;
  const e = events.find(x => x.type === 'pick' && (x.owner === d.me || (desk && !holding)));
  if(e){
    const pick = d.s.picks[e.slot];
    const mine = e.owner === d.me;
    // Long enough for the whole landing (after any scroll back up), and a
    // beat to read it; without motion, just long enough to read.
    const wait = e.sent && e.sent.scrollUntil ? Math.max(0, e.sent.scrollUntil - performance.now()) : 0;
    let hold = fxOn() ? wait + LAND_HOLD_MS : LAND_HOLD_STILL_MS;
    if(desk) hold = Math.max(hold, DESK_LAND_HOLD_MS);
    ui.landed = { slot: e.slot, team: e.team, owner: e.owner, auto: !!pick.auto, count: pickCount(d), clock: ui.lastClock, until: Date.now() + hold, nextText: nextPickText(d, e.slot, mine) };
    clearTimeout(ui.landTimer);
    ui.landTimer = setTimeout(scheduleRender, hold + 30);
  }
  const start = d.clockInfo ? railStart(d) : null;
  fx.railShift = start !== null && fx.railStart !== null ? start - fx.railStart : 0;
  fx.railStart = start;
}

// A short id for this draft (room + drawn order), for once-per-device keys.
function draftFxKey(d){
  const text = `${draftStore.room}:${d.s.order ? d.s.order.join(',') : ''}`;
  let h = 0;
  for(let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${draftStore.room}:${(h >>> 0).toString(36)}`;
}

function playDraftEvents(d, events){
  if(!events.length || !fxOn()) return;
  const key = draftFxKey(d);
  for(const e of events){
    if(e.type === 'clock') fxOnTheClock(e);
    else if(e.type === 'pick'){ fxPick(d, e, key); fxRail(e.slot, e.owner === d.me ? 700 : 0); }
    else if(e.type === 'snake') fxSnake(e);
    else if(e.type === 'slot') fxSlot(d, e);
    else if(e.type === 'done') fxDone(d, key);
  }
}

// You're on the clock: the board's underline slides over to your column.
// The hero growing in is the clock card's swap (fxClockSwap).
function fxOnTheClock(e){
  const head = document.querySelector('.dr-grid-head');
  const to = head && head.querySelector('.dr-bh.clock');
  const from = head && e.from && [...head.querySelectorAll('.dr-bh')].find(el => el.dataset.id === e.from);
  if(!to || !from || from === to) return;
  const h = head.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const bar = document.createElement('span');
  bar.className = 'fx-uline';
  Object.assign(bar.style, { left: `${b.left - h.left}px`, top: `${b.bottom - h.top - 2}px`, width: `${b.width}px` });
  head.appendChild(bar);
  to.classList.add('fx-uline-off');
  const anim = play(bar, [
    { transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})` },
    { transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})`, offset: 0.3 },
    { transform: 'none' }
  ], { duration: 1100, easing: EASE_SPRING });
  const end = () => { bar.remove(); to.classList.remove('fx-uline-off'); };
  if(anim) anim.finished.then(end, end); else end();
}

// A pick lands. Yours (or one you made for someone): the crest flies from
// the row you tapped into its board cell, the cell flashes gold and pops,
// and a toast confirms it, once per device. Anyone else's: just the cell
// flashing in its league's color. The phone board is a list rather than a
// grid, so it moves instead (fxPhoneBoard).
function fxPick(d, e, key){
  const team = teamById(d.s.pool, e.team);
  const cell = document.querySelector(`.dr-cell[data-slot="${e.slot}"], .dm-brow[data-slot="${e.slot}"]`);
  const phone = cell && cell.classList.contains('dm-brow');
  const onHero = ui.landed && ui.landed.slot === e.slot && document.querySelector('#dr-clock .clock-hero.landed');
  if(!e.mine){
    // Desktop lands everyone's pick on the hero too.
    const land = onHero ? fxLanding(e) : 0;
    if(phone) fxPhoneBoard(cell, team);
    else if(cell && team) flashTint(cell, { tint: leagueUi(team.league).color, delay: land });
    return;
  }
  if(!once(`pick:${key}:${e.slot}`)) return;
  // A pick that lands on the hero (fxLanding): the board cell just lights up.
  if(onHero){
    const land = fxLanding(e);
    if(phone) fxPhoneBoard(cell, team, land);
    else if(cell){
      flashTint(cell, { delay: land });
      pop(cell, { delay: land });
    }
    return;
  }
  const dest = cell && cell.querySelector('.dr-tile');
  // Measured before the board moves, so the crest lands where its row ends up.
  const land = (e.sent && flyTo(e.sent.ghost, e.sent.rect, dest)) || 0;
  if(phone) fxPhoneBoard(cell, team, land);
  else if(cell){
    flashTint(cell, { delay: land });
    pop(cell, { delay: land });
  }
  if(team){
    const message = e.owner === d.me ? `Drafted ${team.name}` : `Drafted ${team.name} for ${drafterName(e.owner)}`;
    later(land + 200, () => toast(message));
  }
}

const RISE_14 = [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }];
const LAND_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
// The landing's beats. It always plays at full length, a mock room's 2×
// included, since it's the moment the pick is yours.
const LAND = {
  settle: 150,    // after scrolling back up, a breath before it starts
  fadeOut: 320,   // the clock and title fade back...
  shrink: 480,    // ...and shrink to 0.85
  orbIn: 900,     // the orb fades in...
  orbGrow: 1400,  // ...while it grows from 0.2
  flyAt: 220,     // the crest leaves once the orb is on its way
  fly: 900,       // and takes this long to land
  textStep: 110,
  text: 560,
  nextAfter: 650  // the "You pick again" pill, after the crest lands
};
// How long the hero holds the landing before catching up with the room:
// the whole sequence, then a beat to read it.
const LAND_HOLD_MS = LAND.settle + LAND.flyAt + LAND.fly + LAND.nextAfter + LAND.text + 900;
const LAND_HOLD_STILL_MS = 2500;

// Your pick is in: the clock and title fade back, the team's orb blooms
// behind the hero, the crest you tapped flies into its center and a gold
// ring pulses off it, "Your pick is in" rises, the row you picked from
// closes up, and "You pick again at …" follows. The hero is already in its
// landed state; this plays it in. Returns when the crest lands.
function fxLanding(e){
  const hero = document.querySelector('#dr-clock .clock-hero.landed');
  // On a phone the pick was made further down: the room is scrolling back
  // up to the hero (draftClick), so the landing holds its start until then.
  const wait = e.sent && e.sent.scrollUntil ? Math.max(0, e.sent.scrollUntil - performance.now()) : 0;
  if(wait > 0){
    hero.classList.add('land-wait');
    setTimeout(() => {
      hero.classList.remove('land-wait');
      if(hero.isConnected) atSpeed(1, () => playLanding(hero, e, true));
    }, wait + LAND.settle);
    return wait + LAND.settle + LAND.flyAt + LAND.fly;
  }
  return atSpeed(1, () => playLanding(hero, e, false));
}

function playLanding(hero, e, scrolled){
  hero.querySelectorAll('.clock-hero-clock, .clock-hero-head').forEach(el => {
    play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: LAND.fadeOut });
    play(el, [{ transform: 'none' }, { transform: 'scale(0.85)' }], { duration: LAND.shrink });
  });
  const orb = hero.querySelector('.pick-landing-orb');
  play(orb, [{ transform: 'scale(0.2)' }, { transform: 'none' }], { duration: LAND.orbGrow, delay: 80 });
  play(orb, [{ opacity: 0, offset: 0 }], { duration: LAND.orbIn, delay: 80 });
  const badge = hero.querySelector('.pick-landing-badge');
  const flown = e.sent && flyTo(e.sent.ghost, e.sent.rect, badge.querySelector('.dr-tile'), { duration: LAND.fly, delay: LAND.flyAt, easing: LAND_EASE });
  const land = flown || LAND.flyAt + 400;
  if(!flown) pop(badge, { from: 0.6, delay: LAND.flyAt, duration: 560 });
  ringPulse(badge, { delay: land, iterations: 1, duration: 1000 });
  stagger(hero.querySelectorAll('.pick-landing-title, .pick-landing-sub'), RISE_14, { step: LAND.textStep, delay: land - 120, duration: LAND.text });
  play(hero.querySelector('.pick-landing-next'), RISE_14, { duration: LAND.text, delay: land + LAND.nextAfter });
  // After scrolling up, the row is long out of sight.
  if(!scrolled) fxRowGone(e.sent);
  return land;
}

// The row a pick was made from closes up: it fades where it was (its crest
// is flying) while the rows under it slide up into the gap.
function fxRowGone(sent){
  const row = sent && sent.row;
  if(!row || !row.rect.height) return;
  const list = document.getElementById(row.list);
  const ghost = row.ghost;
  // Not a row any more: kept out of the slide below and out of patchRegion's row matching.
  ghost.removeAttribute('data-team');
  ghost.querySelectorAll('.dr-tile').forEach(t => { t.style.visibility = 'hidden'; });
  ghost.classList.add('fx-fly');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: `${row.rect.left}px`, top: `${row.rect.top}px`, width: `${row.rect.width}px`, height: `${row.rect.height}px` });
  (list || document.body).appendChild(ghost);
  const fade = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
  if(fade) fade.finished.then(() => ghost.remove(), () => ghost.remove()); else ghost.remove();
  if(!list) return;
  // Rows far below the fold aren't worth animating.
  [...list.querySelectorAll('[data-team]')]
    .filter(el => el.getBoundingClientRect().top >= row.rect.top - 1)
    .slice(0, 12)
    .forEach(el => play(el, [{ transform: `translateY(${row.rect.height}px)` }, { transform: 'none' }], { duration: 380 }));
}

// The clock card changing size: going on the clock (the small card or
// strip grows into the hero) and leaving my pick's landing (its hold is
// over, or the next drafter has picked). Rather than cut, a frozen copy of
// the old card fades out over the new one while the clock area eases to
// its new height and the new card comes in underneath, both ways on the
// same even curves (an ease-out dropped most of the height in the first
// frames, which read as a jolt).
// - Going on the clock: the hero fades up as the area opens, then its ring
//   pops in, the title rises and a gold ring pulses.
// - Back to back at the turn the frame doesn't change, so the landing
//   dissolves into my clock with the same ring, title and pulse.
// - Anything else after a landing (the next drafter's card, the finished
//   draft) rises in as the area shrinks.
const SWAP = { fade: 460, resize: 560, inDelay: 180, in: 480 };

// Someone else's hero (desktop) counts as 'other', like the strip.
const clockKind = box => {
  const hero = box.querySelector('#dr-clock-main .clock-hero');
  if(!hero) return 'other';
  return hero.classList.contains('landed') ? 'landed' : (hero.classList.contains('others') ? 'other' : 'mine');
};

// Taken before each render unless my own clock is up (nothing grows out of
// it), so the old card can fade out if the new one is a different size.
function clockSnapshot(){
  const box = document.getElementById('dr-clock');
  if(!box || !fxOn() || !box.querySelector('#dr-clock-main > *')) return null;
  const kind = clockKind(box);
  if(kind === 'mine') return null;
  const ghost = box.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  ghost.classList.add('clock-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  return { box, ghost, kind, height: box.getBoundingClientRect().height, html: regionHtml.get('dr-clock-main') };
}

function fxClockSwap(snap){
  const { box, ghost } = snap;
  if(!box.isConnected || regionHtml.get('dr-clock-main') === snap.html) return;
  const kind = clockKind(box);
  const entering = snap.kind === 'other' && kind === 'mine';
  const leaving = snap.kind === 'landed' && kind !== 'landed';
  if(!entering && !leaving) return;
  atSpeed(1, () => {
    const to = box.getBoundingClientRect().height;
    box.classList.add('fx-swap');
    box.appendChild(ghost);
    if(Math.abs(to - snap.height) > 1){
      box.style.height = `${snap.height}px`;
      box.getBoundingClientRect();
      box.style.height = `${to}px`;
    }
    play(ghost, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: entering ? SWAP.fade - 120 : SWAP.fade, easing: EASE_IN_OUT, fill: 'forwards' });
    const hero = box.querySelector('#dr-clock-main .clock-hero:not(.landed)');
    if(hero){
      if(entering) play(hero, [{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: SWAP.in, delay: 60, easing: EASE_IN_OUT });
      pop(hero.querySelector('.draft-clock'), { from: 0.85, delay: SWAP.inDelay + (entering ? 60 : 0), duration: 520 });
      stagger(hero.querySelectorAll('.clock-hero-title, .clock-hero-sub'), RISE_14, { step: 90, delay: SWAP.inDelay + 120 + (entering ? 60 : 0), duration: 500 });
      // One soft gold glow along the edge once the card has settled (mine only: gold means you).
      if(!hero.classList.contains('others')) ringPulse(hero, { glow: true, delay: SWAP.resize + 80, duration: 1200, iterations: 1 });
    } else {
      stagger([...box.querySelectorAll('#dr-clock-main > *, #dr-clock-extra > *')], [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { step: 60, delay: SWAP.inDelay, duration: SWAP.in });
    }
  });
  setTimeout(() => {
    ghost.remove();
    box.classList.remove('fx-swap');
    box.style.height = '';
    if(ui.shell === 'phone') pinPhoneTop();
  }, Math.max(SWAP.fade, SWAP.resize) + 20);
}

// The phone's pick rail: the slot just picked gets its team chip, then the
// rail slides along to keep the pick on the clock in place.
function fxRail(slot, delay = 0){
  const track = document.querySelector('#dm-rail .snake-rail-track');
  if(!track || fx.railStart === null) return;
  const done = track.children[slot - fx.railStart];
  pop(done && done.querySelector('.snake-slot-chip'), { from: 0, delay, duration: 500 });
  if(fx.railShift) play(track, [{ transform: `translateX(${fx.railShift * RAIL_STEP}px)` }, { transform: 'none' }], { duration: 600, delay: delay + 300 });
}

// The phone board, newest first: each pick puts a new on-the-clock row on
// top and pushes the rest down one. Without motion that's a jump, so the
// rows glide down into place, the new top row slides in, and the team
// slides into the row that was just filled under a soft tint (gold for
// yours, else its league's color).
function fxPhoneBoard(row, team, delay = 0){
  const rows = [...row.parentElement.querySelectorAll(':scope > .dm-brow')];
  const top = rows[0];
  // Only the usual case: the clock moved on to the very next pick.
  if(top && top !== row && rows[1] === row){
    const h = top.getBoundingClientRect().height;
    play(top, [{ opacity: 0, transform: `translateY(-${h * 0.6}px)` }, { opacity: 1, transform: 'none' }], { duration: 360 });
    // Rows far below the fold aren't worth animating.
    rows.slice(1, 12).forEach(r => play(r, [{ transform: `translateY(-${h}px)` }, { transform: 'none' }], { duration: 360 }));
  }
  play(row.querySelector('.dm-b-team'), [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: delay + 140 });
  flashTint(row, { tint: row.classList.contains('mine') || !team ? null : leagueUi(team.league).color, from: 0.2, duration: 900, delay: delay + 140 });
}

// The snake turns: a gold pill says the order flips for the next round.
function fxSnake(e){
  const host = document.querySelector('.dr-center') || document.querySelector('.dm-top');
  if(!host) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = floatPillHtml({ label: `Round ${e.round} · order flips` });
  const pill = wrap.firstElementChild;
  const lift = getComputedStyle(host).position === 'static';
  if(lift) host.classList.add('fx-host');
  host.appendChild(pill);
  play(pill, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120, easing: EASE_SPRING });
  const out = play(pill, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1500, fill: 'forwards' });
  const end = () => { pill.remove(); if(lift) host.classList.remove('fx-host'); };
  if(out) out.finished.then(end, end); else end();
}

// A roster slot fills: it pops in. When it's the league's last slot, a
// sheen in the league's color sweeps the row and the count (now green) pops.
function fxSlot(d, e){
  if(rosterOwner(d) !== d.me) return;
  const row = document.querySelector(`.dr-roster-row[data-league="${e.league}"]`);
  if(!row) return;
  pop(row.querySelector(`.dr-slots > :nth-child(${e.count})`), { from: 0.5 });
  if(e.count >= (d.s.config.caps[e.league] || 0)){
    sheen(row, { tint: leagueUi(e.league).color, delay: 200 });
    pop(row.querySelector('.dr-roster-n'), { scale: 1.25, delay: 400 });
  }
}

// The last pick is in: the board ripples corner to corner, dims for a
// moment, and the "Draft complete" card rises in. Once per device.
function fxDone(d, key){
  if(!once(`done:${key}`)) return;
  const ripple = [{ opacity: 0.25, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.4 }, { opacity: 1, transform: 'scale(1)' }];
  const rows = [...document.querySelectorAll('.dr-grid .dr-round')];
  rows.forEach((row, r) => row.querySelectorAll('.dr-cell').forEach((cell, c) => play(cell, ripple, { duration: 520, delay: (r + c) * 30 })));
  const phoneRows = [...document.querySelectorAll('#dm-board .dm-brow')];
  stagger(phoneRows, ripple, { step: 30, duration: 520 });
  const end = rows.length ? (rows.length + d.n) * 30 + 520 : phoneRows.length * 30 + 520;
  play(document.querySelector('.dr-grid'), [{ opacity: 1 }, { opacity: 0.5, offset: 0.3 }, { opacity: 0.5, offset: 0.7 }, { opacity: 1 }], { duration: 1400, delay: end - 400 });
  const card = document.querySelector('#dr-clock .dr-clock-card.done');
  if(card) stagger(card.querySelectorAll('.dr-eyebrow, .dr-done-title, .dr-clock-sub, .dr-download-btn'), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { step: 130, delay: end - 300, duration: 500 });
}

// ---- Clock ----

// The ring on your own clock. The real room's clock is soft, so at zero it
// holds 0:00 in red; a mock room picks for you there. In the last 8
// seconds it's red and beats once a second, and at zero the card nudges.
function updateHeroClock(d, ring, limit, left){
  const sec = Math.max(0, Math.ceil(left / 1000));
  const hurry = sec <= HURRY_SEC;
  setDraftClock(ring, { secondsLeft: sec, total: limit / 1000, hurry });
  ring.classList.toggle('beat', hurry && sec > 0 && d.running && fxOn());
  ui.lastClock = { sec, total: limit / 1000 };
  // Only right as it hits zero: opening the room already over time doesn't nudge.
  if(d.myTurn && left <= 0 && fx.nudged !== d.clockInfo.slot){
    fx.nudged = d.clockInfo.slot;
    if(left > -1000) nudge(ring.closest('.clock-hero'));
  }
}

function fmt(ms){
  const total = Math.ceil(Math.abs(ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Counts down to whenever the room will pick for them (a mock room's
// bot or timeout), else the soft clock. Auto-draft is left out: it picks
// within a second, and a timer racing to zero would only flash red.
function clockLimitMs(d){
  const owner = d.clockInfo && d.clockInfo.owner;
  return (owner && autoPickLimitMs({ ...d.s, autoDraft: [] }, owner, isMockRoom(draftStore.room))) || d.s.config.clockSeconds * 1000;
}

// Just what the clock needs, for the 4x-a-second tick: a full derive()
// recounts every roster each time.
function clockDerive(){
  const s = fullState();
  if(!s) return null;
  const clockInfo = onTheClock(s);
  const running = s.phase === 'draft' && s.clock.running;
  return { s, clockInfo, running, myTurn: !!clockInfo && clockInfo.owner === currentProfileId && running };
}

function updateClock(){
  if(document.hidden) return;
  const d = clockDerive();
  if(!d || d.s.phase !== 'draft') return;
  const limit = clockLimitMs(d);
  const left = limit - clockElapsedMs(d.s.clock, serverNow());
  const ring = document.querySelector('#dr-clock .clock-hero:not(.landed) .draft-clock');
  if(ring) updateHeroClock(d, ring, limit, left);
  const mini = document.querySelector('#dm-mini .clock-mini-time');
  if(mini){
    // Yours holds at 0:00 like the ring; the next drafter's runs over like the strip.
    const sec = Math.max(0, Math.ceil(left / 1000));
    const text = d.myTurn ? fmt(sec * 1000) : (left < 0 ? '+' : '') + fmt(left);
    if(mini.textContent !== text) mini.textContent = text;
    mini.classList.toggle('hurry', d.myTurn && sec <= HURRY_SEC);
  }
  const timer = document.getElementById('dr-timer');
  if(!timer) return;
  const over = left < 0;
  const text = (over ? '+' : '') + fmt(left);
  const cls = 'dr-timer' + (over ? ' over' : (left <= 15000 ? ' low' : ''));
  if(timer.textContent !== text) timer.textContent = text;
  if(timer.className !== cls) timer.className = cls;
  const bar = document.getElementById('dr-bar');
  if(bar) bar.style.width = `${Math.max(0, Math.min(100, (left / limit) * 100))}%`;
}

// ---- Actions (wired to window for the inline handlers) ----

async function run(action, from){
  const result = await sendDraftAction(from === undefined ? currentProfileId : from, action);
  if(!result.ok) toast(errorText(result));
  return result;
}

window.draftSetFilter = key => { ui.filter = key; ui.conf = ui.div = ui.menu = null; ui.showAll = false; ui.revealScope = true; scheduleRender(); };
// Choosing a different conference drops a division that isn't inside it.
window.draftSetConf = conf => {
  const d = derive();
  ui.conf = conf || null;
  if(ui.div && (!ui.conf || !d || !leagueDivs(ui.filter, d.s.pool, ui.conf).some(v => v.div === ui.div))) ui.div = null;
  ui.menu = null; ui.showAll = false; ui.revealScope = true;
  scheduleRender();
};
// A division always sets its conference too.
window.draftSetDiv = div => {
  const d = derive();
  const hit = div && d ? leagueDivs(ui.filter, d.s.pool).find(v => v.div === div) : null;
  ui.div = hit ? hit.div : null;
  if(hit) ui.conf = hit.conf;
  ui.menu = null; ui.showAll = false; ui.revealScope = true;
  scheduleRender();
};
// A row's group label: jump to that league, conference and division.
window.draftSetScope = (league, conf, div) => {
  ui.filter = league; ui.conf = conf || null; ui.div = div || null;
  ui.menu = null; ui.showAll = false; ui.revealScope = true;
  scheduleRender();
};
window.draftMenu = key => { ui.menu = key && ui.menu !== key ? key : null; scheduleRender(); };
window.draftSearch = value => { ui.search = value; ui.showAll = false; scheduleRender(); };
window.draftSetSort = key => {
  ui.sort = key === 'rank' ? 'rank' : 'az';
  ui.showAll = false;
  ui.menu = null;
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
window.draftQueueTop = id => {
  if(!draftStore.queue.includes(id)) return;
  saveDraftQueue([id].concat(draftStore.queue.filter(x => x !== id)));
};
window.draftQueueDrag = (event, id) => {
  ui.queueDrag = id;
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', id); } catch(e){}
  event.currentTarget.classList.add('dragging');
};
window.draftQueueOver = event => { if(ui.queueDrag){ event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } };
// Dropping on a card puts the dragged team in that card's place: above it
// when dragging up, below it when dragging down (so the last spot is reachable).
window.draftQueueDrop = (event, targetId) => {
  event.preventDefault();
  const from = ui.queueDrag;
  ui.queueDrag = null;
  if(!from || from === targetId) return;
  const q = draftStore.queue.slice();
  const at = q.indexOf(from), to = q.indexOf(targetId);
  if(at < 0 || to < 0) return;
  q.splice(at, 1);
  q.splice(to, 0, from);
  saveDraftQueue(q);
};
window.draftQueueDragEnd = () => {
  ui.queueDrag = null;
  document.querySelectorAll('.dr-q.dragging').forEach(el => el.classList.remove('dragging'));
};

document.addEventListener('keydown', event => {
  if(!active) return;
  if(event.key === 'Escape' && ui.menu){ ui.menu = null; scheduleRender(); return; }
  if(event.key === 'Escape' && ui.teamSheet){ window.draftCloseTeam(); return; }
  // Board cells are divs with role="button"; give them a real button's keys.
  if((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('.dr-cell[role="button"], .dm-brow[role="button"]')){
    event.preventDefault();
    event.target.click();
    return;
  }
  if(!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  const item = event.target.closest && event.target.closest('.dr-q[data-id]');
  if(!item) return;
  event.preventDefault();
  ui.queueFocus = item.dataset.id;
  window.draftMoveQueue(item.dataset.id, event.key === 'ArrowUp' ? -1 : 1);
});

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
  // Measure the tapped crest now: by the time the pick lands, the row is gone.
  const tile = [...document.querySelectorAll(`[data-team="${id}"] .dr-tile, .dr-q[data-id="${id}"] .dr-tile`)]
    .find(el => el.getBoundingClientRect().width > 0);
  const row = tile && tile.closest('[data-team]');
  const list = row && row.parentElement && row.parentElement.closest('[id]');
  fx.sent = {
    team: id, slot: d.clockInfo.slot, rect: tile ? tile.getBoundingClientRect() : null, ghost: tile ? tile.cloneNode(true) : null, at: Date.now(),
    row: row && list ? { rect: row.getBoundingClientRect(), ghost: row.cloneNode(true), list: list.id } : null
  };
  // A phone scrolled down to the list goes back up to the hero, so the
  // landing plays where you can see it. The crest still flies from your tap.
  const hero = !proxying && ui.shell === 'phone' && document.querySelector('#dr-clock .clock-hero');
  if(hero && hero.getBoundingClientRect().top < root().getBoundingClientRect().top){
    fx.sent.scrollUntil = performance.now() + scrollToClock();
  }
  const result = await run({ type: 'pick', team: id, slot: d.clockInfo.slot }, proxying ? null : undefined);
  ui.picking = false;
  if(result.ok && proxying) ui.proxySlot = null;
};

window.draftAddWriteIn = async league => {
  const name = ui.search.trim();
  const result = await run({ type: 'addWriteIn', league, name });
  if(result.ok){
    ui.conf = ui.div = null; ui.filter = league;
    ui.pendingSelect = name;
  } else if(result.error === 'exists' && result.detail){
    const twin = draftStore.pool.find(t => t.id === result.detail);
    if(twin){ ui.conf = ui.div = null; ui.filter = twin.league; ui.search = twin.name; syncSearchInput(); }
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
  ui.conf = ui.div = null; ui.filter = hit.league;
  ui.search = hit.name;
  syncSearchInput();
  scheduleRender();
}

window.draftRunLottery = () => run({ type: 'runLottery' }, null);
window.draftLiveOrder = () => run({ type: 'runLottery', live: true }, null);
// Loads the pool first if it can't cover the draft yet, in any room, so
// Start is the only button you need.
window.draftStart = async () => {
  const d = derive();
  if(d && poolShort(d.s) && !(await loadPool()).ok) return;
  run({ type: 'startDraft' }, null);
};
window.draftSetClock = value => run({ type: 'setConfig', clockSeconds: Number(value) }, null);
// Mine goes as me (no password needed); anyone else's as the commissioner.
window.draftToggleAuto = id => {
  const s = draftStore.state;
  if(!s) return;
  const on = !(s.autoDraft || []).includes(id);
  run({ type: 'setAutoDraft', drafter: id, on }, id === currentProfileId ? id : null)
    .then(r => { if(r.ok) toast(on ? (id === currentProfileId ? 'Auto-draft is on.' : `Auto-draft on for ${drafterName(id)}.`) : 'Auto-draft is off.'); });
};
window.draftSetBotSeconds = value => run({ type: 'setConfig', botSeconds: Number(value) }, null);
window.draftToggleBot = id => {
  const bots = draftStore.state.config.bots || [];
  run({ type: 'setConfig', bots: bots.includes(id) ? bots.filter(b => b !== id) : bots.concat(id) }, null);
};
window.draftSetBots = which => {
  const me = currentProfileId;
  run({ type: 'setConfig', bots: which === 'others' ? draftStore.state.config.drafters.filter(id => id !== me) : [] }, null);
};
window.draftLoadPool = async () => {
  if((await loadPool()).ok) toast('Team pool loaded.');
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

// The board as an .xlsx (Picks, Board, Rosters; see js/draft-sheets.js).
// Anyone once the draft is done; the commissioner any time, as a backup
// for finishing the draft outside the app.
window.draftDownload = async () => {
  const d = derive();
  if(!d || !d.s.order) return;
  const bytes = draftXlsx(d.s, { drafterName, leagueLabel: k => leagueUi(k).label, groupLabel: teamGroupLabel });
  const made = Object.keys(d.s.picks).length;
  const room = draftStore.room === 'main' ? '' : `-${draftStore.room}`;
  const name = `boxscore-draft-${NEXT_DRAFT_YEAR}${room}${d.s.phase === 'done' ? '' : `-after-${made}-picks`}.xlsx`;
  const file = new File([bytes], name, { type: XLSX_MIME });
  // On a phone, the share sheet (Save to Files, AirDrop, Messages): a plain
  // download from the installed iOS app opens a preview with nowhere to go.
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if(touch && navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e){ if(e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

window.draftCloseModal = () => { ui.modal = null; ui.trade = null; ui.editSlot = null; scheduleRender(); };
window.draftOpenReset = () => { ui.modal = 'reset'; scheduleRender(); };
window.draftOpenSettings = () => { ui.modal = 'settings'; scheduleRender(); };
// The shared Scoring sheet (js/scoring-sheet.js), on the league being browsed.
window.draftOpenScoring = () => openScoringSheet(ui.filter !== 'all' ? ui.filter : undefined);
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
    followCurrentPick('smooth');
  }, 260);
};

window.draftMobileTab = tab => { ui.mobileTab = tab; scheduleRender(); };

// ---- Roster tile tooltip ----
// One floating tooltip, positioned from the tile, so the roster column's
// own scrolling can't clip it. Hover shows it on desktop; a tap or click
// opens the team's sheet instead (the tile's own onclick), so it hides.

let tipEl = null, tipFor = null;

function showTip(tile){
  if(!tipEl){
    tipEl = document.createElement('div');
    tipEl.className = 'dr-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  tipFor = tile;
  tipEl.innerHTML = `<b>${esc(tile.dataset.tip)}</b><span>${esc(tile.dataset.tipSub || '')}</span>`;
  tipEl.classList.add('show');
  const r = tile.getBoundingClientRect();
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 8;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
}

function hideTip(){
  tipFor = null;
  if(tipEl) tipEl.classList.remove('show');
}

const tipTile = target => target && target.closest && target.closest('.dr-slot-team');
document.addEventListener('mouseover', e => {
  if(!active) return;
  const tile = tipTile(e.target);
  if(tile && tile !== tipFor) showTip(tile);
  else if(!tile && tipFor) hideTip();
});
// A tap also fires a synthetic mouseover just before the click, which would
// leave the tooltip up over the sheet the click opens.
document.addEventListener('click', () => { if(active && tipFor) hideTip(); });
document.addEventListener('focusin', e => { const tile = active && tipTile(e.target); if(tile) showTip(tile); });
document.addEventListener('focusout', e => { if(tipTile(e.target)) hideTip(); });
document.addEventListener('scroll', () => { if(tipFor) hideTip(); }, true);

// League tabs: scroll by most of a strip per arrow press, turn a vertical
// mouse wheel into sideways scrolling, and keep the arrows current.
window.draftTabsScroll = dir => {
  const strip = document.getElementById('dr-chips');
  if(strip) strip.scrollBy({ left: dir * Math.max(80, strip.clientWidth * 0.7), behavior: 'smooth' });
};
document.addEventListener('wheel', e => {
  const strip = e.target.closest && e.target.closest('.dr-ltabs');
  if(!strip || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || strip.scrollWidth <= strip.clientWidth) return;
  e.preventDefault();
  strip.scrollLeft += e.deltaY;
}, { passive: false });
document.addEventListener('scroll', e => { if(e.target.id === 'dr-chips') syncLeagueTabs(); }, true);
window.addEventListener('resize', () => syncLeagueTabs());

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
    fx.prev = null; fx.stale = undefined; fx.sent = null; fx.railStart = null;
    ui.landed = null;
    scheduleRender();
  } else {
    hideTip();
    // The sheet lives outside #view-draft, so it doesn't hide with it.
    ui.modal = null; ui.trade = null; ui.editSlot = null; ui.teamSheet = null;
    renderModal(null);
    renderTeamSheet(null);
    clearInterval(clockTimer);
    clearInterval(ui.revealTimer);
    clearTimeout(ui.landTimer);
    closeDraftConnection();
    if(unsubscribe){ unsubscribe(); unsubscribe = null; }
    ui.shell = null;
  }
}
