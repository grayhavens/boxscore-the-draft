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

- Nothing queued. Run a Season Ticket rehearsal (`node tools/rehearse-draft.mjs --group seasonticket`) before its draft.

## Not started

- Delight Phase 3: chat hold-and-slide reactions + swipe to reply (`replyTo` not in code) (planned, not a priority yet; keep the plan details, delight-plan.md).
- Delight Phase 6: champion crowned full-screen moment — must be ready before the first league locks (planned, not a priority yet; keep the plan details, delight-plan.md).
- Postseason `fact` events in Activity (deferred, points-ux-plan.md).
- Scoring automation, remaining gaps (commissioner marks until built): WNBA semifinals / Finals / Commissioner's Cup (the playoff miss is automatic); college basketball conference tournaments (NCAA Tournament rounds score automatically); college football "Don't make a bowl" (needs an FBS list); confirm MLB "NLCS" / "ALCS" / "World Series" headlines once played. Each needs a real ESPN payload captured first (tests/fixtures/espn-*.json).
- Draft-room open items: draft date/cutover, old-class fidelity, worker allowlists vs. season keys, EPL/WNBA 2027 field check (draft-room-plan.md "Open items"). Still open; to address at the end of this draft year / before next season.

## Branches

- Only `main` (plus this docs branch). `design-handoff` was deleted 2026-10-03 (its one commit, `ae0f222`, was a design system import leftover).
