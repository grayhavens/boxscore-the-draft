// Cache freshness, with one floor shared by every cache: pull to refresh
// (js/pull-refresh.js) makes them all stale at once by moving the floor to
// now. A cache counts as fresh only if it was fetched after the floor and
// within its own TTL. The floor is 0 (never) until someone pulls, so this
// is exactly the old TTL check until then. Leaf module (no imports).
let freshAfter = 0;

export function expireCaches(){
  freshAfter = Date.now();
}

export function isFreshAt(fetchedAt, ttlMs){
  return !!fetchedAt && fetchedAt >= freshAfter && Date.now() - fetchedAt < ttlMs;
}
