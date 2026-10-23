// ---- Updates while the app stays open ----
// iOS keeps a Home Screen app alive in the background for hours, and
// before this nothing in an open app ever asked whether a new version
// had shipped: a new service worker only arrived with a fresh launch or a
// push (docs/optimization-report.md, Phase 4 #2). Worse, the code on
// screen and the files a later lazy import() fetches could come from two
// different deploys, and a lazy module that needs a new export from an
// already-loaded old one fails to link, for good, until a reload
// (Phase 4 #3).
//
// So:
// - Back in the foreground after UPDATE_CHECK_AWAY_MS away, ask the
//   service worker registration to check for a new sw.js (one small
//   fetch). sw.js skips waiting and claims the page, so a new version
//   shows up here as `controllerchange`.
// - After that, reload at the next safe moment (isSafeToReload): a
//   read-only view showing, no sheet open, nothing being typed. Never the
//   draft room, chat, a team page or the console. The view lives in the
//   URL, so a reload lands on the same screen, and the launch splash plays
//   only once a session (js/launch-splash.js), so it's a quiet repaint.
// - A lazy import() that fails (lazyLoadFailed) reloads too when it's
//   safe; otherwise a banner says there's an update, with a Reload button.
//   Offline, it says nothing: the failure is the network, and the caller
//   already clears its cached promise so the next try can work.
//
// The rules are pure and exported for tests/app-update.test.mjs; nothing
// here touches the page until initAppUpdates() runs.

import { bannerHtml } from './ui.js';

export const UPDATE_CHECK_AWAY_MS = 30 * 60 * 1000;
// How often a pending reload looks again for a safe moment.
const SAFE_MOMENT_POLL_MS = 15 * 1000;
// Never reload twice within this (a deploy landing mid-reload, a bad
// cache): the second update waits for the next launch.
const RELOAD_GAP_MS = 60 * 1000;
const RELOAD_KEY = 'bx-update-reload';

// Read-only views where a reload loses nothing.
export const SAFE_RELOAD_VIEWS = new Set(['view-board', 'view-live-now', 'view-standings', 'view-overall']);

export function shouldCheckForUpdate(hiddenAt, now){
  return Number.isFinite(hiddenAt) && now - hiddenAt >= UPDATE_CHECK_AWAY_MS;
}

export function isSafeToReload({ view, sheetOpen, typing }){
  return SAFE_RELOAD_VIEWS.has(view) && !sheetOpen && !typing;
}

let updateReady = false;
let pollTimer = null;

function pageState(){
  const view = document.querySelector('.board > .view.active');
  const active = document.activeElement;
  const chat = document.getElementById('chat-input');
  return {
    view: view ? view.id : '',
    sheetOpen: !!document.querySelector('.modal-overlay.open'),
    typing: !!(active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)))
      || !!(chat && chat.value && chat.value.trim())
  };
}

function reloadIfSafe(){
  if(!isSafeToReload(pageState())) return false;
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (e){}
  if(Date.now() - last < RELOAD_GAP_MS) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e){}
  clearInterval(pollTimer);
  location.reload();
  return true;
}

function showUpdateBanner(){
  if(document.getElementById('update-banner')) return;
  const wrap = document.createElement('div');
  wrap.id = 'update-banner';
  wrap.className = 'update-banner-wrap';
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = bannerHtml({ text: 'Boxscore has an update.', actionLabel: 'Reload', onaction: 'location.reload()', cls: 'update-banner' });
  document.body.appendChild(wrap);
}

// For a lazy import()'s failure handler. Reloads when it's safe, or shows
// the banner; offline it leaves the retry to the caller.
export function lazyLoadFailed(){
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if(reloadIfSafe()) return;
  showUpdateBanner();
}

export function initAppUpdates(){
  if(!('serviceWorker' in navigator)) return;
  // The first install also claims the page; that isn't an update.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!hadController){ hadController = true; return; }
    updateReady = true;
    if(!reloadIfSafe() && !pollTimer) pollTimer = setInterval(reloadIfSafe, SAFE_MOMENT_POLL_MS);
  });
  let hiddenAt = NaN;
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState !== 'visible'){ hiddenAt = Date.now(); return; }
    if(updateReady){ reloadIfSafe(); return; }
    if(!shouldCheckForUpdate(hiddenAt, Date.now())) return;
    navigator.serviceWorker.getRegistration()
      .then(reg => reg && reg.update())
      .catch(() => {});
  });
}
