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
| `--text` / `--text-sub` / `--text-mute` | `#F3F4F6` / `#94969E` / `#64666E` | `#16171B` / `#5B5D66` / `#8A8C94` | ink tiers |
| `--hairline` / `--hairline-strong` | ink 7% / 14% | same formula | borders |
| `--accent` | `#D9B45B` | `#85660C` | **you, locked points**, selection |
| `--accent-fill` | `#D9B45B` | `#E2B84A` | CTA fill |
| `--accent-soft` / `--accent-border` / `--tab-pill` | gold 14% / 35% / 16% | fill gold 20% / 55% / 26% (warm, like Send) | tints |
| `--provisional` (+`-soft`, `-border`) | `#7C9CD9` | `#4A6FB8` | **live points that can change** |
| `--live` (+`-soft`, `-border`) | `#E5484D` | same | **game in progress** |
| `--win` / `--loss` / `--draw` (+`-soft`) | `#5FB88A` / `#D97066` / `#B8A369` | `#2E8A5C` / `#C2453B` / `#8A7430` | results |
| `--record` (+`-soft`) | `#9AA5B5` | `#56617A` | records |
| `--lb-*` | leaderboard ink/rank tiers | — | `js/overall.js` only |
| `--league-<lg>` | muted set per league | — | charts only, never meaning |
| `--brand-dark` / `--brand-ink` / `--brand-square` | `#0A0B0D` / `#F3F2EF` / `#DC7D00` | — | brand mark only |
| `--crest-ground`, `--person-ground` | `#F1F2F4`, `#DDE3DF` | — | behind crests/headshots |

Other: `--on-accent`, `--on-live`, `--knob`, `--hover`, `--press`, `--fill-soft`, `--divider`, `--skeleton`,
`--overlay` (`--overlay-rgb` at 60%), `--bar-bg`, `--seg-track`/`--seg-thumb`, `--star-on`/`--star-idle`,
`--focus-ring` (2px bg gap + 2px gold), `--live-stripe` / `--risk-stripe` (diagonal hatches), `--race-*` (race chart),
`--console-rail` (desktop console sidebar). Semantic aliases: `--surface-page|card|raised|sheet`,
`--text-body|secondary|tertiary`, `--border-card|control`, `--status-positive|negative|live|provisional|locked`.

**Meaning rule:** gold = you/locked, blue = live points, red = live game. Team colors are identity only (crests, badges,
`teamOrbHtml`), never text, borders or state.

## Typography

- Families: `--font-display` Space Grotesk (titles, scores, numbers, tab labels); `--font-ui` Manrope (UI, body).
  Loaded from Google Fonts (Space Grotesk 500–700, Manrope 400–800). Numerals tabular.
- Sizes: `--fs-10 … --fs-30` (10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 30), `--fs-hero` 40px.
- Tracking: `--track-tight` −0.02em, `--track-snug` −0.01em, `--track-tag` 0.06em, `--track-label` 0.08em.
- Roles (shorthand `font`): `--type-page-title` 700 30/1 display; `--type-sheet-title` 700 20/1.2; `--type-section`
  700 15/1.2; `--type-body` 500 15/1.38 ui; `--type-row-title` 700 17/1.15; `--type-sub` 500 13/1.4; `--type-meta`
  600 12/1.3; `--type-tag` 800 10/1; `--type-score` 700 17/1 display.

## Spacing, radii, layout

- Space: `--space-1 … --space-11` = 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24px.
- Page padding `--page-pad`: 24px, 16px at ≤700px. Tab bar `--nav-h` 58px (+ safe area). `--hit-min` 44px.
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
- Blur only on the tab bar and sheet overlay.

## Motion

- Durations: `--dur-press` 120ms, `--dur-ui` 200ms, `--dur-move` 320ms.
- Easing: `--ease-out`, `--ease-spring` (overshoot), `--ease-sheet` (iOS sheet), `--ease-push`, `--ease-in-out`,
  `--ease-in`. JS mirrors in `js/utils.js` (`EASE_*`) and `js/sheet.js` (`SHEET_EASE`); the token test checks they match.
- Gate with `canAnimateLive()` (`js/motion.js`) / `fxOn()` (`js/motion-fx.js`); 23 `prefers-reduced-motion` media blocks in CSS.
- Effects helpers (`js/motion-fx.js`): `play`, `pop`, `flashTint`, `ringPulse`, `sheen`, `stagger`, `riseLetters`,
  `rollNumbers`, `burst`, `nudge`, `floatUp`, `flyTo`, `once`.

## Breakpoints (as used in `css/style.css`)

`480px`, `600px`, `700px` (main phone breakpoint, 7 uses), `900px` (phone vs desktop shells: draft room, commissioner,
system admin), `1100px`, `1179px`. No breakpoint tokens exist; media queries use literals.

## Components (`js/ui.js`)

| Helper | Props / variants |
|---|---|
| `iconHtml(name, {size, strokeWidth})` | icon set in `js/icons.js` |
| `buttonHtml({label, html, variant='primary', icon, iconSvg, onclick, type, cls, disabled})` | `.modal-cta` recipe |
| `backLinkHtml({label, onclick, cls})` | "‹ Points" style back link |
| `iconButtonHtml({icon, label, onclick, cls})` | round `.icon-btn` |
| `switchHtml({on, label, onclick})` | toggle |
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
| `pathToPointsHtml({now, max, rules, toggle, open})`, `formStripHtml`, `nextGameHtml` | team page |
| `mentionHtml`, `mentionListHtml` | chat mentions |
| `draftClockHtml` / `setDraftClock`, `clockHeroHtml`, `pickLandingHtml`, `snakeRailHtml`, `clockMiniHtml` | draft room |
| `updateCardHtml`, `updateStatsHtml`, `updateStackHtml`, `updatesPillHtml` | Since last time |

Not yet in the design system (per `docs/design-system-plan.md`): folded PathToPoints. Screens not covered by the spec:
draft room, team page, race chart (per the plan). Components in the spec without a `ui.js` helper yet (e.g. Banner,
ChatBubble, ChatComposer, SettingsRow, Sheet, SheetRow) are still hand-written markup in their screens.

## Layout and interaction patterns

- **Navigation:** bottom tab bar (Home, Scores, Chat raised center, Standings, Points); Settings via header gear. View
  state in the URL (`?view=`, `?seg=`, `?tp=`, `?screen=`). Tab switch slides toward the tapped tab; pushed screens
  (team page, schedule, squad, settings, guide, draft) slide in from the right with a back link naming the return.
  Same-document View Transitions (`navigate(kind, update)` in `js/motion.js`).
- **Sheets:** bottom sheets on phones, centered modals on desktop (`js/sheet.js`: `openSheetOverlay`,
  `closeSheetOverlay`, `enableSheetSwipeToDismiss`, body scroll lock). Overlay `--overlay`.
- **Team page:** 300px hero with team orb, folds into a compact bar on scroll; swipe sideways between your teams;
  crest-to-page shared element transition.
- **Gestures:** `js/gestures.js` (`attachDrag`, axis lock); constants `LONG_PRESS_MS` 380, `MOVE_SLOP` 8,
  `SWIPE_COMMIT` {team 70, card 90, reply 52}, `FLING_VELOCITY` 0.6. Long press for chat reactions; pull to refresh
  (`js/pull-refresh.js`) with the brand mark.
- **Desktop (≥900px):** sidebar consoles for the draft room, Commissioner and system admin; under 900px they collapse
  to phone layouts / a top bar.
- **Safe area:** fixed `.safe-area-top` cover for the iOS translucent status bar; sticky filter rows bleed to edges
  with `--page-pad`.
- **Callouts:** soft tint fill + matching 1px border + colored text, radius 10; never a left-border stripe.
- **Copy:** sentence case, uppercase only for tiny tags, middot separators, real minus signs, no emoji in UI.
