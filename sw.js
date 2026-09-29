/* Minimal service worker: keeps a copy of the static shell so the app
   still opens (from cache) when launched offline. Anything not on this
   origin (ESPN, the worker, KLIPY) is left alone and always goes straight
   to the network; we never cache or intercept those. The shell itself is network-first: every load fetches the
   latest deployed files and refreshes the cache, falling back to the
   cache only when there's no connectivity — a cache-first strategy
   here would keep serving whatever shipped the day this first
   installed, forever, since nothing else invalidates it. */
const CACHE_NAME = 'boxscore-v20';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/page-header.js',
  './js/launch-splash.js',
  './js/motion.js',
  './js/data.js',
  './js/group.js',
  './js/groups.js',
  './js/draft.js',
  './js/draft-client.js',
  './js/draft-pool.js',
  './js/draft-ranks.js',
  './js/draft-rules.js',
  './js/draft-engine.js',
  './js/draft-groups.js',
  './js/draft-live.js',
  './js/draft-sheets.js',
  './js/xlsx.js',
  './js/season.js',
  './js/season-switcher.js',
  './js/frozen-cache.js',
  './js/seasons/index.js',
  './js/seasons/2026.js',
  './js/utils.js',
  './js/api.js',
  './js/espn.js',
  './js/mlb-stats.js',
  './js/league-facts.js',
  './js/standings-epl.js',
  './js/standings-cfb.js',
  './js/standings-flat.js',
  './js/standings-nfl.js',
  './js/standings-nba.js',
  './js/standings-nhl.js',
  './js/standings-mlb.js',
  './js/standings-wnba.js',
  './js/overall.js',
  './js/compare.js',
  './js/activity.js',
  './js/live-data.js',
  './js/board.js',
  './js/admin.js',
  './js/chat.js',
  './js/favorites.js',
  './js/gif-picker.js',
  './js/gifs.js',
  './js/guide.js',
  './js/identity.js',
  './js/live-now.js',
  './js/nflverse.js',
  './js/nhl-clips.js',
  './js/scoring-page.js',
  './js/season-lock.js',
  './js/season-phase.js',
  './js/push.js',
  './js/settings.js',
  './js/standings-cbb.js',
  './js/team-page.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo-header.png',
  './icons/logo-header-light.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Page loads are cached under the one shell key rather than per URL, so
  // every ?view=/&team= combination doesn't leave its own copy behind.
  const key = event.request.mode === 'navigate' ? './index.html' : event.request;
  event.respondWith(
    fetch(event.request).then((res) => {
      if(res.ok){
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(key).then((cached) => cached || caches.match('./index.html')))
  );
});

/* ---- Push alerts (worker/web-push.js sends them, js/push.js opts in) ----
   Payload: { kind: 'chat' | 'draft' | 'test', title, body, url, tag }.
   Every push must show a notification (iOS revokes a subscription that
   stays silent), so there's no "skip it" path here; the worker already
   leaves out whoever is looking at the app. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e){}
  event.waitUntil(showAlert(data));
});

async function showAlert(data){
  let title = data.title || 'Boxscore';
  let body = data.body || '';
  let count = 1;
  // A run of chat messages stacks into one notification ("3 new
  // messages", the latest one shown) instead of one per message.
  if(data.kind === 'chat'){
    const shown = await self.registration.getNotifications({ tag: 'chat' });
    const prev = shown[shown.length - 1];
    if(prev && prev.data && prev.data.count){
      count = prev.data.count + 1;
      body = `${title}: ${body}`;
      title = `${count} new messages`;
    }
    if(self.navigator.setAppBadge) self.navigator.setAppBadge(count).catch(() => {});
  }
  return self.registration.showNotification(title, {
    body,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: './icons/icon-192.png',
    data: { url: data.url || './', kind: data.kind || '', count }
  });
}

// Tapping an alert: bring an open Boxscore window to the front and tell
// it where to go (js/board.js), or open a new one there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => new URL(c.url).origin === self.location.origin);
    if(client){
      await client.focus();
      client.postMessage({ type: 'bx-open-alert', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
