import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon.jsx';
import Pager from './Pager.jsx';

const MAX_INLINE_FILTERS = 4;

/* Filter selects in one row, with the active-filter chips below it.
   - `search`: { value, onChange, placeholder }   (optional)
   - `filters`: [{ label, value, onChange, options: [{value,label}] }]
   - `chips`: [{ key, label, onRemove }]  + `onClearAll`
   - `action`: element pinned to the right of the row
   - `pager`: { page, pageSize, total, onPage } — compact controls, far right
   A page with more than MAX_INLINE_FILTERS filters would otherwise wrap onto
   a second row, pushing `action`/`pager` down with it — the extra ones go
   behind a "More filters" button instead, so row one always stays one row. */
export default function Toolbar({ search, filters = [], chips = [], onClearAll, action, pager }) {
  const hasEnd = action || pager;
  const inline = filters.slice(0, MAX_INLINE_FILTERS);
  const overflow = filters.slice(MAX_INLINE_FILTERS);
  const overflowActive = overflow.filter((f) => f.value && f.value !== 'all').length;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDocClick = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  return (
    <>
      <div className="ta-toolbar">
        {search && (
          <div className="ta-search ta-search--wide">
            <Icon name="Search" size={16} />
            <input
              value={search.value}
              placeholder={search.placeholder || 'Search…'}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
        )}
        {inline.map((f) => (
          <select key={f.label} className="ta-select" value={f.value} onChange={(e) => f.onChange(e.target.value)} aria-label={f.label}>
            <option value="all">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {overflow.length > 0 && (
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button type="button" className="ta-select" onClick={() => setMoreOpen((v) => !v)} aria-haspopup="true" aria-expanded={moreOpen}>
              <Icon name="SlidersHorizontal" size={13} /> More filters{overflowActive > 0 ? ` (${overflowActive})` : ''}
            </button>
            {moreOpen && (
              <div className="ta-card" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, padding: 10, display: 'grid', gap: 8, minWidth: 220 }}>
                {overflow.map((f) => (
                  <label key={f.label} style={{ display: 'grid', gap: 4 }}>
                    <span className="ta-cell-sub">{f.label}</span>
                    <select className="ta-select" style={{ width: '100%' }} value={f.value} onChange={(e) => f.onChange(e.target.value)} aria-label={f.label}>
                      <option value="all">{f.label}: All</option>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {hasEnd && (
          <div className="ta-toolbar__end">
            {action}
            {pager && <Pager {...pager} compact />}
          </div>
        )}
      </div>

      {(chips.length > 0 || onClearAll) && (
        <div className="ta-chips">
          {chips.map((c) => (
            <span className="ta-chip" key={c.key}>
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`}><Icon name="X" size={11} /></button>
            </span>
          ))}
          {onClearAll && (
            <button type="button" className="ta-chip__clear" onClick={onClearAll}>
              <Icon name="X" size={12} /> Clear filters
            </button>
          )}
        </div>
      )}
    </>
  );
}
