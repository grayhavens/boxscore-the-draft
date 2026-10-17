/* ============================================================
   ESPN FROM THE WORKER: since 2026-10-15 ESPN answers 403 to every request
   from a Worker (see worker/golf.js), which parks the shared ESPN
   passthrough (docs/espn-passthrough-plan.md) and keeps golf's season
   build in the browser. The daily cron (scheduled() in
   worker/rundown-proxy.js) asks ESPN for one small scoreboard and keeps
   the answer, so the system admin page (js/system-admin.js, the ESPN tile)
   can say when that changes.

   KV: espn-probe -> { ok, status, at, since }
     ok      ESPN answered 2xx
     status  its HTTP status, or 0 when the request itself failed
     at      when this check ran (epoch ms)
     since   when `ok` last flipped (the first check counts as one)

   Pure except runEspnProbe, so Node tests can import nextProbe.
   ============================================================ */

export const ESPN_PROBE_KEY = 'espn-probe';
export const ESPN_PROBE_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1';
const TIMEOUT_MS = 10000;

// The new record from the last one and this check's answer.
export function nextProbe(prev, { ok, status, at }){
  const flipped = !prev || prev.ok !== ok;
  return { ok, status, at, since: flipped ? at : prev.since };
}

export async function runEspnProbe(env, fetchImpl = fetch){
  let ok = false, status = 0;
  try {
    const res = await fetchImpl(ESPN_PROBE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    ok = res.ok;
    status = res.status;
  } catch (e){}
  const prev = await env.LEAGUE_FACTS.get(ESPN_PROBE_KEY, 'json');
  const next = nextProbe(prev, { ok, status, at: Date.now() });
  await env.LEAGUE_FACTS.put(ESPN_PROBE_KEY, JSON.stringify(next));
  return next;
}

export async function loadEspnProbe(env){
  try { return await env.LEAGUE_FACTS.get(ESPN_PROBE_KEY, 'json'); } catch (e){ return null; }
}
