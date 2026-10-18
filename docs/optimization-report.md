# Optimization report

Findings for `docs/optimization-plan.md`, one section per phase, measured 2026-10-17 and 18 on `main` at `2630f2b`.
The status after the Top 10 shipped comes first, then the Top 10 and the build-step decision. Each item links back
to its phase's table as P*n*-#.

## Status after the Top 10 (2026-10-18)

All of the Top 10 is merged and deployed: the site from `main` at `1b1205b` (`APP_VERSION` 2026.10.18-10,
`CACHE_NAME` boxscore-v119), the worker as version `cec7d1c4`. Two fixes found along the way shipped too. Reviewed the
same day by re-running Phase 0 and Phase 1's measurements, and by checking the changes together in the browser.

### What shipped

| Top 10 | PR | What it does now |
|---|---|---|
| 1 | #301 | A failed schedule fetch keeps the team's last saved schedule; offline team pages no longer say "Season complete". |
| 2 | #302 | No KV write when nothing changed: the app skips the Activity PUT, the worker skips an unchanged Race sample. Worker deployed. |
| 3 | #303 | `tests/launch-graph.test.mjs` holds the launch to 115 modules / 1,700 KB / 5 round trips and checks `SHELL_FILES`. |
| 4 | #310 | `modulepreload` for every launch module on repeat launches (111 hints), generated and test-checked. |
| 5 | #305 | Scores says "Can't reach scores right now" instead of "Nothing scheduled", keeps the last good games, and labels an old copy "Updated 9:36 AM". |
| 6, 7 | #306 | Scoreboards refresh every minute only near live or imminent games (else up to 15 min); team schedules every 5 min near a game, else 30. |
| 8 | #307 | Every sheet is a labelled dialog: focus moves in and back, the page behind is inert. |
| 9 | #308 | Home rows and Scores cards are buttons for VoiceOver and keyboards; the favorite mark has `role="img"`. |
| 10 | #309 | Bigger tap areas for filter tabs, the gear, the scope chip, crests and "Full schedule". |
| Found on the way | #300 | NDSU's record comes from the CORS-open team schedule (ESPN dropped CORS on the team endpoint). |
| Found on the way | #304 | The UEFA table, playoff and bowl answers keep their last good copy, so an offline team page no longer reads 0-0-0, 1st. |

### Before and after

| | Before (`2630f2b`) | After (`1b1205b`) | How measured |
|---|---|---|---|
| Launch modules (The Draft) | 108, 1,618 KB, 5 deep | 112, 1,638 KB, 5 deep (+111 preload hints on repeat launches) | `node tools/launch-graph.mjs` |
| `SHELL_FILES` | 152, 3,105 KB, checked by nothing | 156, 3,133 KB, checked by a test | test / tool |
| Tests | 51 files, 447 | 57 files, 492 | `node --test tests/*.test.mjs` |
| Repeat-launch LCP, Lighthouse (real throttling) | 6.6 s | 5.7–6.0 s | baseline and `main` run back to back, same conditions |
| Repeat-launch blocking time | 748 ms | 324–466 ms | same runs |
| Home's first render (one task) | 403 ms | 240–336 ms | same runs |
| First-visit LCP / FCP | 6.7–8.4 s / ~2.0 s | 6.6–8.3 s / ~2.0 s | same runs: unchanged, as intended |
| Accessibility (Lighthouse) | 96 with a favorite showing | 100, no failing audits | simulated runs |
| ESPN scoreboard requests, open app, two leagues live | 8 a minute | 2 a minute | browser, 74 s window |
| KV writes for a visit where nothing changed | 2 | 0 | `wrangler dev`, local KV |
| Scores offline | "Nothing scheduled" | "Can't reach scores right now", or the last games with "Updated …" | browser, fetch blocked |
| Team page offline | "Season complete", no games, 0-0-0 · 1st | last saved schedule and record | browser, fetch blocked |

The Lighthouse samples are small (several runs failed under machine load), and the lab still can't measure a truly
cached launch (Phase 1's correction). So read the LCP and blocking-time rows as "no worse, probably better". An
earlier same-day run showed blocking time doubling. That came from the machine being busy (load average ~8), and it
went away when the two versions ran back to back.

### Review findings

- **Working together:** on `main`, Enter on a focused Scores card opens Game details as a labelled dialog with focus
  inside and the page inert, and closing it puts focus back on the card with nothing left inert (#307 + #308).
- **New, small:** the Game details sheet's label reads "Bears21 Falcons7". `markDialog` (`js/sheet.js`) takes the
  first `*-title` element, which here is score markup whose parts have no spaces between them. Join the label's text
  pieces with spaces (or give the sheet a plain title).
- **Close to budget:** the launch is 112 of 115 modules. The next new launch module should come with a reason, or
  with something moved to first use.
- **Pages builds:** Cloudflare Pages made 25 deployments in three hours today (every PR push and merge). The 500-a-month
  cap is a real risk on a heavy PR day; see "Next".
- **GitHub Pages** is still publishing the repo (125 builds since 2026-10-01).

### Still unmeasured (needs the iPhone)

- **Repeat-launch time** with the hints (#310): close the app fully, reopen it from the Home Screen on cellular. A
  device needs one launch of the new version first, since hints start on the second.
- **VoiceOver** on a sheet (swipe should stay inside it) and on Home rows and Scores cards.
- **The light-theme status bar** (P2-8): are the clock and battery readable?
- **The build-step decision** waits on the repeat-launch timing.

### Next

My order for the next round. Each is small unless marked, fits the free tiers, and changes no written decision.

| # | What | From | Why now |
|---|------|------|---------|
| 1 | **iPhone check** (no code): repeat-launch timing, VoiceOver, light-theme status bar | above | Decides the build step, confirms #307/#308 with real VoiceOver, settles P2-8. |
| 2 | **Pages build controls** (settings, no code): build watch paths that skip `docs/**`, `tests/**`, `tools/**`, `.github/**`; turn off GitHub Pages | P1 noticed | 25 deployments in three hours today; past 500 a month, deploys stop until the month resets. |
| 3 | **Updates while open**: `registration.update()` on return after 30+ min, reload at a safe moment; on a failed lazy import, offer a reload | P4-2, P4-3 | Ten deploys landed today. An app left open runs old code for hours, and a lazy load across a deploy can fail for good. |
| 4 | **Light-theme contrast**: darken `--live`, `--win`, `--loss`, `--provisional` (light values only) to 4.5:1, with a contrast check in the token test | P2-5 | The "LIVE" label and results are 3.3–4.3:1 in light theme. |
| 5 | **Small polish**: the dialog label fix above; move tips off the back link | review, P2-7 | Both are one-liners on screens people use daily. |
| 6 | **Home offline line**: "Offline · updated 4:12 PM" under the title after a failed refresh | P2-10 | Scores and the team page now say when they're stale; Home is the last view that doesn't. |
| 7 | **Self-host the two fonts** (~46 KB), precached | P1-3 | One less third-party, render-blocking request on first launch, and the fonts work offline. Note it in `CLAUDE.md`'s stack line. |
| 8 | **First-visit layout shift** (M): reserve the Home stack's height | P1-4 | CLS 0.12–0.22 on a first visit, the first impression. |
| 9 | **Lower priority:** Season Ticket's class preload (P1-7), MLB's double schedule fetch (P3-4), mention badge (P4-4), manifest text and per-group title (P4-5), caching upstream errors briefly (P3-6), one `/league-state` route (P3-5) | various | Real but small. Batch a few into one session. |
| 10 | **Before the August 2027 drafts:** move the draft room's league colors to tokens with light-theme values (P2-9) | P2-9 | Only matters on draft day; rehearse per `docs/draft-day-runbook.md`. |

**Build step:** still "not yet". Decide after #1's repeat-launch timing. If launches still feel slow with the hints,
a bundled build is the next lever (Phase 1 has the comparison).

## Top 10

In the order I'd build them: two bugs and a free-tier risk first, then the launch-speed win, then the friction on
Home, Scores and the team page. All fit the free tiers, none changes a written decision, and each is one branch and
PR.

| # | What | From | Why this, here |
|---|------|------|----------------|
| 1 | Stop a failed schedule fetch from overwriting the cached one | P4-1 | A few seconds without signal blanks Home's next games and makes team pages say "Season complete". Small fix, and it removes most of P2-2. |
| 2 | Skip Activity and Race writes when nothing changed (worker first, then site) | P3-1 | KV's free 1,000 writes a day is within reach on a heavy weekend; past it, Activity, Race and points alerts silently stop. |
| 3 | One launch-graph test: budget, `SHELL_FILES`, hint list | P1-2 | Cheap. It keeps #4 correct and stops the lazy-load work from slipping back. |
| 4 | `modulepreload` hints on repeat launches | P1-1 | Starts the module chain ~3 s sooner. Its LCP effect can't be shown in the lab (see the correction in Phase 1), so it's a draft until an iPhone check. |
| 5 | Scores: "couldn't load" vs "no games" | P2-1 | The most-used view says "Nothing scheduled" on a 19-game Sunday whenever ESPN is slow or the phone is offline. |
| 6 | Slow the scoreboard sweep for leagues with nothing live or starting soon | P3-2 | About 8 → 1–2 requests a minute off-peak, for battery and data, with no lag on live games. |
| 7 | Slow the team rotation for teams with no game near | P3-3 | About 10 → 2 requests a minute, and most of the JSON parsing. Keeps the 5-minute cycle around games. |
| 8 | Sheets as real dialogs: role, focus in and back, `inert` behind | P2-3 | VoiceOver can't tell a sheet opened today. One change in `js/sheet.js` covers every sheet. |
| 9 | Home rows and Scores cards as buttons | P2-4 | Two helpers in `js/ui.js` cover every row: VoiceOver names them, keyboards reach them. Fold in P1-5's `role="img"` (one line, Accessibility 100). |
| 10 | Touch targets: filter tabs, gear, scope chip, crests | P2-6 | Missed taps on the two busiest screens ("All" is 17 px wide), fixed in CSS alone. |

**Shipped 2026-10-18** (see "Status after the Top 10" above for PRs and results). The original follow-ups and checks are
kept below as written; "Next" above replaces them.

**Check first (settings and a phone, not code):**
- **KV writes per day** in the Cloudflare dashboard. If a recent weekend day hit 1,000, #2 goes first.
- **Pages builds this month** in the dashboard. It's roughly 450+ a month against a 500 cap. Build watch paths that
  skip `docs/**`, `tests/**` and `tools/**` would cut it.
- **GitHub Pages** is publishing a second copy of the repo (`grayhavens.github.io/boxscore-the-draft/`). Turn it off in
  the repo settings if it isn't wanted.
- **On the iPhone:** the light-theme status bar (P2-8), and a warm-launch timing before and after #4.

## Build step: not yet; decide after an iPhone measurement

> **Corrected 2026-10-18.** This section first said "no" on the strength of the hints' "1.6 s" warm LCP. That number
> was a measurement artifact (see the correction at the top of Phase 1). Lighthouse's "warm" runs had no working cache,
> so they measured bandwidth, not round trips, and in that setting the bundle's fewer bytes win.

**Recommendation: keep "no build" (`docs/DECISIONS.md`) for now, and decide with a phone measurement.** A real repeat
launch reads the scripts from the service worker's cache or as 304s, so its cost is round trips (what #4 removes),
not bytes (what a bundle removes). Time a repeat launch on an iPhone with #4's preview. If it's still slow, the bundle
is the next lever. Lab numbers, real throttling (150 ms round trip, 1.6 Mbps, 4× CPU), median of 5 (3 for the hints as
built):

| | Warm LCP | Cold LCP | Launch JS (compressed) | Adds to every deploy |
|---|---|---|---|---|
| Today | 6.5 s | 6.8 s | 466 KB, 108 files | — |
| (a) No build: hints + test (#3, #4) | 6.2–7.1 s (no lab gain; the lab can't show a cached launch) | 6.8 s (unchanged by design) | 466 KB, 108 files | Nothing |
| (b) esbuild bundle + minify | 4.3 s | 6.1 s | 165 KB, 5 files | A build on Pages or in Actions, source maps; breaks `import.meta.url` paths and the unbuilt sharing with the worker and tests |
| (c) Build + Workbox | not built | — | like (b) | (b) plus `node_modules` and a rewritten service worker |

In the lab, (b) wins because the lab re-downloads everything. On a phone the question is whether round trips or bytes
dominate a cached launch, and only the phone can answer it. The free tier doesn't decide it: Pages already builds on
every push, so a build step adds time, not builds. Details are in Phase 1.

## Phase 0: Baseline

Measured 2026-10-17 on `main` at `2630f2b`. No recommendations in this phase. Sizes are bytes on disk, before
compression. Browser numbers come from Chrome in the desktop app's preview pane (375×812, served by
`python3 -m http.server` on localhost, no throttling), so they're for comparing later runs only. They aren't what a
phone sees.

### Launch cost per group

Walked from `js/board.js`'s static imports (`import` / `export … from`; dynamic `import()` left out).

| | The Draft | Season Ticket |
|---|---|---|
| JS modules at launch | 108 files, 1,618 KB | 110 files, 1,693 KB |
| Import depth (round trips to the last module) | 5 | 7 |
| Plus classic scripts | `js/launch-splash.js` (10 KB), `js/page-header.js` (5 KB) | same |
| Plus CSS | `css/tokens.css` 18 KB, `css/style.css` 390 KB | same |
| Plus `index.html` | 18 KB | same |

- **The Draft: 108 files, 1,618 KB.** The lazy-load plan measured 108 files / 1,590 KB on 2026-10-16. The 28 KB
  difference is a day of feature work on the same file set.
- **Season Ticket adds two files, 75 KB** (`js/seasons/seasonticket.js` and `seasonticket-2026.js`). They load
  through a top-level `await import()` in `js/seasons/index.js`. That only runs after the whole static graph has
  arrived and started evaluating, so it's two **extra round trips at the end** of launch (depths 6 and 7), not a
  parallel fetch.
- **Modules per depth (The Draft):** 1 / 52 / 39 / 12 / 4. Half the graph is found after the first round trip. The
  last four, at depth 5, include `js/seasons/2026.js` (80 KB).
- **Biggest at launch:** `team-page.js` 143 KB, `espn.js` 109 KB, `live-data.js` 99 KB, `seasons/2026.js` 80 KB,
  `board.js` 74 KB, `postseason.js` 63 KB, `overall.js` 54 KB, `ui.js` 49 KB, `golf-view.js` 43 KB,
  `postseason-math.js` 41 KB.
- **All JS in `js/`:** 128 files, about 2,590 KB. Launch loads 84% of the files and 62% of the bytes.
- **No `modulepreload` hints for the launch graph.** The only `modulepreload` links are added at idle for the
  draft room and console (`js/board.js:1058`).

### `css/style.css`

- **8,657 lines, 390 KB** (398,862 bytes), about 3,060 rules and 92 `@media` blocks. `CLAUDE.md` still says
  "~7,000 lines".
- **Home uses about 6% of it:** 180 of 3,062 rules (7% of rule text) matched an element on The Draft's Home after
  load, 747 DOM nodes. It's a rough count: rules for states not on screen (a live game, hover, an open sheet) don't
  match, and Home's real share is somewhat higher. Measured by checking every rule's selector against the page.
- Both stylesheets are render-blocking `<link>`s in `<head>`.

### Fonts

- One Google Fonts stylesheet (`index.html:26`) requests Space Grotesk 500/600/700 and Manrope 400/500/600/700/800
  with `display=swap`, plus `preconnect` to both Google hosts.
- The warm load fetched 1 stylesheet and 2 font files from Google (variable fonts, one per family). That's three
  third-party requests, and the service worker doesn't touch them.
- The CSS uses weights 500 (27 places), 600 (129), 700 (260) and 800 (74). Which family each one lands on is
  Phase 1's job.

### Service worker (`sw.js`, `CACHE_NAME = boxscore-v109`)

- **Install:** `cache.addAll(SHELL_FILES)`, **152 entries, 3,105 KB**. That's every launch module, the CSS,
  `index.html`, the manifest, 25 icons and artwork files (561 KB), and the on-demand modules. Then `skipWaiting()`.
  **Activate:** deletes every other cache, then `clients.claim()`.
- **Each launch (network-first):** the page waits up to `NAV_TIMEOUT_MS` (3 s) for the network. If it's slower,
  that page and every file it later loads come from the cache (`cacheOnlyClients`, saved in the cache because iOS
  stops idle workers), so new and old files never mix. Otherwise every same-origin GET goes to the network first,
  and the reply is written back into the cache. Other origins (ESPN, the worker, Google Fonts, KLIPY) aren't
  intercepted.
- **Warm launch, measured:** 206 requests in the first 8 s. 117 were same-origin, all passed through the service
  worker and on to the network (112 JS). The rest: 28 ESPN API, 20 ESPN images, 22 deployed worker, 9 TheSportsDB
  images, 3 Google Fonts and 7 to `localhost:8787` (no `wrangler dev` running, so they failed). The last local
  module finished at 1.24 s and first paint came at 1.6 s, on localhost with no throttling.
- **The shell list matches the graph today:** every launch module is in `SHELL_FILES`, and every JS file in it is
  either in the launch graph, on-demand, or one of the two classic scripts. On-demand modules in the install set:
  the draft room (8 files, 265 KB with `draft-outlooks.js`), the console (91 KB), the guide's stills (36 KB) and
  Season Ticket's class (76 KB, cached for The Draft's members too). Not in it: `js/seasons/espn-teams.js`. No test
  checks any of this; the list is kept by hand.
- **Biggest images in the install set:** `march-madness.png` 129 KB, `mlb-postseason-light.png` 52 KB,
  `mlb-postseason-dark.png` 45 KB, `major-open-light.png` 44 KB. Every member downloads both themes of every one.
- **Push:** every push shows a notification. Chat and mentions stack into "N new …" and chat sets the app badge.

### Timers and refresh loops (the app, not the draft room)

| Loop | Where | Every | What it does | While hidden | Slows down when nothing's live |
|---|---|---|---|---|---|
| Team rotation | `js/board.js:1392` | 1.5 s | Fetches the visible team whose last full fetch is oldest, once it's 5 min old (`MIN_REFRESH_CYCLE_MS`); most ticks fetch nothing | Timer fires, tick returns at once (`paintingLoop`) | No |
| Live sweep | `js/board.js:1402` | 20 s | Reads every league's ESPN scoreboard (7 sport paths) through a 60 s cache, plus golf; patches live scores | Timer fires, tick skipped; runs at once on return | No: up to 7 requests a minute all day |
| Standings | `js/board.js:1352` | 15 min | Every league's standings and season phase | Skipped | No (15 min is already slow) |
| Chat ping | `js/chat.js:261` | 20 s | `ping` on the open socket; reconnects after 50 s of silence | Keeps sending while the socket's open | — |
| Chat games | `js/chat.js:801` | 20 s | Shared game cards, each looked up at most once a minute | Only while Chat is open | — |
| Draft status | `js/draft-schedule.js:171` | 5 min (+1 min tick, no fetch) | Live room's status for Home's draft card | Skipped | — |
| Live draft banner | `js/draft-live.js:90` | 20 s live, 90 s idle | Room status (edge-cached 5 s) | Stops; resumes on return | Yes |
| Wide rail | `js/wide.js:224` | 30 s | Repaints the desktop rail | Skipped | — |
| Last season's copy | `js/season-background.js:128` | Once, 20 s after launch, and on each return | Runs the hidden `?bg=1` copy until its summary is in | — | — |

- The hidden copy and the robot visit (`IS_SEASON_BACKGROUND`) start none of the board loops.
- The draft room adds a 25 s socket ping (`js/draft-client.js:170`) and a 250 ms clock tick while it's open.

### Worker

- **Edge-cache TTLs (`CACHE_TTL_SECONDS`, `worker/rundown-proxy.js:332`):** TheRundown events 60 s, teams 1 h;
  TheSportsDB team 24 h, schedule 60 s; nflverse injuries 2 h, depth chart 3 h; NHL score 5 min. Elsewhere: golf
  season 10 min (15 s while incomplete), calendar 6 h, leaderboard 2 min, news 30 min (`worker/golf.js:44`); Perigon
  6 h (`worker/news.js:44`); draft status 5 s (`rundown-proxy.js:865`).
- **Routes:** `/api/admin/*` (Access-protected, also on `boxscore.space`), `/interest`; group routes
  `/admin/verify`, `/access/check`, `/activity`, `/points/history`, `/chat/ws`, `/draft/{ws,result,status,schedule,
  poll,vote}`, `/push/{config,device,test}`, `/gif/config`, `/claim`, `/roster`, `/sports`, `/champions`,
  `/news/*`; upstream proxies `/sportsdb/*`, `/nflverse/{injuries,depth-chart}`, `/nhl/score/*`, `/golf/season/*`,
  `/golf/news`, `/teams/*`; anything else goes to TheRundown events.
- **Cron:** once a day at 11:17 UTC (Perigon news refresh and the ESPN probe).
- **Durable Objects:** both `ChatRoom` and `DraftRoom` use the hibernation API (`ctx.acceptWebSocket`) with
  `setWebSocketAutoResponse('ping' → 'pong')`. The 20–25 s client pings are answered without waking the object.
  `DraftRoom` sets one storage alarm, at the on-the-clock drafter's auto-pick deadline, and deletes it when no clock
  is running. `ChatRoom` sets no alarms.

### Tests and checks today

- `node --test tests/*.test.mjs`: **51 files, 447 tests, all pass, 5.4 s** (Node 24.21.0).
- `tests/design-tokens.test.mjs` is the only style check.
- The daily robot visit (`.github/workflows/daily-scoring.yml`): 13:30 UTC, one job per group (`thedraft`,
  `seasonticket`), Playwright on Node 24, 15-minute limit.
- **No performance checks:** no Lighthouse run, no launch-size budget, and no test that `SHELL_FILES` matches the
  import graph.

### Things worth knowing for later phases

- A local preview isn't fully isolated. Activity, push, chat, claims and roster go to `localhost:8787`, but every
  read and the rest go to the deployed worker. A Pages preview sends everything to the deployed worker.
- The browser numbers above come from desktop Chrome on localhost. Phase 1 adds throttled mobile Lighthouse runs,
  and the iPhone check at the end is still the real test.

## Phase 1: Launch speed

> **Correction, 2026-10-18 (while building Top 10 #4).** The "warm LCP 6.5 s → 1.6 s" result below is a measurement
> artifact. Every "warm" Lighthouse run of today's code re-downloaded all ~514 KB of scripts, so those runs had no
> working cache and weren't warm. The hints variant that scored 1.6 s showed **0 KB** for its preloaded scripts, which
> means they skipped the throttled network. Built for real (#310), the hints do fire (the deepest module is requested
> at 2.0 s instead of 5.3 s), but lab LCP stays at 6.2–7.1 s, because a cacheless lab run is limited by bandwidth. A
> real repeat launch is limited by round trips, which the hints cut, but only a phone can show how much. The simulated
> and devtools numbers below are kept as measured, with the 1.6 s row marked.

**On a warm launch, the module chain is round trips.** The service worker asks Cloudflare about all 117 shell files,
each answered 304, and the app only learns of each module after its parent arrives (five levels deep). `modulepreload`
hints ask for them all at once. How much that saves on a phone is still to be measured (see the correction). The
build-step decision waits on the same measurement.

Measured 2026-10-17/18 on `main` at `2630f2b`, with Lighthouse 12.8.2, mobile profile. Each variant was a throwaway
copy in a scratch folder, so nothing in the repo changed. Served from a local Node server that copies Pages' behavior:
HTTP/2, brotli, `Cache-Control: public, max-age=0, must-revalidate` and ETag/304, checked against production's
headers. Runs used The Draft on localhost with no invite code. Over HTTPS the deployed worker refuses the origin (CORS),
so its reads failed in those runs, and the `/activity` write went to an empty port 8787. One extra plain-HTTP run with
the worker's data shows the difference.

### Method notes (read before trusting a number)

- **Two throttling modes, and they disagree.** Lighthouse's default *simulated* mode (Lantern) replays a fast load
  through a model. It credited the bundle with warm LCP 1.4 s and the no-splash load with 1.5 s. *Devtools* mode
  really adds 150 ms to every request and slows the network and CPU. In devtools mode neither held up. Devtools mode is
  closer to a phone on cellular for this app's problem (round trips), so **its numbers carry the decisions below**.
  The simulated ones are listed for completeness.
- **The splash isn't the cost.** In simulated mode, turning it off (reduced motion) looked like a 4 s win. In devtools
  mode it made no difference (warm LCP 6.3 s without it, 6.5 s with).
- **Lighthouse can't see a service-worker cache win.** A cache-first prototype (the shell straight from the cache,
  nothing asked of the network) measured the same as today (warm LCP 6.3 s). Devtools throttling delays every request,
  including ones the service worker answers from its cache. Phase 4's question (serve the shell from the cache?) has
  to be measured on the iPhone.
- **Noise:** ESPN's live data is part of every run, and one run in five is often an outlier (up to 11.5 s). Medians of
  5 runs (devtools) or 3 (simulated). A difference under about 0.5 s is noise.
- LCP is always the "English Premier League" heading on Home, painted under the splash. INP needs a real tap, so it
  wasn't measured; TBT stands in.

### Results

Devtools throttling (150 ms round trip, 1.6 Mbps, 4× CPU), median of 5:

| Variant | Cold perf | Cold FCP | Cold LCP | Warm perf | Warm FCP | Warm LCP | Warm TBT |
|---|---|---|---|---|---|---|---|
| Today | 42 | 1.9 s | 6.8 s | 57 | 1.9 s | **6.5 s** | 545 ms |
| Today, no splash | 43 | 2.0 s | 6.7 s | 52 | 1.9 s | 6.3 s | 781 ms |
| (a) Hints in `<head>`, after the CSS | 51 | 4.8 s | 8.2 s¹ | 75 | 0.8 s | 2.1 s | 943 ms |
| (a) Hints just before `board.js` (artifact, see the correction) | 41 | 4.8 s | 5.5 s | 83 | 0.9 s | 1.6 s | 482 ms |
| (a) As built in #310: script-added, repeat launches only, 3 runs | 33–38 | 2.0 s | 7.3–11.1 s | 43–56 | 2.0 s | 6.2–7.1 s | — |
| (b) esbuild bundle + minify | 52 | 1.9 s | 6.1 s² | 66 | 1.8 s | 4.3 s | 569 ms |
| (b) Bundle + minify, no splash | 63 | 1.8 s | 4.1 s | 75 | 1.8 s | 3.8 s | 434 ms |
| Cache-first service worker | 49 | 1.9 s | 6.6 s | 63 | 1.9 s | 6.3 s | 349 ms |

¹ 4 runs (one failed). ² 3 runs (two failed).

Warm LCP per run, hints before `board.js`: 1.4, 1.5, 1.6, 2.0, 2.3 s. Today: 6.3, 6.4, 6.4, 6.5, 9.3 s.

Simulated throttling (Lighthouse's default), median of 3. Accessibility was 100 in all of these:

| Variant | Cold perf / LCP | Warm perf / LCP | Warm TBT |
|---|---|---|---|
| Today | 55 / 6.2 s | 66 / 5.4 s | 370 ms |
| Today, plain HTTP with the worker's data | 58 / 7.1 s | 84 / 4.3 s | 131 ms (Accessibility 96, see #5) |
| Hints in `<head>`, before the CSS | 41 / 9.6 s | 83 / 2.3 s | 508 ms |
| Bundle (not minified) | 68 / 4.3 s | 91 / 2.1 s | 315 ms |
| Bundle + minify | 58 / 4.8 s | 99 / 1.4 s | 126 ms |

**The cold cost of hints.** With all 107 hints, a first visit's first paint (the splash) goes from 1.9 s to 4.8 s.
The browser's preload scanner finds the hints wherever they sit and starts 466 KB of compressed JS, which crowds out
the CSS, fonts and splash script on a slow link. A warm launch has no such problem, since its requests are 304s with
almost no body. Recommendation #1 below adds the hints only on a launch the service worker controls. The cold path
then stays as it is today (not measured in that form yet; the PR measures it).

### Recommendations

| # | Area | What I found (file:line) | Recommendation | Impact | Effort | Risk / what could break | Free tier? |
|---|------|--------------------------|----------------|--------|--------|-------------------------|------------|
| 1 | Module waterfall | Launch graph is 108 modules, five levels deep, found one level at a time (`index.html:323`). A warm launch makes ~117 revalidations (304s) in that order. | Add `<link rel="modulepreload">` for every launch module, deepest first, from a small inline script in `index.html` that runs only when `navigator.serviceWorker.controller` is set (warm launches). Keep the list in a generated block written by a new `node tools/launch-hints.mjs`. | H expected on a phone (cuts the five-round-trip chain to about one), unproven in the lab (see the correction) | S | A stale list preloads a file that's gone (a wasted request) or misses a new one (no worse than today); #2's test catches both. Cold path unchanged by design. | Yes: same requests, sent sooner. No new worker or Pages usage. |
| 2 | Keeping it fast | Nothing checks launch size, `SHELL_FILES` or hints today. | One Node test that walks `js/board.js`'s static imports and fails when: launch exceeds a budget (start at 115 files / 1,700 KB for The Draft; today 108 / 1,618), a launch module is missing from `SHELL_FILES`, `SHELL_FILES` names a missing file, or #1's hint list differs from the graph. Same style as `tests/design-tokens.test.mjs`. | H (keeps #1 and the lazy-load work from slipping) | S | A deliberate new launch module means raising the budget in the same PR, by design. | Yes (local test) |
| 3 | Fonts | One render-blocking Google stylesheet (`index.html:26`) plus two more origins on a cold launch. Lighthouse flags it at ~840 ms (simulated). Fonts aren't in the service worker cache, so offline launches lose them unless the HTTP cache still has them. | Self-host the two latin variable `woff2` files (Manrope 24 KB, Space Grotesk 22 KB), `@font-face` in `css/style.css` with `font-display: swap`, add them to `SHELL_FILES`, preload them. Add latin-ext (15 + 19 KB) only if names need it. | M (cold launch and offline) | S | Font licence is OFL, so files may be shipped. Needs a `CACHE_NAME` bump. `CLAUDE.md`'s stack line ("Google Fonts") changes, but that's a description, not a decision. `js/welcome-template.js:54` (email) keeps Google. | Yes: ~46 KB more in Pages assets, far under limits |
| 4 | First-visit layout shift | CLS 0.12–0.22 on a cold load: `#leagues` moves down twice as the cards above it (postseason, "More right now") arrive. Warm launches: 0. | Reserve the Home stack's height from the last known stack (already in `localStorage` on warm) or a skeleton of the right height on first visit. | M (first impression; CLS "good" is < 0.1) | M | A wrong reserved height leaves a gap that then closes, which is still a shift. Test with and without a postseason. | Yes |
| 5 | Accessibility | Only failure in any run: the favorite mark on Home is a `<span>` with `aria-label` and no role (`js/favorites.js:124`), so Accessibility 96 whenever a favorite shows. | Add `role="img"`. | M (gets Accessibility to 100) | S | None | Yes |
| 6 | Home's first render | One 250–500 ms task in `board.js` paints all of Home at once (4× CPU), the biggest part of warm TBT (480–550 ms). | Paint the rows on screen first and the rest in the next frame or at idle. | M (TBT, and how soon a first tap responds) | M | Ordering bugs with View Transitions (`switchView`) and "Since last time" waiting on rows. Gate and test with reduced motion. | Yes |
| 7 | Season Ticket | Its class loads through a top-level `await import()` in `js/seasons/index.js:40`, which only starts after the whole graph has run: 2 extra round trips at the end of launch (depths 6–7). | Have #1's inline script also preload `js/seasons/<group>.js` for a non-legacy group, taking the id from the hostname the way `js/groups.js` does. A wrong guess costs one 404. | M (Season Ticket only) | S | Must not hardcode group ids in HTML (`CLAUDE.md` data rule); derive from the hostname. | Yes |
| 8 | Boot-time style work | `js/sheet.js` is charged 280–400 ms at boot with ~2 ms of script, which usually means a forced style/layout pass. `style.css` has 21 `:has()` rules. Not pinned down. | Take one Safari or Chrome performance trace of a warm launch before changing anything. | L until confirmed | S (to look) | — | Yes |

**Changes a decision:** none of these. The build step, which would, is written up next and not recommended.

### Build step: recommendation, no

| | (a) No build: hints + test | (b) Bundle + minify (esbuild) | (c) Build + Workbox (`vite-plugin-pwa`) |
|---|---|---|---|
| Warm LCP (devtools, cacheless) | 6.2–7.1 s as built (1.6 s was an artifact) | 4.3 s | not built; expect (b) plus a different SW |
| Cold LCP (devtools) | 6.8 s (unchanged, by design) | 6.1 s (3 runs) | — |
| Launch JS, compressed | 466 KB, 108 files | 165 KB, 5 files (629 KB raw) | similar to (b) |
| Where (b)'s bytes go | — | 30% of `js/` is comments; bundling alone drops them (1,618 → 1,029 KB raw) | — |
| Adds to every deploy | Nothing (a tool run when imports change, enforced by the test) | A build command on Pages or in Actions; `jsb/` output; source maps for phone debugging | Plus `node_modules`, a `package.json`, Vite config, Workbox's SW instead of `sw.js` |
| What it breaks | Nothing found | Paths built from `import.meta.url` (the draft room's idle preload 404'd in the prototype, `js/board.js:1070`); worker and Node tests still import source, so two shapes of the same code; `SHELL_FILES` must be generated; `?bg=1` and the robot visit load built output; stack traces on a phone point into a bundle | All of (b), plus push, stacking and the 3 s cache-only launch in `sw.js` rewritten in Workbox terms |

**Why not yet** (corrected 2026-10-18: this paragraph first said (a) beats (b) on the warm launch, on the strength of
the artifact). On a real repeat launch the bytes are cached, so (a)'s fewer round trips should matter more than (b)'s
fewer bytes, but that's unmeasured. (b) wins only on bytes and the first-ever launch. Those are a one-time 300 KB on install and, after each
deploy, the changed files. Neither is felt the way 117 round trips are. (b) would also give up the shared-source
design (`js/groups.js`, `js/draft-*.js` imported by the worker and tests unbuilt) or keep two shapes of the same code.
(c) adds a dependency and replaces a service worker whose push and cache-only rules were built by hand on purpose.
Revisit only if #1 ships and the iPhone check still shows a slow warm launch.

**Free tier, for any build:**
- **Cloudflare Pages Free** (docs, read 2026-10-18): 500 builds a month, 1 at a time, 20-minute timeout, 20,000 files
  per site, 25 MiB per file. An esbuild run takes under a second, so time isn't the issue.
- **The build count is.** Deployments already happen on every push. 231 PRs were opened in the last 30 days, and the
  last 25 deployments span about a day and a half. That's roughly 450+ builds a month today, close to 500 with
  or without a build step. The docs don't say what happens at the cap, or whether a push skipped by build watch paths
  counts. **Check the month's count in the Pages dashboard.**
- **Building in GitHub Actions** and uploading with `wrangler pages deploy` would avoid Pages builds. Actions minutes
  are free for this public repo. The docs don't say whether direct uploads count toward the 500; unverified.

### Targets

- **Repeat-launch time on an iPhone**, before and after #4 (#310). The lab can't measure a cached launch, so drop the
  lab "warm LCP" target.
- **Accessibility 100** (#5 is the only failure).
- **Performance ≥ 90 on a warm launch** isn't reachable with hints alone in this setup (83). The rest is TBT from
  Home's first render (#6). Treat 90 as a stretch goal that #6 might reach.
- Keep them with #2's test. A Lighthouse run in CI isn't worth it: its run-to-run spread here was 1–3 s.

### Noticed in passing (not launch speed)

- **ESPN's single-team endpoint dropped CORS.** `…/college-football/teams/2449?enable=record` (`js/espn.js:757`, the
  NDSU record) answers without `Access-Control-Allow-Origin` on both `site.api` and `site.web.api`. Schedule and
  scoreboard still have it. The fetch fails on every launch from every origin, so NDSU's record is missing. Phase 3
  should pick it up; it may need the worker.
- **GitHub Pages is also publishing the repo** (`grayhavens.github.io/boxscore-the-draft/`, legacy build from `main`,
  228 builds in 30 days). It's a second public copy of the app whose worker calls fail CORS. It probably isn't
  wanted. Turn it off in the repo's Pages settings.

### Already good, leave alone

- **Accessibility is 100** apart from #5. Best Practices is 96, lost only to console errors from the local setup.
- **The splash.** It's not what makes launch slow (devtools runs), and fonts cause no layout shift.
- **No layout shift on a warm launch.** DOM is about 670 nodes, and the server responds in ~20 ms.
- **Artwork is right-sized** for 3× screens: the biggest shows at 100 px tall from 300 px files. A smaller format
  (WebP) could save maybe a third of 561 KB; it's not worth it unless Phase 4 keeps them in the install set.
- **Don't split `style.css`.** Home uses ~6% of its rules, but the sheet is 66 KB compressed and a 304 on a warm
  launch. A split would add a second restyle when the rest arrives, and keeping two sheets in step is hand work.
- **The lazy-load choices hold.** The Draft's class (80 KB) and `team-page.js` (143 KB) stay at launch. With the
  hints, their cost is bytes, not round trips.

## Phase 2: UX polish

**Failures are being shown as facts.** When ESPN is slow, down, or the phone is offline, Scores says "Nothing
scheduled" on a 19-game Sunday, and a team page calls an EPL side seven games in "Season complete". That breaks
"degrade quietly, but intentionally" more than anything else here. The rest is accessibility plumbing: the main sheets
aren't dialogs to VoiceOver, Home's rows and Scores' cards aren't buttons, and a few small colors and targets fall
short in the light theme and on touch.

Checked 2026-10-18 on `main` at `2630f2b`, in the desktop app's Chrome pane at 375×812. ESPN was cut off, or every
other origin (offline), by a fetch wrapper in a scratch copy of the site, with and without data cached on the device.
Touch targets and contrast were measured in the page. The vercel `web-design-guidelines` and `frontend-design` skills
aren't installed, so 2a and 2c follow their checklists by hand. 2b used the installed `hig-compliance-auditor` skill's
checklists (HIG knowledge base by Omraj Kumar, per Apple's Human Interface Guidelines). Anything that only shows on a
real iPhone is marked **(iPhone)**.

### Recommendations

| # | Area | What I found (file:line) | Recommendation | Impact | Effort | Risk / what could break | Free tier? |
|---|------|--------------------------|----------------|--------|--------|-------------------------|------------|
| 1 | Scores, no data | ESPN down or offline: "Nothing scheduled. No drafted team plays on this date." (`js/live-now.js:615`) on a day with 19 games, 3 live. With a visit from a minute earlier cached on the device, still the same: Scores keeps nothing between launches. | Tell "couldn't load" apart from "no games". When the day's scoreboards failed, show "Can't reach scores right now" with a retry (pull to refresh already exists). Keep the last good day in `localStorage` and show it with "Updated 4:12 PM" (Phase 4 picks up the storage side). | **H**: the most-used view says something false | M | Must not show stale *live* scores as live: label them, or drop the live tint when the copy is old | Yes |
| 2 | Team page, no data | Offline, Liverpool's page shows "Season complete", "No upcoming match scheduled yet" and "No results yet". `eplSeasonStatus` (`js/live-data.js:454`) reads an empty, failed schedule as "nothing played, nothing left = complete". The same empty-means-none pattern is at `js/live-data.js:772`, `:790` and `js/team-page.js:1898`. | Carry a "failed" state on the bundle (not just an empty schedule). Then show no season badge, plus a quiet "Couldn't load the schedule" line, instead of the three claims. | **H** | S–M | Every reader of `espnSchedule` needs to tell empty from failed; a test per league status function | Yes |
| 3 | Sheets and VoiceOver | 7 of 10 sheets (the app's main ones: `#modal-overlay`, game detail, identity, Points, compare, welcome, Scores scope) have no `role="dialog"`, `aria-modal` or label (`index.html`). Only the draft room's three do. Live check: with a sheet open, focus stays on `<body>` and the page behind isn't `inert`, so VoiceOver can wander behind it. Nothing returns focus to the opener on close (`js/sheet.js`). | In `openSheetOverlay` / `closeSheetOverlay` (one place for all sheets): set `role="dialog"`, `aria-modal`, `aria-labelledby` the sheet title; remember `document.activeElement`, focus the sheet's close button, set `inert` on `.board` and the tab bar, and undo all of it on close. | **H** (VoiceOver users can't tell a sheet opened) | S | `inert` must be cleared on every close path (swipe, Escape, backdrop, programmatic). Stacked sheets (game detail over a sheet) need a stack. | Yes |
| 4 | Rows and cards aren't buttons | Home's 25 team rows (`teamRowHtml`, `js/ui.js:239`) and Scores' game cards (`js/ui.js:199`) are `<div onclick>` with no role or `tabindex`. VoiceOver doesn't call them buttons, and a keyboard (iPad, desktop) can't reach them. Lighthouse doesn't test this. | In the two helpers: `role="button"`, `tabindex="0"`, an `aria-label` ("Liverpool, 3-3-1, next game Tuesday 2 PM"), and Enter/Space through one delegated `keydown` listener. | M–H | S (two helpers cover every row) | The favorite star inside a Home row is a button; a button inside `role="button"` is a nested control. Either label the row as `role="link"`, or move the row's click onto the name area. | Yes |
| 5 | Light theme contrast | Measured from the tokens: red `--live` is 3.3–3.9:1 on the light surfaces, green `--win` 3.6–4.3:1, `--loss` and `--provisional` 4.1–4.5:1; small text needs 4.5:1. That's the "LIVE" label, "W 2-1" results and live points, all at 10–13 px. Dark passes everywhere but `--live` on `--surface-2` (4.3:1). | Darken the light-theme values of `--live`, `--win`, `--loss`, `--provisional` (and `--accent` on `--surface-2`) in `css/tokens.css` until each clears 4.5:1 on every surface. Add a contrast check to `tests/design-tokens.test.mjs` so it stays true. | M | S | The colors carry meaning (`CLAUDE.md`), so keep the hue and change only lightness. Check the live tint on game cards still reads. | Yes |
| 6 | Touch targets | Home and Scores filter tabs are 44 px tall but only as wide as the word: "All" 17 px, "EPL" 25 px, with a 20 px dead gap between (`.filter-chip`, `css/style.css:321`, padding `10px 0`). The settings gear is 34×34 (`.picker-hit`), the scope chip 88×29, game-card crests 26×26 buttons inside a tappable card (`.tg-badge-btn`, `css/style.css:950`), the team page's "Full schedule" link 303×18. `--hit-min: 44px` exists in tokens but these don't use it. | Give filter tabs horizontal padding and swap the gap for it (same look, ~40–60 px targets). Pad the gear and scope chip to `--hit-min`. Extend the crest and link hit areas with `::after`, as `.page-dot` already does. | M (missed taps on the two busiest screens) | S | Check that the tab row still scrolls sideways and the active underline still lines up | Yes |
| 7 | Tip covers the back link | "Swipe to see your other teams" (`js/team-page.js:867`) sits over the team page's "‹ Home" link on a phone, so the first tap back can land on the tip. | Place tips below the header, or above the tab bar, never over a control. | M | S | — | Yes |
| 8 | Status bar in light theme **(iPhone)** | `black-translucent` (`index.html`) makes iOS draw the clock and battery in white. In the light theme, `.safe-area-top` (`css/style.css:37`) paints `--bg` (near white) behind them. `theme-color` is switched (`js/settings.js:51`), but a Home Screen app ignores it for this. Likely invisible status text in light theme. | Check on a phone. If it's unreadable, keep a dark strip only behind the status bar in light theme (a token like `--status-strip`), or accept it and note it. A home-screen app can't switch status bar style at runtime. | M if confirmed | S | Changes how light theme looks at the very top | Yes |
| 9 | Draft room colors | The draft room's league palette is nine raw hex values in JS (`js/draft.js:77`), used as text color (`style="color:${lg.color}"`, `:1220`, `:1619`) and never adjusted for light theme. The token test only scans CSS, so it can't see these. | Move them to `css/tokens.css` as `--league-*` with light-theme values, and use the tokens in `js/draft.js`. Extend the token test to flag hex in `js/*.js` outside data files. | L–M (used once a year, but on draft day) | S | Do it well before draft day; rehearse per `docs/draft-day-runbook.md` | Yes |
| 10 | Offline Home | Offline with cached data, Home keeps rows and records but the score/next-game column is blank. Nothing says it's offline or how old the rest is. | One quiet line under the page title when the last refresh failed: "Offline · updated 4:12 PM". Phase 4 covers what to cache. | M | S | Don't let it flash on every slow fetch: show it only after a refresh has actually failed | Yes |

**Changes a decision:** none.

### 2a. Web interface checklist (by hand)

- **Sheets:** swipe to close works on every sheet but the welcome one (the first-run "who are you?" step, which has no
  close by design). Escape: closes the main sheet and game detail (`js/live-data.js:1794`). Focus, labels and
  `inert` are #3.
- **Loading:** `skeletonRowsHtml` / `skeletonLinesHtml` are used across Home, golf, Race and the draft room (33 uses).
  Fine.
- **Empty vs failed:** #1, #2 and #10. The fallback works well: with ESPN cut off, Home still filled next games and
  records from the worker's other sources (TheRundown / TheSportsDB, 42 worker requests).
- **Touch:** #6, #7.
- **Reduced motion:** passes the spot-check. Page slides (`js/motion.js:19`), sheet row staggers (inside
  `prefers-reduced-motion: no-preference`), chat bubbles and the live effects are all gated. Under reduced motion,
  sheets keep a 220 ms, 24 px fade-up (`sheet-up`), which is small enough to leave.
- **Light and auto themes:** layouts hold up in light; contrast is #5. Auto follows the system and switches live
  (`js/settings.js`).

### 2b. iPhone feel (HIG)

- **Passes:** `viewport-fit=cover`; `display: standalone`; a 180 px touch icon and a maskable 512 px icon;
  `apple-mobile-web-app-title`; safe-area insets in 44 places, including the `.safe-area-top` cover and the tab bar;
  `overscroll-behavior` on the page and scrolling panels; edge swipe back and pull to refresh through
  `js/gestures.js`, with horizontal swipes leaving `pan-y` to the page; Dynamic Type through `font: -apple-system-body`
  on touch screens, with 636 font sizes as `rem` tokens.
- **Gaps:** the light-theme status bar (#8, iPhone). 41 font sizes are fixed `px` and don't follow Dynamic Type. Most
  are initials inside fixed-size badges, which is intentional; the one that's real body text is `.act-sub` (Activity,
  11.5 px, `css/style.css:5487`), which should use `--fs-*`.
- **Not applicable:** the auditor's system-font and SF Symbols advice. The app's fonts are a brand choice, and its
  icons are its own (`js/icons.js`), not SF Symbols.

### 2c. Design-system fidelity

- **Helpers are used where it counts.** Across `js/`, 89 button classes are written by hand outside `js/ui.js`'s 57
  helpers, 60 of them used once. They're almost all in the draft room, console and system admin. Home, Scores and the
  team page use only nine (`tg-arrow`, `tg-week-today`, `st-more` and the like), each with a CSS recipe. Worth folding
  in only when those screens are next touched.
- **Team colors:** no team color is used as text, border or state on Home, Scores or the team page. The draft room's
  league colors are #9.
- **Spec drift:** small. `FilterChip.prompt.md` specifies underline tabs "44px tall" but says nothing of width, which
  is how the 17 px "All" tab (#6) got through. Add a minimum target width to the spec when #6 is fixed.

### Already good, leave alone

- **The fallback chain.** ESPN down still gives a usable Home from TheRundown and TheSportsDB through the worker.
- **Skeletons** on every main view.
- **Reduced motion** handling, and every effect ending on the plain render.
- **Swipe-to-close** physics on sheets (direction lock, fling velocity, rubber band). It feels native.
- **Safe areas, Dynamic Type through `-apple-system-body`, and the rem type scale.** These are the hard parts of a
  native feel and they're done.
- **Accessibility 100 in Lighthouse** (once Phase 1 #5 lands). The gaps above are the ones Lighthouse doesn't test.

## Phase 3: Data efficiency

**The worker has lots of headroom except KV writes, and that one is close.** Every foreground visit, at most once per 5
minutes per phone, writes the Activity snapshot and the Race sample to KV, even when nothing changed. Free KV allows
1,000 writes a day, and a busy sports weekend with 20 members can plausibly reach it. When it runs out, Activity, Race
and points alerts quietly stop until midnight UTC. On the phone, an open app makes about 18 ESPN requests a minute all
day (about 10 MB an hour of compressed JSON, much more to parse), whether or not anything is live.

Measured 2026-10-18 (a Sunday morning with EPL games live) on `main` at `2630f2b`. Requests were recorded in the
desktop app's Chrome pane, with the site served locally and the deployed worker answering reads. Response sizes come
from `curl` against ESPN, compressed as a phone would get them. Free-plan limits were read from Cloudflare's docs the
same day. **Usage figures are estimates**: I can't see the account's analytics. The dashboard's KV and Workers
metrics would confirm them (see "Check first").

### What a phone does

- **Launch:** 36 ESPN API calls and 22 worker calls (Phase 0 had 28 and 22). No URL was fetched twice. The
  scoreboard has in-flight dedupe (`js/live-data.js:244`), and every other cache keeps one entry per key with a
  60 s back-off after a failure (`retryPending`, `js/utils.js:56`).
- **Open and idle, steady state** (from the timers in Phase 0; the first minute of the recording matched):
  - Live sweep: 8 scoreboards a minute, one per league, behind the 60 s cache. That's whether or not a league plays
    today: WNBA and CBB were swept every minute on a day with no games in either.
  - Team rotation: each of ~25 visible teams has its full schedule refetched every 5 min (`MIN_REFRESH_CYCLE_MS`),
    two requests per team (`schedule` and `schedule?fixture=true`, `js/espn.js:930`). About 10 a minute.
  - So **~18 ESPN requests a minute**. At 4–21 KB compressed each (NFL scoreboard 21 KB, a team schedule 4–12 KB),
    that's **~10 MB an hour**. Uncompressed, a single NFL team schedule is 275 KB of JSON for the phone to parse.
- **Hidden:** both loops skip their work (`paintingLoop`, `js/board.js:1376`), and iOS suspends a backgrounded PWA
  anyway. The timers still fire every 1.5 s and 20 s, but that's negligible.
- **The hidden background copy (`?bg=1`) and the robot visit** start no loops (`IS_SEASON_BACKGROUND`); each runs
  one scoring pass and closes. Fine.
- **Redundant fetch:** for MLB, `schedule` and `schedule?fixture=true` return identical bodies (checked by hash on
  2026-10-18, as the comment at `js/espn.js:878` says). The code fetches both on purpose, so as not to trust the split.
  For EPL, NFL, NHL, NBA and CFB they differ.

### What the worker does

- **Per launch:** 22 GETs, one per league for each of `/lock`, `/facts` and `/adjustments`, plus `/favorites`. Each is
  one KV read, with no edge or browser cache. Then the Activity GET (1 KV read) and, after 6 s, the Activity PUT.
- **Per Activity PUT** (`handleActivity`, `worker/rundown-proxy.js:1071`): 1 KV read and 1 write for the feed, then
  `recordSample` (`worker/points-history.js:66`): 1 more read and 1 more write for the Race chart. The client sends
  it whenever its snapshot is newer than the server's (`js/activity.js:514`). That's nearly every run, since
  `dataAt` is the time it ran, even when no rank, total or lock moved.
- **When it runs:** 6 s after launch, when the Points tab opens, and each time the app comes back to the foreground,
  at most once per `DETECT_COOLDOWN_MS` (5 min) per device (`js/activity.js:76`).
- **Durable Objects:** both use hibernation with `setWebSocketAutoResponse` ping/pong. The docs (2026-10-18) say
  idle hibernating objects and auto-responses aren't billed for duration. The draft room's single alarm only exists
  while a clock runs. Nothing to change.
- **Upstream errors:** `cachedUpstreamFetch` (`worker/rundown-proxy.js:348`) caches only `ok` responses, so a
  TheRundown 429 or 5xx goes straight to every caller. The client side is fine: `fetchJSON` resolves `null`, and
  `fetchRundownDayEvents` (`js/api.js:125`) stores even a `null` for 60 s, so each phone retries at most once a minute.

### Free tier: estimated use (both groups, 20 members)

Assumes 10 foreground visits per member per day on a normal day and 25 on a heavy one (a Saturday of CFB and EPL, an
NFL Sunday), each long enough for one Activity run.

| Resource | Free limit (docs, 2026-10-18) | Normal day | Heavy day | Headroom |
|---|---|---|---|---|
| Workers requests | 100,000 / day | ~6,000 (200 visits × ~30) | ~15,000 | Plenty |
| KV reads | 100,000 / day | ~5,500 | ~14,000 | Plenty |
| **KV writes** | **1,000 / day** | **~400** (200 PUTs × 2) | **~1,000** (500 × 2) | **None on a heavy day** |
| Durable Object requests | 100,000 / day (WebSocket messages at 20:1) | small | small | Plenty |
| DO SQLite rows written | 100,000 / day | draft day only | — | Plenty |

The docs say a free account that goes over a limit has "further operations of that type fail" until 00:00 UTC. For KV
writes that means Activity events, Race samples and points alerts, all silently. Push subscriptions, claims and
roster also write to KV, but rarely.

### Recommendations

| # | Area | What I found (file:line) | Recommendation | Impact | Effort | Risk / what could break | Free tier? |
|---|------|--------------------------|----------------|--------|--------|-------------------------|------------|
| 1 | KV writes | Every Activity run writes 2 KV keys even when nothing changed (`js/activity.js:514`, `worker/rundown-proxy.js:1111`, `worker/points-history.js:68`). An estimated 400 a day, about 1,000 on a heavy day, against a 1,000 cap. | **Client:** skip the PUT when there are no new events and ranks, totals and locks equal the server's snapshot. **Worker:** in `recordSample`, skip the write when the day's sample is unchanged (the read is already there). Both are needed: the worker check covers older clients. | **H**: keeps Activity, Race and alerts alive on the busiest days | S | The server's `dataAt` stops advancing while nothing changes, so other devices may run their own detection rather than trusting a "fresh" snapshot. Harmless: the same no-op. Deploy the worker first, then the site. | Cuts KV writes by most of the volume |
| 2 | Idle scoreboards | The 20 s sweep fetches all 8 league scoreboards every minute, all day (`liveScoreboardSweepTick`, `js/live-data.js:1939`), including leagues with no game today. | Per league, from the scoreboard it just read: if nothing is live and the next start is more than 30 min away, don't refetch until 30 min before that start (or in 15 min, whichever is sooner). Leagues with a live game keep 60 s. | **H** for battery and data: ~8 → ~1–2 requests a minute off-peak | S | A delayed or rescheduled start is caught at most 15 min late. Keep pull to refresh forcing a fetch. | Phone side only |
| 3 | Team rotation | Each visible team's full schedule (two calls, up to 275 KB JSON each) is refetched every 5 min, all day (`MIN_REFRESH_CYCLE_MS`, `js/live-data.js:1826`). The live sweep already patches scores in between. | Keep 5 min only for a team whose game is live or starts or ended within ~3 h. Otherwise 30 min. The bundle already has the next start. | **H**: ~10 → ~2 requests a minute, and most of the JSON parsing | S | A schedule change (postponement) shows up to 30 min later. Opening the team page still refetches (`ensureBundle`). | Phone side only |
| 4 | MLB double fetch | `schedule` and `schedule?fixture=true` are identical for MLB (verified 2026-10-18), and the code fetches both (`js/espn.js:930`). | Fetch one call for MLB. Re-check WNBA the same way and add it if identical. Keep both for leagues where they differ. | L–M (MLB is mostly offseason now; matters again from April) | S | If ESPN changes MLB to split like EPL, upcoming games vanish. A dated live check in the comment, plus a test on the merge. | Phone side only |
| 5 | 22 small worker calls | `/lock`, `/facts` and `/adjustments` per league plus `/favorites`, each its own request and KV read, uncached (`worker/rundown-proxy.js:1253`). | One `/league-state?season=…` that returns all three for every league in one response (still N KV reads, now in parallel in one invocation). Optionally `Cache-Control: max-age=30`. | L (quota is fine; saves ~21 requests per launch) | M (worker + client, deploy order) | An old client must keep working: keep the old routes. Commissioner edits show up to 30 s late if cached. | Neutral |
| 6 | Upstream errors | The worker never caches a failed upstream answer (`cachedUpstreamFetch`, `worker/rundown-proxy.js:348`). During a TheRundown 429 or 5xx, every phone's retry reaches TheRundown. | Cache 429/5xx for 30 s at the edge (`Cache-Control: max-age=30` on the stored copy, original status kept). | L (only matters during the ESPN-down fallback, the one time TheRundown sees load) | S | Must not cache 4xx that mean "bad request" for long. 30 s is short enough. | Saves TheRundown's daily budget |

**Changes a decision:** none. #3 changes the 2026-09-12 cadence only for teams with no game nearby; the 5-minute
cycle around games stays.

**Deploy order:** #1's worker half, then the site. #5 is worker first, keeping the old routes. The rest are site only.

### Check first

- **KV writes per day** in the Cloudflare dashboard (Workers & Pages → KV → the `LEAGUE_FACTS` namespace → Metrics),
  for the last few Saturdays and Sundays. If a day already touched 1,000, #1 moves to the top of the Top 10.

### Already good, leave alone

- **No duplicate requests** within a TTL at launch; in-flight dedupe and failure back-off are in the right places.
- **Loops pause when hidden.** The background copy and robot visit don't poll.
- **Durable Objects**: hibernation plus auto-response ping/pong is the cheapest possible setup.
- **The fallback** to TheRundown and TheSportsDB through edge-cached worker routes when ESPN fails (Phase 2).
- **Client TTLs for slow data**: standings 1 h, season phase 6 h, team info 24 h, nflverse 2–3 h. They match how
  often that data changes.

## Phase 4: The PWA layer

**The service worker is sound. The bugs sit around it.** A failed schedule fetch saves an empty schedule over the good
cached one, which is the cause of Phase 2's offline "Season complete". An open app never learns that a new version
shipped. Serving the shell straight from the cache could be made safe, but it would turn every forgotten `CACHE_NAME`
bump into users stuck on old code. After Phase 1's hints it's worth little, so **keep network-first**.

Reviewed 2026-10-18 on `main` at `2630f2b` (`sw.js`, `CACHE_NAME = boxscore-v109`). Phase 1 settled the build-step
question as option (a), so `sw.js` stays and nothing below assumes Workbox.

### Warm launch: serve the shell from the cache?

Today every launch asks Cloudflare about all ~117 shell files (304s). Phase 1 #1 makes those requests parallel. The
next step would be serving the shell from the cache whenever the cached version is the deployed one. To find that out,
one small file would always be fetched first, without cache (`version.json`, holding `CACHE_NAME`). The failure cases:

1. **A forgotten `CACHE_NAME` bump.** Network-first forgives it: the next launch gets new files anyway. Cache-first
   doesn't: everyone keeps the old code until some later deploy bumps it. This alone rules it out unless the bump is
   automatic (a test that hashes every shell file and fails unless `CACHE_NAME` carries that hash).
2. **A file missing from `SHELL_FILES`.** The cache misses, the network answers with the new file, and it runs
   alongside cached old modules: the mixing #218 exists to prevent. Needs the drift test (Phase 1 #2) to be complete,
   dynamic imports included.
3. **iOS evicting part of the cache** under storage pressure. Same as 2, unless any miss sends the whole launch to the
   network.
4. **A deploy between `version.json` and the files.** A narrow window, but cache-first then pins the old version
   for a whole session.
5. **Worker changes.** Old clients would live a launch longer, so worker changes would need to stay
   backward-compatible longer. That's already a convention, but cache-first makes it load-bearing.
6. **Activate deletes the old cache at once** (`sw.js:176`). A page that launched cache-only under the old version
   then misses on its lazy loads. Avoiding that needs per-version cache lookup, not `caches.match` across all caches.

**What it would buy:** the 117 revalidations, which after Phase 1 #1 are one or two round trips in parallel, maybe
100–300 ms on cellular (Lighthouse can't measure it; Phase 1). **Not worth the risk**: keep network-first, ship the
hints, and measure on the iPhone. The existing 3 s cache-only launch already covers bad networks.

### Recommendations

| # | Area | What I found (file:line) | Recommendation | Impact | Effort | Risk / what could break | Free tier? |
|---|------|--------------------------|----------------|--------|--------|-------------------------|------------|
| 1 | Failed fetch erases cached schedules | `fetchEspnTeamSchedule` returns `{ recent: [], upcoming: [] }` when both calls fail (`js/espn.js:960`), and `fetchTeamBundle` saves that over the good bundle in memory and `localStorage` (`js/live-data.js:398`). A few seconds without signal blanks every visible team's next game and results, and the team page then reads "Season complete" (Phase 2 #2). It lasts until the next successful fetch, up to 5 min later. | Return `null` from `fetchEspnTeamSchedule` when both calls failed. In `fetchTeamBundle`, keep the previous bundle (marked as a failed refresh) rather than saving an empty one. Phase 2 #2 then mostly fixes itself. Test: a failed fetch leaves the stored bundle unchanged. | **H** | S | A team whose schedule is truly empty (a real off week) must still render as empty, which is why it's "both calls failed", not "no events". | Yes |
| 2 | The open app never updates | No `controllerchange`, `registration.update()` or version check anywhere (`js/board.js:1442` only registers). iOS keeps a PWA alive in the background for hours, so it can run an old version long after a deploy. A new service worker only arrives on a navigation or a push. | On return to the foreground after 30+ minutes away, call `registration.update()`. On `controllerchange`, reload at the next safe moment: Home, Scores or Standings showing, no sheet open, no unsent chat text, never in the draft room. | M | S | Reloading under someone is the risk; the safe-moment rule handles it, and the splash plays only once a session. | Yes: one tiny `sw.js` fetch on return |
| 3 | Lazy loads across a deploy | A lazy module fetched after a deploy imports the page's already-loaded old modules (the module map is keyed by URL). A new export it needs then fails to link. The draft room is preloaded at idle, so it's mostly safe. The guide's stills (`js/guide.js:359`), ESPN's team list (`js/live-class.js:126`) and, on non-commissioner devices, the console are not. On failure, the cached promise is cleared, but a retry fails the same way (`js/board.js:1065`, `:1088`). | When a lazy `import()` fails, show "Boxscore was updated" with a Reload button (or reload outright when it's safe, per #2). | L–M (rare, but it's a dead screen when it hits) | S | — | Yes |
| 4 | Badge misses mentions | A tagged member gets only the mention push (`worker/chat-room.js:390`), and only chat pushes set the badge (`sw.js:304`). Being tagged never shows on the icon. Two pushes landing together can both read "no stack yet" and count 1. | Set the badge for mentions too, from the sum of open chat and mention notifications (`getNotifications()` without a tag) rather than a per-stack counter. | L | S | iOS only shows the badge if allowed; never skip `showNotification` (the iOS rule). | Yes |
| 5 | Manifest | `description` still reads "A personal dashboard tracking the teams and leagues I follow." Both groups install as "Boxscore" with the same icon, so someone in both groups gets two identical icons. No `screenshots` (Android's install sheet). Light theme still launches through a dark `background_color`, which is fine since the splash is dark. | Rewrite `description` ("Your group's draft, scored live from real results."). Set `apple-mobile-web-app-title` from the active group at load (e.g. "The Draft"), since iOS reads it when you tap Add to Home Screen. Skip `screenshots` unless Android installs matter. | L | S | The title must come from `js/groups.js` (data rule); The Draft keeps "Boxscore" if preferred. | Yes |
| 6 | Docs drift | `docs/ARCHITECTURE.md:116` still names `boxscore-v52`; it's `v109`. | Refer to "`CACHE_NAME` in `sw.js`" rather than a number. | L | S | — | Yes |

**Changes a decision:** none. The cache-first option above would change #218's design and isn't recommended.

### `SHELL_FILES`: the install set

- **Keep the on-demand modules in it** (draft room, console, guide stills, Season Ticket's class; ~470 KB). The point
  isn't offline use. A cache-only launch (bad network) can then open the draft room or console from the same version
  as the page. Dropping them would bring back #218's mixing for exactly those screens.
- **Keep the artwork** (561 KB, both themes). Postseason and majors cards appear offline too, and on a version bump
  the bytes mostly come back as 304s.
- **Leave out** `js/seasons/espn-teams.js` (used once, right after a draft, and online by nature) and the system admin
  page's modules. List them in the drift test's allowlist.
- **The drift test** is Phase 1 #2, extended here. Walk static **and** dynamic imports from `js/board.js`. Fail when a
  reachable module is missing from `SHELL_FILES` (allowlist aside), when an entry doesn't exist, or when an `icons/`
  path in `js/postseason.js` / `js/golf-*.js` isn't listed.

### Offline, view by view (from Phase 2's runs plus code)

| View | Offline today | After #1 and Phase 2 #1/#2/#10 |
|---|---|---|
| Home | Rows and records (standings from `localStorage`); next game and score blank, because #1 erased the bundles | Rows, last known next game and result, "Offline · updated …" |
| Scores | "Nothing scheduled" (scoreboards kept in memory only) | Last good day for the shown date, labelled with its time |
| Team page | "Season complete", "No upcoming match", "No results" (#1) | Last saved schedule, no season badge, "Couldn't load the schedule" |
| Standings | Last saved tables (`js/frozen-cache.js` / `localStorage`) | Same, plus the updated-at line |
| Chat | Cached messages (`saveCachedMessages`), status "offline", reconnects on return | Same |
| Points | Computed from the cached standings and bundles; wrong where #1 erased bundles | Correct once #1 lands |

### Already good, leave alone

- **Network-first with the 3 s cache-only launch** (#218). It's the right trade for a hand-kept shell, and the
  per-client cache-only set survives iOS stopping the worker.
- **The page key**: every `?view=` and `&team=` is cached as one `index.html`, so the cache doesn't fill with copies.
- **Other origins pass through untouched** (ESPN, the worker, KLIPY). KLIPY's terms require that, and it keeps live
  data out of the cache.
- **Push**: every push shows a notification. Chat and mentions stack separately, `renotify` is used only with a tag,
  and tapping an alert focuses the open window and routes it (`bx-open-alert`) rather than opening a second one.
- **The manifest's basics**: `standalone`, `id`, a maskable icon, theme colors matching the app.
