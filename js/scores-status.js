/* ============================================================
   What Scores (js/live-now.js) says about where its games came from:
   whether an empty day is really empty, and whether what's shown is an
   older copy.

   Why: with ESPN slow or the phone offline, every league's scoreboard
   came back empty and Scores said "Nothing scheduled. No drafted team
   plays on this date." on a 19-game Sunday (docs/optimization-report.md,
   Phase 2 #1). A failure has to read as a failure. When some leagues
   loaded, the rest still show, with a note. When the shown games come
   from a copy kept after a failed refresh, the line says how old it is,
   so a "LIVE" card can't pass for current.

   Pure (no imports) so Node tests cover it (tests/scores-status.test.mjs).
   ============================================================ */

// A kept copy younger than this reads as current (the live sweep reads
// each scoreboard about once a minute).
export const STALE_AFTER_MS = 2 * 60 * 1000;

// `leagues`: one entry per league asked, { loaded, fetchedAt, failed }:
// loaded = games data in hand (fresh or kept), fetchedAt = when that data
// was fetched, failed = the last attempt failed. Returns
// { unreachable, missing, staleAt }:
// - unreachable: nothing loaded for any league that failed, so an empty
//   day can't be called empty;
// - missing: leagues with no data at all;
// - staleAt: when the oldest kept copy was fetched, if one is past
//   STALE_AFTER_MS, else null.
export function scoresStatus(leagues, now = Date.now()){
  const missing = leagues.filter(l => !l.loaded).length;
  const kept = leagues.filter(l => l.loaded && l.failed && l.fetchedAt && now - l.fetchedAt > STALE_AFTER_MS);
  const staleAt = kept.length ? Math.min(...kept.map(l => l.fetchedAt)) : null;
  return { unreachable: missing > 0, missing, staleAt };
}

// The count line's tail: " · Updated 9:14 AM", " · Some leagues didn't
// load", or ''. `time` formats a timestamp for the reader.
export function scoresSubNote(status, time){
  if(status.staleAt) return ` · Updated ${time(status.staleAt)}`;
  if(status.missing) return ' · Some leagues didn\'t load';
  return '';
}
