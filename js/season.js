/* ============================================================
   Which draft class this page load is showing (see
   js/seasons/index.js), plus the helpers that keep each class's
   stored state apart. Resolved once at module load — switching
   classes reloads the page (setActiveSeason) rather than swapping
   data out from under every module that already imported it.

   Order of precedence: ?season= in the URL (shareable), then the last
   choice made in Settings on this device, then the newest class.

   A saved choice remembers which class was newest when it was made
   ({ id, latest }) and only holds while that is still true. Otherwise a
   device that once looked at an old class would stay on it forever and
   never see the next class when it ships; instead, a new class resets
   everyone to the newest and they can switch back if they want.
   ============================================================ */
import { SEASONS, SEASON_IDS, LATEST_SEASON_ID, LEGACY_SEASON_ID } from './seasons/index.js';

const SEASON_STORAGE_KEY = 'teamDashboardSeason';

// Pure so it can be unit-tested (tests/season.test.mjs).
export function chooseSeasonId({ fromUrl, saved, ids, latest }){
  if(fromUrl && ids.includes(fromUrl)) return fromUrl;
  if(saved && ids.includes(saved.id) && saved.latest === latest) return saved.id;
  return latest;
}

function loadSavedChoice(){
  try {
    const parsed = JSON.parse(localStorage.getItem(SEASON_STORAGE_KEY));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e){
    return null;   // absent, unreadable, or an older plain-string value: treat as no choice
  }
}

function resolveActiveSeasonId(){
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(window.location.search).get('season'); } catch (e){}
  return chooseSeasonId({ fromUrl, saved: loadSavedChoice(), ids: SEASON_IDS, latest: LATEST_SEASON_ID });
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

// Switches class and reloads (see the header for why). Choosing the newest
// class clears the saved choice and the ?season= pin, so it goes back to
// simply following "newest"; choosing an older one remembers it.
export function setActiveSeason(id){
  if(!SEASONS[id]) return;
  const isLatest = id === LATEST_SEASON_ID;
  try {
    if(isLatest) localStorage.removeItem(SEASON_STORAGE_KEY);
    else localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify({ id, latest: LATEST_SEASON_ID }));
  } catch (e){}
  try {
    const url = new URL(window.location.href);
    if(isLatest) url.searchParams.delete('season'); else url.searchParams.set('season', id);
    window.location.href = url.toString();
  } catch (e){
    window.location.reload();
  }
}
