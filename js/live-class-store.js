/* ============================================================
   The draft classes this device built from its group's finished draft
   boards (js/live-class.js), kept in localStorage so they're there
   synchronously at boot: js/seasons/index.js reads them while working
   out SEASONS, before any network call. A leaf module (no imports)
   because index.js is imported by nearly everything, and live-class.js
   imports index.js.

   Stored: { v, group, classes: { <year>: record } }
     group   the group they were built for. localStorage is per origin
             and each group has its own subdomain, but localhost and
             Pages previews switch groups with ?group= on one origin.
   Record: { year, seq, finishedAt, meta, leagues, priorSeasonLeagues, builtAt }
     seq     the draft room's seq when it was built; a later edit to the
             finished board bumps it and the class is rebuilt
     meta / leagues / priorSeasonLeagues   js/draft-class.js's buildSeason
   One per year, so next year's draft adds a class instead of replacing
   this one.
   ============================================================ */
const KEY = 'liveDraftClasses';
// Bump when the shape or how a class is built changes: older records
// are ignored and rebuilt.
export const LIVE_CLASS_VERSION = 1;

function readAll(group){
  try {
    const all = JSON.parse(localStorage.getItem(KEY));
    if(!all || all.v !== LIVE_CLASS_VERSION || all.group !== group || !all.classes) return {};
    return all.classes;
  } catch (e){
    return {};
  }
}

const valid = rec => !!rec && !!rec.meta && Array.isArray(rec.leagues) && /^\d{4}$/.test(String(rec.year));

// This group's classes, oldest first.
export function readLiveClasses(group){
  return Object.values(readAll(group)).filter(valid).sort((a, b) => a.year - b.year);
}

export function saveLiveClass(group, rec){
  try {
    const classes = { ...readAll(group), [rec.year]: rec };
    localStorage.setItem(KEY, JSON.stringify({ v: LIVE_CLASS_VERSION, group, classes }));
    return true;
  } catch (e){
    return false;
  }
}
