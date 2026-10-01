/* ============================================================
   A group's sports, set on the Commissioner page (js/admin.js): for
   each sport, off, scores only, or drafted with so many picks each.

     { <league>: 0 | n }    absent = off, 0 = scores only (its teams show
                            as favorites anyone can follow, nobody drafts
                            or scores them), n = drafted, n picks each

   Drafted also means shown. The drafted sports are the group's caps
   (groupCaps in js/groups.js) for its next draft room, in SPORT_KEYS
   order, which is the draft room's display order; scores-only sports are
   its `shown` list. A group that has drafted keeps showing every sport
   of its current class, whatever this says, since those still score
   (js/seasons/index.js).

   KV: sports@<group> -> { sports, at } (worker/sports.js). No record
   means js/groups.js's own `caps` (or none, for The Draft's defaults).

   Pure, no DOM or Worker APIs: the worker, the browser and Node tests
   share it.
   ============================================================ */

// Every sport a group can pick, in draft room order.
export const SPORT_KEYS = ['epl', 'nfl', 'nba', 'nhl', 'mlb', 'wnba', 'cfb', 'mcbb', 'pga'];

export const SPORT_LABELS = {
  epl: 'Premier League',
  nfl: 'NFL',
  nba: 'NBA',
  nhl: 'NHL',
  mlb: 'MLB',
  wnba: 'WNBA',
  cfb: 'College Football',
  mcbb: 'College Basketball',
  pga: 'PGA Tour'
};

export const MAX_SPORT_PICKS = 5;

// The draft room's own ceiling on rounds (MAX_ROUNDS in
// js/draft-engine.js): every drafted sport's picks, added up.
export const MAX_SPORT_ROUNDS = 40;

// A request body's `sports`, cleaned, or null when it isn't one: known
// sports only, whole numbers 0..MAX_SPORT_PICKS, at least one drafted
// and no more than MAX_SPORT_ROUNDS picks each in all.
export function parseSports(input){
  if(!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const sports = {};
  for(const [key, n] of Object.entries(input)){
    if(!SPORT_KEYS.includes(key) || !Number.isInteger(n) || n < 0 || n > MAX_SPORT_PICKS) return null;
    sports[key] = n;
  }
  const caps = sportsCaps(sports);
  return caps && sportsRounds(sports) <= MAX_SPORT_ROUNDS ? sports : null;
}

// Picks each drafter makes in all: the draft's rounds.
export function sportsRounds(sports){
  return Object.values(sports).reduce((sum, n) => sum + n, 0);
}

// The drafted sports as draft room caps ({ epl: 2, … }), or null when
// none is drafted.
export function sportsCaps(sports){
  const caps = {};
  SPORT_KEYS.forEach(key => { if(sports[key] > 0) caps[key] = sports[key]; });
  return Object.keys(caps).length ? caps : null;
}

// The scores-only sports, in SPORT_KEYS order.
export function sportsShown(sports){
  return SPORT_KEYS.filter(key => sports[key] === 0);
}

// The same shape from a group's caps and shown list, as js/groups.js
// (or the Commissioner page's last save) has them.
export function sportsOf(caps, shown = []){
  const sports = { ...caps };
  shown.forEach(key => { if(!(key in sports)) sports[key] = 0; });
  return sports;
}
