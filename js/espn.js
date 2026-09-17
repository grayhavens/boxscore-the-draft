/* ============================================================
   ESPN HIDDEN API (see docs/espn-migration-plan.md for the full
   evaluation this started from). Backs CFB's AP Top 25, all of NFL's
   standings/rankings, and EPL's league table — see js/standings-cfb.js,
   js/standings-nfl.js and js/standings-epl.js for how each is wired in.

   ESPN's undocumented site API (site.web.api.espn.com — confirmed
   byte-identical to the older site.api.espn.com for shared paths, so
   this uses the .web. host going forward) serves real standings/
   rankings data with open CORS and no API key, unlike the two
   sources this app used to stitch together for this:
     - TheSportsDB has NO standings endpoint at all for NFL or CFB
       (lookuptable.php confirmed empty, every season tested).
     - TheRundown filled that gap before this migration but is paid/
       metered — a shared 20,000 data-points/day budget across all 8
       leagues that ran out entirely on 2026-09-11 (confirmed via the
       worker: 429 "Daily data point limit reached", used: 20018),
       taking down CFB ranks and NFL standings for everyone until the
       quota reset. TheRundown is still used for live in-game state
       and for leagues not yet migrated (see docs/espn-migration-plan.md).

   No worker proxy needed for anything below — every endpoint here
   returned `access-control-allow-origin: *` when queried with this
   app's real Origin header, so (unlike TheSportsDB V2 and TheRundown)
   these are fetched straight from the browser. The one ESPN endpoint
   that does need a server-side call is the bulk /teams?limit=1000
   list used for one-time ID-mapping lookups — it has no CORS headers
   at all, but that's an offline `curl` task, never something this
   client code calls at runtime.
   ============================================================ */

export const ESPN_SITE_BASE = 'https://site.web.api.espn.com';
// The hypermedia "core" API — a completely different, much more
// granular API than the "site" one above. Used only for NFL division
// standings (fetchEspnNflDivisionStandings below), which the site API
// doesn't have at all.
const ESPN_CORE_BASE = 'https://sports.core.api.espn.com';

async function fetchEspnJSON(path){
  try {
    const res = await fetch(`${ESPN_SITE_BASE}${path}`);
    if(!res.ok) return null;
    return await res.json();
  } catch (e){
    return null;
  }
}

async function fetchEspnCoreJSON(url){
  try {
    const res = await fetch(url);
    if(!res.ok) return null;
    return await res.json();
  } catch (e){
    return null;
  }
}

// Both endpoints below carry a team.logos[] array — used for teams
// this app doesn't have its own (SportsDB-sourced) badge for, i.e. a
// ranked/standings team nobody's drafted. Picks the entry tagged
// ["full","default"] (a transparent PNG, same shape as this app's
// existing SportsDB crests — see teamBadgeHtml in js/utils.js), falling
// back to whatever's first if that exact tag is ever missing.
function espnLogoUrl(team){
  if(!team || !Array.isArray(team.logos) || !team.logos.length) return null;
  const preferred = team.logos.find(l => Array.isArray(l.rel) && l.rel.includes('default'));
  return (preferred || team.logos[0]).href || null;
}

// team.displayName is usually "Location Name" (e.g. "Ohio State
// Buckeyes") pre-joined, but it's not reliable — confirmed live,
// ESPN's CFB rankings return `"displayName": null` for Alabama
// specifically (location/name are both fine: "Alabama"/"Crimson
// Tide"), so this rebuilds it from the parts rather than trusting the
// joined field outright.
function espnTeamName(team){
  if(!team) return '';
  return team.displayName || `${team.location || ''} ${team.name || ''}`.trim() || team.location || '';
}

// Shared by every "flat" (conference-grouped, no division nesting)
// standings puller — NFL, NBA, NHL, MLB and WNBA all share this exact
// response shape: one or more `children` groups (conferences/leagues),
// each with a `standings.entries` array of {team, stats[]}. Real
// division-by-division grouping (NFL only, so far — see
// fetchEspnNflDivisionStandings below) needs the much heavier
// hypermedia "core" API instead; this only covers the cheap, flat,
// one-request case every sport's board cards/team modal/"Person" view
// actually need.
// Returns raw rows: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, stats: {name: value} }] — callers pick the
// specific stat names their sport actually displays, since those
// differ (NHL's otLosses/points, MLB's ties/gamesBehind, NBA/WNBA's
// winPercent/playoffSeed, etc — verified live per sport, see
// docs/espn-migration-plan.md).
async function fetchEspnFlatStandings(path){
  const data = await fetchEspnJSON(path);
  if(!data || !Array.isArray(data.children)) return null;

  const rows = [];
  data.children.forEach(conf => {
    const entries = (conf.standings && conf.standings.entries) || [];
    entries.forEach(entry => {
      const stats = {};
      (entry.stats || []).forEach(s => { stats[s.name] = s.value; });
      rows.push({
        id: entry.team.id,
        conference: conf.name,
        conferenceAbbr: conf.abbreviation,
        // ESPN's own display-cased label ("Big Ten", "WCC", "A-10") —
        // distinct from conferenceAbbr above, which is ESPN's internal
        // machine code (lowercase, e.g. "big10", "wcc", "sec"). Every
        // other sport here has so few conferences (2, or MLB's AL/NL)
        // that the raw abbreviation already happens to read fine ("AFC",
        // "East"), so only fetchEspnCbbStandings below actually uses
        // this field — added alongside conferenceAbbr rather than
        // replacing it, to avoid any risk to NFL/NBA/NHL/MLB/WNBA's
        // already-shipped display.
        conferenceShortName: conf.shortName || null,
        teamName: espnTeamName(entry.team),
        // The bare nickname ("Cavaliers"), no city — matches this app's
        // own TEAM_META.name exactly (see findFlatTeamKey in
        // js/standings-flat.js). teamName above is the full "Cleveland
        // Cavaliers" for display; matching against that instead would
        // need substring logic, which had a real false positive here
        // ("Nets" is a literal substring of "Hornets").
        teamNickname: entry.team.name,
        abbreviation: entry.team.abbreviation,
        logoUrl: espnLogoUrl(entry.team),
        stats
      });
    });
  });
  return rows;
}

// CONFERENCE-level standings only (32 teams split AFC/NFC) — verified
// live against actual results (e.g. Seattle showed 1-0/Rams 0-1
// immediately after their Week 1 final, while teams that hadn't
// played yet correctly still showed 0-0), so what it does return is
// fresh and correct, not just structurally plausible.
//
// This does NOT include division grouping — entry.team carries no
// division field on this endpoint; ESPN's site API only nests
// standings one level (by conference). Real division-by-division
// standings are fetchEspnNflDivisionStandings below, a much heavier
// call — this flat version stays cheap (one request) and is what
// backs everything that just needs a team's own record: board cards,
// the team modal, and the "Person" combined-win% view (see
// findEspnNflRow in js/standings-nfl.js).
// Shape returned: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, wins, losses, ties, streak, pointsFor,
// pointsAgainst, winPercent }]
export async function fetchEspnNflStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/football/nfl/standings');
  if(!rows) return null;
  return rows.map(r => ({
    id: r.id, conference: r.conference, conferenceAbbr: r.conferenceAbbr,
    teamName: r.teamName, teamNickname: r.teamNickname, abbreviation: r.abbreviation, logoUrl: r.logoUrl,
    wins: r.stats.wins, losses: r.stats.losses, ties: r.stats.ties,
    streak: r.stats.streak, pointsFor: r.stats.pointsFor, pointsAgainst: r.stats.pointsAgainst,
    winPercent: r.stats.winPercent
  }));
}

// NBA/WNBA conference standings — verified live (2026-09-11). Same
// win%/games-behind display convention as MLB below, but by conference
// (East/West) rather than league (AL/NL), and no ties (basketball has
// none). playoffSeed is carried in `stats` if a future view wants a
// seed number instead of/alongside rank-by-percentage.
// Shape returned: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, wins, losses, streak, winPercent, gamesBehind,
// pointsFor, pointsAgainst }]
function mapNbaLikeRow(r){
  return {
    id: r.id, conference: r.conference, conferenceAbbr: r.conferenceAbbr,
    teamName: r.teamName, teamNickname: r.teamNickname, abbreviation: r.abbreviation, logoUrl: r.logoUrl,
    wins: r.stats.wins, losses: r.stats.losses, streak: r.stats.streak,
    winPercent: r.stats.winPercent, gamesBehind: r.stats.gamesBehind,
    pointsFor: r.stats.pointsFor, pointsAgainst: r.stats.pointsAgainst
  };
}

export async function fetchEspnNbaStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/basketball/nba/standings');
  return rows ? rows.map(mapNbaLikeRow) : null;
}

export async function fetchEspnWnbaStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/basketball/wnba/standings');
  return rows ? rows.map(mapNbaLikeRow) : null;
}

// Men's College Basketball — verified live (2026-09-17): 365 D1 teams
// across 31 conferences, all direct entries (no CFB-style "Sun Belt
// nests a division deeper" gap — every one of this app's 30 drafted
// mcbb teams resolves here). Same flat, conference-grouped shape and
// wins/losses/streak/winPercent stat names as NBA/WNBA, so this reuses
// mapNbaLikeRow as-is rather than a bespoke mapper. Unlike CFB, matching
// a row back to a drafted team doesn't go through `conference`/name at
// all — TEAM_META's mcbb entries carry a static `espnTeamId` (see
// findEspnCbbRow in js/standings-cbb.js) instead, since mcbb's
// TEAM_META.name is the school name, not a nickname, and several of
// this app's 30 drafted teams collide under name/substring matching
// (e.g. "Texas" vs "Texas Tech", "Michigan" vs "Michigan State") the
// same way "Nets"/"Hornets" did for NBA — sidestepped entirely by
// keying on ESPN's own stable numeric team id instead.
// Shape returned: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, wins, losses, streak, winPercent, gamesBehind,
// pointsFor, pointsAgainst }] — conferenceAbbr here is ESPN's display-
// cased shortName ("Big Ten", "WCC", "A-10"), not mapNbaLikeRow's usual
// raw abbreviation field. Every other mapNbaLikeRow caller (NBA/WNBA)
// only ever has 2 conferences whose raw abbreviation ("East"/"West")
// already reads fine as-is; CBB's 31 real conferences don't (ESPN's
// abbreviation for these is a lowercase internal code — "big10", "sec",
// "wcc" — verified live 2026-09-17), so this overrides just that one
// field with fetchEspnFlatStandings' conferenceShortName instead of
// reusing mapNbaLikeRow unchanged the way fetchEspnNbaStandings/
// fetchEspnWnbaStandings do.
export async function fetchEspnCbbStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/basketball/mens-college-basketball/standings');
  return rows ? rows.map(r => Object.assign(mapNbaLikeRow(r), { conferenceAbbr: r.conferenceShortName || r.conferenceAbbr })) : null;
}

// NHL conference standings — verified live (2026-09-11). Hockey's
// standings are ranked by points (2 per win, 1 per OT/shootout loss),
// not win%, and carry an otLosses field with no equivalent in the other
// sports here — regulation losses get zero points, an OT/shootout loss
// still gets one, so `points` (not wins/losses alone) is what actually
// orders the table.
// Shape returned: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, wins, losses, otLosses, points, streak }]
export async function fetchEspnNhlStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/hockey/nhl/standings');
  if(!rows) return null;
  return rows.map(r => ({
    id: r.id, conference: r.conference, conferenceAbbr: r.conferenceAbbr,
    teamName: r.teamName, teamNickname: r.teamNickname, abbreviation: r.abbreviation, logoUrl: r.logoUrl,
    wins: r.stats.wins, losses: r.stats.losses, otLosses: r.stats.otLosses,
    points: r.stats.points, streak: r.stats.streak
  }));
}

// MLB league standings (AL/NL, not "conference" — ESPN's own group
// name/abbreviation are used as-is either way) — verified live
// (2026-09-11). Baseball's win% + games-behind is the real ordering
// convention (not points like NHL); ties are vanishingly rare but the
// field exists on the endpoint, so it's carried through rather than
// assumed zero.
// Shape returned: [{ id, conference, conferenceAbbr, teamName,
// abbreviation, logoUrl, wins, losses, ties, winPercent, gamesBehind,
// streak }]
export async function fetchEspnMlbStandings(){
  const rows = await fetchEspnFlatStandings('/apis/v2/sports/baseball/mlb/standings');
  if(!rows) return null;
  return rows.map(r => ({
    id: r.id, conference: r.conference, conferenceAbbr: r.conferenceAbbr,
    teamName: r.teamName, teamNickname: r.teamNickname, abbreviation: r.abbreviation, logoUrl: r.logoUrl,
    wins: r.stats.wins, losses: r.stats.losses, ties: r.stats.ties,
    winPercent: r.stats.winPercent, gamesBehind: r.stats.gamesBehind, streak: r.stats.streak,
    pointDifferential: r.stats.pointDifferential
  }));
}

// Static, stable structural data — confirmed live (2026-09-11) by
// walking each conference's /children division-group refs on ESPN's
// hypermedia core API. These ids are ESPN's own fixed identifiers for
// the NFL's 8 divisions; they don't change season to season, so no
// need to rediscover them at runtime.
const NFL_DIVISION_GROUP_IDS = {
  'AFC East': 4, 'AFC North': 12, 'AFC South': 13, 'AFC West': 6,
  'NFC East': 1, 'NFC North': 10, 'NFC South': 11, 'NFC West': 3
};

// Real division-by-division standings (AFC East, NFC West, etc.) —
// unlike fetchEspnNflStandings above (one flat request, conference
// only), the "site" API has no division grouping at all, so this
// walks ESPN's other, much more granular hidden API instead: the
// hypermedia "core" API (sports.core.api.espn.com). Confirmed CORS-open
// same as everything else here, but structured as a graph of `$ref`
// links rather than one flat JSON blob, so pulling one division's
// standings takes a fixed chain: conference group -> division group
// (ids hardcoded above, already resolved) -> that division's "overall"
// standings sub-resource, which finally has the real per-team
// win/loss/streak/PF/PA numbers (same field names as the flat
// endpoint's stats). The one thing that sub-resource does NOT have is
// team identity — `entry.team` there is only a further `$ref}` — so
// this also calls the flat endpoint above once to build an id ->
// name/abbreviation/logo lookup, rather than dereferencing all 32 of
// those refs individually (which would mean 32 MORE requests). 9
// requests total (1 flat + 8 divisions), run in parallel. See
// docs/espn-migration-plan.md's "NFL division standings" finding for
// how this chain was originally discovered.
// Shape returned: [{ division, teams: [{ teamId, teamName,
// abbreviation, logoUrl, wins, losses, ties, streak, pointsFor,
// pointsAgainst, winPercent }] }] — one entry per division, in the
// fixed AFC East/North/South/West, NFC East/North/South/West order
// above.
export async function fetchEspnNflDivisionStandings(){
  const flatRows = await fetchEspnNflStandings();
  if(!flatRows) return null;

  const byId = {};
  flatRows.forEach(row => { byId[row.id] = row; });

  const seasonYear = new Date().getFullYear();
  const divisions = await Promise.all(
    Object.entries(NFL_DIVISION_GROUP_IDS).map(async ([division, groupId]) => {
      const data = await fetchEspnCoreJSON(
        `${ESPN_CORE_BASE}/v2/sports/football/leagues/nfl/seasons/${seasonYear}/types/2/groups/${groupId}/standings/0?lang=en&region=us`
      );
      const entries = (data && data.standings) || [];
      const teams = entries.map(entry => {
        const idMatch = /\/teams\/(\d+)/.exec((entry.team && entry.team.$ref) || '');
        const teamId = idMatch ? idMatch[1] : null;
        const known = teamId ? byId[teamId] : null;
        const overall = (entry.records || []).find(r => r.name === 'overall');
        const stat = name => {
          const s = (overall && overall.stats || []).find(x => x.name === name);
          return s ? s.value : null;
        };
        return {
          teamId,
          teamName: known ? known.teamName : null,
          teamNickname: known ? known.teamNickname : null,
          abbreviation: known ? known.abbreviation : null,
          logoUrl: known ? known.logoUrl : null,
          wins: stat('wins'),
          losses: stat('losses'),
          ties: stat('ties'),
          streak: stat('streak'),
          pointsFor: stat('pointsFor'),
          pointsAgainst: stat('pointsAgainst'),
          winPercent: stat('winPercent')
        };
      // Drop anything the id lookup failed to resolve rather than
      // rendering a nameless row — should only happen if ESPN adds a
      // 33rd team mid-season without this app knowing about it yet.
      }).filter(t => t.abbreviation);
      return { division, teams };
    })
  );
  // A division fetch that came back empty (one bad request out of 9)
  // shouldn't take out the whole standings view — surface it as a
  // division with no teams rather than failing the entire result.
  return divisions;
}

// Shared by the division-standings fetchers below (NBA/NHL/MLB) —
// generalizes the same hypermedia-chain approach fetchEspnNflDivisionStandings
// above uses, once NBA/NHL/MLB needed the same treatment (NFL itself is
// left as its own separate function above rather than refactored onto
// this, to avoid touching already-shipped, working behavior for a
// refactor with no user-facing benefit). Same idea: a static
// division -> {groupId, conferenceAbbr} map (confirmed live per league,
// hardcoded by each caller below) walked via the core API's
// /groups/{id}/standings/0, cross-referenced against that league's own
// cheap flat fetch for team identity — the standings entry's `team` is
// only a further $ref here, same as NFL's version.
// recordName is the per-sport bucket name for a team's real season
// record on that sub-resource — confirmed live: NFL/NHL/MLB all call it
// 'overall', but NBA's equivalent bucket (no record literally named
// 'overall' exists on NBA's per-division standings resource) is named
// 'Division Standings' instead, so this takes it as a parameter rather
// than assuming one name works everywhere.
// statNames is which fields off that record to carry through — differs
// by sport (NHL's otLosses/points, MLB's ties/gamesBehind, etc — same
// per-sport field sets fetchEspnFlatStandings's callers already use).
// conferenceAbbr comes from the caller's own division map rather than
// parsed off the division's display name — unlike NFL's "AFC East"
// (where a simple prefix match works), MLB's division names collide
// across leagues ("AL East"/"NL East" both end in "East"), so this
// stays explicit instead of re-deriving it from a string.
// shortName is an optional per-division override for display contexts
// that already show the conference separately (the team modal's own
// Division stat cell, right next to its Conference one — showing "AL
// East" there would repeat "AL" that's already the cell to its left).
// Defaults to the division key itself when a caller doesn't need one
// (NBA/NHL's division names don't collide across conferences, so they
// don't set one) — only MLB's map below does.
// Shape returned: [{ division, shortName, conferenceAbbr, teams: [{
// teamId, teamName, teamNickname, abbreviation, logoUrl, ...statNames }] }]
async function fetchEspnCoreDivisionStandings(corePath, divisionDefs, recordName, flatRows, statNames){
  const byId = {};
  flatRows.forEach(row => { byId[row.id] = row; });

  const seasonYear = new Date().getFullYear();
  const divisions = await Promise.all(
    Object.entries(divisionDefs).map(async ([division, { groupId, conferenceAbbr, shortName }]) => {
      const data = await fetchEspnCoreJSON(
        `${ESPN_CORE_BASE}/v2/sports/${corePath}/seasons/${seasonYear}/types/2/groups/${groupId}/standings/0?lang=en&region=us`
      );
      const entries = (data && data.standings) || [];
      const teams = entries.map(entry => {
        const idMatch = /\/teams\/(\d+)/.exec((entry.team && entry.team.$ref) || '');
        const teamId = idMatch ? idMatch[1] : null;
        const known = teamId ? byId[teamId] : null;
        const record = (entry.records || []).find(r => r.name === recordName);
        const stat = name => {
          const s = (record && record.stats || []).find(x => x.name === name);
          return s ? s.value : null;
        };
        const row = {
          teamId,
          teamName: known ? known.teamName : null,
          teamNickname: known ? known.teamNickname : null,
          abbreviation: known ? known.abbreviation : null,
          logoUrl: known ? known.logoUrl : null
        };
        statNames.forEach(name => { row[name] = stat(name); });
        return row;
      // Drop anything the id lookup failed to resolve rather than
      // rendering a nameless row — same guard as NFL's version.
      }).filter(t => t.abbreviation);
      return { division, shortName: shortName || division, conferenceAbbr, teams };
    })
  );
  // A division fetch that came back empty (one bad request out of the
  // batch) shouldn't take out the whole standings view — same "surface
  // it as an empty division" rule as NFL's version.
  return divisions;
}

// Static, stable structural data — confirmed live (2026-09-12) by
// walking the core API's 2 conference groups' own /children division-
// group refs, same discovery method NFL's ids above were found with.
// NBA's 6 divisions don't collide by name across conferences (unlike
// MLB below), so the division name alone is used as the map key.
const NBA_DIVISION_GROUP_IDS = {
  'Atlantic': { groupId: 1, conferenceAbbr: 'East' },
  'Central': { groupId: 2, conferenceAbbr: 'East' },
  'Southeast': { groupId: 9, conferenceAbbr: 'East' },
  'Northwest': { groupId: 11, conferenceAbbr: 'West' },
  'Pacific': { groupId: 4, conferenceAbbr: 'West' },
  'Southwest': { groupId: 10, conferenceAbbr: 'West' }
};

// Real division-by-division NBA standings (Atlantic, Pacific, etc) —
// see fetchEspnCoreDivisionStandings above for the shared chain this
// walks. Reuses fetchEspnNbaStandings for the id -> name/abbreviation/
// logo lookup rather than a second flat request shape.
// Shape returned: [{ division, conferenceAbbr, teams: [{ teamId,
// teamName, teamNickname, abbreviation, logoUrl, wins, losses, streak,
// winPercent, gamesBehind, pointsFor, pointsAgainst }] }]
export async function fetchEspnNbaDivisionStandings(){
  const flatRows = await fetchEspnNbaStandings();
  if(!flatRows) return null;
  return fetchEspnCoreDivisionStandings(
    'basketball/leagues/nba', NBA_DIVISION_GROUP_IDS, 'Division Standings', flatRows,
    ['wins', 'losses', 'streak', 'winPercent', 'gamesBehind', 'pointsFor', 'pointsAgainst']
  );
}

// Confirmed live (2026-09-12) the same way as NBA's above. NHL's 4
// divisions don't collide by name across conferences either — but
// "Metropolitan" is long enough to break layout in the tighter spots
// that show it (the team modal's Division stat cell, standings group
// headers), so it gets the same shortName override MLB's map uses,
// even though there's no name collision reason to need one here.
const NHL_DIVISION_GROUP_IDS = {
  'Atlantic': { groupId: 32, conferenceAbbr: 'East' },
  'Metropolitan': { groupId: 33, conferenceAbbr: 'East', shortName: 'Metro' },
  'Central': { groupId: 31, conferenceAbbr: 'West' },
  'Pacific': { groupId: 30, conferenceAbbr: 'West' }
};

// Real division-by-division NHL standings (Atlantic, Metropolitan,
// Central, Pacific) — same chain as NBA's version above, but this
// sport's real record bucket is named 'overall' (matches NFL/MLB, not
// NBA's 'Division Standings' oddity).
// Shape returned: [{ division, conferenceAbbr, teams: [{ teamId,
// teamName, teamNickname, abbreviation, logoUrl, wins, losses,
// otLosses, points, streak }] }]
export async function fetchEspnNhlDivisionStandings(){
  const flatRows = await fetchEspnNhlStandings();
  if(!flatRows) return null;
  return fetchEspnCoreDivisionStandings(
    'hockey/leagues/nhl', NHL_DIVISION_GROUP_IDS, 'overall', flatRows,
    ['wins', 'losses', 'otLosses', 'points', 'streak']
  );
}

// Confirmed live (2026-09-12) the same way as NBA/NHL's above — but
// unlike those, MLB's division names DO collide across leagues (AL
// East/Central/West vs NL East/Central/West all share the same 3 short
// names), so the map key carries the league prefix to stay unique; the
// conferenceAbbr field (not the key) is what computeDivisionStandings
// actually filters on.
const MLB_DIVISION_GROUP_IDS = {
  'AL East': { groupId: 1, conferenceAbbr: 'AL', shortName: 'East' },
  'AL Central': { groupId: 2, conferenceAbbr: 'AL', shortName: 'Central' },
  'AL West': { groupId: 3, conferenceAbbr: 'AL', shortName: 'West' },
  'NL East': { groupId: 4, conferenceAbbr: 'NL', shortName: 'East' },
  'NL Central': { groupId: 5, conferenceAbbr: 'NL', shortName: 'Central' },
  'NL West': { groupId: 6, conferenceAbbr: 'NL', shortName: 'West' }
};

// Real division-by-division MLB standings (AL/NL East/Central/West) —
// same chain as NBA/NHL's versions above; MLB's real record bucket is
// 'overall', same as NHL/NFL.
// Shape returned: [{ division, conferenceAbbr, teams: [{ teamId,
// teamName, teamNickname, abbreviation, logoUrl, wins, losses, ties,
// winPercent, gamesBehind, streak }] }]
export async function fetchEspnMlbDivisionStandings(){
  const flatRows = await fetchEspnMlbStandings();
  if(!flatRows) return null;
  return fetchEspnCoreDivisionStandings(
    'baseball/leagues/mlb', MLB_DIVISION_GROUP_IDS, 'overall', flatRows,
    ['wins', 'losses', 'ties', 'winPercent', 'gamesBehind', 'streak']
  );
}

// Real AP Top 25 (or any of ESPN's other 4 CFB polls — Coaches, FCS
// Coaches, D2/D3 Coaches — pass its exact `name` from the `rankings`
// array). Richer than TheRundown's flat 1-25 "ranking" field: also
// carries week-over-week trend, first-place votes, and poll points.
// Shape returned: [{ rank, previousRank, trend, teamName, location,
// logoUrl, record, points, firstPlaceVotes }]
export async function fetchEspnCfbRankings(pollName = 'AP Top 25'){
  const data = await fetchEspnJSON('/apis/site/v2/sports/football/college-football/rankings');
  if(!data || !Array.isArray(data.rankings)) return null;

  const poll = data.rankings.find(p => p.name === pollName);
  if(!poll || !Array.isArray(poll.ranks)) return null;

  return poll.ranks.map(r => ({
    rank: r.current,
    previousRank: r.previous,
    trend: r.trend,
    teamName: espnTeamName(r.team),
    location: r.team.location,
    logoUrl: espnLogoUrl(r.team),
    record: r.recordSummary,
    points: r.points,
    firstPlaceVotes: r.firstPlaceVotes
  }));
}

// Men's College Basketball's AP Top 25 — same shape as fetchEspnCfbRankings
// above, plus a real `id` field (CFB's version doesn't carry one — it
// matches ranked teams back to drafted ones by `location` instead, see
// CFB_ESPN_NAME_OVERRIDES in js/standings-cfb.js). mcbb matches by
// TEAM_META's static espnTeamId instead (see fetchEspnCbbStandings'
// header comment for why), so this needs the id passed straight through
// rather than requiring a second name-override table.
// Verified live (2026-09-17): before the 2026-27 season's own polls
// exist yet, this correctly returns the most recent real poll (2025-26
// season, postseason Week 3) rather than an empty/future one — ESPN's
// rankings endpoint always serves whatever its own `latestSeason`/
// `latestWeek` fields point to.
// Shape returned: [{ id, rank, previousRank, trend, teamName, location,
// logoUrl, record, points, firstPlaceVotes }]
export async function fetchEspnCbbRankings(pollName = 'AP Top 25'){
  const data = await fetchEspnJSON('/apis/site/v2/sports/basketball/mens-college-basketball/rankings');
  if(!data || !Array.isArray(data.rankings)) return null;

  const poll = data.rankings.find(p => p.name === pollName);
  if(!poll || !Array.isArray(poll.ranks)) return null;

  return poll.ranks.map(r => ({
    id: r.team.id,
    rank: r.current,
    previousRank: r.previous,
    trend: r.trend,
    teamName: espnTeamName(r.team),
    location: r.team.location,
    logoUrl: espnLogoUrl(r.team),
    record: r.recordSummary,
    points: r.points,
    firstPlaceVotes: r.firstPlaceVotes
  }));
}

// Every FBS team's real win-loss record, across all 11 conferences —
// verified live (2026-09-12): 124 FBS teams. This is what used to need
// TheRundown's /teams/{sportId} (js/standings-cfb.js's cfbRecordsCache):
// board card record, the team modal stat strip, and the "Person"
// combined-win% view. One real gap this doesn't cover — FBS only, no
// FCS — matters for exactly one of this app's drafted CFB teams (NDSU);
// see findCfbRecord in js/standings-cfb.js for the ESPN-first,
// TheRundown-fallback-for-anything-ESPN-doesn't-have approach that
// covers it without keeping the other 29 CFB teams on TheRundown too.
// No conference grouping needed here (unlike fetchEspnFlatStandings's
// NFL/NBA/etc use) — CFB's own "League" view is the AP Top 25
// (fetchEspnCfbRankings above), not a conference standings table, so
// this flattens every conference straight into one array.
// Matches by `location` (e.g. "Ohio State"), the same field
// fetchEspnCfbRankings already uses — reuses that exact matching
// approach (findCfbTeamKeyByLocation, js/utils.js) rather than a second one.
// Shape returned: [{ id, location, teamName, wins, losses }]
export async function fetchEspnCfbFullStandings(){
  const data = await fetchEspnJSON('/apis/v2/sports/football/college-football/standings');
  if(!data || !Array.isArray(data.children)) return null;

  const rows = [];
  function walk(group){
    const entries = (group.standings && group.standings.entries) || [];
    if(entries.length){
      entries.forEach(entry => {
        // Unlike NFL/NBA/NHL/MLB, CFB's stats array has no flat "losses"
        // field at all — confirmed live (2026-09-12), Oregon's array has
        // wins=1 but nothing named "losses". What it does have is several
        // named per-split records (home/division/vs-AP-ranked/etc, each
        // with its own `summary` like "1-0"), one of which is `overall` —
        // that's the real season record, parsed the same "W-L" string way
        // parseWinLossRecord (js/standings-cfb.js) already parses
        // TheRundown's identically-shaped record string.
        const overall = (entry.stats || []).find(s => s.name === 'overall');
        const m = overall && /^(\d+)-(\d+)/.exec(overall.summary || '');
        if(!m) return;
        rows.push({
          id: entry.team.id,
          location: entry.team.location,
          teamName: espnTeamName(entry.team),
          wins: parseInt(m[1], 10),
          losses: parseInt(m[2], 10)
        });
      });
    } else if(Array.isArray(group.children)){
      // Every conference lists its entries directly except one: the Sun
      // Belt Conference nests its East/West divisions one level deeper
      // instead (confirmed live 2026-09-11 — its own node here has 0
      // direct entries but 2 child groups that do), silently dropping
      // all ~14 of its teams, James Madison included, before this walked
      // in. Recursing here picks up that shape (and any future
      // conference ESPN nests the same way) instead of a one-off
      // special case for just Sun Belt.
      group.children.forEach(walk);
    }
  }
  data.children.forEach(walk);
  return rows;
}

// One-off per-team record fetch — the only drafted CFB team this can't
// cover is already covered above; this exists for the one it can't:
// NDSU (js/standings-cfb.js's NDSU_ESPN_TEAM_ID), an FCS program the
// standings endpoint above never lists at all (FBS-only, unlike the Sun
// Belt nesting bug fixed above). ESPN's individual team endpoint has no
// such FBS/FCS split, so this works for any team id regardless of
// division. Same CORS-open /apis/site/v2/ family as fetchEspnTeamSchedule
// (the sibling /apis/v2/ path returned 404 here, confirmed live) — no
// worker proxy needed.
// Shape returned: [{ id, location, teamName, wins, losses }] | null
export async function fetchEspnCfbTeamRecord(espnTeamId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/football/college-football/teams/${espnTeamId}?enable=record`);
  const team = data && data.team;
  const items = team && team.record && team.record.items;
  const overall = Array.isArray(items) && items.find(i => i.type === 'total');
  const m = overall && /^(\d+)-(\d+)/.exec(overall.summary || '');
  if(!team || !m) return null;
  return {
    id: team.id,
    location: team.location,
    teamName: espnTeamName(team),
    wins: parseInt(m[1], 10),
    losses: parseInt(m[2], 10)
  };
}

// Real EPL table, all 20 clubs — verified live (2026-09-11): carries
// every field the old TheSportsDB-sourced table did (rank/win/draw/
// loss/points), plus fields TheSportsDB's table never had at all —
// goalsFor/goalsAgainst, goalDifference, gamesPlayed, and a
// qualification/relegation "zone" tag (e.g. "Champions League",
// "Relegation") straight from ESPN's own `note` field. A single-table
// league like the EPL only has one standings type, so (unlike NFL's
// conference split) this reads `children[0]` rather than mapping over
// several groups.
// Shape returned: [{ id, teamName, abbreviation, logoUrl, rank, wins,
// draws, losses, points, gamesPlayed, goalDifference, goalsFor,
// goalsAgainst, zone }]
export async function fetchEspnEplStandings(){
  const data = await fetchEspnJSON('/apis/v2/sports/soccer/eng.1/standings');
  const entries = data && data.children && data.children[0] && data.children[0].standings && data.children[0].standings.entries;
  if(!Array.isArray(entries)) return null;

  return entries.map(entry => {
    const stat = name => {
      const s = (entry.stats || []).find(x => x.name === name);
      return s ? s.value : null;
    };
    return {
      id: entry.team.id,
      teamName: espnTeamName(entry.team),
      abbreviation: entry.team.abbreviation,
      logoUrl: espnLogoUrl(entry.team),
      rank: stat('rank'),
      wins: stat('wins'),
      draws: stat('ties'),
      losses: stat('losses'),
      points: stat('points'),
      gamesPlayed: stat('gamesPlayed'),
      goalDifference: stat('pointDifferential'),
      goalsFor: stat('pointsFor'),
      goalsAgainst: stat('pointsAgainst'),
      zone: entry.note ? entry.note.description : null,
      // ESPN's own note.color is occasionally malformed — confirmed live,
      // Europa League came back as "##B5E7CE" (double leading #) while
      // Champions League/Relegation were fine — so this strips however
      // many #'s are actually there and adds back exactly one.
      zoneColor: entry.note && entry.note.color ? '#' + entry.note.color.replace(/^#+/, '') : null
    };
  });
}

// A club's real schedule — past results and every remaining fixture —
// verified live (2026-09-11) against Liverpool. ESPN's team schedule
// endpoint defaults to this season's played matches only (`recent`
// below); the same endpoint with `?fixture=true` instead returns every
// remaining fixture, not just the next one (`upcoming` below). Neither
// needs a second "team detail" call to know the next match id the way
// TheSportsDB V2's separate schedule-previous/schedule-next calls did.
// Carries real venue names and TV broadcast info, which TheSportsDB
// never had at all — see js/live-data.js's renderForm/renderNext for
// where those show up.
// Shape returned: { recent, upcoming }, each an array of
// [{ id, date, completed, statusDetail, isHome, opponentName,
// opponentLogoUrl, ownScore, oppScore, venueName, broadcast }],
// recent newest-first, upcoming soonest-first.
// Generalized for every league that uses this same "site" API team-
// schedule shape (soccer/eng.1 for EPL, basketball/nba, hockey/nhl,
// baseball/mlb, basketball/wnba so far) — the ?fixture=true flag's
// actual behavior turned out to differ by sport, checked live
// (2026-09-12): for EPL it genuinely splits (default = played matches
// only, ?fixture=true = remaining fixtures only), but for MLB both
// calls return the SAME full ~165-game season either way. Rather than
// trust that split, this fetches both, merges by event id (harmless
// duplicate work for MLB, necessary for EPL), and does the real
// recent/upcoming split itself off each event's own `completed` flag —
// correct regardless of which behavior a given sport turns out to have.
// Shape returned: { recent, upcoming }, each an array of
// [{ id, date, completed, statusDetail, isHome, opponentName,
// opponentLogoUrl, ownScore, oppScore, venueName, broadcast }],
// recent newest-first, upcoming soonest-first.
export async function fetchEspnTeamSchedule(sportLeaguePath, espnTeamId){
  const normalize = event => {
    const comp = event.competitions && event.competitions[0];
    const competitors = (comp && comp.competitors) || [];
    const self = competitors.find(c => c.team && String(c.team.id) === String(espnTeamId));
    const opponent = competitors.find(c => c.team && String(c.team.id) !== String(espnTeamId));
    if(!self || !opponent) return null;
    const statusType = comp.status && comp.status.type;
    const broadcast = comp.broadcasts && comp.broadcasts[0];
    return {
      id: event.id,
      date: event.date,
      completed: !!(statusType && statusType.completed),
      statusDetail: statusType ? statusType.shortDetail : null,
      isHome: self.homeAway === 'home',
      opponentName: espnTeamName(opponent.team),
      opponentLogoUrl: espnLogoUrl(opponent.team),
      ownScore: self.score ? Number(self.score.displayValue) : null,
      oppScore: opponent.score ? Number(opponent.score.displayValue) : null,
      venueName: comp.venue ? comp.venue.fullName : null,
      broadcast: broadcast && broadcast.media ? broadcast.media.shortName : null
    };
  };

  const [a, b] = await Promise.all([
    fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/teams/${espnTeamId}/schedule`),
    fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/teams/${espnTeamId}/schedule?fixture=true`)
  ]);
  const byId = new Map();
  [...((a && a.events) || []), ...((b && b.events) || [])].forEach(event => {
    const normalized = normalize(event);
    if(normalized) byId.set(normalized.id, normalized);
  });
  const all = [...byId.values()];
  const now = Date.now();
  const recent = all.filter(e => e.completed).sort((x, y) => new Date(y.date) - new Date(x.date));
  // A postponed game (real, confirmed live on the Cubs' schedule —
  // several April/June 2026 games marked STATUS_POSTPONED) is
  // "incomplete" forever but dated months in the past — without this
  // date guard it would sort to the front of "upcoming" ahead of every
  // real future game. Live-in-progress games never reach this: those
  // are handled earlier by TheRundown's overlay (isRundownEventLive),
  // so excluding a past date here never hides a game actually in
  // progress right now.
  const upcoming = all.filter(e => !e.completed && new Date(e.date).getTime() >= now)
    .sort((x, y) => new Date(x.date) - new Date(y.date));
  return { recent, upcoming };
}

// Team Page (js/team-page.js): a club's headlines, curled and verified
// live (2026-09-17) for one EPL/NFL/MLB team each. `?team=` does filter
// (mostly) to that team, but ESPN still folds in a handful of
// whole-league roundup stories (verified live: an NFL "Week 2 uniforms"
// story came back tagged with all 32 team ids at once) — those are
// dropped here by only keeping articles whose `team`-type category list
// is short enough to be genuinely about this club, rather than trusting
// the `team=` filter alone.
// Shape returned: [{ id, headline, description, published, link,
// imageUrl }], newest first, already filtered/capped.
const NEWS_MAX_TEAM_TAGS = 3; // a roundup story tags every team in the league; a real team story tags 1-2
const NEWS_ARTICLE_LIMIT = 8;

export async function fetchEspnTeamNews(sportLeaguePath, espnTeamId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/news?team=${espnTeamId}`);
  const articles = data && Array.isArray(data.articles) ? data.articles : null;
  if(!articles) return null;

  return articles
    .filter(a => {
      const teamCats = (a.categories || []).filter(c => c.type === 'team');
      return teamCats.length > 0 && teamCats.length <= NEWS_MAX_TEAM_TAGS && teamCats.some(c => String(c.teamId) === String(espnTeamId));
    })
    .slice(0, NEWS_ARTICLE_LIMIT)
    .map(a => ({
      id: a.id,
      headline: a.headline,
      description: a.description || '',
      published: a.published,
      link: a.links && a.links.web ? a.links.web.href : null,
      imageUrl: a.images && a.images[0] ? a.images[0].url : null
    }));
}

// NFL's roster groups come back as machine-case keys ("specialTeam",
// "injuredReserveOrOut") — MLB's own groups ("Pitchers", "Catchers", ...)
// are already display-ready, so only NFL needs a lookup here.
const NFL_ROSTER_GROUP_LABELS = {
  offense: 'Offense',
  defense: 'Defense',
  specialTeam: 'Special Teams',
  injuredReserveOrOut: 'Injured Reserve',
  suspended: 'Suspended',
  practiceSquad: 'Practice Squad'
};

// Pulls the handful of per-player stats worth surfacing out of a
// soccer athlete's inline `statistics` block (goals/assists/appearances)
// — present, verified live (2026-09-19) against Manchester City's full
// squad, for any player who's actually featured this season; an unused
// backup carries an empty `categories: []` instead, hence the `null`
// fallback rather than `0` (no minutes isn't the same as zero output).
function soccerPlayerStats(a){
  const categories = a.statistics && a.statistics.splits && a.statistics.splits.categories;
  if(!Array.isArray(categories) || !categories.length) return { goals: null, assists: null, appearances: null };
  const byName = {};
  categories.forEach(cat => (cat.stats || []).forEach(s => { byName[s.name] = s.value; }));
  return {
    goals: byName.totalGoals ?? null,
    assists: byName.goalAssists ?? null,
    appearances: byName.appearances ?? null
  };
}

// Team Page Squad/Roster tab: per-player bio data for every league, plus
// real season production for soccer — verified live (2026-09-19) that
// each soccer roster entry carries its own inline `statistics` block
// (goals/assists/appearances), which is what lets the Squad tab rank
// "Key players" by actual output instead of roster order (a team's
// goalkeepers sort first in ESPN's own soccer roster, so the old
// first-4 slice was showing keepers over a team's actual stars — e.g.
// Manchester City's before Erling Haaland). NFL/MLB carry no such
// per-player stats anywhere in this payload — that would need a
// separate per-athlete call ESPN doesn't offer in bulk — so `goals`/
// `assists`/`appearances` are always null there.
// Two different roster shapes verified live: soccer's `athletes` is a
// flat array of player objects; NFL/MLB's `athletes` is an array of
// {position: groupLabel, items: [...player objects]} groups
// (offense/defense/specialTeam/... or Pitchers/Catchers/...) — this
// flattens both into one list, keeping each player's own `group` label
// (null for soccer, which isn't grouped) for the Roster tab's own
// coarse filter chips (see squadPositionGroups in js/team-page.js) —
// deliberately coarser than the ~11-16 fine-grained `position` values
// NFL/MLB carry per player, which would make an unreadably long chip row.
// Shape returned: [{ id, name, jersey, position, group, age, injured,
// goals, assists, appearances }]
export async function fetchEspnTeamRoster(sportLeaguePath, espnTeamId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/teams/${espnTeamId}/roster`);
  const athletes = data && Array.isArray(data.athletes) ? data.athletes : null;
  if(!athletes) return null;

  const grouped = athletes.length > 0 && Array.isArray(athletes[0].items);
  const raw = grouped
    ? athletes.flatMap(g => (g.items || []).map(a => ({ a, group: NFL_ROSTER_GROUP_LABELS[g.position] || g.position || null })))
    : athletes.map(a => ({ a, group: null }));

  return raw.map(({ a, group }) => ({
    id: a.id,
    name: a.displayName || a.fullName || '',
    jersey: a.jersey || '',
    position: (a.position && (a.position.displayName || a.position.abbreviation)) || '',
    group,
    age: a.age || null,
    injured: (Array.isArray(a.injuries) && a.injuries.length > 0) || !!(a.status && a.status.type && a.status.type !== 'active'),
    ...(grouped ? { goals: null, assists: null, appearances: null } : soccerPlayerStats(a))
  }));
}

// Team Page Stats tab: team-level season stats — verified live
// (2026-09-17). Works richly for NFL/MLB (dozens of named stats across
// several categories, e.g. NFL's `netPassingYards`, MLB's `avg`/
// `homeRuns`). Soccer returns a real 200 but an EMPTY `results: {}` for
// every EPL club tried — ESPN just doesn't populate this endpoint for
// soccer, so this returns null there and callers fall back to whatever
// the standings table already carries instead (see
// fetchEspnEplStandings's goalsFor/goalsAgainst/goalDifference/ppg —
// no second fetch needed for EPL's Stats tab because of this gap).
// Shape returned: { [statName]: { value, displayValue, ... } } | null —
// a flat lookup across every category, since callers only need to pluck
// out a handful of named stats each, not walk the category structure.
export async function fetchEspnTeamStatistics(sportLeaguePath, espnTeamId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/teams/${espnTeamId}/statistics`);
  const categories = data && data.results && data.results.stats && data.results.stats.categories;
  if(!Array.isArray(categories) || !categories.length) return null;

  const byName = {};
  categories.forEach(cat => (cat.stats || []).forEach(s => { byName[s.name] = s; }));
  return byName;
}

// Today's full slate for a league (one request covers every team in
// it, same "one shared fetch" idea as rundownDayCache in js/api.js) —
// this is what replaces TheRundown for live in-game state. Verified
// live (2026-09-12) against 4 actually-in-progress MLB games: a
// STATUS_IN_PROGRESS competition's `status.type.state` is `'in'`
// (`'pre'`/`'post'` otherwise), and each competitor already carries a
// live `score` — no separate polling endpoint needed, this one
// response has today's state for every game at once.
// Also carries `season` straight off the same response — ESPN's
// standard {type, year} enum (1 Preseason/2 Regular Season/3
// Postseason/4 Off Season, confirmed against the core API's
// leagues/{league}/seasons/{year}/types listing) — so the modal-head
// season badge (see seasonStatusLabel in js/live-data.js) piggybacks
// on this same request instead of needing its own.
// Shape returned: { events: [{ id, date, state, detail, completed,
// competitors: [{ teamId, teamName, teamNickname, location, logoUrl, abbreviation,
// homeAway, score }] }], season: { type, year } | null }
export async function fetchEspnScoreboard(sportLeaguePath, dates){
  // ESPN's scoreboard defaults to today; `?dates=YYYYMMDD` returns that
  // day's slate instead — same response shape, verified against both.
  const params = dates ? [`dates=${dates}`] : [];
  // College Basketball only: on a real slate day this league can have
  // 100+ D1 games at once, far more than any other league here — the
  // same "silent default-limit truncation" risk already documented for
  // CFB's bulk /teams list (docs/espn-migration-plan.md, finding #3),
  // just on the scoreboard endpoint instead. `groups=50` (all Division
  // I, not just ESPN's default "featured" slate) + a high `limit`
  // avoids that; every other sportLeaguePath here plays too few games a
  // day to ever hit a default limit, so this only applies to mcbb.
  if(sportLeaguePath === 'basketball/mens-college-basketball') params.push('groups=50', 'limit=400');
  const query = params.length ? `?${params.join('&')}` : '';
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/scoreboard${query}`);
  if(!data) return null;

  const events = Array.isArray(data.events) ? data.events.map(event => {
    const comp = event.competitions && event.competitions[0];
    if(!comp) return null;
    const statusType = comp.status && comp.status.type;
    const competitors = (comp.competitors || []).map(c => ({
      teamId: c.team && c.team.id,
      teamName: espnTeamName(c.team),
      // Bare nickname ("Padres") — matches TEAM_META.name exactly, the
      // same convention findFlatTeamKey (js/standings-flat.js) uses.
      teamNickname: c.team && c.team.name,
      // The bare school ("Texas", "North Texas") — unlike teamNickname/
      // teamName above, this is unique per CFB school even when names
      // nest inside each other, so js/live-now.js matches CFB games
      // against this instead (findCfbTeamKeyByLocation, js/utils.js).
      location: c.team && c.team.location,
      // The scoreboard's team object carries one direct `logo` URL
      // (unlike the `logos[]` array espnLogoUrl reads elsewhere) — real
      // crest art for whichever side has no TEAM_META entry (i.e. isn't
      // drafted), same "real logo over a generic monogram" treatment
      // renderCfbRankingRow already gives undrafted ranked teams.
      logoUrl: (c.team && c.team.logo) || null,
      abbreviation: c.team && c.team.abbreviation,
      homeAway: c.homeAway,
      score: (c.score !== undefined && c.score !== null) ? Number(c.score) : null
    }));
    return {
      id: event.id,
      date: event.date || null,
      state: statusType ? statusType.state : null,
      detail: statusType ? statusType.shortDetail : null,
      completed: !!(statusType && statusType.completed),
      competitors,
      // Raw passthrough, not normalized — shape is sport-specific
      // (baseball: balls/strikes/outs/onFirst/onSecond/onThird; football:
      // down/distance/downDistanceText/isRedZone; basketball/soccer don't
      // send one at all). Confirmed live 2026-09-12 that this is the ONLY
      // place ESPN's hidden API exposes live down/distance or ball/strike
      // state — the summary endpoint's header.competitions[0] never
      // carries it (checked against real in-progress MLB and CFB games),
      // despite fetchEspnSummary having shipped assuming otherwise. See
      // openGameDetail/renderGameDetail in js/live-data.js, which read
      // this off bundle.espnLive.situation instead.
      situation: comp.situation || null
    };
  }).filter(Boolean) : [];

  return { events, season: data.season || null };
}

// Given today's scoreboard (fetchEspnScoreboard above) and one team's
// ESPN id, the same {isHome, own, opp, opponentName, period} shape
// rundownEventLine (js/api.js) builds from TheRundown — so
// renderStats/renderForm/renderNext/renderRowStatus (js/live-data.js)
// can read either source through one interface. `isLive` is state==='in'
// specifically, not just "found an event" — a scheduled-later-today or
// already-final game still returns a line (its score/detail), just
// with isLive:false, so callers can still show "Final 7-2" from the
// same lookup instead of needing a separate completed-game code path.
export function findEspnScoreboardLine(events, espnTeamId){
  if(!events) return null;
  const event = events.find(e => e.competitors.some(c => String(c.teamId) === String(espnTeamId)));
  if(!event) return null;
  const self = event.competitors.find(c => String(c.teamId) === String(espnTeamId));
  const opponent = event.competitors.find(c => String(c.teamId) !== String(espnTeamId));
  if(!self || !opponent) return null;
  return {
    isLive: event.state === 'in',
    completed: event.completed,
    isHome: self.homeAway === 'home',
    own: self.score,
    opp: opponent.score,
    opponentName: opponent.teamName,
    period: event.detail,
    // Carried through so a caller can drill into fetchEspnSummary below
    // for this exact game — previously discarded since nothing needed
    // it before the Game Details view (js/live-data.js's openGameDetail).
    eventId: event.id,
    // Raw per-game situation (down/distance, balls/strikes/baserunners,
    // etc. depending on sport) — see the comment on fetchEspnScoreboard
    // above for why this, not fetchEspnSummary, is the real source for
    // it. null for a scheduled/final game or a sport ESPN sends none for.
    situation: event.situation || null
  };
}

// Shared by fetchEspnSummary and fetchEspnFootballSummary below — the
// per-athlete stat tables (batting/pitching for baseball, passing/
// rushing/receiving/etc. for football) are identically shaped across
// both sports in real payloads (confirmed live 2026-09-12): a group per
// `stat.name` with its own `labels`/`athletes`.
//
// `groupColumns` curates this down to what a typical sports-site
// boxscore actually leads with, rather than passing ESPN's full
// response straight through — a real CFB summary carries 8-10 groups
// per team (passing/rushing/receiving/fumbles/defensive/interceptions/
// kickReturns/puntReturns/kicking/punting) and MLB's batting/pitching
// tables carry season-average trailing columns (AVG/OBP/SLG/ERA) mixed
// in with the game's own stats — all real, but too much for this app's
// quick drill-down (see docs/espn-migration-plan.md's Game Details
// section). It's `{ [groupName]: [wantedLabel, ...] }`: a group whose
// name isn't a key is dropped entirely; a kept group's columns are
// narrowed to the listed labels, in that order (matched by ESPN's own
// label string, not by position, so this stays correct even if ESPN
// reorders its own columns) — a label ESPN doesn't send is just
// skipped rather than showing an empty column.
function parseEspnBoxscorePlayers(data, groupColumns){
  const playerBlocks = (data.boxscore && Array.isArray(data.boxscore.players)) ? data.boxscore.players : [];
  return playerBlocks.map(block => ({
    teamId: block.team && block.team.id,
    abbr: block.team && block.team.abbreviation,
    // The group-identifying field itself differs by sport, confirmed
    // live 2026-09-12 — football sends it as `stat.name` ('passing',
    // etc.) with no `type`; baseball sends it as `stat.type`
    // ('batting'/'pitching') with no `name` at all. Reading `name ||
    // type` matches the fallback this function already used for the
    // rendered group title, just applied to the filter key too.
    groups: (Array.isArray(block.statistics) ? block.statistics : [])
      .map(stat => ({ stat, key: stat.name || stat.type || '' }))
      .filter(({ key }) => Object.prototype.hasOwnProperty.call(groupColumns, key))
      .map(({ stat, key }) => {
        const labels = Array.isArray(stat.labels) ? stat.labels : [];
        const keepIdx = groupColumns[key].map(l => labels.indexOf(l)).filter(i => i !== -1);
        return {
          name: key,
          labels: keepIdx.map(i => labels[i]),
          rows: (Array.isArray(stat.athletes) ? stat.athletes : []).map(a => ({
            name: (a.athlete && a.athlete.displayName) || '',
            stats: keepIdx.map(i => (Array.isArray(a.stats) ? a.stats[i] : undefined))
          })).filter(r => r.name)
        };
      })
      .filter(g => g.rows.length)
  }));
}

// Core columns only — see parseEspnBoxscorePlayers' comment above for
// why these are curated rather than passed through. Chosen to match
// what a typical broadcast/quick-view box score leads with: at-bat
// outcome counts for batting, innings/runs/walks/strikeouts for
// pitching — not the season-average columns (AVG/OBP/SLG/ERA) ESPN
// mixes into the same row.
const MLB_BOX_GROUP_COLUMNS = {
  batting: ['AB', 'R', 'H', 'RBI', 'HR', 'BB', 'K'],
  pitching: ['IP', 'H', 'R', 'ER', 'BB', 'K']
};

// Skill-position groups only (passing/rushing/receiving) — drops
// defensive/kicking/punting/return stats entirely, and each kept
// group's columns are trimmed to the count/yards/touchdowns a
// quick-view box score leads with (dropping per-attempt averages and
// long-play columns).
const FOOTBALL_BOX_GROUP_COLUMNS = {
  passing: ['C/ATT', 'YDS', 'TD', 'INT'],
  rushing: ['CAR', 'YDS', 'TD'],
  receiving: ['REC', 'YDS', 'TD']
};

// Shared by fetchEspnSummary/fetchEspnFootballSummary/fetchEspnSoccerSummary
// below — the same summary response also carries a recap article (one
// hero photo) and a `videos[]` reel (full-game highlights plus a few
// individual clips), confirmed live 2026-09-13 across NFL/CFB/MLB/EPL —
// same shape every time, so this is shared rather than duplicated per
// sport. Nothing here maps a specific clip to a specific play: ESPN
// doesn't key `videos[]` to `scoringPlays`/`keyEvents` by id, so this
// only ever surfaces "highlights for this game" as a whole, not a clip
// for any one score.
// A clip's own URLs expire — `timeRestrictions.expirationDate` ranges
// from ~48h (in-game reaction clips) out to ~a year (studio analysis) —
// so this skips any clip already past its own expiration rather than
// linking to one ESPN itself would already refuse to serve, and picks
// the first surviving one (usually the full-game highlight reel, first
// in ESPN's own ordering every case checked live).
// Uses `links.web.href` (ESPN's own watch page) rather than the raw
// CDN `links.source.href` mp4 — a plain link-out, not an embedded
// player.
function parseEspnGameMedia(data){
  const article = data && data.article;
  const images = article && Array.isArray(article.images) ? article.images : [];
  const photoUrl = images.length ? images[0].url : null;
  // article (type "Recap") only exists once ESPN has actually published
  // a post-game writeup — confirmed live: a still-in-progress game's
  // summary carries no `article` at all yet, so these stay null until
  // the game ends. description is AP wire copy and leads with a dateline
  // dash ("— The Bengals...") that only makes sense mid-paragraph, not
  // as the first thing under a headline, so that's stripped here.
  const recapHeadline = article ? ((article.headline || '').trim() || null) : null;
  const recapSummary = article ? ((article.description || '').replace(/^[—-]\s*/, '').trim() || null) : null;

  const now = Date.now();
  const videos = Array.isArray(data && data.videos) ? data.videos : [];
  const video = videos.find(v => {
    const exp = v.timeRestrictions && v.timeRestrictions.expirationDate;
    return !exp || new Date(exp).getTime() > now;
  });
  // Generic linkUrl/linkLabel rather than a video-specific field name —
  // MLB's equivalent (deriveMlbRecap in js/mlb-stats.js) points at an
  // article, not a video (MLB games already get real embedded clips via
  // Top Plays, so a second link to yet another video would be
  // redundant), and renderGameDetail (js/live-data.js) renders whichever
  // source's own label off one shared template rather than assuming
  // every league's link is "Watch highlights".
  const linkUrl = (video && video.links && video.links.web) ? video.links.web.href : null;
  const linkLabel = 'Watch highlights';

  return { photoUrl, recapHeadline, recapSummary, linkUrl, linkLabel };
}

// Shared status-block read off data.header.competitions[0] — identical
// for every sport's summary response.
function parseEspnSummaryStatus(comp){
  const statusType = comp.status && comp.status.type;
  return statusType ? {
    state: statusType.state,
    detail: statusType.shortDetail,
    period: comp.status.period,
    displayClock: comp.status.displayClock
  } : null;
}

// One game's live boxscore — the "Game Details" drill-down off the team
// modal's LIVE line (see openGameDetail in js/live-data.js). Unlike
// fetchEspnScoreboard above (one request covers every game in the
// league), this is per-event — only fetched when a drafter actually
// taps in for more, not on every background refresh tick.
//
// Baseball-only (MLB) — the runs/hits/errors fields here are baseball's
// own; football's equivalent is fetchEspnFootballSummary below (shared
// by CFB and, eventually, NFL, since both carry the same shape).
//
// Does NOT read `situation` (balls/strikes/outs/baserunners) — confirmed
// live 2026-09-12 that ESPN's summary endpoint never carries it on
// header.competitions[0] (checked against several real in-progress MLB
// games, always null), despite this function originally shipping with
// code that read it from here. The real source is the scoreboard
// endpoint's own per-event `situation` — see fetchEspnScoreboard/
// findEspnScoreboardLine above — which openGameDetail/renderGameDetail
// (js/live-data.js) now read off bundle.espnLive.situation instead.
//
// Shape returned: { status: {state, detail, period, displayClock},
// teams: [{ teamId, abbr, name, location, mascot, homeAway, score, hits, errors, linescore:
// [n, ...] }], boxscore: [{ teamId, abbr, groups: [{ name, labels:
// [...], rows: [{name, stats: [...]}] }] }], media: { photoUrl,
// recapHeadline, recapSummary, linkUrl, linkLabel }, date } | null on any failure.
export async function fetchEspnSummary(sportLeaguePath, eventId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/summary?event=${eventId}`);
  if(!data) return null;

  const comp = data.header && Array.isArray(data.header.competitions) && data.header.competitions[0];
  if(!comp) return null;

  const status = parseEspnSummaryStatus(comp);

  // Team-level hits/errors sometimes ride on the competitor object
  // directly, sometimes only on boxscore.teams[]'s own statistics array —
  // this checks the competitor first and falls back to the other shape
  // rather than assuming one.
  const boxTeams = (data.boxscore && Array.isArray(data.boxscore.teams)) ? data.boxscore.teams : [];
  const boxTeamStat = (teamId, name) => {
    const t = boxTeams.find(t => t.team && String(t.team.id) === String(teamId));
    const stat = t && Array.isArray(t.statistics) && t.statistics.find(s => s.name === name);
    return stat ? stat.displayValue : null;
  };

  const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
  const teams = competitors.map(c => {
    const teamId = c.team && c.team.id;
    return {
      teamId,
      abbr: c.team && c.team.abbreviation,
      name: espnTeamName(c.team),
      // location ("New York") and mascot ("Mets") split out separately
      // from the pre-joined `name` above — the Game Details header picks
      // one or the other per league (see GAME_DETAIL_LEAGUES.titleName
      // in js/live-data.js: MLB/NHL/NBA want mascot-only, CFB wants
      // location-only, NFL/EPL keep the full joined name).
      location: c.team && c.team.location,
      mascot: c.team && c.team.name,
      homeAway: c.homeAway,
      score: (c.score !== undefined && c.score !== null) ? Number(c.score) : null,
      hits: c.hits !== undefined ? c.hits : boxTeamStat(teamId, 'hits'),
      errors: c.errors !== undefined ? c.errors : boxTeamStat(teamId, 'errors'),
      // `value` doesn't exist on a real linescore entry — confirmed live
      // 2026-09-12 the field is `displayValue` (e.g. {displayValue:'2',
      // hits:2, errors:0}), so this was silently rendering every
      // per-inning cell blank before this fix.
      linescore: Array.isArray(c.linescores) ? c.linescores.map(l => l.displayValue) : []
    };
  });

  const boxscore = parseEspnBoxscorePlayers(data, MLB_BOX_GROUP_COLUMNS);
  const media = parseEspnGameMedia(data);
  // MLB-only: js/mlb-stats.js's fetchMlbTopPlay needs this to resolve
  // the same real game on MLB's own Stats API (matched by team name +
  // closest start time — see that file's comment for why) — confirmed
  // live this and MLB's own gameDate agree to the minute for the same
  // game. Not read by anything for football/soccer, so not added to
  // fetchEspnFootballSummary/fetchEspnSoccerSummary below.
  const date = comp.date || null;

  return { status, teams, boxscore, media, date };
}

// Football's equivalent of fetchEspnSummary above — shared by CFB and,
// eventually, NFL, since ESPN's football summary/boxscore shape is the
// same for both (see the sibling-function note in
// docs/espn-migration-plan.md's Game Details section for why this is
// its own function rather than an overload of the baseball one: no
// runs/hits/errors concept, a quarters-not-innings linescore, and no
// meaningful `situation` on this endpoint either — same as baseball,
// see fetchEspnSummary's comment above).
//
// Shape returned: { status: {state, detail, period, displayClock},
// teams: [{ teamId, abbr, name, location, mascot, homeAway, score, linescore: [n, ...] }],
// boxscore: [{ teamId, abbr, groups: [...] }], media: { photoUrl,
// recapHeadline, recapSummary, linkUrl, linkLabel }, date } | null on any failure.
export async function fetchEspnFootballSummary(sportLeaguePath, eventId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/summary?event=${eventId}`);
  if(!data) return null;

  const comp = data.header && Array.isArray(data.header.competitions) && data.header.competitions[0];
  if(!comp) return null;

  const status = parseEspnSummaryStatus(comp);

  const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
  const teams = competitors.map(c => ({
    teamId: c.team && c.team.id,
    abbr: c.team && c.team.abbreviation,
    name: espnTeamName(c.team),
    // See fetchEspnSummary's comment above — location/mascot split out
    // for the Game Details header's per-league title format.
    location: c.team && c.team.location,
    mascot: c.team && c.team.name,
    homeAway: c.homeAway,
    score: (c.score !== undefined && c.score !== null) ? Number(c.score) : null,
    linescore: Array.isArray(c.linescores) ? c.linescores.map(l => l.displayValue) : []
  }));

  const boxscore = parseEspnBoxscorePlayers(data, FOOTBALL_BOX_GROUP_COLUMNS);
  const media = parseEspnGameMedia(data);
  // See fetchEspnSummary's comment above — same field, now also read by
  // the Game Details header's date line (js/live-data.js).
  const date = comp.date || null;

  return { status, teams, boxscore, media, date };
}

// Soccer's equivalent of fetchEspnSummary/fetchEspnFootballSummary above
// — but there's no batting/passing-style per-athlete boxscore for
// soccer on this endpoint, so this reads `keyEvents` instead: confirmed
// live 2026-09-12 against a real completed EPL match (event 401879285,
// Brentford at Bournemouth) that `data.keyEvents` is a flat play-by-play
// array (kickoff/delays/goals/cards/subs/halftime, in chronological
// order) rather than the boxscore/header split baseball and football
// use. A goal is any entry with `scoringPlay: true` — more reliable
// than matching on `type.text` (which varies: "Goal", "Goal - Header",
// "Goal - Penalty", ...) since ESPN already resolves VAR review there
// itself. A card is identified by `type.text` containing "Red" or
// "Yellow" (also covers "Second Yellow Card"). `clock.displayValue` is
// already formatted as ESPN shows it pitch-side (e.g. "34'", "45'+3'"),
// and `participants[0].athlete` is the scorer or carded player — the
// same shape for both event kinds. No `situation` object exists on this
// endpoint for soccer either (see fetchEspnScoreboard's comment above),
// so callers shouldn't expect one.
//
// Shape returned: { status: {state, detail, period, displayClock},
// teams: [{ teamId, abbr, name, homeAway, score }], events: [{ teamId, minute,
// player, kind: 'goal'|'yellow'|'red' }], media: { photoUrl, recapHeadline,
// recapSummary, linkUrl, linkLabel }, date } | null on any failure.
export async function fetchEspnSoccerSummary(sportLeaguePath, eventId){
  const data = await fetchEspnJSON(`/apis/site/v2/sports/${sportLeaguePath}/summary?event=${eventId}`);
  if(!data) return null;

  const comp = data.header && Array.isArray(data.header.competitions) && data.header.competitions[0];
  if(!comp) return null;

  const status = parseEspnSummaryStatus(comp);

  const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
  const teams = competitors.map(c => ({
    teamId: c.team && c.team.id,
    abbr: c.team && c.team.abbreviation,
    name: espnTeamName(c.team),
    homeAway: c.homeAway,
    score: (c.score !== undefined && c.score !== null) ? Number(c.score) : null
  }));

  const events = (Array.isArray(data.keyEvents) ? data.keyEvents : [])
    .map(e => {
      const typeText = (e.type && e.type.text) || '';
      const isGoal = e.scoringPlay === true;
      const isCard = /red|yellow/i.test(typeText);
      if(!isGoal && !isCard) return null;
      const athlete = e.participants && e.participants[0] && e.participants[0].athlete;
      if(!athlete) return null;
      return {
        teamId: e.team && e.team.id,
        minute: (e.clock && e.clock.displayValue) || '',
        sortValue: (e.clock && e.clock.value) || 0,
        player: athlete.displayName || '',
        kind: isGoal ? 'goal' : (/red/i.test(typeText) ? 'red' : 'yellow')
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortValue - b.sortValue);

  const media = parseEspnGameMedia(data);
  // See fetchEspnSummary's comment above — same field, now also read by
  // the Game Details header's date line (js/live-data.js).
  const date = comp.date || null;

  return { status, teams, events, media, date };
}
