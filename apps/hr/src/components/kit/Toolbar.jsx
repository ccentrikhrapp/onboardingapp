import Icon from '../common/Icon.jsx';
import Pager from './Pager.jsx';

/* Filter selects + search in one row, with active-filter chips below. */
export default function Toolbar({ search, filters = [], chips = [], onClearAll, action, pager }) {
  const hasEnd = action || pager;
  return (
    <>
      <div className="hr-toolbar">
        {search && (
          <div className="hr-search hr-search--wide">
            <Icon name="Search" size={16} />
            <input
              value={search.value}
              placeholder={search.placeholder || 'Search…'}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
        )}
        {filters.map((f) => (
          <select key={f.label} className="hr-select" value={f.value} onChange={(e) => f.onChange(e.target.value)} aria-label={f.label}>
            <option value="all">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {hasEnd && (
          <div className="hr-toolbar__end">
            {action}
            {pager && <Pager {...pager} compact />}
          </div>
        )}
      </div>

      {(chips.length > 0 || onClearAll) && (
        <div className="hr-chips">
          {chips.map((c) => (
            <span className="hr-chip" key={c.key}>
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`}><Icon name="X" size={11} /></button>
            </span>
          ))}
          {onClearAll && (
            <button type="button" className="hr-chip__clear" onClick={onClearAll}>
              <Icon name="X" size={12} /> Clear filters
            </button>
          )}
        </div>
      )}
    </>
  );
}
