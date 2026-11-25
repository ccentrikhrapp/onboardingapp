/* Plain CSS bar chart — no library. `points` = [{ label, value }], `peakLabel`
   highlights one bar (e.g. the day with the most applications). */
export default function BarChart({ points, peakIndex, height = 160 }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="ta-barchart" style={{ height }}>
      {points.map((p, i) => (
        <div key={p.label} className="ta-barchart__col" title={`${p.label}: ${p.value}`}>
          <span className="ta-barchart__value">{p.value}</span>
          <span className="ta-barchart__bar-wrap">
            <span
              className={`ta-barchart__bar${i === peakIndex ? ' is-peak' : ''}`}
              style={{ height: `${Math.round((p.value / max) * 100)}%` }}
            />
          </span>
          <span className="ta-barchart__label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}
