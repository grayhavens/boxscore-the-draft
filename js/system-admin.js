/* ============================================================
   System admin page (admin.html at boxscore.space/admin): the platform
   owner's view across every group. Cloudflare Access does the login; this
   page only calls the worker's /api/admin/* routes (worker/system-admin.js),
   same origin in production.

   Desktop-first (the one part of Boxscore that is): a sidebar to pick
   Platform or a group, and a wide main column. Under 900px the sidebar
   folds into a top bar with a picker (css/style.css).

   - Platform: the site's version beside the one the worker was deployed
     with (a worker behind the site usually means it wasn't deployed),
     whether ESPN answers for each league, which worker secrets are set; a
     "Needs attention" queue built from all of that and every group's
     status (claims waiting, no commissioner password, people not
     welcomed, no invite code or one still soft, a Race chart that stopped
     recording); every group in a table; and the admin log
     (worker/admin-log.js), what this page has done lately.
   - Interested in Boxscore: people who left their name on the landing
     page without a group to join (worker/interest.js): name, email, start
     a group or join one, and their note, newest first, each with Dismiss
     once it's followed up. Also emailed to CLAIM_ALERT_EMAIL, linking
     here.
   - A group: a summary strip (spots, claims, draft, chat, activity and
     when scores were last saved, Race chart history, alerts), "Open as
     commissioner" (a 12-hour token the group app takes from the URL
     fragment, see js/admin.js), then:
   - Spot claims from the landing page (worker/claims.js), first since
     they're what needs acting on: newest first. Confirm (with the name
     editable) puts the person in the group's next open spot, no deploy
     (worker/roster.js); Dismiss drops the claim. A new claim is also
     emailed to CLAIM_ALERT_EMAIL, linking here with ?group=, which opens
     on that group.
   - Roster: every spot in one table, open, named in js/groups.js or
     confirmed, with its email, whether it's had the welcome email, and
     its actions: welcome just that person, edit a confirmed spot's name
     and email or Undo it, add or edit a named spot's email. Add person
     fills the next open spot with no claim (someone who texted instead).
   - Invite code (worker/access-code.js): the group's shared code and
     invite link, to keep outsiders out of its chat, draft room and
     activity. A new code starts in soft mode (nobody turned away);
     Enforce turns the gate on. The welcome email carries the link and
     {code}. Beside it, an announcement alert to the whole group.
   - Welcome email, for a group that takes claims or has emails: an
     editable subject and body sent to everyone with an email (a claim's,
     or one added for a spot named in js/groups.js) from
     admin@boxscore.space (worker/welcome-email.js), with a live preview
     beside it and a test copy to you first. It offers the email to
     whoever hasn't had it yet, so people confirmed later can be welcomed
     without re-sending to everyone. Confirming a claim (or adding a
     person) sends it to that person in the same step ("Send the welcome
     email", on unless you untick it, remembered on this browser), with
     the text as it stands in this section.
   - Alert devices: every registered device by drafter, with when it
     signed up, a test alert, and Remove for an old one.
   - Chat: the room's latest messages, loaded on request, each with
     Delete (gone for everyone, worker/chat-room.js).
   - The admin log, just this group's lines.

   Each action's result shows as a toast. The page refreshes itself every
   minute while it's on screen and nothing is being typed. Locally it
   talks to `wrangler dev` started with ADMIN_DEV_BYPASS=1 (the
   admin-worker config in .claude/launch.json); on any other host it
   sends you to boxscore.space/admin.
   ============================================================ */
import { GROUP_DOMAIN, groupAppUrl, isPlatformHost, adminSecretName } from './groups.js';
import { welcomeHtml } from './welcome-template.js';
import { pollTally } from './draft-poll.js';

const host = window.location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
const API = isLocal ? 'http://localhost:8787/api/admin' : '/api/admin';
const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports';
// One scoreboard per league the app reads (js/espn.js, js/golf.js).
const ESPN_LEAGUES = [
  ['EPL', 'soccer/eng.1'], ['NFL', 'football/nfl'], ['NBA', 'basketball/nba'], ['NHL', 'hockey/nhl'],
  ['MLB', 'baseball/mlb'], ['WNBA', 'basketball/wnba'], ['CFB', 'football/college-football'],
  ['CBB', 'basketball/mens-college-basketball'], ['PGA', 'golf/pga']
];
const AUTO_REFRESH_MS = 60 * 1000;
const CHECKS_EVERY_MS = 5 * 60 * 1000;
const RACE_STALE_DAYS = 3;
const LOG_SHORT = 12;

if(!isLocal && !isPlatformHost(host)) window.location.replace(`https://${GROUP_DOMAIN}/admin`);

const PLATFORM = 'platform';
const root = document.getElementById('sysadmin');
const toastEl = document.getElementById('sysadmin-toast');
let status = null;       // GET /status
let statusJson = '';     // as it came back, to skip a re-render when nothing changed
let checkedAt = null;    // when it came back
let loadError = '';
let siteVersion = null;  // APP_VERSION from js/version.js, as deployed
let espn = null;         // [{ label, ok, ms }] per league
let checksAt = 0;
let busy = false;
let confirming = null;   // { group, id, name }: the claim whose name is open for editing
let adding = null;       // { group, name, email }: Add person, open
let editing = null;      // { group, drafter, name, email }: a confirmed spot being edited
let selected = null;     // PLATFORM or the id of the group on screen; null picks one
let welcomeDrafts = {};  // group id -> { subject, body } as edited, kept across re-renders
let announceDrafts = {}; // group id -> announcement as typed, kept across re-renders
let chatRecent = {};     // group id -> latest messages, once loaded
let logOpen = false;     // the admin log shows every line, not just the latest
let autoWelcome = true;  // filling a spot also sends the welcome email
let emailEdit = null;    // { group, values: { drafter: email } }: the roster's emails open for editing
const SELECTED_KEY = 'sysadmin-group';
const AUTO_WELCOME_KEY = 'sysadmin-auto-welcome';
try {
  selected = localStorage.getItem(SELECTED_KEY);
  autoWelcome = localStorage.getItem(AUTO_WELCOME_KEY) !== 'off';
} catch (e){}
// The screen is ?group=<id> (or ?group=platform): the link in a claim
// alert email opens on its group, a reload stays put, and Back returns to
// the screen before. With none, the last one picked here opens.
const groupParam = () => new URLSearchParams(window.location.search).get('group');
const screenUrl = id => `${window.location.pathname}?group=${encodeURIComponent(id)}${window.location.hash}`;
if(groupParam()){
  selected = groupParam();
  try { localStorage.setItem(SELECTED_KEY, selected); } catch (e){}
} else if(selected){
  history.replaceState(null, '', screenUrl(selected));
}
window.addEventListener('popstate', () => {
  const id = groupParam();
  if(!id || id === selected) return;
  selected = id;
  confirming = adding = editing = emailEdit = null;
  render();
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(ts){
  if(!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if(m < 1) return 'just now';
  if(m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if(h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Versions are '2026.09.30-2': compared number by number, so -10 is after -9.
function compareVersions(a, b){
  const pa = String(a).split(/\D+/).map(Number);
  const pb = String(b).split(/\D+/).map(Number);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){
    const d = (pa[i] || 0) - (pb[i] || 0);
    if(d) return d;
  }
  return 0;
}

const pill = (kind, text) => `<span class="sysadmin-pill ${kind}">${text}</span>`;
const setPill = (ok, yes = 'Set', no = 'Missing') => pill(ok ? 'ok' : 'bad', ok ? yes : no);
const inviteKind = g => !g.access ? 'neutral' : g.access.enforce ? 'ok' : 'warn';
const inviteText = g => !g.access ? 'Open' : g.access.enforce ? 'Enforced' : 'Soft';

function btn(label, onclick, { solid = false, small = false, quiet = false, off = false } = {}){
  const cls = ['sysadmin-btn', solid && 'solid', small && 'small', quiet && 'quiet'].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" onclick="${onclick}" ${busy || off ? 'disabled' : ''}>${label}</button>`;
}

const block = (label, body, note = '') => `
  <section class="sysadmin-block">
    <div class="sysadmin-label-row"><h2 class="sysadmin-label">${label}</h2>${note ? `<span class="sysadmin-label-note">${note}</span>` : ''}</div>
    ${body}
  </section>`;

async function api(path, body){
  const res = await fetch(`${API}${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// `auto` is the minute timer: it leaves the page alone if nothing changed
// or if something is being typed by the time the answer comes back.
async function load(auto = false){
  loadError = '';
  let changed = true;
  try {
    const { ok, status: code, data } = await api('/status');
    if(ok){
      const text = JSON.stringify(data);
      changed = text !== statusJson;
      status = data; statusJson = text; checkedAt = Date.now();
    }
    else loadError = code === 503 ? 'Cloudflare Access isn’t set up on the worker yet (ACCESS_TEAM_DOMAIN / ACCESS_AUD).'
      : code === 401 ? 'Not signed in. Reload to sign in again.'
      : `The worker answered ${code}.`;
  } catch (e){
    loadError = 'Couldn’t reach the worker.';
  }
  if(auto && (!quiet() || (!changed && currentGroup()))) return;
  render();
}

async function loadPlatformChecks(){
  checksAt = Date.now();
  try {
    const src = await (await fetch('js/version.js', { cache: 'no-store' })).text();
    const m = src.match(/APP_VERSION = '([^']+)'/);
    siteVersion = m ? m[1] : '?';
  } catch (e){ siteVersion = '?'; }
  espn = await Promise.all(ESPN_LEAGUES.map(async ([label, path]) => {
    const t0 = performance.now();
    try {
      const res = await fetch(`${ESPN_BASE}/${path}/scoreboard`, { cache: 'no-store' });
      return { label, ok: res.ok, ms: Math.round(performance.now() - t0) };
    } catch (e){ return { label, ok: false, ms: null }; }
  }));
  if(quiet()) render();
}

// ---- Facts shared by the sidebar, the tables and the group view ----

const drafterName = (g, id) => (g.drafters.find(x => x.id === id) || {}).name || id;
const groupName = id => ((status && status.groups.find(g => g.id === id)) || {}).name || id;
const openSpots = g => g.drafters.filter(d => d.open);
const withDevices = g => g.drafters.filter(d => d.devices);

function draftPhase(d){
  if(!d) return 'Unknown';
  if(d.phase === 'done') return 'Done';
  if(d.phase === 'draft') return d.running ? 'Live' : 'Paused';
  return 'Lobby';
}

const shortWhen = ts => new Date(ts).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The draft room past its phase: pick progress while it runs, and the
// lobby's setup (lottery drawn, pool loaded, start time) before.
function draftDetail(d, g){
  if(!d) return 'Couldn’t read the draft room';
  if(d.phase === 'done') return `${d.total} picks`;
  if(d.phase === 'draft') return [d.slot === null ? '' : `Pick ${d.slot + 1} of ${d.total}`, d.owner ? `${esc(drafterName(g, d.owner))} on the clock` : '']
    .filter(Boolean).join(' · ') || 'Drafting';
  return [d.ordered ? 'Order drawn' : 'No order yet', `${plural(d.poolSize, 'team')} in the pool`, d.scheduledAt ? `starts ${shortWhen(d.scheduledAt)}` : '']
    .filter(Boolean).join(' · ');
}

// Days since the Race chart's last sample (worker/points-history.js), a
// Central-time 'YYYY-MM-DD'; noon UTC keeps it on the right day.
const daysSince = day => Math.floor((Date.now() - Date.parse(`${day}T12:00:00Z`)) / 86400000);
const raceStale = g => !!(g.history && g.history.lastDay && daysSince(g.history.lastDay) >= RACE_STALE_DAYS);

// Site vs worker: null until both are known, else 'match', 'worker'
// (the worker is behind) or 'site' (Pages is still deploying).
function versionState(){
  const worker = status && status.platform.workerVersion;
  if(!siteVersion || siteVersion === '?' || !worker) return null;
  const d = compareVersions(siteVersion, worker);
  return !d ? 'match' : d > 0 ? 'worker' : 'site';
}

const espnDown = () => (espn || []).filter(l => !l.ok);

// The platform's own problems, for the top of "Needs attention".
function platformItems(){
  const items = [];
  const worker = status.platform.workerVersion;
  const v = versionState();
  if(!worker) items.push({ dot: 'bad', title: 'The worker doesn’t report a version', detail: 'It predates this page: deploy the worker' });
  else if(v === 'worker') items.push({ dot: 'bad', title: 'The worker is behind the site', detail: `Worker ${esc(worker)} · site ${esc(siteVersion)}. Deploy the worker if this change touched worker/` });
  else if(v === 'site') items.push({ dot: 'mute', title: 'The site is behind the worker', detail: `Site ${esc(siteVersion)} · worker ${esc(worker)}. Pages may still be deploying` });
  const down = espnDown();
  if(down.length) items.push({ dot: 'bad', title: `ESPN isn’t answering for ${down.map(l => l.label).join(', ')}`, detail: 'Those leagues’ scores and standings won’t load' });
  const interest = interestList();
  if(interest.length) items.push({ dot: 'warn', title: `${plural(interest.length, 'person', 'people')} interested in Boxscore`, detail: interest.map(e => esc(e.name)).join(', ') });
  return items.map(i => ({ ...i, group: null, rank: ATTENTION_RANK[i.dot] }));
}

// What a group has waiting on the admin. Feeds the Platform view's
// "Needs attention" list, sorted by `rank` across groups so claims lead.
function attentionItems(g){
  const items = [];
  if(g.claims.length) items.push({ dot: 'warn', title: `${plural(g.claims.length, 'spot claim')} waiting`, detail: g.claims.map(c => esc(c.name)).join(', ') });
  if(!g.commissionerPassword) items.push({ dot: 'bad', title: 'No commissioner password', detail: `<code>${adminSecretName(g.id)}</code>` });
  const fresh = g.welcome.contacts.filter(c => c.email && !c.welcomedAt);
  if(fresh.length) items.push({ dot: 'mute', title: `${fresh.length} not welcomed yet`, detail: fresh.map(c => esc(c.name)).join(', ') });
  if(!g.access) items.push({ dot: 'mute', title: 'Open to anyone with the address', detail: 'No invite code' });
  else if(!g.access.enforce) items.push({ dot: 'mute', title: 'Invite code in soft mode', detail: 'Nobody is turned away yet' });
  const d = g.draft;
  if(d && d.phase === 'draft' && !d.running) items.push({ dot: 'warn', title: 'The draft is paused', detail: d.slot === null ? 'Before the first pick' : `On pick ${d.slot + 1} of ${d.total}` });
  if(d && d.phase === 'lobby' && d.scheduledAt && d.scheduledAt < Date.now()) items.push({ dot: 'mute', title: 'The draft time has passed', detail: `Set for ${shortWhen(d.scheduledAt)}, still in the lobby` });
  if(raceStale(g)) items.push({ dot: 'mute', title: `Race chart hasn’t recorded since ${g.history.lastDay}`, detail: 'Nobody has opened the app, or saving scores is failing' });
  return items.map(i => ({ ...i, group: g, rank: ATTENTION_RANK[i.dot] }));
}

const ATTENTION_RANK = { warn: 0, bad: 1, mute: 2 };

const platformHealthy = () => Object.values(status.platform.secrets).every(Boolean) && !espnDown().length && versionState() !== 'worker' && !!status.platform.workerVersion;

// ---- Sidebar ----

function sidebarHtml(current){
  const nav = !status ? '' : `
    <nav class="sysadmin-nav" aria-label="Platform">
      <button type="button" class="sysadmin-nav-item${current ? '' : ' active'}" onclick="sysadminPickGroup('${PLATFORM}')" ${current ? '' : 'aria-current="page"'}>
        <span class="sysadmin-dot ${platformHealthy() ? 'ok' : 'bad'}"></span>
        <span class="sysadmin-nav-text"><span class="sysadmin-nav-name">Platform</span></span>
        ${interestList().length ? `<span class="sysadmin-badge" title="${plural(interestList().length, 'person', 'people')} interested">${interestList().length}</span>` : '<span class="sysadmin-nav-aside">All groups</span>'}
      </button>
    </nav>
    <nav class="sysadmin-nav" aria-label="Groups">
      <div class="sysadmin-nav-label"><span>Groups</span><span>${status.groups.length}</span></div>
      ${status.groups.map(g => {
        const active = g === current;
        return `
        <button type="button" class="sysadmin-nav-item${active ? ' active' : ''}" onclick="sysadminPickGroup('${esc(g.id)}')" ${active ? 'aria-current="page"' : ''}>
          <span class="sysadmin-nav-text">
            <span class="sysadmin-nav-name">${esc(g.name)}</span>
            <span class="sysadmin-nav-sub">${g.drafters.length - openSpots(g).length}/${g.drafters.length} spots · ${draftPhase(g.draft)}</span>
          </span>
          ${g.claims.length ? `<span class="sysadmin-badge" title="${plural(g.claims.length, 'claim')} waiting">${g.claims.length}</span>` : ''}
        </button>`;
      }).join('')}
    </nav>
    <select class="sysadmin-picker" onchange="sysadminPickGroup(this.value)" aria-label="View">
      <option value="${PLATFORM}"${current ? '' : ' selected'}>Platform · all groups</option>
      ${status.groups.map(g => `<option value="${esc(g.id)}"${g === current ? ' selected' : ''}>${esc(g.name)}${g.claims.length ? ` · ${plural(g.claims.length, 'claim')} waiting` : ''}</option>`).join('')}
    </select>`;
  return `
    <aside class="sysadmin-side">
      <div class="sysadmin-brand"><img src="icons/logo-header.png" alt="">Admin</div>
      ${nav}
      <div class="sysadmin-foot">
        ${status ? `<span class="sysadmin-foot-who">Signed in as</span><span class="sysadmin-foot-who sysadmin-you">${esc(status.you)}</span>` : ''}
        <div class="sysadmin-foot-links"><a href="./">Boxscore</a>${isLocal ? '' : '<a href="/cdn-cgi/access/logout">Sign out</a>'}</div>
      </div>
    </aside>`;
}

// ---- The admin log (worker/admin-log.js) ----

function logHtml(entries, { showGroup }){
  if(!entries.length) return block('Recent actions', `<div class="sysadmin-card pad"><span class="sysadmin-row-sub">Nothing logged yet. Actions from this page and each group’s commissioner show up here.</span></div>`);
  const shown = logOpen ? entries : entries.slice(0, LOG_SHORT);
  const rows = shown.map(e => `
    <div class="sysadmin-list-row compact">
      <span class="sysadmin-row-text">
        <span class="sysadmin-log-text">${esc(e.text)}</span>
        <span class="sysadmin-row-sub sysadmin-small">${[showGroup ? esc(groupName(e.group)) : '', `<span title="${esc(new Date(e.ts).toLocaleString())}">${ago(e.ts)}</span>`, esc(e.who)].filter(Boolean).join(' · ')}</span>
      </span>
    </div>`).join('');
  const more = entries.length > LOG_SHORT
    ? `<div class="sysadmin-list-row compact">${btn(logOpen ? 'Show fewer' : `Show all ${entries.length}`, 'sysadminLogToggle()', { small: true, quiet: true })}</div>` : '';
  return block('Recent actions', `<div class="sysadmin-card flush">${rows}${more}</div>`);
}

// ---- Platform view ----

// People interested in Boxscore (worker/interest.js), newest first. An
// older worker sends no list.
const interestList = () => (status && status.platform.interest) || [];
const INTEREST_KIND = { start: 'Start a group', join: 'Join a group' };

function interestHtml(){
  const list = interestList();
  if(!list.length) return '';
  const rows = list.map(e => `
    <div class="sysadmin-list-row">
      <span class="sysadmin-row-text">
        <span class="sysadmin-row-title big">${esc(e.name)} ${pill('neutral', INTEREST_KIND[e.kind] || INTEREST_KIND.start)}</span>
        <span class="sysadmin-row-sub"><a href="mailto:${esc(e.email)}">${esc(e.email)}</a> · <span title="${esc(new Date(e.at).toLocaleString())}">${ago(e.at)}</span></span>
        ${e.note ? `<span class="sysadmin-quote">${esc(e.note)}</span>` : ''}
      </span>
      <span class="sysadmin-btn-row">${btn('Dismiss', `sysadminDismissInterest('${esc(e.id)}')`)}</span>
    </div>`).join('');
  return block(`Interested in Boxscore <span class="sysadmin-badge">${list.length}</span>`, `<div class="sysadmin-card flush attn">${rows}</div>`,
    'From the landing page. Email them back, then dismiss.');
}

const SECRETS = [
  ['Alerts', 'VAPID keys', 'push'],
  ['Chat GIFs', 'KLIPY_APP_KEY', 'gifs'],
  ['Email', 'RESEND_API_KEY', 'email'],
  ['Claim alerts', 'CLAIM_ALERT_EMAIL', 'claimAlerts'],
  ['TheRundown', 'THERUNDOWN_API_KEY', 'rundown'],
  ['TheSportsDB', 'SPORTSDB_API_KEY', 'sportsdb']
];

function versionTile(){
  const worker = status.platform.workerVersion;
  const v = versionState();
  const tag = !worker ? pill('bad', 'Old worker') : v === 'match' ? pill('ok', 'Match') : v === 'worker' ? pill('bad', 'Worker behind') : v === 'site' ? pill('warn', 'Site behind') : '';
  return `
    <div class="sysadmin-tile">
      <div class="sysadmin-tile-top"><span class="sysadmin-tile-label">Version</span>${tag}</div>
      <span class="sysadmin-tile-value">${siteVersion ? esc(siteVersion) : 'Checking…'}</span>
      <span class="sysadmin-env">Worker ${worker ? esc(worker) : 'unknown'}</span>
    </div>`;
}

function espnTile(){
  if(!espn) return `<div class="sysadmin-tile"><span class="sysadmin-tile-label">ESPN</span><span class="sysadmin-tile-value">Checking…</span></div>`;
  const down = espnDown();
  const up = espn.filter(l => l.ok);
  const slowest = up.reduce((s, l) => (!s || l.ms > s.ms ? l : s), null);
  const tag = !down.length ? pill('ok', 'Up') : !up.length ? pill('bad', 'Down') : pill('warn', 'Partly');
  const all = espn.map(l => `${l.label} ${l.ok ? `${l.ms} ms` : 'down'}`).join('\n');
  return `
    <div class="sysadmin-tile" title="${esc(all)}">
      <div class="sysadmin-tile-top"><span class="sysadmin-tile-label">ESPN</span>${tag}</div>
      <span class="sysadmin-tile-value">${up.length} / ${espn.length} leagues</span>
      <span class="sysadmin-env">${down.length ? `Down: ${down.map(l => l.label).join(', ')}` : slowest ? `Slowest ${slowest.label} ${slowest.ms} ms` : ''}</span>
    </div>`;
}

function platformHtml(){
  const s = status.platform.secrets;
  const attention = [...platformItems(), ...status.groups.flatMap(attentionItems)].sort((a, b) => a.rank - b.rank);
  const checked = checkedAt ? new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const tiles = `
    <div class="sysadmin-tiles">
      ${versionTile()}
      ${espnTile()}
      ${SECRETS.map(([title, env, key]) => `
        <div class="sysadmin-tile">
          <div class="sysadmin-tile-top"><span class="sysadmin-tile-title">${title}</span>${setPill(s[key])}</div>
          <span class="sysadmin-env">${env}</span>
        </div>`).join('')}
    </div>`;
  const attentionHtml = !attention.length ? '' : block(`Needs attention <span class="sysadmin-label-count">${attention.length}</span>`, `
    <div class="sysadmin-card flush">
      ${attention.map(a => `
        <div class="sysadmin-list-row">
          <span class="sysadmin-dot ${a.dot}"></span>
          <span class="sysadmin-row-text">
            <span class="sysadmin-row-title">${a.title}</span>
            <span class="sysadmin-row-sub">${a.group ? `${esc(a.group.name)} · ` : ''}${a.detail}</span>
          </span>
          ${a.group ? btn('Open group', `sysadminPickGroup('${esc(a.group.id)}')`, { small: true }) : ''}
        </div>`).join('')}
    </div>`);
  const rows = status.groups.map(g => {
    const c = g.chat;
    return `
      <div class="sysadmin-tr link" role="link" tabindex="0" onclick="sysadminPickGroup('${esc(g.id)}')" onkeydown="if(event.key === 'Enter') sysadminPickGroup('${esc(g.id)}')">
        <span class="sysadmin-cell"><span class="sysadmin-row-title">${esc(g.name)}</span><span class="sysadmin-sub sysadmin-small">${esc(g.id)}.${GROUP_DOMAIN}</span></span>
        <span class="sysadmin-strong">${g.drafters.length - openSpots(g).length} / ${g.drafters.length}</span>
        <span>${g.claims.length ? pill('solid', `${g.claims.length} waiting`) : '<span class="sysadmin-mute">—</span>'}</span>
        <span class="sysadmin-cell"><span class="sysadmin-strong">${draftPhase(g.draft)}</span><span class="sysadmin-sub sysadmin-small">${draftDetail(g.draft, g)}</span></span>
        <span class="sysadmin-sub">${!c ? 'Couldn’t read' : c.messages ? `${c.messages} msgs${c.last ? ` · ${ago(c.last.ts)}` : ''}` : 'No messages'}</span>
        <span class="sysadmin-sub">${withDevices(g).length} / ${g.drafters.length}</span>
        <span>${pill(inviteKind(g), inviteText(g))}</span>
        <span>${setPill(g.commissionerPassword)}</span>
        <span class="sysadmin-chev" aria-hidden="true">&rsaquo;</span>
      </div>`;
  }).join('');
  return `
    <div class="sysadmin-content">
      <header class="sysadmin-head">
        <div class="sysadmin-head-text">
          <div class="sysadmin-eyebrow">Platform</div>
          <h1>Across every group</h1>
          <div class="sysadmin-head-sub">Version ${siteVersion ? esc(siteVersion) : '…'}${checked ? ` · checked ${checked}` : ''}</div>
        </div>
        <div class="sysadmin-head-actions">${btn('Refresh', 'sysadminRefresh()')}</div>
      </header>
      ${tiles}
      ${attentionHtml}
      ${interestHtml()}
      ${block('Groups', `
        <div class="sysadmin-card scroll">
          <div class="sysadmin-table groups">
            <div class="sysadmin-tr sysadmin-th"><span>Group</span><span>Spots</span><span>Claims</span><span>Draft</span><span>Chat</span><span>Alerts</span><span>Invite</span><span>Commish</span><span></span></div>
            ${rows}
          </div>
        </div>`)}
      ${logHtml(status.log || [], { showGroup: true })}
    </div>`;
}

// ---- Group view ----

function summaryHtml(g){
  const open = openSpots(g).length;
  const c = g.chat;
  const h = g.history;
  const devices = g.drafters.reduce((n, d) => n + d.devices, 0);
  const cell = (label, value, sub, warn = false) => `
    <div class="sysadmin-stat">
      <span class="sysadmin-stat-label">${label}</span>
      <span class="sysadmin-stat-value">${value}</span>
      <span class="sysadmin-stat-sub${warn ? ' warn' : ''}">${sub}</span>
    </div>`;
  return `
    <div class="sysadmin-stats">
      ${cell('Spots', `${g.drafters.length - open} / ${g.drafters.length}`, open ? `${open} open` : 'Every spot is filled')}
      ${cell('Claims', g.claims.length, g.claims.length ? 'waiting for you' : 'None waiting')}
      ${cell('Draft', draftPhase(g.draft), draftDetail(g.draft, g))}
      ${cell('Chat', c ? c.messages : '—', !c ? 'Couldn’t read the chat room'
        : c.last ? `last from ${esc(drafterName(g, c.last.from))} ${ago(c.last.ts)} · ${c.connected} connected` : `No messages yet · ${c.connected} connected`)}
      ${cell('Activity', g.activity.events, [g.activity.events ? `latest ${ago(g.activity.lastTs)}` : 'Nothing logged yet',
        g.activity.snapshotAt ? `scores saved ${ago(g.activity.snapshotAt)}` : ''].filter(Boolean).join(' · '))}
      ${cell('Race chart', h ? plural(h.days, 'day') : '—', h ? `${h.season} season · last ${h.lastDay || 'never'}` : 'Nothing recorded yet', raceStale(g))}
      ${cell('Alerts on', `${withDevices(g).length} / ${g.drafters.length}`, plural(devices, 'device'))}
    </div>`;
}

// The live room as the commissioner set it up: the start time, the lobby's
// setup, and the draft time poll's answers. Changed from the Commissioner
// page (the header's Open as commissioner).
function draftHtml(g){
  const d = g.draft;
  if(!d) return '';
  const row = (title, sub, side) => `
    <div class="sysadmin-list-row compact">
      <span class="sysadmin-row-text"><span class="sysadmin-row-title">${title}</span>${sub ? `<span class="sysadmin-row-sub">${sub}</span>` : ''}</span>
      ${side}
    </div>`;
  const rows = [];
  if(d.phase === 'draft'){
    rows.push(row(d.slot === null ? 'Waiting on the first pick' : `Pick ${d.slot + 1} of ${d.total}`,
      d.owner ? `${esc(drafterName(g, d.owner))} on the clock` : '', pill(d.running ? 'ok' : 'warn', d.running ? 'Live' : 'Paused')));
  } else if(d.phase === 'done'){
    rows.push(row('Complete', plural(d.total, 'pick'), pill('ok', 'Done')));
  } else {
    const passed = d.scheduledAt && d.scheduledAt < Date.now();
    rows.push(row('Draft time', d.scheduledAt ? shortWhen(d.scheduledAt) : d.poll ? 'Not set · the poll is open on Home' : 'Not set',
      d.scheduledAt ? pill(passed ? 'warn' : 'ok', passed ? 'Passed' : 'Set') : pill('warn', 'Not set')));
    rows.push(row('Team pool', plural(d.poolSize, 'team'), d.poolSize ? pill('ok', 'Loaded') : pill('warn', 'Not loaded')));
    rows.push(row('Lottery', d.ordered ? 'The draft order is set' : 'Run from the lobby', d.ordered ? pill('ok', 'Drawn') : pill('warn', 'Not run')));
  }
  let poll = '';
  if(d.phase === 'lobby' && d.poll){
    const roster = g.drafters.filter(x => !x.open);
    const tally = pollTally(d.poll, roster.map(x => x.id));
    const names = ids => ids.map(id => esc(drafterName(g, id))).join(', ');
    const most = Math.max(0, ...tally.options.map(o => o.voters.length));
    poll = [
      ...tally.options.map(o => row(shortWhen(o.at), o.voters.length ? names(o.voters) : 'Nobody yet',
        `<span class="sysadmin-actions">${o.at === d.scheduledAt ? pill('ok', 'Set') : ''}${pill(most && o.voters.length === most ? 'ok' : 'neutral', `${o.voters.length} of ${roster.length}`)}</span>`)),
      tally.none.length ? row('None of these work', names(tally.none), pill('neutral', tally.none.length)) : '',
      tally.waiting.length ? row('Haven’t answered', names(tally.waiting), pill('warn', tally.waiting.length)) : ''
    ].join('');
    poll = `<div class="sysadmin-sublist"><div class="sysadmin-sublabel">Draft time poll · ${roster.length - tally.waiting.length} of ${roster.length} answered</div>${poll}</div>`;
  }
  return block('Draft', `<div class="sysadmin-card flush">${rows.join('')}${poll}</div>`, 'Set up by the commissioner');
}

// The inline form for a person: a claim being confirmed, Add person, or a
// confirmed spot being edited. Its fields are kept in `state` as they're
// typed, so a re-render doesn't lose them.
function personForm({ label, state, email, meta, welcomeBox, submit, cancel, submitLabel }){
  return `
    <div class="sysadmin-claim-edit">
      <label class="sysadmin-field">
        <span class="sysadmin-field-label">${label}</span>
        <input id="person-name" class="sysadmin-input name" type="text" maxlength="40" value="${esc(state.name)}" autocomplete="off"
          oninput="sysadminFormField('name', this.value)" onkeydown="if(event.key === 'Enter') ${submit}">
      </label>
      ${email ? `
        <label class="sysadmin-field">
          <span class="sysadmin-field-label">Email <span class="sysadmin-mute">(optional)</span></span>
          <input id="person-email" class="sysadmin-input" type="email" maxlength="80" value="${esc(state.email)}" autocomplete="off"
            oninput="sysadminFormField('email', this.value)" onkeydown="if(event.key === 'Enter') ${submit}">
        </label>` : ''}
      <div class="sysadmin-edit-meta">
        ${meta ? `<span>${meta}</span>` : ''}
        ${welcomeBox ? `<label class="sysadmin-check"><input type="checkbox" ${autoWelcome ? 'checked' : ''} onchange="sysadminAutoWelcome(this.checked)"> Send the welcome email</label>` : ''}
      </div>
      <div class="sysadmin-btn-row">
        ${btn(submitLabel, submit, { solid: true })}
        ${btn('Cancel', cancel)}
      </div>
    </div>`;
}

// Spot claims from the landing page (worker/claims.js): newest first.
// Confirm opens the name for editing, then Lock in gives the person the
// next open spot (worker/roster.js), and the app shows them under that
// name from then on. Undo on the roster frees the spot again.
function claimRow(g, c, nextSpot){
  const email = c.email || c.contact || '';
  const mail = email ? `<a href="mailto:${esc(email)}">${esc(email)}</a> · ` : '';
  const spot = esc(nextSpot ? nextSpot.name : 'the next open spot');
  if(confirming && confirming.group === g.id && confirming.id === c.id){
    return personForm({
      label: `Name in ${esc(g.name)}`, state: confirming,
      meta: `${mail}takes ${spot}’s spot`,
      welcomeBox: email && status.platform.secrets.email,
      submit: `sysadminLockIn('${g.id}', '${esc(c.id)}')`, cancel: 'sysadminConfirmClaim(null)', submitLabel: 'Lock in'
    });
  }
  return `
    <div class="sysadmin-list-row">
      <span class="sysadmin-row-text">
        <span class="sysadmin-row-title big">${esc(c.name)}</span>
        <span class="sysadmin-row-sub">${mail}${ago(c.at)}${nextSpot ? ` · would take ${spot}` : ' · no open spot left'}</span>
      </span>
      <span class="sysadmin-btn-row">
        ${btn('Confirm', `sysadminConfirmClaim('${g.id}', '${esc(c.id)}')`, { solid: true, off: !nextSpot })}
        ${btn('Dismiss', `sysadminDismissClaim('${g.id}', '${esc(c.id)}')`)}
      </span>
    </div>`;
}

function claimsHtml(g){
  if(!g.claims.length) return '';
  const nextSpot = openSpots(g)[0];
  return block(`Spot claims waiting <span class="sysadmin-badge">${g.claims.length}</span>`,
    `<div class="sysadmin-card flush attn">${g.claims.map(c => claimRow(g, c, nextSpot)).join('')}</div>`);
}

// Every spot in one table: the roster as the worker applies it
// (worker/roster.js), joined with the confirmed claims, the welcome
// email's contacts and the named spots' emails.
function rosterHtml(g){
  const secrets = status.platform.secrets;
  const open = openSpots(g);
  const rows = g.drafters.map((d, i) => {
    const conf = g.confirmed.find(c => c.drafter === d.id);
    if(conf && editing && editing.group === g.id && editing.drafter === d.id){
      return `<div class="sysadmin-tr-edit">${personForm({
        label: `Name in ${esc(g.name)}`, state: editing, email: true,
        meta: `Spot ${i + 1}, was ${esc(conf.spot)}. The app shows the new name from its next refresh.`,
        submit: `sysadminEditSubmit('${g.id}')`, cancel: 'sysadminEditSpot(null)', submitLabel: 'Save'
      })}</div>`;
    }
    const named = !conf && !d.open ? g.welcome.named.find(n => n.drafter === d.id) : null;
    const contact = g.welcome.contacts.find(c => c.drafter === d.id);
    const email = (contact && contact.email) || (conf && conf.email) || (named && named.email) || '';
    const editingEmail = named && emailEdit && emailEdit.group === g.id;
    const state = conf ? pill('ok', 'Confirmed') : d.open ? pill('open', 'Open') : pill('neutral', 'Named');
    const welcomed = contact && contact.welcomedAt ? ago(contact.welcomedAt) : d.open ? '—' : email ? 'Not yet' : 'No email';
    const alerts = d.devices ? `${plural(d.devices, 'device')} · chat ${d.chat} · draft ${d.draft} · points ${d.points || 0} · mentions ${d.mention || 0}` : d.open ? '—' : 'Off';
    const actions = [
      contact && !contact.welcomedAt && secrets.email ? btn('Welcome', `sysadminWelcome('${g.id}', false, '${esc(d.id)}')`, { small: true }) : '',
      conf ? btn('Edit', `sysadminEditSpot('${g.id}', '${esc(d.id)}')`, { small: true }) : '',
      conf ? btn('Undo', `sysadminRelease('${g.id}', '${esc(d.id)}')`, { small: true }) : ''
    ].join('');
    const emailCell = editingEmail
      ? `<input type="email" class="sysadmin-input cell" value="${esc(emailEdit.values[d.id])}" placeholder="name@example.com" aria-label="${esc(d.name)}’s email" oninput="sysadminEmailField('${esc(d.id)}', this.value)" onkeydown="if(event.key === 'Enter') sysadminEmailsSave('${g.id}'); if(event.key === 'Escape') sysadminEmailsEdit(null);">`
      : email ? `<a href="mailto:${esc(email)}" title="${esc(email)}">${esc(email)}</a>` : '<span class="sysadmin-mute">—</span>';
    return `
      <div class="sysadmin-tr">
        <span class="sysadmin-mute sysadmin-strong">${i + 1}</span>
        <span class="sysadmin-cell">
          <span class="sysadmin-row-title${d.open ? ' sysadmin-mute' : ''}">${esc(d.name)}</span>
          ${conf ? `<span class="sysadmin-mute sysadmin-small">was ${esc(conf.spot)}${conf.at ? ` · ${ago(conf.at)}` : ''}</span>` : ''}
        </span>
        <span class="${editingEmail ? 'sysadmin-cell' : 'sysadmin-ellipsis'}">${emailCell}</span>
        <span>${state}</span>
        <span class="sysadmin-sub">${welcomed}</span>
        <span class="sysadmin-sub">${alerts}</span>
        <span class="sysadmin-actions">${actions}</span>
      </div>`;
  }).join('');
  const note = !open.length ? 'Every spot is filled'
    : g.claims.length ? `${open.length} open · ${plural(g.claims.length, 'claim')} above`
    : `${open.length} open · people claim a spot on the landing page`;
  const form = adding && adding.group === g.id ? personForm({
    label: `Add to ${esc(g.name)}`, state: adding, email: true,
    meta: `Takes ${esc(open[0] ? open[0].name : 'the next open spot')}’s spot, no claim needed`,
    welcomeBox: secrets.email,
    submit: `sysadminAddSubmit('${g.id}')`, cancel: 'sysadminAddPerson(null)', submitLabel: 'Add'
  }) : '';
  const addBtn = open.length && !form ? btn('Add person', `sysadminAddPerson('${g.id}')`, { small: true }) : '';
  // Named spots (js/groups.js) get their email here; confirmed people's
  // is edited with the person (Edit).
  const editingEmails = emailEdit && emailEdit.group === g.id;
  const emailsBtn = g.welcome.named.length && !editingEmails ? btn('Edit emails', `sysadminEmailsEdit('${g.id}')`, { small: true, quiet: true }) : '';
  const emailsFoot = !editingEmails ? '' : `
    <div class="sysadmin-claim-edit sysadmin-emails-foot">
      <span class="sysadmin-help">For the welcome email. Only the platform admin sees them. Leave one empty to remove it.</span>
      <span class="sysadmin-spacer"></span>
      ${btn('Cancel', 'sysadminEmailsEdit(null)', { quiet: true })}
      ${btn('Save emails', `sysadminEmailsSave('${g.id}')`, { solid: true })}
    </div>`;
  return block('Roster', `
    <div class="sysadmin-card flush">
      ${form}
      <div class="sysadmin-scroll">
        <div class="sysadmin-table roster">
          <div class="sysadmin-tr sysadmin-th"><span>#</span><span>Name</span><span>Email</span><span>Status</span><span>Welcomed</span><span>Alerts</span><span class="sysadmin-right">Actions</span></div>
          ${rows}
        </div>
      </div>
      ${emailsFoot}
    </div>`, `${note}${emailsBtn ? ` ${emailsBtn}` : ''}${addBtn ? ` ${addBtn}` : ''}`);
}

// The group's invite code (worker/access-code.js): the link to send, the
// code itself, and whether the worker enforces it yet. A new code starts in
// soft mode so the link can go out before anyone is turned away.
function inviteLink(g){
  return `https://${g.id}.${GROUP_DOMAIN}/#code=${g.access.code}`;
}

function inviteHtml(g){
  const a = g.access;
  const act = (label, action, opts) => btn(label, `sysadminAccess('${g.id}', '${action}')`, opts);
  const body = !a ? `
    <div class="sysadmin-invite-empty">
      <span class="sysadmin-row-text">
        <span class="sysadmin-row-title big">Open to anyone with the address</span>
        <span class="sysadmin-row-sub">Add a code to keep outsiders out of this group’s chat, draft room and activity.</span>
      </span>
      ${act('Make a code', 'rotate', { solid: true })}
    </div>` : `
    <div class="sysadmin-code-row"><code class="sysadmin-code">${esc(a.code)}</code>${pill(inviteKind(g), inviteText(g))}</div>
    <span class="sysadmin-row-sub">${a.enforce ? 'Enforced: devices without it are turned away.' : 'Soft mode: nobody is turned away yet. Send the link, then enforce.'}${a.at ? ` Made ${ago(a.at)}.` : ''}</span>
    <input class="sysadmin-input mono" type="text" readonly value="${esc(inviteLink(g))}" aria-label="Invite link" onfocus="this.select()">
    <span class="sysadmin-help">Anyone who opens this link is in. The Home Screen app starts from its own address, so it asks for the code once.</span>
    <div class="sysadmin-btn-row">
      ${btn('Copy link', `sysadminCopyInvite('${g.id}')`, { solid: true })}
      ${a.enforce ? act('Switch to soft mode', 'soften') : act('Enforce', 'enforce')}
      ${act('New code', 'rotate')}
      ${act('Remove', 'clear', { quiet: true })}
    </div>`;
  return block('Invite code', `<div class="sysadmin-card pad">${body}</div>`);
}

function announceHtml(g){
  if(!status.platform.secrets.push) return '';
  const text = announceDrafts[g.id] || '';
  const reach = withDevices(g).length;
  return block('Announcement', `
    <div class="sysadmin-card pad">
      <textarea class="sysadmin-input" rows="3" maxlength="200" aria-label="Announcement" placeholder="Announcement to everyone in ${esc(g.name)} with alerts on"
        oninput="sysadminAnnounceEdit('${g.id}', this.value)">${esc(text)}</textarea>
      <div class="sysadmin-card-foot">
        <span class="sysadmin-help">Goes to ${plural(reach, 'person', 'people')} with alerts on · <span id="announce-count">${text.length}</span>/200</span>
        ${btn('Send announcement', `sysadminAnnounce('${g.id}')`, { solid: true, off: !reach })}
      </div>
    </div>`);
}

function welcomeDefaults(g){
  const at = g.draft && g.draft.scheduledAt;
  const when = at ? new Date(at).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
  return {
    subject: 'Welcome to {group}',
    body: [
      'Hi {name},',
      'You’re in! Welcome to {group}, our draft league on Boxscore.',
      'Tap the button below to open it. On iPhone, open it in Safari, then tap Share and Add to Home Screen. Boxscore works best from your Home Screen, and it’s the only place alerts work on iPhone.',
      ...(g.access ? [`If the app asks for an invite code, it’s ${g.access.code}.`] : []),
      'Once it’s open, pick your name and turn on alerts in Settings so you know when you’re on the clock.',
      ...(when ? [`The draft starts ${when}.`] : []),
      'See you at the draft!'
    ].join('\n\n')
  };
}

function welcomeDraft(g){
  return welcomeDrafts[g.id] || (welcomeDrafts[g.id] = welcomeDefaults(g));
}

function welcomeVars(g){
  const first = g.welcome.contacts[0];
  return {
    name: first ? first.name : 'there', group: g.name, code: g.access ? g.access.code : '',
    link: `https://${g.id}.${GROUP_DOMAIN}${g.access ? `/#code=${g.access.code}` : ''}`
  };
}

const fillWelcome = (t, vars) => t.replace(/\{(name|group|link|code)\}/g, (_, k) => vars[k]);

// The email as the first recipient will get it, from the same template
// the worker sends (js/welcome-template.js).
function welcomePreviewHtml(g){
  const draft = welcomeDraft(g);
  const vars = welcomeVars(g);
  return welcomeHtml({ groupName: g.name, link: vars.link, subject: fillWelcome(draft.subject, vars), text: fillWelcome(draft.body, vars) });
}

// Confirmed people have their claim's email; a spot named in
// js/groups.js gets one only when it's added on the roster (Add email).
function welcomeSection(g){
  const people = g.welcome.contacts;
  const open = openSpots(g).length;
  if(!people.length && !open) return '';
  if(!status.platform.secrets.email){
    return block('Welcome email', `
      <div class="sysadmin-card flush"><div class="sysadmin-list-row">
        <span class="sysadmin-row-text"><span class="sysadmin-row-title">Email isn’t set up</span><span class="sysadmin-row-sub"><code>RESEND_API_KEY</code></span></span>
        ${setPill(false)}
      </div></div>`);
  }
  const draft = welcomeDraft(g);
  const fresh = people.filter(c => !c.welcomedAt);
  const sent = people.filter(c => c.welcomedAt);
  const canTest = /@/.test(status.you || '');
  const names = list => list.map(c => esc(c.name)).join(', ');
  // With nobody to email yet the text is still here to edit: it's what
  // the first person confirmed will be sent.
  const note = !people.length ? 'Nobody to email yet'
    : fresh.length ? `${fresh.length} to welcome: ${names(fresh)}`
    : `Everyone’s been welcomed · sent to ${names(sent)}`;
  const sendLabel = !fresh.length ? `Send again to all ${people.length}`
    : fresh.length === 1 ? `Send to ${esc(fresh[0].name)}`
    : fresh.length === people.length ? `Send to all ${fresh.length}`
    : `Send to the ${fresh.length} new`;
  return block('Welcome email', `
    <div class="sysadmin-pair wide">
      <div class="sysadmin-card pad">
        <input class="sysadmin-input subject" type="text" maxlength="120" value="${esc(draft.subject)}" aria-label="Subject" oninput="sysadminWelcomeEdit('${g.id}', 'subject', this.value)">
        <textarea class="sysadmin-input body" rows="14" maxlength="5000" aria-label="Body" oninput="sysadminWelcomeEdit('${g.id}', 'body', this.value)">${esc(draft.body)}</textarea>
        <span class="sysadmin-help">{name}, {group}, {link} and {code} are filled in for each person.${open ? ' Confirming a claim or adding a person sends this to them.' : ''} Sent from admin@boxscore.space${canTest ? `; replies go to ${esc(status.you)}` : ''}.</span>
        <div class="sysadmin-btn-row">
          ${btn('Send me a test', `sysadminWelcome('${g.id}', true)`, { off: !canTest || !people.length })}
          ${btn('Reset text', `sysadminWelcomeReset('${g.id}')`)}
          <span class="sysadmin-spacer"></span>
          ${people.length ? btn(sendLabel, `sysadminWelcome('${g.id}', false)`, { solid: true }) : ''}
        </div>
      </div>
      <div class="sysadmin-card pad">
        <div class="sysadmin-preview-cap"><span>Preview, as ${esc(people.length ? people[0].name : 'someone')} will get it</span><span>From admin@boxscore.space</span></div>
        <div class="sysadmin-preview-subject" id="welcome-preview-subject"></div>
        <iframe class="sysadmin-preview" id="welcome-preview" title="Welcome email preview" sandbox=""></iframe>
      </div>
    </div>`, note);
}

const devicePrefs = x => [x.chat && 'Chat', x.draft && 'Draft picks', x.points && 'Points', x.mention && 'Mentions'].filter(Boolean).join(', ') || 'Announcements only';

// Every registered device (worker/web-push.js), by drafter. A device still
// in use signs itself back up within a day of opening the app (js/push.js),
// so Remove is for old phones and browsers.
function devicesHtml(g){
  if(!status.platform.secrets.push) return '';
  const people = withDevices(g);
  if(!people.length) return block('Alert devices', `<div class="sysadmin-card pad"><span class="sysadmin-row-sub">Nobody in ${esc(g.name)} has alerts on yet.</span></div>`);
  const rows = people.flatMap(d => (d.deviceList || []).map((x, i) => `
    <div class="sysadmin-tr">
      <span class="sysadmin-row-title">${i ? '' : esc(d.name)}</span>
      <span>${esc(x.service)}</span>
      <span class="sysadmin-sub" title="${x.at ? esc(new Date(x.at).toLocaleString()) : ''}">${x.at ? ago(x.at) : '—'}</span>
      <span class="sysadmin-sub">${devicePrefs(x)}</span>
      <span class="sysadmin-actions">
        ${i ? '' : btn('Test', `sysadminTest('${g.id}', '${esc(d.id)}')`, { small: true })}
        ${btn('Remove', `sysadminRemoveDevice('${g.id}', '${esc(d.id)}', '${esc(x.id)}')`, { small: true, quiet: true })}
      </span>
    </div>`)).join('');
  return block('Alert devices', `
    <div class="sysadmin-card scroll">
      <div class="sysadmin-table devices">
        <div class="sysadmin-tr sysadmin-th"><span>Drafter</span><span>Device</span><span>Signed up</span><span>Gets</span><span class="sysadmin-right">Actions</span></div>
        ${rows}
      </div>
    </div>`, 'Test sends to all of that person’s devices; a dead one is removed on its own');
}

// The chat room's latest messages (worker/chat-room.js), loaded on request.
function chatHtml(g){
  const list = chatRecent[g.id];
  if(!list){
    return block('Chat', `<div class="sysadmin-card pad"><div class="sysadmin-card-foot">
      <span class="sysadmin-row-sub">Load the latest messages to delete one for everyone.</span>
      ${btn('Show messages', `sysadminChatLoad('${g.id}')`)}
    </div></div>`);
  }
  const body = !list.length ? '<div class="sysadmin-list-row"><span class="sysadmin-row-sub">No messages.</span></div>' : list.map(m => `
    <div class="sysadmin-list-row compact">
      <span class="sysadmin-row-text">
        <span class="sysadmin-row-sub sysadmin-small"><b class="sysadmin-chat-from">${esc(drafterName(g, m.from))}</b> · <span title="${esc(new Date(m.ts).toLocaleString())}">${ago(m.ts)}</span>${m.gif ? ' · GIF' : m.game ? ' · shared game' : ''}</span>
        <span class="sysadmin-chat-text">${m.text ? esc(m.text) : '<span class="sysadmin-mute">(GIF)</span>'}</span>
      </span>
      ${btn('Delete', `sysadminChatDelete('${g.id}', ${m.id})`, { small: true, quiet: true })}
    </div>`).join('');
  return block('Chat', `<div class="sysadmin-card flush sysadmin-chat-list">${body}</div>`,
    `Latest ${list.length}, newest first ${btn('Reload', `sysadminChatLoad('${g.id}')`, { small: true })}`);
}

function groupHtml(g){
  return `
    <div class="sysadmin-content group">
      <header class="sysadmin-head">
        <div class="sysadmin-head-text">
          <div class="sysadmin-crumb"><a href="#" onclick="event.preventDefault(); sysadminPickGroup('${PLATFORM}')">Platform</a><span>/</span><span>Groups</span></div>
          <h1>${esc(g.name)}</h1>
          <a class="sysadmin-head-link" href="${groupAppUrl(g.id, host)}" target="_blank" rel="noopener">${esc(g.id)}.${GROUP_DOMAIN} ↗</a>
        </div>
        <div class="sysadmin-head-actions">
          ${btn('Refresh', 'sysadminRefresh()')}
          ${g.commissionerPassword
            ? btn('Open as commissioner', `sysadminCommissioner('${g.id}')`)
            : `<div class="sysadmin-alert-chip">No commissioner password <code>${adminSecretName(g.id)}</code></div>`}
        </div>
      </header>
      ${summaryHtml(g)}
      ${claimsHtml(g)}
      ${draftHtml(g)}
      ${rosterHtml(g)}
      <div class="sysadmin-pair">${inviteHtml(g)}${announceHtml(g)}</div>
      ${welcomeSection(g)}
      ${devicesHtml(g)}
      ${chatHtml(g)}
      ${logHtml((status.log || []).filter(e => e.group === g.id), { showGroup: false })}
    </div>`;
}

// The group on screen, or null for Platform. With nothing remembered, a
// group with claims waiting opens first.
function currentGroup(){
  const groups = status.groups;
  if(!selected) return groups.find(g => g.claims.length) || null;
  return groups.find(g => g.id === selected) || null;
}

function render(){
  if(!status){
    root.innerHTML = `${sidebarHtml(null)}<main class="sysadmin-main"><div class="sysadmin-content"><p class="sysadmin-loading">${loadError ? esc(loadError) : 'Loading…'}</p></div></main>`;
    return;
  }
  const g = currentGroup();
  root.innerHTML = `${sidebarHtml(g)}<main class="sysadmin-main">${g ? groupHtml(g) : platformHtml()}</main>`;
  refreshWelcomePreview();
}

// ---- Refreshing on its own ----

// Nothing open or being typed in, so a re-render can't lose anything.
function quiet(){
  const a = document.activeElement;
  return !busy && !confirming && !adding && !editing && !emailEdit && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

async function autoRefresh(){
  if(document.hidden || !quiet()) return;
  const g = status && currentGroup();
  if(g && chatRecent[g.id]) await fetchChat(g.id);
  await load(true);
  if(Date.now() - checksAt > CHECKS_EVERY_MS) loadPlatformChecks();
}

setInterval(autoRefresh, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && checkedAt && Date.now() - checkedAt > AUTO_REFRESH_MS) autoRefresh();
});

// ---- Actions ----

let toastTimer = null;
function toast(message){
  if(!message) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  // Long ones (a failed send and why) stay up long enough to read.
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, Math.max(3200, message.length * 55));
}
toastEl.addEventListener('click', () => { toastEl.hidden = true; });

async function act(fn){
  if(busy) return;
  busy = true;
  render();
  let message;
  try {
    message = await fn();
  } catch (e){
    message = 'Couldn’t reach the worker.';
  }
  busy = false;
  render();
  toast(message);
}

const pushResult = d => d.devices
  ? `Sent to ${d.sent} of ${plural(d.devices, 'device')}${d.removed ? `, ${d.removed} dead one${d.removed === 1 ? '' : 's'} removed` : ''}.`
  : 'No devices to send to.';

// Opens one inline form (or none) and focuses its first field.
function openForm(which, value){
  confirming = which === 'confirm' ? value : null;
  adding = which === 'add' ? value : null;
  editing = which === 'edit' ? value : null;
  render();
  const input = document.getElementById('person-name');
  if(input){ input.focus(); input.select(); }
}

const formState = () => confirming || adding || editing;

window.sysadminPickGroup = id => {
  if(id !== selected) history.pushState(null, '', screenUrl(id));
  selected = id;
  confirming = adding = editing = emailEdit = null;
  try { localStorage.setItem(SELECTED_KEY, id); } catch (e){}
  render();
  window.scrollTo(0, 0);
};

window.sysadminRefresh = () => { load(); loadPlatformChecks(); };

window.sysadminLogToggle = () => { logOpen = !logOpen; render(); };

window.sysadminTest = (groupId, drafter) => act(async () => {
  const { ok, data } = await api('/push', { group: groupId, drafter, message: '' });
  if(ok && data.removed) load();
  return ok ? pushResult(data) : `Test failed (${data.error || 'error'}).`;
});

window.sysadminRemoveDevice = (groupId, drafter, device) => {
  const group = status.groups.find(g => g.id === groupId);
  const d = group.drafters.find(x => x.id === drafter);
  const x = d && (d.deviceList || []).find(y => y.id === device);
  if(!x || !confirm(`Remove ${d.name}’s ${x.service} device (signed up ${ago(x.at)})? If it’s still in use, it signs back up the next time the app opens.`)) return;
  act(async () => {
    const { ok, data } = await api('/push/remove', { group: groupId, drafter, device });
    if(!ok || !data.ok) return 'Couldn’t remove that device. Refresh and try again.';
    load();
    return `Removed ${d.name}’s ${x.service} device.`;
  });
};

// Fills the preview frame. Called after every render and on every
// keystroke (which doesn't re-render, to keep the cursor).
function refreshWelcomePreview(){
  const frame = document.getElementById('welcome-preview');
  const group = frame && currentGroup();
  if(!group) return;
  frame.srcdoc = welcomePreviewHtml(group);
  const subject = document.getElementById('welcome-preview-subject');
  if(subject) subject.textContent = fillWelcome(welcomeDraft(group).subject, { ...welcomeVars(group), link: '' });
}

window.sysadminWelcomeEdit = (groupId, field, value) => {
  if(welcomeDrafts[groupId]) welcomeDrafts[groupId][field] = value;
  refreshWelcomePreview();
};

window.sysadminWelcomeReset = groupId => {
  delete welcomeDrafts[groupId];
  render();
};

const WELCOME_ERRORS = {
  empty: 'Add a subject and a message first.',
  no_email: 'Their claim has no usable email.',
  bad_drafters: 'Someone on the list has no email or isn’t confirmed any more. Refresh and try again.',
  no_admin_email: 'There’s no email to send your test to.',
  no_key: 'RESEND_API_KEY isn’t set on the worker.',
  unreachable: 'Couldn’t reach Resend.'
};

const welcomeError = data => WELCOME_ERRORS[data.error] || `Resend said: ${data.detail || data.error || 'error'}.`;

// To everyone not welcomed yet (or everyone again), or with `drafter` to
// just that person, from the roster.
window.sysadminWelcome = (groupId, test, drafter = null) => {
  const group = status.groups.find(g => g.id === groupId);
  const draft = welcomeDraft(group);
  const people = group.welcome.contacts;
  const fresh = people.filter(c => !c.welcomedAt);
  const target = drafter ? people.filter(c => c.drafter === drafter) : fresh.length ? fresh : people;
  if(!target.length) return;
  if(!test && !confirm(`Email ${target.map(c => `${c.name} (${c.email})`).join(', ')}?`)) return;
  act(async () => {
    const { ok, data } = await api('/welcome', {
      group: groupId, drafters: target.map(c => c.drafter), subject: draft.subject, body: draft.body, test
    });
    if(!ok) return welcomeError(data);
    if(test) return `Test sent to ${status.you}, written as ${target[0].name}.`;
    load();
    return `Sent to ${plural(data.sent, 'person', 'people')}.`;
  });
};

// Every named spot's email in one pass (null closes the editor).
window.sysadminEmailsEdit = groupId => {
  const group = groupId && status.groups.find(g => g.id === groupId);
  emailEdit = group ? { group: groupId, values: Object.fromEntries(group.welcome.named.map(n => [n.drafter, n.email || ''])) } : null;
  render();
  const first = group && root.querySelector('.sysadmin-input.cell');
  if(first) first.focus();
};

// Kept as it's typed, no re-render (the cursor stays).
window.sysadminEmailField = (drafter, value) => { if(emailEdit) emailEdit.values[drafter] = value; };

// Saves the ones that changed, one call each, stopping at the first the
// worker turns down so the editor stays open on it.
window.sysadminEmailsSave = groupId => {
  if(busy || !emailEdit) return;
  const group = status.groups.find(g => g.id === groupId);
  const changed = group.welcome.named.filter(n => (emailEdit.values[n.drafter] || '').trim() !== (n.email || ''));
  if(!changed.length){ emailEdit = null; render(); return; }
  act(async () => {
    let saved = 0;
    for(const spot of changed){
      const email = emailEdit.values[spot.drafter].trim();
      const { ok, data } = await api('/email', { group: groupId, drafter: spot.drafter, email });
      if(!ok){
        if(saved) load();
        return `${saved ? `Saved ${plural(saved, 'email')}, then ` : ''}${spot.name}: ${data.error === 'email' ? 'that doesn’t look like an email.' : `couldn’t save (${data.error || 'error'}).`}`;
      }
      spot.email = data.email || '';
      saved++;
    }
    emailEdit = null;
    load();
    return `Saved ${plural(saved, 'email')}.`;
  });
};

window.sysadminDismissClaim = (groupId, id) => {
  const group = status.groups.find(g => g.id === groupId);
  const claim = group.claims.find(c => c.id === id);
  if(!claim || !confirm(`Dismiss ${claim.name}’s claim?`)) return;
  act(async () => {
    const { ok } = await api('/claims/dismiss', { group: groupId, id });
    if(!ok) return 'Couldn’t dismiss that claim.';
    group.claims = group.claims.filter(c => c.id !== id);
    load();
    return `Dismissed ${claim.name}.`;
  });
};

window.sysadminDismissInterest = id => {
  const entry = interestList().find(e => e.id === id);
  if(!entry || !confirm(`Dismiss ${entry.name}? Do this once you’ve followed up.`)) return;
  act(async () => {
    const { ok } = await api('/interest/dismiss', { id });
    if(!ok) return 'Couldn’t dismiss that.';
    status.platform.interest = interestList().filter(e => e.id !== id);
    load();
    return `Dismissed ${entry.name}.`;
  });
};

window.sysadminConfirmClaim = (groupId, id) => {
  const claim = groupId && status.groups.find(g => g.id === groupId).claims.find(c => c.id === id);
  openForm(claim ? 'confirm' : null, claim ? { group: groupId, id, name: claim.name } : null);
};

window.sysadminAddPerson = groupId => openForm(groupId ? 'add' : null, groupId ? { group: groupId, name: '', email: '' } : null);

window.sysadminEditSpot = (groupId, drafter) => {
  const conf = groupId && status.groups.find(g => g.id === groupId).confirmed.find(c => c.drafter === drafter);
  openForm(conf ? 'edit' : null, conf ? { group: groupId, drafter, name: conf.name, email: conf.email } : null);
};

// Kept as it's typed, so a re-render (busy, an error) doesn't lose the edit.
window.sysadminFormField = (field, value) => { const s = formState(); if(s) s[field] = value; };

// No re-render: the name being typed keeps its cursor.
window.sysadminAutoWelcome = on => {
  autoWelcome = on;
  try { localStorage.setItem(AUTO_WELCOME_KEY, on ? 'on' : 'off'); } catch (e){}
};

const PERSON_ERRORS = {
  name: 'Add a name first.',
  email: 'That doesn’t look like an email. Leave it empty if you don’t have one.',
  taken: 'Someone in the group already has that name. Try a last initial.',
  claim: 'That claim is gone. It was already confirmed or dismissed.',
  full: 'There’s no open spot left.',
  spot: 'That spot isn’t confirmed any more. Refresh and try again.'
};

const personError = data => PERSON_ERRORS[data.error] || `Couldn’t save (${data.error || 'error'}).`;

// Filling a spot (a claim's Lock in, or Add person) can send the welcome
// email in the same request, as the Welcome email section has it written
// right now.
function fillSpot(groupId, path, body, email, verb){
  const group = status.groups.find(g => g.id === groupId);
  const name = (body.name || '').trim();
  if(!name){ toast(PERSON_ERRORS.name); return; }
  const draft = autoWelcome && email && status.platform.secrets.email ? welcomeDraft(group) : null;
  if(!confirm(`${verb} ${name} to ${group.name}? They’ll show up in the app under this name${draft ? `, and the welcome email goes to ${email}` : ''}.`)) return;
  act(async () => {
    const { ok, data } = await api(path, { ...body, group: groupId, name, ...(draft ? { welcome: { subject: draft.subject, body: draft.body } } : {}) });
    if(!ok) return personError(data);
    confirming = adding = null;
    load();
    const w = data.welcome;
    const mail = !draft ? ''
      : w && w.ok ? ` Welcome email sent to ${email}.`
      : ` The welcome email didn’t send. ${w ? welcomeError(w) : 'The worker needs a deploy first.'} Send it from the roster.`;
    return `${data.name} is in ${group.name}.${mail}`;
  });
}

window.sysadminLockIn = (groupId, id) => {
  if(busy || !confirming) return;
  const claim = status.groups.find(g => g.id === groupId).claims.find(c => c.id === id);
  fillSpot(groupId, '/claims/confirm', { id, name: confirming.name }, (claim && (claim.email || claim.contact)) || '', 'Add');
};

window.sysadminAddSubmit = groupId => {
  if(busy || !adding) return;
  fillSpot(groupId, '/roster/add', { name: adding.name, email: adding.email.trim() }, adding.email.trim(), 'Add');
};

window.sysadminEditSubmit = groupId => {
  if(busy || !editing) return;
  const { drafter, name, email } = editing;
  if(!name.trim()){ toast(PERSON_ERRORS.name); return; }
  act(async () => {
    const { ok, data } = await api('/roster/edit', { group: groupId, drafter, name: name.trim(), email: email.trim() });
    if(!ok) return personError(data);
    editing = null;
    load();
    return `Saved ${data.name}.`;
  });
};

window.sysadminRelease = (groupId, drafter) => {
  const group = status.groups.find(g => g.id === groupId);
  const person = group.confirmed.find(c => c.drafter === drafter);
  if(!person || !confirm(`Take ${person.name} out of ${group.name}? Their spot goes back to open as ${person.spot}.`)) return;
  act(async () => {
    const { ok, data } = await api('/roster/release', { group: groupId, drafter });
    if(!ok || !data.ok) return 'Couldn’t undo that spot.';
    load();
    return `${person.name}’s spot is open again.`;
  });
};

const ACCESS_CONFIRMS = {
  rotate: g => g.access ? `Make a new code for ${g.name}? The old one stops working once you enforce, and everyone needs the new link.` : '',
  enforce: g => `Enforce the code for ${g.name}? Devices without it are turned away until they enter it. Send the link first.`,
  clear: g => `Remove the code? ${g.name} goes back to open to anyone with the address.`
};

window.sysadminAccess = (groupId, action) => {
  const group = status.groups.find(g => g.id === groupId);
  const ask = ACCESS_CONFIRMS[action] && ACCESS_CONFIRMS[action](group);
  if(ask && !confirm(ask)) return;
  act(async () => {
    const { ok, data } = await api('/access', { group: groupId, action });
    if(!ok) return `Couldn’t change it (${data.error || 'error'}).`;
    group.access = data.access;
    load();
    return action === 'rotate' ? `New code: ${data.access.code}. Soft mode, so nobody is turned away yet.`
      : action === 'enforce' ? 'Enforced.'
      : action === 'soften' ? 'Back to soft mode.'
      : 'Code removed.';
  });
};

window.sysadminCopyInvite = async groupId => {
  const group = status.groups.find(g => g.id === groupId);
  let done = false;
  try { await navigator.clipboard.writeText(inviteLink(group)); done = true; } catch (e){}
  toast(done ? 'Invite link copied.' : 'Couldn’t copy. Select the link and copy it by hand.');
};

// Kept as it's typed (no re-render, to keep the cursor), so another
// action's re-render doesn't wipe it.
window.sysadminAnnounceEdit = (groupId, value) => {
  announceDrafts[groupId] = value;
  const count = document.getElementById('announce-count');
  if(count) count.textContent = value.length;
};

window.sysadminAnnounce = groupId => {
  const message = (announceDrafts[groupId] || '').trim();
  const group = status.groups.find(g => g.id === groupId);
  if(!message){ toast('Write the announcement first.'); return; }
  if(!confirm(`Send to everyone in ${group.name} with alerts on?\n\n“${message}”`)) return;
  act(async () => {
    const { ok, data } = await api('/push', { group: groupId, drafter: null, message });
    if(!ok) return `Announcement failed (${data.error || 'error'}).`;
    delete announceDrafts[groupId];
    load();
    return pushResult(data);
  });
};

async function fetchChat(groupId){
  const { ok, data } = await api(`/chat/recent?group=${encodeURIComponent(groupId)}`);
  if(!ok) throw new Error(data.error || 'error');
  chatRecent[groupId] = data.messages || [];
}

window.sysadminChatLoad = groupId => act(async () => {
  try { await fetchChat(groupId); } catch (e){ return 'Couldn’t read the chat room. The worker may need a deploy.'; }
  return '';
});

window.sysadminChatDelete = (groupId, id) => {
  const group = status.groups.find(g => g.id === groupId);
  const m = (chatRecent[groupId] || []).find(x => x.id === id);
  if(!m || !confirm(`Delete ${drafterName(group, m.from)}’s message for everyone?\n\n“${m.text || 'GIF'}”`)) return;
  act(async () => {
    const { ok, data } = await api('/chat/delete', { group: groupId, id });
    if(!ok || !data.ok) return 'Couldn’t delete it. It may already be gone.';
    chatRecent[groupId] = chatRecent[groupId].filter(x => x.id !== id);
    load();
    return 'Deleted for everyone.';
  });
};

// The tab opens inside the tap (a later window.open is popup-blocked),
// then goes to the group's Commissioner page once the token is back.
window.sysadminCommissioner = groupId => {
  const tab = window.open('', '_blank');
  act(async () => {
    const { ok, data } = await api('/commissioner', { group: groupId });
    if(!ok){
      if(tab) tab.close();
      return data.error === 'no_password' ? 'That group has no commissioner password yet.' : `Couldn’t open (${data.error || 'error'}).`;
    }
    const base = groupAppUrl(groupId, host);
    const url = `${base}${base.includes('?') ? '&' : '?'}view=admin#commissioner=${data.token}${data.code ? `&code=${data.code}` : ''}`;
    if(tab) tab.location = url;
    else window.location.href = url;
    load();
    return `Opened as commissioner until ${new Date(data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  });
};

render();
load();
loadPlatformChecks();
