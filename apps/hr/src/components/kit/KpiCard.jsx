import Icon from '../common/Icon.jsx';

/* Dashboard stat tile: icon, label, big number, optional proportion meter
   and a trailing note. Clickable when onClick is given. */
export default function KpiCard({ icon, label, value, accent = 'blue', meter, note, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const pct = meter ? Math.min(100, Math.round((meter.value / Math.max(1, meter.max)) * 100)) : null;
  return (
    <Tag
      className={`hr-kpi${onClick ? ' hr-kpi--link' : ''}`}
      style={{ '--k-fg': `var(--tag-${accent}-fg)` }}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="hr-kpi__head">
        <span className="hr-kpi__label">{label}</span>
        {icon && <span className="hr-kpi__icon"><Icon name={icon} size={16} /></span>}
      </div>
      <div className="hr-kpi__value">{value}</div>
      {meter && (
        <div className="hr-kpi__bar">
          <span className="hr-kpi__bar-track"><span className="hr-kpi__bar-fill" style={{ width: `${pct}%` }} /></span>
          <span className="hr-kpi__bar-pct">{pct}%</span>
        </div>
      )}
      {note && <div className="hr-kpi__hint">{note}</div>}
    </Tag>
  );
}
