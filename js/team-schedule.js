/* ============================================================
   A team's schedule from ESPN's team-schedule answers, split into
   recent results and upcoming games (js/espn.js fetchEspnTeamSchedule
   does the fetching and passes its normalize() in).

   Why a failed fetch returns null rather than an empty schedule: an
   empty { recent: [], upcoming: [] } reads as "no games", and the app
   believed it. A few seconds without signal blanked every visible
   team's next game on Home and saved that over the good copy in
   localStorage, and the team page then called a club seven games into
   its season "Season complete" (js/live-data.js eplSeasonStatus). Found
   in the 2026-10-18 optimization review (docs/optimization-report.md,
   Phase 4 #1). Any answer missing counts as a failure: for EPL the two
   calls hold different halves (played vs remaining), so one alone would
   still say "no upcoming match". A schedule that really is empty (an
   answer with no events) stays empty.

   Pure (no imports) so Node tests cover it (tests/team-schedule.test.mjs).
   ============================================================ */

// `answers`: every response asked for, in order, with null for one that
// failed. `normalize(event)` returns the app's event shape or null.
// Returns { recent, upcoming } (recent newest-first, upcoming soonest-
// first), or null when any answer failed.
export function splitTeamSchedule(answers, normalize, now = Date.now()){
  if(!answers.length || answers.some(a => !a)) return null;
  const byId = new Map();
  answers.forEach(a => (a.events || []).forEach(event => {
    const normalized = normalize(event);
    if(normalized) byId.set(normalized.id, normalized);
  }));
  const all = [...byId.values()];
  const recent = all.filter(e => e.completed).sort((x, y) => new Date(y.date) - new Date(x.date));
  // A postponed game (real, confirmed live on the Cubs' schedule —
  // several April/June 2026 games marked STATUS_POSTPONED) is
  // "incomplete" forever but dated months in the past — without this
  // date guard it would sort to the front of "upcoming" ahead of every
  // real future game. Live-in-progress games never reach this: those
  // are handled earlier by TheRundown's overlay (isRundownEventLive),
  // so excluding a past date here never hides a game actually in
  // progress right now.
  const upcoming = all.filter(e => !e.completed && new Date(e.date).getTime() >= now)
    .sort((x, y) => new Date(x.date) - new Date(y.date));
  return { recent, upcoming };
}
