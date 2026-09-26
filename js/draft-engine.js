/* ============================================================
   Draft engine: the draft room's whole state machine as one pure
   reducer. worker/draft-room.js keeps the authoritative copy and runs
   every client action through `reduce`; the draft UI can run the same
   function to predict/validate before sending. No I/O, no clocks of its
   own (time comes in through ctx.now), no randomness of its own (the
   lottery takes ctx.rand) — so the whole draft is testable in Node
   (tests/draft-engine.test.mjs). Rules it leans on live in
   js/draft-rules.js; see docs/draft-room-plan.md.

   reduce(state, action, ctx) -> { state } | { error, detail? }
     action  { type, ...fields }
     ctx     { now (ms), actor (drafter id or null), isCommissioner,
               rand (() => [0,1), lottery only) }
   The input state is never mutated; a rejected action returns no state
   at all, so a caller can't accidentally keep a half-applied one.

   state {
     v, seq            schema version; bumps on every accepted action
     phase             'lobby' | 'draft' | 'done'
     config            { drafters: [id], caps: {league: n}, clockSeconds,
                         bots: [id], botSeconds } — bots/botSeconds only
                       matter in mock rooms, where the worker auto-picks
                       (bots after botSeconds, anyone after clockSeconds)
     order             lottery result (drafter ids by round-1 position)
                       or null until the lottery has run
     picks             { [slot]: { team, by, at, n, proxy?, auto?, edited? } }
                       `by` is the roster the team lands on (the slot's
                       owner); `proxy` marks a commissioner picking for them,
                       `auto` the mock room's bot/timeout auto-pick
     overrides         { [slot]: drafterId } — traded slots
     pool              [{ id, name, league, abbr, color, custom?, ... }]
                       in rank order; write-ins are appended with custom:true
     clock             see draft-rules.js
     pickSeq           monotonic pick counter, so "undo" means "most recent"
   }

   Error codes: forbidden, bad_phase, bad_input, no_order, not_live,
   paused, stale, not_your_turn, unknown_team, taken, league_full,
   pool_short, unchanged, nothing_to_undo, empty_slot, bad_slot, exists.
   ============================================================ */
import {
  DEFAULT_CAPS, DEFAULT_CLOCK_SECONDS, MIN_CLOCK_SECONDS, MAX_CLOCK_SECONDS, WRITE_IN_LEAGUES,
  DEFAULT_BOT_SECONDS, MIN_BOT_SECONDS, MAX_BOT_SECONDS,
  totalPicks, totalRounds, ownerOf, currentSlot, teamById, takenTeamIds, leagueCounts,
  shuffled, swapSlots, newClock, stoppedClock, pauseClock, resumeClock, slugify, writeInAbbr
} from './draft-rules.js';

export const STATE_VERSION = 1;

const MAX_DRAFTERS = 20;
const MAX_ROUNDS = 40;
const MAX_POOL = 1000;
const MAX_WRITE_INS = 300;
const WRITE_IN_COLOR = '#3A3B42';

export function createState(drafters, overrides = {}){
  return {
    v: STATE_VERSION,
    seq: 0,
    phase: 'lobby',
    config: {
      drafters: drafters.slice(),
      caps: { ...DEFAULT_CAPS },
      clockSeconds: DEFAULT_CLOCK_SECONDS,
      bots: [],
      botSeconds: DEFAULT_BOT_SECONDS,
      ...overrides
    },
    order: null,
    picks: {},
    overrides: {},
    pool: [],
    clock: stoppedClock(),
    pickSeq: 0
  };
}

// What every connected client gets on each change. The pool is big and
// only changes in the lobby or on a write-in, so it travels separately.
export function publicState(state){
  const { pool, ...rest } = state;
  return { ...rest, poolSize: pool.length };
}

const COMMISSIONER_ONLY = new Set([
  'setConfig', 'setPool', 'runLottery', 'startDraft',
  'undo', 'removePick', 'editPick', 'trade', 'pause', 'resume', 'reset'
]);

function fail(error, detail){
  return detail === undefined ? { error } : { error, detail };
}

function done(state){
  state.seq += 1;
  return { state };
}

// After a pick lands (only possible while the clock is running): the
// next slot is on the clock, so the clock restarts — and the draft is
// over exactly when no slot is left empty.
function settle(state, ctx){
  if(currentSlot(state.picks, totalPicks(state.config)) === null){
    state.phase = 'done';
    state.clock = stoppedClock();
  } else {
    state.clock = newClock(ctx.now);
  }
}

function isInt(n, min, max){
  return Number.isInteger(n) && n >= min && n <= max;
}

function validId(s, max){
  return typeof s === 'string' && s.length >= 1 && s.length <= max;
}

export function reduce(prev, action, ctx){
  if(!action || typeof action.type !== 'string') return fail('bad_input');
  if(COMMISSIONER_ONLY.has(action.type) && !ctx.isCommissioner) return fail('forbidden');
  const isDrafter = prev.config.drafters.includes(ctx.actor);
  if(!ctx.isCommissioner && !isDrafter) return fail('forbidden');

  const state = structuredClone(prev);

  switch(action.type){
    case 'setConfig': return setConfig(state, action);
    case 'setPool': return setPool(state, action);
    case 'runLottery': return runLottery(state, ctx);
    case 'startDraft': return startDraft(state, ctx);
    case 'pick': return pick(state, action, ctx);
    case 'undo': return undo(state, ctx);
    case 'removePick': return removePick(state, action, ctx);
    case 'editPick': return editPick(state, action);
    case 'trade': return trade(state, action);
    case 'pause': return pause(state, ctx);
    case 'resume': return resume(state, ctx);
    case 'reset': return reset(state);
    case 'addWriteIn': return addWriteIn(state, action, ctx);
    default: return fail('bad_input');
  }
}

// ---- Lobby ----

function setConfig(state, a){
  const { drafters, caps, clockSeconds, bots, botSeconds } = a;
  if(clockSeconds !== undefined){
    if(!isInt(clockSeconds, MIN_CLOCK_SECONDS, MAX_CLOCK_SECONDS)) return fail('bad_input', 'clockSeconds');
    state.config.clockSeconds = clockSeconds;
  }
  if(botSeconds !== undefined){
    if(!isInt(botSeconds, MIN_BOT_SECONDS, MAX_BOT_SECONDS)) return fail('bad_input', 'botSeconds');
    state.config.botSeconds = botSeconds;
  }
  const structural = drafters !== undefined || caps !== undefined;
  if(structural && state.phase !== 'lobby') return fail('bad_phase');
  if(drafters !== undefined){
    if(!Array.isArray(drafters) || drafters.length < 2 || drafters.length > MAX_DRAFTERS) return fail('bad_input', 'drafters');
    if(!drafters.every(d => validId(d, 40)) || new Set(drafters).size !== drafters.length) return fail('bad_input', 'drafters');
    state.config.drafters = drafters.slice();
  }
  if(caps !== undefined){
    if(!caps || typeof caps !== 'object' || Array.isArray(caps)) return fail('bad_input', 'caps');
    const entries = Object.entries(caps);
    if(!entries.length || !entries.every(([k, v]) => /^[a-z]{2,8}$/.test(k) && isInt(v, 0, 10))) return fail('bad_input', 'caps');
    const rounds = entries.reduce((sum, [, v]) => sum + v, 0);
    if(rounds < 1 || rounds > MAX_ROUNDS) return fail('bad_input', 'caps');
    state.config.caps = { ...caps };
  }
  // Checked after drafters so a roster change and its bots can land
  // together. Not structural: seats can turn into bots mid-draft.
  if(bots !== undefined){
    if(!Array.isArray(bots) || new Set(bots).size !== bots.length || !bots.every(b => state.config.drafters.includes(b))) return fail('bad_input', 'bots');
    state.config.bots = bots.slice();
  }
  // States saved before bots existed have no bots field.
  state.config.bots = (state.config.bots || []).filter(b => state.config.drafters.includes(b));
  if(structural){
    // The lottery order and any pool built against the old shape no
    // longer line up; make the commissioner redo them.
    state.order = null;
    state.overrides = {};
    state.pool = state.pool.filter(t => t.league in state.config.caps);
  }
  return done(state);
}

function cleanTeam(t, caps){
  if(!t || typeof t !== 'object') return null;
  if(typeof t.id !== 'string' || !/^[a-z0-9_]{1,60}$/.test(t.id)) return null;
  if(typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60) return null;
  if(typeof t.league !== 'string' || !(t.league in caps)) return null;
  const color = typeof t.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(t.color)
    ? '#' + t.color.replace('#', '').toUpperCase()
    : WRITE_IN_COLOR;
  const abbr = typeof t.abbr === 'string' && t.abbr.trim() ? t.abbr.trim().slice(0, 6).toUpperCase() : writeInAbbr(t.name);
  const team = { id: t.id, name: t.name.trim(), league: t.league, abbr, color };
  if(Number.isInteger(t.rank) && t.rank >= 1 && t.rank <= 1000) team.rank = t.rank;
  if(typeof t.espnTeamId === 'string' && /^[0-9a-z-]{1,20}$/i.test(t.espnTeamId)) team.espnTeamId = t.espnTeamId;
  if(typeof t.badgeUrl === 'string' && t.badgeUrl.length <= 300 && t.badgeUrl.startsWith('https://')) team.badgeUrl = t.badgeUrl;
  return team;
}

function setPool(state, a){
  if(state.phase !== 'lobby') return fail('bad_phase');
  if(!Array.isArray(a.teams) || a.teams.length > MAX_POOL) return fail('bad_input', 'teams');
  const pool = [];
  const seen = new Set();
  for(const raw of a.teams){
    const team = cleanTeam(raw, state.config.caps);
    if(!team || seen.has(team.id)) return fail('bad_input', raw && raw.id);
    seen.add(team.id);
    pool.push(team);
  }
  state.pool = pool;
  return done(state);
}

function runLottery(state, ctx){
  if(state.phase !== 'lobby') return fail('bad_phase');
  state.order = shuffled(state.config.drafters, ctx.rand || Math.random);
  state.overrides = {};
  return done(state);
}

function startDraft(state, ctx){
  if(state.phase !== 'lobby') return fail('bad_phase');
  if(!state.order) return fail('no_order');
  // Every league must have enough teams for everyone's cap, or somebody
  // ends up unable to fill their roster mid-draft.
  for(const league of Object.keys(state.config.caps)){
    const need = state.config.caps[league] * state.config.drafters.length;
    const have = state.pool.filter(t => t.league === league).length;
    if(have < need) return fail('pool_short', { league, need, have });
  }
  state.phase = 'draft';
  state.pickSeq = 0;
  state.clock = newClock(ctx.now);
  return done(state);
}

function reset(state){
  state.phase = 'lobby';
  state.order = null;
  state.picks = {};
  state.overrides = {};
  state.pickSeq = 0;
  state.clock = stoppedClock();
  state.pool = state.pool.filter(t => !t.custom);
  return done(state);
}

// ---- Picking ----

// Would `owner` be allowed to take `team` at `slot`, ignoring who is
// asking? exceptSlot excludes the pick being replaced during an edit.
function checkFit(state, owner, team, exceptSlot){
  const takenElsewhere = Object.keys(state.picks).some(k => Number(k) !== exceptSlot && state.picks[k].team === team.id);
  if(takenElsewhere) return fail('taken');
  const counts = leagueCounts(state.picks, state.pool, state.order, state.overrides, owner, exceptSlot);
  if((counts[team.league] || 0) >= (state.config.caps[team.league] || 0)) return fail('league_full', team.league);
  return null;
}

function pick(state, a, ctx){
  if(state.phase !== 'draft') return fail('not_live');
  if(!state.clock.running) return fail('paused');
  const slot = currentSlot(state.picks, totalPicks(state.config));
  if(a.slot !== undefined && a.slot !== slot) return fail('stale');
  const owner = ownerOf(slot, state.order, state.overrides);
  if(!ctx.isCommissioner && ctx.actor !== owner) return fail('not_your_turn');
  const team = typeof a.team === 'string' ? teamById(state.pool, a.team) : null;
  if(!team) return fail('unknown_team');
  const problem = checkFit(state, owner, team, -1);
  if(problem) return problem;

  state.pickSeq += 1;
  const record = { team: team.id, by: owner, at: ctx.now, n: state.pickSeq };
  // `auto` is the worker's own mock-room auto-pick (it acts as
  // commissioner); anything else made for someone else is a proxy.
  if(a.auto === true && ctx.isCommissioner) record.auto = true;
  else if(ctx.actor !== owner) record.proxy = true;
  state.picks[slot] = record;
  settle(state, ctx);
  return done(state);
}

function undo(state, ctx){
  let latest = null;
  Object.keys(state.picks).forEach(k => {
    if(latest === null || state.picks[k].n > state.picks[latest].n) latest = k;
  });
  if(latest === null) return fail('nothing_to_undo');
  delete state.picks[latest];
  restart(state, ctx);
  return done(state);
}

function removePick(state, a, ctx){
  if(!isInt(a.slot, 0, totalPicks(state.config) - 1)) return fail('bad_slot');
  if(!state.picks[a.slot]) return fail('empty_slot');
  delete state.picks[a.slot];
  restart(state, ctx);
  return done(state);
}

// A pick was taken away: whatever was on the clock, the (possibly
// earlier) hole is now, so the draft is live again with a fresh clock —
// unless the commissioner had it paused, which stays paused.
function restart(state, ctx){
  const wasPaused = state.phase === 'draft' && !state.clock.running;
  state.phase = 'draft';
  state.clock = wasPaused ? { running: false, startedAt: 0, banked: 0 } : newClock(ctx.now);
}

function editPick(state, a){
  if(!state.picks[a.slot]) return fail('empty_slot');
  const team = typeof a.team === 'string' ? teamById(state.pool, a.team) : null;
  if(!team) return fail('unknown_team');
  if(state.picks[a.slot].team === team.id) return fail('unchanged');
  const owner = ownerOf(a.slot, state.order, state.overrides);
  const problem = checkFit(state, owner, team, a.slot);
  if(problem) return problem;
  state.picks[a.slot].team = team.id;
  state.picks[a.slot].edited = true;
  return done(state);
}

function trade(state, a){
  if(!state.order) return fail('no_order');
  const total = totalPicks(state.config);
  if(!isInt(a.a, 0, total - 1) || !isInt(a.b, 0, total - 1) || a.a === a.b) return fail('bad_slot');
  if(state.picks[a.a] || state.picks[a.b]) return fail('bad_slot', 'already picked');
  state.overrides = swapSlots(state.order, state.overrides, a.a, a.b);
  return done(state);
}

// ---- Clock control ----

function pause(state, ctx){
  if(state.phase !== 'draft') return fail('bad_phase');
  if(!state.clock.running) return fail('unchanged');
  state.clock = pauseClock(state.clock, ctx.now);
  return done(state);
}

function resume(state, ctx){
  if(state.phase !== 'draft') return fail('bad_phase');
  if(state.clock.running) return fail('unchanged');
  state.clock = resumeClock(state.clock, ctx.now);
  return done(state);
}

// ---- Write-ins ----

function addWriteIn(state, a, ctx){
  if(state.phase !== 'draft') return fail('bad_phase');
  if(!WRITE_IN_LEAGUES.includes(a.league) || !(a.league in state.config.caps)) return fail('bad_input', 'league');
  const name = typeof a.name === 'string' ? a.name.replace(/\s+/g, ' ').trim() : '';
  if(name.length < 3 || name.length > 40 || /[\u0000-\u001f<>]/.test(name)) return fail('bad_input', 'name');
  const slug = slugify(name);
  if(!slug) return fail('bad_input', 'name');
  const id = `${a.league}_wi_${slug.replace(/-/g, '_')}`.slice(0, 60);
  const lower = name.toLowerCase();
  const twin = state.pool.find(t => t.league === a.league && (t.id === id || t.name.toLowerCase() === lower));
  if(twin) return fail('exists', twin.id);
  if(state.pool.filter(t => t.custom).length >= MAX_WRITE_INS) return fail('bad_input', 'too many write-ins');
  state.pool.push({ id, name, league: a.league, abbr: writeInAbbr(name), color: WRITE_IN_COLOR, custom: true, addedBy: ctx.actor || 'commissioner' });
  return done(state);
}

// Convenience for callers that want it: who is on the clock right now.
export function onTheClock(state){
  if(state.phase !== 'draft' || !state.order) return null;
  const slot = currentSlot(state.picks, totalPicks(state.config));
  if(slot === null) return null;
  return { slot, owner: ownerOf(slot, state.order, state.overrides) };
}

export { totalRounds, takenTeamIds };
