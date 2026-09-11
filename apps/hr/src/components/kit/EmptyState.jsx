import Icon from '../common/Icon.jsx';

/* Friendly empty state — never a bare "No data". */
export default function EmptyState({ icon = 'Inbox', title, message, action }) {
  return (
    <div className="hr-empty">
      <span className="hr-empty__icon"><Icon name={icon} size={20} /></span>
      <div className="hr-empty__title">{title}</div>
      {message && <div className="hr-empty__msg">{message}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
