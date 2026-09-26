/* ============================================================
   Favorite teams — same shared-KV pattern as League Facts
   (js/league-facts.js): one JSON array per drafter in Workers KV
   behind worker/rundown-proxy.js's /favorites/{id} route, with a
   localStorage mirror as the instant-render fallback.

   Always read/written against the current profile (js/identity.js),
   never against whichever roster happens to be displayed
   (currentDraftTeamId in js/board.js) — see identity.js's header
   comment for why those are different things. That's what makes it
   safe to favorite a team while peeking at someone else's board:
   the star still credits you.
   ============================================================ */
import { fetchJSON } from './utils.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { scopedKey, withSeasonQuery } from './season.js';
import { currentProfileId } from './identity.js';
import { renderBoard } from './board.js';

const FAVORITES_KEY = 'teamDashboardFavorites';

const favoritesCache = {}; // draftTeamId -> { data, loading, error }
function cacheFor(id){
  return favoritesCache[id] || (favoritesCache[id] = { data: null, loading: false, error: false });
}

function localKey(id){
  return `${scopedKey(FAVORITES_KEY)}:${id}`;
}

function loadLocalFavorites(id){
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(id)));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e){
    return [];
  }
}

function saveLocalFavorites(id, teamKeys){
  try {
    localStorage.setItem(localKey(id), JSON.stringify(teamKeys));
  } catch (e){
    // localStorage unavailable (private browsing, etc.) — favorites
    // just won't persist locally.
  }
}

// Synchronous read used everywhere the app needs "what's favorited
// right now": the shared copy once it's loaded, the local fallback
// until then. Kicks off the network fetch on first read, same
// lazy-load pattern as league-facts.js's currentLeagueFacts.
function currentFavoritesFor(id){
  const cache = cacheFor(id);
  if(cache.data === null && !cache.loading && !cache.error) fetchFavorites(id);
  return cache.data || loadLocalFavorites(id);
}

async function fetchFavorites(id){
  const cache = cacheFor(id);
  if(cache.data !== null || cache.loading || !DASHBOARD_WORKER_BASE) return;
  cache.loading = true;
  const data = await fetchJSON(withSeasonQuery(`${DASHBOARD_WORKER_BASE}/favorites/${id}`));
  cache.loading = false;
  // A toggle landed locally while this was in flight — don't clobber
  // it with the now-stale GET.
  if(cache.data !== null) return;
  if(Array.isArray(data)){
    const rendered = loadLocalFavorites(id);
    cache.data = data;
    if(id === currentProfileId){
      repaintAllStars();
      // A favorited team you didn't draft only appears on the Teams tab
      // once it's in this list (see teamsForCurrentDraftTeam in
      // js/board.js), so if the shared store disagrees with the
      // localStorage fallback the first render used (e.g. a new
      // device), the star repaint above isn't enough — the row itself
      // has to appear or disappear.
      const changed = data.length !== rendered.length || data.some(k => !rendered.includes(k));
      if(changed){
        saveLocalFavorites(id, data);
        renderBoard();
      }
    }
  } else {
    cache.error = true;
  }
}

// Fire-and-forget, same as league-facts.js's persistLeagueFacts — if
// it fails (offline, worker down) the toggle still sticks locally, it
// just won't show up on another device until the next successful sync.
function persistFavorites(id, teamKeys){
  saveLocalFavorites(id, teamKeys);
  if(!DASHBOARD_WORKER_BASE) return;
  fetch(withSeasonQuery(`${DASHBOARD_WORKER_BASE}/favorites/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamKeys)
  }).catch(err => console.warn('[Favorites]', id, 'failed to sync to shared store', err));
}

export function isFavorite(teamKey){
  return currentFavoritesFor(currentProfileId).includes(teamKey);
}

const STAR_PATH = 'M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L12 16.7l-5.3 2.9 1.1-5.9-4.3-4.1 5.9-.7z';
const STAR_FILLED_SVG = `<svg viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path></svg>`;
const STAR_OUTLINE_SVG = `<svg viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path></svg>`;

// Markup for one team's star toggle — only the team page head
// (js/live-data.js) gets this; that's the one place a favorite can be
// set or cleared.
export function favoriteStarHtml(teamKey){
  const active = isFavorite(teamKey);
  return `<button class="favorite-star${active ? ' active' : ''}" data-fav-key="${teamKey}" onclick="event.stopPropagation(); toggleFavorite('${teamKey}')" aria-label="${active ? 'Remove from favorites' : 'Add to favorites'}">${active ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</button>`;
}

// Read-only filled star for lists (Teams tab rows, Home's game cards):
// marks a team as favorited but isn't tappable — pointer-events: none
// lets a tap fall through to the row underneath. No data-fav-key, so
// repaintAllStars leaves it alone; those lists re-render on change.
export function favoriteMarkHtml(){
  return `<span class="favorite-star favorite-mark active" aria-label="Favorite">${STAR_FILLED_SVG}</span>`;
}

function repaintStar(btn, active){
  btn.classList.toggle('active', active);
  btn.innerHTML = active ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
  btn.setAttribute('aria-label', active ? 'Remove from favorites' : 'Add to favorites');
}

// Repaints every star currently on screen for one team key — there can
// be two at once (a Teams-tab row and an open team modal showing the
// same team), and both need to agree.
function repaintStarsFor(teamKey, active){
  document.querySelectorAll(`.favorite-star[data-fav-key="${teamKey}"]`).forEach(btn => repaintStar(btn, active));
}

// Used once a delayed fetchFavorites resolves — the initial render
// already used the localStorage fallback, which can disagree with
// what the shared store actually has.
function repaintAllStars(){
  document.querySelectorAll('.favorite-star').forEach(btn => {
    const key = btn.getAttribute('data-fav-key');
    if(key) repaintStar(btn, isFavorite(key));
  });
}

export function toggleFavorite(teamKey){
  const id = currentProfileId;
  const list = currentFavoritesFor(id);
  const next = list.includes(teamKey) ? list.filter(k => k !== teamKey) : list.concat(teamKey);
  cacheFor(id).data = next;
  persistFavorites(id, next);
  // Instant feedback on the team page's star (the only toggle).
  repaintStarsFor(teamKey, next.includes(teamKey));
  // Full resync of the Teams tab: a row's star can appear/disappear
  // entirely now (not just flip icon), and a favorited-but-not-drafted
  // team can enter or leave the list outright — an in-place DOM patch
  // can't express either of those, a re-render can.
  renderBoard();
}
window.toggleFavorite = toggleFavorite;
