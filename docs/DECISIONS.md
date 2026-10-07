# Decisions

One line each: decision — reason (source). Inferred from code, comments, docs and commits as of 2026-10-05.

## Platform and stack

- Plain static site, native ES modules, no build/bundler/package.json — simplicity; nothing to run before shipping (CLAUDE.md).
- Vanilla JS, no framework; the design handoff's React suggestion was not followed — match the repo (draft-room-plan.md).
- Installed iOS PWA, phone-first — that's how the group uses it (manifest.json, sw.js).
- Service worker network-first with cached-shell fallback; a launch slower than 3s runs wholly from cache — open offline, never mix versions (sw.js, #218).
- Cloudflare Pages for the site, one Cloudflare Worker for everything server-side — a static host can't hold keys or shared state (rundown-proxy.js header).
- No dependencies in the worker either; Web Push/VAPID/aes128gcm written on WebCrypto (CLAUDE.md).
- Tests use `node:test` only, on pure modules shared by browser, worker and Node (tests/).
- One deployment hosts several friend groups on subdomains; code says "group" because "league" means EPL/NFL (CLAUDE.md).
- The Draft keeps un-namespaced worker keys and sends no `?group=` — it predates groups (rundown-proxy.js).

## Data

- ESPN's hidden site API is the primary source for every league — free, unmetered, CORS-open, live (espn-migration-plan.md).
- TheRundown demoted to a per-team fallback — paid/metered; 36 requests once blew a 20,000/day budget (rundown-proxy.js).
- TheSportsDB deprecated, kept only as a fallback branch in `fetchTeamBundle` (CLAUDE.md, espn-migration-plan.md).
- Every proxied upstream GET is edge-cached via `cachedUpstreamFetch` — collapse concurrent viewers into one call (rundown-proxy.js).
- Private keys never in client JS; always proxied (rundown-proxy.js).
- KLIPY called directly from the browser and never cached — KLIPY's terms; key served at runtime from `/gif/config` so it stays out of git and can rotate (CLAUDE.md).
- nflverse depth chart streamed and cut after the newest snapshot — the file is ~50MB, newest-first (rundown-proxy.js).
- NHL clips from the NHL API, resolved to .mp4 in the browser, uncached — ESPN has no NHL video; Brightcove URLs are signed (CLAUDE.md).
- Golf season condensed into KV by the worker so phones never pull whole leaderboards; `site.web.api.espn.com` because `site.api` 403s the worker (CLAUDE.md).
- All content (teams, leagues, scoring) only in `js/data.js` / `js/seasons/` / `js/groups.js` (CLAUDE.md).
- Seasonized data before the draft room — the app must hold two draft classes at once (draft-room-plan.md).
- Finished draft → reviewed, committed season file via export script; no runtime loading of results (draft-room-plan.md).

## Scoring

- Scoring computed only in the browser; the worker stores samples it's sent (points-history, activity) (CLAUDE.md).
- League Facts in KV so one commissioner mark credits every owner; per-team achievements checklist retired (CLAUDE.md).
- `rankAuto` rules derive placement from live standings (CLAUDE.md).
- Rank by projected = locked + live (points-ux-plan.md, 2026-09-25).
- +5 league bonus to each league's Drafted-standings leader; ties go to whoever is listed first, "fine for now" (points-ux-plan.md).
- A league's live table only scores from regular season start through postseason end; then the lock counts — stopped scoring off stale/0–0 tables (points-ux-plan.md).
- MLB/WNBA show live prior-season data flagged as non-scoring rather than hiding it (CLAUDE.md).
- Postseason ladders show for MLB 2026 but don't score; Home's postseason cards wait until the group has drafted, so a pre-draft Home leads with the Draft card (#236, #238).
- Rank events logged only on entering/leaving 1st or moving 2+ places; rank-move alerts for 1st place at most once a day (points-ux-plan.md, #222).

## Trust and auth

- No accounts; drafters are who `js/identity.js` says — friend-group trust tier (CLAUDE.md).
- One shared commissioner password per group (`ADMIN_PASSWORD[_<GROUP>]`), shared-secret only (rundown-proxy.js).
- Favorites, chat, votes, auto-draft toggles: no auth, Origin-checked — wrong trust tier to require a password (rundown-proxy.js).
- Draft identity = trust plus undo; commissioner can undo/edit any pick (draft-room-plan.md).
- Light invite-code gate per group, passed as `?gc=` because WebSockets can't set headers; soft mode before enforcing (CLAUDE.md).
- System admin behind Cloudflare Access, and the worker re-checks the JWT because the same routes are public on workers.dev (CLAUDE.md).
- "Open as commissioner" uses a 12-hour token signed with the group's password; rotating the password cancels tokens (CLAUDE.md).

## Realtime

- Chat and draft rooms are Durable Objects (SQLite, hibernation) — KV is eventually consistent and can't push (CLAUDE.md).
- Reactions in their own table with a full snapshot in every `history` frame — reconnects fetch no old messages (CLAUDE.md).
- Live room clock is soft; only mock rooms auto-pick for expired clocks (CLAUDE.md).
- Auto-draft picks after 0.75s — "a beat so it reads as a pick" (CLAUDE.md, #204).
- Private mock rooms per drafter (`mock-<id>`); shared `mock-1` from Commissioner (#203).
- Local dev talks to `wrangler dev` for chat/claims/roster so testing never posts into a real room (js/worker-base.js).
- Always deploy the worker before the site — old workers ignore/reject new fields (CLAUDE.md, repeated per feature).

## UI

- Design tokens only in `css/tokens.css`, enforced by a test whose allowlist only shrinks (design-system-plan.md).
- UI built through `js/ui.js` helpers; screens migrate when touched, no big rewrite (design-system-plan.md).
- `js/ui.js` is a leaf module — `js/access.js` uses it at boot, importing `utils.js` would cycle (design-system-plan.md).
- Gold/blue/red are meaning colors; team colors identity only (CLAUDE.md, delight-plan.md).
- Filter rows use underline tabs instead of gold pills (#220).
- No team peek modal; every team tap opens the team page (CLAUDE.md).
- Motion on same-document View Transitions with instant fallback; every effect ends on the plain render; big moments play once per device (motion-plan.md).
- Pull to refresh built in-app — iOS standalone PWAs have none (motion-plan.md).
- Commissioner actions live only on Settings → Commissioner — one gate for draft and scoring (CLAUDE.md).
- "Since last time" after 8+ hours instead of "first open of the day" — people won't open daily (delight-plan.md).
- The Race minimap was removed (#222).

## Scope limits (deliberately not built)

- No betting, odds or wagers, ever (feature-design-brief.md, design-system README).
- No user accounts or per-user auth (CLAUDE.md).
- No form to enter seasons from before the app — neither group wanted one; worker still accepts `source: 'manual'` (CLAUDE.md).
- No runtime draft-result loading; export + commit instead (draft-room-plan.md).
- No hard clock / auto-pick in the real draft room (CLAUDE.md).
- No proxying or caching of KLIPY (CLAUDE.md).
- Postseason `fact` events in Activity deferred (points-ux-plan.md).
- No namespacing of localStorage by group — each subdomain is its own origin (CLAUDE.md).
- Landing page draws its spots count once, after the fresh roster loads (1.5s cap), so a stale cache never shows filled spots as open (#239).
- Landing page lists only groups still recruiting (Season Ticket) (CLAUDE.md).
