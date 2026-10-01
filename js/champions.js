/* ============================================================
   League history: each finished season's final standings, and the
   all-time table built from them. Pure, and shared by the browser
   (js/history.js), the worker (worker/champions.js) and Node tests
   (tests/champions.test.mjs).

   A season is recorded by the commissioner (Commissioner -> History),
   one of two ways:
   - source 'app': the class the app just played, its final Points
     standings exactly as the app ranks them (every drafter, with points);
   - source 'manual': a season from before the app, typed in: a year and
     who finished 1st, 2nd and 3rd, with points if they're known.

   A season: { id, label, source, at, standings: [{ id, name, pts }] }
   in finishing order. `id` is the drafter's id when they're in the group
   (so the all-time table follows them through a name change), '' for
   someone who isn't; `name` is how they were known that season. `pts` is
   an integer or null (a manual season can leave it out).
   ============================================================ */

export const MAX_SEASONS = 40;
export const MAX_STANDINGS = 20;
const NAME_MAX = 40;

const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// A season id: the draft class id ('2026') or the year a manual one was
// typed in. Sorts newest first as a number.
export function seasonIdOk(id){
  return typeof id === 'string' && /^\d{4}$/.test(id);
}

// A season from a request, cleaned, or null. `drafterIds` are the
// group's ids: anyone else keeps their name but no id.
export function parseSeason(input, drafterIds){
  if(!input || typeof input !== 'object') return null;
  const id = String(input.id || '');
  if(!seasonIdOk(id)) return null;
  const source = input.source === 'app' ? 'app' : 'manual';
  const label = cleanText(input.label, NAME_MAX) || `${id} Draft`;
  if(!Array.isArray(input.standings)) return null;
  const seen = new Set();
  const standings = [];
  for(const s of input.standings.slice(0, MAX_STANDINGS)){
    if(!s || typeof s !== 'object') return null;
    const name = cleanText(s.name, NAME_MAX);
    if(!name) return null;
    const did = drafterIds.includes(s.id) ? s.id : '';
    const key = did || name.toLowerCase();
    if(seen.has(key)) return null;
    seen.add(key);
    const pts = Number.isInteger(s.pts) && Math.abs(s.pts) < 10000 ? s.pts : null;
    if(source === 'app' && pts === null) return null;
    standings.push({ id: did, name, pts });
  }
  if(!standings.length) return null;
  // Finishing order has to agree with the points given.
  for(let i = 1; i < standings.length; i++){
    const a = standings[i - 1].pts, b = standings[i].pts;
    if(a !== null && b !== null && b > a) return null;
  }
  return { id, label, source, at: Number.isFinite(input.at) ? input.at : 0, standings };
}

// Places, with ties: equal points share a place ("T2"). Without points,
// the order given is the order finished.
export function rankStandings(standings){
  let rank = 0;
  return standings.map((s, i) => {
    const prev = standings[i - 1];
    if(!prev || s.pts === null || prev.pts === null || s.pts !== prev.pts) rank = i + 1;
    return { ...s, rank };
  });
}

export function placeLabel(entry, standings){
  const tied = standings.filter(s => s.rank === entry.rank).length > 1;
  return `${tied ? 'T' : ''}${entry.rank}`;
}

// Newest first, then the stored list updated with `season` (replacing the
// one with its id).
export function upsertSeason(seasons, season){
  return [season, ...(seasons || []).filter(s => s.id !== season.id)]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, MAX_SEASONS);
}

export function championsOf(season){
  return rankStandings(season.standings).filter(s => s.rank === 1);
}

// "Josh", "Josh and Sam", "Josh, Sam and Alex".
export function namesText(names){
  if(names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// One row per person who has ever finished a season, keyed by drafter id
// (or name, for someone no longer in the group). `current` maps a
// drafter id to today's name. Titles first, then podiums, then the best
// average finish.
export function allTimeTable(seasons, current = {}){
  const rows = new Map();
  seasons.forEach(season => {
    rankStandings(season.standings).forEach(s => {
      const key = s.id || `~${s.name.toLowerCase()}`;
      const row = rows.get(key) || { key, id: s.id, name: (s.id && current[s.id]) || s.name, titles: 0, podiums: 0, seasons: 0, places: [], titleYears: [] };
      row.seasons += 1;
      row.places.push(s.rank);
      if(s.rank === 1){ row.titles += 1; row.titleYears.push(season.id); }
      if(s.rank <= 3) row.podiums += 1;
      rows.set(key, row);
    });
  });
  return [...rows.values()].map(r => ({ ...r, best: Math.min(...r.places), avg: r.places.reduce((a, b) => a + b, 0) / r.places.length }))
    .sort((a, b) => b.titles - a.titles || b.podiums - a.podiums || a.avg - b.avg || a.name.localeCompare(b.name));
}
