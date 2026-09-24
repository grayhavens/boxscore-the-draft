/* ============================================================
   The draft-class switch (Settings -> League) and the notice shown while
   an older class is on screen. Both are invisible while only one class
   exists. The switch itself is js/season.js's setActiveSeason, which
   remembers the choice per device and reloads — see that file for how a
   saved choice expires when a newer class ships.
   ============================================================ */
import { SEASON_IDS, LATEST_SEASON_ID } from './seasons/index.js';
import { ACTIVE_SEASON_ID, HAS_MULTIPLE_SEASONS, setActiveSeason } from './season.js';
import { segmentedControlHtml } from './utils.js';

window.setSheetSeason = id => setActiveSeason(id);

// Top of the League tab: which year's draft the whole app is showing.
export function seasonSettingsRowHtml(){
  if(!HAS_MULTIPLE_SEASONS) return '';
  return `
    <div class="settings-section">Draft Class</div>
    <div class="settings-row"><span>Viewing<span class="sheet-desc">Whose teams and points you see</span></span>${segmentedControlHtml(SEASON_IDS.map(id => ({ key: id, label: id })), ACTIVE_SEASON_ID, 'setSheetSeason')}</div>`;
}

// A slim bar at the top of the page while on an older class, so nobody
// mistakes last year's board for this year's.
export function paintSeasonBanner(){
  const board = document.querySelector('.board');
  if(!board || ACTIVE_SEASON_ID === LATEST_SEASON_ID || document.getElementById('season-banner')) return;
  board.insertAdjacentHTML('afterbegin', `
    <div class="season-banner" id="season-banner">
      <span>Viewing the ${ACTIVE_SEASON_ID} draft class</span>
      <button type="button" onclick="setSheetSeason('${LATEST_SEASON_ID}')">Switch to ${LATEST_SEASON_ID}</button>
    </div>`);
}
