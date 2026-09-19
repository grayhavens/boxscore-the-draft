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

   Also owns the first-run welcome: a device with no saved profile
   gets a two-step modal (pick your name, then how to add the site to
   the Home Screen) instead of silently defaulting to the first
   drafter. See maybeShowWelcome below.
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

// True only when storage is readable AND holds no valid profile yet —
// a device whose storage throws (private mode) never gets the welcome,
// since it would just reappear on every load.
function needsWelcome(){
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    return !(saved && DRAFT_TEAMS.some(d => d.id === saved));
  } catch (e){
    return false;
  }
}

// "Josh" -> "J", "Eric P" -> "EP" — the header stays quiet
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
  `).join('') + (installPlatform() ? `
    <button class="sheet-row" onclick="openInstallGuideFromSheet()">
      <span class="sheet-row-text">
        Add to Home Screen
        <span class="sheet-desc" style="display:block">Open Boxscore like an app</span>
      </span>
    </button>
  ` : '');
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

/* ============================================================
   Welcome (first run) + "Add to Home Screen" guide
   ============================================================ */

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// 'ios' | 'android' | null. null (desktop, or already installed) means
// there's nothing useful to show, so the install step is skipped and
// the sheet's "Add to Home Screen" row is hidden.
function installPlatform(){
  if(isStandalone()) return null;
  const ua = navigator.userAgent || '';
  if(/Android/.test(ua)) return 'android';
  // iPadOS reports itself as a Mac; touch points give it away.
  if(/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
}

// Chrome on Android fires this when the site is installable; holding on
// to it lets the guide offer a real one-tap Install button.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

const SHARE_ICON_SVG = '<svg class="welcome-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"></path></svg>';

// Safari's page-menu button (left of the address bar in current iOS).
const MENU_ICON_SVG = '<svg class="welcome-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h11M4 17h7"></path></svg>';

const INSTALL_STEPS = {
  ios: [
    `Tap the menu ${MENU_ICON_SVG} at the left of Safari&rsquo;s address bar, then tap <b>Share</b> ${SHARE_ICON_SVG} at the top of the list.<span class="welcome-step-alt">On older iPhones, Share is the ${SHARE_ICON_SVG} button in the bottom bar instead.</span>`,
    'Scroll down and tap <b>Add to Home Screen</b>.',
    'Tap <b>Add</b>. Boxscore now lives on your Home Screen.'
  ],
  android: [
    'Tap the <b>&#8942;</b> menu in Chrome.',
    'Tap <b>Install app</b> (or <b>Add to Home screen</b>).',
    'Tap <b>Install</b>. Boxscore now lives on your Home Screen.'
  ]
};

const welcomeEl = () => document.getElementById('welcome-content');

function openWelcomeOverlay(){
  const overlay = document.getElementById('welcome-overlay');
  if(!overlay || overlay.classList.contains('open')) return;
  overlay.classList.add('open');
  lockBodyScroll();
}

export function closeWelcome(){
  const overlay = document.getElementById('welcome-overlay');
  if(!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  unlockBodyScroll();
}
window.closeWelcome = closeWelcome;

// The name-picking step can't be dismissed (it's the whole point of the
// welcome); the install step can, by tapping outside it.
export function dismissWelcomeOverlay(){
  if(welcomeEl().dataset.step === 'install') closeWelcome();
}
window.dismissWelcomeOverlay = dismissWelcomeOverlay;

function renderWelcomeNames(){
  const el = welcomeEl();
  el.dataset.step = 'names';
  el.innerHTML = `
    <div class="welcome-head">
      <div class="welcome-eyebrow">Welcome to</div>
      <div class="welcome-title">The Draft</div>
      <div class="welcome-sub">Every drafted team, every league, scored live. First things first &mdash; who are you?</div>
    </div>
    <div class="welcome-names">
      ${DRAFT_TEAMS.map(d => `
        <button class="sheet-row" onclick="chooseWelcomeProfile('${d.id}')">
          <span>${d.name}</span>
          <span class="welcome-chev">&rsaquo;</span>
        </button>
      `).join('')}
    </div>
  `;
  el.scrollTop = 0;
}

function renderWelcomeInstall(platform, greetName){
  const el = welcomeEl();
  el.dataset.step = 'install';
  const steps = INSTALL_STEPS[platform].map((html, i) => `
    <li><span class="welcome-step-num">${i + 1}</span><span class="welcome-step-text">${html}</span></li>
  `).join('');
  const installBtn = platform === 'android' && deferredInstallPrompt
    ? '<button class="modal-cta" onclick="runInstallPrompt()">Install now</button>'
    : '';
  const iosNote = platform === 'ios'
    ? '<div class="welcome-note">Heads up: the Home Screen app keeps its own memory, so it will ask who you are once more the first time you open it.</div>'
    : '';
  el.innerHTML = `
    <div class="welcome-head">
      ${greetName ? `<div class="welcome-eyebrow">You&rsquo;re in, ${greetName}</div>` : ''}
      <div class="welcome-title">Add it to your Home Screen</div>
      <div class="welcome-sub">It opens full-screen like a real app &mdash; the best way to follow live games.</div>
    </div>
    ${installBtn}
    <ol class="welcome-steps">${steps}</ol>
    ${iosNote}
    <div class="welcome-actions">
      <button class="modal-cta" onclick="closeWelcome()">Done</button>
      <button class="welcome-skip" onclick="closeWelcome()">Not now</button>
    </div>
  `;
  el.scrollTop = 0;
}

export function runInstallPrompt(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  closeWelcome();
}
window.runInstallPrompt = runInstallPrompt;

export function chooseWelcomeProfile(id){
  if(!DRAFT_TEAMS.some(d => d.id === id)) return;
  currentProfileId = id;
  try { localStorage.setItem(PROFILE_KEY, id); } catch (e){}
  // Someone who arrived through a ?team= link keeps looking at that
  // board (as a peek) rather than being yanked to their own; anyone
  // else lands on their own.
  let peek = null;
  try { peek = new URLSearchParams(window.location.search).get('team'); } catch (e){}
  window.setDraftTeam(peek && DRAFT_TEAMS.some(d => d.id === peek) ? peek : id);

  const platform = installPlatform();
  if(platform){
    renderWelcomeInstall(platform, DRAFT_TEAMS.find(d => d.id === id).name);
  } else {
    closeWelcome();
  }
}
window.chooseWelcomeProfile = chooseWelcomeProfile;

// Called once at the end of boot (js/board.js), after the board has
// rendered behind it.
export function maybeShowWelcome(){
  if(!needsWelcome()) return;
  renderWelcomeNames();
  openWelcomeOverlay();
}

// The identity sheet's "Add to Home Screen" row.
export function openInstallGuideFromSheet(){
  const platform = installPlatform();
  closeIdentitySheet();
  if(!platform) return;
  renderWelcomeInstall(platform, null);
  openWelcomeOverlay();
}
window.openInstallGuideFromSheet = openInstallGuideFromSheet;
