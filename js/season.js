/* ============================================================
   Which draft class this page load is showing (see
   js/seasons/index.js), plus the helpers that keep each class's
   stored state apart. Resolved once at module load — switching
   classes reloads the page (setActiveSeason) rather than swapping
   data out from under every module that already imported it.

   Order of precedence: ?season= in the URL (shareable), then the
   last choice saved on this device, then the newest class.
   ============================================================ */
import { SEASONS, SEASON_IDS, LATEST_SEASON_ID, LEGACY_SEASON_ID } from './seasons/index.js';

const SEASON_STORAGE_KEY = 'teamDashboardSeason';

function resolveActiveSeasonId(){
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('season');
    if(fromUrl && SEASONS[fromUrl]) return fromUrl;
  } catch (e){}
  try {
    const saved = localStorage.getItem(SEASON_STORAGE_KEY);
    if(saved && SEASONS[saved]) return saved;
  } catch (e){}
  return LATEST_SEASON_ID;
}

export const ACTIVE_SEASON_ID = resolveActiveSeasonId();
export const ACTIVE_SEASON = SEASONS[ACTIVE_SEASON_ID];
export const HAS_MULTIPLE_SEASONS = SEASON_IDS.length > 1;

// Namespaces a localStorage key by class. The legacy class keeps its
// original un-namespaced key so existing devices keep their data. The
// suffix goes on the key's BASE (before any ':' team/league part is
// appended) when used for a scan prefix, so a legacy-class prefix scan
// never matches another class's entries.
export function scopedKey(key){
  return ACTIVE_SEASON_ID === LEGACY_SEASON_ID ? key : `${key}@${ACTIVE_SEASON_ID}`;
}

// Same idea for worker routes: the worker reads ?season= and folds it
// into its KV key, and treats an absent param as the legacy class.
export function withSeasonQuery(url){
  return ACTIVE_SEASON_ID === LEGACY_SEASON_ID ? url : `${url}?season=${ACTIVE_SEASON_ID}`;
}

export function setActiveSeason(id){
  if(!SEASONS[id]) return;
  try { localStorage.setItem(SEASON_STORAGE_KEY, id); } catch (e){}
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('season', id);
    window.location.href = url.toString();
  } catch (e){
    window.location.reload();
  }
}
