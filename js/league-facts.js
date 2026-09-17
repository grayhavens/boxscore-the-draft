/* ============================================================
   League Facts (shared, league-wide marks like cup winners) and
   manual point adjustments — every league's scoring now lives on this
   one shared model.

   Instead of marking "Relegation" on Liverpool's own tracker, you mark
   the real-world fact once — "who got relegated" — from the dashboard's
   password-gated admin page (js/admin.js), and every drafter who owns
   one of the teams involved is credited automatically. Rank rules
   (rankAuto in LEAGUE_SCORING) skip marking entirely and are read
   straight off a live standings table once it loads (EPL only, for
   now — see getLeagueRuleTeams). Adjustments are a flat manual point
   delta per team, for whatever a rule can't express.

   Both are shared across everyone looking at the dashboard, not just
   saved in your own browser — held in Workers KV behind the same
   Cloudflare Worker used for the TheRundown comparison (see
   DASHBOARD_WORKER_BASE / worker/rundown-proxy.js). Reads are public;
   writes require the admin password (js/utils.js's
   loadAdminPassword/putAuthedJSON) and are only ever triggered from the
   admin page, which gates its own edit controls behind that same
   password. localStorage is kept alongside as a fallback: it's what
   renders instantly before the network responds, and what's used if
   DASHBOARD_WORKER_BASE is empty or unreachable.

   Storage shape: facts are { [ruleLabel]: [teamKey, ...] }; adjustments
   are { [teamKey]: { pts, note } } — one blob of each per league.
   ============================================================ */
import { TEAM_META, LEAGUE_SCORING, LEAGUES, DRAFT_TEAMS } from './data.js';
import { fetchJSON, CHECK_ICON_SVG, CHEVRON_ICON_SVG, loadAdminPassword, putAuthedJSON } from './utils.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { eplStandingsCache, findEplTeamKeyByEspnName } from './standings-epl.js';
import { renderStandings } from './board.js';
import { renderAdminPage } from './admin.js';

const ACHIEVEMENTS_KEY = 'teamDashboardAchievements';
const LEAGUE_FACTS_KEY = 'teamDashboardLeagueFacts';
const EPL_FACTS_MIGRATED_KEY = 'teamDashboardEplFactsMigrated';

// Only read now, for the one-time migration below — nothing writes to
// this anymore, every league has moved onto the shared facts model.
export function loadAchievements(){
  try {
    return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || {};
  } catch (e){
    return {};
  }
}

export const LEAGUE_FACTS_LEAGUES = LEAGUES.map(l => l.key);

const leagueFactsCache = {}; // leagueKey -> { data, loading, error }
function factsCacheFor(leagueKey){
  return leagueFactsCache[leagueKey] || (leagueFactsCache[leagueKey] = { data: null, loading: false, error: false });
}

// EPL was the pilot for this feature and kept its original bare
// localStorage key (with the legacy { epl: {...} }-nested shape some
// early versions wrote); every league added since gets its own
// suffixed key instead of sharing that one flat slot.
function localFactsKey(leagueKey){
  return leagueKey === 'epl' ? LEAGUE_FACTS_KEY : `${LEAGUE_FACTS_KEY}:${leagueKey}`;
}

function factsMigratedKey(leagueKey){
  return leagueKey === 'epl' ? EPL_FACTS_MIGRATED_KEY : `teamDashboardFactsMigrated:${leagueKey}`;
}

function loadLocalLeagueFacts(leagueKey){
  try {
    const parsed = JSON.parse(localStorage.getItem(localFactsKey(leagueKey)));
    if(!parsed) return {};
    // Earlier versions of this feature stored { epl: {...} } (facts
    // nested per league, in case other leagues moved to this model
    // too). Unwrap that shape if we find it; otherwise this is already
    // the flat rule-map saveLocalLeagueFacts writes today.
    return (parsed[leagueKey] && typeof parsed[leagueKey] === 'object') ? parsed[leagueKey] : parsed;
  } catch (e){
    return {};
  }
}

function saveLocalLeagueFacts(leagueKey, facts){
  try {
    localStorage.setItem(localFactsKey(leagueKey), JSON.stringify(facts));
  } catch (e){
    // localStorage unavailable (private browsing, etc.) — facts just won't persist locally.
  }
}

// Synchronous read used everywhere the app needs "what's marked right
// now": the shared copy once it's loaded, the local fallback until
// then. Kicks off the network fetch on first read, same lazy-load
// pattern as fetchEplStandingsTable.
function currentLeagueFacts(leagueKey){
  const cache = factsCacheFor(leagueKey);
  if(cache.data === null && !cache.loading && !cache.error) fetchLeagueFacts(leagueKey);
  return cache.data || loadLocalLeagueFacts(leagueKey);
}

async function fetchLeagueFacts(leagueKey){
  const cache = factsCacheFor(leagueKey);
  if(cache.data !== null || cache.loading || !DASHBOARD_WORKER_BASE) return;
  cache.loading = true;
  const data = await fetchJSON(`${DASHBOARD_WORKER_BASE}/facts/${leagueKey}`);
  cache.loading = false;
  // If a mark was made locally while this was in flight, cache.data is
  // no longer null — don't clobber that edit with the (now stale) GET.
  if(cache.data !== null) return;
  if(data && typeof data === 'object'){
    cache.data = data;
    renderStandings();
    renderAdminPage();
  } else {
    cache.error = true;
  }
}

// Pushes the current facts to both the local fallback and the shared
// store. The PUT is fire-and-forget — if it fails (offline, worker
// down, wrong/expired admin password) the mark still sticks locally, it
// just won't show up for anyone else until the next successful sync.
// Only ever called from the admin page, which already gated the edit
// controls behind a verified password — loadAdminPassword() here is
// just reading what that page already confirmed.
function persistLeagueFacts(leagueKey, facts){
  saveLocalLeagueFacts(leagueKey, facts);
  if(!DASHBOARD_WORKER_BASE) return;
  putAuthedJSON(`${DASHBOARD_WORKER_BASE}/facts/${leagueKey}`, loadAdminPassword(), facts)
    .then(({ ok }) => { if(!ok) console.warn('[League Facts]', leagueKey, 'failed to sync to shared store'); });
}

// ---- Manual point adjustments ----
// A flat point delta per team, for whatever a rule can't express (or
// ESPN's feed can't confirm). Same KV/localStorage-fallback pattern as
// facts above, just a different worker route and shape.
const LEAGUE_ADJUSTMENTS_KEY = 'teamDashboardLeagueAdjustments';
const leagueAdjustmentsCache = {}; // leagueKey -> { data, loading, error }

function adjustmentsCacheFor(leagueKey){
  return leagueAdjustmentsCache[leagueKey] || (leagueAdjustmentsCache[leagueKey] = { data: null, loading: false, error: false });
}

function loadLocalLeagueAdjustments(leagueKey){
  try {
    return JSON.parse(localStorage.getItem(`${LEAGUE_ADJUSTMENTS_KEY}:${leagueKey}`)) || {};
  } catch (e){
    return {};
  }
}

function saveLocalLeagueAdjustments(leagueKey, adjustments){
  try {
    localStorage.setItem(`${LEAGUE_ADJUSTMENTS_KEY}:${leagueKey}`, JSON.stringify(adjustments));
  } catch (e){}
}

export function currentLeagueAdjustments(leagueKey){
  const cache = adjustmentsCacheFor(leagueKey);
  if(cache.data === null && !cache.loading && !cache.error) fetchLeagueAdjustments(leagueKey);
  return cache.data || loadLocalLeagueAdjustments(leagueKey);
}

async function fetchLeagueAdjustments(leagueKey){
  const cache = adjustmentsCacheFor(leagueKey);
  if(cache.data !== null || cache.loading || !DASHBOARD_WORKER_BASE) return;
  cache.loading = true;
  const data = await fetchJSON(`${DASHBOARD_WORKER_BASE}/adjustments/${leagueKey}`);
  cache.loading = false;
  if(cache.data !== null) return;
  if(data && typeof data === 'object'){
    cache.data = data;
    renderStandings();
    renderAdminPage();
  } else {
    cache.error = true;
  }
}

function persistLeagueAdjustments(leagueKey, adjustments){
  saveLocalLeagueAdjustments(leagueKey, adjustments);
  if(!DASHBOARD_WORKER_BASE) return;
  putAuthedJSON(`${DASHBOARD_WORKER_BASE}/adjustments/${leagueKey}`, loadAdminPassword(), adjustments)
    .then(({ ok }) => { if(!ok) console.warn('[League Adjustments]', leagueKey, 'failed to sync to shared store'); });
}

// Sets (or, with pts 0 and no note, clears) one team's manual point
// adjustment. Only ever called from the admin page.
export function setTeamAdjustment(teamKey, pts, note){
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  const leagueKey = meta.leagueKey;
  const cache = adjustmentsCacheFor(leagueKey);
  const adjustments = cache.data || (cache.data = currentLeagueAdjustments(leagueKey));
  if(!pts && !note){
    delete adjustments[teamKey];
  } else {
    adjustments[teamKey] = { pts: pts || 0, note: note || '' };
  }
  persistLeagueAdjustments(leagueKey, adjustments);
  renderAdminPage();
}
window.setTeamAdjustment = setTeamAdjustment;

// A team's current manual adjustment, or null if it has none — read by
// computeTeamPoints below and by obDrafterAwards in js/overall.js.
export function getTeamAdjustment(teamKey){
  const meta = TEAM_META[teamKey];
  if(!meta) return null;
  return currentLeagueAdjustments(meta.leagueKey)[teamKey] || null;
}

// One-time migration so anyone who'd already ticked boxes under the old
// per-team checklist doesn't see their marks vanish when a league moves
// onto this model. Safe to run every load — it no-ops once that
// league's factsMigratedKey is set. Only touches the local fallback; if
// this browser ever calls addLeagueFact/removeLeagueFact afterward,
// that push syncs these forward to the shared store like any other edit.
export function migrateAchievementsToFacts(leagueKey){
  try {
    if(localStorage.getItem(factsMigratedKey(leagueKey))) return;
  } catch (e){ return; }

  const oldData = loadAchievements();
  const facts = loadLocalLeagueFacts(leagueKey);

  Object.keys(oldData).forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    if(!meta || meta.leagueKey !== leagueKey) return;
    (oldData[teamKey] || []).forEach(label => {
      const list = facts[label] || (facts[label] = []);
      if(!list.includes(teamKey)) list.push(teamKey);
    });
  });

  saveLocalLeagueFacts(leagueKey, facts);
  try { localStorage.setItem(factsMigratedKey(leagueKey), '1'); } catch (e){}
}

function findLeagueRule(leagueKey, ruleLabel){
  return LEAGUE_SCORING[leagueKey].rules.find(r => r.label === ruleLabel);
}

// Teams currently satisfying a rule — auto-derived from the live table
// for rankAuto rules (EPL only, for now), or read from the
// manually-marked facts otherwise. obRuleTeams (js/overall.js) picks
// this up automatically for any league listed in LEAGUE_FACTS_LEAGUES.
export function getLeagueRuleTeams(leagueKey, rule){
  if(!LEAGUE_FACTS_LEAGUES.includes(leagueKey)) return null;
  if(rule.rankAuto){
    const table = leagueKey === 'epl' ? eplStandingsCache.table : null;
    if(!table) return [];
    const total = table.length;
    return table
      .filter(row => {
        const rank = row.rank;
        return rule.rankAuto.bottom ? rank > total - rule.rankAuto.bottom : rank === rule.rankAuto.rank;
      })
      .map(row => findEplTeamKeyByEspnName(row.teamName))
      .filter(Boolean);
  }
  return currentLeagueFacts(leagueKey)[rule.label] || [];
}

export function addLeagueFact(leagueKey, ruleLabel, teamKey){
  const rule = findLeagueRule(leagueKey, ruleLabel);
  if(!rule || rule.rankAuto || !teamKey) return;

  const cache = factsCacheFor(leagueKey);
  const facts = cache.data || (cache.data = currentLeagueFacts(leagueKey));
  if(rule.exclusive){
    facts[ruleLabel] = [teamKey];
  } else {
    const list = facts[ruleLabel] || (facts[ruleLabel] = []);
    if(!list.includes(teamKey)) list.push(teamKey);
  }
  persistLeagueFacts(leagueKey, facts);
  renderAdminPage();
}
window.addLeagueFact = addLeagueFact;

export function removeLeagueFact(leagueKey, ruleLabel, teamKey){
  const cache = factsCacheFor(leagueKey);
  const facts = cache.data || (cache.data = currentLeagueFacts(leagueKey));
  const list = facts[ruleLabel] || [];
  const idx = list.indexOf(teamKey);
  if(idx === -1) return;
  list.splice(idx, 1);
  persistLeagueFacts(leagueKey, facts);
  renderAdminPage();
}
window.removeLeagueFact = removeLeagueFact;

// Which team's tracker body (the checklist itself, below the always-
// visible "Earned so far" summary) is expanded — at most one at a time,
// same within-session-only idea as obExpandedId in js/overall.js. Only
// one team modal can be open at once, so tracking a single teamKey
// (rather than a Set) is enough: opening a different team's modal
// naturally starts collapsed, since trackerExpandedTeamKey won't match
// its teamKey.
let trackerExpandedTeamKey = null;

export function toggleTrackerSection(teamKey){
  trackerExpandedTeamKey = trackerExpandedTeamKey === teamKey ? null : teamKey;
  renderTrackerSection(teamKey);
}
window.toggleTrackerSection = toggleTrackerSection;

function computeTeamPoints(teamKey){
  const meta = TEAM_META[teamKey];
  const scoring = meta && LEAGUE_SCORING[meta.leagueKey];
  if(!scoring) return 0;
  const rulePts = scoring.rules.reduce((sum, r) => sum + (getLeagueRuleTeams(meta.leagueKey, r).includes(teamKey) ? r.pts : 0), 0);
  const adj = getTeamAdjustment(teamKey);
  return rulePts + (adj ? adj.pts : 0);
}

// The slice of a team's points that comes from current-standings rules
// (rankAuto) rather than a real, locked-in fact — these can still move
// as the table changes before the season ends. EPL-only for now: no
// other league has a rankAuto rule yet, so this is always 0 elsewhere.
// Manual adjustments are never provisional — an admin decided them.
function computeTeamProvisionalPoints(teamKey){
  const meta = TEAM_META[teamKey];
  const scoring = meta && LEAGUE_SCORING[meta.leagueKey];
  if(!scoring) return 0;
  return scoring.rules.reduce((sum, r) => sum + (r.rankAuto && getLeagueRuleTeams(meta.leagueKey, r).includes(teamKey) ? r.pts : 0), 0);
}

// Header row shown whether the tracker is collapsed or expanded: the
// "Track This Season" title and the "Earned so far" summary stay
// visible either way, with a chevron (flipped via CSS when expanded)
// as the only visual cue that there's more underneath. Clicking
// anywhere on the row toggles it, not just the chevron itself.
function trackerHeadHtml(teamKey, totalHtml, expanded){
  return `
    <div class="tracker-head" onclick="toggleTrackerSection('${teamKey}')">
      <div>
        <div class="modal-section-title">Draft Points</div>
        <div class="tracker-total">${totalHtml}</div>
      </div>
      <div class="tracker-chevron ${expanded ? 'open' : ''}">${CHEVRON_ICON_SVG}</div>
    </div>
  `;
}

// Read-only summary of where a team stands — everything is marked from
// the password-gated admin page now (js/admin.js), not per-team.
export function trackerSectionHtml(teamKey){
  const meta = TEAM_META[teamKey];
  const scoring = meta && LEAGUE_SCORING[meta.leagueKey];
  if(!scoring) return '';

  const expanded = trackerExpandedTeamKey === teamKey;
  const total = computeTeamPoints(teamKey);
  const provisionalPts = computeTeamProvisionalPoints(teamKey);
  const adj = getTeamAdjustment(teamKey);

  const itemsHtml = scoring.rules.map(r => {
    const achieved = getLeagueRuleTeams(meta.leagueKey, r).includes(teamKey);
    // Rank-based rules (rankAuto) reflect the table as it stands right
    // now, not a locked-in result — "2nd in EPL" today could be 5th by
    // the time the season actually ends. Give those a visibly
    // different (amber, not green/red) state instead of the same
    // checkmark used for a real fact like "Win FA Cup".
    const isProvisional = achieved && !!r.rankAuto;
    const stateClass = achieved ? (isProvisional ? 'provisional' : 'achieved') : '';
    return `
      <div class="tracker-item readonly ${stateClass}">
        <div class="tracker-check">${achieved ? CHECK_ICON_SVG : ''}</div>
        <div class="tracker-label">${r.label}${isProvisional ? '<span class="provisional-tag">Current</span>' : ''}</div>
        <div class="tracker-value ${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts >= 0 ? '+' : ''}${r.pts} pt${Math.abs(r.pts) === 1 ? '' : 's'}</div>
      </div>
    `;
  }).join('');

  const adjItemHtml = adj ? `
    <div class="tracker-item readonly achieved">
      <div class="tracker-check">${CHECK_ICON_SVG}</div>
      <div class="tracker-label">${adj.note || 'Manual adjustment'}</div>
      <div class="tracker-value ${adj.pts >= 0 ? 'pos' : 'neg'}">${adj.pts >= 0 ? '+' : ''}${adj.pts} pt${Math.abs(adj.pts) === 1 ? '' : 's'}</div>
    </div>
  ` : '';

  // "Earned so far" is confirmed points only — locked-in facts and
  // adjustments, not whatever the table currently implies. Provisional
  // points are shown separately alongside it, not folded into that
  // headline number, since they can still move before the season ends.
  const confirmedPts = total - provisionalPts;
  const provisionalNoteHtml = provisionalPts !== 0
    ? `<span class="provisional-note">${provisionalPts >= 0 ? '+' : ''}${provisionalPts} provisional</span>`
    : '';

  const totalHtml = `Earned so far: <b>${confirmedPts >= 0 ? '+' : ''}${confirmedPts}</b> pt${Math.abs(confirmedPts) === 1 ? '' : 's'}${provisionalNoteHtml}`;
  const bodyHtml = expanded ? `
    <div class="tracker-body">
      <div class="tracker-list">${itemsHtml}${adjItemHtml}</div>
    </div>
  ` : '';
  return trackerHeadHtml(teamKey, totalHtml, expanded) + bodyHtml;
}

// `#tracker-section` now only ever lives on the Team Page's Stats tab
// (js/team-page.js) — the team modal dropped it when trimmed down to a
// peek. This used to also check the modal's own activeTeam dataset
// before repainting, back when the modal was this element's only
// possible home; that guard is gone since it no longer applies anywhere
// this element actually renders, and was stopping this section from
// ever expanding on the Team Page (always failing the modal check).
function renderTrackerSection(teamKey){
  const el = document.getElementById('tracker-section');
  if(!el) return;
  el.innerHTML = trackerSectionHtml(teamKey);
}

// One row per scoring rule, used by the admin page (js/admin.js) to mark
// league-wide facts (cup winners, who got relegated, etc.) instead of
// hunting down each drafted team individually — pick the real club from
// the dropdown and whoever drafted it gets credited. Rank-based rules
// (rankAuto) have no picker at all since they're read straight off the
// standings table above.
export function leagueFactRowHtml(league, rule){
  const selected = getLeagueRuleTeams(league.key, rule);
  const isAuto = !!rule.rankAuto;

  const chipsHtml = selected.length
    ? selected.map(teamKey => {
        const meta = TEAM_META[teamKey];
        const drafter = DRAFT_TEAMS.find(d => d.id === meta.draftTeamId);
        const removeBtn = isAuto ? '' : `<button class="fact-chip-x" onclick="removeLeagueFact('${league.key}', '${rule.label}', '${teamKey}')" aria-label="Remove ${meta.name}">&times;</button>`;
        return `
          <span class="fact-chip">
            <span class="fact-chip-badge" style="${meta.badgeStyle}">${meta.badgeText}</span>
            ${meta.name} <span class="fact-chip-owner">${drafter.name}</span>
            ${removeBtn}
          </span>
        `;
      }).join('')
    : `<span class="fact-empty">${isAuto ? 'Pending' : 'Not marked yet'}</span>`;

  const pickerHtml = isAuto ? '' : `
    <select class="fact-picker" onchange="if(this.value){ addLeagueFact('${league.key}', '${rule.label}', this.value); this.value=''; }">
      <option value="">+ Mark a team…</option>
      ${league.teams.map(teamKey => `<option value="${teamKey}">${TEAM_META[teamKey].name} — ${DRAFT_TEAMS.find(d => d.id === TEAM_META[teamKey].draftTeamId).name}</option>`).join('')}
    </select>
  `;

  return `
    <div class="fact-row">
      <div class="fact-row-top">
        <div class="fact-label">${rule.label}</div>
        <div class="fact-pts ${rule.pts >= 0 ? 'pos' : 'neg'}">${rule.pts >= 0 ? '+' : ''}${rule.pts}</div>
      </div>
      <div class="fact-chips">${chipsHtml}</div>
      ${pickerHtml}
    </div>
  `;
}

