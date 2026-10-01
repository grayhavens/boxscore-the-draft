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

**Draft tests:** `node --test tests/draft-engine.test.mjs tests/draft-export.test.mjs tests/draft-sheets.test.mjs tests/draft-poll.test.mjs tests/draft-time-alert.test.mjs`
(`node --test tests/*.test.mjs` runs every pure-logic test, including `tests/web-push.test.mjs`)
(pure logic, no dependencies).
**Draft rehearsal:** `node tools/rehearse-draft.mjs --chaos 2` runs a full automated draft with injected
failures against a running `wrangler dev`; `--preflight` is the draft-morning smoke test. The commissioner's
step-by-step is `docs/draft-day-runbook.md`.
**Draft export:** `node tools/export-draft.mjs --dry-run` turns a finished draft room into the next season's
`js/seasons/<year>.js` (see the header of that script).
**Draft outlooks:** `js/draft-outlooks.js` holds the season outlooks on the draft room's team sheet, written by hand
or in a Claude Code session (no API key). `node tools/outlooks.mjs facts --league nfl` prints each team's ESPN facts;
`node tools/outlooks.mjs apply <file.json>` merges `{ "<poolId>": "text" }` into the next draft's class. Refresh before
each draft.
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
After deploying, `DASHBOARD_WORKER_BASE` in `js/worker-base.js` must point at the printed `*.workers.dev` URL.

**Static site deploy:** Cloudflare Pages auto-deploys from `main` — no local deploy command.

## Architecture

**Design tokens:** every color, type, radius, spacing, shadow and motion custom property lives in `css/tokens.css`
(loaded before `css/style.css` on every page), never in `style.css`. The spec it follows is `docs/design-system/`, and
the adoption plan, in step with `docs/motion-plan.md`, is `docs/design-system-plan.md`.

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
A group with `open: true` roster spots in `js/groups.js` shows there as a recruiting card (claim form with name and email, both required, no link into its app until its last spot is filled): `POST /claim` (`worker/claims.js`)
stores the request in KV, rate-limited per IP, with no push alert; instead it emails the platform admin (worker secret
`CLAIM_ALERT_EMAIL`, sent through Resend) who claimed and a link to `boxscore.space/admin?group=<id>`, which opens on that group. The admin page lists claims at the top: **Confirm**
(name editable first) gives the person the group's next open spot with no deploy, under that spot's id, in the
`roster@<group>` KV record (`worker/roster.js`). `applyRoster` in `js/groups.js` is how everything reads it: the
worker's chat/draft alerts, the landing count, and the app, where `js/roster.js` applies it at boot from `group.js`
(top-level await: instant from a localStorage copy, and only a device's first launch waits, up to 1.5s, on `GET
/roster`). Name pickers hide still-open spots. Undo frees a spot. **Deploy the worker first.** Code says "group" because "league" already
means EPL/NFL/etc. Worker state that belongs to a group — facts/adjustments/locks, favorites, activity, the
chat room, draft rooms, the commissioner password (`ADMIN_PASSWORD_<GROUP>` secret) — is keyed by the
`?group=` param the client adds (`withScopeQuery` / `withGroupQuery`); The Draft sends none and keeps its
original un-namespaced keys. localStorage isn't namespaced by group because each subdomain is its own
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
- **PGA Tour golf** (Season Ticket, `docs/golf-plan.md`): ESPN too. `js/golf.js` parses (shared with the worker),
  `js/golf-api.js` fetches. The worker's `/golf/season/<year>` (`worker/golf.js`) condenses finished FedEx Cup
  events into KV (`golf:<year>`) so phones never pull whole leaderboards; the live one comes straight from ESPN. Use
  the `site.web.api.espn.com` host: `site.api` answers 403 to the worker's requests. The draft pool's golfers are
  `js/golfers.js` (`node tools/golfer-pool.mjs`); a golfer is league `pga` with `espnAthleteId`, not a team id.
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

**Chat reactions** (Slack-style: several per person, one of each emoji): tapping a message opens a
row of the seven `REACTION_EMOJI` (👍 👎 😂 😮 😢 🔥 😎 — duplicated in `js/chat.js` and
`worker/chat-room.js`, and the worker rejects anything not in its copy); tapping a pill under a
message toggles your own. The client sends `{type:'react', from, messageId, emoji}` and the room
answers everyone with that message's full reaction set. Reactions live in their own SQLite table (not
on the message) since they change after it's sent, so the `history` frame always carries a snapshot
of every retained message's reactions — a reconnect (`?after=<lastId>`) fetches no old messages and
would otherwise never see a reaction added to one. **Deploy the worker before the static site:** an
old worker silently ignores `react` frames, so the buttons would do nothing.
The system admin page can delete a message for everyone: the room broadcasts `{type:'deleted', messageId}` and
keeps the deleted ids (pruned with the messages) in the `history` frame's `deleted` list, for the same reason, so a
device that was away drops its cached copy.

**Shared games in chat** (`js/game-card.js`, `worker/chat-game.js`): Game Details' "Share to chat" button posts the
game right away (no caption step) and jumps to the Chat tab. The message's `game` field is a snapshot of the game
at that moment (league, ESPN event id, state, status, both sides' team key/name/abbr/score), shown as a frozen card that
never changes. A small live line under it shows the game now, but only once the score or state has moved on. It
reads "Final" at the end and then stops. It's looked up from ESPN only while the Chat tab is open, at most once a minute
per game, and cached on the message (`m.gameNow`). The worker validates the snapshot (`parseGame`) and writes the
message's text itself (`gameText`), which older app versions show instead of the card and which is the alert body.
Tapping a card opens its Game Details; long-press (right-click on desktop) opens its reactions. **Deploy the worker
before the static site:** an old worker rejects a message with no text.

**Push alerts** (`js/push.js`, `worker/web-push.js`, the `push`/`notificationclick` handlers in `sw.js`):
Settings → Alerts lets each device opt into "My draft pick" (you went on the clock in a real, non-mock
draft room), "My points" and "Chat messages" (skipped for anyone with the app on screen: `js/chat.js` sends a
`presence` frame the chat room tracks per socket). "My points" (`worker/points-alert.js`, hidden before a group's
first draft) rides on the Activity PUT: once it lands, each drafter its new events touched gets one alert for the batch
(rank moves only for 1st place), opening Points → Activity. Standard Web Push with VAPID and aes128gcm written
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
room signs its socket in with the password saved there. At 900px and up that page is a full-screen sidebar shell (Draft, then one screen per
league, the `desk*` functions, with `?screen=<league>` in the URL and the phone tab bar hidden). The Draft screen leads with
a "Needs attention" list (a paused draft, a passed or near draft time with the lobby unready, a poll everyone answered,
a locked league with postseason rules nobody is marked for), flagged in the sidebar too. Under 900px it keeps the phone
column with a Draft/Scoring switch and league chips. Its writes (marks, adjustments, locks, the draft time and poll) carry
a `?note=` saying what changed (`withNote` in `js/utils.js`), and the worker adds that to the system admin log as
`Commissioner`; a write with no note isn't logged. **Deploy the worker first** (an old one ignores the note). See
`docs/draft-room-plan.md` for the design and phase status. **Deploy the worker before the static site.**
Settings' Draft tile offers Mock Draft (room `mock-1`) or Live Draft (`main`). Mock rooms (`isMockRoom`:
`mock`, `mock-*`) are self-serve — the worker signs every socket in as commissioner — and are the only
rooms that auto-pick: a Durable Object alarm drafts for bots after `config.botSeconds` and for anyone
whose clock runs out (`autoPickTeam`). The real room's clock stays soft.
**Auto-draft** works in both kinds of room: `state.autoDraft` lists drafters the worker picks for
`AUTO_DRAFT_SECONDS` (5s) after they go on the clock, from their queue or else the best team that fits, through the
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
only — see `getLeagueRuleTeams`). Every league is on this model; the older per-team
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
`js/league-facts.js`), so it always agrees with Live points. The team page's Overview has a section for the team, and a
drafter's Points breakdown lists their five closest calls. Clinched / out of reach / stuck / safe use games left and
ignore tiebreakers. Only for a league whose season is under way and not locked.

**League history** (`js/history.js`, `js/champions.js`, `worker/champions.js`): Points → History shows the newest
champion, every recorded season's final standings and an all-time table (titles, then top-3 finishes, then average
finish). It's hidden until the first season is recorded. The commissioner records the class being played, from today's
Points ranking, on Commissioner → History, which only appears once every league is locked (or a season is already
recorded). There's no form for seasons before the app (neither group wanted one); the worker and `js/champions.js`
still accept `source: 'manual'` if that comes back. `champions[@<group>]:seasons` in KV, `GET`/`PUT`/`DELETE /champions` (writes need the
commissioner password). Recording the app's season the first time alerts the whole group (every device with alerts
on), Home shows the champion for 21 days, and champions get a title tag on their Points sheet and breakdown.
**Deploy the worker first.**

**`PRIOR_SEASON_DISPLAY_LEAGUES` (MLB, WNBA):** these leagues' drafted teams don't start scoring
until each league's next season begins, but ESPN's live endpoints only ever return the season
actually being played right now. Until that next season starts, their Standings tab and team modals
show real, live, but non-scoring results — flagged with a shared `prior-season-note` (bold/accent
styling — this is easy to misread as counting if skimmed) rather than hiding the data. Their team
modals also suppress the season-phase badge (`In-Season`/`Pre-Season`/etc.) entirely, since showing
it would read as if the current season counts.

**Motion** (`js/motion.js`, `js/launch-splash.js`): tab switches slide toward the tapped tab and the team
page pushes in and pops back out, both on same-document View Transitions (`navigate(kind, update)`; `html[data-nav]` picks the keyframes in css/style.css). `switchView` and the
team page's open/back functions therefore apply their DOM change asynchronously, inside the transition. The
launch splash plays once per cold launch (sessionStorage `bx-splash`) and must stay the first thing in
`<body>`. `landing.html` plays the same splash (once per tab session), landing on its header logo. Everything falls back to the old instant switch without View Transitions or with reduced motion.
Opening a group from the landing page flies the landing logo to the center (`js/landing.js`, `#landing-handoff`)
and navigates with `#splash=handoff`; the group's splash then starts mid-timeline from that built mark (an inline
`<head>` script in `index.html` sets `html.splash-handoff` so the first paint already matches). The landing's "How
it works" card is `js/landing-explainer.js`.

**PWA shell:** `manifest.json` + `sw.js` (network-first with a cached-shell fallback, so the app
still opens offline) exist because this runs installed on iOS. `index.html`'s `.safe-area-top` fixed
div exists because the installed PWA's translucent status bar shows real page content through it —
a `position: fixed` cover is required there because sticky-positioned content (the Standings filter
row) can flash through a plain top-padding approach during iOS's scroll repaint.
