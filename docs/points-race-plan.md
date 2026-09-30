# Points tab: Race segment

Branch: `points-race`. Source: Claude Design handoff `design_handoff_points_race`
(README + `Points Race v3.dc.html` + screenshots). It adds a third segment to the Points tab
(**Standings · Race · Activity**): a chart of every drafter's projected points (or rank) over the
season, a month window with chips and a season minimap, Replay, and the standings table re-sorted
to the scrubbed day.

Same rule as `docs/points-ux-plan.md`: wherever the handoff draws something the app already has,
use that component.

---

## Decisions (agreed 2026-09-29)

| Question | Decision |
|---|---|
| Row tap on the Race table | First tap focuses that drafter in the chart; tapping the focused row opens the quick sheet (`obOpenSheet`) |
| Hero while scrubbing | Stays on **today**. The race card's subtitle and the table carry the scrubbed day |
| September backfill | None. The line starts on the first recorded day, labeled as such |
| Prototype tweaks | Ship the Locked/Live split fill and Replay (fixed length). Drop "All colors" for v1 |

## Where this departs from the handoff

1. **Days, not weeks.** The handoff models 48 weeks. History is sampled daily, so month view plots
   every day and All thins to weekly. Scrub snaps to days.
2. **The season is ~15 months, not Sep–Mar.** MLB and WNBA score their 2027 seasons, so a class
   runs Aug 2026 to Oct 2027. Month chips come from the season's real span (first sample through
   the last league's end) in a horizontally scrolling chip row, plus All. The fixed 8-column grid
   can't hold that.
3. **Lock markers from real dates.** A locked league's diamond sits at its `lockedAt`
   (`js/season-lock.js`); an unlocked one at its regular-season `endDate` (`js/season-phase.js`).
   No hand-kept schedule.
4. **One table.** The Race table is `obTableHtml` fed historic rows, with its header saying
   "Standings on {date}". Re-sorts use the existing FLIP glide (`obPlayFlip`), not absolutely
   positioned rows. Column widths stay ours (38/34/38). "Show top 5 / all" is dropped: it would be
   a pattern the Standings table doesn't have.
5. **Themeable chart colors.** No literal `rgba(255,255,255,…)`. New chart tokens in both themes
   (dim line, ghost line, grid, today line, minimap mask), used as `var()` in the SVG.
6. **Simulated mode.** With Points Tab Data set to Fake (`obMode === 'simulated'`), the Race reads
   a seeded generated history (the prototype's generator, ported), so it can be previewed before
   real history piles up.
7. **Pre-draft groups** (no drafted class yet) don't show the Race segment.

## Phases

### 1. History recorder (worker + snapshot). **Shipped (#175).**
Every day without it is history lost.
- `worker/points-history.js`: KV `history[@<group>]:<season>` → `{ days: [{ d, p, l }] }`, one entry
  per Central-time day (the last write of a day wins), capped at 550 days. `GET /points/history`
  (`?group=`, `?season=`, 60s cache).
- The sample rides on the Activity PUT (`js/activity.js`): `{ season, p: projected, l: locked }`, sent
  only when that run computed the totals itself (not when it carried them forward from the last
  snapshot). The worker keeps a sample only if it has every drafter, as integers; a bad sample
  never blocks the feed write.
- The snapshot gains `lockedTotals`.
- Activity detection now skips when an older class is being viewed
  (`ACTIVE_SEASON_ID !== LATEST_SEASON_ID`). Its totals would otherwise rewind the shared feed and
  history.
- Known gap: a day nobody opens the app has no entry. The chart holds the previous value flat.
- Tests: `tests/points-history.test.mjs`.
- **Deploy the worker, then the static site.** An old worker ignores the extra `sample` field.

### 2. Pure race math (`js/race-math.js` + tests). **Done.**
Pure functions shared by the renderer and Node tests (`tests/race-math.test.mjs`). The ranking rule
moved out of `overall.js` into `js/rank.js` (`assignRank`) so a past day ranks exactly like today.
Two details the handoff didn't cover: month chips run from the first sample **through today** (the
prototype's chips also stop at the current month), so they grow over the season, and a label that
would repeat gets its year (`Sep '26`, `Sep '27`). Totals can go **negative** (last-place rules),
so the Y floor is 0 only when nobody is below it.
- history → per-day series with gaps held flat, plus derived projected/locked ranks
- the season's months → chip list; month window `[start − ε, next start + ε]`
- Y domain: min/max inside the window (interpolated at the edges), padded 12% (min 6), floored at
  0, blended toward `[0, seasonMax]` as the window widens
- grid step from `[5, 10, 20, 25, 50, 100]`, at most 6 lines
- head-label de-collision (12px) and flip near the right edge
- replay camera `[t − k, t + 1]` and which chip is active

### 3. Race segment UI (`js/race.js`, `js/overall.js`, `css/style.css`). **Done.**
- `obSetSegment` accepts `'race'`; `?seg=race` survives boot (`board.js`); the segment is hidden
  when `PRE_DRAFT`.
- History fetch with a localStorage copy (paint immediately, refresh in the background), like
  every other worker read.
- Race card: title row, Points | Rank compact seg, Replay pill, month chips, SVG chart, minimap.
- Chart: focus coloring (you = accent, focused = text, others dim), the focused drafter's
  locked step line and live hatching, rank mode curves, TODAY line, future ghost, lock
  diamonds, head labels (tap to focus).
- Scrub with pointer events; leaving resets to the window's latest day.
- Month pan 480ms `EASE_OUT`; Replay; both skipped under `reducedMotion`.
- Table below via `obTableHtml(rowsAtDay, { head, tap, focus, noMoves })`; row tap = focus, then sheet.
  Re-sorts glide with a small FLIP inside `js/race.js` (Web Animations), not `obPlayFlip`: that one
  also washes rows and counts totals up, which is too much at scrub/replay speed.
- The chart's today is always the on-screen totals (`withToday`), so it matches Standings between samples.
- Replay runs 2–6s depending on how much history there is; under reduced motion it jumps to today.
- Empty/short history state: "History starts {date}" in place of the chart when there are fewer
  than 2 days.

### 4. Polish. **Done** (simulated history, `GUIDE`, CLAUDE.md, `sw.js` v25, light theme checked).
- Simulated-mode history generator.
- `GUIDE` entry (`js/guide.js`), CLAUDE.md paragraph, `sw.js` `CACHE_NAME` bump.
- Light theme and phone-width pass.
