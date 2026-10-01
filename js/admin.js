/* ============================================================
   Password-gated Commissioner page: the one place the admin password is
   entered, with a Draft section and a Scoring section behind it.

   Reached via the Commissioner tile on the Settings page (or a
   bookmarked ?view=admin), and its back button returns there — see
   backToSettings in js/board.js. The live draft room's own sign-in
   links here too; once unlocked, the room signs its socket in with the
   saved password on its own (resumeCommissioner in js/draft-client.js),
   and Log out here signs the room out as well, since it reads the same
   saved password.

   Two layouts over the same state and writes: on a desktop window
   (DESK_MQ) a sidebar shell with Draft and one entry per league, each
   its own screen (the desk* functions below); under that, the phone
   column with a Draft/Scoring switch and league chips.

   Sports section: which sports the group shows and drafts, and how many
   picks each (js/sports.js, PUT /sports). Drafted sports are the next
   draft room's caps; scores-only ones show on every tab with nobody
   owning them. A sport the current class drafted keeps showing until
   the next draft, since it still scores.

   Draft section: status, read from the worker's GET /draft/status
   (no socket), a way into the room, and the live draft's start time
   (PUT /draft/schedule), which every drafter's Home counts down to. Before that, a draft time poll
   (js/draft-poll.js, PUT /draft/poll): two or three candidate times that Home asks every drafter
   about, with who can make each one listed here. Setting up the pool and clock,
   the lottery and the start all stay in the lobby, where everyone
   watches the lottery reveal.

   The password prompt here is a convenience gate so
   casual visitors don't land on an editing UI; the real protection is
   the Cloudflare Worker rejecting unauthenticated writes (see
   worker/rundown-proxy.js's isAuthorized). Reads (facts/adjustments)
   stay public everywhere else in the app — this page is just where the
   edit controls live now, consolidated across every league instead of
   scattered per-league Results chips and unsynced per-team checklists.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, TEAM_META, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import { loadAdminPassword, saveAdminPassword, clearAdminPassword, fetchAuthedJSON, putAuthedJSON, fetchJSON, formatDateShort, segmentedControlHtml, CHEVRON_LEFT_SVG, escapeHtml, draftOwnerName, updateUrlParam, withNote } from './utils.js';
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './api.js';
import { withGroupQuery, ACTIVE_GROUP, ACTIVE_GROUP_ID } from './group.js';
import { groupCaps, groupShown } from './groups.js';
import { SPORT_KEYS, SPORT_LABELS, MAX_SPORT_PICKS, MAX_SPORT_ROUNDS, sportsOf, sportsRounds, sportsCaps } from './sports.js';
import { rememberSports } from './group-sports.js';
import { DEFAULT_CAPS } from './draft-rules.js';
import { PGA_ACCENT } from './seasons/pga.js';
import { leagueFactRowHtml, currentLeagueAdjustments, setTeamAdjustment, setTeamAdjustments, getLeagueRuleTeams, addLeagueFact, removeLeagueFact, ruleAutoNote, ruleDataPending, leagueDrafterPoints } from './league-facts.js';
import { LEAGUE_FULL_LABELS } from './board.js';
import { obLeagueColor } from './overall.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { isLeagueLocked, lockedAtFor, forceLockLeague, unlockLeague } from './season-lock.js';
import { NEXT_DRAFT_LABEL } from './seasons/index.js';
import { setKnownDraftStatus, scheduleDateLabel, scheduleTimeLabel, toLocalInputValue } from './draft-schedule.js';
import { POLL_MAX_OPTIONS, parsePollOptions, pollTally } from './draft-poll.js';

// The live draft room. Mock rooms are self-serve and need no password.
const LIVE_DRAFT_ROOM = 'main';

// The system admin page (boxscore.space/admin, js/system-admin.js) opens
// this page with a signed commissioner token in the URL fragment, which
// never reaches a server. It's saved where a typed password would be (the
// worker accepts either, see worker/commissioner-token.js), then dropped
// from the address bar.
(function takeCommissionerToken(){
  try {
    const m = window.location.hash.match(/^#commissioner=([\w.-]+)$/);
    if(!m) return;
    saveAdminPassword(m[1]);
    history.replaceState(history.state, '', window.location.pathname + window.location.search);
  } catch (e){}
})();

let unlocked = false;
let verifying = false;
let errorMsg = '';
let autoVerifyTried = false;

// Desktop windows get the sidebar layout; phones keep the one column.
const DESK_MQ = window.matchMedia('(min-width: 900px)');
DESK_MQ.addEventListener('change', () => renderAdminPage());
const isDesk = () => DESK_MQ.matches;

// What's showing: 'draft', 'sports' or a league key. One league at a time — every
// league's rules + team adjustments stacked together is a lot to render
// at once (each rankAuto rule reads a live standings table). Kept for
// the session, so coming back from the draft room lands where you left.
// lastLeague is the league the phone layout's Scoring switch returns to.
let selected = 'draft';
// Only leagues with rules: one shown without being drafted has nothing
// to mark or adjust.
const SCORING_LEAGUES = LEAGUES.filter(l => LEAGUE_SCORING[l.key]);
let lastLeague = SCORING_LEAGUES[0].key;

// ?view=admin&screen=<league|sports> opens on that screen (Draft has no param),
// so a reload or a shared link keeps the place. js/board.js drops the
// param when another view opens.
const isScreen = key => key === 'draft' || key === 'sports' || SCORING_LEAGUES.some(l => l.key === key);
try {
  const screen = new URLSearchParams(window.location.search).get('screen');
  if(screen === 'sports') selected = screen;
  else if(screen && screen !== 'draft' && isScreen(screen)) selected = lastLeague = screen;
} catch (e){}
const syncScreenParam = () => updateUrlParam('screen', selected === 'draft' ? null : selected);

// Desktop point adjustments: rows being edited (kept across re-renders,
// such as the facts GET landing, until saved), the filter text and the
// "Adjusted only" toggle. The last two reset when the league changes.
let adjEdits = {};
let adjFilter = '';
let adjOnly = false;

// Set when the desktop main pane should start at the top on the next
// render (a different screen was picked).
let resetDeskScroll = false;

// The live room's GET /draft/status, refetched each time the Draft
// section is shown. null until the first answer; draftStatusError when
// the worker can't be reached (or predates the route).
let draftStatus = null;
let draftStatusError = false;
let draftStatusLoading = false;

window.selectAdmin = function(key){
  if(key === selected || !isScreen(key)) return;
  selected = key;
  syncScreenParam();
  if(key === 'draft'){
    loadDraftStatus();
  } else if(key === 'sports'){
    loadSportsSetting();
    loadDraftStatus();
  } else {
    lastLeague = key;
    adjFilter = '';
    adjOnly = false;
  }
  resetDeskScroll = true;
  renderAdminPage();
};

// The phone layout's league chips and Draft/Scoring switch.
window.setAdminFilter = window.selectAdmin;
window.setAdminSection = function(key){
  window.selectAdmin(key === 'scoring' ? lastLeague : key);
};

async function loadDraftStatus(){
  if(draftStatusLoading) return;
  draftStatusLoading = true;
  // fetchJSON resolves null on any failure (offline, timeout, non-2xx).
  const data = await fetchJSON(withGroupQuery(`${chatWorkerBase()}/draft/status?room=${LIVE_DRAFT_ROOM}`));
  if(data){
    draftStatus = data;
    setKnownDraftStatus(data);
  }
  draftStatusError = !data;
  draftStatusLoading = false;
  renderAdminPage();
}
window.loadAdminDraftStatus = loadDraftStatus;

let scheduleSaving = false;
let scheduleError = '';
let pollSaving = false;
let pollError = '';

// The button into the live room and what you can do once there.
function draftRoomLink(st){
  return {
    cta: st.phase === 'draft' ? 'Open draft room' : (st.phase === 'done' ? 'Open final board' : 'Open draft lobby'),
    note: st.phase === 'lobby'
      ? "Load the team pool, set the pick clock, run the lottery and start the draft from the lobby. You're signed in there as commissioner."
      : "You're signed in there as commissioner: pause, undo, trade, change picks and download the board from the bar under the header."
  };
}

// A commissioner write to the live room (`what` is 'schedule' or 'poll').
// The room answers with its new status; resolves to an error message, or
// '' when it saved.
// `note` goes in the system admin page's log (withNote in js/utils.js).
async function putDraftRoom(what, body, note){
  const { ok, status, data } = await putAuthedJSON(
    withNote(withGroupQuery(`${chatWorkerBase()}/draft/${what}?room=${LIVE_DRAFT_ROOM}`), note),
    loadAdminPassword(),
    body
  );
  if(!ok || !data) return status === 401 ? 'Not signed in as commissioner' : "Couldn't save — try again";
  draftStatus = data;
  setKnownDraftStatus(data);
  return '';
}

// `done` is the desktop toast once it saved.
async function saveDraftSchedule(scheduledAt, done){
  if(scheduleSaving) return;
  scheduleSaving = true;
  scheduleError = '';
  renderAdminPage();
  scheduleError = await putDraftRoom('schedule', { scheduledAt }, scheduledAt ? `Draft time set to ${whenLabel(scheduledAt)}` : 'Draft time cleared');
  scheduleSaving = false;
  renderAdminPage();
  if(!scheduleError) toast(done);
}

async function saveDraftPoll(options, done){
  if(pollSaving) return;
  pollSaving = true;
  pollError = '';
  renderAdminPage();
  pollError = await putDraftRoom('poll', { options }, options ? `Draft time poll: ${options.map(whenLabel).join(', ')}` : 'Draft time poll removed');
  pollSaving = false;
  renderAdminPage();
  if(!pollError) toast(done);
}

window.saveAdminDraftPoll = function(){
  const times = [];
  for(let i = 0; i < POLL_MAX_OPTIONS; i++){
    const input = document.getElementById(`admin-poll-when-${i}`);
    if(input && input.value) times.push(new Date(input.value).getTime());
  }
  const options = parsePollOptions(times);
  if(!options){
    pollError = 'Enter two or three different times';
    renderAdminPage();
    return;
  }
  saveDraftPoll(options, draftStatus && draftStatus.poll ? 'Poll times saved.' : 'Poll is open on everyone’s Home.');
};

window.removeAdminDraftPoll = function(){
  if(window.confirm('Remove the poll and everyone’s answers?')) saveDraftPoll(null, 'Poll removed.');
};

// Make one of the poll's times the draft time. That closes the poll on
// Home; the answers stay here.
window.useAdminPollTime = function(at){
  saveDraftSchedule(at, `Draft time set to ${whenLabel(at)}. The poll closes on Home.`);
};

window.saveAdminDraftSchedule = function(){
  const input = document.getElementById('admin-draft-when');
  const at = input && input.value ? new Date(input.value).getTime() : NaN;
  if(!Number.isFinite(at)){
    scheduleError = 'Pick a date and time first';
    renderAdminPage();
    return;
  }
  saveDraftSchedule(at, 'Draft time saved. Everyone with alerts on was notified.');
};

window.clearAdminDraftSchedule = function(){
  saveDraftSchedule(null, 'Draft time cleared.');
};

function isActive(){
  const view = document.getElementById('view-admin');
  return !!view && view.classList.contains('active');
}

export async function verifyAdminPassword(password){
  if(!password || verifying) return;
  verifying = true;
  errorMsg = '';
  renderAdminPage();
  const { ok, status } = await fetchAuthedJSON(withGroupQuery(`${DASHBOARD_WORKER_BASE}/admin/verify`), password);
  verifying = false;
  if(ok){
    saveAdminPassword(password);
    unlocked = true;
    loadDraftStatus();
  } else {
    errorMsg = status === 401 ? 'Incorrect password' : 'Could not reach the server — try again';
  }
  renderAdminPage();
}

// window.* entry points the inline onclick/onkeydown handlers below call.
window.submitAdminPassword = function(){
  const input = document.getElementById('admin-password-input');
  if(input) verifyAdminPassword(input.value);
};

window.logoutAdmin = function(){
  clearAdminPassword();
  unlocked = false;
  errorMsg = '';
  renderAdminPage();
};

window.saveTeamAdjustment = function(teamKey){
  const ptsEl = document.getElementById(`admin-adj-pts-${teamKey}`);
  const noteEl = document.getElementById(`admin-adj-note-${teamKey}`);
  const pts = ptsEl ? (parseInt(ptsEl.value, 10) || 0) : 0;
  const note = noteEl ? noteEl.value.trim() : '';
  setTeamAdjustment(teamKey, pts, note);
};

function gateHtml(){
  const backHtml = `<button class="ob-back" onclick="backToSettings()">${CHEVRON_LEFT_SVG}Settings</button>`;
  if(verifying){
    return `${backHtml}<div class="admin-gate"><div class="admin-gate-title">Checking password…</div></div>`;
  }
  return `
    ${backHtml}
    <div class="admin-gate">
      <div class="admin-gate-title">Enter the commissioner password</div>
      <input type="password" id="admin-password-input" class="admin-gate-input" placeholder="Password" autocomplete="off" onkeydown="if(event.key==='Enter') submitAdminPassword();">
      ${errorMsg ? `<div class="admin-gate-error">${errorMsg}</div>` : ''}
      <button class="admin-gate-btn" onclick="submitAdminPassword()">Unlock</button>
    </div>
  `;
}

function adjustmentRowHtml(teamKey, adjustments){
  const meta = TEAM_META[teamKey];
  const drafter = DRAFT_TEAMS.find(d => d.id === meta.draftTeamId);
  const current = adjustments[teamKey] || { pts: 0, note: '' };
  return `
    <div class="admin-adj-row">
      <div class="admin-adj-team">
        <span class="fact-chip-badge" style="${meta.badgeStyle}">${meta.badgeText}</span>
        ${meta.name} <span class="fact-chip-owner">${drafter.name}</span>
      </div>
      <input type="number" class="admin-adj-pts" id="admin-adj-pts-${teamKey}" value="${current.pts || ''}" placeholder="0">
      <input type="text" class="admin-adj-note" id="admin-adj-note-${teamKey}" value="${escapeHtml(current.note || '')}" placeholder="Why?">
      <button class="admin-adj-save" onclick="saveTeamAdjustment('${teamKey}')">Save</button>
    </div>
  `;
}

// Regular-season lock status (js/season-lock.js) — only shown for a
// league that actually has rankAuto rules to freeze (every league does
// as of this writing, but a future league might not yet). Not-yet-locked
// offers "Force lock" as the manual safety valve for whatever the
// automatic ESPN-date detection gets wrong; locked offers "Unlock" as
// the safety valve for THAT button (or the automatic check) firing by
// mistake — see that file's header comment for both. Same reuse-
// existing-styling instinct as everywhere else on this page:
// .prior-season-note for the banner shape, .admin-adj-save for the
// buttons.
function lockStatusHtml(league){
  if(!league.teams || !LEAGUE_SCORING[league.key].rules.some(r => r.rankAuto)) return '';
  const locked = isLeagueLocked(league.key);
  if(locked){
    const at = lockedAtFor(league.key);
    return `
      <div class="prior-season-note">
        🔒 Regular season locked in${at ? ` — ${formatDateShort(at)}` : ''}. Standings-based rules below are frozen, not live.
        <button class="admin-adj-save end" onclick="unlockLeague('${league.key}')">Unlock</button>
      </div>
    `;
  }
  return `
    <div class="prior-season-note">
      Standings-based rules below are still live — they'll lock automatically once ESPN confirms the regular season is over.
      <button class="admin-adj-save end" onclick="forceLockLeague('${league.key}')">Force Lock</button>
    </div>
  `;
}

function leagueSectionHtml(league){
  const scoring = LEAGUE_SCORING[league.key];
  if(!scoring) return '';
  const rulesHtml = scoring.rules.map(r => leagueFactRowHtml(league, r)).join('');
  const adjustments = currentLeagueAdjustments(league.key);
  // favoriteOnly teams (js/data.js) have no owner and never score.
  const adjRowsHtml = league.teams.filter(teamKey => !TEAM_META[teamKey].favoriteOnly).map(teamKey => adjustmentRowHtml(teamKey, adjustments)).join('');

  return `
    <div class="admin-league" style="border-top-color: ${scoring.accent};">
      <h3 class="admin-league-title">${LEAGUE_FULL_LABELS[league.key] || scoring.name}</h3>
      ${lockStatusHtml(league)}
      <div class="modal-section-title">Scoring rules</div>
      <div class="league-facts-list">${rulesHtml}</div>
      <div class="modal-section-title spaced">Point adjustments</div>
      <div class="admin-adj-list">${adjRowsHtml}</div>
    </div>
  `;
}

function filterChipsHtml(){
  const chipsHtml = SCORING_LEAGUES.map(l => {
    const label = FILTER_CHIP_LABELS[l.key] || l.label;
    return `<div class="filter-chip ${l.key === lastLeague ? 'active' : ''}" onclick="setAdminFilter('${l.key}')">${label}</div>`;
  }).join('');
  return `<div class="standings-filter-row"><div class="filter-chips">${chipsHtml}</div></div>`;
}

// ---- Draft section ----

function draftStatusRowHtml(label, value, state){
  return `<div class="admin-status-row"><span class="admin-status-label">${label}</span><span class="admin-status-value"${state ? ` data-state="${state}"` : ''}>${value}</span></div>`;
}

function draftSectionHtml(){
  const title = `The ${NEXT_DRAFT_LABEL} Draft`;
  const st = draftStatus;
  if(!st){
    const body = draftStatusError
      ? `<div class="admin-status-note">Couldn't reach the draft room.</div>
         <button class="admin-adj-save" onclick="loadAdminDraftStatus()">Try again</button>`
      : '<div class="admin-status-note">Checking the draft room…</div>';
    return `<div class="admin-league"><h3 class="admin-league-title">${title}</h3>${body}</div>`;
  }

  let phase, phaseState;
  if(st.phase === 'draft'){
    const where = st.slot === null ? '' : ` · Round ${Math.floor(st.slot / st.drafters) + 1}, pick ${st.slot + 1} of ${st.total}`;
    phase = `${st.running ? 'Live' : 'Paused'}${where}`;
    phaseState = st.running ? 'live' : 'warn';
  } else if(st.phase === 'done'){
    phase = 'Complete';
    phaseState = 'ok';
  } else {
    phase = 'In the lobby';
  }

  // ordered/poolSize are newer than the route itself: an older worker
  // leaves them out, and those rows just don't show.
  const rows = [draftStatusRowHtml('Status', phase, phaseState)];
  if(typeof st.poolSize === 'number'){
    rows.push(draftStatusRowHtml('Team pool', st.poolSize ? `${st.poolSize} teams loaded` : 'Not loaded', st.poolSize ? 'ok' : 'warn'));
  }
  if(typeof st.ordered === 'boolean'){
    rows.push(draftStatusRowHtml('Lottery', st.ordered ? 'Order locked' : 'Not run', st.ordered ? 'ok' : 'warn'));
  }
  rows.push(draftStatusRowHtml('Drafters', `${st.drafters} · ${st.total} picks`));
  // An older worker has no scheduledAt at all; leave the row out.
  if('scheduledAt' in st){
    rows.push(draftStatusRowHtml('Scheduled', st.scheduledAt
      ? `${scheduleDateLabel(st.scheduledAt)} · ${scheduleTimeLabel(st.scheduledAt)}`
      : 'Not set', st.scheduledAt ? 'ok' : 'warn'));
  }

  const { cta, note } = draftRoomLink(st);

  return `
    <div class="admin-league">
      <h3 class="admin-league-title">${title}</h3>
      <div class="admin-status">${rows.join('')}</div>
      <button class="admin-gate-btn admin-draft-cta" onclick="goToDraftRoom('${LIVE_DRAFT_ROOM}')">${cta}</button>
      <div class="admin-status-note">${note}</div>
      ${'poll' in st && st.phase !== 'draft' ? pollEditorHtml(st.poll, st.scheduledAt) : ''}
      ${'scheduledAt' in st && st.phase !== 'draft' ? scheduleEditorHtml(st.scheduledAt) : ''}
    </div>
  `;
}

// Who can make each of the poll's times. Unclaimed roster spots can't
// answer, so they aren't listed as waiting.
function pollResultsHtml(poll, scheduledAt){
  const roster = DRAFT_TEAMS.filter(d => !d.open);
  const tally = pollTally(poll, roster.map(d => d.id));
  const names = ids => ids.map(id => escapeHtml(roster.find(d => d.id === id).name)).join(', ');
  const most = Math.max(...tally.options.map(o => o.voters.length));
  const rowHtml = (name, ids, side) => `
    <div class="admin-status-row admin-poll-row">
      <span class="admin-status-label">
        <span class="admin-poll-name">${name}</span>
        ${ids.length ? `<span class="admin-poll-who">${names(ids)}</span>` : ''}
      </span>
      <span class="admin-poll-side">${side}</span>
    </div>`;
  const optionRows = tally.options.map(o => rowHtml(
    `${scheduleDateLabel(o.at)} · ${scheduleTimeLabel(o.at)}`,
    o.voters,
    `<span class="admin-status-value"${most && o.voters.length === most ? ' data-state="ok"' : ''}>${o.voters.length} of ${roster.length}</span>
     ${o.at === scheduledAt
       ? '<span class="admin-status-value" data-state="ok">Set</span>'
       : `<button class="admin-adj-save" onclick="useAdminPollTime(${o.at})"${scheduleSaving ? ' disabled' : ''}>Use</button>`}`
  )).join('');
  const count = ids => `<span class="admin-status-value">${ids.length}</span>`;
  return `
    <div class="admin-status">
      ${optionRows}
      ${tally.none.length ? rowHtml('None of these work', tally.none, count(tally.none)) : ''}
      ${tally.waiting.length ? rowHtml('Haven’t answered', tally.waiting, count(tally.waiting)) : ''}
    </div>`;
}

// Two or three candidate times for Home to ask everyone about, before
// the real one is set below.
function pollEditorHtml(poll, scheduledAt){
  const inputs = [];
  for(let i = 0; i < POLL_MAX_OPTIONS; i++){
    const at = poll && poll.options[i];
    inputs.push(`<input type="datetime-local" id="admin-poll-when-${i}" class="admin-gate-input" aria-label="Option ${i + 1}" value="${at ? toLocalInputValue(at) : ''}">`);
  }
  let note = 'Offer two or three times. Home asks every drafter which ones they can make, until you set the draft time.';
  if(poll){
    note = scheduledAt
      ? 'A draft time is set, so Home shows that instead of the poll. Clear it below to reopen voting.'
      : 'Open on everyone’s Home. Use sets that time as the draft time and closes the poll. Changing a time drops the answers that only named it.';
  }
  return `
    <div class="modal-section-title spaced">Draft time poll</div>
    ${poll ? pollResultsHtml(poll, scheduledAt) : ''}
    <div class="admin-schedule${poll ? ' spaced' : ''}">
      ${inputs.join('')}
      <div class="admin-schedule-actions">
        <button class="admin-adj-save" onclick="saveAdminDraftPoll()"${pollSaving ? ' disabled' : ''}>${pollSaving ? 'Saving…' : (poll ? 'Save times' : 'Start poll')}</button>
        ${poll ? `<button class="admin-adj-save" onclick="removeAdminDraftPoll()"${pollSaving ? ' disabled' : ''}>Remove poll</button>` : ''}
      </div>
    </div>
    ${pollError ? `<div class="admin-gate-error">${pollError}</div>` : ''}
    <div class="admin-status-note">${note}</div>
  `;
}

// The start time everyone's Home counts down to. Entered in this
// device's time zone; each drafter sees it in their own.
function scheduleEditorHtml(scheduledAt){
  return `
    <div class="modal-section-title spaced">Draft time</div>
    <div class="admin-schedule">
      <input type="datetime-local" id="admin-draft-when" class="admin-gate-input" value="${scheduledAt ? toLocalInputValue(scheduledAt) : ''}">
      <div class="admin-schedule-actions">
        <button class="admin-adj-save" onclick="saveAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>${scheduleSaving ? 'Saving…' : 'Save'}</button>
        ${scheduledAt ? `<button class="admin-adj-save" onclick="clearAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>Clear</button>` : ''}
      </div>
    </div>
    ${scheduleError ? `<div class="admin-gate-error">${scheduleError}</div>` : ''}
    <div class="admin-status-note">Shows on everyone's Home with a countdown until the draft starts, and everyone with alerts on gets a notification when you set or change it. Times are in your time zone; each drafter sees their own.</div>
  `;
}

// ============================================================
// Sports: which sports the group shows and drafts (js/sports.js).
// ============================================================

// The saved setting ({ <league>: 0 | n }), from GET /sports each time the
// screen opens, and the edit in progress. Until the fetch lands, what
// this device booted with (js/group-sports.js), which is what the app
// shows.
const bootSports = () => sportsOf(groupCaps(ACTIVE_GROUP_ID) || DEFAULT_CAPS, groupShown(ACTIVE_GROUP_ID));
let sportsSaved = bootSports();
let sportsEdit = null;
let sportsLoading = false;
let sportsSaving = false;
let sportsError = '';
let sportsJustSaved = false;  // the phone layout's "Saved" (it has no toast)
// Picks to go back to when a sport is switched off Draft and on again.
const lastPicks = {};

// Sports the class on screen was drafted with: they still score, so they
// show until the next draft whatever this says.
const CLASS_DRAFTED = PRE_DRAFT ? [] : LEAGUES.filter(l => LEAGUE_SCORING[l.key]).map(l => l.key);

// The sidebar's league colors (the Points tab's), and golf's own.
const sportAccent = key => key === 'pga' ? PGA_ACCENT : obLeagueColor(key);
const sportsNow = () => sportsEdit || sportsSaved;
const shownKeys = sports => SPORT_KEYS.filter(k => sports[k] === 0);
const sportsKey = sports => SPORT_KEYS.filter(k => k in sports).map(k => `${k}:${sports[k]}`).join();
const sportsDirty = () => !!sportsEdit && sportsKey(sportsEdit) !== sportsKey(sportsSaved);

async function loadSportsSetting(){
  if(sportsLoading) return;
  sportsLoading = true;
  const data = await fetchJSON(withGroupQuery(`${chatWorkerBase()}/sports`));
  sportsLoading = false;
  if(data && 'sports' in data) sportsSaved = data.sports || bootSports();
  if(isActive() && selected === 'sports') renderAdminPage();
}

// 'off' | 'scores' | 'draft' for one sport.
window.setAdminSport = function(key, mode){
  const sports = { ...sportsNow() };
  if(sports[key] > 0) lastPicks[key] = sports[key];
  if(mode === 'off') delete sports[key];
  else if(mode === 'scores') sports[key] = 0;
  else if(!(sports[key] > 0)) sports[key] = lastPicks[key] || DEFAULT_CAPS[key] || 3;
  sportsEdit = sports;
  sportsError = '';
  sportsJustSaved = false;
  renderAdminPage();
};

window.stepAdminSportPicks = function(key, delta){
  const sports = { ...sportsNow() };
  const n = Math.min(MAX_SPORT_PICKS, Math.max(1, (sports[key] || 0) + delta));
  if(n === sports[key]) return;
  sports[key] = n;
  sportsEdit = sports;
  sportsError = '';
  sportsJustSaved = false;
  renderAdminPage();
};

window.resetAdminSports = function(){
  sportsEdit = null;
  sportsError = '';
  renderAdminPage();
};

window.saveAdminSports = async function(){
  if(sportsSaving || !sportsEdit) return;
  const sports = {};
  SPORT_KEYS.forEach(k => { if(k in sportsEdit) sports[k] = sportsEdit[k]; });
  if(!sportsCaps(sports)){
    sportsError = 'Draft at least one sport';
    renderAdminPage();
    return;
  }
  if(sportsRounds(sports) > MAX_SPORT_ROUNDS){
    sportsError = `That's more than ${MAX_SPORT_ROUNDS} picks each. Take some away first.`;
    renderAdminPage();
    return;
  }
  sportsSaving = true;
  sportsError = '';
  renderAdminPage();
  const { ok, status, data } = await putAuthedJSON(withGroupQuery(`${chatWorkerBase()}/sports`), loadAdminPassword(), { sports });
  sportsSaving = false;
  if(ok && data && data.sports){
    sportsSaved = data.sports;
    sportsEdit = null;
    sportsJustSaved = true;
    rememberSports(ACTIVE_GROUP_ID, data.sports);
    loadDraftStatus();
    toast('Sports saved. Everyone sees the change the next time they open the app.');
  } else {
    sportsError = status === 401 ? 'Not signed in as commissioner' : "Couldn't save. Try again.";
  }
  renderAdminPage();
};

function sportsNavSub(){
  const sports = sportsSaved;
  const drafted = SPORT_KEYS.filter(k => sports[k] > 0).length;
  const scores = shownKeys(sports).length;
  return [`${drafted} drafted`, scores ? `${scores} scores only` : ''].filter(Boolean).join(' · ');
}

// When a change to the drafted sports reaches the draft room.
function sportsDraftNote(){
  const st = draftStatus;
  if(!st) return '';
  if(st.phase === 'lobby') return 'The draft lobby picks up drafted sports and picks as soon as you save.';
  if(st.phase === 'draft') return 'A draft is under way, so drafted sports and picks apply to the next one.';
  return 'Drafted sports and picks apply to the next draft, once the draft room is reset to the lobby.';
}

function sportRowHtml(key){
  const sports = sportsNow();
  const n = sports[key];
  const mode = n > 0 ? 'draft' : n === 0 ? 'scores' : 'off';
  const drafted = CLASS_DRAFTED.includes(key);
  let note = '';
  if(drafted && mode !== 'draft') note = 'Drafted this season, so it keeps showing until the next draft';
  else if(mode === 'scores') note = 'Scores and standings, nobody drafts it';
  const seg = segmentedControlHtml(
    [{ key: 'off', label: 'Off' }, { key: 'scores', label: 'Scores' }, { key: 'draft', label: 'Draft' }],
    mode,
    `(m=>setAdminSport('${key}',m))`
  );
  const stepper = mode === 'draft' ? `
    <span class="admin-sports-stepper" aria-label="Picks each">
      <button type="button" onclick="stepAdminSportPicks('${key}', -1)"${n <= 1 ? ' disabled' : ''} aria-label="Fewer picks">−</button>
      <span class="admin-sports-picks">${n}<span> each</span></span>
      <button type="button" onclick="stepAdminSportPicks('${key}', 1)"${n >= MAX_SPORT_PICKS ? ' disabled' : ''} aria-label="More picks">+</button>
    </span>` : '<span class="admin-sports-stepper admin-sports-stepper-empty"></span>';
  return `
    <div class="admin-sports-row${mode === 'off' ? ' off' : ''}">
      <span class="admin-sports-name">
        <span class="admin-desk-swatch" style="background:${sportAccent(key)};"></span>
        <span class="admin-sports-text">
          <span class="admin-sports-label">${SPORT_LABELS[key]}</span>
          ${note ? `<span class="admin-sports-note">${note}</span>` : ''}
        </span>
      </span>
      <span class="admin-sports-controls">
        <span class="admin-sports-seg">${seg}</span>
        ${stepper}
      </span>
    </div>`;
}

function sportsSummary(){
  const sports = sportsNow();
  const drafted = SPORT_KEYS.filter(k => sports[k] > 0).length;
  const rounds = sportsRounds(sports);
  const scores = shownKeys(sports).length;
  const drafters = DRAFT_TEAMS.length;
  return [
    `${drafted} drafted`,
    `${rounds} picks each`,
    `${rounds * drafters} in all`,
    scores ? `${scores} scores only` : ''
  ].filter(Boolean).join(' · ');
}

function sportsActionsHtml(desk){
  const dirty = sportsDirty();
  const cls = desk ? 'admin-desk-btn' : 'admin-adj-save';
  return `
    <div class="admin-sports-foot">
      <span class="admin-sports-summary">${sportsSummary()}${!desk && sportsJustSaved && !dirty ? ' · <span class="admin-sports-saved">Saved</span>' : ''}</span>
      <span class="admin-desk-btns">
        ${dirty ? `<button type="button" class="${cls}${desk ? ' outline' : ''}" onclick="resetAdminSports()"${sportsSaving ? ' disabled' : ''}>Reset</button>` : ''}
        <button type="button" class="${cls}${desk ? ' solid' : ''}" onclick="saveAdminSports()"${!dirty || sportsSaving ? ' disabled' : ''}>${sportsSaving ? 'Saving…' : 'Save'}</button>
      </span>
    </div>
    ${sportsError ? `<div class="admin-gate-error">${sportsError}</div>` : ''}`;
}

const SPORTS_LEDE = 'Draft a sport and everyone picks teams in it. Scores shows its games and standings on every tab with nobody owning a team, so anyone can follow it. Off hides it.';

function sportsSectionHtml(){
  return `
    <div class="admin-league">
      <h3 class="admin-league-title">Sports</h3>
      <div class="admin-status-note" style="margin-top: 0;">${SPORTS_LEDE}</div>
      <div class="admin-sports-list">${SPORT_KEYS.map(sportRowHtml).join('')}</div>
      ${sportsActionsHtml(false)}
      <div class="admin-status-note">${[sportsDraftNote(), 'Everyone sees shown sports from the next time they open the app.'].filter(Boolean).join(' ')}</div>
    </div>`;
}

function deskSportsHtml(){
  return `
    <div class="admin-desk-head">
      <div class="admin-desk-titles">
        <div class="admin-desk-eyebrow">Setup</div>
        <h1>Sports</h1>
        <div class="admin-desk-lede">${SPORTS_LEDE}</div>
      </div>
    </div>
    <section class="admin-desk-section">
      ${deskLabelRow(escapeHtml(ACTIVE_GROUP.name), sportsDirty() ? 'Unsaved changes' : '')}
      <div class="admin-desk-card admin-sports-card">
        <div class="admin-sports-list">${SPORT_KEYS.map(sportRowHtml).join('')}</div>
        ${sportsActionsHtml(true)}
      </div>
      <span class="admin-desk-note">${[sportsDraftNote(), 'Everyone sees shown sports from the next time they open the app.'].filter(Boolean).join(' ')}</span>
    </section>`;
}

function unlockedHtml(){
  const shownLeague = SCORING_LEAGUES.find(l => l.key === lastLeague) || SCORING_LEAGUES[0];
  const body = selected === 'draft' ? draftSectionHtml()
    : selected === 'sports' ? sportsSectionHtml()
    : `${filterChipsHtml()}${leagueSectionHtml(shownLeague)}`;
  const section = selected === 'draft' || selected === 'sports' ? selected : 'scoring';
  return `
    <div class="admin-toolbar">
      <button class="ob-back" onclick="backToSettings()">${CHEVRON_LEFT_SVG}Settings</button>
      <button class="admin-logout" onclick="logoutAdmin()">Log out</button>
    </div>
    ${segmentedControlHtml([{ key: 'draft', label: 'Draft' }, { key: 'sports', label: 'Sports' }, { key: 'scoring', label: 'Scoring' }], section, 'setAdminSection')}
    ${body}
  `;
}

// ============================================================
// Desktop layout: a sidebar (Draft, then one entry per league) beside
// one screen at a time. Same state and writes as the phone column above.
// ============================================================

const whenLabel = at => `${scheduleDateLabel(at)} · ${scheduleTimeLabel(at)}`;
const signed = n => n > 0 ? `+${n}` : (n < 0 ? `−${Math.abs(n)}` : '0');
const signState = n => n > 0 ? 'pos' : (n < 0 ? 'neg' : 'zero');
const leagueChip = league => FILTER_CHIP_LABELS[league.key] || league.label;
const leagueName = league => LEAGUE_FULL_LABELS[league.key] || league.label;
// Drafted teams only: favoriteOnly teams (js/data.js) have no owner and
// never score, so they're never marked or adjusted.
const draftedTeams = league => league.teams.filter(teamKey => !TEAM_META[teamKey].favoriteOnly);
const manualRules = league => LEAGUE_SCORING[league.key].rules.filter(r => !r.rankAuto);
const markedCount = league => manualRules(league).reduce((n, r) => n + (getLeagueRuleTeams(league.key, r) || []).length, 0);
const hasAutoRules = league => LEAGUE_SCORING[league.key].rules.some(r => r.rankAuto);

// A confirmation in the corner after each write, desktop only. Lives on
// <body>, outside #admin-content, so a re-render doesn't cut it short.
let toastTimer = null;
function toast(msg, isError){
  if(!msg || !isDesk()) return;
  let el = document.getElementById('admin-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'admin-toast';
    el.className = 'admin-toast';
    el.setAttribute('role', 'status');
    el.addEventListener('click', () => { el.hidden = true; });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// A write that saved locally but didn't reach the shared store.
function toastIfUnsynced(synced){
  Promise.resolve(synced).then(ok => {
    if(ok === false) toast("Saved on this device only: it didn't sync. Check you're still signed in.", true);
  });
}

window.adminMarkTeam = function(leagueKey, ruleIndex, teamKey){
  const rule = LEAGUE_SCORING[leagueKey].rules[ruleIndex];
  if(!rule || !teamKey) return;
  const synced = addLeagueFact(leagueKey, rule.label, teamKey);
  toast(`${TEAM_META[teamKey].name} marked: ${rule.label}. ${draftOwnerName(teamKey)} ${signed(rule.pts)}.`);
  toastIfUnsynced(synced);
};

window.adminUnmarkTeam = function(leagueKey, ruleIndex, teamKey){
  const rule = LEAGUE_SCORING[leagueKey].rules[ruleIndex];
  if(!rule) return;
  const synced = removeLeagueFact(leagueKey, rule.label, teamKey);
  toast(`Removed ${TEAM_META[teamKey].name} from ${rule.label}.`);
  toastIfUnsynced(synced);
};

window.adminLockLeague = function(leagueKey){
  const league = LEAGUES.find(l => l.key === leagueKey);
  forceLockLeague(leagueKey);
  // lockLeague quietly refuses a league still showing last season.
  if(isLeagueLocked(leagueKey)) toast(`${leagueChip(league)} locked. Standings rules are frozen.`);
  else toast(`Couldn't lock ${leagueChip(league)}: its live standings aren't this season's yet.`, true);
};

window.adminUnlockLeague = function(leagueKey){
  const league = LEAGUES.find(l => l.key === leagueKey);
  unlockLeague(leagueKey);
  toast(`${leagueChip(league)} unlocked. Standings rules are live again.`);
};

// ---- Point adjustments (desktop) ----

function savedAdjustment(teamKey){
  return currentLeagueAdjustments(TEAM_META[teamKey].leagueKey)[teamKey] || { pts: 0, note: '' };
}

function adjCurrent(teamKey){
  const saved = savedAdjustment(teamKey);
  return adjEdits[teamKey] || { pts: saved.pts ? String(saved.pts) : '', note: saved.note || '' };
}

function adjDirty(teamKey){
  const edit = adjEdits[teamKey];
  if(!edit) return false;
  const saved = savedAdjustment(teamKey);
  return (parseInt(edit.pts, 10) || 0) !== (saved.pts || 0) || edit.note.trim() !== (saved.note || '');
}

function adjStateHtml(teamKey){
  if(adjDirty(teamKey)) return `<button type="button" class="admin-desk-btn solid sm" onclick="saveAdminAdj('${teamKey}')">Save</button>`;
  return savedAdjustment(teamKey).pts ? '<span class="admin-desk-adj-saved">Saved</span>' : '<span class="admin-desk-adj-none">—</span>';
}

// Typing updates the row in place (no re-render), so the input keeps
// focus.
window.editAdminAdj = function(teamKey){
  const ptsEl = document.getElementById(`admin-adj-pts-${teamKey}`);
  const noteEl = document.getElementById(`admin-adj-note-${teamKey}`);
  if(!ptsEl || !noteEl) return;
  adjEdits[teamKey] = { pts: ptsEl.value, note: noteEl.value };
  ptsEl.dataset.sign = signState(parseInt(ptsEl.value, 10) || 0);
  const state = document.getElementById(`admin-adj-state-${teamKey}`);
  if(state) state.innerHTML = adjStateHtml(teamKey);
  const all = document.getElementById('admin-adj-save-all');
  if(all) all.outerHTML = adjSaveAllHtml();
};

// The league on screen's rows with unsaved edits.
const dirtyAdjTeams = () => {
  const league = LEAGUES.find(l => l.key === selected);
  return league ? draftedTeams(league).filter(adjDirty) : [];
};

function adjSaveAllHtml(){
  const n = dirtyAdjTeams().length;
  return `<button type="button" id="admin-adj-save-all" class="admin-desk-btn solid sm" onclick="saveAllAdminAdj()"${n > 1 ? '' : ' hidden'}>Save ${n}</button>`;
}

window.saveAllAdminAdj = function(){
  const teams = dirtyAdjTeams();
  if(!teams.length) return;
  const changes = teams.map(teamKey => {
    const cur = adjCurrent(teamKey);
    return { teamKey, pts: parseInt(cur.pts, 10) || 0, note: cur.note.trim() };
  });
  teams.forEach(teamKey => { delete adjEdits[teamKey]; });
  const synced = setTeamAdjustments(changes);
  toast(`Saved ${changes.length} adjustments.`);
  toastIfUnsynced(synced);
};

window.adjKeydown = function(event, teamKey){
  if(event.key === 'Enter' && adjDirty(teamKey)) window.saveAdminAdj(teamKey);
};

window.saveAdminAdj = function(teamKey){
  const cur = adjCurrent(teamKey);
  const pts = parseInt(cur.pts, 10) || 0;
  const note = cur.note.trim();
  delete adjEdits[teamKey];
  const synced = setTeamAdjustment(teamKey, pts, note);
  const name = TEAM_META[teamKey].name;
  toast(!pts && !note ? `Cleared ${name}’s adjustment.` : `${name} ${signed(pts)} saved for ${draftOwnerName(teamKey)}.`);
  toastIfUnsynced(synced);
};

// The filter hides rows in place, for the same reason as editAdminAdj.
window.filterAdminAdj = function(value){
  adjFilter = value;
  applyAdjFilter();
};

function applyAdjFilter(){
  const list = document.querySelector('.admin-desk-adj-list');
  if(!list) return;
  const q = adjFilter.trim().toLowerCase();
  let shown = 0;
  list.querySelectorAll('.admin-desk-adj-row').forEach(row => {
    const match = !q || row.dataset.q.includes(q);
    row.hidden = !match;
    if(match) shown++;
  });
  const empty = list.querySelector('.admin-desk-adj-empty');
  if(empty) empty.hidden = shown > 0;
}

window.toggleAdminAdjOnly = function(){
  adjOnly = !adjOnly;
  renderAdminPage();
};

// ---- Needs attention ----

// Days out that a lobby with no pool or lottery gets flagged.
const DRAFT_SOON_DAYS = 3;

// What's waiting on the commissioner, for the top of the Draft screen and
// the sidebar's flags: { key (the screen that fixes it), title, detail }.
function draftAttention(){
  const st = draftStatus;
  if(!st) return [];
  const items = [];
  if(st.phase === 'draft' && !st.running){
    items.push({ key: 'draft', title: 'The draft is paused', detail: st.slot === null ? 'Resume it from the draft room' : `On pick ${st.slot + 1} of ${st.total}. Resume it from the draft room` });
  }
  if(st.phase !== 'lobby') return items;
  if(st.scheduledAt && st.scheduledAt < Date.now()){
    items.push({ key: 'draft', title: 'The draft time has passed', detail: 'Start the draft from the lobby, or move the time' });
  } else if(st.scheduledAt && st.scheduledAt - Date.now() < DRAFT_SOON_DAYS * 86400000){
    const todo = [st.poolSize === 0 ? 'load the team pool' : '', st.ordered === false ? 'run the lottery' : ''].filter(Boolean);
    if(todo.length) items.push({ key: 'draft', title: `The draft starts ${whenLabel(st.scheduledAt)}`, detail: `Still to do in the lobby: ${todo.join(' and ')}` });
  }
  if(st.poll && !st.scheduledAt){
    const roster = DRAFT_TEAMS.filter(d => !d.open);
    const tally = pollTally(st.poll, roster.map(d => d.id));
    if(roster.length && !tally.waiting.length) items.push({ key: 'draft', title: 'Everyone has answered the poll', detail: 'Pick a time below to set the draft' });
  }
  return items;
}

// A league whose regular season is over (locked) still has postseason
// rules nobody has been marked for.
function leagueAttention(league){
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key) || !draftedTeams(league).length || !isLeagueLocked(league.key)) return null;
  const open = manualRules(league).filter(r => !(getLeagueRuleTeams(league.key, r) || []).length);
  if(!open.length) return null;
  return { key: league.key, title: `${leagueChip(league)}: the regular season is over`, detail: `Nobody marked yet for ${open.map(r => escapeHtml(r.label)).join(', ')}` };
}

function attentionItems(){
  return [...draftAttention(), ...SCORING_LEAGUES.map(leagueAttention).filter(Boolean)];
}

function deskAttentionHtml(){
  const items = attentionItems();
  if(!items.length) return '';
  const rows = items.map(item => `
    <div class="admin-desk-poll-row">
      <span class="admin-desk-dot" data-state="warn"></span>
      <span class="admin-desk-poll-text"><span class="admin-desk-poll-name">${item.title}</span><span class="admin-desk-poll-who">${item.detail}</span></span>
      ${item.key === 'draft' ? '' : `<button type="button" class="admin-desk-btn sm" onclick="selectAdmin('${item.key}')">Open</button>`}
    </div>`).join('');
  return `
    <section class="admin-desk-section">
      ${deskLabelRow(`Needs attention · ${items.length}`)}
      <div class="admin-desk-card admin-desk-attn">${rows}</div>
    </section>`;
}

// ---- Sidebar ----

function deskDraftNav(){
  const st = draftStatus;
  if(!st) return { sub: draftStatusError ? 'Couldn’t reach the room' : 'Checking…', dot: '' };
  if(st.phase === 'draft'){
    const pick = st.slot === null ? '' : ` · pick ${st.slot + 1} of ${st.total}`;
    return { sub: `${st.running ? 'Live' : 'Paused'}${pick}`, dot: st.running ? 'live' : 'warn' };
  }
  if(st.phase === 'done') return { sub: 'Complete', dot: 'ok' };
  if(st.scheduledAt && st.scheduledAt < Date.now()) return { sub: 'Lobby · time has passed', dot: 'warn' };
  if(st.scheduledAt) return { sub: `Set · ${scheduleDateLabel(st.scheduledAt)}`, dot: 'ok' };
  return { sub: 'Lobby · time not set', dot: 'warn' };
}

function deskSideHtml(){
  const draft = deskDraftNav();
  const leagues = SCORING_LEAGUES.map(league => {
    const marked = markedCount(league);
    const adjustments = currentLeagueAdjustments(league.key);
    const adjusted = draftedTeams(league).filter(teamKey => adjustments[teamKey]).length;
    const sub = [marked ? `${marked} marked` : 'Nothing marked', adjusted ? `${adjusted} adj` : ''].filter(Boolean).join(' · ');
    return `
      <button type="button" class="admin-desk-item${selected === league.key ? ' on' : ''}" onclick="selectAdmin('${league.key}')">
        <span class="admin-desk-swatch" style="background:${obLeagueColor(league.key)};"></span>
        <span class="admin-desk-item-text">
          <span class="admin-desk-item-title">${leagueName(league)}</span>
          <span class="admin-desk-item-sub">${sub}</span>
        </span>
        ${leagueAttention(league) ? '<span class="admin-desk-flag" title="Needs attention"></span>' : ''}
        ${isLeagueLocked(league.key) ? '<span class="admin-desk-locked">Locked</span>' : ''}
      </button>`;
  }).join('');
  return `
    <aside class="admin-desk-side">
      ${deskBrandHtml(true)}
      <nav class="admin-desk-nav">
        <button type="button" class="admin-desk-item${selected === 'draft' ? ' on' : ''}" onclick="selectAdmin('draft')">
          <span class="admin-desk-dot"${draft.dot ? ` data-state="${draft.dot}"` : ''}></span>
          <span class="admin-desk-item-text">
            <span class="admin-desk-item-title">Draft</span>
            <span class="admin-desk-item-sub">${draft.sub}</span>
          </span>
        </button>
        <button type="button" class="admin-desk-item${selected === 'sports' ? ' on' : ''}" onclick="selectAdmin('sports')">
          <span class="admin-desk-dot" data-state="ok"></span>
          <span class="admin-desk-item-text">
            <span class="admin-desk-item-title">Sports</span>
            <span class="admin-desk-item-sub">${sportsNavSub()}</span>
          </span>
        </button>
      </nav>
      <nav class="admin-desk-nav">
        <div class="admin-desk-label admin-desk-nav-label">Scoring</div>
        ${leagues}
      </nav>
      <div class="admin-desk-foot">
        <button type="button" onclick="backToSettings()">‹ Settings</button>
        <button type="button" onclick="logoutAdmin()">Log out</button>
      </div>
    </aside>`;
}

function deskBrandHtml(withGroup){
  return `
    <div class="admin-desk-brand">
      <div class="admin-desk-brand-row"><img src="icons/logo-header.png" alt=""><span>Commissioner</span></div>
      ${withGroup ? `<span class="admin-desk-group">${escapeHtml(ACTIVE_GROUP.name)}</span>` : ''}
    </div>`;
}

// A section label, with an optional note on the right.
function deskLabelRow(label, aside){
  return `<div class="admin-desk-label-row"><div class="admin-desk-label">${label}</div>${aside ? `<span class="admin-desk-aside">${aside}</span>` : ''}</div>`;
}

// ---- Draft screen ----

function deskDraftHtml(){
  const title = `The ${NEXT_DRAFT_LABEL} Draft`;
  const st = draftStatus;
  if(!st){
    const body = draftStatusError
      ? `<div class="admin-desk-card admin-desk-row-card">
           <span class="admin-desk-card-text">Couldn’t reach the draft room.</span>
           <button type="button" class="admin-desk-btn" onclick="loadAdminDraftStatus()">Try again</button>
         </div>`
      : '<div class="admin-desk-card"><span class="admin-desk-card-text">Checking the draft room…</span></div>';
    return `
      <div class="admin-desk-head"><div class="admin-desk-titles"><div class="admin-desk-eyebrow">Draft</div><h1>${title}</h1></div></div>
      ${deskAttentionHtml()}
      ${body}`;
  }

  // Each cell: label, value (state picks its color), sub-line. Rows an
  // older worker doesn't send (poolSize/ordered/scheduledAt) stay out.
  const cells = [];
  if(st.phase === 'draft'){
    const where = st.slot === null ? 'Waiting on the first pick' : `Round ${Math.floor(st.slot / st.drafters) + 1}, pick ${st.slot + 1} of ${st.total}`;
    cells.push(['Status', st.running ? 'Live' : 'Paused', st.running ? 'live' : 'warn', where]);
  } else if(st.phase === 'done'){
    cells.push(['Status', 'Complete', 'ok', 'Every pick is in']);
  } else {
    cells.push(['Status', 'In the lobby', '', 'Nobody drafting yet']);
  }
  if(typeof st.poolSize === 'number'){
    cells.push(st.poolSize ? ['Team pool', `${st.poolSize} teams`, 'ok', 'Loaded'] : ['Team pool', 'Not loaded', 'warn', 'Load it in the lobby']);
  }
  if(typeof st.ordered === 'boolean'){
    cells.push(st.ordered ? ['Lottery', 'Order locked', 'ok', 'Draft order is set'] : ['Lottery', 'Not run', 'warn', 'Run it from the lobby']);
  }
  cells.push(['Drafters', String(st.drafters), '', `${st.total} picks`]);
  if('scheduledAt' in st){
    const passed = st.phase === 'lobby' && st.scheduledAt && st.scheduledAt < Date.now();
    const sub = passed ? 'That time has passed' : st.scheduledAt ? 'On everyone’s Home' : (st.poll ? 'Poll is open' : 'No poll yet');
    cells.push(['Scheduled', st.scheduledAt ? whenLabel(st.scheduledAt) : 'Not set', st.scheduledAt && !passed ? 'ok' : 'warn', sub]);
  }
  const strip = cells.map(([label, value, state, sub]) => `
    <div class="admin-desk-stat">
      <span class="admin-desk-stat-label">${label}</span>
      <span class="admin-desk-stat-value"${state ? ` data-state="${state}"` : ''}>${value}</span>
      <span class="admin-desk-stat-sub">${sub}</span>
    </div>`).join('');

  const { cta, note } = draftRoomLink(st);
  const editors = st.phase === 'draft' ? '' : `
    <div class="admin-desk-pair">
      ${'poll' in st ? deskPollHtml(st.poll, st.scheduledAt) : ''}
      ${'scheduledAt' in st ? deskScheduleHtml(st.scheduledAt) : ''}
    </div>`;

  return `
    <div class="admin-desk-head">
      <div class="admin-desk-titles">
        <div class="admin-desk-eyebrow">Draft</div>
        <h1>${title}</h1>
        <div class="admin-desk-lede">${note}</div>
      </div>
      <button type="button" class="admin-desk-btn solid lg" onclick="goToDraftRoom('${LIVE_DRAFT_ROOM}')">${cta}</button>
    </div>
    ${deskAttentionHtml()}
    <div class="admin-desk-strip">${strip}</div>
    ${editors}`;
}

function deskPollHtml(poll, scheduledAt){
  const roster = DRAFT_TEAMS.filter(d => !d.open);
  let results = '';
  let answered = '';
  if(poll){
    // Unclaimed roster spots can't answer, so they aren't listed as waiting.
    const tally = pollTally(poll, roster.map(d => d.id));
    const names = ids => ids.map(id => escapeHtml(roster.find(d => d.id === id).name)).join(', ');
    const most = Math.max(...tally.options.map(o => o.voters.length));
    const row = (name, who, side) => `
      <div class="admin-desk-poll-row">
        <span class="admin-desk-poll-text"><span class="admin-desk-poll-name">${name}</span><span class="admin-desk-poll-who">${who}</span></span>
        ${side}
      </div>`;
    const pill = (text, state) => `<span class="admin-desk-pill"${state ? ` data-state="${state}"` : ''}>${text}</span>`;
    results = `<div class="admin-desk-poll">
      ${tally.options.map(o => row(
        whenLabel(o.at),
        o.voters.length ? names(o.voters) : 'Nobody yet',
        `${pill(`${o.voters.length} of ${roster.length}`, most && o.voters.length === most ? 'ok' : '')}
         ${o.at === scheduledAt
           ? pill('Set', 'ok')
           : `<button type="button" class="admin-desk-btn sm" onclick="useAdminPollTime(${o.at})"${scheduleSaving ? ' disabled' : ''}>Use</button>`}`
      )).join('')}
      ${tally.none.length ? row('None of these work', names(tally.none), pill(tally.none.length)) : ''}
      ${tally.waiting.length ? row('Haven’t answered', names(tally.waiting), pill(tally.waiting.length, 'warn')) : ''}
    </div>`;
    answered = `${roster.length - tally.waiting.length} of ${roster.length} answered`;
  }
  const inputs = [];
  for(let i = 0; i < POLL_MAX_OPTIONS; i++){
    const at = poll && poll.options[i];
    inputs.push(`
      <label class="admin-desk-field">
        <span class="admin-desk-field-label">Option ${i + 1}</span>
        <input type="datetime-local" id="admin-poll-when-${i}" class="admin-desk-input" value="${at ? toLocalInputValue(at) : ''}">
      </label>`);
  }
  let note = 'Offer two or three times. Home asks every drafter which ones they can make, until you set the draft time.';
  if(poll){
    note = scheduledAt
      ? 'A draft time is set, so Home shows that instead of the poll. Clear it to reopen voting.'
      : 'Open on everyone’s Home. Use sets that time as the draft time and closes the poll. Changing a time drops the answers that only named it.';
  }
  return `
    <section class="admin-desk-section">
      ${deskLabelRow('Draft time poll', answered)}
      <div class="admin-desk-card admin-desk-stack">
        ${results}
        <div class="admin-desk-fields">${inputs.join('')}</div>
        <div class="admin-desk-btns">
          <button type="button" class="admin-desk-btn solid" onclick="saveAdminDraftPoll()"${pollSaving ? ' disabled' : ''}>${pollSaving ? 'Saving…' : (poll ? 'Save times' : 'Start poll')}</button>
          ${poll ? `<button type="button" class="admin-desk-btn outline" onclick="removeAdminDraftPoll()"${pollSaving ? ' disabled' : ''}>Remove poll</button>` : ''}
        </div>
        <span class="admin-desk-note">${note}</span>
      </div>
      ${pollError ? `<div class="admin-gate-error">${pollError}</div>` : ''}
    </section>`;
}

function deskScheduleHtml(scheduledAt){
  return `
    <section class="admin-desk-section">
      ${deskLabelRow('Draft time')}
      <div class="admin-desk-card admin-desk-stack">
        ${scheduledAt ? `
          <div class="admin-desk-when">
            <span class="admin-desk-when-time">${whenLabel(scheduledAt)}</span>
            ${scheduledAt < Date.now()
              ? '<span class="admin-desk-when-sub" data-state="warn">That time has passed</span>'
              : '<span class="admin-desk-when-sub">Counting down on everyone’s Home</span>'}
          </div>` : ''}
        <input type="datetime-local" id="admin-draft-when" class="admin-desk-input" aria-label="Draft time" value="${scheduledAt ? toLocalInputValue(scheduledAt) : ''}">
        <div class="admin-desk-btns">
          <button type="button" class="admin-desk-btn solid" onclick="saveAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>${scheduleSaving ? 'Saving…' : 'Save'}</button>
          ${scheduledAt ? `<button type="button" class="admin-desk-btn outline" onclick="clearAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>Clear</button>` : ''}
        </div>
        <span class="admin-desk-note">Shows on everyone's Home with a countdown until the draft starts, and everyone with alerts on gets a notification when you set or change it. Times are in your time zone; each drafter sees their own.</span>
      </div>
      ${scheduleError ? `<div class="admin-gate-error">${scheduleError}</div>` : ''}
    </section>`;
}

// ---- League screen ----

function deskBadgeHtml(teamKey, cls){
  const meta = TEAM_META[teamKey];
  return `<span class="${cls}" style="${meta.badgeStyle}">${meta.badgeText}</span>`;
}

function deskRuleRowHtml(league, rule, index){
  const teams = getLeagueRuleTeams(league.key, rule) || [];
  const auto = !!rule.rankAuto;
  const chips = teams.map(teamKey => `
    <span class="admin-desk-chip">
      ${deskBadgeHtml(teamKey, 'admin-desk-chip-badge')}
      ${TEAM_META[teamKey].name}<span class="admin-desk-chip-owner">${draftOwnerName(teamKey)}</span>
      ${auto ? '' : `<button type="button" class="admin-desk-chip-x" onclick="adminUnmarkTeam('${league.key}', ${index}, '${teamKey}')" aria-label="Remove ${TEAM_META[teamKey].name}">×</button>`}
    </span>`).join('');
  const empty = auto ? (ruleDataPending(league.key, rule) ? 'Pending' : 'Nobody right now') : 'Not marked yet';
  const side = auto
    ? `<span class="admin-desk-rule-source">${ruleAutoNote(rule)} · ${isLeagueLocked(league.key) ? 'frozen' : 'live'}</span>`
    : `<select class="admin-desk-select" aria-label="Mark a team: ${escapeHtml(rule.label)}" onchange="if(this.value){ adminMarkTeam('${league.key}', ${index}, this.value); this.value=''; }">
        <option value="">+ Mark a team…</option>
        ${draftedTeams(league).filter(teamKey => !teams.includes(teamKey)).map(teamKey => `<option value="${teamKey}">${TEAM_META[teamKey].name} — ${draftOwnerName(teamKey)}</option>`).join('')}
      </select>`;
  return `
    <div class="admin-desk-rule">
      <div class="admin-desk-rule-main">
        <div class="admin-desk-rule-head">
          <span class="admin-desk-pts" data-sign="${rule.pts >= 0 ? 'pos' : 'neg'}">${signed(rule.pts)}</span>
          <span class="admin-desk-rule-label">${rule.label}</span>
          ${auto ? '<span class="admin-desk-auto">Auto</span>' : ''}
        </div>
        <div class="admin-desk-chips">${chips || `<span class="admin-desk-empty">${empty}</span>`}</div>
      </div>
      <div class="admin-desk-rule-side">${side}</div>
    </div>`;
}

function deskLockHtml(league){
  if(!hasAutoRules(league)) return '';
  const locked = isLeagueLocked(league.key);
  const at = locked && lockedAtFor(league.key);
  return `
    <div class="admin-desk-card admin-desk-lock">
      <span class="admin-desk-dot lg" data-state="${locked ? 'ok' : 'warn'}"></span>
      <div class="admin-desk-lock-text">
        <span class="admin-desk-lock-title">${locked ? `Regular season locked in${at ? ` — ${formatDateShort(at)}` : ''}` : 'Regular season still live'}</span>
        <span class="admin-desk-lock-sub">${locked ? 'Standings-based rules are frozen, not live.' : 'Standings-based rules lock automatically once ESPN confirms the regular season is over.'}</span>
      </div>
      ${locked
        ? `<button type="button" class="admin-desk-btn" onclick="adminUnlockLeague('${league.key}')">Unlock</button>`
        : `<button type="button" class="admin-desk-btn" onclick="adminLockLeague('${league.key}')">Force lock</button>`}
    </div>`;
}

function deskByDrafterHtml(league){
  const rows = leagueDrafterPoints(league.key);
  if(!rows.some(r => r.pts !== 0)) return '';
  const max = Math.max(1, ...rows.map(r => Math.abs(r.pts)));
  const bars = rows.sort((a, b) => b.pts - a.pts).map(r => `
    <div class="admin-desk-bar-row" data-sign="${signState(r.pts)}">
      <span class="admin-desk-bar-name">${escapeHtml(r.name)}</span>
      <span class="admin-desk-bar-track"><span class="admin-desk-bar-fill" style="width:${Math.round(Math.abs(r.pts) / max * 100)}%;"></span></span>
      <span class="admin-desk-bar-value">${signed(r.pts)}</span>
    </div>`).join('');
  return `
    <section class="admin-desk-section">
      ${deskLabelRow(`${leagueChip(league)} points by drafter`, 'Rules + adjustments')}
      <div class="admin-desk-card admin-desk-bars">${bars}</div>
    </section>`;
}

function deskAdjustmentsHtml(league){
  const adjustments = currentLeagueAdjustments(league.key);
  const teams = draftedTeams(league);
  const adjusted = teams.filter(teamKey => adjustments[teamKey]);
  const net = adjusted.reduce((n, teamKey) => n + (adjustments[teamKey].pts || 0), 0);
  const q = adjFilter.trim().toLowerCase();
  let shown = 0;
  const rows = teams.filter(teamKey => !adjOnly || adjustments[teamKey]).map(teamKey => {
    const meta = TEAM_META[teamKey];
    const owner = draftOwnerName(teamKey);
    const haystack = `${meta.name} ${owner}`.toLowerCase();
    const match = !q || haystack.includes(q);
    if(match) shown++;
    const saved = adjustments[teamKey];
    const cur = adjCurrent(teamKey);
    return `
      <div class="admin-desk-adj-row" data-q="${escapeHtml(haystack)}"${match ? '' : ' hidden'}>
        <div class="admin-desk-adj-team">
          ${deskBadgeHtml(teamKey, 'admin-desk-adj-badge')}
          <span class="admin-desk-adj-text"><span class="admin-desk-adj-name">${meta.name}</span><span class="admin-desk-adj-owner">${owner}</span></span>
        </div>
        <input type="number" id="admin-adj-pts-${teamKey}" class="admin-desk-adj-pts" aria-label="${meta.name} points" data-sign="${signState(parseInt(cur.pts, 10) || 0)}"${saved && saved.pts ? ` data-saved="${signState(saved.pts)}"` : ''} value="${escapeHtml(cur.pts)}" placeholder="0" oninput="editAdminAdj('${teamKey}')" onkeydown="adjKeydown(event, '${teamKey}')">
        <input type="text" id="admin-adj-note-${teamKey}" class="admin-desk-adj-note" aria-label="${meta.name} note" value="${escapeHtml(cur.note)}" placeholder="Why?" oninput="editAdminAdj('${teamKey}')" onkeydown="adjKeydown(event, '${teamKey}')">
        <span class="admin-desk-adj-state" id="admin-adj-state-${teamKey}">${adjStateHtml(teamKey)}</span>
      </div>`;
  }).join('');
  return `
    <div class="admin-desk-adj">
      ${deskLabelRow('Point adjustments', adjusted.length ? `${adjusted.length} adjusted · net ${signed(net)}` : 'None yet')}
      <div class="admin-desk-card admin-desk-adj-card">
        <div class="admin-desk-adj-tools">
          <input type="text" id="admin-adj-filter" class="admin-desk-input sm" placeholder="Filter teams or drafters" aria-label="Filter teams or drafters" value="${escapeHtml(adjFilter)}" oninput="filterAdminAdj(this.value)">
          <button type="button" class="admin-desk-toggle${adjOnly ? ' on' : ''}" aria-pressed="${adjOnly}" onclick="toggleAdminAdjOnly()">Adjusted only</button>
          ${adjSaveAllHtml()}
        </div>
        <div class="admin-desk-adj-list">
          ${rows}
          <div class="admin-desk-adj-empty"${shown ? ' hidden' : ''}>${adjOnly && !adjusted.length ? 'No adjustments yet.' : 'No teams match.'}</div>
        </div>
      </div>
    </div>`;
}

function deskLeagueHtml(league){
  const scoring = LEAGUE_SCORING[league.key];
  const marked = markedCount(league);
  const manual = manualRules(league).length;
  const adjustments = currentLeagueAdjustments(league.key);
  const teams = draftedTeams(league);
  const adjusted = teams.filter(teamKey => adjustments[teamKey]).length;
  const rules = scoring.rules.map((rule, i) => deskRuleRowHtml(league, rule, i)).join('');
  return `
    <div class="admin-desk-head">
      <div class="admin-desk-titles">
        <div class="admin-desk-eyebrow"><span class="admin-desk-swatch" style="background:${obLeagueColor(league.key)};"></span>Scoring · ${leagueChip(league)}</div>
        <h1>${leagueName(league)}</h1>
        <div class="admin-desk-lede">${teams.length} drafted teams · ${scoring.rules.length} rules · ${marked} marked · ${adjusted} adjusted</div>
      </div>
    </div>
    ${deskLockHtml(league)}
    <div class="admin-desk-body">
      <div class="admin-desk-body-main">
        <section class="admin-desk-section">
          ${deskLabelRow('Scoring rules', manual ? `${marked} team${marked === 1 ? '' : 's'} marked across ${manual} manual rule${manual === 1 ? '' : 's'}` : 'Every rule reads the standings')}
          <div class="admin-desk-card admin-desk-rules" style="border-top-color:${obLeagueColor(league.key)};">${rules}</div>
        </section>
        ${deskByDrafterHtml(league)}
      </div>
      ${teams.length ? deskAdjustmentsHtml(league) : ''}
    </div>`;
}

function deskGateHtml(){
  const body = verifying
    ? '<div class="admin-gate-title">Checking password…</div>'
    : `
      <div class="admin-gate-title">Enter the commissioner password</div>
      <input type="password" id="admin-password-input" class="admin-gate-input" placeholder="Password" autocomplete="off" onkeydown="if(event.key==='Enter') submitAdminPassword();">
      ${errorMsg ? `<div class="admin-gate-error">${errorMsg}</div>` : ''}
      <button type="button" class="admin-desk-btn solid lg" onclick="submitAdminPassword()">Unlock</button>`;
  return `
    <div class="admin-desk admin-desk-gated">
      <main class="admin-desk-main">
        <div class="admin-desk-gate">
          ${deskBrandHtml(false)}
          <div class="admin-desk-card admin-desk-gate-card">${body}</div>
          <button type="button" class="admin-desk-back" onclick="backToSettings()">‹ Settings</button>
        </div>
      </main>
    </div>`;
}

function deskHtml(){
  const league = SCORING_LEAGUES.find(l => l.key === selected);
  const screen = league ? deskLeagueHtml(league) : selected === 'sports' ? deskSportsHtml() : deskDraftHtml();
  return `
    <div class="admin-desk">
      ${deskSideHtml()}
      <main class="admin-desk-main">
        <div class="admin-desk-inner">${screen}</div>
      </main>
    </div>`;
}

// innerHTML swaps out the scrolling panes and whatever has focus; put
// back the scroll positions (unless a new screen was picked) and the
// focused field, so a background re-render doesn't yank the page.
function renderDesk(container, html){
  const scrollOf = sel => { const el = container.querySelector(sel); return el ? el.scrollTop : 0; };
  const scrolls = {
    '.admin-desk-main': resetDeskScroll ? 0 : scrollOf('.admin-desk-main'),
    '.admin-desk-side': scrollOf('.admin-desk-side'),
    '.admin-desk-adj-list': resetDeskScroll ? 0 : scrollOf('.admin-desk-adj-list')
  };
  resetDeskScroll = false;
  const active = document.activeElement;
  const focusId = active && container.contains(active) && active.id;
  let selection = null;
  try { selection = focusId ? [active.selectionStart, active.selectionEnd] : null; } catch (e){}

  container.innerHTML = html;

  Object.entries(scrolls).forEach(([sel, top]) => { const el = container.querySelector(sel); if(el) el.scrollTop = top; });
  const again = focusId && document.getElementById(focusId);
  if(again){
    again.focus({ preventScroll: true });
    try { if(selection && selection[0] !== null) again.setSelectionRange(selection[0], selection[1]); } catch (e){}
  }
}

export function renderAdminPage(){
  const container = document.getElementById('admin-content');
  if(!container || !isActive()) return;

  if(!unlocked && !verifying && !autoVerifyTried){
    autoVerifyTried = true;
    const cached = loadAdminPassword();
    if(cached){
      verifyAdminPassword(cached);
      return;
    }
  }

  const desk = isDesk();
  document.getElementById('view-admin').classList.toggle('admin-desk-on', desk);
  if(desk){
    renderDesk(container, unlocked ? deskHtml() : deskGateHtml());
    return;
  }
  container.innerHTML = unlocked ? unlockedHtml() : gateHtml();
}

// The page was just opened (js/board.js's showView): refresh the draft
// status, which may have moved on since it was last shown.
export function showAdminPage(){
  syncScreenParam();
  // The Draft screen's "Needs attention" reads the room's status, and so
  // does the sidebar's Draft line, whichever screen is showing.
  if(unlocked) loadDraftStatus();
  if(unlocked && selected === 'sports') loadSportsSetting();
  renderAdminPage();
}
