/* ============================================================
   NHL GAME CLIPS — NHL-only, layered alongside the ESPN hidden API
   (js/espn.js) that backs NHL Game Details, same role js/mlb-stats.js
   plays for MLB: ESPN's NHL summary carries no video at all (checked
   live 2026-09-22 across several finished games — `videos: []` every
   time), so the NHL's own data is the only real source of clips.

   Two hops, split on purpose:
   1. Which clips exist — the NHL's /v1/score/<date> (every game that
      day, a clip id on nearly every goal plus a 3-minute recap id),
      read through the worker's /nhl/score/<date> route
      (worker/rundown-proxy.js, NHL GAME CLIPS PROXY) because
      api-web.nhle.com sends no CORS headers. One edge-cached response
      covers every game that night for every viewer.
   2. How to play one — NHL video is hosted on Brightcove. Its Playback
      API is CORS-open (access-control-allow-origin: *) and returns a
      plain 720p H.264 .mp4 plus a poster frame per clip — the same
      "a plain <video> tag can play it" format MLB's mp4Avc clips are,
      so these render through the exact same Top Plays player. Called
      straight from the browser, uncached: the .mp4 URLs it returns are
      token-signed (fastly_token) and expire, so caching them anywhere
      shared would eventually hand out dead links.

   BRIGHTCOVE_POLICY_KEY is NOT one of this app's own keys — it's the
   NHL's public, read-only Brightcove policy key, served to every
   nhl.com visitor inside their own player script
   (players.brightcove.net/6415718365001/D3UCGynRWU_default/index.min.js).
   It's in client JS for the same reason ESPN's hidden-API URLs are:
   there's nothing private to protect. If NHL ever rotates it, clips
   silently stop resolving (Top Plays just doesn't render) — re-pull it
   from that script.
   ============================================================ */
import { DASHBOARD_WORKER_BASE } from './api.js';
import { fetchJSON } from './utils.js';

const BRIGHTCOVE_ACCOUNT_ID = '6415718365001';
const BRIGHTCOVE_POLICY_KEY = 'BCpkADawqM3l37Vq8trLJ95vVwxubXYZXYglAopEZXQTHTWX3YdalyF9xmkuknxjBgiMYwt8VZ_OZ1jAjYxz_yzuNh_cjC3uOaMspVTD-hZfNUHtNnBnhVD0Gmsih8TBF8QlQFXiCQM3W_u4ydJ1qK2Rx8ZutCUg3PHb7Q';

// The NHL's own game date is US Eastern (its gameDate field), while
// ESPN's summary date is a UTC instant — a 7pm ET puck drop is already
// "tomorrow" in UTC, so the date has to be converted, not sliced.
function nhlGameDate(espnDateIso){
  const d = new Date(espnDateIso);
  if(!espnDateIso || isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Same matching approach as fetchMlbGamePk (js/mlb-stats.js): no NHL
// team-id mapping exists in TEAM_META, so this matches on what both
// sides independently agree on — the team's common name (NHL's
// name.default "Sabres" is exactly ESPN's team.name / summary.teams[].mascot)
// and start time (ESPN's date and the NHL's startTimeUTC agree to the
// minute, confirmed live), closest start winning so a split-squad
// preseason day can't cross wires.
function findNhlGame(games, espnDateIso, awayMascot, homeMascot){
  const target = new Date(espnDateIso).getTime();
  let best = null;
  let bestDiffMs = Infinity;
  games.forEach(g => {
    if(g.awayTeam.name !== awayMascot || g.homeTeam.name !== homeMascot) return;
    const diffMs = Math.abs(new Date(g.startTimeUTC).getTime() - target);
    if(diffMs < bestDiffMs){ bestDiffMs = diffMs; best = g; }
  });
  return (best && bestDiffMs < 12 * 60 * 60 * 1000) ? best : null;
}

// One clip id -> { videoUrl, thumbnailUrl, name }, or null. Picks the
// tallest https MP4 rendition (720p on every clip checked live) — the
// HLS/DASH manifests alongside it would need hls.js outside Safari,
// same reason pickMlbPlayback (js/mlb-stats.js) sticks to mp4Avc.
async function resolveBrightcoveClip(videoId){
  try {
    const res = await fetch(`https://edge.api.brightcove.com/playback/v1/accounts/${BRIGHTCOVE_ACCOUNT_ID}/videos/${videoId}`, {
      headers: { Accept: `application/json;pk=${BRIGHTCOVE_POLICY_KEY}` }
    });
    if(!res.ok) return null;
    const data = await res.json();
    const mp4 = (Array.isArray(data.sources) ? data.sources : [])
      .filter(s => s.container === 'MP4' && typeof s.src === 'string' && s.src.startsWith('https://'))
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if(!mp4) return null;
    return { videoUrl: mp4.src, thumbnailUrl: data.poster || data.thumbnail || null, name: data.name || null };
  } catch (e){
    return null;
  }
}

function periodLabel(goal){
  if(goal.periodType === 'OT') return 'OT';
  if(goal.periodType === 'SO') return 'SO';
  return goal.period ? ['1st', '2nd', '3rd'][goal.period - 1] || `P${goal.period}` : null;
}

const STRENGTH_LABELS = { pp: 'PPG', sh: 'SHG', en: 'ENG' };

// The one call NHL Game Details makes — see openGameDetail in
// js/live-data.js. Returns the same { topPlays: [...] } shape
// fetchMlbGameExtras does, so renderGameDetail's Top Plays player reads
// either league without branching: the 3-minute recap first (the
// single best "catch me up" clip, when the NHL has posted one), then
// every goal with a clip in game order — a hockey game's goals ARE its
// top plays, and there are rarely more than ~8, unlike MLB where
// MAX_TOP_PLAYS has to pick among dozens of clipped plays. Each clip's
// caption is Brightcove's own title ("Dewar strikes first") with the
// period/time as the lead-in label, the way MLB's leads with the inning.
// Degrades to { topPlays: [] } on any miss, same best-effort convention
// as every other fetch here.
export async function fetchNhlGameExtras(espnDateIso, awayMascot, homeMascot){
  const empty = { topPlays: [] };
  const date = nhlGameDate(espnDateIso);
  if(!DASHBOARD_WORKER_BASE || !date || !awayMascot || !homeMascot) return empty;

  const data = await fetchJSON(`${DASHBOARD_WORKER_BASE}/nhl/score/${date}`);
  const game = findNhlGame((data && Array.isArray(data.games)) ? data.games : [], espnDateIso, awayMascot, homeMascot);
  if(!game) return empty;

  const entries = [];
  // No lead-in label on the recap: Brightcove's own title already says
  // so ("Recap — PHI at WSH | Recap").
  if(game.recapClip) entries.push({ clip: game.recapClip, label: null, fallbackHeadline: 'Game recap' });
  game.goals.forEach(goal => {
    if(!goal.clip) return;
    const strength = STRENGTH_LABELS[goal.strength];
    const when = [periodLabel(goal), goal.timeInPeriod].filter(Boolean).join(' ');
    entries.push({
      clip: goal.clip,
      label: [when, strength].filter(Boolean).join(' · ') || null,
      fallbackHeadline: goal.scorer ? `${goal.scorer} (${goal.teamAbbrev})` : null
    });
  });

  const resolved = await Promise.all(entries.map(e => resolveBrightcoveClip(e.clip)));
  return {
    topPlays: entries.map((e, i) => resolved[i] && {
      headline: resolved[i].name || e.fallbackHeadline,
      label: e.label,
      thumbnailUrl: resolved[i].thumbnailUrl,
      videoUrl: resolved[i].videoUrl
    }).filter(Boolean)
  };
}
