/* Launch splash: option 3a "Draw, turn, fly + word", at 0.75x speed.
   Plays once per cold launch (sessionStorage resets when iOS kills the PWA),
   never with reduced motion. Tap anywhere to skip.
   Loaded as a plain synchronous <script> right after the #launch-splash
   markup in index.html, so the first frame paints before anything else.
   The flight lands on the real header logo (.view.active .app-logo, which
   js/page-header.js injects), measured at flight time so any ?view= deep
   link works. Change SPEED to retime everything. */
(function(){
  var root = document.getElementById('launch-splash');
  if(!root) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = false;
  try{ seen = sessionStorage.getItem('bx-splash') === '1'; sessionStorage.setItem('bx-splash', '1'); }catch(e){}
  if(seen || reduce || !root.animate){ root.remove(); return; }

  var SPEED = 0.75, S = 1 / SPEED, T = 3100;
  var EO = 'cubic-bezier(0.22,1,0.36,1)', EI = 'cubic-bezier(0.55,0,1,0.45)', IO = 'cubic-bezier(0.65,0,0.35,1)';
  var logo = root.querySelector('.ls-logo'), stage = root.querySelector('.ls-stage'), bg = root.querySelector('.ls-bg'),
      tl = root.querySelector('.ls-tl'), tlInk = tl.firstElementChild, br = root.querySelector('.ls-br'), brInk = br.firstElementChild,
      sq = root.querySelector('.ls-sq'), word = root.querySelector('.ls-word'),
      letters = [].slice.call(root.querySelectorAll('.ls-word span span'));
  var anims = [], timers = [], done = false;

  // Smoothness rules (the app is booting underneath all of this, so the
  // main thread is busy for most of the splash):
  // - Everything is transform/opacity, which the compositor runs on its
  //   own; nothing animates clip-path or layout (Safari runs those on the
  //   main thread, where boot work stutters them).
  // - Every animation is pinned to one clock (t0 on document.timeline), so
  //   one created late still lines up with the rest instead of starting
  //   whenever its setTimeout finally got to run.
  // - The exit (flight + Home reveal) is built well before it plays, as
  //   soon as the page underneath exists, rather than at the moment it
  //   starts — a timer that fires late then can't stall the logo mid-air.
  var t0 = document.timeline ? document.timeline.currentTime : null;

  // frames: [ms, {css}, easingIntoNext?] on the authored 3.1s timeline; `from` is where
  // this animation's own keyframes begin (it's scheduled to start at that authored time).
  function seq(el, frames, from){
    from = from || 0;
    frames = frames.slice().sort(function(a, b){ return a[0] - b[0]; });
    var last = frames[frames.length - 1], end = Math.max(T, last[0]), span = end - from;
    // Hold the last frame to the end; otherwise the browser eases back to
    // the element's resting style over the leftover time.
    if(last[0] < end) frames.push([end, last[1]]);
    var kf = frames.map(function(f){ var k = {}; for(var p in f[1]) k[p] = f[1][p]; k.offset = (f[0] - from) / span; k.easing = f[2] || EO; return k; });
    var a = el.animate(kf, { duration: span * S, fill: 'both' });
    if(t0 != null) a.startTime = t0 + from * S;
    anims.push(a);
    return a;
  }
  function at(ms, fn){ timers.push(setTimeout(fn, ms * S)); }
  function M(x, y, r, s, o){ return { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg) scale(' + s + ')', opacity: o == null ? 1 : o }; }
  function T2(x, y){ return { transform: 'translate(' + x + '%,' + y + '%)' }; }

  // 1. Build: live dot → square, brackets draw from their corners. Each
  // bracket is a clip window sliding in from its corner while the ink
  // inside slides the opposite way by the same amount, so the ink holds
  // still and is revealed corner-first (same look as the old clip-path).
  seq(sq, [[0, { transform: 'scale(0)' }], [120, { transform: 'scale(0)' }], [420, { transform: 'scale(0.34)' }, IO],
    [600, { transform: 'scale(0.26)' }, IO], [780, { transform: 'scale(0.34)' }, IO], [1020, { transform: 'scale(1.14)' }, IO],
    [1180, { transform: 'scale(1)' }], [T, { transform: 'scale(1)' }]]);
  function wipe(win, ink, d, a, b){
    seq(win, [[0, T2(-d, -d)], [a, T2(-d, -d)], [b, T2(0, 0)], [T, T2(0, 0)]]);
    seq(ink, [[0, T2(d, d)], [a, T2(d, d)], [b, T2(0, 0)], [T, T2(0, 0)]]);
  }
  wipe(tl, tlInk, 100, 960, 1340);
  wipe(br, brInk, -100, 1060, 1440);

  // 2. Wordmark rises in, holds through the turn, lifts out before the flight.
  letters.forEach(function(l, j){
    var a = 1100 + j * 45, b = 2020 + j * 28;
    seq(l, [[0, { transform: 'translateY(110%)', opacity: 1 }], [a, { transform: 'translateY(110%)', opacity: 1 }],
      [a + 560, { transform: 'translateY(0%)', opacity: 1 }], [b, { transform: 'translateY(0%)', opacity: 1 }, EI],
      [b + 300, { transform: 'translateY(-110%)', opacity: 0 }], [T, { transform: 'translateY(-110%)', opacity: 0 }]]);
  });
  // The wordmark is Space Grotesk. If it hasn't arrived by the time the
  // letters start rising, leave the word out rather than let it swap
  // fonts mid-rise; the mark alone still reads.
  at(1060, function(){
    if(done || !document.fonts || !document.fonts.forEach) return;
    var ready = false;
    document.fonts.forEach(function(f){ if(/Space Grotesk/.test(f.family) && String(f.weight) === '700' && f.status === 'loaded') ready = true; });
    if(!ready) word.style.visibility = 'hidden';
  });

  // 3. Half-turn + anticipation swell.
  var TURN = [[0, M(0, -26, 0, 1)], [1480, M(0, -26, 0, 1), IO], [1980, M(0, -26, 180, 1), IO], [2280, M(0, -26, 180, 1.05), IO]];
  var turn = seq(logo, TURN);

  // 4 + 5, built ahead of time (see the rules above) once the page's own
  // header and active view exist.
  function buildExit(){
    if(done) return;
    // 4. Flight into the real header logo. The mark's center is the stage's
    // center (rotation and scale don't move it), so the target can be
    // measured before the turn has finished.
    var img = document.querySelector('.view.active .app-logo');
    var st = stage.getBoundingClientRect();
    var cx = st.left + st.width / 2, cy = st.top + st.height / 2;
    var dx = 0, dy = -window.innerHeight / 2, s = 0.15;
    if(img){
      var r = img.getBoundingClientRect();
      dx = r.left + r.width / 2 - cx; dy = r.top + r.height / 2 - cy;
      s = r.width / logo.offsetWidth;
    }
    // Handoff: the mark lands exactly on the header logo's pixels, the real
    // logo switches on at full opacity underneath it, and only then does the
    // mark fade. No crossfade (two half-transparent layers read as a dim
    // flicker). The turn is swapped for the same keyframes plus the flight in
    // one step, so nothing jumps.
    turn.cancel();
    anims.splice(anims.indexOf(turn), 1);
    seq(logo, TURN.concat([[2800, M(dx, dy, 180, s)], [2880, M(dx, dy, 180, s, 0)]]));
    if(img) seq(img, [[0, { opacity: 0 }], [2800, { opacity: 0 }], [2800, { opacity: 1 }], [T, { opacity: 1 }]]);

    // 5. Reveal Home underneath: splash ground fades, the active view's blocks cascade up.
    seq(bg, [[2400, { opacity: 1 }], [2660, { opacity: 0 }], [T, { opacity: 0 }]], 2400);
    var blocks = [].slice.call(document.querySelectorAll('.view.active > *')).slice(0, 8);
    blocks.forEach(function(el, j){
      var t = 2460 + j * 55;
      seq(el, [[2400, { opacity: 0, transform: 'translateY(18px)' }], [t, { opacity: 0, transform: 'translateY(18px)' }],
        [t + 520, { opacity: 1, transform: 'translateY(0px)' }]], 2400);
    });
    var bar = document.querySelector('.tab-bar');
    if(bar) seq(bar, [[2400, { transform: 'translateY(100%)' }], [2500, { transform: 'translateY(100%)' }], [2980, { transform: 'translateY(0%)' }]], 2400);

    // Done once the last of it has landed, not at a fixed time that could
    // cut the tail of the cascade off.
    if(window.Promise) Promise.all(anims.map(function(a){ return a.finished; })).then(finish, function(){});
  }
  at(1200, function(){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildExit, { once: true });
    else buildExit();
  });
  at(2400, function(){ root.style.pointerEvents = 'none'; });

  // Clean up: cancel fill-both animations so no lingering transform breaks position:fixed children.
  function finish(){
    if(done) return;
    done = true;
    timers.forEach(clearTimeout);
    anims.forEach(function(a){ try{ a.cancel(); }catch(e){} });
    root.remove();
  }
  at(3700, finish); // safety net if the exit never got built
  // click, not pointerdown: the splash is still the click's target, so the
  // skipping tap can't land on whatever sits underneath it.
  root.addEventListener('click', finish, { once: true });
})();
