/* ============================================================
   A game shared into chat: the card js/chat.js draws for a message with
   a `game` field, and the live line under it.

   The card is a snapshot. Its score and status are the game as it stood
   when someone tapped "Share to chat" in Game Details (see
   shareGameDetailToChat in js/live-data.js; the fields are described in
   worker/chat-game.js), and they never change. That frozen moment is the
   point of sharing one.

   The live line underneath is the game now. It only appears once the
   score or state has moved on from the snapshot, reads "Final" when the
   game is over, and after that never changes again. It's looked up with
   the same ESPN summary Game Details uses, only while the Chat tab is
   open, at most once a minute per game, and never for a card that was
   already final or whose game hasn't started. The result is kept on the
   message (`m.gameNow`), which chat.js caches with the rest, so a
   finished game is fetched once and never again.
   ============================================================ */
import { TEAM_META, LEAGUES, PRE_DRAFT } from './data.js';
import { GAME_DETAIL_LEAGUES, FLAT_SCHEDULE_LEAGUES, openGameDetail } from './live-data.js';
import { teamBadgeHtml, draftOwnerName, escapeHtml as esc } from './utils.js';

const LIVE_LINE_EVERY_MS = 60 * 1000;
// A game that still isn't final this long after it started was
// postponed or suspended; stop asking.
const GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
// A scheduled game is first looked up a few minutes early, in case the
// kickoff time drifted.
const START_SLACK_MS = 5 * 60 * 1000;

// Only trust a team key that names a real team in this game's league.
function sideMeta(side, league){
  const meta = side.team && TEAM_META[side.team];
  return meta && meta.leagueKey === league ? meta : null;
}

function sideHtml(side, league, lost){
  const meta = sideMeta(side, league);
  // An undrafted opponent: the same plain monogram Game Details gives one.
  const badge = teamBadgeHtml(meta || {
    name: side.name,
    badgeStyle: 'background: rgba(var(--ink-rgb),0.08); color: var(--text-sub); border-color: var(--hairline-strong);',
    badgeText: esc(side.abbr)
  });
  const owner = meta && !PRE_DRAFT ? draftOwnerName(side.team) : '';
  const score = side.score === null || side.score === undefined ? '' : String(side.score);
  return `
    <div class="cg-side${lost ? ' lost' : ''}">
      ${badge}
      <span class="cg-name">${esc(meta ? meta.name : side.name)}${owner ? `<span class="cg-owner">${esc(owner)}</span>` : ''}</span>
      <span class="cg-score">${score}</span>
    </div>`;
}

function startLabel(start){
  const d = new Date(start);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Starts ${time}` : `Starts ${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

function statusHtml(game){
  if(game.state === 'pre') return `<span class="cg-status">${esc(game.start ? startLabel(game.start) : game.status)}</span>`;
  if(game.state === 'in') return `<span class="cg-status live">${esc(game.status || 'Live')}</span>`;
  return `<span class="cg-status">${esc(game.status || 'Final')}</span>`;
}

// Worth a line only once something has actually moved on from the
// snapshot: the score, or the game starting or ending. The clock alone
// doesn't count, or every live card would grow a line within a minute.
function nowDiffers(game, now){
  return now.state !== game.state || now.away !== game.away.score || now.home !== game.home.score;
}

function liveLineHtml(game, now){
  if(!now || now.state === 'pre' || !nowDiffers(game, now)) return '';
  const lead = now.away === now.home ? null : (now.away > now.home ? 'away' : 'home');
  const num = (which, n) => lead === which ? `<b>${n}</b>` : String(n);
  const scores = `${esc(game.away.abbr)} ${num('away', now.away)} – ${num('home', now.home)} ${esc(game.home.abbr)}`;
  if(now.state === 'post'){
    return `<div class="cg-now"><span class="cg-now-label">${esc(now.status || 'Final')}</span><span class="cg-now-score">${scores}</span></div>`;
  }
  return `<div class="cg-now"><span class="dot pulse"></span><span class="cg-now-label">Now</span><span class="cg-now-score">${now.status ? `${esc(now.status)} · ` : ''}${scores}</span></div>`;
}

// Which drafted team to open Game Details from (it resolves the league
// and the team's own side of the box score from it), or null when
// neither side is a team this group knows — then the card doesn't open.
function openerTeam(game){
  if(sideMeta(game.away, game.league)) return game.away.team;
  if(sideMeta(game.home, game.league)) return game.home.team;
  return null;
}

export function gameCardHtml(m, mine, sharedLabel){
  const game = m.game;
  const league = LEAGUES.find(l => l.key === game.league);
  const done = game.state === 'post';
  const opener = openerTeam(game);
  return `
    <div class="chat-game ${mine ? 'mine' : ''}" data-msg="${m.id}"${opener ? ` data-game-team="${esc(opener)}" data-game-event="${esc(game.event)}" role="button" aria-label="Open box score"` : ''}>
      <div class="cg-league">${esc(league ? league.label : game.league.toUpperCase())}</div>
      ${sideHtml(game.away, game.league, done && game.away.score < game.home.score)}
      ${sideHtml(game.home, game.league, done && game.home.score < game.away.score)}
      <div class="cg-foot">${statusHtml(game)}<span class="cg-shared">Shared ${esc(sharedLabel)}</span></div>
      ${liveLineHtml(game, m.gameNow)}
    </div>`;
}

// A tap on a card opens that game's Game Details over the chat.
export function openSharedGame(el){
  const card = el.closest('[data-game-event]');
  if(!card) return false;
  openGameDetail(card.dataset.gameTeam, card.dataset.gameEvent);
  return true;
}

// ---- Live line ----

const lastLookup = new Map();   // `${league}:${event}` -> ms of the last lookup

function wantsLookup(m, now){
  const game = m.game;
  if(!game || game.state === 'post' || (m.gameNow && m.gameNow.state === 'post')) return false;
  if(!GAME_DETAIL_LEAGUES[game.league] || !FLAT_SCHEDULE_LEAGUES[game.league]) return false;
  const start = game.start || m.ts;
  if(start > now + START_SLACK_MS) return false;
  return now - start < GIVE_UP_AFTER_MS;
}

async function lookUp(league, event){
  try {
    const summary = await GAME_DETAIL_LEAGUES[league].fetchSummary(FLAT_SCHEDULE_LEAGUES[league].sportPath, event);
    if(!summary || !summary.status || !Array.isArray(summary.teams)) return null;
    const away = summary.teams.find(t => t.homeAway === 'away');
    const home = summary.teams.find(t => t.homeAway === 'home');
    if(!away || !home) return null;
    const state = summary.status.state;
    if(state !== 'pre' && (!Number.isFinite(away.score) || !Number.isFinite(home.score))) return null;
    return { state, status: summary.status.detail || '', away: away.score, home: home.score };
  } catch (e){
    return null;
  }
}

// Brings every card that still needs it up to date. Several cards of the
// same game share one lookup. Resolves true when any card's line changed,
// so chat.js knows to save and redraw.
export async function refreshGameLines(messages){
  const now = Date.now();
  const byGame = new Map();
  messages.forEach(m => {
    if(!wantsLookup(m, now)) return;
    const key = `${m.game.league}:${m.game.event}`;
    if(now - (lastLookup.get(key) || 0) < LIVE_LINE_EVERY_MS) return;
    (byGame.get(key) || byGame.set(key, []).get(key)).push(m);
  });
  if(!byGame.size) return false;

  let changed = false;
  await Promise.all([...byGame].map(async ([key, cards]) => {
    lastLookup.set(key, now);
    const line = await lookUp(cards[0].game.league, cards[0].game.event);
    if(!line) return;
    cards.forEach(m => {
      if(JSON.stringify(m.gameNow) === JSON.stringify(line)) return;
      m.gameNow = line;
      changed = true;
    });
  }));
  return changed;
}
