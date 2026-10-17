# Home priority rule (UX item 5)

The detailed plan for item 5 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code; built the same day
with the proposed answer to all four decisions (see the end). The table below is Home as it was before.

## What Home can put above your teams today

Five things, in four slots, each drawn by a different module on its own schedule. None of them knows about the others,
so their order is just the order of the slots in `index.html`.

| Slot | Drawn by | What | When | Look |
|---|---|---|---|---|
| `#playoffs-home` | `postseasonHomeHtml` (`js/postseason.js`) | One card per league with a ladder (NFL, College Football, NCAA men's basketball, MLB, WNBA) | While its postseason is on, and a week after the title game. Also for postseasons that don't count (MLB and WNBA this year: "Doesn't count for points"). Never before a group's first draft. Ordered by the class's league tabs. | Big gold `.ps-home` card |
| same slot | `golfMajorHomeHtml` (`js/golf-view.js`) | The golf major | The major's week and the week after, in groups with golf | `.ps-home` card |
| `#draft-home` | `renderDraftHome` (`js/board.js`) | The Draft card | Before the first draft, while a live draft is scheduled, or while a time poll is open | Section with the countdown or poll |
| `#season-overlap-home` | `renderSeasonOverlapHome` (`js/season-background.js`) | "2026/27 is still being played" | From a draft until last season is recorded | Slim `.act-link` row |
| `#champion-home` | `renderChampionHome` (`js/history.js`) | "Drew wins the 2026/27 season" | 21 days after a season is recorded | Slim `.act-link` row, gold dot |

These stay as they are and are outside the rule:
- **The live draft banner.** It sits at the top of every page (`js/draft-live.js`), not inside Home.
- **The peek banner.** It shows while you're looking at someone else's board.
- **Since last time.** It's a stack of cards over the page, then a pill beside the title. The first proposal listed it
  in the order; it doesn't belong there.

**When it gets crowded.** Mostly September to November, when the WNBA and MLB postseasons overlap with the draft and
last season's finish:
- **Draft week:** the Draft card, WNBA, MLB and the last-season row (4).
- **October after a draft:** WNBA, MLB and the last-season row, plus the champion row once last season is recorded
  (3–4).
- **The rest of the year:** at most two. That's College Football and NFL from December to January, the NCAA Tournament
  and the Masters from March to April, and one major at a time in summer.
- **Today:** MLB and WNBA, both not counting for points.

## The rule

**One order, highest first:**
1. **Draft card.** Shown whenever it's due today, and never folded.
2. **Champion row.** The group's own result, for its 21 days.
3. **Postseasons and majors that count for points.**
   - **By state:** under way first, then field set but not started, then the champion week.
   - **Ties:** one where you still have a team alive comes first, then the league tab order (golf after the team
     leagues).
4. **Last-season row** ("still being played").
5. **Postseasons that don't count** (MLB and WNBA while they show a prior season). Same state and tie order as 3.

**Two above your teams, at most.** The Draft card takes one of the two. Everything past the second folds into one row:
- **The row:** "More right now (N)", with the folded items' names under it ("MLB Postseason · WNBA Playoffs") and
  "Show ›" on the right.
- **A tap:** the folded items appear in place under the first two, and the row goes.
- **Staying open:** it stays open until the app is next launched, and isn't saved.

**Nothing else changes.** Each card keeps its own markup, copy and tap target. The rule only decides order and how many
show.

## Code

- **New pure module `js/home-stack-math.js`.** It holds `orderHomeItems(items, { max = 2 })`, which returns
  `{ shown, folded }`. No DOM, so Node tests can import it.
  - **Each item:** `{ id, tier, state, mineAlive, order, title, html }`.
  - **`tier`:** one of `'draft' | 'champion' | 'counts' | 'last-season' | 'no-points'`.
  - **`state`:** one of `'live' | 'set' | 'done' | null`.
  - **`order`:** the league tab index.
- **Each source returns items instead of writing its own slot.** The HTML is today's, unchanged.
  - `js/postseason.js`: `postseasonHomeItems(keys)`. Its tier comes from `postseasonScores(key)`, state from
    `currentRoundName` / `postseasonStarted`, and `mineAlive` from the snapshot it already builds.
    `postseasonHomeHtml` goes.
  - `js/golf-view.js`: `golfMajorHomeItem()`, with tier `counts` when `majorsScore()`, else `no-points`.
  - `js/board.js`: `draftHomeItem()`, built from today's `renderDraftHome` markup.
  - `js/history.js`: `championHomeItem()`. `js/season-background.js`: `seasonOverlapHomeItem()`.
- **One slot, one renderer.** `renderHomeStack()` in `js/board.js` collects the items, orders them and draws them into a
  single `#home-stack`, which replaces the four slots in `index.html`.
  - **Who calls it:** everything that repaints one of the old slots today. That's `onPostseasonData`, `onGolfData`,
    `onDraftSchedule`, `refreshHistoryUi`, `onSeasonSummary` and switching to Home.
  - **No boot cycle:** `js/history.js` and `js/season-background.js` reach it through `window.renderHomeStack`, the
    same way `renderSeasonOverlapHome` is reached today, so they gain no import from `js/board.js`.
- **Whether the fold is open** is a module variable in `js/board.js`, reset on launch.
- **Background copy:** nothing new in the hidden copy (`IS_SEASON_BACKGROUND`); Home doesn't draw there.

## Design system

- **New `js/ui.js` helper `linkRowHtml({ title, sub, go, unseen, onclick })`.** It covers the slim `.act-link` row,
  which is hand-written today in `js/history.js` and `js/season-background.js`. The champion row, the last-season row
  and the fold row all use it. It gets a spec pair (`docs/design-system/components/LinkRow.*`) and a row in
  `docs/DESIGN_TOKENS.md`.
- **New `homeStackHtml({ shownHtml, foldedHtml, more })` helper** for the stack itself, so spacing lives in one place.
  Today `.ps-home-stack`, `.draft-home` and `.act-link` each carry their own bottom margin (18px, 18px, 16px). The
  stack gets a 10px gap and 18px below it, and items inside it drop their own margins.
- **No new tokens.** The fold row is neutral: no gold, which means "you" or locked points. Postseason cards keep
  `--ps-hero-bg`.
- **Motion:** the folded items come in with the existing row stagger (`stagger` from `js/motion-fx.js`), gated with
  `fxOn()`. With reduced motion they simply appear.

## Docs

- **`docs/ARCHITECTURE.md`:** a Home section with the written order.
- **`js/guide.js`:** the Home line in `APP_ROWS` gains one clause ("the two most important things above your teams, the
  rest under More right now").
- **Plans and roadmap:** `docs/ux-improvements-plan.md` item 5 points here, and `docs/ROADMAP.md` gets updated.
- **Version:** bump `APP_VERSION` and `CACHE_NAME`, and add `js/home-stack-math.js` to `SHELL_FILES`.

## How it gets checked

- **Unit tests** (`tests/home-stack-math.test.mjs`):
  - the Draft card is never folded and takes one of the two;
  - counting postseasons come before ones that don't;
  - under way beats field set beats champion week;
  - your teams alive breaks ties, then the league tab order;
  - two or fewer means no fold row;
  - the fold row's count and names.
- **In the preview, at phone and wide widths, light and dark:**
  - **Today's Home:** MLB and WNBA, two items, no fold.
  - **A crowded Home** from `?psyear=2025`, which replays several leagues' postseasons: two cards and "More right now",
    then the expand, with motion on and with reduced motion.
  - **A pre-draft group:** the Draft card only.
  - **Peek mode** (`?team=`).

## Decisions (2026-10-16: all four as proposed)

1. **Champion row above the playoffs cards?** Proposed: yes. It's the group's own news and lasts only 21 days.
2. **When only one item would fold, fold it anyway?** Proposed: yes, strictly two, so Home's top stays the same height.
   The other way shows a slim third row instead of a fold row the same size.
3. **Wide screens: the same two?** Proposed: yes, one rule everywhere.
4. **Postseasons that don't count: last, or off Home entirely?** Proposed: last. They're still the most-watched games
   of the month, and Standings already marks them as not counting.
