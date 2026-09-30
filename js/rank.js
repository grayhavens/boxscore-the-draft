// Standard competition rank on `field` with a "T" tie prefix, e.g.
// 1, T2, T2, 4, written to row[rankKey] / row[rankKey + 'Label'].
// Returns the rows sorted best first, ties broken by name. Shared by the
// Points table (js/overall.js) and the Race chart (js/race-math.js), so a
// past day ranks exactly the way today does.
export function assignRank(rows, field, rankKey){
  const sorted = rows.slice().sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name));
  let prev = null, prevRank = 0;
  sorted.forEach((r, i) => {
    r[rankKey] = (prev !== null && r[field] === prev) ? prevRank : i + 1;
    prev = r[field];
    prevRank = r[rankKey];
  });
  const counts = {};
  sorted.forEach(r => { counts[r[rankKey]] = (counts[r[rankKey]] || 0) + 1; });
  sorted.forEach(r => { r[rankKey + 'Label'] = (counts[r[rankKey]] > 1 ? 'T' : '') + r[rankKey]; });
  return sorted;
}
