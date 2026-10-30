import Icon from '../common/Icon.jsx';

// Fluent UI System Icons (Microsoft, MIT licensed) "Color" variant — real
// professional, multicolor product icons (not emoji/illustrations), served
// from Iconify's public icon CDN. One consistent icon family across all tiles.
const GLYPH_NAMES = {
  people: 'people-team-24',
  briefcase: 'briefcase-24',
  calendar: 'calendar-clock-24',
  certificate: 'certificate-24',
};
function glyphUrl(name) {
  const icon = GLYPH_NAMES[name];
  if (!icon) return '';
  return `https://api.iconify.design/fluent-color/${icon}.svg`;
}

/* One dashboard KPI tile — premium SaaS card, one unified navy design
   language (no per-card accent colors): icon badge + label on top, the
   number as the dominant element, then a short supporting line and (if
   `meter` is given) a slim proportion line. `trend`/`note` use the data
   exactly as passed in — nothing here invents or recalculates a metric. */
export default function KpiCard({ icon, glyph, label, value, trend, note, meter, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const pct = meter ? Math.max(0, Math.min(100, Math.round((meter.value / (meter.max || 1)) * 100))) : null;

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ta-kpi${onClick ? ' ta-kpi--link' : ''}`}
      onClick={onClick}
    >
      <div className="ta-kpi__head">
        <span className={`ta-kpi__icon${glyph ? ' ta-kpi__icon--glyph' : ''}`}>
          {glyph ? <img src={glyphUrl(glyph)} alt="" width={20} height={20} loading="lazy" /> : <Icon name={icon} size={16} />}
        </span>
        <span className="ta-kpi__label">{label}</span>
        {onClick && <Icon name="ArrowUpRight" size={14} className="ta-kpi__go" />}
      </div>

      <div className="ta-kpi__value">{value}</div>

      <div className="ta-kpi__foot">
        {note && <span className="ta-kpi__note">{note}</span>}
        {trend != null && (
          <span className={`ta-trend ${trend > 0 ? 'ta-trend--up' : 'ta-trend--down'}`}>
            <Icon name={trend > 0 ? 'ArrowUp' : 'ArrowDown'} size={11} /> {Math.abs(trend)}%
          </span>
        )}
      </div>

      {pct != null && (
        <div className="ta-kpi__meter">
          <span className="ta-kpi__meter-track"><span className="ta-kpi__meter-fill" style={{ width: `${pct}%` }} /></span>
          <span className="ta-kpi__meter-pct">{pct}%</span>
        </div>
      )}
    </Tag>
  );
}
