// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSeason, findEspnTeam, renderSeasonModule, updateRegistry, fetchEspnTeams, entryFromEspn } from '../tools/draft-export-lib.mjs';

const DRAFTERS = ['a', 'b'];
const CAPS = { nfl: 1, cfb: 1, mcbb: 1 };          // 3 rounds x 2 drafters = 6 picks

const prev = {
  TEAM_META: {
    lions: { name: 'Lions', leagueKey: 'nfl', draftTeamId: 'a', boardSub: 'Detroit', sub: 'Detroit', accent: '#0076B6', badgeStyle: 'background:#0076B6; color:#B0B7BC;', badgeText: 'DET', sportsdbId: '134939', rundownTeamId: 82, badgeUrl: 'https://a.espncdn.com/i/x.png' },
    b_ohiostate: { name: 'Ohio State', leagueKey: 'cfb', draftTeamId: 'b', boardSub: 'Buckeyes', sub: 'Buckeyes', accent: '#BB0000', badgeStyle: 'x', badgeText: 'OSU', sportsdbId: '1', recentLabel: 'Results So Far', badgeUrl: 'https://a.espncdn.com/o.png' },
    houston: { name: 'Houston', leagueKey: 'mcbb', draftTeamId: 'a', boardSub: 'Cougars', sub: 'Cougars', accent: '#C8102E', badgeStyle: 'y', badgeText: 'HOU', sportsdbId: null, espnTeamId: '248', badgeUrl: 'https://a.espncdn.com/h.png' },
    okstate: { name: 'Oklahoma State', leagueKey: 'cfb', favoriteOnly: true, boardSub: 'Cowboys', sub: 'Cowboys', accent: '#FE5C00', badgeStyle: 'z', badgeText: 'OKST', sportsdbId: '2' }
  },
  LEAGUES: [
    { key: 'nfl', label: 'NFL', season: "'26 Season", teams: ['lions'] },
    { key: 'cfb', label: 'College FB', season: "'26 Season", teams: ['b_ohiostate', 'okstate'] },
    { key: 'mcbb', label: 'College BB', season: "'26/'27 Season", teams: ['houston'] }
  ],
  PRIOR_SEASON_DISPLAY_LEAGUES: ['mlb', 'wnba']
};

const ESPN = {
  nfl: [
    { id: '22', name: 'Cardinals', location: 'Arizona', displayName: 'Arizona Cardinals', shortDisplayName: 'Cardinals', abbr: 'ARI', color: 'a40227', logo: 'https://a.espncdn.com/ari.png' },
    { id: '8', name: 'Lions', location: 'Detroit', displayName: 'Detroit Lions', shortDisplayName: 'Lions', abbr: 'DET', color: '0076b6', logo: null }
  ],
  cfb: [
    { id: '2', name: 'Tigers', location: 'Auburn', displayName: 'Auburn Tigers', shortDisplayName: 'Auburn', abbr: 'AUB', color: '0c2340', logo: 'https://a.espncdn.com/aub.png' },
    { id: '2306', name: 'Golden Flashes', location: 'Kent State', displayName: 'Kent State Golden Flashes', shortDisplayName: 'Kent State', abbr: 'KENT', color: '002664', logo: null },
    { id: '99', name: 'Wildcats', location: 'Southern Utah', displayName: 'Southern Utah Wildcats', shortDisplayName: 'S Utah', abbr: 'SUU', color: null, logo: null },
    { id: '98', name: 'Jaguars', location: 'Southern', displayName: 'Southern Jaguars', shortDisplayName: 'Southern', abbr: 'SOU', color: null, logo: null }
  ],
  mcbb: [
    { id: '2', name: 'Tigers', location: 'Auburn', displayName: 'Auburn Tigers', shortDisplayName: 'Auburn', abbr: 'AUB', color: '0c2340', logo: 'https://a.espncdn.com/aub.png' },
    { id: '248', name: 'Cougars', location: 'Houston', displayName: 'Houston Cougars', shortDisplayName: 'Houston', abbr: 'HOU', color: 'c8102e', logo: null }
  ]
};
const espn = async league => ESPN[league] || [];

const T = (id, league, name, extra = {}) => ({ id, league, name, abbr: name.slice(0, 3), color: '#112233', ...extra });
function pick(slot, drafter, team){ return { slot, round: Math.floor(slot / 2) + 1, pick: (slot % 2) + 1, drafter, team }; }

function goodResult(){
  return {
    phase: 'done', complete: true, totalPicks: 6, order: ['a', 'b'],
    config: { drafters: DRAFTERS, caps: CAPS },
    picks: [
      pick(0, 'a', T('nfl_lions', 'nfl', 'Lions')),
      pick(1, 'b', T('nfl_cardinals', 'nfl', 'Cardinals')),
      pick(2, 'b', T('cfb_ohio_state', 'cfb', 'Ohio State')),
      pick(3, 'a', T('cfb_wi_kent_state', 'cfb', 'Kent State', { custom: true })),
      pick(4, 'a', T('mcbb_houston', 'mcbb', 'Houston')),
      pick(5, 'b', T('mcbb_auburn', 'mcbb', 'Auburn'))
    ]
  };
}
const build = (result, extra = {}) => buildSeason({ result, prev, year: 2027, drafterIds: DRAFTERS, espn, ...extra });

test('copies previous-season entries with the new owner and resolves the rest from ESPN', async () => {
  const built = await build(goodResult());
  assert.equal(built.ok, true, built.problems.join('; '));
  // lions moved from a -> a (same) and ohio state from b -> b; check a swap explicitly below
  assert.equal(built.meta.a_lions.draftTeamId, 'a');
  assert.equal(built.meta.a_lions.sportsdbId, '134939');
  assert.equal(built.meta.a_lions.rundownTeamId, 82);
  assert.equal(built.meta.a_lions.__generated, undefined);
  assert.equal(built.meta.b_ohiostate.recentLabel, 'Results So Far');
  // ESPN-generated pro team: nickname as name, city as boardSub, espn id + logo, sportsdbId null
  const card = built.meta.b_cardinals;
  assert.deepEqual([card.name, card.boardSub, card.sub, card.badgeText, card.espnTeamId, card.badgeUrl, card.sportsdbId, card.accent], ['Cardinals', 'Arizona', 'Arizona', 'ARI', '22', 'https://a.espncdn.com/ari.png', null, '#A40227']);
  assert.equal(card.__generated, true);
  assert.match(card.badgeStyle, /^background:#A40227; color:#FFFFFF;$/);
  // write-in college school: school as name, nickname as sub, recentLabel for cfb
  const kent = built.meta.a_kentstate;
  assert.deepEqual([kent.name, kent.sub, kent.espnTeamId, kent.recentLabel], ['Kent State', 'Golden Flashes', '2306', 'Results So Far']);
  assert.equal(built.generated.length, 3);   // cardinals, kent state, auburn cbb
});

test('an owner change is applied to the copied entry', async () => {
  const r = goodResult();
  r.picks[0] = pick(0, 'b', T('nfl_lions', 'nfl', 'Lions'));      // b takes the Lions now
  r.picks[1] = pick(1, 'a', T('nfl_cardinals', 'nfl', 'Cardinals'));
  const built = await build(r);
  assert.equal(built.meta.b_lions.draftTeamId, 'b');
  assert.equal(built.meta.b_lions.name, 'Lions');
});

test('league arrays follow pick order, then carry favorite-only teams over at the end', async () => {
  const built = await build(goodResult());
  const byKey = Object.fromEntries(built.leagues.map(l => [l.key, l]));
  assert.deepEqual(byKey.nfl.teams, ['a_lions', 'b_cardinals']);
  assert.deepEqual(byKey.cfb.teams, ['b_ohiostate', 'a_kentstate', 'okstate']);
  assert.equal(built.meta.okstate.favoriteOnly, true);
  assert.equal(byKey.nfl.season, "'27 Season");
  assert.equal(byKey.mcbb.season, "'27/'28 Season");
  assert.deepEqual(built.priorSeasonLeagues, ['mlb', 'wnba']);
});

test('the same school in two leagues for one owner gets a _cbb suffix', async () => {
  const r = goodResult();
  r.picks[3] = pick(3, 'b', T('cfb_auburn', 'cfb', 'Auburn'));            // b: Auburn football...
  r.picks[2] = pick(2, 'a', T('cfb_ohio_state', 'cfb', 'Ohio State'));
  r.picks[5] = pick(5, 'b', T('mcbb_auburn', 'mcbb', 'Auburn'));          // ...and Auburn basketball
  const built = await build(r);
  assert.ok(built.meta.b_auburn && built.meta.b_auburn_cbb, Object.keys(built.meta).join(','));
  assert.equal(built.meta.b_auburn.leagueKey, 'cfb');
  assert.equal(built.meta.b_auburn_cbb.leagueKey, 'mcbb');
});

test('refuses an incomplete draft unless allowed', async () => {
  const r = goodResult(); r.complete = false; r.phase = 'draft'; r.picks = r.picks.slice(0, 4);
  const built = await build(r);
  assert.equal(built.ok, false);
  assert.match(built.problems[0], /not complete/);
  const partial = await build(r, { allowPartial: true });
  assert.equal(partial.ok, true);
});

test('flags bad rosters, unknown drafters and duplicate teams', async () => {
  const r = goodResult();
  r.picks[5] = pick(5, 'b', T('nfl_cardinals', 'nfl', 'Cardinals'));          // duplicate team, wrong league mix
  const built = await build(r);
  assert.equal(built.ok, false);
  assert.ok(built.problems.some(p => /drafted twice/.test(p)));
  assert.ok(built.problems.some(p => /expected 1/.test(p)));
  const r2 = goodResult(); r2.picks[0].drafter = 'zed';
  assert.ok((await build(r2)).problems.some(p => /unknown drafter "zed"/.test(p)));
});

test('a team ESPN cannot place is reported with suggestions, and blocks the export', async () => {
  const r = goodResult();
  r.picks[3] = pick(3, 'a', T('cfb_wi_kent_sate', 'cfb', 'Kent Sate', { custom: true }));   // typo
  const built = await build(r);
  assert.equal(built.ok, false);
  assert.equal(built.unresolved.length, 1);
  assert.match(built.problems.join('\n'), /Could not place pick 4 \(cfb: Kent Sate, a\)/);
  assert.match(built.problems.join('\n'), /Kent State Golden Flashes \(2306\)/);
});

test('an override id resolves a team by its ESPN id', async () => {
  const r = goodResult();
  r.picks[3] = pick(3, 'a', T('cfb_wi_kent_sate', 'cfb', 'Kent Sate', { custom: true }));
  const built = await build(r, { overrides: { 'cfb:Kent Sate': '2306' } });
  assert.equal(built.ok, true, built.problems.join('; '));
  assert.equal(built.meta.a_kentstate.espnTeamId, '2306');   // named from ESPN, not from the typo
});

test('an ESPN outage is reported per league, not thrown', async () => {
  const built = await build(goodResult(), { espn: async () => { throw new Error('boom'); } });
  assert.equal(built.ok, false);
  assert.ok(built.notes.some(n => /boom/.test(n)));
  assert.ok(built.unresolved.length >= 3);
});

test('findEspnTeam: exact school, sole word-boundary prefix, ambiguity, suggestions', () => {
  const list = ESPN.cfb;
  assert.equal(findEspnTeam(list, 'cfb', 'Auburn').team.id, '2');
  assert.equal(findEspnTeam(list, 'cfb', 'kent').team.id, '2306');                 // "Kent State Golden Flashes" is the only "Kent ..."
  assert.ok(findEspnTeam(list, 'cfb', 'Southern').team);                           // exact location beats the two prefix hits
  const amb = findEspnTeam([...list, { ...list[0], id: '7', location: 'Auburn', displayName: 'Auburn Tigers' }], 'cfb', 'Auburn');
  assert.ok(amb.ambiguous && amb.ambiguous.length === 2);
  const none = findEspnTeam(list, 'cfb', 'Kent Sate');
  assert.ok(none.none && none.suggestions[0].id === '2306');
  assert.equal(findEspnTeam(ESPN.nfl, 'nfl', 'arizona cardinals').team.id, '22');   // full display name works too
});

test('fetchEspnTeams normalizes the payload', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ sports: [{ leagues: [{ teams: [{ team: { id: 22, name: 'Cardinals', location: 'Arizona', displayName: 'Arizona Cardinals', abbreviation: 'ARI', color: 'A40227', logos: [{ href: 'https://x/y.png' }] } }] }] }] }) });
  const [t] = await fetchEspnTeams('nfl', fake);
  assert.deepEqual([t.id, t.color, t.logo, t.abbr], ['22', 'a40227', 'https://x/y.png', 'ARI']);
  await assert.rejects(() => fetchEspnTeams('nfl', async () => ({ ok: false, status: 500 })), /HTTP 500/);
});

test('entryFromEspn tolerates missing color/logo', () => {
  const e = entryFromEspn('wnba', 'a', { id: '1', name: 'Fire', location: 'Portland', abbr: '', color: null, logo: null });
  assert.equal(e.accent, '#444444');
  assert.equal(e.badgeText, 'FIRE');
  assert.equal('badgeUrl' in e, false);
});

test('the rendered module is valid JS that round-trips, with apostrophes in double quotes', async () => {
  const built = await build(goodResult());
  const src = renderSeasonModule({ built, year: 2027, prevYear: 2026, roomLabel: '/draft/result?room=test', generatedOn: '2027-09-05' })
    .replace("import { LEAGUE_SCORING as PREVIOUS_SCORING } from './2026.js';", 'const PREVIOUS_SCORING = { stub: true };');
  assert.match(src, /season:"'27 Season"/);
  assert.match(src, /generated from ESPN/);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exp-')), 'season.mjs');
  fs.writeFileSync(file, src);
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual(Object.keys(mod.TEAM_META).sort(), Object.keys(built.meta).sort());
  assert.equal(mod.TEAM_META.b_cardinals.espnTeamId, '22');
  assert.equal(mod.TEAM_META.a_lions.rundownTeamId, 82);
  assert.equal(mod.TEAM_META.a_lions.sportsdbId, '134939');
  assert.equal(mod.TEAM_META.b_cardinals.sportsdbId, null);
  assert.deepEqual(mod.LEAGUES.find(l => l.key === 'nfl').teams, ['a_lions', 'b_cardinals']);
  assert.deepEqual(mod.PRIOR_SEASON_DISPLAY_LEAGUES, ['mlb', 'wnba']);
  assert.equal(mod.LEAGUE_SCORING.stub, true);
});

test('updateRegistry adds the new season once and keeps the map valid', () => {
  const src = fs.readFileSync(new URL('../js/seasons/index.js', import.meta.url), 'utf8');
  const once = updateRegistry(src, 2027);
  assert.match(once, /import \* as s2027 from '\.\/2027\.js';/);
  assert.match(once, /'2027': \{ id: '2027', label: '2027 Draft', \.\.\.s2027 \}/);
  assert.match(once, /\.\.\.s2026 \},\n  '2027'/);
  assert.equal(updateRegistry(once, 2027), once);                      // idempotent
  const twice = updateRegistry(once, 2028);
  assert.match(twice, /\.\.\.s2027 \},\n  '2028'/);
});
