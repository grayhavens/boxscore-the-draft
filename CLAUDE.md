# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Boxscore — a personal fantasy-draft dashboard tracking real results for 10 friends' drafted teams
across 8 leagues (EPL, NFL, NBA, NHL, MLB, WNBA, CFB, College Basketball). Installed as an iOS PWA.
Plain static site: no build step, no bundler, no package.json, no test framework. `index.html` loads
`js/board.js` as a single ES module entry point; every other `js/*.js` file is imported from there
(or from each other) via native `import`/`export`.

## Commands

There is no build/lint/test tooling in this repo — there's nothing to run before checking in a
change beyond loading the page.

**Local preview:** serve the repo root over plain HTTP (opening `index.html` via `file://` breaks
ES module imports) — e.g. `python3 -m http.server` from the repo root, then load `/index.html`.
The `.claude/launch.json` `team-dashboard` config does this, but serves a **separate mirrored
copy** of the repo under `$TMPDIR/boxscorethedraft-preview`, not the repo working directory
directly — re-sync that mirror (`rsync -a --exclude='.git' --exclude='.wrangler' ./ "$TMPDIR/boxscorethedraft-preview/"`)
before previewing any local change, or the preview will silently serve stale content.

**Worker (`worker/`, a separate Cloudflare Worker, deployed independently of the static site):**
```
cd worker
npx wrangler login                       # one-time
npx wrangler secret put THERUNDOWN_API_KEY
npx wrangler secret put SPORTSDB_API_KEY
npx wrangler dev                         # local worker dev server (chat client uses it on localhost, port 8787)
npx wrangler deploy
```
After deploying, `DASHBOARD_WORKER_BASE` in `js/api.js` must point at the printed `*.workers.dev` URL.

**Static site deploy:** Cloudflare Pages auto-deploys from `main` — no local deploy command.

## Architecture

**Single source of truth for content:** `js/data.js` holds `DRAFT_TEAMS` (the 10 people),
`TEAM_META` (every team's display info, league, owner, and the IDs used to pull live data),
`LEAGUES` (which teams appear under each league tab and in what order), `LEAGUE_SCORING` (each
league's point rules), and `PRIOR_SEASON_DISPLAY_LEAGUES` (`['mlb', 'wnba']` — see below). Adding
or changing a team/league means editing this file; nothing else hardcodes team/league data.

**Three views, one page:** `#view-board` (Teams), `#view-standings`, `#view-overall` — toggled by
`switchView` in `js/board.js`, mirrored into the URL query string (`updateUrlParam` in
`js/utils.js`) so state survives a reload/share. `js/board.js` is the boot/orchestration module: it
imports every per-league standings module plus `live-data.js` and `overall.js`, and is the last
script loaded so every other module's `window.*` exports (used by inline `onclick=` handlers in
generated HTML) are already registered when it runs.

**Per-league standings modules** (`js/standings-{epl,cfb,nfl,nba,nhl,mlb,wnba}.js`) each own one
league's Standings-tab rendering (league table + "by drafter" rollup) and a `Person`/`League`
toggle. NBA/NHL/MLB share a common engine (`createFlatStandingsBoard` in `js/standings-flat.js`) —
those three follow an identical naming convention per league (`espnXStandingsCache`,
`fetchEspnXStandingsCached`, `computeXConferenceStandings`, `renderXStandingsRow`,
`computeXDrafterCombined`, `getXStandingsMode`, etc.), with only the sport-specific bits (fetch
function, conference labels, record formatting) passed in from each thin per-league file. EPL and
CFB predate that shared engine and are bespoke. WNBA has no real division/conference structure worth
modeling, so it was moved off `standings-flat` onto a single flat league-wide ranking shaped like
EPL's instead.

**Live team data** (`js/live-data.js`) fetches/caches/renders each team's stat strip, recent-form
strip, next match, and the full team-detail modal (`openTeamModal`), plus a staggered background
refresh loop (`backgroundRefreshTick`) so open tabs stay current without hammering any API. Results
are cached in memory and mirrored to `localStorage` so a previously-viewed team opens instantly,
including across sessions.

**Data sources** (see `docs/espn-migration-plan.md` for the full history/rationale):
- **ESPN's hidden site API** (`js/espn.js`, `ESPN_SITE_BASE`) is now the primary source for
  standings, rankings, schedule, and live in-game state for every one of the 8 leagues, College
  Basketball included (added 2026-09-17). No key, open CORS, called directly from the browser — no
  worker proxy involved.
- **TheSportsDB** is fully deprecated — no remaining runtime callers.
- **TheRundown** (paid/metered) is kept only as a defensive per-team fallback for a fetch ESPN itself
  fails to resolve on a given refresh (CFB's one FCS team, and now every College Basketball team) —
  not a primary source for any league; its key is private, so it's always proxied through
  `worker/rundown-proxy.js`, never called directly from client JS.

**`worker/rundown-proxy.js`** (Cloudflare Worker, deployed separately from the static site) does
three things, all because they need a private key or shared server-side state that a static site
can't provide: proxies the TheRundown/TheSportsDB-V2 allowlisted endpoints (holding their private
keys server-side), edge-caches every proxied GET (`caches.default`, TTLs in `CACHE_TTL_SECONDS`) so
concurrent viewers collapse into one upstream call instead of one per browser, and serves the League
Facts KV store. Adding a new upstream call: it MUST go through `cachedUpstreamFetch`, and a private
key must never be added to client JS directly — see the comment block at the top of that file
before adding a new route.

**Group chat** (`js/chat.js` + `worker/chat-room.js`): real-time text chat for the drafters, opened
from a header icon on every view (an overlay, not a tab/`.view` — `switchView` and the URL params
never see it). Messages fan out through one shared Durable Object (SQLite-backed, WebSocket
Hibernation API) reached at `/chat/ws`; KV can't do this (eventual consistency, no push). Same
no-auth trust tier as favorites — sender is whichever drafter `js/identity.js` says you are. The
socket opens at boot so the header's unread badge is live; reconnects resume via `?after=<lastId>`.
On `localhost` the client talks to `wrangler dev` (`ws://localhost:8787`), never the deployed
worker, so local testing can't post into the real room. The first deploy after adding it runs the
`[[migrations]]` entry in `wrangler.toml` — **deploy the worker before the static site**, or the
header icon ships pointing at a room that doesn't exist yet.

**League Facts** (`js/league-facts.js`) is how "who won the cup" / "who got relegated" facts get
shared across every drafter instead of living in one person's `localStorage`: marking a fact once in
a league's Results modal credits every drafter who owns an involved team automatically, stored in
Workers KV (`LEAGUE_FACTS_LEAGUES` allowlist). `rankAuto` scoring rules (in `LEAGUE_SCORING`) skip
manual marking entirely and are instead derived live off a loaded standings table (currently EPL
only — see `getLeagueRuleTeams`). Every league not yet on this model still uses the older per-team
`ACHIEVEMENTS_KEY` checklist.

**`PRIOR_SEASON_DISPLAY_LEAGUES` (MLB, WNBA):** these leagues' drafted teams don't start scoring
until each league's next season begins, but ESPN's live endpoints only ever return the season
actually being played right now. Until that next season starts, their Standings tab and team modals
show real, live, but non-scoring results — flagged with a shared `prior-season-note` (bold/accent
styling — this is easy to misread as counting if skimmed) rather than hiding the data. Their team
modals also suppress the season-phase badge (`In-Season`/`Pre-Season`/etc.) entirely, since showing
it would read as if the current season counts.

**PWA shell:** `manifest.json` + `sw.js` (network-first with a cached-shell fallback, so the app
still opens offline) exist because this runs installed on iOS. `index.html`'s `.safe-area-top` fixed
div exists because the installed PWA's translucent status bar shows real page content through it —
a `position: fixed` cover is required there because sticky-positioned content (the Standings filter
row) can flash through a plain top-padding approach during iOS's scroll repaint.
