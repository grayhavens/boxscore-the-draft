# Roadmap

As of 2026-10-15 (`main` at ba4e689, PR #286). No open PRs besides this docs one (#281); no GitHub issues; no TODO/FIXME comments in code.
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
- UX quick wins from the 2026-10-15 flow map review (ux-improvements-plan.md items 1–4, 11), shipped 2026-10-15:
  Points' "Leaderboard" segment (#282); Settings shows Commissioner only on a signed-in device, Preview section,
  `settingsRowHtml` helper (#283); iPhone install steps show the invite code (#284); a way home from `boxscore.space`
  via the `bx-group` cookie (#285); one-time gesture tips, guide Replay rows, shared `LONG_PRESS_MS`, Tip component and
  the first z-order token `--z-tip` (#286).
- Golf: golfers get full team pages (#275), the season is built in the browser with per-golfer news (#278, #279), tour
  RSS feeds for golf news (#280). Last season keeps scoring after the next draft (#277). Android back keeps the URL (#276).
- Earlier: one rank move per day, Race minimap removed (#222); simpler Next game card (#221); underline filter tabs (#220).

## In progress

- Design system Step 3: moving screens to `js/ui.js` as they're touched. SettingsRow (#283) and Tip (#286) now have helpers; Banner, ChatBubble, ChatComposer, Sheet and SheetRow still don't (design-system-plan.md, DESIGN_TOKENS.md).
- Pre-draft hygiene for the next live draft: verify ranked team lists, re-run `tools/golfer-pool.mjs` and outlooks (draft-room-plan.md "Before draft day", CLAUDE.md).

## Next up

- Check on a real iPhone what the preview couldn't: the invite code's Copy button on the install steps (#284) and the
  three one-time tips (#286).
- Write short plans for the UX growth items 5–10 (below) before any code; item 5 (Home priority rule) first.
- Run a Season Ticket rehearsal (`node tools/rehearse-draft.mjs --group seasonticket`) before its draft.

## Not started

### UX improvements (ux-improvements-plan.md, from the 2026-10-15 flow map review)

Every item follows the design system (tokens from `css/tokens.css`, helpers from `js/ui.js`, meaning colors fixed);
anything new becomes a token or `js/ui.js` helper with a spec pair in `docs/design-system/` and a row in
`docs/DESIGN_TOKENS.md`. See the plan's "Design system rules for every item".

Quick wins 1–4 and 11: shipped (see Done, #282–#286).

For growth (each needs a short plan of its own first):
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
- Small follow-ups from the quick wins: chat's long press still cancels at 10px of movement where `js/gestures.js`
  uses `MOVE_SLOP` (8px); the guide's Replay rows cover only playoffs reveals (add the champion moment once Delight
  Phase 6 exists); the landing page now names every group, The Draft included (#285), so revisit if a group should
  stay unlisted.
- Draft-room open items: draft date/cutover, old-class fidelity, worker allowlists vs. season keys, EPL/WNBA 2027 field check (draft-room-plan.md "Open items"). Still open; to address at the end of this draft year / before next season.

## Branches

- `main`, plus merged branches not yet deleted: the five `ux/*` quick-win branches (#282–#286), `golfer-pages` (#275),
  `season-overlap` (#277), `claude/eloquent-volhard-2642ce` (#276), `claude/project-thread-ww6hgn` (#279) and this docs
  branch. All are safe to delete. `design-handoff` was deleted 2026-10-03.
