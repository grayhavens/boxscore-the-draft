/* ============================================================
   ADMIN LOG (adminlog in KV): what the system admin page did, newest
   first, so a dismissed claim, a sent announcement or a rotated invite
   code leaves a trace. worker/system-admin.js writes a line after each
   action that changed something or sent something, and /status returns
   the log for the page's "Recent actions". Each group's commissioner
   writes (marks, adjustments, locks, the draft time and poll) land here
   too, as `who: 'Commissioner'` (worker/rundown-proxy.js).

   Platform-wide, not per group: each entry names its group. One admin
   and a handful of actions a day, so a read-modify-write is fine (two
   writes at the same instant could drop one line, which only costs a log
   line). Best effort: a failed write never fails the action it records.

   KV: adminlog -> [{ ts, who, group, action, text }], at most ADMIN_LOG_MAX
   ============================================================ */

export const ADMIN_LOG_KEY = 'adminlog';
export const ADMIN_LOG_MAX = 200;
const TEXT_MAX = 300;

export async function loadAdminLog(env){
  try {
    const stored = await env.LEAGUE_FACTS.get(ADMIN_LOG_KEY, 'json');
    return Array.isArray(stored) ? stored : [];
  } catch (e){
    return [];
  }
}

// The new log with `entry` on top. Pure so tests/admin-log.test.mjs can run it.
export function addEntry(log, entry, now = Date.now()){
  const line = {
    ts: now,
    who: String(entry.who || ''),
    group: String(entry.group || ''),
    action: String(entry.action || ''),
    text: String(entry.text || '').slice(0, TEXT_MAX)
  };
  return [line, ...(Array.isArray(log) ? log : [])].slice(0, ADMIN_LOG_MAX);
}

// A commissioner write's ?note=, as a log line: one line of plain text,
// or '' for none. Pure, for tests/admin-log.test.mjs.
export function commissionerNote(raw){
  return String(raw || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);
}

export async function logAdminAction(env, entry){
  try {
    await env.LEAGUE_FACTS.put(ADMIN_LOG_KEY, JSON.stringify(addEntry(await loadAdminLog(env), entry)));
  } catch (e){
    console.warn('[admin] log write failed', e);
  }
}
