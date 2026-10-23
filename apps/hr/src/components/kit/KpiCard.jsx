import Icon from '../common/Icon.jsx';

/* One dashboard KPI: label + top-right icon, big number, a thick proportion bar
   (`meter` { value, max }) with a % badge, then a footer note. `accent` is a tag tone. */
export default function KpiCard({ icon, label, value, note, meter, accent = 'blue', onClick }) {
  const fg = `var(--tag-${accent}-fg)`;
  const wash = `var(--tag-${accent}-bg)`;
  const Tag = onClick ? 'button' : 'div';
  const pct = meter ? Math.max(0, Math.min(100, Math.round((meter.value / (meter.max || 1)) * 100))) : 0;

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`hr-kpi${onClick ? ' hr-kpi--link' : ''}`}
      style={{ '--k-fg': fg, '--k-wash': wash }}
      onClick={onClick}
    >
      <div className="hr-kpi__head">
        <span className="hr-kpi__label">{label}</span>
        <span className="hr-kpi__icon"><Icon name={icon} size={16} /></span>
      </div>

      <div className="hr-kpi__value">{value}</div>

      {meter && (
        <div className="hr-kpi__bar">
          <span className="hr-kpi__bar-track"><span className="hr-kpi__bar-fill" style={{ width: `${pct}%` }} /></span>
          <span className="hr-kpi__bar-pct">{pct}%</span>
        </div>
      )}

      {note && <div className="hr-kpi__foot"><span className="hr-kpi__subnote">{note}</span></div>}
    </Tag>
  );
}
