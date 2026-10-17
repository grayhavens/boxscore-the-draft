/* Shared page-header chrome. Every view's .page-header-top in
   index.html holds only what's unique to it (h1, scope chip, chat
   status…); this fills in the logo on the left and the Settings
   button on the right so all headers stay identical. Loaded as a
   plain synchronous script just before the tab bar, so it runs before
   first paint and before js/board.js registers the window handlers
   the inline onclicks call. Opt a header out of the Settings button
   with data-settings="off".

   It also builds the title bar (.title-bar in css/style.css): when a tab
   view's large title (.view > .page-header h1) scrolls up under the status
   bar, the same title shows small and centered on a glass bar, with the
   view's Settings button, the way iOS collapses a large title. An
   IntersectionObserver on the titles drives it, so nothing runs per scroll
   frame. Chat and the draft room keep their own fixed headers (their
   .page-header isn't a direct child of the view), and team pages have
   their compact bar. */
(function(){
  var LOGO = '<a class="app-logo-link" href="#" onclick="switchView(\'board\'); return false;" aria-label="Home">'
    + '<img class="app-logo" src="icons/logo-header.png" alt=""></a>';
  var SETTINGS = '<button class="picker-hit" onclick="openSettings()" aria-label="Settings">'
    + '<span class="settings-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span></button>';
  var tops = document.querySelectorAll('.page-header-top');
  for(var i = 0; i < tops.length; i++){
    var top = tops[i];
    if(!top.querySelector('.app-logo-link')) top.insertAdjacentHTML('afterbegin', LOGO);
    if(top.getAttribute('data-settings') !== 'off' && !top.querySelector('.picker-hit')){
      top.insertAdjacentHTML('beforeend', SETTINGS);
    }
  }

  // ---- Title bar ----
  var titles = document.querySelectorAll('.view > .page-header h1');
  if(!titles.length || !window.IntersectionObserver) return;
  var bar = document.createElement('div');
  bar.className = 'title-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<span class="title-bar-title"></span>' + SETTINGS;
  var label = bar.firstChild;
  var gear = bar.querySelector('.picker-hit');
  gear.tabIndex = -1;
  document.body.appendChild(bar);
  var root = document.documentElement;
  var shown = null;

  // Where a title counts as gone: the bottom of the status-bar strip. The
  // bar shows only once the large title has slid all the way under it, so
  // at the top of a page (title fully in view, its bottom only a few px
  // above where the bar's edge would be) it never does, and the bar never
  // sits over a title you can still read. Null in the wide layout
  // (--title-bar-h is 0 there), where the bar never shows.
  function goneLine(){
    var h = parseFloat(getComputedStyle(root).getPropertyValue('--title-bar-h')) || 0;
    if(!h) return null;
    var cover = document.querySelector('.safe-area-top');
    return cover ? cover.getBoundingClientRect().height : 0;
  }
  function update(){
    var view = document.querySelector('.view.active');
    var h1 = view && view.querySelector(':scope > .page-header h1');
    var line = goneLine();
    var on = !!(h1 && line !== null && h1.getBoundingClientRect().bottom <= line);
    if(on){
      label.textContent = h1.textContent.trim();
      gear.style.display = view.querySelector(':scope > .page-header .picker-hit') ? '' : 'none';
    }
    if(on === shown) return;
    shown = on;
    root.classList.toggle('title-bar-on', on);
  }
  var io = null;
  function observe(){
    if(io) io.disconnect();
    io = new IntersectionObserver(update, { rootMargin: '-' + Math.round(goneLine() || 0) + 'px 0px 0px 0px' });
    for(var i = 0; i < titles.length; i++) io.observe(titles[i]);
  }
  observe();
  // A view switch shows another title; a resize can cross into the wide layout.
  document.addEventListener('bx:viewshown', update);
  window.addEventListener('resize', function(){ observe(); update(); });
})();
