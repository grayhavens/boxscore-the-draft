# Roadmap

As of 2026-10-05 (`main` at 8f86049, PR #239). No open PRs or GitHub issues; no TODO/FIXME comments in code.
"(inferred)" = deduced from code/docs, not stated as a status anywhere.

## Done

- Seasonized data, freeze/lock support, draft engine, draft UI, commissioner controls, export, rehearsal tooling (draft-room-plan.md phases A–G).
- ESPN migration for all 8 leagues; TheSportsDB deprecated (espn-migration-plan.md).
- Groups on subdomains, landing page with spot claims, roster confirm, invite codes, group sports (CLAUDE.md).
- Chat: reactions, mentions/@everyone, shared game cards, GIFs, moderation (CLAUDE.md).
- Push alerts: draft pick, points, chat, mentions, draft time (CLAUDE.md).
- Points UX refactor phases 1–8, Race segment phases 1–4, points history, On the line, league history (points-ux-plan.md, points-race-plan.md).
- System admin page and Commissioner desktop console (#182–#185).
- Design system Steps 1–2 (`css/tokens.css`, `js/ui.js`, token test) (design-system-plan.md).
- Motion Phases 1–5 (draft room, Scores, Points, team page, chat burst, pull to refresh) (motion-plan.md).
- Delight Phase 1 (draft room hero), Phase 2 (team page), Phase 4 (Since last time) (delight-plan.md).
- Golf plan steps 1–5: per-group caps, data layer, draft pool, golfer UI (`js/golf-view.js`), `golfAuto` scoring and bonus (golf-plan.md). Export tool group support: done (`--group`). Guide entry: done. Majors on Home (golf-majors-plan.md): done.
- Postseason ladder and playoffs reveal for NFL, CFP, NCAA Tournament and MLB (MLB 2026 shown but non-scoring), with Home cards only once a group has drafted (#228, #235, #236, #238).
- Scoring automation: NFL/CFP/NBA/NHL/MLB playoff rounds, WNBA playoff miss, CFB bowls and conference titles, EPL cups and European spots (#229, #231).
- Delight Phase 5 (landing page): scroll tour, standard setup, "Interested in Boxscore?" sign-up (#237).
- Perigon "More news" with team matching tightened (#232, #233); Since last time waits for ranks on a slow launch (#234).
- Recent: one rank move per day, Race minimap removed (#222); simpler Next game card (#221); underline filter tabs (#220).

## In progress

- Design system Step 3: moving screens to `js/ui.js` as they're touched; several spec components have no helper yet (inferred, design-system-plan.md).
- Pre-draft hygiene for the next live draft: verify ranked team lists, re-run `tools/golfer-pool.mjs` and outlooks (draft-room-plan.md "Before draft day", CLAUDE.md).

## Next up

- UX quick wins 1–4 and 11 from `docs/ux-improvements-plan.md` (listed under Not started), each its own small PR.
- Run a Season Ticket rehearsal (`node tools/rehearse-draft.mjs --group seasonticket`) before its draft.

## Not started

### UX improvements (ux-improvements-plan.md, from the 2026-10-15 flow map review)

Every item follows the design system (tokens from `css/tokens.css`, helpers from `js/ui.js`, meaning colors fixed);
anything new becomes a token or `js/ui.js` helper with a spec pair in `docs/design-system/` and a row in
`docs/DESIGN_TOKENS.md`. See the plan's "Design system rules for every item".

Quick wins:
- 1. iPhone setup once: show the invite code on the Add to Home Screen steps, ask for a name only in the Home Screen app (identity.js, access.js, welcome email). New to the design system: none expected.
- 2. Rename Points' "Standings" segment to "Leaderboard", keeping the `?seg=` key (overall.js, guide.js). New: none.
- 3. Tidy Settings: Commissioner row only on a signed-in device, a quiet "Commissioner sign-in" link otherwise; move "Preview with fake data" out of League (identity.js). New: `settingsRowHtml` helper to the existing SettingsRow spec.
- 4. A way home from boxscore.space: remember the last group in a `.boxscore.space` cookie, plus an "Already in a group?" row listing every group (group.js, landing.js). New: none expected.
- 11. One-time hints for hold to react, swipe between teams and pull to refresh; Replay rows in the guide; chat's long press on the shared `LONG_PRESS_MS` (chat.js uses 450, utils.js 380). New: a Tip component (`tipHtml` + spec pair) and tokens `--tip-bg`, `--tip-ink`, `--z-tip` (first z-order token).

For growth:
- 5. Home priority rule: one written card order, at most two cards above your teams, the rest in a "More right now (N)" row (board.js, since.js, postseason.js, golf-view.js). New: possibly a `homeStackHtml` helper; no tokens.
- 6. Load rare parts on demand: Commissioner console (82 KB) and other groups' draft classes (155 KB), maybe team page extras; skeletons while loading (board.js, seasons/index.js, sw.js). New: none.
- 7. Daily server-side points sample when no phone reported, for the leagues ESPN lets the worker read (worker cron, points-history.js). New: none.
- 8. Optional edge-cached ESPN passthrough with the browser's direct call as fallback (rundown-proxy.js, espn.js). New: none.
- 9. Groups in KV with a wildcard subdomain, created from the system admin page (groups.js, system-admin.js). New: none expected.
- 10. Personal sign-in link in welcome emails, signed like the commissioner token, opt-in per group (identity.js, welcome-email.js). New: none expected; any tag variant goes through `tagHtml` and the Tag spec.

### Other

- Delight Phase 3: chat hold-and-slide reactions + swipe to reply (`replyTo` not in code) (planned, not a priority yet; keep the plan details, delight-plan.md).
- Delight Phase 6: champion crowned full-screen moment — must be ready before the first league locks (planned, not a priority yet; keep the plan details, delight-plan.md).
- Postseason `fact` events in Activity (deferred, points-ux-plan.md).
- Scoring automation, remaining gaps (commissioner marks until built): WNBA semifinals / Finals / Commissioner's Cup (the playoff miss is automatic); college basketball conference tournaments (NCAA Tournament rounds score automatically); college football "Don't make a bowl" (needs an FBS list); confirm MLB "NLCS" / "ALCS" / "World Series" headlines once played. Each needs a real ESPN payload captured first (tests/fixtures/espn-*.json).
- Draft-room open items: draft date/cutover, old-class fidelity, worker allowlists vs. season keys, EPL/WNBA 2027 field check (draft-room-plan.md "Open items"). Still open; to address at the end of this draft year / before next season.

## Branches

- Only `main` (plus this docs branch). `design-handoff` was deleted 2026-10-03 (its one commit, `ae0f222`, was a design system import leftover).
