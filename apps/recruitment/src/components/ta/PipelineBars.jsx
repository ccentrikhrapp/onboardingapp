import { useState } from 'react';
import Icon from '../common/Icon.jsx';

/* Pipeline stages as a clean horizontal bar list — replaces the funnel
   trapezoid. One row per stage: icon, label, an animated proportional bar,
   then the raw count and its % of the first stage. Clicking a row filters
   the candidates table to that stage, same as the old funnel did.
   `stages` = [{ label, value, tone, icon, key }] in pipeline order. */
export default function PipelineBars({ stages, onSegmentClick }) {
  const [hover, setHover] = useState(null);
  const clickable = typeof onSegmentClick === 'function';
  const first = stages[0]?.value || 1;
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <div className="ta-pbars" onMouseLeave={() => setHover(null)}>
      {stages.map((s, i) => {
        const pct = Math.round((s.value / first) * 100);
        const widthPct = Math.max(3, Math.round((s.value / max) * 100));
        const active = hover === i;
        return (
          <button
            key={s.label}
            type="button"
            className={`ta-pbars__row${active ? ' is-active' : ''}`}
            style={{ '--p-bg': `var(--tag-${s.tone}-bg)`, '--p-fg': `var(--tag-${s.tone}-fg)` }}
            onMouseEnter={() => setHover(i)}
            onClick={clickable ? () => onSegmentClick(i) : undefined}
          >
            <span className="ta-pbars__icon"><Icon name={s.icon} size={14} /></span>
            <span className="ta-pbars__label">{s.label}</span>
            <span className="ta-pbars__track">
              <span className="ta-pbars__fill" style={{ width: `${widthPct}%` }} />
            </span>
            <span className="ta-pbars__count">{s.value}</span>
            <span className="ta-pbars__pct">{pct}%</span>
          </button>
        );
      })}
    </div>
  );
}
