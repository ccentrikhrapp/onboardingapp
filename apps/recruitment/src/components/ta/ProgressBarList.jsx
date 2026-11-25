/* Horizontal "label — % — bar" rows, e.g. Candidates by Sources. */
export default function ProgressBarList({ rows }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div className="ta-barlist">
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <div className="ta-barlist__row" key={r.label}>
            <div className="ta-barlist__head">
              <span>{r.label}</span>
              <span className="ta-barlist__pct">{pct}%</span>
            </div>
            <span className="ta-barlist__track">
              <span className="ta-barlist__fill" style={{ width: `${pct}%`, background: r.color }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
