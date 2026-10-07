/* ============================================================
   Which college football poll the app shows: the AP Top 25 until the
   College Football Playoff committee releases its first ranking (early
   November), then the CFP's for the rest of that season. Only one is
   ever shown; nothing scores off either (CFB's bonus is combined win %),
   so this only decides the Standings Top 25, the rank on team rows and
   the team page's poll stat.

   Why it switches at all: once the CFP ranking exists, ESPN's scoreboard
   ranks (game cards, schedules) follow it on their own (confirmed against
   2025 Week 12: Texas Tech #6 on the scoreboard, #6 CFP, #8 AP), so an AP
   table would disagree with the rest of the app.

   No date is hardcoded. ESPN's rankings feed gains a `type: 'cfp'` poll
   ("Playoff Committee Rankings") the week the committee releases one
   (2025: Nov 4, Week 11). After the last one (early December) the feed
   can drop it again for the AP's postseason polls, so a CFP poll seen
   for a season sticks for that season, and a device that never saw one
   gets the latest from ESPN's core API (js/espn.js).

   Pure (no imports) so Node tests cover it (tests/cfb-poll.test.mjs).
   ============================================================ */

export const CFB_POLLS = {
  ap: { label: 'AP Top 25', short: 'AP poll' },
  cfp: { label: 'CFP Top 25', short: 'CFP' }
};

// The poll to use from ESPN's site rankings feed, as { poll, season,
// ranks } with ESPN's raw rank entries, or null when the feed has
// neither. The CFP's wins whenever it's there.
export function pickCfbPoll(data){
  if(!data || !Array.isArray(data.rankings)) return null;
  const season = Number(data.latestSeason && data.latestSeason.year) || null;
  const find = type => data.rankings.find(p => p && p.type === type && Array.isArray(p.ranks) && p.ranks.length);
  const cfp = find('cfp');
  if(cfp) return { poll: 'cfp', season, ranks: cfp.ranks };
  const ap = find('ap') || data.rankings.find(p => p && p.name === 'AP Top 25' && Array.isArray(p.ranks));
  return ap ? { poll: 'ap', season, ranks: ap.ranks } : null;
}

// A fresh AP result never replaces a CFP poll already held for the same
// season: once the committee has ranked, it's the poll for the rest of
// that season. `cached` is the rankings cache ({ poll, season, ranks }).
export function keepCfpPoll(fresh, cached){
  if(fresh && fresh.poll === 'ap' && cached && cached.poll === 'cfp'
    && cached.season && cached.season === fresh.season && Array.isArray(cached.ranks) && cached.ranks.length){
    return cached;
  }
  return fresh;
}

// Whether the CFP could have ranked yet this season, so the core-API
// fallback is only asked for then: November through January (the CFP's
// first ranking to the title game). Months are 0-based.
export function cfpPossible(now = new Date()){
  return [10, 11, 0].includes(now.getMonth());
}

// An ESPN team $ref's numeric id ("…/teams/84?lang=en" -> "84").
export function teamIdFromRef(ref){
  const m = /\/teams\/(\d+)/.exec(ref || '');
  return m ? m[1] : null;
}
