# Boxscore: design brief for three new features

## 1. What the app is
Boxscore is a personal fantasy-draft dashboard for 10 friends. Each person drafted real teams across 8 leagues (EPL, NFL, NBA, NHL, MLB, WNBA, College Football, College Basketball). The app tracks how those real teams are doing and turns that into points per drafter. It's an installed iOS PWA (phone-first, one-handed), plain static site, dark theme by default with a light theme option.

Bottom tab bar: **Home** (a drafter's teams board), **Scores** (live and today's games), **Chat** (raised center button), **Standings** (real league standings grouped by draft team), **Points** (drafter leaderboard). Settings is a gear icon in each header. Detail screens push in from the right with a back link (e.g. `← Points`).

Points tab today: header, mode switch and a "Scoring" chip in a toolbar row, then a plain list of drafters (rank, name, one confirmed total). Tapping a name opens that drafter's detail: one accordion card per league, with provisional points flagged.

## 2. Constraint: no betting
Do not propose or design anything odds- or betting-related.

## 3. How scoring works (this drives every design decision)
Points are NOT earned per game. They come from **placement** and **postseason rounds**, plus a **bonus**. A single win only matters if it moves a team across one of these lines.

- **Placement rules (auto-derived from live standings, so they move):** division title (+2), best record in conference (+3), last place in division (-2), worst record in conference (-3), make the playoffs (+1, uses ESPN's real clinch data).
- **Postseason rules (entered manually once known):** conference finals, finals, championship, bowls, CFP, etc.
- **League bonus:** +5 to the drafter with the best *combined win %* across all their teams in that league (EPL's is highest combined EPL points).
- EPL is bespoke: win league +9, 2nd +6, 3rd +3, relegation -5, plus cups and European spots.
- MLB and WNBA don't score until their next season starts, so they show non-scoring "prior season" data and should stay hidden from these features until then.

Existing status vocabulary: **provisional** points = auto-derived placement points that can still change until a league locks its regular season. Confirmed points = decided.

## 4. Existing visual language (match this)
Dark theme tokens from `css/style.css`:
- Background `#0A0B0D`, surface `#16171B`, sheet `#18191D`
- Text `#F3F4F6`, secondary `#94969E`, muted `#64666E`
- Hairlines: white at 7% and 14%
- **Accent: gold `#D9B45B`** (leader, CTAs, selected)
- Win green `#5FB88A`, loss red `#D97066`, draw `#B8A369`, live red `#E5484D`
- **Provisional: blue `#7C9CD9`** (soft fill `rgba(124,156,217,0.16)`, border `rgba(124,156,217,0.38)`)
- Per-league chart colors are a separate hand-tuned set (EPL `#826AC8`, CFB `#C86AA1`, NFL `#91C86A`, CBB `#C58C6A`, NBA `#B57FC0`, NHL `#6FBFC6`, MLB `#6AC87A`, WNBA `#A8B36A`)
- Team badges are small rounded squares in the team's brand color with an abbreviation.

Note: the rough mockups made in chat used blue as the general accent and amber for provisional. That is **reversed** from the real app. In the real app, gold is the accent and blue means provisional. Please design with the real tokens.

## 5. The three features

### A. Projection (Points tab, list and drafter detail)
Goal: show where each drafter is likely to finish, in a way that fits placement-based scoring (no pace extrapolation).

Three buckets of points per drafter:
- **Locked:** can't be lost (clinched playoffs, decided titles or last places).
- **Leading:** held today but can still change (division lead, conference #1, current bonus leader). These are the existing provisional points.
- **In reach:** not held now but the team is close to the line.

Design asks:
1. **Points list:** add a `Now | Projected` segmented switch in the toolbar (Now stays the default). In Projected mode each row's total gets a stacked bar (locked / leading / in reach) with a one-line breakdown, e.g. "Locked 24 · Leading 13 · In reach 6".
2. **Drafter detail:** add a **Closest calls** card above the per-league accordions. 3 to 5 items, each with the team, the rule and points at stake, and a safety note in plain language ("Lead by 1 game, 14 left. Contested", "Lead by 3, magic number 5", "Toss-up").
3. Show postseason points as a single unresolved line ("Postseason: up to +N"), never inside locked or leading.
4. Hide the range early in a season; show only when enough games are played.

### B. Head to head (drill-down from a drafter's detail)
Goal: compare any two drafters, built around scoring rules, not games.

Design asks:
1. **Entry:** a `Compare` button in the drafter detail header opens a picker of the other nine drafters, then the compare screen (push-in, back link to that drafter).
2. **Header:** two totals, ranks, and the gap.
3. **Bonus race:** per league, each drafter's combined win %, highlighting who holds the +5. This is the biggest swing in the scoring, so it leads.
4. **Where the gap comes from:** placement points and bonus points per league, signed and colored.
5. **Same race:** callouts when both drafters own teams in the same division or conference (e.g. Lions and Packers in the NFC North), since one team's win is the other's loss.
6. A `Change` control to swap the opponent without going back.

### C. Rule-change activity feed (Home card and a full Activity list)
Goal: answer "what changed since I last looked", logging **rule changes, not game results**.

An item appears only when a team crosses a scoring line: takes or loses a division lead, takes or loses best record in conference, moves into or out of last place, clinches the playoffs, the win % bonus flips between drafters, or a drafter's overall rank changes. Each item says who gained or lost points and marks provisional points in the provisional blue. Plain wins and losses stay on Scores.

Design asks:
1. **Home:** a card between the header and the filter chips showing the latest 3 items with "See all". Decide the empty state, or hide the card when nothing moved recently.
2. **Full Activity list:** reached from an `Activity` chip in the Points toolbar (next to the Scoring chip). Filters: All, My teams, Rank moves. Group by day.
3. Each item: title, time, the drafter point deltas, and a tap target to the team or drafter.

## 6. Open design questions
- Toolbar crowding on small phones with the Now/Projected switch, Activity and Scoring together. Consider an icon-only Activity button.
- Should Activity live on Home for everyone, or only appear when something moved in the last day?
- Should Projected ever become the default view?
- If the feed gets heavy use, should it move to a second segment on the Scores tab (Scores | Activity)?

## 7. Data and build notes (for feasibility, not for design)
- Head to head needs no new data (reuses the combined win % already computed for Points). Build it first.
- The feed needs the worker to snapshot the leaderboard on a schedule and store events in KV, otherwise it only sees changes while someone has the app open. This is also the plumbing push notifications would need later (notifications are on hold).
- Projections need games-remaining data per team (ESPN standings and schedule appear to carry it, to be verified per league). NFL and college football schedules are short, so use qualitative labels ("contested", "safe") instead of magic numbers there.
- Suggested build order: head to head, then feed, then projection.
