/* ============================================================
   Password-gated scoring admin page.

   Reached only via the "Manage Scoring" link at the bottom of the
   Overall tab (or a bookmarked ?view=admin) — see switchView in
   js/board.js. The password prompt here is a convenience gate so
   casual visitors don't land on an editing UI; the real protection is
   the Cloudflare Worker rejecting unauthenticated writes (see
   worker/rundown-proxy.js's isAuthorized). Reads (facts/adjustments)
   stay public everywhere else in the app — this page is just where the
   edit controls live now, consolidated across every league instead of
   scattered per-league Results chips and unsynced per-team checklists.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, TEAM_META, DRAFT_TEAMS } from './data.js';
import { loadAdminPassword, saveAdminPassword, clearAdminPassword, fetchAuthedJSON, formatDateShort } from './utils.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { leagueFactRowHtml, currentLeagueAdjustments, setTeamAdjustment } from './league-facts.js';
import { LEAGUE_FULL_LABELS, FILTER_CHIP_LABELS } from './board.js';
import { isLeagueLocked, lockedAtFor, forceLockLeague, unlockLeague } from './season-lock.js';

let unlocked = false;
let verifying = false;
let errorMsg = '';
let autoVerifyTried = false;

// Which league this page is isolated to — same "All" + per-league chip
// row as the Standings tab (js/board.js's standingsFilterKey), since
// every league's rules + team adjustments stacked together is a lot to
// scroll through at once. Not persisted/URL-mirrored — resets to "All"
// each time the page is opened, same as Standings' own filter.
let adminFilterKey = 'all';

window.setAdminFilter = function(key){
  adminFilterKey = key;
  renderAdminPage();
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
  const { ok, status } = await fetchAuthedJSON(`${DASHBOARD_WORKER_BASE}/admin/verify`, password);
  verifying = false;
  if(ok){
    saveAdminPassword(password);
    unlocked = true;
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
  const backHtml = `<button class="ob-back" onclick="switchView('overall')">&larr; Back to Overall</button>`;
  if(verifying){
    return `${backHtml}<div class="admin-gate"><div class="admin-gate-title">Checking password…</div></div>`;
  }
  return `
    ${backHtml}
    <div class="admin-gate">
      <div class="admin-gate-title">Enter the scoring password</div>
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
      <input type="text" class="admin-adj-note" id="admin-adj-note-${teamKey}" value="${current.note || ''}" placeholder="Why?">
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
      <button class="admin-adj-save" style="margin-left: auto;" onclick="forceLockLeague('${league.key}')">Force lock now</button>
    </div>
  `;
}

function leagueSectionHtml(league){
  const scoring = LEAGUE_SCORING[league.key];
  if(!scoring) return '';
  const rulesHtml = scoring.rules.map(r => leagueFactRowHtml(league, r)).join('');
  const adjustments = currentLeagueAdjustments(league.key);
  const adjRowsHtml = league.teams.map(teamKey => adjustmentRowHtml(teamKey, adjustments)).join('');

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
  const chipsHtml = ['all'].concat(LEAGUES.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return `<div class="filter-chip ${key === adminFilterKey ? 'active' : ''}" onclick="setAdminFilter('${key}')">${label}</div>`;
  }).join('');
  return `<div class="standings-filter-row"><div class="filter-chips">${chipsHtml}</div></div>`;
}

function unlockedHtml(){
  const shownLeagues = adminFilterKey === 'all' ? LEAGUES : LEAGUES.filter(l => l.key === adminFilterKey);
  return `
    <div class="admin-toolbar">
      <button class="ob-back" onclick="switchView('overall')">&larr; Back to Overall</button>
      <button class="admin-logout" onclick="logoutAdmin()">Log out</button>
    </div>
    ${filterChipsHtml()}
    ${shownLeagues.map(leagueSectionHtml).join('')}
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
