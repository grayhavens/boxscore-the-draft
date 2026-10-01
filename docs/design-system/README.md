# Boxscore Design System

Boxscore is a fantasy-sports platform for friend groups. Ten drafters run a live **snake draft** of *real teams* across many leagues (EPL, NFL, NBA, NHL, MLB, WNBA, College Football, College Basketball, PGA golf). Through the season the app follows those teams and turns where they **finish** — division titles, best record, playoffs, relegation, postseason rounds, plus a combined-win-% bonus — into points per drafter. Games and scores are tracked live, and a group chat carries the banter.

It ships as an installed **iOS PWA**: phone-first, one-handed, dark by default with a light theme. Each friend group is its own subdomain (`thedraft.boxscore.space`, `seasonticket.boxscore.space`); the bare domain `boxscore.space` is a small landing page.

## Sources
- GitHub: **https://github.com/grayhavens/boxscore-the-draft** (branch `main`) — the whole product. Plain static site, no build step. Explore it to go deeper than this system does.
  - `css/style.css` — every token and component recipe (≈6.8k lines). The source of truth for values here.
  - `index.html` — app shell, tab bar, sheets. `landing.html` — platform landing.
  - `js/*.js` — views (`board.js`, `live-now.js`, `overall.js`, `chat.js`, `draft.js`, `team-page.js`), motion (`motion.js`, `launch-splash.js`), copy (`guide.js`).
  - `docs/feature-design-brief.md` — the product's own written visual language.
  - `icons/` — logos and app icons (copied to `assets/`).
- Local mount used during authoring: `boxscorethedraft/` (same repo).

## Products / surfaces
1. **Group app** (`index.html`) — five tabs: Home (your teams by league), Scores (day timeline), Chat (center tab), Standings (real tables tagged by drafter), Points (leaderboard, Activity, Race). Pushed screens: team page, settings, guide, draft room. → `ui_kits/app/`
2. **Landing** (`landing.html`) — header, "How it works", groups, FAQ. Reuses app components; not separately kitted.
3. **Commissioner & system admin consoles** — desktop sidebar shells. Not kitted (internal tools).

---

## CONTENT FUNDAMENTALS

**Voice:** a friend who runs the league explaining it at the bar. Plain, short, specific, a little dry. Never hype, never corporate.

- **Person:** speaks to *you* ("Home is your board: every team you drafted…", "Tap any team for its page"). The product never says "we" or "I".
- **Casing:** Sentence case everywhere — titles, buttons, sheet titles ("Who are you?", "Show which teams?", "How scoring works", "Open team page"). Uppercase only for tiny tracked labels and tags (LIVE, FINAL, LOCKED, PRESEASON).
- **Tab/section names** are one plain noun: Home, Scores, Chat, Standings, Points, Activity, Race.
- **Numbers do the talking.** "Lead by 1 game, 14 left. Contested", "1 game behind Vikings", "2 pts clear of the drop", "Projected = Locked + Live". Signed deltas with a real minus (−2), not a hyphen.
- **Explain rules in one breath.** "Points come from where a team finishes." "Nope. Once the draft is done, there's nothing to manage."
- **Playful in small doses**, mostly where the group's own personality lives: Chat sub is "The Draft's #1 Source for Smack Talk". Empty and status copy stays matter-of-fact ("Loading today's slate…", "Connecting…").
- **Status vocabulary is fixed:** *Locked* (can't be lost, gold), *Live* / provisional (can still change, blue), *At risk* (red), *In reach*. Leagues are "leagues"; friend groups are "groups"; people are "drafters"; the admin is "the commissioner".
- **No betting language.** Ever — no odds, lines-as-bets, wagers.
- **Emoji:** none in UI copy. The only emoji are the seven chat reactions 👍 👎 😂 😮 😢 🔥 😎 (and whatever people type).
- Punctuation: middot separators (`Locked 24 · Leading 13`), en dashes in records (9–3, 2025–26), curly apostrophes, ellipsis character.

## VISUAL FOUNDATIONS

**Mood:** a premium night-time scoreboard. Near-black, flat, quiet surfaces; one warm gold accent; color reserved for meaning and for the teams' own badges. Sleek by default, with a few deliberate flashes of motion.

- **Color.** Page `#0A0B0D`, surfaces `#16171B` / `#1C1D21`, sheet `#18191D`. Three ink tiers (`#F3F4F6`, `#94969E`, `#64666E`). Hairlines are white at 7% / 14% (`--ink-rgb` flips for light theme). **Gold `#D9B45B` is the only accent** — leader, CTAs, selected, "you". Meaning colors: win green, loss red, draw khaki, live red `#E5484D`, provisional blue `#7C9CD9`. League chart colors are a separate muted set that never carries meaning. Brand mark: ink `#F3F2EF` + orange square `#DC7D00` (the orange appears *only* in the mark).
- **Light theme:** warm paper `#F4F3EF`, white surfaces, gold darkens to `#85660C` for text while fills stay bright `#E2B84A`.
- **Type.** Space Grotesk (500–700) for titles, scores, every number and tab labels; Manrope (400–800) for UI and body. Page title 30/700, −0.5px. Sheet title 20/700. Row name 17/700 (15 in standings). Body 15/500 1.38. Labels 10–11px, 800, uppercase, 0.06–0.08em. Numerals are always tabular.
- **Backgrounds.** Solid fills only. No photography, illustrations, patterns or textures — except two functional ones: the **blue diagonal hatch** for Live points and **red hatch** for at-risk, and a top-down **radial red tint** on live game cards. The team page hero uses a soft blurred team-color orb with a scrim. No decorative gradients.
- **Cards.** Surface fill + 1px `--hairline` border, **no shadow**. Radii: 14 (rows/cards), 16 (tables), 18 (hero), 20 (league cards, modals), 28 (sheet top). Rows inside cards are split by 1px dividers, not gaps.
- **Shadows** only on things that float: modals (`0 24px 64px /50%`), sheets (upward), popovers. The segmented thumb gets a 1px drop.
- **Callouts** (peek banner, prior-season note) = soft tint fill + matching 1px border + colored text, radius 10. Never a left-border stripe.
- **Badges.** Teams are rounded squares (44px / r13; 26px / r8 compact) in the team's own primary color with its abbreviation in the secondary color, or a bare crest with a drop shadow.
- **Selection.** Filter chips go solid gold. Segmented controls are a recessed track with a raised neutral thumb (deliberately quieter than gold). Tab bar: one gold-tint pill behind the active tab.
- **Hover:** a faint ink wash (`rgba(ink,0.03–0.04)`), or text → `--text`; ghost chips tint to surface-2 and turn gold. **Press:** buttons scale 0.97 (icon buttons 0.92, cards 0.985) over 120ms plus a `--press` tint; star springs to 1.18.
- **Focus:** 2px bg gap + 2px gold ring. Inputs: gold-soft border + 3px soft halo.
- **Motion (the "flash").** Easing: `--ease-out` (0.22,1,0.36,1) for nearly everything; `--ease-spring` (overshoot) for the tab pill, odometer digits and reaction picker; iOS `--ease-sheet` for sheets. Durations: 120 press / 200 UI / 320–420 moves / 500 sheets. Signature moments:
  - Launch splash: orange dot pulses into the square, brackets draw from their corners, the mark half-turns, "Boxscore" rises letter by letter, then flies into the header logo while Home cascades up.
  - Tab switch slides 36px toward the tapped tab; pushed screens slide in from the right (old view parallaxes −28% and dims).
  - Sheets spring up from the bottom and their rows stagger in 45ms apart.
  - Live: pulsing dot, expanding ring on the timeline node; a changed score rolls on an odometer and the card flashes a gold ring.
  - Points bars build from zero, staggered 60ms per row; hero total counts up.
  - Chat bubbles ease in from their own side.
  Everything respects `prefers-reduced-motion` (falls back to instant).
- **Transparency & blur:** only the tab bar (82% bar color + 20px backdrop blur) and the 60% overlay behind sheets.
- **Layout.** Phone column with 16px page padding (24 ≥ 700px), fixed bottom tab bar (58px + safe area), fixed opaque safe-area cover at the top, sticky filter rows. Wide screens grid league cards 4 → 2 → 1. Min hit target 44px. Sheets are bottom sheets on phones, centered 400px modals on desktop.

## ICONOGRAPHY
- The app uses its **own inline SVG stroke icons** written into the markup/JS (no icon font, no library, no PNG icons). 24×24 grid, `currentColor`, round caps/joins; stroke 1.8 for nav glyphs, 2.2 for chevrons/close/send, 3.2 for the check. Copied verbatim to `assets/icons/*.svg` and exposed via the `Icon` component (home, scores, chat, standings, points, draft, bell, settings, gear, chevron-down/left/right, close, send, check, scoring, star, star-filled, ball). `chevron-right` is the mirrored chevron-left used for accordion rows.
- Tab icons 19px; header settings 20px; chips 12px; close 14px.
- Team identity comes from **badges and real crests** (ESPN/TheSportsDB images in production), not icons.
- **No emoji as icons**, no unicode glyph icons except text arrows ‹ › on the day navigator and ▲▼ rank moves.
- Logos: `assets/logo-header.png` (dark), `assets/logo-header-light.png`, `assets/icon-512.png` / `icon-192.png` / `apple-touch-icon.png`. The `BrandMark` component rebuilds the mark in CSS only to animate it — geometry copied from the product's splash.

## Fonts
Both families load from Google Fonts exactly as the product does (`tokens/fonts.css`) — no substitution. No local font binaries exist in the repo.

---

## Index
- `styles.css` — entry point (imports only).
- `tokens/` — `colors.css` (dark + light), `typography.css`, `spacing.css` (radii, layout, shadows), `motion.css` (easing + keyframes), `fonts.css`, `base.css`.
- `components/components.css` — class recipes ported from the product CSS, using the product's own class names.
- `components/` — React primitives (below), each with `.jsx`, `.d.ts`, `.prompt.md`, one card per folder.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Motion, Brand).
- `ui_kits/app/` — click-through recreation of the group app.
- `assets/` — logos, app icons, `icons/*.svg`.
- `SKILL.md` — Agent Skill entry. `github.md` — source association.

## Components
- **core:** Icon, Button, IconButton, ScopeChip, FilterChip, FilterChips, SegmentedControl, Switch, Tag, CountBadge, LiveDot, FavoriteStar
- **navigation:** PageHeader, TabBar, BackLink
- **data:** TeamBadge, TeamRow, LeagueCard, GameCard, GameSection, SplitBar, PointsTable, ActivityRow
- **feedback:** Banner, Sheet, SheetRow, SettingsRow, SettingsLabel
- **chat:** ChatBubble, ReactionBar, REACTION_EMOJI, ChatComposer, SharedGameCard
- **brand:** BrandMark

The product has no component library — components are CSS recipes in `css/style.css` rendered by template strings in `js/`. This inventory maps those recipes 1:1 (e.g. `.modal-cta` → Button, `.seg` → SegmentedControl, `.tg-row` → GameCard, `.ob-table` → PointsTable, `.act-row` → ActivityRow).

### Intentional additions
- **Icon** — wraps the app's inline SVGs so they're reusable.
- **BrandMark** — packages the launch-splash markup + animation as one component.
- **GameSection / SettingsLabel / FilterChips** — thin wrappers for the section-rule, set-label and chip-row recipes.

Not yet covered: draft room, team page, race chart, commissioner/admin consoles, GIF picker.
