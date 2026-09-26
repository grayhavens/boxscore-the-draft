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
  var logo = root.querySelector('.ls-logo'), tl = root.querySelector('.ls-tl'), br = root.querySelector('.ls-br'),
      sq = root.querySelector('.ls-sq'), bg = root.querySelector('.ls-bg'),
      letters = [].slice.call(root.querySelectorAll('.ls-word span span'));
  var anims = [], timers = [], done = false;

  // frames: [ms, {css}, easingIntoNext?] on the authored 3.1s timeline; `from` offsets a late-started animation.
  function seq(el, frames, from){
    from = from || 0;
    frames = frames.slice().sort(function(a, b){ return a[0] - b[0]; });
    var end = Math.max(T, frames[frames.length - 1][0]), span = end - from;
    var kf = frames.map(function(f){ var k = {}; for(var p in f[1]) k[p] = f[1][p]; k.offset = (f[0] - from) / span; k.easing = f[2] || EO; return k; });
    var a = el.animate(kf, { duration: span * S, fill: 'both' });
    anims.push(a);
    return a;
  }
  function at(ms, fn){ timers.push(setTimeout(fn, ms * S)); }
  function M(x, y, r, s, o){ return { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg) scale(' + s + ')', opacity: o == null ? 1 : o }; }

  // 1. Build: live dot → square, brackets draw from their corners.
  seq(sq, [[0, { transform: 'scale(0)' }], [120, { transform: 'scale(0)' }], [420, { transform: 'scale(0.34)' }, IO],
    [600, { transform: 'scale(0.26)' }, IO], [780, { transform: 'scale(0.34)' }, IO], [1020, { transform: 'scale(1.14)' }, IO],
    [1180, { transform: 'scale(1)' }], [T, { transform: 'scale(1)' }]]);
  seq(tl, [[0, { clipPath: 'inset(0px 100% 100% 0px)' }], [960, { clipPath: 'inset(0px 100% 100% 0px)' }],
    [1340, { clipPath: 'inset(0px 0% 0% 0px)' }], [T, { clipPath: 'inset(0px 0% 0% 0px)' }]]);
  seq(br, [[0, { clipPath: 'inset(100% 0px 0px 100%)' }], [1060, { clipPath: 'inset(100% 0px 0px 100%)' }],
    [1440, { clipPath: 'inset(0% 0px 0px 0%)' }], [T, { clipPath: 'inset(0% 0px 0px 0%)' }]]);

  // 2. Wordmark rises in, holds through the turn, lifts out before the flight.
  letters.forEach(function(l, j){
    var a = 1100 + j * 45, b = 2020 + j * 28;
    seq(l, [[0, { transform: 'translateY(110%)', opacity: 1 }], [a, { transform: 'translateY(110%)', opacity: 1 }],
      [a + 560, { transform: 'translateY(0%)', opacity: 1 }], [b, { transform: 'translateY(0%)', opacity: 1 }, EI],
      [b + 300, { transform: 'translateY(-110%)', opacity: 0 }], [T, { transform: 'translateY(-110%)', opacity: 0 }]]);
  });

  // 3. Half-turn + anticipation swell.
  var turn = seq(logo, [[0, M(0, -26, 0, 1)], [1480, M(0, -26, 0, 1), IO], [1980, M(0, -26, 180, 1), IO], [2280, M(0, -26, 180, 1.05)]]);

  // 4. Flight into the real header logo (measured now: page-header.js has run by this point).
  at(2280, function(){
    if(done) return;
    var img = document.querySelector('.view.active .app-logo');
    var box = logo.getBoundingClientRect(); // includes the current transform
    var cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    var dx = 0, dy = -window.innerHeight / 2, s = 0.15;
    if(img){
      var r = img.getBoundingClientRect();
      dx = r.left + r.width / 2 - cx; dy = r.top + r.height / 2 - (cy + 26); // back out the -26px lift
      s = r.width / logo.offsetWidth;
      img.style.opacity = '0';
    }
    turn.cancel();
    // Handoff: the mark lands exactly on the header logo's pixels, so the real
    // logo switches on at full opacity underneath it and only then does the
    // mark fade. No crossfade (two half-transparent layers read as a dim
    // flicker), and it's driven by the flight's own finish, not a timer, so a
    // busy boot can't pull the two apart.
    var flight = logo.animate([
      { transform: M(0, -26, 180, 1.05).transform, easing: IO },
      { transform: M(dx, dy, 180, s).transform }
    ], { duration: (2800 - 2280) * S, fill: 'forwards' });
    anims.push(flight);
    flight.onfinish = function(){
      if(done) return;
      if(img) img.style.opacity = '';
      anims.push(logo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80 * S, fill: 'forwards' }));
    };
  });

  // 5. Reveal Home underneath: splash ground fades, the active view's blocks cascade up.
  at(2400, function(){
    if(done) return;
    seq(bg, [[2400, { opacity: 1 }], [2660, { opacity: 0 }], [T, { opacity: 0 }]], 2400);
    root.style.pointerEvents = 'none';
    var blocks = [].slice.call(document.querySelectorAll('.view.active > *')).slice(0, 8);
    blocks.forEach(function(el, j){
      var t = 2460 + j * 55;
      seq(el, [[2400, { opacity: 0, transform: 'translateY(18px)' }], [t, { opacity: 0, transform: 'translateY(18px)' }],
        [t + 520, { opacity: 1, transform: 'translateY(0px)' }]], 2400);
    });
    var bar = document.querySelector('.tab-bar');
    if(bar) seq(bar, [[2400, { transform: 'translateY(100%)' }], [2500, { transform: 'translateY(100%)' }], [2980, { transform: 'translateY(0%)' }]], 2400);
  });

  // Clean up: cancel fill-both animations so no lingering transform breaks position:fixed children.
  function finish(){
    if(done) return;
    done = true;
    timers.forEach(clearTimeout);
    anims.forEach(function(a){ try{ a.cancel(); }catch(e){} });
    var img = document.querySelector('.view.active .app-logo');
    if(img) img.style.opacity = '';
    root.remove();
  }
  at(3150, finish);
  // click, not pointerdown: the splash is still the click's target, so the
  // skipping tap can't land on whatever sits underneath it.
  root.addEventListener('click', finish, { once: true });
})();
