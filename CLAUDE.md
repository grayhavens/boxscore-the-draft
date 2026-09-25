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

**Draft tests:** `node --test tests/draft-engine.test.mjs tests/draft-export.test.mjs tests/draft-sheets.test.mjs`
(pure logic, no dependencies).
**Draft rehearsal:** `node tools/rehearse-draft.mjs --chaos 2` runs a full automated draft with injected
failures against a running `wrangler dev`; `--preflight` is the draft-morning smoke test. The commissioner's
step-by-step is `docs/draft-day-runbook.md`.
**Draft export:** `node tools/export-draft.mjs --dry-run` turns a finished draft room into the next season's
`js/seasons/<year>.js` (see the header of that script).
`node tests/draft-room.integration.mjs` drives a running `npx wrangler dev --var ADMIN_PASSWORD:testpw`
end to end against the real Durable Object.

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
- **NHL's own API** (`api-web.nhle.com`, no key, via the worker's `/nhl/score/<date>` route since it
  has no CORS) supplies NHL Game Details' in-app highlight clips — ESPN's NHL summary carries no
  video. Clip ids are resolved to playable .mp4s straight from Brightcove in the browser
  (`js/nhl-clips.js`), uncached since those URLs are signed and expire. Additive only: ESPN stays
  the source for NHL scores/boxscores.
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

**Group chat** (`js/chat.js` + `worker/chat-room.js`): real-time text chat for the drafters — the Chat tab
(`#view-chat`, `?view=chat`), the center button of the bottom tab bar. It's a
real `.view` that `switchView` toggles (calling `setChatActive` in `js/chat.js`), but unlike the other
views it's `position: fixed`, and while the keyboard is up it's sized from `window.visualViewport` so
the iOS keyboard shrinks it instead of covering the composer; the tab bar hides while the keyboard is up (`html.chat-kb`). Messages fan out through one shared Durable Object (SQLite-backed, WebSocket
Hibernation API) reached at `/chat/ws`; KV can't do this (eventual consistency, no push). Same
no-auth trust tier as favorites — sender is whichever drafter `js/identity.js` says you are. The
socket opens at boot so the tab bar's unread badge is live; reconnects resume via `?after=<lastId>`.
On `localhost` the client talks to `wrangler dev` (`ws://localhost:8787`), never the deployed
worker, so local testing can't post into the real room. The first deploy after adding it runs the
`[[migrations]]` entry in `wrangler.toml` — **deploy the worker before the static site**, or the
Chat tab ships pointing at a room that doesn't exist yet.

**Chat reactions** (Slack-style: several per person, one of each emoji): tapping a message opens a
row of the seven `REACTION_EMOJI` (👍 👎 😂 😮 😢 🔥 😎 — duplicated in `js/chat.js` and
`worker/chat-room.js`, and the worker rejects anything not in its copy); tapping a pill under a
message toggles your own. The client sends `{type:'react', from, messageId, emoji}` and the room
answers everyone with that message's full reaction set. Reactions live in their own SQLite table (not
on the message) since they change after it's sent, so the `history` frame always carries a snapshot
of every retained message's reactions — a reconnect (`?after=<lastId>`) fetches no old messages and
would otherwise never see a reaction added to one. **Deploy the worker before the static site:** an
old worker silently ignores `react` frames, so the buttons would do nothing.

**Chat GIFs** (`js/gifs.js`, `js/gif-picker.js`): a GIF button in the chat composer opens a picker
backed by KLIPY (Tenor's API shut down 2026-06-30). **This is the one upstream that deliberately
breaks the "everything goes through the worker" rule above:** KLIPY's integration requirements say
API requests and media loads must come from the user's browser, and that proxying, caching, or
mirroring needs their prior written approval (developers@klipy.com) — so the browser calls
`api.klipy.com` directly and nothing is edge-cached. Because the browser calls KLIPY itself it
necessarily has the app key, so the key can't be hidden from users — but it's kept out of this public
repo: it's the worker secret `KLIPY_APP_KEY`, fetched at runtime from `/gif/config` (which only answers
our own origins), so it can also be rotated without a redeploy. Set it with
`npx wrangler secret put KLIPY_APP_KEY`; for local `wrangler dev` put `KLIPY_APP_KEY=...` in
`worker/.dev.vars` (gitignored). No key = the GIF button stays hidden. Also required by KLIPY: media
URLs used exactly as returned, results in the order returned, "Search KLIPY" as the search placeholder.
A key in Testing mode is capped at 100 requests/hour across everyone; request Production access (free)
in KLIPY's Partner Panel. A GIF message stores `{slug, url, w, h}`; the worker (`parseGif` in
`worker/chat-room.js`) only accepts https URLs on KLIPY's `static*.klipy.com` hosts.

**Draft room** (`js/draft.js`, `js/draft-client.js`, `js/draft-pool.js`, `worker/draft-room.js`): a live
snake draft for the next season, reached from Settings or `?view=draft[&room=<name>]`. The rules and state
machine are pure modules shared by the browser, the worker and Node tests (`js/draft-rules.js`,
`js/draft-engine.js`); the `DraftRoom` Durable Object holds the authoritative state and the browser only
sends actions and renders what comes back. Commissioner actions need the admin password. See
`docs/draft-room-plan.md` for the design and phase status. **Deploy the worker before the static site.**
**Download board** exports the board as an .xlsx (Picks / Board / Rosters sheets, `js/draft-sheets.js`),
written by the dependency-free `js/xlsx.js` in the browser — no worker call. Everyone gets it once the draft
is done; the commissioner bar has it any time as a mid-draft backup. While a draft is live (phase `draft`), every other page shows a tappable "Draft is live" banner back
into the room (`js/draft-live.js`: top of `.board` and under the Chat header). Off the draft view it
polls the worker's `GET /draft/status` (edge-cached 5s; 20s polls while live, 90s otherwise); an old
worker without that route just means no banner.

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
