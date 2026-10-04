// Run with: node --test tests/*.test.mjs
// Perigon news: the search chunks, the team matching, and the worker's
// round-robin batch against a fake KV and a fake Perigon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THE_DRAFT_LATEST } from '../js/seasons/the-draft.js';
import { newsTeams, newsChunks, matchTeams, parseArticle, mergeTeamNews, teamFullName } from '../js/news-math.js';
import { refreshNews, handleNews, newsKey } from '../worker/news.js';

const META = THE_DRAFT_LATEST.TEAM_META;
const TEAMS = newsTeams(META);
const byName = (league, name) => TEAMS.find(t => t.leagueKey === league && t.nick === name);

test('full names come from the city or mascot, with overrides for the odd ones', () => {
  assert.equal(byName('nfl', 'Eagles').full, 'Philadelphia Eagles');
  assert.equal(byName('nfl', 'Bucs').full, 'Tampa Bay Buccaneers');
  assert.equal(byName('nba', 'Blazers').full, 'Portland Trail Blazers');
  assert.equal(byName('cfb', 'Houston').full, 'Houston Cougars');
  assert.equal(byName('epl', 'Liverpool').full, 'Liverpool');
  assert.equal(teamFullName({ leagueKey: 'nhl', boardSub: 'Vegas', name: 'Golden Knights' }), 'Vegas Golden Knights');
});

test('every team is in exactly one chunk query, quoted, under the length cap', () => {
  const chunks = newsChunks(TEAMS, 400);
  for(const c of chunks) assert.ok(c.q.length <= 400 + 10, `${c.bucket} chunk is ${c.q.length} chars`);
  for(const t of TEAMS) assert.ok(chunks.some(c => c.bucket === t.bucket && c.q.includes(`"${t.full}"`)), t.full);
  assert.ok(chunks.length <= 25, `${chunks.length} chunks`);
  // The two college leagues share one bucket and don't repeat a name.
  const college = chunks.filter(c => c.bucket === 'college').map(c => c.q).join(' ');
  assert.equal(college.split('"Houston Cougars"').length - 1, 1);
});

test('a headline with a unique nickname matches; a shared one needs the full name', () => {
  const nfl = TEAMS.filter(t => t.bucket === 'nfl');
  const chiefs = byName('nfl', 'Chiefs');
  assert.deepEqual(matchTeams({ title: 'Chiefs top Raiders in overtime' }, nfl).sort(), [chiefs.key, byName('nfl', 'Raiders').key].sort());
  const giants = byName('nfl', 'Giants');
  assert.equal(matchTeams({ title: 'Giants bench the starter' }, TEAMS).includes(giants.key), false);
  assert.equal(matchTeams({ title: 'New York Giants bench the starter' }, TEAMS).includes(giants.key), true);
});

test('matching ignores partial words, and a lone passing mention in the summary', () => {
  const nba = TEAMS.filter(t => t.bucket === 'nba');
  const nuggets = byName('nba', 'Nuggets');
  assert.deepEqual(matchTeams({ title: 'Nuggetsmania returns' }, nba), []);
  // Named once, deep in the text: not about them.
  assert.deepEqual(matchTeams({ title: 'Big win', summary: 'The Denver Nuggets closed on a 12-0 run.' }, nba), []);
  // Named in the lead: about them.
  assert.deepEqual(matchTeams({ title: 'Big win', description: 'The Denver Nuggets closed on a 12-0 run.' }, nba), [nuggets.key]);
  // Named twice in the summary: about them.
  assert.deepEqual(matchTeams({ title: 'Big win', summary: 'The Denver Nuggets closed strong. Denver Nuggets coach spoke after.' }, nba), [nuggets.key]);
});

test('a roundup that mentions a club once in passing does not land on its page', () => {
  const epl = TEAMS.filter(t => t.bucket === 'epl');
  const article = { title: 'Arsenal extend lead at the top', description: 'Mikel Arteta praised his side.', summary: 'Arsenal won 2-0. Elsewhere Manchester City dropped points.' };
  assert.deepEqual(matchTeams(article, epl), [byName('epl', 'Arsenal').key]);
});

test('parseArticle keeps the useful fields and drops link-less rows', () => {
  const a = parseArticle({ articleId: 'a1', url: 'https://x.test/a', title: ' Hi ', pubDate: '2026-10-03T10:00:00Z', source: { domain: 'www.x.test' } });
  assert.equal(a.id, 'a1');
  assert.equal(a.title, 'Hi');
  assert.equal(a.source, 'x.test');
  assert.equal(parseArticle({ title: 'no link' }), null);
});

test('mergeTeamNews dedupes, sorts newest first, drops the old and caps the list', () => {
  const now = Date.parse('2026-10-04T00:00:00Z');
  const mk = (id, at) => ({ id, title: id, url: `https://x.test/${id}`, source: 'x', at });
  const merged = mergeTeamNews([mk('old', '2026-09-01T00:00:00Z'), mk('b', '2026-10-02T00:00:00Z')], [mk('b', '2026-10-02T00:00:00Z'), mk('c', '2026-10-03T00:00:00Z')], now, { limit: 8 });
  assert.deepEqual(merged.map(a => a.id), ['c', 'b']);
  const many = Array.from({ length: 12 }, (_, i) => mk(`n${i}`, `2026-10-03T${String(i).padStart(2, '0')}:00:00Z`));
  assert.equal(mergeTeamNews([], many, now).length, 8);
});

// ---- the worker batch ----
function fakeKv(){
  const data = new Map();
  return { data, async get(k, type){ const v = data.get(k); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; }, async put(k, v){ data.set(k, v); } };
}
function fakeUpstream(articles){
  const urls = [];
  const fn = async url => { urls.push(url); return new Response(JSON.stringify({ articles }), { status: 200 }); };
  fn.urls = urls;
  return fn;
}
const ART = { articleId: 'p1', url: 'https://x.test/p1', title: 'Chiefs edge Bengals', pubDate: '2026-10-03T12:00:00Z', source: { domain: 'x.test' } };
const NOW = Date.parse('2026-10-04T12:00:00Z');

test('refreshNews does nothing without a key', async () => {
  const env = { LEAGUE_FACTS: fakeKv() };
  assert.deepEqual(await refreshNews(env, {}, { cachedUpstreamFetch: fakeUpstream([]), now: NOW }), { ok: false, reason: 'no-key' });
});

test('refreshNews runs four chunks, stores matches per league and advances the cursor', async () => {
  const env = { LEAGUE_FACTS: fakeKv(), PERIGON_API_KEY: 'k' };
  const upstream = fakeUpstream([ART]);
  // Start the cursor at the NFL's first chunk so the article's teams are in scope.
  const first = newsChunks(TEAMS).findIndex(c => c.bucket === 'nfl');
  env.LEAGUE_FACTS.data.set('news@meta', JSON.stringify({ cursor: first, month: '2026-10', calls: 3 }));
  const result = await refreshNews(env, {}, { cachedUpstreamFetch: upstream, now: NOW });
  assert.equal(result.calls, 4);
  assert.equal(upstream.urls.length, 4);
  assert.ok(upstream.urls.every(u => u.includes('category=Sports') && u.includes('apiKey=k')));
  const nfl = await env.LEAGUE_FACTS.get(newsKey('nfl'), 'json');
  const chiefs = TEAMS.find(t => t.leagueKey === 'nfl' && t.nick === 'Chiefs');
  assert.equal(nfl.teams[chiefs.key][0].title, 'Chiefs edge Bengals');
  const meta = await env.LEAGUE_FACTS.get('news@meta', 'json');
  assert.equal(meta.calls, 7);
  assert.equal(meta.cursor, (first + 4) % newsChunks(TEAMS).length);
});

test('refreshNews stops at the monthly cap and starts a new month at zero', async () => {
  const env = { LEAGUE_FACTS: fakeKv(), PERIGON_API_KEY: 'k' };
  env.LEAGUE_FACTS.data.set('news@meta', JSON.stringify({ cursor: 0, month: '2026-10', calls: 140 }));
  const capped = await refreshNews(env, {}, { cachedUpstreamFetch: fakeUpstream([]), now: NOW });
  assert.equal(capped.calls, 0);
  assert.equal(capped.stoppedAt, 'cap');
  const nextMonth = await refreshNews(env, {}, { cachedUpstreamFetch: fakeUpstream([]), now: Date.parse('2026-11-01T12:00:00Z') });
  assert.equal(nextMonth.calls, 4);
  assert.equal(nextMonth.callsThisMonth, 4);
});

test('refresh with reset=1 clears stored stories but keeps the call count', async () => {
  const env = { LEAGUE_FACTS: fakeKv(), PERIGON_API_KEY: 'k' };
  env.LEAGUE_FACTS.data.set('news@nfl', JSON.stringify({ at: 1, teams: { chiefs: [{ id: 'old' }] } }));
  env.LEAGUE_FACTS.data.set('news@meta', JSON.stringify({ cursor: 0, month: '2026-10', calls: 20 }));
  env.LEAGUE_FACTS.delete = async k => { env.LEAGUE_FACTS.data.delete(k); };
  env.ADMIN_PASSWORD = 'pw';
  const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers });
  const url = new URL('https://w.test/news/refresh?reset=1');
  const res = await handleNews(new Request(url, { method: 'POST' }), url, env, {}, {}, {
    json, isAuthorized: async () => true, cachedUpstreamFetch: fakeUpstream([]), group: 'thedraft'
  });
  assert.equal(res.status, 200);
  assert.equal(await env.LEAGUE_FACTS.get('news@nfl', 'json'), null);
  assert.equal((await env.LEAGUE_FACTS.get('news@meta', 'json')).calls, 24);
});

test('a failed call counts, stops the batch and leaves the cursor on that chunk', async () => {
  const env = { LEAGUE_FACTS: fakeKv(), PERIGON_API_KEY: 'k' };
  const failing = async () => new Response('nope', { status: 429 });
  const result = await refreshNews(env, {}, { cachedUpstreamFetch: failing, now: NOW });
  assert.equal(result.calls, 1);
  assert.equal(result.chunks, 0);
  assert.equal(result.stoppedAt, 'http-429');
  assert.equal((await env.LEAGUE_FACTS.get('news@meta', 'json')).cursor, 0);
});

test('GET /news/<league> answers the stored teams, and hides everything without a key', async () => {
  const env = { LEAGUE_FACTS: fakeKv(), PERIGON_API_KEY: 'k' };
  env.LEAGUE_FACTS.data.set('news@nfl', JSON.stringify({ at: 5, teams: { chiefs: [{ id: 'a' }] } }));
  const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers });
  const ask = (e, path) => handleNews(new Request(`https://w.test${path}`), new URL(`https://w.test${path}`), e, {}, {}, { json });
  assert.deepEqual((await (await ask(env, '/news/nfl')).json()).teams, { chiefs: [{ id: 'a' }] });
  assert.deepEqual((await (await ask({ LEAGUE_FACTS: env.LEAGUE_FACTS }, '/news/nfl')).json()).teams, {});
  assert.equal((await ask(env, '/news/curling')).status, 404);
});
