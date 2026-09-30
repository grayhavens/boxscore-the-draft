/* ============================================================
   Landing "How it works" explainer (landing.html #hiw): a six-step,
   auto-playing card — draft, finish, the Scores tab, the group chat,
   live → locked, leaderboard. The last two reuse the app's own markup
   (js/live-now.js's timeline, js/game-card.js and js/chat.js).
   Every scene is driven by one progress value p (0 → 1 over the current
   step), so each render is a pure function of (step, p). The scene that
   is fading out holds p = 1 so it doesn't reset mid-fade.
   Reduced motion: no autoplay, each step shows its end state, and the
   segment buttons switch steps without tweens.
   ============================================================ */

const STEP_MS = 6000;

// Roster caps: Season Ticket's (its `caps` in js/groups.js), the group
// the landing page recruits for. 24 slots per drafter.
const SLOTS = [['NFL', 3], ['NBA', 3], ['NHL', 3], ['MLB', 3], ['CFB', 3], ['CBB', 3], ['PGA', 3], ['EPL', 2], ['WNBA', 1]];
// Your 24 picks in draft order, one per round. Colors are each team's
// primary, or a brighter secondary where the primary disappears on a pip.
// Golfers share one green, as in the draft room (GOLFER_COLOR, brightened).
const GOLF = '#2E8A5C';
const PICKS = [
  ['NFL', 'Lions', '#0076B6'], ['EPL', 'Liverpool', '#C8102E'], ['NBA', 'Cavaliers', '#860038'],
  ['CFB', 'Oregon', '#FEE123'], ['PGA', 'Scheffler', GOLF], ['NHL', 'Lightning', '#2E5CB8'],
  ['MLB', 'Cubs', '#2F5BC9'], ['CBB', 'Houston', '#C8102E'], ['NFL', 'Steelers', '#FFB612'],
  ['NBA', 'Nuggets', '#FEC524'], ['NHL', 'Flyers', '#F74902'], ['WNBA', 'Valkyries', '#8A6BAF'],
  ['EPL', 'Newcastle', '#E6E7EB'], ['PGA', 'Schauffele', GOLF], ['MLB', 'Padres', '#FFC425'],
  ['CFB', 'Texas A&M', '#8C1D1D'], ['CBB', 'Purdue', '#CEB888'], ['NFL', 'Dolphins', '#008E97'],
  ['NHL', 'Red Wings', '#CE1126'], ['NBA', 'Mavericks', '#2A6FB5'], ['MLB', 'Nationals', '#AB0003'],
  ['PGA', 'Åberg', GOLF], ['CFB', 'Arizona', '#AB0520'], ['CBB', 'Utah State', '#4A6FA5']
];
const TOTAL = PICKS.length;
// The last pick lands at p = 0.81, whatever the pick count.
const PICK_GAP = 0.76 / (TOTAL - 1);
// `at` = the p where the rule lights up; no `at` = never hits in the demo.
const RULES = [
  { label: 'Make the playoffs', pts: 1, at: 0.22 },
  { label: 'Division title', pts: 2, at: 0.42 },
  { label: 'Best record in conference', pts: 3, at: 0.62 },
  { label: 'Win Super Bowl', pts: 5 },
  { label: 'Last place in division', pts: -2 }
];
const CAPS = [
  { title: 'Draft 24 picks across 9 leagues', body: 'A live snake draft with your group. Everyone fills the same 24 slots, so you need a plan for all nine leagues.' },
  { title: 'Points come from where teams finish', body: 'Not single games. Titles, playoff runs and division wins score. Last place costs you.' },
  { title: 'Every game, one scoreboard', body: 'Scores puts every live game from all nine leagues on one page, tagged with who drafted each team. No more flipping between apps.' },
  { title: 'Talk smack all season', body: 'Your league gets its own group chat. Share a game from Scores, react to the bad takes, and talk trash all year.' },
  { title: 'Live now, locked when the season ends', body: 'Live points follow the real standings every day, then lock in for good when a league’s season ends.' },
  { title: 'Winner-take-all', body: 'Every team you draft adds to one leaderboard, across all nine leagues. When the last season ends, first place takes it all.' }
];
// Scene 3, the Scores tab. Badges are the app's no-crest fallback (team
// colors + abbreviation). The Lions score at SCORE_AT.
const SCORES = [
  { lg: 'NFL', clock: ['Q4', '2:10', '1:52'], sides: [
    { abbr: 'DET', name: 'Lions', owner: 'You', bg: '#0076B6', fg: '#B0B7BC', score: [24, 31] },
    { abbr: 'GB', name: 'Packers', owner: 'Drew', bg: '#203731', fg: '#FFB612', score: [17, 17] }] },
  { lg: 'Premier League', clock: ['78′'], sides: [
    { abbr: 'LIV', name: 'Liverpool', owner: 'Isaac', bg: '#C8102E', fg: '#FFFFFF', score: [2, 2] },
    { abbr: 'ARS', name: 'Arsenal', owner: 'Collin', bg: '#EF0107', fg: '#FFFFFF', score: [1, 1] }] }
];
const SCORE_AT = 0.3;
// Scene 4, the group chat: you share that game, Drew bites back.
const CHAT = [
  { from: 'Drew', text: 'Garbage time TD. Enjoy it while it lasts', at: 0.3 },
  { from: 'Isaac', text: 'Both of you are chasing me on Points 😎', at: 0.78 }
];
const REACT_AT = [0.5, 0.62]; // 😂 on Drew's message: 1, then 2
const BOARD = [
  { name: 'Isaac', lk: 14, lv: 7 },
  { name: 'You', lk: 12, lv: 7, me: true },
  { name: 'Drew', lk: 11, lv: 7 },
  { name: 'Collin', lk: 9, lv: 6 }
];
const LOCK_AT = 0.66, LOCK_SCALE = 16, LADDER_SCALE = 26;

const signed = n => (n > 0 ? '+' : '−') + Math.abs(n);

function markup(){
  const tiles = SLOTS.map(([league, cap]) => `
    <div class="hiw-tile">
      <div class="hiw-tile-top"><span class="hiw-lg">${league}</span><span class="hiw-cap">0/${cap}</span></div>
      <div class="hiw-pips">${'<span class="hiw-pip"><i></i></span>'.repeat(cap)}</div>
    </div>`).join('');
  const rules = RULES.map(r => `
    <div class="hiw-rule${r.pts < 0 ? ' neg' : ''}">
      <span class="hiw-rule-label">${r.label}</span>
      <span class="pts-tag live">Live</span>
      <span class="hiw-rule-pts">${signed(r.pts)}</span>
    </div>`).join('');
  const ladder = BOARD.map(d => `
    <div class="hiw-lrow${d.me ? ' me' : ''}">
      <span class="hiw-rank"></span>
      <span class="hiw-name">${d.name}</span>
      <span class="split-bar sm"><span class="lk"></span><span class="lv"></span></span>
      <span class="hiw-total"></span>
    </div>`).join('');
  const badge = t => `<div class="badge" style="background:${t.bg};color:${t.fg}">${t.abbr}</div>`;
  const scoreRows = SCORES.map(g => `
    <div class="tg-section">
      <div class="tg-section-head"><span class="tg-section-label">${g.lg}</span><span class="tg-section-rule"></span></div>
      <div class="tg-row">
        <div class="tg-rail"><div class="tg-rail-top live">LIVE</div><div class="tg-rail-bot"></div></div>
        <span class="tg-line"></span>
        <span class="tg-node live"></span>
        <div class="tg-card live">${g.sides.map(t => `
          <div class="tg-side">
            ${badge(t)}
            <div class="tg-label"><span class="tg-name">${t.name}</span><span class="tg-owner">${t.owner}</span></div>
            <span class="tg-score"></span>
          </div>`).join('')}
        </div>
      </div>
    </div>`).join('');
  const shared = SCORES[0];
  const cgSide = t => `
    <div class="cg-side">${badge(t)}<span class="cg-name">${t.name}<span class="cg-owner">${t.owner}</span></span><span class="cg-score">${t.score[1]}</span></div>`;
  const msgHtml = (m, extra = '') => `
    <div class="hiw-msg">
      <div class="chat-meta"><span class="chat-name">${m.from}</span></div>
      <div class="chat-bubble">${m.text}</div>${extra}
    </div>`;
  const chat = `
    <div class="hiw-msg mine">
      <div class="chat-meta mine"><span class="chat-name">You</span></div>
      <div class="chat-game mine">
        <div class="cg-league">NFL</div>
        ${shared.sides.map(cgSide).join('')}
        <div class="cg-foot"><span class="cg-status live">${shared.clock[0]} ${shared.clock[2]}</span><span class="cg-shared">Shared 8:41 PM</span></div>
      </div>
    </div>
    ${msgHtml(CHAT[0], `
      <div class="chat-reactions"><span class="chat-react-pill">😂 <span class="hiw-react-n">1</span></span></div>`)}
    ${msgHtml(CHAT[1])}`;
  const segs = CAPS.map((c, i) => `
    <button type="button" class="hiw-seg" data-step="${i}" aria-label="Step ${i + 1}: ${c.title}"><span><i></i></span></button>`).join('');

  return `
  <div class="hiw-stage" aria-hidden="true">
    <div class="hiw-scene hiw-draft">
      <div class="hiw-head"><span class="tg-section-label">Your board</span><span class="hiw-slots"></span></div>
      <div class="hiw-grid">${tiles}</div>
      <div class="hiw-strip"><span class="hiw-round"></span><span class="hiw-last"></span><span class="hiw-dir"></span></div>
    </div>
    <div class="hiw-scene hiw-finish">
      <div class="hiw-team">
        <span class="hiw-badge">DET</span>
        <span class="hiw-team-text"><span class="hiw-team-name">Lions</span><span class="hiw-team-sub">NFL · 11–3 · 1st in NFC North</span></span>
        <span class="hiw-team-pts"><span class="hiw-mini">Points</span><span class="hiw-finish-total"></span></span>
      </div>
      <div class="hiw-rules">${rules}</div>
    </div>
    <div class="hiw-scene hiw-scores">${scoreRows}</div>
    <div class="hiw-scene hiw-chat">${chat}</div>
    <div class="hiw-scene hiw-lock">
      <div class="hiw-head"><span class="welcome-eyebrow">Your projected points</span><span class="pts-tag hiw-lock-tag"></span></div>
      <div class="hiw-proj"></div>
      <div class="split-bar lg hiw-lock-bar"><span class="lk"></span><span class="lv"></span></div>
      <div class="hiw-legend">
        <span><i class="split-swatch lk"></i>Locked <b class="hiw-lk-n"></b></span>
        <span><i class="split-swatch lv"></i>Live <b class="hiw-lv-n"></b></span>
      </div>
      <div class="hiw-season">
        <div class="hiw-season-labels"><span>Opening day</span><span>Playoffs</span><span>Final</span></div>
        <div class="hiw-track"><i class="hiw-track-fill"></i><i class="hiw-track-dot"></i></div>
        <div class="hiw-season-note"></div>
      </div>
    </div>
    <div class="hiw-scene hiw-board">
      <div class="hiw-head hiw-board-head"><span class="tg-section-label">Points</span></div>
      <div class="hiw-ladder">${ladder}</div>
    </div>
  </div>
  <div class="hiw-caption">
    <div class="welcome-eyebrow hiw-eyebrow"></div>
    <h2 class="hiw-title"></h2>
    <p class="hiw-body"></p>
  </div>
  <div class="hiw-controls">
    ${segs}
    <button type="button" class="hiw-play" aria-label="Pause">
      <svg class="i-pause" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2" width="3" height="10" rx="1"/><rect x="8.5" y="2" width="3" height="10" rx="1"/></svg>
      <svg class="i-play" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z"/></svg>
    </button>
  </div>`;
}

export function initExplainer(root){
  if(!root) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.innerHTML = markup();
  root.classList.toggle('still', reduce);

  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const scenes = $$('.hiw-scene'), segs = $$('.hiw-seg'), play = $('.hiw-play');
  const tiles = $$('.hiw-tile').map(t => ({ el: t, cap: t.querySelector('.hiw-cap'), pips: [...t.querySelectorAll('.hiw-pip')] }));
  const rules = $$('.hiw-rule');
  const rows = $$('.hiw-lrow');
  const scoreCards = $$('.hiw-scores .tg-row'), msgs = $$('.hiw-chat .hiw-msg');

  // Only touch the DOM when a value actually changes, since render() runs
  // every frame and most values hold still for most of a step.
  const last = new Map();
  function set(el, key, val, apply){
    let m = last.get(el);
    if(!m){ m = {}; last.set(el, m); }
    if(m[key] === val) return;
    m[key] = val;
    apply(val);
  }
  const text = (el, v) => set(el, 'text', v, x => { el.textContent = x; });
  const cls = (el, c, on) => set(el, 'c:' + c, on, x => el.classList.toggle(c, x));
  const css = (el, prop, v) => set(el, 's:' + prop, v, x => el.style.setProperty(prop, x));

  let step = 0, elapsed = reduce ? STEP_MS : 0, userPaused = reduce, visible = true, raf = 0, prevT = 0;

  function drawDraft(p){
    const picks = Math.max(0, Math.min(TOTAL, Math.floor((p - 0.05) / PICK_GAP) + 1));
    const made = PICKS.slice(0, picks);
    text($('.hiw-slots'), `${picks} of ${TOTAL} slots`);
    SLOTS.forEach(([league, cap], i) => {
      const mine = made.filter(m => m[0] === league), t = tiles[i];
      text(t.cap, `${mine.length}/${cap}`);
      cls(t.el, 'full', mine.length === cap);
      t.pips.forEach((pip, j) => {
        cls(pip, 'on', !!mine[j]);
        if(mine[j]) css(pip, '--pip', mine[j][2]);
      });
    });
    const lastPick = made[made.length - 1], round = Math.max(1, picks);
    text($('.hiw-round'), picks >= TOTAL ? 'Board full' : `Round ${round}`);
    text($('.hiw-last'), lastPick ? `${lastPick[1]} (${lastPick[0]})` : 'Lottery sets the order');
    text($('.hiw-dir'), picks >= TOTAL ? `${TOTAL} rounds` : (round % 2 ? 'Picks 1 → 10' : 'Picks 10 → 1'));
  }

  function drawFinish(p){
    let total = 0;
    RULES.forEach((r, i) => {
      const hit = r.at !== undefined && p >= r.at;
      if(hit) total += r.pts;
      cls(rules[i], 'lit', hit);
    });
    const tot = $('.hiw-finish-total');
    text(tot, total ? '+' + total : '0');
    cls(tot, 'on', total > 0);
  }

  function drawLock(p){
    const locked = p >= LOCK_AT;
    const lk = locked ? 12 : 8;
    const lv = locked ? 0 : (p < 0.2 ? 3 : p < 0.38 ? 5 : p < 0.52 ? 2 : 4);
    cls(root.querySelector('.hiw-lock'), 'locked', locked);
    const tag = $('.hiw-lock-tag');
    cls(tag, 'live', !locked);
    cls(tag, 'lock-in', locked);
    text(tag, locked ? 'Locked in' : 'Live');
    text($('.hiw-proj'), String(lk + lv));
    css($('.hiw-lock-bar .lk'), 'width', (lk / LOCK_SCALE) * 100 + '%');
    css($('.hiw-lock-bar .lv'), 'width', (lv / LOCK_SCALE) * 100 + '%');
    text($('.hiw-lk-n'), String(lk));
    text($('.hiw-lv-n'), lv ? '+' + lv : '0');
    css(root.querySelector('.hiw-track'), '--season', Math.min(100, Math.round((p / LOCK_AT) * 100)) + '%');
    text($('.hiw-season-note'), locked ? 'Season over. NHL points are final.'
      : p < 0.45 ? 'NHL regular season. Standings move every night.' : 'NHL playoffs. Still live.');
  }

  function drawBoard(p){
    // Your teams pick up 5 live points and you pass Isaac.
    const landed = p >= 0.4;
    const live = BOARD.map(d => d.lv + (d.me && landed ? 5 : 0));
    const totals = BOARD.map((d, i) => d.lk + live[i]);
    // Ties go to You, so the swap reads as You passing Isaac.
    const order = BOARD.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || (BOARD[b].me ? 1 : 0) - (BOARD[a].me ? 1 : 0));
    rows.forEach((row, i) => {
      const rank = order.indexOf(i);
      css(row, 'top', rank * 52 + 'px');
      cls(row, 'first', rank === 0);
      text(row.querySelector('.hiw-rank'), String(rank + 1));
      text(row.querySelector('.hiw-total'), String(totals[i]));
      css(row.querySelector('.lk'), 'width', (BOARD[i].lk / LADDER_SCALE) * 100 + '%');
      css(row.querySelector('.lv'), 'width', (live[i] / LADDER_SCALE) * 100 + '%');
    });
  }

  function drawScores(p){
    const scored = p >= SCORE_AT;
    SCORES.forEach((g, i) => {
      const row = scoreCards[i];
      // NFL's clock runs on after the score; the EPL minute ticks along.
      const clock = g.lg === 'NFL' ? `${g.clock[0]}<br>${scored ? g.clock[2] : g.clock[1]}`
        : `${78 + Math.min(6, Math.floor(p * 7))}′`;
      set(row.querySelector('.tg-rail-bot'), 'html', clock, x => { row.querySelector('.tg-rail-bot').innerHTML = x; });
      row.querySelectorAll('.tg-score').forEach((el, j) => text(el, String(g.sides[j].score[scored ? 1 : 0])));
    });
    // The app's own "just scored" flash, replayed each time the step runs.
    const card = scoreCards[0].querySelector('.tg-card');
    set(card, 'flash', scored && p < SCORE_AT + 0.3, on => {
      card.classList.remove('just-scored');
      if(on){ void card.offsetWidth; card.classList.add('just-scored'); }
    });
  }

  function drawChat(p){
    cls(msgs[0], 'on', p >= 0.06);
    CHAT.forEach((m, i) => cls(msgs[i + 1], 'on', p >= m.at));
    cls($('.hiw-chat .chat-reactions'), 'on', p >= REACT_AT[0]);
    text($('.hiw-react-n'), p >= REACT_AT[1] ? '2' : '1');
  }

  // Same order as CAPS and the scenes in markup().
  const DRAW = [drawDraft, drawFinish, drawScores, drawChat, drawLock, drawBoard];
  const STEPS = DRAW.length;

  function render(){
    const p = Math.min(1, elapsed / STEP_MS), prev = (step + STEPS - 1) % STEPS;
    scenes.forEach((sc, i) => {
      cls(sc, 'on', i === step);
      cls(sc, 'past', i === prev && !reduce);
    });
    DRAW[step](p);
    if(!reduce) DRAW[prev](1);
    segs.forEach((b, i) => {
      css(b, '--fill', (i < step ? 100 : i === step ? p * 100 : 0) + '%');
      set(b, 'cur', i === step, on => on ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
    });
    const cap = CAPS[step];
    text($('.hiw-eyebrow'), `${step + 1} of ${STEPS}`);
    text($('.hiw-title'), cap.title);
    text($('.hiw-body'), cap.body);
  }

  // The launch splash (js/launch-splash.js) is still playing over the page:
  // hold the first frame so step 1 starts once the page is actually in view,
  // not behind the intro. The splash removes itself when done or skipped.
  let intro = !!document.getElementById('launch-splash');
  if(intro) window.addEventListener('bx-splash-done', () => { intro = false; resume(); }, { once: true });

  const running = () => !userPaused && visible && !document.hidden && !intro;

  function tick(t){
    raf = 0;
    if(!running()) return;
    // Clamp the frame gap so a stalled tab doesn't skip a whole step.
    elapsed += Math.min(100, t - prevT);
    prevT = t;
    if(elapsed >= STEP_MS){ elapsed = 0; step = (step + 1) % STEPS; }
    render();
    raf = requestAnimationFrame(tick);
  }
  function resume(){
    if(raf || !running()) return;
    prevT = performance.now();
    raf = requestAnimationFrame(tick);
  }

  segs.forEach(b => b.addEventListener('click', () => {
    step = +b.dataset.step;
    elapsed = reduce ? STEP_MS : 0;
    render();
  }));
  play.addEventListener('click', () => {
    userPaused = !userPaused;
    root.classList.toggle('paused', userPaused);
    play.setAttribute('aria-label', userPaused ? 'Play' : 'Pause');
    resume();
  });
  document.addEventListener('visibilitychange', resume);
  if('IntersectionObserver' in window){
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); }).observe(root);
  }

  root.classList.toggle('paused', userPaused);
  render();
  resume();
}
