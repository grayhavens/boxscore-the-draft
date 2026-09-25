/* ============================================================
   Conference / division for each team in the draft room pool, so the
   Available list can show where a team sits and narrow to the teams
   still left in one conference or division (js/draft.js).

   Display only and client-side: it's looked up by league + team name,
   never sent to the DraftRoom server, so it works for rooms whose pool
   was already set. Names are matched loosely (case and punctuation
   ignored); a name can be listed under an alias too (e.g. 'Mich State') as
   long as it's the name the pool actually carries. A team not listed
   here (EPL, an unusual write-in) just shows no group.

   Alignments are for the 2026-27 seasons, including the rebuilt
   Pac-12 (Boise State, San Diego State, Utah State, Gonzaga, ...).
   Re-check college conferences before each draft — realignment moves
   schools around most years.
   ============================================================ */

// Pro leagues: conference -> division -> teams (pool names).
const PRO = {
  nfl: {
    AFC: {
      'AFC East': ['Bills', 'Dolphins', 'Patriots', 'Jets'],
      'AFC North': ['Ravens', 'Bengals', 'Browns', 'Steelers'],
      'AFC South': ['Texans', 'Colts', 'Jaguars', 'Titans'],
      'AFC West': ['Broncos', 'Chiefs', 'Raiders', 'Chargers']
    },
    NFC: {
      'NFC East': ['Cowboys', 'Giants', 'Eagles', 'Commanders'],
      'NFC North': ['Bears', 'Lions', 'Packers', 'Vikings'],
      'NFC South': ['Falcons', 'Panthers', 'Saints', 'Bucs', 'Buccaneers'],
      'NFC West': ['Cardinals', 'Rams', '49ers', 'Seahawks']
    }
  },
  nba: {
    East: {
      Atlantic: ['Celtics', 'Nets', 'Knicks', '76ers', 'Raptors'],
      Central: ['Bulls', 'Cavaliers', 'Pistons', 'Pacers', 'Bucks'],
      Southeast: ['Hawks', 'Hornets', 'Heat', 'Magic', 'Wizards']
    },
    West: {
      Northwest: ['Nuggets', 'Timberwolves', 'Thunder', 'Blazers', 'Trail Blazers', 'Jazz'],
      Pacific: ['Warriors', 'Clippers', 'Lakers', 'Suns', 'Kings'],
      Southwest: ['Mavericks', 'Rockets', 'Grizzlies', 'Pelicans', 'Spurs']
    }
  },
  nhl: {
    East: {
      Atlantic: ['Bruins', 'Sabres', 'Red Wings', 'Panthers', 'Canadiens', 'Senators', 'Lightning', 'Maple Leafs'],
      Metropolitan: ['Hurricanes', 'Blue Jackets', 'Devils', 'Islanders', 'Rangers', 'Flyers', 'Penguins', 'Capitals']
    },
    West: {
      Central: ['Blackhawks', 'Avalanche', 'Stars', 'Wild', 'Predators', 'Blues', 'Mammoth', 'Jets'],
      Pacific: ['Ducks', 'Flames', 'Oilers', 'Kings', 'Sharks', 'Kraken', 'Canucks', 'Golden Knights']
    }
  },
  mlb: {
    AL: {
      'AL East': ['Orioles', 'Red Sox', 'Yankees', 'Rays', 'Blue Jays'],
      'AL Central': ['White Sox', 'Guardians', 'Tigers', 'Royals', 'Twins'],
      'AL West': ['Athletics', 'Astros', 'Angels', 'Mariners', 'Rangers']
    },
    NL: {
      'NL East': ['Braves', 'Marlins', 'Mets', 'Phillies', 'Nationals'],
      'NL Central': ['Cubs', 'Reds', 'Brewers', 'Pirates', 'Cardinals'],
      'NL West': ['Diamondbacks', 'Rockies', 'Dodgers', 'Padres', 'Giants']
    }
  },
  // WNBA has conferences but no divisions.
  wnba: {
    East: { '': ['Dream', 'Sky', 'Sun', 'Fever', 'Liberty', 'Mystics', 'Tempo'] },
    West: { '': ['Wings', 'Valkyries', 'Aces', 'Sparks', 'Lynx', 'Mercury', 'Fire', 'Storm'] }
  }
};

// College: conference -> schools. Football and basketball share most
// of it; each sport's differences are listed separately below.
const COLLEGE_SHARED = {
  SEC: ['Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt'],
  'Big Ten': ['Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State', 'Mich State', 'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon', 'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Washington', 'Wisconsin'],
  ACC: ['Boston College', 'California', 'Cal', 'Clemson', 'Duke', 'Florida State', 'Georgia Tech', 'Louisville', 'Miami', 'NC State', 'North Carolina', 'Pitt', 'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech', 'Wake Forest'],
  'Big 12': ['Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati', 'Colorado', 'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU', 'Texas Tech', 'UCF', 'Utah', 'West Virginia'],
  'Pac-12': ['Boise State', 'Colorado State', 'Fresno State', 'Oregon State', 'San Diego State', 'Texas State', 'Utah State', 'Washington State'],
  American: ['Memphis']
};

const COLLEGE_EXTRA = {
  cfb: {
    Independent: ['Notre Dame', 'UConn'],
    American: ['Navy', 'Army', 'Tulane', 'South Florida', 'USF'],
    'Sun Belt': ['James Madison', 'App State', 'Appalachian State'],
    MAC: ['Toledo', 'Western Michigan'],
    'Conference USA': ['Liberty'],
    'Mountain West': ['New Mexico', 'UNLV', 'Hawaii'],
    MVFC: ['NDSU', 'North Dakota State']
  },
  mcbb: {
    ACC: ['Notre Dame'],
    'Big East': ['Butler', 'Creighton', 'DePaul', 'Georgetown', 'Marquette', 'Providence', 'Seton Hall', "St. John's", 'UConn', 'Villanova', 'Xavier'],
    'Pac-12': ['Gonzaga'],
    WCC: ["Saint Mary's"],
    'Atlantic 10': ['SLU', 'Saint Louis', 'Dayton', 'VCU'],
    Summit: ['NDSU', 'North Dakota State']
  }
};

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// league -> Map(normalized name -> { conf, div }), plus each league's
// conferences and divisions in display order.
const LOOKUP = {};
const CONF_ORDER = {};
const DIV_ORDER = {};   // league -> [{ div, conf }]

Object.entries(PRO).forEach(([league, confs]) => {
  const map = LOOKUP[league] = new Map();
  const divs = [];
  Object.entries(confs).forEach(([conf, byDiv]) => {
    Object.entries(byDiv).forEach(([div, teams]) => {
      if(div) divs.push({ div, conf });
      teams.forEach(name => map.set(norm(name), div ? { conf, div } : { conf }));
    });
  });
  CONF_ORDER[league] = Object.keys(confs);
  DIV_ORDER[league] = divs;
});

Object.entries(COLLEGE_EXTRA).forEach(([league, extra]) => {
  const map = LOOKUP[league] = new Map();
  const confs = [];
  [COLLEGE_SHARED, extra].forEach(src => Object.entries(src).forEach(([conf, schools]) => {
    if(!confs.includes(conf)) confs.push(conf);
    schools.forEach(name => map.set(norm(name), { conf }));
  }));
  CONF_ORDER[league] = confs;
  DIV_ORDER[league] = [];
});

// { conf, div? } for a pool team, or null when we don't know it.
export function teamGroup(team){
  const map = LOOKUP[team.league];
  return (map && map.get(norm(team.name))) || null;
}

// Short label for a team's row: 'AFC North', 'East · Atlantic', 'SEC'.
export function teamGroupLabel(team){
  const g = teamGroup(team);
  if(!g) return '';
  if(!g.div) return g.conf;
  return g.div.startsWith(g.conf) ? g.div : `${g.conf} · ${g.div}`;
}

// Present in `pool`: the league has at least one team there (taken or not).
function presentGroups(league, pool){
  const confs = new Set(), divs = new Set();
  pool.forEach(t => {
    if(t.league !== league) return;
    const g = teamGroup(t);
    if(g){ confs.add(g.conf); if(g.div) divs.add(g.div); }
  });
  return { confs, divs };
}

// The conferences a league's Conference menu offers, in display order.
export function leagueConfs(league, pool){
  const { confs } = presentGroups(league, pool);
  return (CONF_ORDER[league] || []).filter(c => confs.has(c));
}

// The divisions a league's Division menu offers ([{ div, conf }], in display
// order), only those inside `conf` when one is given.
export function leagueDivs(league, pool, conf){
  const { divs } = presentGroups(league, pool);
  return (DIV_ORDER[league] || []).filter(d => divs.has(d.div) && (!conf || d.conf === conf));
}
