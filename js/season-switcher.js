/* ============================================================
   The draft-class switch (the Settings page's Draft class chips, in
   js/identity.js) and the notice shown while an older class is on
   screen. Both are invisible while only one class exists. The switch itself is js/season.js's setActiveSeason, which
   remembers the choice per device and reloads — see that file for how a
   saved choice expires when a newer class ships.
   ============================================================ */
import { LATEST_SEASON_ID } from './seasons/index.js';
import { ACTIVE_SEASON_ID, setActiveSeason } from './season.js';

window.setSheetSeason = id => setActiveSeason(id);

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
