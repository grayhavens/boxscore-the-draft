# Points UX refactor: Projected (Locked + Live), Activity folded in

Branch: `points-ux-refactor`. Source: Claude Design handoff `design_handoff_points_activity`
(README + `PointsScreenV2.dc.html`; `Points Projected.dc.html` is the spec canvas).

Summary: the Points tab ranks by **Projected = Locked + Live** instead of confirmed-only. A
"You" hero sits on top, with a **Table | Activity** switch under it. Tapping any drafter opens a
quick sheet, which leads to an extended breakdown. On Home, the 3-item Activity card becomes a
single slim link row.

---

## Guiding rule: one component per job

Wherever the handoff draws something the app already has, we use the existing component and
adjust that one component if needed, rather than adding a lookalike. This table is the contract
for the build:

| Handoff element | Reuse | Change needed |
|---|---|---|
| Table / Activity switch | `segmentedControlHtml` + `.seg` | Optional `badge` per segment (see the badge row below) |
| Activity filter pills | `.filter-chip` / `.filter-chips` (Standings, Scoring, Admin) | A `.filter-chips.sm` density modifier (12px / 6×11) if 13px / 8×16 feels too big, or just use the stock size |
| Unread badge on Activity | `.chat-badge` (the tab bar's unread count) | Design says accent 18px, but chat is `--live` red 16px. Use **one** badge style (see Inconsistencies #6) |
| Quick sheet | `.modal-overlay` / `.modal` + `.sheet-title-row` + `enableSheetSwipeToDismiss` + `lockBodyScroll` (the same shell as the Compare picker) | None. Keep the existing 28px radius and the `::before` grabber, not the design's 22px / 5px |
| Locked / Live / risk bars (hero 12px, ladder 8px, sheet and cards 6px) | Replaces `.ob-card-bar-track`/`-fill` | **New shared** `.split-bar` (`> .lk`, `> .lv`, `.risk`, size via `--h`), plus a `splitBarHtml(locked, live, scale)` helper in `overall.js` |
| Stripe swatch | `.ob-stripe-swatch` (also used in compare.js) | Angle becomes one token, `--live-stripe` (see Inconsistencies #5) |
| `LIVE` / `LOCKED` / `LOCKED IN` / `PROJECTED RANK` tags | Today there are **three** provisional tags: `.ob-prov-tag`, `.provisional-tag` ("Current", in the team modal) and `.act-chip.prov` | **One** `.pts-tag` with `.live` / `.locked` / `.lock-in` / `.rank` variants. Replaces `.ob-prov-tag` and `.provisional-tag`. `.act-chip` stays for "Name +N" chips |
| Around-the-league chips | `.act-chip.prov` / `.rank` | Add `.act-chip.locked` (accent on accent-soft) |
| Activity row tile | `.act-tile` / `.act-tile.rank` | None |
| Breakdown stat strip (3 cells) | `.stat-tile` (defined in CSS, currently unused) | Tune to the spec (radius 12, 17px value, label not uppercase), or keep `.stat-tile`'s uppercase label to match `.stat-cell` |
| Empty state | `.ob-idle-block` (already what Activity uses) | Copy only |
| Section header with note | `.ob-section-title` | Add an optional right-aligned `.ob-section-note` |
| League accordion | `.ob-card` (existing) | Head: split sub-line and a split bar in place of the league-color bar |
| Rule rows | `.ob-rule` | `.pts-tag` in place of `.ob-prov-tag`; live points in `--provisional` |
| Back row / Compare button | `.ob-back-row`, `.cmp-btn` | None |
| Home slim link | Replaces `.act-card` | New `.act-link` row (it's a genuinely new pattern) |

**New CSS only:** `.split-bar`, `.pts-tag`, `.ob-hero` (+ ladder rows), `.ob-table` (Locked / Live / Proj
grid), `.act-link`, `.ob-sheet-*` (league rows and the 2-button footer). Everything else is a
modifier on something that already exists.

---

## Implementation phases

Each phase can be reviewed and merged on its own. Deploy the worker before the static site (phase 7).

### 1. Data model: rank by projected (`js/overall.js`)
- `obRankedRows()`: sort by `total` with the alphabetical tie-break. Keep standard competition
  rank and the `T` prefix, and add `lockedRank` / `lockedRankLabel` computed from `confirmedTotal`.
  Pull the ranking into a small `rankBy(rows, field)` helper so both ranks share it.
- Rewrite the header comment (the old one says provisional is "never folded into the ranking
  number", which is now reversed).
- **`js/compare.js`** reads `confirmedTotal` for its picker, gap, sticky bar and side totals. It
  has to move to projected in the same PR or Compare will contradict the Table (Inconsistencies
  #1). The picker sub-line becomes "Projected points, by rank", and "Net, including provisional"
  becomes simply "Net".
- Copy sweep: rename "Provisional" and "Current" to **Live** in `overall.js`, `compare.js` and
  `league-facts.js` (the team modal tracker).

### 2. Shared primitives (CSS + helpers)
- Add `.split-bar`, `.pts-tag`, the `--live-stripe` / `--risk-stripe` tokens, `.act-chip.locked` and
  `.ob-section-note`.
- `segmentedControlHtml`: accept an optional `badge` on each segment, rendered with the unified
  badge class. The existing call sites are unaffected.
- `splitBarHtml(locked, live, scaleMax)` handles negative live values by using the risk stripe and
  shortening the locked segment to the projected total.

### 3. Points page shell (`index.html`, `overall.js`)
- Header: remove the Activity chip, `#ob-activity-dot` and "Tap name for details". The Scoring
  chip stays in `.page-sub-row` (the logo and Settings button come from `page-header.js` as
  on every other page; don't hand-roll the design's header).
- Hero: rank ordinal, move since the last visit, rank note, projected total, split bar and
  legend, race ladder, explainer.
- `obSegment` state: taken from `?seg=`, otherwise Activity when `unseenCount() > 0`, otherwise
  Table. Mirrored with `updateUrlParam('seg', …)`, and `board.js` needs to keep `seg` across boot.
- Table: `.ob-table` grid (`26px 1fr 38px 34px 38px`). Keep the existing `hasLeader` rule (no
  leader wash when everyone is tied).
- Delete `obActivityOpen` and the pushed Activity screen.

### 4. Activity as a segment (`js/activity.js`)
- Filters become `.filter-chip`s: `all | mine | locked | rank`.
- Split rendering into **Moved your points** (`mineEvent`) and **Around the league**, with a
  `myDelta(e)` helper. `Locked in` and `Rank moves` each render a single section.
- Kind tag via `.pts-tag`. Lock rows get the `--lb-accent-wash` background.
- Group items by section instead of by day, and fold the day into the time column (relative time
  today, otherwise "Yesterday" or the weekday).
- Selecting the segment calls `markActivitySeen()`.
- `obOpenActivity()` now means `switchView('overall')` with `obSegment = 'activity'`, and every
  caller goes through it.
- `refreshActivityUi()` updates the segment badge instead of `#ob-activity-dot`.

### 5. Drafter quick sheet (`index.html` + `overall.js`)
- A new `#ob-sheet-overlay` with the same markup and handlers as `#compare-sheet-overlay`.
- `obOpenSheet(id)` / `obCloseSheet()`, with `obSheetId` state.
- Opened from table rows, ladder rows and Activity rank / bonus events (today
  `activityOpenDrafter` jumps straight to the detail).
- Buttons: `Compare with you` sets `obDetailId = me` and `obCompareId = them`, then pushes the
  existing compare view. On your own sheet it's `Compare…`, which opens the existing picker.
  `Full breakdown` calls `obOpenDetail(id)`.

### 6. Breakdown (`obDetailHtml`)
- Header: projected eyebrow, name and total. Then the split bar, then 3 `.stat-tile`s
  (Locked / Live / "Since {day}").
- **Remove** `.ob-prov-banner`.
- Recent changes: events that involve this drafter, reusing the Activity row renderer in a compact
  mode instead of a third row layout.
- League cards: projected points, a "5 locked · +2 live" sub-line and a 64px split bar. Rules are
  sorted locked first, then by points, and tagged `.pts-tag.locked` / `.live`.
- Keep the "No points yet" block for leagues with no locked or live points.

### 7. Detection and worker
- **Worker:** `ACTIVITY_EVENT_TYPES` gains `'lock'`. Nothing else is needed, since the snapshot is
  stored opaquely. Deploy this first.
- **Snapshot additions:**
  - `totals` / `ranks` become projected.
  - Add `locked: {leagueKey: bool}` for all 8 leagues.
  - Add `live: {leagueKey: {drafterId: pts}}`, taken from `row.leagues[].provisional`. This is
    needed because a lock event's deltas are "the live points that just became permanent", and
    nothing in today's snapshot records those.
- **`lock` event:** emitted when `!prev.locked[k] && next.locked[k]`. Deltas come from
  `prev.live[k]` (non-zero drafters only), with `prov: false`. The event's `type` already says it's
  a lock. Don't add a new delta field: `cleanActivityEvent` in the worker keeps only
  `{id, pts, prov}` and would silently drop it.
- **Rank events** are computed from projected rank. The existing "rank changed AND total changed"
  guard stays. See Inconsistencies #9 on noise.
- Migration: the first run after deploy diffs an old confirmed-rank snapshot against a new
  projected-rank one and would log a burst of fake rank moves. Bump a `snapshot.v = 2` and treat a
  version mismatch as "no prev" (write the new state without diffing).

### 8. "Since {day}" rank delta and Home link
- A per-device `teamDashboardObRankBaseline` entry, `{ ranks, ts }`. See Inconsistencies #8 for
  when it gets written.
- Home: `renderActivityHomeLink()` replaces `renderActivityHomeCard()`. It shows unseen and seen
  states and stays hidden when nothing has happened in 48h. Tapping it calls `obOpenActivity()`.
- Bump `CACHE_NAME` in `sw.js`.

---

## Inconsistencies and gaps in the handoff

1. **Compare isn't mentioned, but it has to change.** It ranks, diffs and totals on
   `confirmedTotal` and labels the picker "Confirmed points, by rank". Once Points ranks by
   projected, a drafter could be "2nd" on the Table and "Rank 4" on Compare. Plan: move Compare to
   projected in phase 1.
2. **"Locked" has two colors.** Compare's bonus-race chip renders "+5 · Locked" in `--win`
   green. The handoff makes Locked `--accent` gold. Pick gold everywhere.
3. **Four names for one idea.** The code and UI currently say "Provisional" (breakdown), "Current"
   (team-modal tracker, `.provisional-tag`) and "provisional" (Compare), and the handoff adds
   "Live". Rename all of them to Live and use one `.pts-tag`.
4. **Four tag and chip shapes.** There are three existing provisional tags (radius 4, radius 6,
   radius 20 with no border), and the handoff adds a fourth (radius 5 plus border). Consolidate
   into one tag.
5. **Stripe angle.** The existing stripe is 115°; the handoff uses 135°. Make it one token, and use
   the handoff's 135°.
6. **Two unread badges.** The handoff's Activity badge is an accent-gold 18px pill. The tab bar's
   chat badge is a `--live` red 16px pill. Both are "unread count" badges, so one style should
   serve both.
7. **Sheet chrome.** The handoff sheet has a 22px radius, a 36×5 grabber and no close button. The
   app's sheets have a 28px radius, a 36×4 `::before` grabber and a `×` in `.sheet-title-row`. Use
   the app's version.
8. **"Since Tue" timing is underspecified.** "Written when Points is viewed" plus "diffed against
   current" means the arrows vanish on the very next render or refresh. The baseline should be read
   once when Points opens, used for that visit, and replaced only when the user leaves the tab (or
   after about 12h), so "since" means "since your last visit". It is also a per-device baseline,
   while the Activity feed's rank events are global, so the Table's ▲2 and the feed can disagree.
   That's acceptable, but worth knowing.
9. **Projected rank events will be noisy.** Confirmed rank almost never moved. Projected moves with
   every division-lead flip, so every rule event will likely come with a rank event.
   Recommendation: only log a rank event when someone enters or leaves 1st, or moves 2 or more
   places. Otherwise the per-row arrows on the Table carry it.
10. **A lock event's "your delta" is misleading.** When a league locks, live points turn into
    locked points and **projected doesn't change**. Yet the row's right-hand number is "+N" in gold,
    which reads like a gain. Suggestion: show "+N locked" on the right, and don't include it in the
    "Live +3 since Tue" note.
11. **"Postseason rounds via League Facts can emit `lock` events"** doesn't fit the model. A
    postseason fact adds **new** locked points (projected goes up); it isn't live points being
    converted. It is also written by an admin in the facts modal, not detected by the snapshot diff.
    It should be its own event type (`fact`), written from the League Facts save path. Out of scope
    for v1 unless you want it.
12. **"Live points move with the tables every day"** isn't fully true in Activity. Detection only
    tracks NFL, NBA and NHL placement lines plus the bonus races. EPL, CFB and CBB live rules move
    projected but never produce a feed item. So "Moved your points" can say "Live +3" while
    projected actually moved by more. This is either a known limitation, or phase 7 grows EPL
    table-spot tracking.
13. **Ladder composition edge cases.** "1st + you + next 2" breaks when you're last (there's no
    "next 2") and under ties (T3, T3, T3). Rule: always 4 rows, 1st pinned, with the rest a window
    around you, clamped to the ends of the board.
14. **Three different rank phrasings:** hero "projected · 2nd on locked points", sheet "2nd
    projected · 1st locked", breakdown "1st projected · 2nd locked". Use one: "{N} projected ·
    {M} locked".
15. **The hero duplicates the Table's top rows** when you're near the top (for example you're 1st
    and the ladder shows 1st–4th directly above the same four table rows). That's fine as designed,
    but on small phones the Table starts below the fold. Consider collapsing the ladder when the
    Table segment is active.
16. **`PRIOR_SEASON_DISPLAY_LEAGUES` exclusion is mostly already true.** `getLeagueRuleTeams`
    returns `[]` for MLB and WNBA, but manual adjustments (`getTeamAdjustment`) are not filtered,
    so an MLB adjustment would show up. Filter them in `obDrafterAwards`.
17. **Filter pill size differs** from `.filter-chip` (12/700, 6×11 vs 13/600, 8×16). Use the
    existing chip, or add a size modifier.
18. **The design's header** puts Scoring next to a settings avatar in the h1 row. The app's shared
    header (`page-header.js`) is logo + h1 + gear, with chips in the sub-row. Keep the shared
    header.

## Decisions (2026-09-25)
- **Compare** moves to projected. Its header footer now shows "Locked: X vs Y", and the bonus
  chip's Locked uses gold.
- **Unread badge:** red. The new `.count-badge` is shared by the chat tab badge and the Activity
  segment.
- **Rank events** are logged only on entering or leaving 1st, or moving 2+ places.
- **Lock delta display (#10)** is in: "+N" in gold with "locked · 5h" under it, and it is left out
  of the "Live ±N since…" note.
- **Postseason `fact` events (#11)** are deferred.

## Status
Phases 1–8 are built on `points-ux-refactor`. **Deploy the worker first**: it has to accept
`type: 'lock'` or those events get dropped.

Fixes made along the way:
- `.sheet-title-row` is now `position: relative`. `.modal-close` in every bottom sheet was
  positioned against the viewport instead of the sheet.
- Bonus events said "X lose it"; they now say "X loses it".
- The simulated preview no longer scores MLB/WNBA.

**The +5 league bonus is now part of every total (2026-09-25).**
- It goes to the leader of each league's Drafted standings, via `bonusStandings()` in
  `compare.js`, the same compute the Standings Person view and Compare's bonus race use.
- It is Live while the league is open and Locked once it locks. `lockLeague` freezes the holder
  into the lock (`lock.bonus`) after awaiting the bonus tables, and `liveBonusHolder` returns
  `undefined` rather than `null` when a table hasn't loaded, so a lock can never freeze "nobody"
  off missing data. Older locks get the holder backfilled.
- Compare's gap table splits the bonus back out of the awards, so Net always equals the
  difference in totals.

**Off-season rule (2026-09-25).** A league's live table only scores from the first day of its
Regular Season through the end of its Postseason (`isSeasonUnderway` in `season-phase.js`, read
from ESPN's phase calendar; EPL counts once any club has played). After that, the lock is what
counts.
- It is gated in `getLeagueRuleTeams`, so the Points tab, team modal and Standings all agree,
  and in `bonusRace` in `compare.js`. It is also applied to the Activity snapshot, whose totals
  wait until every league's phase is known.
- This stopped College Basketball scoring off last season's final table, NBA scoring off its
  0–0 table, and NHL scoring off preseason records.

**Ties for the bonus** go to whoever the Drafted standings list first. That's fine for now and
may change later.
