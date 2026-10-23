import { useState } from 'react';

/* Donut chart for a small set of categories (<= 6).
   Hover a slice (or its legend row): the slice pops out, the rest dim, and
   the centre shows that slice's numbers. `slices` = [{ label, value, color }].
   Pass `onSliceClick(label)` to make slices clickable (e.g. to drill into a filtered list). */
export default function DonutChart({ slices, caption = 'Total', onSliceClick }) {
  const [hover, setHover] = useState(null);
  const clickable = typeof onSliceClick === 'function';
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const size = 170;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 3;

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / total) * circumference;
      const midDeg = (offset / circumference) * 360 - 90 + (len / 2 / circumference) * 360;
      const rad = (midDeg * Math.PI) / 180;
      const arc = {
        ...s,
        dash: `${Math.max(0, len - gap)} ${circumference}`,
        rot: (offset / circumference) * 360 - 90,
        dx: Math.cos(rad) * 7,
        dy: Math.sin(rad) * 7,
      };
      offset += len;
      return arc;
    });

  const shown = hover ? slices.find((s) => s.label === hover) : null;

  return (
    <div className="hr-donut-wrap" onMouseLeave={() => setHover(null)}>
      <div className="hr-donut">
        <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hr-line)" strokeWidth={stroke} />
          {arcs.map((a) => {
            const active = hover === a.label;
            const dim = hover && !active;
            return (
              <circle
                key={a.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={active ? stroke + 3 : stroke}
                strokeDasharray={a.dash}
                transform={`translate(${active ? a.dx : 0} ${active ? a.dy : 0}) rotate(${a.rot} ${size / 2} ${size / 2})`}
                style={{ opacity: dim ? 0.35 : 1, cursor: clickable ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(a.label)}
                onClick={clickable ? () => onSliceClick(a.label) : undefined}
              />
            );
          })}
        </svg>
        <div className="hr-donut__center">
          <span className="hr-donut__total">{shown ? shown.value : total}</span>
          <span className="hr-donut__caption">{shown ? shown.label : caption}</span>
        </div>
      </div>

      <div className="hr-legend">
        {slices.map((s) => (
          <div
            className={`hr-legend__row${hover === s.label ? ' is-hover' : ''}${hover && hover !== s.label ? ' is-dim' : ''}`}
            key={s.label}
            onMouseEnter={() => setHover(s.label)}
            onClick={clickable && s.value > 0 ? () => onSliceClick(s.label) : undefined}
            style={clickable && s.value > 0 ? { cursor: 'pointer' } : undefined}
          >
            <span className="hr-legend__dot" style={{ background: s.color }} />
            <span className="hr-legend__name">{s.label}</span>
            <span className="hr-legend__val">{s.value}</span>
            <span className="hr-legend__pct">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
