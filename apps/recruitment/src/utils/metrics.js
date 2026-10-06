/* Small pure helpers for dashboard numbers and charts.
   Everything here works on the real app data — no fake values. */

const DAY = 86400000;

/** Count items whose `dateKey` falls in a rolling window.
   windowsAgo 0 = the last `days`; 1 = the `days` before that. */
export function countInWindow(items, dateKey, windowsAgo = 0, days = 30) {
  const now = Date.now();
  const end = now - windowsAgo * days * DAY;
  const start = end - days * DAY;
  return items.filter((it) => {
    const t = new Date(it[dateKey]).getTime();
    return !Number.isNaN(t) && t > start && t <= end;
  }).length;
}

/** Percentage change from `previous` to `current`, rounded. Returns null when there is no base. */
export function trendPercent(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Group items by a key function and return [{ key, count }] sorted by count, descending. */
export function groupCounts(items, keyFn) {
  const map = new Map();
  items.forEach((it) => {
    const key = keyFn(it) || 'Other';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Notice period text ("Immediate" / "30 days") -> days as a number, for sorting/bucketing. */
export function noticePeriodDays(text) {
  if (!text) return null;
  if (/immediate/i.test(text)) return 0;
  const m = String(text).match(/\d+/);
  return m ? Number(m[0]) : null;
}
