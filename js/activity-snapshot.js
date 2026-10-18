/* ============================================================
   Whether an Activity run found anything new (js/activity.js
   runActivityDetection). A run whose snapshot matches the server's in
   everything but dataAt, and that found no events, has nothing to
   write, so the app skips the PUT.

   Why it matters: every PUT is two KV writes (the feed, and the Race
   chart's day sample in worker/points-history.js), and the free plan
   allows 1,000 KV writes a day for both groups together. Without this,
   every foreground visit (at most once per 5 minutes per phone) wrote
   both even when no rank, total or lock had moved, since dataAt is just
   when the data was read. A busy sports weekend could reach the cap,
   and past it Activity, Race and points alerts stop until midnight UTC.
   Found in the 2026-10-18 optimization review (docs/optimization-report.md,
   Phase 3 #1).

   Skipping is safe for the rest of the app: the server's snapshot keeps
   its older dataAt, so other phones still run their own check (the same
   no-op), the next real change still diffs against the right baseline,
   and the Race chart holds a day's last value when it has no new sample.

   Pure (no imports) so Node tests cover it (tests/activity-snapshot.test.mjs).
   ============================================================ */

// JSON with object keys sorted, so two snapshots built in a different
// key order (one came back from the server) still compare equal.
function stable(value){
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value && typeof value === 'object'){
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// True when `next` says nothing `prev` doesn't: same everything but
// dataAt. A missing prev (first run, or an older snapshot version the
// caller can't diff) is never unchanged.
export function snapshotUnchanged(prev, next){
  if(!prev || !next) return false;
  const { dataAt: _a, ...p } = prev;
  const { dataAt: _b, ...n } = next;
  return stable(p) === stable(n);
}
