/* One dashboard KPI tile — premium glassmorphism gradient card with
   hover-lift, a colored glow, and a persisted "selected" state on click
   (shared across the row via `selected`/`onClick` from the parent). */
export default function KpiCard({ tone = 'candidates', label, value, note, onClick, selected }) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ta-kpi ta-kpi--${tone}${onClick ? ' ta-kpi--link' : ''}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <div className="ta-kpi__sheen" aria-hidden="true" />
      {tone === 'interviews' && (
        <>
          <span className="ta-kpi__hex ta-kpi__hex--a" aria-hidden="true" />
          <span className="ta-kpi__hex ta-kpi__hex--b" aria-hidden="true" />
        </>
      )}
      <div className="ta-kpi__content">
        <div className="ta-kpi__label">{label}</div>
        <div className="ta-kpi__value">{value}</div>
        {/* No up/down arrow here — these notes are plain counts (e.g. "8 still
            active"), not a measured trend, and prefixing an arrow would imply
            a direction we haven't actually computed. */}
        {note && <div className="ta-kpi__note">{note}</div>}
      </div>
    </Tag>
  );
}
