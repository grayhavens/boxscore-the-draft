/* ============================================================
   ESPN scoreboards a day at a time, for the scoring that reads whole
   postseasons (js/playoff-series.js, js/cfb-bowls.js). ESPN's date ranges
   answer 400, so a postseason is one request per day. A day more than two
   days old is final, so its parsed games are saved on the device for good
   and a later visit only asks about recent days. null from a day means ESPN
   failed (the caller reports a partial answer, never a settled one).
   ============================================================ */
import { fetchEspnScoreboardDay } from './espn.js';

const CONCURRENCY = 6;

export const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

// `store` names the saved copy (a prefix per consumer), `key` the league,
// `sportPath` and `extra` the ESPN request, `parse` turns one raw event into
// a game or null.
async function loadDay({ store, key, sportPath, extra, parse }, day){
  const settled = day < ymd(new Date(Date.now() - 2 * 864e5));
  const slot = `${store}:${key}:${day}`;
  if(settled){
    try { const saved = JSON.parse(localStorage.getItem(slot)); if(saved) return saved; } catch (e){}
  }
  const data = await fetchEspnScoreboardDay(sportPath, day, extra);
  if(!data) return null;
  const games = (data.events || []).map(parse).filter(Boolean);
  if(settled){ try { localStorage.setItem(slot, JSON.stringify(games)); } catch (e){} }
  return games;
}

export async function loadDays(cfg, days){
  const games = [];
  let failed = false, next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, days.length) }, async () => {
    while(next < days.length){
      const got = await loadDay(cfg, days[next++]);
      if(got) games.push(...got); else failed = true;
    }
  }));
  return { games, failed };
}
