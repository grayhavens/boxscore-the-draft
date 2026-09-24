# Draft day runbook

How to rehearse, run and wrap up the live draft. The design and phase history are in
`docs/draft-room-plan.md`; its **Before draft day** section is the running to-do list. This file is the
step-by-step for the commissioner.

## 0. What has to be true before anything else

- [ ] The draft room UI and commissioner controls are **merged and deployed**. The commissioner bar
      (Pause / Undo / Trade / Reset, "Pick for", click-a-pick-to-change) and the phone layout live in the
      Phase E PR; without them you can run a draft but not fix one.
- [ ] The **worker is deployed before the static site** (it carries the `DraftRoom` Durable Object
      migration): `cd worker && npx wrangler deploy`. `DASHBOARD_WORKER_BASE` in `js/api.js` must point
      at it.
- [ ] `ADMIN_PASSWORD` is set as a worker secret (`npx wrangler secret put ADMIN_PASSWORD`). It is the
      commissioner password in the draft room and on Manage Scoring.
- [ ] Everyone's device has the latest site (the service worker refreshes on the next open; the tiny
      build tag in the corner confirms it).

## 1. Rehearse (do this at least twice, the last one in the final week)

**Automated, no friends needed.** Against a local worker (`cd worker && npx wrangler dev --var ADMIN_PASSWORD:testpw`
and a static preview of the site on port 8934):

```bash
node tools/rehearse-draft.mjs --chaos 2
```

It runs a whole 210-pick draft with ten real WebSocket drafters and a commissioner, and deliberately goes
wrong along the way: pauses, undos, removed picks, trades, dropped connections, double-taps, out-of-turn
picks, write-ins, a pool replacement mid-draft. It then checks the result (210 picks, every roster exactly
on its caps, no team twice, every pick on its slot owner, every client agreeing) and dry-runs the export.
Exit code 0 means pass. `--seed N` reproduces a run; `--chaos 0` is a clean run.

**Against the deployed worker** (does not touch the real room; rehearsal rooms are throwaway):

```bash
node tools/rehearse-draft.mjs --preflight --base https://<your-worker>.workers.dev \
  --origin https://boxscorethedraft.pages.dev --password '<ADMIN_PASSWORD>'
```

The preflight checks that the worker answers, the socket connects from the site's origin, the wrong
password is refused and the right one accepted. Run it the morning of the draft.

**With people.** Pick a throwaway room and have everyone open
`https://boxscorethedraft.pages.dev/?view=draft&room=mock-1` (Settings → League → Draft room gives the real
room; add `&room=mock-1` for a rehearsal). Use a short clock (30s). Try, on purpose: a phone, a dropped
connection (airplane mode for 20s), a missed clock, a wrong pick you then change, a trade. To rehearse
*your own* seat while bots fill the rest:

```bash
node tools/rehearse-draft.mjs --human josh --chaos 0 --room mock-2
```

Open the URL it prints, sign in as that drafter (Settings → Signed in as), and the bots wait for you.

Rehearsal rooms persist. Once a rehearsal is running or finished, the commissioner bar's **Reset** returns it
to the lobby; or just use a new room name.

## 2. Draft-day setup (about 15 minutes before)

1. Run the preflight above.
2. Open `?view=draft` (the real room, "main"). Sign in as commissioner in the lobby (password field).
3. **Load team pool.** It should say 258 teams. If EPL promotion/relegation or WNBA expansion changed the
   field, `js/draft-ranks.js` must already reflect it (see the plan's *Before draft day*).
4. Set the clock length (90s default; the clock is soft — it counts up in red, nothing auto-picks).
5. **Run lottery.** Everyone watching the lobby sees the order revealed from pick 10 up to pick 1. Re-run
   is available until you start.
6. **Start draft** when everyone is in. The header pill reads "Live · Round 1 · Pick 1 of 210".

## 3. Running it

| Situation | What to do |
|---|---|
| Someone's clock runs out | Nothing happens automatically. Wait, or **Pick for {name}** on the on-the-clock card (draft as them). |
| Someone is disconnected | They reconnect on their own when they reopen the app; the room keeps everything. Meanwhile **Pick for** works, or **Pause**. |
| A wrong pick | Click the pick on the board → **Change this pick**: *remove and pick for {owner}* or *remove and let {owner} re-pick*. It becomes a make-up pick, then the draft resumes where it was. |
| The last pick was a mistake | **Undo pick** removes the most recent one. |
| Need a break | **Pause** stops the clock everywhere; **Resume** continues it with the elapsed time kept. |
| A pick trade | **Trade** → choose two open picks. The board and the on-the-clock card ("via …") update for everyone. |
| A school isn't in the pool (CFB/CBB) | Any drafter can search for it and use **Add to CFB / CBB**; it then drafts like any team. |
| Something looks wrong | Don't Reset. Pause, then check `…/draft/result?room=main` (the worker's own record of every pick). |

**Reset** clears every pick and the lottery. Only use it in rehearsal.

## 4. After the draft

1. Header pill says "Draft complete". Open `https://<worker>/draft/result?room=main` and confirm 210 picks.
2. Dry-run the export and read the report:
   ```bash
   node tools/export-draft.mjs --dry-run
   ```
   It refuses to write if any roster is off its caps, a team is drafted twice, or a team can't be placed
   on ESPN (it suggests near matches; `--overrides file.json` fixes one: `{"cfb:Kent Sate": "2306"}`).
   Teams it generated from ESPN (not in last year's class) are listed for a glance.
3. Write it: `node tools/export-draft.mjs`. This creates `js/seasons/<year>.js` and registers it in
   `js/seasons/index.js` and `sw.js`. Review `git diff`; entries marked `// generated from ESPN` deserve a
   look (name, colors, crest).
4. Commit, open the PR, merge. Cloudflare Pages deploys the site.

### What flips when the new class ships

- The app opens on the **newest class by default** (`LATEST_SEASON_ID`). The old class stays fully live
  until its last league finishes, and is one tap away: Settings → League → **Draft Class** → *Viewing*
  (or a `?season=2026` link). While an older class is showing, a banner at the top says so, with a
  "Switch to 2027" button.
- A device's choice is remembered only while that class is still the newest one it was made under, so when
  the next class ships everyone lands on it and can switch back if they want.
- The old class's finished leagues render from their saved end-of-season snapshot (the season lock), but
  only for leagues that were **locked while that class was still the newest**. Check on the Manage Scoring
  page that every league that has finished its season shows "Locked" before the new class goes live;
  anything not yet locked will start showing the next season's numbers for the old class.
- Points, facts, adjustments, favorites and locks are stored per class, so nothing from the old class is
  overwritten.
- The old class's team modals (schedule, stat strip) still read live ESPN data; that is a known gap.

## 5. If something breaks mid-draft

- **The room stops answering.** The state is persisted in the Durable Object; nothing is lost. Reload the
  page, and check `/draft/result?room=main`. If the worker is down, wait; do not start a second room.
- **A drafter's picks aren't registering.** They must be signed in as themselves (Settings → Signed in as).
  The server checks the sender against the slot owner.
- **You need to continue off-app.** `/draft/result?room=main` lists every pick so far in order. Keep it open.
