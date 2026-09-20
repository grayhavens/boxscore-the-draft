/* ============================================================
   Board content: leagues, teams, and scoring rules.
   This is the file to edit when adding/removing a team or league
   — everything else in js/ just reads from these objects.
   ============================================================ */

// The 10 people in the fantasy draft. Every team in TEAM_META
// belongs to exactly one of these via its draftTeamId field.
export const DRAFT_TEAMS = [
  { id:'josh', name:'Josh' },
  { id:'isaac', name:'Isaac' },
  { id:'drew', name:'Drew' },
  { id:'douglas', name:'Douglas' },
  { id:'collin', name:'Collin' },
  { id:'erichylok', name:'Eric H' },
  { id:'patrick', name:'Patrick' },
  { id:'peter', name:'Peter' },
  { id:'ericprister', name:'Eric P' },
  { id:'donny', name:'Donny' }
];

// Static look/labels for every team, plus (where available) its
// TheSportsDB team ID so we can pull live results. Teams with
// sportsdbId: null and no espnTeamId don't have reliable live coverage
// yet and fall back to a plain notice.
// rundownTeamId (TheRundown's team ID, matched against the sport_id
// in RUNDOWN_SPORT_ID for the team's leagueKey — see js/api.js) adds
// live in-game state on top of sportsdbId where present. College
// Basketball teams instead carry an espnTeamId (ESPN's own numeric team
// id, e.g. Houston's 248) — added 2026-09-17 once ESPN's hidden API was
// confirmed to cover this league after all (js/standings-cbb.js has the
// full story); rundownTeamId stays on those entries too, as a defensive
// TheRundown fallback only (see FLAT_SCHEDULE_LEAGUES.mcbb in
// js/live-data.js).
// leagueKey links each team to its LEAGUE_SCORING entry below.
// draftTeamId links each team to its owner in DRAFT_TEAMS above.
// favoriteOnly:true marks a team that isn't part of anyone's real draft
// roster. It has NO draftTeamId — nobody owns it — and exists only so a
// drafter can favorite it (js/favorites.js) and see it on their own
// Teams tab. It must never be presented as a drafter's team anywhere
// (owner labels, other people's boards, Scores for anyone who hasn't
// favorited it), and every points-adjacent computation (each league's
// computeXDrafterCombined, js/overall.js's award/point totals) must
// filter it out first. Currently just oklahomastate/oklahomastate_cbb
// below.
//
// Josh's 21 teams (the real draft roster) and all 18 other EPL clubs
// (below) have full metadata (real badge colors, live
// sportsdbId/rundownTeamId) filled in. The remaining 171 teams — one roster per drafter, pulled from
// the shared draft spreadsheet, across NFL/NBA/NHL/MLB/WNBA/CFB/CBB —
// are appended further down as a skeleton: correct name/league/owner,
// a league-colored placeholder badge, and no live data yet. Fill
// those in incrementally the same way EPL was done, league by league.
export const TEAM_META = {
  liverpool:  { name:'Liverpool',   leagueKey:'epl',  draftTeamId:'josh', boardSub:'Premier League', sub:"", accent:'#C8102E', badgeStyle:'background:#C8102E; color:#F6EB61;', badgeText:'LFC',  sportsdbId:'133602', rundownTeamId:3446, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/kfaher1737969724.png' },
  newcastle:  { name:'Newcastle',   leagueKey:'epl',  draftTeamId:'josh', boardSub:'Premier League', sub:"", accent:'#241F20', badgeStyle:'background:#241F20; color:#FFFFFF;', badgeText:'NUFC', sportsdbId:'134777', rundownTeamId:3449, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/lhwuiz1621593302.png' },

  lions:      { name:'Lions',       leagueKey:'nfl',  draftTeamId:'josh', boardSub:'Detroit',     sub:"Detroit",     accent:'#0076B6', badgeStyle:'background:#0076B6; color:#B0B7BC;', badgeText:'DET',  sportsdbId:'134939', rundownTeamId:82, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/lgsgkr1546168257.png' },
  steelers:   { name:'Steelers',    leagueKey:'nfl',  draftTeamId:'josh', boardSub:'Pittsburgh',  sub:"Pittsburgh",  accent:'#101820', badgeStyle:'background:#101820; color:#FFB612;', badgeText:'PIT',  sportsdbId:'134925', rundownTeamId:68, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/2975411515853129.png' },
  dolphins:   { name:'Dolphins',    leagueKey:'nfl',  draftTeamId:'josh', boardSub:'Miami',       sub:"Miami",       accent:'#008E97', badgeStyle:'background:#008E97; color:#F58220;', badgeText:'MIA',  sportsdbId:'134919', rundownTeamId:62, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/e803xt1784722221.png' },

  cavaliers:  { name:'Cavaliers',   leagueKey:'nba',  draftTeamId:'josh', boardSub:'Cleveland',   sub:"Cleveland", accent:'#860038', badgeStyle:'background:#860038; color:#FDBB30;', badgeText:'CLE',  sportsdbId:'134871', rundownTeamId:7, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/cle.png' },
  nuggets:    { name:'Nuggets',     leagueKey:'nba',  draftTeamId:'josh', boardSub:'Denver',      sub:"Denver",   accent:'#0E2240', badgeStyle:'background:#0E2240; color:#FEC524;', badgeText:'DEN',  sportsdbId:'134885', rundownTeamId:16, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/den.png' },
  mavericks:  { name:'Mavericks',   leagueKey:'nba',  draftTeamId:'josh', boardSub:'Dallas',      sub:"Dallas",   accent:'#00538C', badgeStyle:'background:#00538C; color:#B8C4CA;', badgeText:'DAL',  sportsdbId:'134875', rundownTeamId:26, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/dal.png' },

  lightning:  { name:'Lightning',   leagueKey:'nhl',  draftTeamId:'josh', boardSub:'Tampa Bay',   sub:"Tampa Bay", accent:'#002868', badgeStyle:'background:#002868; color:#FFFFFF;', badgeText:'TBL',  sportsdbId:'134836', rundownTeamId:105, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/tb.png', badgeUrlDark:'https://a.espncdn.com/i/teamlogos/nhl/500-dark/tb.png' },
  flyers:     { name:'Flyers',      leagueKey:'nhl',  draftTeamId:'josh', boardSub:'Philadelphia', sub:"Philadelphia", accent:'#F74902', badgeStyle:'background:#F74902; color:#000000;', badgeText:'PHI',  sportsdbId:'134843', rundownTeamId:96, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/phi.png' },
  redwings:   { name:'Red Wings',   leagueKey:'nhl',  draftTeamId:'josh', boardSub:'Detroit',     sub:"Detroit",  accent:'#CE1126', badgeStyle:'background:#CE1126; color:#FFFFFF;', badgeText:'DET',  sportsdbId:'134832', rundownTeamId:110, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/det.png' },

  cubs:       { name:'Cubs',        leagueKey:'mlb',  draftTeamId:'josh', boardSub:'Chicago',     sub:"Chicago",      accent:'#0E3386', badgeStyle:'background:#0E3386; color:#CC3433;', badgeText:'CHC',  sportsdbId:'135269', rundownTeamId:36, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/chc.png' },
  padres:     { name:'Padres',      leagueKey:'mlb',  draftTeamId:'josh', boardSub:'San Diego',   sub:"San Diego",    accent:'#2F241D', badgeStyle:'background:#2F241D; color:#FFC425;', badgeText:'SD',   sportsdbId:'135278', rundownTeamId:44, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/sd.png', badgeUrlDark:'https://a.espncdn.com/i/teamlogos/mlb/500-dark/sd.png' },
  nationals:  { name:'Nationals',   leagueKey:'mlb',  draftTeamId:'josh', boardSub:'Washington',  sub:"Washington",   accent:'#AB0003', badgeStyle:'background:#AB0003; color:#FFFFFF;', badgeText:'WSH',  sportsdbId:'135281', rundownTeamId:35, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png' },

  valkyries:  { name:'Valkyries',   leagueKey:'wnba', draftTeamId:'josh', boardSub:'Golden State', sub:"Golden State", accent:'#8A6BAF', badgeStyle:'background:#000000; color:#8A6BAF;', badgeText:'GSV',  sportsdbId:'150722', rundownTeamId:10982, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/gs.png' },

  oregon:     { name:'Oregon',      leagueKey:'cfb',  draftTeamId:'josh', boardSub:'Ducks',       sub:"Ducks",  accent:'#154733', badgeStyle:'background:#154733; color:#FEE123;', badgeText:'ORE',  sportsdbId:'136938', recentLabel:'Results So Far', rundownTeamId:198, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/p7qmdy1564336566.png' },
  texasam:    { name:'Texas A&M',   leagueKey:'cfb',  draftTeamId:'josh', boardSub:'Aggies',      sub:"Aggies",  accent:'#500000', badgeStyle:'background:#500000; color:#FFFFFF;', badgeText:'A&M',  sportsdbId:'136959', recentLabel:'Results So Far', rundownTeamId:218, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/tsu3lj1564336806.png' },
  arizona:    { name:'Arizona',     leagueKey:'cfb',  draftTeamId:'josh', boardSub:'Wildcats',    sub:"Wildcats",  accent:'#AB0520', badgeStyle:'background:#AB0520; color:#0C234B;', badgeText:'ARIZ', sportsdbId:'136171', recentLabel:'Results So Far', rundownTeamId:125, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/kq29h81564335468.png' },
  // Josh's personal favorite, not part of anyone's draft (see
  // favoriteOnly above) — so no draftTeamId. It only shows up on the
  // Teams tab of a drafter who has favorited it (teamsForCurrentDraftTeam
  // in js/board.js) and on Scores for that same drafter (draftedTeamFor
  // in js/live-now.js). Same real-data treatment as every drafted CFB
  // team otherwise: findCfbTeamKeyByLocation (js/utils.js) matches it
  // against ESPN's standings/schedule by `name` ("Oklahoma State",
  // ESPN's own `location` field for team id 197), so it gets a real
  // record, schedule and Game Details sheet, not a placeholder.
  oklahomastate: { name:'Oklahoma State', leagueKey:'cfb', favoriteOnly:true, boardSub:'Cowboys', sub:"Cowboys", accent:'#FE5C00', badgeStyle:'background:#FE5C00; color:#000000;', badgeText:'OKST', sportsdbId:'136936', recentLabel:'Results So Far', rundownTeamId:196, badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/197.png' },

  // TheSportsDB doesn't carry a distinct entry for these three
  // schools' basketball programs (only their football teams), so
  // sportsdbId stays null — TheRundown (rundownTeamId, sport_id 5)
  // is their only live source, not just a live-state supplement.
  houston:    { name:'Houston',     leagueKey:'mcbb', draftTeamId:'josh', boardSub:'Cougars',      sub:'Cougars',      accent:'#C8102E', badgeStyle:'background:#C8102E; color:#FFFFFF;', badgeText:'HOU', sportsdbId:null, espnTeamId:'248', rundownTeamId:275, badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/248.png' },
  purdue:     { name:'Purdue',      leagueKey:'mcbb', draftTeamId:'josh', boardSub:'Boilermakers', sub:'Boilermakers', accent:'#000000', badgeStyle:'background:#000000; color:#CEB888;', badgeText:'PUR', sportsdbId:null, espnTeamId:'2509', rundownTeamId:321, badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2509.png' },
  utahstate:  { name:'Utah State',  leagueKey:'mcbb', draftTeamId:'josh', boardSub:'Aggies',       sub:'Aggies',       accent:'#0F2439', badgeStyle:'background:#0F2439; color:#FFFFFF;', badgeText:'USU', sportsdbId:null, espnTeamId:'328', rundownTeamId:348, badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/328.png', badgeUrlDark:'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/328.png' },
  // Same "Josh's favorite, outside the real draft" addition as
  // `oklahomastate` above, on the CBB side — espnTeamId 197 (ESPN reuses
  // the same numeric team id across a school's sports) is what
  // findCbbTeamKeyByEspnId (js/standings-cbb.js) matches against, same
  // as every real mcbb draft pick. No sportsdbId: TheSportsDB has no
  // separate entry for this school's basketball program, same as
  // Houston/Purdue/Utah State above. favoriteOnly:true — see
  // `oklahomastate`'s comment above; same rule applies here for
  // computeCbbDrafterCombined (js/standings-cbb.js).
  oklahomastate_cbb: { name:'Oklahoma State', leagueKey:'mcbb', favoriteOnly:true, boardSub:'Cowboys', sub:'Cowboys', accent:'#FE5C00', badgeStyle:'background:#FE5C00; color:#000000;', badgeText:'OKST', sportsdbId:null, espnTeamId:'197', rundownTeamId:315, badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/197.png' },

  // ---- Skeleton: the other 9 drafters' rosters (189 teams) ----
  isaac_arsenal: { name:'Arsenal', leagueKey:'epl', draftTeamId:'isaac', boardSub:'Premier League', sub:"", accent:'#EF0107', badgeStyle:'background:#EF0107; color:#FFFFFF;', badgeText:'ARS', sportsdbId:'133604', rundownTeamId:3436, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png' },
  drew_mancity: { name:'Manchester City', leagueKey:'epl', draftTeamId:'drew', boardSub:'Premier League', sub:"", accent:'#6CABDD', badgeStyle:'background:#6CABDD; color:#1C2C5B;', badgeText:'MC', sportsdbId:'133613', rundownTeamId:3447, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png' },
  douglas_everton: { name:'Everton', leagueKey:'epl', draftTeamId:'douglas', boardSub:'Premier League', sub:"", accent:'#003399', badgeStyle:'background:#003399; color:#FFFFFF;', badgeText:'EVE', sportsdbId:'133615', rundownTeamId:3442, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/eqayrf1523184794.png' },
  collin_chelsea: { name:'Chelsea', leagueKey:'epl', draftTeamId:'collin', boardSub:'Premier League', sub:"", accent:'#034694', badgeStyle:'background:#034694; color:#FFFFFF;', badgeText:'CHE', sportsdbId:'133610', rundownTeamId:3440, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/pbf4ul1782638263.png' },
  erichylok_astonvilla: { name:'Aston Villa', leagueKey:'epl', draftTeamId:'erichylok', boardSub:'Premier League', sub:"", accent:'#670E36', badgeStyle:'background:#670E36; color:#95BFE5;', badgeText:'AV', sportsdbId:'133601', rundownTeamId:3437, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/uwzw561787679026.png' },
  patrick_manunited: { name:'Manchester United', leagueKey:'epl', draftTeamId:'patrick', boardSub:'Premier League', sub:"", accent:'#DA291C', badgeStyle:'background:#DA291C; color:#FFFFFF;', badgeText:'MU', sportsdbId:'133612', rundownTeamId:3448, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/xzqdr11517660252.png' },
  peter_tottenhamhotspur: { name:'Tottenham Hotspur', leagueKey:'epl', draftTeamId:'peter', boardSub:'Premier League', sub:"", accent:'#132257', badgeStyle:'background:#132257; color:#FFFFFF;', badgeText:'TH', sportsdbId:'133616', rundownTeamId:3452, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/dfyfhl1604094109.png' },
  ericprister_crystalpalace: { name:'Crystal Palace', leagueKey:'epl', draftTeamId:'ericprister', boardSub:'Premier League', sub:"", accent:'#1B458F', badgeStyle:'background:#1B458F; color:#C4122E;', badgeText:'CP', sportsdbId:'133632', rundownTeamId:3441, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/ia6i3m1656014992.png' },
  donny_brentford: { name:'Brentford', leagueKey:'epl', draftTeamId:'donny', boardSub:'Premier League', sub:"", accent:'#E30613', badgeStyle:'background:#E30613; color:#FFFFFF;', badgeText:'BRE', sportsdbId:'134355', rundownTeamId:3469, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/grv1aw1546453779.png' },
  isaac_ipswichtown: { name:'Ipswich Town', leagueKey:'epl', draftTeamId:'isaac', boardSub:'Premier League', sub:"", accent:'#0044A9', badgeStyle:'background:#0044A9; color:#FFFFFF;', badgeText:'IT', sportsdbId:'133622', rundownTeamId:10708, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/mdj1ey1634670785.png' },
  drew_hullcity: { name:'Hull City', leagueKey:'epl', draftTeamId:'drew', boardSub:'Premier League', sub:"", accent:'#F18A00', badgeStyle:'background:#F18A00; color:#000000;', badgeText:'HC', sportsdbId:'133617', rundownTeamId:131655, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/fbqqda1601726113.png' },
  douglas_fulham: { name:'Fulham', leagueKey:'epl', draftTeamId:'douglas', boardSub:'Premier League', sub:"", accent:'#000000', badgeStyle:'background:#FFFFFF; color:#000000;', badgeText:'FUL', sportsdbId:'133600', rundownTeamId:3443, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/xwwvyt1448811086.png' },
  collin_leedsunited: { name:'Leeds United', leagueKey:'epl', draftTeamId:'collin', boardSub:'Premier League', sub:"", accent:'#1D428A', badgeStyle:'background:#FFFFFF; color:#1D428A;', badgeText:'LU', sportsdbId:'133635', rundownTeamId:3444, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/jcgrml1756649030.png' },
  erichylok_nottingham: { name:'Nottingham', leagueKey:'epl', draftTeamId:'erichylok', boardSub:'Premier League', sub:"", accent:'#DD0000', badgeStyle:'background:#DD0000; color:#FFFFFF;', badgeText:'NOT', sportsdbId:'133720', rundownTeamId:4272, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/sar2y41781740886.png' },
  patrick_brighton: { name:'Brighton', fullName:'Brighton & Hove Albion', leagueKey:'epl', draftTeamId:'patrick', boardSub:'Premier League', sub:"", accent:'#0057B8', badgeStyle:'background:#0057B8; color:#FFFFFF;', badgeText:'BRI', sportsdbId:'133619', rundownTeamId:3438, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/ywypts1448810904.png' },
  peter_afcbournemouth: { name:'AFC Bournemouth', leagueKey:'epl', draftTeamId:'peter', boardSub:'Premier League', sub:"", accent:'#DA291C', badgeStyle:'background:#DA291C; color:#000000;', badgeText:'AB', sportsdbId:'134301', rundownTeamId:4271, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/y08nak1534071116.png' },
  ericprister_sunderland: { name:'Sunderland', leagueKey:'epl', draftTeamId:'ericprister', boardSub:'Premier League', sub:"", accent:'#EB172B', badgeStyle:'background:#EB172B; color:#000000;', badgeText:'SUN', sportsdbId:'133603', rundownTeamId:11054, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/tprtus1448813498.png' },
  donny_coventrycity: { name:'Coventry City', leagueKey:'epl', draftTeamId:'donny', boardSub:'Premier League', sub:"", accent:'#78D0F1', badgeStyle:'background:#78D0F1; color:#1D1D1B;', badgeText:'CC', sportsdbId:'133625', rundownTeamId:131654, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/uxyqys1424033798.png' },
  isaac_eagles: { name:'Eagles', leagueKey:'nfl', draftTeamId:'isaac', boardSub:'Philadelphia', sub:"Philadelphia", accent:'#004C54', badgeStyle:'background:#004C54; color:#A5ACAF;', badgeText:'PHI', sportsdbId:'134936', rundownTeamId:79, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/pnpybf1515852421.png' },
  drew_chiefs: { name:'Chiefs', leagueKey:'nfl', draftTeamId:'drew', boardSub:'Kansas City', sub:"Kansas City", accent:'#E31837', badgeStyle:'background:#E31837; color:#FFB81C;', badgeText:'KC', sportsdbId:'134931', rundownTeamId:74, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/n58gp51784720929.png' },
  douglas_texans: { name:'Texans', leagueKey:'nfl', draftTeamId:'douglas', boardSub:'Houston', sub:"Houston", accent:'#03202F', badgeStyle:'background:#03202F; color:#A71930;', badgeText:'HOU', sportsdbId:'134926', rundownTeamId:69, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/o71ce41784719551.png' },
  collin_seahawks: { name:'Seahawks', leagueKey:'nfl', draftTeamId:'collin', boardSub:'Seattle', sub:"Seattle", accent:'#002244', badgeStyle:'background:#002244; color:#69BE28;', badgeText:'SEA', sportsdbId:'134949', rundownTeamId:92, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/1t84c51784752684.png' },
  erichylok_49ers: { name:'49ers', leagueKey:'nfl', draftTeamId:'erichylok', boardSub:'San Francisco', sub:"San Francisco", accent:'#AA0000', badgeStyle:'background:#AA0000; color:#B3995D;', badgeText:'SF', sportsdbId:'134948', rundownTeamId:91, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/bqbtg61539537328.png' },
  patrick_ravens: { name:'Ravens', leagueKey:'nfl', draftTeamId:'patrick', boardSub:'Baltimore', sub:"Baltimore", accent:'#241773', badgeStyle:'background:#241773; color:#9E7C0C;', badgeText:'BAL', sportsdbId:'134922', rundownTeamId:65, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/einz3p1546172463.png' },
  peter_broncos: { name:'Broncos', leagueKey:'nfl', draftTeamId:'peter', boardSub:'Denver', sub:"Denver", accent:'#FB4F14', badgeStyle:'background:#FB4F14; color:#002244;', badgeText:'DEN', sportsdbId:'134930', rundownTeamId:73, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/zy3m9v1784718707.png' },
  ericprister_rams: { name:'Rams', leagueKey:'nfl', draftTeamId:'ericprister', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#003594', badgeStyle:'background:#003594; color:#FFA300;', badgeText:'LAR', sportsdbId:'135907', rundownTeamId:90, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/ojw15x1784721865.png' },
  donny_bucs: { name:'Bucs', leagueKey:'nfl', draftTeamId:'donny', boardSub:'Tampa Bay', sub:"Tampa Bay", accent:'#D50A0A', badgeStyle:'background:#D50A0A; color:#34302B;', badgeText:'TB', sportsdbId:'134945', rundownTeamId:88, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/2dfpdl1537820969.png' },
  isaac_patriots: { name:'Patriots', leagueKey:'nfl', draftTeamId:'isaac', boardSub:'New England', sub:"New England", accent:'#002244', badgeStyle:'background:#002244; color:#C60C30;', badgeText:'NE', sportsdbId:'134920', rundownTeamId:63, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/xtwxyt1421431860.png' },
  drew_bengals: { name:'Bengals', leagueKey:'nfl', draftTeamId:'drew', boardSub:'Cincinnati', sub:"Cincinnati", accent:'#FB4F14', badgeStyle:'background:#FB4F14; color:#000000;', badgeText:'CIN', sportsdbId:'134923', rundownTeamId:66, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/h1ce8y1784717263.png' },
  douglas_falcons: { name:'Falcons', leagueKey:'nfl', draftTeamId:'douglas', boardSub:'Atlanta', sub:"Atlanta", accent:'#A71930', badgeStyle:'background:#A71930; color:#000000;', badgeText:'ATL', sportsdbId:'134942', rundownTeamId:85, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/9ucfd41784714178.png' },
  collin_giants: { name:'Giants', leagueKey:'nfl', draftTeamId:'collin', boardSub:'New York', sub:"New York", accent:'#0B2265', badgeStyle:'background:#0B2265; color:#A71930;', badgeText:'NYG', sportsdbId:'134935', rundownTeamId:78, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/i9muak1784751331.png' },
  erichylok_packers: { name:'Packers', leagueKey:'nfl', draftTeamId:'erichylok', boardSub:'Green Bay', sub:"Green Bay", accent:'#203731', badgeStyle:'background:#203731; color:#FFB612;', badgeText:'GB', sportsdbId:'134940', rundownTeamId:83, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/uwbfw01784719173.png' },
  patrick_colts: { name:'Colts', leagueKey:'nfl', draftTeamId:'patrick', boardSub:'Indianapolis', sub:"Indianapolis", accent:'#002C5F', badgeStyle:'background:#002C5F; color:#FFFFFF;', badgeText:'IND', sportsdbId:'134927', rundownTeamId:70, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/im99lm1784720368.png' },
  peter_jaguars: { name:'Jaguars', leagueKey:'nfl', draftTeamId:'peter', boardSub:'Jacksonville', sub:"Jacksonville", accent:'#101820', badgeStyle:'background:#101820; color:#D7A22A;', badgeText:'JAX', sportsdbId:'134928', rundownTeamId:71, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/0mrsd41546427902.png' },
  ericprister_bills: { name:'Bills', leagueKey:'nfl', draftTeamId:'ericprister', boardSub:'Buffalo', sub:"Buffalo", accent:'#00338D', badgeStyle:'background:#00338D; color:#C60C30;', badgeText:'BUF', sportsdbId:'134918', rundownTeamId:61, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/j4r1tn1784714823.png' },
  donny_vikings: { name:'Vikings', leagueKey:'nfl', draftTeamId:'donny', boardSub:'Minnesota', sub:"Minnesota", accent:'#4F2683', badgeStyle:'background:#4F2683; color:#FFC62F;', badgeText:'MIN', sportsdbId:'134941', rundownTeamId:84, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/nyp3ev1784722510.png' },
  isaac_titans: { name:'Titans', leagueKey:'nfl', draftTeamId:'isaac', boardSub:'Tennessee', sub:"Tennessee", accent:'#0C2340', badgeStyle:'background:#0C2340; color:#4B92DB;', badgeText:'TEN', sportsdbId:'134929', rundownTeamId:72, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/3td0f41779180767.png' },
  drew_bears: { name:'Bears', leagueKey:'nfl', draftTeamId:'drew', boardSub:'Chicago', sub:"Chicago", accent:'#0B162A', badgeStyle:'background:#0B162A; color:#C83803;', badgeText:'CHI', sportsdbId:'134938', rundownTeamId:81, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/0m51zd1784716955.png' },
  douglas_commanders: { name:'Commanders', leagueKey:'nfl', draftTeamId:'douglas', boardSub:'Washington', sub:"Washington", accent:'#5A1414', badgeStyle:'background:#5A1414; color:#FFB612;', badgeText:'WAS', sportsdbId:'134937', rundownTeamId:80, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/rn0c7v1643826119.png' },
  collin_raiders: { name:'Raiders', leagueKey:'nfl', draftTeamId:'collin', boardSub:'Las Vegas', sub:"Las Vegas", accent:'#000000', badgeStyle:'background:#000000; color:#A5ACAF;', badgeText:'LV', sportsdbId:'134932', rundownTeamId:75, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/4t8xtk1784721179.png' },
  erichylok_cowboys: { name:'Cowboys', leagueKey:'nfl', draftTeamId:'erichylok', boardSub:'Dallas', sub:"Dallas", accent:'#041E42', badgeStyle:'background:#041E42; color:#869397;', badgeText:'DAL', sportsdbId:'134934', rundownTeamId:77, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/76ew3c1784718447.png' },
  patrick_saints: { name:'Saints', leagueKey:'nfl', draftTeamId:'patrick', boardSub:'New Orleans', sub:"New Orleans", accent:'#101820', badgeStyle:'background:#101820; color:#D3BC8D;', badgeText:'NO', sportsdbId:'134944', rundownTeamId:87, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/nd46c71537821337.png' },
  peter_panthers: { name:'Panthers', leagueKey:'nfl', draftTeamId:'peter', boardSub:'Carolina', sub:"Carolina", accent:'#0085CA', badgeStyle:'background:#0085CA; color:#101820;', badgeText:'CAR', sportsdbId:'134943', rundownTeamId:86, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/kbqini1784716157.png' },
  ericprister_chargers: { name:'Chargers', leagueKey:'nfl', draftTeamId:'ericprister', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#0080C6', badgeStyle:'background:#0080C6; color:#FFC20E;', badgeText:'LAC', sportsdbId:'135908', rundownTeamId:76, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/wmi40u1784721460.png' },
  donny_jets: { name:'Jets', leagueKey:'nfl', draftTeamId:'donny', boardSub:'New York', sub:"New York", accent:'#125740', badgeStyle:'background:#125740; color:#FFFFFF;', badgeText:'NYJ', sportsdbId:'134921', rundownTeamId:64, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/6bnwoc1784751677.png' },
  isaac_raptors: { name:'Raptors', leagueKey:'nba', draftTeamId:'isaac', boardSub:'Toronto', sub:"Toronto", accent:'#D91244', badgeStyle:'background:#D91244; color:#FFFFFF;', badgeText:'RAP', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/tor.png' },
  drew_knicks: { name:'Knicks', leagueKey:'nba', draftTeamId:'drew', boardSub:'New York', sub:"New York", accent:'#1D428A', badgeStyle:'background:#1D428A; color:#F58426;', badgeText:'KNI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/ny.png' },
  douglas_76ers: { name:'76ers', leagueKey:'nba', draftTeamId:'douglas', boardSub:'Philadelphia', sub:"Philadelphia", accent:'#1D428A', badgeStyle:'background:#1D428A; color:#E01234;', badgeText:'76E', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/phi.png' },
  collin_blazers: { name:'Blazers', leagueKey:'nba', draftTeamId:'collin', boardSub:'Portland', sub:"Portland", accent:'#E03A3E', badgeStyle:'background:#E03A3E; color:#FFFFFF;', badgeText:'BLA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/por.png' },
  erichylok_celtics: { name:'Celtics', leagueKey:'nba', draftTeamId:'erichylok', boardSub:'Boston', sub:"Boston", accent:'#008348', badgeStyle:'background:#008348; color:#FFFFFF;', badgeText:'CEL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/bos.png' },
  patrick_spurs: { name:'Spurs', leagueKey:'nba', draftTeamId:'patrick', boardSub:'San Antonio', sub:"San Antonio", accent:'#000000', badgeStyle:'background:#000000; color:#C4CED4;', badgeText:'SPU', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/sa.png' },
  peter_pacers: { name:'Pacers', leagueKey:'nba', draftTeamId:'peter', boardSub:'Indiana', sub:"Indiana", accent:'#0C2340', badgeStyle:'background:#0C2340; color:#FFD520;', badgeText:'PAC', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/ind.png' },
  ericprister_hawks: { name:'Hawks', leagueKey:'nba', draftTeamId:'ericprister', boardSub:'Atlanta', sub:"Atlanta", accent:'#C8102E', badgeStyle:'background:#C8102E; color:#FDB927;', badgeText:'HAW', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/atl.png' },
  donny_thunder: { name:'Thunder', leagueKey:'nba', draftTeamId:'donny', boardSub:'Oklahoma City', sub:"Oklahoma City", accent:'#007AC1', badgeStyle:'background:#007AC1; color:#EF3B24;', badgeText:'THU', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/okc.png' },
  isaac_bulls: { name:'Bulls', leagueKey:'nba', draftTeamId:'isaac', boardSub:'Chicago', sub:"Chicago", accent:'#CE1141', badgeStyle:'background:#CE1141; color:#FFFFFF;', badgeText:'BUL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/chi.png' },
  drew_warriors: { name:'Warriors', leagueKey:'nba', draftTeamId:'drew', boardSub:'Golden State', sub:"Golden State", accent:'#FDB927', badgeStyle:'background:#FDB927; color:#1D428A;', badgeText:'WAR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/gs.png' },
  douglas_rockets: { name:'Rockets', leagueKey:'nba', draftTeamId:'douglas', boardSub:'Houston', sub:"Houston", accent:'#CE0E2D', badgeStyle:'background:#CE0E2D; color:#FFFFFF;', badgeText:'ROC', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/hou.png' },
  collin_nets: { name:'Nets', leagueKey:'nba', draftTeamId:'collin', boardSub:'Brooklyn', sub:"Brooklyn", accent:'#000000', badgeStyle:'background:#000000; color:#FFFFFF;', badgeText:'NET', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/bkn.png' },
  erichylok_timberwolves: { name:'Timberwolves', leagueKey:'nba', draftTeamId:'erichylok', boardSub:'Minnesota', sub:"Minnesota", accent:'#266092', badgeStyle:'background:#266092; color:#79BC43;', badgeText:'TIM', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/min.png' },
  patrick_heat: { name:'Heat', leagueKey:'nba', draftTeamId:'patrick', boardSub:'Miami', sub:"Miami", accent:'#98002E', badgeStyle:'background:#98002E; color:#FFFFFF;', badgeText:'HEA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/mia.png' },
  peter_jazz: { name:'Jazz', leagueKey:'nba', draftTeamId:'peter', boardSub:'Utah', sub:"Utah", accent:'#4E008E', badgeStyle:'background:#4E008E; color:#79A3DC;', badgeText:'JAZ', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/utah.png' },
  ericprister_clippers: { name:'Clippers', leagueKey:'nba', draftTeamId:'ericprister', boardSub:'LA', sub:"LA", accent:'#12173F', badgeStyle:'background:#12173F; color:#C8102E;', badgeText:'CLI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/lac.png' },
  donny_pistons: { name:'Pistons', leagueKey:'nba', draftTeamId:'donny', boardSub:'Detroit', sub:"Detroit", accent:'#1D428A', badgeStyle:'background:#1D428A; color:#C8102E;', badgeText:'PIS', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/det.png' },
  isaac_pelicans: { name:'Pelicans', leagueKey:'nba', draftTeamId:'isaac', boardSub:'New Orleans', sub:"New Orleans", accent:'#0A2240', badgeStyle:'background:#0A2240; color:#B4975A;', badgeText:'PEL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/no.png' },
  drew_bucks: { name:'Bucks', leagueKey:'nba', draftTeamId:'drew', boardSub:'Milwaukee', sub:"Milwaukee", accent:'#00471B', badgeStyle:'background:#00471B; color:#EEE1C6;', badgeText:'BUC', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/mil.png' },
  douglas_hornets: { name:'Hornets', leagueKey:'nba', draftTeamId:'douglas', boardSub:'Charlotte', sub:"Charlotte", accent:'#008CA8', badgeStyle:'background:#008CA8; color:#1D1060;', badgeText:'HOR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/cha.png' },
  collin_kings: { name:'Kings', leagueKey:'nba', draftTeamId:'collin', boardSub:'Sacramento', sub:"Sacramento", accent:'#5A2D81', badgeStyle:'background:#5A2D81; color:#FFFFFF;', badgeText:'KIN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/sac.png' },
  erichylok_suns: { name:'Suns', leagueKey:'nba', draftTeamId:'erichylok', boardSub:'Phoenix', sub:"Phoenix", accent:'#29127A', badgeStyle:'background:#29127A; color:#E56020;', badgeText:'SUN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/phx.png' },
  patrick_magic: { name:'Magic', leagueKey:'nba', draftTeamId:'patrick', boardSub:'Orlando', sub:"Orlando", accent:'#0150B5', badgeStyle:'background:#0150B5; color:#9CA0A3;', badgeText:'MAG', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/orl.png' },
  peter_wizards: { name:'Wizards', leagueKey:'nba', draftTeamId:'peter', boardSub:'Washington', sub:"Washington", accent:'#E31837', badgeStyle:'background:#E31837; color:#FFFFFF;', badgeText:'WIZ', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/wsh.png' },
  ericprister_grizzlies: { name:'Grizzlies', leagueKey:'nba', draftTeamId:'ericprister', boardSub:'Memphis', sub:"Memphis", accent:'#5D76A9', badgeStyle:'background:#5D76A9; color:#12173F;', badgeText:'GRI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/mem.png' },
  donny_lakers: { name:'Lakers', leagueKey:'nba', draftTeamId:'donny', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#552583', badgeStyle:'background:#552583; color:#FDB927;', badgeText:'LAK', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' },
  isaac_ducks: { name:'Ducks', leagueKey:'nhl', draftTeamId:'isaac', boardSub:'Anaheim', sub:"Anaheim", accent:'#FC4C02', badgeStyle:'background:#FC4C02; color:#000000;', badgeText:'DUC', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/ana.png' },
  drew_stars: { name:'Stars', leagueKey:'nhl', draftTeamId:'drew', boardSub:'Dallas', sub:"Dallas", accent:'#20864C', badgeStyle:'background:#20864C; color:#FFFFFF;', badgeText:'STA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/dal.png' },
  douglas_mammoth: { name:'Mammoth', leagueKey:'nhl', draftTeamId:'douglas', boardSub:'Utah', sub:"Utah", accent:'#000000', badgeStyle:'background:#000000; color:#7AB2E1;', badgeText:'MAM', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/uta.png' },
  collin_hurricanes: { name:'Hurricanes', leagueKey:'nhl', draftTeamId:'collin', boardSub:'Carolina', sub:"Carolina", accent:'#E30426', badgeStyle:'background:#E30426; color:#FFFFFF;', badgeText:'HUR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/car.png' },
  erichylok_jets: { name:'Jets', leagueKey:'nhl', draftTeamId:'erichylok', boardSub:'Winnipeg', sub:"Winnipeg", accent:'#002D62', badgeStyle:'background:#002D62; color:#C41230;', badgeText:'JET', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/wpg.png' },
  patrick_oilers: { name:'Oilers', leagueKey:'nhl', draftTeamId:'patrick', boardSub:'Edmonton', sub:"Edmonton", accent:'#00205B', badgeStyle:'background:#00205B; color:#FF4C00;', badgeText:'OIL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/edm.png' },
  peter_goldenknights: { name:'Golden Knights', leagueKey:'nhl', draftTeamId:'peter', boardSub:'Vegas', sub:"Vegas", accent:'#344043', badgeStyle:'background:#344043; color:#B4975A;', badgeText:'GK', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/vgk.png' },
  ericprister_panthers: { name:'Panthers', leagueKey:'nhl', draftTeamId:'ericprister', boardSub:'Florida', sub:"Florida", accent:'#E51937', badgeStyle:'background:#E51937; color:#FFFFFF;', badgeText:'PAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/fla.png' },
  donny_capitals: { name:'Capitals', leagueKey:'nhl', draftTeamId:'donny', boardSub:'Washington', sub:"Washington", accent:'#D71830', badgeStyle:'background:#D71830; color:#FFFFFF;', badgeText:'CAP', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png', badgeUrlDark:'https://a.espncdn.com/i/teamlogos/nhl/500-dark/wsh.png' },
  isaac_sabres: { name:'Sabres', leagueKey:'nhl', draftTeamId:'isaac', boardSub:'Buffalo', sub:"Buffalo", accent:'#00468B', badgeStyle:'background:#00468B; color:#FDB71A;', badgeText:'SAB', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/buf.png' },
  drew_senators: { name:'Senators', leagueKey:'nhl', draftTeamId:'drew', boardSub:'Ottawa', sub:"Ottawa", accent:'#DD1A32', badgeStyle:'background:#DD1A32; color:#B79257;', badgeText:'SEN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/ott.png' },
  douglas_predators: { name:'Predators', leagueKey:'nhl', draftTeamId:'douglas', boardSub:'Nashville', sub:"Nashville", accent:'#FDBA31', badgeStyle:'background:#FDBA31; color:#002D62;', badgeText:'PRE', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/nsh.png' },
  collin_canadiens: { name:'Canadiens', leagueKey:'nhl', draftTeamId:'collin', boardSub:'Montreal', sub:"Montreal", accent:'#C41230', badgeStyle:'background:#C41230; color:#FFFFFF;', badgeText:'CAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/mtl.png' },
  erichylok_kraken: { name:'Kraken', leagueKey:'nhl', draftTeamId:'erichylok', boardSub:'Seattle', sub:"Seattle", accent:'#000D33', badgeStyle:'background:#000D33; color:#A3DCE4;', badgeText:'KRA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/sea.png' },
  patrick_sharks: { name:'Sharks', leagueKey:'nhl', draftTeamId:'patrick', boardSub:'San Jose', sub:"San Jose", accent:'#00788A', badgeStyle:'background:#00788A; color:#FFFFFF;', badgeText:'SHA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/sj.png' },
  peter_devils: { name:'Devils', leagueKey:'nhl', draftTeamId:'peter', boardSub:'New Jersey', sub:"New Jersey", accent:'#E30B2B', badgeStyle:'background:#E30B2B; color:#FFFFFF;', badgeText:'DEV', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/nj.png' },
  ericprister_avalanche: { name:'Avalanche', leagueKey:'nhl', draftTeamId:'ericprister', boardSub:'Colorado', sub:"Colorado", accent:'#860038', badgeStyle:'background:#860038; color:#FFFFFF;', badgeText:'AVA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/col.png' },
  donny_kings: { name:'Kings', leagueKey:'nhl', draftTeamId:'donny', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#121212', badgeStyle:'background:#121212; color:#A2AAAD;', badgeText:'KIN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/la.png' },
  isaac_bluejackets: { name:'Blue Jackets', leagueKey:'nhl', draftTeamId:'isaac', boardSub:'Columbus', sub:"Columbus", accent:'#002D62', badgeStyle:'background:#002D62; color:#E31937;', badgeText:'BJ', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/cbj.png' },
  drew_islanders: { name:'Islanders', leagueKey:'nhl', draftTeamId:'drew', boardSub:'New York', sub:"New York", accent:'#00529B', badgeStyle:'background:#00529B; color:#F47D31;', badgeText:'ISL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/nyi.png' },
  douglas_blues: { name:'Blues', leagueKey:'nhl', draftTeamId:'douglas', boardSub:'St. Louis', sub:"St. Louis", accent:'#0070B9', badgeStyle:'background:#0070B9; color:#FDB71A;', badgeText:'BLU', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/stl.png' },
  collin_mapleleafs: { name:'Maple Leafs', leagueKey:'nhl', draftTeamId:'collin', boardSub:'Toronto', sub:"Toronto", accent:'#003E7E', badgeStyle:'background:#003E7E; color:#FFFFFF;', badgeText:'ML', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/tor.png' },
  erichylok_canucks: { name:'Canucks', leagueKey:'nhl', draftTeamId:'erichylok', boardSub:'Vancouver', sub:"Vancouver", accent:'#003E7E', badgeStyle:'background:#003E7E; color:#008752;', badgeText:'CAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/van.png' },
  patrick_rangers: { name:'Rangers', leagueKey:'nhl', draftTeamId:'patrick', boardSub:'New York', sub:"New York", accent:'#0056AE', badgeStyle:'background:#0056AE; color:#E51937;', badgeText:'RAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png' },
  peter_bruins: { name:'Bruins', leagueKey:'nhl', draftTeamId:'peter', boardSub:'Boston', sub:"Boston", accent:'#231F20', badgeStyle:'background:#231F20; color:#FDB71A;', badgeText:'BRU', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/bos.png' },
  ericprister_wild: { name:'Wild', leagueKey:'nhl', draftTeamId:'ericprister', boardSub:'Minnesota', sub:"Minnesota", accent:'#124734', badgeStyle:'background:#124734; color:#FFFFFF;', badgeText:'WIL', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/min.png' },
  donny_penguins: { name:'Penguins', leagueKey:'nhl', draftTeamId:'donny', boardSub:'Pittsburgh', sub:"Pittsburgh", accent:'#000000', badgeStyle:'background:#000000; color:#FDB71A;', badgeText:'PEN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/nhl/500/pit.png' },
  isaac_yankees: { name:'Yankees', leagueKey:'mlb', draftTeamId:'isaac', boardSub:'New York', sub:"New York", accent:'#132448', badgeStyle:'background:#132448; color:#C4CED4;', badgeText:'YAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png', badgeUrlDark:'https://a.espncdn.com/i/teamlogos/mlb/500-dark/nyy.png' },
  drew_brewers: { name:'Brewers', leagueKey:'mlb', draftTeamId:'drew', boardSub:'Milwaukee', sub:"Milwaukee", accent:'#13294B', badgeStyle:'background:#13294B; color:#FFC72C;', badgeText:'BRE', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/mil.png' },
  douglas_bluejays: { name:'Blue Jays', leagueKey:'mlb', draftTeamId:'douglas', boardSub:'Toronto', sub:"Toronto", accent:'#134A8E', badgeStyle:'background:#134A8E; color:#FFFFFF;', badgeText:'BJ', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/tor.png' },
  collin_dodgers: { name:'Dodgers', leagueKey:'mlb', draftTeamId:'collin', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#005A9C', badgeStyle:'background:#005A9C; color:#FFFFFF;', badgeText:'DOD', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png' },
  erichylok_braves: { name:'Braves', leagueKey:'mlb', draftTeamId:'erichylok', boardSub:'Atlanta', sub:"Atlanta", accent:'#0C2340', badgeStyle:'background:#0C2340; color:#BA0C2F;', badgeText:'BRA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/atl.png' },
  patrick_twins: { name:'Twins', leagueKey:'mlb', draftTeamId:'patrick', boardSub:'Minnesota', sub:"Minnesota", accent:'#031F40', badgeStyle:'background:#031F40; color:#E20E32;', badgeText:'TWI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/min.png' },
  peter_orioles: { name:'Orioles', leagueKey:'mlb', draftTeamId:'peter', boardSub:'Baltimore', sub:"Baltimore", accent:'#DF4601', badgeStyle:'background:#DF4601; color:#000000;', badgeText:'ORI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/bal.png' },
  ericprister_rays: { name:'Rays', leagueKey:'mlb', draftTeamId:'ericprister', boardSub:'Tampa Bay', sub:"Tampa Bay", accent:'#092C5C', badgeStyle:'background:#092C5C; color:#8FBCE6;', badgeText:'RAY', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/tb.png' },
  donny_tigers: { name:'Tigers', leagueKey:'mlb', draftTeamId:'donny', boardSub:'Detroit', sub:"Detroit", accent:'#0A2240', badgeStyle:'background:#0A2240; color:#FF4713;', badgeText:'TIG', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/det.png' },
  isaac_guardians: { name:'Guardians', leagueKey:'mlb', draftTeamId:'isaac', boardSub:'Cleveland', sub:"Cleveland", accent:'#002B5C', badgeStyle:'background:#002B5C; color:#E31937;', badgeText:'GUA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/cle.png' },
  drew_whitesox: { name:'White Sox', leagueKey:'mlb', draftTeamId:'drew', boardSub:'Chicago', sub:"Chicago", accent:'#000000', badgeStyle:'background:#000000; color:#C4CED4;', badgeText:'WS', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/chw.png' },
  douglas_marlins: { name:'Marlins', leagueKey:'mlb', draftTeamId:'douglas', boardSub:'Miami', sub:"Miami", accent:'#00A3E0', badgeStyle:'background:#00A3E0; color:#000000;', badgeText:'MAR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/mia.png' },
  collin_redsox: { name:'Red Sox', leagueKey:'mlb', draftTeamId:'collin', boardSub:'Boston', sub:"Boston", accent:'#0D2B56', badgeStyle:'background:#0D2B56; color:#BD3039;', badgeText:'RS', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png' },
  erichylok_astros: { name:'Astros', leagueKey:'mlb', draftTeamId:'erichylok', boardSub:'Houston', sub:"Houston", accent:'#002D62', badgeStyle:'background:#002D62; color:#EB6E1F;', badgeText:'AST', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/hou.png' },
  patrick_athletics: { name:'Athletics', leagueKey:'mlb', draftTeamId:'patrick', boardSub:'Athletics', sub:"Athletics", accent:'#003831', badgeStyle:'background:#003831; color:#EFB21E;', badgeText:'ATH', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/ath.png' },
  peter_royals: { name:'Royals', leagueKey:'mlb', draftTeamId:'peter', boardSub:'Kansas City', sub:"Kansas City", accent:'#004687', badgeStyle:'background:#004687; color:#FFFFFF;', badgeText:'ROY', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/kc.png' },
  ericprister_diamondbacks: { name:'Diamondbacks', leagueKey:'mlb', draftTeamId:'ericprister', boardSub:'Arizona', sub:"Arizona", accent:'#AA182C', badgeStyle:'background:#AA182C; color:#FFFFFF;', badgeText:'DIA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/ari.png' },
  donny_mariners: { name:'Mariners', leagueKey:'mlb', draftTeamId:'donny', boardSub:'Seattle', sub:"Seattle", accent:'#005C5C', badgeStyle:'background:#005C5C; color:#FFFFFF;', badgeText:'MAR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/sea.png' },
  isaac_mets: { name:'Mets', leagueKey:'mlb', draftTeamId:'isaac', boardSub:'New York', sub:"New York", accent:'#002D72', badgeStyle:'background:#002D72; color:#FF5910;', badgeText:'MET', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/nym.png' },
  drew_rockies: { name:'Rockies', leagueKey:'mlb', draftTeamId:'drew', boardSub:'Colorado', sub:"Colorado", accent:'#33006F', badgeStyle:'background:#33006F; color:#FFFFFF;', badgeText:'ROC', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/col.png' },
  douglas_pirates: { name:'Pirates', leagueKey:'mlb', draftTeamId:'douglas', boardSub:'Pittsburgh', sub:"Pittsburgh", accent:'#000000', badgeStyle:'background:#000000; color:#FDB827;', badgeText:'PIR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/pit.png' },
  collin_phillies: { name:'Phillies', leagueKey:'mlb', draftTeamId:'collin', boardSub:'Philadelphia', sub:"Philadelphia", accent:'#E81828', badgeStyle:'background:#E81828; color:#FFFFFF;', badgeText:'PHI', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/phi.png' },
  erichylok_rangers: { name:'Rangers', leagueKey:'mlb', draftTeamId:'erichylok', boardSub:'Texas', sub:"Texas", accent:'#003278', badgeStyle:'background:#003278; color:#C0111F;', badgeText:'RAN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/tex.png' },
  patrick_reds: { name:'Reds', leagueKey:'mlb', draftTeamId:'patrick', boardSub:'Cincinnati', sub:"Cincinnati", accent:'#C6011F', badgeStyle:'background:#C6011F; color:#FFFFFF;', badgeText:'RED', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/cin.png' },
  peter_angels: { name:'Angels', leagueKey:'mlb', draftTeamId:'peter', boardSub:'Los Angeles', sub:"Los Angeles", accent:'#BA0021', badgeStyle:'background:#BA0021; color:#C4CED4;', badgeText:'ANG', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/laa.png' },
  ericprister_cardinals: { name:'Cardinals', leagueKey:'mlb', draftTeamId:'ericprister', boardSub:'St. Louis', sub:"St. Louis", accent:'#BE0A14', badgeStyle:'background:#BE0A14; color:#FFFFFF;', badgeText:'CAR', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/stl.png' },
  donny_giants: { name:'Giants', leagueKey:'mlb', draftTeamId:'donny', boardSub:'San Francisco', sub:"San Francisco", accent:'#000000', badgeStyle:'background:#000000; color:#FD5A1E;', badgeText:'GIA', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/sf.png' },
  isaac_mercury: { name:'Mercury', leagueKey:'wnba', draftTeamId:'isaac', boardSub:'Phoenix', sub:"Phoenix", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'MER', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/phx.png' },
  drew_sky: { name:'Sky', leagueKey:'wnba', draftTeamId:'drew', boardSub:'Chicago', sub:"Chicago", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'SKY', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/chi.png' },
  douglas_lynx: { name:'Lynx', leagueKey:'wnba', draftTeamId:'douglas', boardSub:'Minnesota', sub:"Minnesota", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'LYN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/min.png' },
  collin_dream: { name:'Dream', leagueKey:'wnba', draftTeamId:'collin', boardSub:'Atlanta', sub:"Atlanta", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'DRE', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/atl.png' },
  erichylok_liberty: { name:'Liberty', leagueKey:'wnba', draftTeamId:'erichylok', boardSub:'New York', sub:"New York", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'LIB', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/ny.png' },
  patrick_wings: { name:'Wings', leagueKey:'wnba', draftTeamId:'patrick', boardSub:'Dallas', sub:"Dallas", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'WIN', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/dal.png' },
  peter_aces: { name:'Aces', leagueKey:'wnba', draftTeamId:'peter', boardSub:'Las Vegas', sub:"Las Vegas", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'ACE', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png' },
  ericprister_mystics: { name:'Mystics', leagueKey:'wnba', draftTeamId:'ericprister', boardSub:'Washington', sub:"Washington", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'MYS', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/wsh.png' },
  donny_fever: { name:'Fever', leagueKey:'wnba', draftTeamId:'donny', boardSub:'Indiana', sub:"Indiana", accent:'#FF6900', badgeStyle:'background:#FF6900; color:#FFFFFF;', badgeText:'FEV', sportsdbId:null, badgeUrl:'https://a.espncdn.com/i/teamlogos/wnba/500/ind.png' },
  isaac_ohiostate: { name:'Ohio State', leagueKey:'cfb', draftTeamId:'isaac', boardSub:'Buckeyes', sub:"Buckeyes", accent:'#BB0000', badgeStyle:'background:#BB0000; color:#666666;', badgeText:'OSU', sportsdbId:'136934', recentLabel:'Results So Far', rundownTeamId:194, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/egfzq81564336508.png' },
  drew_georgia: { name:'Georgia', leagueKey:'cfb', draftTeamId:'drew', boardSub:'Bulldogs', sub:"Bulldogs", accent:'#BA0C2F', badgeStyle:'background:#BA0C2F; color:#000000;', badgeText:'UGA', sportsdbId:'137104', recentLabel:'Results So Far', rundownTeamId:153, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/so7nct1641185101.png' },
  douglas_miami: { name:'Miami', leagueKey:'cfb', draftTeamId:'douglas', boardSub:'Hurricanes', sub:"Hurricanes", accent:'#F47321', badgeStyle:'background:#F47321; color:#005030;', badgeText:'MIA', sportsdbId:'136913', recentLabel:'Results So Far', rundownTeamId:174, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/0kqdcr1564336226.png' },
  collin_washington: { name:'Washington', leagueKey:'cfb', draftTeamId:'collin', boardSub:'Huskies', sub:"Huskies", accent:'#4B2E83', badgeStyle:'background:#4B2E83; color:#B7A57A;', badgeText:'WASH', sportsdbId:'136974', recentLabel:'Results So Far', rundownTeamId:235, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/9smu951564337111.png' },
  erichylok_usc: { name:'USC', leagueKey:'cfb', draftTeamId:'erichylok', boardSub:'Trojans', sub:"Trojans", accent:'#990000', badgeStyle:'background:#990000; color:#FFC72C;', badgeText:'USC', sportsdbId:'136950', recentLabel:'Results So Far', rundownTeamId:209, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/4403h51564337013.png' },
  patrick_liberty: { name:'Liberty', leagueKey:'cfb', draftTeamId:'patrick', boardSub:'Flames', sub:"Flames", accent:'#C41230', badgeStyle:'background:#C41230; color:#041E42;', badgeText:'LIB', sportsdbId:'136904', recentLabel:'Results So Far', rundownTeamId:382, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/z26guc1564336125.png' },
  peter_texas: { name:'Texas', leagueKey:'cfb', draftTeamId:'peter', boardSub:'Longhorns', sub:"Longhorns", accent:'#BF5700', badgeStyle:'background:#BF5700; color:#FFFFFF;', badgeText:'TEX', sportsdbId:'136958', recentLabel:'Results So Far', rundownTeamId:217, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/jjyr0y1564336795.png' },
  ericprister_oklahoma: { name:'Oklahoma', leagueKey:'cfb', draftTeamId:'ericprister', boardSub:'Sooners', sub:"Sooners", accent:'#841617', badgeStyle:'background:#841617; color:#FDF9D8;', badgeText:'OU', sportsdbId:'136935', recentLabel:'Results So Far', rundownTeamId:195, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/pfm7mq1564336521.png' },
  donny_texastech: { name:'Texas Tech', leagueKey:'cfb', draftTeamId:'donny', boardSub:'Red Raiders', sub:"Red Raiders", accent:'#CC0000', badgeStyle:'background:#CC0000; color:#000000;', badgeText:'TTU', sportsdbId:'136961', recentLabel:'Results So Far', rundownTeamId:219, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/vksj451564336834.png' },
  isaac_notredame: { name:'Notre Dame', leagueKey:'cfb', draftTeamId:'isaac', boardSub:'Fighting Irish', sub:"Fighting Irish", accent:'#0C2340', badgeStyle:'background:#0C2340; color:#C99700;', badgeText:'ND', sportsdbId:'136246', recentLabel:'Results So Far', rundownTeamId:192, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/w0jd2o1564336487.png' },
  drew_pennstate: { name:'Penn State', leagueKey:'cfb', draftTeamId:'drew', boardSub:'Nittany Lions', sub:"Nittany Lions", accent:'#041E42', badgeStyle:'background:#041E42; color:#FFFFFF;', badgeText:'PSU', sportsdbId:'136940', recentLabel:'Results So Far', rundownTeamId:200, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/q1t6wc1568478893.png' },
  douglas_lsu: { name:'LSU', leagueKey:'cfb', draftTeamId:'douglas', boardSub:'Tigers', sub:"Tigers", accent:'#461D7C', badgeStyle:'background:#461D7C; color:#FDD023;', badgeText:'LSU', sportsdbId:'136905', recentLabel:'Results So Far', rundownTeamId:170, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/jcj91i1564336177.png' },
  collin_toledo: { name:'Toledo', leagueKey:'cfb', draftTeamId:'collin', boardSub:'Rockets', sub:"Rockets", accent:'#00256C', badgeStyle:'background:#00256C; color:#FFCC00;', badgeText:'TOL', sportsdbId:'136964', recentLabel:'Results So Far', rundownTeamId:220, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/op6auv1564336847.png' },
  erichylok_smu: { name:'SMU', leagueKey:'cfb', draftTeamId:'erichylok', boardSub:'Mustangs', sub:"Mustangs", accent:'#C8102E', badgeStyle:'background:#C8102E; color:#0033A0;', badgeText:'SMU', sportsdbId:'136951', recentLabel:'Results So Far', rundownTeamId:210, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/csw4ek1564336678.png' },
  patrick_westernmichigan: { name:'Western Michigan', leagueKey:'cfb', draftTeamId:'patrick', boardSub:'Broncos', sub:"Broncos", accent:'#532E1F', badgeStyle:'background:#532E1F; color:#FFC72C;', badgeText:'WMU', sportsdbId:'136978', recentLabel:'Results So Far', rundownTeamId:239, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/4nmakk1641186437.png' },
  peter_iu: { name:'IU', leagueKey:'cfb', draftTeamId:'peter', boardSub:'Hoosiers', sub:"Hoosiers", accent:'#990000', badgeStyle:'background:#990000; color:#EEEDEB;', badgeText:'IU', sportsdbId:'136897', recentLabel:'Results So Far', rundownTeamId:159, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/pwcsog1564336028.png' },
  ericprister_jamesmadison: { name:'James Madison', leagueKey:'cfb', draftTeamId:'ericprister', boardSub:'Dukes', sub:"Dukes", accent:'#450084', badgeStyle:'background:#450084; color:#CBB677;', badgeText:'JMU', sportsdbId:'137034', recentLabel:'Results So Far', rundownTeamId:494, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/fdqmd11564356998.png' },
  donny_newmexico: { name:'New Mexico', leagueKey:'cfb', draftTeamId:'donny', boardSub:'Lobos', sub:"Lobos", accent:'#BA0C2F', badgeStyle:'background:#BA0C2F; color:#A7A8AA;', badgeText:'UNM', sportsdbId:'136926', recentLabel:'Results So Far', rundownTeamId:185, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/dpo6hf1564336363.png' },
  isaac_boisestate: { name:'Boise State', leagueKey:'cfb', draftTeamId:'isaac', boardSub:'Broncos', sub:"Broncos", accent:'#0033A0', badgeStyle:'background:#0033A0; color:#D64309;', badgeText:'BSU', sportsdbId:'136867', recentLabel:'Results So Far', rundownTeamId:133, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/xoc6qn1564335585.png' },
  drew_ndsu: { name:'NDSU', leagueKey:'cfb', draftTeamId:'drew', boardSub:'Bison', sub:"Bison", accent:'#0A5C36', badgeStyle:'background:#0A5C36; color:#FFCB05;', badgeText:'NDSU', sportsdbId:'137056', recentLabel:'Results So Far', rundownTeamId:380, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/35rm031564357382.png' },
  douglas_houston: { name:'Houston', leagueKey:'cfb', draftTeamId:'douglas', boardSub:'Cougars', sub:"Cougars", accent:'#C8102E', badgeStyle:'background:#C8102E; color:#FFFFFF;', badgeText:'HOU', sportsdbId:'136895', recentLabel:'Results So Far', rundownTeamId:156, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/xznb791564335987.png' },
  collin_olemiss: { name:'Ole Miss', leagueKey:'cfb', draftTeamId:'collin', boardSub:'Rebels', sub:"Rebels", accent:'#14213D', badgeStyle:'background:#14213D; color:#CE1126;', badgeText:'OM', sportsdbId:'136919', recentLabel:'Results So Far', rundownTeamId:197, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/l74mp21564336550.png' },
  erichylok_byu: { name:'BYU', leagueKey:'cfb', draftTeamId:'erichylok', boardSub:'Cougars', sub:"Cougars", accent:'#002E5D', badgeStyle:'background:#002E5D; color:#FFFFFF;', badgeText:'BYU', sportsdbId:'136871', recentLabel:'Results So Far', rundownTeamId:447, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/ypg2cw1641184997.png' },
  patrick_navy: { name:'Navy', leagueKey:'cfb', draftTeamId:'patrick', boardSub:'Midshipmen', sub:"Midshipmen", accent:'#00205B', badgeStyle:'background:#00205B; color:#B58500;', badgeText:'NAVY', sportsdbId:'136922', recentLabel:'Results So Far', rundownTeamId:182, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/y9dlzu1564336318.png' },
  peter_virginia: { name:'Virginia', leagueKey:'cfb', draftTeamId:'peter', boardSub:'Cavaliers', sub:"Cavaliers", accent:'#232D4B', badgeStyle:'background:#232D4B; color:#E57200;', badgeText:'UVA', sportsdbId:'136971', recentLabel:'Results So Far', rundownTeamId:232, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/2cvvb01641184446.png' },
  ericprister_memphis: { name:'Memphis', leagueKey:'cfb', draftTeamId:'ericprister', boardSub:'Tigers', sub:"Tigers", accent:'#003087', badgeStyle:'background:#003087; color:#898D8D;', badgeText:'MEM', sportsdbId:'136912', recentLabel:'Results So Far', rundownTeamId:173, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/wvucol1564336213.png' },
  donny_louisville: { name:'Louisville', leagueKey:'cfb', draftTeamId:'donny', boardSub:'Cardinals', sub:"Cardinals", accent:'#AD0000', badgeStyle:'background:#AD0000; color:#000000;', badgeText:'LOU', sportsdbId:'136908', recentLabel:'Results So Far', rundownTeamId:169, badgeUrl:'https://r2.thesportsdb.com/images/media/team/badge/eb6qjl1564336166.png' },
  isaac_uconn: { name:'UConn', leagueKey:'mcbb', draftTeamId:'isaac', boardSub:'Huskies', sub:"Huskies", accent:'#0C2340', badgeStyle:'background:#0C2340; color:#A2AAAD;', badgeText:'UCO', sportsdbId:null, espnTeamId:'41', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/41.png' },
  drew_michigan: { name:'Michigan', leagueKey:'mcbb', draftTeamId:'drew', boardSub:'Wolverines', sub:"Wolverines", accent:'#00274C', badgeStyle:'background:#00274C; color:#FFCB05;', badgeText:'MIC', sportsdbId:null, espnTeamId:'130', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png' },
  douglas_duke: { name:'Duke', leagueKey:'mcbb', draftTeamId:'douglas', boardSub:'Blue Devils', sub:"Blue Devils", accent:'#00539B', badgeStyle:'background:#00539B; color:#FFFFFF;', badgeText:'DUK', sportsdbId:null, espnTeamId:'150', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/150.png' },
  collin_arizona: { name:'Arizona', leagueKey:'mcbb', draftTeamId:'collin', boardSub:'Wildcats', sub:"Wildcats", accent:'#CC0033', badgeStyle:'background:#CC0033; color:#FFFFFF;', badgeText:'ARI', sportsdbId:null, espnTeamId:'12', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/12.png' },
  erichylok_kansas: { name:'Kansas', leagueKey:'mcbb', draftTeamId:'erichylok', boardSub:'Jayhawks', sub:"Jayhawks", accent:'#0051BA', badgeStyle:'background:#0051BA; color:#E8000D;', badgeText:'KAN', sportsdbId:null, espnTeamId:'2305', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2305.png' },
  patrick_illinois: { name:'Illinois', leagueKey:'mcbb', draftTeamId:'patrick', boardSub:'Fighting Illini', sub:"Fighting Illini", accent:'#FF5F05', badgeStyle:'background:#FF5F05; color:#13294B;', badgeText:'ILL', sportsdbId:null, espnTeamId:'356', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/356.png' },
  peter_michstate: { name:'Mich State', leagueKey:'mcbb', draftTeamId:'peter', boardSub:'Spartans', sub:"Spartans", accent:'#173F35', badgeStyle:'background:#173F35; color:#FFFFFF;', badgeText:'MS', sportsdbId:null, espnTeamId:'127', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/127.png' },
  ericprister_iowastate: { name:'Iowa State', leagueKey:'mcbb', draftTeamId:'ericprister', boardSub:'Cyclones', sub:"Cyclones", accent:'#AE192D', badgeStyle:'background:#AE192D; color:#FFC72A;', badgeText:'IS', sportsdbId:null, espnTeamId:'66', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/66.png' },
  donny_florida: { name:'Florida', leagueKey:'mcbb', draftTeamId:'donny', boardSub:'Gators', sub:"Gators", accent:'#0021A5', badgeStyle:'background:#0021A5; color:#FA4616;', badgeText:'FLO', sportsdbId:null, espnTeamId:'57', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/57.png' },
  isaac_tennessee: { name:'Tennessee', leagueKey:'mcbb', draftTeamId:'isaac', boardSub:'Volunteers', sub:"Volunteers", accent:'#FF8200', badgeStyle:'background:#FF8200; color:#FFFFFF;', badgeText:'TEN', sportsdbId:null, espnTeamId:'2633', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2633.png' },
  drew_alabama: { name:'Alabama', leagueKey:'mcbb', draftTeamId:'drew', boardSub:'Crimson Tide', sub:"Crimson Tide", accent:'#9E1B32', badgeStyle:'background:#9E1B32; color:#FFFFFF;', badgeText:'ALA', sportsdbId:null, espnTeamId:'333', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png' },
  douglas_texas: { name:'Texas', leagueKey:'mcbb', draftTeamId:'douglas', boardSub:'Longhorns', sub:"Longhorns", accent:'#AF5C37', badgeStyle:'background:#AF5C37; color:#FFFFFF;', badgeText:'TEX', sportsdbId:null, espnTeamId:'251', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png' },
  collin_stjohns: { name:'St Johns', leagueKey:'mcbb', draftTeamId:'collin', boardSub:'Red Storm', sub:"Red Storm", accent:'#D10000', badgeStyle:'background:#D10000; color:#FFFFFF;', badgeText:'SJ', sportsdbId:null, espnTeamId:'2599', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2599.png' },
  erichylok_virginia: { name:'Virginia', leagueKey:'mcbb', draftTeamId:'erichylok', boardSub:'Cavaliers', sub:"Cavaliers", accent:'#232D4B', badgeStyle:'background:#232D4B; color:#F84C1E;', badgeText:'VIR', sportsdbId:null, espnTeamId:'258', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/258.png' },
  patrick_kentucky: { name:'Kentucky', leagueKey:'mcbb', draftTeamId:'patrick', boardSub:'Wildcats', sub:"Wildcats", accent:'#0033A0', badgeStyle:'background:#0033A0; color:#FFFFFF;', badgeText:'KEN', sportsdbId:null, espnTeamId:'96', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/96.png' },
  peter_arkansas: { name:'Arkansas', leagueKey:'mcbb', draftTeamId:'peter', boardSub:'Razorbacks', sub:"Razorbacks", accent:'#A32136', badgeStyle:'background:#A32136; color:#FFFFFF;', badgeText:'ARK', sportsdbId:null, espnTeamId:'8', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/8.png' },
  ericprister_vanderbilt: { name:'Vanderbilt', leagueKey:'mcbb', draftTeamId:'ericprister', boardSub:'Commodores', sub:"Commodores", accent:'#000000', badgeStyle:'background:#000000; color:#CFAE70;', badgeText:'VAN', sportsdbId:null, espnTeamId:'238', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/238.png' },
  donny_saintmarys: { name:'Saint Mary\'s', leagueKey:'mcbb', draftTeamId:'donny', boardSub:'Gaels', sub:"Gaels", accent:'#D80024', badgeStyle:'background:#D80024; color:#FFFFFF;', badgeText:'SMS', sportsdbId:null, espnTeamId:'2608', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2608.png' },
  isaac_miami: { name:'Miami', leagueKey:'mcbb', draftTeamId:'isaac', boardSub:'Hurricanes', sub:"Hurricanes", accent:'#F47423', badgeStyle:'background:#F47423; color:#035131;', badgeText:'MIA', sportsdbId:null, espnTeamId:'2390', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png' },
  drew_gonzaga: { name:'Gonzaga', leagueKey:'mcbb', draftTeamId:'drew', boardSub:'Bulldogs', sub:"Bulldogs", accent:'#041E42', badgeStyle:'background:#041E42; color:#C8102E;', badgeText:'GON', sportsdbId:null, espnTeamId:'2250', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2250.png' },
  douglas_texastech: { name:'Texas Tech', leagueKey:'mcbb', draftTeamId:'douglas', boardSub:'Red Raiders', sub:"Red Raiders", accent:'#000000', badgeStyle:'background:#000000; color:#DA291C;', badgeText:'TT', sportsdbId:null, espnTeamId:'2641', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2641.png' },
  collin_northcarolina: { name:'North Carolina', leagueKey:'mcbb', draftTeamId:'collin', boardSub:'Tar Heels', sub:"Tar Heels", accent:'#7BAFD4', badgeStyle:'background:#7BAFD4; color:#13294B;', badgeText:'NC', sportsdbId:null, espnTeamId:'153', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/153.png' },
  erichylok_nebraska: { name:'Nebraska', leagueKey:'mcbb', draftTeamId:'erichylok', boardSub:'Cornhuskers', sub:"Cornhuskers", accent:'#E31937', badgeStyle:'background:#E31937; color:#FFFFFF;', badgeText:'NEB', sportsdbId:null, espnTeamId:'158', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/158.png' },
  patrick_ndsu: { name:'NDSU', leagueKey:'mcbb', draftTeamId:'patrick', boardSub:'Bison', sub:"Bison", accent:'#01402A', badgeStyle:'background:#01402A; color:#FFFFFF;', badgeText:'NDS', sportsdbId:null, espnTeamId:'2449', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/2449.png' },
  peter_slu: { name:'SLU', leagueKey:'mcbb', draftTeamId:'peter', boardSub:'Billikens', sub:"Billikens", accent:'#00539C', badgeStyle:'background:#00539C; color:#EBEBEB;', badgeText:'SLU', sportsdbId:null, espnTeamId:'139', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/139.png' },
  ericprister_georgia: { name:'Georgia', leagueKey:'mcbb', draftTeamId:'ericprister', boardSub:'Bulldogs', sub:"Bulldogs", accent:'#BA0C2F', badgeStyle:'background:#BA0C2F; color:#FFFFFF;', badgeText:'GEO', sportsdbId:null, espnTeamId:'61', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png' },
  donny_louisville_cbb: { name:'Louisville', leagueKey:'mcbb', draftTeamId:'donny', boardSub:'Cardinals', sub:"Cardinals", accent:'#C9001F', badgeStyle:'background:#C9001F; color:#FFFFFF;', badgeText:'LOU', sportsdbId:null, espnTeamId:'97', badgeUrl:'https://a.espncdn.com/i/teamlogos/ncaa/500/97.png' }
};

// Board order: which teams appear under each league tab (across all
// drafters — filtered down to one drafter's roster at render time),
// and the season label shown next to the league name.
export const LEAGUES = [
  { key:'epl', label:'EPL', season:"'26/'27 Season", teams:['isaac_arsenal', 'drew_mancity', 'douglas_everton', 'collin_chelsea', 'erichylok_astonvilla', 'liverpool', 'patrick_manunited', 'peter_tottenhamhotspur', 'ericprister_crystalpalace', 'donny_brentford', 'isaac_ipswichtown', 'drew_hullcity', 'douglas_fulham', 'collin_leedsunited', 'erichylok_nottingham', 'newcastle', 'patrick_brighton', 'peter_afcbournemouth', 'ericprister_sunderland', 'donny_coventrycity'] },
  { key:'cfb', label:'College FB', season:"'26 Season", teams:['isaac_ohiostate', 'drew_georgia', 'douglas_miami', 'collin_washington', 'erichylok_usc', 'oregon', 'patrick_liberty', 'peter_texas', 'ericprister_oklahoma', 'donny_texastech', 'isaac_notredame', 'drew_pennstate', 'douglas_lsu', 'collin_toledo', 'erichylok_smu', 'texasam', 'patrick_westernmichigan', 'peter_iu', 'ericprister_jamesmadison', 'donny_newmexico', 'isaac_boisestate', 'drew_ndsu', 'douglas_houston', 'collin_olemiss', 'erichylok_byu', 'arizona', 'patrick_navy', 'peter_virginia', 'ericprister_memphis', 'donny_louisville', 'oklahomastate'] },
  { key:'nfl', label:'NFL', season:"'26 Season", teams:['isaac_eagles', 'drew_chiefs', 'douglas_texans', 'collin_seahawks', 'erichylok_49ers', 'lions', 'patrick_ravens', 'peter_broncos', 'ericprister_rams', 'donny_bucs', 'isaac_patriots', 'drew_bengals', 'douglas_falcons', 'collin_giants', 'erichylok_packers', 'steelers', 'patrick_colts', 'peter_jaguars', 'ericprister_bills', 'donny_vikings', 'isaac_titans', 'drew_bears', 'douglas_commanders', 'collin_raiders', 'erichylok_cowboys', 'dolphins', 'patrick_saints', 'peter_panthers', 'ericprister_chargers', 'donny_jets'] },
  { key:'mlb', label:'MLB', season:"'27 Season", teams:['isaac_yankees', 'drew_brewers', 'douglas_bluejays', 'collin_dodgers', 'erichylok_braves', 'cubs', 'patrick_twins', 'peter_orioles', 'ericprister_rays', 'donny_tigers', 'isaac_guardians', 'drew_whitesox', 'douglas_marlins', 'collin_redsox', 'erichylok_astros', 'padres', 'patrick_athletics', 'peter_royals', 'ericprister_diamondbacks', 'donny_mariners', 'isaac_mets', 'drew_rockies', 'douglas_pirates', 'collin_phillies', 'erichylok_rangers', 'nationals', 'patrick_reds', 'peter_angels', 'ericprister_cardinals', 'donny_giants'] },
  { key:'wnba', label:'WNBA', season:"'27 Season", teams:['isaac_mercury', 'drew_sky', 'douglas_lynx', 'collin_dream', 'erichylok_liberty', 'valkyries', 'patrick_wings', 'peter_aces', 'ericprister_mystics', 'donny_fever'] },
  { key:'nba', label:'NBA', season:"'26/'27 Season", teams:['isaac_raptors', 'drew_knicks', 'douglas_76ers', 'collin_blazers', 'erichylok_celtics', 'cavaliers', 'patrick_spurs', 'peter_pacers', 'ericprister_hawks', 'donny_thunder', 'isaac_bulls', 'drew_warriors', 'douglas_rockets', 'collin_nets', 'erichylok_timberwolves', 'nuggets', 'patrick_heat', 'peter_jazz', 'ericprister_clippers', 'donny_pistons', 'isaac_pelicans', 'drew_bucks', 'douglas_hornets', 'collin_kings', 'erichylok_suns', 'mavericks', 'patrick_magic', 'peter_wizards', 'ericprister_grizzlies', 'donny_lakers'] },
  { key:'nhl', label:'NHL', season:"'26/'27 Season", teams:['isaac_ducks', 'drew_stars', 'douglas_mammoth', 'collin_hurricanes', 'erichylok_jets', 'lightning', 'patrick_oilers', 'peter_goldenknights', 'ericprister_panthers', 'donny_capitals', 'isaac_sabres', 'drew_senators', 'douglas_predators', 'collin_canadiens', 'erichylok_kraken', 'flyers', 'patrick_sharks', 'peter_devils', 'ericprister_avalanche', 'donny_kings', 'isaac_bluejackets', 'drew_islanders', 'douglas_blues', 'collin_mapleleafs', 'erichylok_canucks', 'redwings', 'patrick_rangers', 'peter_bruins', 'ericprister_wild', 'donny_penguins'] },
  { key:'mcbb', label:'College BB', season:"'26/'27 Season", teams:['isaac_uconn', 'drew_michigan', 'douglas_duke', 'collin_arizona', 'erichylok_kansas', 'houston', 'patrick_illinois', 'peter_michstate', 'ericprister_iowastate', 'donny_florida', 'isaac_tennessee', 'drew_alabama', 'douglas_texas', 'collin_stjohns', 'erichylok_virginia', 'purdue', 'patrick_kentucky', 'peter_arkansas', 'ericprister_vanderbilt', 'donny_saintmarys', 'isaac_miami', 'drew_gonzaga', 'douglas_texastech', 'collin_northcarolina', 'erichylok_nebraska', 'utahstate', 'patrick_ndsu', 'peter_slu', 'ericprister_georgia', 'donny_louisville_cbb', 'oklahomastate_cbb'] }
];

// MLB and WNBA drafted teams score starting with the '27 season (see
// their LEAGUES season labels above — "'27 Season" only, not "'26/'27"
// like EPL/NBA/NHL/mcbb) — but ESPN's live standings/schedule
// endpoints always return whatever season is actually being played
// right now, which today is still each league's '26 season. Until
// each league's '27 season actually starts, the Standings tab and
// team modal are showing real '26 results that don't count toward the
// draft — flagged here so js/board.js and js/live-data.js can both
// surface the same heads-up instead of drifting out of sync.
export const PRIOR_SEASON_DISPLAY_LEAGUES = ['mlb', 'wnba'];

export const LEAGUE_SCORING = {
  // rankAuto rules are derived automatically from live ESPN data rather
  // than marked by hand (see getLeagueRuleTeams in js/league-facts.js).
  // Two shapes:
  //  - A placement rule reads a live standings table. `scope` picks
  //    which table to rank within — 'league' (the default, one flat
  //    table — EPL/WNBA), 'conference', or 'division' (NFL/NBA/NHL/MLB,
  //    ranked separately within EACH conference/division rather than
  //    across the whole league). Exactly one of `rank` (an exact
  //    placement, e.g. `rank: 1` for a title), `top` (placement <= N,
  //    e.g. WNBA's top-two), or `bottom` (the worst N, e.g. relegation)
  //    selects which end of the table matches.
  //  - `clinched: true` ("Make the playoffs") reads ESPN's own real-world
  //    playoff-clinch determination instead of a table position — see
  //    the `clincherDescription` comment in js/espn.js for why this
  //    can't be inferred from a rank/seed number. Confirmed live only for
  //    WNBA/MLB so far (both late-season now); NFL/NBA/NHL carry no
  //    clincher data this early in their season, so this rule just stays
  //    "Pending" there until something actually clinches — re-verify
  //    against a live payload once one does, same as every other ESPN
  //    field in this app.
  // Every rankAuto rule resolves to nothing for MLB/WNBA while they're
  // still in PRIOR_SEASON_DISPLAY_LEAGUES (js/league-facts.js gates
  // this explicitly) — their live standings right now are last season's,
  // and an automated rule has no admin in the loop to catch that the way
  // a manual mark does.
  // exclusive rules can only ever be true for one team at a time —
  // marking a new team for them replaces whoever was marked before.
  epl: {
    name: 'EPL',
    full: 'Premier League Scoring',
    accent: '#3D195B',
    rules: [
      { label: 'Win League Cup', pts: 1, exclusive: true },
      { label: 'Win FA Cup', pts: 2, exclusive: true },
      { label: 'Make Europa League', pts: 3 },
      { label: 'Make Champions League (any stage)', pts: 4 },
      { label: '3rd in EPL', pts: 3, rankAuto: { rank: 3 } },
      { label: '2nd in EPL', pts: 6, rankAuto: { rank: 2 } },
      { label: 'Win EPL', pts: 9, rankAuto: { rank: 1 } },
      { label: 'Relegation', pts: -5, rankAuto: { bottom: 3 } }
    ],
    bonus: { label: 'Highest combined EPL point total', pts: 5 }
  },
  nfl: {
    name: 'NFL',
    full: 'NFL Scoring',
    accent: '#013369',
    rules: [
      { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
      { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
      { label: 'Best record in conference', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
      { label: 'Make conference championship', pts: 2 },
      { label: 'Make Super Bowl', pts: 3 },
      { label: 'Win Super Bowl', pts: 5 },
      { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
      { label: 'Worst record in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  nba: {
    name: 'NBA',
    full: 'NBA Scoring',
    accent: '#C9082A',
    rules: [
      { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
      { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
      { label: 'Best record in conference', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
      { label: 'Make conference finals', pts: 2 },
      { label: 'Make Finals', pts: 3 },
      { label: 'Win Finals', pts: 5 },
      { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
      { label: 'Worst record in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  nhl: {
    name: 'NHL',
    full: 'NHL Scoring',
    accent: '#111111',
    rules: [
      { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
      { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
      { label: 'Best record in conference', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
      { label: 'Make conference finals', pts: 2 },
      { label: 'Make Stanley Cup Finals', pts: 3 },
      { label: 'Win Stanley Cup Finals', pts: 5 },
      { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
      { label: 'Worst record in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  mlb: {
    name: 'MLB',
    full: 'MLB Scoring',
    accent: '#041E42',
    rules: [
      { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
      { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
      // "league" here means AL/NL — ESPN's own standings group these
      // under the generic `conference` field (see fetchEspnMlbStandings
      // in js/espn.js), same as every other sport's real conference, so
      // scope stays 'conference' even though the rule label says "league".
      { label: 'Best record in league', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
      { label: 'Make LCS', pts: 2 },
      { label: 'Make World Series', pts: 3 },
      { label: 'Win World Series', pts: 5 },
      { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
      { label: 'Worst record in league', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  wnba: {
    name: 'WNBA',
    full: 'WNBA Scoring',
    accent: '#FF6900',
    rules: [
      { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
      { label: 'Top-two regular-season record', pts: 2, rankAuto: { top: 2 } },
      { label: 'Reach Commissioner’s Cup Final', pts: 1 },
      { label: 'Win Commissioner’s Cup', pts: 2 },
      { label: 'Reach the semifinals', pts: 2 },
      { label: 'Reach the Finals', pts: 3 },
      { label: 'Win the Finals', pts: 5 },
      { label: 'Missing the playoffs', pts: -3 },
      { label: 'Bottom-three record', pts: -2, rankAuto: { bottom: 3 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  cfb: {
    name: 'College FB',
    full: 'College Football Scoring',
    accent: '#013220',
    rules: [
      { label: 'Make a bowl game', pts: 1 },
      { label: 'Win a bowl game', pts: 1 },
      { label: 'Win conference', pts: 2 },
      { label: 'Make the CFP', pts: 2 },
      { label: 'Make the CFP semifinal', pts: 2 },
      { label: 'Make National Championship', pts: 3 },
      { label: 'Win National Championship', pts: 5 },
      { label: 'Don’t make a bowl', pts: -2 },
      { label: 'Finish last in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  },
  mcbb: {
    name: 'College BB',
    full: 'College Basketball Scoring',
    accent: '#CC5500',
    rules: [
      { label: 'Make NCAA Tournament', pts: 1 },
      { label: 'Win conference tournament', pts: 2 },
      { label: 'Win conference regular season', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
      { label: 'Make Elite Eight', pts: 2 },
      { label: 'Make National Championship game', pts: 3 },
      { label: 'Win National Championship', pts: 5 },
      { label: 'Don’t make NCAA tournament', pts: -2 },
      { label: 'Finish last in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
    ],
    bonus: { label: 'Best combined win %', pts: 5 }
  }
};
