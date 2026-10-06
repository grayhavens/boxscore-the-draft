# Golf majors on Home

A Home card for each men's major (Masters, PGA Championship, U.S. Open, The Open), in the same shell as the
postseason banner (`.ps-home`, `postseasonHomeHtml` in `js/postseason.js`). Decided with Josh, 2026-10-05.
Builds on `docs/golf-plan.md`.

## Decisions

- **Who sees it:** only groups with PGA Tour turned on (`hasGolf()` in `js/golf-view.js`). Other groups never see it.
- **Points only when golfers are drafted.** A group that has golf on but hasn't drafted golfers (pre-draft, or golf
  shown without being drafted) gets the neutral card: field, leader, winner. No points, no "your golfers".
- **Window:** Monday of major week through 7 days after the final round (like `CHAMPION_WEEK_MS`).
- **Logo:** each major's own (Josh supplied them, 2026-10-05): `icons/major-*.png`, listed in `MAJORS` in
  `js/seasons/pga.js` and matched by ESPN's event name (`majorOf`). The navy ones (PGA Championship, U.S. Open, The
  Open) have a dark-theme copy with the navy turned white; the Masters' dark-theme copy lifts its dark green so the
  wordmark reads. Square logos stand 56px tall (the card's text height), so the Masters' wordmark isn't lost. The U.S. Open and The
  Open are wide wordmarks, shown as lockups. A major we don't recognise falls back to ESPN's PGA Tour logo.

## Card states

| Phase | Eyebrow | Sub line (drafted group, signed-in viewer) | Right side |
|---|---|---|---|
| Mon–Wed | `Starts Thu · 2027` | You have 3 golfers in | your golfers in the field |
| Rounds 1–2 | `Round 2 · 2027` | Scheffler leads at −9 / You have 3 golfers in · +3 in play | your golfers, best place first |
| After the cut | `Round 3 · 2027` | Scheffler leads at −9 / 2 of 3 made the cut · +3 in play | only those still playing |
| Final, +7 days | `Final · 2027` | Scheffler won at −9 / Your golfers: +3 | winner's headshot (gold ring if yours) |

Title is the major's display name from `MAJORS` ("The Masters", not ESPN's "Masters Tournament"); ESPN's name
for one we don't know. Every major's logo sits in the lockups' 100px slot, so its text lines up with a postseason
card stacked above it. Neutral card (no drafted golfers, no profile): the sub line is the field
size before Thursday, the leader while live, and the winner once final. In-play points are blue (`--provisional`)
from current places; once final they're gold (`--accent`). Missed cuts subtract (−2). A tap opens
`openGolfEvent(id)`.

## Data

- **During the week:** `golfStore.current` (`refreshGolfLive`) already fetches the leaderboard once the event is
  within `THIS_WEEK_DAYS`, and `board.major` says it's a major. No hardcoded ids or names.
- **Same-week events:** `fetchCurrentGolfEvent` takes `events[0]`. Confirmed 2026-10-05: ESPN's scoreboard for
  Open week lists The Open and the Corales Puntacana Championship, with no major or primary flag on either
  (fixture `scoreboard-open-week.json`). Each leaderboard has both (`tournament.major`, and `primary: false` on
  the opposite-field event); the core API event has `primary` too but is ~166KB, no cheaper than a leaderboard.
  So in a multi-event week, step 2 reads the leaderboard of each event `weekEventsToCheck` names, once, keeps
  `{ major, primary }` per event id (they never change), and lets `pickWeekEvent` choose. One-event weeks cost
  nothing extra. This also fixes the existing "this week" golf rows, which have the same `events[0]` problem.
- **The week after:** the scoreboard has moved on, so read the major from the worker's condensed season
  (`golfStore.events`: `major`, `status: 'post'`, `end`, `results`). No worker change.
- **Fallback logo:** ESPN's league logos from the scoreboard response, on `golfStore.current.event.logo`.

## Steps

1. **Pure logic** (done, `js/golf.js`, tests in `tests/golf.test.mjs`): `activeMajor({ current, events, now })`
   → one major shape (`status`, `round`, `cutDone`, `finishes`, `toPar`) or null; `majorWindow`; `majorPoints`
   on `finishAwards`, which `golferAwardCounts` now uses too, so they can't drift; `majorGolfers` (a drafter's
   golfers, best first, total, still playing); `majorLeaders`; `pickWeekEvent` / `weekEventsToCheck`.
   Leaderboards now carry `primary` (parsed and condensed).
2. **Home card** (done): `golfMajorHomeHtml()` in `js/golf-view.js`, after the postseason cards in Home's stack
   (`renderPlayoffsHome` in `js/board.js`, repainted through `onGolfData`), on the `.ps-home` recipe plus a few
   modifiers (square logo, `.ps-home-pts` blue/gold, an un-ringed winner who isn't yours). `fetchCurrentGolfEvent`
   now picks the major in a multi-event week and carries ESPN's PGA Tour logo. Like the postseason cards, it's
   hidden before the group's first draft (Home leads with the Draft card then).
3. **Leaderboard sheet** (done): owner tags were already there. A drafter in a group whose golf scores gets
   "Your golfers" pinned above the leaderboard (`pinnedHtml` in `js/golf-view.js`), best place first; in a major
   each shows what that place is worth and the section its total (blue in play, gold once final). Their rows in
   the full list are gold-tinted (`.golf-lb-row.me`). Any event, not just majors (points only in a major). Fixed
   along the way: "Thru null" for a golfer out of the event (now "Missed cut" / WD / DQ) and an unplayed round
   shown as a 0. The sheet title uses the major's display name.
4. **Preview replay** (done): `?major=<masters|pga|usopen|open>&majorphase=<pre|live|final>&majormine=<n>` on
   localhost or a Pages preview (`previewParam`, sticky like `?psyear`; `?major=0` turns it off). It replays that
   major's last edition from ESPN's real leaderboard, moved by whole weeks to this week (last week for `final`),
   whether or not the group has golf; `majormine` hands the viewer n golfers spread through the field so the
   points show.
5. **Docs** (done): a golf `GUIDE` entry in `js/guide.js`, shown only to a group with PGA Tour (`when`), which
   also clears the golf guide item in ROADMAP; ARCHITECTURE's **Golf majors on Home**; `APP_VERSION` and
   `CACHE_NAME` bumped, the logos in `SHELL_FILES`.

Later, not v1: push ("Your golfer made the cut", "The Masters starts Thursday"), a "two weeks out" teaser.

## Open

- The neutral card's "leader" line during a tie (`T1`): show "3 tied at −9".
- Card order with the postseason cards: postseason first. The only overlap is April, when the NCAA Tournament's
  card is in its last week.
