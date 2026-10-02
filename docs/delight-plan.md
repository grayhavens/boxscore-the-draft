# Delight pass: implementation plan

This is a handoff for a Claude Code session in `boxscorethedraft`. It adds six moments to the app: the draft clock and pick landing, the "Since last night" stack, the champion reveal and share card, chat gestures, the team page and the landing page app tour.

It builds on two earlier handoffs. Read those first and follow their rules:
- `docs/design-system-plan.md`: tokens in `css/tokens.css`, UI built from `js/ui.js`.
- `docs/motion-plan.md`: effects play on state changes, through `js/motion-fx.js`.

## About the design files

`docs/delight-reference/` holds **design references built in HTML**. They are working prototypes that show the intended look, motion and gestures. They are not production code to copy. Rebuild each one the app's own way: HTML-string helpers in `js/ui.js`, class recipes in `css/style.css`, effects through `js/motion-fx.js` and values from `css/tokens.css`. Don't load the reference JS or CSS in the app.

To view them, serve the repo over HTTP and open `/docs/delight-reference/delight-reference.html`. The prototypes keep their original numbers, so they don't run 1–6:

| # | Prototype | Code |
|---|---|---|
| 01 | Draft room: on the clock | `delight.js` → `draft()` |
| 03 | Since last night | `delight.js` → `daily()` |
| 04 | Champion crowned | `delight.js` → `champ()`, `burst()` |
| 05 | Chat gestures | `delight.js` → `chat()` |
| 06 | Team page | `delight-2.js` → `team()`, `delight-2.css` (`.tp-*`) |
| 08 | Landing: app tour | `delight-3.js` → `tour()`, plus `landing()` in `delight-2.js`; `delight-3.css` (`.tr-*`), `delight-2.css` (`.ld-*`) |

Prototype CSS for 01, 03, 04 and 05 is inline in `delight-reference.html` (`.dr-*`, `.do-*`, `.ch-*`, `.ct-*`). `ds/` is a snapshot of the design-system tokens the prototypes load. Every `var(--…)` in them already exists in `css/tokens.css`.

## Fidelity

**High fidelity.** Colors, type, radii, durations and easings are final. Match them, using the app's real data in place of the sample data. Where the prototype and the app's current markup disagree on something that isn't listed here as a change, the app wins.

## Ground rules for every phase

1. **Tokens only.** No raw hex or rgb outside `css/tokens.css`. Team colors come from `TEAM_META` (already allowlisted in `tests/design-tokens.test.mjs`). The confetti palette is `--accent`, `--accent-fill` and `--text`, plus the champion's team colors from data.
2. **Helpers only.** Each new piece below gets a `js/ui.js` helper and a class recipe in `css/style.css`. List the new helpers in the PR so the design system can add matching components.
3. **Gate and fall back.** Everything plays only when `fxOn()` is true. Every effect ends on exactly what the plain render shows. With reduced motion you get the end state instantly.
4. **Once per device.** Big moments use `once(key)` from `js/motion-fx.js`, with the keys listed in each phase.
5. **Deploy the worker first** for any phase that adds a worker field: phase 3 (replies) and phase 6 (champion message).
6. **Update `GUIDE`** in `js/guide.js` when a phase ships something a person would want explained: swipe between teams, hold-and-slide reactions, swipe to reply.

### Color rule change (update `CLAUDE.md`)

The current rule is "team colors appear only on the team page hero and crests". This pass widens it. Replace that line with:

> Meaning colors: gold (`--accent`) means you or locked points, blue (`--provisional`) means live points that can still change, red (`--live`) means a game in progress. Team colors are identity, never meaning. They appear as crests and badges, and as a soft blurred **team orb** on the team page hero, the draft room's pick landing, Since last night cards, the champion reveal and the share card. Never use a team color for text, borders or state.

### Shared pieces (build these the first time a phase needs them)

**Team orb** (`.team-orb`). This is the hero's existing orb, made reusable. It's an absolutely positioned circle filled with the team's primary color and blurred, sitting behind content and under a scrim where text sits on top of it. Add these tokens:

```css
--orb-blur: 64px;          /* 56–72 in the prototypes; one value is fine */
--orb-opacity: 0.5;        /* hero, pick landing, champion */
--orb-opacity-soft: 0.42;  /* update cards, share card */
```

Its color is set inline from data (`style="--orb:${meta.accent}"`), and the color transitions over 700ms `--ease-out` so swiping between teams cross-fades it.

**Gestures** (`js/gestures.js`, new and pure enough to test). One pointer helper with axis lock, shared by the update stack, team-page swipe, pull-stretch and swipe to reply. Add the constants to `js/utils.js` next to the easings:

| Constant | Value | Used for |
|---|---|---|
| `LONG_PRESS_MS` | 380 | chat reaction picker |
| `MOVE_SLOP` | 6–8px | cancels long press, picks the axis |
| `SWIPE_COMMIT` | 70px (team), 90px (cards), 52px of travel (reply) | |
| `FLING_VELOCITY` | 0.6 px/ms | throwing cards |
| `RUBBER_BAND` | 0.5–0.6 | drag resistance |

Snapping back is always 520ms `--ease-spring`. Use `setPointerCapture`. Use `touch-action: pan-y` on anything that swipes sideways, so vertical scroll still works.

**Odometer.** Use the existing `rollNumbers` for every count-up and roll.

---

## Phase 1: Draft room (prototype 01): `js/draft.js`

Extends motion-plan Phase 1. Hook into `draftEvents` / `playDraftEvents`.

**Status: done** (2026-10-02). Notes from building it:
- **Hero:** shows on desktop and phone while you're on the clock, in place of the old gold clock card. Its subline uses the
  app's pick labels ("Pick 2.07 · your next turn is 3.04") and adds make-up, via and auto-draft when they apply. On a
  phone the top block (clock, rail, tabs) stops being sticky while the hero is up, since 220px pinned over the list left
  too little of it. Once the hero is mostly scrolled away, a slim bar (`clockMiniHtml`) slides down pinned to the top
  with the same clock (tap it to go back up), and drafting from down the list scrolls back up to the hero (420ms) before
  the landing plays, the crest still flying from where you tapped. Other drafters' turns keep the compact card / desktop
  strip.
- **Clock:** `draftClockHtml` / `setDraftClock` in `js/ui.js`; `updateClock` ticks it (no re-render), and the region's
  HTML stays the same from tick to tick. The old last-5-seconds gold urgency (`fxUrgency`) is replaced by the red
  last 8 seconds and the beat; the nudge at zero stays. Over time it holds 0:00 in red.
- **Landing:** the hero stays landed (`ui.landed`) while the next drafter picks, until another pick lands or you're up
  again, with a "Mo is picking…" line and their clock under it in place of the prototype's CTA. A pick seen on another
  device, or after the once key was spent, shows the landed hero with no motion. Without a tap on this device
  (auto-draft, a mock room's timeout) there's no flight; the badge pops in instead. The "Drafted …" toast is kept only
  for picks made for someone else. The row collapse is transform-only: the row fades where it was while the rows under
  it slide up into the gap.
- **Rail:** phone only (`#dm-rail`, three picks back to twelve). On desktop the board grid already is the pick order.
  It slides along on every pick, not just yours.

**Draft clock** (`draftClockHtml({ secondsLeft, total, hurry })`). This is an SVG ring, 108×108, r=54, stroke 6.
- The track is `--fill-soft`. The ring is `--accent` with `stroke-linecap: round` and `stroke-dasharray: 339.3`.
- Draw the offset one second ahead (`C·(1 − (left−1)/total)`) with a 1000ms linear transition, so the ring lands as the number changes.
- In the center: time 28px Space Grotesk 700, tabular, −0.5px; a label below it ("to pick"), 9px 800 uppercase 0.08em `--text-mute`.
- At 8 seconds or less (`hurry`): ring and time turn `--live`, and the clock beats every 1s (scale 1 → 1.05 at 12% → 1 at 35%, `--ease-out`).
- The real room's clock is soft, so when it hits 0 hold "0:00" in red; don't auto-pick. Mock rooms keep auto-picking.

**On the clock hero.** A card, height 220, radius 20, `--surface` with a 1px `--hairline` border, holding the clock, then the title "You’re on the clock" (20px Space Grotesk 700) and a subline "Pick 3.4 · your next turn is 4.7" (13px Manrope 500 `--text-sub`). Use the real pick numbers.

**Pick landing** (`pickLandingHtml`). This plays only on **your own** pick (motion plan: your pick only). Sequence:
1. The clock and title fade and scale to 0.85 (260ms opacity, 400ms transform).
2. The team orb blooms from the hero center: scale 0.2 → 1 over 1100ms and opacity 0 → 0.5 over 700ms, `--ease-out`.
3. The picked row's badge flies to the hero center at 72px with `flyTo`, 720ms, `cubic-bezier(0.34,1.4,0.64,1)`.
4. When it lands, `ringPulse` the badge with a gold ring (0 → 16px, 900ms). "Your pick is in" (24px Space Grotesk 700) and "Arsenal · EPL · Pick 3.4" rise 14px with a 90ms stagger, 500ms.
5. The picked row collapses: height → 0 over 380ms `--ease-out`, opacity → 0.
6. Rail: your slot turns done and its team chip pops (`pop`, from 0). After 300ms the next slot turns current and the rail slides left (600ms `--ease-out`).
7. At about 1.2s, a pill fades in: "You pick again at 4.7 · 12 picks away" (11px 700, `rgba(var(--hero-fade-rgb),.55)` background).

The CTA becomes a ghost "Mo is picking…" with a live dot. If auto-draft made the pick, the title reads "Auto-picked for you". Once key: `pick:<room>:<n>`.

**Snake rail** (`snakeRailHtml`). If the room already shows the pick order, apply this styling to it rather than adding a second one.
- Slots are 58×46, radius 10, `--surface` with a `--hairline` border and 6px gap. Pick number 10px Space Grotesk `--text-mute`; name 12px 700 `--text-sub`.
- A done slot has a 10×10 r3 chip in the team color, top right.
- The current slot has an `--accent-border` border, `--accent-soft` fill and `--accent` name.

Testing: `node tools/rehearse-draft.mjs`. A burst of picks collapses to the newest one, as in the motion plan.

## Phase 2: Team page (prototype 06): `js/team-page.js`

The hero bloom, stat roll, form cascade and shared-element push already exist. Keep them and add the following.

**Status: done** (2026-10-02). Notes from building it:
- **Shared pieces:** `teamOrbHtml` (`.team-orb`, the four new tokens) and `js/gestures.js` (`attachDrag` with the axis
  lock; `lockAxis`, `releaseDirection` and `velocity` are pure and tested in `tests/gestures.test.mjs`). The constants
  are in `js/utils.js`; `gestures.js` imports nothing, so callers pass them in and Node can load it. A vertical drag is
  claimed by cancelling `touchmove` once the axis locks, since `touch-action: pan-y` hands vertical moves to the page.
  Needs a try on a real iPhone: the browser pane only drives a mouse.
- **Hero:** the bloom is now the orb's own (scale 0.2 → 1 over 1100ms, fading in over 700ms); the old team-color
  gradient and its bloom copy are gone. The hero keeps the app's season-phase pill in its meta line, and the orb uses
  `--orb-blur` (64) rather than 72. The notch cover is hidden on this page (`:has()`), and the compact bar covers that
  strip once the hero has scrolled off.
- **Pull:** pull to refresh (motion Phase 5, `PULL_VIEWS` in `js/board.js`) is off on the team page, so the two pulls
  never fight.
- **Swipe:** off on a team you don't own (no dots), rather than running through a league of other people's teams.
  Past 24 teams the dots become "3 of 30". It wraps around, keeps the open tab when the next team has it, and
  replaces `tp` in the URL. The Standings row transform still works: its fixed layer now uses `padding-top` instead
  of a transparent border, so the hero's bleed above the content isn't clipped.
- **Stat strip:** Record, then the standing with its group as the label ("3rd" over "NFC North"), then Points. The
  standing doesn't roll (it would read "0rd"); record and points do, points at 350ms.
- **Path to points** (`teamPathToPoints` in `js/lines.js`) replaces the team page's On the line section and the Draft
  Points tracker, which said the same things. A penalty the team is in is red (`risk` tag and stripe), matching a
  negative Live total on Points, rather than blue. Exact placements in one table (EPL's 1st, 2nd, 3rd) count once
  toward "up to". An admin adjustment is its own locked row, so the rows add up to "now".
- **Next game:** `nextGameHtml` in the existing game card, with the opponent's ESPN logo, abbreviation and short name
  (`opponentAbbr` / `opponentShortName`, new on `fetchEspnTeamSchedule`). A live game, or a team with no ESPN schedule,
  keeps the app's own line.
- **Form strip:** NHL margins scale like EPL's (÷3) and MLB's by 5, since goals and runs ÷25 would all be the 6% minimum.
  Fewer than five games leave the oldest slots empty, so the newest is always on the right. A column with a boxscore
  opens Game Details; the result rows are on Full schedule.

**Hero.** Height 300, with the status-bar area included. Orb 520×520, centered at 38% from the top, blur 72, opacity 0.5. A scrim fades from transparent at 35% to `rgba(var(--hero-fade-rgb),1)`.
- Content is centered at the bottom, 20px up: crest at 76 with shadow `0 12px 32px rgba(0,0,0,.35)` (make it a `--crest-shadow` token); name 28px Space Grotesk 700, −0.6px; meta line 13px 600 `--text-sub` (owner in `--accent` when it's you · league · status tag).
- Then the dots: 6×6, active 18 wide `--text`, others `--hairline-strong`, 320ms `--ease-out`.

**Collapse on scroll.** Set `--p = clamp((scrollTop − 110) / 90, 0, 1)` on the page.
- Hero content moves with `translateY(scrollTop·0.35)` and fades out with `1 − p`.
- A fixed compact bar fades in with `p`: height 96 including the safe area. Its background is `color-mix(in srgb, <team color> 20%, var(--bg))` with a bottom `--hairline` border. Its contents are a 26px badge (r8) and the short name, 16px Space Grotesk 700, rising 8px.
- The back link and favorite star stay visible the whole time.
- Use one passive scroll listener writing a custom property, with no layout reads in the handler.

**Swipe between your teams.** A horizontal drag anywhere on the page (shipped first on the hero alone, widened since), using the gesture helper.
- The hero's crest and name and every section under it follow the finger 1:1, fading to 0.4; the orb drifts at 0.2×. The back bar and dots stay put. Only a clearly sideways drag (|dx| > 1.2·|dy|) claims it, and one that starts in a sideways scroller is left to it.
- Past 70px, or a flick at `FLING_VELOCITY`, it commits: the page slides out the way it was going (110–220ms, faster for a faster flick), then the team changes, scrolls to the top and re-renders, coming in from the other side (±35% of the width, max 220px) over 420ms `--ease-out`, body sections 30ms apart, while the orb color cross-fades.
- Otherwise it snaps back.
- The order is the Home order of the teams you own. With a non-owned team open, swipe within its league instead, or turn swiping off (your call; note it in the PR). Tapping a dot jumps to that team.
- Update the URL each time, so Back still returns to where the page was opened from.

**Pull to stretch.** A downward drag while `scrollTop ≤ 0` grows the hero height by `min(dy,180)·0.5` and scales the orb by `1 + s/260`. Release springs back (560ms `--ease-spring`). Pull to refresh (motion plan Phase 5) is a different gesture on other views. On the team page the stretch replaces it.

**Stat strip.** Three columns: Record, Standing, Points. Points rolls up after 350ms. Labels 9px 800 uppercase; values 20px Space Grotesk 700, tabular.

**Path to points** (`pathToPointsHtml({ rules })`). This is new and sits under Recent form on Overview, folded to a row of state dots and a count ("2 locked · 1 live · 3 in reach") until tapped open. Build it from `LEAGUE_SCORING` and the On the line data (`js/lines.js`) so it always agrees with Live points.
- Header: "Path to points", then "{now} now · up to {max}" (12px 600 `--text-sub`).
- Rows: a 22px node column, then label (15px 700) with a tag, a note (13px 500 `--text-sub`, from On the line, for example "Lead by 1 game, 5 left") and points (15px Space Grotesk 700).
- A 2px `--hairline` line joins the nodes. Between locked rules it is `--accent` and grows `scaleY` 0 → 1, 500ms.
- Nodes pop in, staggered 90ms from 200ms.

| State | When | Node | Points color | Tag |
|---|---|---|---|---|
| `locked` | earned and can't be lost | `--accent` fill, check | `--accent` | Locked (gold) |
| `live` | earning it now, can still change | `--provisional` ring, `--live-stripe` fill | `--provisional` | Live (blue) |
| `reach` | not earning it now, but On the line says still possible | `--provisional-border` ring | `--text-mute` | In reach |
| `off` | out of reach, not started, or a negative rule you're clear of | `--hairline-strong` ring at 45% | `--text-mute` | none |

Negative rules (relegated, last in the division) show as "−3" and stay `off` unless you're in them, which makes them `live`. When a state changes between refreshes, reuse On the line's flip.

**Next game.** Your badge, then vs/at, then the opponent's badge (34px, r11), the opponent's name and a countdown on the right. The countdown is 15px Space Grotesk 700, tabular, `--text-sub`, formatted `Nd HH:MM:SS` (drop `Nd` on game day) and ticking every second while the page is visible. A live game uses the existing live game card instead.

**Form strip** (`formStripHtml`). The last 5 games as five columns.
- Each column is a 60px-tall bar area with a 1px `--divider` midline. A win bar grows up from the midline in `--win`, a loss bar grows down in `--loss`, and a draw is a 4% `--draw` tick.
- Bar height is scaled to the margin: EPL by goals (÷3), others by points (÷25), capped at 48% plus a 6% minimum. The bars grow with `--ease-spring`, staggered 60ms from 300ms.
- Under each bar: W/L/D (10px 800, in its color), the score (11px Space Grotesk 700) and the opponent abbreviation (10px 600 `--text-mute`).
- The existing Recent form list stays behind "Full schedule ›".

## Phase 3: Chat gestures (prototype 05): `js/chat.js`

Long press already opens the seven reactions. Change how it behaves:
- **Hold and slide.** After 380ms the bubble scales to 1.05 (260ms `--ease-spring`). Everything else dims to 22% with a 1.5px blur. The bar springs in above the bubble (380ms, from `translateY(10px) scale(.7)`), aligned to the bubble's side and clamped 10px from the edges.
- **Magnify.** Keep the pointer down. Each emoji scales by `1 + 0.65k` and lifts by `14k`, where `k = max(0, 1 − |dx|/72)` and `dx` is the distance from the pointer. This applies only while the pointer is within 50px above to 40px below the bar.
- **Choose.** Releasing over an emoji picks it. Releasing elsewhere leaves the bar open for a tap, and a tap outside closes it. The right-click path stays.
- **Fly.** The chosen emoji flies from the bar to the message's reaction pill (560ms, `cubic-bezier(0.5,0,0.3,1.3)`). The pill pops (500ms `--ease-spring`) and its count rolls up.
- **Burst.** Every reaction gets the motion plan's six-dot burst. 🔥, 😂 and 😎 also float six small copies of the emoji: each goes up 60–110px with ±35px drift, rotates up to ±30°, lasts 800–1200ms and starts 40ms after the last.
- This plays only on your own reaction (motion plan). Reactions from others just update the pill.
- **Press feedback.** While waiting for a long press, scale to 0.97. Moving more than 8px cancels it.

**Swipe to reply** (new; needs a worker field):
- A rightward drag on a bubble follows at 0.55×, capped at 150px of drag. A reply arrow (26px circle, `--surface-2`) fades in from the left.
- At 52px of travel the arrow ticks: scale 1.15 and turns `--accent-soft` / `--accent`. That's the haptic stand-in; also call `navigator.vibrate?.(8)`.
- Releasing past that point snaps back and shows a "Replying to {name}" chip above the composer (springs up 12px). It has a close ×.
- The message then sends `replyTo: <messageId>`. `worker/chat-room.js` validates that the id exists in the room and stores it; the client renders a one-line quote above the bubble.
- **Deploy the worker first.** An old worker drops the field, so the reply would arrive as a plain message.

## Phase 4: Since last night (prototype 03): Home, `js/board.js`

This shows on the **first open of a calendar day** (Central time, like Points history) when at least one event since your last visit involves you. Store `bx-last-seen` (an ISO timestamp) in localStorage, and write it once the stack is cleared or skipped. Don't show it before a group's first draft, while the draft card leads Home, or while a draft is live.

**Data.** Your events from `js/activity.js` since `bx-last-seen`, newest first, at most 5. Map each to a card:

| Event | Badge | Title | Body | Meta |
|---|---|---|---|---|
| Result for your team | team badge 48 | "Celtics won 112–104" | "Beat the Knicks at home. +3 live points." | "NBA · Final · 10:42 PM" |
| Points locked | team badge | "Arsenal locked top four" | "8 points locked. Those can’t be lost." | Locked tag + league · time |
| Rank move | rank in a gold square | "You moved up to 2nd" | "Passed Jordan and Priya overnight. 6 behind Sam." | "Points · ▲2" |

**Layout.**
- A full-view scrim, `rgba(var(--overlay-rgb),.7)` with a 10px backdrop blur, over Home. Home's rows wait hidden underneath.
- At top 130: "Since last night" (22px Space Grotesk 700) and "Clear all" (13px 700 `--text-sub`).
- The stack is 270 tall. Each card is radius 20, `--surface-2`, a `--hairline-strong` border, 20px padding and the modal shadow, with a soft team orb (240px, top right at −90/−110). Title 24px Space Grotesk 700; body 15px 500 `--text-sub`; meta pinned 18px from the bottom.
- Cards behind the top one sit at `translateY(i·14px) scale(1 − i·0.05)`. Only three are visible.
- Below: "Swipe to clear · 1 of 3".

**Motion.**
- Cards deal in from `translateY(130%)` over 600ms `--ease-out`, 90ms apart, starting at 200ms.
- Dragging follows with `translate(dx, dy·0.25) rotate(dx/18 deg)`, and the next card scales up toward 1 as `|dx|` approaches 140.
- A card throws off past 90px or 0.6 px/ms: `translate(±440px) rotate(±22deg)`, opacity 0, 460ms. The rest restack with `--ease-spring`.
- Clear all throws the remaining cards 110ms apart.
- After the last card, the scrim and header fade (450ms) and Home's rows cascade with `bx-row-in`, staggered 45ms, like the post-splash cascade. A "3 updates" pill pops in beside the Home title (`--accent-soft` with an `--accent-border` border, 500ms `--ease-spring`). Tapping it reopens the stack.
- Reduced motion: no stack. The pill shows, and tapping it opens the same cards as a sheet list.

## Phase 5: Landing page (prototype 08): `landing.html`, `js/landing.js`, `js/landing-explainer.js`

Keep the launch splash, the groups data, the claim flow and the logo handoff into a group. Change the following.

**Header.** Unchanged: `page-header` with logo and "Boxscore".

**Hero** (new):
- Two-line headline, 40px/1.02 Space Grotesk 700, −1.4px: "Draft real teams." then "Score where they finish." in `--accent`.
- Then a paragraph, 16px/1.45 `--text-sub`: "Fantasy drafts across 9 real leagues, followed and scored live. No lineups, no waivers. Just your group and a season."
- The lines rise 14px over 700ms, staggered 90ms, after the splash hands off.
- ⚠ The headline and the "No lineups, no waivers" line are new copy. Confirm both with the owner before shipping.

**Badge drift.** Two rows of 44px team badges (r13, 10px gap), duplicated so they loop, moving `translateX(-50%)` linearly over 46s and 52s in opposite directions. Fade the edges with `mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)`. Use the recruiting group's real leagues and teams, with crests where available. Reduced motion: still rows.

**CTA.** "Find your group" (primary button), smooth-scrolls to Groups.

**How it works: scroll tour.** This replaces the autoplay. `landing-explainer.js` is already a pure function of `(step, p)` with the same six steps and captions, so drive `p` from scroll instead of the 6s timer.
- The section is about 3700px tall (≈560px per step plus the sticky height). It holds a sticky block at `top: 56px`.
- Sticky block, top to bottom:
  - Six segments: 3px tall, 4px gap. Each fills gold as its step plays; done steps stay full. Tapping one smooth-scrolls to that step.
  - A mini screen: height 404, radius 26, `--bg` with a `--hairline-strong` border and shadow `0 24px 60px rgba(0,0,0,.4)`.
  - Below it, the caption: title 20px Space Grotesk 700, body 14px/1.45 `--text-sub`. It rises when the step changes.
- Mapping: `P = clamp((scrollTop + 56 − sectionTop) / (sectionHeight − stickyHeight))`, `step = min(5, floor(P·6))`, local `p = P·6 − step`. Each scene gets `clamp(p / 0.85)`, so it rests at its end state before the next step.
- On a step change, render the outgoing scene at p = 1 (going forward) or p = 0 (going back), so scrolling works in both directions.
- Scenes slide 28px toward the direction of travel: 300ms opacity, 460ms transform, `--ease-out`.
- The mini screen has a **tab bar**: 52px, `--bar-bg` with a 20px blur, five tabs (icons from `js/icons.js`, 17px; labels 9px Space Grotesk 700). The active pill (`--tab-pill`, inset 6/5, r12) springs to each step's page (560ms `--ease-spring`). Steps map to tabs: 1 Home (draft room), 2 Home (team page), 3 Scores, 4 Chat, 5 Points, 6 Points.
- **Scenes use the app's real helpers** (`gameCardHtml`, `splitBarHtml`, `ChatBubble` markup, `pathToPointsHtml`), so the tour stays true to the app:
  1. Draft room: 9 league tiles (3×3) whose pips fill in team colors across 24 picks by p = 0.9, with "Pick n: Team · LG".
  2. Team page: a Lions mini hero with orb, and Path to points rules going Live at p = .2, .42 and .64. "Worth +n" rolls.
  3. Scores: two live cards. The Lions score at p = .3 (roll plus `just-scored` flash), and the clocks advance.
  4. Chat: a shared game, Drew's message at .28, 😂 count 1 at .48 and 2 at .62, Isaac's message at .78.
  5. Points: a gold callout "NFL season’s over. Its points are locked." at .3. Over p .3 → .72 the bars go from blue hatch to gold, and the tags change Live → Locked.
  6. Points: you pass Isaac at .3 (row reorder, 560ms spring). Final at .55 (all bars gold). The trophy lands at .66 (from −14px at scale .3, spring) and the leader row gets the gold wash.
- Reduced motion: keep the current behavior (no autoplay, end states, segment buttons switch steps).

**Group cards.**
- Radius 20, `--surface`. An open group gets a soft gold orb (200px, 0.22 opacity) and "Claim a spot ›" in `--accent`.
- Spots meter: 10 bars, 6px tall, r2, 4px gap. They fill `--accent` (or `--text-mute` when the group is full) one after another, 70ms apart, when the card scrolls into view.
- Under it: "7 of 10 spots taken" and the draft date, 12px `--text-sub`.
- Use the real roster count (`applyRoster`).
- Opening a group: the card expands to fill the screen (clip-path inset from the card's rect, r20 → r44, 640ms `--ease-sheet`), then the existing `#landing-handoff` logo flight continues into the group's splash.

**FAQ.** Keep `<details>`. Animate opening with `::details-content` and `interpolate-size: allow-keywords` where supported (400ms `--ease-out`); the chevron rotates 180° with `--ease-spring`. Otherwise open instantly.

**Reveal.** Section blocks rise 18px and fade in (500/700ms) the first time they're 35% visible (IntersectionObserver).

## Phase 6: Champion crowned (prototype 04): `js/history.js`, `js/champions.js`

**Trigger.** The first open after the commissioner records a season (`champions` gains a season), once per device: `once('champion:<season>')`. It plays over whichever view opens. It also replays from the champion card on Home (shown for 21 days) and from Points → History.

**Sequence** (full-screen layer, `--bg`):
1. The layer fades in (500ms).
2. At 350ms, "The Draft · 2025–26 champion" (11px 800 uppercase `--accent`) rises. The name (64px Space Grotesk 700, −2px) rises letter by letter with `riseLetters`, 55ms apart, from 120ms.
3. At about 1150ms, the total (88px Space Grotesk 700, −3px, `--accent`) counts from 0 over 1500ms ease-out cubic. Under it: "pts · 18 clear of Sam". The champion's top team orb (460px, opacity 0.45) blooms behind it (scale 0.3 → 1, 1600ms).
4. When the count ends, the total pops (scale 1.08, 600ms spring) and the **confetti** bursts from it: 110 small rects in gold tokens and the champion's team colors, gravity 0.24, 120 frames, on a canvas that is removed afterwards. Skip it with reduced motion.
5. The champion's teams drop in: 40px badges with the points each earned, from `translateY(-24px) scale(.6)`, staggered 70ms with spring.
6. Actions rise: "Share to chat" (primary) and "See the final table" (ghost).

**Share card** (`shareCardHtml`). A 240×300 sheet preview (4:5), radius 20, always dark (`--brand-dark`) whatever the theme. Contents:
- Brand mark (16px icon plus "Boxscore", 13px Space Grotesk 700), then a team orb at top left.
- "2025–26 champion" (9px 800 gold), the name (40px), "214 pts · 18 clear of Sam".
- The season race line: the champion's line in `--accent` draws in over 1100ms, the runner-up's in `--text-mute`, using the points history data.
- The champion's team badges at 24px, then the group URL at 10px.

"Send to The Draft" posts it to chat as a new message kind, `champion: { season, drafterId, total, margin }`. The worker validates it against `champions` and writes the text fallback, the way `parseGame` / `gameText` work. The card renders from that data, never from an image. **Deploy the worker first.** (Optional later: "Save image" renders the same card to a canvas.)

---

## State to add

- `localStorage['bx-last-seen']`: ISO timestamp (phase 4).
- `once()` keys: `pick:<room>:<n>`, `champion:<season>`, `since:<YYYY-MM-DD>`.
- Team page: `state.swipeOrder` (team keys) and `state.teamIndex`.
- Chat: `replyTo` on outgoing messages; `m.replyTo` on stored ones (worker).
- Chat message kind `champion` (worker).

## New `js/ui.js` helpers (list in the PR for the design system)

`draftClockHtml`, `snakeRailHtml`, `pickLandingHtml`, `teamOrbHtml`, `updateCardHtml`, `pathToPointsHtml`, `formStripHtml`, `countdownHtml`, `compactBarHtml`, `replyChipHtml`, `spotsMeterHtml`, `tourStepsHtml`, `shareCardHtml`, `championRevealHtml`.

## Design tokens

Everything comes from `css/tokens.css`, mirrored in `docs/delight-reference/ds/tokens/`.
- **Colors:** `--accent` `#D9B45B`, `--accent-soft`, `--accent-border`, `--provisional` `#7C9CD9`, `--live` `#E5484D`, `--win` `#5FB88A`, `--loss` `#D97066`, `--draw` `#B8A369`, `--surface` `#16171B`, `--surface-2` `#1C1D21`, `--sheet` `#18191D`, `--bg` `#0A0B0D`, plus the hairlines and ink tiers.
- **Easing and duration:** `--ease-out` (0.22,1,0.36,1), `--ease-spring` (0.34,1.56,0.64,1), `--ease-sheet` (0.32,0.72,0,1), `--ease-push`; 120 / 200 / 320–420 / 500ms.
- **Radii:** 10 (callouts, rail slots), 14 (cards), 16 (tables), 20 (hero, stacks, group cards), 26 (tour screen), 28 (sheets).
- **New tokens:** `--orb-blur`, `--orb-opacity`, `--orb-opacity-soft`, `--crest-shadow`. Add each to `tokens.css` and the token test.

## Assets

No new image assets. Icons come from `js/icons.js`. The landing logo and app icon are in `icons/`. Team colors and crests come from `TEAM_META`.

## Suggested order

Phase 1 if a live draft is coming up, otherwise Phase 2 first: it's the most-visited page, and Path to points makes On the line visible. Then 3, 4 and 5. Phase 6 only has to be ready before the first league locks.

## Prompt to start Claude Code

> Read `docs/delight-plan.md`, then open `docs/delight-reference/delight-reference.html` over the local preview server and try prototype 06. Follow `docs/design-system-plan.md` and `docs/motion-plan.md`. Do Phase 2 (team page) only. Add the shared team orb and `js/gestures.js` first, then the scroll collapse, swipe between your teams, pull to stretch, Path to points (from `LEAGUE_SCORING` and `js/lines.js`), the countdown and the form strip. New UI goes through `js/ui.js` helpers with tokens only, and every effect is gated by `fxOn()` and ends on the plain render. Update the `CLAUDE.md` color rule as the plan says, add the `GUIDE` entry for swiping between teams, and list the new helpers in the PR.
