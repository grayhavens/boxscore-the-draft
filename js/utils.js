/* ============================================================
   Generic helpers shared across the other js/ modules: network
   fetch, formatting, modal scroll-lock, team-name matching, and
   the small badge/icon markup every view reuses.
   ============================================================ */
import { LEAGUES, TEAM_META } from './data.js';

export async function fetchJSON(url){
  try {
    const res = await fetch(url);
    if(!res.ok) return null;
    return await res.json();
  } catch (e){
    return null;
  }
}

// ---- Admin password (scoring adjustments gate) ----
// Cached client-side once verified against the worker's /admin/verify
// route (see js/admin.js) — this is a "very basic" shared-secret gate
// appropriate for a friend-group app, not real per-user auth. Read by
// js/league-facts.js too, since a fact/adjustment write needs the same
// header the admin page already verified.
const ADMIN_PASSWORD_KEY = 'teamDashboardAdminPassword';

export function loadAdminPassword(){
  try {
    return localStorage.getItem(ADMIN_PASSWORD_KEY) || '';
  } catch (e){
    return '';
  }
}

export function saveAdminPassword(password){
  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, password);
  } catch (e){
    // localStorage unavailable — the password just won't be remembered.
  }
}

export function clearAdminPassword(){
  try {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
  } catch (e){}
}

// GET with the admin password attached — used only for /admin/verify,
// where a 401 is an expected "wrong password" outcome, not a failure to
// log. { ok, status } lets the caller tell "wrong password" (401) apart
// from "worker unreachable" (status 0).
export async function fetchAuthedJSON(url, password){
  try {
    const res = await fetch(url, { headers: { 'X-Admin-Password': password } });
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
  } catch (e){
    return { ok: false, status: 0, data: null };
  }
}

// PUT with the admin password attached and a JSON body — the write
// counterpart to fetchAuthedJSON, used for every facts/adjustments save.
export async function putAuthedJSON(url, password, body){
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify(body)
    });
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
  } catch (e){
    return { ok: false, status: 0, data: null };
  }
}

// Baseball-style win percentage — three decimals, no leading zero
// below 1.000 (.540, not 0.540) — used wherever a league's Standings
// "Person" combined-record view calls out a win% (NBA/NHL/MLB's
// combinedLabel, NFL/CFB/WNBA's renderByPersonRow).
export function formatWinPct(pct){
  const s = pct.toFixed(3);
  return pct >= 1 ? s : s.slice(1);
}

export function ordinal(n){
  n = parseInt(n, 10);
  if(isNaN(n)) return '—';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatKickoff(iso){
  if(!iso) return '';
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z');
  if(isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// Date-only sibling of formatKickoff above (weekday + month + day, no
// time/timezone) — used where a time or status is already shown right
// alongside it (the Game Details header's date line in js/live-data.js)
// so the two together don't repeat the same clock time twice.
export function formatDateShort(iso){
  if(!iso) return '';
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z');
  if(isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Mirrors the drafter/league/data-mode/tab selections into the URL's
// query string (?team=, ?league=, ?data=, ?view=) via
// history.replaceState — no reload, no new back-button entries — so a
// bookmark captures exactly what was on screen when it was saved, not
// just whatever this one browser's localStorage remembers. Each setter
// (setDraftTeam, setStandingsFilter, setObMode, switchView) calls this
// with its own key; a null value removes that param so the default,
// un-bookmarked state stays a clean URL with no query string at all.
export function updateUrlParam(key, value){
  try {
    const url = new URL(window.location.href);
    if(value === null || value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState(null, '', url);
  } catch (e){
    // URL/history unavailable (very old browser, sandboxed iframe,
    // etc.) — the app still works, it just won't be bookmarkable.
  }
}

// ---- Modal scroll lock ----
// Pins the page in place behind the modal (rather than just hiding
// overflow) so iOS Safari can't rubber-band-scroll the background
// while a modal is open. Restores the exact scroll position on close.
let lockedScrollY = 0;

export function lockBodyScroll(){
  lockedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.width = '100%';
}

export function unlockBodyScroll(){
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, lockedScrollY);
}

// ---- Bottom-sheet swipe-to-dismiss ----
// The mobile sheet's drag handle (.modal::before in css/style.css) is
// otherwise just a visual affordance with nothing behind it — this is
// what actually makes dragging it down close the sheet. Only active at
// the same breakpoint the CSS turns .modal into a bottom sheet; on
// desktop it's a centered dialog with no "down" to drag toward.
const SHEET_BREAKPOINT = '(max-width: 700px)';
const SHEET_DISMISS_DISTANCE = 90;   // px dragged down before it counts as a dismiss
const SHEET_DISMISS_VELOCITY = 0.5;  // or a flick faster than this (px/ms), regardless of distance

export function enableSheetSwipeToDismiss(sheetEl, closeFn){
  if(!sheetEl || sheetEl.dataset.swipeBound) return;
  sheetEl.dataset.swipeBound = '1';

  let dragging = false, startY = 0, startTime = 0, sheetHeight = 0;

  const reset = () => {
    dragging = false;
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
  };

  sheetEl.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1 || !window.matchMedia(SHEET_BREAKPOINT).matches) return;
    // Only hijack the gesture once scrolled to the top — otherwise this
    // is the user scrolling the sheet's own content, not dragging it.
    if(sheetEl.scrollTop > 0) return;
    dragging = true;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    sheetHeight = sheetEl.getBoundingClientRect().height;
    sheetEl.style.transition = 'none';
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if(!dragging) return;
    if(e.touches.length !== 1){ reset(); return; }
    const delta = e.touches[0].clientY - startY;
    if(delta <= 0){
      // Back toward (or past) the resting position — let it scroll
      // content normally instead of fighting it.
      sheetEl.style.transform = '';
      return;
    }
    e.preventDefault();
    sheetEl.style.transform = `translateY(${delta}px)`;
  }, { passive: false });

  const onTouchEnd = (e) => {
    if(!dragging) return;
    dragging = false;
    sheetEl.style.transition = '';
    const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
    const delta = endY - startY;
    const velocity = delta / Math.max(1, Date.now() - startTime);
    if(delta > 0 && (delta > SHEET_DISMISS_DISTANCE || velocity > SHEET_DISMISS_VELOCITY)){
      sheetEl.style.transform = `translateY(${sheetHeight}px)`;
      sheetEl.addEventListener('transitionend', function onEnd(){
        sheetEl.removeEventListener('transitionend', onEnd);
        sheetEl.style.transform = '';
        closeFn();
      });
    } else {
      sheetEl.style.transform = '';
    }
  };
  sheetEl.addEventListener('touchend', onTouchEnd);
  sheetEl.addEventListener('touchcancel', reset);
}

// A few real club names don't match our shorthand roster names
// (e.g. "Man City" vs the API's "Manchester City") — normalize both
// sides before comparing so "Drafted by" still finds the right owner.
const TEAM_NAME_ALIASES = {
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'spurs': 'tottenham hotspur',
  'afc bournemouth': 'bournemouth',
  // NBA: this app's short "Blazers" vs ESPN's real nickname "Trail
  // Blazers" — confirmed live (2026-09-12) against all 120 NBA/NHL/
  // MLB/WNBA drafted teams, the only mismatch left after switching
  // that matcher to exact-match (see findFlatTeamKey in
  // js/standings-flat.js) instead of findDraftedTeamByName's substring
  // rule, which turned out to have a real false-positive here: "Nets"
  // is a literal substring of "Hornets", so Charlotte Hornets was
  // matching to the Nets. (Dallas' "Mavs" was the other mismatch, since
  // fixed by using ESPN's own full nickname, "Mavericks", as this app's
  // own name instead of aliasing around it.)
  'blazers': 'trail blazers'
};

export function normalizeTeamName(name){
  let n = (name || '').toLowerCase().trim().replace(/\bafc\b/g, '').replace(/\bfc\b/g, '').replace(/\s+/g, ' ').trim();
  return TEAM_NAME_ALIASES[n] || n;
}

export function findDraftedTeamByName(leagueKey, realName){
  const league = LEAGUES.find(l => l.key === leagueKey);
  if(!league) return null;
  const target = normalizeTeamName(realName);
  return league.teams.find(teamKey => {
    const candidate = normalizeTeamName(TEAM_META[teamKey].name);
    return candidate === target || target.includes(candidate) || candidate.includes(target);
  }) || null;
}

export function abbrFromName(name){
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if(words.length >= 2) return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
  return (name || '').toUpperCase().slice(0, 3);
}

// Generic sliding segmented control — one shared implementation for
// every mutually-exclusive-view picker in the app (the Scores tab's
// Live/Upcoming/All, and every Standings tab's League/Drafted or
// Conference/Drafted toggle, plus the Divisions/Conference sub-toggle)
// instead of N separately hand-rolled ports of the same sliding-thumb
// interaction. Soft accent fill (.seg-btn.active/.seg-thumb) rather
// than a solid one — a full-width bar of solid gold read as louder/
// more button-like than anything else on the page.
// segments: [{ key, label }]. onClickFnName is the global (window.*)
// handler each caller already registers for its own state, called with
// the clicked segment's key — this only builds markup, callers still
// own their own mode state and re-render.
export function segmentedControlHtml(segments, activeKey, onClickFnName){
  const idx = Math.max(0, segments.findIndex(s => s.key === activeKey));
  const thumbStyle = `width:calc((100% - 6px) / ${segments.length}); transform: translateX(${idx * 100}%);`;
  const buttons = segments.map(s =>
    `<button type="button" class="seg-btn${s.key === activeKey ? ' active' : ''}" onclick="${onClickFnName}('${s.key}')">${s.label}</button>`
  ).join('');
  return `
    <div class="seg">
      <span class="seg-thumb" style="${thumbStyle}"></span>
      ${buttons}
    </div>
  `;
}

export const CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6L18 18"></path><path d="M18 6L6 18"></path></svg>';
export const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#0A0B0D" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
export const CHEVRON_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>';
// Goal marker for the EPL Match Center's events list (see
// soccerEventsHtml in js/live-data.js) — an abstract ball rather than a
// real pentagon pattern, kept to the same hairline-stroke language as
// the icons above.
export const BALL_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.4"></circle><path d="M12 7.4l2.7 2-1 3.2h-3.4l-1-3.2 2.7-2z" fill="currentColor" stroke="none"></path><path d="M12 3.6v3.2M12 17.2v3.2M5.2 8.4l2.7.9M16.1 8.4l-2.7.9M5.2 15.6l2.7-.9M16.1 15.6l-2.7-.9" stroke-linecap="round"></path></svg>';

// A handful of ESPN crests are a single dark, thin-lined mark with no
// built-in backing shape (e.g. the Padres' brown "SD", the Yankees'
// navy interlock) — fine on the white backdrop crests used to sit on,
// but they wash into the app's near-black background now that crests
// render bare (see .badge.badge-crest in css/style.css). ESPN serves
// an alternate white/bright rendering of the same crest at the same
// path with "500" swapped for "500-dark", so those specific teams
// carry a badgeUrlDark in TEAM_META instead of hand-drawn overrides.
export function crestSrc(meta){
  return meta.badgeUrlDark || meta.badgeUrl;
}

// Renders a team's badge: the real crest image when meta.badgeUrl is
// set, layered over the same colored-monogram box every team already
// has — that box stays as the fallback (onerror removes the img,
// revealing it) since hotlinked images can occasionally fail to load,
// and it's what every team without a badgeUrl yet still uses as-is.
export function teamBadgeHtml(meta){
  if(meta.badgeUrl){
    // data-fallback-* carries the original colored-monogram look over
    // to the onerror handler, restored only if the hotlinked image
    // actually fails to load.
    return `<div class="badge badge-crest"><img src="${crestSrc(meta)}" alt="${meta.name}" data-fallback-style="${meta.badgeStyle}" data-fallback-text="${meta.badgeText}" onerror="const p=this.parentElement; p.className='badge'; p.setAttribute('style', this.dataset.fallbackStyle); p.textContent=this.dataset.fallbackText;"></div>`;
  }
  return `<div class="badge" style="${meta.badgeStyle}">${meta.badgeText}</div>`;
}
