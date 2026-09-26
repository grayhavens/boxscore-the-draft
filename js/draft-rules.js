/* ============================================================
   Draft rules: the pure functions every part of the draft room agrees
   on — snake order, who owns a slot, roster caps, the pick clock.

   No imports and no DOM/Worker APIs on purpose: the static site's draft
   UI and the worker's DraftRoom Durable Object (worker/draft-room.js)
   both import this same file, so the rules can't drift between what a
   drafter's screen allows and what the server accepts. See
   docs/draft-room-plan.md.

   Vocabulary: a "slot" is a 0-based index into the whole draft
   (slot 0 = round 1 pick 1); a "position" is a 0-based column within a
   round; `order` is the lottery result — drafter ids by round-1
   position. Snake means odd rounds run the order backwards.
   ============================================================ */

// Roster slots per drafter, by league key — sums to the number of rounds.
export const DEFAULT_CAPS = { epl: 2, nfl: 3, nba: 3, nhl: 3, mlb: 3, wnba: 1, cfb: 3, mcbb: 3 };
export const DEFAULT_CLOCK_SECONDS = 90;
export const MIN_CLOCK_SECONDS = 10;
export const MAX_CLOCK_SECONDS = 300;

// Mock rooms (?room=mock-1, …) are the self-serve practice drafts: bots
// and auto-picks run there (worker/draft-room.js), never in "main".
export const DEFAULT_BOT_SECONDS = 3;
export const MIN_BOT_SECONDS = 1;
export const MAX_BOT_SECONDS = 60;
export function isMockRoom(room){
  return typeof room === 'string' && /^mock(-|$)/.test(room);
}

// Leagues whose pool is only pre-loaded with the top schools; any other
// school can be added on the fly as a "write-in".
export const WRITE_IN_LEAGUES = ['cfb', 'mcbb'];

export function totalRounds(caps){
  return Object.values(caps).reduce((sum, n) => sum + n, 0);
}

export function totalPicks(config){
  return totalRounds(config.caps) * config.drafters.length;
}

// The drafter who owns `slot` under the plain snake, ignoring trades.
export function naturalOwner(slot, order){
  const n = order.length;
  const round = Math.floor(slot / n);
  const pos = slot % n;
  return order[round % 2 === 0 ? pos : n - 1 - pos];
}

// Trades are stored as slot -> drafter overrides on top of the snake.
export function ownerOf(slot, order, overrides){
  const traded = overrides && overrides[slot];
  return traded || naturalOwner(slot, order);
}

// "3.07" — 1-based round, then 1-based pick within the round.
export function pickLabel(slot, drafterCount){
  const round = Math.floor(slot / drafterCount) + 1;
  const pick = (slot % drafterCount) + 1;
  return `${round}.${String(pick).padStart(2, '0')}`;
}

// The slot on the clock: the lowest one with no pick. After a pick is
// removed this is the hole (a "make-up" pick), and once it's filled the
// draft carries on from where it was. null when every slot is filled.
export function currentSlot(picks, total){
  for(let slot = 0; slot < total; slot++){
    if(!picks[slot]) return slot;
  }
  return null;
}

export function teamById(pool, teamId){
  return pool.find(t => t.id === teamId) || null;
}

export function takenTeamIds(picks){
  const taken = new Set();
  Object.values(picks).forEach(p => taken.add(p.team));
  return taken;
}

// { leagueKey: count } of what `drafterId` owns. `exceptSlot` leaves one
// pick out — used when validating an edit that replaces that pick.
export function leagueCounts(picks, pool, order, overrides, drafterId, exceptSlot){
  const counts = {};
  Object.keys(picks).forEach(key => {
    const slot = Number(key);
    if(slot === exceptSlot) return;
    if(ownerOf(slot, order, overrides) !== drafterId) return;
    const team = teamById(pool, picks[key].team);
    if(team) counts[team.league] = (counts[team.league] || 0) + 1;
  });
  return counts;
}

// Teams `drafterId` could still take right now (not taken, league cap
// not full). Order follows the pool, which is ranked.
export function availableTeams(state, drafterId){
  const taken = takenTeamIds(state.picks);
  const counts = state.order
    ? leagueCounts(state.picks, state.pool, state.order, state.overrides, drafterId)
    : {};
  return state.pool.filter(t => !taken.has(t.id) && (counts[t.league] || 0) < (state.config.caps[t.league] || 0));
}

// What an auto-pick takes for `drafterId`: the first team on their own
// queue that's still legal for them, else the best one left that fits.
// "Best" compares leagues fairly: a team's rank as a fraction of its
// league's pool (Liverpool 1/20 beats the 5th NFL team, 5/32), unranked
// write-ins last. Ties (every league's #1 at the start) go to `rand`
// when given, so a room of bots doesn't all draft the same league.
// null if nothing fits.
export function autoPickTeam(state, drafterId, queue, rand){
  const open = availableTeams(state, drafterId);
  if(!open.length) return null;
  const ids = new Set(open.map(t => t.id));
  const queued = (queue || []).find(id => ids.has(id));
  if(queued) return queued;
  const size = {};
  state.pool.forEach(t => { size[t.league] = (size[t.league] || 0) + 1; });
  const score = t => (Number.isInteger(t.rank) ? t.rank / size[t.league] : 2);
  const best = Math.min(...open.map(score));
  const tied = open.filter(t => score(t) === best);
  return tied[rand ? Math.floor(rand() * tied.length) : 0].id;
}

// Random order for the lottery. `rand` is injectable (returns [0,1)) so
// tests are deterministic; the Durable Object passes a crypto-backed one.
export function shuffled(ids, rand){
  const out = ids.slice();
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Swaps who owns two unpicked slots. Returns the new overrides map, with
// any entry that now equals the natural snake owner dropped so a swap
// and its reversal leave no trace.
export function swapSlots(order, overrides, slotA, slotB){
  const ownerA = ownerOf(slotA, order, overrides);
  const ownerB = ownerOf(slotB, order, overrides);
  const next = { ...overrides, [slotA]: ownerB, [slotB]: ownerA };
  [slotA, slotB].forEach(slot => {
    if(next[slot] === naturalOwner(slot, order)) delete next[slot];
  });
  return next;
}

// ---- Clock ----
// A soft clock: it never auto-picks, it just counts. `clock` is
// { running, startedAt (ms epoch of the current running stretch),
//   banked (ms accumulated before it) } so pausing and resuming keeps
// the elapsed time, and it is computed from timestamps rather than
// ticked, so a server that hibernates loses nothing.

export function newClock(now){
  return { running: true, startedAt: now, banked: 0 };
}

export function stoppedClock(){
  return { running: false, startedAt: 0, banked: 0 };
}

export function clockElapsedMs(clock, now){
  return clock.banked + (clock.running ? Math.max(0, now - clock.startedAt) : 0);
}

export function pauseClock(clock, now){
  if(!clock.running) return clock;
  return { running: false, startedAt: 0, banked: clockElapsedMs(clock, now) };
}

export function resumeClock(clock, now){
  if(clock.running) return clock;
  return { running: true, startedAt: now, banked: clock.banked };
}

// ---- Write-ins ----

export function slugify(name){
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Initials of a multi-word name (max 4), or the first 4 letters of a
// single word — matches the design's write-in tile.
export function writeInAbbr(name){
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1
    ? words.map(w => w[0]).join('').slice(0, 4)
    : (words[0] || '').slice(0, 4);
  return raw.toUpperCase();
}
