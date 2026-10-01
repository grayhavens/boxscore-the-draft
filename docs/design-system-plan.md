# Boxscore design system: adoption plan

This is a handoff for a Claude Code session in `boxscorethedraft`. The goal is for every screen to be built from one set of tokens and one set of UI helpers, and for those to match the Boxscore design system exactly.

## Ground rules

- **The repo is the source of truth for CSS.** The design system was lifted from `css/style.css`, and its class names now match the app's own. The app never loads React or `_ds_bundle.js`.
- **The design system is the spec.** `docs/design-system/components/*.types.ts.txt` lists each component's options. `*.prompt.md` says when to use it. `components.css` is the reference CSS for each recipe.
- **Same markup on both sides.** A `ui.js` helper must output exactly the class structure that the matching design-system component renders. That way a sync from GitHub keeps the two identical.

## Step 1: Pull the tokens into their own file

Move every custom property out of `css/style.css` into a new `css/tokens.css`: the `:root` block and the `data-theme` light/auto blocks for colors, `--font-*`, `--fs-*`, `--track-*`, `--r-*`, spacing, shadows, and `--ease-*`/`--dur-*`. Load it first in `index.html` and `landing.html`. Don't change any values. The point is that tokens live in one file the design system can pull on each GitHub sync.

## Step 2: Add `js/ui.js`

Add one exported function per component. Each one returns an HTML string, just like the rest of the app. Escape any text that comes from users or the API with the existing `esc` helper. Options mirror the component's `.types.ts.txt`.

The helpers below are listed as **helper: classes it outputs (where the markup lives today)**.

**Core**
- `buttonHtml({ label, variant, onclick })`: `modal-cta`, `.secondary` (all files)
- `iconButtonHtml({ icon, label, ghost })`: `icon-btn` (new, replaces one-off icon buttons)
- `filterChipsHtml({ items, value, size })`: `filter-chips` / `filter-chip.active` (board.js, live-now.js)
- `scopeChipHtml({ label })`: `scope-chip` (board.js)
- `segmentedHtml({ options, value, size })`: `seg` / `seg-thumb` / `seg-btn` (overall.js, live-now.js)
- `switchHtml({ on, label })`: `switch.on` (identity.js)
- `tagHtml({ kind })`: `status-tag.live|.locked|…` (new: consolidates the ad-hoc live/locked tags)
- `countBadgeHtml(n)`: `count-badge`
- `liveDotHtml({ pulse })`: `dot.pulse`
- `iconHtml(name)`: SVG strings from `docs/design-system/components/icon-data.js.txt` (replaces scattered `*_SVG` constants)
- `favoriteStarHtml({ on, teamKey })`: `favorite-star` (favorites.js)

**Data**
- `teamBadgeHtml({ team, size })`: `badge`, `.md/.sm`, `.badge-crest` (everywhere)
- `teamRowHtml({ team, sub, status, clickable })`: `team` / `team-main` / `team-name` / `team-sub` / `status-slot` (board.js)
- `leagueCardHtml({ league, count, rows })`: `league` / `league-tab` / `league-dot` (board.js)
- `gameCardHtml(game)`: `tg-row` / `tg-rail` / `tg-card` / `tg-side` / `tg-score` + `odo-d`/`odo-strip` (live-now.js)
- `pointsTableHtml(rows)`: `ob-table` / `ob-table-row` / `ob-rank` / `ob-move` (overall.js)
- `splitBarHtml({ locked, live, size })`: `split-bar` / `split-swatch` (overall.js)
- `activityRowHtml(item)`: `act-row` / `act-tile` / `act-body` / `act-delta` (activity.js)

**Feedback**
- `bannerHtml({ title, body })`: `peek-banner` (board.js)
- `sheetHtml({ title, sub, body })` + `sheetRowHtml({ label, desc, checked })`: `modal-overlay` / `modal` / `sheet-title-row` / `sheet-row` / `sheet-check` (sheet.js, scoring-sheet.js)
- `settingsRowHtml({ title, sub, chevron })`: `set-row` / `set-row-text` (identity.js)

**Navigation and chat**
- `pageHeaderHtml({ title, logo })`: `page-header` / `page-header-top` / `app-logo` (index.html, guide.js, identity.js)
- `backLinkHtml({ label, onclick })`: `ob-back`. This replaces `gd-back`, `team-page-back`, `cmp-sticky-back` and `admin-desk-back`.
- `tabBarHtml`: stays static in `index.html`. Just confirm it matches `tab-bar` / `tab-pill` / `tab-btn`.
- Chat: the `chat-bubble`, `chat-reactions`, `chat-composer` and `chat-game` / `cg-*` markup in chat.js and game-card.js should match `ChatBubble`, `ReactionBar`, `ChatComposer` and `SharedGameCard`.

## Step 3: Move screens over gradually

Don't do one big rewrite. When a task touches a screen, swap that screen's markup for `ui.js` calls in the same change. Suggested order, highest reuse first: buttons and back links, then chips and segmented controls, team badge and row, sheets, game card, and finally the points table.

Where a screen uses a one-off version of a component, such as the four back-button styles, keep the design-system one and delete the CSS for the others.

## Step 4: Keep it that way

1. Paste the snippet below into the repo's `CLAUDE.md`.
2. Add `tests/design-tokens.test.mjs`. It fails if `css/style.css` or any `js/*.js` contains a hex or `rgb(` color outside `css/tokens.css`. Allow existing exceptions with a short allowlist, such as team colors from `data.js`.
3. After UI changes ship, sync the design-system project from GitHub so its cards show the real app.

### `CLAUDE.md` snippet

```md
## Design system

Boxscore's UI comes from the Boxscore design system. The spec is in `docs/design-system/`
(`components/*.types.ts.txt` for options, `*.prompt.md` for usage, `components.css` for the reference recipes).

- Tokens live only in `css/tokens.css`. Use `var(--…)`. Never write raw hex/rgb colors, font
  sizes, radii, easings or durations anywhere else. `tests/design-tokens.test.mjs` enforces this.
- Build UI with the helpers in `js/ui.js` (buttonHtml, filterChipsHtml, segmentedHtml, teamBadgeHtml,
  teamRowHtml, gameCardHtml, sheetHtml, backLinkHtml, …). Don't hand-write markup for something a
  helper covers, and don't add a one-off variant of an existing component.
- If you need something the system doesn't have, add it to `js/ui.js` and `css/style.css` with a
  matching class recipe, and note it in the PR so the design system can add the component.
- Motion follows `docs/motion-plan.md`. Gate everything with `canAnimateLive()`.
- Meaning colors: gold (`--accent`) means you or locked points, blue (`--live`/`--provisional`) means
  live points, and team colors appear only on the team page hero and crests.
```

## Notes from checking this plan against the repo (2026-10-01)

- **Step 1 isn't a pure move.** Some tokens in `docs/design-system/tokens/*.css` aren't in `css/style.css` yet:
  `--r-badge*`, `--r-table`, `--r-hero`, `--r-cta`, `--r-seg*`, `--space-*`, `--shadow-*` (except `--focus-ring`),
  `--type-*`, `--league-*`, `--fill-soft`, `--knob`, `--hit-min`, and the semantic aliases. `css/tokens.css` is
  then the existing tokens moved over unchanged, plus these as new definitions. Nothing has to use the new
  ones in Step 1. Screens pick them up as they move over in Step 3.
  **Done:** `css/tokens.css` holds `style.css`'s token blocks moved over exactly, plus an "Added from the
  design system" block. By then the style pass (#190) had already added `--fill-soft`, `--shadow-*`, `--knob`
  and some others, so the block has only what was still missing. Computed tokens and element styles on Home,
  landing and admin match `main` at phone and desktop widths in both themes. App tokens the design system
  doesn't list yet (`--card-yellow`, `--card-ring`, `--race-*`, `--console-rail`) stay, and the design system
  should pick them up on its next sync.
- **Some classes are new.** `.status-tag` and `.icon-btn` don't exist in `style.css` yet. `.seg` here has an
  absolutely positioned `.seg-thumb`, while the app's segmented controls (`segmentedControlHtml` in `utils.js`,
  plus `ob-seg` and `hiw-seg`) don't. Before swapping a screen's markup, diff its recipe in
  `components.css` against the real CSS. Where they differ, the app's rendering wins until someone decides
  otherwise. Note it in the PR.
- **Keyframes stay in `css/style.css`.** `tokens.css` holds custom properties only. The `@keyframes` in
  `tokens/motion.css` go in the motion section of `style.css`, next to the motion plan's new ones.

## Combined order with the motion plan

`docs/motion-plan.md` (timings in `docs/motion-reference/*.jsx`) is the motion half of the design system.
The two plans share tokens and screens, so they run as one sequence:

1. **DS Step 1, tokens.** Do this first because it's mechanical and small. `js/motion-fx.js` reads its curves
   and durations from the same tokens.
2. **Motion Phase 1, draft room.** Do this before draft day; it's the only deadline. The design system
   doesn't cover the draft room yet, so this doesn't wait on `ui.js`. New pieces of markup it needs (the
   pick toast, the "order flips" pill) go in as `ui.js` helpers with a matching CSS recipe and get flagged
   for the design system, as the CLAUDE.md snippet above says.
3. **DS Step 2, `js/ui.js`,** plus the token test and the CLAUDE.md section. Move buttons and back links
   over as a first proof.
   **Done.** Notes:
   - **What `js/ui.js` has:** only helpers checked against markup the app already renders, each moved over
     everywhere it's used: `buttonHtml` (every `.modal-cta` built in JS), `backLinkHtml` (every `.ob-back`, plus
     the team page's identical `.team-page-back`, whose CSS is gone), `iconHtml` (the icon set, now
     `js/icons.js`) and `switchHtml`. The other core helpers (chips, scope chip, tag, icon button, live dot,
     count badge, segmented) arrive with their first screen, so no helper ships as untested markup.
     `segmentedControlHtml` in `js/utils.js` already renders the `.seg` recipe.
   - **What changed in the CSS:** `.modal-cta` takes the recipe's flex layout (`display: flex`, centered, 8px
     gap), which makes `.ob-scoring-btn` and `.gd-share`'s own flex rules redundant. Icons keep their own size
     attributes, because a blanket 15px `.modal-cta svg` rule would shrink Share to chat's 17px icon.
     Screenshots-equivalent check: every converted button and back link has the same box, label, icon
     position and computed styles as on `main`. The only differences are `display: flex` and an explicit
     `type="button"`.
   - **Leaf module:** `js/ui.js` must stay a leaf (`js/escape.js` holds `escapeHtml` now, re-exported from
     `js/utils.js`). `js/access.js` uses it at boot, and importing `js/utils.js` there would cycle through
     `js/data.js` back to `js/group.js`.
   - **The other three back buttons (decided 2026-10-01):** Game Details' round back (`gd-back`) is now the
     design system's `IconButton` (`iconButtonHtml`, `.icon-btn`; its chevron went from 16px to 14px), and
     Compare's sticky-bar chevron and the desktop Commissioner gate's "‹ Settings" are now the standard
     `BackLink`. Compare's sticky bar now reads "‹ Josh · Josh −7 …", matching the page's own back link.
4. **Each later motion phase goes with its screen's move to `ui.js`,** in the same change, so each screen's
   markup only gets rewritten once:
   - Motion Phase 2 (Scores) with `gameCardHtml`. **Done:** `gameCardHtml`, `gameSectionHtml` and `tagHtml` (with the `.status-tag` recipe). The app keeps its `.tg-section-head` wrapper, which the recipe flattens. Golf cards (`js/golf-view.js`) aren't game cards and stay as they are.
   - Motion Phase 3 (Points) with `pointsTableHtml`, `splitBarHtml` and `activityRowHtml`.
   - Motion Phase 4 (team page) with `teamBadgeHtml` and `teamRowHtml`. The shared-element push flies
     the crest out of the row the helper renders.
   - Motion Phase 5 (chat) with the chat markup check.
   - Pull to refresh comes last, as the motion plan says.

The "Not yet covered" screens in `docs/design-system/README.md` (draft room, team page, race chart) get
motion before they get design-system components. That's fine: motion animates whatever markup is there.

## Prompt to start Claude Code

> Read `docs/design-system-plan.md` (including "Combined order with the motion plan"), `docs/design-system/`,
> `docs/motion-plan.md` and `docs/motion-reference/`. Do item 1: pull the tokens into `css/tokens.css` without
> changing any existing values, adding the missing tokens listed in the notes. Don't change how anything
> looks. Screenshots before and after should match. Then stop for review before Motion Phase 1.
