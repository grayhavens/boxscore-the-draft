/* ============================================================
   Short league labels for chip rows: the Home tab's league jump-to
   chips, the Standings tab's league filter, the admin page's
   (js/admin.js) and the scoring sheet's league tabs (js/scoring-sheet.js,
   which the landing page opens too, hence its own module). Every other
   use of a league's label (section headers, modal titles) keeps
   LEAGUES[].label.
   ============================================================ */
export const FILTER_CHIP_LABELS = {
  cfb: 'CFB',
  mcbb: 'CBB',
  pga: 'PGA'
};

// Spelled out in both the Teams tab's section headers and the
// Standings header — the filter chips still keep the short
// LEAGUES[].label as-is (FILTER_CHIP_LABELS above). Also used by
// the Scoring modal header, the admin page (js/admin.js) and the wide
// team page's standing line, so every "EPL"/"College FB"/"College BB"
// reads as its full name wherever a header titles itself after the league.
export const LEAGUE_FULL_LABELS = {
  epl: 'English Premier League',
  cfb: 'College Football',
  mcbb: 'College Basketball'
};
