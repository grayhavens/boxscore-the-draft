/* ============================================================
   Identity: which of the 10 drafters this device is "signed in" as.
   Deliberately not real auth — this is a friend-group app, not a
   walled system — just a persisted, visible choice (made from the
   Settings page behind the gear in every view's header) instead of an
   implicit one. Also renders the Settings page (#view-settings) that
   gear opens, which hosts the per-device preferences in js/settings.js.

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
   gets a modal (how to add the site to the Home Screen when it's a
   phone browser, then pick your name, then the feature tour from
   js/guide.js) instead of silently defaulting to the first drafter.
   See maybeShowWelcome below.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { ACTIVE_GROUP } from './group.js';
import { GROUP_DOMAIN } from './groups.js';
import { getSettings, THEME_OPTIONS, LANDING_OPTIONS } from './settings.js';
import { lockBodyScroll, unlockBodyScroll, isSheetOpen, openSheetOverlay, closeSheetOverlay, enableSheetSwipeToDismiss, CHECK_ICON_SVG } from './utils.js';
import { SEASON_IDS } from './seasons/index.js';
import { personalMockRoom } from './draft-rules.js';
import { ACTIVE_SEASON_ID, HAS_MULTIPLE_SEASONS } from './season.js';
import './season-switcher.js';
import { APP_VERSION } from './version.js';
import { PUSH_KINDS, loadPushConfig, pushAvailability, pushPrefs, setPushPref, sendTestPush, syncPushDevice } from './push.js';
import { startTour, endTour } from './guide.js';

import { buttonHtml, backLinkHtml, switchHtml } from './ui.js';
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

// Repaints every header's peek banner from current state. Called once at boot and by js/board.js's
// setDraftTeam whenever the displayed roster changes (peek or real
// switch) — that's the single choke point every path funnels through.
export function paintIdentityChrome(displayedDraftTeamId){
  const profile = DRAFT_TEAMS.find(d => d.id === currentProfileId);
  const viewing = DRAFT_TEAMS.find(d => d.id === displayedDraftTeamId) || profile;
  const isPeeking = displayedDraftTeamId !== currentProfileId;

  document.querySelectorAll('.peek-banner').forEach(el => {
    el.classList.toggle('show', isPeeking);
    const nameEl = el.querySelector('.peek-name');
    if(nameEl) nameEl.textContent = viewing.name;
  });
}

const sheetRows = () => document.getElementById('identity-sheet-rows');
const setSheetTitle = t => { document.getElementById('identity-sheet-title').textContent = t; };

/* ---- Settings page (#view-settings) ----
   A full page pushed in from the header gear (openSettings in
   js/board.js), not a sheet: one scrolling column of cards, every
   control saving the moment it's tapped. renderSettingsPage builds it
   once per open; after that each control repaints itself in place
   (paintSettingsPage) so the scroll position never resets. The sheet
   (#identity-sheet-overlay) is kept only for the drafter switcher the
   identity card opens.
   At 900px and up (css/style.css "Settings, wide") the identity card and
   the device note sit in a sticky column (.set-side) beside the sections
   (.set-main); under 900px both wrappers are display: contents, so the
   phone page is the same single column it always was. */
const settingsEl = () => document.getElementById('settings-content');

const THEME_SWATCH = {
  dark: '#0A0B0D',
  light: '#F4F3EF',
  auto: 'linear-gradient(135deg,#0A0B0D 50%,#F4F3EF 50%)'
};

function switchRowHtml(key, title, sub, on, onclick){
  return `
    <button type="button" class="set-row" data-switch="${key}" role="switch" aria-checked="${on}" onclick="${onclick}">
      <span class="set-row-text"><span class="set-row-title">${title}</span><span class="set-row-sub">${sub}</span></span>
      ${switchHtml({ on })}
    </button>`;
}

function sectionHtml(label, body){
  return `<section class="set-section"><div class="set-label">${label}</div>${body}</section>`;
}

const LOGO_HTML = '<a class="app-logo-link" href="#" onclick="switchView(\'board\'); return false;" aria-label="Home"><img class="app-logo" src="icons/logo-header.png" alt=""></a>';

// backLabel names the page the back button returns to (js/board.js).
export function renderSettingsPage(backLabel = 'Back'){
  const el = settingsEl();
  if(!el) return;
  const s = getSettings();
  const me = DRAFT_TEAMS.find(d => d.id === currentProfileId);
  const fake = (window.getObMode ? window.getObMode() : 'real') === 'simulated';
  el.innerHTML = `
    <div class="set-head">
      <div class="page-header">
        <div class="page-header-top">${LOGO_HTML}<h1>Settings</h1></div>
      </div>
      <div class="ob-back-row">
        ${backLinkHtml({ label: backLabel, onclick: 'closeSettings()' })}
      </div>
    </div>
    <aside class="set-side">
      <button type="button" class="set-identity" onclick="openProfileSwitcher()">
        <span class="set-mono" id="set-mono">${me.name.charAt(0)}</span>
        <span class="set-identity-text"><span class="set-identity-name" id="set-name">${me.name}</span><span class="set-row-sub">Drafting on this device</span></span>
        <span class="set-identity-switch">Switch</span>
      </button>
      <div class="set-side-foot">Saved on this device only<br>Version ${APP_VERSION}</div>
    </aside>
    <div class="set-main">
    ${sectionHtml('App', `
      <button type="button" class="set-row" onclick="openGuide()">
        <span class="set-row-text"><span class="set-row-title">How Boxscore works</span><span class="set-row-sub">Every feature and where to find it</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>${installPlatform() ? `
      <button type="button" class="set-row" onclick="openInstallGuide()">
        <span class="set-row-text"><span class="set-row-title">Add to Home Screen</span><span class="set-row-sub">Open Boxscore like an app</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>` : ''}`)}
    ${sectionHtml('Appearance', `<div class="set-themes">${THEME_OPTIONS.map(([v, label]) => `
      <button type="button" class="set-theme ${v === s.theme ? 'on' : ''}" data-theme-opt="${v}" aria-pressed="${v === s.theme}" onclick="setSetting('theme', '${v}')">
        <span class="set-swatch" style="background:${THEME_SWATCH[v]}"></span>
        <span class="set-theme-label">${label}</span>
      </button>`).join('')}</div>`)}
    ${sectionHtml('Open app to', `<div class="set-chips">${LANDING_OPTIONS.map(([v, label]) => `
      <button type="button" class="set-chip ${v === s.landing ? 'on' : ''}" data-landing-opt="${v}" aria-pressed="${v === s.landing}" onclick="setSetting('landing', '${v}')">${label}</button>`).join('')}</div>`)}
    <div id="set-alerts"></div>
    ${sectionHtml('Chat', switchRowHtml('chatBadge', 'Unread badge', 'Message count on the Chat tab', s.chatBadge, "setSetting('chatBadge', !getSettingsValue('chatBadge'))"))}
    ${sectionHtml('League', `
      <button type="button" class="set-row" onclick="openDraftPicker()">
        <span class="set-row-text"><span class="set-row-title">Draft</span><span class="set-row-sub">Mock or live</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>
      <button type="button" class="set-row" onclick="switchView('admin')">
        <span class="set-row-text"><span class="set-row-title">Commissioner</span><span class="set-row-sub">Draft &amp; scoring</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>
      ${switchRowHtml('obMode', 'Preview with fake data', 'Points tab only', fake, 'toggleSettingsObMode()')}`)}
    ${HAS_MULTIPLE_SEASONS ? sectionHtml('Draft class', `<div class="set-chips">${SEASON_IDS.map(id => `
      <button type="button" class="set-chip ${id === ACTIVE_SEASON_ID ? 'on' : ''}" aria-pressed="${id === ACTIVE_SEASON_ID}" onclick="setSheetSeason('${id}')">${id}</button>`).join('')}</div>`) : ''}
    </div>
    <div class="set-foot">Saved on this device only</div>
    <div class="set-foot set-version">Version ${APP_VERSION}</div>
  `;
  loadPushConfig().then(paintAlertsSection);
}

/* ---- Alerts (push notifications, js/push.js) ----
   Filled in once the worker's push config has loaded, and left empty
   when push is off (no keys on the worker, or a browser without it). */

let alertsNote = '';
let alertsBusy = false;

function alertsInfoRow(title, sub, onclick){
  return onclick
    ? `<button type="button" class="set-row" onclick="${onclick}"><span class="set-row-text"><span class="set-row-title">${title}</span><span class="set-row-sub">${sub}</span></span><span class="set-chev">&rsaquo;</span></button>`
    : `<div class="set-row"><span class="set-row-text"><span class="set-row-title">${title}</span><span class="set-row-sub">${sub}</span></span></div>`;
}

function paintAlertsSection(){
  const el = document.getElementById('set-alerts');
  if(!el) return;
  const availability = pushAvailability();
  let body = '';
  if(availability === 'install'){
    body = alertsInfoRow('Add to Home Screen first', 'iPhone only sends alerts to Boxscore opened from your Home Screen', 'openInstallGuide()');
  } else if(availability === 'blocked'){
    body = alertsInfoRow('Notifications are blocked', 'Allow them for Boxscore in your device or browser settings');
  } else if(availability === 'ready'){
    const prefs = pushPrefs();
    body = PUSH_KINDS.map(([kind, title, sub]) => switchRowHtml(`push-${kind}`, title, sub, prefs[kind], `togglePushPref('${kind}')`)).join('');
    if(Object.values(prefs).some(Boolean)){
      body += alertsInfoRow('Send a test alert', 'Check this device gets them', 'sendTestAlert()');
    }
  }
  if(body && alertsNote) body += `<div class="set-foot">${alertsNote}</div>`;
  el.innerHTML = body ? sectionHtml('Alerts', body) : '';
}

window.togglePushPref = async kind => {
  if(alertsBusy) return;
  alertsBusy = true;
  alertsNote = '';
  try {
    await setPushPref(currentProfileId, kind, !pushPrefs()[kind]);
  } catch (e){
    alertsNote = e.message === 'permission' ? 'Alerts need notification permission.' : 'Couldn\u2019t reach Boxscore. Try again in a moment.';
  }
  alertsBusy = false;
  paintAlertsSection();
};

window.sendTestAlert = async () => {
  alertsNote = 'Sending\u2026';
  paintAlertsSection();
  try {
    await sendTestPush(currentProfileId);
    alertsNote = 'Sent. It should show up in a few seconds.';
  } catch (e){
    alertsNote = 'The test didn\u2019t go through. Turn alerts off and on, then try again.';
  }
  paintAlertsSection();
};

function setSwitch(key, on){
  const row = settingsEl()?.querySelector(`[data-switch="${key}"]`);
  if(!row) return;
  row.setAttribute('aria-checked', on);
  row.querySelector('.switch').classList.toggle('on', on);
}

// Repaints every control's selected state from current values without
// rebuilding the page.
function paintSettingsPage(){
  const el = settingsEl();
  if(!el || !el.firstElementChild) return;
  const s = getSettings();
  el.querySelectorAll('[data-theme-opt]').forEach(b => {
    const on = b.dataset.themeOpt === s.theme;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  el.querySelectorAll('[data-landing-opt]').forEach(b => {
    const on = b.dataset.landingOpt === s.landing;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  setSwitch('chatBadge', s.chatBadge);
  setSwitch('obMode', (window.getObMode ? window.getObMode() : 'real') === 'simulated');
  const me = DRAFT_TEAMS.find(d => d.id === currentProfileId);
  const name = document.getElementById('set-name');
  if(name) name.textContent = me.name;
  const mono = document.getElementById('set-mono');
  if(mono) mono.textContent = me.name.charAt(0);
}

window.addEventListener('boxscore:settings', paintSettingsPage);

window.getSettingsValue = key => getSettings()[key];

window.toggleSettingsObMode = () => {
  const fake = (window.getObMode ? window.getObMode() : 'real') === 'simulated';
  window.setObMode(fake ? 'real' : 'simulated');
  paintSettingsPage();
};

// The identity card's drafter switcher: the one job the sheet still has.
export function openProfileSwitcher(){
  if(!sheetRows()) return;
  setSheetTitle('Who are you?');
  // Open spots (js/groups.js) are nobody yet, so they aren't offered.
  sheetRows().innerHTML = DRAFT_TEAMS.filter(d => !d.open || d.id === currentProfileId).map(d => `
    <button class="sheet-row ${d.id === currentProfileId ? 'active' : ''}" onclick="chooseProfile('${d.id}')">
      <span>${d.name}</span>
      <span class="sheet-check">${d.id === currentProfileId ? CHECK_ICON_SVG : ''}</span>
    </button>
  `).join('');
  openSheetOverlay(document.getElementById('identity-sheet-overlay'));
  lockBodyScroll();
}
window.openProfileSwitcher = openProfileSwitcher;

// The Draft tile's picker, in the same sheet: your own mock room or the
// real one. (The group's shared rehearsal room is on Commissioner.)

export function openDraftPicker(){
  if(!sheetRows()) return;
  setSheetTitle('Draft');
  sheetRows().innerHTML = `
    <button class="sheet-row" onclick="goToMyMockDraft()">
      <span class="sheet-row-text">Mock Draft<span class="sheet-desc block">Your own practice room &middot; picks don&rsquo;t count</span></span>
      <span class="set-chev">&rsaquo;</span>
    </button>
    <button class="sheet-row" onclick="goToDraftRoom('main')">
      <span class="sheet-row-text">Live Draft<span class="sheet-desc block">The real draft lobby</span></span>
      <span class="set-chev">&rsaquo;</span>
    </button>`;
  openSheetOverlay(document.getElementById('identity-sheet-overlay'));
  lockBodyScroll();
}
window.openDraftPicker = openDraftPicker;

// js/draft-client.js reads the room from ?room= once, at load, so
// changing rooms means loading the draft view fresh on the new URL.
// Staying in the same room is just a view switch.
export function goToDraftRoom(room){
  closeIdentitySheet();
  let current = 'main';
  try { current = new URLSearchParams(window.location.search).get('room') || 'main'; } catch (e){}
  if(room === current){ window.switchView('draft'); return; }
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', 'draft');
  if(room !== 'main') url.searchParams.set('room', room);
  window.location.href = url.toString();
}
window.goToDraftRoom = goToDraftRoom;

// Mock Draft: your own room, against bots, that nobody else is sent to.
// Needs to know who you are first.
export function goToMyMockDraft(){
  if(!currentProfileId){ openProfileSwitcher(); return; }
  goToDraftRoom(personalMockRoom(currentProfileId));
}
window.goToMyMockDraft = goToMyMockDraft;

export function closeIdentitySheet(){
  unlockBodyScroll();
  closeSheetOverlay(document.getElementById('identity-sheet-overlay'));
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
  paintSettingsPage();
  syncPushDevice(id);
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
    `Tap <b>Share</b> ${SHARE_ICON_SVG} in Safari (on newer iPhones it&rsquo;s under the ${MENU_ICON_SVG} menu).`,
    'Tap <b>Add to Home Screen</b>, then <b>Add</b>.'
  ],
  android: [
    'Tap the <b>&#8942;</b> menu in Chrome (other browsers: look for <b>Install app</b> or <b>Add to Home screen</b>).',
    'Tap <b>Install app</b>, then <b>Install</b>.'
  ]
};

const welcomeEl = () => document.getElementById('welcome-content');

function openWelcomeOverlay(){
  const overlay = document.getElementById('welcome-overlay');
  if(!overlay || isSheetOpen(overlay)) return;
  openSheetOverlay(overlay);
  lockBodyScroll();
}

export function closeWelcome(){
  const overlay = document.getElementById('welcome-overlay');
  endTour();
  if(!isSheetOpen(overlay)) return;
  unlockBodyScroll();
  closeSheetOverlay(overlay);
}
window.closeWelcome = closeWelcome;

// The name-picking step can't be dismissed (it's the whole point of the
// welcome); the install step and the tour can, by tapping outside them.
// A first-run install step dismissed that way moves on to the names.
export function dismissWelcomeOverlay(){
  const step = welcomeEl().dataset.step;
  if(step === 'install') skipInstall();
  else if(step === 'tour') closeWelcome();
}

// The feature tour (js/guide.js), right after the name pick.
function showTour(){
  startTour(welcomeEl(), { drafter: currentProfileId, onDone: closeWelcome });
}

// Set while the install step opens a first-run welcome (not the Settings
// row). It comes before the name pick because the iPhone Home Screen app
// keeps its own storage and would ask for the name again; "Continue in
// browser" means they're staying, so the names (and then the tour) follow.
let namesAfterInstall = false;

export function skipInstall(){
  if(namesAfterInstall){
    namesAfterInstall = false;
    renderWelcomeNames();
  } else {
    closeWelcome();
  }
}
window.skipInstall = skipInstall;
window.dismissWelcomeOverlay = dismissWelcomeOverlay;

function renderWelcomeNames(){
  const el = welcomeEl();
  el.dataset.step = 'names';
  el.innerHTML = `
    <div class="welcome-head">
      <div class="welcome-eyebrow">Welcome to</div>
      <div class="welcome-title">Boxscore</div>
      <div class="welcome-sub">Every team drafted in ${ACTIVE_GROUP.name}, followed and scored live. First things first &mdash; who are you?</div>
    </div>
    <div class="welcome-names">
      ${DRAFT_TEAMS.filter(d => !d.open).map(d => `
        <button class="sheet-row" onclick="chooseWelcomeProfile('${d.id}')">
          <span>${d.name}</span>
          <span class="welcome-chev">&rsaquo;</span>
        </button>
      `).join('')}
    </div>
    ${DRAFT_TEAMS.some(d => d.open) ? `
      <p class="welcome-unlisted">Not listed? Claim a spot at <a href="https://${GROUP_DOMAIN}/">${GROUP_DOMAIN}</a>, and your name shows up here once the commissioner confirms it.</p>` : ''}
  `;
  el.scrollTop = 0;
}

function renderWelcomeInstall(platform, firstRun){
  const el = welcomeEl();
  el.dataset.step = 'install';
  const steps = INSTALL_STEPS[platform].map((html, i) => `
    <li><span class="welcome-step-num">${i + 1}</span><span class="welcome-step-text">${html}</span></li>
  `).join('');
  const installBtn = platform === 'android' && deferredInstallPrompt
    ? buttonHtml({ label: 'Install now', onclick: 'runInstallPrompt()' })
    : '';
  el.innerHTML = `
    <div class="welcome-head">
      ${firstRun ? '<div class="welcome-eyebrow">Welcome to Boxscore</div>' : ''}
      <div class="welcome-title">${platform === 'android' ? 'Install Boxscore' : 'Add it to your Home Screen'}</div>
      <div class="welcome-sub">It opens full screen like a real app, and it&rsquo;s where alerts work.</div>
    </div>
    ${installBtn}
    <ol class="welcome-steps">${steps}</ol>
    <div class="welcome-actions">
      ${firstRun
        ? '<button class="welcome-skip" onclick="skipInstall()">Continue in browser</button>'
        : buttonHtml({ label: 'Done', onclick: 'closeWelcome()' })}
    </div>
  `;
  el.scrollTop = 0;
}

export function runInstallPrompt(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  skipInstall();
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
  showTour();
}
window.chooseWelcomeProfile = chooseWelcomeProfile;

// Called once at the end of boot (js/board.js), after the board has
// rendered behind it.
export function maybeShowWelcome(){
  if(!needsWelcome()) return;
  const platform = installPlatform();
  if(platform){
    namesAfterInstall = true;
    renderWelcomeInstall(platform, true);
  } else {
    renderWelcomeNames();
  }
  openWelcomeOverlay();
}

// The Settings page's "Add to Home Screen" row.
export function openInstallGuide(){
  const platform = installPlatform();
  if(!platform) return;
  namesAfterInstall = false;
  renderWelcomeInstall(platform, false);
  openWelcomeOverlay();
}
window.openInstallGuide = openInstallGuide;
