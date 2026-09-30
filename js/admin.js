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
import { LEAGUES, LEAGUE_SCORING, TEAM_META, DRAFT_TEAMS } from './data.js';
import { loadAdminPassword, saveAdminPassword, clearAdminPassword, fetchAuthedJSON, putAuthedJSON, fetchJSON, formatDateShort, segmentedControlHtml, CHEVRON_LEFT_SVG, escapeHtml } from './utils.js';
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';
import { leagueFactRowHtml, currentLeagueAdjustments, setTeamAdjustment } from './league-facts.js';
import { LEAGUE_FULL_LABELS } from './board.js';
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

// Which league this page is isolated to — a per-league chip row like the
// Standings tab (js/board.js's standingsFilterKey), but with no "All"
// option: every league's rules + team adjustments stacked together is a
// lot to render at once (each rankAuto rule reads a live standings
// table), so only one league is ever rendered here. Not persisted/
// URL-mirrored — resets to the first league each time the page is opened.
let adminFilterKey = LEAGUES[0].key;

// Which section is showing. Kept for the session, so coming back from
// the draft room lands where you left.
let adminSection = 'draft';

// The live room's GET /draft/status, refetched each time the Draft
// section is shown. null until the first answer; draftStatusError when
// the worker can't be reached (or predates the route).
let draftStatus = null;
let draftStatusError = false;
let draftStatusLoading = false;

window.setAdminFilter = function(key){
  adminFilterKey = key;
  renderAdminPage();
};

window.setAdminSection = function(key){
  if(key === adminSection) return;
  adminSection = key;
  if(key === 'draft') loadDraftStatus();
  renderAdminPage();
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

// A commissioner write to the live room (`what` is 'schedule' or 'poll').
// The room answers with its new status; resolves to an error message, or
// '' when it saved.
async function putDraftRoom(what, body){
  const { ok, status, data } = await putAuthedJSON(
    withGroupQuery(`${chatWorkerBase()}/draft/${what}?room=${LIVE_DRAFT_ROOM}`),
    loadAdminPassword(),
    body
  );
  if(!ok || !data) return status === 401 ? 'Not signed in as commissioner' : "Couldn't save — try again";
  draftStatus = data;
  setKnownDraftStatus(data);
  return '';
}

async function saveDraftSchedule(scheduledAt){
  if(scheduleSaving) return;
  scheduleSaving = true;
  scheduleError = '';
  renderAdminPage();
  scheduleError = await putDraftRoom('schedule', { scheduledAt });
  scheduleSaving = false;
  renderAdminPage();
}

async function saveDraftPoll(options){
  if(pollSaving) return;
  pollSaving = true;
  pollError = '';
  renderAdminPage();
  pollError = await putDraftRoom('poll', { options });
  pollSaving = false;
  renderAdminPage();
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
  saveDraftPoll(options);
};

window.removeAdminDraftPoll = function(){
  if(window.confirm('Remove the poll and everyone’s answers?')) saveDraftPoll(null);
};

// Make one of the poll's times the draft time. That closes the poll on
// Home; the answers stay here.
window.useAdminPollTime = function(at){
  saveDraftSchedule(at);
};

window.saveAdminDraftSchedule = function(){
  const input = document.getElementById('admin-draft-when');
  const at = input && input.value ? new Date(input.value).getTime() : NaN;
  if(!Number.isFinite(at)){
    scheduleError = 'Pick a date and time first';
    renderAdminPage();
    return;
  }
  saveDraftSchedule(at);
};

window.clearAdminDraftSchedule = function(){
  saveDraftSchedule(null);
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
    if(adminSection === 'draft') loadDraftStatus();
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
        <button class="admin-adj-save" style="margin-left: auto;" onclick="unlockLeague('${league.key}')">Unlock</button>
      </div>
    `;
  }
  return `
    <div class="prior-season-note">
      Standings-based rules below are still live — they'll lock automatically once ESPN confirms the regular season is over.
      <button class="admin-adj-save" style="margin-left: auto;" onclick="forceLockLeague('${league.key}')">Force Lock</button>
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
      <div class="modal-section-title" style="margin-top: 18px;">Point adjustments</div>
      <div class="admin-adj-list">${adjRowsHtml}</div>
    </div>
  `;
}

function filterChipsHtml(){
  const chipsHtml = LEAGUES.map(l => {
    const label = FILTER_CHIP_LABELS[l.key] || l.label;
    return `<div class="filter-chip ${l.key === adminFilterKey ? 'active' : ''}" onclick="setAdminFilter('${l.key}')">${label}</div>`;
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

  const cta = st.phase === 'draft' ? 'Open draft room' : (st.phase === 'done' ? 'Open final board' : 'Open draft lobby');
  const note = st.phase === 'lobby'
    ? "Load the team pool, set the pick clock, run the lottery and start the draft from the lobby. You're signed in there as commissioner."
    : "You're signed in there as commissioner: pause, undo, trade, change picks and download the board from the bar under the header.";

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
    <div class="modal-section-title" style="margin-top: 18px;">Draft time poll</div>
    ${poll ? pollResultsHtml(poll, scheduledAt) : ''}
    <div class="admin-schedule"${poll ? ' style="margin-top: 10px;"' : ''}>
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
    <div class="modal-section-title" style="margin-top: 18px;">Draft time</div>
    <div class="admin-schedule">
      <input type="datetime-local" id="admin-draft-when" class="admin-gate-input" value="${scheduledAt ? toLocalInputValue(scheduledAt) : ''}">
      <div class="admin-schedule-actions">
        <button class="admin-adj-save" onclick="saveAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>${scheduleSaving ? 'Saving…' : 'Save'}</button>
        ${scheduledAt ? `<button class="admin-adj-save" onclick="clearAdminDraftSchedule()"${scheduleSaving ? ' disabled' : ''}>Clear</button>` : ''}
      </div>
    </div>
    ${scheduleError ? `<div class="admin-gate-error">${scheduleError}</div>` : ''}
    <div class="admin-status-note">Shows on everyone's Home with a countdown until the draft starts. Times are in your time zone; each drafter sees their own.</div>
  `;
}

function unlockedHtml(){
  const shownLeague = LEAGUES.find(l => l.key === adminFilterKey) || LEAGUES[0];
  const body = adminSection === 'draft'
    ? draftSectionHtml()
    : `${filterChipsHtml()}${leagueSectionHtml(shownLeague)}`;
  return `
    <div class="admin-toolbar">
      <button class="ob-back" onclick="backToSettings()">${CHEVRON_LEFT_SVG}Settings</button>
      <button class="admin-logout" onclick="logoutAdmin()">Log out</button>
    </div>
    ${segmentedControlHtml([{ key: 'draft', label: 'Draft' }, { key: 'scoring', label: 'Scoring' }], adminSection, 'setAdminSection')}
    ${body}
  `;
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

  container.innerHTML = unlocked ? unlockedHtml() : gateHtml();
}

// The page was just opened (js/board.js's showView): refresh the draft
// status, which may have moved on since it was last shown.
export function showAdminPage(){
  if(unlocked && adminSection === 'draft') loadDraftStatus();
  renderAdminPage();
}
