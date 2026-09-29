/* ============================================================
   A shared game in chat — the `game` field of a chat message (see
   worker/chat-room.js). Game Details' "Share to chat" button
   (js/live-data.js) sends a snapshot of the game at that moment:

     { league, event, state, status, start?,
       away: { team?, name, abbr, score }, home: { ... } }

   league    one of GAME_LEAGUES
   event     ESPN event id, what the card's live line (js/game-card.js)
             and a tap into Game Details look the game up by
   state     ESPN's 'pre' | 'in' | 'post' when it was shared
   status    ESPN's short status then ("4:12 - 3rd", "Final/OT", or a
             scheduled game's "3:00 PM EDT")
   start     kickoff, ms since epoch — a scheduled card shows it in the
             viewer's own time zone
   team      the side's TEAM_META key when it's a drafted team, so the
             card shows its crest and owner; the client ignores a key it
             doesn't know
   score     null before the game starts

   Kept out of chat-room.js (which imports cloudflare:workers) so it can
   be tested in Node. Same trust tier as the rest of chat: a sender could
   post a made-up score just as easily as type one, so this only checks
   the shape. The live line shows the real score anyway.
   ============================================================ */

export const GAME_LEAGUES = ['epl', 'nfl', 'cfb', 'nba', 'nhl', 'mlb', 'wnba', 'mcbb'];
const GAME_STATES = ['pre', 'in', 'post'];

const LEAGUE_EMOJI = { epl: '⚽', nfl: '🏈', cfb: '🏈', nba: '🏀', wnba: '🏀', mcbb: '🏀', nhl: '🏒', mlb: '⚾' };

const MAX_NAME_LENGTH = 40;
const MAX_STATUS_LENGTH = 40;
const MAX_SCORE = 999;

// No control characters or markup-looking brackets: these strings come
// from ESPN via the sender's browser, and ESPN never sends either.
const PLAIN_TEXT = /^[^\u0000-\u001f\u007f<>]+$/;
const plain = (s, max) => typeof s === 'string' && s.length <= max && PLAIN_TEXT.test(s) ? s.trim() : null;

function parseSide(side, state){
  if(!side || typeof side !== 'object') return null;
  const name = plain(side.name, MAX_NAME_LENGTH);
  const abbr = plain(side.abbr, 8);
  if(!name || !abbr) return null;
  const out = { name, abbr };
  if(side.team !== undefined){
    if(typeof side.team !== 'string' || !/^[a-z0-9_]{1,40}$/.test(side.team)) return null;
    out.team = side.team;
  }
  // A scheduled game has no score yet; once it's under way both sides do.
  if(state === 'pre'){
    if(side.score !== null && side.score !== undefined) return null;
    out.score = null;
  } else {
    if(!Number.isInteger(side.score) || side.score < 0 || side.score > MAX_SCORE) return null;
    out.score = side.score;
  }
  return out;
}

export function parseGame(game){
  if(!game || typeof game !== 'object') return null;
  const { league, event, state } = game;
  if(!GAME_LEAGUES.includes(league)) return null;
  if(typeof event !== 'string' || !/^\d{1,20}$/.test(event)) return null;
  if(!GAME_STATES.includes(state)) return null;
  const status = game.status === '' ? '' : plain(game.status, MAX_STATUS_LENGTH);
  if(status === null) return null;
  const away = parseSide(game.away, state);
  const home = parseSide(game.home, state);
  if(!away || !home) return null;
  const out = { league, event, state, status, away, home };
  if(game.start !== undefined){
    if(!Number.isInteger(game.start) || game.start <= 0) return null;
    out.start = game.start;
  }
  return out;
}

// The message's text: what an app version without the card shows, and
// the chat alert's body. Away first, the way every scoreboard reads.
export function gameText(game){
  const emoji = LEAGUE_EMOJI[game.league] || '';
  const matchup = game.state === 'pre'
    ? `${game.away.name} at ${game.home.name}`
    : `${game.away.name} ${game.away.score} – ${game.home.score} ${game.home.name}`;
  return `${emoji} ${matchup}${game.status ? ` · ${game.status}` : ''}`.trim();
}
