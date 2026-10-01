/* ============================================================
   Scoring sheet: every league's draft scoring rules, one league at a
   time behind a row of league tabs, in a bottom sheet (centered on
   desktop). One sheet for every way in: the Points tab's "How scoring
   works" button, the feature guide, the draft room's "Scoring" link
   (js/draft.js), which opens it on the league its Available list is
   filtered to. It replaced a full Scoring page (?view=scoring, which now
   lands on Points with this sheet open).
   The landing page's "How scoring works" button (js/landing.js) opens it
   too, which is why it takes its rules through setScoringRules instead of
   importing js/data.js: the landing page has no group to read them from.
   The sheet borrows the draft room's sheet layout (.dr-modal) and league
   tabs (.dr-ltab) so it looks the same wherever it opens.
   ============================================================ */
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { openSheetOverlay, closeSheetOverlay, isSheetOpen, enableSheetSwipeToDismiss, lockBodyScroll, unlockBodyScroll } from './sheet.js';

// The rules on show: a LEAGUES-shaped list (key, label) and LEAGUE_SCORING.
let LEAGUES = [];
let LEAGUE_SCORING = {};
export function setScoringRules(leagues, scoring){
  LEAGUES = leagues;
  LEAGUE_SCORING = scoring;
}

// The league last shown, so reopening lands where you left off.
let leagueKey = null;

const overlay = () => document.getElementById('scoring-sheet');
const scoringLeagues = () => LEAGUES.filter(l => LEAGUE_SCORING[l.key]);

// One league's rule list plus its bonus.
function rulesHtml(key){
  const data = LEAGUE_SCORING[key];
  if(!data) return '';

  const rules = data.rules.map(r => `
    <div class="scoring-item">
      <div class="scoring-label">${r.label}</div>
      <div class="scoring-value ${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts >= 0 ? '+' : ''}${r.pts}</div>
    </div>
  `).join('');

  // Kept separate from `rules`: the league bonus is awarded once per
  // drafter, not per team.
  const bonus = data.bonus ? `
    <div class="modal-section-title spaced">League Bonus</div>
    <div class="scoring-list">
      <div class="scoring-item">
        <div class="scoring-label">${data.bonus.label}</div>
        <div class="scoring-value pos">+${data.bonus.pts}</div>
      </div>
    </div>
  ` : '';

  return `<div class="scoring-list">${rules}</div>${bonus}`;
}

function render(){
  const sheet = document.getElementById('scoring-sheet-content');
  if(!sheet) return;
  const leagues = scoringLeagues();
  if(!leagues.some(l => l.key === leagueKey)) leagueKey = leagues[0].key;
  const tabs = leagues.map(l =>
    `<button class="dr-ltab${l.key === leagueKey ? ' on' : ''}" onclick="setScoringLeague('${l.key}')" aria-pressed="${l.key === leagueKey}">${FILTER_CHIP_LABELS[l.key] || l.label}</button>`).join('');
  sheet.innerHTML = `<div class="sc-head"><h3>Scoring</h3><p>Each team you draft earns these points on its own.</p></div>
    <div class="dr-ltabs sc-tabs">${tabs}</div>
    <div class="sc-rules">${rulesHtml(leagueKey)}</div>
    <div class="dr-modal-btns"><button class="dr-btn" onclick="closeScoringSheet()">Done</button></div>`;
}

// `key`: the league to open on; omitted, the last one shown.
export function openScoringSheet(key){
  if(key && LEAGUE_SCORING[key]) leagueKey = key;
  const el = overlay();
  if(!el) return;
  render();
  if(isSheetOpen(el)) return;
  openSheetOverlay(el);
  lockBodyScroll();
}
window.openScoringSheet = openScoringSheet;

export function closeScoringSheet(){
  const el = overlay();
  if(!isSheetOpen(el)) return;
  unlockBodyScroll();
  closeSheetOverlay(el);
}
window.closeScoringSheet = closeScoringSheet;

window.setScoringLeague = key => { leagueKey = key; render(); };

enableSheetSwipeToDismiss(document.getElementById('scoring-sheet-content'), closeScoringSheet);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeScoringSheet(); });
