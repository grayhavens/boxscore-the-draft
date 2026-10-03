/* ============================================================
   The playoffs reveal: the one-time transition from the regular season to
   the postseason ladder, inside an NFL or CFB Standings card. Design: the
   "Playoffs announcement" handoff (variant D / option 2a).

   Until a league's field is set its card has no Regular | Postseason
   toggle. The first time this device opens that league's Standings tab
   after the field is set, the card announces it (about 8s, 10s with a logo):

     500   a gold hero strip opens under the card header
     800   "NFL Playoffs" rises letter by letter
     1500  the seeded teams pop in, in seed order
     2800  how many of your teams made it
     4000  the toggle emerges in the header, loud: gold, ringing, glowing
     5600  it flips to Postseason, the hero folds away and the same badges
           travel down into their rungs on the ladder (Field set)
     8000  the toggle settles to its ordinary look

   With a league logo (postseasonLogo: the NFL's shield from ESPN, the
   CFP's emblem and wordmark from icons/) the strip opens on it instead,
   large and centered: the shield with "Playoffs" rising underneath, or
   the CFP lockup (stacked in light theme, side by side in dark, like its
   artwork). Both parts then dock into the strip's title row (FLIP onto
   hidden slots there) and the rest follows, shifted by LOGO_SHIFT. At the
   flip they fly down into the ladder's title with the badges.

   The badges are one set of elements in a layer over the card; their
   ladder slots are measured from the ladder itself (FLIP), so they land
   exactly where the real chips are, which then take over.

   Seen once per league and season per device (markRevealSeen, at the
   start). Leaving Standings, picking another league or tapping the toggle
   ends it at once on the end state; reduced motion skips straight there.
   While it runs Standings doesn't re-render (postseasonRevealBusy), so a
   data refresh can't cut it off; it renders once at the end.
   ============================================================ */
import { PRE_DRAFT } from './data.js';
import { currentProfileId } from './identity.js';
import { canAnimateLive } from './motion.js';
import { reducedMotion } from './utils.js';
import { escapeHtml } from './escape.js';
import { renderStandings } from './board.js';
import {
  bracketFor, snap, postseasonYear, postseasonLogo, logoImgsHtml, badgeOf, ownerLabel, revealSeen, markRevealSeen,
  postseasonToggleHtml, postseasonCardHtml, showFieldSet, onPostseasonPhaseTap
} from './postseason.js';

const STEPS = [[500, 'open'], [800, 'title'], [1500, 'teams'], [2800, 'mine'], [4000, 'toggle'], [5600, 'flip'], [8000, 'settle']];
// The logo opening: the logo fades in as the strip opens, "Playoffs" rises
// under it, then both dock; everything from the teams on comes later.
const LOGO_SHIFT = 1900;
const LOGO_STEPS = [[500, 'open'], [1150, 'word'], [2700, 'dock'],
  ...STEPS.filter(([, s]) => !['open', 'title'].includes(s)).map(([ms, s]) => [ms + LOGO_SHIFT, s])];
const HERO_GRID_TOP = 88, HERO_ROW = 50;

let run = null; // { key, card, timers, chips }
let retry = 0;

export function postseasonRevealBusy(){ return !!run; }

// After each Standings render: start the reveal if this league's tab is
// showing, its field is set and this device hasn't seen it.
export function maybeStartPostseasonReveal(container, filterKey){
  if(run || !['nfl', 'cfb'].includes(filterKey)) return;
  const key = filterKey;
  if(!bracketFor(key) || revealSeen(key)) return;
  if(reducedMotion()){
    markRevealSeen(key);
    showFieldSet(key);
    queueMicrotask(renderStandings);
    return;
  }
  // Motion turns on just after boot: a launch straight into Standings
  // waits for it rather than losing the moment.
  if(!canAnimateLive()){
    clearTimeout(retry);
    retry = setTimeout(renderStandings, 700);
    return;
  }
  const card = container.querySelector(`.league[data-league="${key}"]`);
  if(!card) return;
  start(key, card);
}

// Jump to the end: toggle on Postseason (or the tapped phase), ladder at
// the field set.
export function endPostseasonReveal(){
  if(!run) return false;
  run.timers.forEach(clearTimeout);
  const { key } = run;
  run = null;
  showFieldSet(key);
  renderStandings();
  return true;
}

// A tap on the toggle mid-reveal ends it there and applies the tap
// (js/postseason.js's setPhase goes on to render it).
onPostseasonPhaseTap((key, phase) => {
  if(!run || run.key !== key) return false;
  run.timers.forEach(clearTimeout);
  run = null;
  showFieldSet(key);
  return false;
});

function titleHtml(text){
  return [...text].map((ch, i) => `<span style="transition-delay:${i * 35}ms">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`).join('');
}

function start(key, card){
  markRevealSeen(key);
  const year = postseasonYear();
  const S = snap(key, 0);
  const nfl = key === 'nfl';
  // Hero order: the AFC then the NFC, each by seed (seeds 1-6, 7-12 for the CFP).
  const hero = S.teams.slice().sort((a, b) => nfl ? (a.conf || '').localeCompare(b.conf || '') || (a.seed ?? 99) - (b.seed ?? 99) : (a.seed ?? 99) - (b.seed ?? 99));
  const travel = S.teams.slice().sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || (a.conf || '').localeCompare(b.conf || ''));
  const mine = S.teams.filter(t => t.mine).length;
  const showMine = !PRE_DRAFT && !!currentProfileId;

  const logo = postseasonLogo(key);
  card.classList.add('ps-revealing');
  const header = card.querySelector('.league-tab');
  const imgs = logoImgsHtml;
  const title = nfl ? 'NFL Playoffs' : 'College Football Playoff';
  header.insertAdjacentHTML('afterend', `
    <div class="ps-hero${nfl ? '' : ' long'}${logo ? ' with-logo' : ''}">
      <div class="ps-hero-in">
        <div class="ps-hero-head">
          <div class="ps-hero-eyebrow">Field set · ${year}–${String(year + 1).slice(2)}</div>
          ${logo
            ? `<div class="ps-hero-title" aria-label="${title}"><span class="ps-hero-logo-slot${logo.wordmark ? ' mark' : ''}"></span><span class="ps-hero-word-slot${logo.wordmark ? ' mark' : ''}">${logo.wordmark ? '' : 'Playoffs'}</span></div>`
            : `<div class="ps-hero-title">${titleHtml(title)}</div>`}
        </div>
        ${logo ? `<div class="ps-hero-intro${logo.wordmark ? ' lockup' : ''}" aria-hidden="true">
          <div class="ps-hero-logo">${imgs(logo.emblem)}</div>
          <div class="ps-hero-word">${logo.wordmark ? imgs(logo.wordmark) : titleHtml('Playoffs')}</div>
        </div>` : ''}
        <div class="ps-hero-grid"></div>
        ${showMine ? `<div class="ps-hero-mine"><span>${mine}</span><span>${mine === 1 ? 'of your teams is' : 'of your teams are'} in the field</span></div>` : ''}
      </div>
    </div>`);
  const heroEl = card.querySelector('.ps-hero');
  const slot = card.querySelector('.ps-phase-slot');
  if(slot) slot.innerHTML = postseasonToggleHtml(key, 'reg');

  // The travelling badges, parked on their hero slots.
  const cols = nfl ? 7 : 6;
  const cardBox = card.getBoundingClientRect();
  const heroTop = heroEl.getBoundingClientRect().top - cardBox.top;
  const w = cardBox.width - 32, cell = w / cols;
  const fly = document.createElement('div');
  fly.className = 'ps-fly';
  fly.innerHTML = hero.map(t => `
    <div class="ps-chip ps-fly-chip seeded${t.mine ? ' mine' : ''}" data-team="${t.id}">
      <span class="ps-chip-badge">${badgeOf(t)}</span>
      <span class="ps-chip-owner">${nfl ? (t.conf || '?')[0] : '#'}${t.seed ?? ''}</span>
    </div>`).join('');
  card.appendChild(fly);
  const chips = hero.map((t, h) => {
    const el = fly.querySelector(`[data-team="${t.id}"]`);
    const x = 16 + (h % cols) * cell + cell / 2 - 20, y = heroTop + HERO_GRID_TOP + Math.floor(h / cols) * HERO_ROW;
    el.style.transform = `translate(${x}px, ${y}px) scale(0.3)`;
    return { t, el, x, y, h, n: travel.indexOf(t) };
  });

  run = { key, card, timers: [] };
  const at = (step, fn) => run.timers.push(setTimeout(() => {
    // The card went away under it (it shouldn't, Standings is held): end.
    if(!card.isConnected){ endPostseasonReveal(); return; }
    fn(step);
  }, step));
  (logo ? LOGO_STEPS : STEPS).forEach(([ms, step]) => at(ms, () => {
    card.dataset.psr = step;
    if(step === 'open') heroEl.classList.add('open');
    if(step === 'title' || step === 'word') heroEl.classList.add('title-in');
    if(step === 'dock') dockLogo(heroEl);
    if(step === 'teams') chips.forEach(c => {
      c.el.style.transitionDelay = `${c.h * 70}ms`;
      c.el.style.transform = `translate(${c.x}px, ${c.y}px) scale(1)`;
      c.el.classList.add('in');
    });
    if(step === 'mine') heroEl.classList.add('mine-in');
    if(step === 'toggle') emergeToggle(card);
    if(step === 'flip') flip(key, card, heroEl, chips);
    if(step === 'settle') finish(key);
  }));
}

// The big logo and "Playoffs" move from the middle of the strip onto their
// slots in its title row, shrinking to fit; the eyebrow comes in above.
function dockLogo(heroEl){
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height });
  const move = (el, slot) => {
    if(!el || !slot) return;
    const a = center(el.getBoundingClientRect()), b = center(slot.getBoundingClientRect());
    el.style.transform = `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.h / a.h})`;
  };
  move(heroEl.querySelector('.ps-hero-logo'), heroEl.querySelector('.ps-hero-logo-slot'));
  move(heroEl.querySelector('.ps-hero-word'), heroEl.querySelector('.ps-hero-word-slot'));
  heroEl.classList.add('docked');
}

function emergeToggle(card){
  const slot = card.querySelector('.ps-phase-slot');
  const tg = slot && slot.querySelector('.ps-phase');
  if(!tg) return;
  slot.classList.add('open');
  tg.classList.add('loud', 'big');
  tg.insertAdjacentHTML('beforeend', [0, 1, 2].map(i => `<span class="ps-tg-ring" style="animation-delay:${350 + i * 400}ms"></span>`).join(''));
  // Clipped while it grows out of the header, then free for the rings.
  run.timers.push(setTimeout(() => slot.classList.add('free'), 560));
}

function flip(key, card, heroEl, chips){
  // The toggle: thumb to Postseason, solid gold.
  const tg = card.querySelector('.ps-phase');
  if(tg){
    tg.classList.remove('big');
    tg.classList.add('on-post');
    const thumb = tg.querySelector('.seg-thumb');
    if(thumb) thumb.style.transform = 'translateX(100%)';
    tg.querySelectorAll('.seg-btn').forEach((b, i) => b.classList.toggle('active', i === 1));
  }

  // The regular table swaps out for the ladder, its own chips hidden
  // until the travelling ones land on them.
  [...card.children].forEach(el => { if(el !== card.querySelector('.league-tab') && el !== heroEl && !el.classList.contains('ps-fly')) el.remove(); });
  showFieldSet(key);
  heroEl.insertAdjacentHTML('afterend', postseasonCardHtml(key));
  const ps = card.querySelector('.ps');
  ps.classList.add('ps-arriving');
  const rungs = [...ps.querySelectorAll('.ps-rung')];
  rungs.forEach((r, i) => { r.style.transitionDelay = `${(rungs.length - 1 - i) * 60}ms`; });

  // Each chip's ladder slot, where it will be once the hero above it has
  // folded away (everything below moves up by its height). Then fold it:
  // badges and rungs arrive together.
  const cardBox = card.getBoundingClientRect();
  const fold = heroEl.getBoundingClientRect().height;
  const targets = {};
  ps.querySelectorAll('.ps-chip').forEach(el => {
    const r = el.getBoundingClientRect();
    targets[el.dataset.team] = { x: r.left - cardBox.left, y: r.top - cardBox.top - fold };
  });
  // The logo and "Playoffs" fly down into the ladder's title the same way:
  // a copy of each title part, laid on its final spot and started from where
  // the docked hero part is now (FLIP), so the folding hero can't clip it.
  const brand = [['.ps-hero-logo', '.ps-brand-logo'], ['.ps-hero-word', '.ps-brand-word']].map(([fromSel, toSel]) => {
    const from = heroEl.querySelector(fromSel), to = ps.querySelector(toSel);
    if(!from || !to) return null;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const copy = to.cloneNode(true);
    copy.classList.add('ps-fly-brand');
    Object.assign(copy.style, { margin: '0', left: `${b.left - cardBox.left}px`, top: `${b.top - cardBox.top - fold}px`, width: `${b.width}px`, height: `${b.height}px` });
    copy.style.transform = `translate(${(a.left + a.width / 2) - (b.left + b.width / 2)}px, ${(a.top + a.height / 2) - (b.top + b.height / 2 - fold)}px) scale(${a.height / b.height})`;
    card.querySelector('.ps-fly').appendChild(copy);
    from.style.visibility = 'hidden';
    return copy;
  }).filter(Boolean);
  heroEl.classList.remove('open');
  requestAnimationFrame(() => requestAnimationFrame(() => brand.forEach(el => { el.style.transform = 'none'; })));
  requestAnimationFrame(() => ps.classList.add('ps-rungs-in'));

  chips.forEach(c => {
    const to = targets[c.t.id];
    if(!to) return;
    c.el.style.transitionDelay = `${c.n * 45}ms`;
    c.el.style.transform = `translate(${to.x}px, ${to.y}px) scale(1)`;
    c.el.classList.remove('seeded');
    c.el.classList.add('landed');
    c.el.querySelector('.ps-chip-owner').textContent = ownerLabel(c.t);
  });
  // Once the last one lands, the ladder's own chips take over.
  run.timers.push(setTimeout(() => {
    ps.classList.remove('ps-arriving');
    card.querySelector('.ps-fly')?.remove();
  }, 760 + chips.length * 45 + 60));
}

// The toggle settles and Standings renders the ordinary Postseason view.
function finish(key){
  if(!run || run.key !== key) return;
  run.timers.forEach(clearTimeout);
  run = null;
  renderStandings();
}
