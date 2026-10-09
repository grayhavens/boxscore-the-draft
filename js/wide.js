/* ============================================================
   Wide layout shell (900px and up: iPad landscape and desktop). See
   docs/desktop-redesign-brief.md and the round 2 handoff (ROUND2.md).
   The phone app is untouched; at wide widths the same views and DOM are
   rearranged by css/style.css's "Wide layout" section, and this module
   adds the three pieces that only exist there:

   - The team rail (#wide-rail): every team the displayed drafter owns,
     grouped by league, plus "All teams" (Home). The current team page's
     team is selected (gold bar); a team with a game on shows a red dot.
     Focus is roving: ↑/↓ moves between items and opens each one.
   - The header: the bottom tab bar restyled as a top nav (CSS), with
     the group name on the left and Settings on the right (markup in
     index.html, shown only here).
   - Chat beside everything else. At 1280px and up it's a column on the
     right that collapses to a thin strip (remembered per device); from
     900–1279px the Chat nav item opens it as a slide-over panel. Either
     way it's the same #view-chat, so js/chat.js only needs to know it's
     showing (setChatActive) to connect, mark messages seen and keep the
     unread badge right.

   The rail and header are rendered whatever the width (they're hidden by
   CSS under 900px), so crossing the breakpoint only changes classes and
   the chat's active state.
   ============================================================ */
import { TEAM_META, LEAGUES, PRE_DRAFT } from './data.js';
import { teamBadgeHtml, escapeHtml } from './utils.js';
import { liveDataCache } from './live-data.js';
import { setChatActive } from './chat.js';
import { openTeamPage, currentTeamPageKey } from './team-page.js';
import { iconHtml } from './ui.js';
import { isWide, isDock, onWideChange } from './wide-query.js';

const COLLAPSE_KEY = 'bx-chat-collapsed';
let collapsed = false;
try{ collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; }catch(err){}
let overOpen = false;
let drafterId = null;
let shownSel = null;   // the selection the rail last scrolled to

// ---- Rail ----

// The drafter's teams, league by league in LEAGUES order. Golfers have no
// team page, and favorites they didn't draft aren't theirs.
function railTeams(){
  if(PRE_DRAFT || !drafterId) return [];
  return LEAGUES.map(league => ({
    league,
    teams: league.teams.filter(k => {
      const m = TEAM_META[k];
      return m && m.draftTeamId === drafterId && !m.favoriteOnly && m.kind !== 'golfer';
    })
  })).filter(g => g.teams.length);
}

function selectedKey(){
  const teamKey = currentTeamPageKey();
  if(teamKey) return teamKey;
  const board = document.getElementById('view-board');
  return board && board.classList.contains('active') ? 'all' : null;
}

function railItemHtml(teamKey, sel){
  const meta = TEAM_META[teamKey];
  const bundle = liveDataCache[teamKey];
  const live = !!(bundle && bundle.espnLive && bundle.espnLive.isLive);
  return `<button type="button" class="wr-item${sel ? ' sel' : ''}" data-key="${teamKey}" tabindex="${sel ? 0 : -1}"${sel ? ' aria-current="page"' : ''} onclick="wideRailOpen('${teamKey}')">`
    + `<span class="wr-badge">${teamBadgeHtml(meta)}${live ? '<i class="wr-live" aria-label="Live"></i>' : ''}</span>`
    + `<span class="wr-name">${escapeHtml(meta.name)}</span></button>`;
}

export function paintRail(){
  const el = document.getElementById('wide-rail');
  if(!el) return;
  const sel = selectedKey();
  const groups = railTeams().map(g => `<div class="wr-group"><div class="wr-league"><span>${escapeHtml(g.league.label)}</span></div>`
    + g.teams.map(k => railItemHtml(k, k === sel)).join('') + `</div>`).join('');
  el.innerHTML = `<a class="wr-mark" href="#" onclick="switchView('board'); return false;" aria-label="Home"><img src="icons/logo-header.png" alt=""></a>`
    + `<div class="wr-scroll">`
    + `<button type="button" class="wr-item wr-all${sel === 'all' ? ' sel' : ''}" data-key="all" tabindex="${sel === 'all' ? 0 : -1}"${sel === 'all' ? ' aria-current="page"' : ''} onclick="wideRailOpen('all')">`
    + `<span class="wr-all-box">${iconHtml('home', { size: 17 })}</span><span class="wr-name">All teams</span></button>`
    + groups + `</div>`
    + (groups ? `<div class="wr-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> Teams</div>` : '');
  // One tab stop: the selected item, or "All teams" when nothing is.
  const item = el.querySelector('.wr-item.sel');
  if(!item) el.querySelector('.wr-all').tabIndex = 0;
  // Scrolled into view when the selection changes, not on every repaint.
  if(item && isWide() && sel !== shownSel) item.scrollIntoView({ block: 'nearest' });
  shownSel = sel;
}

// Whose teams the rail lists: js/board.js calls this whenever the
// displayed drafter changes (your own, or someone you're peeking at).
export function setRailDrafter(id){
  drafterId = id;
  paintRail();
}

window.wideRailOpen = key => {
  if(key === 'all'){ window.switchView('board'); return; }
  if(key === currentTeamPageKey()) return;
  openTeamPage(key, 'board');
};

// ↑/↓ inside the rail moves to the next item and opens it.
function bindRailKeys(){
  const el = document.getElementById('wide-rail');
  if(!el) return;
  el.addEventListener('keydown', event => {
    if(event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...el.querySelectorAll('.wr-item')];
    const at = items.indexOf(document.activeElement);
    if(at === -1) return;
    event.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if(!next || next === items[at]) return;
    window.wideRailOpen(next.dataset.key);
    // The rail is repainted by the open; focus the new item once it is.
    requestAnimationFrame(() => {
      const again = el.querySelector(`.wr-item[data-key="${next.dataset.key}"]`);
      if(again){ again.focus({ preventScroll: true }); again.classList.add('kb'); }
    });
  });
}

// ---- Consoles ----
// The draft room and Commissioner are full-screen consoles with their own
// columns, so the team rail steps aside while one is open (html
// data-console, css/style.css "Consoles, wide"). Commissioner's console
// covers the whole window, chat included; the draft room keeps the header
// (its way back out) and chat beside it.
const CONSOLES = ['draft', 'admin'];
function consoleView(){
  if(!isWide()) return null;
  return CONSOLES.find(v => document.getElementById('view-' + v)?.classList.contains('active')) || null;
}

// ---- Chat ----

// Showing beside the page: the docked column (unless collapsed) or the
// open slide-over.
export function chatBeside(){
  if(!isWide() || consoleView() === 'admin') return false;
  return isDock() ? !collapsed : overOpen;
}

// Whether the Chat view is open on its own (the phone's Chat tab).
const chatViewActive = () => {
  const el = document.getElementById('view-chat');
  return !!el && el.classList.contains('active');
};

function syncChat(){
  const root = document.documentElement;
  const con = consoleView();
  if(con) root.dataset.console = con;
  else delete root.dataset.console;
  root.classList.toggle('chat-collapsed', collapsed);
  root.classList.toggle('chat-over', isWide() && !isDock() && overOpen);
  document.querySelectorAll('.tab-btn[data-view="chat"]').forEach(b => b.classList.toggle('chat-on', chatBeside()));
  setChatActive(chatViewActive() || chatBeside(), { beside: chatBeside() });
}

// The Chat nav item at wide widths: collapse or expand the column, or
// open the slide-over. `open` only ever opens it (a ?view=chat link).
// Returns false under 900px, where Chat is a tab.
export function wideChatNav({ open = false } = {}){
  if(!isWide()) return false;
  if(!isDock()) openChatOver();
  else if(collapsed || !open) toggleChatDock();
  return true;
}

function toggleChatDock(){
  collapsed = !collapsed;
  try{ localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }catch(err){}
  syncChat();
  if(!collapsed) focusComposer();
}
window.toggleChatDock = toggleChatDock;

function openChatOver(){
  overOpen = true;
  syncChat();
  focusComposer();
}
function closeChatOver(){
  if(!overOpen) return;
  overOpen = false;
  syncChat();
}
window.closeChatOver = closeChatOver;

// Only with a real keyboard: on a touch iPad focusing would raise the
// on-screen keyboard over half the page.
function focusComposer(){
  if(!window.matchMedia('(pointer: fine)').matches) return;
  const input = document.getElementById('chat-input');
  if(input) requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

// Called by js/board.js on every view change: the rail's selection
// follows, and a chat beside the page stays connected.
export function onViewShown(){
  paintRail();
  syncChat();
}

export function initWide(){
  bindRailKeys();
  onWideChange(() => {
    if(!isWide()) overOpen = false;
    // Widened while on the Chat tab: Home, with chat beside it.
    if(isWide() && chatViewActive()){ window.switchView('board'); return; }
    syncChat();
    paintRail();
  });
  // js/team-page.js pushes and pops its views itself, without switchView.
  document.addEventListener('bx:viewshown', onViewShown);
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && overOpen) closeChatOver();
  });
  // The live dots follow the scoreboard sweeps.
  setInterval(() => { if(isWide() && document.visibilityState !== 'hidden') paintRail(); }, 30 * 1000);
  syncChat();
}
