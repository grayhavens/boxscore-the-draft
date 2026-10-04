/* ============================================================
   NEWS MATH: the pure half of the Perigon "More news" feature, shared by
   worker/news.js and the Node tests (no DOM, no Worker APIs).

   Why it looks like this. Perigon's free tier is ~150 calls a month, so the
   worker can't search per team (about 210 of them) or per page view. It
   searches in batches instead: one query per chunk of team names,
   `("Philadelphia Eagles" OR "Kansas City Chiefs" OR ...)`, a few chunks a
   day. Each returned article is then matched back to teams here, by name,
   because Perigon doesn't tag sports teams as entities.

   Names. TEAM_META says "Eagles" with boardSub "Philadelphia" (pro) or
   "Houston" with sub "Cougars" (college), so the full name is built from
   both. Full names are what the query quotes, since bare "Giants" or
   "Cardinals" would pull in every sport. Headlines mostly say the nickname
   ("Chiefs top Raiders"), so a nickname that belongs to exactly one team in
   the catalog also counts when it's in the title or description. Shared
   ones (Giants, Kings, Panthers, Jets, Rangers...) need the full name.
   ============================================================ */

// Names the board spells shorter, or differently, than the press does.
const FULL_NAME_OVERRIDES = {
  'nfl:Bucs': 'Tampa Bay Buccaneers',
  'nba:Blazers': 'Portland Trail Blazers',
  'mlb:Athletics': 'Athletics',
  'epl:Newcastle': 'Newcastle United',
  'epl:Nottingham': 'Nottingham Forest',
  'mcbb:Mich State': 'Michigan State Spartans',
  'mcbb:St Johns': 'St. John’s Red Storm',
  'mcbb:SLU': 'Saint Louis Billikens',
  'mcbb:NDSU': 'North Dakota State Bison',
  'cfb:NDSU': 'North Dakota State Bison'
};

// The two college leagues share team names ("Houston Cougars" is both
// football and basketball), so they share one search bucket.
const BUCKET_OF_LEAGUE = { cfb: 'college', mcbb: 'college' };

export function newsBucket(leagueKey){
  return BUCKET_OF_LEAGUE[leagueKey] || leagueKey;
}

export function teamFullName(meta){
  const override = FULL_NAME_OVERRIDES[`${meta.leagueKey}:${meta.name}`];
  if(override) return override;
  if(meta.leagueKey === 'epl') return meta.name;
  if(meta.leagueKey === 'cfb' || meta.leagueKey === 'mcbb') return `${meta.name} ${meta.sub || meta.boardSub}`.trim();
  return `${meta.boardSub} ${meta.name}`.trim();
}

// [{ key, leagueKey, bucket, full, nick }] for every team of a class.
// Favorite-only teams (nobody's pick) are in the catalog too, so they
// get news the same way.
export function newsTeams(teamMeta){
  const teams = Object.entries(teamMeta).map(([key, meta]) => ({
    key,
    leagueKey: meta.leagueKey,
    bucket: newsBucket(meta.leagueKey),
    full: teamFullName(meta),
    nick: meta.name
  }));
  // A nickname counts on its own only when no other team shares it.
  const uses = {};
  for(const t of teams) uses[t.nick.toLowerCase()] = (uses[t.nick.toLowerCase()] || 0) + 1;
  // College nicknames are places ("Texas", "Miami"), never safe alone.
  return teams.map(t => ({ ...t, nickAlone: uses[t.nick.toLowerCase()] === 1 && t.bucket !== 'college' }));
}

// The search chunks, in a fixed order the worker walks round-robin: one
// bucket's chunks sit together. A bucket's names are de-duplicated (the
// two college leagues repeat theirs) and split so each query stays under
// maxChars. Perigon documents no limit on q, so the cap is a cautious
// guess; raise it once it's measured and the chunk count shrinks.
export function newsChunks(teams, maxChars = 400){
  const byBucket = {};
  for(const t of teams){
    const names = byBucket[t.bucket] || (byBucket[t.bucket] = []);
    if(!names.includes(t.full)) names.push(t.full);
  }
  const chunks = [];
  for(const [bucket, names] of Object.entries(byBucket)){
    let current = [];
    let length = 0;
    for(const name of names){
      const cost = name.length + 6; // quotes + " OR "
      if(current.length && length + cost > maxChars){
        chunks.push({ bucket, q: queryFor(current) });
        current = [];
        length = 0;
      }
      current.push(name);
      length += cost;
    }
    if(current.length) chunks.push({ bucket, q: queryFor(current) });
  }
  return chunks;
}

function queryFor(names){
  return `(${names.map(n => `"${n}"`).join(' OR ')})`;
}

function escapeRegex(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text, phrase){
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase.toLowerCase())}($|[^a-z0-9])`).test(text);
}

// Keys of the teams an article is about. Perigon finds every article whose
// body mentions a team, so a story can name Manchester City once in
// passing, which is not news about them. A team counts only when it's the
// subject: its full name in the headline or description (the lead), or a
// unique nickname there. The longer summary alone isn't enough, unless it
// names the team at least twice.
export function matchTeams(article, teams){
  const head = `${article.title || ''} ${article.description || ''}`.toLowerCase().replace(/[’']/g, '’');
  const summary = (article.summary || '').toLowerCase().replace(/[’']/g, '’');
  const keys = [];
  for(const t of teams){
    const full = t.full.replace(/'/g, '’');
    if(mentions(head, full) || (t.nickAlone && mentions(head, t.nick)) || mentionCount(summary, full) >= SUMMARY_MENTIONS) keys.push(t.key);
  }
  return keys;
}

// Times in a row a team must be named in the summary alone to count.
const SUMMARY_MENTIONS = 2;

function mentionCount(text, phrase){
  const found = text.match(new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase.toLowerCase())}(?![a-z0-9])`, 'g'));
  return found ? found.length : 0;
}

// One Perigon article, cut down to what the app shows. Null when it has
// no usable link or headline.
export function parseArticle(raw){
  if(!raw || !raw.url || !raw.title) return null;
  return {
    id: String(raw.articleId || raw.url),
    title: String(raw.title).trim(),
    url: String(raw.url),
    source: raw.source && raw.source.domain ? String(raw.source.domain).replace(/^www\./, '') : '',
    at: raw.pubDate || raw.addDate || null,
    description: raw.description ? String(raw.description).trim().slice(0, 300) : '',
    summary: raw.summary ? String(raw.summary).slice(0, 600) : ''
  };
}

// Folds fresh articles into one team's stored list: newest first, no
// repeats, nothing older than maxAgeDays, at most limit kept. Stored items
// drop description/summary (matching is done by then) to keep KV small.
export function mergeTeamNews(existing, fresh, now, { limit = 8, maxAgeDays = 14 } = {}){
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const out = [];
  const all = [...fresh, ...existing].map(a => ({ id: a.id, title: a.title, url: a.url, source: a.source, at: a.at }));
  all.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  for(const a of all){
    if(seen.has(a.id)) continue;
    const t = Date.parse(a.at);
    if(t && t < cutoff) continue;
    seen.add(a.id);
    out.push(a);
    if(out.length >= limit) break;
  }
  return out;
}
