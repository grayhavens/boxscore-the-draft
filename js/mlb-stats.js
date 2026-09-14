/* ============================================================
   MLB STATS API (statsapi.mlb.com) — MLB-only, layered alongside the
   ESPN hidden API (js/espn.js) that backs every other league's Game
   Details. Confirmed live (2026-09-13): open CORS
   (access-control-allow-origin: *), no key, fetched straight from the
   browser same as ESPN.

   Why this exists when ESPN already backs MLB's Game Details: ESPN's
   `videos[]` (see parseEspnGameMedia in js/espn.js) is a loose "game
   videos" reel with no reliable way to attach a specific clip to a
   specific play. This API can: the live play-by-play feed's per-play
   `playEvents[].playId` (a GUID) is the EXACT SAME value as the
   matching video clip's own `guid` on the content/highlights endpoint
   — confirmed live against a real completed game (Tigers 8, Rockies 1,
   gamePk 824225): all 7 of 7 scoring plays matched a clip by that GUID,
   no fuzzy text-matching needed.

   fetchMlbGameExtras below is the one call Game Details makes for all
   of it: up to 3 scoring plays MLB's own `captivatingIndex` ranks
   highest (each with its own dedicated clip), plus the classic W/L/SV
   decision line and a venue/attendance/duration line — both confirmed
   live to already be sitting on the exact same `/feed/live` response
   the play-matching needs anyway (`liveData.decisions` and
   `gameData.gameInfo`/`gameData.venue`), so neither costs a request of
   its own.
   ============================================================ */

const MLB_STATS_BASE = 'https://statsapi.mlb.com';

async function fetchMlbJSON(path){
  try {
    const res = await fetch(`${MLB_STATS_BASE}${path}`);
    if(!res.ok) return null;
    return await res.json();
  } catch (e){
    return null;
  }
}

// This app has no MLB Stats API team-id mapping anywhere (TEAM_META
// only carries sportsdbId/rundownTeamId — see js/data.js) and adding
// one just for this would mean maintaining a 30-team static table for
// a single lookup. Instead, this matches on the exact same two things
// ESPN's own summary and MLB's schedule both already independently
// agree on for the same real game: each side's full team name
// ("Detroit Tigers") and start time — confirmed live to be identical
// down to the minute between fetchEspnSummary's `date` and MLB's own
// `gameDate` for the same game. A ±1 day window comfortably covers any
// timezone-driven date-boundary mismatch; the closest-start-time match
// within that window (rather than the first name match) is what
// correctly disambiguates a doubleheader, where the same two teams'
// names appear twice a few hours apart.
async function fetchMlbGamePk(espnDateIso, awayName, homeName){
  const target = new Date(espnDateIso);
  if(!espnDateIso || isNaN(target.getTime()) || !awayName || !homeName) return null;

  const toDateParam = ms => new Date(ms).toISOString().slice(0, 10);
  const dayMs = 24 * 60 * 60 * 1000;
  const data = await fetchMlbJSON(
    `/api/v1/schedule?sportId=1&startDate=${toDateParam(target.getTime() - dayMs)}&endDate=${toDateParam(target.getTime() + dayMs)}`
  );
  const games = Array.isArray(data && data.dates) ? data.dates.flatMap(d => d.games || []) : [];

  let best = null;
  let bestDiffMs = Infinity;
  games.forEach(g => {
    const away = g.teams && g.teams.away && g.teams.away.team;
    const home = g.teams && g.teams.home && g.teams.home.team;
    if(!away || !home || away.name !== awayName || home.name !== homeName) return;
    const diffMs = Math.abs(new Date(g.gameDate).getTime() - target.getTime());
    if(diffMs < bestDiffMs){ bestDiffMs = diffMs; best = g; }
  });
  // Half a day's tolerance is generous for the same-game case (which
  // matched to the minute live) while still well inside the gap
  // between a doubleheader's two games.
  return (best && bestDiffMs < 12 * dayMs / 24) ? best.gamePk : null;
}

// name -> width lookup isn't guaranteed stable across every clip (ESPN's
// own equivalent varies its crop set too — see parseEspnGameMedia's
// comment in js/espn.js), so this picks the first 1280-wide 16:9 cut if
// one exists and only falls back to whatever's first rather than
// assuming a fixed array position.
function pickMlbImage(clip){
  const cuts = (clip.image && Array.isArray(clip.image.cuts)) ? clip.image.cuts : [];
  if(!cuts.length) return null;
  return (cuts.find(c => c.width === 1280) || cuts[0]).src || null;
}

// mp4Avc is the one playback format confirmed to be a plain, directly
// playable .mp4 (1280x720) — the other formats on a real clip are HLS
// manifests (hlsCloud/HTTP_CLOUD_WIRED*, need hls.js outside Safari) or
// a trickplay thumbnail sprite, neither of which a plain <video> tag
// can play.
function pickMlbPlayback(clip){
  const playbacks = Array.isArray(clip.playbacks) ? clip.playbacks : [];
  const mp4 = playbacks.find(p => p.name === 'mp4Avc');
  return mp4 ? mp4.url : null;
}

function stripHtml(html){
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// recap.blurb is hard-truncated mid-sentence by MLB itself (confirmed
// live: a real recap's blurb cut off at "...sitting six games" with no
// trailing ellipsis) — not usable as a clean summary on its own.
// recap.body is the full article as real HTML paragraphs; its first
// `<p>` is the same lead paragraph blurb starts, just not cut off, so
// this extracts and detags just that one paragraph instead.
function firstParagraphText(bodyHtml){
  const match = /<p[^>]*>([\s\S]*?)<\/p>/.exec(bodyHtml || '');
  return match ? stripHtml(match[1]) : null;
}

// MLB's own recap card — replaces ESPN's parseEspnGameMedia (js/espn.js)
// for MLB specifically, so the whole MLB Game Details sheet is sourced
// from one place rather than mixing ESPN (recap) and MLB (everything
// else). Confirmed live: the content endpoint's editorial.recap.mlb is
// a real staff-written article (headline/body/photo), not just a stub —
// present once MLB's published a recap, same "doesn't exist yet on a
// still-live game" timing as ESPN's own article field.
// The link points at the article itself (`mlb.com/news/<slug>`, real
// public page confirmed live 200 — not the internal API URL recap.url
// itself resolves to, dapi.mlbinfra.com, which isn't a page a person
// should be linked to), not a video: MLB games already get real
// embedded clips via Top Plays above this card, so a second link out to
// yet another highlight video would just be a redundant path to
// something already playable in the sheet. "Read full recap" gives this
// link a distinct job — the complete article text — instead of
// competing with Top Plays for the same "watch a clip" job.
// Shape returned matches parseEspnGameMedia's exactly ({ photoUrl,
// recapHeadline, recapSummary, linkUrl, linkLabel }) so renderGameDetail
// (js/live-data.js) needs no template changes to use either source —
// only which object it reads from changes per league.
function deriveMlbRecap(content){
  const recap = content && content.editorial && content.editorial.recap && content.editorial.recap.mlb;
  if(!recap) return null;

  return {
    photoUrl: pickMlbImage(recap),
    recapHeadline: recap.headline || null,
    recapSummary: firstParagraphText(recap.body) || recap.blurb || null,
    linkUrl: recap.slug ? `https://www.mlb.com/news/${recap.slug}` : null,
    linkLabel: 'Read full recap'
  };
}

const MAX_TOP_PLAYS = 3;

// The actual join: for every play the live feed marks as a scoring
// play, its own playId (the last playEvents entry's id) is looked up
// directly against the content endpoint's clips by guid — an exact
// dictionary lookup, not a text/headline match. Among whatever plays
// do have a matched clip, the top MAX_TOP_PLAYS are kept, ranked by
// `about.captivatingIndex` — MLB's own "how big was this play" score,
// present on every play. Checked live against a real completed game:
// captivatingIndex already tracks scoring plays closely (the two
// highest-scored plays in the whole game were both scoring plays, a
// non-scoring strikeout scored far lower), so restricting the ranking
// to scoring plays doesn't lose much real signal while keeping this
// squarely "the plays that decided the game" rather than any highlight
// MLB happened to clip.
function deriveTopPlays(live, content){
  const items = (content && content.highlights && content.highlights.highlights && Array.isArray(content.highlights.highlights.items))
    ? content.highlights.highlights.items : [];
  const clipByGuid = {};
  items.forEach(it => { if(it.guid) clipByGuid[it.guid] = it; });

  const plays = live && live.liveData && live.liveData.plays;
  const scoringIdx = Array.isArray(plays && plays.scoringPlays) ? plays.scoringPlays : [];
  const allPlays = Array.isArray(plays && plays.allPlays) ? plays.allPlays : [];

  const matched = [];
  scoringIdx.forEach(i => {
    const play = allPlays[i];
    const events = play && Array.isArray(play.playEvents) ? play.playEvents : [];
    const playId = events.length ? events[events.length - 1].playId : null;
    const clip = playId ? clipByGuid[playId] : null;
    if(!clip) return;
    matched.push({ play, clip, score: (play.about && play.about.captivatingIndex) || 0 });
  });
  matched.sort((a, b) => b.score - a.score);

  // Chronological (earliest first), not captivatingIndex order — reads
  // as the game's own story arc rather than a shuffled ranking, same
  // as scrolling down a real linescore goes inning 1 to 9.
  return matched.slice(0, MAX_TOP_PLAYS)
    .sort((a, b) => a.play.about.atBatIndex - b.play.about.atBatIndex)
    .map(({ play, clip }) => {
      const about = play.about || {};
      return {
        headline: clip.headline || clip.title || null,
        description: clip.description || null,
        thumbnailUrl: pickMlbImage(clip),
        videoUrl: pickMlbPlayback(clip),
        inning: about.inning || null,
        halfInning: about.halfInning || null
      };
    });
}

// The classic boxscore "W/L/SV" line — `liveData.decisions` names the
// three pitchers by id; their own season line (wins/losses/era/saves)
// is looked up off the same response's per-player boxscore entries
// (`liveData.boxscore.teams.{away,home}.players`, keyed 'ID<id>'),
// merging both teams' player maps into one lookup since a decision
// pitcher can be on either side. save is null on the (common) game that
// didn't have one, rather than a fabricated "SV: —" row.
function deriveDecisions(live){
  const decisions = live && live.liveData && live.liveData.decisions;
  if(!decisions) return null;

  const boxTeams = (live.liveData.boxscore && live.liveData.boxscore.teams) || {};
  const players = { ...(boxTeams.away && boxTeams.away.players), ...(boxTeams.home && boxTeams.home.players) };
  const pitchingLine = person => {
    if(!person) return null;
    const p = players[`ID${person.id}`];
    const stats = (p && p.seasonStats && p.seasonStats.pitching) || {};
    return { name: person.fullName, wins: stats.wins, losses: stats.losses, era: stats.era, saves: stats.saves };
  };

  return {
    win: pitchingLine(decisions.winner),
    loss: pitchingLine(decisions.loser),
    save: pitchingLine(decisions.save)
  };
}

// A minimal game-info line — venue/attendance/duration, the same trio
// almost every real box score prints at the bottom. All three come
// structured (not parsed out of a printed string) off gameData: the
// venue name directly, attendance/gameDurationMinutes from
// gameData.gameInfo — confirmed live to already carry these rather
// than needing gameData.boxscore's separately-formatted info-string
// array.
function deriveGameInfo(live){
  const gameData = live && live.gameData;
  const info = gameData && gameData.gameInfo;
  if(!gameData || !info) return null;
  return {
    venue: (gameData.venue && gameData.venue.name) || null,
    attendance: (typeof info.attendance === 'number') ? info.attendance : null,
    durationMinutes: (typeof info.gameDurationMinutes === 'number') ? info.gameDurationMinutes : null
  };
}

// The one call Game Details actually needs — see openGameDetail in
// js/live-data.js. Fetches the live feed and content endpoint exactly
// once each (every derived piece below reads off one or the other of
// these two responses, so nothing here costs a request of its own
// beyond the initial pair) and derives all four. Degrades field-by-
// field rather than all-or-nothing: a game with no clips yet still
// returns real decisions/gameInfo, same "best effort" convention as
// every ESPN fetch in js/espn.js.
// Shape returned: { topPlays: [{ headline, description, thumbnailUrl,
// videoUrl, inning, halfInning }, ...] (up to 3, chronological, [] if
// none), decisions: { win, loss, save: {name, wins, losses, era,
// saves} | null } | null, gameInfo: { venue, attendance,
// durationMinutes } | null, recap: { photoUrl, recapHeadline,
// recapSummary, linkUrl, linkLabel } | null }
export async function fetchMlbGameExtras(espnDateIso, awayName, homeName){
  const gamePk = await fetchMlbGamePk(espnDateIso, awayName, homeName);
  if(!gamePk) return { topPlays: [], decisions: null, gameInfo: null, recap: null };

  const [live, content] = await Promise.all([
    fetchMlbJSON(`/api/v1.1/game/${gamePk}/feed/live`),
    fetchMlbJSON(`/api/v1/game/${gamePk}/content`)
  ]);

  return {
    topPlays: deriveTopPlays(live, content),
    decisions: deriveDecisions(live),
    gameInfo: deriveGameInfo(live),
    recap: deriveMlbRecap(content)
  };
}
