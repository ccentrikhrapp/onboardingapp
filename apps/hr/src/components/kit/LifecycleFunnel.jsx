import Icon from '../common/Icon.jsx';

/* Onboarding lifecycle funnel — horizontal gradient bars, one per phase, each
   in its own colour along a blue -> green progression. Bar length is the
   phase's share of all cases. The flagged phase turns amber.
   `stages` = [{ label, count, pct, attention, onClick }]. */
const BARS = [
  ['#6ea8ff', '#3b6ef5'],
  ['#8e86f5', '#5b52d6'],
  ['#a97cf0', '#7c4fd6'],
  ['#4fc9b5', '#0e9d88'],
  ['#5fd08a', '#1f9d55'],
];

export default function LifecycleFunnel({ stages }) {
  return (
    <div className="hr-lcf">
      {stages.map((s, i) => {
        const [a, b] = BARS[i] || BARS[BARS.length - 1];
        return (
          <button
            key={s.label}
            type="button"
            className={`hr-lcf__row${s.attention ? ' is-attn' : ''}`}
            onClick={s.onClick}
            title={`View ${s.label} — ${s.count}`}
          >
            <span className="hr-lcf__head">
              <span className="hr-lcf__label">
                {s.attention && <Icon name="AlertTriangle" size={11} />}
                {s.label}
              </span>
              <span className="hr-lcf__count">{s.count}</span>
            </span>
            <span className="hr-lcf__track">
              <span
                className="hr-lcf__bar"
                style={{ width: `${Math.max(s.pct, 7)}%`, background: s.attention ? undefined : `linear-gradient(90deg, ${a}, ${b})` }}
              >
                <span className="hr-lcf__pct">{s.pct}%</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
