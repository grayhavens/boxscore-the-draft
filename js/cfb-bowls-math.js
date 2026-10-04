/* ============================================================
   College football bowls and conference titles: pure, no DOM and no
   fetches, shared by js/cfb-bowls.js and tests/cfb-bowls-math.test.mjs.

   ESPN's scoreboard (groups=80, one request per day) carries all three in
   one feed, told apart by season slug and note headline (checked against
   the 2025-26 season, tests/fixtures/espn-cfb-bowls-2025.json):
   - bowl: slug 'post-season', headline holds "Bowl" and not "College
     Football Playoff" ("TaxSlayer Gator Bowl"). The CFP's quarterfinals are
     played at bowls and say so in their headline, so the CFP is tested first
     and its games never count as a bowl here; the CFP rules are the
     postseason ladder's (js/postseason-math.js).
   - conference title: slug 'regular-season' (ESPN counts them as regular
     season), headline "<Conference> Championship" and nothing after it. The
     FCS playoff leaks into the FBS feed as "FCS Championship - Second
     Round", which that pattern leaves out.
   Points come from the group's own LEAGUE_SCORING rules matched by label.
   "Don't make a bowl" is NOT here: a 5-7 team can play in a bowl and a 6-6
   team can be left out, and nothing in the feed says which teams are FBS,
   so it stays a commissioner mark.
   ============================================================ */

export const CFB_RULES = [
  { re: /^win a bowl/i, kind: 'bowlWin' },
  { re: /^make a bowl/i, kind: 'bowl' },
  { re: /^win conference$/i, kind: 'title' }
];

// Every day the games can be on: the conference title weekend (first
// Saturday of December) through the last bowl (early January), as YYYYMMDD
// up to `today`. `year` is the season's own year (the class's "'26 Season").
export function bowlDates(year, today = new Date()){
  const out = [];
  for(let d = new Date(Date.UTC(year, 11, 1)); d <= new Date(Date.UTC(year + 1, 0, 3)) && d <= today; d = new Date(d.getTime() + 864e5)){
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return out;
}

// One raw ESPN event → a bowl or conference title game, or null for anything else.
export function parseBowlEvent(event){
  const comp = event && event.competitions && event.competitions[0];
  if(!comp || !event.season) return null;
  const headline = ((comp.notes || []).find(n => n.headline) || {}).headline || '';
  let kind = null;
  if(event.season.slug === 'post-season') kind = /college football playoff/i.test(headline) ? null : /\bbowl\b/i.test(headline) ? 'bowl' : null;
  else if(event.season.slug === 'regular-season' && /^[A-Za-z0-9&.' -]+ Championship$/.test(headline) && !/\bFCS\b/i.test(headline)) kind = 'title';
  if(!kind) return null;
  const type = (event.status && event.status.type) || {};
  return {
    id: String(event.id), kind, headline,
    final: !!(type.completed || type.state === 'post'),
    sides: (comp.competitors || []).map(c => ({
      id: String((c.team && c.team.id) || c.id), location: (c.team && c.team.location) || '', winner: !!c.winner
    }))
  };
}

// Parsed games → { [espnTeamId]: { location, bowl, bowlWin, title } }.
export function bowlReach(games){
  const teams = {};
  (games || []).forEach(g => g.sides.forEach(s => {
    if(!s.id) return;
    const t = teams[s.id] || (teams[s.id] = { location: s.location, bowl: false, bowlWin: false, title: false });
    if(g.kind === 'bowl'){ t.bowl = true; if(g.final && s.winner) t.bowlWin = true; }
    if(g.kind === 'title' && g.final && s.winner) t.title = true;
  }));
  return teams;
}

// The ESPN team ids that have earned one rule label, or null when the rule
// isn't one this reads.
export function bowlTeamsEarning(label, reach){
  const m = CFB_RULES.find(r => r.re.test(label));
  if(!m) return null;
  const field = { bowlWin: 'bowlWin', bowl: 'bowl', title: 'title' }[m.kind];
  return Object.entries(reach).filter(([, t]) => t[field]).map(([id]) => id);
}
