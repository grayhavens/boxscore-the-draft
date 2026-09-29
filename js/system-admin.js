/* ============================================================
   System admin page (admin.html at boxscore.space/admin): the platform
   owner's view across every group. Cloudflare Access does the login; this
   page only calls the worker's /api/admin/* routes (worker/system-admin.js),
   same origin in production.

   - Platform: deployed version, whether ESPN answers, which worker
     secrets are set.
   - A group picker under it: the page shows one group at a time (the
     choice is remembered on this browser), and each option carries its
     count of waiting spot claims so none go unseen.
   - The picked group: draft, chat and activity at a glance, the commissioner
     password's presence, "Open as commissioner" (a 12-hour token the
     group app takes from the URL fragment, see js/admin.js), who has
     alerts on with a test button each, and an announcement to the group.
   - The picked group's spot claims from the landing page
     (worker/claims.js), above the rest of it: newest first. Confirm (with the name editable) puts the person in the
     group's next open spot, no deploy (worker/roster.js); Dismiss drops the
     claim; confirmed people can be undone. There's no push alert for
     claims, so this is where they show.
   - Welcome email, for a group that takes claims or has emails: an
     editable subject and body sent to everyone with an email (a claim's,
     or one added here for a spot named in js/groups.js) from
     admin@boxscore.space
     (worker/welcome-email.js), with a test copy to you first. It offers
     the email to whoever hasn't had it yet, so people confirmed later can
     be welcomed without re-sending to everyone.

   Locally it talks to `wrangler dev` started with ADMIN_DEV_BYPASS=1 (the
   admin-worker config in .claude/launch.json); on any other host it sends
   you to boxscore.space/admin.
   ============================================================ */
import { GROUP_DOMAIN, groupAppUrl, isPlatformHost } from './groups.js';
import { welcomeHtml } from './welcome-template.js';

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
let confirming = null;   // { group, id, name }: the claim whose name is open for editing
let selected = null;     // id of the group on screen
let welcomeDrafts = {};  // group id -> { subject, body } as edited, kept across re-renders
let previewing = null;   // group id whose welcome email preview is open
const SELECTED_KEY = 'sysadmin-group';
try { selected = localStorage.getItem(SELECTED_KEY); } catch (e){}

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

// Spot claims from the landing page (worker/claims.js), first in the
// group's view since they're what needs acting on: newest first. Confirm opens the name for editing, then Lock in gives the
// person the next open spot (worker/roster.js), and the app shows them
// under that name from then on. Confirmed people are listed after, each
// with an Undo that frees the spot again.
function claimRow(g, c, nextSpot){
  const email = c.email || c.contact || '';
  const mail = email ? `<a href="mailto:${esc(email)}">${esc(email)}</a> · ` : '';
  if(confirming && confirming.group === g.id && confirming.id === c.id){
    return `
      <div class="set-row sysadmin-confirm">
        <label class="sysadmin-confirm-label" for="confirm-name">Name in ${esc(g.name)}</label>
        <input id="confirm-name" type="text" maxlength="40" value="${esc(confirming.name ?? c.name)}" autocomplete="off" oninput="sysadminConfirmName(this.value)">
        <span class="set-row-sub">${mail}takes ${esc(nextSpot ? nextSpot.name : 'the next open spot')}’s spot</span>
        <span class="sysadmin-confirm-actions">
          <button type="button" class="sysadmin-btn solid" onclick="sysadminLockIn('${g.id}', '${esc(c.id)}')" ${busy ? 'disabled' : ''}>Lock in</button>
          <button type="button" class="sysadmin-btn" onclick="sysadminConfirmClaim(null)" ${busy ? 'disabled' : ''}>Cancel</button>
        </span>
      </div>`;
  }
  return row(
    esc(c.name),
    `${mail}${ago(c.at)}`,
    `<span class="sysadmin-btns">
      <button type="button" class="sysadmin-btn solid" onclick="sysadminConfirmClaim('${g.id}', '${esc(c.id)}')" ${busy || !nextSpot ? 'disabled' : ''}>Confirm</button>
      <button type="button" class="sysadmin-btn" onclick="sysadminDismissClaim('${g.id}', '${esc(c.id)}')" ${busy ? 'disabled' : ''}>Dismiss</button>
    </span>`
  );
}

function claimsSection(g){
  if(!(g.drafters.some(d => d.open) || g.claims.length || g.confirmed.length)) return '';
  const open = g.drafters.filter(d => d.open).length;
  const nextSpot = g.drafters.find(d => d.open);
  const rows = g.claims.map(c => claimRow(g, c, nextSpot)).join('');
  const confirmed = g.confirmed.map(c => row(
    esc(c.name),
    `${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · ` : ''}was ${esc(c.spot)}${c.at ? ` · ${ago(c.at)}` : ''}`,
    `<button type="button" class="sysadmin-btn" onclick="sysadminRelease('${g.id}', '${esc(c.drafter)}')" ${busy ? 'disabled' : ''}>Undo</button>`
  )).join('');
  return section(`Spot claims${g.claims.length ? ` <span class="sysadmin-count">${g.claims.length}</span>` : ''}`, `
    <div class="sysadmin-claims-group">${open} of ${g.drafters.length} spots open</div>
    ${rows || row('No claims waiting', open ? 'People claim a spot on the landing page.' : 'Every spot is filled.')}
    ${confirmed ? `<div class="set-label sysadmin-sublabel">Confirmed</div>${confirmed}` : ''}
    ${notes[`claims:${g.id}`] ? `<div class="sysadmin-note">${esc(notes[`claims:${g.id}`])}</div>` : ''}`);
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
      'Once it’s open, pick your name and turn on alerts in Settings so you know when you’re on the clock.',
      ...(when ? [`The draft starts ${when}.`] : []),
      'See you at the draft!'
    ].join('\n\n')
  };
}

function welcomeDraft(g){
  return welcomeDrafts[g.id] || (welcomeDrafts[g.id] = welcomeDefaults(g));
}

// The email as the first recipient will get it, from the same template
// the worker sends (js/welcome-template.js).
function welcomePreviewHtml(g){
  const draft = welcomeDraft(g);
  const first = g.welcome.contacts[0];
  const vars = { name: first ? first.name : 'there', group: g.name, link: `https://${g.id}.${GROUP_DOMAIN}` };
  const fill = t => t.replace(/\{(name|group|link)\}/g, (_, k) => vars[k]);
  return welcomeHtml({ groupName: g.name, link: vars.link, subject: fill(draft.subject), text: fill(draft.body) });
}

// Confirmed people have their claim's email; a spot named in
// js/groups.js gets one only when it's added here (Add email).
function welcomeSection(g){
  const people = g.welcome.contacts;
  if(!people.length && !g.drafters.some(d => d.open)) return '';
  if(!status.platform.secrets.email){
    return section('Welcome email', row('Email isn’t set up', 'RESEND_API_KEY', pill(false)));
  }
  const draft = welcomeDraft(g);
  const fresh = people.filter(c => !c.welcomedAt);
  const sent = people.filter(c => c.welcomedAt);
  const open = g.drafters.filter(d => d.open).length;
  const canTest = /@/.test(status.you || '');
  const names = list => list.map(c => esc(c.name)).join(', ');
  const named = g.welcome.named.map(d => row(
    esc(d.name),
    d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : 'No email, so no welcome email',
    `<button type="button" class="sysadmin-btn" onclick="sysadminSetEmail('${g.id}', '${esc(d.drafter)}')" ${busy ? 'disabled' : ''}>${d.email ? 'Edit' : 'Add email'}</button>`
  )).join('');
  if(!people.length) return section('Welcome email', `${named}${row('Nobody to email yet', 'Confirmed people get it with their claim’s email.')}${welcomeNote(g)}`);
  return section('Welcome email', `
    ${named}
    ${row(fresh.length ? `${fresh.length} to welcome` : 'Everyone’s been welcomed',
      [fresh.length ? `Not yet: ${names(fresh)}` : '',
       sent.length ? `Sent: ${names(sent)} · ${ago(Math.max(...sent.map(c => c.welcomedAt)))}` : '',
       open ? `${open} spot${open === 1 ? '' : 's'} still open` : ''].filter(Boolean).join('<br>'))}
    <div class="sysadmin-announce sysadmin-welcome">
      <input type="text" maxlength="120" value="${esc(draft.subject)}" aria-label="Subject" oninput="sysadminWelcomeEdit('${g.id}', 'subject', this.value)">
      <textarea rows="12" maxlength="5000" aria-label="Body" oninput="sysadminWelcomeEdit('${g.id}', 'body', this.value)">${esc(draft.body)}</textarea>
      ${previewing === g.id ? `
        <span class="set-row-sub">Preview, as ${esc((people[0] || {}).name || 'someone')} will get it: <b id="welcome-preview-subject"></b></span>
        <iframe class="sysadmin-preview" id="welcome-preview" title="Welcome email preview" sandbox=""></iframe>` : ''}
      <span class="set-row-sub">{name}, {group} and {link} are filled in for each person. Sent from admin@boxscore.space${canTest ? `; replies go to ${esc(status.you)}` : ''}.</span>
      <div class="sysadmin-confirm-actions">
        <button type="button" class="sysadmin-btn" onclick="sysadminWelcome('${g.id}', true)" ${busy || !canTest ? 'disabled' : ''}>Send me a test</button>
        <button type="button" class="sysadmin-btn" onclick="sysadminWelcomePreview('${g.id}')">${previewing === g.id ? 'Hide preview' : 'Preview'}</button>
        <button type="button" class="sysadmin-btn" onclick="sysadminWelcomeReset('${g.id}')" ${busy ? 'disabled' : ''}>Reset text</button>
      </div>
      <button type="button" class="modal-cta" onclick="sysadminWelcome('${g.id}', false)" ${busy ? 'disabled' : ''}>${!fresh.length ? `Send again to all ${people.length}`
        : fresh.length === 1 ? `Send to ${esc(fresh[0].name)}`
        : fresh.length === people.length ? `Send to all ${fresh.length}`
        : `Send to the ${fresh.length} new`}</button>
    </div>
    ${welcomeNote(g)}`);
}

const welcomeNote = g => notes[`welcome:${g.id}`] ? `<div class="sysadmin-note">${esc(notes[`welcome:${g.id}`])}</div>` : '';

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
    ${notes[g.id] ? `<div class="sysadmin-note">${esc(notes[g.id])}</div>` : ''}
  `);
}

// The remembered group if it still exists, else the first one with claims
// waiting, else the first.
function currentGroup(){
  const groups = status.groups;
  return groups.find(g => g.id === selected) || groups.find(g => g.claims.length) || groups[0];
}

function pickerHtml(current){
  const options = status.groups.map(g => {
    const n = g.claims.length;
    return `<option value="${esc(g.id)}"${g === current ? ' selected' : ''}>${esc(g.name)}${n ? ` · ${n} claim${n === 1 ? '' : 's'} waiting` : ''}</option>`;
  }).join('');
  return `<label class="sysadmin-picker"><span class="set-label">Group</span><select onchange="sysadminPickGroup(this.value)" aria-label="Group to show">${options}</select></label>`;
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
  const g = currentGroup();
  root.innerHTML = `${head}
    <div class="sysadmin-sections">
      ${section('Platform', `
        ${row('Version', version ? esc(version) : 'Checking…')}
        ${row('ESPN', espn ? (espn.ok ? `Answering · ${espn.ms} ms` : 'Not answering') : 'Checking…', espn ? pill(espn.ok, 'Up', 'Down') : '')}
        ${row('Alerts', 'VAPID keys', pill(s.push))}
        ${row('Chat GIFs', 'KLIPY_APP_KEY', pill(s.gifs))}
        ${row('Email', 'RESEND_API_KEY', pill(s.email))}
        ${row('TheRundown', 'THERUNDOWN_API_KEY', pill(s.rundown))}
        ${row('TheSportsDB', 'SPORTSDB_API_KEY', pill(s.sportsdb))}
        <button type="button" class="sysadmin-btn sysadmin-refresh" onclick="sysadminRefresh()">Refresh</button>`)}
      ${g ? `${pickerHtml(g)}${claimsSection(g)}${welcomeSection(g)}${groupHtml(g)}` : ''}
    </div>`;
  refreshWelcomePreview();
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

window.sysadminPickGroup = id => {
  selected = id;
  confirming = null;
  try { localStorage.setItem(SELECTED_KEY, id); } catch (e){}
  render();
};

window.sysadminRefresh = () => { load(); loadPlatformChecks(); };

window.sysadminTest = (groupId, drafter) => act(groupId, async () => {
  const { ok, data } = await api('/push', { group: groupId, drafter, message: '' });
  return ok ? pushResult(data) : `Test failed (${data.error || 'error'}).`;
});

// Fills the preview frame, if it's open. Called after every render and
// on every keystroke (which doesn't re-render, to keep the cursor).
function refreshWelcomePreview(){
  const frame = document.getElementById('welcome-preview');
  const group = frame && status.groups.find(g => g.id === previewing);
  if(!group) return;
  frame.srcdoc = welcomePreviewHtml(group);
  const subject = document.getElementById('welcome-preview-subject');
  const first = group.welcome.contacts[0];
  if(subject) subject.textContent = welcomeDraft(group).subject
    .replace(/\{(name|group|link)\}/g, (_, k) => ({ name: first ? first.name : 'there', group: group.name, link: '' }[k]));
}

window.sysadminWelcomeEdit = (groupId, field, value) => {
  if(welcomeDrafts[groupId]) welcomeDrafts[groupId][field] = value;
  refreshWelcomePreview();
};

window.sysadminWelcomePreview = groupId => {
  previewing = previewing === groupId ? null : groupId;
  render();
};

window.sysadminWelcomeReset = groupId => {
  delete welcomeDrafts[groupId];
  render();
};

const WELCOME_ERRORS = {
  empty: 'Add a subject and a message first.',
  bad_drafters: 'Someone on the list has no email or isn’t confirmed any more. Refresh and try again.',
  no_admin_email: 'There’s no email to send your test to.',
  no_key: 'RESEND_API_KEY isn’t set on the worker.',
  unreachable: 'Couldn’t reach Resend.'
};

window.sysadminWelcome = (groupId, test) => {
  const group = status.groups.find(g => g.id === groupId);
  const draft = welcomeDraft(group);
  const people = group.welcome.contacts;
  const fresh = people.filter(c => !c.welcomedAt);
  const target = fresh.length ? fresh : people;
  if(!test && !confirm(`Email ${target.map(c => c.name).join(', ')}?`)) return;
  act(`welcome:${groupId}`, async () => {
    const { ok, data } = await api('/welcome', {
      group: groupId, drafters: target.map(c => c.drafter), subject: draft.subject, body: draft.body, test
    });
    if(!ok) return WELCOME_ERRORS[data.error] || `Resend said: ${data.detail || data.error || 'error'}.`;
    if(test) return `Test sent to ${status.you}, written as ${target[0].name}.`;
    load();
    return `Sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}.`;
  });
};

window.sysadminSetEmail = (groupId, drafter) => {
  const group = status.groups.find(g => g.id === groupId);
  const spot = group.welcome.named.find(d => d.drafter === drafter);
  const email = prompt(`${spot.name}’s email for the welcome email (empty to remove):`, spot.email);
  if(email === null) return;
  act(`welcome:${groupId}`, async () => {
    const { ok, data } = await api('/email', { group: groupId, drafter, email });
    if(!ok) return data.error === 'email' ? 'That doesn’t look like an email.' : `Couldn’t save (${data.error || 'error'}).`;
    load();
    return data.email ? `Saved ${spot.name}’s email.` : `Removed ${spot.name}’s email.`;
  });
};

window.sysadminDismissClaim = (groupId, id) => {
  const group = status.groups.find(g => g.id === groupId);
  const claim = group.claims.find(c => c.id === id);
  if(!claim || !confirm(`Dismiss ${claim.name}’s claim?`)) return;
  act(`claims:${groupId}`, async () => {
    const { ok } = await api('/claims/dismiss', { group: groupId, id });
    if(!ok) return 'Couldn’t dismiss that claim.';
    group.claims = group.claims.filter(c => c.id !== id);
    return `Dismissed ${claim.name}.`;
  });
};

window.sysadminConfirmClaim = (groupId, id) => {
  confirming = groupId ? { group: groupId, id, name: null } : null;
  render();
  const input = document.getElementById('confirm-name');
  if(input){ input.focus(); input.select(); }
};

// Kept as it's typed, so a re-render (busy, an error) doesn't lose the edit.
window.sysadminConfirmName = value => { if(confirming) confirming.name = value; };

const CONFIRM_ERRORS = {
  name: 'Add a name first.',
  taken: 'Someone in the group already has that name. Try a last initial.',
  claim: 'That claim is gone. It was already confirmed or dismissed.',
  full: 'There’s no open spot left.'
};

window.sysadminLockIn = (groupId, id) => {
  const input = document.getElementById('confirm-name');
  const name = input ? input.value.trim() : '';
  const group = status.groups.find(g => g.id === groupId);
  if(!name){ notes[`claims:${groupId}`] = CONFIRM_ERRORS.name; render(); return; }
  if(!confirm(`Add ${name} to ${group.name}? They’ll show up in the app under this name.`)) return;
  act(`claims:${groupId}`, async () => {
    const { ok, data } = await api('/claims/confirm', { group: groupId, id, name });
    if(!ok) return CONFIRM_ERRORS[data.error] || `Couldn’t confirm (${data.error || 'error'}).`;
    confirming = null;
    load();
    return `${data.name} is in ${group.name}.`;
  });
};

window.sysadminRelease = (groupId, drafter) => {
  const group = status.groups.find(g => g.id === groupId);
  const person = group.confirmed.find(c => c.drafter === drafter);
  if(!person || !confirm(`Take ${person.name} out of ${group.name}? Their spot goes back to open as ${person.spot}.`)) return;
  act(`claims:${groupId}`, async () => {
    const { ok, data } = await api('/roster/release', { group: groupId, drafter });
    if(!ok || !data.ok) return 'Couldn’t undo that spot.';
    load();
    return `${person.name}’s spot is open again.`;
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
