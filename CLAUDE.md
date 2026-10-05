# CLAUDE.md

Guidance for Claude Code in this repo. Deeper docs: `docs/ARCHITECTURE.md` (modules, routes, services, and the
per-feature reference), `docs/DESIGN_TOKENS.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.

## What this is

Boxscore: a fantasy-draft dashboard where friend groups of 10 draft real teams across leagues (EPL, NFL, NBA, NHL,
MLB, WNBA, College Football, College Basketball; PGA golfers are built but off for every group for now) and score points from how
those teams actually finish. Installed as an iOS PWA, phone-first, dark theme by default. One deployment hosts
several groups, each on `<id>.boxscore.space` (The Draft = `thedraft`, Season Ticket = `seasonticket`); the bare
`boxscore.space` is a landing page. Features: Home, Scores, Chat (Durable Object), Standings, Points (with Race,
Activity, History), team pages, a live snake draft room, push alerts, a commissioner console and a system admin page.

## Stack

- Plain static site: HTML + CSS + native ES modules. **No build, no bundler, no package.json, no framework.**
- Cloudflare Worker (`worker/`): wrangler 4.x (4.147.0 verified), `compatibility_date = "2026-09-01"`, Workers KV,
  two SQLite-backed Durable Objects, edge cache. No npm dependencies (Web Push/VAPID written on WebCrypto).
- Tests: Node's built-in `node:test` (Node 24.21 verified; no version pinned).
- Fonts: Space Grotesk + Manrope (Google Fonts). Hosting: Cloudflare Pages (site) + Cloudflare Workers.

## Commands (all verified 2026-10-03 unless noted)

- **Install:** none. `npx` fetches wrangler on demand.
- **Test:** `node --test tests/*.test.mjs` (29 files, 242 tests, all pass, ~4s).
- **Dev, site:** `python3 -m http.server 8934` from the repo root, open `/index.html` (never `file://`). Use port
  8934: it's the only localhost origin the worker's CORS allowlist accepts. The `team-dashboard` launch config
  serves a mirror at `$TMPDIR/boxscorethedraft-preview`; re-sync it first:
  `rsync -a --exclude='.git' --exclude='.wrangler' ./ "$TMPDIR/boxscorethedraft-preview/"`.
- **Dev, worker:** `cd worker && npx wrangler dev` (port 8787; local KV/DOs). On localhost the app sends chat,
  claims and roster to `localhost:8787`; everything else still hits the deployed worker.
  Admin page locally: launch config `admin-worker` (adds `ADMIN_DEV_BYPASS=1` and test passwords).
- **Integration (needs wrangler dev):** `node tests/draft-room.integration.mjs` against
  `npx wrangler dev --var ADMIN_PASSWORD:testpw`; `node tools/rehearse-draft.mjs --chaos 2` (`--preflight` on draft
  morning). Not run in this audit.
- **Tools:** `node tools/export-draft.mjs --dry-run [--group <id>]` (finished draft → `js/seasons/<year>.js`, or `<group>-<year>.js`; refuses an unfinished
  draft), `node tools/outlooks.mjs facts --league nfl` / `apply <file.json>`, `node tools/golfer-pool.mjs`,
  `node tools/vapid-keys.mjs`.
- **Build / lint:** none. `tests/design-tokens.test.mjs` is the only style check.
- **Deploy:** site = push to `main` (Pages project `boxscorethedraft`, no build command; every branch/PR gets a
  preview at `<branch>.boxscorethedraft.pages.dev`). Worker = `cd worker && npx wrangler deploy`.
  **Deploy the worker before the site** whenever both change.

## Folder structure

- `index.html` — the app; `landing.html` — platform landing; `admin.html` — system admin; `sw.js`, `manifest.json` — PWA.
- `js/` — every module (flat). `js/board.js` is the entry; `js/seasons/` holds draft classes.
- `css/tokens.css` — all design tokens; `css/style.css` — every rule (~7,000 lines).
- `worker/` — Cloudflare Worker; entry `rundown-proxy.js`, config `wrangler.toml`.
- `tests/` — `*.test.mjs` unit tests, `fixtures/`, one integration script.
- `tools/` — Node CLI scripts (draft export/rehearsal, outlooks, golfer pool, VAPID keys).
- `docs/` — plans, runbook, design system spec (`docs/design-system/`), reference prototypes.
- `icons/` — PWA icons.

## Conventions

- **Naming:** files kebab-case; functions camelCase; constants `UPPER_SNAKE`; HTML builders end in `Html`
  (`buttonHtml`); per-league modules follow one pattern (`fetchEspnXStandingsCached`, `renderXStandingsRow`, …).
- **Modules:** pure logic in its own file (`*-math.js`, `draft-rules.js`, `chat-mentions.js`) so the worker and Node
  tests import it; `js/groups.js`, `js/version.js`, `js/draft-*.js` are shared with the worker.
- **Rendering:** template strings → `innerHTML`; always `escapeHtml` data. Handlers called from generated HTML are on
  `window.*`. UI pieces come from `js/ui.js` helpers.
- **State:** module-level variables + `localStorage` mirrors; view state in the URL query (`updateUrlParam`); shared
  state in the worker (KV, Durable Objects). Server is authoritative for draft and chat; client sends actions.
- **Data:** content only in `js/data.js` / `js/seasons/*` / `js/groups.js`; nothing else hardcodes teams or leagues.
- **Errors:** fetches degrade quietly (cached copy, empty state, hidden feature when a secret/route is missing); an
  old worker ignoring a new field must be harmless.
- **Comments:** long "why" header comments per file; match that density.
- **Copy:** plain, short sentences; no betting/odds anything.

## Environment / config (names only)

Worker secrets: `ADMIN_PASSWORD` (The Draft commissioner), `ADMIN_PASSWORD_<GROUP>` (others), `THERUNDOWN_API_KEY`,
`SPORTSDB_API_KEY`, `PERIGON_API_KEY` (More news; unset hides it), `KLIPY_APP_KEY` (GIFs; unset hides them), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (push; never
rotate casually), `VAPID_SUBJECT`, `RESEND_API_KEY`, `CLAIM_ALERT_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
Dev only: `ADMIN_DEV_BYPASS` (ignored when `ACCESS_AUD` is set). Local secrets go in `worker/.dev.vars` (gitignored).
Bindings: KV `LEAGUE_FACTS`, DOs `CHAT_ROOM`, `DRAFT_ROOM`. Client config: `DASHBOARD_WORKER_BASE`
(`js/worker-base.js`), `APP_VERSION` (`js/version.js`), `CACHE_NAME` (`sw.js`).

## Gotchas

- **Worker before site**, every time a feature spans both (new routes, fields, DO migrations).
- Bump `APP_VERSION` for visible changes; bump `CACHE_NAME` in `sw.js` and add new shell files to `SHELL_FILES`.
- The preview launch config serves a stale mirror unless you rsync it.
- `?group=<id>` works only on localhost / Pages previews; The Draft sends no group param and uses legacy keys.
- `localStorage` is not namespaced by group (each subdomain is its own origin).
- MLB and WNBA (`PRIOR_SEASON_DISPLAY_LEAGUES`) show live but **non-scoring** prior-season data.
- Scoring exists only in the browser; the worker stores what the browser computes.
- `js/ui.js` must stay a leaf module (imports only `escape.js`, `icons.js`) or boot cycles.
- `switchView` and team-page navigation apply DOM changes asynchronously inside a View Transition.
- KLIPY must be called from the browser and never cached/proxied (their terms).
- Any new upstream call goes through `cachedUpstreamFetch` in the worker; never put a private key in client JS.
- nflverse depth chart relies on "newest snapshot first" ordering; if it flips, it silently returns old data.
- Launch splash must stay the first thing in `<body>`.
- Draft day can't be redone: rehearse per `docs/draft-day-runbook.md`.

## Design system (summary; full detail in `docs/DESIGN_TOKENS.md`)

- Tokens only in `css/tokens.css`; use `var(--…)`. No raw hex/rgb elsewhere, no `:root` in `style.css`.
  `tests/design-tokens.test.mjs` enforces it; its allowlist may only shrink.
- Build UI with `js/ui.js` helpers; no one-off variants. New component → add helper + CSS recipe, note it in the PR.
- Meaning colors: gold `--accent` = you / locked points; blue `--provisional` = live points; red `--live` = game in
  progress. Team colors are identity only (crests, badges, team orb), never text, borders or state.
- Motion: gate with `canAnimateLive()` / `fxOn()`; every effect ends on the plain render; reduced motion = instant.
- Gestures through `js/gestures.js` with distances from `js/utils.js`.

## Don't

- Don't add dependencies, a package.json, a framework or a build step without asking.
- Don't call a paid/keyed API from the browser or commit a key; don't print secret values.
- Don't hardcode team/league data outside `js/data.js` / `js/seasons/` / `js/groups.js`.
- Don't write raw colors or new `:root` vars outside `css/tokens.css`.
- Don't deploy, push or merge without being asked. PRs are opened and left for the owner to merge.
- Don't add anything odds- or betting-related.
- Don't rotate VAPID keys or change the KV namespace id.
- When a feature ships or changes, update its `GUIDE` entry in `js/guide.js` and its section in
  `docs/ARCHITECTURE.md`.
