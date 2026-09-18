/* ============================================================
   KLIPY GIF API client (https://docs.klipy.com) — search/trending for
   the chat's GIF picker (js/gif-picker.js).

   Unlike every other upstream in this app, this one is deliberately
   NOT proxied through the worker, and the app key below deliberately
   ships in client JS. Both are KLIPY's own integration requirements,
   not a shortcut: API requests and media loads "must originate from
   the user's ... web browser", and routing them through a
   partner-operated server or CDN, or caching/mirroring results or
   media, needs KLIPY's prior written approval. So this doesn't
   follow the worker's usual cachedUpstreamFetch convention (see the
   comment block in worker/rundown-proxy.js), and the key isn't a
   private credential the way the TheRundown/TheSportsDB keys are —
   it's an identifier KLIPY expects to be public. Don't "fix" either
   by moving this behind the worker without asking KLIPY first
   (developers@klipy.com).

   Other KLIPY requirements this file and the picker follow: media
   URLs are used exactly as returned (never rewritten or
   reconstructed), results are shown in the order returned, and the
   search box's placeholder is "Search KLIPY".

   KLIPY_APP_KEY empty = GIFs off (the chat hides its GIF button), so
   this ships dark until a key is set. A key in Testing mode is limited
   to 100 requests per hour across everyone using it; request
   Production access in KLIPY's Partner Panel (free) before relying on
   it with the whole group.
   ============================================================ */
import { currentProfileId } from './identity.js';

export const KLIPY_APP_KEY = '';

const KLIPY_BASE = 'https://api.klipy.com/api/v1';
const PER_PAGE = 24;
const CONTENT_FILTER = 'medium';   // off | low | medium | high
// Which of KLIPY's four sizes (xs 90px / sm 220px / md 498px / hd 498px)
// the picker grid AND the message bubble both use. `sm` is ~120KB as
// animated WebP; `md` is ~640KB — a chat scrolling past a dozen GIFs on a
// phone connection is why this isn't `md`.
const DISPLAY_SIZE = 'sm';
const FORMAT_PREFERENCE = ['webp', 'gif', 'jpg'];
const TRENDING_TTL_MS = 5 * 60 * 1000;

export function gifsEnabled(){
  return !!KLIPY_APP_KEY;
}

// { slug, title, url, w, h } — the one shape the picker renders and the
// chat sends. KLIPY's items also carry `type` ('gif', or 'ad' if ads
// were ever turned on for this key in the Partner Panel — they aren't,
// and there's no ad UI here, so anything that isn't a GIF is dropped).
function normalizeItem(item){
  if(!item || (item.type && item.type !== 'gif')) return null;
  const size = item.file && item.file[DISPLAY_SIZE];
  if(!size) return null;
  const format = FORMAT_PREFERENCE.find(f => size[f] && size[f].url);
  if(!format || !item.slug) return null;
  const { url, width, height } = size[format];
  if(!(width > 0) || !(height > 0)) return null;
  return { slug: item.slug, title: item.title || 'GIF', url, w: width, h: height };
}

let trendingFirstPage = null;   // { at, result } — in-memory only, see TRENDING_TTL_MS

// -> { items, hasNext }. Empty query = trending. Throws on any failure
// (network, non-2xx like the Testing-mode rate limit, or result:false).
export async function fetchGifs(query, page){
  const q = (query || '').trim();
  if(!q && page === 1 && trendingFirstPage && Date.now() - trendingFirstPage.at < TRENDING_TTL_MS){
    return trendingFirstPage.result;
  }

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    customer_id: currentProfileId,
    content_filter: CONTENT_FILTER,
    format_filter: FORMAT_PREFERENCE.filter(f => f !== 'jpg').join(',')
  });
  if(q) params.set('q', q);

  const res = await fetch(`${KLIPY_BASE}/${KLIPY_APP_KEY}/gifs/${q ? 'search' : 'trending'}?${params}`);
  if(!res.ok) throw new Error(`KLIPY ${res.status}`);
  const json = await res.json();
  if(!json.result || !json.data || !Array.isArray(json.data.data)) throw new Error('KLIPY bad response');

  const result = {
    items: json.data.data.map(normalizeItem).filter(Boolean),
    hasNext: !!json.data.has_next
  };
  if(!q && page === 1) trendingFirstPage = { at: Date.now(), result };
  return result;
}

// Fire-and-forget "this GIF was shared" ping — KLIPY uses it to improve
// ranking. `query` is the search that led to the pick ('' for trending).
// Failures are irrelevant to the user, so they're swallowed.
export function reportGifShare(slug, query){
  if(!gifsEnabled()) return;
  fetch(`${KLIPY_BASE}/${KLIPY_APP_KEY}/gifs/share/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: currentProfileId, q: query || '' }),
    keepalive: true
  }).catch(() => {});
}
