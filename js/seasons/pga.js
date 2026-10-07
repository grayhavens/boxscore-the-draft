/* ============================================================
   PGA Tour, the league a group gets by listing `pga` in its caps
   (js/groups.js): its scoring rules, and the golfers as a catalog for a
   group that hasn't drafted yet (js/seasons/index.js), the same way
   The Draft's teams are one. See docs/golf-plan.md.

   A golfer is a TEAM_META entry like a team, marked `kind: 'golfer'`,
   with ESPN's athlete id as `espnAthleteId`. Everything golfer-shaped on
   screen is js/golf-view.js.
   ============================================================ */
import { GOLFERS } from '../golfers.js';
import { golferHeadshotUrl } from '../golf.js';
import { slugify } from '../draft-rules.js';

export const PGA_ACCENT = '#1E5B3F';

// Only the FedEx Cup season counts (January through the TOUR
// Championship). `golfAuto` rules are read off the season's results
// (js/golf.js), never marked by hand; `each` scores every time it
// happens, `once` at most once a season.
export const PGA_SCORING = {
  name: 'PGA Tour',
  full: 'PGA Tour Scoring',
  accent: PGA_ACCENT,
  rules: [
    { label: 'Win a tournament (each)', pts: 2, golfAuto: { each: 'win' } },
    { label: 'Win a major', pts: 5, golfAuto: { each: 'majorWin' } },
    { label: 'Top 10 in a major', pts: 2, golfAuto: { each: 'majorTop10' } },
    { label: 'Top 20 in a major (11th–20th)', pts: 1, golfAuto: { each: 'majorTop20' } },
    { label: 'Make the TOUR Championship', pts: 2, golfAuto: { once: 'tourChampionship' } },
    { label: 'Win the FedEx Cup', pts: 3, golfAuto: { once: 'fedexCup' } },
    { label: 'Miss the cut in a major', pts: -2, golfAuto: { each: 'majorMissedCut' } },
    { label: 'Miss the cut (other events)', pts: -1, golfAuto: { each: 'missedCut' } }
  ],
  bonus: { label: 'Most combined FedEx Cup points', pts: 5 }
};

// The four majors' logos for Home's major card (golfMajorHomeHtml in
// js/golf-view.js), matched by ESPN's event name, with the name the card
// shows ("The Masters", not ESPN's "Masters Tournament"). `lockup` logos
// are wide wordmarks, shown like the MLB postseason's. Each has a light
// and dark version: the navy ones go white on the dark theme, and the
// Masters' dark green is lifted so its wordmark reads there.
export const MAJORS = [
  { key: 'masters', name: 'The Masters', match: /masters/i, logo: { light: 'icons/major-masters.png', dark: 'icons/major-masters-dark.png' } },
  { key: 'pga', name: 'PGA Championship', match: /^pga championship/i, logo: { light: 'icons/major-pga-championship-light.png', dark: 'icons/major-pga-championship-dark.png' } },
  { key: 'usopen', name: 'U.S. Open', match: /^u\.?\s?s\.? open/i, lockup: true, logo: { light: 'icons/major-us-open-light.png', dark: 'icons/major-us-open-dark.png' } },
  { key: 'open', name: 'The Open', match: /^the open( championship)?$/i, lockup: true, logo: { light: 'icons/major-open-light.png', dark: 'icons/major-open-dark.png' } }
];

export function majorOf(name){
  return MAJORS.find(m => m.match.test(String(name || '').trim())) || null;
}

export function golferKey(name){
  return `pga_${slugify(name).replace(/-/g, '_')}`.slice(0, 60);
}

// One golfer's TEAM_META entry. Initials stand in for a crest when the
// headshot fails to load.
export function golferMeta(g){
  const initials = g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    name: g.name,
    leagueKey: 'pga',
    kind: 'golfer',
    boardSub: g.country || 'PGA Tour',
    sub: g.country || 'PGA Tour',
    accent: PGA_ACCENT,
    badgeStyle: `background:${PGA_ACCENT}; color:#FFFFFF;`,
    badgeText: initials,
    sportsdbId: null,
    espnAthleteId: String(g.id),
    badgeUrl: golferHeadshotUrl(g.id),
    flag: g.flag || ''
  };
}

// The whole golfer pool as catalog entries (favoriteOnly: nobody owns
// them before a draft), plus the league tab that lists them.
export function pgaCatalog(seasonLabel){
  const TEAM_META = {};
  const teams = GOLFERS.map(g => {
    const key = golferKey(g.name);
    TEAM_META[key] = { ...golferMeta(g), favoriteOnly: true };
    return key;
  });
  return { TEAM_META, league: { key: 'pga', label: 'PGA Tour', season: seasonLabel, teams } };
}
