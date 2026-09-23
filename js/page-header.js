/* Shared page-header chrome. Every view's .page-header-top in
   index.html holds only what's unique to it (h1, scope chip, chat
   status…); this fills in the logo on the left and the Settings
   button on the right so all headers stay identical. Loaded as a
   plain synchronous script just before the tab bar, so it runs before
   first paint and before js/board.js registers the window handlers
   the inline onclicks call. Opt a header out of the Settings button
   with data-settings="off". */
(function(){
  var LOGO = '<a class="app-logo-link" href="#" onclick="switchView(\'board\'); return false;" aria-label="Home">'
    + '<img class="app-logo" src="icons/logo-header.png" alt=""></a>';
  var SETTINGS = '<button class="picker-hit" onclick="openSettingsSheet()" aria-label="Settings">'
    + '<span class="settings-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span></button>';
  var tops = document.querySelectorAll('.page-header-top');
  for(var i = 0; i < tops.length; i++){
    var top = tops[i];
    if(!top.querySelector('.app-logo-link')) top.insertAdjacentHTML('afterbegin', LOGO);
    if(top.getAttribute('data-settings') !== 'off' && !top.querySelector('.picker-hit')){
      top.insertAdjacentHTML('beforeend', SETTINGS);
    }
  }
})();
