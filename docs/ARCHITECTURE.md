# Architecture

Two deployables: a **static site** (repo root, Cloudflare Pages) and a **Cloudflare Worker** (`worker/`).
Pure logic in `js/` is shared by the browser, the worker (wrangler bundles it) and Node tests.

## Main flow

```
                      ┌────────────────────────── browser (iOS PWA / desktop) ──────────────────────────┐
 <group>.boxscore.space│ index.html → js/board.js (boot) → js/group.js (which group, from hostname)        │
                      │   js/access.js (invite code)  js/roster.js (confirmed names)  js/data.js (season) │
                      │   views: Home · Scores · Chat · Standings · Points · team page · Settings · Draft │
                      │   scoring is computed HERE from ESPN tables + League Facts                        │
                      └──────┬───────────────────────┬──────────────────────────┬───────────────────────┘
                             │ direct, no key, CORS   │ direct (KLIPY's rule)     │ ?group=&gc= on every group call
                             ▼                        ▼                           ▼
                    ESPN site API            api.klipy.com (GIFs)     Cloudflare Worker (worker/rundown-proxy.js)
                    standings, schedules,                             ├─ KV LEAGUE_FACTS: facts, adjustments, locks,
                    live games, golf                                  │  favorites, activity, roster, sports, push subs,
                                                                      │  points history, champions, claims, admin log
                                                                      ├─ DO ChatRoom  (/chat/ws, WebSocket, SQLite)
                                                                      ├─ DO DraftRoom (/draft/ws?room=, SQLite, alarms)
                                                                      ├─ edge-cached proxies: TheRundown, TheSportsDB,
                                                                      │  nflverse, NHL api-web, ESPN golf season
                                                                      └─ outbound: Web Push (VAPID), Resend email
 boxscore.space/admin ──(Cloudflare Access)──▶ /api/admin/* (zone route on the same worker)
```

- Scoring lives only in the browser. The worker stores what the browser computes (Activity PUT carries the points
  sample) and what the commissioner marks (facts, adjustments, locks).
- Group state is keyed by `?group=<id>`; The Draft (`thedraft`) sends none and uses un-namespaced keys.

## Modules (static site, `js/`)

- **Boot / shell:** `board.js` (entry, `switchView`, Home), `group.js`, `access.js`, `roster.js`, `group-sports.js`,
  `motion.js`, `launch-splash.js`, `page-header.js`, `sw.js` (root).
- **Content:** `data.js` (resolves the active season class), `seasons/*.js` (`the-draft.js`, `2026.js`, `pre-draft.js`,
  `pga.js`, `index.js`), `groups.js` (group registry, shared with worker), `sports.js`.
- **Data fetch:** `espn.js` (ESPN), `api.js` (worker calls, TTL caches), `live-data.js` (team strips, Game Details,
  background refresh), `golf.js` / `golf-api.js`, `nflverse.js`, `nhl-clips.js`, `mlb-stats.js`, `frozen-cache.js`,
  `cache-fresh.js`.
- **Views:** `live-now.js` (Scores), `standings-*.js` (+ shared `standings-flat.js` for NBA/NHL/MLB), `overall.js`
  (Points), `race.js`, `activity.js`, `history.js`, `compare.js`, `team-page.js`, `chat.js`, `settings.js`,
  `guide.js`, `admin.js` (Commissioner), `draft.js` (+ `draft-*.js`), `since.js`, `golf-view.js`.
- **Scoring:** `league-facts.js`, `season-lock.js`, `season-phase.js`, `lines.js`, `scoring-sheet.js`, `rank.js`.
- **Pure (tested):** `draft-rules.js`, `draft-engine.js`, `draft-poll.js`, `draft-sheets.js`, `xlsx.js`,
  `chat-mentions.js`, `lines-math.js`, `race-math.js`, `since-math.js`, `gestures.js`.
- **UI kit:** `ui.js` (leaf), `icons.js`, `escape.js`, `sheet.js`, `motion-fx.js`, `utils.js`.
- **Other pages:** `landing.js` + `landing-explainer.js` (`landing.html`), `system-admin.js` (`admin.html`).

## Worker routes (`worker/rundown-proxy.js` → `route()`)

| Route | Purpose | Auth |
|---|---|---|
| `GET /access/check` | invite code status `{required, ok}` | public |
| `GET /admin/verify` | check commissioner password/token | password header |
| `GET/PUT /facts/<lg>`, `/adjustments/<lg>`, `/lock/<lg>` | League Facts store | PUT: `X-Admin-Password` |
| `GET/PUT /favorites/<drafter>` | favorites per drafter | open (Origin-checked) |
| `GET/PUT /activity` | activity feed + points sample (triggers points alerts) | group code |
| `GET /points/history` | daily points samples | group code |
| `/chat/ws` | ChatRoom WebSocket | Origin check + group code |
| `/draft/ws`, `GET /draft/result`, `GET /draft/status` | DraftRoom socket, final board, phase (edge-cached 5s) | commissioner frames need `auth` |
| `PUT /draft/schedule`, `PUT /draft/poll`, `PUT /draft/vote` | draft time, time poll, a vote | schedule/poll: password |
| `GET /gif/config` | KLIPY app key | own origins only |
| `GET /push/config`, `/push/device`, `/push/test` | Web Push setup | Origin check |
| `POST /claim`, `GET /roster` | spot claims, confirmed names | public, rate-limited per IP |
| `GET/PUT /sports` | group's shown/drafted sports | PUT: password |
| `GET/PUT/DELETE /champions` | season history | writes: password |
| `/sportsdb/*`, `/teams/*`, fallthrough | TheSportsDB / TheRundown proxies | key held server-side |
| `GET /news/<league>`, `POST /news/refresh` | Perigon "More news" per league (KV), run one batch now | GET: public; POST: password |
| `/nflverse/injuries`, `/nflverse/depth-chart` | nflverse CSV → JSON (CORS proxy) | none |
| `/nhl/score/<date>` | NHL clip ids (CORS proxy) | none |
| `/golf/season/<year>` | condensed FedEx Cup events, stored in KV | none |
| `/api/admin/*` | system admin (`worker/system-admin.js`) | Cloudflare Access JWT |

Group routes are gated by the invite code (`?gc=`) except `/access/check`, `/claim`, `/roster`, `/sports`,
`/admin/verify`. Origins allowed: `boxscorethedraft.pages.dev`, `boxscore.space`, `*.boxscore.space`,
`*.boxscorethedraft.pages.dev`, `http://localhost:8934`.

Worker files: `chat-room.js`, `draft-room.js` (Durable Objects), `web-push.js`, `points-alert.js`,
`draft-time-alert.js`, `claims.js`, `roster.js`, `sports.js`, `champions.js`, `points-history.js`, `golf.js`,
`chat-game.js`, `access-code.js`, `access-auth.js`, `commissioner-token.js`, `system-admin.js`, `admin-log.js`,
`welcome-email.js`.

## External services

| Service | Used for | Called from | Auth | Caching / limits |
|---|---|---|---|---|
| ESPN hidden site API (`site.api.espn.com`, `site.web.api.espn.com` for golf) | standings, schedules, live state, summaries, golf | browser (worker for golf season) | none | client memory + localStorage; no published rate limit (none known to the owner); keep calls cached |
| TheRundown | fallback for CFB FCS team and College Basketball | worker | `THERUNDOWN_API_KEY` | edge 60s / 1h; comment cites a 20,000 data-point/day budget |
| TheSportsDB V2 | deprecated fallback in `fetchTeamBundle` | worker | `SPORTSDB_API_KEY` | edge 24h / 60s |
| nflverse-data (GitHub releases) | NFL injuries, depth charts | worker (no CORS upstream) | none | edge 2h / 3h; depth chart read as a stream, newest snapshot only |
| Perigon (`api.perigon.io`) | "More news" beyond ESPN on team pages (proof of concept) | worker, daily cron only | `PERIGON_API_KEY` (query param) | free tier ~150 calls/month: 4 searches/day, KV counter stops at 140; edge 6h |
| NHL `api-web.nhle.com` | highlight clip ids | worker | none | edge 5 min |
| Brightcove | resolve NHL clip ids to .mp4 | browser | none | uncached (signed URLs) |
| KLIPY | chat GIFs | browser (required by KLIPY terms) | app key from `/gif/config` | not cached by rule; Testing keys capped at 100 req/h |
| Web Push services | alerts | worker | VAPID keys | — |
| Resend | claim alert + welcome emails | worker | `RESEND_API_KEY` | — |
| Cloudflare Access | system admin login | edge + worker JWT check | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | — |
| Google Fonts | Space Grotesk, Manrope | browser | none | — |

## Storage

- **KV `LEAGUE_FACTS`:** all small shared state. Keys are prefixed per group (`push@<group>:<drafter>`,
  `roster@<group>`, `sports@<group>`, `access@<group>`, `history@<group>:<season>`, `champions@<group>:seasons`,
  `golf:<year>`, `news@<league>`, `news@meta`, `adminlog`, …). The Draft uses the bare prefix.
- **Durable Objects:** `ChatRoom` (one per group), `DraftRoom` (one per room name: `main`, `mock-1`, `mock-<id>`).
  SQLite-backed; migrations `v1`, `v2` in `wrangler.toml`.
- **Browser:** `localStorage` (identity, settings, caches, admin password, invite code), `sessionStorage` (splash),
  Cache Storage (`sw.js`, `boxscore-v52`).

## Deployment

- **Static site:** Cloudflare Pages project `boxscorethedraft`, Git-connected to `grayhavens/boxscore-the-draft`.
  Production branch `main`; build command, output dir and root dir all empty (serves the repo root as is).
  Preview deployments for every branch and PR (with PR comments), on `<branch>.boxscorethedraft.pages.dev`.
  Custom domains: `boxscore.space`, `www.boxscore.space`, `thedraft.boxscore.space`, `seasonticket.boxscore.space`.
  A new group needs its subdomain added to the Pages project. `boxscore.space` → `landing.html`.
  (Read from the Cloudflare API, 2026-10-03.)
- **Worker:** `cd worker && npx wrangler deploy` (name `team-dashboard-rundown-proxy`, `workers_dev = true`, plus
  zone route `boxscore.space/api/admin/*`). Always deploy the worker **before** the site when a change touches both.
- After a worker address change, update `DASHBOARD_WORKER_BASE` in `js/worker-base.js`.
- Bump `APP_VERSION` (`js/version.js`) for on-screen changes; bump `CACHE_NAME` in `sw.js` when the shell changes.

## Related docs

- `docs/espn-migration-plan.md` — why ESPN is primary; data-source history.
- `docs/draft-room-plan.md`, `docs/draft-day-runbook.md` — draft room design and operations.
- `docs/golf-plan.md` — PGA golfers for Season Ticket.
- `docs/design-system-plan.md`, `docs/motion-plan.md`, `docs/delight-plan.md` — UI plans.
- `docs/points-ux-plan.md`, `docs/points-race-plan.md` — Points tab.

---

## Feature reference

Moved verbatim from the previous `CLAUDE.md` (2026-10-03) so the short CLAUDE.md loses nothing. Read the section
for the feature you're touching. Note: "Three views, one page" below predates Scores, Chat and the team page; the
current views are listed under Modules above.

**Single source of truth for content:** `js/data.js` holds `DRAFT_TEAMS` (the active group's 10 people, from `js/groups.js`),
`TEAM_META` (every team's display info, league, owner, and the IDs used to pull live data),
`LEAGUES` (which teams appear under each league tab and in what order), `LEAGUE_SCORING` (each
league's point rules), and `PRIOR_SEASON_DISPLAY_LEAGUES` (`['mlb', 'wnba']` — see below). Adding
or changing a team/league means editing this file; nothing else hardcodes team/league data.

**Groups (friend-group leagues):** one deployment hosts several fully separate 10-drafter groups, each on
its own subdomain `<id>.boxscore.space` (The Draft is `thedraft`). `js/groups.js` is the registry (drafters,
display name) and is shared with the worker; `js/group.js` resolves the active group from the hostname
(`?group=<id>` also works on localhost and Pages previews only). The bare domain `boxscore.space` (and `www.`) is the
platform, not a group: an inline script at the top of `index.html` sends it to `landing.html` (`js/landing.js`), which
lists the groups in its `LANDING_GROUPS` (only Season Ticket now, the one still recruiting) with a link to each subdomain.
A group with `open: true` roster spots in `js/groups.js` shows there as a recruiting card (a spots meter, the draft date from `GET /draft/status`, and "Claim a spot ›" opening a claim form inside the card with name and email, both required; no link into its app until its last spot is filled): `POST /claim` (`worker/claims.js`)
stores the request in KV, rate-limited per IP, with no push alert; instead it emails the platform admin (worker secret
`CLAIM_ALERT_EMAIL`, sent through Resend) who claimed and a link to `boxscore.space/admin?group=<id>`, which opens on that group. The admin page lists claims at the top: **Confirm**
(name editable first) gives the person the group's next open spot with no deploy, under that spot's id, in the
`roster@<group>` KV record (`worker/roster.js`). `applyRoster` in `js/groups.js` is how everything reads it: the
worker's chat/draft alerts, the landing count, and the app, where `js/roster.js` applies it at boot from `group.js`
(top-level await: instant from a localStorage copy, and only a device's first launch waits, up to 1.5s, on `GET
/roster`). Name pickers hide still-open spots. The roster table on the admin page labels a spot "Commissioner" when `js/groups.js` marks it `commissioner: true` (a label only), otherwise Named or Confirmed. Undo frees a spot. Under the group cards, "Interested in Boxscore?" takes
someone with no group to join (name, email, start a group or join one, an optional note): `POST /interest`
(`worker/interest.js`), platform-wide rather than a group's, bounded like `/claim`, stored in KV `interest`, emailed
to `CLAIM_ALERT_EMAIL` like a claim, and listed on the admin page's Platform view (and its "Needs attention") with
Dismiss (`POST /api/admin/interest/dismiss`). **Deploy the worker first.** Code says "group" because "league" already
means EPL/NFL/etc. Worker state that belongs to a group — facts/adjustments/locks, favorites, activity, the
chat room, draft rooms, the commissioner password (`ADMIN_PASSWORD_<GROUP>` secret) — is keyed by the
`?group=` param the client adds (`withScopeQuery` / `withGroupQuery`); The Draft sends none and keeps its
original un-namespaced keys. `node tools/export-draft.mjs --group <id>` exports another group's finished draft to
`js/seasons/<group>-<year>.js`, registered in `js/seasons/<group>.js` (made on the first export), `js/seasons/index.js`
(`OTHER_GROUP_SEASONS`) and `sw.js`; a group's first class copies teams and scoring from The Draft's newest class and takes its
year, and adds PGA Tour scoring when the group drafted golfers. localStorage isn't namespaced by group because each subdomain is its own
origin. A group with no draft class yet gets a pre-draft class (`js/seasons/pre-draft.js`): The Draft's teams with the owners
stripped and every team `favoriteOnly`, so Scores, Standings and team pages work, while `PRE_DRAFT` (`js/data.js`)
hides everything drafter-shaped (owner labels, the Standings "Drafted" toggle, the Scores "Drafted" scope). A group's
optional `caps` in `js/groups.js` (`groupCaps`) picks its sports and picks per sport: its draft rooms take them while
in the lobby (`syncCaps`), and its pre-draft class shows only those leagues (standings modules read leagues through
`leagueOf` in `js/data.js`, so a missing one is empty). The Draft has none and keeps `DEFAULT_CAPS`.
The commissioner can change both on Commissioner → Sports with no deploy (see **Group sports** below). PGA Tour golfers
for Season Ticket are planned in `docs/golf-plan.md`. The ESPN
data and proxy edge cache are shared by every group.

**Group sports** (`js/sports.js`, `worker/sports.js`, `js/group-sports.js`): Commissioner → Sports (`js/admin.js`) sets
each sport to Off, Scores (shown on every tab with nobody owning a team: no picks, no scoring rules, no "Drafted"
toggle, and on Home only once you favorite something) or Draft with 1 to 5 picks each. Stored as `sports@<group>` in KV
(`{ sports: { <league>: 0 | n }, at }`), `PUT /sports` with the commissioner password, `GET /sports` public like
`/roster`. Drafted sports are the group's caps for its next draft room: a room in the lobby reads them on every connect,
and a save also pushes them to the `main` and `mock-1` rooms at once (`at` stops a lagging KV read from undoing a
newer save). The app writes them onto the `GROUPS` entry at boot (`caps` and `shown`, read by `groupCaps` /
`groupShown`), the roster's localStorage-first pattern, so a change shows from the next launch. A pre-draft class shows
drafted and scores-only sports (`preDraftClass(caps, shown)`); a drafted class keeps every league it drafted, since
they still score, and gets scores-only leagues added from the catalog (`withScoresOnly`, marked `scoresOnly` on the
`LEAGUES` entry, `isScoresOnly` in `js/data.js`). No record means `js/groups.js` decides. **Deploy the worker first.**

**Group invite code** (`worker/access-code.js`, `js/access.js`): a light gate that keeps outsiders out of a group's own
state (chat, draft room, activity, favorites, facts, points history, push), with no accounts. One shared code per group
(`access@<group>` in KV, like `maple-river-42`), set from the system admin page's Invite code section: **Make a code**
starts in soft mode (the worker logs a missing or wrong code but lets it through), **Enforce** turns the gate on, and
New code / Remove do what they say. The invite link `https://<group>.boxscore.space/#code=<code>` stores the code on the
device (`js/access.js` takes it from the fragment at boot, from `js/group.js`, and leaves other fragment pieces alone);
a device with no code (the Home Screen app starts from `manifest.json`'s fixed `start_url`, with its own storage) gets a
full-screen prompt for it once. `withGroupQuery` adds `?gc=<code>` to every group call, a query param because a
WebSocket can't set headers. The worker gates every group route in `route()` except `/access/check` (public,
`{ required, ok }`), `/claim`, `/roster` and `/admin/verify`. The static site and ESPN data stay public by nature.
A device that has been let in doesn't wait on the network at boot; the check runs behind it and sends the device back
through the prompt only if the code was rotated or enforcing turned on. The welcome email's link carries the code and
`{code}` spells it out; "Open as commissioner" passes it along in the fragment. Records are cached 30s per worker isolate,
so a change takes up to that long, and already-open chat/draft sockets stay connected until they reconnect.
**Deploy the worker first:** an old worker ignores `gc`, which is harmless, but the admin page needs the new route.

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
strip and next match (Home's rows, the team page's stat strip and next game) and the Game Details sheet,
plus a staggered background refresh loop (`backgroundRefreshTick`: only the teams on Home and an open team page, each once per 5 minutes) so open tabs stay current without hammering any API. Results
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
- **PGA Tour golf** (`docs/golf-plan.md`; off for every group for now, a commissioner turns it on from the Sports screen): ESPN too. `js/golf.js` parses (shared with the worker),
  `js/golf-api.js` fetches. The worker's `/golf/season/<year>` (`worker/golf.js`) condenses finished FedEx Cup
  events into KV (`golf:<year>`) so phones never pull whole leaderboards; the live one comes straight from ESPN. Use
  the `site.web.api.espn.com` host: `site.api` answers 403 to the worker's requests. The draft pool's golfers are
  `js/golfers.js` (`node tools/golfer-pool.mjs`); a golfer is league `pga` with `espnAthleteId`, not a team id. Scoring: `golfAuto` rules
  (`js/seasons/pga.js`) resolve in `getLeagueRuleTeams` from `golferAwardCounts` (`js/golf.js`), one entry per occurrence;
  the +5 bonus is `golfBonus` in `js/compare.js`.
- **TheSportsDB** is deprecated as a source: its only remaining caller is `fetchTeamBundle`'s
  fallback branch in `js/live-data.js`, reached when a team with a `sportsdbId` fails to resolve an
  ESPN row on a given refresh.
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

**Chat reactions** (Slack-style: several per person, one of each emoji): pressing and holding a message (or right-clicking it), like iOS Messages, opens a
row of the seven `REACTION_EMOJI` (👍 👎 😂 😮 😢 🔥 😎 — duplicated in `js/chat.js` and
`worker/chat-room.js`, and the worker rejects anything not in its copy); a tap elsewhere closes it. A bubble's text isn't
selectable (the long press is the picker's), so a tap on a text bubble copies it; tapping a pill under a
message toggles your own. The client sends `{type:'react', from, messageId, emoji}` and the room
answers everyone with that message's full reaction set. Reactions live in their own SQLite table (not
on the message) since they change after it's sent, so the `history` frame always carries a snapshot
of every retained message's reactions — a reconnect (`?after=<lastId>`) fetches no old messages and
would otherwise never see a reaction added to one. **Deploy the worker before the static site:** an
old worker silently ignores `react` frames, so the buttons would do nothing.
The system admin page can delete a message for everyone: the room broadcasts `{type:'deleted', messageId}` and
keeps the deleted ids (pruned with the messages) in the `history` frame's `deleted` list, for the same reason, so a
device that was away drops its cached copy.

**Chat mentions** (`js/chat-mentions.js`, pure and shared with the worker and tests): typing `@` in the composer opens a
list of the group above it, and a sent message carries `mentions`, the drafter ids its text tags (ids, since names have
spaces and a roster confirm can rename a spot). The worker keeps only real drafters (`parseMentions`) in a `mentions`
column. Anyone tagged gets a "Josh mentioned you" alert instead of the chat one (`splitRecipients`), its own `mention`
switch in Settings → Alerts, on by default for a device that never set it (`wantsAlert` in `worker/web-push.js`), and
mention alerts stack apart from chat's in `sw.js`. A message that tags you is outlined in gold and the Chat badge reads
`@` while one is unread. `@everyone` is the commissioner's: offered only on a device with the password saved, sent with
it as `auth`, and dropped by the room (the message still posts) unless `checkCommissionerSecret` passes. **Deploy the
worker first:** an old worker ignores `mentions`, so tags would neither highlight nor alert.

**Shared games in chat** (`js/game-card.js`, `worker/chat-game.js`): Game Details' "Share to chat" button posts the
game right away (no caption step) and jumps to the Chat tab. The message's `game` field is a snapshot of the game
at that moment (league, ESPN event id, state, status, both sides' team key/name/abbr/score), shown as a frozen card that
never changes. A small live line under it shows the game now, but only once the score or state has moved on. It
reads "Final" at the end and then stops. It's looked up from ESPN only while the Chat tab is open, at most once a minute
per game, and cached on the message (`m.gameNow`). The worker validates the snapshot (`parseGame`) and writes the
message's text itself (`gameText`), which older app versions show instead of the card and which is the alert body.
Tapping a card opens its Game Details; like any message, a long press (right-click on desktop) opens its reactions. **Deploy the worker
before the static site:** an old worker rejects a message with no text.

**Push alerts** (`js/push.js`, `worker/web-push.js`, the `push`/`notificationclick` handlers in `sw.js`):
Settings → Alerts lets each device opt into "My draft pick" (you went on the clock in a real, non-mock
draft room), "My points" and "Chat messages" (skipped for anyone with the app on screen: `js/chat.js` sends a
`presence` frame the chat room tracks per socket). "My points" (`worker/points-alert.js`, hidden before a group's
first draft) rides on the Activity PUT: once it lands, each drafter its new events touched gets one alert for the batch
(rank moves only for 1st place, at most once a day), opening Points → Activity. Standard Web Push with VAPID and aes128gcm written
on WebCrypto, no dependencies; subscriptions live in `LEAGUE_FACTS` KV per drafter (`push:<drafter>`,
`push@<group>:<drafter>` for other groups). Needs the worker secrets `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (`node tools/vapid-keys.mjs` makes a pair; never rotate it casually, since that
drops every device's registration). Without them `/push/config` answers null and the section stays
hidden. iPhones only get web push in the Home Screen app, so Safari shows an "Add to Home Screen
first" row instead. The chat unread count also goes on the Home Screen icon (`navigator.setAppBadge`).
**Deploy the worker before the static site.**

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
sends actions and renders what comes back. Commissioner actions need the admin password, which is only
entered on Settings → Commissioner (`js/admin.js`, `?view=admin`) — one gate for the draft and scoring; the
room signs its socket in with the password saved there. `js/draft.js` and everything under it load on first open (`setDraftActive` in `js/board.js`), modulepreloaded once the app is idle. At 900px and up that page is a full-screen sidebar shell (Draft, then one screen per
league, the `desk*` functions, with `?screen=<league>` in the URL and the phone tab bar hidden). The Draft screen leads with
a "Needs attention" list (a paused draft, a passed or near draft time with the lobby unready, a poll everyone answered,
a locked league with postseason rules nobody is marked for), flagged in the sidebar too. Under 900px it keeps the phone
column with a Draft/Scoring switch and league chips. Its writes (marks, adjustments, locks, the draft time and poll) carry
a `?note=` saying what changed (`withNote` in `js/utils.js`), and the worker adds that to the system admin log as
`Commissioner`; a write with no note isn't logged. **Deploy the worker first** (an old one ignores the note). See
`docs/draft-room-plan.md` for the design and phase status. **Deploy the worker before the static site.**
Settings' Draft tile (and the Home draft card) offers Mock Draft or Live Draft (`main`). Mock Draft opens the drafter's
own room, `mock-<id>` (`personalMockRoom`), which nobody else is sent to and which starts with everyone else as a bot;
the group's shared rehearsal room, `mock-1` (`GROUP_MOCK_ROOM`), is opened from Commissioner → Draft. Mock rooms (`isMockRoom`:
`mock`, `mock-*`) are self-serve — the worker signs every socket in as commissioner — and are the only
rooms that auto-pick: a Durable Object alarm drafts for bots after `config.botSeconds` and for anyone
whose clock runs out (`autoPickTeam`). The real room's clock stays soft.
**Auto-draft** works in both kinds of room: `state.autoDraft` lists drafters the worker picks for
the moment they go on the clock (`AUTO_DRAFT_SECONDS`, 0.75s: a beat so it reads as a pick), from their queue or else the best team that fits, through the
same alarm (`autoPickLimitMs` in `js/draft-rules.js` picks the delay for any room). Each drafter switches their own
(`setAutoDraft`, no password) from under My queue in the room's right column (the My team tab on phones), or the lobby; the commissioner can switch anyone's from the live
room's Clock & auto-draft settings. It's kept through a lobby reset, and an auto-drafter gets no "You're on the
clock" alert. Picks it makes carry `auto: true`. **Deploy the worker first:** an old worker rejects `setAutoDraft`.
**Home draft card** (`renderDraftHome` in `js/board.js`, `js/draft-schedule.js`): before a group's first draft
(`ACTIVE_SEASON.preDraft`) Home leads with the draft's start time plus Mock Draft / Live Draft buttons, and hides
the empty league sections. Any group gets the same card while a scheduled live draft is still ahead, so The Draft's
next draft shows it too. The commissioner sets the time on Commissioner → Draft (`PUT /draft/schedule`,
password-gated); the live room stores it outside the draft state (a lobby reset keeps it) and returns it as
`scheduledAt` on `GET /draft/status`. Before setting it, the commissioner can run a **draft time poll** (`js/draft-poll.js`,
pure and shared with the worker): two or three candidate times entered on Commissioner → Draft (`PUT /draft/poll`,
password-gated), which the card shows in place of "Date to be set" so each drafter can mark every time they can make, or
"None of these work" (`PUT /draft/vote`, no-auth like favorites). The room stores the poll beside the schedule and sends
it on the same status, so the Commissioner page lists who can make each time, with a Use button that sets it as the
draft time. A set time closes the poll on Home; the answers stay on the Commissioner page until the poll is removed.
Setting or moving the time (not clearing it) sends a push alert to every device in the group with alerts on, whichever
switches are set (`worker/draft-time-alert.js`). The payload carries the timestamp and `sw.js` writes the body in the
phone's own time zone.
The card goes away once the draft goes live (the banner takes over) or is done,
and a pre-draft group's card goes away when its draft is exported into a real class. **Deploy the worker first.**
**Download board** exports the board as an .xlsx (Picks / Board / Rosters sheets, `js/draft-sheets.js`),
written by the dependency-free `js/xlsx.js` in the browser — no worker call. Everyone gets it once the draft
is done; the commissioner bar has it any time as a mid-draft backup. While a draft is live (phase `draft`), every other page shows a tappable "Draft is live" banner back
into the room (`js/draft-live.js`: top of `.board` and under the Chat header). Off the draft view it
polls the worker's `GET /draft/status` (edge-cached 5s; 20s polls while live, 90s otherwise); an old
worker without that route just means no banner.

**Feature guide** (`js/guide.js`): one `GUIDE` list feeds both the first-run tour (cards in the welcome
sheet right after a new device picks its name; its last card turns on push alerts) and Settings → How Boxscore
works (`#view-guide`, `?view=guide`). In a phone browser the welcome opens on the two Add to Home Screen steps,
and the name pick and tour only follow "Continue in browser", since the Home Screen app runs the welcome again on its
first open. Tour cards show just each entry's `lead`. **When a
feature ships or changes, update its `GUIDE` entry** (`tour: true` adds it to the tour; `pre` is the text shown
before a group's first draft).

**System admin** (`admin.html`, `js/system-admin.js`, `worker/system-admin.js`): the platform owner's page at
`boxscore.space/admin`. It shows each group's draft, chat, activity, alert devices and secrets (present or missing, never
values), sends test alerts and group announcements, and opens any group as commissioner. **Cloudflare Access** does the
login. It guards `boxscore.space/admin*` and `boxscore.space/api/admin/*`, and the worker answers the latter as a zone
route (`wrangler.toml`; `workers_dev = true` keeps the app's workers.dev address alive). The worker still checks the
Access JWT itself (`worker/access-auth.js`), because the same routes are public on workers.dev. "Open as commissioner"
mints a 12-hour token signed with that group's own password (`worker/commissioner-token.js`). The group app takes it from
the `#commissioner=` URL fragment (`js/admin.js`) and stores it in place of a typed password, and every commissioner
check accepts either. Rotating a group's password cancels its tokens. It's the one desktop-first page: a sidebar
picks Platform (health tiles, a "Needs attention" queue, every group in a table, the admin log) or one group (summary
strip, claims, the live draft's setup and time poll answers, one Roster table of every spot with an Edit emails mode for
the named spots, invite code, announcement, welcome email with a live preview, alert devices, chat moderation, that
group's log, commissioner writes included); the screen is `?group=<id>` (`platform` for Platform), so Back and reloads
work; under 900px the sidebar becomes a top bar with a picker. Action results
show as a toast, and it refreshes itself every minute while nothing is being typed. The Roster adds a person to an
open spot with no claim, edits a confirmed spot's name or email, and welcomes one person. **`APP_VERSION` lives in
`js/version.js`** (bump it there), which the worker imports too, so `/status` reports the version the worker was
deployed with and the page flags a worker that's behind the site. Every admin POST that changes or sends something
writes a line to the admin log (`adminlog` in KV, `worker/admin-log.js`). Alert devices are listed by a hashed id and
push service (never the endpoint), with Remove for an old one. Its **Welcome email** section (`worker/welcome-email.js`) emails a group's confirmed people (their claim's
email) and any spot named in `js/groups.js` whose email was added there (`emails@<group>` in KV, never the public
file), through Resend from `admin@boxscore.space` (worker secret `RESEND_API_KEY`, domain verified
in Resend), with replies to the admin's Access email. `welcome@<group>` in KV records who has had it. Confirming a claim sends it
to that person in the same request (`welcome: { subject, body }` on `/api/admin/claims/confirm`, the section's text as it
stands; a "Send the welcome email" checkbox in the confirm row, on by default). A failed send still confirms, and the
section then offers that person. **Deploy the worker first.** Setup, one time:
1. Zero Trust → Access → Applications → add a self-hosted app for `boxscore.space` with paths `admin` and `api/admin`,
   plus a policy allowing only your email.
2. `npx wrangler secret put ACCESS_TEAM_DOMAIN` (e.g. `<team>.cloudflareaccess.com`) and
   `npx wrangler secret put ACCESS_AUD` (the app's Application Audience tag).
3. Deploy the worker (it adds the zone route), then the static site.

Without those secrets the API answers 503. Locally, the `admin-worker` launch config runs `wrangler dev` with
`ADMIN_DEV_BYPASS=1` (honored only while `ACCESS_AUD` is unset) and test passwords, and `/admin.html` on the preview
server talks to it. The group app still verifies commissioner sign-in against the deployed worker, so a locally minted
token only verifies on the local worker.

**League Facts** (`js/league-facts.js`) is how "who won the cup" / "who got relegated" facts get
shared across every drafter instead of living in one person's `localStorage`: marking a fact once in
a league's Results modal credits every drafter who owns an involved team automatically, stored in
Workers KV (`LEAGUE_FACTS_LEAGUES` allowlist). `rankAuto` scoring rules (in `LEAGUE_SCORING`) skip
manual marking entirely and are instead derived live off a loaded standings table (currently EPL
only — see `getLeagueRuleTeams`). `rankAuto: { eliminated: true }` (WNBA "Missing the playoffs") reads ESPN's
"Eliminated" clincher text, the mirror of `clinched`. Every league is on this model; the older per-team
achievements checklist is retired (`js/board.js` deletes its leftover key at boot).

**Points history** (`worker/points-history.js`): one sample per Central-time day of every drafter's projected and
locked points, for the Points tab's Race segment (`js/race.js` draws it, `js/race-math.js` is its pure math;
`docs/points-race-plan.md`). Scoring only exists in the browser, so
the sample rides on the Activity PUT (`js/activity.js`) and the worker only validates and stores it
(`history[@<group>]:<season>` in KV, served by `GET /points/history`). A day nobody opens the app has no entry.
**Deploy the worker first.**

**On the line** (`js/lines.js`, pure math in `js/lines-math.js`): how close each drafted team is to every placement
rule that scores ("1 game behind Vikings" for Division title, "2 pts clear of the drop"), in games behind for record
leagues and table points for EPL/NHL. It reads the same ranked tables the rules score from (`rankAutoRowTables` in
`js/league-facts.js`), so it always agrees with Live points. The team page's Path to points (`teamPathToPoints`) puts each
rule's line under it, and a drafter's Points breakdown lists their five closest calls. Clinched / out of reach / stuck / safe use games left and
ignore tiebreakers. Only for a league whose season is under way and not locked.

**Team page** (`js/team-page.js`, `docs/delight-plan.md` Phase 2): where every team tap in the app goes (there's no team peek
modal; a golfer opens the golfer sheet). Tapping a team's crest anywhere (a Home or Standings row, a team on a Scores
card, a Compare team) grows what was tapped into the page, crest, name and owner flying into the hero (`teamSource`
picks the parts), and Back shrinks it back; Points' rule and activity rows, which show no crest, push it in. Back says
where it returns to. A 300px hero (status-bar strip included) with the team
orb, that folds into a fixed compact bar as you scroll (one passive listener writes the view's `--y` and `--p`; the notch
cover is off on this page). Swiping sideways anywhere on the page (the page follows the finger; a drag that starts in a sideways scroller is left to it) moves through your own teams in Home's order (dots under the hero; off
on a team you don't own), replacing `tp` in the URL so Back still goes where the page came from; pulling it down at the
top stretches it (pull to refresh, `js/pull-refresh.js`, is off on this page for that). The stat strip is Record / Standing / Points (`teamRecordStanding` in `js/live-data.js`), the next
game card shows the opponent with the date and time (no crest for the team itself), Overview leads with the last five games as bars (every result row is on Full schedule),
then Path to points (`teamPathToPoints` in `js/lines.js`: every rule as locked, live, in reach or off, with On the line's
distance as its note). Path to points is folded to a row of state dots and a count until tapped open; the device
remembers the choice (localStorage `bx-ptp-open`).

**Since last time** (`js/since.js`, pure `js/since-math.js`, `docs/delight-plan.md` Phase 4): back after 8 hours or
more, Home leads with a swipeable stack: a summary card (rank, points and locked points against `bx-last-seen`, the
visit baseline written whenever the app is put away, plus your teams' record), then up to four notable cards (locks and
clinches, postseason games and upsets, a series against one drafter, single games), from each of your teams' ESPN
schedules. It only drops in when something above a single game happened or your rank moved; otherwise just the
"N updates" pill beside the Home title, which opens the cards once. Off before a group's first draft, while the draft
card leads Home or a draft is live; reduced motion gets a sheet list. If ranks take longer than 3.5s to settle on a
cold launch, the cards go up without them and are rebuilt (as the pill) once they land, so a rank move is never lost.

**League history** (`js/history.js`, `js/champions.js`, `worker/champions.js`): Points → History shows the newest
champion, every recorded season's final standings and an all-time table (titles, then top-3 finishes, then average
finish). It's hidden until the first season is recorded. The commissioner records the class being played, from today's
Points ranking, on Commissioner → History, which only appears once every league is locked (or a season is already
recorded). There's no form for seasons before the app (neither group wanted one); the worker and `js/champions.js`
still accept `source: 'manual'` if that comes back. `champions[@<group>]:seasons` in KV, `GET`/`PUT`/`DELETE /champions` (writes need the
commissioner password). Recording the app's season the first time alerts the whole group (every device with alerts
on), Home shows the champion for 21 days, and champions get a title tag on their Points sheet and breakdown.
**Deploy the worker first.**

**Postseason** (`js/postseason.js`, pure `js/postseason-math.js` tested in `tests/postseason-math.test.mjs` and
`tests/postseason-cbb.test.mjs` / `tests/postseason-mlb.test.mjs`, the reveal in `js/postseason-reveal.js`): once ESPN has an NFL, CFP, NCAA men's
Tournament or MLB bracket (`fetchEspnPostseason` in `js/espn.js`, only fetched December through February for football, March
and April for the NCAA), those Standings cards get a Regular | Postseason toggle. Regular is the old card, untouched;
the card opens on Postseason. Postseason is a ladder of every playoff team: it only shows the rounds someone has reached
(`topRung`), the two sides of each game still to play sit together with a gray "v" between them (`matchups`), eliminated
teams stay grayed on the rung where they lost, a scrubber replays the rounds, and the Champion rung becomes a crown card
(the champion's chip, doubled, as its logo, its owner and the title win's points) with a bloom, ripples and a rung pop.
A rung's points are gold once a team has reached it (in the reveal, once the badges land).
Below it, a drafted table (gold locked, blue in play, tap to spotlight). The ladder's title is the league logo with
"Playoffs" (the NFL's shield from ESPN; the CFP's emblem and wordmark from `icons/cfp-*.png`, since ESPN has none).
Points come from the group's own `LEAGUE_SCORING` rules matched by label to a round (`milestonesFor`). They also
score on the Points tab with no commissioner mark: `getLeagueRuleTeams` unions marks with `postseasonRuleTeams`
(`js/postseason.js`), which reads the same bracket for the draft class whose season ESPN is serving. It keeps fetching
past February once the league has locked, so a March total keeps the Super Bowl. Marks stay as an override. A chip opens the team page, whose Overview leads with a Postseason section at
the ladder's stage. The ladder updates in place while you scrub; `keepPostseason`/`restorePostseason` carry it across a
Standings re-render.
The toggle is introduced by the **playoffs reveal**: the first time a device opens that league's Standings tab after the
field is set, a ~10s announcement plays in the card (the logo big, then docked; the seeded field; how many of your teams
are in; a loud toggle that flips to Postseason; the logo and badges flying down into the ladder at the field set). Then
the ladder climbs one round at a time (`replayPostseason`, the Replay button's steps) and stops on the latest round, so a
first look during the semifinals walks through each round before it. Until it has played
(`bxPsReveal:<league>:<year>` in localStorage) there's no toggle. It holds Standings re-renders while it runs
(`postseasonRevealBusy`), ends at once on the latest round on a toggle tap, a league switch or leaving the tab, and
reduced motion skips straight there.
Home leads with a gold "NFL Playoffs" card per league (`postseasonHomeHtml`, `#playoffs-home`) for the whole
postseason and a week past the title game: the current round in its eyebrow (`currentRoundName`: the round being played or
up next, "First Four", "Champion: …"), the viewer's teams in (before the first game) or left, and their live teams' badges.
A pre-draft group (`PRE_DRAFT`) gets no cards: `renderPlayoffsHome` leaves `#playoffs-home` empty until the draft is in.
A tap (`openPlayoffs`) opens Standings on that league, where the reveal plays the first time (it also plays the first time
that league's Standings tab is opened any other way); after that the tap goes straight to the ladder at its latest round.
On the All tab there's no reveal: a league's card has its toggle, on Postseason, from the moment the field is set. The year label
is the class's own season (`seasonLabelYear`: "'26 Season" → 2026). Local dev and Pages previews replay a past season
with `?psyear=2025`, and `?psreveal=1` replays the reveal on every load and tab visit; both stick on the device until
`?psreveal=0` / `?psyear=0`.
**College Basketball** (`mcbb`) runs on the same code with a few differences. Its ladder shows only drafted teams
(`ladderTeams`), a rung per round (Tournament, Round of 32 … Title game, Champion; 7 scrubber stops), and the First Four
are `playIn` games on the Tournament rung: a loser stays there (`Out · FF`, still in the field), a win doesn't move a team
up. A rung whose chips need three rows or more grows to fit (`ladderGeometry`). The reveal opens on the March Madness lockup
(`icons/march-madness.png`, one file for both themes) with "Selection Sunday · Field of 68" and the drafted field captioned by
region and seed (E2). Besides the four tournament rules, `postseasonRuleTeams` scores the miss rule ("Don't make NCAA
tournament", `isMissRule`) for every drafted team outside the field. ESPN names the season by the spring it ends in, so
`postseasonYear('mcbb')` and `seasonLabelYear('mcbb')` ("'26/'27" → 2027) follow that. `?psyear` names the winter, so
`?psyear=2025` replays the 2025 NFL playoffs and CFP and the March 2026 NCAA Tournament together.
**MLB** (`mlb`) plays series: ESPN's scoreboard only answers one day at a time, so `fetchEspnPostseason('mlb')` loads
every day from Sept 26 to Nov 8 so far (`loadDays`, settled days saved per device as `bxPsDay:mlb:<day>`) plus the
final standings for seeds (`parseNflSeeds(…, 6)`), and `seriesEvents` folds each series' games into one event whose score
is series wins. Seeds 1-2 per league are byes (`byeSeeds`, the NFL's is 1). A series between games is `begun`, so the
round reads as under way, and the team page shows its tally ("Leads 2–1"). On the ladder, once a series has a
game in, its tally replaces the pair's "v" ("1–0", read left to right like the chips, the leader's number brighter,
a red dot above while a game is on; snapshot's `series` at the latest stage only, worded by `seriesLine` for screen
readers), so it costs no room. Any league fed through `seriesEvents` gets it (MLB, WNBA). MLB's ladder is also split
into AL / NL columns (`sides`: each half of every rung laid out on its own by `rungRows`, the World Series pair
meeting in the middle) under small AL / NL labels (`sidesHtml`) that fade once a champion is crowned. The lockup is `icons/mlb-postseason-*.png`,
drawn for 2026 only (`MLB_LOGOS` by ESPN year; another year has no logo). Its window is Sept 25 through November.
While MLB is in `PRIOR_SEASON_DISPLAY_LEAGUES` the postseason doesn't count (`postseasonScores`): `snap` reads it with no
rules, so the ladder has no rung points, the crown card no points, the drafted table no points columns, the team page
shows Series won / Counts: No, Home's card adds "Doesn't count for points", the Standings note names the postseason,
labels use ESPN's year, and `postseasonRuleTeams` never answers. Once MLB leaves that list, its rules ("Make LCS",
"Make World Series", "Win World Series") score from the ladder too, alongside `js/playoff-series.js`.
**WNBA** (`wnba`) is loaded the same way (every day from Sept 10 to Oct 31 so far, `bxPsDay:wnba:<day>`, folded by
`seriesEvents`): 8 teams, first round (best of 3), semifinals (5), Finals (7), no conferences and no byes. Its seeds are
league-wide, read from the league-level standings (`standings?level=1`, `parseNflSeeds(…, 8)`). The lockup is
`icons/wnba-playoffs-*.svg` for every year: the dark file is the league's on-dark artwork, the light one ours with its
white turned black (the orange stays). Its window is Sept 10 through October. While the WNBA is in
`PRIOR_SEASON_DISPLAY_LEAGUES` it doesn't count, exactly as MLB above; once it leaves, "Reach the semifinals", "Reach
the Finals" and "Win the Finals" score from the ladder.

**NBA / NHL / MLB playoff rounds** (`js/playoff-series.js`, pure `js/playoff-series-math.js`, tests against
`tests/fixtures/espn-playoffs-*.json`): "Make conference finals / LCS", "Make the final" and "Win the final" score from
ESPN's scoreboard with no commissioner mark (marks still union in). ESPN answers one day per request (date ranges
400), so it samples every third day of the late rounds, then walks the days after the last final-round game until a
series is won (a game's series tally is only as of that game). The round is the game's note headline ("East Finals -
Game 3"), matched by label like the NFL ladder. Settled days are saved per device (`bxPlayoffDay:<league>:<day>`).
The MLB LCS / World Series headlines are expected, not yet seen. The NBA play-in is its own season type and never counts.

**College football bowls and conference titles** (`js/cfb-bowls.js`, pure `js/cfb-bowls-math.js`, tests against
`tests/fixtures/espn-cfb-bowls-2025.json`): "Make a bowl game", "Win a bowl game" and "Win conference" score from
ESPN's FBS scoreboard, every day December 1 to January 3 (`js/espn-days.js` saves settled days per device, shared with
the NBA/NHL/MLB rounds). A bowl is a post-season game whose headline says "Bowl" and not "College Football Playoff"
(CFP games, even at a bowl, are the ladder's, and don't count as a bowl); a conference title is a regular-season game
headlined "<Conference> Championship". "Don't make a bowl" stays a commissioner mark: 5-7 teams play in bowls, 6-6
teams get left out, and the feed doesn't say which teams are FBS.

**EPL cups and European spots** (`js/epl-cups.js`, pure `js/epl-cups-math.js`, tests against
`tests/fixtures/espn-epl-cups-2025.json`): "Win League Cup" / "Win FA Cup" read the winner of the final (the
competition's calendar gives the day as text, in a window that ends after the game; kept for good once over), and
"Make Champions League (any stage)" / "Make Europa League" read each UEFA competition's league-phase table
(`apis/v2 .../uefa.*/standings?season=<year>`, hourly, from September). ESPN has no qualifying rounds, so "make" means
the main stage; a club dropped from the Champions League into the Europa League's knockout playoff isn't in that
table. A cup winner replaces any commissioner mark (the rules are exclusive); the others union with marks.

**`PRIOR_SEASON_DISPLAY_LEAGUES` (MLB, WNBA):** these leagues' drafted teams don't start scoring
until each league's next season begins, but ESPN's live endpoints only ever return the season
actually being played right now. Until that next season starts, their Standings tab and team pages
show real, live, but non-scoring results — flagged with a shared `prior-season-note` (bold/accent
styling — this is easy to misread as counting if skimmed) rather than hiding the data. Their team
pages also suppress the season-phase pill (`In-Season`/`Pre-Season`/etc.) entirely, since showing
it would read as if the current season counts.

**Motion** (`js/motion.js`, `js/launch-splash.js`): tab switches slide toward the tapped tab and the team
page pushes in and pops back out, both on same-document View Transitions (`navigate(kind, update)`; `html[data-nav]` picks the keyframes in css/style.css). `switchView` and the
team page's open/back functions therefore apply their DOM change asynchronously, inside the transition.
**Live effects** (`js/motion-fx.js`, `docs/motion-plan.md`): moments that react to data: the draft room
(`draftEvents` / `playDraftEvents` in `js/draft.js`) and Scores (`playScoreEffects` in `js/live-now.js`: a goal's "+N",
and the final whistle, after which a just-ended game stays on the Live tab for 2 minutes with a W chip) and Points
(`obPlayFlip` / `obPlayLockIn` in `js/overall.js`: the rank shuffle, and your points locking in) and the team page
(`js/team-page.js`: the orb bloom, stat roll, Path to points and form bars once per open; a rule's state change flips;
from a crest on Home, Standings, Scores or Compare, what was tapped grows into the page and Back shrinks it back). A view compares the state it last rendered with the new one, writes
the DOM, then plays the effect. The first render, a reconnect and a hidden tab show the settled state with no effects,
big moments play once per device (`once`), and every effect ends on exactly what the plain render shows. The
launch splash plays once per cold launch (sessionStorage `bx-splash`) and must stay the first thing in
`<body>`. `landing.html` plays the same splash (once per tab session), landing on its header logo. Everything falls back to the old instant switch without View Transitions or with reduced motion.
Opening a group from the landing page flies the landing logo to the center (`js/landing.js`, `#landing-handoff`)
and navigates with `#splash=handoff`; the group's splash then starts mid-timeline from that built mark (an inline
`<head>` script in `index.html` sets `html.splash-handoff` so the first paint already matches). The splash ground grows out
of the tapped group card as the logo flies (`clip-path`, r20 → the screen's corners).

**Landing page** (`landing.html`, `js/landing.js`, docs/delight-plan.md Phase 5): a hero (lines rise once the splash
hands off), two drifting rows of each league's top-ranked teams (`js/draft-ranks.js`, crests from the pre-draft catalog), "Find your group",
the "How it works" scroll tour (`js/landing-explainer.js`), group cards, and a FAQ whose "Which sports do we play?"
answer is filled from `js/sports.js`. Everything the page says about sports and picks is the platform's standard setup
(`DEFAULT_CAPS` in `js/draft-rules.js`), which a commissioner can change; only the group cards are about real groups. The tour is a sticky mini screen with seven scenes, each a
pure function of scroll progress so it scrubs both ways: the desktop draft room (the mini screen turns into a browser
window at a made-up `yourfriends.boxscore.space`: the landing never shows a real group's address; the real clock card and a corner of the real board, `.dr-grid`, filling with picks across leagues until yours
lands), your board filling the standard setup's slots with crests, team pages swiping through three of your teams in three
leagues (each with its league's real Path to points, `pathToPointsHtml`), Scores (`gameCardHtml`), Chat, Points
(live → locked), and the season race (the Points tab's race card, `.race-*`, replaying to a finish between 80 and
110 points as the standings under it re-sort). The group cards wait for the fresh roster (`loadRoster(id, { fresh: true })`, same 1.5s cap) because the spots count is drawn once; a stale cache would show filled spots as open. Under it, "Your league, your rules" (`sportPicksHtml`) shows the standard setup's
sports with their picks each, and what a commissioner can change. Captions with counts follow the setup. Reduced motion: no
scrubbing; each scene shows its end state and the segments switch steps. Sections rise in the first time they're 35%
in view.

**PWA shell:** `manifest.json` + `sw.js` (network-first with a cached-shell fallback, so the app
still opens offline; a launch whose page takes over 3s runs wholly from the cache, never mixing versions) exist because this runs installed on iOS. `index.html`'s `.safe-area-top` fixed
div exists because the installed PWA's translucent status bar shows real page content through it —
a `position: fixed` cover is required there because sticky-positioned content (the Standings filter
row) can flash through a plain top-padding approach during iOS's scroll repaint.

**More news (Perigon, proof of concept):** a team page's News section shows ESPN headlines first, then up to four
"More news" stories from Perigon. Perigon's free tier (~150 calls/month) rules out per-team or per-view searches, so
`worker/news.js` runs from a daily cron (`[triggers]` in `wrangler.toml`): it walks 14 fixed search chunks round-robin,
4 per run (about every 3.5 days each). A chunk is one OR query of quoted full team names for a league
(`js/news-math.js` builds the names and chunks; the two college leagues share one bucket), with `category=Sports`.
Articles are matched back to teams by full name, or by a nickname no other team shares, then stored per league in
KV (`news@<league>`, newest 8 per team, 14 days). `news@meta` holds the cursor and this month's call count; every call
counts, failures included, and the batch stops at 140. Browsers read `GET /news/<league>` once per league
(`js/news-more.js`, 15 min). With no `PERIGON_API_KEY`, or an old worker, the section simply doesn't appear. Not
done yet: skipping out-of-season leagues, and Perigon's Monitors (webhook) as a way to spend fewer calls.
To run a batch by hand: `POST /news/refresh` with the commissioner password header (same budget rules); add `?reset=1` to clear stored stories first.
Matching is strict on purpose: Perigon returns every article that mentions a team anywhere, so a team counts only when its full name (or a unique nickname) is in the headline or description, or named twice in the summary. A single passing mention doesn't count.
