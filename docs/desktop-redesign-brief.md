# Brief: desktop / iPad redesign, round 2

Feedback on the v3 handoff (`design_handoff_desktop_team_hub`, "Boxscore Desktop v3"). The shell, the team rail,
Home and Points are close; keep them. This round changes the **team page** and adds a **chat column**. Everything
else in the v3 README still stands unless it's changed below.

## What changes, in short

1. **Remove the radar** ("Against the league") entirely. It needs data we don't have and isn't tied to points.
2. **Replace the Points path tiles with "On the line"** (panel A below): one row per scoring rule, with the gap.
3. **Add "Game by game"** (panel C below): a margin-per-game bar chart. It's the page's one chart.
4. **New team page layout:** a full-width hero band on top, then **two columns**, then the Results/News row.
5. **Add chat to the wide layout:** an open column at 1280px+, a slide-over panel from 900–1280px.
6. **Team color is for identity only.** Crest, badge, hero orb and the ambient glow may use it. No data shapes,
   card tints, text, borders or state in team color. (This is a hard rule in the app's design system.)

## Breakpoints

| Width | Layout |
| --- | --- |
| < 900px | The existing phone app. Not part of this design. |
| 900–1279px (iPad landscape 1194, iPad portrait 1024 Pro) | Rail + content. Chat opens as a slide-over from a header button. |
| ≥ 1280px | Rail + content + chat column (collapsible). |

Design frames to show: **1194 × 834** (iPad landscape, chat closed and open) and **1440 × 900** (chat column open,
and collapsed). Also one **1024 × 1366** frame (iPad Pro portrait) to show the narrowest case.

The v3 frame was 900px down to 700px with the rail; drop that. Below 900px is the phone app.

## Team page

### Hero band (full width, top)

Everything that answers "how are they doing right now", in one row. Replaces v3's column 1 header and column 3 hero.

- **Left:** the crest (real crest image, about 96–120px) sitting on the soft team-color orb, with the 1px circle
  outline behind it. Keep the drop shadow on the crest only.
- **Next to it:** the standing pill + label + league ("1st · Table · Premier League"), the team name (Space Grotesk,
  big, `text-wrap: balance`), and the owner line ("Your team" in `--accent`, or "Drew's team" / "Undrafted").
- **Middle/right:** the live or next game card, as in v3, but with **no team-color tint**. Live games keep the red
  `--live` wash; otherwise a plain `--surface` card. Drop the stake line ("Win and Liverpool go 5 clear"); it isn't
  built. Keep the opponent's owner on the right of the footer.
- **Far right:** the "Your points" card (total, Locked/Live state, chevron to Points) and the favorite star.
- The ambient glow stays (team color, or the secondary color when the primary is very dark).
- At 900–1279px the band can wrap to two rows: identity on top, game card + points card below.

### Two columns below the band

`grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`, so it's two columns at every wide width (and one if
the content area is squeezed by an open chat panel).

**Column 1: points and form**
1. **On the line** (panel A)
2. **Season** stats row (Record, Standing, two key stats), as in v3
3. **Game by game** (panel C)
4. **Splits** row (Home, Away, for, against), as in v3

**Column 2: schedule and squad**
1. **Last 5** form tiles, as in v3. The score tooltip must also work by tap (iPad has no hover).
2. **Schedule**, as in v3
3. **Key players**, as in v3

### Bottom row

Results + News, unchanged from v3.

### Reduced page (preseason, or no games yet)

Hero band as normal (next game, or "Season starts Nov 3"). One card in place of the columns: "Stats, form and
the lines fill in once {Team} have played a few games." Hide the bottom row. Show On the line rows only if the
league has started.

## Panel A: On the line

Replaces the Points path tiles. Answers "what is this team worth to its owner, and how close is each call?"

**Header:** "On the line" on the left; on the right, "{now} pts now · {max} possible" (12/600 `--text-sub`).

**Rows:** one per scoring rule in the league, in rule order. Grid roughly `1fr auto`, 1px `--divider` between rows,
min-height ~52px.
- **Left:** the rule label (14/700, e.g. "Win the league") over the line note (12/600 `--text-sub`, e.g.
  "3 pts clear of Arsenal").
- **Right:** the points chip (Space Grotesk, signed, e.g. "+4" or "−2" with a real minus) with its state.

**Row states** (these come straight from the app's scoring code; design every one):

| State | Meaning | Chip |
| --- | --- | --- |
| `locked` | Earned, can't be lost | `--accent-soft` fill, `--accent` text |
| `live` | Earned off today's table, can still flip | `--provisional-soft` fill, `--provisional` text |
| `reach` | Not earned, still possible | No fill, inset 1px `--hairline-strong` ring, `--text-sub` |
| `off` | Out of reach, not started, or a penalty the team is clear of | Row dimmed: label and chip in `--text-mute` |

Some rules are **penalties** (negative points, e.g. relegation, worst record). A penalty the team is in shows as
`live` or `locked` with a negative number; the chip should still read clearly as a loss (consider `--loss` text on
`--loss-soft` for negative chips).

**Line notes you'll see** (the app writes these; use them as sample copy):
- Holding: "1½ games up on Packers", "Level with Arsenal"
- Clinched: "Can't be caught"
- Chasing: "2 pts behind Lions"
- Out: "Can't catch Liverpool"
- At risk (penalty): "2 pts behind Wolves to climb out"
- Stuck (penalty): "Can't climb out"
- Clear (penalty): "5 pts clear of Wolves"
- Safe (penalty): "Can't fall in"
- No line: "From today's table", "Final standings", "Once the season starts", "Counts from next season"
- Commissioner adjustment: its own locked row, note "Set by the commissioner"

Optional: a thin gap bar under the note showing how close the call is (full = comfortable, near-empty = tight).
Neutral ink only; no team color.

Rules that aren't decided by a table (cups, "Make Champions League", playoff rounds) have no line note; they show
as `reach` until the commissioner marks them, then `locked`. Expect 8 rows per league, so keep rows compact.

**Sample, Liverpool (EPL), using the real rules:**
- Win League Cup · (no note) · +1 reach
- Win FA Cup · (no note) · +2 reach
- Make Europa League · (no note) · +3 reach
- Make Champions League (any stage) · (no note) · +4 reach
- 3rd in EPL · (no note) · +3 off
- 2nd in EPL · (no note) · +6 off
- Win EPL · 3 pts up on Arsenal · +9 live
- Relegation · Can't fall in · −5 off

**Sample, Lions (NFL):**
- Make the playoffs · From today's table · +1 live
- Division title · 1 game up on Packers · +2 live
- Best record in conference · Level with Eagles · +3 live
- Make conference championship / Make Super Bowl / Win Super Bowl · +2 / +3 / +5 reach
- Last place in division · 3 games clear of Bears · −2 off
- Worst record in conference · Can't fall in · −3 off

## Panel C: Game by game

The page's one chart. Answers "how have they actually been playing?"

**Header:** "Game by game" on the left, "{W}–{L}(–{D}) · last {N}" on the right.

**Chart:** one bar per game played this season, oldest left, newest right. Bars go up from a zero line for wins and
down for losses, height = score margin. Draws/ties are a small flat mark on the line.
- Colors: `--win` up, `--loss` down, `--text-mute` for draws. **No team color.**
- Show up to ~20 games; for MLB/NBA/NHL (80+ games) show the last 20 with "last 20" in the header.
- Cap the bar height so one blowout doesn't flatten every other bar (e.g. clamp at the league's typical big margin
  and mark clamped bars with a small notch).
- Hover **and tap** a bar: a small tooltip with date, opponent, home/away and the score.
- Tie the newest bar to the Last 5 tiles visually (same order, newest right).
- Animate bars growing from the zero line on first show (respect reduced motion; ends on the plain render).
- About 120–140px tall. Light and dark theme both need to work.

**Sample:** use the Liverpool form from v3 extended back to 9–10 games, plus one NFL team (margins of 3–24) and one
MLB team (last 20, margins 1–8) so we can see how it scales.

## Chat

The group chat that today is its own tab.

**≥ 1280px: column on the right.**
- About 340px wide, full height under the header, 1px `--hairline` left border, sticky.
- Header: "Chat" (Space Grotesk 15/700) + online/typing hint, and a collapse button. Collapsed, it becomes a thin
  strip (or just the header Chat nav item) with an unread count.
- Body: the existing message list design (bubbles, GIFs, @mentions, reactions) at desktop density.
- Composer pinned to the bottom. Enter sends, Shift+Enter is a new line.
- While the column is open, the "Chat" header nav item toggles the column instead of switching views.

**900–1279px: slide-over.**
- The Chat nav item (with unread badge) opens a ~380px panel from the right, over the content, with a scrim.
  Esc or the scrim closes it.

Show: chat column open on the team page (1440), collapsed (1440), and the slide-over open (1194).

## Other notes for this round

- **Light theme.** The app has light and auto themes. Please include one light frame of the team page. Use the
  design system's tokens (`--text`, `--hairline`, `rgba(var(--ink-rgb), …)` washes); avoid raw
  `rgba(243,244,246,…)` and the `#050607` outer page color (we'll make that a token).
- **iPad touch.** Anything that only appears on hover (form tile score, game bars, row washes) needs a tap state.
- **Keyboard.** Show a focus ring on rail items and a hint for ↑/↓ to move between teams (small, maybe in a tooltip
  on the rail).
- **Rail overflow.** 14 teams overflow a 900px-tall window. Add a fade at the rail's bottom edge so mouse users can
  tell it scrolls.
- **Points table.** League columns should be the group's leagues (not a fixed 8), and the split bar should scale to
  the leader's total, not a fixed 32.
- Everything else (header, rail, Home, Points, motion, tokens) as in the v3 README.
