# ESPN hidden API — evaluation & migration plan

**Status: every league, College Basketball included, now reads ESPN for standings/rankings,
schedule, and live in-game state — see "College Basketball migration (2026-09-17)" below for the
last one. TheSportsDB has no remaining callers in normal operation at all — see "SportsDB fully
deprecated (2026-09-12)" below. TheRundown's only remaining role anywhere in this app is as a
defensive per-team fallback (CFB's NDSU, and now every mcbb team) for a fetch that ESPN itself
fails to resolve on a given refresh — not a primary source for any league any more.**
**Code:** [`js/espn.js`](../js/espn.js) and [`js/standings-flat.js`](../js/standings-flat.js), wired
into every league's own `js/standings-*.js` file and `js/live-data.js`.

## Why this file exists

A prior session did this same evaluation and the findings only lived in conversation/plan-mode
memory — lost when that session ended. This file is the fix: durable, committed, so the next
session (or the next me) can pick up from here instead of re-discovering all of this from scratch.

## The problem being solved

The dashboard currently stitches together three data sources, each with real friction:

- **TheSportsDB V1** (free key) — CORS-blocked from the browser for most leagues.
- **TheSportsDB V2** (premium key, proxied through `worker/rundown-proxy.js`) — works for team
  lookup/schedule, but has **no standings endpoint at all** — confirmed empty for both NFL and CFB,
  every season tested, via `lookuptable.php`.
- **TheRundown** (paid/metered, proxied through the same worker) — used as the standings/rankings
  workaround (CFB's AP Top 25, NFL's division records) and for live in-game state. Free tier caps at
  20,000 data points/day, shared across all 8 leagues.

**That budget ran out today.** Confirmed live during this evaluation (2026-09-11):

```
$ curl https://team-dashboard-rundown-proxy.boxscore.workers.dev/teams/1   # CFB
HTTP 429 {"error":"Daily data point limit reached","limit":20000,"used":20018,...}
$ curl https://team-dashboard-rundown-proxy.boxscore.workers.dev/teams/2   # NFL
HTTP 429 {"error":"Daily data point limit reached","limit":20000,"used":20018,...}
```

Right now, CFB rankings, NFL standings, and live in-game state are all down for every drafter until
TheRundown's daily quota resets. This isn't a hypothetical risk being evaluated for later — it's the
live state of the app as this plan was written, and it's the direct motivation for finding a
non-metered replacement.

## Recommendation

**Migrate standings/rankings (CFB, NFL) to ESPN's hidden API.** It has no key, no observed rate
limit, and open CORS on every endpoint this app actually needs — which also means it can be called
straight from the browser, no worker proxy required, for the parts piloted here. Treat schedule/team
detail (currently SportsDB V2) as a **separate, lower-priority** later phase — SportsDB V2 already
works for that and isn't rate-limited the way TheRundown is, so there's no burning reason to touch it
yet. Keep TheRundown for one thing only, for now: live in-game clock/score state, which is out of
scope for this evaluation and still working.

## Verified findings

Base host: `https://site.web.api.espn.com` (not the older `site.api.espn.com` — confirmed the two
hosts return byte-identical data for shared paths during this session, so use `.web.` going forward).

| Endpoint | Status | CORS (`Origin: https://boxscorethedraft.pages.dev`) | Notes |
|---|---|---|---|
| `/apis/v2/sports/football/nfl/standings` | ✅ Real, live-accurate | ✅ `access-control-allow-origin: *` | **Conference-level only** — see correction below |
| `/apis/site/v2/sports/football/college-football/rankings` | ✅ Real, rich | ✅ open | 5 polls (AP, Coaches, FCS Coaches, D2/D3 Coaches); rank/prev/trend/points/firstPlaceVotes/record all present |
| `/apis/site/v2/sports/football/nfl/scoreboard` | ✅ Real, live | ✅ open (assumed, same host pattern) | Used to cross-check standings freshness (below) |
| `/apis/site/v2/sports/football/nfl/teams/{id}` | ✅ Real | ✅ open | Team detail |
| `/apis/site/v2/sports/football/nfl/teams/{id}/schedule` | ✅ Real | ✅ open (assumed) | Full season, results + upcoming, clean shape (see Pilot Results) |
| `/apis/site/v2/sports/football/nfl/teams/{id}/injuries` | ❌ **Broken — always returns `{}`** | ✅ open (but moot) | Tested on 2 teams (PHI, KC — both active with real Week 1 injuries in reality). Real injury data requires the hypermedia "core" API instead — see correction below |
| `/apis/common/v3/sports/football/nfl/athletes/{id}/overview` | ✅ Real, rich | not tested (not part of this pilot) | keys: `fantasy`, `gameLog`, `news`, `nextGame`, `rotowire`, `statistics` |
| `/apis/site/v2/sports/football/nfl/teams` (bulk list) | ✅ Real, but... | ❌ **no CORS headers** | Confirmed no `access-control-allow-origin` at all — matches the original caveat. Also needs `?limit=1000`-ish; CFB's version defaults to `limit=400` and silently truncates (see below) |

### Corrections to the initial evaluation

These are things the *original* pass at this evaluation got wrong or didn't check closely enough —
worth flagging explicitly so the next phase doesn't repeat the assumption:

1. **NFL standings is conference-level, not division-level.** `entry.team` on
   `/apis/v2/sports/football/nfl/standings` carries no division field — the response nests exactly
   one level (AFC / NFC, 16 teams each), not conference → division. The dashboard's current
   (uncommitted) NFL standings feature groups by division (AFC North, NFC West, etc., via
   TheRundown's `division` field) — matching that with ESPN requires the **hypermedia "core" API**
   (`sports.core.api.espn.com`) instead, which is a materially bigger build:
   - Conference group → 4 division-group `$ref`s each (confirmed group IDs: AFC East=4, North=12,
     South=13, West=6; NFC East=1, North=10, South=11, West=3 — these are static, don't need
     rediscovering)
   - Each division group's `.standings` is itself a `$ref` to a list of standings *types*
     (overall/playoff/expanded/vs-division)
   - The "overall" one (`.../standings/0`) finally has the real per-team `records[].summary`
     (e.g. `"0-0"`) — but team identity there is *itself* a further `$ref` to `/teams/{id}`
   - **CORS is open at every level of this chain** (confirmed on `/groups/4` and one division's
     `/standings`), so it's technically fetchable client-side — it's just 8 requests (one per
     division's "overall" standings) instead of 1, plus a one-time static ESPN-team-id →
     name/abbreviation table (same pattern as this app's existing `sportsdbId`/`rundownTeamId`
     fields) to avoid resolving 32 more `$ref`s on every refresh.
   - **Open question for the next phase:** is division grouping worth 8 calls + a maintained ID
     table, or is conference-only (what the flat endpoint already gives, for free) good enough? The
     flat version is still strictly better than the status quo (real, live, unmetered) even without
     divisions.

2. **The injuries endpoint doesn't work.** `/apis/site/v2/sports/football/nfl/teams/{id}/injuries`
   returns `{}` for every team tested, including ones with real Week 1 injuries. Real injury data
   lives at `sports.core.api.espn.com/v2/.../teams/{id}/injuries` — also hypermedia, also paginated
   (56 injuries across 3 pages of `$ref`s for one team, each needing its own follow-up fetch for the
   actual injury detail). CORS is open there too, but this is a much heavier feature than "one fetch
   per team" — **not worth pursuing for this pilot's scope**; drop it from the near-term plan
   entirely rather than half-build it.

3. **The bulk `/teams` list needs `?limit=1000`, not the default.** CFB's team list defaults to
   `limit=400` and silently truncates — with the default, Oregon (a team currently in this
   dashboard's roster) doesn't appear in the first 400 results at all. `?limit=1000` returns all 762
   CFB teams (FBS+FCS+D2+D3). Anyone building the one-time ID-mapping lookup needs to know to pass
   this explicitly.

4. **ESPN team IDs do not line up with TheRundown's team IDs** — checked directly: Arizona is
   TheRundown `125` vs ESPN `12`; Georgia is TheRundown `153` vs ESPN `61`; Texas A&M is TheRundown
   `218` vs ESPN `245`. (Ohio State happened to be `194` in both — pure coincidence, confirmed by the
   mismatches above; don't rely on ID reuse anywhere.) Any real migration needs its own fresh
   ESPN-id mapping table, built the same way `sportsdbId`/`rundownTeamId` were: one-time, via `curl`,
   never trusting a coincidental ID match.

### Confirmed still accurate from the original evaluation

- No API key, no observed rate limit (10+ requests fired across this session with no throttling or
  errors — it's espn.com's own CDN).
- Undocumented/unofficial, no SLA, could change or restrict without notice; technically outside
  ESPN's ToS for reuse, unenforced for tiny non-commercial hobby traffic — the same well-trodden
  pattern the OSS fantasy-dashboard space already relies on. This app is ~10 people, non-commercial;
  the risk profile is low, but it's not zero — see "What to keep in reserve" below.

## Pilot results — field-for-field verification

### CFB: AP Top 25 vs. what's live today

ESPN's `AP Top 25` poll, fetched live (2026-09-11):

| Rank | Team | Record | Trend | 1st-place votes |
|---|---|---|---|---|
| 1 | Ohio State | 1-0 | – | 46 |
| 2 | Georgia | 1-0 | +1 | 0 |
| 3 | Notre Dame | 1-0 | +1 | 4 |
| 4 | Texas | 1-0 | +1 | 2 |
| 5 | Indiana | 1-0 | +1 | 8 |

This is strictly richer than what TheRundown's `ranking` field gives today (a bare `1`–`25` integer,
no trend, no votes, no points). Two of this dashboard's drafted CFB teams (Ohio State, Georgia) are
both currently ranked — real, plausible Top-5 placement. Couldn't diff this directly against
TheRundown's live values for the same teams because TheRundown is the thing that's down right now
(see the 429s above) — but the *shape* matches what `js/standings-cfb.js`'s `computeCfbRankingTable`
already expects (a rank number + record string per team), so wiring it in is a data-source swap, not
a UI rewrite.

### NFL: standings vs. actual final scores

Cross-checked ESPN's standings against ESPN's own scoreboard for the two Week 1 games that had
finished as of this pilot, to confirm the standings endpoint isn't stale/cached:

| Team | Scoreboard result | Standings W-L | Standings PF-PA | Streak |
|---|---|---|---|---|
| Seattle | beat NE 13-10 | 1-0 | 13-10 | +1 |
| LA Rams | lost to SF 7-27 | 0-1 | 7-27 | -1 |
| Philadelphia, Dallas, KC, LA Chargers (hadn't played yet) | — | 0-0 | 0-0 | — |

Standings updated correctly and immediately for the teams that had played, and correctly still
showed 0-0 for teams whose Week 1 game hadn't happened yet — this is live, accurate data, not a
cached/stale snapshot. Verified via a real parse of the actual JSON (not eyeballed) — see
`fetchEspnNflStandings` in `js/espn.js`, which is the exact code that produced this table.

## Proposed phasing

**Phase 1 — pilot & evaluate (this document + `js/espn.js`).** Done.

**Phase 2 — wire CFB rankings into the live UI.** Lowest-risk first move: replace
`computeCfbRankingTable`'s TheRundown-sourced `ranking` field with `fetchEspnCfbRankings()`'s output
in `js/standings-cfb.js`. Keep win/loss `record` on TheRundown for now (smaller diff, and TheRundown
still works for that once its quota resets) — only swap the ranking source. Needs: a name-matching
step between ESPN's `location`/`teamName` and this app's `TEAM_META[...].name` (most match directly —
"Ohio State", "Georgia", "Texas A&M" all match ESPN's `team.location` verbatim — but a few won't
(e.g. IU's `meta.name` was `'IU'`, ESPN's `location` is `'Indiana'` — since renamed to `'Indiana'`) and need explicit overrides,
same as `abbrFromName`'s existing fallback pattern for undrafted teams.

**Phase 3 — wire NFL standings into the live UI, conference-only first.** Swap
`js/standings-nfl.js`'s TheRundown-sourced win/loss/streak/PF/PA for `fetchEspnNflStandings()`'s
output. Ship conference-grouped (AFC/NFC, 16 teams each) rather than blocking this phase on the
division hypermedia chain from finding #1 above — re-evaluate division grouping as a follow-up once
conference-level is live and proven stable, not before.

**Phase 4 (later, lower priority) — decide on NFL division standings.** Build the 8-call hypermedia
chain + static ESPN-team-id table if the conference-only view in Phase 3 turns out to feel like a
downgrade in practice. Not urgent — TheSportsDB has never had this data at all, so conference-only
ESPN is already a net improvement over what division grouping *would* have needed before this
evaluation (TheRundown, still metered).

**Phase 5 (separate, not urgent) — schedule/team detail off SportsDB V2.** ESPN's
`/teams/{id}/schedule` and `/teams/{id}` are real, clean, and CORS-open — a plausible full
replacement for the SportsDB V2 calls currently proxied through the worker (`fetchSportsDbV2Team`/
`fetchSportsDbV2Schedule` in `js/api.js`). Deliberately **not** part of this pilot's scope — SportsDB
V2 isn't the thing that's on fire today, so there's no urgency, and touching it means rebuilding the
`sportsdbId` → ESPN-id mapping for every drafted team across every league (bigger lift than the two
standings pilots above). Revisit once Phases 2-3 have proven out in production.

**What NOT to do:** don't pursue ESPN's injuries endpoint (finding #2 — broken at the simple layer,
disproportionately expensive at the real layer) or the athlete-overview endpoint (never asked for,
no current UI surface needs it) as part of this migration. They're real and verified working, but
they're new capabilities nobody requested, not fixes for something broken today — building them now
would be scope creep beyond what this evaluation set out to do.

## EPL phase (added 2026-09-11, outside this plan's original NFL/CFB scope)

Migrated EPL's league table from TheSportsDB V1 (`lookuptable.php`, routed through
`worker/rundown-proxy.js`'s now-removed `/sportsdb/table/:leagueId/:season` route) to ESPN's hidden
API, on request, once the NFL/CFB pattern above had already proven out. Unlike NFL/CFB, TheSportsDB's
table endpoint actually worked for EPL (it's the one league that had real standings from it) — this
wasn't a broken-data fix like Phases 2-3, just consolidating onto the one already-adopted API and
dropping a worker route (and its premium-key dependency) that only EPL used.

**Endpoint:** `GET https://site.web.api.espn.com/apis/v2/sports/soccer/eng.1/standings` — same
`site.web.api.espn.com` host as NFL/CFB, same open CORS (`access-control-allow-origin: *`), no key. A
single-table league only has one standings type, so (unlike NFL's conference split) the real per-team
rows are one level shallower: `data.children[0].standings.entries[]`, not `data.children[].standings...`
per group.

**Field parity, verified against a live pull (2026-09-11) covering all 20 currently-drafted clubs:**
every field the Standings tab, board cards, the team modal, and the League Facts rank-auto rules used
from TheSportsDB's table (rank, wins, draws, losses, points) has a direct ESPN equivalent
(`stats[name=rank/wins/ties/losses/points].value`). ESPN's table is a strict superset — it also
carries `gamesPlayed`, `pointDifferential` (goal difference), `pointsFor`/`pointsAgainst` (goals
for/against), and a qualification/relegation `note.description` (e.g. "Champions League", "Europa
League", "Relegation") that TheSportsDB's table never exposed at all. None of those extra fields are
wired into the UI yet — this migration was a straight data-source swap, not a feature addition; adding
a zone-color treatment to the standings table would be a reasonable, separate follow-up.

**ID mapping:** ESPN's team ids don't line up with TheSportsDB's `sportsdbId` (same "don't trust ID
reuse" lesson as finding #4 above), so matching now goes by club name instead — reusing
`findDraftedTeamByName` from `js/utils.js` unchanged (already the match strategy the old EPL code used
for turning a table row into a drafted team). No EPL-specific override table was needed, unlike
CFB/NFL: `findDraftedTeamByName`'s `normalizeTeamName` helper already carries a `'man city'`/
`'man united'` alias from an earlier fix, which happens to be the only pair of the 20 drafted clubs
whose ESPN name ("Manchester City"/"Manchester United") doesn't substring-match this app's shortened
`meta.name` ("Man City"/"Man United"). Everything else — including clubs this app abbreviates
differently, like "Newcastle" (ESPN: "Newcastle United") and "Brighton" (ESPN: "Brighton & Hove
Albion") — matches through the plain substring rule, confirmed against the live pull.

**Follow-up (same day):** the "reasonable, separate follow-up" mentioned above landed almost
immediately — EPL's schedule (Most Recent Result / Next Match) moved off TheSportsDB V2's
`schedule-previous`/`schedule-next` onto ESPN's `teams/{id}/schedule` (default call = played matches
this season, `?fixture=true` = every remaining fixture), and the standings' zone field got wired into
the team card as a colored tag. Same call count per team as before (2 schedule calls), but each now
carries a real venue name and TV broadcast that TheSportsDB never had — see `fetchEspnTeamSchedule`
in `js/espn.js` and `renderForm`/`renderNext`/`renderRowStatus` in `js/live-data.js`. Added a "Form"
strip (last 5 results as pills) computed client-side from the same schedule response — no extra
request. This club's ESPN team id is resolved the same way `findEspnEplRow` already does for the stat
strip (by name, through the standings cache), not a new stored field, so `fetchTeamBundle` awaits
`fetchEplStandingsTable()` before fetching the schedule. Deliberately left out: DraftKings odds (also
available on ESPN's per-match `summary` endpoint) — the CSS already has a `.nm-prob` slot that looks
built for exactly this, but showing a sportsbook line in a friend-group fantasy app was called a tone
decision, not a technical one, and shelved for now.

## What stays on TheRundown

**Superseded — see "Second migration wave" and "SportsDB fully deprecated" below.** Live in-game state
moved off TheRundown too, onto ESPN's scoreboard endpoint, for every league that has an ESPN
standings-based team-id mapping (EPL, NFL, CFB, NBA, NHL, MLB, WNBA). TheRundown's only remaining
caller in normal operation is College Basketball (no ESPN integration built for it yet — see that
section); CFB's NDSU no longer needs it (see below) but a defensive fallback to it stays in place for
if ESPN's per-team fetch for NDSU ever fails on a given refresh.

## If this holds up: what Phase 2+ removes

Every standings/rankings call that moves to ESPN is one that (a) no longer touches the 20,000/day
TheRundown budget (or, for EPL, the premium TheSportsDB key's own limits), and (b) no longer needs
`worker/rundown-proxy.js` at all — CORS is open, so it's a direct browser fetch, zero proxy code. The
EPL phase already did this: its `/sportsdb/table/:leagueId/:season` route (and the now-unused
`sportsdbTable` cache TTL) are removed from the worker entirely, since EPL was the only league that
ever called it. If Phases 2-4 all land too, `worker/rundown-proxy.js` shrinks further to just the
League Facts KV store (job #2 in its own header comment), the one-off TheSportsDB V1 admin lookup, the
V2 team/schedule proxy, and whatever's left of the TheRundown live-state proxy — worth revisiting that
file's own header comment once this migration is further along, since large chunks of "why this worker
exists" will no longer apply.

## Second migration wave (2026-09-12): remaining leagues + live state off TheRundown

A full review of every remaining SportsDB/TheRundown call site (requested after the EPL phase above
landed) turned into five more phases, executed in one session and merged together. Reviewed in order:

**A — NBA/NHL/MLB/WNBA standings.** These 4 leagues had *no* standings source at all before this —
TheSportsDB's free tier never carried real standings for them, so the Standings tab just said "No data
available." `apis/v2/sports/{sport}/{league}/standings` (same flat, conference-grouped shape NFL
already used) works identically for all 4 — verified live. Pure upside, zero regression risk, so this
shipped first. Rather than duplicate NFL's ~30-line fetcher four more times, `fetchEspnFlatStandings`
in `js/espn.js` factors out the shared "walk `children[].standings.entries[]`" logic (NFL's own
fetcher was refactored onto it too), and `js/standings-flat.js` factors out the shared cache/toggle/
render engine every one of these 4 leagues' `js/standings-nba.js`/`-nhl.js`/`-mlb.js`/`-wnba.js` files
build on top of — each of those is now a thin, sport-specific config (record formatting, sort order,
how the "Person" combined record is built) rather than a second copy of NFL's whole file.

Matching an ESPN row back to a drafted team turned out to need an **exact** match (after
`normalizeTeamName`), not EPL/CFB's looser substring rule (`findDraftedTeamByName` in `js/utils.js`) —
tried the substring rule first here and it produced a real false positive: "Nets" is a literal
substring of "Hornets", so Charlotte Hornets matched to the Brooklyn Nets on the standings table. Fixed
by adding `findFlatTeamKey` (exact-match only) in `js/standings-flat.js`, plus two aliases in
`TEAM_NAME_ALIASES` (`js/utils.js`) for the only two of 120 drafted teams that don't match ESPN's plain
nickname (`team.name`) exactly: "Mavs" vs "Mavericks", "Blazers" vs "Trail Blazers". Also caught: ESPN
rows had to expose that nickname as a separate `teamNickname` field alongside the full `teamName`
("Cleveland Cavaliers") used for display — matching against the full name would need substring logic
again, reintroducing the same bug.

**B — NBA/NHL/MLB/WNBA schedule.** Same `fetchEspnTeamSchedule` EPL already used (see below), just
pointed at each league's own sport/league slug. One real cross-sport gap found while building this:
the `?fixture=true` flag's behavior isn't consistent — for soccer it genuinely splits (default =
played only, `?fixture=true` = remaining only), but for MLB *both* calls return the full ~165-game
season regardless. Fixed by not trusting the flag at all: `fetchEspnTeamSchedule` now merges both
responses by event id and does the real recent/upcoming split itself off each event's own `completed`
flag. A second bug surfaced by this: the Cubs' real schedule has three `STATUS_POSTPONED` games
(April, June) that are permanently "incomplete" but dated months in the past — without a date guard
those sorted to the front of "upcoming," so `fetchEspnTeamSchedule` now also requires an upcoming
event's date to be `>= now`.

**C — CFB records off TheRundown.** The AP Top 25 moved to ESPN back in Phase 2 above; the full-roster
win-loss record (board card, team modal, "Person" view) was still TheRundown's `/teams/{sportId}`.
ESPN's own `college-football/standings` covers this — but only for the 124 FBS teams across 11
conferences, not FCS. This app has exactly one drafted FCS team (NDSU), so `findCfbRecord` in
`js/standings-cfb.js` tries ESPN first and falls back to the existing TheRundown cache only when ESPN
has no row — the other 29 of 30 drafted CFB teams never touch TheRundown for this anymore. One data
shape surprise: unlike NFL/NBA/NHL/MLB, CFB's stats array has no flat `losses` field at all (confirmed
live) — only several named per-split records (home, division, vs-AP-ranked, etc.), one of which
(`overall`) carries a `summary` string like `"1-0"`. `fetchEspnCfbFullStandings` parses that the same
way `parseWinLossRecord` already parses TheRundown's identically-shaped record string.

**D — NFL/CFB schedule off SportsDB V2.** Folded into the same `FLAT_SCHEDULE_LEAGUES` map in
`js/live-data.js` that EPL/NBA/NHL/MLB/WNBA already used, rather than a separate code path — the only
wrinkle was making sure NDSU (no ESPN row, from phase C) falls through to the *existing* generic
TheSportsDB branch instead of ending up with no schedule at all: `fetchTeamBundle`'s ESPN-schedule
branch only commits (and `return`s) once `findRow(meta)` actually resolves a row; otherwise it falls
through to the code below exactly as it did before this phase existed.

**E — Live in-game state, all leagues, off TheRundown.** The last TheRundown dependency for every
league except College Basketball. `fetchEspnScoreboard(sportPath)` (`js/espn.js`) is one request per
league covering every team's current game at once (mirrors `rundownDayCache`'s "one shared fetch, not
one per team" shape in `js/api.js`) — `competitions[0].status.type.state` is `'in'` for a game actually
in progress, `'pre'`/`'post'` otherwise, and each competitor already carries a live `score`, so no
second polling endpoint is needed. `findEspnScoreboardLine` normalizes that into the same
`{isHome, own, opp, opponentName, period}` shape `rundownEventLine` already built from TheRundown, so
`renderStats`/`renderForm`/`renderNext`/`renderRowStatus` in `js/live-data.js` just gained a
`bundle.espnLive` check ahead of their existing `bundle.rundownEvent` one, rather than a parallel
rewrite. Verified against a real live window (2026-09-12, four MLB games actually in progress) rather
than just structurally: San Diego at San Francisco correctly showed `LIVE 7-5 · Bot 5th` on both the
board pill and the team modal, live, mid-game.

**What this leaves on TheRundown (at the time this phase shipped):** College Basketball (no ESPN
integration built for it at all yet — it has no standings/schedule source today either, TheSportsDB
never carried it; giving it the same treatment as the other 7 leagues is a real follow-up but a
bigger lift, since there's no existing schedule/standings scaffolding to extend the way there was
here). CFB's NDSU no longer needs it — see "SportsDB fully deprecated" below. Every other league's
per-team live/schedule/record fetch no longer touches TheRundown's shared daily quota at all.
**Update (2026-09-17): the "bigger lift" assumption above turned out to be wrong — see "College
Basketball migration" below, which closes this gap the same way the other 7 leagues were closed.**

## SportsDB fully deprecated (2026-09-12)

Audited every remaining TheSportsDB call site after the second migration wave above, prompted by a
direct ask to confirm the API could be fully retired. Two real gaps turned up, both now closed:

1. **NDSU (CFB) never actually needed to fall back to TheSportsDB.** Phase D above accepted NDSU
   falling through to the generic TheSportsDB schedule branch since ESPN's FBS-only standings endpoint
   has no row for an FCS program. But ESPN's *individual* team endpoint
   (`/apis/site/v2/sports/football/college-football/teams/{id}?enable=record`) works for any team id
   regardless of division — confirmed live for NDSU (espn id `2449`), CORS-open, same host family as
   `fetchEspnTeamSchedule`. Added `fetchEspnCfbTeamRecord` (`js/espn.js`) and inject its result as a
   plain extra row into `espnCfbRecordsCache.rows` (`js/standings-cfb.js`'s `NDSU_ESPN_TEAM_ID`/
   `fetchEspnCfbRecordsCached`) — `findEspnCfbRow`/`findCfbRecord` and `FLAT_SCHEDULE_LEAGUES.cfb`'s
   `findRow` in `js/live-data.js` all pick it up for free from there, so NDSU now gets a real record,
   AP-rank lookup, and full ESPN schedule (with real venue/broadcast) exactly like every FBS team,
   and never reaches the TheSportsDB branch in `fetchTeamBundle` in normal operation. TheRundown's
   `cfbRecordsCache` fallback in `findCfbRecord` stays as a defensive fallback for if this one team's
   fetch ever fails on a given refresh — everything else in this app's "graceful degradation instead
   of a hard dependency" pattern works the same way.

2. **The same audit found a second, unrelated FBS-standings gap while checking every drafted team
   against a live pull:** `fetchEspnCfbFullStandings`'s conference walk only read `standings.entries`
   directly off each conference node — true for 10 of ESPN's 11 CFB conferences, but the Sun Belt
   Conference nests its East/West divisions one level deeper instead (confirmed live: the top-level
   "Sun Belt Conference" node has 0 direct entries but 2 child groups that do), so all ~14 Sun Belt
   teams silently had no row at all — caught via James Madison (`ericprister_jamesmadison`) showing no
   record despite being FBS. Fixed by making that walk recurse into `children` when a conference has no
   direct entries, rather than a one-off special case for Sun Belt specifically.

3. **The bigger volume fix: `fetchTeamBundle`'s ESPN-schedule branch (`js/live-data.js`) was still
   fetching TheSportsDB's `info` (team bio: Sport/Founded/Stadium) unconditionally for every team that
   resolves via ESPN** — i.e. every drafted team in all 7 migrated leagues, every refresh tick. But
   `renderStats` always renders that league's real ESPN record branch first and returns before ever
   reaching the `bundle.info` fallback, for every league with an ESPN branch — so that fetch's result
   was never actually displayed for any team on this path. Removed the `fetchTeamInfoCached` call from
   that branch entirely; it's still fetched by the generic legacy branch below it, which remains the
   real fallback for any future team that doesn't resolve an ESPN row at all.

With NDSU (1) and Sun Belt (2) both fixed, every one of this app's currently drafted teams across all
7 ESPN-migrated leagues resolves a real ESPN row — verified by cross-checking all ~200 drafted teams'
`TEAM_META` names against a live pull of each league's ESPN standings/matching field. That means
`fetchTeamBundle`'s generic TheSportsDB branch (`fetchSportsDbV2Team`/`fetchSportsDbV2Schedule`/
`API_BASE`'s v1 `lookupteam.php`/`eventslast.php`/`eventsnext.php`) is provably unreachable for the
current roster — kept only as scaffolding for a genuinely new future gap (e.g. next season's draft
picking up another lower-division team), the same reasoning that already kept TheRundown's NDSU
fallback in place after (1). Nothing in this app makes a TheSportsDB call in normal operation today.

**Bonus fix found by the same audit: most NBA/NHL/MLB/WNBA teams' modals were showing a permanent
"not hooked up yet" placeholder instead of real data, unrelated to TheSportsDB.** Only Josh's own 21
teams were ever given a real `sportsdbId`/`rundownTeamId` in `TEAM_META` — every other drafter's team
in those 4 leagues (~100 teams) has neither field, a pre-existing gap that predates this migration.
Their board-card record already worked (it comes from `js/standings-flat.js`'s name/nickname matching,
independent of `sportsdbId`), but `openTeamModal`'s `hasLive` gate and `fetchTeamBundle`'s ESPN branch
were both still keyed on `meta.sportsdbId`/`meta.rundownTeamId` being set, wrapping the *entire* ESPN
path in `if(meta.sportsdbId)` — so a team with a real ESPN row but no `sportsdbId` never got there at
all. Fixed by moving the `FLAT_SCHEDULE_LEAGUES` check (and its own `if(row)` gate) ahead of the
`sportsdbId`/`rundownTeamId` check in `fetchTeamBundle`, and adding
`!!FLAT_SCHEDULE_LEAGUES[meta.leagueKey]` to `hasLive` in `openTeamModal` — both in `js/live-data.js`.
Verified live: the Brewers (`drew_brewers`, no sportsdbId) now show a real 92-56 record, form strip,
last result, and next match with real venue/broadcast, same as any team with a `sportsdbId` always did.
Scoped to the 7 `FLAT_SCHEDULE_LEAGUES` leagues only — College Basketball still has no ESPN integration
at all (see phase E), so its teams without a `rundownTeamId` still show the placeholder, correctly:
there's genuinely no data source for them yet.

## Team badge logos for NBA/NHL/MLB/WNBA (2026-09-12)

EPL/CFB/NFL's drafted teams each carry a static `badgeUrl` in `TEAM_META` (`js/data.js`) — real crest
images, historically hotlinked from TheSportsDB, rendered via `teamBadgeHtml` (`js/utils.js`). The 100
NBA/NHL/MLB/WNBA teams never got this treatment: `js/standings-flat.js`'s `renderStandingsRow` only
gave an ESPN-sourced crest to *undrafted* teams (the `row.logoUrl` fallback in its inline `meta`
object) — every drafted team in these 4 leagues fell through to the plain colored-monogram box
everywhere (board cards, Standings tab, team modal), since `TEAM_META` had no `badgeUrl` at all for
them. Fixed by adding one to every entry, sourced from ESPN's own logo CDN
(`a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png`, confirmed stable/CORS-irrelevant since these are
static hotlinks, not live API calls) rather than TheSportsDB, matching "SportsDB fully deprecated"
above — pulled via each league's own `/apis/v2/sports/.../standings` endpoint (same one
`fetchEspnFlatStandings` already uses) and matched to `TEAM_META` by team name, reusing the same exact-
match/alias rules `findFlatTeamKey` already relies on. All 100 teams matched with no misses.

## Game Details: a live MLB boxscore off the team modal (2026-09-12)

The team modal's LIVE line has always been a single line (score + period, from
`fetchEspnScoreboard`) — this adds a drill-down to a real boxscore, wired up for MLB first as a pilot
before touching any other sport.

**UX: three structural options were mocked up and reviewed before writing any code** (a stacked
comparison of "drill down in place," "a wider sheet stacked on top," and "a dedicated full-width game
page" — see the chat history for the actual mockups). **Option B — a second, wider sheet stacked on top
of the team modal — is what shipped.** It keeps the modal mental model (tap in, tap/back out) while
giving a real batting/pitching table more room than the 400px team card allows. The team modal
underneath stays open and dimmed, not closed — closing the sheet (back arrow, ✕, backdrop tap, or Esc)
returns to it, not to the team list.

**New data source: `fetchEspnSummary(sportLeaguePath, eventId)` in `js/espn.js`** — ESPN's
`/apis/site/v2/sports/{sport}/{league}/summary?event={id}` endpoint, fetched only when a drafter
actually taps "View full boxscore" (never prefetched alongside the team modal's own live line, unlike
`fetchEspnScoreboard` which covers every game in the league in one shared request). `eventId` is now
carried on `findEspnScoreboardLine`'s return value too — previously discarded since nothing needed it
before this.

**MLB-only for now, on purpose.** The entry point in `renderNext` (`js/live-data.js`) is gated on
`meta.leagueKey === 'mlb'`; the parsing in `fetchEspnSummary` reads baseball's own field shapes
(`situation.balls/strikes/outs/onFirst/onSecond/onThird`, `boxscore.players[].statistics[].labels/
athletes`). Extending this to another sport needs that sport's own read of its real summary response,
not just pointing `fetchEspnSummary` at a different `sportLeaguePath` — football's situation is
down/distance/possession, basketball and soccer don't get a `situation` object back at all (see the
per-sport mockup exploration referenced above).

**Verification caveat:** this session's outbound network access couldn't reach `site.web.api.espn.com`
at all (egress-blocked, same restriction noted earlier in this doc) — every field name above comes from
the endpoint's documented/well-known shape (community reverse-engineering docs, e.g.
`pseudo-r/Public-ESPN-API`), not a live payload read during this build. Every read in `fetchEspnSummary`
is defensive (guarded, never an assumed-present chain) specifically because of this, and the whole
feature was instead verified against a Playwright run with mocked ESPN responses matching this assumed
shape — real screenshots, real DOM assertions, but not real ESPN data. **The first live MLB game this
runs against for real is the actual verification pass**; if `situation` or `boxscore` come back oddly
shaped, both are already isolated to `fetchEspnSummary`'s own defensive parsing rather than spread
through the render code, minimizing where a fix in the JSON contract would have to be repointed to.

## Division standings for NBA/NHL/MLB (2026-09-12)

NFL was the only league with a real Division-nested-under-Conference standings view
(`espnNflDivisionCache`/`fetchEspnNflDivisionStandings` in `js/standings-nfl.js`/`js/espn.js`) — NBA/
NHL/MLB stayed flat (conference/league only) since `js/standings-flat.js`'s shared engine had no
division concept at all. Generalized that engine instead of writing three more NFL-sized bespoke files:
`createFlatStandingsBoard` now takes an optional `fetchDivisionStandings` — when a caller passes one
(NBA/NHL/MLB do; WNBA doesn't, since real-world WNBA has no divisions), the board gains its own
division cache, a nested Divisions/Conference sub-toggle under each conference (same UX NFL pioneered),
and `js/board.js`'s shared `renderFlatLeagueBlock` branches on `api.hasDivisions` as NFL's own bespoke
block already did. WNBA is untouched — omitting `fetchDivisionStandings` makes the board behave exactly
as it did before this existed.

Division data comes from the same hypermedia "core" API chain NFL's version pioneered
(`sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/seasons/{year}/types/2/groups/{groupId}/standings/0`),
generalized into a shared `fetchEspnCoreDivisionStandings` helper in `js/espn.js` (NFL's own function
was left untouched rather than refactored onto it, to avoid risking already-shipped behavior for no
user-facing gain). Division group ids were discovered live (2026-09-12) the same way NFL's were: walk
each sport's 2 top-level conference groups' `/children` refs. Two real per-sport wrinkles found along
the way:
- **NBA's per-division record bucket isn't named `overall`** the way NFL/NHL/MLB's all are — confirmed
  live, NBA's division-standings sub-resource instead names it `'Division Standings'` (no record
  literally named `overall` exists there at all). `fetchEspnCoreDivisionStandings` takes the record name
  as a parameter rather than assuming one string works everywhere.
- **MLB's division names collide across leagues** — AL and NL both have an "East"/"Central"/"West".
  Unlike NFL's "AFC East" (where a simple name-prefix match distinguishes conferences), each division
  now carries its own explicit `conferenceAbbr` field (set directly from the caller's own division map,
  not parsed off the display name), so `computeDivisionStandings(conferenceAbbr)` filters on that field
  instead of string-matching a name.

## Polling-cadence review (2026-09-12)

Requested audit of whether the background refresh loop (`js/live-data.js`) is still calling ESPN
efficiently now that it backs almost the entire app, and whether the cadence actually keeps up with
live scores. Two real findings, both fixed:

1. **`LIVE_TEAM_KEYS` was silently excluding ~117 of this app's 210 drafted teams from the background
   refresh rotation entirely.** The filter only included a team if it had a `sportsdbId` or
   `rundownTeamId` set — correct back when those ids were the only way to fetch a team's live data, but
   stale since the second migration wave: NBA/NHL/MLB/WNBA teams (every one but Josh's own 21) resolve
   real ESPN data by **name**, through `FLAT_SCHEDULE_LEAGUES`, with no id field involved at all (see
   "Bonus fix" in "SportsDB fully deprecated" above, which fixed this same class of bug for
   `fetchTeamBundle`/`openTeamModal` but missed that `LIVE_TEAM_KEYS` gated the rotation on the exact
   same stale condition). Net effect: those ~117 teams' board-row pills only ever got a real value if
   someone happened to open that team's modal — never proactively, never automatically refreshed after
   that. Fixed by adding `!!FLAT_SCHEDULE_LEAGUES[meta.leagueKey]` to the filter, which grows the
   rotation from 93 to 183 teams (the ~27 College Basketball teams with no ESPN integration and no
   legacy id correctly stay excluded — there's genuinely no data source for them yet).

2. **The refresh cycle's length was still being derived from a TheSportsDB rate-limit budget
   (`SPORTSDB_CALLS_PER_TEAM_TICK`/`SPORTSDB_RATE_BUDGET_PER_MIN`) that no longer describes reality.**
   Per "SportsDB fully deprecated" above, nothing in normal operation calls TheSportsDB anymore, and
   ESPN has no observed rate limit — so the formula's own justification was gone, even though the
   5-minute floor it produced (`MIN_REFRESH_CYCLE_MS`) happened to still bind at both the old team count
   (93) and the new one (183). Removed the stale budget formula/constants; `MIN_REFRESH_CYCLE_MS` is now
   documented as a plain product choice (how fresh does a full schedule re-fetch need to be), not a
   rate-limit calculation.

   Separately, that 5-minute-per-team rotation was never really what kept live scores current in the
   first place — with 183 teams sharing one cycle, any single team's turn only comes up roughly once
   every 5 minutes, which is far slower than "the score just changed." Added `liveScoreboardSweepTick`
   (`js/live-data.js`), a second, narrow, fast loop (every `LIVE_SWEEP_INTERVAL_MS` = 20s) that re-reads
   the same shared per-league scoreboard the rotation already uses (`fetchEspnScoreboardCached`, still
   cached 60s, so this adds no real request volume — same 7 requests/minute ceiling regardless of team
   count) and patches just the live/final score line into every team's already-cached bundle at once,
   independent of whose turn it is in the slower rotation. Also extended `renderRowStatus` to show a
   just-finished final score immediately off that same patch (previously it only special-cased the
   *live* state, so a game that ended between two of a team's rotation turns would sit on stale "LIVE"
   or blank text for up to 5 minutes before the schedule-based fallback caught up). See
   `liveScoreboardSweepTick`'s own header comment in `js/live-data.js` for why this is a second loop
   rather than just shortening the rotation above (re-fetching every team's full schedule every 20s
   would be pure waste — that data doesn't move mid-game, only the score does) — `js/api.js`'s
   "Adding a new league" checklist was updated to document this as a narrow, deliberate exception rather
   than an invitation to add more polling loops.

## Game Details for CFB, and two real MLB bugs found along the way (2026-09-12)

Extended the "Game Details" boxscore sheet (see the entry above) from MLB-only to also cover CFB,
using real live ESPN data this time — this session had actual internet access to `site.web.api.espn.com`
and `site.api.espn.com` (confirmed byte-identical), unlike the session that originally built the MLB
version, which had to write its whole parser against documented/reverse-engineered field shapes with no
way to check them. Checking the real payloads surfaced two genuine bugs already live in the shipped MLB
code, fixed as part of this same change since they're the same code path CFB needed to be correct anyway:

1. **`situation` (balls/strikes/outs/baserunners) never populated — confirmed always `null`** on every
   real in-progress MLB game checked. `fetchEspnSummary` (`js/espn.js`) read it off
   `data.header.competitions[0].situation`, but that field simply isn't there on the **summary** endpoint
   for either sport tested. The real, only place ESPN's hidden API exposes live down/distance or
   ball/strike/baserunner state is the **scoreboard** endpoint's own per-event `situation` — confirmed
   live for both MLB and CFB — which this app already fetches every 60s for the LIVE line anyway
   (`fetchEspnScoreboard`/`findEspnScoreboardLine`). Fixed by threading `situation` through those two
   functions instead (raw passthrough, not normalized — the shape is sport-specific and both consumers
   read their own sport's fields directly) and having `openGameDetail`/`renderGameDetail`
   (`js/live-data.js`) read it off `bundle.espnLive.situation` rather than the summary response. Real
   upside: this is also fresher than the summary fetch (re-patched every ~20s by
   `liveScoreboardSweepTick`, vs. only on tap for the summary itself).
2. **Every per-inning linescore cell rendered blank.** `fetchEspnSummary` read `l.value` off each
   `linescores[]` entry; the real field is `l.displayValue` — confirmed on both a live MLB and a live CFB
   game. `value` doesn't exist on the object at all, so this silently produced `undefined` → the
   `–` placeholder in every inning/quarter cell, on every game, since the feature shipped. One-line fix.

**CFB's own real differences, confirmed live:**
- Situation: football's pre-formatted `downDistanceText` (e.g. "1st & 10 at ORE 25") is simpler to render
  than baseball's, which has to be composed field-by-field from balls/strikes/outs/onFirst/onSecond/
  onThird — see `footballSituationText` vs. `mlbSituationText` in `js/live-data.js`. ESPN omits
  `downDistanceText` entirely at a dead-ball moment (confirmed live during a timeout) rather than sending
  an empty string, so this degrades to showing nothing rather than a broken/blank situation line.
- Linescore is 4 quarters (+ OT) instead of 9 innings, and the trailing summary column is just the final
  score — no hits/errors concept on this endpoint for football, so that whole column group is omitted
  for CFB instead of showing two meaningless "–" cells.
- The passing/rushing/receiving/defensive/kicking/punting boxscore tables needed no CFB-specific code at
  all — confirmed live that `boxGroupHtml`'s generic `labels`/`athletes` reader, written for baseball's
  batting/pitching tables, renders football's real payload correctly unchanged.
- Added a sibling `fetchEspnFootballSummary` (`js/espn.js`) rather than overloading the MLB-only
  `fetchEspnSummary`, matching this codebase's own convention of keeping per-sport functions separate
  (see NFL/NBA/NHL/MLB's own separate standings fetchers) — it shares the identical boxscore-player
  parsing via a small internal helper (`parseEspnBoxscorePlayers`) with the MLB function, since that part
  turned out to be genuinely sport-agnostic, but keeps its own team/score/linescore fields (no
  runs/hits/errors) since football's summary has no baseball-shaped stats to force onto. Written to be
  reused by NFL later (same shape), though NFL itself wasn't wired up as part of this change.
- **NDSU (the one FCS team drafted in CFB) is confirmed NOT covered by this app's scoreboard fetch.**
  Checked live: NDSU's actual 2026 schedule is entirely FBS opponents (Air Force, Wyoming, UNLV, Nevada,
  New Mexico, UTEP, Hawai'i, Northern Illinois, San José State — an FBS transition season), but its
  real game against Air Force doesn't appear in `fetchEspnScoreboard('football/college-football')`'s
  response (no `groups=` param) at all, nor in a `groups=81` (FCS) fetch. Not fixed — this degrades the
  same way the standings gap for this exact team already does elsewhere (see `NDSU_ESPN_TEAM_ID` in
  `js/standings-cfb.js`): no live line, no Game Details entry, for this one team only.

## Game Details boxscore trimmed to core stats (2026-09-12)

Feedback after the CFB rollout above: showing every stat group ESPN sends (10 groups per team for
football — passing/rushing/receiving/fumbles/defensive/interceptions/kickReturns/puntReturns/kicking/
punting — plus season-average columns like AVG/OBP/SLG mixed into MLB's batting/pitching rows) was
overkill for this app's quick drill-down, compared to what a typical sports-stat site leads with.
`parseEspnBoxscorePlayers` (`js/espn.js`) now takes a `groupColumns` map per sport (`MLB_BOX_GROUP_COLUMNS`,
`FOOTBALL_BOX_GROUP_COLUMNS`) that drops any group not in the map entirely and narrows a kept group's
columns to a curated whitelist, matched by ESPN's own label string (not position) so it stays correct if
ESPN reorders its columns. Football keeps passing/rushing/receiving only (C/ATT-YDS-TD-INT,
CAR-YDS-TD, REC-YDS-TD); MLB keeps batting/pitching with the season-average trailing columns dropped
(AB-R-H-RBI-HR-BB-K, IP-H-R-ER-BB-K). `boxGroupHtml` (`js/live-data.js`) itself didn't need to change —
it was already just rendering whatever labels/rows it was handed.

**Real wrinkle found while wiring this up:** the group-identifying field on a player-stat block isn't
consistent across sports — confirmed live, football sends it as `stat.name` ('passing', etc.) with no
`type`, while MLB sends it as `stat.type` ('batting'/'pitching') with no `name` at all. The initial
version of this filter checked `stat.name` only, which silently produced an empty boxscore for MLB
(zero groups matched) while working fine for CFB — caught by re-testing against a real live MLB game
before shipping, not by inspection. Fixed by resolving the group key as `stat.name || stat.type` (the
same fallback `parseEspnBoxscorePlayers` already used for the rendered group title, just applied to the
filter too) before checking it against `groupColumns`.

## Game Details: away/home team-switch chips (2026-09-12)

Follow-up feedback: even trimmed to core stats (above), showing both teams' boxscore tables stacked one
after another was more scrolling than wanted — this app already has a chip-toggle pattern for exactly
this kind of "pick one of a few views" choice (Standings tab's AFC/NFC/Drafted and nested Divisions/
Conference switches, `.standings-toggle`/`.toggle-btn` in `css/style.css`, driven by
`nflStandingsToggleHtml` in `js/standings-nfl.js`). Reused that same class pair for a two-button away/
home switch rendered under the linescore, in `renderGameDetail` (`js/live-data.js`) — only the selected
team's boxscore tables render below it, and clicking the other chip redraws instantly from the already-
fetched `summary` (no re-fetch), via a small `gameDetailRenderState` module variable that
`setGameDetailTeam` reads. `.gd-team-toggle` in `css/style.css` overrides the toggle's page-header-style
padding/border to sit inline mid-sheet instead.

Defaults to whichever team the sheet was opened *from* (e.g. tapping "View full boxscore" off Arizona's
own team modal lands on Arizona's tables first, even when Arizona is the away team) rather than always
defaulting to home or away — resolved in `openGameDetail` via `bundle.espnLive.isHome`, matched against
`summary.teams`' own `homeAway` field, since neither the live bundle nor the summary otherwise carries
"this is the team whose modal we came from" directly.

## Team-modal entry point restyled as an inline chip (2026-09-12)

Feedback: the "View full boxscore" entry point on the team modal's own LIVE line looked heavy — its own
bordered/background card (`.detail-link`) stacked below the score line, rather than sitting next to it.
Restyled as `.boxscore-chip`, a lightweight accent-tinted pill (same color treatment as an active
`.toggle-btn`/`.filter-chip`, not a new look) placed as a direct sibling of `.nm-left` inside `#live-next`
— that element already carries the `.next-match` class (`display:flex; justify-content:space-between`),
so the chip lands on the same row as the score line for free once the extra wrapping `<div>` around both
is removed, no new layout CSS needed. Copy changed from "View full boxscore" to "View live boxscore",
and the two-line txt/sub layout (with its now-unused `GAME_DETAIL_LEAGUES[...].subtitle` per-sport
description) is gone — a single short label fits the lightweight-pill treatment better than a card with
room for a subtitle.

## Game Details wired up to "Most Recent Result" too (2026-09-12)

Extended the same sheet to the team modal's completed-game row, not just its LIVE one. `renderForm`
(`js/live-data.js`) now takes `teamKey`/`meta` (previously just `sportsdbId`) and, in its ESPN-schedule
branch (the MLB/CFB-covering one), adds a `.boxscore-link` — plain accent-colored text + chevron, no
background or border at all, one step lighter than the LIVE row's `.boxscore-chip` pill — since this row
already carries a form-pill, opponent, and score competing for attention. Labeled "View boxscore" (the
LIVE row keeps "View live boxscore").

`openGameDetail` no longer reads `bundle.espnLive` for its `eventId`/situation/default-team lookups —
both call sites (the LIVE chip and this new link) now pass their own event id explicitly, since
`bundle.espnLive` only ever describes today's/the current game and a "Most Recent Result" game is often a
different, earlier one. Two things that logic used to lean on `bundle.espnLive` for needed a real
replacement rather than just being made optional:
- **Default team-toggle selection.** Previously resolved via `bundle.espnLive.isHome`, matched against
  `summary.teams`' `homeAway` — meaningless for a past game `espnLive` doesn't describe. Replaced with
  `flatSchedule.findRow(meta).id`, the same by-name ESPN-team-id lookup every other per-team identity
  resolution in this app already uses (`liveScoreboardSweepTick`, standings row matching, etc.), matched
  directly against `summary.boxscore`'s own `teamId` — works identically whether the game is live or
  finished, and is simpler than the home/away detour it replaced.
- **The sheet's LIVE badge.** Was unconditional (every game reaching this sheet used to be live, by
  construction). Now reads `summary.status.state === 'in'` and shows just the plain status text (e.g.
  "Final") otherwise.

## Most Recent Result row: score+link as a right column (2026-09-12)

Feedback that the score still looked stranded on this row — floating in the middle with an odd gap on
both sides. Four real layout options were mocked up against the app's actual dark theme/tokens (not a
generic sketch) before picking one: score inline with the opponent name, score+link stacked as a right
column, the score folded into the link text itself, and a combined result+score capsule replacing the
plain W/L pill. Picked **the stacked right column** — score on top, `.boxscore-link` right under it, both
right-aligned as one `.form-right` block.

Simpler than the previous attempt at this same row: reverted the `.form-item:has(.boxscore-link)
.form-detail{flex:0 1 auto}` override from the last pass entirely, since `.form-detail`'s plain default
`flex:1` already does the right thing once score+link are one block instead of two separate flex
siblings — it pushes `.form-right` to the row's far edge exactly the way it always pushed a lone
`.form-score` there before any of this existed. Also dropped `.boxscore-link`'s `margin-left:auto` (that
was there to push the link alone to the edge in the old two-sibling layout; here it's nested inside
`.form-right` and just needs `justify-content:flex-end` to stay right-aligned under the score).

## Game Details for EPL: a goals/cards split instead of a linescore (2026-09-12)

Extended `GAME_DETAIL_LEAGUES` to `epl`, the third sport after MLB/CFB — but soccer's summary endpoint
has neither an innings/quarters linescore nor a batting/passing-style per-athlete boxscore, so this isn't
just "write a third `fetchEspnXSummary`". Checked the real payload live (event 401879285, Brentford at
Bournemouth) rather than guessing: `data.keyEvents` is a flat, chronological play-by-play array (kickoff,
delays, goals, cards, subs, halftime, ...) with no separate boxscore section at all.

**New reader — `fetchEspnSoccerSummary` (`js/espn.js`):** filters `keyEvents` down to goals and cards.
A goal is any entry with `scoringPlay: true` — more reliable than matching `type.text` (which varies:
"Goal", "Goal - Header", "Goal - Penalty", ...) since ESPN already resolves VAR review into that one
boolean itself (confirmed live: a VAR-confirmed goal carries `"text": "...Goal confirmed following VAR
Review."` and `scoringPlay: true`). A card is identified by `type.text` containing "Red" or "Yellow"
(covers "Second Yellow Card" too). `clock.displayValue` is already formatted pitch-side (`"34'"`,
`"45'+3'"`), and `participants[0].athlete.displayName` is the scorer or carded player for both event
kinds. Confirmed (again) that soccer never carries a `situation` object on this endpoint either — same
finding as MLB/CFB above — so `GAME_DETAIL_LEAGUES.epl.situationText` is just `() => null`.

**New sheet body — `soccerEventsHtml` (`js/live-data.js`):** rather than force goals/cards into the
existing linescore-table/team-toggle/box-table layout (there's no linescore to anchor a toggle under),
`renderGameDetail` branches on `leagueKey === 'epl'` to a two-column split instead — each team's own
goals and cards in its own column (`.gd-split`/`.gd-split-col` in `css/style.css`), minute-first, in the
order `fetchEspnSoccerSummary` already sorted them into. No new team-toggle needed since both teams are
already visible side by side.

Card markers reuse existing color tokens rather than introducing new ones — `--accent` (already a warm
gold) doubles as the yellow-card fill and `--live` (already "stop/alert" red) as the red-card fill,
rendered as a small tilted rectangle (`.gd-card-chip`) rather than another circular badge so it actually
reads as a card. The goal marker is a new hairline-stroke icon, `BALL_ICON_SVG` (`js/utils.js`), added
alongside `CLOSE_ICON_SVG`/`CHECK_ICON_SVG`/`CHEVRON_ICON_SVG` in the same style.

The existing entry points needed no changes at all: `renderNext`'s live `.boxscore-chip` and
`renderForm`'s completed-game `.boxscore-link` (both `js/live-data.js`) were already gated purely on
`GAME_DETAIL_LEAGUES[meta.leagueKey]` plus a real event id — adding the `epl` key to that map was enough
to light both up for EPL teams.

## Game Details for NFL: finally wiring up the function CFB already wrote for it (2026-09-12)

Extended `GAME_DETAIL_LEAGUES` to `nfl`. The CFB entry above already flagged that
`fetchEspnFootballSummary` (`js/espn.js`) was written to be reused by NFL later, "same shape" — this
change is that reuse: `nfl`'s entry in `GAME_DETAIL_LEAGUES` (`js/live-data.js`) is `fetchSummary:
fetchEspnFootballSummary`, `linescorePeriods: 4`, the same quarters+OT `periodLabel`, and the same
`footballSituationText`, copied verbatim from `cfb`'s entry rather than introducing anything
NFL-specific — ESPN's football summary endpoint shape (linescore, `situation.downDistanceText`, and the
passing/rushing/receiving boxscore groups) doesn't distinguish NFL from CFB. `nfl` was already present in
`FLAT_SCHEDULE_LEAGUES` (`sportPath: 'football/nfl'`) and `fetchEspnScoreboard`/`findEspnScoreboardLine`,
so the live-in-game path (`renderNext`'s `.boxscore-chip`) and completed-game path (`renderForm`'s
`.boxscore-link`) both light up for NFL teams from this one map entry, same as every prior league added
here.

Verified end-to-end against a real completed game (Texas A&M's boxscore sheet, since the 2026 NFL season
itself hadn't kicked off yet at the time of this change — every drafted NFL team was still 0-0
pre-Week-1) to confirm the shared render path (`renderGameDetail`, `boxGroupHtml`, the away/home toggle,
the linescore table) still renders correctly unchanged; since `nfl`'s config is byte-for-byte the same
shape as `cfb`'s and reuses the identical reader, there's no NFL-specific code left to verify once real
NFL games start — only worth a quick spot-check against a live NFL payload the first time this actually
gets used in-season, the same way CFB's own addition caught the two real MLB bugs (see above) that
guessing from docs alone had missed.

## College Basketball migration (2026-09-17)

Closes the one remaining gap this whole document kept deferring: every earlier phase assumed CBB
would need real new scaffolding built from scratch ("no ESPN integration... a bigger lift, since
there's no existing schedule/standings scaffolding to extend"). That assumption was never actually
re-tested — this session had real, working network access to `site.web.api.espn.com` (unlike some
earlier sessions building other parts of this doc, which had to write against reverse-engineered
field shapes with no way to check them) and simply tried it. It works, fully, the same as every other
league here.

**Verified live (2026-09-17):**
- `/apis/v2/sports/basketball/mens-college-basketball/standings` — 365 D1 teams across 31
  conferences, every conference a direct `standings.entries` list (no CFB-style "Sun Belt nests a
  division deeper" surprise to special-case).
- `/apis/site/v2/sports/basketball/mens-college-basketball/rankings` — real AP Top 25 with
  rank/trend/points/firstPlaceVotes, same shape as CFB's.
- `/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`, `teams/{id}`,
  `teams/{id}/schedule` — all real, all CORS-open, no key. Same `fetchEspnTeamSchedule`/
  `fetchEspnScoreboard`/News reader every other FLAT_SCHEDULE_LEAGUES league already used, pointed at
  this sportPath.
- All 30 of this app's drafted mcbb teams matched a real ESPN row by id — 30/30, cross-checked
  against the ESPN team id already embedded in each team's existing `badgeUrl` (e.g. Houston's
  `.../ncaa/500/248.png`).

**The one real design difference from every other FLAT_SCHEDULE_LEAGUES league: matching goes by a
static `espnTeamId` field on `TEAM_META`, not by name.** Every other league's TEAM_META.name is
either an exact ESPN nickname (NBA/NHL/MLB/WNBA, `findFlatTeamKey`) or a school name close enough for
substring matching to work (EPL/CFB, `findDraftedTeamByName`). mcbb's TEAM_META.name is a school name
like every other college league, but a real substring collision exists *within this app's own 30
drafted teams* that an override table can't cleanly patch: "Texas" (`douglas_texas`) is a literal
substring of "Texas Tech" (`douglas_texastech`), and unlike CFB's "NDSU"/"North Dakota State" override, both real
teams are drafted here, so whichever one `findDraftedTeamByName` happens to iterate to first wins
regardless of which team ESPN actually named — the same class of bug `js/standings-flat.js` documents
finding for NBA's "Nets" substring-matching into "Hornets". Also present: "Michigan" vs "Michigan
State", and TEAM_META abbreviations ESPN's `location` never uses at all (NDSU vs "North Dakota
State", SLU vs "Saint Louis"), which name-overrides could patch individually but which a numeric id
sidesteps entirely. Every drafted team's real ESPN id was already sitting in its existing `badgeUrl`
(from an earlier, unrelated badge-fetching pass), so this was a matter of promoting an already-known
value to its own field, not discovering anything new — see `findEspnCbbRow` in `js/standings-cbb.js`.

**One real scoreboard gotcha, different from every other league here:** CBB can have 100+ Division I
games on a single night, far more than any other sport in this app. ESPN's scoreboard endpoint
defaults to a smaller "featured" slate rather than the full one for this sport specifically — the same
"silent default-limit truncation" class of bug as finding #3 above (CFB's bulk `/teams` list needing
`?limit=1000`), just on the scoreboard instead. Fixed by having `fetchEspnScoreboard` (`js/espn.js`)
append `?groups=50&limit=400` (`groups=50` = all Division I) whenever `sportLeaguePath` is
`basketball/mens-college-basketball` specifically — every other league's own call is untouched, since
none of them plays enough games in a day to hit a default limit.

**What shipped:** `js/standings-cbb.js` (new — modeled on `js/standings-cfb.js`: AP Top 25 / Drafted
combined-win% toggle, no single "League" table view, same reasoning as CFB for skipping one — 365
teams across 31 conferences has no useful one-table shape). `mcbb` added to `FLAT_SCHEDULE_LEAGUES`
and `GAME_DETAIL_LEAGUES` was deliberately left alone (no basketball boxscore reader exists in this
app yet for any league — NBA/NHL don't have one either; a real follow-up, not specific to this
migration). `js/live-now.js`'s `draftedTeamFor` gained an `espnTeamId`-based branch for `mcbb`
specifically, since its existing exact-nickname-then-substring matching would hit the exact same
Texas/Texas Tech collision described above the moment mcbb's scoreboard joined the Today view's
per-day fetch.

**What happens to TheRundown for this league now:** kept wired up (`RUNDOWN_SPORT_ID.mcbb`,
`fetchRundownEventForTeam`) as a defensive fallback only, same status CFB's TheSportsDB branch has had
since "SportsDB fully deprecated" below — `fetchTeamBundle`'s plain `meta.rundownTeamId` branch is
only reached if `FLAT_SCHEDULE_LEAGUES.mcbb.findRow` genuinely fails to resolve a team on a given
refresh, which doesn't happen for any of today's 30 drafted teams in normal operation.

**balldontlie.io evaluated and not adopted.** Investigated as a possible second/cross-reference
source (`ncaab.balldontlie.io`) before this build. Its free tier — the tier this app has a key for —
only exposes conferences/teams/players/standings; live games, schedule, and AP rankings all require
the paid ALL-STAR tier ($9.99/mo), so it couldn't have supplied the schedule/live-score half of this
feature at all on the free tier. More importantly, the one thing its free tier *does* offer
(conferences + standings) turned out to be fully redundant: ESPN's own standings response already
groups every team under its real conference name/abbreviation/short-name — confirmed live across all
31 conferences — so there was no gap left for balldontlie to fill even for that. Not integrated in any
form; no worker route, no client key handling, nothing to maintain.
