/* ============================================================
   Per-device preferences behind the gear in every header (the sheet
   itself is rendered by js/identity.js). Same no-auth, localStorage-only
   tier as the profile choice — nothing here is shared between devices.

   Defaults reproduce the app as it was before any setting existed
   (dark, opens on Teams, badge on), so nobody sees a change until they
   touch one.
   ============================================================ */

const KEY = 'teamDashboardSettings';

const DEFAULTS = { theme: 'dark', landing: 'board', chatBadge: true };

export const THEME_OPTIONS = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']];
export const LANDING_OPTIONS = [['board', 'Teams'], ['live-now', 'Scores'], ['standings', 'Standings'], ['overall', 'Points']];

const THEME_COLOR = { dark: '#0A0B0D', light: '#F4F3EF' };

function load(){
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      theme: THEME_OPTIONS.some(([v]) => v === saved.theme) ? saved.theme : DEFAULTS.theme,
      landing: LANDING_OPTIONS.some(([v]) => v === saved.landing) ? saved.landing : DEFAULTS.landing,
      chatBadge: typeof saved.chatBadge === 'boolean' ? saved.chatBadge : DEFAULTS.chatBadge
    };
  } catch (e){
    return { ...DEFAULTS };
  }
}

let settings = load();

export function getSettings(){ return settings; }

export function setSetting(key, value){
  settings = { ...settings, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e){}
  if(key === 'theme') applyTheme();
  window.dispatchEvent(new CustomEvent('boxscore:settings', { detail: { key, value } }));
}

// The inline script in index.html's <head> sets data-theme before first
// paint; this keeps it (and the browser-chrome color) in step afterwards.
export function applyTheme(){
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  const light = settings.theme === 'light'
    || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', light ? THEME_COLOR.light : THEME_COLOR.dark);
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if(settings.theme === 'auto') applyTheme();
});

applyTheme();

window.setSetting = (key, value) => setSetting(key, value);
