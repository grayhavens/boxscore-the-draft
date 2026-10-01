/* Live effects: the small Web Animations helpers behind docs/motion-plan.md
   (draft room first; Scores, Points, the team page and chat later).

   Callers compare state between renders and play an effect only when
   something actually changed, after the new DOM is written. Every helper
   here does nothing unless fxOn() (motion enabled after boot, no reduced
   motion, page visible), and every effect ends on exactly what the plain
   render shows, so a dropped or skipped effect loses nothing.

   el.animate() keyframes stay transform and opacity. Anything with color
   (a tint, a ring, a sheen) is a .fx-* layer whose color comes from CSS
   tokens (css/style.css, "Live effects"), animated by its opacity or
   position. Curves and durations follow docs/motion-reference/*.jsx. */

import { canAnimateLive } from './motion.js';
import { EASE_OUT, EASE_SPRING, EASE_IN_OUT } from './utils.js';

// Mock draft rooms play everything at 2× (docs/motion-plan.md).
let speed = 1;
export function setMotionSpeed(k){ speed = k > 0 ? k : 1; }

export const fxOn = () => canAnimateLive() && !document.hidden;

// The one place durations and delays get scaled. `fill` defaults to
// 'backwards' so a delayed entrance holds its start frame, and never
// 'forwards', so the element is left in its own styles afterwards.
export function play(el, keyframes, { duration = 400, delay = 0, easing = EASE_OUT, fill = 'backwards', iterations = 1 } = {}){
  if(!el || !el.animate || !fxOn()) return null;
  return el.animate(keyframes, { duration: duration / speed, delay: delay / speed, easing, fill, iterations });
}

// setTimeout on the same clock as play(), for steps that aren't animations
// (the pick toast).
export function later(ms, fn){
  return setTimeout(fn, ms / speed);
}

const done = (anim, fn) => { if(anim) anim.finished.then(fn, fn); else fn(); };

// A throwaway layer inside `host` for color effects. The host is lifted to
// position: relative only if it was static, and only while a layer is in it.
function layer(host, cls, tint){
  const el = document.createElement('span');
  el.className = `fx-layer ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  if(tint) el.style.setProperty('--fx-tint', tint);
  const lift = getComputedStyle(host).position === 'static';
  if(lift) host.classList.add('fx-host');
  host.appendChild(el);
  return () => {
    el.remove();
    if(lift && !host.querySelector(':scope > .fx-layer')) host.classList.remove('fx-host', 'fx-clip');
  };
}

// A bump (scale up and back), or with `from`, an entrance that grows in.
export function pop(el, { scale = 1.06, from = null, duration = 420, delay = 0 } = {}){
  const keyframes = from === null
    ? [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }]
    : [{ opacity: 0, transform: `scale(${from})` }, { opacity: 1, transform: 'scale(1)' }];
  return play(el, keyframes, { duration, delay, easing: EASE_SPRING });
}

// A tint that flashes over `el` and fades out from `from` opacity. `tint`
// is any CSS color, var(--accent) by default.
export function flashTint(el, { tint = null, from = 0.55, duration = 700, delay = 0 } = {}){
  if(!el || !fxOn()) return null;
  const remove = layer(el, 'fx-flash', tint);
  const anim = play(el.lastElementChild, [{ opacity: from }, { opacity: 0 }], { duration, delay, easing: 'ease-out' });
  done(anim, remove);
  return anim;
}

// A gold ring that swells off `el`'s edge and fades, `iterations` times.
export function ringPulse(el, { duration = 900, delay = 0, iterations = 2 } = {}){
  if(!el || !fxOn()) return null;
  const remove = layer(el, 'fx-ring');
  const anim = play(el.lastElementChild, [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.07, 1.3)' }], { duration, delay, iterations, easing: 'ease-out' });
  done(anim, remove);
  return anim;
}

// A soft band of `tint` that sweeps across `el` once.
export function sheen(el, { tint = null, duration = 800, delay = 0 } = {}){
  if(!el || !fxOn()) return null;
  const remove = layer(el, 'fx-sheen', tint);
  el.classList.add('fx-clip');
  const anim = play(el.lastElementChild, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], { duration, delay, easing: 'ease-in-out' });
  done(anim, remove);
  return anim;
}

// The same keyframes on each element, `step` ms apart.
export function stagger(els, keyframes, { step = 55, delay = 0, duration = 420, easing = EASE_OUT } = {}){
  return [...els].map((el, i) => play(el, keyframes, { duration, delay: delay + i * step, easing }));
}

// A word that rises in letter by letter (the on-the-clock name). The text
// is split into masked letters for the effect and put back afterwards.
export function riseLetters(el, { delay = 0, step = 55, duration = 560 } = {}){
  if(!el || !fxOn()) return;
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map(c => `<span class="fx-letter" aria-hidden="true"><span>${c === ' ' ? '&nbsp;' : c.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x])}</span></span>`).join('');
  const anims = stagger(el.querySelectorAll('.fx-letter > span'), [{ transform: 'translateY(110%)' }, { transform: 'none' }], { step, delay, duration });
  const restore = () => { if(el.querySelector('.fx-letter')){ el.textContent = text; el.removeAttribute('aria-label'); } };
  Promise.all(anims.map(a => a && a.finished)).then(restore, restore);
}

// Roll every whole number in `el`'s text up from 0 (a stat strip's "6th",
// "9", "2-3-0"). An ordinal rolls up from 1st with its suffix kept right
// (1st, 2nd, 3rd … 6th), never "0th" or "1nd". Text with decimals or times
// (".750", "7:40") is left alone. Stops if something else rewrites the
// element meanwhile.
const ORDINAL = /^(st|nd|rd|th)\b/;
const ordinalSuffix = n => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
export function rollNumbers(el, { duration = 700, delay = 0 } = {}){
  if(!el || !fxOn()) return;
  const text = el.textContent;
  if(!/\d/.test(text) || /[.:]\d/.test(text)) return;
  const parts = text.split(/(\d+)/);
  const t0 = performance.now() + delay / speed, ms = duration / speed;
  let shown = null;
  const paint = k => {
    const e = 1 - Math.pow(1 - k, 3);
    const out = parts.slice();
    for(let i = 1; i < parts.length; i += 2){
      const ordinal = ORDINAL.test(parts[i + 1]);
      const n = Math.max(ordinal ? 1 : 0, Math.round(Number(parts[i]) * e));
      out[i] = String(n);
      if(ordinal) out[i + 1] = parts[i + 1].replace(ORDINAL, ordinalSuffix(n));
    }
    shown = out.join('');
    el.textContent = shown;
  };
  paint(0);
  const step = now => {
    if(!el.isConnected || el.textContent !== shown) return;
    const k = Math.max(0, Math.min(1, (now - t0) / ms));
    if(k >= 1){ el.textContent = text; return; }
    paint(k);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Dots that burst out of `host`'s center and fade (your own chat reaction
// landing). Their color comes from CSS (.fx-burst-dot).
export function burst(host, { count = 6, radius = 18, duration = 520, delay = 0 } = {}){
  if(!host || !fxOn()) return;
  const lift = getComputedStyle(host).position === 'static';
  if(lift) host.classList.add('fx-host');
  const anims = Array.from({ length: count }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = 'fx-burst-dot';
    dot.setAttribute('aria-hidden', 'true');
    host.appendChild(dot);
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(Math.cos(a) * radius), y = Math.round(Math.sin(a) * radius);
    const anim = play(dot, [{ opacity: 1, transform: 'translate(0, 0) scale(1)' }, { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.4)` }], { duration, delay, fill: 'both' });
    done(anim, () => dot.remove());
    return anim;
  });
  Promise.all(anims.map(a => a && a.finished)).then(() => { if(lift) host.classList.remove('fx-host'); }, () => {});
}

// A short sideways shake (time's up).
export function nudge(el){
  return play(el, [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 380 });
}

// Add a class whose CSS animation does the work (color keyframes belong in
// CSS), and take it off when `el`'s own animation ends (children's
// animationend events bubble up and are ignored).
export function playClass(el, cls){
  if(!el || !fxOn()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  const end = e => {
    if(e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', end);
  };
  el.addEventListener('animationend', end);
}

// Float a transient element (`html`, e.g. a "+1") up and out of `host`,
// then remove it.
export function floatUp(host, html, { duration = 1100, delay = 0 } = {}){
  if(!host || !fxOn()) return null;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const el = wrap.firstElementChild;
  const lift = getComputedStyle(host).position === 'static';
  if(lift) host.classList.add('fx-host');
  host.appendChild(el);
  const anim = play(el, [
    { opacity: 0, transform: 'translateY(4px)' },
    { opacity: 1, transform: 'translateY(-10px)', offset: 0.3 },
    { opacity: 0, transform: 'translateY(-26px)' }
  ], { duration, delay, fill: 'both' });
  done(anim, () => { el.remove(); if(lift) host.classList.remove('fx-host'); });
  return anim;
}

const onScreen = r => r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

// Fly `ghost` (a clone of the tapped crest, measured as `from` before the
// re-render) along an arc into `toEl`, which stays hidden until it lands.
// Returns when it lands, in unscaled ms (pass it on as a delay), or null if
// either end isn't on screen.
export function flyTo(ghost, from, toEl, { duration = 700, delay = 0 } = {}){
  if(!ghost || !from || !toEl || !fxOn()) return null;
  const to = toEl.getBoundingClientRect();
  if(!onScreen(from) || !onScreen(to) || !from.width) return null;
  ghost.classList.add('fx-fly');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.appendChild(ghost);
  const dx = to.left - from.left, dy = to.top - from.top, k = to.width / from.width;
  play(ghost, [
    { transform: 'translate(0, 0) scale(1)' },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 46}px) scale(1.25)`, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(${k})` }
  ], { duration, delay, easing: EASE_IN_OUT, fill: 'both' });
  const fade = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: delay + duration, fill: 'forwards' });
  play(toEl, [{ opacity: 0 }, { opacity: 0 }], { duration: delay + duration });
  done(fade, () => ghost.remove());
  return delay + duration;
}

// Big moments (your pick, draft complete) play once per event per device,
// however many times the room re-renders or the page reloads.
const SEEN_KEY = 'motionFxSeen';
export function once(key){
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch (e){}
  if(seen.includes(key)) return false;
  seen.push(key);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-100))); } catch (e){}
  return true;
}
