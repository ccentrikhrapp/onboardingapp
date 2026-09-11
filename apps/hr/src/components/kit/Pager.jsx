import Icon from '../common/Icon.jsx';

/* Numbered pagination with a sliding window of 5 page buttons. */
const WINDOW = 5;

export default function Pager({ page, pageSize, total, onPage, place, compact }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const windowStart = Math.floor((page - 1) / WINDOW) * WINDOW + 1;
  const windowEnd = Math.min(pages, windowStart + WINDOW - 1);
  const nums = [];
  for (let p = windowStart; p <= windowEnd; p += 1) nums.push(p);

  const go = (p) => onPage(Math.min(pages, Math.max(1, p)));

  return (
    <div className={`hr-pager${compact ? ' hr-pager--compact' : ''}${place === 'top' ? ' hr-pager--top' : ''}`}>
      {!compact && <span>Showing {from}–{to} of {total}</span>}
      <div className="hr-pager__nums">
        <button className="hr-pager__btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="ChevronLeft" size={14} />
        </button>
        {windowStart > 1 && (
          <button className="hr-pager__btn" onClick={() => go(windowStart - 1)} aria-label="Previous pages">…</button>
        )}
        {nums.map((n) => (
          <button key={n} className={`hr-pager__btn${n === page ? ' hr-pager__btn--active' : ''}`} onClick={() => go(n)}>
            {n}
          </button>
        ))}
        {windowEnd < pages && (
          <button className="hr-pager__btn" onClick={() => go(windowEnd + 1)} aria-label="More pages">…</button>
        )}
        <button className="hr-pager__btn" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page">
          <Icon name="ChevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}
