/* ============================================================
   EPL cup finals and European spots: pure, no DOM and no fetches, shared by
   js/epl-cups.js and tests/epl-cups-math.test.mjs. Checked against the
   2025-26 season (tests/fixtures/espn-epl-cups-2025.json).

   - "Win League Cup" / "Win FA Cup": the winner of the competition's final
     (an event whose season slug is 'final'; the winner flag is set on the
     side that went through, penalties included). ESPN's calendar lists the
     final's day as text ("Mar 22") inside a window that ENDS after the
     game, so the day is read off that text with the window's end year.
   - "Make Champions League (any stage)" / "Make Europa League": the club is
     in the competition's league-phase table (all 36 clubs, each with a
     note like "Eliminated"). ESPN has no qualifying rounds at all, so
     "make" here means the main stage; a club that only played qualifiers
     isn't seen. A club dropped from the Champions League into the Europa
     League's knockout playoff isn't in that table either.
   Points come from the group's own LEAGUE_SCORING rules matched by label.
   ============================================================ */

export const EPL_CUP_RULES = [
  { re: /^win league cup$/i, kind: 'cup', slug: 'eng.league_cup' },
  { re: /^win fa cup$/i, kind: 'cup', slug: 'eng.fa' },
  { re: /^make champions league/i, kind: 'table', slug: 'uefa.champions' },
  { re: /^make europa league/i, kind: 'table', slug: 'uefa.europa' }
];

export function eplCupRule(label){
  return EPL_CUP_RULES.find(r => r.re.test(label)) || null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// The scoreboard's calendar → the days (YYYYMMDD) the final can be on: the
// "Final" entry's text day, and the day after (a late kickoff is the next UTC
// day). [] when the calendar has no readable final.
export function finalDays(calendar){
  const entry = (calendar || []).find(c => /^final$/i.test(c.label || ''));
  const m = entry && /^([A-Za-z]{3})[a-z]* (\d{1,2})/.exec(entry.detail || '');
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  const end = entry && entry.endDate ? new Date(entry.endDate) : null;
  if(month < 0 || !end || isNaN(end)) return [];
  const day = new Date(Date.UTC(end.getUTCFullYear(), month, Number(m[2])));
  return [0, 1].map(i => new Date(day.getTime() + i * 864e5).toISOString().slice(0, 10).replace(/-/g, ''));
}

// A day's scoreboard events → the finished final's winner (ESPN display
// name), or null while there is no final or it isn't over.
export function cupWinner(events){
  const final = (events || []).find(e => e.season && e.season.slug === 'final');
  const comp = final && final.competitions && final.competitions[0];
  if(!comp) return null;
  const done = final.status && final.status.type && (final.status.type.completed || final.status.type.state === 'post');
  const won = (comp.competitors || []).find(c => c.winner);
  return done && won ? (won.team && won.team.displayName) || null : null;
}

// A UEFA league-phase standings payload → the clubs in it (ESPN display names).
export function leaguePhaseClubs(data){
  const entries = (data && data.children && data.children[0] && data.children[0].standings && data.children[0].standings.entries) || [];
  return entries.map(e => e.team && e.team.displayName).filter(Boolean);
}
