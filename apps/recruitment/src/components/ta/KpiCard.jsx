import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';

// Microsoft Fluent Emoji — 3D/glossy illustrated set (MIT licensed), served
// from jsDelivr's public CDN. Real glossy illustrations, not flat icons —
// same consistent art style across all four tiles.
const TONE_GLYPH = {
  candidates: { folder: 'Busts in silhouette', file: 'busts_in_silhouette' },
  jobs: { folder: 'Briefcase', file: 'briefcase' },
  interviews: { folder: 'Calendar', file: 'calendar' },
  offers: { folder: 'Handshake', file: 'handshake' },
};
function glyphUrl(tone) {
  const { folder, file } = TONE_GLYPH[tone];
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(folder)}/3D/${file}_3d.png`;
}

/* One dashboard KPI tile. `tone` picks the icon + its colour story (set as
   CSS custom props on `.ta-kpi--<tone>`) — candidates/jobs/interviews/offers.
   The number is the dominant element; `meter`, when given, becomes a slim
   proportion line that animates in on mount (not continuously). When a
   meter has literally nothing behind it yet (0 of 0), it renders as a quiet
   dotted track instead of a 0%-filled bar. */
export default function KpiCard({ tone = 'candidates', label, value, note, meter, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const pct = meter ? Math.max(0, Math.min(100, Math.round((meter.value / (meter.max || 1)) * 100))) : null;
  const isEmpty = meter != null && meter.value === 0 && pct === 0;

  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    if (pct == null) return;
    const id = requestAnimationFrame(() => setBarWidth(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ta-kpi ta-kpi--${tone}${onClick ? ' ta-kpi--link' : ''}`}
      onClick={onClick}
    >
      <div className="ta-kpi__head">
        <span className="ta-kpi__icon"><img src={glyphUrl(tone)} alt="" width={22} height={22} loading="lazy" /></span>
        {onClick && <Icon name="ArrowUpRight" size={16} className="ta-kpi__go" />}
      </div>

      <div className="ta-kpi__label">{label}</div>
      <div className="ta-kpi__value">{value}</div>
      {note && <div className="ta-kpi__note">{note}</div>}

      {pct != null && (
        <div className={`ta-kpi__meter${isEmpty ? ' ta-kpi__meter--empty' : ''}`}>
          <span className="ta-kpi__meter-track">
            {!isEmpty && <span className="ta-kpi__meter-fill" style={{ width: `${barWidth}%` }} />}
          </span>
          {!isEmpty && <span className="ta-kpi__meter-pct">{pct}%</span>}
        </div>
      )}
    </Tag>
  );
}
