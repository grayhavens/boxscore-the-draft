# PGA Tour golfers (Season Ticket)

Season Ticket adds a ninth league: each drafter picks **3 PGA Tour golfers** instead of teams.
Only groups that list `pga` in their `caps` (`js/groups.js`) get it; The Draft never does.

Decided (2026-09-29): only the **FedEx Cup season** counts, January through the TOUR Championship.
Fall events and the Presidents/Ryder Cup don't. **No LIV golfers** in the pool. **3 golfers** per drafter.

## Scoring

Every rule is derived from ESPN data, so nothing is marked by hand. Unlike team rules, a golfer can
hit the same rule several times in a season (a new `golfAuto` rule shape that counts each occurrence).

| Rule | Pts |
|---|---|
| Win a tournament (each) | +2 |
| Win a major | +5 |
| Top 10 in a major | +2 |
| Top 20 in a major (11th–20th) | +1 |
| Make the TOUR Championship (FedEx top 30) | +2 |
| Win the FedEx Cup | +3 |
| Miss the cut in a major | −2 |
| Miss the cut in a regular tournament | −1 |
| **Bonus:** most combined FedEx Cup points | +5 |

Assumptions to confirm: the major finish tiers don't stack (a top 10 is +2, not +3); a major win
replaces the tournament win (+5, not +2 +5), and top 10 / top 20 go to non-winners; FedEx playoff events count as tournament wins; the FedEx Cup
winner is the TOUR Championship winner; a withdrawal or DQ isn't a missed cut; the Zurich Classic
(two-man teams) credits both players with the team's finish.

Majors come flagged by ESPN (`tournament.major` on the leaderboard), so no ids are hardcoded.

## Data (ESPN, no key, open CORS)

Parsing is `js/golf.js` (pure, shared with the worker); browser fetches are `js/golf-api.js`.

| Need | Source |
|---|---|
| Finished events: every golfer's finish and FedEx points | Worker `GET /golf/season/<year>` (`worker/golf.js`) |
| The event being played, live | `site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=<id>` |
| Season calendar, current event | `site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard[?dates=<year>]` |
| Official season totals (FedEx points, wins, top 10s, cuts) | `sports.core.api.espn.com/v2/sports/golf/leagues/pga/seasons/<yr>/types/2/athletes/<id>/records/0` |
| Headshot | `a.espncdn.com/i/headshots/golf/players/full/<id>.png` |

The worker keeps each finished event condensed in KV (`golf:<year>`), and fills at most 4 per request since a
leaderboard is ~300KB to parse. Checked against live ESPN on 2026-09-29: the whole 2026 season built in 9
requests, and it's 98KB (18KB gzipped). Summed FedEx points match the official ones to within a point (rounding),
once a team event's winners are credited in full (ESPN's team row carries half of their 400); the golfer sheet
still shows the official total from the per-golfer record. ESPN's league-wide FedEx standings are
5.7MB and never fetched. Not available at all: world rankings (`/rankings` 500s) and per-golfer event logs (404).

Still to verify: a live leaderboard mid-round (`today`, `thru`). Capture a fixture during the next event.

## Plan

1. **Per-group leagues and caps.** Done: `caps` on a group in `js/groups.js` (`groupCaps`) sets the
   draft room's sports and picks (`syncCaps` in `js/draft-engine.js`, applied to rooms in the lobby)
   and a pre-draft group's league tabs (`js/seasons/pre-draft.js`).
2. **Golf data layer.** Done: `js/golf.js`, `js/golf-api.js`, `worker/golf.js`, tests in
   `tests/golf.test.mjs` against real ESPN fixtures (`tests/fixtures/golf/`).
3. **Golfers in the draft.** Done: `js/golfers.js` is the pool (top 80 by official 2026 FedEx points,
   from `node tools/golfer-pool.mjs --season 2026`; rerun before the draft). `buildDraftPool` adds them as
   league `pga` with the ESPN athlete id as `espnAthleteId` and the headshot as `badgeUrl`; the draft room
   shows the headshot on the tile. Season Ticket's caps now include `pga: 3` (24 rounds). The export turns a
   golfer pick into a `TEAM_META` entry (`kind: 'golfer'`, `espnAthleteId`) under a new "PGA Tour" league,
   flagged as a prior-season league until January.
   **Before exporting Season Ticket's draft:** step 4 must be in (every screen that walks `LEAGUES` would
   otherwise meet golfers), the class needs `LEAGUE_SCORING.pga` (step 5), and the export tool has no
   group support yet (it writes The Draft's registry).
4. **UI:** stat strip, golfer page, FedEx standings (`js/standings-pga.js`), Scores tournament card, live state.
   Built before this audit (2026-10-03), despite the old note: the golfer sheet, tournament sheet, FedEx Cup and
   Drafted standings, Home row status and the Scores tournament card, all in `js/golf-view.js`.
5. **Scoring:** done 2026-10-03. `golfAuto` rules are read by `getLeagueRuleTeams` (`js/league-facts.js`): a golfer's
   key appears once per time they hit a rule (counts from `golferAwardCounts`, `js/golf.js`), so the Points tab
   itemizes each win and `teamPointsSplit` multiplies. Always Locked (finished events are final). Nothing counts
   while pga is in `PRIOR_SEASON_DISPLAY_LEAGUES` or the loaded season isn't this year's. The +5 bonus
   (`golfBonus` in `js/compare.js`) is Live from the first scored event and Locked after the TOUR Championship.
   The admin page shows golf rules as automatic. Still open: the feature guide entry.
   A major win scores +5 in place of the +2 win, and top 10 / top 20 are for non-winners (Josh, 2026-10-03).

Steps 1–3 are enough for Season Ticket's draft; golf scores from the 2027 season, so 4 and 5 can follow,
but both must land before the draft is exported into a class.

## Open questions

- None right now. Pool size is 80; change `--count` if the group wants more depth.
