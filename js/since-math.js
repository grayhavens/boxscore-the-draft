/* Since last time: the pure half (docs/delight-plan.md, Phase 4).

   Turns what happened while you were away into a short stack of cards:
   a summary first (rank, points, locked points, your teams' record), then
   the most notable things, in this order:
     1. a league locking your points, or a team of yours clinching;
     2. postseason games and upsets (a ranked opponent beaten, or losing
        as the ranked side);
     3. a series against one drafter (two or more of your games against
        their teams: "Drew beat you 5–1"), most games first;
     4. a single game against a drafter's team;
     5. any other result.
   The stack only shows when something above a single game happened, or
   your rank moved; otherwise js/since.js shows just the pill.

   js/since.js gathers the inputs and draws the stack; this module imports
   nothing from the browser so Node tests can check it (tests/since.test.mjs). */

export const MAX_CARDS = 5;          // the summary plus four
export const AWAY_MS = 8 * 60 * 60 * 1000;

const WEIGHT = { lock: 6, big: 5, series: 4, drafter: 2, result: 1 };
// Anything at or above this makes the stack worth showing.
const PROMPT_WEIGHT = WEIGHT.series;

export function fmtPts(n){
  return String(Math.round(Math.abs(n) * 10) / 10);
}

export function signedPts(n){
  if(!n) return '0';
  return `${n > 0 ? '+' : '−'}${fmtPts(n)}`;
}

// "Jordan", "Jordan and Priya", "Jordan, Priya and Sam", "4 drafters".
export function nameList(names){
  if(names.length <= 1) return names[0] || '';
  if(names.length > 3) return `${names.length} drafters`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function ordinal(n){
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "14 hours" under a day and a half, then days.
export function awayLabel(ms){
  const h = Math.round(ms / 3600000);
  if(h < 36) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.round(ms / 86400000)} days`;
}

export function isAwayLongEnough(prevAt, now){
  return !!prevAt && now - prevAt >= AWAY_MS;
}

// ---- Games ----

// A game of yours: { id, teamKey, league, leagueLabel, teamName, own, opp,
// oppName ("the Knicks"), oppShort ("Knicks"), oppDrafter, oppDrafterName,
// isHome, detail, at, postseason, ownRank, oppRank }.
export function outcome(g){
  return g.own > g.opp ? 'W' : g.own < g.opp ? 'L' : 'D';
}

// 'win' for beating a ranked opponent you outrank-not, 'loss' for losing
// as the ranked side; null otherwise (and for leagues with no rankings).
export function upsetOf(g){
  const o = outcome(g);
  if(o === 'W' && g.oppRank && (!g.ownRank || g.ownRank > g.oppRank)) return 'win';
  if(o === 'L' && g.ownRank && (!g.oppRank || g.oppRank > g.ownRank)) return 'loss';
  return null;
}

// "Drew's Knicks" for a drafted opponent, else "the Knicks".
function oppLabel(g){
  return g.oppDrafterName ? `${g.oppDrafterName}’s ${g.oppShort}` : g.oppName;
}

function gameLead(g){
  const where = g.isHome ? 'at home' : 'away';
  const o = outcome(g);
  if(o === 'W') return `Beat ${oppLabel(g)} ${where}.`;
  if(o === 'L') return `Lost to ${oppLabel(g)} ${where}.`;
  return `Drew with ${oppLabel(g)} ${where}.`;
}

const score = g => `${g.own}–${g.opp}`;
const verb = g => ({ W: 'won', L: 'lost', D: 'drew' })[outcome(g)];

export function gameCard(g){
  const upset = upsetOf(g);
  const big = g.postseason || !!upset;
  let title = `${g.teamName} ${verb(g)} ${score(g)}`;
  if(upset === 'win') title = `${g.teamName} upset No. ${g.oppRank} ${g.oppShort}`;
  if(upset === 'loss') title = `${g.teamName} upset by ${g.oppShort}`;
  const body = upset ? `${outcome(g) === 'W' ? 'Won' : 'Lost'} ${score(g)} ${g.isHome ? 'at home' : 'away'}${g.oppDrafterName ? ` against ${g.oppDrafterName}’s team` : ''}.` : gameLead(g);
  return {
    kind: 'game', id: `g:${g.id}`, at: g.at, teamKey: g.teamKey,
    weight: big ? WEIGHT.big : g.oppDrafter ? WEIGHT.drafter : WEIGHT.result,
    title, body,
    meta: [g.leagueLabel, g.postseason ? 'Postseason' : '', g.detail || 'Final']
  };
}

// Two or more of your games against one drafter's teams, as one card.
export function seriesCard(drafterId, drafterName, games){
  const sorted = games.slice().sort((a, b) => b.at - a.at);
  const mine = sorted.filter(g => outcome(g) === 'W').length;
  const theirs = sorted.filter(g => outcome(g) === 'L').length;
  const title = mine > theirs ? `You beat ${drafterName} ${mine}–${theirs}`
    : theirs > mine ? `${drafterName} beat you ${theirs}–${mine}`
    : `You and ${drafterName} split ${mine}–${theirs}`;
  const line = g => {
    const o = outcome(g);
    if(o === 'D') return `${g.teamName} and ${g.oppShort} drew ${score(g)}`;
    return o === 'W' ? `${g.teamName} over ${g.oppShort} ${g.own}–${g.opp}` : `${g.oppShort} over ${g.teamName} ${g.opp}–${g.own}`;
  };
  const shown = sorted.slice(0, 2).map(line);
  const more = sorted.length - shown.length;
  return {
    kind: 'series', id: `s:${drafterId}`, at: sorted[0].at, drafterId, count: games.length,
    weight: WEIGHT.series,
    teamKey: sorted[0].teamKey,
    title,
    body: `${shown.join(', ')}${more ? `, and ${more} more` : ''}.`,
    meta: [`${games.length} matchups`]
  };
}

// ---- Locks and clinches ----

// A league locked with points of yours in it. `best` is your biggest
// placement it froze ({ teamKey, teamName, label }), when known; `pts`
// may be null when the feed's event has rolled off.
export function lockCard({ league, leagueLabel, leagueName, pts, best, at }){
  return {
    kind: 'lock', id: `lock:${league}`, weight: WEIGHT.lock, at, locked: true,
    teamKey: best ? best.teamKey : '', league,
    title: best ? `${best.teamName} locked in ${best.label}` : `${leagueName} points locked`,
    body: pts ? `${fmtPts(pts)} point${pts === 1 ? '' : 's'} locked. Those can’t be lost.` : 'The regular season is over. Those points can’t be lost.',
    meta: [leagueLabel]
  };
}

export function clinchCard(e){
  return {
    kind: 'clinch', id: `e:${e.id}`, weight: WEIGHT.lock, at: e.ts,
    teamKey: e.teamKey || '', league: e.league,
    title: e.title,
    body: e.myPts ? `${signedPts(e.myPts)} live points.` : '',
    meta: [e.leagueLabel]
  };
}

// ---- Summary ----

// The first card: where you stand now against the last visit. `rows` is
// today's [{ id, name, rank, total, locked }] (null when not loaded);
// `prev` the visit's { ranks, totals, lockedTotals }; `record` your
// teams' { W, L, D } while away.
export function summaryCard({ me, prev, rows, record, awayMs, at }){
  const away = `Away ${awayLabel(awayMs)}.`;
  const rec = record.W + record.L + record.D ? `${record.W}–${record.L}${record.D ? `–${record.D}` : ''}` : '';
  const mine = rows && rows.find(r => r.id === me);
  const was = prev && prev.ranks ? prev.ranks[me] : null;
  if(!mine){
    return {
      kind: 'summary', id: 'summary', weight: Infinity, at, moved: false,
      title: rec ? `Your teams went ${rec}` : 'Since last time', body: away,
      stats: [], meta: []
    };
  }
  const ahead = rows.filter(r => r.id !== me && r.rank < mine.rank).sort((a, b) => b.rank - a.rank || a.total - b.total)[0];
  const behind = rows.filter(r => r.id !== me && r.rank >= mine.rank).sort((a, b) => b.total - a.total)[0];
  let gap = '';
  if(mine.rank === 1 && behind){
    const d = mine.total - behind.total;
    gap = d > 0 ? `${fmtPts(d)} clear of ${behind.name}.` : `Tied with ${behind.name}.`;
  } else if(ahead){
    const d = ahead.total - mine.total;
    gap = d > 0 ? `${fmtPts(d)} behind ${ahead.name}.` : `Tied with ${ahead.name}.`;
  }

  const moved = !!was && was !== mine.rank;
  const up = moved && mine.rank < was;
  let title, how = '';
  if(moved){
    title = mine.rank === 1 ? 'You took over 1st' : `You’re ${up ? 'up' : 'down'} to ${ordinal(mine.rank)}`;
    const passed = rows.filter(r => r.id !== me && prev.ranks[r.id]).filter(r => up
      ? prev.ranks[r.id] < was && r.rank > mine.rank
      : prev.ranks[r.id] > was && r.rank < mine.rank).map(r => r.name);
    if(passed.length) how = up ? `Passed ${nameList(passed)}.` : `${nameList(passed)} passed you.`;
  } else {
    title = `Still ${ordinal(mine.rank)}`;
    // Closer to (or further from) whoever is just ahead, since the visit.
    if(ahead && prev && prev.totals && prev.totals[ahead.id] !== undefined && prev.totals[me] !== undefined){
      const then = prev.totals[ahead.id] - prev.totals[me], now = ahead.total - mine.total;
      const d = then - now;
      if(d) title += d > 0 ? `, ${fmtPts(d)} closer` : `, ${fmtPts(d)} further back`;
    }
  }

  const ptsDelta = prev && prev.totals && prev.totals[me] !== undefined ? mine.total - prev.totals[me] : null;
  const lockDelta = prev && prev.lockedTotals && prev.lockedTotals[me] !== undefined ? mine.locked - prev.lockedTotals[me] : null;
  const stats = [];
  if(ptsDelta !== null) stats.push({ value: signedPts(ptsDelta), label: 'Points', tone: 'live' });
  if(lockDelta !== null) stats.push({ value: signedPts(lockDelta), label: 'Locked', tone: 'locked' });
  if(rec) stats.push({ value: rec, label: 'Record', tone: '' });

  return {
    kind: 'summary', id: 'summary', weight: Infinity, at, moved, rank: mine.rank,
    corner: moved ? `${up ? '▲' : '▼'}${Math.abs(was - mine.rank)}` : '',
    title, body: [away, how, gap].filter(Boolean).join(' '),
    stats, meta: []
  };
}

// ---- Putting it together ----

// `games`: your games while away; `locks`: lockCard inputs; `clinches`:
// your clinch events; the summary card's inputs ride in `summary`.
// Returns { cards, total, prompt }: the summary plus the top four, how
// many there were before the cut, and whether the stack should show
// (anything at series weight or above, or a rank move).
export function buildCards({ games = [], locks = [], clinches = [], summary, drafterName = id => id }){
  const cards = [];
  locks.forEach(l => cards.push(lockCard(l)));
  clinches.forEach(e => cards.push(clinchCard(e)));

  const rest = [];
  games.forEach(g => {
    const c = gameCard(g);
    if(c.weight === WEIGHT.big) cards.push(c); else rest.push(g);
  });
  const byDrafter = {};
  rest.forEach(g => {
    if(g.oppDrafter) (byDrafter[g.oppDrafter] || (byDrafter[g.oppDrafter] = [])).push(g);
    else cards.push(gameCard(g));
  });
  Object.keys(byDrafter).forEach(d => {
    const list = byDrafter[d];
    if(list.length >= 2) cards.push(seriesCard(d, drafterName(d), list));
    else cards.push(gameCard(list[0]));
  });

  cards.sort((a, b) => b.weight - a.weight || (b.count || 0) - (a.count || 0) || b.at - a.at);
  const record = { W: 0, L: 0, D: 0 };
  games.forEach(g => { record[outcome(g)]++; });
  const head = summaryCard({ ...summary, record });
  const prompt = head.moved || cards.some(c => c.weight >= PROMPT_WEIGHT);
  const anything = cards.length > 0 || head.moved || (head.stats || []).some(s => s.value !== '0');
  return { cards: anything ? [head].concat(cards.slice(0, MAX_CARDS - 1)) : [], total: cards.length + 1, prompt };
}
