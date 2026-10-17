/* ============================================================
   Home's priority rule (docs/home-priority-plan.md): which of the things
   that can sit above your teams show, in what order, and which fold into
   "More right now". Pure, no DOM, shared by js/board.js and
   tests/home-stack-math.test.mjs.

   Every source (the Draft card, the champion row, each postseason card,
   a golf major, the last-season row) hands in an item:
     { id, tier, state, mineAlive, order, title, html }
   - tier: 'draft' | 'champion' | 'counts' | 'last-season' | 'no-points',
     highest first. 'counts' is a postseason or major that scores for
     this group; 'no-points' one shown but not scoring (MLB and WNBA while
     they show a prior season).
   - state (postseasons and majors): 'live' (under way) before 'set'
     (field set, not started) before 'done' (the champion week).
   - mineAlive: you still have a team (or golfer) in it; breaks a tie.
   - order: the league's tab position; the last tie-break.
   At most `max` show (the Draft card is always one of them); the rest
   fold, in the same order.
   ============================================================ */

export const HOME_STACK_MAX = 2;

const TIERS = ['draft', 'champion', 'counts', 'last-season', 'no-points'];
const STATES = ['live', 'set', 'done'];

const rankOf = (list, v) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};

export function compareHomeItems(a, b){
  return rankOf(TIERS, a.tier) - rankOf(TIERS, b.tier)
    || rankOf(STATES, a.state) - rankOf(STATES, b.state)
    || (b.mineAlive ? 1 : 0) - (a.mineAlive ? 1 : 0)
    || (a.order ?? 99) - (b.order ?? 99);
}

// Items → { shown, folded }, both in priority order. Empty or missing
// items are skipped.
export function orderHomeItems(items, { max = HOME_STACK_MAX } = {}){
  const sorted = (items || []).filter(it => it && it.html).slice().sort(compareHomeItems);
  return { shown: sorted.slice(0, max), folded: sorted.slice(max) };
}

// The fold row's words: "More right now (2)" over the folded titles.
export function foldSummary(folded){
  return { title: `More right now (${folded.length})`, sub: folded.map(it => it.title).filter(Boolean).join(' · ') };
}
