/* ============================================================
   Scoring reference page: every league's draft scoring rules, one
   league at a time behind a filter-chip row (no "All" chip — each
   league's rankAuto-heavy rule set is enough to read on its own; see
   js/admin.js's adminFilterKey for the identical no-All precedent).

   Reached from the Leaderboard tab's "Scoring" ghost chip. Replaces the
   old per-league Scoring popup the Standings tab used to open from each
   league card (openLeagueModal in js/board.js, now removed) with one
   destination that covers every league behind the same filter chips
   the Standings/admin pages already use, instead of hopping between
   eight per-card popups.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING } from './data.js';
import { LEAGUE_FULL_LABELS, FILTER_CHIP_LABELS } from './board.js';

// Which league this page is showing — same "no persistence, just a
// module-level variable" idea as adminFilterKey in js/admin.js.
let scoringFilterKey = LEAGUES[0].key;

export function setScoringFilter(key){
  scoringFilterKey = key;
  renderScoringPage();
}
window.setScoringFilter = setScoringFilter;

function isActive(){
  const view = document.getElementById('view-scoring');
  return !!view && view.classList.contains('active');
}

function filterChipsHtml(){
  const chipsHtml = LEAGUES.map(l => {
    const label = FILTER_CHIP_LABELS[l.key] || l.label;
    return `<div class="filter-chip ${l.key === scoringFilterKey ? 'active' : ''}" onclick="setScoringFilter('${l.key}')">${label}</div>`;
  }).join('');
  return `<div class="standings-filter-row"><div class="filter-chips">${chipsHtml}</div></div>`;
}

function leagueRulesHtml(league){
  const data = LEAGUE_SCORING[league.key];
  if(!data) return '';

  const rulesHtml = data.rules.map(r => `
    <div class="scoring-item">
      <div class="scoring-label">${r.label}</div>
      <div class="scoring-value ${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts >= 0 ? '+' : ''}${r.pts} pt${Math.abs(r.pts) === 1 ? '' : 's'}</div>
    </div>
  `).join('');

  // Same "kept separate from `rules`" reasoning as openLeagueModal — the
  // league bonus is awarded once per drafter, not per team.
  const bonusHtml = data.bonus ? `
    <div class="modal-section-title" style="margin-top: 18px;">League Bonus</div>
    <div class="scoring-list">
      <div class="scoring-item">
        <div class="scoring-label">${data.bonus.label}</div>
        <div class="scoring-value pos">+${data.bonus.pts} pts</div>
      </div>
    </div>
  ` : '';

  return `
    <div class="scoring-page-accent" style="background:${data.accent};"></div>
    <h2 class="scoring-page-title">${LEAGUE_FULL_LABELS[league.key] || data.name}</h2>
    <div class="scoring-page-sub">Draft scoring rules</div>
    <div class="scoring-list">${rulesHtml}</div>
    ${bonusHtml}
  `;
}

export function renderScoringPage(){
  const container = document.getElementById('scoring-content');
  if(!container || !isActive()) return;
  const league = LEAGUES.find(l => l.key === scoringFilterKey) || LEAGUES[0];
  container.innerHTML = `${filterChipsHtml()}${leagueRulesHtml(league)}`;
}
