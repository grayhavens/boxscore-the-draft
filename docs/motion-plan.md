# Motion lab: implementation plan

This is a handoff for a Claude Code session in `boxscorethedraft`. For timings, read `docs/motion-reference/*.jsx`. These are the React prototypes from the motion lab: use them for durations, delays and keyframes, but don't ship them. It follows what the repo already does: plain ES modules, Web Animations API, and the `canAnimateLive()` gate in `js/motion.js`.

## How it works

1. **Look for changes, not renders.** `draft.js`, `live-now.js` and `overall.js` rebuild their HTML with `innerHTML`. Keep the last state you saw, compare it on each render, and play an effect only when something actually changed. `maybeStartReveal` in `draft.js` already does this. Copy its `firstLook` rule: the first render, a reconnect, or someone joining late gets the settled state with no animation.
2. **Play effects after the DOM is written.** In `render()`, collect events, write the HTML, then run `playEvents(events)` on the new nodes. Use `el.animate()` only, and animate only transform and opacity.
3. **Put the helpers in one module.** Add `js/motion-fx.js` with `pop`, `flashTint`, `ringPulse`, `flyTo`, `sheen`, `stagger` and `burst`. Each helper returns early when `!canAnimateLive()`. The curves and durations come from the motion tokens in `css/tokens.css` (`--ease-spring`, `--ease-out`, `--ease-in-out`, `--ease-push`, `--dur-*`; see `docs/design-system-plan.md`). The Web Animations API can't read a CSS variable, so `motion-fx.js` imports the JS constants from `js/utils.js` (`EASE_OUT` and `EASE_SPRING` exist already; add the others there). `tests/design-tokens.test.mjs` checks that they match `tokens.css`. The motion-lab `.jsx` files are the reference for timings. Their `speed` factor becomes a `motion-fx` setting, which mock rooms set to 2.
4. **Fall back to reduced motion.** Every effect has to end in exactly the state the plain render shows. Then if an effect is dropped or never plays, nothing is lost.

## Phase 1: Draft room (before draft day)

Hook in `js/draft.js` → `render()`. Compare the previous `derive()` result with the current one.

**Status: done** ("Live effects" in `js/draft.js`, helpers in `js/motion-fx.js`). Notes from building it:
- On the clock: the room has already re-rendered the card before the effect starts, so there's no previous name to slide out. The reference's ~1s lead-in for that is dropped. The rest keeps its order and durations: gold fill, eyebrow, letters, two rings, then the timer.
- Your pick: the flight needs the tapped tile, so it plays only for a tap on this device. An auto-pick, or a pick seen on another device, gets the cell flash, the pop and the toast without the flight. The toast reuses the room's existing toast ("Drafted Liverpool", or "Drafted Liverpool for Drew" when proxying).
- Time's up: the nudge plays only as the clock crosses zero. Opening the room already over time doesn't nudge.
- `navigator.vibrate`: skipped, because push alerts don't buzz today.
- `burst` waits for Phase 5 (reaction burst), its only user.
- A full league's count is now green in the plain render too, so the sheen ends on the state the page already shows.
- New markup: `floatPillHtml` in `js/ui.js` (the "order flips" pill). The design system doesn't have it yet.

- **You're on the clock.** Signal: `d.myTurn` goes false → true. Effects: gold fill on the clock card, two ring pulses, the name staggering in, and the board underline sliding to your column. Add a `navigator.vibrate` here if push alerts already buzz.
- **Timer urgency.** Signal: time remaining < 5s while `d.myTurn`. Run this off the clock tick, not `render()`. Toggle a class for the gold tick and the breathing, and do one nudge at 0.
- **Your pick is in (big version, your pick only).** Signal: `s.picks.length` goes up and the new pick's owner is `d.me`, or `d.actor` when proxying. Effects: the crest flies from the tapped pool tile (measure it *before* the re-render) into its board cell, then the cell flashes and the toast appears.
- **Other picks (light version).** Same signal, but someone else made the pick. Only the cell flash in the league tint. No flight and no toast. The on-the-clock change already tells you who's up next.
- **The snake turns.** Signal: `s.picks.length % d.n === 0` after a pick, and the draft isn't over. Show the gold "order flips" pill once.
- **Roster slots fill.** Signal: `d.myCounts[league]` goes up. Pop the slot. When the count reaches `caps[league]`, play the sheen and turn the count green.
- **Draft complete.** Signal: `phase` leaves `'draft'` on the last pick. Ripple the board by `(row + col) * 30ms`, then dim it and bring in the done card.

Testing: `node tools/rehearse-draft.mjs` against `wrangler dev`, plus a mock room. Bursts of fast picks, like the commissioner catching up or an auto-pick, should collapse to the newest event so animations don't pile up. In mock rooms, play everything at 2× speed.

## Phase 2: Scores (`js/live-now.js`)

**Status: done**, together with the Scores cards' move to `gameCardHtml` / `gameSectionHtml` in `js/ui.js`. Notes from building it:
- **Goal:** the odometer and the gold ring already existed. The `+N` (`scoreBumpHtml`, through `floatUp` in `js/motion-fx.js`) floats off the side that scored, only when the score went up by a whole number.
- **Final whistle:** a game seen going from live to final stays on the Live tab for 2 minutes (`ENDED_LINGER_MS`), with the winner's W chip (`tagHtml`, the design system's `Tag` `win`; the app's first `.status-tag`). Otherwise it would vanish from Live on the next refresh, and the moment would never be seen there. The loser's line carries an invisible copy of the chip so both scores keep one right edge. A draw gets no chip. The tint, rail, node and loser fade are CSS keyframes (`.fx-final`).
- **No replay:** a tab coming back from the background re-primes instead of replaying what changed while it was away.

- **Goal flash +1.** Builds on the existing `data-scored` and odometer path around line 588. Add a `+N` badge that floats up off the side that scored.
- **Final whistle.** Signal: game status goes from live to final, using the same per-game cache that stores previous scores. Fade out the live tint, stop the node's ring, dim the loser, and pop a W chip for the winner.

## Phase 3: Points (`js/overall.js`, `js/season-lock.js`)

- **Rank shuffle.** Mostly built already: `obPlayFlip` (line 600) handles the FLIP, the green wash, `countUp` and the chip pop. Still to do: move the wash to the gold leader colour so it follows the climber, and use the spring curve when a row moves up.
- **Points lock in.** Signal: a team's locked points go up, or the season locks. Swap the hatch for solid ink, land the Locked stamp, and roll the total.

## Phase 4: Team page (`js/team-page.js`, `js/live-data.js`)

- **Shared-element push.** Extends the container transform that's already there (line 216). Measure the row's crest and name, and fly them into the hero during the push.
- **Hero bloom.** On open, scale the team colour up from behind the crest and roll the stat strip with `countUp`.
- **Recent form cascade.** In `renderForm`, stagger the rows 70ms apart. Run it once per page open, not on every data refresh.
- **On the line.** Signal: a points-line state changes between refreshes. Flip Chasing → Leading and pop the `+N`.

## Phase 5: Chat & app-wide

- **Reaction burst** (`js/chat.js`). Runs on your own reaction only. Swell the emoji, tick the count up, and burst six dots.
- **Pull to refresh.** This is new: iOS standalone PWAs have no native pull-to-refresh. Add touch handlers on each view's scroller and draw the brand mark from `launch-splash.js` as you pull. On release, refresh the data, then flash the rows that changed. This one is the riskiest because it competes with scrolling, so do it last.

## Fitting the design system

- **Color effects go in CSS, movement goes in JS.** `el.animate()` keyframes stay transform and opacity only. A few lab references also animate `boxShadow`, `filter`, `backgroundPosition` or `color` with raw rgba values: the gold ring on Goal flash, the hatch slide on Points lock, the crest drop shadow on Hero bloom, the title color on Shared push. Build each one as a CSS keyframe that a class toggles, like the existing `just-scored`, using `var(--accent)` and the other tokens. Or fade a tinted overlay's opacity instead. That keeps raw colors out of JS, which the token test requires.
- **New markup comes from `js/ui.js`.** The pick toast, the "order flips" pill, the `+N` badge, the W chip and the Locked stamp are new UI. Each one gets a `ui.js` helper and a CSS recipe, and the PR notes it so the design system can add the component. The Locked stamp and W chip are probably `tagHtml` variants (`lock-in`, `win`) rather than new components.
- **The brand mark is reused, never redrawn.** Pull to refresh builds the mark from the `.launch-splash` markup (the design system's `BrandMark`), not a new drawing.
- **Meaning colors still hold.** The other-pick cell flash uses the league tint (`--league-*`, a chart color, so it isn't saying anything). Gold means you: your pick, you on the clock, you climbing the leaderboard.

## Where this plan and the references disagree

- **Draft complete ripple delay:** use this plan's `(row + col) * 30ms`, not the 50ms in `lab-draft.jsx` (`DraftComplete`). In general, when this plan and a reference file disagree, this plan wins.

## Rules for every effect

- Use the gate: `canAnimateLive()`. Nothing plays before boot finishes or during the splash.
- Skip effects when `document.hidden`, so a tab coming back doesn't replay old events.
- An effect never blocks input. Clicks and taps go through to the final DOM.
- Big moments (your pick, draft complete, points lock) fire only once per event per device. Guard each with a key like `pick:<n>`.

## Prompt to start Claude Code

> Read `docs/motion-plan.md` and the timing references in `docs/motion-reference/`. Do Phase 1 only. Add `js/motion-fx.js`. In `js/draft.js`, find draft events by comparing state between renders (following `maybeStartReveal`), and play them after the DOM is written. Gate everything with `canAnimateLive()`. Add keyframes to the "View transitions"/motion section of `css/style.css`. Test with a mock room and `rehearse-draft.mjs`.
