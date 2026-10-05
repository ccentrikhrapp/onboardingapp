import Icon from './Icon.jsx';

export function EmptyState({ icon = 'Inbox', title = 'Nothing here yet', message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="strong">{title}</div>
      {message && <div className="text-small">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return <div aria-busy="true" aria-label={label}><SkeletonPage /></div>;
}

export function Spinner({ large }) {
  return <span className={`spinner${large ? ' spinner--lg' : ''}`} />;
}

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

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="stack gap-2" style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 40 }} />
      ))}
    </div>
  );
}
