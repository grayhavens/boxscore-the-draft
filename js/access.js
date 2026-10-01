/* ============================================================
   Group invite code in the browser (worker/access-code.js): a light gate
   that keeps outsiders out of a group's own state. Nothing to sign up for:
   the invite link carries the code (https://<group>.boxscore.space/#code=
   maple-river-42), opening it stores the code on the device, and every
   group call then sends it as ?gc= (withGroupQuery in js/group.js). A device
   that arrives without it, such as the Home Screen app, which keeps its own
   storage and starts at a fixed URL, is asked for it once.

   ensureAccess runs at boot from js/group.js, before anything reads group
   state. A device that has been let in before doesn't wait on the network:
   it carries on and the check runs behind it, sending the device back
   through here only if the code was rotated or enforcing turned on. A
   failed check never blocks boot (the worker still does the refusing).
   ============================================================ */
import { DASHBOARD_WORKER_BASE } from './worker-base.js';
import { LEGACY_GROUP_ID } from './groups.js';

import { buttonHtml } from './ui.js';
const FIRST_CHECK_WAIT_MS = 3000;
const codeKey = groupId => `bx-access@${groupId}`;
const openKey = groupId => `bx-access-open@${groupId}`;

let code = '';

export const accessCode = () => code;

const normalize = value => String(value || '').trim().toLowerCase()
  .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function store(groupId, value){
  code = value;
  try {
    if(value) localStorage.setItem(codeKey(groupId), value);
    else localStorage.removeItem(codeKey(groupId));
  } catch (e){}
}

// #code=... in the address bar (the invite link) is taken and dropped from
// it, leaving any other fragment pieces (#splash=handoff, #commissioner=...)
// in place for whoever reads those.
function takeCodeFromHash(){
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const fromLink = normalize(params.get('code'));
    if(!params.has('code')) return '';
    params.delete('code');
    const rest = params.toString();
    history.replaceState(history.state, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
    return fromLink;
  } catch (e){ return ''; }
}

// { required, ok } from the worker, null when it can't be reached.
async function check(groupId, supplied){
  try {
    const params = new URLSearchParams();
    if(groupId !== LEGACY_GROUP_ID) params.set('group', groupId);
    if(supplied) params.set('gc', supplied);
    const res = await fetch(`${DASHBOARD_WORKER_BASE}/access/check?${params}`, { cache: 'no-store' });
    if(!res.ok) return null;
    const data = await res.json();
    return data && typeof data.required === 'boolean' ? data : null;
  } catch (e){ return null; }
}

function showGate(groupId, groupName){
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.id = 'access-gate';
    el.className = 'access-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <form class="access-card" autocomplete="off">
        <img class="access-logo" src="icons/logo-header.png" alt="">
        <h1 class="access-title"></h1>
        <p class="access-sub">Enter the invite code from your invite link or welcome email.</p>
        <input class="access-input" type="text" inputmode="text" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" placeholder="maple-river-42" aria-label="Invite code">
        <p class="access-error" role="alert"></p>
        ${buttonHtml({ label: 'Continue', type: 'submit' })}
      </form>`;
    el.querySelector('.access-title').textContent = groupName;
    const form = el.querySelector('form');
    const input = el.querySelector('input');
    const error = el.querySelector('.access-error');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const entered = normalize(input.value);
      if(!entered){ error.textContent = 'Type the invite code first.'; return; }
      form.classList.add('busy');
      error.textContent = '';
      const result = await check(groupId, entered);
      form.classList.remove('busy');
      if(!result){ error.textContent = 'Couldn’t reach the server. Try again.'; return; }
      if(result.required && !result.ok){ error.textContent = 'That code didn’t work. Check it and try again.'; return; }
      store(groupId, entered);
      el.remove();
      resolve();
    });
    document.body.appendChild(el);
    input.focus();
  });
}

export async function ensureAccess(groupId, groupName){
  const fromLink = takeCodeFromHash();
  let saved = '';
  try { saved = localStorage.getItem(codeKey(groupId)) || ''; } catch (e){}
  code = fromLink || saved;
  if(fromLink) store(groupId, fromLink);

  let knownOpen = false;
  try { knownOpen = localStorage.getItem(openKey(groupId)) === '1'; } catch (e){}

  const apply = result => {
    if(!result) return;
    try {
      if(result.required) localStorage.removeItem(openKey(groupId));
      else localStorage.setItem(openKey(groupId), '1');
    } catch (e){}
  };

  // Let in before (a code that worked, or a group that was open): carry on
  // now and find out behind boot whether that still holds.
  if((code || knownOpen) && !fromLink){
    check(groupId, code).then(result => {
      apply(result);
      if(result && result.required && !result.ok){
        store(groupId, '');
        window.location.reload();
      }
    });
    return;
  }

  const result = await Promise.race([check(groupId, code), new Promise(r => setTimeout(() => r(null), FIRST_CHECK_WAIT_MS))]);
  apply(result);
  if(result && result.required && !result.ok){
    store(groupId, '');
    await showGate(groupId, groupName);
  }
}
