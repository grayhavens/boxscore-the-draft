# Optimization plan: launch speed, efficiency and polish

For Claude Code, in `grayhavens/boxscore-the-draft`. Written 2026-10-17 against `main` (ROADMAP as of 2026-10-16,
"In progress: nothing"). Reviewed against the repo the same day (main at `2630f2b`); the changes from that review are
listed below and folded into the phases.

### Changes from the 2026-10-17 review

- **Numbers that had moved:** 51 test files, not 50. `css/style.css` is 8,657 lines / 392 KB, and `CLAUDE.md`'s
  "~7,000 lines" is out of date. The baseline re-measures both.
- **Local runs are only partly isolated.** On localhost, `chatWorkerBase()` (`js/worker-base.js`) sends chat,
  claims, roster, Activity and push to `wrangler dev`. Everything else, reads included, still goes to the
  deployed worker. **A Pages preview sends everything to the deployed worker**, so a preview run with an invite code
  writes real Activity. So: run Lighthouse on localhost (with `wrangler dev` up, or with nothing listening on 8787).
  Run it on a Pages preview only with no invite code.
- **Phase 3a's premise was out of date.** The 1.5 s tick doesn't fetch every 1.5 s. Each tick picks the oldest
  *visible* team that's due (`MIN_REFRESH_CYCLE_MS`), and most ticks do nothing (2026-09-12 cadence review). The 20 s
  live sweep reads per-league scoreboards behind a 60 s cache, so the network sees at most one request per league per
  minute. Phase 3a now asks narrower questions: does the 1.5 s timer keep running while hidden, and do the loops
  slow down when no game is live or starting soon.
- **Tooling in this session:** the `hig-compliance-auditor` skill is installed. `frontend-design`,
  `web-quality-skills` and the Cloudflare skills/docs MCP are not, and `/plugin` installs need an interactive
  `claude` terminal. Until they're added, the review uses the same checklists by hand and reads Cloudflare's limits
  from developers.cloudflare.com. `npx skills add` writes files into the repo, so install it user-wide or skip it.
- **Lighthouse caveats:** it runs Chrome, not WebKit, so iOS-only behavior (safe areas, standalone mode, Dynamic
  Type) still needs the iPhone check. A warm run needs `--disable-storage-reset` so the service worker survives.
  Navigation mode reports TBT, not INP; INP needs a timespan run with a real tap.
- **One test for three lists:** `SHELL_FILES`, any launch `modulepreload` hints and the launch budget all describe
  the same import graph. One Node test that walks the graph can check all three (Phases 1 and 4).

## How to work through this

1. **Read first:** `CLAUDE.md`, then `docs/ARCHITECTURE.md`, `docs/DESIGN_TOKENS.md`, `docs/DECISIONS.md`,
   `docs/ROADMAP.md`, `docs/ux-improvements-plan.md`, `docs/lazy-load-plan.md` and `docs/espn-passthrough-plan.md`.
   Follow `CLAUDE.md`'s conventions and gotchas while building. **But for this review, nothing is off the table:** I'm
   open to any change, including ones `CLAUDE.md` or `docs/DECISIONS.md` currently rule out (a build step,
   dependencies, a different caching design), if it makes the app faster or more efficient. When a recommendation
   goes against a written rule, name the rule, say what it would cost to change it, and mark the row
   **"Changes a decision"**. If I approve one, update `CLAUDE.md`, `docs/DECISIONS.md` and
   `docs/PROJECT_INSTRUCTIONS.md` in the same PR.
2. **The one hard limit: free hosting.** Everything must stay on free tiers, as today (Cloudflare Pages, Workers,
   KV, Durable Objects, GitHub Actions). Before recommending anything that adds requests, storage, CPU time or builds,
   look up the **current** free-plan limits in Cloudflare's docs (the `cloudflare-docs` MCP from the Cloudflare skill,
   or the docs site; don't rely on remembered numbers), estimate the usage it adds for both groups, and say how much
   headroom is left. If something only works on a paid plan, say so and leave it out of the Top 10.
3. **Go phase by phase, in order.** Each phase reviews what's already in the app, then writes its findings into
   `docs/optimization-report.md` (one section per phase).
4. **Stop after each phase's section and wait for me.** No code changes until I pick which recommendations to build.
5. **When building:** one branch and PR per recommendation, left open for me to merge (as `CLAUDE.md` says). Run
   `node --test tests/*.test.mjs` before every PR. Bump `APP_VERSION` / `CACHE_NAME` / `SHELL_FILES` as the Gotchas
   require, deploy-order notes in the PR if the worker changes, and update `docs/ARCHITECTURE.md`, `js/guide.js`
   (`APP_ROWS`) and `docs/ROADMAP.md` when something ships.
6. **Don't re-propose what's done or decided.** Already shipped: the rare parts loading on first use (UX item 6), the
   Home priority rule (item 5), the daily robot visit (item 7), the quick wins (items 1–4, 11). Blocked on purpose:
   sharing ESPN answers through the worker (item 8; ESPN answers 403 to Workers, waiting on the daily probe). Things the
   lazy-load plan chose to keep at launch (The Draft's class, `js/team-page.js`) stay unless you have new numbers that
   change the trade-off, and then say what changed.
7. **If a tool won't install or doesn't fit this stack**, say so in the report and move on.

### Report format

Each phase's section starts with 2–3 plain sentences, then this table sorted by impact:

| # | Area | What I found (file:line) | Recommendation | Impact (H/M/L) | Effort (S/M/L) | Risk / what could break | Free tier? |
|---|------|--------------------------|----------------|----------------|----------------|-------------------------|------------|

Then a short **"Already good, leave alone"** list. I want to know what not to touch as much as what to change.
Match the repo's doc style: plain, short sentences, measured numbers with the date they were measured.

---

## The app, in brief (details in `CLAUDE.md`)

- **What:** Boxscore, a fantasy-draft dashboard for friend groups across EPL, NFL, NBA, NHL, MLB, WNBA, CFB, CBB (and
  PGA golfers per group). Installed as an iOS PWA, phone-first, dark by default (light and auto themes too). Groups live
  on `<id>.boxscore.space`.
- **Stack:** plain HTML + CSS + native ES modules. No build, bundler, package.json or framework today (a written
  decision, open to review in Phase 1). Cloudflare Pages for the site; a Cloudflare Worker (`worker/`) with KV, two SQLite-backed Durable
  Objects (chat, draft room) and the edge cache. No npm dependencies anywhere.
- **Data:** phones call ESPN directly (CORS-open). Keyed APIs go through the worker's `cachedUpstreamFetch`. Scoring
  runs only in the browser; the worker stores what the browser computes.
- **Views:** Home, Scores, Chat, Standings, Points (Race, Activity, History), team pages, the draft room, Commissioner
  console, system admin.
- **Design system:** tokens only in `css/tokens.css`, UI only through `js/ui.js` helpers, spec in
  `docs/design-system/`. `tests/design-tokens.test.mjs` enforces it.
- **Core value:** a calm, glanceable phone app for a group of friends. Every recommendation should keep it that way.

---

## Phase 0: Baseline (no recommendations yet)

Measure and write down, with today's date:

- **Launch cost per group:** files and KB loaded by `js/board.js`'s static import graph for The Draft and for Season
  Ticket (the lazy-load plan measured 108 files / 1,590 KB for The Draft on 2026-10-16; re-measure, don't copy).
  Note the depth of the import chain (how many round trips before the last module arrives).
- **`css/style.css`:** size in KB, and roughly how much of it the first view (Home) uses.
- **Service worker:** what `sw.js` does on install and on each launch (it's network-first for every shell file, with
  a 3 s navigation timeout that runs a whole launch from cache). How many requests a warm launch makes.
- **Polling:** every timer and refresh loop in `js/board.js`, `js/live-data.js`, `js/live-now.js`, `js/chat.js` and
  the draft client: interval, what it fetches, whether it pauses when the app is hidden, and whether it slows down
  when nothing is live.
- **Worker:** the `CACHE_TTL_SECONDS` table, every route, and what each Durable Object keeps open (WebSockets,
  alarms).
- **Tests and checks today:** the 51 test files, the token test, the daily robot visit. Note there's no Lighthouse or
  performance check yet.

---

## Phase 1: Launch speed (Lighthouse + Core Web Vitals)

**Install:**
```bash
/plugin marketplace add addyosmani/web-quality-skills
/plugin install web-quality-skills@addy-web-quality-skills
# Lighthouse runs: the lighthouse-mcp server, or `npx lighthouse` directly (fetched on demand, nothing added to the repo)
```

**Where to run it.** Against the local site (`python3 -m http.server 8934` from the repo root, the only localhost
origin the worker's CORS allows) and a Pages branch preview. **Not against a production group with an invite code**:
an app visit computes scores and can write them and trigger alerts. A Pages preview talks to the deployed worker for
everything, so run it there with no invite code only (see the review notes at the top). Mobile profile, both a cold and a warm (service
worker installed) run. Record Performance, Accessibility, Best Practices, LCP, CLS, INP and TBT.

**Review with the `performance` and `core-web-vitals` skills, focused on this stack:**
- **The module waterfall.** With no bundler, each `import` level is another round trip on a cold load. Would
  `<link rel="modulepreload">` hints in `index.html` for the launch graph flatten it? (The repo already uses
  modulepreload for the draft room and console.) Measure what hints and import-graph reshaping alone can recover;
  that's the baseline the build-step option below has to beat.
- **Parse and run time at launch** on a mid-range phone, not just download size. Which modules do heavy work at
  import time that could wait until after the first paint?
- **`css/style.css` (~8,700 lines) blocks render.** Is there a split that keeps one-file simplicity, such as a small
  launch sheet plus the rest loaded after first paint? Weigh it against the token test and the launch splash.
- **Fonts.** Two Google families, eight weights, via a stylesheet link. Check whether every weight is used, whether
  `display=swap` causes a visible shift on the splash wordmark, and whether self-hosting the files (no dependency,
  just files) beats the third-party round trip.
- **Images in the shell:** postseason and majors artwork are PNGs precached at install for every member. Sizes,
  formats, and whether they need to be in the install set.
- **Layout shift** when scores, ranks and "Since last time" arrive. Are skeletons the right height?

### Consider a build step (a decision for me, not a default)

Today's rule is "no build, nothing to run before shipping" (`docs/DECISIONS.md`). I want the numbers to decide
whether to keep it. Write this up as its own sub-section with a clear recommendation either way:

- **Prototype, don't adopt.** On a throwaway branch, bundle and minify the launch graph (esbuild is the obvious
  candidate: one binary, fast, can be run with `npx` without committing `node_modules`). Measure cold and warm launch
  the same way as the baseline, against the best no-build result from the items above.
- **Compare three options:** (a) no build, with hints and reshaping only; (b) a build that only bundles and minifies,
  keeping the source files as they are; (c) a fuller setup (build + `vite-plugin-pwa` / Workbox replacing the
  hand-kept `SHELL_FILES` list). For each: launch time saved, KB saved, what it adds to every deploy, and what it
  breaks.
- **Things a build would touch:** the files shared unbuilt between browser, worker and Node tests; dynamic
  `import()` of the draft room, console and group classes; `modulepreload` hints; `SHELL_FILES` and `CACHE_NAME`;
  Pages branch previews; the `?bg=1` background copy and the robot visit; debugging on a phone.
- **Free tier:** Pages builds count against a monthly build allowance and have a time limit; check the current
  numbers and how many builds a typical month of pushes and PR previews would use. Building in GitHub Actions and
  uploading the result is the alternative; compare both.
- **If it's not worth it,** say so plainly and the rest of the plan carries on without it.

**Recommend** fixes with targets (Performance ≥ 90 and Accessibility 100 on mobile, warm launch), and a lightweight
way to keep them: e.g. a Node test like the token test that fails when launch KB or file count grows past a budget.

---

## Phase 2: UX polish

### 2a. Web interface guidelines

```bash
npx skills add vercel-labs/agent-skills --skill "web-design-guidelines"
```
(Skip the React skill: there's no React here.)

Run it across `index.html`, `css/style.css` and the HTML builders in `js/ui.js` and the view modules. Look hardest at:
- Sheets (`js/sheet.js`, the Sheet / SheetRow helpers): focus moves in and back out, VoiceOver labels, swipe and
  Escape to close.
- Loading, empty and error states on every view when ESPN is slow or answers nothing. The convention is "degrade
  quietly"; check that quiet still reads as intentional, not broken.
- Touch targets and spacing on game cards, filter chips, the scope chip and the tab bar.
- Reduced motion: every effect should already end on the plain render (`canAnimateLive()` / `fxOn()`). Spot-check it.
- Light theme and auto theme, not only dark.

### 2b. iPhone feel (HIG)

Use the installed **`hig-compliance-auditor`** skill on the home-screen app: safe areas (the `.safe-area-top` cover,
tab bar, sheets), `black-translucent` status bar, splash, icons, text scaling, gestures (`js/gestures.js`,
pull to refresh, Android back) and overscroll.

### 2c. Design system fidelity

Use the installed **`frontend-design`** skill to compare the live screens with `docs/design-system/` (each
component's `.prompt.md` and types) and `docs/DESIGN_TOKENS.md`. List one-off variants, drift from the component
specs, and places that use team colors for anything but identity.

**Rules for anything recommended here:** new values become tokens in `css/tokens.css` (dark and light), new pieces
become `js/ui.js` helpers with a CSS recipe, copy stays plain and short, nothing odds- or betting-related.

**Recommend:** prioritize anything that adds friction on Home, Scores and the team page, the three places people
spend most of their time.

---

## Phase 3: Data efficiency (phones and the worker)

```bash
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
```

### 3a. On the phone (the bigger lever, since phones call ESPN directly)

- **Refresh loops.** `js/board.js` runs a background refresh tick every `REFRESH_STEP_MS` (1.5 s; it fetches only
  when a visible team is past `MIN_REFRESH_CYCLE_MS`) and a live sweep every `LIVE_SWEEP_INTERVAL_MS` (20 s, behind a
  60 s per-league scoreboard cache). Both were tuned on 2026-09-12; don't redo that. Check whether the timers keep
  waking while the app is hidden (the standings refresh pauses; check the others), and whether they slow down when
  no game is live or starting soon.
- **Duplicate requests.** Do two views, or the same view twice, ask ESPN for the same thing within its TTL? Is there
  one in-memory cache with in-flight dedupe, or several?
- **TTLs vs. need.** Compare each client TTL (scoreboard 60 s, slate 15 min, team info 24 h, bundle 3 min, …) with how
  often that data really changes, by sport and by phase (live game, game day, off day, offseason).
- **The hidden background copy (`?bg=1`) and the robot visit:** confirm they don't poll more than they need to.

### 3b. In the worker (use the `cloudflare` and `workers-best-practices` skills)

- Review `cachedUpstreamFetch` and the `CACHE_TTL_SECONDS` table against the same "how often does it change" test.
- Durable Objects: are chat and the draft room using WebSocket hibernation, so an idle room isn't billed or held
  open? Any alarms or storage reads that run more than they need to?
- KV reads and writes per visit (points history, Race samples, claims): any that could be batched or skipped.
- Error paths: what happens on upstream 403/429/5xx, and does the client fall back cleanly.
- **Out of scope:** routing ESPN through the worker (item 8 is blocked; leave it to the daily probe).

**Recommend** changes that cut requests and battery without making live scores feel late. For anything that crosses
the worker and the site, note the deploy order (worker first).

---

## Phase 4: The PWA layer (`sw.js`, `manifest.json`, updates, offline)

Review the hand-written service worker as it is. If Phase 1's build-step section recommends option (c), note which items below Workbox would
replace; otherwise assume `sw.js` stays.

- **Warm-launch cost.** Network-first means every shell file is re-requested on every launch. Is there a safe way to
  serve the shell from cache when `CACHE_NAME` hasn't changed (for example, checking one small version file first)
  **without ever mixing a new file with an old one**, which is the reason the current design exists? Write the
  failure cases out before recommending anything.
- **`SHELL_FILES` drift.** It's a hand-kept list. Recommend a Node test that fails when a module in the launch import
  graph is missing from it, or when it lists a file that no longer exists. Decide whether on-demand modules (draft
  room, console, other groups' classes) belong in the install set.
- **Updates.** `skipWaiting()` + `clients.claim()` activate a new worker at once. Check how an open app learns there's
  a new version and whether a swap can happen mid-draft or mid-game. Recommend the least disruptive pattern.
- **Offline.** What each view shows with no connection (last-known data with a "last updated" note beats a blank
  view; `js/frozen-cache.js` and `js/cache-fresh.js` may already do part of this).
- **Manifest.** The `description` still reads like a personal dashboard ("teams and leagues I follow"). Check names,
  icons, maskable icon, shortcuts, theme colors (light theme too) and that each group's install looks right.
- **Push.** Every push must show a notification on iOS; leave that rule alone. Check the stacking and badge logic only
  for bugs.

---

## Final step

Before any code, add a **Top 10** at the top of `docs/optimization-report.md`: the highest-impact, lowest-risk items
across all phases that fit the free tiers, in the order you'd build them, each with a one-line reason. Put the build
step decision from Phase 1 right under it as a separate yes/no for me, with its numbers. Then wait for my go-ahead.

After the work I approve is merged, re-run the Phase 0 and Phase 1 measurements the same way and add a before/after
table. Finish with a check on a real iPhone from the Home Screen (cold launch, warm launch, a live game), as the
roadmap does for UX changes, and note anything that can only be checked there.
