/* ============================================================
   Push alerts: "You're on the clock" in the live draft, new chat
   messages, being tagged in chat, and changes to your points (worker/points-alert.js),
   delivered to this device even when Boxscore is closed. The worker
   sends them (worker/web-push.js); sw.js shows them.

   Per device, opt-in from Settings -> Alerts, one switch per kind. The
   device is registered under whichever drafter this device is
   (js/identity.js); switching drafter moves the registration with it.

   iPhone and iPad only allow web push for a site added to the Home
   Screen and opened from there, so in Safari the section just says so.
   ============================================================ */
import { chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';
import { PRE_DRAFT } from './data.js';

const KEY = 'bxPushDevice';                 // { drafter, endpoint, prefs, at }
const RESYNC_MS = 24 * 60 * 60 * 1000;      // re-register once a day so the worker's copy stays fresh
// Before a group's first draft nobody has points, so no points switch.
export const PUSH_KINDS = [
  ['draft', 'My draft pick', 'When you go on the clock in the live draft'],
  ['points', 'My points', 'When your teams gain or lose points'],
  ['chat', 'Chat messages', 'When someone posts while you’re away'],
  ['mention', 'Mentions', 'When someone tags you in chat']
].filter(([kind]) => kind !== 'points' || !PRE_DRAFT);

let publicKey = null;
let configLoaded = null;

function loadSaved(){
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch (e){
    return null;
  }
}

function save(record){
  try {
    if(record) localStorage.setItem(KEY, JSON.stringify(record));
    else localStorage.removeItem(KEY);
  } catch (e){}
}

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isAppleMobile(){
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function browserSupportsPush(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// What the Settings section should show:
//   'off'       — the worker has no push keys, or this browser can't push: hide the section
//   'install'   — iPhone/iPad in Safari: add to Home Screen first
//   'blocked'   — the user said no to notifications for this site
//   'ready'     — switches work
export function pushAvailability(){
  if(isAppleMobile() && !isStandalone()) return publicKey ? 'install' : 'off';
  if(!publicKey || !browserSupportsPush()) return 'off';
  if(Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

export function pushPrefs(){
  const saved = loadSaved();
  const on = saved && 'Notification' in window && Notification.permission === 'granted';
  const prefs = { draft: !!(on && saved.prefs.draft), chat: !!(on && saved.prefs.chat), points: !!(on && saved.prefs.points) };
  // Mentions default to on for a device that turned alerts on before the
  // switch existed (wantsAlert in worker/web-push.js agrees).
  const mention = on && saved.prefs.mention;
  prefs.mention = typeof mention === 'boolean' ? mention : Object.values(prefs).some(Boolean);
  return prefs;
}

// Fetched once per page load, ahead of any tap: iOS only shows the
// permission prompt from inside the tap itself, so nothing slow may run
// before Notification.requestPermission() in setPushPref.
export function loadPushConfig(){
  if(!configLoaded){
    configLoaded = fetch(`${chatWorkerBase()}/push/config`)
      .then(r => r.ok ? r.json() : null)
      .then(c => { publicKey = c && c.publicKey ? c.publicKey : null; })
      .catch(() => { publicKey = null; });
  }
  return configLoaded;
}

function keyBytes(b64url){
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function currentSubscription(create){
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if(existing || !create) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

function callWorker(path, method, body){
  return fetch(withGroupQuery(`${chatWorkerBase()}${path}`), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function register(drafter, sub, prefs){
  const res = await callWorker('/push/device', 'PUT', { drafter, subscription: sub.toJSON(), prefs });
  if(!res.ok) throw new Error(`push register ${res.status}`);
  save({ drafter, endpoint: sub.endpoint, prefs, at: Date.now() });
}

async function unregister(saved){
  try { await callWorker('/push/device', 'DELETE', { drafter: saved.drafter, endpoint: saved.endpoint }); } catch (e){}
}

// Turns one kind of alert on or off for this device. Must be called
// straight from the tap (see loadPushConfig). Resolves to the new prefs;
// rejects when permission is refused or the worker can't be reached.
export async function setPushPref(drafter, kind, on){
  const saved = loadSaved();
  const prefs = { ...pushPrefs(), [kind]: on };
  const anyOn = Object.values(prefs).some(Boolean);

  if(anyOn && Notification.permission !== 'granted'){
    const permission = await Notification.requestPermission();
    if(permission !== 'granted') throw new Error('permission');
  }

  if(!anyOn){
    if(saved) await unregister(saved);
    const sub = await currentSubscription(false);
    if(sub) await sub.unsubscribe().catch(() => {});
    save(null);
    return prefs;
  }

  const sub = await currentSubscription(true);
  if(saved && (saved.drafter !== drafter || saved.endpoint !== sub.endpoint)) await unregister(saved);
  await register(drafter, sub, prefs);
  return prefs;
}

export async function sendTestPush(drafter){
  const saved = loadSaved();
  if(!saved) throw new Error('not registered');
  const res = await callWorker('/push/test', 'POST', { drafter, endpoint: saved.endpoint });
  const out = res.ok ? await res.json() : null;
  if(!out || !out.ok) throw new Error('test failed');
}

// Called at boot and whenever this device's drafter changes. Moves the
// registration to the right drafter, picks up a subscription the browser
// rotated, and refreshes the worker's copy once a day. Quiet on failure;
// the next boot tries again.
export async function syncPushDevice(drafter){
  const saved = loadSaved();
  if(!saved || !browserSupportsPush()) return;
  await loadPushConfig();
  if(!publicKey) return;
  try {
    if(Notification.permission !== 'granted'){
      await unregister(saved);
      save(null);
      return;
    }
    const sub = await currentSubscription(true);
    const stale = saved.drafter !== drafter || saved.endpoint !== sub.endpoint || Date.now() - (saved.at || 0) > RESYNC_MS;
    if(!stale) return;
    if(saved.drafter !== drafter || saved.endpoint !== sub.endpoint) await unregister(saved);
    await register(drafter, sub, saved.prefs);
  } catch (e){}
}

// Notifications this app already put up for `tag` (e.g. the chat's),
// cleared once what they point at is on screen.
export function clearAlerts(tag){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then(reg => {
    if(!reg || !reg.getNotifications) return;
    return reg.getNotifications({ tag }).then(list => list.forEach(n => n.close()));
  }).catch(() => {});
}
