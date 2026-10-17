# UX improvements plan

From the Boxscore Flow Map review (2026-10-15, `main` at f5fbf3c), a walk through every screen, how people reach it,
what it loads and how often it refreshes. Eleven items, ordered by how much a regular group member would notice. Each
lists the problem, the change, where it lives in the code, and what it means for the design system.

Status: quick wins (items 1–4, 11) shipped 2026-10-15, one PR each (#282–#286); each item below ends with a
**Shipped** note on what was built and where it differs from the plan. Growth items (5–10) are not started and need a
short plan of their own before code.

## Design system rules for every item

Every change below follows `docs/DESIGN_TOKENS.md` and `docs/design-system-plan.md`. Nothing in this plan is a reason to
make an exception.

- **Tokens only.** Colors, type, spacing, radii, shadows, motion and z-order come from `css/tokens.css` through
  `var(--…)`. No raw hex/rgb outside `css/tokens.css`, no new `:root` in `css/style.css`. `tests/design-tokens.test.mjs`
  must pass, and its allowlist may only shrink.
- **Reuse before adding.** Build UI with the `js/ui.js` helpers (`buttonHtml`, `backLinkHtml`, `switchHtml`,
  `filterTabHtml`, `segmentedControlHtml`, `tagHtml`, `sectionCardHtml`, `updatesPillHtml`, …). Where the spec in
  `docs/design-system/components/` already describes a component that has no helper yet (SettingsRow, Banner, Sheet,
  SheetRow), write that helper to the spec's markup rather than another one-off.
- **Meaning colors stay fixed.** Gold = you / locked / selection, blue = live points, red = game in progress. Team
  colors are identity only. Callouts are a soft tint fill + matching 1px border, never a left stripe.
- **Motion** is gated by `canAnimateLive()` / `fxOn()`, ends on the plain render, and is instant under reduced motion.
  Durations and easing come from `--dur-*` / `--ease-*` (and their JS mirrors in `js/utils.js`).
- **Gestures** go through `js/gestures.js` with distances and timings from `js/utils.js`.
- **Copy** is sentence case, plain and short, no emoji in UI, no betting language.
- **Light and dark** are both checked: every new token gets a value in the dark `:root` block and in both light blocks
  (`[data-theme="light"]` and `auto` + `prefers-color-scheme: light`).

### When an item creates something new

If a change needs a value or a component that doesn't exist yet:

1. **New value** (a color, size, radius, duration, z-index): add a token to `css/tokens.css` (dark and light), mirror it
   in `docs/design-system/tokens/*.css`, and add a row to `docs/DESIGN_TOKENS.md`. Prefer a semantic name
   (`--tip-bg`) that points at an existing token (`var(--surface-2)`) over a new raw value.
2. **New component**: add a helper to `js/ui.js` (it stays a leaf: imports only `escape.js` and `icons.js`), its CSS
   recipe in `css/style.css` built only from tokens, a row in the Components table of `docs/DESIGN_TOKENS.md`, and a
   `*.prompt.md` + `*.types.ts.txt` pair in `docs/design-system/components/` so the spec and the app match.
3. Note the new token or component in the PR description, as CLAUDE.md asks.

The **New to the design system** line under each item lists what that item is expected to add. "None" means it must be
built entirely from what exists.

### Every item also

- Updates its line in `js/guide.js` (`APP_ROWS`, one sentence) and its section in `docs/ARCHITECTURE.md` when the
  feature's behaviour changes.
- Bumps `APP_VERSION` (`js/version.js`) for a visible change, and `CACHE_NAME` / `SHELL_FILES` in `sw.js` when the shell
  changes or a file is added.
- Ships worker changes before site changes.

---

## Quick wins

### 1. Make the iPhone setup happen once

**Problem.** On an iPhone, a new member enters the invite code and picks their name twice: once in Safari, then again in
the Home Screen app, which has its own storage and starts from `manifest.json`'s fixed `start_url`. The welcome email's
link carries the code, so the first open is smooth; the second is not.

**Change.**
- On the Add to Home Screen steps (`js/identity.js`, the welcome in a phone browser), show the group's invite code in
  large type with a copy button, and one line: "You'll enter this code once more when you open the app."
- Don't ask for a name in the browser at all when the device can install; ask only in the Home Screen app.
- Have the welcome email say the same thing in its copy (`worker/welcome-email.js`, `{code}` already spells it out).

**Where.** `js/identity.js` (welcome, `openInstallGuide`), `js/access.js` (the code prompt), `worker/welcome-email.js`.

**Design system.** Code display uses `--font-display`, `--type-score`-sized digits, `--surface-2` well with
`--r-sm`; the copy button is `buttonHtml({ variant: 'secondary' })`. Steps use the existing welcome-card recipe.
**New to the design system:** none expected. If a reusable "code display" block turns out to be needed in both the
install steps and the code prompt, add it as a `codeBlockHtml` helper with a spec pair.

**Shipped (#284).** The iPhone steps get a third step when the group has a code: open it from the Home Screen, with the
code in a `--surface-2` well and a Copy button. Android gets none (its installed app shares Chrome's storage). The
name pick already came only after "Continue in browser", so that part needed no change. Differences: the code uses
`--fs-22` in `--font-display`, since `--type-score` is only 17px; the email change is the admin page's default body
(`js/system-admin.js`), so the worker and `js/welcome-template.js` were untouched. No `codeBlockHtml` was needed.

### 2. Stop calling two things "Standings"

**Problem.** The Standings tab is the real league tables. The first segment on Points (`js/overall.js`, key
`standings`) is the group's leaderboard. Same word, two places.

**Change.** Rename the Points segment label to "Leaderboard". Keep the segment key `standings` so `?seg=` links and
saved state keep working, or accept both keys if the key is renamed.

**Where.** `js/overall.js` (segments list), `js/guide.js` (`APP_ROWS` Points line), any copy that says "Points →
Standings" (Activity alerts, `docs/ARCHITECTURE.md`, `docs/points-ux-plan.md`).

**Design system.** Label change only, inside `segmentedControlHtml`. Check the label fits the segment at 375px with
four segments (Leaderboard, Activity, Race, History).
**New to the design system:** none.

**Shipped (#282).** The label is "Leaderboard" and the key stays `standings`. At 375px with four segments each is 84px
and the label 80px, so it fits on one line.

### 3. Tidy Settings for regular members

**Problem.** Settings → League shows "Commissioner" and "Preview with fake data" to everyone. Most members never need
either, and Commissioner sits beside "Draft", which they do need.

**Change.**
- Show the Commissioner row only on a device with a saved password or token. Everyone else gets a small, quiet
  "Commissioner sign-in" link at the bottom of Settings, above the version line.
- Move "Preview with fake data" out of League into a "Preview" section shown only to the commissioner (or behind
  `?view=settings&dev=1` on localhost / Pages previews).
- Leave "Draft" as the first League row.

**Where.** `js/identity.js` (`renderSettingsPage`), `js/admin.js` (where the saved password is read).

**Design system.** This is the moment to add the spec's **SettingsRow** as a helper: Settings rows are hand-written
markup today (`set-row`, `set-row-title`, `set-row-sub`, `set-chev`). The sign-in link is `backLinkHtml`-weight text in
`--text-sub`, not a button.
**New to the design system:** `settingsRowHtml({ title, sub, onclick, chevron, rightHtml })` in `js/ui.js`, matching
`docs/design-system/components/SettingsRow.*`; move existing rows onto it. No new tokens.

**Shipped (#283).** As planned. The helper also takes `switchOn` / `switchKey` for switch rows, and Settings, the
pre-draft Home card and the tour's alert rows all use it. The Preview section also shows on a device that already has
fake data on, so it can be turned off. The sign-in link is a new `.set-link` recipe.

### 4. Give returning members a way home

**Problem.** `boxscore.space` lists only groups still recruiting (`LANDING_GROUPS`). A member of The Draft who types
the bare address has no way to their group.

**Change.**
- When a group's app opens, set a cookie on `.boxscore.space` with that group's id (no personal data). The landing page
  reads it and leads with an "Open The Draft" card above "Find your group".
- With no cookie, add a quiet "Already in a group? Open it" row that lists every group's name and link (from
  `js/groups.js`), not just recruiting ones.

**Where.** `js/group.js` (write the cookie at boot, not in `IS_SEASON_BACKGROUND`), `js/landing.js`, `landing.html`.

**Design system.** The card reuses the landing group card recipe and its handoff animation (`#landing-handoff`); the
row is a SettingsRow-style row from item 3 or a plain `buttonHtml({ variant: 'secondary' })`.
**New to the design system:** none expected.

**Shipped (#285).** The cookie is `bx-group=<id>` (`lastGroupCookie` / `groupFromCookie` in `js/groups.js`), written from
`js/group.js` but not from the hidden `?bg=1` copy; it's a plain host cookie on dev and preview hosts. With it, the
group's card ("Your group", Open ›) sits above "Find your group". Without it, the row is a quiet line of text links
under the button rather than a SettingsRow. Both use the handoff. This names every group on the public page, The
Draft included.

### 11. Teach the hidden gestures once

**Problem.** Several actions have no visible hint: hold a chat message to react, swipe between your teams on a team
page, pull to refresh. One-time moments (the playoffs reveal) can't be found again unless you know `?psreveal=1`.

**Change.**
- A one-time tip the first time someone reaches each place: "Hold a message to react", "Swipe to see your other teams",
  "Pull down to refresh". Shown once per device (localStorage, like `bx-ptp-open`), dismissed by a tap or by doing the
  gesture.
- In the guide (`js/guide.js`), a "Replay" row for any reveal that has already played on this device.
- Align chat's long press with the shared constant: `js/chat.js` uses its own `LONG_PRESS_MS = 450`, while
  `js/utils.js` exports `LONG_PRESS_MS = 380` for `js/gestures.js`. Pick one and import it.

**Where.** `js/chat.js`, `js/team-page.js`, `js/pull-refresh.js`, `js/guide.js`, `js/utils.js`.

**Design system.** Tips float, so they may use a shadow: `--shadow-tip` already exists. Entrance with `--dur-ui` /
`--ease-out`, gated by `canAnimateLive()`; reduced motion shows it in place.
**New to the design system:** a **Tip** component: `tipHtml({ text, onclose })` in `js/ui.js` with a spec pair, plus
semantic tokens if the recipe needs them (`--tip-bg` → `var(--sheet)`, `--tip-ink` → `var(--text)`, and a `--z-tip`
layer: z-order has no tokens yet, so this would be the first, documented in `docs/DESIGN_TOKENS.md`). One tip recipe for all three places, never three.

**Shipped (#286).** `tipHtml` plus `js/tips.js`, with tokens `--tip-bg`, `--tip-ink` and `--z-tip` (250: over the tab
bar, under sheets) and a Tip spec pair. Tips sit at the top of the screen (at the bottom one would cover chat's
composer). They show on touch phones only and never under an open sheet, and go away on a tap, on the gesture, or
after 8 s. Chat now uses the shared 380 ms `LONG_PRESS_MS`. The guide's Replay rows cover each league's playoffs
reveal. Left for later: chat's 10px move cancel vs `MOVE_SLOP` (8px), and a Replay row for the champion moment once
it exists.

---

## For growth

### 5. Give Home a priority rule

**Shipped 2026-10-16:** detailed plan and decisions in `docs/home-priority-plan.md`.

**Problem.** Above your teams, Home can stack the draft card, Since last time, playoff cards (one per league), golf
major cards, the champion card and the last-season row. Each sport added adds another card that can land at the top.

**Change.**
- One written order, in code and in `docs/ARCHITECTURE.md`. Proposed: live draft banner → draft card (before a draft)
  → Since last time → champion (21 days) → playoffs / majors (most recent round first) → last-season row.
- Show at most two cards above your teams. The rest fold into one "More right now (N)" row that expands in place.
- Never hide the draft card or a live draft.

**Where.** `js/board.js` (`renderBoard`, `renderDraftHome`, `renderPlayoffsHome`), `js/since.js`, `js/golf-view.js`
(`golfMajorHomeHtml`), `js/postseason.js` (`postseasonHomeHtml`).

**Design system.** The folded row reuses `updatesPillHtml`'s look or a `sectionCardHtml`; existing cards keep their
recipes and their gold meaning (`--ps-hero-bg` stays for postseason only).
**New to the design system:** possibly a `homeStackHtml({ cardsHtml, more })` helper if the fold is more than a row;
no new tokens.

### 6. Load the rare parts only when used

**Shipped 2026-10-16:** detailed plan and decisions in `docs/lazy-load-plan.md`.

**Problem.** Launch loads 111 of 117 code files (1,771 KB before compression). Every phone loads the Commissioner
console (`js/admin.js`, 82 KB) and every group's draft class (`js/seasons/2026.js` and
`js/seasons/seasonticket-2026.js`, 155 KB together). Both grow with each new group. The draft room already loads on
first open (`setDraftActive`, modulepreloaded when idle).

**Change.**
- Import `js/admin.js` dynamically from `switchView('admin')`, the same way as the draft room.
- `js/seasons/index.js` imports only the active group's season files; other groups' classes load on demand (if ever).
- Look at `js/team-page.js` (137 KB): wide-only parts and golfer parts could load on first use.
- Keep every file in `SHELL_FILES` so offline still works.

**Where.** `js/board.js`, `js/seasons/index.js`, `js/admin.js`, `sw.js`.

**Design system.** No visual change. A first open of a lazy screen shows the existing skeleton (`skeletonRowsHtml`,
`--skeleton`) rather than a blank page.
**New to the design system:** none.

### 7. Lean less on phones for scoring

**Problem.** Scoring only happens in the browser. A day nobody opens the app leaves no Race sample, and "My points"
alerts wait until someone opens it. Quiet groups feel this most.

**Change.** A scheduled worker job (cron) that, once a day, runs the pure scoring modules against cached standings and
writes the points sample if no phone did. Start with the leagues whose ESPN calls the worker can make; ESPN answers
403 to Workers for golf and team lists, so test each endpoint first and leave those to phones.

**Where.** `worker/` (new cron handler, `worker/points-history.js`), the pure scoring modules in `js/`.

**Design system.** Race already draws a missing day; a server-made sample should look the same as a phone-made one.
**New to the design system:** none.

### 8. Share ESPN answers between phones

**Problem.** Standings and scoreboards are identical for every member of every group, but each phone asks ESPN itself.
ESPN publishes no limit; more groups means more identical requests.

**Change.** For ESPN endpoints the worker can reach, an optional edge-cached passthrough (`cachedUpstreamFetch`, short
TTLs: 15–30 s for live scoreboards, minutes for standings). The browser keeps calling ESPN directly as the fallback, so
an old or failing worker is harmless.

**Where.** `worker/rundown-proxy.js`, `js/espn.js`.

**Design system.** No visual change.
**New to the design system:** none.

### 9. Add a group without a code change

**Problem.** A new group means editing `js/groups.js`, deploying, and adding the subdomain to the Pages project by hand.

**Change.** Move the group registry into KV (the roster, size and sports records already live there), add a wildcard
`*.boxscore.space` custom domain, and let the system admin page create a group. `js/groups.js` keeps the built-in
groups as the fallback.

**Where.** `js/groups.js`, `js/group.js`, `worker/system-admin.js`, `js/system-admin.js`, Pages / DNS settings.

**Design system.** The "New group" form on the admin page uses existing admin page recipes and `buttonHtml`.
**New to the design system:** none expected.

### 10. Light personal sign-in when strangers join

**Problem.** Anyone can pick any name on any device (Settings → Switch). Right among friends, but groups that fill
through the landing page will include people who don't know each other.

**Change.** A personal link in each welcome email (`#me=<signed token>`, signed like the commissioner token) that ties
the device to that drafter. Name switching stays for groups that don't turn it on. No passwords, no accounts.

**Where.** `worker/welcome-email.js`, `worker/commissioner-token.js` (pattern), `js/identity.js`, `js/access.js`.

**Design system.** A signed-in identity card can show a small `tagHtml` ("Verified") in `--text-sub`; it must not use
gold, which means "you" already.
**New to the design system:** none expected; if a new tag variant is needed, add it to `tagHtml` and the Tag spec.
