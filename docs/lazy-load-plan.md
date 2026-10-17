# Load the rare parts only when used (UX item 6)

The detailed plan for item 6 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code; built the same day
with the proposed answer to all three decisions (see the end).

## What launch loads today

Measured from `js/board.js`'s static imports on `main` (2026-10-16): **113 of 128 JS files, 1,793 KB** before
compression. The service worker caches every file at install, so the repeat cost isn't download. It's every launch
parsing, compiling and running all of it on a phone. Already loaded only when used: the draft room (`js/draft.js` and
its files), the system admin page and ESPN's team lists.

The rare parts still loaded on every launch:

| Part | Size at launch | Who needs it | Why it loads anyway |
|---|---|---|---|
| Commissioner console (`js/admin.js` + `js/draft-prep.js`) | 92 KB | One commissioner per group | `js/board.js` imports `showAdminPage`, and `js/league-facts.js` / `js/season-lock.js` import `renderAdminPage` just to repaint the page if it's open |
| Season Ticket's draft class (`js/seasons/seasonticket*.js`) | 75 KB | Season Ticket members only | `js/seasons/index.js` imports every group's classes and then picks one |
| The guide's screenshots (`js/landing-explainer.js`) | 36 KB | Whoever opens the guide | `js/guide.js` imports `paintSceneStill` for the tour scenes it draws as stills |

**Not changing: The Draft's class (80 KB) for Season Ticket members.** `js/seasons/pre-draft.js` uses it as the team
catalog. That covers a group's shown-but-not-drafted sports, a group before its first draft, and the guide. Season
Ticket's class also copies its scoring from it. Cutting it would mean a separate catalog file and changes to the export
tool's generated files, a bigger job for 80 KB.

**Not changing: the team page (`js/team-page.js`, 138 KB).** It's the biggest file, but nearly every visit taps a team,
and `?team=` links open on it. Loading it on demand would put a wait on the most common tap. Splitting off its golfer
and wide-screen parts is its own refactor, if ever.

**Result:**
- **The Draft members:** 108 files, 1,590 KB at launch (203 KB, about 11%, less).
- **Season Ticket members:** 128 KB less (the console and the guide).

## The changes

### 1. Commissioner console on first open

Same pattern as the draft room (`setDraftActive` in `js/board.js`): a dynamic `import('./admin.js')` the first time the
Commissioner view opens, cached in a module variable.
- **`switchView('admin')`:** shows a skeleton (`skeletonRowsHtml`) in `#view-admin` while the module loads, then calls
  its `showAdminPage()`. A failed load clears the cached promise so the next try loads again, and logs once.
- **Preloading:** on a device that has signed in as commissioner (`loadAdminPassword()` in `js/utils.js` returns a
  saved password or token), the console is preloaded when idle with `<link rel="modulepreload">`, as the draft room
  is. So the commissioner's first open is still quick. Everyone else never downloads it until they tap "Commissioner
  sign-in".
- **Repaints:** `js/league-facts.js` and `js/season-lock.js` call `window.renderAdminPage?.()` instead of importing
  `admin.js`. `admin.js` sets `window.renderAdminPage` when it loads, and it only repaints while the page is showing.
- **The commissioner link** from the system admin page (`#commissioner=<token>`) is saved today by `admin.js` the
  moment it loads. That moves to `js/utils.js` next to `saveAdminPassword`, run at boot from `js/board.js`. Otherwise a
  link that lands on Home would lose its token before anyone opens the console.
- **Other load-time work** in `admin.js` (the desk media-query listener, reading `?screen=`) is console-only and fine
  to run on first open.
- **Deep links:** `?view=admin` works as before, through the same `switchView` path at boot.
- **Wide screens:** the desktop console (`js/wide.js` `CONSOLES`) goes through `switchView` too, so nothing changes
  there.

### 2. Only the active group's classes

`js/seasons/index.js` loads the active group's registry with a dynamic import and a top-level `await`, instead of
importing every group's registry.
- **The Draft's registry (`js/seasons/the-draft.js`)** stays a static import. It's the legacy group's, and the
  catalog every group needs (above).
- **Other groups:** `OTHER_GROUP_SEASONS` becomes a map of loaders, `{ seasonticket: () => import('./seasonticket.js') }`.
  Only the active group's runs.
- **Everything that imports `js/seasons/index.js`** waits for that one file before running. Its exports
  (`SEASONS`, `LATEST_SEASON_ID`, …) are unchanged, so no importer changes. Top-level `await` needs Safari 15 or
  newer; the app already needs newer.
- **Who's unaffected:** the worker doesn't import `js/seasons/index.js` (only `js/groups.js` and
  `js/seasons/the-draft.js`). `tools/outlooks.mjs` imports it from Node, which supports top-level `await`.
- **The export tool** (`updateIndexRegistry` in `tools/draft-export-lib.mjs`) writes a loader line for a new group
  instead of a static import. Its tests (`tests/draft-export.test.mjs`) move with it.
- **Risk:** top-level `await` inside an import cycle can leave a module half-initialized. `js/seasons/index.js`'s own
  imports (`group.js`, `groups.js`, `pre-draft.js`, `pga.js`, `live-class-store.js`, `draft-class.js`) get checked for
  cycles back into it before this lands, and it's tested on both groups in the preview.

### 3. Guide screenshots on first draw

`js/guide.js` imports `js/landing-explainer.js` dynamically the first time it paints its tour stills. The still frames
keep their size from CSS, so nothing moves while the module loads; they show the existing `--skeleton` fill until
painted.

### Kept as is

- **`sw.js`:** every file stays in `SHELL_FILES`, so offline and first-open-after-install still work. A dynamic import
  goes through the same cache.
- **Bumps:** `APP_VERSION` and `CACHE_NAME` (the shell's contents change).

## Design system

No visual change. The console's first open shows the existing skeleton rows (`skeletonRowsHtml`, `--skeleton`) instead
of a blank page; the guide's stills keep their skeleton fill until drawn. **New to the design system:** none.

## How it gets checked

- **Unit tests:**
  - `updateIndexRegistry` writes the loader map.
  - The commissioner-link parsing (now in `js/utils.js`) saves the token and clears the hash.
  - Existing tests that import `js/seasons/index.js` still pass under top-level `await`.
- **Launch counts:** in the preview, the number and size of JS files at launch, from
  `performance.getEntriesByType('resource')`, before and after. Checked for The Draft (`?group=thedraft`) and Season
  Ticket (`?group=seasonticket`).
- **In the preview:**
  - **Home, Scores, Standings, Points and a team page** on both groups, with no console errors.
  - **Settings → Commissioner sign-in:** skeleton, then the console. Then the desktop console at wide width.
  - **`?view=admin` deep link.**
  - **A commissioner link** (`#commissioner=…`) landing on Home, then opening the console signed in.
  - **The guide** with its stills.
  - **Offline after one launch:** every screen above still opens from the cache.
- **The export tool:** `node tools/export-draft.mjs --dry-run --group seasonticket` still writes a working registry
  change.

## Decisions (2026-10-16: all three as proposed)

1. **Preload the console on commissioner devices?** Proposed: yes, so the commissioner never waits. Everyone else
   still skips it.
2. **Leave the team page and The Draft's class at launch?** Proposed: yes, for the reasons above. Revisit only if a
   phone feels slow at launch.
3. **Top-level `await` in `js/seasons/index.js`, or a smaller change?** Proposed: top-level `await`. The other way would
   change how every importer reads the seasons.
