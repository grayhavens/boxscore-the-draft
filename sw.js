/* Minimal service worker: keeps a copy of the static shell so the app
   still opens (from cache) when launched offline. Anything not on this
   origin (ESPN, the worker, KLIPY) is left alone and always goes straight
   to the network; we never cache or intercept those. The shell itself is network-first: every load fetches the
   latest deployed files and refreshes the cache, falling back to the
   cache only when there's no connectivity — a cache-first strategy
   here would keep serving whatever shipped the day this first
   installed, forever, since nothing else invalidates it. */
const CACHE_NAME = 'boxscore-v14';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/page-header.js',
  './js/data.js',
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
  './js/identity.js',
  './js/live-now.js',
  './js/nflverse.js',
  './js/nhl-clips.js',
  './js/scoring-page.js',
  './js/season-lock.js',
  './js/season-phase.js',
  './js/settings.js',
  './js/standings-cbb.js',
  './js/team-page.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo-header.png'
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
