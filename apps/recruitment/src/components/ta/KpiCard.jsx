import Icon from '../common/Icon.jsx';

/* One dashboard KPI: label + top-right icon, big number, a thick proportion bar
   (`meter` { value, max }) with a % badge, then a footer line — either the
   ↑/↓ `trend` vs last month, or a plain `note`. `accent` is a tag tone. */
export default function KpiCard({ icon, label, value, trend, note, meter, accent = 'blue', onClick }) {
  const fg = `var(--tag-${accent}-fg)`;
  const wash = `var(--tag-${accent}-bg)`;

  const Tag = onClick ? 'button' : 'div';
  const pct = meter ? Math.max(0, Math.min(100, Math.round((meter.value / (meter.max || 1)) * 100))) : 0;

  let footer = note ? <span className="ta-trend ta-trend--flat">{note}</span> : null;
  if (trend) {
    const cls = trend > 0 ? 'ta-trend--up' : 'ta-trend--down';
    const arrow = trend > 0 ? 'ArrowUp' : 'ArrowDown';
    footer = (
      <span className="ta-kpi__footstack">
        <span className={`ta-trend ${cls}`}>
          <Icon name={arrow} size={12} /> {Math.abs(trend)}% <span className="ta-trend__mute">vs last month</span>
        </span>
        {note && <span className="ta-kpi__subnote">{note}</span>}
      </span>
    );
  }

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ta-kpi${onClick ? ' ta-kpi--link' : ''}`}
      style={{ '--k-fg': fg, '--k-wash': wash }}
      onClick={onClick}
    >
      <div className="ta-kpi__head">
        <span className="ta-kpi__label">{label}</span>
        <span className="ta-kpi__icon"><Icon name={icon} size={16} /></span>
      </div>

      <div className="ta-kpi__value">{value}</div>

      {meter && (
        <div className="ta-kpi__bar">
          <span className="ta-kpi__bar-track"><span className="ta-kpi__bar-fill" style={{ width: `${pct}%` }} /></span>
          <span className="ta-kpi__bar-pct">{pct}%</span>
        </div>
      )}

      {footer && <div className="ta-kpi__foot">{footer}</div>}
    </Tag>
  );
}
