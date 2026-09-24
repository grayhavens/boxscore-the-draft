/* ============================================================
   Builds the draft room's team pool: every team a drafter can take,
   ranked, in the shape the DraftRoom server validates (see cleanTeam in
   js/draft-engine.js).

   Sources, in order of trust:
   1. The active season's TEAM_META — real names, badges and the ids
      live data hangs off (espnTeamId). Owners are stripped and each team
      appears once per league.
   2. js/draft-ranks.js — the consensus ordering (and a few teams
      TEAM_META has never held, which get a plain color tile until
      their ids are resolved; see docs/draft-room-plan.md).
   Teams in TEAM_META but not in the ranking (e.g. the 30 CFB/CBB teams
   people actually drafted last year) go after the ranked ones.

   The pool's ids are `<league>_<slug>` and are what a finished draft
   is exported against: the export matches a pick back to its TEAM_META
   entry by league + name, so keep `name` exactly as TEAM_META has it.
   ============================================================ */
import { TEAM_META } from './data.js';
import { DRAFT_RANKS } from './draft-ranks.js';
import { DEFAULT_CAPS, slugify } from './draft-rules.js';

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Short names the ranking uses where TEAM_META has the full one.
const NAME_ALIASES = {
  epl: { mancity: 'manchestercity', manunited: 'manchesterunited', tottenham: 'tottenhamhotspur', nottinghamforest: 'nottingham', bournemouth: 'afcbournemouth' },
  mcbb: { michiganstate: 'michstate' }
};

function poolId(league, name){
  return `${league}_${slugify(name).replace(/-/g, '_')}`.slice(0, 60);
}

function parseRanks(str){
  return str.split(';').filter(Boolean).map(row => {
    const [abbr, name, hex] = row.split(',');
    return { abbr, name, color: '#' + hex };
  });
}

// One entry per team, from the first TEAM_META record found for it.
function metaByLeague(){
  const out = {};
  Object.values(TEAM_META).forEach(m => {
    if(m.favoriteOnly) return;
    const byName = out[m.leagueKey] || (out[m.leagueKey] = new Map());
    if(!byName.has(norm(m.name))) byName.set(norm(m.name), m);
  });
  return out;
}

export function buildDraftPool(leagueKeys = Object.keys(DEFAULT_CAPS)){
  const metas = metaByLeague();
  const pool = [];
  leagueKeys.forEach(league => {
    const byName = metas[league] || new Map();
    const used = new Set();
    let rank = 0;
    parseRanks(DRAFT_RANKS[league] || '').forEach(entry => {
      rank += 1;
      const key = (NAME_ALIASES[league] || {})[norm(entry.name)] || norm(entry.name);
      const meta = byName.get(key);
      if(meta) used.add(key);
      const name = meta ? meta.name : entry.name;
      const team = { id: poolId(league, name), name, league, rank, abbr: meta ? meta.badgeText : entry.abbr, color: meta ? meta.accent : entry.color };
      if(meta && meta.espnTeamId) team.espnTeamId = String(meta.espnTeamId);
      if(meta && meta.badgeUrl && meta.badgeUrl.startsWith('https://')) team.badgeUrl = meta.badgeUrl;
      pool.push(team);
    });
    byName.forEach((meta, key) => {
      if(used.has(key)) return;
      const team = { id: poolId(league, meta.name), name: meta.name, league, abbr: meta.badgeText, color: meta.accent };
      if(meta.espnTeamId) team.espnTeamId = String(meta.espnTeamId);
      if(meta.badgeUrl && meta.badgeUrl.startsWith('https://')) team.badgeUrl = meta.badgeUrl;
      pool.push(team);
    });
  });
  return pool;
}
