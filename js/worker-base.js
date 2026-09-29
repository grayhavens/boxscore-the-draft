/* ============================================================
   Where the Cloudflare Worker (worker/rundown-proxy.js) lives. Kept in
   its own dependency-free module so anything can import it, including
   js/group.js at the very start of boot and the landing page, without
   pulling in js/api.js and the whole app's data behind it.
   After a `wrangler deploy` to a new address, this is the line to change.
   ============================================================ */
export const DASHBOARD_WORKER_BASE = 'https://team-dashboard-rundown-proxy.boxscore.workers.dev';

// The worker for group state you'd be polluting from a local preview:
// chat (js/chat.js's socket, js/gifs.js's key lookup), spot claims and the
// confirmed roster (js/roster.js). On localhost that's `wrangler dev`
// (port 8787) instead of the deployed worker, so poking at them locally
// never touches a group's real data. Everything else in this app
// deliberately keeps hitting the deployed worker, even from localhost.
export function chatWorkerBase(){
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  return isLocal ? 'http://localhost:8787' : DASHBOARD_WORKER_BASE;
}
