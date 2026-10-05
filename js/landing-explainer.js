/* ============================================================
   Landing "How it works" scroll tour (landing.html #tour,
   docs/delight-plan.md Phase 5, prototype 08). A mini phone screen
   sticks in place while the section scrolls past, and scrolling plays
   seven scenes of the real app: the desktop draft room (the clock card
   over a corner of the board, the mini screen turning into a browser
   window), your board across every league, team pages (three of your
   teams in three leagues, swiped through), Scores, Chat, Points (live →
   locked), and the season race to the finish.

   Every scene is a pure function of one progress value p (0 → 1 over its
   step), driven by scroll, so it scrubs both ways. On a step change the
   scene left behind is drawn at p = 1 (going forward) or p = 0 (going
   back), so nothing resets mid-slide. Each scene reaches its end state at
   p = 0.85 and rests there before the next step.

   Your board is the standard setup (DEFAULT_CAPS in js/draft-rules.js,
   which a commissioner can change), filled with teams from the same
   catalog a group's app shows before its draft.
   The team pages prefer leagues it drafts. Badges, crests and colors all come from
   that catalog (TEAM_META); the scenes use the app's own components
   (js/ui.js), so the tour stays true to the app.

   Reduced motion: no scroll scrubbing. The section is just the sticky
   block, each scene shows its end state, and the segments switch steps.
   ============================================================ */
import { SPORT_KEYS } from './sports.js';
import { GROUPS } from './groups.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { escapeHtml } from './escape.js';
import {
  iconHtml, teamBadgeHtml, gameCardHtml, gameSectionHtml, pathToPointsHtml,
  splitBarHtml, tagHtml, teamOrbHtml, tourStepsHtml,
  clockHeroHtml, draftClockHtml, setDraftClock, pickLandingHtml
} from './ui.js';

// Scroll per step, in px. The section is this times the step count, plus
// the sticky block's own height.
const STEP_PX = 560;
// Each scene is done by this much of its step and holds its end state.
const SETTLE = 0.85;
const TABS = [['home', 'Home'], ['scores', 'Scores'], ['chat', 'Chat'], ['standings', 'Standings'], ['points', 'Points']];
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const listOf = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')}, ${names[names.length - 1]}` : names.join(''));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M7 6H4.6v1.2A3.3 3.3 0 0 0 7.6 10.5M17 6h2.4v1.2a3.3 3.3 0 0 1-3 3.3"/><path fill="currentColor" d="M6.8 3.6h10.4v5.2a5.2 5.2 0 0 1-10.4 0z"/><rect fill="currentColor" x="11" y="13.4" width="2" height="3.6"/><rect fill="currentColor" x="7.6" y="17" width="8.8" height="3" rx="1"/></svg>';

// Sample people and moments for the later scenes. Teams are looked up by
// league and name in the catalog, so their crests and colors are real.
// The three rivals are made-up names, drawn fresh each visit, never a real
// drafter's (js/groups.js): this page is public.
const ME = 'You';
const NAME_POOL = ['Sam', 'Jordan', 'Priya', 'Marcus', 'Tess', 'Leo', 'Nina', 'Omar', 'Riley', 'Dev', 'Hana', 'Theo', 'Maya', 'Gus', 'Ava', 'Quinn'];
const REAL = new Set(Object.values(GROUPS).flatMap(g => g.drafters.map(d => d.name.toLowerCase())));
const [A, B, C] = NAME_POOL.filter(n => !REAL.has(n.toLowerCase())).sort(() => Math.random() - 0.5);
const SCORES = [
  { league: 'nfl', clock: ['Q4 2:10', 'Q4 1:52'], sides: [['Lions', ME, [24, 31]], ['Packers', B, [17, 17]]] },
  { league: 'epl', clock: ['78′', '84′'], sides: [['Liverpool', A, [2, 2]], ['Arsenal', C, [1, 1]]] }
];
const SCORE_AT = 0.3;
const CHAT = [
  { from: B, text: 'Empty-net goal. Enjoy it while it lasts', at: 0.28 },
  { from: A, text: 'Both of you are chasing me on Points 😎', at: 0.78 }
];
const REACT_AT = [0.48, 0.62];
// The game you share in Chat: an NHL one, so the tour shows yet another
// league (the Scores scene already has the NFL and the Premier League).
const CHAT_GAME = { league: 'nhl', clock: '3rd 1:12', sides: [['Stars', ME, [0, 4]], ['Jets', B, [0, 2]]] };
// Points: locked + live per drafter, then the finish.
// Mid-season: real-looking totals, with the NFL's share about to lock.
const BOARD = [{ name: A, lk: 38, lv: 16 }, { name: ME, lk: 33, lv: 18, me: true }, { name: B, lk: 31, lv: 17 }, { name: C, lk: 27, lv: 15 }];
const LOCK_LEAGUE = 'nfl';
const BOARD_MAX = 60;
// The season race: each drafter's projected points at the start of each
// month, Sep → the end of June, finishing between 80 and 110. You trail
// most of the way and pass the leader in the last stretch.
const RACE_MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Final'];
const RACE = [
  { name: ME, me: true, v: [74, 78, 72, 70, 76, 81, 79, 86, 92, 99, 104] },
  { name: A, v: [80, 84, 88, 91, 93, 95, 97, 99, 98, 99, 98] },
  { name: B, v: [72, 70, 75, 79, 84, 82, 86, 88, 90, 92, 91] },
  { name: C, v: [77, 75, 79, 76, 74, 78, 80, 79, 83, 82, 83] }
];
// When each league's points lock, in months from Sep 1.
const RACE_LOCKS = { cfb: 4.3, nfl: 5.3, mcbb: 7.2, epl: 8.8, nba: 9.6, nhl: 9.8 };
const RACE_DONE = 0.82, CUP_AT = 0.9;
// The team page: three of your teams in three leagues, swiped through
// like the app's team page. Rules are picked from each league's real
// scoring by label (a label the scoring no longer has is just skipped);
// `live` are the ones that light up, in order, while that team shows.
const TEAM_SAMPLES = [
  { league: 'nfl', name: 'Lions', show: ['Make the playoffs', 'Division title', 'Best record in conference', 'Win Super Bowl', 'Last place in division'], live: 3 },
  { league: 'epl', name: 'Liverpool', show: ['Win League Cup', 'Win FA Cup', '2nd in EPL', 'Win EPL', 'Relegation'], live: 1, skip: 2 },
  { league: 'nba', name: 'Cavaliers', show: ['Make the playoffs', 'Division title', 'Best record in conference', 'Win Finals', 'Last place in division'], live: 2 },
  { league: 'nhl', name: 'Lightning', show: ['Make the playoffs', 'Division title', 'Best record in conference', 'Win Stanley Cup Finals', 'Last place in division'], live: 2 },
  { league: 'mlb', name: 'Cubs', show: ['Make the playoffs', 'Division title', 'Best record in league', 'Win World Series', 'Last place in division'], live: 2 }
];
const TEAMS_SHOWN = 3;

// The setup the tour shows. `caps` and `shown` are the standard setup's; `catalog` is a pre-draft class with every sport
// (preDraftClass(null) in js/seasons/pre-draft.js) for teams and rules.
function model({ caps, shown, catalog }){
  const { TEAM_META, LEAGUES, LEAGUE_SCORING } = catalog;
  const leagueOf = key => LEAGUES.find(l => l.key === key);
  const short = key => FILTER_CHIP_LABELS[key] || (leagueOf(key) || {}).label || key.toUpperCase();
  const teamsIn = key => ((leagueOf(key) || {}).teams || []).map(k => TEAM_META[k]).filter(Boolean);
  const team = (league, name) => teamsIn(league).find(t => t.name === name) || { name, badgeText: name.slice(0, 3).toUpperCase(), badgeStyle: '' };
  const drafted = SPORT_KEYS.filter(k => caps[k] > 0);
  const rounds = drafted.reduce((n, k) => n + caps[k], 0);
  const long = key => (key === 'epl' ? 'Premier League' : short(key));
  const out = { caps, shown, short, long, teamsIn, team, drafted, rounds, scoring: LEAGUE_SCORING };
  out.roomPicks = roomPicks(out);
  // Your own picks in the room, so your board starts with them.
  out.myPicks = out.roomPicks.filter((_, i) => ROOM[slotOwner(i)] === ME).map(pk => pk.name);
  return out;
}

// A team's crest URL, or null. Like crestSrc in js/utils.js: the bright
// rendering of a dark, thin-lined crest (badgeUrlDark) where there is one.
const crestOf = t => {
  const url = t.badgeUrlDark || t.badgeUrl;
  return url && url.startsWith('https://') ? url : null;
};
const badge = t => teamBadgeHtml({
  crestSrc: crestOf(t),
  name: t.name, style: t.badgeStyle || '', text: t.badgeText || '', person: t.kind === 'golfer'
});
const head = (title, kicker, kickerCls = '') => `<div class="tour-h"><b>${escapeHtml(title)}</b><span class="tour-k${kickerCls ? ` ${kickerCls}` : ''}">${escapeHtml(kicker)}</span></div>`;

// ---- Scenes: { title, body, tab, html, draw(el, p, set) } ----
// `set` writes to the DOM only when a value changes (draw runs every
// scroll frame). `tab` is the tab bar's active tab (-1 for none).

// The desktop draft room: the on-the-clock card over a corner of the
// real board (four drafters, three snake rounds). `at` is when each pick
// lands; yours is the one the card turns into a pick landing for.
const ROOM = [A, B, ME, C];
// Candidates in board order; only the group's own leagues are used.
const ROOM_CANDIDATES = [
  { league: 'epl', name: 'Arsenal' }, { league: 'nfl', name: 'Chiefs' }, { league: 'nfl', name: 'Lions' },
  { league: 'nba', name: 'Celtics' }, { league: 'cfb', name: 'Georgia' }, { league: 'pga', name: 'Scottie Scheffler' },
  { league: 'mlb', name: 'Dodgers' }, { league: 'nhl', name: 'Stars' }, { league: 'mcbb', name: 'UConn' },
  { league: 'wnba', name: 'Liberty' }, { league: 'nba', name: 'Knicks' }, { league: 'mlb', name: 'Cubs' },
  { league: 'epl', name: 'Liverpool' }, { league: 'nhl', name: 'Lightning' }
];
const ROOM_AT = [0.06, 0.14, 0.42, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9];
const ROOM_ROUNDS = 3, ROOM_CLOCK = 60, MY_TURN_AT = 0.18;
function slotOwner(slot){
  const n = ROOM.length, r = Math.floor(slot / n), c = slot % n;
  return r % 2 === 0 ? c : n - 1 - c;
}
const pickNo = slot => `${Math.floor(slot / ROOM.length) + 1}.${(slot % ROOM.length) + 1}`;

// A board tile, as the draft room draws one (tileHtml in js/draft.js).
function roomTile(t){
  const crest = crestOf(t);
  return `<span class="dr-tile dr-tile-xs${crest ? ' has-crest' : ''}${t.kind === 'golfer' ? ' is-person' : ''}" style="${escapeHtml(t.badgeStyle || '')}"><span class="dr-tile-abbr">${escapeHtml(t.badgeText || '')}</span>${crest ? `<img src="${escapeHtml(crest)}" alt="">` : ''}</span>`;
}

// The room's picks for this group: its own leagues only (all of them
// when it drafts none of the candidates' leagues).
function roomPicks(m){
  const own = ROOM_CANDIDATES.filter(pk => m.drafted.includes(pk.league));
  return (own.length >= ROOM_AT.length ? own : ROOM_CANDIDATES).slice(0, ROOM_AT.length).map((pk, i) => ({ ...pk, at: ROOM_AT[i] }));
}

function roomScene(m){
  const n = ROOM.length;
  const picks = m.roomPicks.map(pk => ({ ...pk, t: m.team(pk.league, pk.name) }));
  const mine = picks.findIndex((_, i) => ROOM[slotOwner(i)] === ME);
  const head = ROOM.map(name => `<div class="dr-bh${name === ME ? ' me' : ''}">${escapeHtml(name)}</div>`).join('');
  const rows = Array.from({ length: ROOM_ROUNDS }, (_, r) => {
    const cells = Array.from({ length: n }, (_, c) => {
      const slot = r * n + (r % 2 === 0 ? c : n - 1 - c);
      return `<div class="dr-cell empty${ROOM[c] === ME ? ' mine' : ''}" data-slot="${slot}"></div>`;
    }).join('');
    return `<div class="dr-round"><div class="dr-round-n">${r + 1}<small>${r % 2 === 0 ? '→' : '←'}</small></div>${cells}</div>`;
  }).join('');
  const cell = (slot, state) => {
    const pk = picks[slot];
    const top = `<div class="dr-cell-top"><span>${pickNo(slot)}</span>${state === 'filled' ? `<span>${escapeHtml(m.short(pk.league))}</span>` : ''}</div>`;
    if(state === 'filled'){
      // A golfer goes by last name, to fit the narrow cell.
      const name = pk.t.kind === 'golfer' ? pk.t.name.split(' ').slice(-1)[0] : pk.t.name;
      return `${top}<div class="dr-cell-team">${roomTile(pk.t)}<span>${escapeHtml(name)}</span></div>`;
    }
    if(state === 'current') return `${top}<div class="dr-cell-clock">On the clock</div>`;
    return top;
  };
  const you = picks[mine];
  const hero = (state, slot) => {
    if(state === 'landed') return clockHeroHtml({
      clockHtml: draftClockHtml({ secondsLeft: 0, total: ROOM_CLOCK }), title: '',
      landingHtml: pickLandingHtml({ color: you.t.accent || '', badgeHtml: badge(you.t), title: 'Your pick is in', sub: `${you.t.name} · ${m.short(you.league)}`, next: `Next: pick ${pickNo(picks.findIndex((_, i) => i > mine && ROOM[slotOwner(i)] === ME))}` })
    });
    return clockHeroHtml({
      clockHtml: draftClockHtml({ secondsLeft: ROOM_CLOCK, total: ROOM_CLOCK }),
      title: state === 'mine' ? 'You’re on the clock' : `${ROOM[slotOwner(slot)]} is picking`,
      sub: `Pick ${pickNo(slot)}`,
      others: state !== 'mine'
    });
  };
  return {
    title: 'Draft live with your group',
    body: `One snake draft for every league at once. ${listOf(m.drafted.slice(0, 3).map(k => m.long(k)))} and the rest all go on the same board, with a clock on every pick.`,
    tab: -1,
    desk: true,
    html: `<div class="tour-room-hero"></div><div class="tour-room-board"><div class="dr-grid" style="--cols:${n}"><div class="dr-grid-head"><div></div>${head}</div>${rows}</div></div>`,
    draw(el, p, set){
      const done = picks.filter(pk => p >= pk.at).length;
      const state = done > mine ? 'landed' : p >= MY_TURN_AT && done === mine ? 'mine' : 'others';
      const slot = state === 'mine' ? mine : done;
      set(el, 'hero', `${state}:${slot}`, () => { el.querySelector('.tour-room-hero').innerHTML = hero(state, slot); });
      // The clock runs down while it's someone's turn.
      const clock = el.querySelector('.draft-clock');
      if(clock && state !== 'landed'){
        const from = state === 'mine' ? MY_TURN_AT : (done ? picks[done - 1].at : 0);
        const to = state === 'mine' ? picks[mine].at : picks[done].at;
        const left = Math.round(ROOM_CLOCK - (ROOM_CLOCK - 12) * clamp((p - from) / Math.max(0.01, to - from)));
        set(clock, 'sec', left, x => setDraftClock(clock, { secondsLeft: x, total: ROOM_CLOCK, hurry: x <= 8 }));
      }
      el.querySelectorAll('.dr-cell').forEach(c => {
        const slot = +c.dataset.slot;
        const st = slot < done ? 'filled' : slot === done && (slot !== mine || state === 'mine') && slot < picks.length ? 'current' : 'empty';
        set(c, 'st', st, x => {
          c.className = `dr-cell ${x}${ROOM[slotOwner(slot)] === ME ? ' mine' : ''}`;
          c.innerHTML = cell(slot, x);
          if(x === 'filled' && slot === done - 1) c.classList.add('new');
        });
      });
    }
  };
}

function draftScene(m){
  // Your board: each league's slots, filled with its best-known teams
  // (your picks from the room first), interleaved the way a real board
  // fills (not one league at a time).
  const slots = [];
  m.drafted.forEach((k, li) => {
    const teams = m.teamsIn(k);
    const mine = m.myPicks;
    const ordered = [...teams.filter(t => mine.includes(t.name)), ...teams.filter(t => !mine.includes(t.name))];
    for(let s = 0; s < m.caps[k]; s++) slots.push({ k, s, t: ordered[s] || ordered[0], order: (mine.includes((ordered[s] || {}).name) ? -100 : 0) + s * 10 + ((li * 7 + s * 3) % Math.max(1, m.drafted.length)) });
  });
  const picks = slots.sort((a, b) => a.order - b.order);
  const total = picks.length;
  const tiles = m.drafted.map(k => `
    <div class="tour-tile" data-k="${k}">
      <div class="tour-tile-top"><span>${escapeHtml(m.short(k))}</span><em>0/${m.caps[k]}</em></div>
      <div class="tour-pips">${'<i></i>'.repeat(m.caps[k])}</div>
    </div>`).join('');
  const leagues = m.drafted.length;
  const pip = t => (crestOf(t) ? `<img src="${escapeHtml(crestOf(t))}" alt=""${t.kind === 'golfer' ? ' class="person"' : ''}>` : '');
  return {
    title: `Your ${plural(m.rounds, 'pick')}, across ${plural(leagues, 'league')}`,
    body: `The standard board is ${plural(m.rounds, 'pick')}: ${m.drafted.map(k => `${m.caps[k]} ${m.short(k)}`).join(', ')}. Your commissioner can change it.`,
    tab: 0,
    html: `${head('My team', `0 of ${m.rounds}`, 'tour-round')}<div class="tour-tiles" style="--cols:${leagues >= 3 ? 3 : leagues}">${tiles}</div><div class="tour-last"></div>`,
    draw(el, p, set){
      const n = Math.max(m.myPicks.length ? 1 : 0, Math.round(clamp(p / 0.9) * total));
      const count = {};
      picks.forEach((pk, i) => {
        const tile = el.querySelector(`.tour-tile[data-k="${pk.k}"]`);
        const pipEl = tile.querySelectorAll('.tour-pips i')[pk.s];
        set(pipEl, 'on', i < n, on => {
          pipEl.classList.toggle('on', on);
          pipEl.innerHTML = on ? pip(pk.t) : '';
          pipEl.style.background = on && !pipEl.innerHTML ? (pk.t.accent || '') : '';
        });
        set(pipEl, 'new', i === n - 1, on => pipEl.classList.toggle('new', on));
        if(i < n) count[pk.k] = (count[pk.k] || 0) + 1;
      });
      m.drafted.forEach(k => {
        const em = el.querySelector(`.tour-tile[data-k="${k}"] em`);
        set(em, 'text', `${count[k] || 0}/${m.caps[k]}`, x => { em.textContent = x; });
      });
      set(el, 'round', n >= total ? 'Board full' : `${n} of ${total}`, x => { el.querySelector('.tour-round').textContent = x; });
      const last = picks[n - 1];
      const lastHtml = last ? `${badge(last.t)}Pick ${n}: <b>${escapeHtml(last.t.name)}</b> · ${escapeHtml(m.short(last.k))}` : '';
      set(el, 'last', lastHtml, x => { el.querySelector('.tour-last').innerHTML = x; });
    }
  };
}

function teamScene(m){
  // Teams from leagues the group drafts first; any sample fills in if it
  // drafts fewer than three of them.
  const usable = TEAM_SAMPLES.filter(t => (m.scoring[t.league] || {}).rules);
  const picked = [...usable.filter(t => m.drafted.includes(t.league)), ...usable.filter(t => !m.drafted.includes(t.league))].slice(0, TEAMS_SHOWN);
  const teams = picked.map(sample => {
    const all = m.scoring[sample.league].rules;
    const rules = sample.show.map(label => all.find(r => r.label === label)).filter(Boolean);
    // Which rules go Live: the first `live` positive ones, after `skip`.
    const order = rules.map((r, i) => i).filter(i => rules[i].pts > 0).slice(sample.skip || 0, (sample.skip || 0) + sample.live);
    const max = all.reduce((sum, r) => sum + Math.max(0, r.pts), 0);
    return { t: m.team(sample.league, sample.name), league: sample.league, rules, order, max };
  });
  const n = teams.length;
  const ladder = (team, live) => {
    const on = new Set(team.order.slice(0, live));
    return pathToPointsHtml({
      now: [...on].reduce((sum, i) => sum + team.rules[i].pts, 0),
      max: team.max,
      rules: team.rules.map((r, i) => ({ label: r.label, pts: r.pts, state: on.has(i) ? 'live' : r.pts > 0 ? 'reach' : 'off' }))
    });
  };
  const worth = (team, live) => team.order.slice(0, live).reduce((sum, i) => sum + team.rules[i].pts, 0);
  const panel = (team, k) => `
    <div class="tour-team" style="--k:${k}">
      <div class="tour-hero">${teamOrbHtml({ color: team.t.accent || '', cls: 'tour-orb' })}${badge(team.t)}
        <div class="tour-hero-text"><b>${escapeHtml(team.t.sub && team.league !== 'epl' ? `${team.t.sub} ${team.t.name}` : team.t.name)}</b><span><span class="me">${ME}</span> · ${escapeHtml(m.short(team.league) === 'EPL' ? 'Premier League' : m.short(team.league))}</span></div>
        <div class="tour-worth"><small>Worth</small><b>+<span class="tour-worth-n">0</span></b></div>
      </div>
      <div class="tour-ladder">${ladder(team, 0)}</div>
    </div>`;
  const dots = Array.from({ length: n }, (_, k) => `<i class="page-dot"></i>`).join('');
  return {
    title: 'Every team you draft earns points',
    body: 'Each one scores by its own league’s rules, from where it finishes. Titles, playoff runs and top finishes count. Last place costs you.',
    tab: 0,
    html: `<div class="tour-teams">${teams.map(panel).join('')}</div><div class="page-dots tour-dots">${dots}</div>`,
    draw(el, p, set){
      // Each team gets an equal share of the step; its rules light up
      // through the first 80% of it, then it holds before the swipe.
      const k = Math.min(n - 1, Math.floor(p * n));
      const q = clamp(p * n - k);
      set(el, 'k', k, x => {
        el.querySelector('.tour-teams').style.transform = `translateX(${-x * 100}%)`;
        el.querySelectorAll('.tour-dots .page-dot').forEach((d, j) => d.classList.toggle('on', j === x));
      });
      el.querySelectorAll('.tour-team').forEach((panelEl, j) => {
        const team = teams[j];
        const live = j < k ? team.order.length : j > k ? 0 : Math.min(team.order.length, Math.floor(q / 0.8 * (team.order.length + 0.5)));
        set(panelEl, 'live', live, x => {
          const prev = panelEl._live || 0;
          panelEl.querySelector('.tour-ladder').innerHTML = ladder(team, x);
          if(x > prev && j === k){
            const ruleIndex = team.order[x - 1];
            const step = panelEl.querySelectorAll('.ptp-step')[ruleIndex];
            if(step) step.classList.add('hit');
          }
          panelEl._live = x;
          panelEl.querySelector('.tour-worth-n').textContent = String(worth(team, x));
        });
      });
    }
  };
}

function scoresScene(m){
  const card = g => {
    const side = ([name, owner, score]) => {
      const t = m.team(g.league, name);
      return { name: t.name, owner, badgeHtml: badge(t), badgeOnclick: '', scoreHtml: `<span class="tg-score">${score[0]}</span>` };
    };
    return gameSectionHtml({
      label: m.short(g.league) === 'EPL' ? 'Premier League' : m.short(g.league),
      html: gameCardHtml({ state: 'live', time: 'LIVE', sub: g.clock[0], timeTone: 'live', away: side(g.sides[0]), home: side(g.sides[1]) })
    });
  };
  return {
    title: 'Every game, one scoreboard',
    body: 'Scores puts every live game from your leagues on one page, tagged with who drafted each team.',
    tab: 1,
    html: `${head('Scores', 'Today · 2 live')}<div class="tour-scores">${SCORES.map(card).join('')}</div>`,
    draw(el, p, set){
      const on = p >= SCORE_AT;
      el.querySelectorAll('.tg-row').forEach((row, g) => {
        const G = SCORES[g];
        const clock = G.clock[g === 0 ? (on ? 1 : 0) : (p >= 0.62 ? 1 : 0)];
        const bot = row.querySelector('.tg-rail-bot');
        set(bot, 'text', clock, x => { bot.textContent = x; });
        row.querySelectorAll('.tg-score').forEach((s, k) => set(s, 'text', String(G.sides[k][2][on ? 1 : 0]), x => { s.textContent = x; }));
      });
      const first = el.querySelector('.tg-card');
      set(first, 'flash', on, x => {
        first.classList.remove('just-scored');
        if(x){ void first.offsetWidth; first.classList.add('just-scored'); }
      });
    }
  };
}

function chatScene(m){
  const g = CHAT_GAME;
  const side = ([name, owner, score], lost) => {
    const t = m.team(g.league, name);
    return `<div class="cg-side${lost ? ' lost' : ''}">${badge(t)}<span class="cg-name">${escapeHtml(t.name)}<span class="cg-owner">${escapeHtml(owner)}</span></span><span class="cg-score">${score[1]}</span></div>`;
  };
  const msg = (c, extra = '') => `
    <div class="tour-msg" data-at="${c.at}">
      <div class="chat-meta"><span class="chat-name">${escapeHtml(c.from)}</span></div>
      <div class="chat-bubble">${escapeHtml(c.text)}</div>${extra}
    </div>`;
  return {
    title: 'Talk smack all season',
    body: 'Your league gets its own group chat. Share a game from Scores, react to the bad takes, and talk trash all year.',
    tab: 2,
    html: `${head('Chat', 'Your group')}<div class="tour-chat">
      <div class="tour-msg mine on" data-at="0">
        <div class="chat-game mine">
          <div class="cg-league">${escapeHtml(m.short(g.league))}</div>
          ${side(g.sides[0], false)}${side(g.sides[1], true)}
          <div class="cg-foot"><span class="cg-status live">${escapeHtml(g.clock)}</span><span class="cg-shared">Shared 8:41 PM</span></div>
        </div>
      </div>
      ${msg(CHAT[0], '<div class="chat-reactions"><span class="chat-react-pill">😂 <span class="tour-react-n">1</span></span></div>')}
      ${msg(CHAT[1])}
    </div>`,
    draw(el, p, set){
      el.querySelectorAll('.tour-msg').forEach(msgEl => set(msgEl, 'on', p >= +msgEl.dataset.at, on => msgEl.classList.toggle('on', on)));
      const n = p >= REACT_AT[1] ? 2 : p >= REACT_AT[0] ? 1 : 0;
      const rx = el.querySelector('.chat-reactions');
      set(rx, 'n', n, x => {
        rx.classList.toggle('on', x > 0);
        if(x){ rx.querySelector('.tour-react-n').textContent = String(x); rx.classList.remove('pop'); void rx.offsetWidth; rx.classList.add('pop'); }
      });
    }
  };
}

const boardRow = (d, k, tail) => `
  <div class="tour-row${d.me ? ' me' : ''}" data-n="${escapeHtml(d.name)}" style="transform:translateY(${k * 48}px)">
    <span class="tour-rk">${k + 1}</span><span class="tour-nm">${escapeHtml(d.name)}</span>
    ${splitBarHtml({ locked: 0, live: 0, max: BOARD_MAX, size: 'xs' })}${tail}<span class="tour-tt"></span>
  </div>`;
const bar = (row, lk, lv) => {
  row.querySelector('.lk').style.width = (lk / BOARD_MAX) * 100 + '%';
  row.querySelector('.lv').style.width = (lv / BOARD_MAX) * 100 + '%';
};

function lockScene(m){
  const league = m.short(LOCK_LEAGUE);
  return {
    title: 'Live now, locked when the season ends',
    body: 'Live points follow the real standings every day, then lock in for good when a league’s season ends.',
    tab: 4,
    html: `${head('Points', 'Locked + live')}<div class="tour-callout">${escapeHtml(league)} season’s over. Its points are locked.</div>
      <div class="tour-board">${BOARD.map((d, k) => boardRow(d, k, `<span class="tour-tag">${tagHtml({ label: 'Live', variant: 'live' })}</span>`)).join('')}</div>`,
    draw(el, p, set){
      const lock = smooth(0.3, 0.72, p);
      const callout = el.querySelector('.tour-callout');
      set(callout, 'on', p >= 0.3, on => callout.classList.toggle('on', on));
      BOARD.forEach(d => {
        const row = el.querySelector(`.tour-row[data-n="${d.name}"]`);
        set(row, 'lock', lock, () => bar(row, d.lk + d.lv * lock, d.lv * (1 - lock)));
        set(row, 'tt', d.lk + d.lv, x => { row.querySelector('.tour-tt').textContent = String(x); });
        set(row, 'tag', lock > 0.5, L => { row.querySelector('.tour-tag').innerHTML = tagHtml(L ? { label: 'Locked', variant: 'locked' } : { label: 'Live', variant: 'live' }); });
      });
    }
  };
}

function raceScene(m){
  const W = 316, H = 152, TOP = 12, BOT = H - 22, PLOT = W - 26, ROW = 24;
  const last = RACE_MONTHS.length - 1, LO = 60, HI = 110;
  const x = t => 2 + (t / last) * PLOT;
  const y = v => TOP + (1 - (v - LO) / (HI - LO)) * (BOT - TOP);
  const at = (d, t) => { const i = Math.min(last - 1, Math.floor(t)), f = t - i; return d.v[i] + (d.v[i + 1] - d.v[i]) * f; };
  const grid = [70, 80, 90, 100, 110].map(v => `<line class="race-grid" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line><text class="race-axis" x="${W}" y="${(y(v) - 3).toFixed(1)}" text-anchor="end">${v}</text>`).join('');
  const ticks = RACE_MONTHS.slice(0, last).map((mo, i) => (i % 2 ? '' : `<text class="race-tick" data-t="${i}" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${mo}</text>`)).join('');
  const locks = Object.entries(RACE_LOCKS).filter(([k]) => m.drafted.includes(k));
  const rows = RACE.map((d, k) => `<div class="tour-race-row${d.me ? ' me' : ''}" data-n="${escapeHtml(d.name)}" style="transform:translateY(${k * ROW}px)"><span class="tour-rk">${k + 1}</span><span class="tour-nm">${escapeHtml(d.name)}</span>${d.me ? `<span class="tour-cup">${TROPHY}</span>` : '<span></span>'}<span class="tour-tt"></span></div>`).join('');
  return {
    title: 'Winner-take-all',
    body: 'Every team you draft adds to one leaderboard, across all your leagues. Leads change all season. When the last one ends, first place takes it all.',
    tab: 4,
    html: `<div class="race-card tour-race">
        <div class="race-top"><div class="race-top-text"><div class="race-title">The race</div><div class="race-sub tour-race-sub"></div></div></div>
        <svg class="tour-race-chart" viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid}<line class="race-base" x1="0" x2="${W}" y1="${BOT}" y2="${BOT}"></line>${ticks}<g class="tour-race-locks"></g><g class="tour-race-lines"></g></svg>
      </div>
      <div class="tour-race-table">${rows}</div>`,
    draw(el, p, set){
      const c = clamp(p / RACE_DONE) * last;
      const day = Math.round(c * 10) / 10;
      set(el, 'c', day, () => {
        // Lines up to the cursor; you on top, in gold.
        const line = d => {
          const pts = [];
          for(let t = 0; t <= c + 1e-6; t += 0.25) pts.push(`${x(t).toFixed(1)} ${y(at(d, t)).toFixed(1)}`);
          pts.push(`${x(c).toFixed(1)} ${y(at(d, c)).toFixed(1)}`);
          return `<path class="race-line${d.me ? ' me' : ''}" d="M${pts.join(' L')}"></path>`;
        };
        const now = RACE.map(d => ({ ...d, now: at(d, c) })).sort((a, b) => b.now - a.now);
        // Labels: you, and whoever's ahead of you (or right behind, once you lead).
        const rival = now[0].me ? now[1] : now[0];
        const order = [...RACE].sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
        const heads = order.map(d => `<circle class="race-dot${d.me ? ' me' : ''}" cx="${x(c).toFixed(1)}" cy="${y(at(d, c)).toFixed(1)}" r="${d.me ? 4 : 2.5}"></circle>`).join('');
        const flip = x(c) > W - 90;
        const labs = [RACE.find(d => d.me), RACE.find(d => d.name === rival.name)].map(d => ({ d, y: y(at(d, c)) }));
        if(labs.length === 2 && Math.abs(labs[0].y - labs[1].y) < 12){ const mid = (labs[0].y + labs[1].y) / 2, up = labs[0].y < labs[1].y ? 0 : 1; labs[up].y = mid - 6; labs[1 - up].y = mid + 6; }
        const labels = labs.map(({ d, y: ly }) => `<text class="race-label${d.me ? ' me' : ''}" x="${(flip ? x(c) - 8 : x(c) + 8).toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="${flip ? 'end' : 'start'}">${escapeHtml(d.name)}<tspan class="v" dx="4">${Math.round(at(d, c))}</tspan></text>`).join('');
        el.querySelector('.tour-race-lines').innerHTML = order.map(line).join('') + heads + labels;
        // League locks along the base: gold once passed.
        let lastLabel = -9;
        el.querySelector('.tour-race-locks').innerHTML = locks.map(([k, t]) => {
          const done = t <= c, lx = x(t);
          const label = done && t - lastLabel > 0.6 ? (lastLabel = t, `<text class="race-lock-label" x="${lx.toFixed(1)}" y="${BOT - 8}" text-anchor="middle">${escapeHtml(m.short(k))}</text>`) : '';
          return `<rect class="race-lock${done ? ' done' : ''}" x="${(lx - 3).toFixed(1)}" y="${BOT - 3}" width="6" height="6" transform="rotate(45 ${lx.toFixed(1)} ${BOT})"></rect>${label}`;
        }).join('');
        el.querySelectorAll('.race-tick').forEach(tk => tk.classList.toggle('past', +tk.dataset.t <= c));
        el.querySelector('.tour-race-sub').textContent = c >= last ? 'Final · every league locked' : `${RACE_MONTHS[Math.min(last - 1, Math.floor(c))]} · projected`;
        // The standings under it follow the cursor, rows gliding to their place.
        now.forEach((d, k) => {
          const row = el.querySelector(`.tour-race-row[data-n="${d.name}"]`);
          set(row, 'k', k, n => { row.style.transform = `translateY(${n * ROW}px)`; row.querySelector('.tour-rk').textContent = String(n + 1); });
          row.querySelector('.tour-tt').textContent = String(Math.round(d.now));
        });
      });
      const cup = p >= CUP_AT;
      const meRow = el.querySelector('.tour-race-row.me');
      set(meRow, 'champ', cup, on => { meRow.classList.toggle('champ', on); meRow.querySelector('.tour-cup').classList.toggle('on', on); });
    }
  };
}

export function initTour(root, setup){
  if(!root) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = model(setup);
  const scenes = [roomScene(m), draftScene(m), teamScene(m), scoresScene(m), chatScene(m), lockScene(m), raceScene(m)];
  const N = scenes.length;

  root.innerHTML = `
    <div class="tour-sticky">
      ${tourStepsHtml({ labels: scenes.map(s => s.title) })}
      <div class="tour-screen" aria-hidden="true" inert>
        <div class="tour-chrome"><span class="tour-chrome-dots"><i></i><i></i><i></i></span><span class="tour-chrome-url">${escapeHtml(setup.url || '')}</span></div>
        ${scenes.map(s => `<div class="tour-scene${s.desk ? ' desk' : ''}">${s.html}</div>`).join('')}
        <nav class="tour-tabs"><span class="tour-pill"></span>${TABS.map(([icon, label]) => `<span class="tour-tab">${iconHtml(icon)}${label}</span>`).join('')}</nav>
      </div>
      <div class="tour-cap" aria-live="polite"><b></b><p></p></div>
    </div>`;
  root.classList.toggle('still', !!reduce);

  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const sticky = $('.tour-sticky'), els = $$('.tour-scene'), segs = $$('.tour-seg'), tabs = $$('.tour-tab');
  const pill = $('.tour-pill'), cap = $('.tour-cap'), screen = $('.tour-screen');

  // Only touch the DOM when a value actually changes.
  const memo = new WeakMap();
  const set = (el, key, val, apply) => {
    if(!el) return;
    let mm = memo.get(el);
    if(!mm){ mm = {}; memo.set(el, mm); }
    if(mm[key] === val) return;
    mm[key] = val;
    apply(val);
  };

  let cur = -1;
  function show(step, p){
    if(step !== cur){
      const from = cur;
      cur = step;
      els.forEach((el, k) => {
        el.classList.toggle('on', k === step);
        el.classList.toggle('prev', k < step);
        if(k !== step) scenes[k].draw(el, k < step ? 1 : 0, set);
      });
      const tab = scenes[step].tab;
      tabs.forEach((t, k) => t.classList.toggle('on', k === tab));
      pill.classList.toggle('none', tab < 0);
      screen.classList.toggle('desk', !!scenes[step].desk);
      if(tab >= 0) pill.style.transform = `translateX(${tab * 100}%)`;
      cap.querySelector('b').textContent = scenes[step].title;
      cap.querySelector('p').textContent = scenes[step].body;
      segs.forEach((s, k) => k === step ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current'));
      if(from >= 0 && !reduce){ cap.classList.remove('sw'); void cap.offsetWidth; cap.classList.add('sw'); }
    }
    segs.forEach((s, k) => set(s, 'fill', k < step ? 1 : k === step ? p : 0, f => s.style.setProperty('--fill', (f * 100).toFixed(1) + '%')));
    scenes[step].draw(els[step], clamp(p / SETTLE), set);
  }

  if(reduce){
    segs.forEach((s, k) => s.addEventListener('click', () => show(k, 1)));
    show(0, 1);
    return;
  }

  // The section is tall enough for every step to get STEP_PX of scroll
  // while the sticky block holds.
  const size = () => { root.style.height = `${N * STEP_PX + sticky.offsetHeight}px`; };
  const stickyTop = () => parseFloat(getComputedStyle(sticky).top) || 0;
  const range = () => Math.max(1, root.offsetHeight - sticky.offsetHeight);
  let raf = 0;
  function update(){
    raf = 0;
    const P = clamp((stickyTop() - root.getBoundingClientRect().top) / range());
    const f = P * N, step = Math.min(N - 1, Math.floor(f));
    show(step, step === N - 1 && P >= 1 ? 1 : f - step);
  }
  const queue = () => { if(!raf) raf = requestAnimationFrame(update); };
  segs.forEach((s, k) => s.addEventListener('click', () => {
    const top = root.getBoundingClientRect().top + scrollY - stickyTop();
    window.scrollTo({ top: top + range() * (k + 0.03) / N, behavior: 'smooth' });
  }));
  size();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', () => { size(); queue(); });
  update();
}
