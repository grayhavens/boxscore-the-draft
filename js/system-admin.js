/* ============================================================
   System admin page (admin.html at boxscore.space/admin): the platform
   owner's view across every group. Cloudflare Access does the login; this
   page only calls the worker's /api/admin/* routes (worker/system-admin.js),
   same origin in production.

   - Platform: deployed version, whether ESPN answers, which worker
     secrets are set.
   - Each group: draft, chat and activity at a glance, the commissioner
     password's presence, "Open as commissioner" (a 12-hour token the
     group app takes from the URL fragment, see js/admin.js), who has
     alerts on with a test button each, and an announcement to the group.
   - Spot claims from the landing page (worker/claims.js), newest first,
     each with a Dismiss once you've added the person to js/groups.js.

   Locally it talks to `wrangler dev` started with ADMIN_DEV_BYPASS=1 (the
   admin-worker config in .claude/launch.json); on any other host it sends
   you to boxscore.space/admin.
   ============================================================ */
import { GROUP_DOMAIN, groupAppUrl, isPlatformHost } from './groups.js';

const host = window.location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
const API = isLocal ? 'http://localhost:8787/api/admin' : '/api/admin';
const ESPN_PING = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

if(!isLocal && !isPlatformHost(host)) window.location.replace(`https://${GROUP_DOMAIN}/admin`);

const root = document.getElementById('sysadmin');
let status = null;       // GET /status
let loadError = '';
let version = null;      // APP_VERSION from js/board.js
let espn = null;         // { ok, ms }
let notes = {};          // group id -> last action's result line
let busy = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(ts){
  if(!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if(m < 1) return 'just now';
  if(m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if(h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const pill = (ok, yes = 'Set', no = 'Missing') =>
  `<span class="sysadmin-pill ${ok ? 'ok' : 'bad'}">${ok ? yes : no}</span>`;

function row(title, sub, right = ''){
  return `<div class="set-row"><span class="set-row-text"><span class="set-row-title">${title}</span>${sub ? `<span class="set-row-sub">${sub}</span>` : ''}</span>${right}</div>`;
}

const section = (label, body) => `<section class="set-section"><div class="set-label">${label}</div>${body}</section>`;

async function api(path, body){
  const res = await fetch(`${API}${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function load(){
  loadError = '';
  try {
    const { ok, status: code, data } = await api('/status');
    if(ok) status = data;
    else loadError = code === 503 ? 'Cloudflare Access isn’t set up on the worker yet (ACCESS_TEAM_DOMAIN / ACCESS_AUD).'
      : code === 401 ? 'Not signed in. Reload to sign in again.'
      : `The worker answered ${code}.`;
  } catch (e){
    loadError = 'Couldn’t reach the worker.';
  }
  render();
}

async function loadPlatformChecks(){
  try {
    const src = await (await fetch('js/board.js', { cache: 'no-store' })).text();
    const m = src.match(/APP_VERSION = '([^']+)'/);
    version = m ? m[1] : '?';
  } catch (e){ version = '?'; }
  const t0 = performance.now();
  try {
    const res = await fetch(ESPN_PING, { cache: 'no-store' });
    espn = { ok: res.ok, ms: Math.round(performance.now() - t0) };
  } catch (e){ espn = { ok: false, ms: null }; }
  render();
}

function draftLine(d, group){
  if(!d) return 'Couldn’t read the draft room';
  const name = id => (group.drafters.find(x => x.id === id) || {}).name || id;
  if(d.phase === 'done') return `Done · ${d.total} picks`;
  if(d.phase === 'draft') return `${d.running ? 'Live' : 'Paused'}${d.slot === null ? '' : ` · pick ${d.slot + 1} of ${d.total}`}${d.owner ? ` · ${esc(name(d.owner))} on the clock` : ''}`;
  return `Lobby · ${d.ordered ? 'order drawn' : 'no order yet'} · ${d.poolSize} teams in the pool`;
}

function chatLine(c, group){
  if(!c) return 'Couldn’t read the chat room';
  if(!c.messages) return 'No messages yet';
  const who = (group.drafters.find(x => x.id === c.last.from) || {}).name || c.last.from;
  return `${c.messages} kept · last from ${esc(who)} ${ago(c.last.ts)} · ${c.connected} connected`;
}

function claimsHtml(g){
  const open = g.drafters.filter(d => d.open).length;
  if(!open && !g.claims.length) return '';
  const rows = g.claims.map(c => row(
    esc(c.name),
    `${esc(c.email || c.contact || '')} · ${ago(c.at)}`,
    `<button type="button" class="sysadmin-btn" onclick="sysadminDismissClaim('${g.id}', '${esc(c.id)}')" ${busy ? 'disabled' : ''}>Dismiss</button>`
  )).join('');
  return `
    <div class="set-label sysadmin-sublabel">Spot claims · ${open} open</div>
    ${rows || row('No claims yet', 'People can claim a spot from the landing page.')}`;
}

function groupHtml(g){
  const alertsOn = status.platform.secrets.push;
  // Only drafters with a device get a row (and a Test button); the rest
  // share one line.
  const withDevices = g.drafters.filter(d => d.devices);
  const without = g.drafters.filter(d => !d.devices).map(d => esc(d.name));
  const drafters = withDevices.map(d => row(
    esc(d.name),
    `${d.devices} device${d.devices === 1 ? '' : 's'} · chat ${d.chat} · draft ${d.draft}`,
    alertsOn ? `<button type="button" class="sysadmin-btn" onclick="sysadminTest('${g.id}', '${d.id}')" ${busy ? 'disabled' : ''}>Test</button>` : ''
  )).join('') + (without.length
    ? row(withDevices.length ? 'No alerts' : 'Nobody has alerts on yet', withDevices.length ? without.join(', ') : '')
    : '');
  return section(esc(g.name), `
    <a class="set-row landing-group" href="${groupAppUrl(g.id, host)}" target="_blank" rel="noopener">
      <span class="set-row-text"><span class="set-row-title">Open ${esc(g.name)}</span><span class="set-row-sub">${g.id}.${GROUP_DOMAIN}</span></span>
      <span class="set-chev">&rsaquo;</span>
    </a>
    ${row('Commissioner', g.commissionerPassword ? 'Password set' : 'No password: <code>ADMIN_PASSWORD' + (g.id === 'thedraft' ? '' : `_${g.id.toUpperCase()}`) + '</code>',
      g.commissionerPassword ? `<button type="button" class="sysadmin-btn" onclick="sysadminCommissioner('${g.id}')" ${busy ? 'disabled' : ''}>Open as commissioner</button>` : pill(false))}
    ${row('Draft', draftLine(g.draft, g))}
    ${row('Chat', chatLine(g.chat, g))}
    ${row('Activity', g.activity.events ? `${g.activity.events} events · latest ${ago(g.activity.lastTs)}` : 'Nothing logged yet')}
    <div class="set-label sysadmin-sublabel">Alerts</div>
    ${drafters}
    ${alertsOn ? `
      <div class="sysadmin-announce">
        <textarea id="announce-${g.id}" maxlength="200" rows="2" placeholder="Announcement to everyone in ${esc(g.name)} with alerts on"></textarea>
        <button type="button" class="modal-cta" onclick="sysadminAnnounce('${g.id}')" ${busy ? 'disabled' : ''}>Send announcement</button>
      </div>` : ''}
    ${claimsHtml(g)}
    ${notes[g.id] ? `<div class="sysadmin-note">${esc(notes[g.id])}</div>` : ''}
  `);
}

function render(){
  const head = `
    <img class="app-logo landing-logo" src="icons/logo-header.png" alt="">
    <h1 class="landing-title">Admin</h1>
    <p class="landing-sub">${status ? `Signed in as ${esc(status.you)} · ` : ''}<a href="./">Boxscore</a>${isLocal ? '' : ' · <a href="/cdn-cgi/access/logout">Sign out</a>'}</p>`;
  if(!status){
    root.innerHTML = `${head}<div class="sysadmin-note">${loadError ? esc(loadError) : 'Loading…'}</div>`;
    return;
  }
  const s = status.platform.secrets;
  root.innerHTML = `${head}
    <div class="sysadmin-sections">
      ${section('Platform', `
        ${row('Version', version ? esc(version) : 'Checking…')}
        ${row('ESPN', espn ? (espn.ok ? `Answering · ${espn.ms} ms` : 'Not answering') : 'Checking…', espn ? pill(espn.ok, 'Up', 'Down') : '')}
        ${row('Alerts', 'VAPID keys', pill(s.push))}
        ${row('Chat GIFs', 'KLIPY_APP_KEY', pill(s.gifs))}
        ${row('TheRundown', 'THERUNDOWN_API_KEY', pill(s.rundown))}
        ${row('TheSportsDB', 'SPORTSDB_API_KEY', pill(s.sportsdb))}
        <button type="button" class="sysadmin-btn sysadmin-refresh" onclick="sysadminRefresh()">Refresh</button>`)}
      ${status.groups.map(groupHtml).join('')}
    </div>`;
}

async function act(groupId, fn){
  if(busy) return;
  busy = true;
  notes[groupId] = '';
  render();
  try {
    notes[groupId] = await fn();
  } catch (e){
    notes[groupId] = 'Couldn’t reach the worker.';
  }
  busy = false;
  render();
}

const pushResult = d => d.devices
  ? `Sent to ${d.sent} of ${d.devices} device${d.devices === 1 ? '' : 's'}${d.removed ? `, ${d.removed} dead one${d.removed === 1 ? '' : 's'} removed` : ''}.`
  : 'No devices to send to.';

window.sysadminRefresh = () => { load(); loadPlatformChecks(); };

window.sysadminTest = (groupId, drafter) => act(groupId, async () => {
  const { ok, data } = await api('/push', { group: groupId, drafter, message: '' });
  return ok ? pushResult(data) : `Test failed (${data.error || 'error'}).`;
});

window.sysadminDismissClaim = (groupId, id) => {
  const group = status.groups.find(g => g.id === groupId);
  const claim = group.claims.find(c => c.id === id);
  if(!claim || !confirm(`Dismiss ${claim.name}’s claim?`)) return;
  act(groupId, async () => {
    const { ok } = await api('/claims/dismiss', { group: groupId, id });
    if(!ok) return 'Couldn’t dismiss that claim.';
    group.claims = group.claims.filter(c => c.id !== id);
    return `Dismissed ${claim.name}.`;
  });
};

window.sysadminAnnounce = groupId => {
  const input = document.getElementById(`announce-${groupId}`);
  const message = input ? input.value.trim() : '';
  const group = status.groups.find(g => g.id === groupId);
  if(!message || !confirm(`Send to everyone in ${group.name} with alerts on?\n\n“${message}”`)) return;
  act(groupId, async () => {
    const { ok, data } = await api('/push', { group: groupId, drafter: null, message });
    return ok ? pushResult(data) : `Announcement failed (${data.error || 'error'}).`;
  });
};

// The tab opens inside the tap (a later window.open is popup-blocked),
// then goes to the group's Commissioner page once the token is back.
window.sysadminCommissioner = groupId => {
  const tab = window.open('', '_blank');
  act(groupId, async () => {
    const { ok, data } = await api('/commissioner', { group: groupId });
    if(!ok){
      if(tab) tab.close();
      return data.error === 'no_password' ? 'That group has no commissioner password yet.' : `Couldn’t open (${data.error || 'error'}).`;
    }
    const base = groupAppUrl(groupId, host);
    const url = `${base}${base.includes('?') ? '&' : '?'}view=admin#commissioner=${data.token}`;
    if(tab) tab.location = url;
    else window.location.href = url;
    return `Opened as commissioner until ${new Date(data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  });
};

render();
load();
loadPlatformChecks();
