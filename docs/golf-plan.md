# PGA Tour golfers (Season Ticket)

Season Ticket adds a ninth league: each drafter picks **3 PGA Tour golfers** instead of teams.
Only groups that list `pga` in their `caps` (`js/groups.js`) get it; The Draft never does.

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

Assumption to confirm: the major finish tiers don't stack (a top 10 is +2, not +3), and a major win
earns the tournament win too (+2 +5).

Majors are identified by ESPN event id each season (2026: Masters 401811941, PGA Championship
401811947, U.S. Open 401811952, The Open 401811957).

## Data (ESPN, no key, open CORS)

| Need | Endpoint |
|---|---|
| Season calendar, current event | `site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard` |
| Leaderboard (live or final) | `site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=<id>` |
| Golfer bio, headshot | `site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes/<id>` |
| Golfer season summary | `…/athletes/<id>/overview` |
| FedEx Cup standings | `sports.core.api.espn.com/v2/sports/golf/leagues/pga/seasons/<yr>/types/2/standings/0` |

Not available: world rankings (`/rankings` 500s) and per-golfer event logs (404). Recent finishes come
from finished leaderboards, which the worker condenses into one edge-cached season index
(`GET /golf/results?season=<yr>`) rather than every phone pulling ~35 leaderboards (28KB gzipped each).

## Plan

1. **Per-group leagues and caps.** Done: `caps` on a group in `js/groups.js` (`groupCaps`) sets the
   draft room's sports and picks (`syncCaps` in `js/draft-engine.js`, applied to rooms in the lobby)
   and a pre-draft group's league tabs (`js/seasons/index.js`).
2. **Golf data layer:** `js/golf.js` plus the worker results route, tested against saved leaderboards.
3. **Golfers in TEAM_META / the draft pool** (`leagueKey: 'pga'`, `kind: 'golfer'`, `espnAthleteId`,
   headshot as `badgeUrl`), then `pga: 3` in Season Ticket's caps. Enough for a mock draft.
4. **UI:** stat strip, golfer page, FedEx standings (`js/standings-pga.js`), Scores tournament card, live state.
5. **Scoring:** `golfAuto` rules, Points sheet, overall totals, the feature guide entry.

Steps 1 and 3 before Season Ticket's draft; golf scores from the 2027 season, so 2, 4 and 5 can follow.

## Open questions

- Do fall events count, or only the FedEx season plus majors?
- LIV golfers (majors only): in the pool with a label, or left out?
- Pool size (~80 golfers for 30 picks).
