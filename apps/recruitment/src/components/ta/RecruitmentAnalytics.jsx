import Icon from '../common/Icon.jsx';

/* Smooth line through points using midpoint cubic-bezier control points —
   simple, no external chart lib needed. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/* Header stat card: a radial "Total Applications" gauge + a 7-day
   applications trend line, plus three supporting metric chips underneath. */
export default function RecruitmentAnalytics({ totalApps, weekChangePct, gaugePct, trend, stats }) {
  // ----- semi-circular gauge -----
  // gaugePct is this week's share of the last two weeks' applications — a
  // real, naturally 0-100 ratio (unlike weekChangePct, which is unbounded
  // and can't drive an arc fill without an invented "completion" number).
  // pathLength="100" lets strokeDasharray be read directly as a percentage.
  const gaugeFillPct = Math.max(4, Math.min(100, gaugePct));
  const gaugeArc = 'M 14 96 A 86 86 0 0 1 186 96';

  // ----- line chart -----
  const chartW = 420;
  const chartH = 110;
  const padL = 22;
  const padR = 10;
  const padT = 8;
  const padB = 18;
  const counts = trend.map((t) => t.count);
  const maxVal = Math.max(2, ...counts);
  const ticks = maxVal <= 3 ? Array.from({ length: maxVal + 1 }, (_, i) => i) : [0, Math.round(maxVal / 2), maxVal];
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const points = trend.map((t, i) => ({
    x: padL + (trend.length > 1 ? (i / (trend.length - 1)) * plotW : plotW / 2),
    y: padT + plotH - (t.count / maxVal) * plotH,
    ...t,
  }));
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`;
  const peakIdx = counts.indexOf(Math.max(...counts));
  const peak = points[peakIdx];

  return (
    <section className="ta-analytics-card">
      <div className="ta-analytics-card__head">
        <div className="ta-analytics-card__heading">
          <span className="ta-analytics-card__icon"><Icon name="Activity" size={15} /></span>
          <div>
            <h3>Recruitment Analytics</h3>
            <p>A real-time view of your hiring pipeline</p>
          </div>
        </div>
        <div className="ta-analytics-card__period">
          <Icon name="Calendar" size={12} /> This Week <Icon name="ChevronDown" size={12} />
        </div>
      </div>

      <div className="ta-analytics-card__body">
        <div className="ta-analytics-gauge">
          <svg className="ta-analytics-gauge__arc" viewBox="0 0 200 110" aria-hidden="true">
            <path d={gaugeArc} fill="none" stroke="#E9EDF2" strokeWidth="13" strokeLinecap="round" pathLength="100" />
            <path
              d={gaugeArc}
              fill="none"
              stroke="#16A36A"
              strokeWidth="13"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${gaugeFillPct} 100`}
              style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
            />
          </svg>
          <div className="ta-analytics-gauge__center">
            <Icon name="Users" size={15} />
            <span className="ta-analytics-gauge__value">{totalApps}</span>
            <span className="ta-analytics-gauge__label">Total Applications</span>
          </div>
          <span className={`ta-analytics-pill ta-analytics-pill--${weekChangePct >= 0 ? 'up' : 'down'}`}>
            <Icon name={weekChangePct >= 0 ? 'ArrowUp' : 'ArrowDown'} size={10} />
            {weekChangePct >= 0 ? '+' : ''}{weekChangePct}% vs last week
          </span>
        </div>

        <div className="ta-analytics-line">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} aria-hidden="true">
            <defs>
              <linearGradient id="analyticsAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#16A36A" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#16A36A" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => {
              const y = padT + plotH - (t / maxVal) * plotH;
              return (
                <g key={t}>
                  <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="var(--ta-line)" strokeWidth="1" strokeDasharray="3 4" />
                  <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9" fill="var(--ta-ink-soft)">{t}</text>
                </g>
              );
            })}
            <path d={areaPath} fill="url(#analyticsAreaGrad)" />
            <path d={linePath} fill="none" stroke="#16A36A" strokeWidth="2.5" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle
                key={p.label}
                cx={p.x}
                cy={p.y}
                r={i === peakIdx ? 5 : 3.5}
                fill={i === peakIdx ? '#fff' : '#16A36A'}
                stroke="#16A36A"
                strokeWidth={i === peakIdx ? 2.5 : 0}
              />
            ))}
            {points.map((p) => (
              <text key={`${p.label}-axis`} x={p.x} y={chartH - 4} textAnchor="middle" fontSize="9" fill="var(--ta-ink-soft)">{p.label}</text>
            ))}
          </svg>
          {peak.count > 0 && (
            <div className="ta-analytics-tooltip" style={{ left: `${(peak.x / chartW) * 100}%`, top: `${(peak.y / chartH) * 100}%` }}>
              {peak.count} Application{peak.count === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>

      <div className="ta-analytics-stats">
        {stats.map((s) => (
          <div className="ta-analytics-stat" key={s.key}>
            <span className={`ta-analytics-stat__icon ta-analytics-stat__icon--${s.tone}`}><Icon name={s.icon} size={13} /></span>
            <div className="ta-analytics-stat__body">
              <span className="ta-analytics-stat__label">{s.label}</span>
              <div className="ta-analytics-stat__row">
                <span className="ta-analytics-stat__value">{s.value}</span>
                {s.changePct != null && (
                  <span className={`ta-analytics-stat__pct ta-analytics-stat__pct--${s.pillTone}`}>
                    <Icon name={s.changePct >= 0 ? 'ArrowUp' : 'ArrowDown'} size={9} />
                    {s.changePct >= 0 ? '+' : ''}{s.changePct}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
