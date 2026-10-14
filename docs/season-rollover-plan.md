# Season rollover plan

Draft for review, 2026-10-14. Goal: a group moves from one season to the next with no code work by anyone, both
seasons are visible while they overlap, and everyone can look at any season by year.

A "season" here is one draft class, labelled the way people talk about it: **2026/27** is the class drafted in
September 2026 (NFL/CFB '26, EPL/NBA/NHL/CBB '26/27, MLB/WNBA '27).

## The requirements, restated

1. **No code to roll over.** Everything before the 2027 draft is done on the Commissioner page or the system admin
   page. No commands, no commits, no deploys.
2. **This season and next, side by side.** After the 2027 draft, 2027/28 is the default, and 2026/27 keeps
   scoring until its last league finishes, then shows its final results.
3. **Results by year.** Josh can open 2026/27 or 2027/28 and see his teams, his points and his finish for that year.

## What already works

Most of the rollover is already buttons:

- **The draft itself:** sports and picks, draft time poll, rehearsal room, room check, lottery, reset of last
  year's board (saved first) are all on the Commissioner page (**Group settings → Before the next draft**).
- **After the draft:** the new class builds on every phone the moment the last pick is in (`js/live-class.js`),
  with the "Your 2027 season is set" entry screen. The export is optional.
- **Finishing a season:** leagues lock themselves when ESPN says the regular season is over (Force lock as a
  backup), and the commissioner records the final standings into History.
- **Older classes:** viewable from Settings → Draft class, with a banner while one is on screen, reading frozen
  standings for leagues that locked.

## The gaps

| # | Gap | Requirement |
|---|---|---|
| A | The app owner's four pre-draft steps change files: ESPN team lists, draft rankings, season outlooks, golfer pool. The admin page shows them as commands, not buttons. | 1 |
| B | Once a newer class exists, the older one stops being looked after. Auto-lock, lock writes, points history and History recording all run only for the newest class (`season-lock.js`, `activity.js`, `history.js`). At the September draft, 2026/27's **MLB and WNBA are still being played**, so they could never lock, and 2026/27 could never be recorded. | 2 |
| C | Switching years is buried in Settings, labelled "2026" rather than "2026/27", and doesn't show how you did that year. | 3 |

## The plan

### Phase 1: owner steps become buttons (gap A)

Move the four file-based inputs into the worker's KV, edited from the system admin page. Files stay as the
fallback, so nothing breaks if KV is empty.

1. **ESPN team lists.** Needs a short spike first: ESPN answers the worker's `/teams` call with a 403 and has no
   CORS for the browser. Try, in order: ESPN's core API from the worker; building the lists from the standings
   endpoints the app already reads (names, ids, logos); a scheduled worker fetch. Whichever works becomes a
   **Refresh team lists** button that stores the lists in KV with a "added / removed since last time" report.
   If none works, keep the file and make it non-critical: the draft pool's ranking already carries an ESPN id and
   crest per team, so a new team never shows as a plain tile.
2. **Draft rankings.** A per-league ranking editor on the admin page (move up/down, add a team from the ESPN list,
   remove one), stored in KV. The draft pool reads KV first, then `js/draft-ranks.js`. **Mark checked** replaces
   editing `DRAFT_RANKS_CHECKED` by hand.
3. **Season outlooks.** An editor per team (the same facts the tool prints, beside a text box), saved to KV and
   read by the draft room before `js/draft-outlooks.js`. Writing them stays manual. (Optional later: a "draft
   these" button. Not in scope.)
4. **Golfer pool.** A **Rebuild golfer pool** button (the worker runs the same ESPN reads the tool does). Golf is
   off for every group, so this goes last and can wait.
5. The owner checklist rows swap their command for that button.

### Phase 2: two seasons at once (gap B)

**Built** on branch `season-overlap` (2026-10-14), using the hidden background copy of last season (decided over a
refactor of scoring). Two things turned up along the way and were fixed in the same phase:

- MLB and WNBA "not scoring yet" was hard-coded per season and needed a code edit each spring. It now switches by
  itself when the class season's regular season starts on ESPN's calendar. ESPN's season *year* can't be used on its
  own: in October 2026 its MLB standings already said 2027 while still holding the 2026 table.
- ESPN-scored playoff points (NFL, CFP, NCAA Tournament, MLB, WNBA) were read from the *current* postseason only, so
  a season lost them once ESPN moved on (the 2026/27 NFL playoff points would have gone in August 2027). A season
  now loads its own postseason by year.

Not verified: a real lock or alert end to end (locks only save from a commissioner's device, and the overlap can only
be simulated until the 2027 draft); the Commissioner checklist row on screen (unit tested only).

One new idea: a season is **in play** until every one of its scoring leagues is locked. Usually that's only the
newest; from the September draft until the World Series ends, it's two.

1. `seasonsInPlay()` (pure, tested): the newest class plus any older class with an unlocked league.
2. Locks take a season instead of assuming the active one. On every launch the app also runs the lock check for
   the previous season's open leagues in the background, so 2026/27's MLB and WNBA lock when they finish without
   anyone opening that season.
3. Points history (Activity, Race, points alerts) keeps recording the previous season while it's in play, so a
   2026/27 World Series result still alerts and shows in that season's Activity. **Alerts for an older season
   name it** ("2026/27 · World Series: Josh +15"), and tapping one opens that season.
4. **Record final standings** works for any finished season, not just the newest. Group settings gets a row:
   "2026/27 is still finishing: MLB, WNBA", then "Record 2026/27's final standings" once they lock.
5. **Home**, during the overlap only, shows one small card: "2026/27 · still finishing · You're 3rd · MLB, WNBA
   left", tapping into that season. Once recorded, it becomes the existing champion card.

### Phase 3: seasons by year (gap C)

Decided: the switch stays in Settings; only an older season shows anything at the top.

1. Every class gets a season label ("2026/27"); user-facing copy uses it instead of "2026 draft class".
2. **Settings → Season** replaces the Draft class chips, shown only when there are two or more seasons. Each row
   shows your result that year: "2027/28 · Live · 5th", "2026/27 · Final · 2nd · 412 pts". Tapping one switches
   (the reload stays; it already works and keeps every module simple). Built from the existing Settings section
   and row recipes, no new component.
3. **The current season shows no indicator.** On an older season, the existing banner at the top reads
   "Viewing 2026/27 · Back to 2027/28", on every view.
4. History rows for app seasons tap through to that season.

### Phase 3b: commissioner edits after the draft, and retiring the export

Decided: the export is retired; the worker's saved boards are the record of every season. Today the commissioner
can edit a pick only while the finished board is still in the room (`editPick`), and can't move a team from one
drafter to another once it's picked (`trade` only swaps empty slots). Once the board is reset for the next draft,
nothing about that season can be changed.

1. **Edit a team, any season in play:** on the Commissioner page, pick a season, a drafter and one of their teams:
   **Replace** it with another team from that season's pool, or **Move** it to another drafter. Works on the board
   in the room and on saved boards from earlier years.
2. Every device rebuilds that season when a saved board changes (today only the board in the room triggers a
   rebuild), so an edit shows everywhere with no deploy.
3. Edits show in Activity as a commissioner change, so nobody's points move silently.
4. **Backup:** the system admin page gets a "Download every board" button (one JSON file per group), since the
   worker now holds the only copy.
5. Remove `tools/export-draft.mjs`, its library pieces nothing else uses, and its mentions in CLAUDE.md, the
   runbook and the plan docs. The committed `js/seasons/2026.js` and `seasonticket-2026.js` stay as they are.

### Phase 4: prove it before 2027

A full rollover rehearsal on a localhost test group: finish a draft in the rehearsal room, check the old season
keeps locking and recording, its alerts, the Settings switch and banner, a post-draft edit, and a brand-new phone rebuilding both seasons. Plus Node tests for
`seasonsInPlay`, per-season locks and the checklist rows. Update `docs/draft-room-plan.md` "Before draft day" (no
commands left), `js/guide.js` rows and `docs/ARCHITECTURE.md`.

## Order and size

Phase 2 is the most important (without it, 2026/27 can't finish properly) and the largest; Phase 3 is small and
visible; Phase 3b and Phase 1 are independent of each other. Suggested order: **2 → 3 → 3b → 1 → 4**, one PR per
phase (Phase 1 one PR per step). Phases 1, 2 and 3b touch the worker, so the worker deploys first each time.
Everything must be live by August 2027.

## Decisions

1. **Season switch:** stays in Settings. An older season shows a banner at the top; the current one shows nothing.
2. **Overlap alerts:** sent, and named for their season.
3. **Outlooks:** stay a hand-written step on the admin page for now (an automated source may come later).
4. **Export:** retired. The commissioner can edit a team after the draft from the Commissioner page instead.
