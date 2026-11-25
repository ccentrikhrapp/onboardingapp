import Scene3D from '../common/Scene3D.jsx';

/* Friendly empty state — never a bare "No data". The 3D piece replaces the
   flat icon here specifically because an empty state has nothing else on
   screen to compete with it. */
export default function EmptyState({ title, message, action }) {
  return (
    <div className="ta-empty">
      <Scene3D size={120} />
      <div className="ta-empty__title">{title}</div>
      {message && <div className="ta-empty__msg">{message}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
