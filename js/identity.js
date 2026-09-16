/* ============================================================
   Identity: which of the 10 drafters this device is "signed in" as.
   Deliberately not real auth — this is a friend-group app, not a
   walled system — just a persisted, visible choice (the outline
   initials circle in every view's header) instead of an implicit
   one.

   Kept separate from js/board.js's currentDraftTeamId (which
   roster is currently DISPLAYED on the Board/Standings views):
   opening a shared ?team= link only changes what's displayed (a
   "peek" — see setDraftTeam's own comment in js/board.js), it never
   silently reassigns who you are or who gets credited when you
   favorite a team. js/favorites.js always reads/writes against
   currentProfileId below, never currentDraftTeamId. Switching
   profile through the sheet here is the only thing that changes
   both at once (via chooseProfile -> window.setDraftTeam).
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { lockBodyScroll, unlockBodyScroll, enableSheetSwipeToDismiss, CHECK_ICON_SVG } from './utils.js';

const PROFILE_KEY = 'teamDashboardProfileId';

function loadProfileId(){
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if(saved && DRAFT_TEAMS.some(d => d.id === saved)) return saved;
  } catch (e){}
  return DRAFT_TEAMS[0].id;
}

export let currentProfileId = loadProfileId();

// "Josh" -> "J", "Eric Prister" -> "EP" — the header stays quiet
// everywhere; the switcher sheet below always shows full names, so
// nothing about "who" is ever actually ambiguous.
function initials(name){
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Repaints every header's identity circle and peek banner from
// current state. Called once at boot and by js/board.js's
// setDraftTeam whenever the displayed roster changes (peek or real
// switch) — that's the single choke point every path funnels through.
export function paintIdentityChrome(displayedDraftTeamId){
  const profile = DRAFT_TEAMS.find(d => d.id === currentProfileId);
  const viewing = DRAFT_TEAMS.find(d => d.id === displayedDraftTeamId) || profile;
  const isPeeking = displayedDraftTeamId !== currentProfileId;

  document.querySelectorAll('.id-circle').forEach(el => {
    el.textContent = initials(profile.name);
    el.title = profile.name;
  });

  document.querySelectorAll('.peek-banner').forEach(el => {
    el.classList.toggle('show', isPeeking);
    const nameEl = el.querySelector('.peek-name');
    if(nameEl) nameEl.textContent = viewing.name;
  });
}

export function openIdentitySheet(){
  const rowsEl = document.getElementById('identity-sheet-rows');
  if(!rowsEl) return;
  rowsEl.innerHTML = DRAFT_TEAMS.map(d => `
    <button class="sheet-row ${d.id === currentProfileId ? 'active' : ''}" onclick="chooseProfile('${d.id}')">
      <span>${d.name}</span>
      <span class="sheet-check">${d.id === currentProfileId ? CHECK_ICON_SVG : ''}</span>
    </button>
  `).join('');
  document.getElementById('identity-sheet-overlay').classList.add('open');
  lockBodyScroll();
}
window.openIdentitySheet = openIdentitySheet;

export function closeIdentitySheet(){
  document.getElementById('identity-sheet-overlay').classList.remove('open');
  unlockBodyScroll();
}
window.closeIdentitySheet = closeIdentitySheet;

export function chooseProfile(id){
  if(!DRAFT_TEAMS.some(d => d.id === id)) return;
  currentProfileId = id;
  try { localStorage.setItem(PROFILE_KEY, id); } catch (e){}
  closeIdentitySheet();
  // Also brings the displayed roster back in sync and repaints the
  // header/peek banner — see setDraftTeam in js/board.js.
  window.setDraftTeam(id);
}
window.chooseProfile = chooseProfile;

// The peek banner's "Back to yours" action.
export function backToMyBoard(){
  window.setDraftTeam(currentProfileId);
}
window.backToMyBoard = backToMyBoard;

enableSheetSwipeToDismiss(document.getElementById('identity-sheet-content'), closeIdentitySheet);
