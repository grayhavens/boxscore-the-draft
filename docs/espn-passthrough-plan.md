# Share ESPN answers between phones (UX item 8)

The detailed plan for item 8 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code.

## Status: blocked

The plan was an optional edge-cached passthrough in the worker: phones ask the worker, the worker asks ESPN once per
short TTL, and the browser falls back to calling ESPN directly. That needs the worker to reach ESPN, and it can't:

- **Since 2026-10-15, ESPN answers 403 to every request from a Worker**, any URL and any User-Agent (`worker/golf.js`'s
  note).
- **On 2026-10-16** the deployed worker's ESPN-backed route (`GET /golf/season/2026`) still answers
  `502 {"error":"upstream"}`.

Every phone keeps calling ESPN directly, which works because ESPN's site API is CORS-open.

## The plan: wait, and know when it's possible

1. **A daily probe.** The worker's existing daily cron (`scheduled()` in `worker/rundown-proxy.js`) makes one small ESPN
   request and saves `{ at, status }` in KV (`espn-probe`).
2. **A line on the system admin page:** "ESPN from the worker: blocked since <date>" or "reachable". That's the signal to
   pick item 8 back up, and to move golf's season build back to the worker (`worker/golf.js`).
3. **Until then, nothing else changes.**

When the probe shows ESPN reachable, the original plan stands:
- **Worker:** a `/espn/*` passthrough through `cachedUpstreamFetch`, allowlisted to the site and core API paths
  `js/espn.js` uses, with TTLs by kind (15–30 s live scoreboards and summaries, minutes for standings).
- **Browser:** `fetchEspnJSON` in `js/espn.js` (the one choke point, plus `golf.js`, `standings-cfb.js` and
  `draft-class.js`) tries the worker first with a short timeout, then ESPN directly.

## Meanwhile, cheaper wins inside the browser

Each phone's ESPN traffic could still shrink without the worker, for example longer TTLs on standings outside game
windows. That's not part of this item; it would get its own plan if load ever becomes a problem. Today there's no
sign of one: ESPN publishes no limit, and two groups is light.

## Checks

- Unit test for the probe's KV record shape.
- After deploy: the system admin page shows the probe line, and the cron log shows one ESPN request a day.

## Decisions (2026-10-16: parked behind the daily probe, which is built now)

1. **Park item 8 behind the daily probe?** Proposed: yes. Building a passthrough the worker can't use isn't worth it.
