/* Loading placeholders. Same shapes as the recruitment app's States.jsx. */
export function SkeletonLine({ width = '100%' }) {
  return <span className="skeleton skeleton-bar" style={{ width }} aria-hidden="true" />;
}

export function SkeletonBlock({ lines = 3 }) {
  return (
    <div className="skeleton-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className="skeleton skeleton-bar" style={{ width: `${88 - i * 14}%`, marginTop: i ? 10 : 0 }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="skeleton-page" aria-busy="true" aria-label="Loading">
      <span className="skeleton skeleton-title" aria-hidden="true" />
      <SkeletonBlock lines={2} />
      <div className="skeleton-grid">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton-block" aria-hidden="true" />)}
      </div>
      <SkeletonBlock lines={4} />
    </div>
  );
}
