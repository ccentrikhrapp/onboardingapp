import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';

// One Lucide icon per tone — same icon family throughout, no external images.
const TONE_ICON = {
  candidates: 'UsersRound',
  jobs: 'Briefcase',
  interviews: 'CalendarCheck',
  offers: 'BadgeCheck',
};

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
        <span className="ta-kpi__icon"><Icon name={TONE_ICON[tone]} size={20} strokeWidth={2} /></span>
        {onClick && <Icon name="ArrowUpRight" size={18} className="ta-kpi__go" />}
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
