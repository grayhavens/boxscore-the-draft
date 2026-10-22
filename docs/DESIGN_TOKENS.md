# Design tokens and components

Source of truth: `css/tokens.css` (values) and `js/ui.js` (component helpers). Spec and usage notes:
`docs/design-system/` (`README.md`, `components/*.prompt.md`, `components/*.types.ts.txt`, `components.css`).
Rules: tokens only in `css/tokens.css`; `tests/design-tokens.test.mjs` fails on raw colors elsewhere.

## Themes

- Dark is the default (`:root`, `color-scheme: dark`).
- Light: `:root[data-theme="light"]`, or `data-theme="auto"` + `prefers-color-scheme: light` (the token list is
  written twice for that reason). Set from Settings → Appearance; an inline script in `index.html` applies it before paint.
- Many neutrals are built on `--ink-rgb` (255,255,255 dark / 20,22,28 light) so they flip automatically.

## Colors (dark / light)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0B0D` | `#F4F3EF` | page |
| `--surface` | `#16171B` | `#FFFFFF` | cards |
| `--surface-2` | `#1C1D21` | `#ECEAE4` | raised |
| `--sheet` | `#18191D` | `#FFFFFF` | sheets/modals |
| `--text` / `--text-sub` / `--text-mute` | `#F3F4F6` / `#A3A5AD` / `#8A8C94` | `#16171B` / `#4E5059` / `#6B6D76` | ink tiers; mute is the floor for text (4.5:1 or better on cards) |
| `--hairline` / `--hairline-strong` | ink 7% / 14% | same formula | borders |
| `--accent` | `#D9B45B` | `#80620C` | **you, locked points**, selection |
| `--accent-fill` | `#D9B45B` | `#E2B84A` | CTA fill |
| `--accent-soft` / `--accent-border` / `--tab-pill` | gold 14% / 35% / 16% | fill gold 20% / 55% / 26% (warm, like Send) | tints |
| `--ps-hero-bg` / `--ps-hero-flare` | gold glow from the top of the playoffs reveal strip / the brighter light it opens with | same, in fill gold | reveal strip, Home's postseason card |
| `--provisional` (+`-soft`, `-border`) | `#7C9CD9` | `#4163A5` | **live points that can change** |
| `--live` (+`-soft`, `-border`) | `#E5484D` | `#C91D22` (tints stay `#E5484D`) | **game in progress** |
| `--win` / `--loss` / `--draw` (+`-soft`) | `#5FB88A` / `#D97066` / `#B8A369` | `#26714B` / `#AC3D34` / `#8A7430` | results |
| `--record` (+`-soft`) | `#9AA5B5` | `#56617A` | records |
| `--lb-*` | leaderboard ink/rank tiers | — | `js/overall.js` only |
| `--league-<lg>` | muted set per league | — | charts only, never meaning |
| `--brand-dark` / `--brand-ink` / `--brand-square` | `#0A0B0D` / `#F3F2EF` / `#DC7D00` | — | brand mark only |
| `--crest-ground`, `--person-ground` | `#F1F2F4`, `#DDE3DF` | — | behind crests/headshots |

Other: `--on-accent`, `--on-live`, `--knob`, `--hover`, `--press`, `--fill-soft`, `--divider`, `--skeleton`,
`--overlay` (`--overlay-rgb` at 60%), `--bar-bg`, `--seg-track`/`--seg-thumb`, `--star-on`/`--star-idle`,
`--focus-ring` (2px bg gap + 2px gold), `--focus-ring-inset` (the same ring drawn inside, for rows in a scroller or a
clipped card), `--live-stripe` / `--risk-stripe` (diagonal hatches), `--race-*` (race chart),
`--console-rail` (desktop console sidebar). Semantic aliases: `--surface-page|card|raised|sheet`,
`--text-body|secondary|tertiary`, `--border-card|control`, `--status-positive|negative|live|provisional|locked`.

**Meaning rule:** gold = you/locked, blue = live points, red = live game. In light theme `--accent`, `--provisional`,
`--live`, `--win` and `--loss` are small text at 4.5:1 or better on every surface and on their own tint over the page and
a card; `tests/design-tokens.test.mjs` checks it. Team colors are identity only (crests, badges,
`teamOrbHtml`), never text, borders or state.

## Typography

- Families: `--font-display` Space Grotesk (titles, scores, numbers, tab labels); `--font-ui` Manrope (UI, body).
  Loaded from Google Fonts (Space Grotesk 500–700, Manrope 400–800). Numerals tabular.
- Sizes: `--fs-11 … --fs-30` (11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 30 at the default text size), `--fs-hero` 40.
  All in rem as `calc(Npx-value rem / 17)`: 1rem is the reader's body size (`font: -apple-system-body` on phones and
  tablets, so the iPhone's Text Size setting scales the app; 17/16 of the browser default elsewhere). `--fs-10` is
  kept as a name but is 11, the floor (Apple's Caption 2). `--fs-tab` 10px stays fixed, like the system tab bar.
  Literal font sizes are for display numerals and crest monograms only; `tests/type-scale.test.mjs` fails any token
  outside rem, any size under 11px, and any literal under 11px that isn't a badge or tile monogram.
- Tracking: `--track-tight` −0.02em, `--track-snug` −0.01em, `--track-tag` 0.06em, `--track-label` 0.08em.
- Roles (shorthand `font`): `--type-page-title` 700 30/1 display; `--type-sheet-title` 700 20/1.2; `--type-section`
  700 15/1.2; `--type-body` 500 15/1.38 ui; `--type-row-title` 700 17/1.15; `--type-sub` 500 13/1.4; `--type-meta`
  600 12/1.3; `--type-tag` 800 10/1; `--type-score` 700 17/1 display.

## Spacing, radii, layout

- Space: `--space-1 … --space-11` = 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24px.
- Page padding `--page-pad`: 24px, 16px at ≤700px. Tab bar: a `--tab-bar-h` 60px capsule; `--nav-h` 68px is the room
  it takes above the safe area. Title bar `--title-bar-h` 44px (0 at ≥900px). `--hit-min` 44px.
- Radii: `--r-xs` 6, `--r-sm` 10, `--r-md` 14, `--r-lg` 20, `--r-sheet` 28, `--r-pill` 999; `--r-badge` 13,
  `--r-badge-sm` 8, `--r-table` 16, `--r-hero` 18, `--r-cta` 12, `--r-seg` 11, `--r-seg-thumb` 8.

## Shadows and effects

- Cards have **no shadow** (fill + 1px hairline). Shadows only on floating things: `--shadow-pop`, `--shadow-tip`,
  `--shadow-modal`, `--shadow-sheet`, `--hero-shadow`, `--seg-thumb-shadow`, `--crest-shadow`.
- Team orb: `--orb-blur` 64px, `--orb-opacity` 0.5, `--orb-opacity-soft` 0.42; color inline as `--orb`.
- Crest in a badge: `--crest-img-shadow` (heavy in dark, a hint in light). A team with `badgeUrlDark` draws both crests
  (`.crest-dark` / `.crest-light`, shown by theme); never use the bright one in light.
- Gold shapes (fills, thumbs, dots, rings) use `--accent-fill`, the yellow of the chat's Send button; `--accent` is the
  text gold and is a darker, readable gold in light. The postseason stepper, toggle, rings and champion dot follow this.
- Postseason ladder, eliminated chip: `--ps-out-opacity` / `--ps-out-filter` (0.4 grayscale in dark; 0.7, slightly darker
  grayscale in light, where 0.4 vanishes on white).
- Landing helpers in `js/ui.js` not in the design system yet: `tourStepsHtml` (scroll-tour progress segments), `spotsMeterHtml`
  (a group's roster as bars) and `sportPicksHtml` (sports as chips with picks per drafter).
- `seasonEntryHtml` (`js/ui.js`, not in the design system yet): the full-screen "building your season" moment after a draft
  (`js/season-entry.js`). Composed from existing parts: Welcome-card eyebrow, page title role, 44px `.badge`s in
  `--fill-soft` wells, a split-bar-shaped track filled with `--accent-fill`, and `.modal-cta` buttons.
- Blur only on the tab bar, the title bar and the sheet overlay.
- Glass (`--glass-bar`, `--glass-blur`, `--glass-edge`, `--glass-shadow`, `--glass-rule`): the material for floating
  controls only, the phone tab bar and the title bar, never cards or content. Reduce Transparency makes it solid
  `--surface`. The tab bar's selection is `--tab-lens`, behind both icon and label; `--tab-pill` is now only the
  landing tour's.
- Tip (`tipHtml`): `--tip-bg` (→ `--sheet`) and `--tip-ink` (→ `--text`), aliases so they follow the theme; floats, so it
  takes `--shadow-tip`.

## Z-order

- `--z-tip` 250: the one-time tip, over the tab bar (200) and under sheets and modals (300 and up). The first z-order
  token; other layers are still literals in `css/style.css` (tab bar 200, sheets 300, toasts 400, draft modals 500).

## Motion

- Durations: `--dur-press` 120ms, `--dur-ui` 200ms, `--dur-move` 320ms.
- Easing: `--ease-out`, `--ease-spring` (overshoot), `--ease-sheet` (iOS sheet), `--ease-push`, `--ease-in-out`,
  `--ease-in`. JS mirrors in `js/utils.js` (`EASE_*`) and `js/sheet.js` (`SHEET_EASE`); the token test checks they match.
- Gate with `canAnimateLive()` (`js/motion.js`) / `fxOn()` (`js/motion-fx.js`); 23 `prefers-reduced-motion` media blocks in CSS.
- Effects helpers (`js/motion-fx.js`): `play`, `pop`, `flashTint`, `ringPulse`, `sheen`, `stagger`, `riseLetters`,
  `rollNumbers`, `burst`, `nudge`, `floatUp`, `flyTo`, `once`.

## Breakpoints (as used in `css/style.css`)

`480px`, `600px`, `700px` (main phone breakpoint, 7 uses), `900px` (phone vs the wide shell and the desktop consoles: draft room, commissioner,
system admin), `1280px` (chat docks as a column), `1100px`, `1179px`. No breakpoint tokens exist; media queries use literals.

## Components (`js/ui.js`)

| Helper | Props / variants |
|---|---|
| `iconHtml(name, {size, strokeWidth})` | icon set in `js/icons.js` |
| `buttonHtml({label, html, variant='primary', icon, iconSvg, onclick, type, cls, disabled})` | `.modal-cta` recipe |
| `backLinkHtml({label, onclick, cls})` | "‹ Points" style back link |
| `iconButtonHtml({icon, label, onclick, cls})` | round `.icon-btn` |
| `switchHtml({on, label, onclick})` | toggle |
| `settingsRowHtml({title, sub, onclick, chevron, rightHtml, switchOn, switchKey, cls})` | `.set-row` tile (Settings, Home draft card, tour alerts); `switchOn` makes a switch row |
| `filterTabHtml({label, active, onclick})` + `revealActiveTab(row)` | underline filter tabs |
| `segmentedControlHtml(segments, activeKey, fnName)` (in `js/utils.js`) | `.seg` track + thumb |
| `tagHtml({label, variant})` | `.status-tag` (live, locked, win, …) |
| `gameCardHtml({id, state, time, sub, timeTone, tag, away, home, onclick, cls})`, `gameSectionHtml` | Scores cards |
| `teamBadgeHtml({crestSrc, name, style, text, person})` (adapter `teamBadgeHtml(meta)` in `js/utils.js`) | 44px / 26px badge |
| `teamRowHtml({badgeHtml, name, subHtml, favHtml, statusId, onclick})` | Home rows |
| `splitBarHtml({locked, live, max, size})` | locked (gold) + live (blue hatch) bar |
| `pointsTableHtml({rows, head, tap})`, `rankBadgeHtml({n})` | Points table |
| `activityRowHtml({tileHtml, kindHtml, title, bodyHtml, rightHtml, onclick, lock, compact})` | Activity |
| `lockStampHtml`, `scoreBumpHtml`, `floatPillHtml` | motion overlays |
| `teamOrbHtml({color, cls, soft})`, `compactBarHtml`, `pageDotsHtml`, `sectionCardHtml` | team page |
| `pathToPointsHtml({now, max, rules, toggle, open})`, `formStripHtml` (a game's `res` replaces W/L/D: a golfer's finish), `nextGameHtml` (`title`, `live`, `rightHtml`, no `home`: a golfer's week) | team page |
| `mentionHtml`, `mentionListHtml` | chat mentions |
| `draftClockHtml` / `setDraftClock`, `clockHeroHtml`, `pickLandingHtml`, `snakeRailHtml`, `clockMiniHtml` | draft room |
| `updateCardHtml`, `updateStatsHtml`, `updateStackHtml`, `updatesPillHtml` | Since last time |
| `tipHtml({text, onclose})` | one-time gesture hint pill (`.tip`), shown by `js/tips.js` |
| `bannerHtml({text\|html, tone, note, actionLabel, onaction, actionHtml, cls})` | tinted callout (`.peek-banner`; `.live`, `.prov`, `.note`): the peek banner (`cls: 'peek'`), prior-season / final-standings / preview-data notes, the commissioner's lock status |
| `sheetHtml({title, sub, onclose, html, bodyId, bodyCls})`, `sheetHeadHtml({…, eyebrowHtml, extraHtml, rightHtml, cls, titleCls})` | the inside of a `.modal` sheet: title row with the round ×, then the body (overlays stay in `index.html`, opened by `js/sheet.js`) |
| `sheetRowHtml({title, desc, check, active, rightHtml, onclick})` | selectable sheet row; `check` adds the ring that fills gold when `active` |
| `chatMetaHtml`, `chatBubbleHtml`, `chatReactionsHtml`, `reactionBarHtml`, `REACTION_EMOJI` | chat message rows (ChatBubble, ReactionBar); flat siblings because `js/chat.js` diffs them |
| `chatComposerHtml({onsend, ongif, showGif})` | the chat composer, drawn by `initChat` |
| `sharedGameCardHtml({league, away, home, status, live, shared, mine, nowHtml, attrs})` | a game shared into chat (`.chat-game`), also the landing tour's |
| `linkRowHtml({title\|titleHtml, sub\|subHtml, go, unseen, onclick, cls})` | slim surface row that links somewhere (`.act-link`): Home's champion, last-season and "More right now" rows |
| `homeStackHtml({itemsHtml, more})` | what sits above your teams on Home (`.home-stack`, 10px gap, owns its items' spacing); order from `js/home-stack-math.js` |

Not yet in the design system (per `docs/design-system-plan.md`): folded PathToPoints. Screens not covered by the spec:
draft room, team page, race chart (per the plan). Every spec component a screen renders now has a
`ui.js` helper (Step 3 done 2026-10-16). Still outside `ui.js`: the page header (`js/page-header.js`), favorite star
(`js/favorites.js`), segmented control (`js/utils.js`), and one-off screen rows such as the compare picker (`.cmp-pick`).

## Layout and interaction patterns

- **Navigation:** a floating glass tab bar (Home, Scores, Chat, Standings, Points); the selected tab is gold with a
  filled or heavier glyph (`.on-fill` shapes in `index.html`) and `aria-current="page"`. Settings via header gear. Once
  a tab's large title scrolls under the status bar, a glass title bar shows it small and centered with the gear
  (`.title-bar`, `js/page-header.js`); sticky rows park under it with `--title-bar-h`. View
  state in the URL (`?view=`, `?seg=`, `?tp=`, `?screen=`). Tab switch slides toward the tapped tab; pushed screens
  (team page, schedule, squad, settings, guide, draft) slide in from the right with a back link naming the return.
  The team page, schedule and squad also go back with a swipe from the left edge (`EDGE_BACK` in `js/utils.js`).
  Same-document View Transitions (`navigate(kind, update)` in `js/motion.js`).
- **Sheets:** bottom sheets on phones, centered modals on desktop (`js/sheet.js`: `openSheetOverlay`,
  `closeSheetOverlay`, `enableSheetSwipeToDismiss`, body scroll lock). Overlay `--overlay`.
- **Team page:** 300px hero with team orb, folds into a compact bar on scroll; swipe sideways between your teams;
  crest-to-page shared element transition.
- **Gestures:** `js/gestures.js` (`attachDrag`, axis lock); constants `LONG_PRESS_MS` 380, `MOVE_SLOP` 8,
  `SWIPE_COMMIT` {team 70, card 90, reply 52}, `FLING_VELOCITY` 0.6, `EDGE_BACK` {edge 24px, commit 0.35 of the width}. Long press for chat reactions; pull to refresh
  (`js/pull-refresh.js`) with the brand mark.
- **Desktop (≥900px):** the wide shell (`js/wide.js`): a top header instead of the tab bar, the team rail on the left
  (`--rail-w`), chat as a slide-over (900–1279px) or a column (1280px+, `--chat-w`). Pages start at the content's left
  edge under the header. The draft room and Commissioner are consoles: the rail steps aside (`html[data-console]`),
  Commissioner covers the window, the draft room keeps the header and chat. Under 900px they collapse to phone
  layouts / a top bar. Hover: rows wash with `--hover`, cards lift to `--surface-2`, round icon buttons fill with
  `--fill-soft`; behind `(hover: hover)` (or phone widths) so a touch iPad doesn't keep a tapped row lit. Selection is
  an `--accent-soft` fill (`--accent-border` where it has an edge), never a stripe. Pushed pages (team page, Settings,
  the guide) carry a back link and leave no header tab selected.
- **Safe area:** fixed `.safe-area-top` cover for the iOS translucent status bar (hidden while the title bar covers
  the strip); sticky filter rows bleed to edges with `--page-pad`.
- **Callouts:** soft tint fill + matching 1px border + colored text, radius 10; never a left-border stripe.
- **Copy:** sentence case, uppercase only for tiny tags, middot separators, real minus signs, no emoji in UI.
