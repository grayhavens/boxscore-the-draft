# Lean less on phones for scoring (UX item 7)

The detailed plan for item 7 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code.

## The problem

Scoring only happens in a browser. The day's Race sample, Activity events and "My points" alerts all ride on one
browser's Activity PUT (`js/activity.js` → `PUT /activity` → `worker/points-history.js`). A day nobody opens the app
leaves no sample, and alerts wait for the next person who does. Quiet groups feel this most.

## Why the first idea doesn't work

The first idea was a worker cron that runs the pure scoring modules against cached standings. Two things rule it out:

- **ESPN refuses Cloudflare.** Since 2026-10-15, ESPN answers 403 to every request from a Worker (`worker/golf.js`'s
  note). On 2026-10-16 the deployed worker's ESPN-backed golf route still fails upstream. A worker can't fetch the
  standings it would score.
- **Scoring isn't one pure function.** `obRankedRows` (`js/overall.js`) reads rules through `getLeagueRuleTeams`
  (`js/league-facts.js`), which pulls from facts, locks, postseason ladders, playoff series, bowls, cups and golf, each a
  browser module with its own fetches and caches. A partial server sample isn't allowed either: `parseSample` rejects
  anything without every drafter's totals, so the chart never shows a fake drop.

## The plan: a daily robot visit

Once a day, GitHub Actions opens each group's real app in a headless browser, lets it boot and run its normal scoring,
then closes it. To the worker it's just one more phone. Everything stays exactly as the browser computes it, with no
second copy of the scoring to keep in step.

- **Where:** `.github/workflows/daily-scoring.yml`, on a schedule (`cron: '30 13 * * *'`, 8:30 Central, after
  overnight games are final, before most people wake up) plus a manual button (`workflow_dispatch`). The repo is
  public, so Actions minutes are free.
- **How:** one job per group (matrix: `thedraft`, `seasonticket`). Each:
  - opens `https://<group>.boxscore.space/?robot=1` in headless Chromium via Playwright, installed in the job with
    `npx playwright@<pinned version> install chromium`. Nothing is added to the repo: no `package.json`, no app
    dependency;
  - waits for a "done" signal (below), up to 3 minutes;
  - exits.
- **The invite code:** a gated group's code is a GitHub Actions secret (`GROUP_CODE_SEASONTICKET`), passed in the URL
  the way an invite link carries it. It never lands in the repo.
- **`?robot=1` in the app** (`js/season.js` next to `IS_SEASON_BACKGROUND`):
  - It runs the same scoring-only boot as the hidden background copy: skip drawing, chat, polling and the splash,
    and do locks, Activity and the Race sample.
  - Then it sets `document.documentElement.dataset.robotDone = '1'` (or `'skipped'` when the Activity run had nothing
    to write) for the job to wait on.
  - It never asks for notifications, never writes `bx-group` or `bx-last-seen`, and has no identity, since scoring is
    group-wide.
  - It only counts on the production hosts, so a stray `?robot=1` elsewhere is just the normal app.
- **Nothing changes in the worker.** The PUT is a compare-and-swap on `dataAt`, so the robot can't rewind anything. A
  phone that already wrote a newer sample wins, and two runs can't log an event twice.
- **Alerts:** "My points" alerts go out when the robot's run logs events, the same as when a phone does. A quiet group
  gets its morning alerts at 8:30 instead of whenever someone opens the app.
- **Seeing that it works:** the system admin page already shows days since each group's last Race sample
  (`js/system-admin.js`). It now also shows the last robot run's result, from a tiny `robot@<group>` KV record
  written through an existing admin-only route. If that turns out to be more than a line, a failed workflow run
  (GitHub emails the repo owner) is enough.

## Risks

- **ESPN might block GitHub's runners too.** They're Azure IPs, not Cloudflare, so it's unlikely, and the first manual
  run shows it at once. If it happens, this plan stops there; nothing else depends on it.
- **A broken boot fails quietly.** The job fails when `robotDone` never appears, and GitHub emails on failure.
- **Golf groups:** golf's season is built in the browser from ESPN (`js/golf-api.js`), so it works the same in the
  robot.

## Not doing

- **Scoring in the worker.** Blocked by ESPN, and it would duplicate the scoring logic.
- **Cloudflare Browser Rendering** (a headless browser inside Cloudflare). It would likely hit the same ESPN 403, and it
  needs a paid plan or an npm dependency.

## Checks

- A manual workflow run per group: `robotDone` appears, `GET /points/history` gains today's day, and the system admin
  page shows it.
- `?robot=1` locally against `wrangler dev`: nothing draws, the Activity PUT goes out, and no `bx-*` cookie or
  localStorage is written.
- Unit test for the robot-mode check (production hosts only).

## Decisions (2026-10-16: all three as proposed; building now)

1. **Run it on GitHub Actions with Playwright installed in the job?** Proposed: yes. It's CI-only, so nothing is added
   to the app or the repo's dependencies, but it is a new moving part.
2. **What time?** Proposed: 8:30 Central daily.
3. **Track runs on the system admin page, or just rely on GitHub's failure emails?** Proposed: GitHub's emails first;
   add the admin line only if runs fail without anyone noticing.
