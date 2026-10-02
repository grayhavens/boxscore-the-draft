/* ============================================================
   Chat mentions ("@Isaac", and "@everyone" for the commissioner).
   Pure, shared by the browser (js/chat.js), the chat room
   (worker/chat-room.js) and Node tests.

   A message carries its text as typed plus `mentions`, a list of the
   drafter ids it tags. Ids, not names, because names have spaces and a
   roster confirm can rename a spot: the text says "@Eric H", the
   mentions say 'erichylok'. The composer finds them in the text when it
   sends (findMentions); the worker only keeps real drafters
   (parseMentions) and decides who gets a mention alert instead of the
   plain chat one (splitRecipients).
   ============================================================ */

export const EVERYONE = 'everyone';
export const EVERYONE_NAME = 'everyone';
export const MAX_MENTIONS = 10;

// A name ends at anything that isn't a letter or digit, so "@Isaac's"
// tags Isaac and "@Ericson" doesn't tag Eric.
const isNameChar = ch => /[\p{L}\p{N}]/u.test(ch);

// Every "@Name" in `text`, as [{ id, start, end }] in order, for the
// candidates given ([{ id, name }]). Longest name first at each "@", so
// "@Eric H" is Eric H and not Eric. Case-insensitive, and the "@" has to
// start the text or follow whitespace (an email address isn't a mention).
export function mentionMatches(text, candidates){
  if(typeof text !== 'string' || !text.includes('@')) return [];
  const sorted = candidates.filter(c => c && c.name).slice().sort((a, b) => b.name.length - a.name.length);
  const out = [];
  for(let i = text.indexOf('@'); i !== -1; i = text.indexOf('@', i + 1)){
    if(i > 0 && !/\s/.test(text[i - 1])) continue;
    const rest = text.slice(i + 1);
    const hit = sorted.find(c => rest.slice(0, c.name.length).toLowerCase() === c.name.toLowerCase() && !isNameChar(rest[c.name.length] || ''));
    if(!hit) continue;
    const end = i + 1 + hit.name.length;
    out.push({ id: hit.id, start: i, end });
    i = end - 1;
  }
  return out;
}

// The ids a message being sent tags, deduped, in the order they appear.
export function findMentions(text, candidates){
  return [...new Set(mentionMatches(text, candidates).map(m => m.id))].slice(0, MAX_MENTIONS);
}

// The text split for rendering: [{ text }, { text, id }, ...], the second
// kind being a mention of `id`. Only ids the message actually carries are
// highlighted, so "@Josh" typed into an old app (no mentions) stays plain.
export function mentionSegments(text, mentions, candidates){
  if(!Array.isArray(mentions) || !mentions.length) return [{ text }];
  const tagged = candidates.filter(c => mentions.includes(c.id));
  const out = [];
  let at = 0;
  mentionMatches(text, tagged).forEach(m => {
    if(m.start > at) out.push({ text: text.slice(at, m.start) });
    out.push({ text: text.slice(m.start, m.end), id: m.id });
    at = m.end;
  });
  if(at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// The worker's check on what a client sent: only the group's drafters
// (and EVERYONE, which the room strips unless the sender is the
// commissioner), never the sender, no repeats, at most MAX_MENTIONS. A bad
// entry is dropped rather than failing the message.
export function parseMentions(raw, drafterIds, from){
  if(!Array.isArray(raw)) return [];
  const ok = new Set(drafterIds);
  const out = [];
  raw.forEach(id => {
    if(typeof id !== 'string' || id === from || out.includes(id)) return;
    if(id === EVERYONE || ok.has(id)) out.push(id);
  });
  return out.slice(0, MAX_MENTIONS);
}

// Who of the alert's recipients was tagged (they get the mention alert)
// and who wasn't (the plain chat alert). "@everyone" tags them all.
export function splitRecipients(recipients, mentions){
  const list = Array.isArray(mentions) ? mentions : [];
  const all = list.includes(EVERYONE);
  const tagged = recipients.filter(id => all || list.includes(id));
  return { tagged, others: recipients.filter(id => !tagged.includes(id)) };
}

// Whether `id` is tagged by a message's mentions.
export function mentionsMe(mentions, id){
  return Array.isArray(mentions) && (mentions.includes(id) || mentions.includes(EVERYONE));
}

// The "@" being typed right before the caret, for the composer's list:
// { start, query } or null. The query can hold spaces ("@Eric H"), but
// not a newline or another "@", and stops being one past 20 characters.
export function activeMentionQuery(text, caret){
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if(at === -1 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if(query.length > 20 || /[\n@]/.test(query)) return null;
  return { start: at, query };
}

// The composer list's options for a query: names that start with it,
// case-insensitive.
export function mentionOptions(query, candidates){
  const q = query.toLowerCase();
  return candidates.filter(c => c.name.toLowerCase().startsWith(q));
}
