import { useMemo, useState } from 'react';

/**
 * Client-side search + filter + sort + pagination for a list of records.
 * `searchFields` is [field | fn(record)]. `filters` is an object of
 * { key: predicate | value }. Pass filter fns via setFilter.
 */
export function useCollectionView(data, { searchFields = [], pageSize = 8, initialSort, initialFilters } = {}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters || {});
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const onSort = (key) => {
    setSort((s) => {
      if (s?.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: 'asc' };
    });
  };

  const searchKey = searchFields.map((f) => (typeof f === 'function' ? f.name || 'fn' : f)).join('|');

  const filtered = useMemo(() => {
    let out = [...(data || [])];
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        searchFields.some((f) => String(typeof f === 'function' ? f(r) : r[f] || '').toLowerCase().includes(q))
      );
    }
    Object.entries(filters).forEach(([key, val]) => {
      if (val == null || val === '' || val === 'all') return;
      if (typeof val === 'function') out = out.filter(val);
      else out = out.filter((r) => String(r[key]) === String(val));
    });
    if (sort) {
      out.sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, filters, sort, searchKey]);

  const total = filtered.length;
  const safePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    query,
    setQuery: (v) => { setQuery(v); setPage(1); },
    filters,
    setFilter,
    sort,
    onSort,
    page: safePage,
    setPage,
    pageSize,
    total,
    rows: pageRows,
    allFiltered: filtered,
  };
}
