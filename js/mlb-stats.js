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
   no fuzzy text-matching needed. That's what fetchMlbTopPlay below
   surfaces: the single scoring play MLB's own `captivatingIndex`
   ranks highest, with its own dedicated clip.
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

// The actual join: for every play the live feed marks as a scoring
// play, its own playId (the last playEvents entry's id) is looked up
// directly against the content endpoint's clips by guid — an exact
// dictionary lookup, not a text/headline match. Among whatever plays
// do have a matched clip, this picks the one with the highest
// `about.captivatingIndex` — MLB's own "how big was this play" score,
// present on every play — as the single "Top Play".
async function fetchMlbTopPlayClip(gamePk){
  const [live, content] = await Promise.all([
    fetchMlbJSON(`/api/v1.1/game/${gamePk}/feed/live`),
    fetchMlbJSON(`/api/v1/game/${gamePk}/content`)
  ]);

  const items = (content && content.highlights && content.highlights.highlights && Array.isArray(content.highlights.highlights.items))
    ? content.highlights.highlights.items : [];
  const clipByGuid = {};
  items.forEach(it => { if(it.guid) clipByGuid[it.guid] = it; });

  const plays = live && live.liveData && live.liveData.plays;
  const scoringIdx = Array.isArray(plays && plays.scoringPlays) ? plays.scoringPlays : [];
  const allPlays = Array.isArray(plays && plays.allPlays) ? plays.allPlays : [];

  let best = null;
  let bestScore = -Infinity;
  scoringIdx.forEach(i => {
    const play = allPlays[i];
    const events = play && Array.isArray(play.playEvents) ? play.playEvents : [];
    const playId = events.length ? events[events.length - 1].playId : null;
    const clip = playId ? clipByGuid[playId] : null;
    if(!clip) return;
    const score = (play.about && play.about.captivatingIndex) || 0;
    if(score > bestScore){ bestScore = score; best = { play, clip }; }
  });
  if(!best) return null;

  const about = best.play.about || {};
  return {
    headline: best.clip.headline || best.clip.title || null,
    description: best.clip.description || null,
    thumbnailUrl: pickMlbImage(best.clip),
    videoUrl: pickMlbPlayback(best.clip),
    inning: about.inning || null,
    halfInning: about.halfInning || null
  };
}

// Combines the two steps above into the one call Game Details actually
// needs — see openGameDetail in js/live-data.js. Returns null anywhere
// along the chain the game/play/clip can't be resolved (no MLB game
// found for this date/matchup, no scoring plays, none with a matched
// clip) rather than throwing, same "best effort, degrade quietly"
// convention as every ESPN fetch in js/espn.js.
// Shape returned: { headline, description, thumbnailUrl, videoUrl,
// inning, halfInning } | null
export async function fetchMlbTopPlay(espnDateIso, awayName, homeName){
  const gamePk = await fetchMlbGamePk(espnDateIso, awayName, homeName);
  if(!gamePk) return null;
  return fetchMlbTopPlayClip(gamePk);
}
